import test from 'node:test';
import assert from 'node:assert/strict';
import { getAIWeight, getAIWeightValues, setAIWeightOverrides, AI_WEIGHT_COUNT, AI_WEIGHT_DEFINITIONS } from '../js/ai-weight-config.js';
import { buildAIWeightReviewQuestions, getAIWeightMetadata, isTrainableAIWeight } from '../js/ai-weight-metadata.js';
import { readFile } from 'node:fs/promises';
const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('serverové přepisy mění pouze deset aktivních vah', () => {
    assert.equal(AI_WEIGHT_COUNT,10);
    const initial=getAIWeight(1);
    setAIWeightOverrides({1:initial+1,10:9,11:999,invalid:10});
    assert.equal(getAIWeight(1),initial+1);
    assert.equal(getAIWeight(10),9);
    assert.equal(getAIWeight(11),0);
    assert.equal(getAIWeightValues().length,10);
    setAIWeightOverrides({});
    assert.equal(getAIWeight(1),initial);
});

test('metadata popisují všech deset strategických významů a pouze ty jsou naučitelné', () => {
    assert.equal(getAIWeightMetadata(1).key,'progressToGoal');
    assert.equal(getAIWeightMetadata(10).key,'flexibility');
    assert.equal(isTrainableAIWeight(1),true);
    assert.equal(isTrainableAIWeight(10),true);
    assert.equal(isTrainableAIWeight(11),false);
    assert.equal(isTrainableAIWeight(1000),false);
    assert.equal(AI_WEIGHT_DEFINITIONS.length,10);
});

test('výukové otázky se odvozují z rozdílů deseti signálů legálních tahů', () => {
    const detail={decision:{selectedPieceId:0,candidates:[
        {pieceId:0,weightFactors:{weightSignals:[1,1,1,1,1,1,1,1,1,1]}},
        {pieceId:1,weightFactors:{weightSignals:[0,0,0,0,0,0,0,0,0,0]}}
    ]}};
    const questions=buildAIWeightReviewQuestions(detail);
    assert.equal(questions.length,10);
    assert.deepEqual(questions.map(item=>item.channel),[0,1,2,3,4,5,6,7,8,9]);
    assert.equal(questions[0].name,'progressToGoal');
    assert.equal(questions[0].signalDelta,1);
});

test('výukový panel ukládá odpovědi a rozhodnutí obsahuje příspěvky vah',async()=>{
    const panel=await read('../js/ai-training-overlay.js');
    const turn=await read('../js/game-turn.js');
    const strategy=await read('../js/ai-strategy.js');
    assert.match(panel,/saveAIWeightFeedback/);
    assert.match(panel,/ANO/);
    assert.match(panel,/NEVÍM/);
    assert.match(turn,/createHumanTrainingDecision/);
    assert.match(turn,/clovece:ai-training-decision/);
    assert.match(strategy,/weightSignals,/);
    assert.match(strategy,/weightContributions/);
});

test('serverový endpoint ověřuje CSRF, ukládá bezpečně a povoluje pouze ID 1 až 10',async()=>{
    const endpoint=await read('../ai-training-weights.php');
    assert.match(endpoint,/HTTP_X_CSRF_TOKEN/);
    assert.match(endpoint,/flock\(\$lock, LOCK_EX\)/);
    assert.match(endpoint,/ai-learned-weights\.json/);
    assert.match(endpoint,/ai-weights-10-v1/);
    assert.match(endpoint,/version' => 2/);
    assert.match(endpoint,/\$id > 10/);
    assert.match(endpoint,/rename\(\$temp, \$file\)/);
});
