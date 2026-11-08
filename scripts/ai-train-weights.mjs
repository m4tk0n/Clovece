#!/usr/bin/env node
/**
 * Reward-based REINFORCE trainer for the shared tactical weights.
 * Uses completed self-play outcomes, never teacherScore as a training label.
 * Immediate wins remain a fixed, non-trainable priority.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const args = Object.fromEntries(process.argv.slice(2).map(value => {
    const match = value.match(/^--([^=]+)=(.*)$/);
    return match ? [match[1], match[2]] : [value.replace(/^--/, ''), true];
}));
const inputDir = path.resolve(String(args['input-dir'] || 'training-data/self-play'));
const weightsPath = path.resolve(String(args.weights || 'config/ai-tactical-weights.json'));
const modulePath = path.resolve(String(args.module || 'js/ai-tactical-weights.js'));
const reportPath = path.resolve(String(args.report || 'artifacts/ai-weight-training-report.json'));
const epochs = Math.max(1, Math.min(200, Number(args.epochs) || 30));
const learningRate = Math.max(0.0001, Math.min(0.1, Number(args['learning-rate']) || 0.015));
const minGames = Math.max(4, Number(args['min-games']) || 10);
const minRecords = Math.max(50, Number(args['min-records']) || 100);

const KEYS = ['ownProgress', 'opponentSetback', 'threatReduction', 'captureOpponent', 'captureOwn', 'finishPiece'];
const INITIAL = {
    immediateWin: 100000,
    ownProgress: 0.08,
    opponentSetback: 0.035,
    threatReduction: 12,
    captureOpponent: 5,
    captureOwn: 7,
    finishPiece: 8
};
const BOUNDS = {
    ownProgress: [0, 0.5],
    opponentSetback: [0, 0.2],
    threatReduction: [0, 30],
    captureOpponent: [0, 20],
    captureOwn: [0, 30],
    finishPiece: [0, 20]
};

function readJson(file, fallback = null) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}
function listFiles(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(name => /\.jsonl(?:\.gz)?$/i.test(name))
        .map(name => path.join(dir, name)).sort();
}
function readRecords(file) {
    const raw = fs.readFileSync(file);
    const content = file.endsWith('.gz') ? zlib.gunzipSync(raw).toString('utf8') : raw.toString('utf8');
    return content.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}
function gameHash(value) {
    let hash = 2166136261;
    for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return hash >>> 0;
}
function clamp(value, [min, max]) { return Math.max(min, Math.min(max, value)); }
function features(candidate) {
    const f = candidate.teacherFactors || {};
    const values = [
        Number(f.ownProgress) / 10,
        Number(f.opponentSetback) / 10,
        Number(f.threatReduction),
        f.capturedOpponent ? 1 : 0,
        f.capturedOwnPiece ? -1 : 0,
        f.finishedPiece ? 1 : 0
    ];
    return values.every(Number.isFinite) ? values : null;
}
function parametersFrom(weights) {
    return [
        Number(weights.ownProgress) * 10,
        Number(weights.opponentSetback) * 10,
        Number(weights.threatReduction),
        Number(weights.captureOpponent),
        Number(weights.captureOwn),
        Number(weights.finishPiece)
    ];
}
function weightsFrom(parameters) {
    return {
        immediateWin: INITIAL.immediateWin,
        ownProgress: parameters[0] / 10,
        opponentSetback: parameters[1] / 10,
        threatReduction: parameters[2],
        captureOpponent: parameters[3],
        captureOwn: parameters[4],
        finishPiece: parameters[5]
    };
}
function dot(a, b) { return a.reduce((sum, value, index) => sum + value * b[index], 0); }
function softmax(scores) {
    const max = Math.max(...scores);
    const exps = scores.map(value => Math.exp(Math.max(-40, Math.min(40, value - max))));
    const total = exps.reduce((sum, value) => sum + value, 0);
    return exps.map(value => value / total);
}
function actionProbabilities(record, parameters) {
    const vectors = record.candidates.map(features);
    return softmax(vectors.map(vector => dot(parameters, vector) / record.policyTemperature));
}
function importanceRatio(record, probability) {
    return clamp(probability / record.selectedProbability, [0.2, 5]);
}
function policyLogLikelihood(records, parameters) {
    let total = 0;
    let count = 0;
    for (const record of records) {
        const selectedIndex = record.candidates.findIndex(candidate => candidate.pieceId === record.selectedPieceId);
        if (selectedIndex < 0) continue;
        const probabilities = actionProbabilities(record, parameters);
        const ratio = importanceRatio(record, probabilities[selectedIndex]);
        total += (record.advantage || 0) * ratio * Math.log(Math.max(1e-12, probabilities[selectedIndex]));
        count++;
    }
    return count ? total / count : 0;
}

const currentConfig = readJson(weightsPath, { version: 1, weights: INITIAL });
const previousWeights = { ...INITIAL, ...(currentConfig.weights || {}) };
for (const key of Object.keys(INITIAL)) {
    if (!Number.isFinite(Number(previousWeights[key]))) throw new Error('Neplatná současná váha: ' + key);
}
previousWeights.immediateWin = INITIAL.immediateWin;

const files = listFiles(inputDir);
if (!files.length) throw new Error('Nebyly nalezeny žádné self-play JSONL soubory v ' + inputDir);
const games = new Map();
const stats = { files: files.length, records: 0, incompleteSkipped: 0, malformedSkipped: 0, winningMoveRecordsSkipped: 0, nonExploratorySkipped: 0, behaviorPolicyMismatchSkipped: 0 };
for (const file of files) {
    for (const record of readRecords(file)) {
        stats.records++;
        if (record.completed !== true || !Number.isFinite(record.reward) || !Array.isArray(record.candidates)) {
            stats.incompleteSkipped++;
            continue;
        }
        const gameId = String(record.gameId || '');
        if (!gameId) { stats.malformedSkipped++; continue; }
        const selected = record.candidates.find(candidate => candidate.pieceId === record.selectedPieceId);
        if (!selected || record.candidates.length < 2 || record.candidates.some(candidate => candidate.teacherFactors?.winning)) {
            stats.winningMoveRecordsSkipped++;
            continue;
        }
        if (record.selection !== 'reinforce-softmax' ||
            !Number.isFinite(record.policyTemperature) || record.policyTemperature < 0.25 ||
            !Number.isFinite(record.selectedProbability) || record.selectedProbability <= 0) {
            stats.nonExploratorySkipped++;
            continue;
        }
        const vectors = record.candidates.map(features);
        if (vectors.some(vector => !vector)) { stats.malformedSkipped++; continue; }
        const behaviorScores = record.candidates.map(candidate => Number(candidate.teacherScore));
        if (behaviorScores.some(score => !Number.isFinite(score))) { stats.malformedSkipped++; continue; }
        const behaviorProbabilities = softmax(behaviorScores.map(score => score / record.policyTemperature));
        const selectedIndex = record.candidates.findIndex(candidate => candidate.pieceId === record.selectedPieceId);
        if (Math.abs(behaviorProbabilities[selectedIndex] - record.selectedProbability) > 0.0001) {
            stats.behaviorPolicyMismatchSkipped++;
            continue;
        }
        if (!games.has(gameId)) games.set(gameId, []);
        games.get(gameId).push({
            gameId,
            playerId: record.playerId,
            reward: Number(record.reward),
            selectedPieceId: record.selectedPieceId,
            selectedProbability: record.selectedProbability,
            policyTemperature: record.policyTemperature,
            candidates: record.candidates
        });
    }
}
if (games.size < minGames) throw new Error('Nedostatek dokončených partií: ' + games.size + '; potřeba alespoň ' + minGames + '.');

const trainGames = new Set();
const validationGames = new Set();
for (const gameId of games.keys()) {
    if (gameHash(gameId) % 5 === 0) validationGames.add(gameId);
    else trainGames.add(gameId);
}
if (trainGames.size < 2 || validationGames.size < 2) {
    throw new Error('Nelze vytvořit oddělenou trénovací a validační množinu podle celých partií.');
}
function prepareRecords(gameSet) {
    const result = [];
    for (const gameId of gameSet) {
        const records = games.get(gameId);
        const playerRewards = new Map();
        for (const record of records) playerRewards.set(record.playerId, record.reward);
        const meanReward = [...playerRewards.values()].reduce((sum, value) => sum + value, 0) /
            Math.max(1, playerRewards.size);
        for (const record of records) {
            const advantage = Math.max(-1.5, Math.min(1.5, record.reward - meanReward));
            if (Math.abs(advantage) < 1e-9) continue;
            result.push({ ...record, advantage });
        }
    }
    return result;
}
const training = prepareRecords(trainGames);
const validation = prepareRecords(validationGames);
if (training.length < minRecords || validation.length < Math.max(20, Math.floor(minRecords / 5))) {
    throw new Error('Nedostatek použitelných rozhodnutí: train=' + training.length + ', validation=' +
        validation.length + '. Je potřeba více dokončených partií.');
}

let parameters = parametersFrom(previousWeights);
const baselineValidation = policyLogLikelihood(validation, parameters);
for (let epoch = 0; epoch < epochs; epoch++) {
    const gradient = Array(KEYS.length).fill(0);
    let used = 0;
    for (const record of training) {
        const selectedIndex = record.candidates.findIndex(candidate => candidate.pieceId === record.selectedPieceId);
        const vectors = record.candidates.map(features);
        if (selectedIndex < 0 || vectors.some(vector => !vector)) continue;
        const probabilities = actionProbabilities(record, parameters);
        const ratio = importanceRatio(record, probabilities[selectedIndex]);
        const expected = Array(KEYS.length).fill(0);
        vectors.forEach((vector, index) => vector.forEach((value, feature) => {
            expected[feature] += probabilities[index] * value;
        }));
        const chosen = vectors[selectedIndex];
        const advantage = record.advantage * ratio / record.policyTemperature;
        for (let feature = 0; feature < KEYS.length; feature++) {
            gradient[feature] += advantage * (chosen[feature] - expected[feature]);
        }
        used++;
    }
    if (!used) throw new Error('Trénink nemá žádná použitelná rozhodnutí.');
    for (let feature = 0; feature < parameters.length; feature++) {
        const key = KEYS[feature];
        const [min, max] = BOUNDS[key];
        const delta = Math.max(-0.25, Math.min(0.25, gradient[feature] / used));
        parameters[feature] = clamp(parameters[feature] + learningRate * delta, [min * (key === 'ownProgress' || key === 'opponentSetback' ? 10 : 1), max * (key === 'ownProgress' || key === 'opponentSetback' ? 10 : 1)]);
    }
}
const candidateWeights = weightsFrom(parameters);
const candidateValidation = policyLogLikelihood(validation, parameters);
const improvement = candidateValidation - baselineValidation;
const accepted = Number.isFinite(candidateValidation) && improvement > 1e-7;
const finalWeights = accepted ? candidateWeights : previousWeights;
const report = {
    format: 'clovece-ai-reward-training-report',
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    method: 'Off-policy REINFORCE with centered final-placement rewards and clipped action-probability correction',
    source: { ...stats, completedGames: games.size, trainingGames: trainGames.size, validationGames: validationGames.size },
    decisions: { training: training.length, validation: validation.length },
    epochs, learningRate,
    policyTemperatures: [...new Set([...training, ...validation].map(record => record.policyTemperature))].sort((a, b) => a - b),
    previousWeights,
    candidateWeights,
    finalWeights,
    validation: {
        baselineRewardWeightedLogLikelihood: Number(baselineValidation.toFixed(8)),
        candidateRewardWeightedLogLikelihood: Number(candidateValidation.toFixed(8)),
        improvement: Number(improvement.toFixed(8))
    },
    accepted,
    safeguards: {
        immediateWinFixed: true,
        legalMovesAndRulesUntouched: true,
        splitByWholeGame: true,
        rejectedUnlessValidationImproves: true,
        behaviorProbabilityVerified: true,
        importanceRatioClipped: [0.2, 5]
    },
    note: 'Validation checks importance-corrected reward-weighted action likelihood on held-out games. Action probabilities are corrected against the recorded behavior policy; historical state-distribution bias remains, so an independent gameplay tournament is still required.'
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
if (accepted) {
    const config = {
        version: 1,
        trainedAt: report.createdAt,
        trainingMethod: report.method,
        sourceGames: games.size,
        weights: finalWeights
    };
    fs.mkdirSync(path.dirname(weightsPath), { recursive: true });
    fs.writeFileSync(weightsPath, JSON.stringify(config, null, 2) + '\n');
    fs.mkdirSync(path.dirname(modulePath), { recursive: true });
    fs.writeFileSync(modulePath, '// Generated from config/ai-tactical-weights.json by scripts/ai-train-weights.mjs.\n' +
        'export const AI_TACTICAL_WEIGHTS = Object.freeze(' + JSON.stringify(finalWeights, null, 2) + ');\n');
}
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
