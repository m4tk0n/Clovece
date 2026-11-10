// /debug/js/ai-extended-weights.js
// Rozšířené taktické váhy 11–18. Jsou oddělené od deseti vah v ai-weight-config.js,
// takže panel s hodnocením ANO/NE ani PHP ukládání se nemění. Váhy mohou být záporné
// (záporná váha = AI se danému signálu vyhýbá); učí je trénink.
import { AI_EXTENDED_TACTICAL_WEIGHTS as D } from './ai-extended-tactical-weights.js';

const range = { min: -30, max: 30 };
export const AI_EXTENDED_WEIGHT_DEFINITIONS = Object.freeze([
    { id: 11, key: 'rescueThreatened', name: 'Záchrana ohrožené figurky', description: 'Kdy má smysl utéct před soupeřem: odměna za snížení rizika vyhození právě tažené figurky.', defaultValue: D.rescueThreatened, ...range },
    { id: 12, key: 'multiThreat', name: 'Vícenásobné ohrožení', description: 'Trestá stav, kdy soupeř po tahu ohrožuje dvě nebo více vlastních figurek.', defaultValue: D.multiThreat, ...range },
    { id: 13, key: 'sacrificeChoice', name: 'Výběr oběti', description: 'Oceňuje snížení rizika podle hodnoty figurek: raději zachránit tu, která došla dál.', defaultValue: D.sacrificeChoice, ...range },
    { id: 14, key: 'holdPosition', name: 'Poziční výhoda', description: 'Trestá opuštění bezpečné pozice do rizika; učí, kdy je lepší zůstat stát.', defaultValue: D.holdPosition, ...range },
    { id: 15, key: 'strategicDeploy', name: 'Strategické nasazování', description: 'Nasazení další figurky se hodnotí podle toho, kolik figurek už je ve hře.', defaultValue: D.strategicDeploy, ...range },
    { id: 16, key: 'endgameSafety', name: 'Závěrečná fáze hry', description: 'Ve fázi, kdy se někdo blíží vítězství, mění význam bezpečnosti vlastních figurek.', defaultValue: D.endgameSafety, ...range },
    { id: 17, key: 'competitiveEdge', name: 'Konkurenční výhoda', description: 'Odměna za vyhození nebo ohrožení figurek soupeře, který má nejblíže k vítězství.', defaultValue: D.competitiveEdge, ...range },
    { id: 18, key: 'longTermPlan', name: 'Dlouhodobé plánování', description: 'Šance, že další hod přinese vyhození, dokončení nebo bonus (přehled na několik kol).', defaultValue: D.longTermPlan, ...range }
]);
export const AI_EXTENDED_WEIGHT_KEYS = Object.freeze(AI_EXTENDED_WEIGHT_DEFINITIONS.map(item => item.key));
export const AI_EXTENDED_WEIGHT_VALUES = Object.freeze(AI_EXTENDED_WEIGHT_DEFINITIONS.map(item => item.defaultValue));
