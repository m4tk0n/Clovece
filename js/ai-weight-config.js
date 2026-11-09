// Jediná aktivní konfigurace strategické AI: přesně deset srozumitelných vah.
export const AI_WEIGHT_DEFINITIONS = Object.freeze([
    { id: 1, key: 'progressToGoal', name: 'Postup k cíli', description: 'Oceňuje zkrácení zbývající cesty vlastní figurky.', defaultValue: 2, min: 0, max: 20 },
    { id: 2, key: 'finishPiece', name: 'Dokončení figurky', description: 'Priorita bezpečného dokončení figurky na D4.', defaultValue: 80, min: 0, max: 300 },
    { id: 3, key: 'captureOpponent', name: 'Vyhození soupeře', description: 'Odměna za vrácení soupeřovy figurky do základny.', defaultValue: 18, min: 0, max: 100 },
    { id: 4, key: 'protectOwn', name: 'Ochrana vlastních figurek', description: 'Oceňuje snížení pravděpodobnosti vyhození vlastních figurek.', defaultValue: 25, min: 0, max: 100 },
    { id: 5, key: 'threatenOpponent', name: 'Taktické ohrožení soupeře', description: 'Oceňuje pozici umožňující zasáhnout soupeře v navazujícím tahu.', defaultValue: 12, min: 0, max: 100 },
    { id: 6, key: 'deployPiece', name: 'Nasazení z vlastní základny', description: 'Oceňuje uvedení další figurky do hry, pokud je to strategicky výhodné.', defaultValue: 8, min: 0, max: 80 },
    { id: 7, key: 'homeProgress', name: 'Postup v cílovém domečku', description: 'Oceňuje vstup do cílové dráhy a postup k D4.', defaultValue: 20, min: 0, max: 120 },
    { id: 8, key: 'bonusContinuation', name: 'Bonusový hod a pokračování', description: 'Oceňuje možnosti navazujícího tahu a řetězení šestek.', defaultValue: 10, min: 0, max: 80 },
    { id: 9, key: 'startFieldRisk', name: 'Bezpečnost a riziko startovních polí', description: 'Trestá vystavení figurky vyhození včetně soupeřových startovních polí.', defaultValue: 18, min: 0, max: 120 },
    { id: 10, key: 'flexibility', name: 'Strategická flexibilita', description: 'Oceňuje zachování více kvalitních možností pro další tahy.', defaultValue: 4, min: 0, max: 40 }
]);
export const AI_WEIGHT_KEYS = Object.freeze(AI_WEIGHT_DEFINITIONS.map(item => item.key));
export const AI_WEIGHT_COUNT = AI_WEIGHT_DEFINITIONS.length;
export const AI_WEIGHT_VALUES = Object.freeze(AI_WEIGHT_DEFINITIONS.map(item => item.defaultValue));
let runtimeOverrides = Object.create(null);

export function setAIWeightOverrides(values = {}) {
    const next = Object.create(null);
    if (values && typeof values === 'object') {
        for (const definition of AI_WEIGHT_DEFINITIONS) {
            const raw = values[definition.key] ?? values[String(definition.id)];
            if (raw === undefined) continue;
            const value = Number(raw);
            if (Number.isFinite(value)) next[definition.id] = Math.max(definition.min, Math.min(definition.max, value));
        }
    }
    runtimeOverrides = next;
}
export function getAIWeightValues() {
    return AI_WEIGHT_DEFINITIONS.map(item => runtimeOverrides[item.id] ?? item.defaultValue);
}
export function getAIWeight(id) {
    const definition = AI_WEIGHT_DEFINITIONS.find(item => item.id === Number(id));
    return definition ? (runtimeOverrides[definition.id] ?? definition.defaultValue) : 0;
}
export function getAIStrategicWeights() {
    return Object.fromEntries(AI_WEIGHT_DEFINITIONS.map(item => [item.key, runtimeOverrides[item.id] ?? item.defaultValue]));
}
