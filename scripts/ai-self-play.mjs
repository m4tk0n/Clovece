#!/usr/bin/env node
/**
 * Automatický self-play sběr zkušeností. Používá výhradně produkční herní engine.
 * Záměrně zatím neexportuje ani nezapíná neuronový model.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
    createGame, determineStartingPlayer, getValidMoves, movePiece, rollDice, advanceTurn
} from '../js/game-engine.js';
import { chooseTacticalTeacherDecision, calculateAIMoveProbabilityFeatures } from '../js/ai-strategy.js';
import { AI_FEATURE_COUNT, AI_FEATURE_SCHEMA_VERSION, extractAIMoveFeatures } from '../js/ai-neural-network.js';

const args = Object.fromEntries(process.argv.slice(2).map(value => {
    const match = value.match(/^--([^=]+)=(.*)$/);
    return match ? [match[1], match[2]] : [value.replace(/^--/, ''), true];
}));
const games = Math.max(1, Math.min(10000, Number(args.games) || 100));
const playerCount = Number(args.players) || 4;
const boardSize = Number(args.board) || (playerCount <= 4 ? 40 : playerCount <= 6 ? 48 : 80);
const seed = Number(args.seed) || 20261108;
const output = String(args.output || 'artifacts/ai-self-play.jsonl');
const metricsOutput = String(args.metrics || 'artifacts/ai-self-play-metrics.json');
const maxActions = Math.max(1000, Number(args['max-actions']) || 20000);
const allowedBoards = { 40: 4, 48: 6, 80: 8 };
if (playerCount < 2 || playerCount > 8 || !allowedBoards[boardSize] || playerCount > allowedBoards[boardSize]) {
    throw new Error('Nepovolená kombinace hráčů a desky. 40: 2–4, 48: 2–6, 80: 2–8.');
}

function makeRandom(initialSeed) {
    let state = initialSeed >>> 0;
    return () => {
        state = (1664525 * state + 1013904223) >>> 0;
        return state / 0x100000000;
    };
}
function progress(game, playerId) {
    return game.pieces[playerId].pieces.reduce((sum, piece) => {
        if (piece.steps < 0) return sum;
        return sum + Math.min(game.trackLength + 3, piece.steps + 1);
    }, 0);
}
function rankPlayers(game) {
    return game.players.map(player => ({
        playerId: player.id,
        finishedPieces: game.pieces[player.id].pieces.filter(piece => piece.steps === game.trackLength + 3).length,
        progress: progress(game, player.id),
        rank: 0
    })).sort((a, b) =>
        b.finishedPieces - a.finishedPieces || b.progress - a.progress || a.playerId - b.playerId
    ).map((entry, index) => ({ ...entry, rank: index + 1 }));
}

const dependencies = { getValidMoves, movePiece, rollDice };
const allSamples = [];
const summary = {
    format: 'clovece-ai-self-play-report',
    formatVersion: 1,
    featureSchemaVersion: AI_FEATURE_SCHEMA_VERSION,
    featureCount: AI_FEATURE_COUNT,
    createdAt: new Date().toISOString(),
    seed,
    gamesRequested: games,
    gamesCompleted: 0,
    gamesTruncated: 0,
    playerCount,
    boardSize,
    decisions: 0,
    winsByPlayer: Array(playerCount).fill(0),
    averageActions: 0,
    averageGameTurns: 0,
    placements: Array(playerCount).fill(0)
};
let totalActions = 0;
let totalTurns = 0;

for (let gameIndex = 0; gameIndex < games; gameIndex++) {
    const random = makeRandom(seed + gameIndex);
    const game = createGame(1, playerCount - 1, [], [], boardSize);
    game.players.forEach(player => { player.isAI = true; });
    determineStartingPlayer(game, () => Math.floor(random() * 6) + 1);
    const gameSamples = [];
    let actions = 0;

    while (game.winner === null && actions < maxActions) {
        if (game.phase === 'roll') {
            const result = rollDice(game, Math.floor(random() * 6) + 1);
            if (result.retrying) continue;
            if (result.turnEnded) continue;
            if (game.phase === 'no-move') {
                advanceTurn(game);
                continue;
            }
        }
        if (game.phase === 'no-move') {
            advanceTurn(game);
            continue;
        }
        if (game.phase !== 'move') {
            throw new Error('Neočekávaná fáze hry: ' + game.phase);
        }

        const legalMoves = getValidMoves(game);
        if (!legalMoves.length) {
            advanceTurn(game);
            continue;
        }
        const candidates = legalMoves.map(pieceId => {
            const state = structuredClone(game);
            const move = movePiece(state, pieceId);
            return { pieceId, move, state, winningMove: state.winner === game.currentPlayer };
        });
        const decision = chooseTacticalTeacherDecision(game, dependencies);
        if (!decision || !legalMoves.includes(decision.pieceId)) {
            throw new Error('AI vrátila tah mimo seznam legálních tahů.');
        }
        const selected = candidates.find(candidate => candidate.pieceId === decision.pieceId);
        gameSamples.push({
            gameId: String(seed) + '-' + (gameIndex + 1),
            playerCount,
            boardSize,
            turnNumber: game.turnNumber,
            playerId: game.currentPlayer,
            diceValue: game.diceValue,
            legalMoveCount: legalMoves.length,
            candidates: candidates.map(candidate => {
                const teacher = decision.ranking.find(item => item.pieceId === candidate.pieceId);
                return {
                    pieceId: candidate.pieceId,
                    features: extractAIMoveFeatures(game, {
                        ...candidate,
                        probabilityFeatures: calculateAIMoveProbabilityFeatures(game, candidate, dependencies),
                        tacticalFeatures: teacher?.factors
                    }, legalMoves.length),
                    teacherScore: teacher?.score ?? null,
                    teacherFactors: teacher?.factors ?? null
                };
            }),
            selectedPieceId: decision.pieceId,
            selectedFeatures: extractAIMoveFeatures(game, {
                ...selected,
                probabilityFeatures: calculateAIMoveProbabilityFeatures(game, selected, dependencies),
                tacticalFeatures: decision.ranking.find(item => item.pieceId === selected.pieceId)?.factors
            }, legalMoves.length),
            selection: decision.reason,
            teacherRanking: decision.ranking
        });
        movePiece(game, decision.pieceId);
        actions++;
    }

    const completed = game.winner !== null;
    if (completed) {
        summary.gamesCompleted++;
        summary.winsByPlayer[game.winner]++;
    } else {
        summary.gamesTruncated++;
    }
    const rankings = rankPlayers(game);
    if (completed) rankings.forEach(item => { summary.placements[item.rank - 1]++; });
    const rankByPlayer = new Map(rankings.map(item => [item.playerId, item.rank]));
    for (const sample of gameSamples) {
        sample.completed = completed;
        sample.winner = game.winner;
        sample.finalRank = rankByPlayer.get(sample.playerId);
        sample.reward = completed
            ? (sample.finalRank === 1 ? 1 : -((sample.finalRank - 1) / Math.max(1, playerCount - 1)))
            : null;
        allSamples.push(sample);
    }
    totalActions += actions;
    totalTurns += game.turnNumber;
    if ((gameIndex + 1) % 25 === 0 || gameIndex + 1 === games) {
        process.stdout.write('Odehráno ' + (gameIndex + 1) + '/' + games + ' her; dokončeno ' +
            summary.gamesCompleted + ', nedokončeno ' + summary.gamesTruncated + '\n');
    }
}

summary.decisions = allSamples.length;
summary.averageActions = games ? Number((totalActions / games).toFixed(2)) : 0;
summary.averageGameTurns = games ? Number((totalTurns / games).toFixed(2)) : 0;
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.mkdirSync(path.dirname(metricsOutput), { recursive: true });
fs.writeFileSync(output, allSamples.map(sample => JSON.stringify(sample)).join('\n') + (allSamples.length ? '\n' : ''));
fs.writeFileSync(metricsOutput, JSON.stringify(summary, null, 2) + '\n');
process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
