/**
 * Člověče, nezlob se! – čisté herní jádro.
 * Nezávislé na DOM a serveru, připravené pro pozdější autoritativní online API.
 */

export const PLAYER_COLORS = [
    '#E53935', '#1E88E5', '#43A047', '#F9A825',
    '#FB8C00', '#8E24AA', '#00ACC1', '#D81B60'
];

export const PLAYER_NAMES = [
    'Rubín', 'Laguna', 'Jantar', 'Smaragd',
    'Růže', 'Ametyst', 'Měď', 'Safír'
];

export const BOARD_CONFIGS = Object.freeze({
    40: Object.freeze({ trackLength: 40, slotCount: 4 }),
    48: Object.freeze({ trackLength: 48, slotCount: 6 }),
    80: Object.freeze({ trackLength: 80, slotCount: 8 })
});

export function getAvailableBoardSizes(playerCount) {
    if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 8) return [];
    return Object.values(BOARD_CONFIGS)
        .filter(config => playerCount <= config.slotCount)
        .map(config => config.trackLength);
}

export function createGame(humanCount, aiCount, names = [], colors = [], boardSize = null) {
    const total = humanCount + aiCount;
    if (total < 2 || total > 8 || humanCount < 1 || aiCount < 0) {
        throw new Error('Hra vyžaduje 2 až 8 hráčů a alespoň jednoho člověka.');
    }

    const assignedColors = [];
    for (let index = 0; index < total; index++) {
        const requested = colors[index];
        const color = PLAYER_COLORS.includes(requested) && !assignedColors.includes(requested)
            ? requested
            : PLAYER_COLORS.find(candidate => !assignedColors.includes(candidate));
        assignedColors.push(color || PLAYER_COLORS[index]);
    }

    const selectedBoard = boardSize === null ? null : BOARD_CONFIGS[Number(boardSize)];
    if (boardSize !== null && (!selectedBoard || !getAvailableBoardSizes(total).includes(selectedBoard.trackLength))) {
        throw new Error('Zvolená velikost desky není pro tento počet hráčů dostupná.');
    }

    // Bez výslovné volby zachováváme původní délky kvůli zpětné kompatibilitě uložených her.
    const trackLength = selectedBoard?.trackLength ?? (total <= 4 ? 52 : 64);
    const slotCount = selectedBoard?.slotCount ?? (total <= 4 ? 4 : 8);
    const slots = selectedBoard
        ? Array.from({ length: total }, (_, index) => Math.round(index * slotCount / total))
        : (total <= 4
            ? (total === 2 ? [0, 2] : total === 3 ? [0, 1, 2] : [0, 1, 2, 3])
            : Array.from({ length: total }, (_, index) => Math.round(index * 8 / total)));
    const players = Array.from({ length: total }, (_, index) => ({
        id: index,
        slot: slots[index],
        name: names[index] || (index < humanCount ? 'Hráč ' + (index + 1) : 'AI ' + (index - humanCount + 1)),
        color: assignedColors[index],
        isAI: index >= humanCount,
        start: selectedBoard
            ? slots[index] * (trackLength / slotCount)
            : (total === 3 || total >= 5
                ? Math.round(index * trackLength / total)
                : slots[index] * 13),
        finished: false
    }));

    return {
        players,
        trackLength,
        boardSize: selectedBoard ? trackLength : null,
        slotCount,
        currentPlayer: 0,
        startRolls: [],
        diceValue: 0,
        baseRollAttempts: 0,
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

/**
 * Určí začínajícího hráče rozstřelem. Pořadí hráčů se nemění;
 * currentPlayer pouze ukazuje na vítěze, další tahy pokračují po směru hodin.
 */
export function determineStartingPlayer(game, rollFn = () => Math.floor(Math.random() * 6) + 1) {
    let candidates = game.players.map(player => player.id);
    const rounds = [];

    while (candidates.length > 1) {
        const rolls = candidates.map(playerId => {
            const value = Number(rollFn(playerId, rounds.length));
            if (!Number.isInteger(value) || value < 1 || value > 6) {
                throw new Error('Hod rozstřelu musí být číslo od 1 do 6.');
            }
            return { playerId, value };
        });
        rounds.push(rolls);
        const highest = Math.max(...rolls.map(roll => roll.value));
        candidates = rolls.filter(roll => roll.value === highest).map(roll => roll.playerId);
    }

    game.currentPlayer = candidates[0];
    game.startRolls = rounds;
    return { playerId: candidates[0], rounds };
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
    const maxSteps = game.trackLength + 3;
    const valid = [];

    playerPieces.forEach(piece => {
        if (piece.steps === maxSteps) return;
        if (piece.steps === -1 && game.diceValue !== 6) return;

        const nextSteps = piece.steps === -1 ? 0 : piece.steps + game.diceValue;
        if (nextSteps > maxSteps) return;

        // Hlavní okruh má trackLength polí: kroky 0 až trackLength - 1.
        // Po posledním poli následuje přímo D1, bez druhého průchodu startem.
        const ownBlock = playerPieces.some(other => {
            if (other.id === piece.id || other.steps < 0) return false;
            if (nextSteps < game.trackLength) {
                return other.steps < game.trackLength &&
                    getPiecePosition(game, playerId, other) ===
                    (game.players[playerId].start + nextSteps) % game.trackLength;
            }
            return other.steps === nextSteps;
        });
        if (ownBlock) return;

        valid.push(piece.id);
    });

    return valid;
}

export function getForcedMove(game) {
    const moves = getValidMoves(game);
    return moves.length === 1 ? moves[0] : null;
}

export function rollDice(game, value = Math.floor(Math.random() * 6) + 1) {
    if (game.phase !== 'roll' || game.winner !== null) {
        throw new Error('Nyní nelze házet kostkou.');
    }

    game.diceValue = Math.max(1, Math.min(6, Number(value) || 1));
    const playerPieces = game.pieces[game.currentPlayer].pieces;
    const allAtBase = playerPieces.every(piece => piece.steps === -1);

    if (allAtBase && game.diceValue !== 6) {
        game.baseRollAttempts = (game.baseRollAttempts || 0) + 1;
        const retrying = game.baseRollAttempts < 3;
        game.phase = retrying ? 'roll' : 'no-move';
        return {
            value: game.diceValue,
            validMoves: [],
            retrying,
            attempt: game.baseRollAttempts,
            maxAttempts: 3
        };
    }

    game.baseRollAttempts = 0;
    game.phase = 'move';
    const moves = getValidMoves(game);
    if (!moves.length) game.phase = 'no-move';

    return { value: game.diceValue, validMoves: moves, retrying: false };
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
        // Startovní pole nemá žádnou ochranu – obsazenou soupeřovu figurku lze vyhodit.
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

    piece.steps = nextSteps;
    const maxSteps = game.trackLength + 3;
    const finishedNow = piece.steps === maxSteps;
    // Vítězství nastane, když všechny čtyři figurky obsadí čtyři různá cílová pole.
    const homeSteps = game.pieces[playerId].pieces.map(item => item.steps);
    const playerFinished = homeSteps.every(
        steps => steps >= game.trackLength && steps <= maxSteps
    ) && new Set(homeSteps).size === 4;

    if (playerFinished) {
        player.finished = true;
        game.winner = playerId;
        game.phase = 'finished';
    } else if (diceValue === 6 && !finishedNow) {
        game.baseRollAttempts = 0;
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
    game.baseRollAttempts = 0;
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
        if (next === game.trackLength + 3) score += 1000;
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
