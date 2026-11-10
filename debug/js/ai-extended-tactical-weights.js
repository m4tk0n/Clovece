// /debug/js/ai-extended-tactical-weights.js
// Výchozí hodnoty rozšířených vah 11–18. Generuje debug/scripts/promote-weights.mjs. Ručně neupravovat.
// Nula = signál se do rozhodování nepromítá, AI se chová jako s původními deseti vahami.
export const AI_EXTENDED_TACTICAL_WEIGHTS = Object.freeze({
    rescueThreatened: 0,
    multiThreat: 0,
    sacrificeChoice: 0,
    holdPosition: 0,
    strategicDeploy: 0,
    endgameSafety: 0,
    competitiveEdge: 0,
    longTermPlan: 0
});
