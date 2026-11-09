import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('online AI decision stores ten-weight explanation and six-dice simulation',async()=>{
    const api=await readFile(new URL('../online-api.php',import.meta.url),'utf8');
    const engine=await readFile(new URL('../lib/game-engine.php',import.meta.url),'utf8');
    assert.match(api,/'strategyVersion' => 'weighted-ai-10-v1'/);
    assert.match(api,/\$actionResult\['aiDecision'\] = \$decision/);
    assert.match(api,/'weightCount' => \$decision\['weightCount'\]/);
    assert.match(api,/'weightSignals' => \$decision\['weightSignals'\]/);
    assert.match(api,/'weightContributions' => \$decision\['weightContributions'\]/);
    assert.match(api,/'diceSimulation' => \$decision\['diceSimulation'\]/);
    assert.match(engine,/'weightCount' => 10/);
    assert.match(engine,/onlineEngineAiNextDiceOutcomes/);
});
