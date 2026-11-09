// /tests/board-geometry.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { trackPosition } from '../js/game-board-geometry.js';

for (const style of ['classic', 'polygon']) {
    test(`40-space ${style} board has 40 distinct track positions`, () => {
        const game = { trackLength: 40, slotCount: 4, players: [] };
        const positions = Array.from({ length: 40 }, (_, index) =>
            trackPosition(index, game, style)
        );
        const key = position => position.x.toFixed(3) + ',' + position.y.toFixed(3);

        assert.equal(positions.length, 40);
        assert.equal(new Set(positions.map(key)).size, 40);
        assert.ok(positions.every(position =>
            Number.isFinite(position.x) && Number.isFinite(position.y)
        ));
    });
}
