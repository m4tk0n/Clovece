/**
 * Převod neměnného herního stavu na neutrální data desky.
 * Bez DOM, rendererů, úložiště a vedlejších účinků.
 */
import { getPiecePosition, getHomeLaneIndex, getValidMoves } from './game-engine.js';
import { CENTER, geometry, slotOf, slotAngle, polar, armPoint, laneRadius, trackPosition } from './game-board-geometry.js';

export function buildBoardSceneData(game, style = 'classic') {
    const g = geometry(game, style);
    const m = game.trackLength / g.n;
    const playersBySlot = new Map(game.players.map(player => [slotOf(player, game), player]));
    const track = Array.from({ length: game.trackLength }, (_, index) => {
        const position = trackPosition(index, game, style);
        const player = game.players.find(item => item.start === index);
        const emptyStart = !player && index % m === m / 2;
        return {
            index, x: position.x - CENTER, z: position.y - CENTER,
            radius: player ? g.field + 2 : g.field,
            color: player ? player.color : (emptyStart ? '#c6a96b' : '#d9d2c3'),
            opacity: player ? .95 : (emptyStart ? .4 : .12),
            start: Boolean(player)
        };
    });
    const lanes = Array.from({ length: g.n }, (_, slot) => {
        const player = playersBySlot.get(slot);
        return {
            slot, color: player?.color || '#c6a96b', occupied: Boolean(player),
            cells: Array.from({ length: 4 }, (_, lane) => {
                const p = armPoint(slot, g.n, laneRadius(g, lane), 0);
                return { x: p.x - CENTER, z: p.y - CENTER, radius: g.field + 1 };
            })
        };
    });
    const bases = game.players.map(player => {
        const slot = slotOf(player, game);
        const angle = slotAngle(slot, g.n) + Math.PI / g.n;
        const center = polar(angle, g.baseDist);
        const offset = g.base * .4;
        const offsets = [[-offset,-offset],[offset,-offset],[-offset,offset],[offset,offset]];
        return {
            playerId: player.id, color: player.color,
            x: center.x - CENTER, z: center.y - CENTER, radius: g.base,
            pieces: game.pieces[player.id].pieces
                .filter(piece => piece.steps === -1)
                .map(piece => ({
                    playerId: player.id, pieceId: piece.id,
                    x: center.x + offsets[piece.id][0] - CENTER,
                    z: center.y + offsets[piece.id][1] - CENTER,
                    color: player.color,
                    selectable: game.currentPlayer === player.id && getValidMoves(game).includes(piece.id)
                }))
        };
    });
    const validMoves = new Set(getValidMoves(game));
    const allPieces = game.players.flatMap(player => game.pieces[player.id].pieces
        .filter(piece => piece.steps >= 0 && piece.steps <= game.trackLength + 4)
        .map(piece => ({ player, piece })));
    const pieces = [];
    for (const { player, piece } of allPieces) {
        const slot = slotOf(player, game);
        let position;
        if (piece.steps <= game.trackLength) {
            const logicalPosition = getPiecePosition(game, player.id, piece);
            position = trackPosition(logicalPosition, game, style);
        } else {
            const laneIndex = Math.min(3, getHomeLaneIndex(game, piece));
            position = armPoint(slot, g.n, laneRadius(g, laneIndex), 0);
        }
        let stackIndex = 0;
        let stackCount = 1;
        if (piece.steps <= game.trackLength) {
            const logicalPosition = getPiecePosition(game, player.id, piece);
            const stack = allPieces.filter(item => item.piece.steps <= game.trackLength &&
                getPiecePosition(game, item.player.id, item.piece) === logicalPosition);
            stackIndex = stack.findIndex(item => item.player.id === player.id && item.piece.id === piece.id);
            stackCount = stack.length;
        }
        const spread = piece.steps === game.trackLength + 4 ? 0 : (stackIndex - (stackCount - 1) / 2) * 9;
        const angle = slotAngle(slot, g.n) + Math.PI / 2;
        pieces.push({
            playerId: player.id, pieceId: piece.id, color: player.color,
            x: position.x + Math.cos(angle) * spread - CENTER,
            z: position.y + Math.sin(angle) * spread - CENTER,
            radius: g.piece,
            selectable: player.id === game.currentPlayer && validMoves.has(piece.id)
        });
    }
    return {
        style, slotCount: g.n, trackLength: game.trackLength,
        players: game.players.map(player => ({ id: player.id, color: player.color })),
        track, lanes, bases, pieces
    };
}

