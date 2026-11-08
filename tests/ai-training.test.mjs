import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('training route has its own panel and does not load the technical overlay', async () => {
    const index = await read('../index.php');
    const bootstrap = await read('../js/debug-bootstrap.js');
    assert.match(index, /\$trainingMode[\s\S]*?===\s*'training'/);
    assert.match(index, /ai-training\.css/);
    assert.match(index, /\$debugMode\s*\|\|\s*\$trainingMode/);
    assert.match(bootstrap, /mode === 'training'/);
    assert.match(bootstrap, /trainingMode \? null : await import\('\.\/debug-overlay\.js'/);
    assert.match(bootstrap, /initAITrainingOverlay/);
});

test('training mode forces 2D and renders numbered track and home fields', async () => {
    const view = await read('../js/game-board-view.js');
    const board = await read('../js/game-board-2d.js');
    const debug = await read('../js/debug-bootstrap.js');
    assert.match(view, /trainingMode \? false : loadView\(\)/);
    assert.match(view, /if \(trainingMode\)[\s\S]*?ensureModeStyles\('2d'\)/);
    assert.match(view, /trainingMode \? '' : '<button[\s\S]*?data-board-view/);
    assert.match(board, /renderBoardLabels2D/);
    assert.match(board, /boardPieces \+ boardLabelsMarkup/);
    assert.match(debug, /index \+ 1/);
    assert.match(debug, /'D' \+[\s\S]*?\(slot \+ 1\)[\s\S]*?\(lane \+ 1\)/);
});

test('training decision appears as a green evaluation in the normal chat', async () => {
    const turn = await read('../js/game-turn.js');
    const log = await read('../js/game-log.js');
    const app = await read('../js/app.js');
    assert.match(turn, /debugMode === 'training'/);
    assert.match(turn, /clovece:ai-training-decision/);
    assert.match(turn, /addAITrainingEvaluation/);
    assert.match(log, /ai-training-evaluation/);
    assert.match(log, /'\[' \+ item\.sender \+ ': ' \+ item\.text \+ '\]'/);
    assert.match(app, /addAITrainingEvaluation/);
});

test('each human correction is stored as a new private immutable JSON file', async () => {
    const endpoint = await read('../ai-training.php');
    const storageRules = await read('../storage/.htaccess');
    assert.match(endpoint, /X-CSRF-TOKEN/i);
    assert.match(endpoint, /aiTrainingSameOrigin/);
    assert.match(endpoint, /storage\/ai-training\/instructions/);
    assert.match(endpoint, /fopen\(\$filePath, 'x'\)/);
    assert.match(endpoint, /LOCK_EX/);
    assert.doesNotMatch(endpoint, /\b(?:unlink|rename|file_put_contents)\s*\(/i);
    assert.match(storageRules, /Require all denied/i);
});

test('training panel sends the complete AI context together with the teacher correction', async () => {
    const panel = await read('../js/ai-training-overlay.js');
    assert.match(panel, /Co měla AI udělat správně a proč/);
    assert.match(panel, /ODESLAT INSTRUKCI/);
    assert.match(panel, /context: currentDecision/);
    assert.match(panel, /instruction,/);
    assert.match(panel, /ai-training\.php/);
});
