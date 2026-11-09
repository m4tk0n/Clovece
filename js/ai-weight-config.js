/**
 * Konfigurace vah AI. 
 * Pokud strategie vyžaduje vysoké ID vah (např. 401, 403 pro obtížnosti),
 * funkce getAIWeight je bezpečně ošetří, aby kód nepadal na undefined.
 */

// Naše základní preferované váhy (můžeš si je upravit)
export const AI_WEIGHT_VALUES = Object.freeze([
    200, 250, 150, 40, 60, 25, 80, 50, 35, 90
]);

export const AI_WEIGHT_COUNT = AI_WEIGHT_VALUES.length;

/**
 * Bezpečné získání váhy podle ID.
 * Pokud strategie sáhne pro index, který v našem zkráceném poli není 
 * (např. vysoká ID pro obtížnosti), vrátí bezpečný výchozí koeficient (1.0),
 * takže výpočty v ai-strategy.js neskončí chybou.
 */
export function getAIWeight(id) {
    const numId = Number(id);
    const index = numId - 1;
    
    // Pokud ID existuje v našem poli, vrátíme ho
    if (index >= 0 && index < AI_WEIGHT_VALUES.length) {
        return AI_WEIGHT_VALUES[index];
    }
    
    // Pro stará vysoká ID (využívaná v ai-strategy.js pro obtížnosti a koeficienty) 
    // vracíme neutrální násobitel 1.0, aby strategie fungovala bez pádu.
    return 1.0;
}
