import { AI_WEIGHT_DEFINITIONS, getAIWeightValues } from './ai-weight-config.js';

export const AI_WEIGHT_CHANNELS = Object.freeze(AI_WEIGHT_DEFINITIONS.map(item => ({
    id: item.id, name: item.key, label: item.name, description: item.description
})));

export function isTrainableAIWeight(id) {
    const value = Number(id);
    return Number.isInteger(value) && value >= 1 && value <= AI_WEIGHT_DEFINITIONS.length;
}
export function getAIWeightMetadata(id) {
    const item = AI_WEIGHT_DEFINITIONS.find(entry => entry.id === Number(id));
    return item ? { ...item, desc: item.description } : null;
}
export function buildAIWeightReviewQuestions(detail, cursors = {}) {
    const candidates = detail?.decision?.candidates || [];
    const selectedId = Number(detail?.decision?.selectedPieceId);
    const selected = candidates.find(item => Number(item.pieceId) === selectedId);
    if (!selected) return [];
    const selectedSignals = selected.weightFactors?.weightSignals || [];
    return AI_WEIGHT_DEFINITIONS.map((definition, index) => {
        const alternatives = candidates.filter(item => Number(item.pieceId) !== selectedId);
        const strongestDifference = alternatives.reduce((best, item) => {
            const signal = Number(item.weightFactors?.weightSignals?.[index]) || 0;
            const delta = Number(selectedSignals[index] || 0) - signal;
            return Math.abs(delta) > Math.abs(best) ? delta : best;
        }, 0);
        return { id: definition.id, channel: index, name: definition.key, label: definition.name,
            desc: definition.description, signalDelta: Number(strongestDifference.toFixed(5)),
            currentValue: getAIWeightValues()[index], cursor: Number(cursors[index] || 0) };
    }).filter(item => Math.abs(item.signalDelta) >= 0.001);
}
