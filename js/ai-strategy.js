/**
 * Strategická AI pro lokální hru Člověče, nezlob se!
 *
 * Modul neobsahuje pravidla hry. Legální tahy i samotné provedení tahu
 * vždy ověřuje game-engine.js; tento modul pouze porovnává jejich hodnotu.
 */

/** Pravděpodobnost zásahu při řetězení šestek a pokračování stejnou figurkou. */
export function estimateCaptureProbability(distance) {
    if (!Number.isInteger(distance) || distance < 1) return 0;
    return 1 / (6 ** Math.ceil(distance / 6));
}

function cloneGame(game) {
    return JSON.parse(JSON.stringify(game));
}

function getOpponentProgressValue(game, captured) {
    if (!captured || captured.ownPiece) return 0;
    const enemyPiece = game.pieces[captured.playerId]?.pieces[captured.pieceId];
    if (!enemyPiece || enemyPiece.steps < 0) return 0;
    return enemyPiece.steps / game.trackLength;
}

function getAttackerProbability(game, attackerId, attackerPiece, targetPosition, getPiecePosition) {
    if (attackerPiece.steps < 0 || attackerPiece.steps >= game.trackLength) return 0;

    const attackerPosition = getPiecePosition(game, attackerId, attackerPiece);
    if (attackerPosition === null) return 0;

    const distance = (targetPosition - attackerPosition + game.trackLength) % game.trackLength;
    if (distance === 0) return 0;

    // Figurka nesmí před dosažením cíle vstoupit do vlastního domečku.
    const remainingTrack = game.trackLength - attackerPiece.steps;
    if (distance > remainingTrack) return 0;

    const rollsRequired = Math.ceil(distance / 6);
    const attackerPieces = game.pieces[attackerId].pieces;

    // Každá mezilehlá šestka musí mít volné cílové pole.
    for (let rollIndex = 1; rollIndex < rollsRequired; rollIndex++) {
        const blockedPosition = (attackerPosition + rollIndex * 6) % game.trackLength;
        const blocked = attackerPieces.some(piece =>
            piece.id !== attackerPiece.id &&
            piece.steps >= 0 &&
            piece.steps < game.trackLength &&
            getPiecePosition(game, attackerId, piece) === blockedPosition
        );
        if (blocked) return 0;
    }

    const destinationBlocked = attackerPieces.some(piece =>
        piece.id !== attackerPiece.id &&
        piece.steps >= 0 &&
        piece.steps < game.trackLength &&
        getPiecePosition(game, attackerId, piece) === targetPosition
    );
    if (destinationBlocked) return 0;

    return estimateCaptureProbability(distance);
}

/** Pravděpodobnost, že některý soupeř zasáhne danou vlastní figurku. */
export function estimatePieceThreat(game, targetPlayerId, targetPieceId, getPiecePosition) {
    const targetPiece = game.pieces[targetPlayerId]?.pieces[targetPieceId];
    if (!targetPiece || targetPiece.steps < 0 || targetPiece.steps >= game.trackLength) return 0;

    const targetPosition = getPiecePosition(game, targetPlayerId, targetPiece);
    if (targetPosition === null) return 0;

    let survivalProbability = 1;
    for (const opponent of game.players) {
        if (opponent.id === targetPlayerId || opponent.finished) continue;

        let opponentSurvival = 1;
        for (const attackerPiece of game.pieces[opponent.id].pieces) {
            const probability = getAttackerProbability(
                game, opponent.id, attackerPiece, targetPosition, getPiecePosition
            );
            opponentSurvival *= 1 - probability;
        }
        survivalProbability *= opponentSurvival;
    }

    return Math.max(0, Math.min(1, 1 - survivalProbability));
}

function scoreNextBonusRoll(game, playerId, getValidMoves, getPiecePosition) {
    if (game.phase !== 'roll' || game.currentPlayer !== playerId) return 0;

    let expectedBest = 0;
    for (let dice = 1; dice <= 6; dice++) {
        const forecast = cloneGame(game);
        forecast.phase = 'move';
        forecast.diceValue = dice;
        const moves = getValidMoves(forecast, playerId);
        let best = 0;

        for (const pieceId of moves) {
            const piece = forecast.pieces[playerId].pieces[pieceId];
            const nextSteps = piece.steps < 0 ? 0 : piece.steps + dice;
            let value = piece.steps < 0 ? 12 : dice * 2;
            if (nextSteps >= forecast.trackLength) value += 18;
            if (nextSteps === forecast.trackLength + 3) value += 90;

            if (nextSteps < forecast.trackLength) {
                const destination = (forecast.players[playerId].start + nextSteps) % forecast.trackLength;
                forecast.pieces.forEach((group, enemyId) => {
                    if (enemyId === playerId) return;
                    group.pieces.forEach(enemy => {
                        if (enemy.steps >= 0 && enemy.steps < forecast.trackLength &&
                            getPiecePosition(forecast, enemyId, enemy) === destination) {
                            value += 65 + (enemy.steps / forecast.trackLength) * 45;
                        }
                    });
                });
            }
            best = Math.max(best, value);
        }
        expectedBest += best / 6;
    }
    return expectedBest;
}

function evaluateCandidate(originalGame, pieceId, dependencies, difficulty) {
    const { getValidMoves, getPiecePosition, movePiece } = dependencies;
    const playerId = originalGame.currentPlayer;
    const beforeSteps = originalGame.pieces[playerId].pieces[pieceId].steps;
    const simulated = cloneGame(originalGame);
    const move = movePiece(simulated, pieceId);

    if (simulated.winner === playerId) {
        return { pieceId, score: 100000, reason: 'vítězný tah' };
    }

    let score = beforeSteps < 0 ? 16 : originalGame.diceValue * 2.2;

    if (move.finishedNow) score += 115;
    else if (beforeSteps < originalGame.trackLength && !move.deployed &&
        simulated.pieces[playerId].pieces[pieceId].steps >= originalGame.trackLength) {
        score += 22;
    }

    if (move.captured && !move.captured.ownPiece) {
        score += 78 + getOpponentProgressValue(originalGame, move.captured) * 62;
    } else if (move.captured?.ownPiece) {
        score -= 7;
    }

    const activeBefore = originalGame.pieces[playerId].pieces.filter(piece =>
        piece.steps >= 0 && piece.steps < originalGame.trackLength
    ).length;
    if (move.deployed && activeBefore === 0) score += 7;

    const riskWeight = difficulty === 'easy' ? 0.45 : difficulty === 'hard' ? 1.65 : 1.15;
    let expectedLoss = 0;
    simulated.pieces[playerId].pieces.forEach((piece, ownPieceId) => {
        if (piece.steps < 0 || piece.steps >= simulated.trackLength) return;
        const probability = estimatePieceThreat(simulated, playerId, ownPieceId, getPiecePosition);
        const progress = piece.steps / simulated.trackLength;
        expectedLoss += probability * (24 + progress * 46);
    });
    score -= expectedLoss * riskWeight;

    if (difficulty === 'hard') {
        // Šestka ponechá tah stejnému hráči; započítá se očekávaná hodnota
        // nejlepšího legálního pokračování přes všech šest dalších výsledků.
        score += scoreNextBonusRoll(simulated, playerId, getValidMoves, getPiecePosition) * 0.72;
    }

    return {
        pieceId,
        score,
        reason: move.captured && !move.captured.ownPiece
            ? 'vyhození soupeře'
            : move.finishedNow ? 'dokončení figurky'
            : move.deployed ? 'nasazení figurky'
            : 'postup a vyhodnocení rizika'
    };
}

/**
 * Lehká = jednoduché priority; střední = pravděpodobnost ohrožení;
 * těžká = vyšší váha rizika a očekávaná hodnota pokračování po šestce.
 */
export function chooseStrategicMove(game, dependencies, difficulty = 'medium') {
    const level = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium';
    const validMoves = dependencies.getValidMoves(game);
    if (!validMoves.length) return null;

    const evaluated = validMoves.map(pieceId =>
        evaluateCandidate(game, pieceId, dependencies, level)
    );
    evaluated.sort((a, b) => b.score - a.score || a.pieceId - b.pieceId);
    return evaluated[0].pieceId;
}
