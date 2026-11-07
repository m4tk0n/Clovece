import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createGame,
    getValidMoves,
    getPiecePosition,
    movePiece,
    rollDice,
    advanceTurn,
    chooseAIMoveMonteCarlo,
    chooseAIMoveMonteCarloDecision
} from '../js/game-engine.js';

test('Monte Carlo search returns only an engine-legal move', () => {
    const game = createGame(1, 1, [], [], 40);
    game.pieces[0].pieces[0].steps = 0;
    game.pieces[0].pieces[1].steps = 5;
    game.phase = 'move';
    game.diceValue = 2;

    const legal = getValidMoves(game);
    const decision = chooseAIMoveMonteCarloDecision(game, {
        simulations: 18,
        maxPlayoutTurns: 24,
        seed: 71
    });

    assert.ok(legal.length > 1);
    assert.ok(legal.includes(decision.pieceId));
    assert.equal(decision.simulations, 18);
    assert.ok(decision.visits > 0);
    assert.equal(chooseAIMoveMonteCarlo(game, {
        simulations: 18,
        maxPlayoutTurns: 24,
        seed: 71
    }), decision.pieceId);
});

test('Monte Carlo search is deterministic for a fixed seed', () => {
    const game = createGame(1, 1);
    game.pieces[0].pieces[0].steps = 2;
    game.pieces[0].pieces[1].steps = 8;
    game.phase = 'move';
    game.diceValue = 3;
    const options = { simulations: 20, maxPlayoutTurns: 30, seed: 1234 };

    const first = chooseAIMoveMonteCarloDecision(game, options);
    const second = chooseAIMoveMonteCarloDecision(game, options);
    assert.deepEqual(first, second);
});

test('Monte Carlo simulation leaves the live game state unchanged', () => {
    const game = createGame(1, 1);
    game.pieces[0].pieces[0].steps = 4;
    game.pieces[1].pieces[0].steps = 10;
    game.phase = 'move';
    game.diceValue = 2;
    const before = JSON.stringify(game);

    chooseAIMoveMonteCarlo(game, {
        simulations: 12,
        maxPlayoutTurns: 20,
        seed: 9
    });

    assert.equal(JSON.stringify(game), before);
});
