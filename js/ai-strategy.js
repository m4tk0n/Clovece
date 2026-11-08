import { scoreAIMoveCandidates, isValidAINeuralModel } from './ai-neural-network.js';
import { AI_TACTICAL_WEIGHTS } from './ai-tactical-weights.js';
import { AI_WEIGHT_VALUES, AI_WEIGHT_COUNT, getAIWeight } from './ai-weight-config.js';
export { AI_TACTICAL_WEIGHTS } from './ai-tactical-weights.js';

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
 * Pravděpodobnosti pro konkrétní legální kandidátní tah.
 * Výpočty používají skutečný engine a enumeraci všech šesti hodnot kostky.
 * Zachycení soupeřem je příležitost při jednom hodu každého soupeře;
 * nezahrnuje bonusové hody ani změny pozic způsobené předchozími soupeři.
 */
export function calculateAIMoveProbabilityFeatures(game, candidate, dependencies) {
    const { getValidMoves, movePiece, rollDice } = dependencies;
    const playerId = game.currentPlayer;
    const pieceId = candidate.pieceId;
    const stateAfter = candidate.state;
    const target = stateAfter.pieces[playerId]?.pieces[pieceId];
    const maxSteps = stateAfter.trackLength + 3;
    if (stateAfter.winner !== null) {
        return {
            ownCaptureRisk: 0,
            opponentCaptureChance: 0,
            safeFinishChance: 0,
            extraTurnChance: 0,
            deployAttackRisk: 0
        };
    }

    function prepareRollState(source, activePlayerId) {
        const state = cloneGame(source);
        state.currentPlayer = activePlayerId;
        state.phase = 'roll';
        state.diceValue = 0;
        state.baseRollAttempts = 0;
        state.thirdAttemptSix = false;
        state.consecutiveSixes = 0;
        state.threeSixesPenaltyPending = false;
        return state;
    }

    function enumerateOneRoll(source, activePlayerId, inspect) {
        let successfulDice = 0;
        for (let dice = 1; dice <= 6; dice++) {
            const rolled = prepareRollState(source, activePlayerId);
            const result = rollDice(rolled, dice);
            if (rolled.phase !== 'move') continue;
            const legal = result.validMoves || getValidMoves(rolled, activePlayerId);
            if (!legal.length) continue;
            let success = false;
            for (const legalPieceId of legal) {
                const next = cloneGame(rolled);
                const move = movePiece(next, legalPieceId);
                if (inspect({ next, move, legalPieceId, dice })) {
                    success = true;
                    break;
                }
            }
            if (success) successfulDice++;
        }
        return successfulDice / 6;
    }

    let captureRisk = 0;
    if (target && target.steps >= 0 && target.steps < stateAfter.trackLength &&
        typeof rollDice === 'function' && typeof movePiece === 'function' &&
        typeof getValidMoves === 'function') {
        let survival = 1;
        for (const opponent of stateAfter.players) {
            if (opponent.id === playerId || opponent.finished) continue;
            const opponentChance = enumerateOneRoll(stateAfter, opponent.id, ({ move }) =>
                Boolean(move.captured && !move.captured.ownPiece &&
                    move.captured.playerId === playerId && move.captured.pieceId === pieceId)
            );
            survival *= 1 - opponentChance;
        }
        captureRisk = 1 - survival;
    }

    const canEnumerate = typeof rollDice === 'function' &&
        typeof movePiece === 'function' && typeof getValidMoves === 'function';
    const opponentCaptureChance = canEnumerate
        ? enumerateOneRoll(stateAfter, playerId, ({ move }) =>
            Boolean(move.captured && !move.captured.ownPiece)
        )
        : 0;
    const safeFinishChance = canEnumerate && target && target.steps >= 0 && target.steps < maxSteps
        ? enumerateOneRoll(stateAfter, playerId, ({ next, legalPieceId }) =>
            legalPieceId === pieceId &&
            next.pieces[playerId].pieces[pieceId].steps === maxSteps
        )
        : 0;
    const extraTurnChance = canEnumerate
        ? enumerateOneRoll(stateAfter, playerId, ({ next }) =>
            next.winner === null && next.currentPlayer === playerId && next.phase === 'roll'
        )
        : 0;

    return {
        ownCaptureRisk: Math.max(0, Math.min(1, captureRisk)),
        opponentCaptureChance: Math.max(0, Math.min(1, opponentCaptureChance)),
        safeFinishChance: Math.max(0, Math.min(1, safeFinishChance)),
        extraTurnChance: Math.max(0, Math.min(1, extraTurnChance)),
        deployAttackRisk: candidate.move?.deployed
            ? Math.max(0, Math.min(1, captureRisk))
            : 0
    };
}

/**
 * AI vybírá výhradně z legálních tahů herního enginu.
 * Naučené příklady se použijí jen při přesné shodě herní situace; textová
 * oprava musí jednoznačně označit figurku a tato figurka musí být legální.
 * random je injektovatelný kvůli reprodukovatelným testům.
 */
export function chooseStrategicDecision(game, dependencies, difficulty = 'medium', random = Math.random, learnedMemory = {}, neuralModel = null) {
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

    const tacticalRanking = !winning && !learned
        ? evaluateTacticalCandidates(game, candidates, getRuntimeTacticalWeights(difficulty))
        : [];
    const tacticalByPiece = new Map(tacticalRanking.map(item => [item.pieceId, item]));
    const rankedCandidates = tacticalRanking
        .map(item => candidates.find(candidate => candidate.pieceId === item.pieceId))
        .filter(Boolean);
    const difficultyProfile = getDifficultyProfile(difficulty);
    let tactical = rankedCandidates[0] || null;
    let intentionalBlunder = false;
    if (!winning && !learned && rankedCandidates.length > 1) {
        if (random() < difficultyProfile.blunderRate) {
            tactical = rankedCandidates[Math.floor(random() * rankedCandidates.length)];
            intentionalBlunder = true;
        } else if (difficultyProfile.randomness > 0) {
            const bestScore = tacticalRanking[0]?.score ?? 0;
            const noiseRange = Math.max(1, Math.abs(bestScore) * difficultyProfile.randomness);
            const noisy = tacticalRanking.map(item => ({
                ...item,
                noisyScore: item.score + (random() * 2 - 1) * noiseRange
            })).sort((a, b) => b.noisyScore - a.noisyScore || a.pieceId - b.pieceId);
            tactical = candidates.find(candidate => candidate.pieceId === noisy[0].pieceId) || tactical;
        }
    }
    const neuralCandidatesWithProbabilities = !winning && !learned && isValidAINeuralModel(neuralModel)
        ? (() => {
            const tacticalByPiece = new Map(tacticalRanking.map(item => [item.pieceId, item.factors]));
            return candidates.map(candidate => ({
                ...candidate,
                probabilityFeatures: calculateAIMoveProbabilityFeatures(game, candidate, dependencies),
                tacticalFeatures: tacticalByPiece.get(candidate.pieceId)
            }));
        })()
        : candidates;
    const neuralScores = !winning && !learned && isValidAINeuralModel(neuralModel)
        ? scoreAIMoveCandidates(game, neuralCandidatesWithProbabilities, validMoves.length, neuralModel)
        : null;
    const neuralByPiece = new Map((neuralScores || []).map(item => [item.pieceId, item.score]));
    const neuralCandidates = neuralScores
        ? candidates.map(candidate => ({ ...candidate, neuralScore: neuralByPiece.get(candidate.pieceId) }))
            .filter(candidate => Number.isFinite(candidate.neuralScore))
            .sort((a, b) => b.neuralScore - a.neuralScore || a.pieceId - b.pieceId)
        : [];
    const neural = neuralCandidates[0] || null;
    const neuralSelected = Boolean(!winning && !learned && neural);
    const tacticalSelected = Boolean(!winning && !learned && !neural && tactical);
    const selected = winning || learned || neural || tactical;
    const trained = Boolean(learned && !winning && selected.pieceId === learned.pieceId);
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
                    : tacticalSelected
                        ? 'VÁHOVÁ AI: vyhodnotila ' + validMoves.length + ' legálních tahů pomocí ' + AI_WEIGHT_COUNT + ' načtených vah (' + difficultyProfile.label + ').' +
                            (intentionalBlunder ? ' Záměrná chyba podle nastavení obtížnosti.' : ' Doporučuje figurku ' + (tactical.pieceId + 1) + '.')
                        : 'AI nemá pro tuto situaci použitelné naučené hodnocení.',
        score: winning ? 1 : (trained ? Math.min(0.99, 0.5 + learned.votes / 100) :
            (neuralSelected ? neural.neuralScore : (tacticalSelected ? tacticalByPiece.get(tactical.pieceId).score : 0))),
        breakdown: {
            trainedKnowledge: trained,
            neuralNetwork: neuralSelected,
            tacticalTeacher: tacticalSelected,
            neuralModelVersion: neuralSelected ? neuralModel.version : null,
            weightConfig: { count: AI_WEIGHT_COUNT, difficulty: difficultyProfile.label, aggression: difficultyProfile.aggression, riskMultiplier: difficultyProfile.riskMultiplier, blunderRate: difficultyProfile.blunderRate, randomness: difficultyProfile.randomness, scoredWeightCount: 876, neutralConfigWeightCount: 124, activeWeightIds: Array.from({ length: AI_WEIGHT_COUNT }, (_, index) => index + 1).filter(id => !((id >= 417 && id <= 430) || (id >= 441 && id <= 500) || (id >= 941 && id <= 960) || (id >= 971 && id <= 1000))).map(id => ({ id, value: getAIWeight(id) })) },
            intentionalBlunder,
            usedInstructions,
            legalMoveCount: validMoves.length,
            selection: winning ? 'immediate-win' : (trained ? 'compiled-memory' :
                (neuralSelected ? 'neural-network' : (tacticalSelected ? 'weighted-ai-1000' : 'no-selection'))),
            selectedWeightFactors: tacticalSelected ? tacticalByPiece.get(selected.pieceId)?.factors ?? null : null
        },
        alternatives: candidates
            .filter(candidate => candidate.pieceId !== selected.pieceId)
            .map(candidate => ({
                pieceId: candidate.pieceId,
                score: candidate.winningMove ? 1 : (trained ? Math.max(0, Number(votes[candidate.pieceId]) || 0) / 100 :
                    (neuralSelected ? (neuralByPiece.get(candidate.pieceId) ?? 0) : (tacticalByPiece.get(candidate.pieceId)?.score ?? 0))),
                reason: candidate.winningMove ? 'okamžitá výhra' : (trained ? 'bez vyššího naučeného hodnocení' :
                    (neuralByPiece.has(candidate.pieceId) ? 'neuronové skóre' :
                        (tacticalByPiece.has(candidate.pieceId) ? 'váhové skóre 1000-slot ensemble' : 'bez modelového skóre'))),
                weightFactors: tacticalByPiece.get(candidate.pieceId)?.factors ?? null
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

function getDifficultyProfile(difficulty = 'medium') {
    const level = String(difficulty || 'medium').toLowerCase();
    if (level === 'easy' || level === 'light' || level === 'lehka') {
        return { label: 'Lehká', aggression: getAIWeight(401), riskMultiplier: getAIWeight(414), blunderRate: getAIWeight(408), randomness: getAIWeight(411) };
    }
    if (level === 'hard' || level === 'tezka' || level === 'těžká') {
        return { label: 'Těžká', aggression: getAIWeight(405), riskMultiplier: getAIWeight(416), blunderRate: getAIWeight(410), randomness: getAIWeight(413) };
    }
    return { label: 'Střední', aggression: getAIWeight(403), riskMultiplier: getAIWeight(415), blunderRate: getAIWeight(409), randomness: getAIWeight(412) };
}

function getRuntimeTacticalWeights(difficulty = 'medium') {
    const profile = getDifficultyProfile(difficulty);
    return {
        ...AI_TACTICAL_WEIGHTS,
        aggression: profile.aggression,
        riskMultiplier: profile.riskMultiplier
    };
}

/** Všech 1000 číselných položek je načteno; aktivní strategické váhy jsou mapovány podle ID. */
export function getAIWeightConfiguration() {
    return {
        count: AI_WEIGHT_COUNT,
        values: AI_WEIGHT_VALUES.slice(),
        difficultyPresets: {
            easy: getDifficultyProfile('easy'),
            medium: getDifficultyProfile('medium'),
            hard: getDifficultyProfile('hard')
        }
    };
}

export function evaluateTacticalCandidates(game, candidates, weights = AI_TACTICAL_WEIGHTS) {
    const playerId = game.currentPlayer;
    const beforeOwnPips = calculatePlayerPips(game, playerId);
    const beforeThreat = estimateFastTrackThreat(game, playerId);
    const beforeOpponentPips = game.players.reduce((sum, player) =>
        player.id === playerId ? sum : sum + calculatePlayerPips(game, player.id), 0);
    const aggressionScale = Math.max(0, Number(weights.aggression ?? getAIWeight(403))) / 150;
    const riskMultiplier = Math.max(0, Number(weights.riskMultiplier ?? getAIWeight(415)));
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
        const beforeSteps = game.pieces[playerId]?.pieces[candidate.pieceId]?.steps ?? -1;
        const afterSteps = state.pieces[playerId]?.pieces[candidate.pieceId]?.steps ?? -1;
        const deployedPiece = Boolean(candidate.move?.deployed || (beforeSteps === -1 && afterSteps >= 0));
        const enteredHome = beforeSteps < game.trackLength && afterSteps >= game.trackLength;
        const homeProgress = beforeSteps >= game.trackLength && afterSteps >= beforeSteps
            ? afterSteps - beforeSteps : 0;
        const captureContext = captured && !captured.ownPiece
            ? (captured.steps >= game.trackLength - 6 ? getAIWeight(2) : (captured.steps <= 3 ? getAIWeight(3) : getAIWeight(1)))
            : 0;
        const progressScore = ownPipsGain * (getAIWeight(21) / 100) +
            Math.max(0, afterSteps - beforeSteps) * getAIWeight(22);
        const captureScore = enemyCapture ? (captureContext / 10) * aggressionScale : 0;
        const selfCaptureScore = selfCapture ? -(getAIWeight(11) / 10) : 0;
        const riskScore = -(Math.abs(getAIWeight(12)) * Math.max(0, afterThreat) / 100) * riskMultiplier +
            (getAIWeight(13) * Math.max(0, threatReduction) / 10);
        const homeScore = (enteredHome ? getAIWeight(23) / 10 : 0) +
            (candidate.move?.finishedNow ? getAIWeight(24) / 10 : 0) +
            homeProgress * (getAIWeight(25) / 10) +
            (afterSteps === game.trackLength + 2 ? getAIWeight(27) / 10 : 0);
        const baseScore = deployedPiece ? getAIWeight(31) / 10 : 0;
        const dynamicScore = (opponentPipsGain * (getAIWeight(1) / 100) * aggressionScale) +
            (ownPipsGain * (getAIWeight(30) / 100)) +
            (threatReduction * (getAIWeight(60) / 10));

        // Kompletní 1000-slot ensemble: každá položka konfigurace se projde
        // při hodnocení každého legálního tahu. Deset kanálů představuje
        // postup, útok, obranu, domeček, nasazení, tlak na soupeře,
        // dokončení, poziční výhodu, flexibilitu a riziko.
        // Položky označené ve zdroji jako systémová metadata, kontrolní značky
        // nebo rezervované sloty jsou záměrně neutrální (nesmějí ovlivňovat tah).
        const weightSignals = [
            Math.max(-1, Math.min(1, ownPipsGain / 12)),
            enemyCapture ? 1 : 0,
            Math.max(-1, Math.min(1, threatReduction)),
            enteredHome ? 1 : Math.max(-1, Math.min(1, homeProgress / 4)),
            deployedPiece ? 1 : 0,
            Math.max(-1, Math.min(1, opponentPipsGain / 12)),
            candidate.move?.finishedNow ? 1 : 0,
            Math.max(-1, Math.min(1, (afterSteps - (game.trackLength / 2)) / Math.max(1, game.trackLength / 2))),
            Math.max(-1, Math.min(1, (ownPipsGain + opponentPipsGain) / 16)),
            Math.max(-1, Math.min(1, -afterThreat))
        ];
        let allWeightsScore = 0;
        let scoredWeightCount = 0;
        let neutralConfigWeightCount = 0;
        for (let id = 1; id <= AI_WEIGHT_COUNT; id++) {
            const metadataOnly = (id >= 417 && id <= 430) ||
                (id >= 441 && id <= 500) ||
                (id >= 941 && id <= 960) ||
                (id >= 971 && id <= 1000);
            if (metadataOnly) {
                neutralConfigWeightCount++;
                continue;
            }
            const rawWeight = getAIWeight(id);
            const boundedWeight = Math.tanh(rawWeight / 100);
            const signal = weightSignals[(id - 1) % weightSignals.length];
            allWeightsScore += boundedWeight * signal;
            scoredWeightCount++;
        }
        // Normalizace drží příspěvek 876 strategických slotů v rozumném
        // rozsahu, ale změna kterékoliv aktivní hodnoty může změnit pořadí tahů.
        allWeightsScore = (allWeightsScore / Math.sqrt(Math.max(1, scoredWeightCount))) * 8;

        const score = winning ? 1000000 :
            progressScore + captureScore + selfCaptureScore + riskScore + homeScore + baseScore + dynamicScore +
            allWeightsScore +
            (enemyCapture ? weights.captureOpponent : 0) -
            (selfCapture ? weights.captureOwn : 0) +
            (deployedPiece ? weights.deployPiece : 0) +
            (enteredHome ? weights.enterHome : 0) +
            homeProgress * weights.homeProgress;
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
                deployedPiece,
                enteredHome,
                homeProgress: Number(homeProgress.toFixed(3)),
                aggressionScale: Number(aggressionScale.toFixed(3)),
                riskMultiplier,
                weightCount: AI_WEIGHT_COUNT,
                scoredWeightCount,
                neutralConfigWeightCount,
                allWeightsScore: Number(allWeightsScore.toFixed(6)),
                winning
            }
        };
    }).sort((a, b) => b.score - a.score || a.pieceId - b.pieceId);
}

export function chooseTacticalTeacherDecision(game, dependencies, weights = AI_TACTICAL_WEIGHTS) {
    const legalMoves = dependencies.getValidMoves(game);
    if (!legalMoves.length) return null;
    const candidates = legalMoves.map(pieceId => {
        const state = cloneGame(game);
        const move = dependencies.movePiece(state, pieceId);
        return { pieceId, move, state, winningMove: state.winner === game.currentPlayer };
    });
    const ranked = evaluateTacticalCandidates(game, candidates, weights);
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
