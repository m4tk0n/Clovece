#!/usr/bin/env node
/**
 * Přímá optimalizace vah podle míry výher (Cross-Entropy Method).
 *
 * Každá generace: vzorkuje populaci kandidátů kolem aktuálního průměru, všechny hrají
 * stejné partie (stejná semínka) proti šampionovi, nejlepší čtvrtina určí nový průměr.
 * Nový průměr musí šampiona porazit na NOVÝCH semínkách se z > 2,33 (99 %), aby se stal
 * šampionem; práh je přísnější než 95 %, protože se testuje opakovaně.
 * Nasazení vah do hry dělá až promote-weights.mjs po nezávislém ověření.
 */
import { mkdir, open, readFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { evaluateMatch, randomFor, toObject, clampVector } from './train-selfplay.mjs';
import { AI_WEIGHT_DEFINITIONS } from '../js/ai-weight-config.js';
import { AI_TACTICAL_WEIGHTS } from '../js/ai-tactical-weights.js';

const KEYS = AI_WEIGHT_DEFINITIONS.map(item => item.key);
const DEFAULTS = KEYS.map(key => AI_TACTICAL_WEIGHTS[key]);
const FLOOR = 0.05;
const SETUPS = [{ playerCount: 2, boardSize: 40 }, { playerCount: 4, boardSize: 40 }];

function gaussian(random) {
    return Math.sqrt(-2 * Math.log(random() || 1e-12)) * Math.cos(2 * Math.PI * random());
}
async function atomicWrite(path, data) {
    await mkdir(dirname(path), { recursive: true });
    const temporary = path + '.tmp-' + process.pid;
    const handle = await open(temporary, 'w');
    try { await handle.writeFile(data, 'utf8'); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, path);
}
async function readJson(path) {
    try { return JSON.parse(await readFile(path, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export async function main(argv = process.argv.slice(2)) {
    const read = (name, fallback) => {
        const item = argv.find(value => value.startsWith('--' + name + '='));
        return item ? item.slice(name.length + 3) : fallback;
    };
    const args = {
        generations: Number(read('generations', 8)), population: Number(read('population', 10)),
        games: Number(read('games', 150)), finalGames: Number(read('final-games', 400)),
        sigma: Number(read('sigma', 0.3)), maxTurns: Number(read('max-turns', 1500)),
        setups: SETUPS.slice(0, Number(read('setups', 1))), seed: Number(read('seed', 20261111)),
        checkpoint: read('checkpoint', 'artifacts/cem-checkpoint.json'),
        report: read('report', 'artifacts/cem-report.json'), resume: argv.includes('--resume')
    };
    let state = await readJson(args.checkpoint);
    if (state) {
        if (!args.resume) throw new Error('Checkpoint již existuje. Použij --resume.');
    } else {
        if (args.resume) throw new Error('Checkpoint pro obnovu nebyl nalezen.');
        // Stejný formát jako train-selfplay.mjs, aby šel použít promote-weights.mjs.
        state = {
            format: 'clovece-selfplay-checkpoint', version: 1, method: 'cem',
            createdAt: new Date().toISOString(), step: 0, gamesPlayed: 0, cutoffGames: 0,
            weights: [...DEFAULTS], champion: [...DEFAULTS],
            sigma: Array(KEYS.length).fill(args.sigma), generations: [], evaluations: []
        };
    }
    const elites = Math.max(2, Math.round(args.population * 0.25));

    while (state.step < args.generations) {
        const random = randomFor(args.seed + state.step * 7919);
        const seedBase = args.seed + 100000 + state.step * 100000;
        const opponent = { type: 'weights', weights: state.champion, temperature: 0 };
        const population = Array.from({ length: args.population }, () => {
            const noise = KEYS.map(() => gaussian(random));
            const vector = clampVector(state.weights.map((value, index) =>
                Math.max(FLOOR, value) * Math.exp(state.sigma[index] * noise[index])));
            return { vector, noise };
        });
        const scored = population.map(item => {
            const result = evaluateMatch({
                candidate: item.vector, opponent, setups: args.setups,
                games: args.games, seedBase, maxTurns: args.maxTurns
            });
            state.gamesPlayed += args.games;
            return { ...item, score: result.winRate - result.chanceRate, decisive: result.decisive };
        }).sort((a, b) => b.score - a.score);

        const top = scored.slice(0, elites);
        const logs = top.map(item => item.vector.map(value => Math.log(Math.max(FLOOR, value))));
        const meanLog = KEYS.map((_, k) => logs.reduce((s, row) => s + row[k], 0) / logs.length);
        const stdLog = KEYS.map((_, k) => Math.sqrt(logs.reduce((s, row) => s + (row[k] - meanLog[k]) ** 2, 0) / logs.length));
        state.weights = clampVector(KEYS.map((_, k) => Math.exp(0.5 * Math.log(Math.max(FLOOR, state.weights[k])) + 0.5 * meanLog[k])));
        state.sigma = state.sigma.map((value, k) => Math.max(0.06, 0.5 * value + 0.5 * stdLog[k]));

        const check = evaluateMatch({
            candidate: state.weights, opponent, setups: args.setups, games: args.finalGames,
            seedBase: seedBase + 50000, maxTurns: args.maxTurns
        });
        state.gamesPlayed += args.finalGames;
        const promoted = check.decisive >= args.finalGames * 0.8 && check.z > 2.33;
        if (promoted) state.champion = [...state.weights];
        state.step++;
        state.generations.push({
            step: state.step, promoted, bestScore: scored[0].score, medianScore: scored[Math.floor(scored.length / 2)].score,
            meanVsChampion: { wins: check.wins, decisive: check.decisive, z: check.z },
            mean: toObject(state.weights), sigma: state.sigma.map(v => Number(v.toFixed(3)))
        });
        process.stdout.write('Generace ' + state.step + '/' + args.generations + ' | nejlepší kandidát +' + (scored[0].score * 100).toFixed(1) +
            ' p.b. | průměr vs šampion ' + check.wins + '/' + check.decisive + ' (z ' + check.z.toFixed(2) + (promoted ? ', POVÝŠEN' : '') + ')\n');
        await atomicWrite(args.report, JSON.stringify({
            schema: 'clovece-cem-report-v1', status: state.step >= args.generations ? 'completed' : 'running',
            generatedAt: new Date().toISOString(), settings: { ...args, setups: args.setups },
            weights: { default: toObject(DEFAULTS), mean: toObject(state.weights), champion: toObject(state.champion) },
            generations: state.generations
        }, null, 2) + '\n');
        await atomicWrite(args.checkpoint, JSON.stringify(state, null, 2) + '\n');
    }
    process.stdout.write('Hotovo. Šampion: ' + JSON.stringify(toObject(state.champion.map(v => Number(v.toFixed(3))))) + '\n');
}

if (import.meta.url === new URL(process.argv[1], 'file://').href) {
    main().catch(error => { process.stderr.write((error?.stack || String(error)) + '\n'); process.exitCode = 1; });
}
