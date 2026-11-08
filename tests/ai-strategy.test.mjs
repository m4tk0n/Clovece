import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createGame,
    getValidMoves,
    getPiecePosition,
    movePiece,
    rollDice,
    chooseAIMoveDecision
} from '../js/game-engine.js';
import {
    estimateCaptureProbability,
    estimatePieceThreat,
    calculatePlayerPips,
    chooseStrategicDecision
} from '../js/ai-strategy.js';

const aiDependencies = { getValidMoves, getPiecePosition, movePiece, rollDice };

function moveOpponentPiecesOutOfBase(game, playerId, keepPieceId = 0) {
    let homeStep = game.trackLength;
    game.pieces[playerId].pieces.forEach(piece => {
        if (piece.id !== keepPieceId && piece.steps === -1) piece.steps = homeStep++;
    });
}

function placeOpponentBehindTarget(game, distance) {
    const targetPosition = getPiecePosition(game, 0, game.pieces[0].pieces[0]);
    const opponentStart = game.players[1].start;
    const attackerPosition = (targetPosition - distance + game.trackLength) % game.trackLength;
    game.pieces[1].pieces[0].steps =
        (attackerPosition - opponentStart + game.trackLength) % game.trackLength;
}

test('capture probability formula accounts for chained sixes', () => {
    assert.equal(estimateCaptureProbability(4), 1 / 6);
    assert.equal(estimateCaptureProbability(6), 1 / 6);
    assert.equal(estimateCaptureProbability(7), 1 / 36);
    assert.equal(estimateCaptureProbability(12), 1 / 36);
    assert.equal(estimateCaptureProbability(20), 1 / 1296);
    assert.equal(estimateCaptureProbability(0), 0);
});

test('threat calculation uses engine-legal moves and bonus sixes', () => {
    const game = createGame(1, 1);
    game.pieces[0].pieces[0].steps = 5;
    placeOpponentBehindTarget(game, 4);
    const threat = estimatePieceThreat(game, 0, 0, aiDependencies);
    assert.ok(threat > 0.19 && threat < 0.2);
});

test('pip calculation reports remaining route and deployment cost without tactical bonuses', () => {
    const game = createGame(1, 1, [], [], 40, { threeRolls: false });
    assert.equal(calculatePlayerPips(game, 0), 4 * (40 + 3 + 6) + 4.2 * 5);
    game.pieces[0].pieces[0].steps = 0;
    assert.equal(calculatePlayerPips(game, 0), 43 + 3 * 49);
});

test('untrained AI chooses uniformly from legal moves using injected random source', () => {
    const game = createGame(1, 1);
    game.phase = 'move';
    game.diceValue = 1;
    game.pieces[0].pieces[0].steps = 0;
    game.pieces[0].pieces[1].steps = 5;

    const legal = getValidMoves(game);
    assert.equal(legal.length, 2);

    const first = chooseStrategicDecision(game, aiDependencies, 'medium', () => 0);
    const last = chooseStrategicDecision(game, aiDependencies, 'medium', () => 0.999999);
    assert.equal(first.pieceId, legal[0]);
    assert.equal(last.pieceId, legal[1]);
    assert.equal(first.breakdown.trainedKnowledge, false);
    assert.match(first.reason, /nemám naučenou taktiku/i);
});

test('AI still chooses an immediate winning move', () => {
    const game = createGame(1, 1);
    game.phase = 'move';
    game.diceValue = 4;
    game.pieces[0].pieces[0].steps = game.trackLength;
    game.pieces[0].pieces[1].steps = game.trackLength + 1;
    game.pieces[0].pieces[2].steps = game.trackLength + 2;
    game.pieces[0].pieces[3].steps = game.trackLength - 1;

    const decision = chooseAIMoveDecision(game);
    assert.equal(decision.pieceId, 3);
    assert.equal(decision.score, 1);
    assert.match(decision.reason, /vítězný tah/i);
});

test('AI returns null when the engine provides no legal moves', () => {
    const game = createGame(1, 1);
    game.phase = 'move';
    game.diceValue = 1;
    game.pieces[0].pieces.forEach(piece => { piece.steps = game.trackLength + 3; });
    assert.equal(chooseStrategicDecision(game, aiDependencies), null);
});

test('pip calculation supports 40, 48 and 80 field boards', () => {
    for (const length of [40, 48, 80]) {
        const game = createGame(1, 1, [], [], length);
        assert.equal(calculatePlayerPips(game, 0), 4 * (length + 3 + 6) + 4.2 * 5);
    }
});

test('threat calculation returns zero for pieces outside the main track', () => {
    const game = createGame(1, 1);
    game.pieces[0].pieces[0].steps = game.trackLength;
    assert.equal(estimatePieceThreat(game, 0, 0, aiDependencies), 0);
});

test('difficulty no longer changes untrained tactical decisions', () => {
    const game = createGame(1, 1);
    game.phase = 'move';
    game.diceValue = 1;
    game.pieces[0].pieces[0].steps = 0;
    game.pieces[0].pieces[1].steps = 5;
    const easy = chooseStrategicDecision(game, aiDependencies, 'easy', () => 0.4);
    const hard = chooseStrategicDecision(game, aiDependencies, 'hard', () => 0.4);
    assert.equal(easy.pieceId, hard.pieceId);
});
