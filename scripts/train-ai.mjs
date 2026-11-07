#!/usr/bin/env node
/**
 * Offline self-play tournament for tuning the MCTS search budget/exploration.
 * It never edits production parameters. The best candidate is only a report.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import {
    createGame,
    rollDice,
    getValidMoves,
    movePiece,
    advanceTurn,
    chooseAIMove,
    chooseAIMoveMonteCarlo
} from '../js/game-engine.js';
import { calculatePlayerPips } from '../js/ai-strategy.js';

function arg(name, fallback) {
    const prefix = '--' + name + '=';
    const value = process.argv.find(item => item.startsWith(prefix));
    return value ? Number(value.slice(prefix.length)) : fallback;
}

function randomFor(seed) {
    let state = seed >>> 0 || 1;
    return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
    };
}

function playGame({ playerCount, boardSize, candidate, seed, maxTurns }) {
    const random = randomFor(seed);
    const game = createGame(1, playerCount - 1, [], [], boardSize);
    const candidateSeat = seed % playerCount;
    game.currentPlayer = 0;
    const dependencies = { getValidMoves, movePiece, rollDice, advanceTurn, calculatePlayerPips };

    while (game.winner === null && game.turnNumber <= maxTurns) {
        if (game.phase === 'roll') {
            const result = rollDice(game, 1 + Math.floor(random() * 6));
            if (!result.turnEnded && game.phase === 'no-move') advanceTurn(game);
            continue;
        }

        if (game.phase === 'no-move') {
            advanceTurn(game);
            continue;
        }

        if (game.phase === 'move') {
            const pieceId = game.currentPlayer === candidateSeat
                ? chooseAIMoveMonteCarlo(game, {
                    simulations: candidate.simulations,
                    exploration: candidate.exploration,
                    maxPlayoutTurns: 100,
                    seed: seed + game.turnNumber * 17 + game.currentPlayer
                })
                : chooseAIMove(game, 'medium');
            if (pieceId === null || pieceId === undefined ||
                !getValidMoves(game).includes(pieceId)) {
                throw new Error('AI returned an illegal move in self-play: ' + pieceId);
            }
            movePiece(game, pieceId);
            continue;
        }

        throw new Error('Unexpected game phase: ' + game.phase);
    }

    return {
        winner: game.winner,
        candidateSeat,
        turns: game.turnNumber,
        candidateWon: game.winner === candidateSeat,
        cutoff: game.winner === null
    };
}

async function main() {
    const gamesPerSetup = Math.max(1, Math.min(1000, Math.floor(arg('games', 2))));
    const simulations = Math.max(8, Math.min(1000, Math.floor(arg('simulations', 32))));
    const maxTurns = Math.max(100, Math.min(10000, Math.floor(arg('max-turns', 1800))));
    const playerSetups = [
        { playerCount: 2, boardSize: 40 },
        { playerCount: 4, boardSize: 40 },
        { playerCount: 6, boardSize: 48 },
        { playerCount: 8, boardSize: 80 }
    ];
    const candidates = [0.7, Math.SQRT2, 2.2].map(exploration => ({
        simulations,
        exploration
    }));
    const results = [];

    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
        const candidate = candidates[candidateIndex];
        const summary = {
            ...candidate,
            games: 0,
            wins: 0,
            losses: 0,
            cutoffs: 0,
            totalTurns: 0,
            bySetup: []
        };

        for (let setupIndex = 0; setupIndex < playerSetups.length; setupIndex++) {
            const setup = playerSetups[setupIndex];
            let wins = 0;
            let losses = 0;
            let cutoffs = 0;
            let totalTurns = 0;

            for (let gameIndex = 0; gameIndex < gamesPerSetup; gameIndex++) {
                const seed = 20261107 + candidateIndex * 100000 +
                    setupIndex * 1000 + gameIndex;
                const result = playGame({
                    ...setup,
                    candidate,
                    seed,
                    maxTurns
                });
                wins += result.candidateWon ? 1 : 0;
                losses += result.winner !== null && !result.candidateWon ? 1 : 0;
                cutoffs += result.cutoff ? 1 : 0;
                totalTurns += result.turns;
            }

            summary.games += gamesPerSetup;
            summary.wins += wins;
            summary.losses += losses;
            summary.cutoffs += cutoffs;
            summary.totalTurns += totalTurns;
            summary.bySetup.push({
                ...setup,
                games: gamesPerSetup,
                wins,
                losses,
                cutoffs,
                averageTurns: totalTurns / gamesPerSetup
            });
        }

        summary.winRate = summary.wins / Math.max(1, summary.games - summary.cutoffs);
        summary.averageTurns = summary.totalTurns / summary.games;
        results.push(summary);
        process.stdout.write(
            'UCT c=' + candidate.exploration.toFixed(3) +
            ': ' + summary.wins + ' výher / ' + summary.games +
            ' her, nedohráno ' + summary.cutoffs + '\\n'
        );
    }

    results.sort((a, b) =>
        (b.wins / Math.max(1, b.games - b.cutoffs)) -
        (a.wins / Math.max(1, a.games - a.cutoffs))
    );
    const report = {
        generatedAt: new Date().toISOString(),
        method: 'MCTS UCT parameter tournament against fixed medium-AI baseline',
        note: 'Small exploratory sample; do not promote a candidate without a larger independent validation tournament.',
        settings: { gamesPerSetup, simulations, maxTurns, playerSetups },
        bestCandidate: results[0],
        candidates: results
    };

    await mkdir('artifacts', { recursive: true });
    await writeFile('artifacts/ai-training-report.json', JSON.stringify(report, null, 2) + '\\n');
    process.stdout.write('Nejlepší kandidát: UCT c=' +
        results[0].exploration.toFixed(3) +
        '. Report: artifacts/ai-training-report.json\\n');
}

main().catch(error => {
    process.stderr.write((error?.stack || String(error)) + '\\n');
    process.exitCode = 1;
});
