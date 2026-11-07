import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, getValidMoves, chooseAIMoveLearningDecision } from '../js/game-engine.js';

test('local AI creates and trains dynamic parameters during its own decision', () => {
    const game = createGame(1, 1, ['Člověk', 'AI'], ['#e53935', '#1e88e5'], 40, {}, 'hard');
    game.currentPlayer = 1;
    game.phase = 'move';
    game.diceValue = 3;
    game.pieces[1].pieces.forEach((piece, index) => { piece.steps = [0, 10, 20, 30][index]; });
    game.pieces[0].pieces.forEach((piece, index) => { piece.steps = [4, 14, 24, 34][index]; });

    const legal = getValidMoves(game);
    assert.ok(legal.length > 1);

    const decision = chooseAIMoveLearningDecision(game, 'hard');
    assert.ok(legal.includes(decision.pieceId));
    assert.ok(decision.learning);
    assert.ok(decision.learning.decisionsTrained > 0);
    assert.ok(decision.learning.totalParameters > 1000);
    assert.ok(decision.learning.newParameterCount > 0);
    assert.equal(decision.learning.teacherSimulations, 12);
});
