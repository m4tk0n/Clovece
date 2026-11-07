/**
 * Search-guided policy learning for Člověče, nezlob se!
 *
 * MCTS supplies a stronger target distribution over legal actions. A 1000-input
 * quadratic feature policy learns to reproduce those targets from state/action features.
 * All legal actions and transitions still come from game-engine.js.
 */
import { calculatePlayerPips, chooseStrategicDecision } from './ai-strategy.js';

const LEGACY_V2_BASE_FEATURES = Object.freeze([
    'strategic_score', 'progress', 'opponent_capture', 'finish_piece',
    'deploy_piece', 'own_capture', 'enter_home', 'route_spread',
    'expected_own_loss', 'base_pieces', 'home_pieces',
    'opponent_progress_advantage', 'capture_risk_after', 'threat_count_after',
    'bonus_roll_legal_options', 'bonus_roll_expected_gain',
    'bonus_roll_capture_chance', 'dice_value', 'consecutive_sixes',
    'rule_three_rolls', 'rule_must_deploy', 'rule_skip_home_pieces',
    'rule_must_enter_home', 'rule_three_sixes_penalty'
]);

export const SEARCH_BASE_FEATURES = Object.freeze([
    'strategic_score', 'progress', 'opponent_capture', 'finish_piece',
    'deploy_piece', 'own_capture', 'enter_home', 'route_spread',
    'expected_own_loss', 'base_pieces', 'home_pieces',
    'opponent_progress_advantage', 'capture_risk_after', 'threat_count_after',
    'bonus_roll_legal_options', 'bonus_roll_expected_gain',
    'bonus_roll_capture_chance', 'dice_value', 'consecutive_sixes',
    'rule_three_rolls', 'rule_must_deploy', 'rule_skip_home_pieces',
    'rule_must_enter_home', 'rule_three_sixes_penalty',
    'active_pieces_after', 'base_pieces_after',
    'home_pieces_after', 'moved_piece_progress', 'moved_piece_distance_home',
    'moved_piece_remaining_route', 'closest_opponent_distance',
    'average_opponent_distance', 'opponent_threats_before',
    'opponent_threats_after', 'own_finish_probability_next_roll',
    'own_deploy_probability_next_roll', 'opponent_active_piece_density',
    'own_lead_over_best_opponent', 'own_gap_to_farthest_opponent',
    'players_remaining', 'player_count', 'board_length_scale',
    'route_coverage_after', 'cluster_density_after'
]);

const SEARCH_INTERACTION_FEATURES = [];
for (let left = 0; left < SEARCH_BASE_FEATURES.length; left++) {
    for (let right = left + 1; right < SEARCH_BASE_FEATURES.length; right++) {
        SEARCH_INTERACTION_FEATURES.push(
            SEARCH_BASE_FEATURES[left] + '__x__' + SEARCH_BASE_FEATURES[right]
        );
    }
}

const SEARCH_TRIPLE_FEATURES = Object.freeze([
    ['deploy_piece', 'bonus_roll_expected_gain', 'bonus_roll_capture_chance'],
    ['deploy_piece', 'opponent_capture', 'bonus_roll_legal_options'],
    ['capture_risk_after', 'opponent_progress_advantage', 'active_pieces_after'],
    ['finish_piece', 'enter_home', 'rule_must_enter_home'],
    ['own_capture', 'opponent_threats_after', 'capture_risk_after'],
    ['progress', 'moved_piece_distance_home', 'own_finish_probability_next_roll'],
    ['rule_must_deploy', 'deploy_piece', 'base_pieces'],
    ['rule_skip_home_pieces', 'home_pieces', 'strategic_score'],
    ['consecutive_sixes', 'rule_three_sixes_penalty', 'dice_value'],
    ['route_coverage_after', 'route_spread', 'cluster_density_after']
].map(names => Object.freeze({
    names,
    key: names.join('__x__')
})));

export const SEARCH_FEATURES = Object.freeze([
    ...SEARCH_BASE_FEATURES,
    ...SEARCH_INTERACTION_FEATURES,
    ...SEARCH_TRIPLE_FEATURES.map(item => item.key)
]);

if (SEARCH_BASE_FEATURES.length !== 44 ||
    SEARCH_INTERACTION_FEATURES.length !== 946 ||
    SEARCH_FEATURES.length !== 1000) {
    throw new Error('AI feature schema must contain exactly 44 base, 946 pairwise and 10 triple features.');
}

const LEGACY_V2_FEATURES = Object.freeze([
    ...LEGACY_V2_BASE_FEATURES,
    ...LEGACY_V2_BASE_FEATURES.flatMap((left, index) =>
        LEGACY_V2_BASE_FEATURES.slice(index + 1).map(right => left + '__x__' + right)
    )
]);

export const SEARCH_RULE_KEYS = Object.freeze([
    'threeRolls',
    'mustDeploy',
    'skipHomePieces',
    'mustEnterHome',
    'threeSixesPenalty'
]);

export const SEARCH_RULE_PROFILES = Object.freeze(Array.from({ length: 32 }, (_, mask) =>
    Object.freeze(Object.fromEntries(SEARCH_RULE_KEYS.map((key, bit) =>
        [key, Boolean(mask & (1 << bit))]
    )))
));

export const DEFAULT_SEARCH_MODEL = Object.freeze({
    format: 'clovece-search-policy',
    version: 3,
    generation: 0,
    decisionsTrained: 0,
    gamesTrained: 0,
    weights: Object.freeze(Array(SEARCH_FEATURES.length).fill(0)),
    learningRate: 0.02,
    temperature: 0.22,
    featureNames: SEARCH_FEATURES,
    dynamicParameters: Object.freeze([])
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const clone = value => JSON.parse(JSON.stringify(value));

function softmax(scores, temperature) {
    const scaled = scores.map(score => score / temperature);
    const maximum = Math.max(...scaled);
    const exps = scaled.map(value => Math.exp(clamp(value - maximum, -40, 0)));
    const sum = exps.reduce((total, value) => total + value, 0);
    return exps.map(value => value / Math.max(sum, Number.EPSILON));
}

export function createSearchModel(source = DEFAULT_SEARCH_MODEL) {
    const isLegacyV1 = source?.format === DEFAULT_SEARCH_MODEL.format &&
        source.version === 1 && Array.isArray(source.weights) && source.weights.length === 10;
    const isLegacyV2 = source?.format === DEFAULT_SEARCH_MODEL.format &&
        source.version === 2 && Array.isArray(source.weights) &&
        source.weights.length === LEGACY_V2_FEATURES.length;
    const isCurrentV3 = source?.format === DEFAULT_SEARCH_MODEL.format &&
        source.version === 3 && Array.isArray(source.weights) &&
        source.weights.length === SEARCH_FEATURES.length;
    if (!isLegacyV1 && !isLegacyV2 && !isCurrentV3) {
        throw new Error('Model search-guided AI má neplatný formát nebo verzi.');
    }

    let weights;
    if (isCurrentV3) {
        weights = source.weights.map(Number);
    } else {
        weights = Array(SEARCH_FEATURES.length).fill(0);
        if (isLegacyV2) {
            const oldNames = Array.isArray(source.featureNames) &&
                source.featureNames.length === source.weights.length
                ? source.featureNames
                : LEGACY_V2_FEATURES;
            const newIndex = new Map(SEARCH_FEATURES.map((name, index) => [name, index]));
            source.weights.forEach((value, index) => {
                const targetIndex = newIndex.get(oldNames[index]);
                if (targetIndex !== undefined) weights[targetIndex] = Number(value);
            });
        } else {
            const old = source.weights.map(Number);
            for (let index = 0; index <= 6; index++) weights[index] = old[index];
            weights[7] = old[8]; // route_spread
            weights[8] = old[9]; // expected_own_loss
            weights[9] = -old[7]; // active pieces represented by fewer base/home pieces
            weights[10] = -old[7];
        }
    }

    const model = {
        ...DEFAULT_SEARCH_MODEL,
        ...source,
        format: DEFAULT_SEARCH_MODEL.format,
        version: DEFAULT_SEARCH_MODEL.version,
        weights,
        featureNames: [...SEARCH_FEATURES],
        dynamicParameters: Array.isArray(source?.dynamicParameters)
            ? source.dynamicParameters.filter(item => item && typeof item.key === 'string')
                .slice(0, 50000).map((item, index) => ({
                    id: 1001 + index,
                    key: item.key,
                    weight: clamp(Number(item.weight) || 0, -5, 5),
                    visits: Math.max(0, Math.floor(Number(item.visits) || 0)),
                    teacherSupport: Math.max(0, Math.floor(Number(item.teacherSupport) || 0)),
                    teacherRejects: Math.max(0, Math.floor(Number(item.teacherRejects) || 0)),
                    createdGeneration: Math.max(0, Math.floor(Number(item.createdGeneration) || 0)),
                    lastUpdatedGeneration: Math.max(0, Math.floor(Number(item.lastUpdatedGeneration) || 0))
                }))
            : [],
        migratedFromVersion: isLegacyV1 ? 1 : isLegacyV2 ? 2 : (source?.migratedFromVersion ?? null)
    };

    if (model.weights.length !== SEARCH_FEATURES.length ||
        model.weights.some(value => !Number.isFinite(value))) {
        throw new Error('Model search-guided AI má neplatný formát nebo počet vah.');
    }
    model.weights = model.weights.map(value => clamp(value, -5, 5));
    model.learningRate = (isLegacyV1 || isLegacyV2)
        ? DEFAULT_SEARCH_MODEL.learningRate
        : clamp(Number(model.learningRate) || DEFAULT_SEARCH_MODEL.learningRate, 0.001, 0.2);
    model.temperature = clamp(Number(model.temperature) || DEFAULT_SEARCH_MODEL.temperature, 0.04, 1);
    model.generation = Math.max(0, Math.floor(Number(model.generation) || 0));
    model.decisionsTrained = Math.max(0, Math.floor(Number(model.decisionsTrained) || 0));
    model.gamesTrained = Math.max(0, Math.floor(Number(model.gamesTrained) || 0));
    return model;
}

function compactState(game) {
    return {
        currentPlayer: game.currentPlayer,
        dice: game.diceValue,
        phase: game.phase,
        turn: game.turnNumber,
        trackLength: game.trackLength,
        rules: game.rules,
        startRolls: game.startRolls,
        baseRollAttempts: game.baseRollAttempts,
        thirdAttemptSix: game.thirdAttemptSix,
        consecutiveSixes: game.consecutiveSixes,
        threeSixesPenaltyPending: game.threeSixesPenaltyPending,
        lastMove: game.lastMove,
        players: game.players.map(player => ({
            id: player.id,
            start: player.start,
            finished: Boolean(player.finished),
            pieces: game.pieces[player.id].pieces.map(piece => piece.steps)
        }))
    };
}

function routeSpread(game, playerId) {
    const occupied = game.pieces[playerId].pieces
        .filter(piece => piece.steps >= 0 && piece.steps < game.trackLength)
        .map(piece => Math.floor((piece.steps / game.trackLength) * 4));
    return new Set(occupied).size / 4;
}

function assessBonusRoll(simulation, playerId, dependencies, trackLength) {
    if (simulation.currentPlayer !== playerId || simulation.phase !== 'roll' ||
        typeof dependencies.rollDice !== 'function') {
        return { legalOptions: 0, expectedGain: 0, captureChance: 0 };
    }

    let optionTotal = 0;
    let gainTotal = 0;
    let captureRolls = 0;
    const beforePips = calculatePlayerPips(simulation, playerId);

    for (let die = 1; die <= 6; die++) {
        const rolled = clone(simulation);
        dependencies.rollDice(rolled, die);
        const moves = rolled.phase === 'move' ? dependencies.getValidMoves(rolled) : [];
        optionTotal += Math.min(4, moves.length) / 4;

        let bestGain = 0;
        let canCapture = false;
        for (const nextPieceId of moves) {
            const after = clone(rolled);
            const result = dependencies.movePiece(after, nextPieceId);
            const afterPips = calculatePlayerPips(after, playerId);
            bestGain = Math.max(bestGain,
                (beforePips - afterPips) / Math.max(1, trackLength * 4));
            if (result.captured && !result.captured.ownPiece) canCapture = true;
        }
        gainTotal += clamp(bestGain, -1, 1);
        if (canCapture) captureRolls++;
    }

    return {
        legalOptions: optionTotal / 6,
        expectedGain: gainTotal / 6,
        captureChance: captureRolls / 6
    };
}

function assessThreatsAfterMove(game, simulation, playerId, pieceId) {
    const trackLength = Math.max(1, game.trackLength);
    const moved = simulation.pieces[playerId].pieces[pieceId];
    if (moved.steps < 0 || moved.steps >= trackLength) {
        return { risk: 0, count: 0 };
    }

    const target = (simulation.players[playerId].start + moved.steps) % trackLength;
    let threatCount = 0;
    let captureProbability = 0;

    for (const opponent of simulation.players) {
        if (opponent.id === playerId || opponent.finished) continue;
        const distances = new Set();
        for (const piece of simulation.pieces[opponent.id].pieces) {
            if (piece.steps < 0 || piece.steps >= trackLength) continue;
            const position = (opponent.start + piece.steps) % trackLength;
            const distance = (target - position + trackLength) % trackLength;
            if (distance >= 1 && distance <= 6) {
                threatCount++;
                distances.add(distance);
            }
        }
        captureProbability += distances.size / 6;
    }

    return {
        risk: clamp(captureProbability, 0, 1),
        count: clamp(threatCount / 12, 0, 1)
    };
}

function actionFeatures(game, pieceId, dependencies, strategic) {
    const playerId = game.currentPlayer;
    const trackLength = Math.max(1, game.trackLength);
    const beforePips = calculatePlayerPips(game, playerId);
    const beforeSpread = routeSpread(game, playerId);
    const simulation = clone(game);
    const transition = dependencies.movePiece(simulation, pieceId);
    const afterPips = calculatePlayerPips(simulation, playerId);
    const ownCapture = Boolean(transition.captured?.ownPiece);
    let captureValue = 0;

    if (transition.captured && !ownCapture) {
        const victimBefore = calculatePlayerPips(game, transition.captured.playerId);
        const victimAfter = calculatePlayerPips(simulation, transition.captured.playerId);
        captureValue = clamp((victimAfter - victimBefore) / (trackLength * 4), 0, 1);
    }

    const strategicOption = [strategic, ...(strategic?.alternatives || [])]
        .find(item => item?.pieceId === pieceId);
    const isEnteringHome = !transition.deployed &&
        game.pieces[playerId].pieces[pieceId].steps < trackLength &&
        simulation.pieces[playerId].pieces[pieceId].steps >= trackLength;
    const threatsBefore = assessThreatsAfterMove(game, game, playerId, pieceId);
    const threatsAfter = assessThreatsAfterMove(game, simulation, playerId, pieceId);
    const bonus = assessBonusRoll(simulation, playerId, dependencies, trackLength);
    const opponents = simulation.players.filter(player =>
        player.id !== playerId && !player.finished
    );
    const opponentPips = opponents.map(player => calculatePlayerPips(simulation, player.id));
    const opponentAverage = opponentPips.length
        ? opponentPips.reduce((sum, value) => sum + value, 0) / opponentPips.length
        : afterPips;
    const bestOpponentPips = opponentPips.length ? Math.min(...opponentPips) : afterPips;
    const farthestOpponentPips = opponentPips.length ? Math.max(...opponentPips) : afterPips;
    const afterPieces = simulation.pieces[playerId].pieces;
    const baseCount = game.pieces[playerId].pieces.filter(piece => piece.steps === -1).length;
    const homeCount = game.pieces[playerId].pieces.filter(piece => piece.steps >= trackLength).length;
    const afterBaseCount = afterPieces.filter(piece => piece.steps === -1).length;
    const afterHomeCount = afterPieces.filter(piece => piece.steps >= trackLength).length;
    const afterTrackPieces = afterPieces.filter(piece => piece.steps >= 0 && piece.steps < trackLength);
    const activeCount = afterTrackPieces.length;
    const movedPiece = afterPieces[pieceId];
    const movedSteps = movedPiece.steps;
    const finishDistance = trackLength + 3 - movedSteps;
    const finishProbability = movedSteps >= 0 && movedSteps < trackLength + 3 &&
        finishDistance >= 1 && finishDistance <= 6 ? 1 / 6 : 0;
    const deployProbability = afterBaseCount > 0 ? 1 / 6 : 0;
    const targetPosition = movedSteps >= 0 && movedSteps < trackLength
        ? (simulation.players[playerId].start + movedSteps) % trackLength
        : null;
    const opponentDistances = [];
    if (targetPosition !== null) {
        for (const opponent of opponents) {
            for (const piece of simulation.pieces[opponent.id].pieces) {
                if (piece.steps < 0 || piece.steps >= trackLength) continue;
                const position = (opponent.start + piece.steps) % trackLength;
                const distance = (position - targetPosition + trackLength) % trackLength;
                opponentDistances.push(distance);
            }
        }
    }
    const nearestOpponentDistance = opponentDistances.length
        ? Math.min(...opponentDistances) : trackLength;
    const averageOpponentDistance = opponentDistances.length
        ? opponentDistances.reduce((sum, value) => sum + value, 0) / opponentDistances.length
        : trackLength;
    let clusterPairs = 0;
    for (let left = 0; left < afterTrackPieces.length; left++) {
        for (let right = left + 1; right < afterTrackPieces.length; right++) {
            const a = afterTrackPieces[left].steps;
            const b = afterTrackPieces[right].steps;
            const distance = Math.min(Math.abs(a - b), trackLength - Math.abs(a - b));
            if (distance <= 6) clusterPairs++;
        }
    }
    const maximumClusterPairs = 6;
    const breakdown = strategicOption?.breakdown || {};
    const playerCount = simulation.players.length;
    const baseFeatures = [
        clamp(Number(strategicOption?.score) || 0, 0, 1),
        clamp((beforePips - afterPips) / trackLength, -1, 1),
        captureValue,
        transition.finishedNow ? 1 : 0,
        transition.deployed ? 1 : 0,
        ownCapture ? 1 : 0,
        isEnteringHome ? 1 : 0,
        routeSpread(simulation, playerId) - beforeSpread,
        clamp((Number(breakdown.expectedOwnLoss) || 0) / (trackLength * 4), 0, 1),
        baseCount / 4,
        homeCount / 4,
        clamp((opponentAverage - beforePips) / (trackLength * 4), -1, 1),
        threatsAfter.risk,
        threatsAfter.count,
        bonus.legalOptions,
        bonus.expectedGain,
        bonus.captureChance,
        clamp((Number(game.diceValue) || 0) / 6, 0, 1),
        clamp((Number(game.consecutiveSixes) || 0) / 3, 0, 1),
        game.rules?.threeRolls === false ? 0 : 1,
        game.rules?.mustDeploy === false ? 0 : 1,
        game.rules?.skipHomePieces === false ? 0 : 1,
        game.rules?.mustEnterHome === false ? 0 : 1,
        game.rules?.threeSixesPenalty === true ? 1 : 0,
        activeCount / 4,
        afterBaseCount / 4,
        afterHomeCount / 4,
        movedSteps >= 0 ? clamp(movedSteps / (trackLength + 3), 0, 1) : -1,
        movedSteps >= 0 ? clamp((trackLength + 3 - movedSteps) / (trackLength + 3), 0, 1) : 1,
        movedSteps >= 0 && movedSteps < trackLength
            ? clamp((trackLength - movedSteps) / trackLength, 0, 1) : 0,
        clamp(nearestOpponentDistance / trackLength, 0, 1),
        clamp(averageOpponentDistance / trackLength, 0, 1),
        threatsBefore.count,
        threatsAfter.count,
        finishProbability,
        deployProbability,
        opponents.length ? opponents.reduce((sum, opponent) => sum +
            simulation.pieces[opponent.id].pieces.filter(piece => piece.steps >= 0 && piece.steps < trackLength).length, 0) /
            (opponents.length * 4) : 0,
        clamp((bestOpponentPips - afterPips) / (trackLength * 4), -1, 1),
        clamp((farthestOpponentPips - afterPips) / (trackLength * 4), -1, 1),
        simulation.players.filter(player => !player.finished).length / playerCount,
        clamp((playerCount - 2) / 6, 0, 1),
        clamp(trackLength / 80, 0, 1),
        routeSpread(simulation, playerId),
        clusterPairs / maximumClusterPairs
    ];

    const features = [...baseFeatures];
    for (let left = 0; left < baseFeatures.length; left++) {
        for (let right = left + 1; right < baseFeatures.length; right++) {
            features.push(baseFeatures[left] * baseFeatures[right]);
        }
    }
    const baseIndex = new Map(SEARCH_BASE_FEATURES.map((name, index) => [name, index]));
    for (const triple of SEARCH_TRIPLE_FEATURES) {
        const [a, b, c] = triple.names.map(name => baseFeatures[baseIndex.get(name)]);
        features.push(a * b * c);
    }
    if (baseFeatures.length !== SEARCH_BASE_FEATURES.length ||
        features.length !== SEARCH_FEATURES.length) {
        throw new Error('AI vytvořila neplatný počet vstupních vlastností.');
    }

    return {
        features,
        transition: {
            deployed: Boolean(transition.deployed),
            captured: transition.captured ? {
                playerId: transition.captured.playerId,
                pieceId: transition.captured.pieceId,
                ownPiece: ownCapture
            } : null,
            finishedNow: Boolean(transition.finishedNow),
            nextPhase: simulation.phase,
            resultingSteps: simulation.pieces[playerId].pieces[pieceId].steps
        }
    };
}

const DYNAMIC_FEATURE_LIMIT = 50000;
const DYNAMIC_FEATURES_PER_ACTION = 8;

function dynamicBucket(value) {
    const magnitude = Math.min(4, Math.floor(Math.abs(value) * 5));
    return (value < 0 ? 'n' : 'p') + magnitude;
}

function dynamicPatterns(baseFeatures) {
    const active = baseFeatures.map((value, index) => ({
        index, value: Number(value) || 0, strength: Math.abs(Number(value) || 0)
    })).filter(item => item.strength >= 0.08)
        .sort((a, b) => b.strength - a.strength)
        .slice(0, 9);
    const candidates = [];
    for (let left = 0; left < active.length; left++) {
        for (let right = left + 1; right < active.length; right++) {
            const a = active[left], b = active[right];
            candidates.push({
                key: 'd1:' + a.index + ':' + dynamicBucket(a.value) + ':' + b.index + ':' + dynamicBucket(b.value),
                value: 1,
                strength: a.strength * b.strength,
                featureNames: [SEARCH_BASE_FEATURES[a.index], SEARCH_BASE_FEATURES[b.index]]
            });
        }
    }
    return candidates.sort((a, b) => b.strength - a.strength)
        .slice(0, DYNAMIC_FEATURES_PER_ACTION)
        .map(({ key, value, featureNames }) => ({ key, value, featureNames }));
}

function registerDynamicPatterns(model, actions) {
    const byKey = new Map(model.dynamicParameters.map(item => [item.key, item]));
    const created = [];
    for (const action of actions) {
        action.dynamicFeatures = dynamicPatterns(action.features.slice(0, SEARCH_BASE_FEATURES.length));
        for (const feature of action.dynamicFeatures) {
            let parameter = byKey.get(feature.key);
            if (!parameter && model.dynamicParameters.length < DYNAMIC_FEATURE_LIMIT) {
                parameter = {
                    id: 1001 + model.dynamicParameters.length,
                    key: feature.key,
                    featureNames: feature.featureNames,
                    weight: 0,
                    visits: 0,
                    teacherSupport: 0,
                    teacherRejects: 0,
                    createdGeneration: model.generation,
                    lastUpdatedGeneration: model.generation
                };
                model.dynamicParameters.push(parameter);
                byKey.set(feature.key, parameter);
                created.push({ id: parameter.id, key: parameter.key, featureNames: parameter.featureNames });
            }
            if (parameter) feature.id = parameter.id;
        }
    }
    return created;
}

function policyActionScore(action, model, dynamicById = null) {
    const fixed = action.features.reduce((sum, value, index) => sum + value * model.weights[index], 0);
    const lookup = dynamicById || new Map(model.dynamicParameters.map(item => [item.id, item]));
    const dynamic = (action.dynamicFeatures || []).reduce((sum, feature) =>
        sum + feature.value * (lookup.get(feature.id)?.weight || 0), 0);
    return fixed + dynamic;
}

/**
 * Creates a policy decision from MCTS visit counts. The teacher distribution
 * is kept separately from the student's policy probabilities.
 */
export function chooseSearchPolicyMove(game, dependencies, modelInput, teacherDecision, random = Math.random) {
    const model = createSearchModel(modelInput);
    const legalMoves = dependencies.getValidMoves(game);
    if (!legalMoves.length) return null;
    if (!teacherDecision || !Array.isArray(teacherDecision.ranked) || !teacherDecision.ranked.length) {
        throw new Error('MCTS neposkytlo hodnocení legálních tahů.');
    }

    const strategic = chooseStrategicDecision(game, dependencies, 'medium');
    const teacherByMove = new Map(teacherDecision.ranked.map(item => [item.pieceId, item]));
    const actions = legalMoves.map(pieceId => {
        const extracted = actionFeatures(game, pieceId, dependencies, strategic);
        const teacher = teacherByMove.get(pieceId);
        return {
            pieceId,
            features: extracted.features,
            transition: extracted.transition,
            teacherVisits: Number(teacher?.visits) || 0,
            teacherScore: Number(teacher?.score) || 0
        };
    });

    const newDynamicParameters = registerDynamicPatterns(model, actions);
    const dynamicById = new Map(model.dynamicParameters.map(item => [item.id, item]));
    const visitTotal = actions.reduce((sum, action) => sum + action.teacherVisits, 0);
    if (visitTotal <= 0) throw new Error('MCTS neposkytlo žádné návštěvy pro legální tahy.');
    const targets = actions.map(action => action.teacherVisits / visitTotal);
    const probabilities = softmax(actions.map(action =>
        policyActionScore(action, model, dynamicById)
    ), model.temperature);

    let draw = random();
    let selectedIndex = probabilities.length - 1;
    for (let index = 0; index < probabilities.length; index++) {
        draw -= probabilities[index];
        if (draw <= 0) {
            selectedIndex = index;
            break;
        }
    }

    return {
        pieceId: actions[selectedIndex].pieceId,
        model,
        newDynamicParameters,
        experience: {
            state: compactState(game),
            legalActions: actions.map((action, index) => ({
                pieceId: action.pieceId,
                features: action.features,
                teacherVisits: action.teacherVisits,
                teacherScore: Number(action.teacherScore.toFixed(6)),
                targetProbability: Number(targets[index].toFixed(8)),
                policyProbability: Number(probabilities[index].toFixed(8)),
                transition: action.transition,
                dynamicFeatures: action.dynamicFeatures
            })),
            newDynamicParameters,
            selectedPieceId: actions[selectedIndex].pieceId,
            selectedIndex,
            teacherEntropy: -targets.reduce((sum, value) =>
                sum + (value > 0 ? value * Math.log(value) : 0), 0)
        }
    };
}

/**
 * Cross-entropy distillation: move the student's probability distribution
 * toward MCTS's visit distribution. This is an actual per-decision update,
 * not a single win/loss update applied to an entire game.
 */
export function trainSearchPolicy(modelInput, decisionRecords, options = {}) {
    const model = createSearchModel(modelInput);
    const gradient = Array(SEARCH_FEATURES.length).fill(0);
    const dynamicGradient = new Map();
    const dynamicById = new Map(model.dynamicParameters.map(item => [item.id, item]));
    let trainedDecisions = 0;
    let loss = 0;
    const regularization = clamp(Number(options.regularization ?? 0.0005), 0, 0.02);

    for (const record of decisionRecords || []) {
        const actions = record?.legalActions;
        if (!Array.isArray(actions) || !actions.length) continue;
        const features = actions.map(action => action.features);
        const targets = actions.map(action => Number(action.targetProbability) || 0);
        const targetSum = targets.reduce((sum, value) => sum + value, 0);
        if (Math.abs(targetSum - 1) > 0.02 ||
            features.some(vector => !Array.isArray(vector) ||
                vector.length !== SEARCH_FEATURES.length ||
                vector.some(value => !Number.isFinite(value)))) continue;

        const probabilities = softmax(actions.map(action => policyActionScore(action, model, dynamicById)), model.temperature);

        for (let actionIndex = 0; actionIndex < actions.length; actionIndex++) {
            const target = targets[actionIndex];
            const predicted = Math.max(Number.EPSILON, probabilities[actionIndex]);
            if (target > 0) loss -= target * Math.log(predicted);
            const coefficient = (target - probabilities[actionIndex]) / model.temperature;
            for (let featureIndex = 0; featureIndex < SEARCH_FEATURES.length; featureIndex++) {
                gradient[featureIndex] += coefficient * features[actionIndex][featureIndex];
            }
            for (const feature of actions[actionIndex].dynamicFeatures || []) {
                if (!dynamicById.has(feature.id)) continue;
                dynamicGradient.set(feature.id, (dynamicGradient.get(feature.id) || 0) + coefficient * feature.value);
                const parameter = dynamicById.get(feature.id);
                parameter.visits++;
                if (targets[actionIndex] > probabilities[actionIndex]) parameter.teacherSupport++;
                else if (targets[actionIndex] < probabilities[actionIndex]) parameter.teacherRejects++;
            }
        }
        trainedDecisions++;
    }

    if (trainedDecisions) {
        for (let index = 0; index < model.weights.length; index++) {
            const update = gradient[index] / trainedDecisions -
                regularization * model.weights[index];
            model.weights[index] = clamp(
                model.weights[index] + model.learningRate * update,
                -5,
                5
            );
        }
        for (const parameter of model.dynamicParameters) {
            const rawGradient = dynamicGradient.get(parameter.id) || 0;
            if (rawGradient !== 0) {
                parameter.weight = clamp(parameter.weight + model.learningRate * (
                    rawGradient / trainedDecisions - regularization * parameter.weight
                ), -5, 5);
                parameter.lastUpdatedGeneration = model.generation + 1;
            }
        }
        model.decisionsTrained += trainedDecisions;
        if (options.completedGame === true) model.gamesTrained++;
        model.generation++;
    }

    return {
        model,
        trainedDecisions,
        averageCrossEntropy: trainedDecisions ? loss / trainedDecisions : 0,
        gradient: gradient.map(value => Number(value.toFixed(8))),
        gradientNorm: Math.sqrt(gradient.reduce((sum, value) => sum + value * value, 0))
    };
}

export function getSearchPolicyScores(game, dependencies, modelInput) {
    const model = createSearchModel(modelInput);
    const legalMoves = dependencies.getValidMoves(game);
    if (!legalMoves.length) return [];
    const strategic = chooseStrategicDecision(game, dependencies, 'medium');
    const dynamicByKey = new Map(model.dynamicParameters.map(item => [item.key, item]));
    const actions = legalMoves.map(pieceId => {
        const extracted = actionFeatures(game, pieceId, dependencies, strategic);
        const dynamicFeatures = dynamicPatterns(extracted.features.slice(0, SEARCH_BASE_FEATURES.length))
            .map(feature => ({ ...feature, id: dynamicByKey.get(feature.key)?.id }))
            .filter(feature => Number.isInteger(feature.id));
        return { ...extracted, dynamicFeatures };
    });
    const probabilities = softmax(actions.map(action => policyActionScore(action, model)), model.temperature);
    return legalMoves.map((pieceId, index) => ({
        pieceId,
        probability: probabilities[index]
    })).sort((a, b) => b.probability - a.probability);
}
