/**
 * Konfigurace taktických vah AI pro hru Člověče, nezlob se!
 * Obsahuje výchozí váhy, jejich načítání a podporu pro URL přepínač ?weights=candidate.
 */
import fallbackConfig from '../config/ai-tactical-weights.json' assert { type: 'json' };

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

/**
 * Zjistí a načte aktivní sadu vah podle prostředí a URL parametrů.
 */
function resolveActiveWeights() {
    let weightsData = fallbackConfig?.weights || fallbackConfig || AI_TACTICAL_WEIGHTS_FALLBACK;

    try {
        if (typeof window !== 'undefined' && window.location) {
            const params = new URLSearchParams(window.location.search);
            const weightsParam = params.get('weights');

            if (weightsParam === 'candidate') {
                console.log('[AI Config] Aktivován režim testování kandidátních vah z URL (?weights=candidate).');
                // V případě testování kandidátních vah se prioritně použijí kandidátní váhy, pokud jsou dostupné
                if (window.__AI_CANDIDATE_WEIGHTS__) {
                    weightsData = window.__AI_CANDIDATE_WEIGHTS__;
                }
            }
        }
    } catch (e) {
        // Ignorujeme chyby mimo prohlížeč (např. Node.js testovací prostředí)
    }

    return weightsData;
}

const activeWeights = resolveActiveWeights();

/**
 * Pole 9 základních vah v přesně definovaném pořadí pro AI příznaky:
 * [0] ownProgress
 * [1] opponentSetback
 * [2] threatReduction
 * [3] captureOpponent
 * [4] captureOwn
 * [5] finishPiece
 * [6] deployPiece
 * [7] enterHome
 * [8] homeProgress
 */
export const AI_WEIGHT_VALUES = Object.freeze([
    Number(activeWeights.ownProgress ?? AI_TACTICAL_WEIGHTS_FALLBACK.ownProgress),
    Number(activeWeights.opponentSetback ?? AI_TACTICAL_WEIGHTS_FALLBACK.opponentSetback),
    Number(activeWeights.threatReduction ?? AI_TACTICAL_WEIGHTS_FALLBACK.threatReduction),
    Number(activeWeights.captureOpponent ?? AI_TACTICAL_WEIGHTS_FALLBACK.captureOpponent),
    Number(activeWeights.captureOwn ?? AI_TACTICAL_WEIGHTS_FALLBACK.captureOwn),
    Number(activeWeights.finishPiece ?? AI_TACTICAL_WEIGHTS_FALLBACK.finishPiece),
    Number(activeWeights.deployPiece ?? AI_TACTICAL_WEIGHTS_FALLBACK.deployPiece),
    Number(activeWeights.enterHome ?? AI_TACTICAL_WEIGHTS_FALLBACK.enterHome),
    Number(activeWeights.homeProgress ?? AI_TACTICAL_WEIGHTS_FALLBACK.homeProgress)
]);

export const AI_WEIGHT_COUNT = AI_WEIGHT_VALUES.length;
