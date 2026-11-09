// /tests/ai-neural-network.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, getValidMoves, movePiece, rollDice } from '../js/game-engine.js';
import { AI_FEATURE_COUNT, extractAIMoveFeatures, inferAINeuralScore, isValidAINeuralModel, scoreAIMoveCandidates } from '../js/ai-neural-network.js';
import { chooseStrategicDecision, calculateAIMoveProbabilityFeatures } from '../js/ai-strategy.js';

const dependencies={getValidMoves,movePiece,rollDice};
function modelForFeature(index){
    const weights=Array(AI_FEATURE_COUNT).fill(0);weights[index]=1;
    return {format:'clovece-ai-neural-model',version:1,featureSchemaVersion:3,enabled:true,inputSize:AI_FEATURE_COUNT,layers:[{outputSize:1,activation:'linear',weights:[weights],biases:[0]}]};
}

test('legacy neural inference helpers validate model data but are not the active strategy',()=>{
    const model=modelForFeature(7);
    assert.equal(isValidAINeuralModel(model),true);
    assert.equal(isValidAINeuralModel({...model,enabled:false}),false);
    assert.equal(isValidAINeuralModel({...model,featureSchemaVersion:99}),false);
    const features=Array(AI_FEATURE_COUNT).fill(0);features[7]=0.25;
    assert.equal(inferAINeuralScore(features,model),0.25);
    assert.equal(inferAINeuralScore([1,2],model),null);
});

test('produkční rozhodnutí používá deset strategických vah i při předání starého neuronového modelu',()=>{
    const game=createGame(1,1);game.phase='move';game.diceValue=1;
    game.pieces[0].pieces[0].steps=0;game.pieces[0].pieces[1].steps=5;
    const legal=getValidMoves(game);
    const decision=chooseStrategicDecision(game,dependencies,'medium',()=>0,{},modelForFeature(7));
    assert.ok(legal.includes(decision.pieceId));
    assert.equal(decision.breakdown.neuralNetwork,false);
    assert.equal(decision.breakdown.selection,'weighted-ai-10-v1');
    assert.equal(decision.breakdown.weightConfig.count,10);
});

test('feature extraction remains finite for every supported board size',()=>{
    for(const boardSize of [40,48,80]){
        const game=createGame(1,1,[],[],boardSize);game.phase='move';game.diceValue=1;
        game.pieces[0].pieces[0].steps=0;
        const legal=getValidMoves(game);const pieceId=legal[0];const state=structuredClone(game);const move=movePiece(state,pieceId);
        const features=extractAIMoveFeatures(game,{pieceId,move,state,winningMove:false},legal.length);
        assert.equal(features.length,AI_FEATURE_COUNT);assert.ok(features.every(Number.isFinite));
        assert.equal(scoreAIMoveCandidates(game,[{pieceId,move,state,winningMove:false}],legal.length,modelForFeature(7)).length,1);
    }
});

test('pravděpodobnostní simulace projde všemi šesti hody',()=>{
    const game=createGame(1,1);game.pieces[0].pieces[0].steps=5;
    const state=structuredClone(game);
    const result=calculateAIMoveProbabilityFeatures(game,{pieceId:0,move:{deployed:false},state,winningMove:false},dependencies);
    assert.ok(Object.values(result).every(value=>value>=0&&value<=1));
    assert.ok(Math.abs(result.extraTurnChance-1/6)<1e-12);
});
