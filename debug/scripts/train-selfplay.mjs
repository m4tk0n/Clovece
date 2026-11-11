#!/usr/bin/env node
/**
 * Self-play trénink osmnácti strategických vah (10 základních + 8 rozšířených) (debug prostředí).
 *
 * Co se skutečně děje:
 *  1. Učící se hráč (kandidát) hraje partie proti šampionovi. Vybírá tah vzorkováním
 *     softmax(skóre / T), tedy zkouší i méně výhodné tahy.
 *  2. Po dávce partií se váhy upraví metodou REINFORCE (policy gradient, optimalizátor Adam):
 *     tahy vítězné partie se posílí, tahy prohrané oslabí. Odměna = výhra minus šance 1/N.
 *  3. Každých --eval-every aktualizací se kandidát (hraje deterministicky, bez vzorkování)
 *     změří proti šampionovi a proti pevným kotvám (původní váhy, náhodný hráč).
 *  4. Šampionem se kandidát stane jen při statisticky významné výhře (z-test, 95 %).
 *  Partie ukončená limitem tahů se nezapočítává (žádný umělý vítěz).
 *  Pravidla a legální tahy poskytuje výhradně game-engine.js. Produkční hra se nemění.
 */
import { mkdir, open, readFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createGame, rollDice, getValidMoves, movePiece, advanceTurn } from '../js/game-engine.js';
import { computeMoveSignals, calculatePlayerPips } from '../js/ai-strategy.js';
import { AI_WEIGHT_DEFINITIONS } from '../js/ai-weight-config.js';
import { AI_BASELINE_WEIGHTS } from '../js/ai-baseline-weights.js';

// Trénuje se všech 18 vah z jediné centrální definice (ID 1–10 základní, 11–18 rozšířené).
// Porovnávací základna je NEMĚNNÁ původní AI (ai-baseline-weights.js), ne aktuální výchozí váhy.
const ALL_DEFINITIONS = AI_WEIGHT_DEFINITIONS;
export const KEYS = ALL_DEFINITIONS.map(item => item.key);
const MIN = ALL_DEFINITIONS.map(item => item.min);
const MAX = ALL_DEFINITIONS.map(item => item.max);
export const RANGE = ALL_DEFINITIONS.map(item => item.max - item.min);
export const DEFAULT_WEIGHTS = KEYS.map(key => AI_BASELINE_WEIGHTS[key]);
// turnLimit: velké desky potřebují mnohem víc tahů (naměřeno: 6 hráčů/48 polí nedokončí ani za 700 tahů).
export const ALL_SETUPS = [
    { playerCount: 2, boardSize: 40 },
    { playerCount: 4, boardSize: 40 },
    { playerCount: 6, boardSize: 48, turnLimit: 3000, large: true },
    { playerCount: 8, boardSize: 80, turnLimit: 4500, large: true }
];
const dependencies = { getValidMoves, movePiece, rollDice, advanceTurn };

export const toObject = vector => Object.fromEntries(KEYS.map((key, index) => [key, vector[index]]));
export const clampVector = vector => vector.map((value, index) => Math.max(MIN[index], Math.min(MAX[index], value)));

export function randomFor(seed) {
    let state = (seed >>> 0) || 1;
    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function softmax(scores, temperature) {
    const top = Math.max(...scores);
    const exps = scores.map(score => Math.exp((score - top) / temperature));
    const sum = exps.reduce((a, b) => a + b, 0);
    return exps.map(value => value / sum);
}

/** Vybere tah podle politiky sedadla. Vrací { pieceId, record|null }. */
function decide(game, policy, random) {
    const legal = getValidMoves(game);
    if (legal.length === 1) return { pieceId: legal[0], record: null };
    if (policy.type === 'random') return { pieceId: legal[Math.floor(random() * legal.length)], record: null };

    const options = computeMoveSignals(game, dependencies, { level: 'medium' });
    const winning = options.find(item => item.winning);
    if (winning) return { pieceId: winning.pieceId, record: null };

    const scores = options.map(option =>
        option.signals.reduce((sum, value, index) => sum + value * policy.weights[index], 0));
    if (policy.temperature > 0) {
        const probabilities = softmax(scores, policy.temperature);
        let draw = random();
        let chosen = probabilities.length - 1;
        for (let index = 0; index < probabilities.length; index++) {
            draw -= probabilities[index];
            if (draw <= 0) { chosen = index; break; }
        }
        return {
            pieceId: options[chosen].pieceId,
            record: policy.record ? { signals: options.map(item => item.signals), probabilities, chosen } : null
        };
    }
    const best = Math.max(...scores);
    const tied = options.filter((_, index) => Math.abs(scores[index] - best) < 1e-9);
    return { pieceId: tied[Math.floor(random() * tied.length)].pieceId, record: null };
}

export function playGame({ setup, policies, seed, maxTurns }) {
    const random = randomFor(seed);
    const game = createGame(1, setup.playerCount - 1, [], [], setup.boardSize, {}, 'medium');
    game.currentPlayer = 0;
    const records = policies.map(() => []);
    let guard = 0;
    const turnLimit = setup.turnLimit || maxTurns;
    while (game.winner === null && game.turnNumber <= turnLimit && guard++ < 400000) {
        if (game.phase === 'roll') {
            const result = rollDice(game, 1 + Math.floor(random() * 6));
            if (!result.turnEnded && game.phase === 'no-move') advanceTurn(game);
            continue;
        }
        if (game.phase === 'no-move') { advanceTurn(game); continue; }
        if (game.phase !== 'move') throw new Error('Neočekávaná fáze hry: ' + game.phase);
        const seat = game.currentPlayer;
        const { pieceId, record } = decide(game, policies[seat], random);
        if (!getValidMoves(game).includes(pieceId)) throw new Error('AI vybrala nelegální tah: ' + pieceId);
        if (record) records[seat].push(record);
        movePiece(game, pieceId);
    }
    // Vedoucí hráč podle zbývajících kroků při vypršení limitu: jen orientační náhrada vítěze.
    let leader = null;
    if (game.winner === null) {
        let best = Infinity;
        for (const player of game.players) {
            const pips = calculatePlayerPips(game, player.id);
            if (pips < best) { best = pips; leader = player.id; }
        }
    }
    return { winner: game.winner, cutoff: game.winner === null, leader, turns: game.turnNumber, records };
}

/** Kandidát (deterministicky) proti soupeřům; sedadlo kandidáta se střídá. */
export function evaluateMatch({ candidate, opponent, setups, games, seedBase, maxTurns, useSurrogate = false }) {
    let wins = 0, decisive = 0, cutoffs = 0, expected = 0, variance = 0, surrogate = 0;
    for (let index = 0; index < games; index++) {
        const setup = setups[index % setups.length];
        const seat = Math.floor(index / setups.length) % setup.playerCount;
        const policies = Array.from({ length: setup.playerCount }, (_, id) =>
            id === seat ? { type: 'weights', weights: candidate, temperature: 0 } : opponent);
        const result = playGame({ setup, policies, seed: seedBase + index, maxTurns });
        let winner = result.winner;
        if (result.cutoff) {
            if (!useSurrogate) { cutoffs++; continue; }
            winner = result.leader;   // orientační: vedoucí podle zbývajících kroků
            surrogate++;
        }
        decisive++;
        if (winner === seat) wins++;
        const p = 1 / setup.playerCount;
        expected += p;
        variance += p * (1 - p);
    }
    const z = variance > 0 ? (wins - expected) / Math.sqrt(variance) : 0;
    return {
        games, decisive, cutoffs, wins, surrogate,
        winRate: decisive ? wins / decisive : 0,
        chanceRate: decisive ? expected / decisive : 0,
        z
    };
}

function adamStep(state, gradient, lr) {
    state.adam.t++;
    const { beta1, beta2, epsilon } = state.adam;
    const theta = state.weights.map((value, index) => (value - MIN[index]) / RANGE[index]);
    gradient.forEach((raw, index) => {
        const g = raw * RANGE[index];
        state.adam.m[index] = beta1 * state.adam.m[index] + (1 - beta1) * g;
        state.adam.v[index] = beta2 * state.adam.v[index] + (1 - beta2) * g * g;
        const mHat = state.adam.m[index] / (1 - beta1 ** state.adam.t);
        const vHat = state.adam.v[index] / (1 - beta2 ** state.adam.t);
        theta[index] += lr * mHat / (Math.sqrt(vHat) + epsilon);
    });
    state.weights = clampVector(theta.map((value, index) => MIN[index] + value * RANGE[index]));
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
    catch (error) {
        if (error.code === 'ENOENT') return null;
        throw new Error('Nelze načíst ' + path + ': ' + error.message);
    }
}

function parseArgs(argv) {
    const read = (name, fallback) => {
        const item = argv.find(value => value.startsWith('--' + name + '='));
        return item ? item.slice(name.length + 3) : fallback;
    };
    const number = (name, fallback, min, max) => {
        const value = Number(read(name, fallback));
        if (!Number.isFinite(value) || value < min || value > max) {
            throw new Error('Neplatná hodnota --' + name + ' (' + min + '–' + max + ').');
        }
        return value;
    };
    return {
        updates: number('updates', 60, 1, 100000),
        batch: number('batch', 16, 2, 500),
        learningRate: number('lr', 0.01, 0.0005, 0.2),
        temperature: number('temperature', 6, 0.5, 100),
        // Trénink jen na deskách 40 polí (2 a 4 hráči): partie na 48/80 polích jsou příliš dlouhé a skoro vždy skončí limitem.
        setups: ALL_SETUPS.slice(0, number('setups', 2, 1, 2)),
        maxTurns: number('max-turns', 1500, 100, 20000),
        evalEvery: number('eval-every', 20, 1, 100000),
        gateGames: number('gate-games', 120, 10, 5000),
        anchorGames: number('anchor-games', 80, 10, 5000),
        seed: number('seed', 20261110, 1, 2 ** 31),
        maxMinutes: number('max-minutes', 0, 0, 100000),
        checkpoint: read('checkpoint', 'artifacts/selfplay-checkpoint.json'),
        report: read('report', 'artifacts/selfplay-report.json'),
        resume: argv.includes('--resume')
    };
}

function evaluateAll(state, args, label) {
    const base = args.seed + 7000000 + state.step * 100;
    const common = { setups: args.setups, maxTurns: args.maxTurns };
    const vsChampion = evaluateMatch({
        ...common, candidate: state.weights, games: args.gateGames, seedBase: base,
        opponent: { type: 'weights', weights: state.champion, temperature: 0 }
    });
    const vsDefault = evaluateMatch({
        ...common, candidate: state.weights, games: args.anchorGames, seedBase: base + 50000,
        opponent: { type: 'weights', weights: DEFAULT_WEIGHTS, temperature: 0 }
    });
    const vsRandom = evaluateMatch({
        ...common, candidate: state.weights, games: Math.max(20, Math.floor(args.anchorGames / 2)),
        seedBase: base + 90000, opponent: { type: 'random' }
    });
    const promoted = vsChampion.decisive >= Math.max(30, Math.floor(args.gateGames * 0.8)) && vsChampion.z > 2.33;
    if (promoted) state.champion = [...state.weights];
    const record = {
        label, step: state.step, at: new Date().toISOString(), promoted,
        candidate: toObject(state.weights), vsChampion, vsDefault, vsRandom
    };
    state.evaluations.push(record);
    return record;
}

function buildReport(state, args, status) {
    const last = state.evaluations.at(-1) || null;
    return {
        schema: 'clovece-selfplay-report-v1',
        status,
        generatedAt: new Date().toISOString(),
        method: 'REINFORCE (Adam) over eighteen strategic weights; learner vs greedy champion; z-test gate',
        settings: { ...args, setups: args.setups },
        progress: { step: state.step, updates: args.updates, gamesPlayed: state.gamesPlayed, cutoffGames: state.cutoffGames },
        weights: { default: toObject(DEFAULT_WEIGHTS), candidate: toObject(state.weights), champion: toObject(state.champion) },
        latestEvaluation: last,
        evaluations: state.evaluations,
        history: state.history.slice(-200)
    };
}

async function save(args, state, status) {
    state.updatedAt = new Date().toISOString();
    await atomicWrite(args.report, JSON.stringify(buildReport(state, args, status), null, 2) + '\n');
    await atomicWrite(args.checkpoint, JSON.stringify(state, null, 2) + '\n');
}

export async function main(argv = process.argv.slice(2)) {
    const args = parseArgs(argv);
    let state = await readJson(args.checkpoint);
    if (state) {
        if (!args.resume) throw new Error('Checkpoint již existuje. Použij --resume; data nebyla přepsána.');
        if (state.format !== 'clovece-selfplay-checkpoint' || state.version !== 2 ||
            !Array.isArray(state.weights) || state.weights.length !== KEYS.length) {
            throw new Error('Checkpoint má neplatný formát; data nebyla přepsána.');
        }
    } else {
        if (args.resume) throw new Error('Checkpoint pro obnovu nebyl nalezen: ' + args.checkpoint);
        state = {
            format: 'clovece-selfplay-checkpoint', version: 2,
            createdAt: new Date().toISOString(), step: 0, gamesPlayed: 0, cutoffGames: 0,
            weights: [...DEFAULT_WEIGHTS], champion: [...DEFAULT_WEIGHTS],
            adam: { t: 0, m: Array(KEYS.length).fill(0), v: Array(KEYS.length).fill(0), beta1: 0.9, beta2: 0.999, epsilon: 1e-8 },
            history: [], evaluations: []
        };
    }

    if (state.step === 0 && !state.evaluations.length) {
        const first = evaluateAll(state, args, 'start');
        process.stdout.write('Základ: kandidát (= původní váhy) vs šampion ' + first.vsChampion.wins + '/' + first.vsChampion.decisive +
            ' (z ' + first.vsChampion.z.toFixed(2) + '), vs náhodný ' + (first.vsRandom.winRate * 100).toFixed(0) + ' %\n');
        await save(args, state, 'running');
    }

    const startedAt = Date.now();
    let lastEvalMinutes = 0;
    while (state.step < args.updates) {
        if (args.maxMinutes > 0 && (Date.now() - startedAt) / 60000 + 1.2 * lastEvalMinutes > args.maxMinutes) {
            process.stdout.write('Časový rozpočet vyčerpán, stav je uložen. Pokračuj s --resume.\n');
            return;
        }
        const gradient = Array(KEYS.length).fill(0);
        let decisions = 0, wins = 0, played = 0;
        for (let game = 0; game < args.batch; game++) {
            const index = state.step * args.batch + game;
            const setup = args.setups[index % args.setups.length];
            const seat = Math.floor(index / args.setups.length) % setup.playerCount;
            const policies = Array.from({ length: setup.playerCount }, (_, id) => id === seat
                ? { type: 'weights', weights: state.weights, temperature: args.temperature, record: true }
                : { type: 'weights', weights: state.champion, temperature: 0 });
            const result = playGame({ setup, policies, seed: args.seed + index, maxTurns: args.maxTurns });
            state.gamesPlayed++;
            if (result.cutoff) { state.cutoffGames++; continue; }
            played++;
            const won = result.winner === seat;
            if (won) wins++;
            const advantage = (won ? 1 : 0) - 1 / setup.playerCount;
            for (const record of result.records[seat]) {
                const mean = KEYS.map((_, k) => record.signals.reduce((s, row, b) => s + record.probabilities[b] * row[k], 0));
                for (let k = 0; k < KEYS.length; k++) {
                    gradient[k] += advantage * (record.signals[record.chosen][k] - mean[k]) / args.temperature;
                }
                decisions++;
            }
        }
        if (decisions > 0) adamStep(state, gradient.map(value => value / decisions), args.learningRate);
        state.step++;
        state.history.push({ step: state.step, games: played, wins, decisions, weights: toObject(state.weights) });
        process.stdout.write('Aktualizace ' + state.step + '/' + args.updates + ' | partie ' + played + ' | výhry učícího se ' + wins +
            ' | rozhodnutí ' + decisions + '\n');

        if (state.step % args.evalEvery === 0 || state.step === args.updates) {
            const evalStart = Date.now();
            const evaluation = evaluateAll(state, args, 'krok ' + state.step);
            lastEvalMinutes = (Date.now() - evalStart) / 60000;
            process.stdout.write('  Vyhodnocení: vs šampion ' + evaluation.vsChampion.wins + '/' + evaluation.vsChampion.decisive +
                ' (z ' + evaluation.vsChampion.z.toFixed(2) + (evaluation.promoted ? ', POVÝŠEN' : '') + ') | vs původní váhy ' +
                (evaluation.vsDefault.winRate * 100).toFixed(1) + ' % (šance ' + (evaluation.vsDefault.chanceRate * 100).toFixed(1) +
                ' %, z ' + evaluation.vsDefault.z.toFixed(2) + ') | vs náhodný ' + (evaluation.vsRandom.winRate * 100).toFixed(0) + ' %\n');
        }
        await save(args, state, state.step >= args.updates ? 'completed' : 'running');
    }
    process.stdout.write('Hotovo. Report: ' + args.report + '\n');
}

if (import.meta.url === new URL(process.argv[1], 'file://').href) {
    main().catch(error => { process.stderr.write((error?.stack || String(error)) + '\n'); process.exitCode = 1; });
}
