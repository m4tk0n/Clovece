import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../js/game-engine.js';
import { buildBoardSceneData } from '../js/game-board-scene.js';
import { buildDebugMovePaths } from '../js/game-board-debug.js';

test('scene model is derived without mutating the game state', () => {
    const game = createGame(2, 0, [], [], 40);
    const before = structuredClone(game);

    const scene = buildBoardSceneData(game, 'classic');

    assert.deepEqual(game, before);
    assert.equal(scene.trackLength, 40);
    assert.equal(scene.slotCount, 4);
    assert.equal(scene.track.length, 40);
    assert.equal(scene.lanes.length, 4);
    assert.equal(scene.players.length, game.players.length);
    assert.equal(scene.pieces.length, 0);
});

test('both board styles produce scene data from the same game state', () => {
    const game = createGame(2, 0, [], [], 40);
    const before = structuredClone(game);

    const classic = buildBoardSceneData(game, 'classic');
    const polygon = buildBoardSceneData(game, 'polygon');

    assert.deepEqual(game, before);
    assert.equal(classic.style, 'classic');
    assert.equal(polygon.style, 'polygon');
    assert.equal(classic.track.length, polygon.track.length);
    assert.deepEqual(classic.players, polygon.players);
});

test('debug move paths number the legal route into the home lane', () => {
    const game = createGame(2, 0, [], [], 40);
    game.currentPlayer = 0;
    game.phase = 'move';
    game.diceValue = 3;
    game.pieces[0].pieces[0].steps = 38;

    const paths = buildDebugMovePaths(game, 'classic');

    assert.equal(paths.length, 1);
    assert.equal(paths[0].pieceId, 0);
    assert.deepEqual(paths[0].points.map(point => point.number), [1, 2, 3]);
    assert.deepEqual(paths[0].points.map(point => point.lane), [null, 1, 2]);
});

test('debug move paths show the start field for every legal deployment', () => {
    const game = createGame(2, 0, [], [], 40);
    game.currentPlayer = 0;
    game.phase = 'move';
    game.diceValue = 6;

    const paths = buildDebugMovePaths(game, 'classic');

    assert.equal(paths.length, 4);
    assert.ok(paths.every(path => path.points.length === 1));
    assert.ok(paths.every(path => path.points[0].field === game.players[0].start + 1));
    assert.equal(new Set(paths.map(path => path.color)).size, 4);
});
