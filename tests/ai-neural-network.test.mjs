import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, getValidMoves, movePiece } from '../js/game-engine.js';
import {
    AI_FEATURE_COUNT,
    extractAIMoveFeatures,
    inferAINeuralScore,
    isValidAINeuralModel,
    scoreAIMoveCandidates
} from '../js/ai-neural-network.js';
import { chooseStrategicDecision, calculateAIMoveProbabilityFeatures } from '../js/ai-strategy.js';

const dependencies = { getValidMoves, movePiece };

function modelForFeature(index) {
    const weights = Array(AI_FEATURE_COUNT).fill(0);
    weights[index] = 1;
    return {
        format: 'clovece-ai-neural-model',
        version: 1,
        featureSchemaVersion: 2,
        enabled: true,
        inputSize: AI_FEATURE_COUNT,
        layers: [{ outputSize: 1, activation: 'linear', weights: [weights], biases: [0] }]
    };
}

test('model validator rejects disabled, incompatible and malformed models', () => {
    const model = modelForFeature(7);
    assert.equal(isValidAINeuralModel(model), true);
    assert.equal(isValidAINeuralModel({ ...model, enabled: false }), false);
    assert.equal(isValidAINeuralModel({ ...model, featureSchemaVersion: 99 }), false);
    assert.equal(isValidAINeuralModel({ ...model, layers: [{ ...model.layers[0], weights: [[1]] }] }), false);
});

test('inference returns the expected linear score and rejects invalid feature vectors', () => {
    const model = modelForFeature(7);
    const features = Array(AI_FEATURE_COUNT).fill(0);
    features[7] = 0.25;
    assert.equal(inferAINeuralScore(features, model), 0.25);
    assert.equal(inferAINeuralScore([1, 2], model), null);
    assert.equal(inferAINeuralScore(features, { ...model, enabled: false }), null);
});

test('feature vector has a fixed size and supports 40, 48 and 80 field boards', () => {
    for (const boardSize of [40, 48, 80]) {
        const game = createGame(1, 1, [], [], boardSize);
        game.phase = 'move';
        game.diceValue = 1;
        game.pieces[0].pieces[0].steps = 0;
        game.pieces[0].pieces[1].steps = 5;
        const legal = getValidMoves(game);
        const pieceId = legal[0];
        const state = structuredClone(game);
        const move = movePiece(state, pieceId);
        const features = extractAIMoveFeatures(game, {
            pieceId, move, state, winningMove: false
        }, legal.length);
        assert.equal(features.length, AI_FEATURE_COUNT);
        assert.ok(features.every(Number.isFinite));
        assert.equal(scoreAIMoveCandidates(game, [{
            pieceId, move, state, winningMove: false
        }], legal.length, modelForFeature(7)).length, 1);
    }
});

test('neural AI ranks only engine-legal moves and selects the highest score', () => {
    const game = createGame(1, 1);
    game.phase = 'move';
    game.diceValue = 1;
    game.pieces[0].pieces[0].steps = 0;
    game.pieces[0].pieces[1].steps = 5;
    const legal = getValidMoves(game);
    const decision = chooseStrategicDecision(
        game, dependencies, 'medium', () => 0, {}, modelForFeature(7)
    );
    assert.deepEqual(legal, [0, 1]);
    assert.equal(decision.pieceId, 1);
    assert.equal(decision.breakdown.neuralNetwork, true);
    assert.equal(decision.breakdown.selection, 'neural-network');
    assert.ok(decision.alternatives.every(item => legal.includes(item.pieceId)));
});

test('exact human teaching and immediate victory retain priority over neural scoring', () => {
    const game = createGame(1, 1);
    game.phase = 'move';
    game.diceValue = 1;
    game.pieces[0].pieces[0].steps = 0;
    game.pieces[0].pieces[1].steps = 5;
    const signature = JSON.stringify({
        boardSize: 40, trackLength: 40, playerCount: 2,
        rules: game.rules, currentSlot: 0, diceValue: 1,
        players: game.players.map(player => ({
            slot: player.slot, start: player.start,
            pieces: game.pieces[player.id].pieces.map(piece => piece.steps)
        }))
    });
    const learned = chooseStrategicDecision(
        game, dependencies, 'medium', () => 0,
        { situations: { [signature]: { votes: [5, 0, 0, 0], ok: 5, err: 0 } } },
        modelForFeature(7)
    );
    assert.equal(learned.pieceId, 0);
    assert.equal(learned.breakdown.trainedKnowledge, true);
    assert.equal(learned.breakdown.neuralNetwork, false);

    const winningGame = createGame(1, 1);
    winningGame.phase = 'move';
    winningGame.diceValue = 1;
    winningGame.pieces[0].pieces[0].steps = 39;
    winningGame.pieces[0].pieces[1].steps = 41;
    winningGame.pieces[0].pieces[2].steps = 42;
    winningGame.pieces[0].pieces[3].steps = 43;
    const winning = chooseStrategicDecision(
        winningGame, dependencies, 'medium', () => 0, {}, modelForFeature(7)
    );
    assert.equal(winning.pieceId, 0);
    assert.equal(winning.breakdown.selection, 'immediate-win');
});
