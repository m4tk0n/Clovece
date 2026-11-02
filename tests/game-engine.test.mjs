import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createGame,
    rollDice,
    getValidMoves,
    movePiece
} from '../js/game-engine.js';

test('two to four players use the classic 52-space track and four corner starts', () => {
    const two = createGame(1, 1);
    assert.equal(two.trackLength, 52);
    assert.deepEqual(two.players.map(player => player.start), [0, 26]);

    const four = createGame(2, 2);
    assert.equal(four.trackLength, 52);
    assert.deepEqual(four.players.map(player => player.start), [0, 13, 26, 39]);
    assert.ok(four.pieces.every(group => group.pieces.length === 4));
});

test('five to eight players receive unique starts on the extended track', () => {
    const five = createGame(1, 4);
    assert.deepEqual(five.players.map(player => player.start), [0, 16, 24, 40, 48]);

    const game = createGame(2, 6);
    assert.equal(game.trackLength, 64);
    assert.deepEqual(game.players.map(player => player.start), [0, 8, 16, 24, 32, 40, 48, 56]);
    assert.equal(new Set(game.players.map(player => player.start)).size, 8);
    assert.ok(game.pieces.every(group => group.pieces.length === 4));
});

test('a piece can leave its base only after rolling six', () => {
    const blocked = createGame(1, 1);
    const five = rollDice(blocked, 5);
    assert.equal(blocked.phase, 'no-move');
    assert.deepEqual(five.validMoves, []);

    const ready = createGame(1, 1);
    const six = rollDice(ready, 6);
    assert.deepEqual(six.validMoves, [0, 1, 2, 3]);
    movePiece(ready, 0);
    assert.equal(ready.pieces[0].pieces[0].steps, 0);
    assert.equal(ready.phase, 'roll');
});

test('landing on an unsafe enemy square sends the enemy piece home', () => {
    const game = createGame(1, 1);
    game.phase = 'move';
    game.diceValue = 1;
    game.pieces[0].pieces[0].steps = 1;
    game.pieces[1].pieces[0].steps = 28; // Both resolve to track square 2.

    assert.deepEqual(getValidMoves(game), [0]);
    const move = movePiece(game, 0);

    assert.equal(move.captured.playerId, 1);
    assert.equal(game.pieces[1].pieces[0].steps, -1);
    assert.equal(game.pieces[0].pieces[0].steps, 2);
});

test('an occupied safe starting square cannot be captured or entered', () => {
    const game = createGame(1, 1);
    game.phase = 'move';
    game.diceValue = 1;
    game.pieces[0].pieces[0].steps = 25;
    game.pieces[1].pieces[0].steps = 0;

    assert.deepEqual(getValidMoves(game), []);
});

test('a player wins only by bringing all four pieces exactly home', () => {
    const game = createGame(1, 1);
    const finish = game.trackLength + 4;
    game.pieces[0].pieces.forEach(piece => { piece.steps = finish; });
    game.pieces[0].pieces[0].steps = finish - 1;
    game.phase = 'move';
    game.diceValue = 1;

    assert.deepEqual(getValidMoves(game), [0]);
    movePiece(game, 0);
    assert.equal(game.winner, 0);
    assert.equal(game.phase, 'finished');
});

test('a piece cannot overshoot the final home space', () => {
    const game = createGame(1, 1);
    game.pieces[0].pieces[0].steps = game.trackLength + 3;
    game.phase = 'move';
    game.diceValue = 2;

    assert.deepEqual(getValidMoves(game), []);
});
