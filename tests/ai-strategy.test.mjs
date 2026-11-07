import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createGame,
    getValidMoves,
    getPiecePosition,
    movePiece,
    rollDice,
    chooseAIMove,
    chooseAIMoveDecision
} from '../js/game-engine.js';
import {
    estimateCaptureProbability,
    estimatePieceThreat,
    calculatePlayerPips,
    calculateAdaptiveRiskMultiplier
} from '../js/ai-strategy.js';

const aiDependencies = { getValidMoves, getPiecePosition, movePiece, rollDice };

function moveOpponentPiecesOutOfBase(game, playerId, keepPieceId = 0) {
    let homeStep = game.trackLength;
    game.pieces[playerId].pieces.forEach(piece => {
        if (piece.id !== keepPieceId && piece.steps === -1) {
            piece.steps = homeStep++;
        }
    });
}

function placeOpponentBehindTarget(game, distance, targetSteps = 5) {
    const targetPosition = getPiecePosition(game, 0, game.pieces[0].pieces[0]);
    const opponentStart = game.players[1].start;
    const attackerPosition = (targetPosition - distance + game.trackLength) % game.trackLength;
    game.pieces[1].pieces[0].steps =
        (attackerPosition - opponentStart + game.trackLength) % game.trackLength;
}

test('single-piece capture probability accounts for chained sixes', () => {
    assert.equal(estimateCaptureProbability(4), 1 / 6);
    assert.equal(estimateCaptureProbability(6), 1 / 6);
    assert.equal(estimateCaptureProbability(7), 1 / 36);
    assert.equal(estimateCaptureProbability(12), 1 / 36);
    assert.equal(estimateCaptureProbability(20), 1 / 1296);
    assert.equal(estimateCaptureProbability(0), 0);
    assert.equal(estimateCaptureProbability(-1), 0);
});

test('threat simulation uses engine-legal moves and accounts for bonus sixes', () => {
    const game = createGame(1, 1);
    game.pieces[0].pieces[0].steps = 5;
    placeOpponentBehindTarget(game, 4);

    const threat = estimatePieceThreat(game, 0, 0, aiDependencies);
    // Soupeř může šestku využít k povinnému nasazení a poté zkusit zásah.
    // Výpočet je oříznut po třech pokračováních; přesná nekonečná řada je 0,2.
    assert.ok(threat > 0.19 && threat < 0.2);
});

test('a distant attack requires the correct sequence of sixes', () => {
    const game = createGame(1, 1);
    game.pieces[0].pieces[0].steps = 5;
    placeOpponentBehindTarget(game, 20);
    moveOpponentPiecesOutOfBase(game, 1);

    assert.ok(Math.abs(
        estimatePieceThreat(game, 0, 0, aiDependencies) - (1 / 1296)
    ) < 1e-12);
});

test('engine simulation respects a blocked intermediate landing square', () => {
    const game = createGame(1, 1);
    game.pieces[0].pieces[0].steps = 5;
    placeOpponentBehindTarget(game, 20);
    moveOpponentPiecesOutOfBase(game, 1, 0);
    game.pieces[1].pieces[1].steps = 11;

    // První útočná figurka je blokována na mezilehlém poli.
    // Druhá figurka je sama 14 polí za cílem a může zasáhnout dvěma šestkami a dvojkou.
    assert.ok(Math.abs(
        estimatePieceThreat(game, 0, 0, aiDependencies) - (7 / 1296)
    ) < 1e-12);
});

test('the third six is resolved before its configured penalty', () => {
    const game = createGame(1, 1, [], [], 40, { threeSixesPenalty: true });
    game.pieces[0].pieces[0].steps = 5;
    placeOpponentBehindTarget(game, 18);
    moveOpponentPiecesOutOfBase(game, 1);

    // Třetí šestka nejprve dojede na cíl a vyhodí ho; teprve potom přijde trest.
    assert.ok(Math.abs(
        estimatePieceThreat(game, 0, 0, aiDependencies) - (1 / 216)
    ) < 1e-12);
});

test('the three-sixes penalty prevents a fourth roll needed for a distant capture', () => {
    const game = createGame(1, 1, [], [], 40, { threeSixesPenalty: true });
    game.pieces[0].pieces[0].steps = 5;
    placeOpponentBehindTarget(game, 20);
    moveOpponentPiecesOutOfBase(game, 1);

    assert.equal(estimatePieceThreat(game, 0, 0, aiDependencies), 0);
});

test('pip count includes deployment and one player-level wait cost', () => {
    const game = createGame(1, 1, [], [], 40);
    const allBase = calculatePlayerPips(game, 0);

    game.pieces[0].pieces[0].steps = 0;
    const oneDeployed = calculatePlayerPips(game, 0);

    assert.ok(allBase > 200);
    assert.equal(oneDeployed, 192);
    assert.ok(allBase - oneDeployed > 11 && allBase - oneDeployed < 12);
});

test('waiting cost reflects one or three attempts to roll a six', () => {
    const threeAttempts = createGame(1, 1, [], [], 40, { threeRolls: true });
    const oneAttempt = createGame(1, 1, [], [], 40, { threeRolls: false });

    assert.ok(calculatePlayerPips(oneAttempt, 0) > calculatePlayerPips(threeAttempts, 0));
});

test('AI difficulty is stored in the game and all levels return legal moves', () => {
    for (const difficulty of ['easy', 'medium', 'hard']) {
        const game = createGame(1, 1, [], [], 40, {}, difficulty);
        assert.equal(game.aiDifficulty, difficulty);

        game.phase = 'move';
        game.diceValue = 6;
        const legal = getValidMoves(game);
        const selected = chooseAIMove(game);

        assert.ok(legal.length > 0);
        assert.ok(legal.includes(selected));
    }
});

test('unknown AI difficulty safely falls back to medium', () => {
    const game = createGame(1, 1, [], [], 40, {}, 'impossible');
    assert.equal(game.aiDifficulty, 'medium');
});

test('a distant target cannot be hit after the attacker has reached its home lane', () => {
    const game = createGame(1, 1);
    game.pieces[0].pieces[0].steps = 20;
    game.pieces[1].pieces[0].steps = game.trackLength - 1;
    moveOpponentPiecesOutOfBase(game, 1);

    assert.equal(estimatePieceThreat(game, 0, 0, aiDependencies), 0);
});

test('AI may prefer a valuable capture over a small optional home entry', () => {
    const game = createGame(1, 1, [], [], 40, { mustEnterHome: false });
    game.phase = 'move';
    game.diceValue = 1;
    game.pieces[0].pieces[0].steps = 0;
    game.pieces[0].pieces[1].steps = game.trackLength - 1;
    game.pieces[1].pieces[0].steps = 21;
    moveOpponentPiecesOutOfBase(game, 1, 0);

    const legal = getValidMoves(game);
    assert.deepEqual(legal, [0, 1]);
    assert.equal(chooseAIMove(game), 0);
});

test('AI obeys mandatory home entry when that rule is enabled', () => {
    const game = createGame(1, 1);
    game.phase = 'move';
    game.diceValue = 1;
    game.pieces[0].pieces[0].steps = 0;
    game.pieces[0].pieces[1].steps = game.trackLength - 1;
    game.pieces[1].pieces[0].steps = 21;

    assert.deepEqual(getValidMoves(game), [1]);
    assert.equal(chooseAIMove(game), 1);
});

test('an immediate game-winning move has absolute priority', () => {
    const game = createGame(1, 1);
    game.phase = 'move';
    game.diceValue = 4;
    game.pieces[0].pieces[0].steps = game.trackLength;
    game.pieces[0].pieces[1].steps = game.trackLength + 1;
    game.pieces[0].pieces[2].steps = game.trackLength + 2;
    game.pieces[0].pieces[3].steps = game.trackLength - 1;

    // Tři figurky obsazují D1–D3; čtvrtá dojede přesně na D4.
    const decision = chooseAIMoveDecision(game);
    assert.equal(decision.pieceId, 3);
    assert.equal(decision.score, 1);
    assert.match(decision.reason, /Vítězný tah/);
});

test('AI decision exposes score breakdown and a grounded explanation', () => {
    const game = createGame(1, 1, [], [], 40, {}, 'medium');
    game.phase = 'move';
    game.diceValue = 6;
    const decision = chooseAIMoveDecision(game);

    assert.ok(decision);
    assert.ok(getValidMoves(game).includes(decision.pieceId));
    assert.equal(typeof decision.reason, 'string');
    assert.ok(decision.reason.length > 10);
    assert.equal(typeof decision.breakdown.effectiveOwnPips, 'number');
    assert.equal(chooseAIMove(game), decision.pieceId);
});

test('AI explanation describes the self-replacement caused by mandatory deployment', () => {
    const game = createGame(1, 1);
    game.phase = 'move';
    game.diceValue = 6;
    game.pieces[0].pieces[0].steps = 0;

    const decision = chooseAIMoveDecision(game);
    assert.ok(getValidMoves(game).includes(decision.pieceId));
    assert.match(decision.reason, /původní figurka na startu se vrací do základny/);
    assert.doesNotMatch(decision.reason, /zvýší počet aktivních figurek/);
});

test('AI evaluates an eight-player game on the 80-space board', () => {
    const game = createGame(1, 7, [], [], 80, {}, 'medium');
    game.phase = 'move';
    game.diceValue = 2;

    const occupied = new Set([0, 20, 40, 60]);
    const reservedDestinations = new Set([2, 22, 42, 62]);
    [0, 20, 40, 60].forEach((field, pieceId) => {
        game.pieces[0].pieces[pieceId].steps =
            (field - game.players[0].start + game.trackLength) % game.trackLength;
    });

    let field = 1;
    for (let playerId = 1; playerId < game.players.length; playerId++) {
        for (const piece of game.pieces[playerId].pieces) {
            while (occupied.has(field) || reservedDestinations.has(field)) {
                field = (field + 1) % game.trackLength;
            }
            occupied.add(field);
            piece.steps =
                (field - game.players[playerId].start + game.trackLength) % game.trackLength;
            field = (field + 1) % game.trackLength;
        }
    }

    const legal = getValidMoves(game);
    const decision = chooseAIMoveDecision(game);
    assert.equal(game.boardSize, 80);
    assert.equal(game.players.length, 8);
    assert.ok(legal.length > 0);
    assert.ok(legal.includes(decision.pieceId));
});


test('AI adapts risk tolerance to its relative race position', () => {
    const ahead = createGame(1, 1);
    ahead.pieces[0].pieces.forEach((piece, index) => {
        piece.steps = ahead.trackLength + index;
    });
    assert.ok(calculateAdaptiveRiskMultiplier(ahead, 0) > 1);
    assert.ok(calculateAdaptiveRiskMultiplier(ahead, 0) <= 1.2);

    const behind = createGame(1, 1);
    behind.pieces[1].pieces.forEach((piece, index) => {
        piece.steps = behind.trackLength + index;
    });
    assert.ok(calculateAdaptiveRiskMultiplier(behind, 0) < 1);
    assert.ok(calculateAdaptiveRiskMultiplier(behind, 0) >= 0.8);

    const tied = createGame(1, 1);
    assert.equal(calculateAdaptiveRiskMultiplier(tied, 0), 1);
});
