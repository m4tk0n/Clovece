import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createGame,
    getValidMoves,
    getPiecePosition,
    chooseAIMove,
    chooseAIMoveDecision
} from '../js/game-engine.js';
import {
    estimateCaptureProbability,
    estimatePieceThreat
} from '../js/ai-strategy.js';

test('capture probability accounts for chained sixes', () => {
    assert.equal(estimateCaptureProbability(4), 1 / 6);
    assert.equal(estimateCaptureProbability(6), 1 / 6);
    assert.equal(estimateCaptureProbability(7), 1 / 36);
    assert.equal(estimateCaptureProbability(12), 1 / 36);
    assert.equal(estimateCaptureProbability(20), 1 / 1296);
    assert.equal(estimateCaptureProbability(0), 0);
    assert.equal(estimateCaptureProbability(-1), 0);
});

test('threat estimate distinguishes a nearby attacker from a distant one', () => {
    const game = createGame(1, 1);
    game.pieces[0].pieces[0].steps = 5;

    // Player 1 starts at field 20. Steps 21 place the attacker at field 1:
    // four fields behind player 0's piece at field 5.
    game.pieces[1].pieces[0].steps = 21;
    assert.ok(Math.abs(
        estimatePieceThreat(game, 0, 0, getPiecePosition) - (1 / 6)
    ) < 1e-12);

    // Steps 5 place the attacker at field 25, twenty fields behind the target.
    game.pieces[1].pieces[0].steps = 5;
    assert.ok(Math.abs(
        estimatePieceThreat(game, 0, 0, getPiecePosition) - (1 / 1296)
    ) < 1e-12);
});

test('a blocked intermediate six-space prevents the modeled chained attack', () => {
    const game = createGame(1, 1);
    game.pieces[0].pieces[0].steps = 5;
    game.pieces[1].pieces[0].steps = 5; // field 25, twenty spaces from target
    game.pieces[1].pieces[1].steps = 11; // field 31, blocks the first six-space

    assert.equal(estimatePieceThreat(game, 0, 0, getPiecePosition), 0);
});

test('AI difficulty is stored in the game and all levels return legal moves', () => {
    for (const difficulty of ['easy', 'medium', 'hard']) {
        const game = createGame(1, 1, [], [], 40, {}, difficulty);
        assert.equal(game.aiDifficulty, difficulty);

        game.phase = 'move';
        game.diceValue = 6;
        const legal = getValidMoves(game);
        const selected = chooseAIMove(game);

        assert.ok(legal.length > 0);
        assert.ok(legal.includes(selected));
    }
});

test('unknown AI difficulty safely falls back to medium', () => {
    const game = createGame(1, 1, [], [], 40, {}, 'impossible');
    assert.equal(game.aiDifficulty, 'medium');
});

test('a distant target cannot be hit after the attacker has reached the end of its track', () => {
    const game = createGame(1, 1);
    game.pieces[0].pieces[0].steps = 20;
    game.pieces[1].pieces[0].steps = game.trackLength - 1;
    assert.equal(estimatePieceThreat(game, 0, 0, getPiecePosition), 0);
});

test('AI may prefer a valuable capture over a non-mandatory home entry', () => {
    const game = createGame(1, 1, [], [], 40, { mustEnterHome: false });
    game.phase = 'move';
    game.diceValue = 1;
    game.pieces[0].pieces[0].steps = 0;
    game.pieces[0].pieces[1].steps = game.trackLength - 1;
    game.pieces[1].pieces[0].steps = 21; // The capture target is at field 1.

    const legal = getValidMoves(game);
    assert.deepEqual(legal, [0, 1]);
    assert.equal(chooseAIMove(game), 0);
});

test('AI still obeys mandatory home entry when that rule is enabled', () => {
    const game = createGame(1, 1);
    game.phase = 'move';
    game.diceValue = 1;
    game.pieces[0].pieces[0].steps = 0;
    game.pieces[0].pieces[1].steps = game.trackLength - 1;
    game.pieces[1].pieces[0].steps = 21;

    assert.deepEqual(getValidMoves(game), [1]);
    assert.equal(chooseAIMove(game), 1);
});


test('AI decision exposes a readable explanation without changing the legal move', () => {
    const game = createGame(1, 1, [], [], 40, {}, 'medium');
    game.phase = 'move';
    game.diceValue = 6;
    const decision = chooseAIMoveDecision(game);

    assert.ok(decision);
    assert.ok(getValidMoves(game).includes(decision.pieceId));
    assert.equal(typeof decision.reason, 'string');
    assert.ok(decision.reason.length > 10);
    assert.equal(chooseAIMove(game), decision.pieceId);
});
