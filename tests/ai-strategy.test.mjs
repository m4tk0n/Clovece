import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, getValidMoves, movePiece, rollDice } from '../js/game-engine.js';
import { estimateCaptureProbability, estimatePieceThreat, evaluateTacticalCandidates, calculatePlayerPips, chooseStrategicDecision, normalizeTrainingSituation } from '../js/ai-strategy.js';
import { AI_WEIGHT_COUNT, AI_WEIGHT_DEFINITIONS, getAIWeightValues, setAIWeightOverrides } from '../js/ai-weight-config.js';

const deps = { getValidMoves, movePiece, rollDice };

function setupDecision(boardSize = 40) {
    const game = createGame(1, 1, [], [], boardSize);
    game.phase = 'move';
    game.diceValue = 1;
    game.pieces[0].pieces[0].steps = 0;
    game.pieces[0].pieces[1].steps = 5;
    return game;
}

test('aktivní AI má přesně deset pojmenovaných naučitelných vah', () => {
    assert.equal(AI_WEIGHT_COUNT, 10);
    assert.equal(AI_WEIGHT_DEFINITIONS.length, 10);
    assert.equal(getAIWeightValues().length, 10);
    assert.deepEqual(AI_WEIGHT_DEFINITIONS.map(item => item.key), [
        'progressToGoal','finishPiece','captureOpponent','protectOwn','threatenOpponent',
        'deployPiece','homeProgress','bonusContinuation','startFieldRisk','flexibility'
    ]);
    assert.ok(AI_WEIGHT_DEFINITIONS.every(item => item.name && item.description && Number.isFinite(item.defaultValue)));
});

test('všechny váhy lze samostatně přepsat a žádná jedenáctá se nenačte', () => {
    const overrides = Object.fromEntries(AI_WEIGHT_DEFINITIONS.map(item => [item.key, item.defaultValue + 1]));
    overrides.extraWeight = 999;
    setAIWeightOverrides(overrides);
    assert.deepEqual(getAIWeightValues(), AI_WEIGHT_DEFINITIONS.map(item => item.defaultValue + 1));
    setAIWeightOverrides({});
    assert.deepEqual(getAIWeightValues(), AI_WEIGHT_DEFINITIONS.map(item => item.defaultValue));
});

test('AI hodnotí pouze tahy vrácené herním enginem a zaznamená všech šest výsledků kostky', () => {
    const game = setupDecision();
    const legal = getValidMoves(game);
    const decision = chooseStrategicDecision(game, deps);
    assert.ok(legal.includes(decision.pieceId));
    assert.equal(decision.breakdown.selection, 'weighted-ai-10-v1');
    assert.equal(decision.breakdown.weightConfig.count, 10);
    assert.equal(decision.breakdown.legalMoveCount, legal.length);
    assert.equal(decision.breakdown.diceSimulation.length, 6);
    assert.deepEqual(decision.breakdown.diceSimulation.map(item => item.dice), [1,2,3,4,5,6]);
    assert.ok(decision.alternatives.every(item => legal.includes(item.pieceId)));
});

test('skóre je přesným součtem deseti pojmenovaných příspěvků', () => {
    const game = setupDecision();
    const legal = getValidMoves(game);
    const candidates = legal.map(pieceId => {
        const state = structuredClone(game);
        const move = movePiece(state, pieceId);
        return { pieceId, move, state, winningMove: state.winner === game.currentPlayer };
    });
    const ranking = evaluateTacticalCandidates(game, candidates, undefined, deps);
    assert.equal(ranking.length, legal.length);
    for (const item of ranking) {
        assert.equal(Object.keys(item.factors.weightContributions).length, 10);
        const total = Object.values(item.factors.weightContributions).reduce((sum, value) => sum + value, 0);
        assert.ok(Math.abs(total - item.score) < 0.00001);
        assert.equal(item.factors.weightSignals.length, 10);
        assert.equal(item.factors.diceSimulation.length, 6);
        assert.ok(Number.isFinite(item.score));
    }
});

test('okamžitá výhra má vždy přednost před strategickými vahami', () => {
    const game = createGame(1, 1);
    game.phase = 'move';
    game.diceValue = 1;
    game.pieces[0].pieces[0].steps = game.trackLength - 1;
    game.pieces[0].pieces[1].steps = game.trackLength + 1;
    game.pieces[0].pieces[2].steps = game.trackLength + 2;
    game.pieces[0].pieces[3].steps = game.trackLength + 3;
    const decision = chooseStrategicDecision(game, deps);
    assert.equal(decision.pieceId, 0);
    assert.equal(decision.breakdown.selection, 'immediate-win');
    assert.match(decision.reason, /vítězný tah/i);
});

test('AI vrací null, pokud engine neposkytne žádný legální tah', () => {
    const game = createGame(1, 1);
    game.phase = 'move';
    game.diceValue = 1;
    game.pieces[0].pieces.forEach(piece => { piece.steps = game.trackLength + 3; });
    assert.equal(chooseStrategicDecision(game, deps), null);
});

test('AI podporuje všechny tři délky desky', () => {
    for (const size of [40,48,80]) {
        const game = setupDecision(size);
        const decision = chooseStrategicDecision(game, deps);
        assert.ok(getValidMoves(game).includes(decision.pieceId));
        assert.equal(decision.breakdown.weightConfig.count, 10);
    }
});

test('přesná shoda naučené situace může ovlivnit výběr, ale jen legální figurkou', () => {
    const game = setupDecision();
    const signature = normalizeTrainingSituation(game);
    const memory = { situations: { [signature]: { votes: [0, 4, 1, 0], ok: 2, err: 0 } } };
    const decision = chooseStrategicDecision(game, deps, 'medium', Math.random, memory);
    assert.equal(decision.pieceId, 1);
    assert.equal(decision.breakdown.trainedKnowledge, true);
    assert.equal(decision.breakdown.selection, 'compiled-memory');
    assert.equal(decision.breakdown.usedInstructions[0].votes, 4);
});

test('výpočet pravděpodobnosti zásahu zohledňuje řetězení šestek', () => {
    assert.equal(estimateCaptureProbability(4), 1/6);
    assert.equal(estimateCaptureProbability(7), 1/36);
    assert.equal(estimateCaptureProbability(13), 1/216);
    assert.equal(estimateCaptureProbability(0), 0);
});

test('riziko figurky se počítá pouze pro hlavní trasu', () => {
    const game = createGame(1,1);
    game.pieces[0].pieces[0].steps = game.trackLength;
    assert.equal(estimatePieceThreat(game,0,0,deps),0);
});

test('výpočet zbývající cesty podporuje 40, 48 a 80 polí', () => {
    for (const length of [40,48,80]) {
        const game = createGame(1,1,[],[],length);
        assert.ok(calculatePlayerPips(game,0) > 0);
    }
});
