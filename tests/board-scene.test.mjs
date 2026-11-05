import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../js/game-engine.js';
import { buildBoardSceneData } from '../js/game-board-scene.js';

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
