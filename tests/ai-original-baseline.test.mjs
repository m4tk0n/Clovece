import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, getValidMoves, getPiecePosition, movePiece, rollDice } from '../js/game-engine.js';
import { chooseStrategicDecision as chooseOriginal } from '../js/ai-original-baseline.js';
import { AI_WEIGHT_COUNT as originalWeightCount } from '../js/ai-original-weight-config.js';
import { chooseStrategicDecision as chooseTenWeight } from '../js/ai-strategy.js';
import { AI_WEIGHT_COUNT } from '../js/ai-weight-config.js';
import { readFile } from 'node:fs/promises';

const dependencies={getValidMoves,getPiecePosition,movePiece,rollDice};

test('původní 1000-váhová AI zůstává zachována pouze jako turnajová baseline',()=>{
    assert.equal(originalWeightCount,1000);
    assert.equal(AI_WEIGHT_COUNT,10);
    for(const boardSize of [40,48,80]){
        const game=createGame(1,1,[],[],boardSize);
        game.phase='move';game.diceValue=1;
        game.pieces[0].pieces[0].steps=0;game.pieces[0].pieces[1].steps=5;
        const legal=getValidMoves(game);
        const oldDecision=chooseOriginal(game,dependencies,'medium',()=>0,{},null);
        const newDecision=chooseTenWeight(game,dependencies);
        assert.ok(legal.includes(oldDecision.pieceId));
        assert.ok(legal.includes(newDecision.pieceId));
        assert.equal(oldDecision.breakdown.weightConfig.count,1000);
        assert.equal(newDecision.breakdown.weightConfig.count,10);
    }
});

test('turnaj používá původní AI snapshot a nemění jej tréninkem',async()=>{
    const config=JSON.parse(await readFile(new URL('../config/ai-original-baseline.json',import.meta.url),'utf8'));
    const tournament=await readFile(new URL('../scripts/ai-weight-tournament.mjs',import.meta.url),'utf8');
    assert.equal(config.sourceCommit,'92abccc345063d3b37d37efc81f3df6002572818');
    assert.equal(config.weights.immediateWin,100000);
    assert.equal(Object.keys(config.weights).length,10);
    assert.match(tournament,/chooseStrategicDecision as chooseOriginalStrategicDecision/);
    assert.match(tournament,/chooseOriginalStrategicDecision\(game, dependencies/);
    assert.match(tournament,/originalAIBaseline: true/);
});
