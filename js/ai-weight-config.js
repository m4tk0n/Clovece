/**
 * Konfigurace 9 základních taktických vah AI pro hru Člověče, nezlob se!
 */
export const AI_WEIGHT_VALUES = Object.freeze([
    0.08,  // [1] ownProgress (Vlastní postup)
    0.035, // [2] opponentSetback (Zpomalení soupeře)
    12,    // [3] threatReduction (Snížení hrozby)
    5,     // [4] captureOpponent (Vyhození soupeře)
    7,     // [5] captureOwn (Vyhození vlastní figurky)
    8,     // [6] finishPiece (Dokončení figurky)
    1.5,   // [7] deployPiece (Nasazení figurky)
    2.5,   // [8] enterHome (Vstup do domku)
    0.4    // [9] homeProgress (Postup v domku)
]);

export const AI_WEIGHT_COUNT = AI_WEIGHT_VALUES.length;

// Bezpečný fallback pro případné starší funkce, aby kód nepadal na undefined
export function getAIWeight(id) {
    const index = Number(id) - 1;
    return AI_WEIGHT_VALUES[index] ?? 1.0;
}
