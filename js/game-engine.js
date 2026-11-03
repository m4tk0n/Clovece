/**
 * Člověče, nezlob se! – čisté herní jádro.
 * Nezávislé na DOM a serveru, připravené pro pozdější autoritativní online API.
 */

export const PLAYER_COLORS = [
    '#f05b62', '#36c9c1', '#f4c84a', '#67c98b',
    '#e77ab4', '#9b83e8', '#e99555', '#6c9de8'
];

export const PLAYER_NAMES = [
    'Rubín', 'Laguna', 'Jantar', 'Smaragd',
    'Růže', 'Ametyst', 'Měď', 'Safír'
];

export function createGame(humanCount, aiCount, names = []) {
    const total = humanCount + aiCount;
    if (total < 2 || total > 8 || humanCount < 1 || aiCount < 0) {
        throw new Error('Hra vyžaduje 2 až 8 hráčů a alespoň jednoho člověka.');
    }

    const trackLength = total <= 4 ? 52 : 64;
    const classicSlots = total === 2 ? [0, 2] : total === 3 ? [0, 1, 2] : [0, 1, 2, 3];
    const slots = total <= 4
        ? classicSlots
        : Array.from({ length: total }, (_, index) => Math.round(index * 8 / total));
    const players = Array.from({ length: total }, (_, index) => ({
        id: index,
        slot: slots[index],
        name: names[index] || (index < humanCount ? 'Hráč ' + (index + 1) : 'AI ' + (index - humanCount + 1)),
        color: PLAYER_COLORS[index],
        isAI: index >= humanCount,
        start: total === 3 || total >= 5
            ? Math.round(index * trackLength / total)
            : slots[index] * 13,
        finished: false
    }));

    return {
        players,
        trackLength,
        currentPlayer: 0,
        diceValue: 0,
        phase: 'roll',
        turnNumber: 1,
        winner: null,
        lastMove: null,
        pieces: players.map(player => ({
            playerId: player.id,
            pieces: Array.from({ length: 4 }, (_, pieceId) => ({
                id: pieceId,
                steps: -1
            }))
        }))
    };
}

export function getPiecePosition(game, playerId, piece) {
    if (piece.steps < 0 || piece.steps >= game.trackLength) return null;
    return (game.players[playerId].start + piece.steps) % game.trackLength;
}

export function getHomeLaneIndex(game, piece) {
    if (piece.steps < game.trackLength) return -1;
    return piece.steps - game.trackLength;
}

export function getValidMoves(game, playerId = game.currentPlayer) {
    if (game.phase !== 'move' || playerId !== game.currentPlayer) return [];
    const playerPieces = game.pieces[playerId].pieces;
    const maxSteps = game.trackLength + 4;
    const safeSquares = new Set(game.players.map(player => player.start));
    const valid = [];

    playerPieces.forEach(piece => {
        if (piece.steps === maxSteps) return;
        if (piece.steps === -1 && game.diceValue !== 6) return;

        const nextSteps = piece.steps === -1 ? 0 : piece.steps + game.diceValue;
        if (nextSteps > maxSteps) return;

        if (nextSteps < game.trackLength) {
            const destination = (game.players[playerId].start + nextSteps) % game.trackLength;
            const ownBlock = playerPieces.some(other =>
                other.id !== piece.id && other.steps >= 0 &&
                other.steps < game.trackLength &&
                getPiecePosition(game, playerId, other) === destination
            );
            if (ownBlock) return;

            const enemyAtTarget = game.pieces.some((group, enemyId) => {
                if (enemyId === playerId) return false;
                return group.pieces.some(other =>
                    other.steps >= 0 && other.steps < game.trackLength &&
                    getPiecePosition(game, enemyId, other) === destination
                );
            });
            if (enemyAtTarget && safeSquares.has(destination)) return;
        }

        valid.push(piece.id);
    });

    return valid;
}

export function rollDice(game, value = Math.floor(Math.random() * 6) + 1) {
    if (game.phase !== 'roll' || game.winner !== null) {
        throw new Error('Nyní nelze házet kostkou.');
    }

    game.diceValue = Math.max(1, Math.min(6, Number(value) || 1));
    game.phase = 'move';

    const moves = getValidMoves(game);
    if (!moves.length) {
        game.phase = 'no-move';
    }

    return { value: game.diceValue, validMoves: moves };
}

export function movePiece(game, pieceId) {
    const valid = getValidMoves(game);
    if (!valid.includes(Number(pieceId))) {
        throw new Error('Tuto figurku nyní nelze táhnout.');
    }

    const playerId = game.currentPlayer;
    const player = game.players[playerId];
    const piece = game.pieces[playerId].pieces[Number(pieceId)];
    const fromSteps = piece.steps;
    const diceValue = game.diceValue;
    const nextSteps = fromSteps === -1 ? 0 : fromSteps + diceValue;
    let captured = null;

    if (nextSteps < game.trackLength) {
        const destination = (player.start + nextSteps) % game.trackLength;
        const safeSquares = new Set(game.players.map(item => item.start));

        if (!safeSquares.has(destination)) {
            game.pieces.forEach((group, enemyId) => {
                if (enemyId === playerId) return;
                group.pieces.forEach(enemyPiece => {
                    if (enemyPiece.steps >= 0 && enemyPiece.steps < game.trackLength &&
                        getPiecePosition(game, enemyId, enemyPiece) === destination) {
                        captured = {
                            playerId: enemyId,
                            pieceId: enemyPiece.id,
                            playerName: game.players[enemyId].name,
                            color: game.players[enemyId].color
                        };
                        enemyPiece.steps = -1;
                    }
                });
            });
        }
    }

    piece.steps = nextSteps;
    const maxSteps = game.trackLength + 4;
    const finishedNow = piece.steps === maxSteps;
    const playerFinished = game.pieces[playerId].pieces.every(item => item.steps === maxSteps);

    if (playerFinished) {
        player.finished = true;
        game.winner = playerId;
        game.phase = 'finished';
    } else if (diceValue === 6 && !finishedNow) {
        game.phase = 'roll';
    } else {
        advanceTurn(game);
    }

    game.lastMove = {
        playerId,
        playerName: player.name,
        pieceId: piece.id,
        captured,
        finishedNow,
        diceValue
    };

    return game.lastMove;
}

export function advanceTurn(game) {
    if (game.winner !== null) return;
    let next = game.currentPlayer;
    for (let attempt = 0; attempt < game.players.length; attempt++) {
        next = (next + 1) % game.players.length;
        if (!game.players[next].finished) break;
    }
    game.currentPlayer = next;
    game.diceValue = 0;
    game.phase = 'roll';
    game.turnNumber++;
}

export function chooseAIMove(game) {
    const valid = getValidMoves(game);
    if (!valid.length) return null;

    const playerId = game.currentPlayer;
    const candidates = valid.map(pieceId => {
        const piece = game.pieces[playerId].pieces[pieceId];
        const next = piece.steps < 0 ? 0 : piece.steps + game.diceValue;
        const destination = next < game.trackLength
            ? (game.players[playerId].start + next) % game.trackLength
            : null;
        let score = next;

        if (piece.steps < 0) score += 18;
        if (next === game.trackLength + 4) score += 1000;
        if (destination !== null) {
            game.pieces.forEach((group, enemyId) => {
                if (enemyId === playerId) return;
                group.pieces.forEach(enemy => {
                    if (enemy.steps >= 0 && enemy.steps < game.trackLength &&
                        getPiecePosition(game, enemyId, enemy) === destination) score += 90;
                });
            });
        }
        return { pieceId, score };
    });

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].pieceId;
}
