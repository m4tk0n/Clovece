/**
 * Konfigurace taktických vah AI pro hru Člověče, nezlob se!
 * Bezpečné načítání vah s podporou pro URL přepínač ?weights=candidate.
 */

export const AI_TACTICAL_WEIGHTS_FALLBACK = Object.freeze({
    immediateWin: 100000,
    ownProgress: 0.08,
    opponentSetback: 0.035,
    threatReduction: 12,
    captureOpponent: 5,
    captureOwn: 7,
    finishPiece: 8,
    deployPiece: 1.5,
    enterHome: 2.5,
    homeProgress: 0.4
});

// Kompletní výchozí pole 1000 hodnot vah (nebo fallback)
import fallbackWeights from '../config/ai-tactical-weights.json' assert { type: 'json' };

const rawWeights = fallbackWeights?.weights || fallbackWeights || AI_TACTICAL_WEIGHTS_FALLBACK;

/**
 * Zjištění aktivních vah podle URL (např. ?weights=candidate)
 */
function resolveWeights() {
    let active = rawWeights;
    try {
        if (typeof window !== 'undefined' && window.location) {
            const params = new URLSearchParams(window.location.search);
            if (params.get('weights') === 'candidate') {
                console.log('[AI Config] Aktivován režim testování kandidátních vah z URL (?weights=candidate).');
                if (window.__AI_CANDIDATE_WEIGHTS__) {
                    active = window.__AI_CANDIDATE_WEIGHTS__;
                }
            }
        }
    } catch (e) {
        // Mimo prohlížeč ignorujeme
    }
    return active;
}

const currentWeightsData = resolveWeights();

/**
 * Pole hodnot vah. Pokud je k dispozici pole nebo objekt, bezpečně ho mapujeme.
 */
export const AI_WEIGHT_VALUES = Object.freeze(
    Array.isArray(currentWeightsData) 
        ? currentWeightsData.map(v => Number(v) || 0)
        : [
            Number(currentWeightsData.ownProgress ?? AI_TACTICAL_WEIGHTS_FALLBACK.ownProgress),
            Number(currentWeightsData.opponentSetback ?? AI_TACTICAL_WEIGHTS_FALLBACK.opponentSetback),
            Number(currentWeightsData.threatReduction ?? AI_TACTICAL_WEIGHTS_FALLBACK.threatReduction),
            Number(currentWeightsData.captureOpponent ?? AI_TACTICAL_WEIGHTS_FALLBACK.captureOpponent),
            Number(currentWeightsData.captureOwn ?? AI_TACTICAL_WEIGHTS_FALLBACK.captureOwn),
            Number(currentWeightsData.finishPiece ?? AI_TACTICAL_WEIGHTS_FALLBACK.finishPiece),
            Number(currentWeightsData.deployPiece ?? AI_TACTICAL_WEIGHTS_FALLBACK.deployPiece),
            Number(currentWeightsData.enterHome ?? AI_TACTICAL_WEIGHTS_FALLBACK.enterHome),
            Number(currentWeightsData.homeProgress ?? AI_TACTICAL_WEIGHTS_FALLBACK.homeProgress)
        ]
);

export const AI_WEIGHT_COUNT = AI_WEIGHT_VALUES.length;

export function getAIWeight(id) {
    return AI_WEIGHT_VALUES[Number(id) - 1] ?? 0;
}
