import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AI_TACTICAL_WEIGHTS } from '../js/ai-tactical-weights.js';

test('JavaScript and PHP read the same shared tactical weight source', () => {
    const config = JSON.parse(fs.readFileSync(new URL('../config/ai-tactical-weights.json', import.meta.url), 'utf8'));
    assert.deepEqual(AI_TACTICAL_WEIGHTS, config.weights);
    assert.equal(AI_TACTICAL_WEIGHTS.immediateWin, 100000);
    for (const [key, value] of Object.entries(AI_TACTICAL_WEIGHTS)) {
        assert.ok(Number.isFinite(value), 'váha ' + key + ' musí být konečné číslo');
    }
    const php = fs.readFileSync(new URL('../lib/game-engine.php', import.meta.url), 'utf8');
    assert.ok(php.includes("/config/ai-tactical-weights.json"));
    assert.ok(php.includes("$weights = onlineEngineAiTacticalWeights();"));
});
