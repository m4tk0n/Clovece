import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  getValidMoves,
  rollDice
} from '../js/game-engine.js';

function movingGame(rules = {}) {
  const game = createGame(1, 1, [], [], 40, rules);
  game.phase = 'move';
  game.diceValue = 2;
  return game;
}

test('výchozí nastavení zapíná všechna čtyři rozšířená pravidla', () => {
  const game = createGame(1, 1);
  assert.deepEqual(game.rules, {
    threeRolls: true,
    mustDeploy: true,
    skipHomePieces: true,
    mustEnterHome: true
  });
});

test('povinný vstup do domečku: legální vstup zablokuje tah jinou figurkou', () => {
  const game = movingGame({ mustEnterHome: true });
  game.pieces[0].pieces[0].steps = 38;
  game.pieces[0].pieces[1].steps = 10;
  assert.deepEqual(getValidMoves(game), [0]);
});

test('povinný vstup: bez legálního volného cílového pole lze táhnout jinou figurkou', () => {
  const game = movingGame({ mustEnterHome: true });
  game.pieces[0].pieces[0].steps = 38;
  game.pieces[0].pieces[1].steps = 40; // blokuje cílové pole D1
  game.pieces[0].pieces[2].steps = 10;
  assert.deepEqual(getValidMoves(game), [2]);
});

test('povinný vstup vypnutý: hráč může zvolit i jinou figurku', () => {
  const game = movingGame({ mustEnterHome: false });
  game.pieces[0].pieces[0].steps = 38;
  game.pieces[0].pieces[1].steps = 10;
  assert.deepEqual(getValidMoves(game), [0, 1]);
});

test('přeskakování figurek v domečku respektuje přepínač', () => {
  const enabled = movingGame({ mustEnterHome: false, skipHomePieces: true });
  enabled.pieces[0].pieces[0].steps = 39;
  enabled.pieces[0].pieces[1].steps = 40;
  assert.deepEqual(getValidMoves(enabled), [0, 1, 2, 3]);

  const disabled = movingGame({ mustEnterHome: false, skipHomePieces: false });
  disabled.pieces[0].pieces[0].steps = 39;
  disabled.pieces[0].pieces[1].steps = 40;
  assert.deepEqual(getValidMoves(disabled), [1, 2, 3]);
});

test('povinnost nasadit při šestce respektuje přepínač', () => {
  const enabled = createGame(1, 1, [], [], 40, { mustDeploy: true });
  enabled.phase = 'move';
  enabled.diceValue = 6;
  enabled.pieces[0].pieces[1].steps = 5;
  assert.deepEqual(getValidMoves(enabled), [0, 2, 3]);

  const disabled = createGame(1, 1, [], [], 40, { mustDeploy: false });
  disabled.phase = 'move';
  disabled.diceValue = 6;
  disabled.pieces[0].pieces[1].steps = 5;
  assert.deepEqual(getValidMoves(disabled), [0, 1, 2, 3]);
});

test('pravidlo tří hodů: při zapnutí hráč dostane tři pokusy', () => {
  const game = createGame(1, 1, [], [], 40, { threeRolls: true });
  assert.equal(rollDice(game, 2).retrying, true);
  assert.equal(rollDice(game, 4).retrying, true);
  const third = rollDice(game, 3);
  assert.equal(third.retrying, false);
  assert.equal(third.attempt, 3);
  assert.equal(game.phase, 'no-move');
});

test('pravidlo tří hodů vypnuté: po prvním neúspěšném hodu tah končí', () => {
  const game = createGame(1, 1, [], [], 40, { threeRolls: false });
  const result = rollDice(game, 2);
  assert.equal(result.retrying, false);
  assert.equal(result.attempt, 1);
  assert.equal(game.phase, 'no-move');
});

test('všechny kombinace čtyř přepínačů lze bezpečně předat do herního jádra', () => {
  for (let mask = 0; mask < 16; mask++) {
    const rules = {
      threeRolls: Boolean(mask & 1),
      mustDeploy: Boolean(mask & 2),
      skipHomePieces: Boolean(mask & 4),
      mustEnterHome: Boolean(mask & 8)
    };
    const game = createGame(1, 1, [], [], 40, rules);
    assert.deepEqual(game.rules, rules);
  }
});

test('výchozí a volitelné velikosti desky fungují pro různý počet hráčů', () => {
  assert.equal(createGame(1, 1).boardSize, 40);
  assert.equal(createGame(1, 3).boardSize, 40);
  assert.equal(createGame(1, 4).boardSize, 48);
  assert.equal(createGame(1, 7).boardSize, 80);
});
