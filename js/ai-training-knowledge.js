/** Persistent compact AI memory. Only trainer mode imports source JSON files. */
let csrfToken = null;
let tokenPromise = null;
let memoryPromise = null;
let trainerPromise = null;
let cachedMemory = null;

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

/** Normal play: load the already compiled memory once; never scan the training directory. */
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

/** Trainer: import only files newer than persistent lastFile, then return updated compact memory. */
export async function trainAIFromNewFeedback() {
    if (trainerPromise) return trainerPromise;
    trainerPromise = requestMemory('train')
        .then(data => ({ memory: data.memory, error: null, processedNow: Number(data.processedNow) || 0,
            totalProcessed: Number(data.totalProcessed) || 0, situationCount: Number(data.situationCount) || 0 }))
        .catch(error => ({ memory: cachedMemory || { situations: {} }, error: error.message || 'Aktualizace výuky selhala.', processedNow: 0 }))
        .finally(() => { trainerPromise = null; });
    return trainerPromise;
}

export function resetAITrainingKnowledgeForTests() {
    csrfToken = null;
    tokenPromise = null;
    memoryPromise = null;
    trainerPromise = null;
    cachedMemory = null;
}
