#!/usr/bin/env node
/**
 * Turnaj kandidátní neuronové AI proti taktickému učiteli.
 * Kandidát hraje vždy jen na jednom místě; jeho pozice se mezi hrami rotuje.
 * Skript používá výhradně produkční herní engine a legální tahy.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
    createGame, determineStartingPlayer, getValidMoves, movePiece, rollDice, advanceTurn
} from '../js/game-engine.js';
import { chooseTacticalTeacherDecision, chooseStrategicDecision } from '../js/ai-strategy.js';
import { AI_FEATURE_COUNT, AI_FEATURE_SCHEMA_VERSION, isValidAINeuralModel } from '../js/ai-neural-network.js';

const args = Object.fromEntries(process.argv.slice(2).map(value => {
    const match = value.match(/^--([^=]+)=(.*)$/);
    return match ? [match[1], match[2]] : [value.replace(/^--/, ''), true];
}));
const games = Math.max(1, Math.min(10000, Number(args.games) || 200));
const playerCount = Math.max(2, Math.min(8, Number(args.players) || 4));
const boardSize = Number(args.board) || (playerCount <= 4 ? 40 : playerCount <= 6 ? 48 : 80);
const seed = Number(args.seed) || 20261108;
const maxActions = Math.max(1000, Number(args['max-actions']) || 20000);
const modelPath = path.resolve(String(args.model || 'artifacts/ludo-ai-candidate.js'));
const allowedBoards = { 40: 4, 48: 6, 80: 8 };
if (!allowedBoards[boardSize] || playerCount > allowedBoards[boardSize]) {
    throw new Error('Nepovolená kombinace hráčů a desky.');
}
if (!fs.existsSync(modelPath)) throw new Error('Soubor kandidátního modelu nebyl nalezen: ' + modelPath);
const imported = await import(pathToFileURL(modelPath).href + '?tournament=' + Date.now());
const model = imported.default;
if (!isValidAINeuralModel(model)) {
    throw new Error('Kandidátní model neodpovídá vstupnímu schématu v' + AI_FEATURE_SCHEMA_VERSION +
        ' (' + AI_FEATURE_COUNT + ' příznaků) nebo není povolen.');
}

function makeRandom(initialSeed) {
    let state = initialSeed >>> 0;
    return () => ((state = (1664525 * state + 1013904223) >>> 0) / 0x100000000);
}
function wilson(successes, total) {
    if (!total) return { lower: 0, upper: 0 };
    const z = 1.959963984540054;
    const p = successes / total;
    const denominator = 1 + z * z / total;
    const center = (p + z * z / (2 * total)) / denominator;
    const margin = z * Math.sqrt((p * (1 - p) + z * z / (4 * total)) / total) / denominator;
    return { lower: Number(Math.max(0, center - margin).toFixed(4)), upper: Number(Math.min(1, center + margin).toFixed(4)) };
}
const dependencies = { getValidMoves, movePiece, rollDice };
const summary = {
    format: 'clovece-ai-tournament-report',
    formatVersion: 1,
    featureSchemaVersion: AI_FEATURE_SCHEMA_VERSION,
    featureCount: AI_FEATURE_COUNT,
    modelPath,
    gamesRequested: games,
    gamesCompleted: 0,
    gamesTruncated: 0,
    playerCount,
    boardSize,
    seed,
    candidateWins: 0,
    candidatePlacements: Array(playerCount).fill(0),
    teacherWins: 0,
    candidateAverageRank: null,
    candidateWinRate: 0,
    candidateWinRate95CI: { lower: 0, upper: 0 },
    teacherWinRatePerOpponentSeat: 0,
    candidateBeatsUniformBaseline: false,
    invalidMoves: 0,
    averageActions: 0
};
let totalActions = 0;
let totalCandidateRank = 0;

for (let gameIndex = 0; gameIndex < games; gameIndex++) {
    const random = makeRandom(seed + gameIndex);
    const game = createGame(1, playerCount - 1, [], [], boardSize);
    game.players.forEach(player => { player.isAI = true; });
    const candidateSeat = gameIndex % playerCount;
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

        const decision = game.currentPlayer === candidateSeat
            ? chooseStrategicDecision(game, dependencies, 'hard', random, {}, model)
            : chooseTacticalTeacherDecision(game, dependencies);
        if (!decision || !legalMoves.includes(decision.pieceId)) {
            summary.invalidMoves++;
            throw new Error('AI zvolila tah mimo seznam legálních tahů.');
        }
        movePiece(game, decision.pieceId);
        actions++;
    }

    const completed = game.winner !== null;
    if (!completed) {
        summary.gamesTruncated++;
        continue;
    }
    summary.gamesCompleted++;
    if (game.winner === candidateSeat) summary.candidateWins++;
    else summary.teacherWins++;

    const candidatePieces = game.pieces[candidateSeat].pieces;
    const candidateFinished = candidatePieces.filter(piece => piece.steps === game.trackLength + 3).length;
    const ranks = game.players.map(player => ({
        playerId: player.id,
        finished: game.pieces[player.id].pieces.filter(piece => piece.steps === game.trackLength + 3).length,
        progress: game.pieces[player.id].pieces.reduce((sum, piece) =>
            piece.steps < 0 ? sum : sum + Math.min(game.trackLength + 3, piece.steps + 1), 0)
    })).sort((a, b) => b.finished - a.finished || b.progress - a.progress || a.playerId - b.playerId);
    const candidateRank = ranks.findIndex(item => item.playerId === candidateSeat) + 1;
    summary.candidatePlacements[candidateRank - 1]++;
    totalCandidateRank += candidateRank;
    totalActions += actions;
}
summary.candidateAverageRank = summary.gamesCompleted
    ? Number((totalCandidateRank / summary.gamesCompleted).toFixed(3))
    : null;
summary.candidateWinRate = summary.gamesCompleted
    ? Number((summary.candidateWins / summary.gamesCompleted).toFixed(4))
    : 0;
summary.candidateWinRate95CI = wilson(summary.candidateWins, summary.gamesCompleted);
summary.teacherWinRatePerOpponentSeat = summary.gamesCompleted
    ? Number((summary.teacherWins / (summary.gamesCompleted * (playerCount - 1))).toFixed(4))
    : 0;
summary.candidateBeatsUniformBaseline = summary.gamesCompleted >= 200 &&
    summary.candidateWinRate95CI.lower > (1 / playerCount);
summary.averageActions = summary.gamesCompleted
    ? Number((totalActions / summary.gamesCompleted).toFixed(2))
    : 0;

const output = path.resolve(String(args.output || 'artifacts/ai-tournament-metrics.json'));
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(summary, null, 2) + '\\n');
process.stdout.write(JSON.stringify(summary, null, 2) + '\\n');
if (summary.gamesTruncated > 0 || summary.invalidMoves > 0) {
    throw new Error('Turnaj není kompletní; neúplné hry: ' + summary.gamesTruncated +
        ', neplatné tahy: ' + summary.invalidMoves);
}
