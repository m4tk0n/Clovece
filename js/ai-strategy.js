/**
 * Strategická AI pro lokální hru Člověče, nezlob se!
 *
 * AI neobsahuje pravidla ani vlastní generátor tahů. Všechny tahy, simulace
 * hodů a důsledky pravidel získává výhradně z game-engine.js.
 */

const BASE_DEPLOY_COST = 6;
const EXPECTED_PIPS_PER_ACTIVE_TURN = 4.2;
const MAX_THREAT_BONUS_ROLLS = 3;
const MAX_BONUS_LOOKAHEAD = 2;
const FLEXIBILITY_PIPS = [-1.5, 0, 1.5, 2.2, 2.5];

export function estimateCaptureProbability(distance) {
    if (!Number.isInteger(distance) || distance < 1) return 0;
    return 1 / (6 ** Math.ceil(distance / 6));
}

function cloneGame(game) {
    return JSON.parse(JSON.stringify(game));
}

function isMainTrackPiece(piece, trackLength) {
    return piece.steps >= 0 && piece.steps < trackLength;
}

function getBasePieces(game, playerId) {
    return game.pieces[playerId].pieces.filter(piece => piece.steps === -1);
}

function getThreatCacheKey(game, depth) {
    return [
        depth,
        game.currentPlayer,
        game.baseRollAttempts || 0,
        game.consecutiveSixes || 0,
        game.thirdAttemptSix ? 1 : 0,
        game.threeSixesPenaltyPending ? 1 : 0,
        game.pieces.map(group => group.pieces.map(piece => piece.steps).join(',')).join(';')
    ].join('|');
}

/**
 * Pravděpodobnost zásahu jednoho konkrétního cíle během tahu soupeře.
 *
 * Pro každou hodnotu kostky se používá rollDice(), getValidMoves() a
 * movePiece() z enginu. Na šestku může soupeř zvolit libovolný legální tah;
 * model volí ten, který maximalizuje šanci zasáhnout sledovanou figurku.
 * Jde tedy o konzervativní model soupeře zaměřeného na tento zásah.
 *
 * Po třech navazujících bonusových hodech se další řetězení ořízne.
 * Pravděpodobnost vynechaného pokračování je nejvýše 1/1296 na tah.
 */
function estimateOpponentHitProbability(
    initialGame,
    attackerId,
    targetPlayerId,
    targetPieceId,
    dependencies
) {
    const { getValidMoves, movePiece, rollDice } = dependencies;
    if (typeof rollDice !== 'function' || typeof movePiece !== 'function' ||
        typeof getValidMoves !== 'function') return 0;

    const canAct = initialGame.pieces[attackerId].pieces.some(piece =>
        piece.steps === -1 || isMainTrackPiece(piece, initialGame.trackLength)
    );
    if (!canAct) return 0;

    const startState = cloneGame(initialGame);
    startState.currentPlayer = attackerId;
    startState.phase = 'roll';
    startState.diceValue = 0;
    startState.baseRollAttempts = 0;
    startState.thirdAttemptSix = false;
    startState.consecutiveSixes = 0;
    startState.threeSixesPenaltyPending = false;

    const cache = new Map();

    function enumerate(state, depth) {
        const target = state.pieces[targetPlayerId]?.pieces[targetPieceId];
        if (!target || !isMainTrackPiece(target, state.trackLength) || state.winner !== null) return 0;

        const key = getThreatCacheKey(state, depth);
        if (cache.has(key)) return cache.get(key);

        let probability = 0;
        for (let dice = 1; dice <= 6; dice++) {
            const rolled = cloneGame(state);
            const result = rollDice(rolled, dice);
            let branchProbability = 0;

            if (result.turnEnded || rolled.phase === 'no-move' || rolled.phase === 'finished') {
                branchProbability = 0;
            } else if (result.retrying) {
                if (rolled.phase === 'roll' && depth < MAX_THREAT_BONUS_ROLLS) {
                    branchProbability = enumerate(rolled, depth + 1);
                }
            } else if (rolled.phase === 'move') {
                const legalMoves = result.validMoves || getValidMoves(rolled, attackerId);
                let bestContinuation = 0;

                for (const pieceId of legalMoves) {
                    const next = cloneGame(rolled);
                    const move = movePiece(next, pieceId);
                    const capturedTarget = move.captured &&
                        !move.captured.ownPiece &&
                        move.captured.playerId === targetPlayerId &&
                        move.captured.pieceId === targetPieceId;

                    if (capturedTarget) {
                        bestContinuation = 1;
                        break;
                    }

                    if (next.winner === null &&
                        next.currentPlayer === attackerId &&
                        next.phase === 'roll' &&
                        depth < MAX_THREAT_BONUS_ROLLS) {
                        bestContinuation = Math.max(bestContinuation, enumerate(next, depth + 1));
                    }
                }
                branchProbability = bestContinuation;
            }

            probability += branchProbability / 6;
        }

        const bounded = Math.max(0, Math.min(1, probability));
        cache.set(key, bounded);
        return bounded;
    }

    return enumerate(startState, 0);
}

/**
 * Odhad pravděpodobnosti, že některý soupeř během svého příštího tahu
 * vyhodí konkrétní figurku. U více soupeřů používá sjednocení horní mezí
 * (součet pravděpodobností omezený na 1), protože jejich tahy mění společný stav.
 */
export function estimatePieceThreat(game, targetPlayerId, targetPieceId, dependencies) {
    const targetPiece = game.pieces[targetPlayerId]?.pieces[targetPieceId];
    if (!targetPiece || !isMainTrackPiece(targetPiece, game.trackLength)) return 0;

    let totalThreat = 0;
    for (const opponent of game.players) {
        if (opponent.id === targetPlayerId || opponent.finished) continue;
        const probability = estimateOpponentHitProbability(
            game,
            opponent.id,
            targetPlayerId,
            targetPieceId,
            dependencies
        );
        totalThreat = Math.min(1, totalThreat + probability);
        if (totalThreat >= 1) return 1;
    }

    return totalThreat;
}

function getWaitingCost(game) {
    const attemptsPerTurn = game.rules?.threeRolls === false ? 1 : 3;
    const exitProbability = 1 - (5 / 6) ** attemptsPerTurn;
    return EXPECTED_PIPS_PER_ACTIVE_TURN * (1 / exitProbability - 1);
}

/**
 * Pipový odhad zbývající cesty jednoho hráče.
 *
 * Aktivní figurka: zbývající pole do D4.
 * Základna: zbývající cesta + šestka potřebná k nasazení.
 * Čekání na šestku se přičítá pouze jednou, pokud jsou všechny figurky v základně.
 * Flexibilita a blokovaný start jsou malé laditelné heuristiky.
 */
export function calculatePlayerPips(game, playerId) {
    const pieces = game.pieces[playerId]?.pieces || [];
    const trackLength = game.trackLength;
    const baseCount = pieces.filter(piece => piece.steps === -1).length;
    const allAtBase = pieces.length > 0 && baseCount === pieces.length;
    const activeCount = pieces.filter(piece => isMainTrackPiece(piece, trackLength)).length;

    let pips = 0;
    for (const piece of pieces) {
        if (piece.steps === -1) {
            pips += trackLength + 3 + BASE_DEPLOY_COST;
        } else {
            pips += Math.max(0, trackLength + 3 - piece.steps);
        }
    }

    if (allAtBase) pips += getWaitingCost(game);
    pips -= FLEXIBILITY_PIPS[Math.min(activeCount, 4)] || 0;

    const hasPieceOnOwnStart = pieces.some(piece => piece.steps === 0);
    if (game.rules?.mustDeploy !== false && baseCount > 0 && hasPieceOnOwnStart) {
        pips += 2;
    }

    return Math.max(0, pips);
}

function getCaptureCost(game, playerId, pieceId) {
    const pieces = game.pieces[playerId]?.pieces || [];
    const piece = pieces[pieceId];
    if (!piece || !isMainTrackPiece(piece, game.trackLength)) return 0;

    const allOtherPiecesAtBase = pieces.every(other =>
        other.id === pieceId || other.steps === -1
    );
    return piece.steps + BASE_DEPLOY_COST + (allOtherPiecesAtBase ? getWaitingCost(game) : 0);
}

function calculatePipWinShares(pips) {
    if (!pips.length) return [];
    const minimum = Math.min(...pips);
    const average = pips.reduce((sum, value) => sum + value, 0) / pips.length;
    const temperature = Math.max(8, 1.24 * Math.sqrt(Math.max(1, average)));
    const weights = pips.map(value => Math.exp(-(value - minimum) / temperature));
    const total = weights.reduce((sum, value) => sum + value, 0);
    return weights.map(value => total > 0 ? value / total : 1 / weights.length);
}

function evaluatePosition(game, dependencies, riskWeight, focusPlayerId) {
    const rawPips = game.players.map(player => calculatePlayerPips(game, player.id));
    const expectedLoss = game.players.map(() => 0);

    for (const player of game.players) {
        if (player.finished) continue;
        const targetPlayerId = player.id;
        game.pieces[targetPlayerId].pieces.forEach((piece, pieceId) => {
            if (!isMainTrackPiece(piece, game.trackLength)) return;
            // U vlastních figurek počítáme hrozby od všech soupeřů.
            // U soupeřů stačí započítat hrozbu, kterou představuje právě naše AI;
            // vzájemné hrozby mezi soupeři nejsou přímým důsledkem našeho tahu.
            const threat = targetPlayerId === focusPlayerId
                ? estimatePieceThreat(game, targetPlayerId, pieceId, dependencies)
                : estimateOpponentHitProbability(
                    game, focusPlayerId, targetPlayerId, pieceId, dependencies
                );
            expectedLoss[targetPlayerId] += threat * getCaptureCost(game, targetPlayerId, pieceId);
        });
    }

    const effectivePips = rawPips.map((value, playerId) =>
        value + expectedLoss[playerId] * riskWeight
    );
    return {
        rawPips,
        expectedLoss,
        effectivePips,
        winShares: calculatePipWinShares(effectivePips)
    };
}

function evaluatePipOnlyWinShare(game, playerId) {
    if (game.winner !== null) return game.winner === playerId ? 1 : 0;
    const pips = game.players.map(player => calculatePlayerPips(game, player.id));
    return calculatePipWinShares(pips)[playerId] ?? 0;
}

/**
 * Těžká AI simuluje skutečné bonusové hody přes engine.
 * Na každém hodu zvolí nejlepší legální pokračování; listy používají levnější
 * pipové hodnocení bez dalšího výpočtu hrozeb, aby zůstala odezva přijatelná.
 */
function evaluateBonusContinuation(game, playerId, dependencies, depth = 0) {
    if (depth >= MAX_BONUS_LOOKAHEAD) return evaluatePipOnlyWinShare(game, playerId);

    const { rollDice, getValidMoves, movePiece } = dependencies;
    let expected = 0;

    for (let dice = 1; dice <= 6; dice++) {
        const rolled = cloneGame(game);
        const result = rollDice(rolled, dice);
        let branchScore;

        if (result.turnEnded || rolled.phase === 'no-move' || rolled.phase === 'finished') {
            branchScore = evaluatePipOnlyWinShare(rolled, playerId);
        } else if (result.retrying) {
            branchScore = rolled.phase === 'roll'
                ? evaluateBonusContinuation(rolled, playerId, dependencies, depth + 1)
                : evaluatePipOnlyWinShare(rolled, playerId);
        } else if (rolled.phase === 'move') {
            const legalMoves = result.validMoves || getValidMoves(rolled, playerId);
            if (!legalMoves.length) {
                branchScore = evaluatePipOnlyWinShare(rolled, playerId);
            } else {
                branchScore = 0;
                for (const pieceId of legalMoves) {
                    const next = cloneGame(rolled);
                    movePiece(next, pieceId);
                    let score = evaluatePipOnlyWinShare(next, playerId);
                    if (next.winner === null &&
                        next.currentPlayer === playerId &&
                        next.phase === 'roll' &&
                        depth + 1 < MAX_BONUS_LOOKAHEAD) {
                        score = evaluateBonusContinuation(next, playerId, dependencies, depth + 1);
                    }
                    branchScore = Math.max(branchScore, score);
                }
            }
        } else {
            branchScore = evaluatePipOnlyWinShare(rolled, playerId);
        }

        expected += branchScore / 6;
    }

    return expected;
}

function evaluateCandidate(originalGame, pieceId, dependencies, difficulty, riskWeight) {
    const playerId = originalGame.currentPlayer;
    const beforePiece = originalGame.pieces[playerId].pieces[pieceId];
    const simulated = cloneGame(originalGame);
    const move = dependencies.movePiece(simulated, pieceId);

    if (simulated.winner === playerId) {
        return {
            pieceId,
            score: 1,
            move,
            winningMove: true,
            reason: 'vítězný tah',
            expectedLoss: 0,
            riskLoss: 0,
            captureGain: 0,
            bonusScore: null,
            rawPips: [],
            effectivePips: []
        };
    }

    const position = evaluatePosition(simulated, dependencies, riskWeight, playerId);
    let score = position.winShares[playerId] ?? 0;
    let bonusScore = null;

    if (difficulty === 'hard' &&
        simulated.phase === 'roll' &&
        simulated.currentPlayer === playerId) {
        bonusScore = evaluateBonusContinuation(simulated, playerId, dependencies);
        score = score * 0.65 + bonusScore * 0.35;
    }

    const movedPiece = simulated.pieces[playerId].pieces[pieceId];
    const threat = isMainTrackPiece(movedPiece, simulated.trackLength)
        ? estimatePieceThreat(simulated, playerId, pieceId, dependencies)
        : 0;
    const captureGain = move.captured && !move.captured.ownPiece
        ? getCaptureCost(originalGame, move.captured.playerId, move.captured.pieceId)
        : 0;

    return {
        pieceId,
        score,
        move,
        winningMove: false,
        beforeSteps: beforePiece.steps,
        afterSteps: movedPiece.steps,
        trackLength: simulated.trackLength,
        activeBefore: originalGame.pieces[playerId].pieces
            .filter(piece => isMainTrackPiece(piece, originalGame.trackLength)).length,
        activeAfter: simulated.pieces[playerId].pieces
            .filter(piece => isMainTrackPiece(piece, simulated.trackLength)).length,
        threat,
        expectedLoss: position.expectedLoss[playerId],
        riskLoss: position.expectedLoss[playerId] * riskWeight,
        captureGain,
        bonusScore,
        rawPips: position.rawPips,
        effectivePips: position.effectivePips,
        reason: move.captured && !move.captured.ownPiece
            ? 'vyhození soupeře'
            : move.finishedNow
                ? 'dokončení figurky'
                : move.deployed
                    ? 'nasazení figurky'
                    : movedPiece.steps >= originalGame.trackLength
                        ? 'postup do domečku'
                        : 'postup a vyhodnocení rizika'
    };
}

function formatPercent(value) {
    return (value * 100).toLocaleString('cs-CZ', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
    });
}

function formatPips(value) {
    return value.toLocaleString('cs-CZ', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
    });
}

function buildDecisionExplanation(selected, evaluated) {
    if (selected.winningMove) return 'Vítězný tah. Všechny čtyři figurky jsou v domečku.';

    const parts = [];
    if (selected.move.captured && !selected.move.captured.ownPiece) {
        parts.push(
            'Vyhodím hráče ' + selected.move.captured.playerName +
            '; jeho ztráta se v modelu počítá přibližně jako ' +
            formatPips(selected.captureGain) + ' pipů.'
        );
    } else if (selected.move.captured?.ownPiece) {
        parts.push('Povinné nasazení vymění vlastní figurku na startu.');
    }

    if (selected.move.finishedNow) {
        parts.push('Figurka bezpečně dokončí cestu do D4.');
    } else if (selected.afterSteps >= 0 && selected.afterSteps >= selected.trackLength) {
        parts.push('Vstupem do domečku se figurka dostává mimo riziko vyhození.');
    }

    if (selected.move.deployed) {
        if (selected.move.captured?.ownPiece) {
            parts.push(
                'Po nasazení zůstane na trase ' + selected.activeAfter +
                ' aktivních figurek, protože původní figurka na startu se vrací do základny.'
            );
        } else {
            parts.push(
                'Nasazení převede figurku ze základny na start; na trase budu mít ' +
                selected.activeAfter + ' aktivních figurek. Nasazení spotřebuje šestku.'
            );
        }
    }

    if (selected.riskLoss > 0.05) {
        parts.push(
            'Po započtení hrozeb je očekávaná ztráta vlastních figurek přibližně ' +
            formatPips(selected.riskLoss) + ' pipů.'
        );
    }

    if (selected.bonusScore !== null) {
        parts.push(
            'Po simulaci bonusových hodů vychází modelové skóre pokračování na ' +
            formatPercent(selected.bonusScore) + ' %.'
        );
    }

    const second = evaluated[1];
    if (second) {
        const difference = selected.score - second.score;
        parts.push(
            'Modelové skóre tahu je ' + formatPercent(selected.score) +
            ' % oproti ' + formatPercent(second.score) +
            ' % u druhé možnosti' +
            (difference > 0.0005 ? ' (rozdíl ' + formatPercent(difference) + ' procentního bodu).' : '.')
        );
    }

    if (!parts.length) {
        parts.push('Tento tah má nejlepší kombinaci postupu, bezpečí a budoucích možností.');
    }

    return parts.join(' ');
}

/** Vrátí vybraný legální tah včetně rozkladu rozhodnutí pro debug chat. */
export function chooseStrategicDecision(game, dependencies, difficulty = 'medium') {
    const level = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium';
    const riskWeight = level === 'easy' ? 0.55 : level === 'hard' ? 1.1 : 1;
    const validMoves = dependencies.getValidMoves(game);
    if (!validMoves.length) return null;

    const evaluated = validMoves.map(pieceId =>
        evaluateCandidate(game, pieceId, dependencies, level, riskWeight)
    );
    evaluated.sort((a, b) => b.score - a.score || a.pieceId - b.pieceId);
    const selected = evaluated[0];

    return {
        pieceId: selected.pieceId,
        reason: buildDecisionExplanation(selected, evaluated),
        score: selected.score,
        breakdown: {
            expectedOwnLoss: selected.riskLoss,
            capturedOpponentValue: selected.captureGain,
            ownPips: selected.rawPips[game.currentPlayer] ?? 0,
            effectiveOwnPips: selected.effectivePips[game.currentPlayer] ?? 0,
            bonusScore: selected.bonusScore
        },
        alternatives: evaluated.slice(1).map(candidate => ({
            pieceId: candidate.pieceId,
            score: candidate.score,
            reason: candidate.reason,
            breakdown: {
                expectedOwnLoss: candidate.riskLoss,
                capturedOpponentValue: candidate.captureGain,
                ownPips: candidate.rawPips[game.currentPlayer] ?? 0,
                effectiveOwnPips: candidate.effectivePips[game.currentPlayer] ?? 0,
                bonusScore: candidate.bonusScore
            }
        }))
    };
}

/** Zachová původní API pro místa, která potřebují pouze ID figurky. */
export function chooseStrategicMove(game, dependencies, difficulty = 'medium') {
    return chooseStrategicDecision(game, dependencies, difficulty)?.pieceId ?? null;
}
