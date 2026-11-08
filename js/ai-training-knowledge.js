/**
 * Keeps newly saved human AI instructions in memory for the current game.
 * The server is checked before every AI decision; immutable records are only
 * downloaded once per browser session and only new files are returned later.
 */
let csrfToken = null;
let tokenPromise = null;
let refreshPromise = null;
let lastScanAt = 0;
const instructionCache = new Map();

async function getTrainingToken() {
    if (csrfToken) return csrfToken;
    if (!tokenPromise) {
        tokenPromise = fetch('ai-training.php?action=token', {
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { Accept: 'application/json' }
        }).then(async response => {
            const payload = await response.json();
            if (!response.ok || !payload.success || !payload.token) {
                throw new Error(payload.error || 'Nelze ověřit přístup k výuce AI.');
            }
            csrfToken = payload.token;
            return csrfToken;
        }).finally(() => { tokenPromise = null; });
    }
    return tokenPromise;
}

export async function refreshAITrainingKnowledge() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
        try {
            const token = await getTrainingToken();
            const response = await fetch('ai-training-knowledge.php', {
                method: 'POST',
                credentials: 'same-origin',
                cache: 'no-store',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-Token': token
                },
                body: JSON.stringify({ action: 'knowledge', since: Math.max(0, lastScanAt - 2) })
            });
            const payload = await response.json();
            if (response.status === 403) {
                csrfToken = null;
                throw new Error(payload.error || 'Bezpečnostní token vypršel.');
            }
            if (!response.ok || !payload.success || !Array.isArray(payload.instructions)) {
                throw new Error(payload.error || 'Instrukce AI se nepodařilo načíst.');
            }
            lastScanAt = Math.max(lastScanAt, Number(payload.scanStartedAt) || 0);
            for (const item of payload.instructions) {
                if (item && typeof item.id === 'string' && item.id) instructionCache.set(item.id, item);
            }
            return {
                instructions: Array.from(instructionCache.values()),
                newInstructions: payload.instructions.length,
                error: null
            };
        } catch (error) {
            return {
                instructions: Array.from(instructionCache.values()),
                newInstructions: 0,
                error: error instanceof Error ? error.message : 'Načítání instrukcí selhalo.'
            };
        } finally {
            refreshPromise = null;
        }
    })();
    return refreshPromise;
}

export function resetAITrainingKnowledgeForTests() {
    csrfToken = null;
    tokenPromise = null;
    refreshPromise = null;
    lastScanAt = 0;
    instructionCache.clear();
}
