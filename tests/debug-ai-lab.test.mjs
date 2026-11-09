import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createGame, getValidMoves, movePiece, rollDice
} from '../debug/js/game-engine.js';
import {
  AI_WEIGHT_DEFINITIONS, getAIStrategicWeights, setAIWeightOverrides
} from '../debug/js/ai-weight-config.js';
import { chooseStrategicDecision } from '../debug/js/ai-strategy.js';

function makeScenario(boardSize) {
  const game = createGame(1, 1, ['Testovací hráč', 'Testovací AI'], [], boardSize);
  game.currentPlayer = 1;
  game.phase = 'roll';
  game.diceValue = 0;
  game.pieces[0].pieces.forEach((piece, index) => {
    piece.steps = [8, 17, -1, -1][index];
  });
  game.pieces[1].pieces.forEach((piece, index) => {
    piece.steps = [3, 11, 22, -1][index];
  });
  return game;
}

test('debug laboratoř má přesně deset vlastních strategických vah', () => {
  assert.equal(AI_WEIGHT_DEFINITIONS.length, 10);
  assert.equal(new Set(AI_WEIGHT_DEFINITIONS.map(item => item.key)).size, 10);
  assert.equal(Object.keys(getAIStrategicWeights()).length, 10);
});

test('debug kopie používají pouze další soubory uvnitř debug/js', async () => {
  const files = [
    ['debug/js/game-engine.js', /from ['"]\.\/ai-strategy\.js['"]/],
    ['debug/js/ai-strategy.js', /from ['"]\.\/ai-weight-config\.js['"]/],
    ['debug/js/ai-weight-config.js', /from ['"]\.\/ai-tactical-weights\.js['"]/]
  ];
  for (const [path, pattern] of files) {
    const source = await readFile(new URL('../' + path, import.meta.url), 'utf8');
    assert.match(source, pattern, path + ' musí importovat lokální debug kopii');
    assert.doesNotMatch(source, /from ['"]\.\.\/js\//, path + ' nesmí importovat produkční JS');
  }
});

for (const boardSize of [40, 48, 80]) {
  test('debug AI vybírá pouze legální tahy pro desku ' + boardSize, () => {
    setAIWeightOverrides({});
    const initial = makeScenario(boardSize);
    for (let dice = 1; dice <= 6; dice++) {
      const game = structuredClone(initial);
      const roll = rollDice(game, dice);
      const legalMoves = getValidMoves(game);
      if (!legalMoves.length) {
        assert.ok(roll.retrying || ['roll', 'no-move', 'finished'].includes(game.phase));
        continue;
      }
      const before = JSON.stringify(game);
      const decision = chooseStrategicDecision(game, { getValidMoves, movePiece, rollDice });
      assert.ok(decision, 'AI musí rozhodnout pro hod ' + dice);
      assert.ok(legalMoves.includes(decision.pieceId),
        'AI nesmí zvolit nelegální figurku pro hod ' + dice);
      assert.equal(decision.breakdown.weightConfig.count, 10);
      assert.equal(Object.keys(decision.breakdown.weightConfig.values).length, 10);
      assert.equal(JSON.stringify(game), before, 'výpočet rozhodnutí nesmí změnit stav hry');
    }
  });
}

test('experimentální přepsání vah zůstává v debug konfiguraci', () => {
  const before = getAIStrategicWeights();
  setAIWeightOverrides({ progressToGoal: 19 });
  assert.equal(getAIStrategicWeights().progressToGoal, 19);
  setAIWeightOverrides({});
  assert.deepEqual(getAIStrategicWeights(), before);
});
