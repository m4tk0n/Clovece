import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createGame, getValidMoves, movePiece, rollDice } from '../debug/js/game-engine.js';
import { chooseStrategicDecision } from '../debug/js/ai-strategy.js';
import { AI_WEIGHT_COUNT, AI_WEIGHT_DEFINITIONS, setAIWeightOverrides, getAIStrategicWeights } from '../debug/js/ai-weight-config.js';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('debug laboratoř má vlastní vstup, styly a oddělené moduly', async () => {
  const [page, script, style, production] = await Promise.all([
    read('../debug/index.php'), read('../debug/debug.js'), read('../debug/debug.css'), read('../index.php')
  ]);
  assert.ok(page.includes('debug.css'));
  assert.ok(page.includes('debug.js'));
  assert.ok(page.includes('noindex,nofollow'));
  assert.ok(script.includes("from './js/game-engine.js'"));
  assert.ok(script.includes("from './js/ai-strategy.js'"));
  assert.ok(script.includes("from './js/ai-weight-config.js'"));
  assert.ok(!production.includes('debug/debug.js'));
  assert.ok(!production.includes('debug/debug.css'));
  assert.ok(style.length > 100);
});

test('debug používá přesně deset vah a jejich úpravy neovlivňují hlavní hru', async () => {
  const original = { ...getAIStrategicWeights() };
  assert.equal(AI_WEIGHT_COUNT, 10);
  assert.equal(AI_WEIGHT_DEFINITIONS.length, 10);
  const changed = { ...original, progressToGoal: original.progressToGoal + 1 };
  setAIWeightOverrides(changed);
  assert.equal(getAIStrategicWeights().progressToGoal, changed.progressToGoal);
  setAIWeightOverrides({});
  assert.deepEqual(getAIStrategicWeights(), original);
});

test('debug AI vybírá pouze legální tah a simuluje šest výsledků pro všechny desky', () => {
  for (const boardSize of [40, 48, 80]) {
    const game = createGame(1, 1, ['Člověk', 'AI'], [], boardSize);
    game.currentPlayer = 1;
    game.phase = 'move';
    game.diceValue = 1;
    game.pieces[0].pieces[0].steps = 8;
    game.pieces[1].pieces[0].steps = 3;
    game.pieces[1].pieces[1].steps = 11;
    const legal = getValidMoves(game);
    const decision = chooseStrategicDecision(game, { getValidMoves, movePiece, rollDice });
    assert.ok(decision, 'decision for board ' + boardSize);
    assert.ok(legal.includes(decision.pieceId), 'only legal move for board ' + boardSize);
    assert.equal(decision.breakdown.weightConfig.count, 10);
    assert.deepEqual(decision.breakdown.diceSimulation.map(item => item.dice), [1,2,3,4,5,6]);
  }
});
