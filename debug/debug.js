import { createGame, getValidMoves, movePiece, rollDice } from './js/game-engine.js';
import { chooseStrategicDecision } from './js/ai-strategy.js';
import { AI_WEIGHT_DEFINITIONS, getAIStrategicWeights, setAIWeightOverrides } from './js/ai-weight-config.js';

const $ = id => document.getElementById(id);
const weightsRoot = $('weights');
const numberFormat = value => Number.isFinite(Number(value)) ? Number(value).toFixed(3).replace(/\.000$/, '') : '—';

function renderWeights() {
  const current = getAIStrategicWeights();
  weightsRoot.replaceChildren();
  for (const definition of AI_WEIGHT_DEFINITIONS) {
    const wrapper = document.createElement('div');
    wrapper.className = 'weight';
    const label = document.createElement('label');
    label.htmlFor = 'weight-' + definition.key;
    label.textContent = definition.id + '. ' + definition.name;
    const input = document.createElement('input');
    input.id = label.htmlFor;
    input.type = 'number';
    input.min = String(definition.min);
    input.max = String(definition.max);
    input.step = '0.1';
    input.value = String(current[definition.key]);
    input.dataset.weight = definition.key;
    const help = document.createElement('small');
    help.textContent = definition.description + ' Rozsah ' + definition.min + '–' + definition.max + '.';
    wrapper.append(label, input, help);
    weightsRoot.append(wrapper);
  }
}

function readWeights() {
  const values = {};
  for (const input of weightsRoot.querySelectorAll('[data-weight]')) {
    const value = Number(input.value);
    if (!Number.isFinite(value)) throw new Error('Neplatná hodnota váhy: ' + input.dataset.weight);
    values[input.dataset.weight] = value;
  }
  setAIWeightOverrides(values);
}

function buildScenario(boardSize) {
  const game = createGame(1, 1, ['Testovací hráč', 'Testovací AI'], [], boardSize);
  game.currentPlayer = 1;
  game.phase = 'move';
  game.diceValue = 1;
  game.pieces[0].pieces[0].steps = 8;
  game.pieces[0].pieces[1].steps = 17;
  game.pieces[1].pieces[0].steps = 3;
  game.pieces[1].pieces[1].steps = 11;
  game.pieces[1].pieces[2].steps = 22;
  return game;
}

function renderDiceOutcomes(outcomes) {
  const decisionRoot = $('decision');
  const diceRoot = $('dice-results');
  decisionRoot.replaceChildren();
  diceRoot.replaceChildren();

  const summary = document.createElement('p');
  summary.textContent = 'Vyhodnoceno všech šest hodnot kostky odděleně. Každá větev začíná ze stejného stavu hry.';
  decisionRoot.append(summary);

  const table = document.createElement('table');
  table.innerHTML = '<thead><tr><th>Kostka</th><th>Fáze enginu</th><th>Legální tahy</th><th>Volba AI</th><th>Skóre</th></tr></thead>';
  const body = document.createElement('tbody');

  for (const outcome of outcomes) {
    const row = document.createElement('tr');
    const values = [
      outcome.dice,
      outcome.phase,
      outcome.legalMoves.length ? outcome.legalMoves.map(id => id + 1).join(', ') : 'žádné',
      outcome.decision ? 'Figurka ' + (outcome.decision.pieceId + 1) : 'bez tahu',
      outcome.decision ? numberFormat(outcome.decision.score) : '—'
    ];
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = String(value);
      row.append(cell);
    }
    if (outcome.decision && !outcome.legalMoves.includes(outcome.decision.pieceId)) {
      row.className = 'invalid';
    }
    body.append(row);
  }
  table.append(body);
  diceRoot.append(table);

  for (const outcome of outcomes) {
    const card = document.createElement('article');
    card.className = 'die-outcome';
    const heading = document.createElement('h3');
    heading.textContent = 'Výsledek kostky ' + outcome.dice;
    card.append(heading);

    const status = document.createElement('p');
    status.textContent = 'Fáze: ' + outcome.phase + ' · legální figurky: ' +
      (outcome.legalMoves.length ? outcome.legalMoves.map(id => id + 1).join(', ') : 'žádné');
    card.append(status);

    if (outcome.decision) {
      const decision = document.createElement('p');
      decision.className = 'selected';
      decision.textContent = 'AI vybrala figurku ' + (outcome.decision.pieceId + 1) +
        ' · skóre ' + numberFormat(outcome.decision.score);
      card.append(decision);

      const reason = document.createElement('p');
      reason.textContent = outcome.decision.reason || 'Bez vysvětlení.';
      card.append(reason);

      const factors = outcome.decision.breakdown?.selectedWeightFactors;
      if (factors?.weightContributions) {
        const detail = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = 'Příspěvky všech deseti vah';
        const list = document.createElement('ul');
        for (const [key, value] of Object.entries(factors.weightContributions)) {
          const item = document.createElement('li');
          item.textContent = key + ': ' + numberFormat(value);
          list.append(item);
        }
        detail.append(summary, list);
        card.append(detail);
      }
      const alternatives = document.createElement('p');
      alternatives.textContent = 'Ostatní legální možnosti: ' +
        (outcome.decision.alternatives || []).map(item =>
          'figurka ' + (item.pieceId + 1) + ' (' + numberFormat(item.score) + ')'
        ).join(' · ');
      card.append(alternatives);
    } else {
      const noMove = document.createElement('p');
      noMove.textContent = outcome.rollResult?.retrying
        ? 'Engine vyžaduje opakovaný hod.'
        : 'V tomto výsledku není možné provést tah.';
      card.append(noMove);
    }

    const nextRolls = outcome.decision?.breakdown?.diceSimulation || [];
    if (nextRolls.length) {
      const follow = document.createElement('p');
      follow.className = 'muted';
      follow.textContent = 'Navazující simulace: ' + nextRolls.map(item =>
        item.dice + ' → ' + (item.legalMoveCount ?? 0) + ' tahů' +
        (item.bonusRoll ? ' + bonusový hod' : '')
      ).join(' · ');
      card.append(follow);
    }
    decisionRoot.append(card);
  }
}

function run() {
  const button = $('run-test');
  button.disabled = true;
  $('status').textContent = 'Vyhodnocuji šest větví…';
  try {
    readWeights();
    const boardSize = Number($('board-size').value);
    const initial = buildScenario(boardSize);
    initial.phase = 'roll';
    initial.diceValue = 0;
    const outcomes = [];

    for (let dice = 1; dice <= 6; dice++) {
      const game = JSON.parse(JSON.stringify(initial));
      const rollResult = rollDice(game, dice);
      const legalMoves = getValidMoves(game);
      const decision = legalMoves.length
        ? chooseStrategicDecision(game, { getValidMoves, movePiece, rollDice })
        : null;

      if (decision && !legalMoves.includes(decision.pieceId)) {
        throw new Error('Při hodu ' + dice + ' AI vybrala nelegální tah.');
      }
      outcomes.push({ dice, phase: game.phase, rollResult, legalMoves, decision });
    }

    renderDiceOutcomes(outcomes);
    const moveBranches = outcomes.filter(item => item.decision).length;
    $('status').textContent = 'Test dokončen: deska ' + boardSize +
      ' polí · prověřeno všech 6 výsledků · AI vyhodnotila ' + moveBranches +
      ' větví s legálním tahem. Produkční hra nebyla změněna.';
  } catch (error) {
    $('status').textContent = 'Test selhal: ' + error.message;
    console.error('[AI debug lab]', error);
  } finally {
    button.disabled = false;
  }
}

$('reset-weights').addEventListener('click', () => {
  setAIWeightOverrides({});
  renderWeights();
  $('status').textContent = 'Výchozí hodnoty vah obnoveny pouze v této stránce.';
});
$('run-test').addEventListener('click', run);
renderWeights();
run();
