import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createGame,
    getValidMoves,
    getPiecePosition,
    movePiece,
    rollDice,
    chooseAIMoveDecision
} from '../js/game-engine.js';
import {
    estimateCaptureProbability,
    estimatePieceThreat,
    evaluateTacticalCandidates,
    calculatePlayerPips,
    chooseStrategicDecision,
    normalizeTrainingSituation
} from '../js/ai-strategy.js';

const aiDependencies = { getValidMoves, getPiecePosition, movePiece, rollDice };

function moveOpponentPiecesOutOfBase(game, playerId, keepPieceId = 0) {
    let homeStep = game.trackLength;
    game.pieces[playerId].pieces.forEach(piece => {
        if (piece.id !== keepPieceId && piece.steps === -1) piece.steps = homeStep++;
    });
}

function placeOpponentBehindTarget(game, distance) {
    const targetPosition = getPiecePosition(game, 0, game.pieces[0].pieces[0]);
    const opponentStart = game.players[1].start;
    const attackerPosition = (targetPosition - distance + game.trackLength) % game.trackLength;
    game.pieces[1].pieces[0].steps =
        (attackerPosition - opponentStart + game.trackLength) % game.trackLength;
}

test('capture probability formula accounts for chained sixes', () => {
    assert.equal(estimateCaptureProbability(4), 1 / 6);
    assert.equal(estimateCaptureProbability(6), 1 / 6);
    assert.equal(estimateCaptureProbability(7), 1 / 36);
    assert.equal(estimateCaptureProbability(12), 1 / 36);
    assert.equal(estimateCaptureProbability(20), 1 / 1296);
    assert.equal(estimateCaptureProbability(0), 0);
});

test('threat calculation uses engine-legal moves and bonus sixes', () => {
    const game = createGame(1, 1);
    game.pieces[0].pieces[0].steps = 5;
    placeOpponentBehindTarget(game, 4);
    const threat = estimatePieceThreat(game, 0, 0, aiDependencies);
    assert.ok(threat > 0.19 && threat < 0.2);
});

test('pip calculation reports remaining route and deployment cost without tactical bonuses', () => {
    const game = createGame(1, 1, [], [], 40, { threeRolls: false });
    assert.equal(calculatePlayerPips(game, 0), 4 * (40 + 3 + 6) + 4.2 * 5);
    game.pieces[0].pieces[0].steps = 0;
    assert.equal(calculatePlayerPips(game, 0), 43 + 3 * 49);
});

test('AI uses tactical evaluation instead of random selection when no trained model applies', () => {
    const game = createGame(1, 1);
    game.phase = 'move';
    game.diceValue = 1;
    game.pieces[0].pieces[0].steps = 0;
    game.pieces[0].pieces[1].steps = 5;

    const legal = getValidMoves(game);
    assert.equal(legal.length, 2);

    const first = chooseStrategicDecision(game, aiDependencies, 'medium', () => 0);
    const last = chooseStrategicDecision(game, aiDependencies, 'medium', () => 0.999999);
    assert.ok(legal.includes(first.pieceId));
    assert.equal(last.pieceId, first.pieceId);
    assert.equal(first.breakdown.trainedKnowledge, false);
    assert.equal(first.breakdown.tacticalTeacher, true);
    assert.equal(first.breakdown.selection, 'weighted-ai-1000');
    assert.equal(first.breakdown.weightConfig.count, 1000);
    assert.equal(first.breakdown.weightConfig.scoredWeightCount, 876);
    assert.equal(first.breakdown.weightConfig.neutralConfigWeightCount, 124);
    assert.equal(first.breakdown.selectedWeightFactors.weightCount, 1000);
    assert.equal(first.breakdown.selectedWeightFactors.scoredWeightCount, 876);
    assert.match(first.reason, /VÁHOVÁ AI/);
});

test('deployment is rewarded when a safe newly deployed piece creates a bonus-roll capture', () => {
    const game = createGame(1, 1, [], [], 40);
    game.phase = 'move';
    game.diceValue = 6;
    game.pieces[0].pieces[0].steps = -1;
    game.pieces[0].pieces[1].steps = game.trackLength;
    game.pieces[0].pieces[2].steps = game.trackLength + 1;
    game.pieces[0].pieces[3].steps = game.trackLength + 2;

    // Soupeř stojí tři pole před naším startem po směru našeho pohybu.
    const targetPosition = 3;
    game.pieces[1].pieces[0].steps =
        (targetPosition - game.players[1].start + game.trackLength) % game.trackLength;
    game.pieces[1].pieces[1].steps = game.trackLength;
    game.pieces[1].pieces[2].steps = game.trackLength + 1;
    game.pieces[1].pieces[3].steps = game.trackLength + 2;

    const decision = chooseStrategicDecision(game, aiDependencies, 'medium', () => 0);
    assert.equal(decision.pieceId, 0);
    assert.equal(decision.breakdown.selectedWeightFactors.deployedPiece, true);
    assert.ok(Math.abs(decision.breakdown.selectedWeightFactors.deploymentAttackChance - 1 / 6) < 0.001);
    assert.equal(decision.breakdown.selectedWeightFactors.deployedPieceThreat, 0);
    assert.ok(decision.breakdown.selectedWeightFactors.deploymentTacticalScore > 0);
});

test('opponent start square becomes more dangerous with reserve pieces and near-goal progress', () => {
    function scoreStartSquareRisk(nearGoal) {
        const game = createGame(1, 1, [], [], 40);
        const opponent = game.players[1];
        const startSteps = (opponent.start - game.players[0].start + game.trackLength) % game.trackLength;
        game.pieces[0].pieces[0].steps = startSteps;
        game.pieces[1].pieces[0].steps = -1;
        game.pieces[1].pieces[1].steps = nearGoal ? game.trackLength + 2 : game.trackLength;
        game.pieces[1].pieces[2].steps = game.trackLength + 1;
        game.pieces[1].pieces[3].steps = game.trackLength + 3;

        const next = JSON.parse(JSON.stringify(game));
        const ranked = evaluateTacticalCandidates(game, [{ pieceId: 0, state: next, move: {} }], undefined, aiDependencies);
        return ranked[0].factors;
    }

    const riskWithoutNearGoal = scoreStartSquareRisk(false);
    const riskNearGoal = scoreStartSquareRisk(true);
    assert.equal(riskNearGoal.onOpponentStart, true);
    assert.equal(riskNearGoal.opponentStartBasePieces, 1);
    assert.equal(riskNearGoal.opponentNearGoal, true);
    assert.ok(riskNearGoal.startSquareDangerScore > riskWithoutNearGoal.startSquareDangerScore);
});

test('AI still chooses an immediate winning move', () => {
    const game = createGame(1, 1);
    game.phase = 'move';
    game.diceValue = 4;
    game.pieces[0].pieces[0].steps = game.trackLength;
    game.pieces[0].pieces[1].steps = game.trackLength + 1;
    game.pieces[0].pieces[2].steps = game.trackLength + 2;
    game.pieces[0].pieces[3].steps = game.trackLength - 1;

    const decision = chooseAIMoveDecision(game);
    assert.equal(decision.pieceId, 3);
    assert.equal(decision.score, 1);
    assert.match(decision.reason, /vítězný tah/i);
});

test('AI returns null when the engine provides no legal moves', () => {
    const game = createGame(1, 1);
    game.phase = 'move';
    game.diceValue = 1;
    game.pieces[0].pieces.forEach(piece => { piece.steps = game.trackLength + 3; });
    assert.equal(chooseStrategicDecision(game, aiDependencies), null);
});

test('pip calculation supports 40, 48 and 80 field boards', () => {
    for (const length of [40, 48, 80]) {
        const game = createGame(1, 1, [], [], length);
        assert.equal(calculatePlayerPips(game, 0), 4 * (length + 3 + 6) + 4.2 * ((5 / 6) ** 3 / (1 - (5 / 6) ** 3)));
    }
});

test('threat calculation returns zero for pieces outside the main track', () => {
    const game = createGame(1, 1);
    game.pieces[0].pieces[0].steps = game.trackLength;
    assert.equal(estimatePieceThreat(game, 0, 0, aiDependencies), 0);
});

test('difficulty profiles are loaded from the supplied AI weights', () => {
    const game = createGame(1, 1);
    game.phase = 'move';
    game.diceValue = 1;
    game.pieces[0].pieces[0].steps = 0;
    game.pieces[0].pieces[1].steps = 5;
    const easy = chooseStrategicDecision(game, aiDependencies, 'easy', () => 0.4);
    const hard = chooseStrategicDecision(game, aiDependencies, 'hard', () => 0.4);
    assert.ok(easy.breakdown.weightConfig.count === 1000);
    assert.equal(easy.breakdown.weightConfig.riskMultiplier, 0.2);
    assert.equal(hard.breakdown.weightConfig.riskMultiplier, 1.8);
});


test('compiled AI memory selects the most frequently taught legal move', () => {
    const game = createGame(1, 1);
    game.phase = 'move';
    game.diceValue = 1;
    game.pieces[0].pieces[0].steps = 0;
    game.pieces[0].pieces[1].steps = 5;
    const signature = normalizeTrainingSituation(game);
    const memory = { situations: {
        [signature]: { votes: [0, 4, 1, 0], ok: 2, err: 3, samples: 5 }
    } };

    const decision = chooseStrategicDecision(game, aiDependencies, 'medium', () => 0, memory);
    assert.equal(decision.pieceId, 1);
    assert.equal(decision.breakdown.trainedKnowledge, true);
    assert.equal(decision.breakdown.selection, 'compiled-memory');
    assert.equal(decision.breakdown.usedInstructions[0].votes, 4);
    assert.match(decision.reason, /NAUČENO/);
});

test('compiled AI memory is not applied to a different board position', () => {
    const game = createGame(1, 1);
    game.phase = 'move';
    game.diceValue = 1;
    game.pieces[0].pieces[0].steps = 0;
    game.pieces[0].pieces[1].steps = 5;
    const signature = normalizeTrainingSituation(game);
    const memory = { situations: {
        [signature]: { votes: [0, 3, 0, 0], ok: 1, err: 2, samples: 3 }
    } };
    game.pieces[0].pieces[0].steps = 1;

    const decision = chooseStrategicDecision(game, aiDependencies, 'medium', () => 0, memory);
    assert.equal(decision.breakdown.trainedKnowledge, false);
    assert.deepEqual(decision.breakdown.usedInstructions, []);
});



test('tactical teacher always chooses an immediate winning legal move', async () => {
    const { chooseTacticalTeacherDecision } = await import('../js/ai-strategy.js');
    const game = createGame(1, 1);
    game.phase = 'move';
    game.diceValue = 4;
    game.pieces[0].pieces[0].steps = game.trackLength;
    game.pieces[0].pieces[1].steps = game.trackLength + 1;
    game.pieces[0].pieces[2].steps = game.trackLength + 2;
    game.pieces[0].pieces[3].steps = game.trackLength - 1;
    const decision = chooseTacticalTeacherDecision(game, aiDependencies);
    assert.equal(decision.pieceId, 3);
    assert.equal(decision.reason, 'immediate-win');
    assert.ok(decision.ranking.every(item => Number.isFinite(item.score)));
});

test('tactical teacher ranks only engine-provided legal candidates', async () => {
    const { chooseTacticalTeacherDecision } = await import('../js/ai-strategy.js');
    const game = createGame(1, 1);
    game.phase = 'move';
    game.diceValue = 1;
    game.pieces[0].pieces[0].steps = 0;
    game.pieces[0].pieces[1].steps = 5;
    const decision = chooseTacticalTeacherDecision(game, aiDependencies);
    assert.ok(getValidMoves(game).includes(decision.pieceId));
    assert.deepEqual(decision.ranking.map(item => item.pieceId).sort(), getValidMoves(game).sort());
});
