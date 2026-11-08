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
    assert.match(debug, />D' \+[\s\S]*?\(slot \+ 1\)[\s\S]*?\(lane \+ 1\)/);
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
    assert.match(endpoint, /HTTP_X_CSRF_TOKEN/i);
    assert.match(endpoint, /aiTrainingSameOrigin/);
    assert.match(endpoint, /storage\/ai-training\/instructions/);
    assert.match(endpoint, /clovece-ai-positive-example/);
    assert.match(endpoint, /feedbackType === 'positive'/);
    assert.match(endpoint, /'note' => \$feedbackType === 'positive'/);
    assert.match(endpoint, /fopen\(\$filePath, 'x'\)/);
    assert.match(endpoint, /LOCK_EX/);
    assert.ok(endpoint.includes('$denyRule = "Require all denied\\n";'));
    assert.match(endpoint, /trim\\(\\$denyContents\\) === 'Require all denied\\\\\\\\n'/);
    assert.match(endpoint, /ftruncate\\(\\$repairHandle, 0\\)/);
    assert.doesNotMatch(endpoint, /\b(?:unlink|rename|file_put_contents)\s*\(/i);
    assert.match(storageRules, /Require all denied/i);
});

test('training panel sends the complete AI context together with the teacher correction', async () => {
    const panel = await read('../js/ai-training-overlay.js');
    assert.match(panel, /Co měla AI udělat správně a proč/);
    assert.match(panel, /PŘESKOČIT/);
    assert.match(panel, /SPRÁVNĚ/);
    assert.match(panel, /saveFeedback\('positive'\)/);
    assert.match(panel, /feedbackType,/);
    assert.match(panel, /note: note \|\| null/);
    assert.match(panel, /ai-training-smaller/);
    assert.match(panel, /ai-training-larger/);
    assert.match(panel, /childElementCount > 0/);
    assert.match(panel, /currentDecision = null/);
    assert.match(panel, /Bez instrukce – nic nebylo uloženo/);
    assert.match(panel, /is-hidden/);
    const styles = await read('../css/ai-training.css');
    assert.match(styles, /--training-panel-width:250px/);
    assert.match(styles, /left:2px;bottom:2px/);
    assert.match(panel, /pointerdown/);
    assert.match(panel, /pointermove/);
    assert.match(styles, /data-size="1"/);
    assert.match(styles, /data-size="2"/);
    assert.match(styles, /\.ai-training-buttons button\{[^}]*flex:1 1 0/);
    assert.match(styles, /\.ai-training-buttons\{display:flex;width:100%/);
    assert.match(panel, /context: decisionToSave/);
    assert.match(panel, /instruction,/);
    assert.match(panel, /ai-training\.php/);
});


test('training chat contains only a short evaluation marker and automatic first deployment is not evaluated', async () => {
    const turn = await read('../js/game-turn.js');
    const log = await read('../js/game-log.js');
    const panel = await read('../js/ai-training-overlay.js');
    assert.match(turn, /addAITrainingEvaluation\?\.\(playerName, 'vyhodnocení'\)/);
    assert.match(turn, /allPiecesInBase[\s\S]*?trainingAI && Number\(game\.diceValue\) === 6/);
    assert.match(turn, /První povinné nasazení není taktické/);
    assert.match(log, /'\\[' \+ item\.sender \+ ': ' \+ item\.text \+ '\]'/);
    assert.match(panel, /positionLabel\(beforePiece\.steps[\s\S]*?positionLabel\(afterPiece\.steps/);
    assert.match(panel, /cleanExplanation/);
    assert.match(panel, /protože jsem v závod/);
});
