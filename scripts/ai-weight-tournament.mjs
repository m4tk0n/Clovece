#!/usr/bin/env node
/**
 * Nezávislý turnaj kandidátních taktických vah proti aktivní sadě.
 * Obě AI používají stejné produkční herní jádro, pravidla i sekvence hodů.
 * Kandidát střídá pozici hráče; testuje se na deskách 40, 48 a 80.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
    createGame, determineStartingPlayer, getValidMoves, movePiece, rollDice, advanceTurn
} from '../js/game-engine.js';
import { chooseTacticalTeacherDecision } from '../js/ai-strategy.js';

const args = Object.fromEntries(process.argv.slice(2).map(value => {
    const match = value.match(/^--([^=]+)=(.*)$/);
    return match ? [match[1], match[2]] : [value.replace(/^--/, ''), true];
}));
const candidatePath = path.resolve(String(args.candidate || 'artifacts/ai-tactical-weights-candidate.json'));
const baselinePath = path.resolve(String(args.baseline || 'config/ai-tactical-weights.json'));
const outputPath = path.resolve(String(args.output || 'artifacts/ai-weight-tournament-report.json'));
const gamesPerBoard = Math.max(20, Math.min(2000, Number(args['games-per-board']) || 120));
const maxActions = Math.max(1000, Number(args['max-actions']) || 20000);
const seed = Number.isFinite(Number(args.seed)) && args.seed !== undefined ? Number(args.seed) : 20261108;
const boards = [40, 48, 80];
const weightKeys = ['immediateWin', 'ownProgress', 'opponentSetback', 'threatReduction', 'captureOpponent', 'captureOwn', 'finishPiece'];

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function assertWeights(weights, label) {
    if (!weights || weightKeys.some(key => !Number.isFinite(Number(weights[key])))) {
        throw new Error(label + ': neplatná sada taktických vah.');
    }
    if (Number(weights.immediateWin) !== 100000) {
        throw new Error(label + ': immediateWin musí zůstat pevně 100000.');
    }
}
function sameWeights(a, b) {
    return weightKeys.every(key => Number(a?.[key]) === Number(b?.[key]));
}
function wilson(successes, total) {
    if (!total) return { lower: 0, upper: 0 };
    const z = 1.959963984540054;
    const p = successes / total;
    const denominator = 1 + z * z / total;
    const center = (p + z * z / (2 * total)) / denominator;
    const margin = z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total) / denominator;
    return {
        lower: Number(Math.max(0, center - margin).toFixed(4)),
        upper: Number(Math.min(1, center + margin).toFixed(4))
    };
}
function makeRandom(initialSeed) {
    let state = initialSeed >>> 0;
    return () => ((state = (1664525 * state + 1013904223) >>> 0) / 0x100000000);
}

const baselineConfig = readJson(baselinePath);
const candidateConfig = readJson(candidatePath);
const baseline = baselineConfig.weights;
const candidate = candidateConfig.weights;
assertWeights(baseline, 'Aktivní váhy');
assertWeights(candidate, 'Kandidát');
if (!sameWeights(candidateConfig.basedOnWeights, baseline)) {
    throw new Error('Kandidát vychází z jiné aktivní sady vah. Turnaj byl zastaven, aby nepřepsal novější verzi.');
}
if (sameWeights(candidate, baseline)) throw new Error('Kandidát je totožný s aktivní sadou vah.');

const dependencies = { getValidMoves, movePiece, rollDice };
const report = {
    format: 'clovece-ai-tactical-weight-tournament',
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    seed,
    gamesPerBoard,
    totalGamesRequested: gamesPerBoard * boards.length,
    gamesCompleted: 0,
    gamesTruncated: 0,
    invalidMoves: 0,
    baselineWeights: baseline,
    candidateWeights: candidate,
    delta: Object.fromEntries(weightKeys.map(key => [key, Number((candidate[key] - baseline[key]).toFixed(8))])),
    boards: {},
    overall: { candidateWins: 0, baselineWins: 0, candidateWinRate: 0, candidateWinRate95CI: { lower: 0, upper: 0 } },
    accepted: false,
    decision: 'not-evaluated'
};
let totalActions = 0;

for (let boardIndex = 0; boardIndex < boards.length; boardIndex++) {
    const boardSize = boards[boardIndex];
    const stats = {
        boardSize,
        playerCount: 2,
        gamesRequested: gamesPerBoard,
        gamesCompleted: 0,
        candidateWins: 0,
        baselineWins: 0,
        candidateWinRate: 0,
        candidateWinRate95CI: { lower: 0, upper: 0 },
        averageActions: 0,
        candidateWinsBySeat: [0, 0],
        baselineWinsBySeat: [0, 0]
    };
    let boardActions = 0;
    for (let gameIndex = 0; gameIndex < gamesPerBoard; gameIndex++) {
        const random = makeRandom(seed + boardIndex * 100000 + Math.floor(gameIndex / 2));
        const candidateSeat = gameIndex % 2;
        const game = createGame(1, 1, [], [], boardSize);
        game.players.forEach(player => { player.isAI = true; });
        determineStartingPlayer(game, () => Math.floor(random() * 6) + 1);
        let actions = 0;

        while (game.winner === null && actions < maxActions) {
            if (game.phase === 'roll') {
                const result = rollDice(game, Math.floor(random() * 6) + 1);
                if (result.retrying || result.turnEnded) continue;
                if (game.phase === 'no-move') {
                    advanceTurn(game);
                    continue;
                }
            }
            if (game.phase === 'no-move') {
                advanceTurn(game);
                continue;
            }
            if (game.phase !== 'move') throw new Error('Neočekávaná fáze hry: ' + game.phase);
            const legalMoves = getValidMoves(game);
            if (!legalMoves.length) {
                advanceTurn(game);
                continue;
            }
            const isCandidate = game.currentPlayer === candidateSeat;
            const decision = chooseTacticalTeacherDecision(game, dependencies, isCandidate ? candidate : baseline);
            if (!decision || !legalMoves.includes(decision.pieceId)) {
                report.invalidMoves++;
                throw new Error('AI zvolila nelegální tah; turnaj je neplatný.');
            }
            movePiece(game, decision.pieceId);
            actions++;
        }

        if (game.winner === null) {
            stats.gamesTruncated++;
            report.gamesTruncated++;
            continue;
        }
        stats.gamesCompleted++;
        report.gamesCompleted++;
        if (game.winner === candidateSeat) {
            stats.candidateWins++;
            stats.candidateWinsBySeat[candidateSeat]++;
            report.overall.candidateWins++;
        } else {
            stats.baselineWins++;
            stats.baselineWinsBySeat[candidateSeat]++;
            report.overall.baselineWins++;
        }
        boardActions += actions;
        totalActions += actions;
    }
    stats.candidateWinRate = stats.gamesCompleted
        ? Number((stats.candidateWins / stats.gamesCompleted).toFixed(4)) : 0;
    stats.candidateWinRate95CI = wilson(stats.candidateWins, stats.gamesCompleted);
    stats.averageActions = stats.gamesCompleted
        ? Number((boardActions / stats.gamesCompleted).toFixed(2)) : 0;
    report.boards[String(boardSize)] = stats;
}

const completed = report.gamesCompleted;
report.overall.candidateWinRate = completed
    ? Number((report.overall.candidateWins / completed).toFixed(4)) : 0;
report.overall.candidateWinRate95CI = wilson(report.overall.candidateWins, completed);
report.averageActions = completed ? Number((totalActions / completed).toFixed(2)) : 0;

const boardResults = Object.values(report.boards);
const everyBoardHasCoverage = boardResults.every(item => item.gamesCompleted === gamesPerBoard);
const noBoardRegression = boardResults.every(item => item.candidateWinRate >= 0.45);
const statisticallyBetter = completed >= 300 && report.overall.candidateWinRate95CI.lower > 0.5;
report.accepted = everyBoardHasCoverage && report.invalidMoves === 0 &&
    report.gamesTruncated === 0 && noBoardRegression && statisticallyBetter;
report.decision = report.accepted
    ? 'ACCEPTED: kandidát má statisticky průkaznou výhodu nad 50 % a neklesl pod 45 % na žádné desce.'
    : 'REJECTED: kandidát nesplnil statistickou hranici, pokrytí všech desek nebo ochranu proti regresi.';
report.safeguards = {
    sameProductionEngineAndRules: true,
    sameDiceSeedWithinSeatPair: true,
    candidateSeatAlternated: true,
    boards: [40, 48, 80],
    twoPlayerHeadToHead: true,
    minimumOverallGames: 300,
    overallWilson95LowerBoundMustExceed: 0.5,
    minimumWinRateOnEveryBoard: 0.45,
    noTruncatedGames: true,
    noInvalidMoves: true
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
if (!report.accepted) process.exitCode = 2;
