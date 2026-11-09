import { AI_WEIGHT_COUNT, AI_WEIGHT_DEFINITIONS, getAIWeightValues, getAIStrategicWeights } from './ai-weight-config.js';
export { AI_WEIGHT_DEFINITIONS } from './ai-weight-config.js';

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

    // Kombinujeme nezávislé příležitosti soupeřů jako pravděpodobnost
    // alespoň jednoho zásahu, nikoliv prostý součet pravděpodobností.
    let survivalProbability = 1;
    for (const opponent of game.players) {
        if (opponent.id === targetPlayerId || opponent.finished) continue;
        const probability = estimateOpponentHitProbability(
            game, opponent.id, targetPlayerId, targetPieceId, dependencies
        );
        survivalProbability *= 1 - Math.max(0, Math.min(1, probability));
    }
    return Math.max(0, Math.min(1, 1 - survivalProbability));
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
        const state = cloneGame(game);
        const move = dependencies.movePiece(state, pieceId);
        return { pieceId, move, state, winningMove: state.winner === game.currentPlayer };
    });
    const winning = candidates.find(candidate => candidate.winningMove);
    const signature = normalizeTrainingSituation(game);
    const learnedEntry = learnedMemory && !Array.isArray(learnedMemory) ? learnedMemory.situations?.[signature] : null;
    const votes = Array.isArray(learnedEntry?.votes) ? learnedEntry.votes : [];
    const learnedCandidates = candidates.filter(candidate => !candidate.winningMove)
        .map(candidate => ({ ...candidate, votes: Math.max(0, Number(votes[candidate.pieceId]) || 0) }))
        .sort((a, b) => b.votes - a.votes || a.pieceId - b.pieceId);
    const learned = !winning && learnedCandidates[0]?.votes > 0 ? learnedCandidates[0] : null;
    const ranking = winning ? [] : evaluateTacticalCandidates(game, candidates, getAIStrategicWeights(), dependencies);
    const byPiece = new Map(ranking.map(item => [item.pieceId, item]));
    const selected = winning || learned || candidates.find(item => item.pieceId === ranking[0]?.pieceId);
    if (!selected) return null;
    const trained = Boolean(learned && selected.pieceId === learned.pieceId);
    const usedInstructions = trained ? [{
        id: 'memory:' + signature, feedbackType: 'compiled-memory', matchedBy: 'exact-situation',
        similarity: 1, preferredPieceId: learned.pieceId, votes: learned.votes,
        positiveCount: Number(learnedEntry.ok) || 0, correctionCount: Number(learnedEntry.err) || 0,
        explanation: 'Tuto volbu potvrzuje ' + learned.votes + ' uložených výukových hodnocení.'
    }] : [];
    const selectedRank = byPiece.get(selected.pieceId);
    const alternatives = candidates.filter(item => item.pieceId !== selected.pieceId).map(item => {
        const ranked = byPiece.get(item.pieceId);
        return {
            pieceId: item.pieceId,
            score: item.winningMove ? 1000000 : (trained ? Math.max(0, Number(votes[item.pieceId]) || 0) : (ranked?.score ?? 0)),
            reason: item.winningMove ? 'okamžitá výhra' : (trained ? 'bez vyššího naučeného hodnocení' : 'skóre deseti strategických vah'),
            weightFactors: ranked?.factors ?? null
        };
    });
    const weights = getAIStrategicWeights();
    return {
        pieceId: selected.pieceId,
        reason: winning ? 'Okamžitě vítězný tah – hra tím končí.' :
            trained ? 'NAUČENO: paměť AI doporučuje figurku ' + (learned.pieceId + 1) + ' na základě ' + learned.votes + ' výukových hodnocení.' :
            'AI 10 VAH: vyhodnotila všech ' + validMoves.length + ' legálních tahů, simulovala všech šest výsledků další kostky a zohlednila riziko reakcí soupeřů. Vybrala figurku ' + (selected.pieceId + 1) + '.',
        score: winning ? 1000000 : (trained ? Math.min(999999, 500000 + learned.votes) : (selectedRank?.score ?? 0)),
        breakdown: {
            trainedKnowledge: trained, neuralNetwork: false, tacticalTeacher: !winning && !trained,
            weightConfig: { count: AI_WEIGHT_COUNT, keys: Object.keys(weights), values: weights, difficulty: String(difficulty || 'medium') },
            intentionalBlunder: false, usedInstructions, legalMoveCount: validMoves.length,
            selection: winning ? 'immediate-win' : (trained ? 'compiled-memory' : 'weighted-ai-10-v1'),
            selectedWeightFactors: selectedRank?.factors ?? null,
            diceSimulation: selectedRank?.factors?.diceSimulation ?? []
        },
        alternatives
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
    return { label: level === 'easy' ? 'Lehká' : (level === 'hard' ? 'Těžká' : 'Střední') };
}

export function getAIWeightConfiguration() {
    return {
        count: AI_WEIGHT_COUNT,
        definitions: AI_WEIGHT_DEFINITIONS,
        values: getAIWeightValues(),
        weights: getAIStrategicWeights(),
        difficultyPresets: { easy: getDifficultyProfile('easy'), medium: getDifficultyProfile('medium'), hard: getDifficultyProfile('hard') }
    };
}

function estimateDeploymentBonusAttackChance(deployedState, playerId, dependencies) {
    const { getValidMoves, movePiece, rollDice } = dependencies;
    if (deployedState.phase !== 'roll' || deployedState.currentPlayer !== playerId ||
        typeof rollDice !== 'function' || typeof movePiece !== 'function' ||
        typeof getValidMoves !== 'function') return 0;

    let attackDiceCount = 0;
    for (let dice = 1; dice <= 6; dice++) {
        const rolled = cloneGame(deployedState);
        const result = rollDice(rolled, dice);
        if (rolled.phase !== 'move') continue;
        const legalMoves = result.validMoves || getValidMoves(rolled, playerId);
        const canCapture = legalMoves.some(pieceId => {
            const next = cloneGame(rolled);
            const move = movePiece(next, pieceId);
            return Boolean(move.captured && !move.captured.ownPiece);
        });
        if (canCapture) attackDiceCount++;
    }
    return attackDiceCount / 6;
}

function estimateOpponentStartSquareRisk(game, playerId, pieceId) {
    const piece = game.pieces[playerId]?.pieces[pieceId];
    if (!piece || !isMainTrackPiece(piece, game.trackLength)) {
        return { risk: 0, onOpponentStart: false, basePieces: 0, nearGoal: false, opponentId: null };
    }

    const position = (game.players[playerId].start + piece.steps) % game.trackLength;
    let highestRisk = { risk: 0, onOpponentStart: false, basePieces: 0, nearGoal: false, opponentId: null };

    for (const opponent of game.players) {
        if (opponent.id === playerId || opponent.finished || position !== opponent.start) continue;

        const opponentPieces = game.pieces[opponent.id]?.pieces || [];
        const basePieces = opponentPieces.filter(item => item.steps === -1).length;
        const nearGoal = opponentPieces.some(item =>
            item.steps >= game.trackLength - 6 && item.steps <= game.trackLength + 3
        );
        if (basePieces === 0) continue;

        // Na soupeřově startu může soupeř při hodu šestky povinně nasadit
        // další figurku a naši figurku tím vyhodit. Riziko roste s počtem
        // figurek v základně a ještě více, pokud už soupeř míří do cíle.
        const risk = Math.min(1, 0.25 + basePieces * 0.15 + (nearGoal ? 0.3 : 0));
        if (risk > highestRisk.risk) {
            highestRisk = { risk, onOpponentStart: true, basePieces, nearGoal, opponentId: opponent.id };
        }
    }
    return highestRisk;
}

function clampSignal(value) { return Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0)); }

function simulateNextDiceOutcomes(state, playerId, dependencies) {
    const { getValidMoves, movePiece, rollDice } = dependencies;
    if (typeof rollDice !== 'function' || typeof movePiece !== 'function' || typeof getValidMoves !== 'function') return [];
    const outcomes = [];
    for (let dice = 1; dice <= 6; dice++) {
        const branch = cloneGame(state);
        branch.currentPlayer = playerId;
        branch.phase = 'roll';
        branch.diceValue = 0;
        const result = rollDice(branch, dice);
        const legal = result.validMoves || (branch.phase === 'move' ? getValidMoves(branch, playerId) : []);
        let capture = false;
        let finish = false;
        let bonusRoll = branch.currentPlayer === playerId && branch.phase === 'roll' && !result.turnEnded;
        for (const pieceId of legal) {
            const next = cloneGame(branch);
            const move = movePiece(next, pieceId);
            if (move.captured && !move.captured.ownPiece) capture = true;
            if (move.finishedNow || next.winner === playerId) finish = true;
            if (next.currentPlayer === playerId && next.phase === 'roll') bonusRoll = true;
        }
        outcomes.push({ dice, legalMoveCount: legal.length, retrying: Boolean(result.retrying),
            bonusRoll, capture, finish });
    }
    return outcomes;
}

export function evaluateTacticalCandidates(game, candidates, weights = getAIStrategicWeights(), dependencies = {}) {
    const playerId = game.currentPlayer;
    const beforeThreat = estimateFastTrackThreat(game, playerId);
    const strategicWeights = { ...getAIStrategicWeights(), ...(weights || {}) };
    return candidates.map(candidate => {
        const state = candidate.state;
        if (candidate.winningMove || state.winner === playerId) {
            return {
                pieceId: candidate.pieceId,
                score: 1000000,
                trainingScore: 1000000,
                factors: {
                    winning: true,
                    weightSignals: Array(AI_WEIGHT_COUNT).fill(0),
                    weightSignalsByName: Object.fromEntries(AI_WEIGHT_DEFINITIONS.map(item => [item.key, 0])),
                    weightContributions: Object.fromEntries(AI_WEIGHT_DEFINITIONS.map(item => [item.key, 0])),
                    diceSimulation: []
                }
            };
        }
        const beforePiece = game.pieces[playerId]?.pieces[candidate.pieceId];
        const afterPiece = state.pieces[playerId]?.pieces[candidate.pieceId];
        const captured = candidate.move?.captured || null;
        const enemyCapture = Boolean(captured && !captured.ownPiece);
        const selfCapture = Boolean(captured?.ownPiece);
        const winning = Boolean(candidate.winningMove || state.winner === playerId);
        const deployedPiece = Boolean(candidate.move?.deployed || (beforePiece?.steps === -1 && afterPiece?.steps >= 0));
        const enteredHome = Boolean(beforePiece && afterPiece && beforePiece.steps < game.trackLength && afterPiece.steps >= game.trackLength);
        const homeProgress = beforePiece && afterPiece && beforePiece.steps >= game.trackLength && afterPiece.steps >= beforePiece.steps
            ? afterPiece.steps - beforePiece.steps : 0;
        const ownProgressRaw = calculatePlayerPips(game, playerId) - calculatePlayerPips(state, playerId);
        const ownProgress = clampSignal(ownProgressRaw / Math.max(1, game.trackLength));
        const afterThreat = estimateFastTrackThreat(state, playerId);
        const protectOwn = clampSignal((beforeThreat - afterThreat) / 2);
        const probabilityFeatures = calculateAIMoveProbabilityFeatures(game, candidate, dependencies);
        const threatenOpponent = clampSignal(probabilityFeatures.opponentCaptureChance);
        const pieceThreat = afterPiece && isMainTrackPiece(afterPiece, state.trackLength)
            ? estimatePieceThreat(state, playerId, candidate.pieceId, dependencies) : 0;
        const startRisk = estimateOpponentStartSquareRisk(state, playerId, candidate.pieceId);
        const startFieldRisk = -clampSignal(Math.max(pieceThreat, startRisk.risk));
        const diceSimulation = simulateNextDiceOutcomes(state, playerId, dependencies);
        const bonusContinuation = clampSignal(diceSimulation.filter(item => item.bonusRoll).length / 6);
        const flexibility = clampSignal(diceSimulation.reduce((sum, item) => sum + Math.min(4, item.legalMoveCount), 0) / 24);
        const finishPiece = candidate.move?.finishedNow ? 1 : 0;
        const captureOpponent = enemyCapture ? 1 : 0;
        const deploy = deployedPiece ? 1 : 0;
        const home = clampSignal((enteredHome ? 1 : 0) + homeProgress / 4);
        const signals = {
            progressToGoal: ownProgress,
            finishPiece,
            captureOpponent,
            protectOwn,
            threatenOpponent,
            deployPiece: deploy,
            homeProgress: home,
            bonusContinuation,
            startFieldRisk,
            flexibility
        };
        const weightSignals = AI_WEIGHT_DEFINITIONS.map(item => Number(signals[item.key] || 0));
        const score = winning ? 1000000 : AI_WEIGHT_DEFINITIONS.reduce((sum, item) =>
            sum + strategicWeights[item.key] * signals[item.key], 0);
        const factors = {
            ...signals,
            weightSignals,
            weightContributions: Object.fromEntries(AI_WEIGHT_DEFINITIONS.map(item =>
                [item.key, Number((strategicWeights[item.key] * signals[item.key]).toFixed(6))])),
            ownProgressRaw: Number(ownProgressRaw.toFixed(4)),
            ownCaptureRisk: Number(probabilityFeatures.ownCaptureRisk.toFixed(4)),
            opponentCaptureChance: Number(probabilityFeatures.opponentCaptureChance.toFixed(4)),
            safeFinishChance: Number(probabilityFeatures.safeFinishChance.toFixed(4)),
            extraTurnChance: Number(probabilityFeatures.extraTurnChance.toFixed(4)),
            pieceThreat: Number(pieceThreat.toFixed(4)),
            onOpponentStart: startRisk.onOpponentStart,
            opponentStartRisk: Number(startRisk.risk.toFixed(4)),
            enteredHome, homeProgressSteps: homeProgress, deployedPiece, capturedOpponent: enemyCapture,
            capturedOwnPiece: selfCapture, winning, diceSimulation
        };
        return { pieceId: candidate.pieceId, score: Number(score.toFixed(6)),
            trainingScore: Number(score.toFixed(6)), factors };
    }).sort((a, b) => b.score - a.score || a.pieceId - b.pieceId);
}

export function chooseTacticalTeacherDecision(game, dependencies, weights = getAIStrategicWeights()) {
    const legalMoves = dependencies.getValidMoves(game);
    if (!legalMoves.length) return null;
    const candidates = legalMoves.map(pieceId => {
        const state = cloneGame(game);
        const move = dependencies.movePiece(state, pieceId);
        return { pieceId, move, state, winningMove: state.winner === game.currentPlayer };
    });
    const ranked = evaluateTacticalCandidates(game, candidates, weights, dependencies);
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