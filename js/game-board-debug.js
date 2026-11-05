/**
 * Výpočet tras legálních tahů pro vizualizaci v debug režimu.
 * Herní pravidla ani stav hry nemění.
 */
import { getValidMoves } from './game-engine.js';
import { geometry, slotOf, armPoint, laneRadius, trackPosition } from './game-board-geometry.js';

export function buildDebugMovePaths(game, style = 'classic') {
    if (!game || game.phase !== 'move') return [];
    const g = geometry(game, style);
    return getValidMoves(game).map(pieceId => {
        const playerId = game.currentPlayer;
        const player = game.players[playerId];
        const piece = game.pieces[playerId].pieces[pieceId];
        const points = [];

        // Nasazení ze základny končí přímo na vlastním startovním poli.
        if (piece.steps < 0) {
            const point = trackPosition(player.start, game, style);
            points.push({ x: point.x, y: point.y, number: 1, field: player.start + 1, lane: null });
        } else {
            for (let step = 1; step <= game.diceValue; step++) {
                const nextSteps = piece.steps + step;
                if (nextSteps < game.trackLength) {
                    const field = (player.start + nextSteps) % game.trackLength;
                    const point = trackPosition(field, game, style);
                    points.push({ x: point.x, y: point.y, number: step, field: field + 1, lane: null });
                } else {
                    const lane = nextSteps - game.trackLength;
                    const point = armPoint(slotOf(player, game), g.n, laneRadius(g, lane), 0);
                    points.push({ x: point.x, y: point.y, number: step, field: null, lane: lane + 1 });
                }
            }
        }

        return { playerId, pieceId, color: player.color, points };
    });
}
