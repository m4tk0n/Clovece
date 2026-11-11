import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    createGame, getValidMoves, movePiece, rollDice, chooseAIMoveDecision
} from '../debug/js/game-engine.js';
import { computeMoveSignals, getDifficultyProfile } from '../debug/js/ai-strategy.js';
import { AI_WEIGHT_DEFINITIONS } from '../debug/js/ai-weight-config.js';
import { AI_BASELINE_WEIGHTS } from '../debug/js/ai-baseline-weights.js';

const ALL_DEFINITIONS = AI_WEIGHT_DEFINITIONS;
const AI_EXTENDED_WEIGHT_DEFINITIONS = AI_WEIGHT_DEFINITIONS.slice(10);
import { main as trainMain, playGame, evaluateMatch, randomFor } from '../debug/scripts/train-selfplay.mjs';

function scenario(difficulty = 'medium') {
    const game = createGame(1, 1, [], [], 40, {}, difficulty);
    game.currentPlayer = 1;
    game.phase = 'move';
    game.diceValue = 3;
    game.pieces[1].pieces[0].steps = 2;
    game.pieces[1].pieces[1].steps = 9;
    game.pieces[1].pieces[2].steps = 20;
    game.pieces[0].pieces[0].steps = 12;
    return game;
}
const deps = { getValidMoves, movePiece, rollDice };

test('každá obtížnost vybírá jen legální tah', () => {
    for (const level of ['easy', 'medium', 'hard']) {
        for (let i = 0; i < 6; i++) {
            const game = scenario(level);
            const decision = chooseAIMoveDecision(game, level, {});
            assert.ok(getValidMoves(game).includes(decision.pieceId), level);
        }
    }
});

test('střední a těžká AI jsou deterministické, lehká dělá i neoptimální tahy', () => {
    const game = scenario();
    const medium = new Set(Array.from({ length: 8 }, () => chooseAIMoveDecision(game, 'medium', {}).pieceId));
    assert.equal(medium.size, 1);
    const easy = new Set(Array.from({ length: 60 }, () => chooseAIMoveDecision(game, 'easy', {}).pieceId));
    assert.ok(easy.size > 1, 'lehká AI musí někdy zvolit jiný legální tah');
    assert.equal(getDifficultyProfile('neznámá').level, 'medium');
});

test('vlastní váhy se promítnou do rozhodnutí a rychlý režim vynechá rozbor soupeřů', () => {
    const game = scenario();
    const fast = chooseAIMoveDecision(game, 'medium', {}, { detail: false });
    assert.deepEqual(fast.breakdown.opponentResponses, []);
    const custom = Object.fromEntries(AI_WEIGHT_DEFINITIONS.map(item => [item.key, 0]));
    custom.progressToGoal = 20;
    const decision = chooseAIMoveDecision(game, 'medium', {}, { weights: custom });
    assert.equal(decision.breakdown.weightConfig.values.progressToGoal, 20);
});

test('computeMoveSignals vrací 10 základních + 8 rozšířených signálů v rozsahu -1..1', () => {
    const game = scenario();
    const signals = computeMoveSignals(game, deps);
    assert.deepEqual(signals.map(item => item.pieceId), getValidMoves(game));
    assert.ok(signals.every(item => item.signals.length === 18 &&
        item.signals.every(value => Number.isFinite(value) && value >= -1 && value <= 1)));
});

test('rozšířené váhy jsou ve výchozím stavu nulové a nemění původní rozhodnutí', () => {
    assert.equal(AI_WEIGHT_DEFINITIONS.length, 18);
    assert.equal(AI_EXTENDED_WEIGHT_DEFINITIONS.length, 8);
    assert.deepEqual(Object.keys(AI_BASELINE_WEIGHTS), AI_WEIGHT_DEFINITIONS.map(item => item.key));
    assert.deepEqual(AI_EXTENDED_WEIGHT_DEFINITIONS.map(item => item.id), [11, 12, 13, 14, 15, 16, 17, 18]);
    assert.ok(AI_EXTENDED_WEIGHT_DEFINITIONS.every(item => item.defaultValue === 0));
    const game = scenario();
    const base = chooseAIMoveDecision(game, 'medium', {});
    const zeros = Object.fromEntries(AI_EXTENDED_WEIGHT_DEFINITIONS.map(item => [item.key, 0]));
    assert.equal(chooseAIMoveDecision(game, 'medium', {}, { weights: zeros }).pieceId, base.pieceId);
});

test('self-play partie používá jen legální tahy a evaluateMatch je reprodukovatelný', () => {
    const setup = { playerCount: 2, boardSize: 40 };
    const policy = { type: 'weights', weights: ALL_DEFINITIONS.map(i => i.defaultValue), temperature: 0 };
    const result = playGame({ setup, policies: [policy, { type: 'random' }], seed: 5, maxTurns: 600 });
    assert.ok(result.cutoff || [0, 1].includes(result.winner));
    const args = { candidate: policy.weights, opponent: { type: 'random' }, setups: [setup], games: 4, seedBase: 100, maxTurns: 600 };
    assert.deepEqual(evaluateMatch(args), evaluateMatch(args));
    assert.ok(randomFor(1)() >= 0);
});

test('trenér ukládá checkpoint, drží váhy v rozsahu, obnovuje se a nepřepíše data', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'clovece-selfplay-'));
    const common = [
        '--updates=2', '--batch=2', '--eval-every=2', '--gate-games=10', '--anchor-games=10',
        '--setups=1', '--max-turns=400',
        '--checkpoint=' + join(dir, 'c.json'), '--report=' + join(dir, 'r.json')
    ];
    try {
        await trainMain(common);
        const checkpoint = JSON.parse(await readFile(join(dir, 'c.json'), 'utf8'));
        const report = JSON.parse(await readFile(join(dir, 'r.json'), 'utf8'));
        assert.equal(checkpoint.step, 2);
        assert.equal(report.schema, 'clovece-selfplay-report-v1');
        assert.equal(report.status, 'completed');
        assert.equal(checkpoint.weights.length, 18);
        ALL_DEFINITIONS.forEach((definition, index) => {
            assert.ok(checkpoint.weights[index] >= definition.min && checkpoint.weights[index] <= definition.max);
        });
        await assert.rejects(trainMain(common), /Checkpoint již existuje/);
        await trainMain([...common.filter(a => !a.startsWith('--updates=')), '--updates=3', '--resume']);
        const resumed = JSON.parse(await readFile(join(dir, 'c.json'), 'utf8'));
        assert.equal(resumed.step, 3);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
