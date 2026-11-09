import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createGame, getValidMoves, movePiece, rollDice } from '../js/game-engine.js';
import { chooseStrategicDecision } from '../js/ai-strategy.js';
import { AI_WEIGHT_COUNT, AI_WEIGHT_DEFINITIONS, setAIWeightOverrides, getAIStrategicWeights } from '../js/ai-weight-config.js';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('debug laboratoř má vlastní vstup, styly a skript mimo produkční entry point', async () => {
  const [page, script, style, production] = await Promise.all([
    read('../debug/index.php'), read('../debug/debug.js'), read('../debug/debug.css'), read('../index.php')
  ]);
  assert.match(page, /debug\.css/);
  assert.match(page, /debug\.js/);
  assert.match(page, /noindex,nofollow/);
  assert.match(script, /\.\.\/js\/game-engine\.js/);
  assert.match(script, /\.\.\/js\/ai-strategy\.js/);
  assert.doesNotMatch(production, /debug\/debug\.js|debug\/debug\.css/);
  assert.ok(style.length > 100);
});

test('debug nastavení používá přesně deset vah a změna nepřepisuje výchozí hodnoty', async () => {
  const original = { ...getAIStrategicWeights() };
  assert.equal(AI_WEIGHT_COUNT, 10);
  assert.equal(AI_WEIGHT_DEFINITIONS.length, 10);
  const changed = { ...original, progressToGoal: original.progressToGoal + 1 };
  setAIWeightOverrides(changed);
  assert.equal(getAIStrategicWeights().progressToGoal, changed.progressToGoal);
  setAIWeightOverrides({});
  assert.deepEqual(getAIStrategicWeights(), original);
});

test('debug AI vybere pouze legální tah a poskytne šest výsledků kostky pro všechny desky', () => {
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
