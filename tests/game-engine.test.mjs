import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createGame,
    determineStartingPlayer,
    rollDice,
    getValidMoves,
    getForcedMove,
    movePiece,
    getPiecePosition,
    getHomeLaneIndex,
    getAvailableBoardSizes
} from '../js/game-engine.js';
import { trackPosition } from '../js/game-board-geometry.js';

test('two to four players use the classic 52-space track and four corner starts', () => {
    const two = createGame(1, 1);
    assert.equal(two.trackLength, 52);
    assert.deepEqual(two.players.map(player => player.start), [0, 26]);

    const three = createGame(1, 2);
    assert.deepEqual(three.players.map(player => player.start), [0, 17, 35]);

    const four = createGame(2, 2);
    assert.equal(four.trackLength, 52);
    assert.deepEqual(four.players.map(player => player.start), [0, 13, 26, 39]);
    assert.ok(four.pieces.every(group => group.pieces.length === 4));
});

test('five to eight players receive unique starts on the extended track', () => {
    const five = createGame(1, 4);
    assert.deepEqual(five.players.map(player => player.start), [0, 13, 26, 38, 51]);

    const six = createGame(2, 4);
    assert.deepEqual(six.players.map(player => player.start), [0, 11, 21, 32, 43, 53]);

    const seven = createGame(2, 5);
    assert.deepEqual(seven.players.map(player => player.start), [0, 9, 18, 27, 37, 46, 55]);

    const game = createGame(2, 6);
    assert.equal(game.trackLength, 64);
    assert.deepEqual(game.players.map(player => player.start), [0, 8, 16, 24, 32, 40, 48, 56]);
    assert.equal(new Set(game.players.map(player => player.start)).size, 8);
    assert.ok(game.pieces.every(group => group.pieces.length === 4));
});

test('new board sizes use fixed slot geometry and preserve empty positions', () => {
    assert.deepEqual(getAvailableBoardSizes(2), [40, 48, 80]);
    assert.deepEqual(getAvailableBoardSizes(4), [40, 48, 80]);
    assert.deepEqual(getAvailableBoardSizes(5), [48, 80]);
    assert.deepEqual(getAvailableBoardSizes(6), [48, 80]);
    assert.deepEqual(getAvailableBoardSizes(7), [80]);
    assert.deepEqual(getAvailableBoardSizes(8), [80]);

    const board40 = createGame(2, 0, [], [], 40);
    assert.equal(board40.trackLength, 40);
    assert.equal(board40.slotCount, 4);
    assert.deepEqual(board40.players.map(player => player.slot), [0, 2]);
    assert.deepEqual(board40.players.map(player => player.start), [0, 20]);

    const board48 = createGame(5, 0, [], [], 48);
    assert.equal(board48.trackLength, 48);
    assert.equal(board48.slotCount, 6);
    assert.deepEqual(board48.players.map(player => player.slot), [0, 1, 2, 4, 5]);
    assert.deepEqual(board48.players.map(player => player.start), [0, 8, 16, 32, 40]);

    const board80 = createGame(7, 0, [], [], 80);
    assert.equal(board80.trackLength, 80);
    assert.equal(board80.slotCount, 8);
    assert.deepEqual(board80.players.map(player => player.slot), [0, 1, 2, 3, 5, 6, 7]);
    assert.deepEqual(board80.players.map(player => player.start), [0, 10, 20, 30, 50, 60, 70]);
});

test('new board sizes reject unsupported player counts', () => {
    assert.throws(() => createGame(5, 0, [], [], 40), /není pro tento počet hráčů dostupná/);
    assert.throws(() => createGame(2, 0, [], [], 99), /není pro tento počet hráčů dostupná/);
});

test('players can receive individually selected unique colors from the shared palette', () => {
    const selected = ['#D81B60', '#E53935', '#00ACC1', '#F9A825'];
    const game = createGame(2, 2, [], selected);

    assert.deepEqual(game.players.map(player => player.color), selected);
    assert.equal(new Set(game.players.map(player => player.color)).size, 4);

    const fallback = createGame(1, 1, [], ['not-a-color', '#1E88E5']);
    assert.equal(fallback.players[0].color, '#E53935');
    assert.equal(fallback.players[1].color, '#1E88E5');

    const duplicate = createGame(2, 1, [], ['#E53935', '#E53935', '#00ACC1']);
    assert.equal(new Set(duplicate.players.map(player => player.color)).size, 3);
    assert.deepEqual(duplicate.players.map(player => player.color), ['#E53935', '#1E88E5', '#00ACC1']);
});

test('starting player is decided by a dice-off and only tied leaders reroll', () => {
    const game = createGame(2, 2);
    const values = [6, 2, 6, 1, 3, 4];
    const seen = [];
    const result = determineStartingPlayer(game, playerId => {
        seen.push(playerId);
        return values.shift();
    });

    assert.deepEqual(seen, [0, 1, 2, 3, 0, 2]);
    assert.deepEqual(result.rounds, [
        [
            { playerId: 0, value: 6 },
            { playerId: 1, value: 2 },
            { playerId: 2, value: 6 },
            { playerId: 3, value: 1 }
        ],
        [
            { playerId: 0, value: 3 },
            { playerId: 2, value: 4 }
        ]
    ]);
    assert.equal(result.playerId, 2);
    assert.equal(game.currentPlayer, 2);
    assert.deepEqual(game.players.map(player => player.id), [0, 1, 2, 3]);
});

test('a piece can leave its base only after rolling six', () => {
    const blocked = createGame(1, 1);
    const firstFive = rollDice(blocked, 5);
    assert.equal(firstFive.retrying, true);
    assert.equal(firstFive.attempt, 1);
    assert.equal(blocked.phase, 'roll');

    const secondFive = rollDice(blocked, 5);
    assert.equal(secondFive.retrying, true);
    assert.equal(secondFive.attempt, 2);
    assert.equal(blocked.phase, 'roll');

    const thirdFive = rollDice(blocked, 5);
    assert.equal(thirdFive.retrying, false);
    assert.equal(thirdFive.attempt, 3);
    assert.equal(blocked.phase, 'no-move');
    assert.deepEqual(thirdFive.validMoves, []);

    const ready = createGame(1, 1);
    const six = rollDice(ready, 6);
    assert.deepEqual(six.validMoves, [0, 1, 2, 3]);
    movePiece(ready, 0);
    assert.equal(ready.pieces[0].pieces[0].steps, 0);
    assert.equal(ready.phase, 'roll');
});

test('a single possible move is identified for automatic execution', () => {
    const game = createGame(1, 1);
    game.pieces[0].pieces[1].steps = game.trackLength + 4;
    game.pieces[0].pieces[2].steps = game.trackLength + 4;
    game.pieces[0].pieces[3].steps = game.trackLength + 4;
    const result = rollDice(game, 6);

    assert.deepEqual(result.validMoves, [0]);
    assert.equal(getForcedMove(game), 0);

    game.pieces[0].pieces[1].steps = -1;
    assert.equal(getForcedMove(game), null);
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

test('an occupied opponent start square is an ordinary square and can be captured', () => {
    const game = createGame(1, 1);
    game.phase = 'move';
    game.diceValue = 1;
    game.pieces[0].pieces[0].steps = 25;
    game.pieces[1].pieces[0].steps = 0;

    assert.deepEqual(getValidMoves(game), [0]);
    const move = movePiece(game, 0);

    assert.equal(move.captured.playerId, 1);
    assert.equal(game.pieces[1].pieces[0].steps, -1);
    assert.equal(game.pieces[0].pieces[0].steps, 26);
});

test('the full circuit includes the start square before entering the home lane', () => {
    const game = createGame(1, 1);
    const piece = game.pieces[0].pieces[0];

    // After deployment, the piece is on its own start square (step 0).
    // One full circuit later it must return to that same square (step 52).
    piece.steps = game.trackLength - 1;
    game.phase = 'move';
    game.diceValue = 1;
    assert.deepEqual(getValidMoves(game), [0]);
    movePiece(game, 0);
    assert.equal(piece.steps, game.trackLength);
    assert.equal(getHomeLaneIndex(game, piece), -1);
    assert.equal(getPiecePosition(game, 0, piece), game.players[0].start);

    // Only the next step enters the first home-lane square.
    game.currentPlayer = 0;
    game.phase = 'move';
    game.diceValue = 1;
    assert.deepEqual(getValidMoves(game), [0]);
    movePiece(game, 0);
    assert.equal(piece.steps, game.trackLength + 1);
    assert.equal(getHomeLaneIndex(game, piece), 0);

    // A move crossing the start counts it as a normal track square:
    // step 51 -> own start (52) -> first home-lane square (53).
    piece.steps = game.trackLength - 1;
    game.currentPlayer = 0;
    game.phase = 'move';
    game.diceValue = 2;
    assert.deepEqual(getValidMoves(game), [0]);
    movePiece(game, 0);
    assert.equal(piece.steps, game.trackLength + 1);
    assert.equal(getHomeLaneIndex(game, piece), 0);
});


test('a piece may jump over own pieces but may not land on them on the main track', () => {
    const game = createGame(1, 1);
    game.pieces[0].pieces[0].steps = 0;
    game.pieces[0].pieces[1].steps = 1;
    game.phase = 'move';
    game.diceValue = 2;

    assert.deepEqual(getValidMoves(game), [0, 1]);
    movePiece(game, 0);
    assert.equal(game.pieces[0].pieces[0].steps, 2);
    assert.equal(game.pieces[0].pieces[1].steps, 1);

    game.currentPlayer = 0;
    game.phase = 'move';
    game.diceValue = 1;
    assert.deepEqual(getValidMoves(game), [0]);
});

test('a piece may jump over own pieces in the home lane but may not land on them', () => {
    const game = createGame(1, 1);
    const laneStart = game.trackLength + 1;
    game.pieces[0].pieces[0].steps = laneStart;
    game.pieces[0].pieces[1].steps = laneStart + 1;
    game.phase = 'move';
    game.diceValue = 2;

    assert.deepEqual(getValidMoves(game), [0, 1]);
    movePiece(game, 0);
    assert.equal(game.pieces[0].pieces[0].steps, laneStart + 2);
    assert.equal(game.pieces[0].pieces[1].steps, laneStart + 1);

    game.currentPlayer = 0;
    game.phase = 'move';
    game.diceValue = 1;
    assert.deepEqual(getValidMoves(game), [0]);
});

test('two own pieces cannot occupy the same home-lane square', () => {
    const game = createGame(1, 1);
    game.pieces[0].pieces[0].steps = game.trackLength + 1;
    game.pieces[0].pieces[1].steps = game.trackLength + 2;
    game.phase = 'move';
    game.diceValue = 1;

    assert.deepEqual(getValidMoves(game), [1]);
});

test('a player wins when all four pieces occupy the four distinct home-lane squares', () => {
    const game = createGame(1, 1);
    const laneStart = game.trackLength + 1;
    game.pieces[0].pieces[0].steps = laneStart;
    game.pieces[0].pieces[1].steps = laneStart + 1;
    game.pieces[0].pieces[2].steps = laneStart + 2;
    game.pieces[0].pieces[3].steps = game.trackLength;
    game.phase = 'move';
    game.diceValue = 4;

    assert.deepEqual(getValidMoves(game), [3]);
    movePiece(game, 3);
    assert.deepEqual(game.pieces[0].pieces.map(piece => piece.steps), [
        laneStart, laneStart + 1, laneStart + 2, laneStart + 3
    ]);
    assert.equal(game.winner, 0);
    assert.equal(game.phase, 'finished');
});

test('the fourth home-lane square cannot be shared by two own pieces', () => {
    const game = createGame(1, 1);
    game.pieces[0].pieces[0].steps = game.trackLength + 3;
    game.pieces[0].pieces[1].steps = game.trackLength + 4;
    game.phase = 'move';
    game.diceValue = 1;

    assert.deepEqual(getValidMoves(game), []);
});

test('a piece cannot overshoot the final home space', () => {
    const game = createGame(1, 1);
    game.pieces[0].pieces[0].steps = game.trackLength + 3;
    game.phase = 'move';
    game.diceValue = 2;

    assert.deepEqual(getValidMoves(game), []);
});


