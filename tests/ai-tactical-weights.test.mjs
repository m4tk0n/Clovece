// /tests/ai-tactical-weights.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AI_TACTICAL_WEIGHTS } from '../js/ai-tactical-weights.js';
import { AI_WEIGHT_KEYS, getAIStrategicWeights } from '../js/ai-weight-config.js';

test('aktivní JS a PHP konfigurace obsahují stejných deset pojmenovaných vah',()=>{
    const config=JSON.parse(fs.readFileSync(new URL('../config/ai-tactical-weights.json',import.meta.url),'utf8'));
    assert.deepEqual(AI_TACTICAL_WEIGHTS,config.weights);
    assert.deepEqual(Object.keys(config.weights),AI_WEIGHT_KEYS);
    assert.deepEqual(config.weights,getAIStrategicWeights());
    assert.equal(Object.keys(config.weights).length,10);
    for(const [key,value] of Object.entries(config.weights)) assert.ok(Number.isFinite(value),key);
    const php=fs.readFileSync(new URL('../lib/game-engine.php',import.meta.url),'utf8');
    assert.ok(php.includes('/config/ai-tactical-weights.json'));
    assert.ok(php.includes('onlineEngineAiTacticalWeights'));
    assert.ok(php.includes('ai-learned-weights.json'));
    assert.ok(php.includes('ai-weights-10-v1'));
    assert.ok(php.includes('bonusContinuation'));
});
