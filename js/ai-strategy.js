import { scoreAIMoveCandidates } from './ai-neural-network.js';

/**
 * Základní výpočtová vrstva a rozhodování AI.
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

export function normalizeTrainingSituation(game, piecesSource = game.pieces) {
    const players = [...(game.players || [])].sort((a, b) => Number(a.slot) - Number(b.slot));
    const currentPlayer = players.find(player => Number(player.id) === Number(game.currentPlayer));
    return JSON.stringify({
        boardSize: Number(game.boardSize || game.trackLength),
        trackLength: Number(game.trackLength),
        playerCount: players.length,
        rules: game.rules || {},
        currentSlot: currentPlayer ? Number(currentPlayer.slot) : Number(game.currentPlayer),
        diceValue: Number(game.diceValue),
        players: players.map(player => {
            const group = piecesSource.find(item => Number(item.playerId) === Number(player.id));
            return {
                slot: Number(player.slot),
                start: Number(player.start),
                pieces: (group?.pieces || []).map(piece => Number(piece.steps))
            };
        })
    });
}

function getTaughtPieceId(record) {
    if (record.feedbackType === 'positive') {
        const selected = record.context?.decision?.selectedPieceId;
        return selected !== null && selected !== undefined && Number.isInteger(Number(selected)) ? Number(selected) : null;
    }
    const instruction = String(record.instruction || '').toLocaleLowerCase('cs');
    const match = instruction.match(/(?:figurk(?:u|a|y|ou)?|fig\.?|\bf)\s*(?:č(?:íslo)?\.?\s*)?([1-4])\b/i);
    if (!match) return null;
    return Number(match[1]) - 1;
}

function findMatchingTrainingExamples(game, instructions) {
    const signature = normalizeTrainingSituation(game);
    return (Array.isArray(instructions) ? instructions : [])
        .filter(record => record && record.context?.game &&
            normalizeTrainingSituation({
                ...record.context.game,
                pieces: record.context.game.piecesBefore || [],
                players: record.context.game.players || [],
                currentPlayer: record.context.game.currentPlayer,
                diceValue: record.context.game.diceValue
            }, record.context.game.piecesBefore || []) === signature)
        .map(record => ({ record, pieceId: getTaughtPieceId(record) }))
        .filter(item => Number.isInteger(item.pieceId) && item.pieceId >= 0 && item.pieceId < 4);
}

/**
 * AI vybírá výhradně z legálních tahů herního enginu.
 * Naučené příklady se použijí jen při přesné shodě herní situace; textová
 * oprava musí jednoznačně označit figurku a tato figurka musí být legální.
 * random je injektovatelný kvůli reprodukovatelným testům.
 */
export function chooseStrategicDecision(game, dependencies, _difficulty = 'medium', random = Math.random, learnedMemory = {}, neuralModel = null) {
    const validMoves = dependencies.getValidMoves(game);
    if (!validMoves.length) return null;

    const candidates = validMoves.map(pieceId => {
        const simulated = cloneGame(game);
        const move = dependencies.movePiece(simulated, pieceId);
        return { pieceId, move, state: simulated, winningMove: simulated.winner === game.currentPlayer };
    });

    const winning = candidates.find(candidate => candidate.winningMove);
    const signature = normalizeTrainingSituation(game);
    const learnedEntry = learnedMemory && !Array.isArray(learnedMemory)
        ? learnedMemory.situations?.[signature]
        : null;
    const votes = Array.isArray(learnedEntry?.votes) ? learnedEntry.votes : [];
    const learnedCandidates = candidates
        .filter(candidate => !candidate.winningMove)
        .map(candidate => ({ ...candidate, votes: Math.max(0, Number(votes[candidate.pieceId]) || 0) }))
        .sort((a, b) => b.votes - a.votes || a.pieceId - b.pieceId);
    const learned = !winning && learnedCandidates.length && learnedCandidates[0].votes > 0
        ? learnedCandidates[0]
        : null;

    const neuralScores = !winning && !learned
        ? scoreAIMoveCandidates(game, candidates, validMoves.length, neuralModel)
        : null;
    const neuralByPiece = new Map((neuralScores || []).map(item => [item.pieceId, item.score]));
    const neuralCandidates = neuralScores
        ? candidates.map(candidate => ({ ...candidate, neuralScore: neuralByPiece.get(candidate.pieceId) }))
            .filter(candidate => Number.isFinite(candidate.neuralScore))
            .sort((a, b) => b.neuralScore - a.neuralScore || a.pieceId - b.pieceId)
        : [];
    const neural = neuralCandidates[0] || null;
    const selected = winning || learned || neural || candidates[Math.min(
        candidates.length - 1,
        Math.floor(Math.max(0, Math.min(0.999999999, Number(random()) || 0)) * candidates.length)
    )];
    const trained = Boolean(learned && !winning && selected.pieceId === learned.pieceId);
    const neuralSelected = Boolean(!winning && !learned && neural && selected.pieceId === neural.pieceId);
    const usedInstructions = trained ? [{
        id: 'memory:' + signature,
        feedbackType: 'compiled-memory',
        matchedBy: 'exact-situation',
        similarity: 1,
        preferredPieceId: learned.pieceId,
        votes: learned.votes,
        positiveCount: Number(learnedEntry.ok) || 0,
        correctionCount: Number(learnedEntry.err) || 0,
        explanation: 'Tuto volbu potvrzuje ' + learned.votes + ' uložených výukových hodnocení.'
    }] : [];

    return {
        pieceId: selected.pieceId,
        reason: winning
            ? 'Okamžitě vítězný tah – hra tím končí.'
            : trained
                ? 'NAUČENO: paměť AI doporučuje figurku ' + (learned.pieceId + 1) +
                    ' na základě ' + learned.votes + ' výukových hodnocení.'
                : neuralSelected
                    ? 'NEURONOVÁ AI: model vyhodnotil ' + validMoves.length + ' legálních tahů a doporučuje figurku ' +
                        (neural.pieceId + 1) + ' (skóre ' + neural.neuralScore.toFixed(4) + ').'
                    : 'Pro tuto přesnou situaci zatím nemám použitelné naučené hodnocení ani aktivní neuronový model. Tah jsem vybrala náhodně z ' +
                        validMoves.length + ' legálních možností.',
        score: winning ? 1 : (trained ? Math.min(0.99, 0.5 + learned.votes / 100) : (neuralSelected ? neural.neuralScore : 0)),
        breakdown: {
            trainedKnowledge: trained,
            neuralNetwork: neuralSelected,
            neuralModelVersion: neuralSelected ? neuralModel.version : null,
            usedInstructions,
            legalMoveCount: validMoves.length,
            selection: winning ? 'immediate-win' : (trained ? 'compiled-memory' : (neuralSelected ? 'neural-network' : 'untrained-random'))
        },
        alternatives: candidates
            .filter(candidate => candidate.pieceId !== selected.pieceId)
            .map(candidate => ({
                pieceId: candidate.pieceId,
                score: candidate.winningMove ? 1 : (trained ? Math.max(0, Number(votes[candidate.pieceId]) || 0) / 100 : (neuralByPiece.get(candidate.pieceId) ?? 0)),
                reason: candidate.winningMove ? 'okamžitá výhra' : (trained ? 'bez vyššího naučeného hodnocení' : (neuralByPiece.has(candidate.pieceId) ? 'neuronové skóre' : 'bez modelového skóre'))
            }))
    };
}


/**
 * Rychlý taktický učitel pro offline self-play.
 * Skóruje pouze kandidáty vytvořené z legálních tahů herního enginu.
 * Neprovádí vlastní změny herního stavu ani neurčuje pravidla.
 */
function estimateFastTrackThreat(game, playerId) {
    const ownPieces = game.pieces[playerId]?.pieces || [];
    let total = 0;
    for (const ownPiece of ownPieces) {
        if (!isMainTrackPiece(ownPiece, game.trackLength)) continue;
        const target = (game.players[playerId].start + ownPiece.steps) % game.trackLength;
        let threat = 0;
        for (const opponent of game.players) {
            if (opponent.id === playerId || opponent.finished) continue;
            for (const piece of game.pieces[opponent.id]?.pieces || []) {
                if (!isMainTrackPiece(piece, game.trackLength)) continue;
                const attacker = (game.players[opponent.id].start + piece.steps) % game.trackLength;
                const distance = (target - attacker + game.trackLength) % game.trackLength;
                if (distance >= 1 && distance <= 6) threat += estimateCaptureProbability(distance);
            }
        }
        total += Math.min(1, threat);
    }
    return total;
}

export function evaluateTacticalCandidates(game, candidates) {
    const playerId = game.currentPlayer;
    const beforeOwnPips = calculatePlayerPips(game, playerId);
    const beforeThreat = estimateFastTrackThreat(game, playerId);
    const beforeOpponentPips = game.players.reduce((sum, player) =>
        player.id === playerId ? sum : sum + calculatePlayerPips(game, player.id), 0);
    return candidates.map(candidate => {
        const state = candidate.state;
        const ownPipsGain = beforeOwnPips - calculatePlayerPips(state, playerId);
        const afterThreat = estimateFastTrackThreat(state, playerId);
        const afterOpponentPips = state.players.reduce((sum, player) =>
            player.id === playerId ? sum : sum + calculatePlayerPips(state, player.id), 0);
        const opponentPipsGain = afterOpponentPips - beforeOpponentPips;
        const captured = candidate.move?.captured || null;
        const winning = candidate.winningMove || state.winner === playerId;
        const selfCapture = Boolean(captured?.ownPiece);
        const enemyCapture = Boolean(captured && !captured.ownPiece);
        const threatReduction = beforeThreat - afterThreat;
        const score = winning ? 100000 :
            ownPipsGain * 0.08 +
            opponentPipsGain * 0.035 +
            threatReduction * 12 +
            (enemyCapture ? 5 : 0) -
            (selfCapture ? 7 : 0) +
            (candidate.move?.finishedNow ? 8 : 0);
        return {
            pieceId: candidate.pieceId,
            score: Number(score.toFixed(6)),
            factors: {
                ownProgress: Number(ownPipsGain.toFixed(3)),
                opponentSetback: Number(opponentPipsGain.toFixed(3)),
                threatReduction: Number(threatReduction.toFixed(4)),
                capturedOpponent: enemyCapture,
                capturedOwnPiece: selfCapture,
                finishedPiece: Boolean(candidate.move?.finishedNow),
                winning
            }
        };
    }).sort((a, b) => b.score - a.score || a.pieceId - b.pieceId);
}

export function chooseTacticalTeacherDecision(game, dependencies) {
    const legalMoves = dependencies.getValidMoves(game);
    if (!legalMoves.length) return null;
    const candidates = legalMoves.map(pieceId => {
        const state = cloneGame(game);
        const move = dependencies.movePiece(state, pieceId);
        return { pieceId, move, state, winningMove: state.winner === game.currentPlayer };
    });
    const ranked = evaluateTacticalCandidates(game, candidates);
    return {
        pieceId: ranked[0].pieceId,
        score: ranked[0].score,
        ranking: ranked,
        reason: ranked[0].factors.winning ? 'immediate-win' : 'tactical-teacher'
    };
}

export function chooseStrategicMove(game, dependencies, difficulty = 'medium') {
    return chooseStrategicDecision(game, dependencies, difficulty)?.pieceId ?? null;
}
