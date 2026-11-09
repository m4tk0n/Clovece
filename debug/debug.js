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

function renderDecision(decision, game) {
  const root = $('decision');
  root.replaceChildren();
  if (!decision) {
    root.textContent = 'V této pozici není k dispozici legální tah.';
    return;
  }
  const breakdown = decision.breakdown || {};
  const metrics = [
    ['Vybraný tah', 'Figurka ' + (decision.pieceId + 1)],
    ['Počet legálních tahů', String(breakdown.legalMoveCount ?? '—')],
    ['Aktivní váhy', String(breakdown.weightConfig?.count ?? 10)],
    ['Verze strategie', breakdown.selection || '—']
  ];
  const grid = document.createElement('div');
  grid.className = 'result-grid';
  for (const [label, value] of metrics) {
    const item = document.createElement('div');
    item.className = 'metric';
    const strong = document.createElement('strong');
    strong.textContent = value;
    const span = document.createElement('span');
    span.textContent = label;
    item.append(strong, span);
    grid.append(item);
  }
  const reason = document.createElement('p');
  reason.textContent = decision.reason || 'Bez textového vysvětlení.';
  reason.className = 'muted';
  root.append(grid, reason);
  const candidates = [{ pieceId: decision.pieceId, score: breakdown.selectedWeightFactors?.score ?? 'vybráno', selected: true }, ...(decision.alternatives || [])];
  if (candidates.length) {
    const heading = document.createElement('h3');
    heading.textContent = 'Porovnání kandidátů';
    root.append(heading);
    const table = document.createElement('table');
    table.innerHTML = '<thead><tr><th>Figurka</th><th>Skóre</th><th>Legální</th></tr></thead>';
    const body = document.createElement('tbody');
    for (const candidate of candidates) {
      const row = document.createElement('tr');
      const piece = candidate.pieceId ?? candidate.id ?? '—';
      const score = candidate.score ?? candidate.totalScore ?? '—';
      row.innerHTML = '<td></td><td></td><td></td>';
      row.cells[0].textContent = String(Number(piece) + 1);
      row.cells[1].textContent = numberFormat(score);
      row.cells[2].textContent = getValidMoves(game).includes(Number(piece)) ? (candidate.selected ? 'ANO · vybráno' : 'ANO') : 'NE';
      body.append(row);
    }
    table.append(body);
    root.append(table);
  }
}

function renderDice(decision) {
  const root = $('dice-results');
  root.replaceChildren();
  const simulation = decision?.breakdown?.diceSimulation || [];
  if (!simulation.length) {
    root.textContent = 'Engine neposkytl záznam simulace šesti hodů.';
    return;
  }
  const table = document.createElement('table');
  table.innerHTML = '<thead><tr><th>Kostka</th><th>Legální tahy</th><th>Bonusový hod</th><th>Výsledek</th></tr></thead>';
  const body = document.createElement('tbody');
  for (const outcome of simulation) {
    const row = document.createElement('tr');
    const values = [
      outcome.dice,
      outcome.legalMoveCount ?? outcome.validMoves?.length ?? '—',
      outcome.bonusRoll ? 'ANO' : 'NE',
      outcome.finish ? 'Možné dokončení' : (outcome.capture ? 'Možné vyhození' : (outcome.retrying ? 'Opakování hodu' : 'Běžný výsledek'))
    ];
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = String(value);
      row.append(cell);
    }
    body.append(row);
  }
  table.append(body);
  root.append(table);
}

function run() {
  const button = $('run-test');
  button.disabled = true;
  $('status').textContent = 'Vyhodnocuji…';
  try {
    readWeights();
    const boardSize = Number($('board-size').value);
    const game = buildScenario(boardSize);
    const legalMoves = getValidMoves(game);
    const decision = chooseStrategicDecision(game, { getValidMoves, movePiece, rollDice });
    if (decision && !legalMoves.includes(decision.pieceId)) {
      throw new Error('AI vybrala tah, který herní engine neoznačil za legální.');
    }
    renderDecision(decision, game);
    renderDice(decision);
    $('status').textContent = 'Test dokončen. Deska ' + boardSize + ' polí; legálních tahů: ' + legalMoves.length + '.';
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
