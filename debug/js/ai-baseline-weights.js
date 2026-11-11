// /debug/js/ai-baseline-weights.js
// NEMĚNNÁ porovnávací základna: původní ručně nastavená AI (10 vah, rozšířené = 0).
// Trénink a ověřování měří proti ní, aby šlo kdykoli prokázat přínos oproti původní hře.
// Nikdy se nepřepisuje automaticky.
export const AI_BASELINE_WEIGHTS = Object.freeze({
  progressToGoal: 2, finishPiece: 80, captureOpponent: 18, protectOwn: 25, threatenOpponent: 12,
  deployPiece: 8, homeProgress: 20, bonusContinuation: 10, startFieldRisk: 18, flexibility: 4,
  rescueThreatened: 0, multiThreat: 0, sacrificeChoice: 0, holdPosition: 0,
  strategicDeploy: 0, endgameSafety: 0, competitiveEdge: 0, longTermPlan: 0
});
