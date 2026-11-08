/**
 * Základní výpočtová vrstva a zatím nevyučený výběr tahu AI.
 *
 * Pravidla a legální tahy poskytuje výhradně game-engine.js.
 * Výpočty zde vracejí popisné údaje; samy neurčují taktické preference.
 */

const BASE_DEPLOY_COST = 6;
const EXPECTED_PIPS_PER_ACTIVE_TURN = 4.2;
const MAX_THREAT_BONUS_ROLLS = 3;

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
 * Vypočítá pravděpodobnost, že soupeř během svého tahu může zasáhnout
 * konkrétní figurku. Nejde o doporučení tahu ani o jeho bodové hodnocení.
 * Všechny větve používají skutečný herní engine.
 */
function estimateOpponentHitProbability(initialGame, attackerId, targetPlayerId, targetPieceId, dependencies) {
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

                    if (next.winner === null && next.currentPlayer === attackerId &&
                        next.phase === 'roll' && depth < MAX_THREAT_BONUS_ROLLS) {
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

export function estimatePieceThreat(game, targetPlayerId, targetPieceId, dependencies) {
    const targetPiece = game.pieces[targetPlayerId]?.pieces[targetPieceId];
    if (!targetPiece || !isMainTrackPiece(targetPiece, game.trackLength)) return 0;

    let totalThreat = 0;
    for (const opponent of game.players) {
        if (opponent.id === targetPlayerId || opponent.finished) continue;
        const probability = estimateOpponentHitProbability(
            game, opponent.id, targetPlayerId, targetPieceId, dependencies
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
 * Popisný součet zbývajících kroků. Neobsahuje bonusy za flexibilitu,
 * penalizace ani váhy, které by AI říkaly, který tah má preferovat.
 */
export function calculatePlayerPips(game, playerId) {
    const pieces = game.pieces[playerId]?.pieces || [];
    const trackLength = game.trackLength;
    const baseCount = pieces.filter(piece => piece.steps === -1).length;
    const allAtBase = pieces.length > 0 && baseCount === pieces.length;

    let pips = 0;
    for (const piece of pieces) {
        if (piece.steps === -1) {
            pips += trackLength + 3 + BASE_DEPLOY_COST;
        } else {
            pips += Math.max(0, trackLength + 3 - piece.steps);
        }
    }

    if (allAtBase) pips += getWaitingCost(game);
    return Math.max(0, pips);
}

/**
 * Nevyučená AI vybírá rovnoměrně z legálních tahů.
 * Okamžitá výhra je jediný výsledek, který nevyžaduje taktické hodnocení.
 * random je injektovatelný kvůli reprodukovatelným testům.
 */
export function chooseStrategicDecision(game, dependencies, _difficulty = 'medium', random = Math.random) {
    const validMoves = dependencies.getValidMoves(game);
    if (!validMoves.length) return null;

    const candidates = validMoves.map(pieceId => {
        const simulated = cloneGame(game);
        const move = dependencies.movePiece(simulated, pieceId);
        return { pieceId, move, winningMove: simulated.winner === game.currentPlayer };
    });

    const winning = candidates.find(candidate => candidate.winningMove);
    const selected = winning || candidates[Math.min(
        candidates.length - 1,
        Math.floor(Math.max(0, Math.min(0.999999999, Number(random()) || 0)) * candidates.length)
    )];

    return {
        pieceId: selected.pieceId,
        reason: winning
            ? 'Okamžitě vítězný tah – hra tím končí.'
            : 'Zatím nemám naučenou taktiku. Tah jsem vybrala náhodně z ' +
                validMoves.length + ' legálních možností.',
        score: winning ? 1 : 0,
        breakdown: {
            trainedKnowledge: false,
            legalMoveCount: validMoves.length,
            selection: winning ? 'immediate-win' : 'untrained-random'
        },
        alternatives: candidates
            .filter(candidate => candidate.pieceId !== selected.pieceId)
            .map(candidate => ({
                pieceId: candidate.pieceId,
                score: candidate.winningMove ? 1 : 0,
                reason: candidate.winningMove ? 'okamžitá výhra' : 'bez naučeného hodnocení'
            }))
    };
}

export function chooseStrategicMove(game, dependencies, difficulty = 'medium') {
    return chooseStrategicDecision(game, dependencies, difficulty)?.pieceId ?? null;
}
