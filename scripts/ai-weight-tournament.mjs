#!/usr/bin/env node
/**
 * Turnaj kandidátních taktických vah proti kopiím aktivní AI.
 * Používá produkční herní jádro a ověřuje všechny aktivní kombinace 40/4, 48/6 a 80/8.
 * Kandidát střídá všechna hráčská místa; každá partie má vlastní seed.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
    createGame, determineStartingPlayer, getValidMoves, movePiece, rollDice, advanceTurn
} from '../js/game-engine.js';
import { chooseTacticalTeacherDecision } from '../js/ai-strategy.js';
import { chooseStrategicDecision as chooseOriginalStrategicDecision } from '../js/ai-original-baseline.js';

const args = Object.fromEntries(process.argv.slice(2).map(value => {
    const match = value.match(/^--([^=]+)=(.*)$/);
    return match ? [match[1], match[2]] : [value.replace(/^--/, ''), true];
}));
const candidatePath = path.resolve(String(args.candidate || 'artifacts/ai-tactical-weights-candidate.json'));
const baselinePath = path.resolve(String(args.baseline || 'config/ai-tactical-weights.json'));
const originalBaselinePath = path.resolve(String(args['original-baseline'] || 'config/ai-original-baseline.json'));
const outputPath = path.resolve(String(args.output || 'artifacts/ai-weight-tournament-report.json'));
const gamesPerBoard = Math.max(24, Math.min(2000, Number(args['games-per-board']) || 120));
const maxActions = Math.max(1000, Number(args['max-actions']) || 20000);
const seed = Number.isFinite(Number(args.seed)) && args.seed !== undefined ? Number(args.seed) : 20261108;
const boards = [
    { boardSize: 40, playerCount: 4 },
    { boardSize: 48, playerCount: 6 },
    { boardSize: 80, playerCount: 8 }
];
const weightKeys = ['progressToGoal', 'finishPiece', 'captureOpponent', 'protectOwn', 'threatenOpponent', 'deployPiece', 'homeProgress', 'bonusContinuation', 'startFieldRisk', 'flexibility'];

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function assertWeights(weights, label) {
    if (!weights || weightKeys.some(key => !Number.isFinite(Number(weights[key])))) {
        throw new Error(label + ': neplatná sada taktických vah.');
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

const activeConfig = readJson(baselinePath);
const originalConfig = readJson(originalBaselinePath);
const candidateConfig = readJson(candidatePath);
const activeWeights = activeConfig.weights;
const originalWeights = originalConfig.weights;
const candidate = candidateConfig.weights;
assertWeights(activeWeights, 'Aktivní deset vah');
assertWeights(candidate, 'Kandidát');
if (!originalWeights || !Number.isFinite(Number(originalWeights.immediateWin)) ||
    ['ownProgress','opponentSetback','threatReduction','captureOpponent','captureOwn','finishPiece','deployPiece','enterHome','homeProgress'].some(key => !Number.isFinite(Number(originalWeights[key])))) {
    throw new Error('Původní AI baseline nemá úplnou devítiváhovou konfiguraci.');
}
if (!sameWeights(candidateConfig.basedOnWeights, activeWeights)) {
    throw new Error('Kandidát vychází z jiné aktivní sady vah. Turnaj byl zastaven, aby nepřepsal novější verzi.');
}
if (sameWeights(candidate, activeWeights)) throw new Error('Kandidát je totožný s aktivní sadou vah.');

const dependencies = { getValidMoves, movePiece, rollDice };
const report = {
    format: 'clovece-ai-tactical-weight-tournament',
    formatVersion: 3,
    createdAt: new Date().toISOString(),
    seed,
    gamesPerBoard,
    totalGamesRequested: gamesPerBoard * boards.length,
    gamesCompleted: 0,
    gamesTruncated: 0,
    invalidMoves: 0,
    baselineType: 'original-1000-weight-ai-snapshot',
    baselineSourceCommit: originalConfig.sourceCommit || null,
    baselineWeights: originalWeights,
    activeWeights,
    candidateWeights: candidate,
    delta: Object.fromEntries(weightKeys.map(key => [key, Number((candidate[key] - activeWeights[key]).toFixed(8))])),
    boards: {},
    overall: {
        candidateWins: 0,
        baselineWins: 0,
        candidateWinRate: 0,
        candidateWinRate95CI: { lower: 0, upper: 0 },
        expectedRandomWinRate: boards.reduce((sum, item) => sum + 1 / item.playerCount, 0) / boards.length
    },
    accepted: false,
    decision: 'not-evaluated'
};
let totalActions = 0;

for (let boardIndex = 0; boardIndex < boards.length; boardIndex++) {
    const { boardSize, playerCount } = boards[boardIndex];
    const stats = {
        boardSize,
        playerCount,
        gamesRequested: gamesPerBoard,
        gamesCompleted: 0,
        gamesTruncated: 0,
        candidateWins: 0,
        baselineWins: 0,
        candidateWinRate: 0,
        candidateWinRate95CI: { lower: 0, upper: 0 },
        expectedRandomWinRate: Number((1 / playerCount).toFixed(4)),
        averageActions: 0,
        candidateWinsBySeat: Array(playerCount).fill(0),
        baselineWinsBySeat: Array(playerCount).fill(0)
    };
    let boardActions = 0;
    for (let gameIndex = 0; gameIndex < gamesPerBoard; gameIndex++) {
        const random = makeRandom(seed + boardIndex * 100000 + gameIndex);
        const candidateSeat = gameIndex % playerCount;
        const game = createGame(1, playerCount - 1, [], [], boardSize);
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
            const decision = isCandidate
                ? chooseTacticalTeacherDecision(game, dependencies, candidate)
                : chooseOriginalStrategicDecision(game, dependencies, 'medium', () => 0.999999, {}, null);
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
const betterOnEveryBoard = boardResults.every(item =>
    item.candidateWinRate95CI.lower > item.expectedRandomWinRate
);
const statisticallyBetter = completed === gamesPerBoard * boards.length && betterOnEveryBoard;
report.accepted = everyBoardHasCoverage && report.invalidMoves === 0 &&
    report.gamesTruncated === 0 && statisticallyBetter;
report.decision = report.accepted
    ? 'ACCEPTED: desetiváhová AI statisticky překonala původní 1000-váhovou AI na všech třech podporovaných kombinacích.'
    : 'REJECTED: kandidát nesplnil statistickou hranici na každé kombinaci, pokrytí všech her nebo ochranu proti neplatným a nedokončeným partiím.';
report.safeguards = {
    sameProductionEngineAndRules: true,
    independentDiceSeedPerGame: true,
    candidateSeatRotatedAcrossAllPlayers: true,
    boardConfigurations: boards,
    baselineOpponentsPerGame: [3, 5, 7],
    originalAIBaseline: true,
    originalBaselineSourceCommit: originalConfig.sourceCommit || null,
    candidateUsesTenNamedWeights: true,
    overallMinimumGames: gamesPerBoard * boards.length,
    wilson95LowerBoundMustExceedRandomWinRateOnEveryBoard: true,
    noTruncatedGames: true,
    noInvalidMoves: true
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n');
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
if (!report.accepted) process.exitCode = 2;
