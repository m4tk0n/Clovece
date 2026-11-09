import test from 'node:test';
import assert from 'node:assert/strict';
import { getAIWeight, getAIWeightValues, setAIWeightOverrides } from '../js/ai-weight-config.js';
import { buildAIWeightReviewQuestions, getAIWeightMetadata, isTrainableAIWeight } from '../js/ai-weight-metadata.js';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('server overrides immediately replace exactly the selected numeric weight', () => {
    assert.equal(getAIWeight(1), 200);
    setAIWeightOverrides({ 1: 212.5, 1001: 999, invalid: 10 });
    assert.equal(getAIWeight(1), 212.5);
    assert.equal(getAIWeight(2), 250);
    assert.equal(getAIWeightValues().length, 1000);
    assert.equal(getAIWeightValues()[0], 212.5);
    setAIWeightOverrides({});
    assert.equal(getAIWeight(1), 200);
});

test('weight metadata distinguishes trainable values from system-only slots', () => {
    assert.equal(getAIWeightMetadata(1).name, 'w_capture');
    assert.match(getAIWeightMetadata(61).desc, /vzdálenosti 1/);
    assert.equal(getAIWeightMetadata(401).name, 'obtiznost_lehka_agrese');
    assert.equal(isTrainableAIWeight(416), true);
    assert.equal(isTrainableAIWeight(417), false);
    assert.equal(isTrainableAIWeight(500), false);
    assert.equal(isTrainableAIWeight(1000), false);
});

test('trainer creates contextual questions only for channels that distinguish legal candidates', () => {
    const detail = {
        decision: {
            selectedPieceId: 0,
            candidates: [
                { pieceId: 0, weightFactors: { weightSignals: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1] } },
                { pieceId: 1, weightFactors: { weightSignals: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } }
            ]
        }
    };
    const questions = buildAIWeightReviewQuestions(detail);
    assert.equal(questions.length, 10);
    assert.deepEqual(questions.map(item => item.channel), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.equal(questions[0].id, 1);
    assert.equal(questions[0].name, 'w_capture');
    assert.equal(questions[0].signalDelta, 1);
    assert.deepEqual(buildAIWeightReviewQuestions({
        decision: { selectedPieceId: 0, candidates: [
            { pieceId: 0, weightFactors: { weightSignals: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } },
            { pieceId: 1, weightFactors: { weightSignals: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] } }
        ]}
    }), []);
});

test('trainer UI applies yes/no feedback and observes human moves as well as AI moves', async () => {
    const panel = await read('../js/ai-training-overlay.js');
    const turn = await read('../js/game-turn.js');
    const strategy = await read('../js/ai-strategy.js');
    assert.match(panel, /ANO/);
    assert.match(panel, /NEVÍM/);
    assert.match(panel, /saveAIWeightFeedback/);
    assert.match(panel, /setAIWeightOverrides/);
    assert.match(panel, /Uloženo ihned/);
    assert.match(turn, /createHumanTrainingDecision/);
    assert.match(turn, /human-move-observation-v1/);
    assert.match(turn, /clovece:ai-training-decision/);
    assert.match(turn, /waitForTrainingReview/);
    assert.match(turn, /clovece:ai-training-review-complete/);
    assert.match(turn, /return reviewPromise\.then/);
    assert.match(turn, /executeMove\(finalPieceId, humanTrainingDecision\)/);
    assert.match(panel, /Tvoje zvolená figurka zatím neudělala tah/);
    assert.match(panel, /completeReview\(detail/);
    assert.match(panel, /clovece:ai-training-review-complete/);
    assert.match(strategy, /weightSignals: weightSignals\.map/);
});

test('weight endpoint validates, locks and persists immediate single-weight updates', async () => {
    const endpoint = await read('../ai-training-weights.php');
    assert.match(endpoint, /HTTP_X_CSRF_TOKEN/);
    assert.match(endpoint, /ai_training_csrf/);
    assert.match(endpoint, /flock\(\$lock, LOCK_EX\)/);
    assert.match(endpoint, /ai-learned-weights\.json/);
    assert.match(endpoint, /signalDelta/);
    assert.match(endpoint, /\['yes', 'no'\]/);
    assert.match(endpoint, /rename\(\$temp, \$file\)/);
    assert.match(endpoint, /feedbackCount/);
});
