/**
 * Lehká inference neuronové sítě pro hodnocení legálních tahů.
 * Model je trénovaný offline a do prohlížeče se načítají pouze hotové váhy.
 * Tento modul nikdy nevytváří tahy ani neobsahuje herní pravidla.
 */

export const AI_FEATURE_SCHEMA_VERSION = 3;
export const AI_FEATURE_COUNT = 26;

function clamp(value, min = -1, max = 1) {
    return Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : 0));
}

function normalizedSteps(steps, trackLength) {
    if (steps < 0) return -1;
    if (steps < trackLength) return clamp(steps / Math.max(1, trackLength));
    return clamp(1 + (steps - trackLength) / 3);
}

/** Stejný pevný vektor se používá při trénování i při běžném rozhodování. */
export function extractAIMoveFeatures(game, candidate, legalMoveCount) {
    const probabilities = candidate.probabilityFeatures || {};
    const tactical = candidate.tacticalFeatures || {};
    const playerId = game.currentPlayer;
    const ownBefore = game.pieces[playerId]?.pieces || [];
    const ownAfter = candidate.state.pieces[playerId]?.pieces || [];
    const enemyPieces = game.pieces
        .filter(group => group.playerId !== playerId)
        .flatMap(group => group.pieces);
    const trackLength = Number(game.trackLength) || 40;
    const selectedBefore = ownBefore[candidate.pieceId];
    const selectedAfter = ownAfter[candidate.pieceId];
    const count = (pieces, predicate) => pieces.filter(predicate).length;
    const enemyMainCount = count(enemyPieces, piece => piece.steps >= 0 && piece.steps < trackLength);
    const ownMainBefore = count(ownBefore, piece => piece.steps >= 0 && piece.steps < trackLength);
    const ownHomeBefore = count(ownBefore, piece => piece.steps >= trackLength);
    const ownBaseBefore = count(ownBefore, piece => piece.steps === -1);
    const ownMainAfter = count(ownAfter, piece => piece.steps >= 0 && piece.steps < trackLength);
    const ownHomeAfter = count(ownAfter, piece => piece.steps >= trackLength);
    const move = candidate.move || {};
    const captured = move.captured || null;

    return [
        clamp(Number(game.diceValue) / 6, 0, 1),
        clamp(trackLength / 80, 0, 1),
        clamp((game.players || []).length / 8, 0, 1),
        ownBaseBefore / 4,
        ownMainBefore / 4,
        ownHomeBefore / 4,
        normalizedSteps(selectedBefore?.steps ?? -1, trackLength),
        normalizedSteps(selectedAfter?.steps ?? -1, trackLength),
        clamp(((selectedAfter?.steps ?? -1) - (selectedBefore?.steps ?? -1)) / (trackLength + 3)),
        selectedBefore?.steps === -1 ? 1 : 0,
        captured && !captured.ownPiece ? 1 : 0,
        captured?.ownPiece ? 1 : 0,
        move.finishedNow ? 1 : 0,
        candidate.winningMove ? 1 : 0,
        ownMainAfter / 4,
        ownHomeAfter / 4,
        enemyMainCount / 28,
        clamp(Number(legalMoveCount) / 4, 0, 1),
        clamp(probabilities.ownCaptureRisk, 0, 1),
        clamp(probabilities.opponentCaptureChance, 0, 1),
        clamp(probabilities.safeFinishChance, 0, 1),
        clamp(probabilities.extraTurnChance, 0, 1),
        clamp(probabilities.deployAttackRisk, 0, 1),
        clamp(Number(tactical.ownProgress) / (trackLength + 20), -1, 1),
        clamp(Number(tactical.opponentSetback) / (trackLength + 3), -1, 1),
        clamp(Number(tactical.threatReduction) / 4, -1, 1)
    ].map(value => clamp(value));
}

function activate(value, activation) {
    if (activation === 'tanh') return Math.tanh(value);
    if (activation === 'linear') return value;
    return Math.max(0, value);
}

/** Ověří model před použitím; chybná nebo nekompatibilní data se ignorují. */
export function isValidAINeuralModel(model) {
    if (!model || model.format !== 'clovece-ai-neural-model' ||
        model.version !== 1 || model.featureSchemaVersion !== AI_FEATURE_SCHEMA_VERSION ||
        model.inputSize !== AI_FEATURE_COUNT || model.enabled !== true ||
        !Array.isArray(model.layers) || model.layers.length === 0) return false;

    let previousSize = AI_FEATURE_COUNT;
    for (const layer of model.layers) {
        if (!layer || !Number.isInteger(layer.outputSize) || layer.outputSize < 1 ||
            !Array.isArray(layer.weights) || layer.weights.length !== layer.outputSize ||
            !Array.isArray(layer.biases) || layer.biases.length !== layer.outputSize) return false;
        if (!layer.weights.every(row => Array.isArray(row) && row.length === previousSize &&
            row.every(value => Number.isFinite(value)))) return false;
        if (!layer.biases.every(Number.isFinite)) return false;
        if (!['relu', 'tanh', 'linear'].includes(layer.activation || 'relu')) return false;
        previousSize = layer.outputSize;
    }
    return previousSize === 1;
}

/** Vrací číslo pouze pro platný, zapnutý model; jinak null. */
export function inferAINeuralScore(features, model) {
    if (!isValidAINeuralModel(model) || !Array.isArray(features) ||
        features.length !== AI_FEATURE_COUNT || !features.every(Number.isFinite)) return null;

    let values = features.slice();
    for (const layer of model.layers) {
        values = layer.weights.map((weights, row) => {
            let sum = layer.biases[row];
            for (let column = 0; column < weights.length; column++) {
                sum += weights[column] * values[column];
            }
            return activate(sum, layer.activation || 'relu');
        });
    }
    return Number.isFinite(values[0]) ? values[0] : null;
}

/** Vyhodnotí jen kandidáty předané herním enginem. */
export function scoreAIMoveCandidates(game, candidates, legalMoveCount, model) {
    if (!isValidAINeuralModel(model)) return null;
    return candidates.map(candidate => ({
        pieceId: candidate.pieceId,
        score: inferAINeuralScore(
            extractAIMoveFeatures(game, candidate, legalMoveCount),
            model
        )
    }));
}
