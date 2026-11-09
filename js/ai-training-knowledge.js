// /js/ai-training-knowledge.js
/** Compact AI memory client. Normal games never inspect source training JSON files. */
let csrfToken = null;
let tokenPromise = null;
let memoryPromise = null;
let trainerPromise = null;
let cachedMemory = null;
let cachedWeightOverrides = null;
let weightPromise = null;

async function getToken() {
    if (csrfToken) return csrfToken;
    if (!tokenPromise) {
        tokenPromise = fetch('ai-training.php?action=token', {
            credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }
        }).then(async response => {
            const data = await response.json();
            if (!response.ok || !data.success || !data.token) throw new Error(data.error || 'Nelze ověřit přístup k paměti AI.');
            csrfToken = data.token;
            return csrfToken;
        }).finally(() => { tokenPromise = null; });
    }
    return tokenPromise;
}

async function requestMemory(action) {
    const token = await getToken();
    const response = await fetch('ai-training-knowledge.php', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': token },
        body: JSON.stringify({ action })
    });
    const data = await response.json();
    if (response.status === 403) csrfToken = null;
    if (!response.ok || !data.success || !data.memory) throw new Error(data.error || 'Paměť AI se nepodařilo načíst.');
    cachedMemory = data.memory;
    return data;
}

async function requestWeights(payload) {
    const token = await getToken();
    const response = await fetch('ai-training-weights.php', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': token },
        body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (response.status === 403) csrfToken = null;
    if (!response.ok || !data.success || !data.values) {
        throw new Error(data.error || 'Naučené váhy AI se nepodařilo načíst.');
    }
    cachedWeightOverrides = data.values;
    return data;
}

/** Load persisted numeric overrides once; normal play also uses the trained values. */
export async function loadAIWeightOverrides() {
    if (cachedWeightOverrides) return { values: cachedWeightOverrides, error: null };
    if (!weightPromise) {
        weightPromise = requestWeights({ action: 'load' })
            .then(data => ({ values: data.values || {}, error: null, feedbackCount: Number(data.feedbackCount) || 0 }))
            .catch(error => ({ values: cachedWeightOverrides || {}, error: error.message || 'Naučené váhy nejsou dostupné.', feedbackCount: 0 }))
            .finally(() => { weightPromise = null; });
    }
    return weightPromise;
}

/** One explicit Yes/No answer changes exactly one active weight on the server. */
export async function saveAIWeightFeedback(feedback) {
    const data = await requestWeights({ action: 'feedback', ...feedback });
    return {
        ...data,
        values: data.values || {},
        feedbackCount: Number(data.feedbackCount) || 0
    };
}

/** Ordinary play: read one compiled memory snapshot. No directory listing or JSON history scan. */
export async function loadAITrainingMemory() {
    if (cachedMemory) return { memory: cachedMemory, error: null, processedNow: 0 };
    if (!memoryPromise) {
        memoryPromise = requestMemory('memory')
            .then(data => ({ memory: data.memory, error: null, processedNow: 0 }))
            .catch(error => ({ memory: cachedMemory || { situations: {} }, error: error.message || 'Paměť AI není dostupná.', processedNow: 0 }))
            .finally(() => { memoryPromise = null; });
    }
    return memoryPromise;
}

/** Trainer mode only: incrementally process new feedback and refresh the in-memory snapshot. */
export async function trainAIFromNewFeedback() {
    if (trainerPromise) return trainerPromise;
    trainerPromise = requestMemory('train')
        .then(data => ({ memory: data.memory, error: null, processedNow: Number(data.processedNow) || 0,
            totalProcessed: Number(data.totalProcessed) || 0, situationCount: Number(data.situationCount) || 0 }))
        .catch(error => ({ memory: cachedMemory || { situations: {} }, error: error.message || 'Aktualizace výuky selhala.', processedNow: 0 }))
        .finally(() => { trainerPromise = null; });
    return trainerPromise;
}

/** Compatibility entry point used by the turn controller. */
export async function refreshAITrainingKnowledge(options = {}) {
    const result = options?.trainer ? await trainAIFromNewFeedback() : await loadAITrainingMemory();
    return { ...result, instructions: [], memory: result.memory || { situations: {} } };
}

export function resetAITrainingKnowledgeForTests() {
    csrfToken = null;
    tokenPromise = null;
    memoryPromise = null;
    trainerPromise = null;
    cachedMemory = null;
    cachedWeightOverrides = null;
    weightPromise = null;
}
