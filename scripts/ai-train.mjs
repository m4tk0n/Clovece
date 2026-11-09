// /scripts/ai-train.mjs
#!/usr/bin/env node
/**
 * Offline pairwise trainer for the 26-feature legal-move ranker (schema v3).
 * Reads immutable teacher self-play JSONL(.gz), holds out whole games,
 * and exports a candidate model. It never modifies the runtime model.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { AI_FEATURE_COUNT, AI_FEATURE_SCHEMA_VERSION } from '../js/ai-neural-network.js';

const args = Object.fromEntries(process.argv.slice(2).map(value => {
    const match = value.match(/^--([^=]+)=(.*)$/);
    return match ? [match[1], match[2]] : [value.replace(/^--/, ''), true];
}));
const inputDir = String(args['input-dir'] || 'training-data/self-play');
const output = String(args.output || 'artifacts/ludo-ai-candidate.js');
const metricsPath = String(args.metrics || 'artifacts/ai-training-metrics.json');
const epochs = Math.max(1, Math.min(300, Number(args.epochs) || 40));
const learningRate = Math.max(0.0001, Math.min(0.1, Number(args['learning-rate']) || 0.01));
const seed = Number(args.seed) || 20261108;

function rng(initial) {
    let state = initial >>> 0;
    return () => ((state = (1664525 * state + 1013904223) >>> 0) / 4294967296);
}
const random = rng(seed);
function shuffle(items) {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
}
function sigmoid(x) {
    if (x > 30) return 1;
    if (x < -30) return 0;
    return 1 / (1 + Math.exp(-x));
}
function listFiles(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter(name => /\.jsonl(?:\.gz)?$/i.test(name))
        .map(name => path.join(dir, name)).sort();
}
function readRecords(file) {
    const raw = fs.readFileSync(file);
    const text = file.endsWith('.gz') ? zlib.gunzipSync(raw).toString('utf8') : raw.toString('utf8');
    return text.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}
const files = listFiles(inputDir);
if (!files.length) throw new Error('Ve vstupním adresáři nejsou žádná JSONL/JSONL.GZ self-play data: ' + inputDir);

const pairs = [];
const stats = { files: files.length, records: 0, incompleteSkipped: 0, malformedSkipped: 0, tiesSkipped: 0 };
for (const file of files) {
    for (const record of readRecords(file)) {
        stats.records++;
        if (record.completed !== true || !Array.isArray(record.candidates)) {
            stats.incompleteSkipped++;
            continue;
        }
        const candidates = record.candidates.filter(candidate =>
            Array.isArray(candidate.features) && candidate.features.length === AI_FEATURE_COUNT &&
            candidate.features.every(Number.isFinite) && Number.isFinite(candidate.teacherScore)
        );
        if (candidates.length < 2) { stats.malformedSkipped++; continue; }
        for (let i = 0; i < candidates.length; i++) {
            for (let j = i + 1; j < candidates.length; j++) {
                const delta = candidates[i].teacherScore - candidates[j].teacherScore;
                if (Math.abs(delta) < 1e-8) { stats.tiesSkipped++; continue; }
                pairs.push({
                    a: candidates[i].features,
                    b: candidates[j].features,
                    label: delta > 0 ? 1 : 0,
                    gameId: String(record.gameId ?? 'unknown'),
                    margin: Math.min(1, Math.abs(delta) / (Math.abs(delta) + 10))
                });
            }
        }
    }
}
if (pairs.length < 100) throw new Error('Nedostatek trénovacích dvojic (' + pairs.length + '); potřeba je alespoň 100.');

const gameHash = value => [...value].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 0);
const train = pairs.filter(pair => gameHash(pair.gameId) % 5 !== 0);
const validation = pairs.filter(pair => gameHash(pair.gameId) % 5 === 0);
if (!train.length || !validation.length) throw new Error('Nelze vytvořit oddělenou validační množinu; dodejte více různých gameId.');

const sizes = [AI_FEATURE_COUNT, 32, 16, 1];
const layers = [];
for (let layer = 0; layer < sizes.length - 1; layer++) {
    const inputSize = sizes[layer], outputSize = sizes[layer + 1];
    const scale = Math.sqrt(2 / inputSize);
    layers.push({
        outputSize,
        weights: Array.from({ length: outputSize }, () =>
            Array.from({ length: inputSize }, () => (random() * 2 - 1) * scale)),
        biases: Array(outputSize).fill(0),
        activation: layer === sizes.length - 2 ? 'linear' : 'relu'
    });
}
function forward(features) {
    const activations = [features.slice()];
    let values = features.slice();
    for (const layer of layers) {
        values = layer.weights.map((row, i) => {
            let sum = layer.biases[i];
            for (let j = 0; j < row.length; j++) sum += row[j] * values[j];
            return layer.activation === 'relu' ? Math.max(0, sum) : sum;
        });
        activations.push(values);
    }
    return activations;
}
function trainPair(pair) {
    const aa = forward(pair.a), bb = forward(pair.b);
    const scoreA = aa.at(-1)[0], scoreB = bb.at(-1)[0];
    const probability = sigmoid(scoreA - scoreB);
    const error = (probability - pair.label) * (0.5 + pair.margin);
    const gradientsA = [error], gradientsB = [-error];

    for (let layerIndex = layers.length - 1; layerIndex >= 0; layerIndex--) {
        const layer = layers[layerIndex];
        const prevA = aa[layerIndex], prevB = bb[layerIndex];
        const nextA = Array(prevA.length).fill(0), nextB = Array(prevB.length).fill(0);
        for (let out = 0; out < layer.weights.length; out++) {
            const rawA = gradientsA[out] * (layer.activation === 'relu' && aa[layerIndex + 1][out] <= 0 ? 0 : 1);
            const rawB = gradientsB[out] * (layer.activation === 'relu' && bb[layerIndex + 1][out] <= 0 ? 0 : 1);
            layer.biases[out] -= learningRate * (rawA + rawB);
            for (let input = 0; input < layer.weights[out].length; input++) {
                nextA[input] += layer.weights[out][input] * rawA;
                nextB[input] += layer.weights[out][input] * rawB;
                layer.weights[out][input] -= learningRate * (rawA * prevA[input] + rawB * prevB[input]);
            }
        }
        gradientsA.splice(0, gradientsA.length, ...nextA);
        gradientsB.splice(0, gradientsB.length, ...nextB);
    }
}
function accuracy(data) {
    let correct = 0, loss = 0;
    for (const pair of data) {
        const difference = forward(pair.a).at(-1)[0] - forward(pair.b).at(-1)[0];
        const p = sigmoid(difference);
        if ((difference >= 0 ? 1 : 0) === pair.label) correct++;
        loss += -(pair.label * Math.log(Math.max(1e-12, p)) +
            (1 - pair.label) * Math.log(Math.max(1e-12, 1 - p)));
    }
    return { accuracy: Number((correct / data.length).toFixed(5)), logLoss: Number((loss / data.length).toFixed(5)) };
}

let best = null;
let bestAccuracy = -1;
for (let epoch = 1; epoch <= epochs; epoch++) {
    shuffle(train);
    for (const pair of train) trainPair(pair);
    const result = accuracy(validation);
    if (result.accuracy > bestAccuracy || (result.accuracy === bestAccuracy && (!best || result.logLoss < best.validation.logLoss))) {
        bestAccuracy = result.accuracy;
        best = { epoch, validation: result, layers: structuredClone(layers) };
    }
}
const model = {
    format: 'clovece-ai-neural-model',
    version: 1,
    featureSchemaVersion: AI_FEATURE_SCHEMA_VERSION,
    enabled: true,
    inputSize: AI_FEATURE_COUNT,
    layers: best.layers
};
const report = {
    format: 'clovece-ai-training-report',
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    seed, epochs, learningRate, architecture: sizes,
    featureSchemaVersion: AI_FEATURE_SCHEMA_VERSION,
    featureCount: AI_FEATURE_COUNT,
    source: stats,
    pairs: { total: pairs.length, train: train.length, validation: validation.length },
    bestEpoch: best.epoch,
    train: accuracy(train),
    validation: best.validation,
    note: 'Validation measures imitation of teacher pairwise preferences, not win-rate improvement. Candidate is not automatically deployed.'
};
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.mkdirSync(path.dirname(metricsPath), { recursive: true });
fs.writeFileSync(output, '/** Generated offline candidate. Do not deploy without tournament validation. */\nexport default Object.freeze(' +
    JSON.stringify(model, null, 2) + ');\n');
fs.writeFileSync(metricsPath, JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
