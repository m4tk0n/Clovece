import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('training route has its own panel and does not load the technical overlay', async () => {
    const index = await read('../index.php');
    const bootstrap = await read('../js/debug-bootstrap.js');
    assert.match(index, /\$trainingMode[\s\S]*?in_array[\s\S]*?'trainer'/);
    assert.match(index, /ai-training\.css/);
    assert.match(index, /\$debugMode\s*\|\|\s*\$trainingMode/);
    assert.match(bootstrap, /mode === 'trainer' \|\| mode === 'training'/);
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
    assert.match(turn, /debugMode === 'trainer' \|\| debugMode === 'training'/);
    assert.match(turn, /clovece:ai-training-decision/);
    assert.ok(turn.includes("addAITrainingEvaluation?.(playerName, pendingAIDebugExport.decision.trainedKnowledge ? 'naučeno' : 'vyhodnocení')"));
    assert.ok(log.includes("'[' + item.sender + ': ' + item.text + ']'"));
    assert.ok(log.includes("'[' + item.sender + ': ' + item.text + ']'"));
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
    assert.ok(endpoint.includes("gmdate('Ymd-His', $createdAtUnix)"));
    assert.ok(endpoint.includes("sprintf('%04d', $nextSequence)"));
    assert.ok(endpoint.includes("$resultCode = $feedbackType === 'positive' ? 'ok' : 'err';"));
    assert.ok(endpoint.includes("$sequenceLockPath = $realDirectory . DIRECTORY_SEPARATOR . '.sequence.lock';"));
    assert.ok(!endpoint.includes("$record['id'] . '.json'"));
    const knowledge = await read('../ai-training-knowledge.php');
    assert.ok(knowledge.includes("preg_match('/^\\\\d{8}-\\\\d{6}-\\\\d{4,}-(ok|err)\\\\.json$/"));
    assert.ok(knowledge.includes("$memory['lastFile']"));
    assert.ok(knowledge.includes("$memory['queueOffset']"));
    assert.match(endpoint, /LOCK_EX/);
    assert.ok(endpoint.includes('$denyRule = "Require all denied\\n";'));
    assert.ok(endpoint.includes("trim($denyContents) === 'Require all denied\\\\n'"));
    assert.ok(endpoint.includes('ftruncate($repairHandle, 0)'));
    assert.match(endpoint, /\.training-queue/);
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
    assert.match(panel, /ai-training-toggle/);
    assert.match(panel, /setExpanded\(true\)/);
    assert.match(panel, /setExpanded\(!expanded\)/);
    assert.match(panel, /childElementCount > 0/);
    assert.match(panel, /currentDecision = null/);
    assert.match(panel, /Bez instrukce – nic nebylo uloženo/);
    assert.match(panel, /is-hidden/);
    const styles = await read('../css/ai-training.css');
    assert.match(styles, /--training-panel-width:370px/);
    assert.match(styles, /left:2px;bottom:2px/);
    assert.match(panel, /pointerdown/);
    assert.match(panel, /pointermove/);
    assert.match(styles, /\.ai-training-panel\.is-collapsed/);
    assert.match(styles, /\.ai-training-panel:not\(\.is-collapsed\)/);
    assert.match(styles, /\.ai-training-buttons button\{[^}]*flex:1 1 0/);
    assert.match(styles, /\.ai-training-buttons\{display:flex;width:100%/);
    assert.match(panel, /context: decisionToSave/);
    assert.ok(panel.includes('instruction: instruction || null'));
    assert.match(panel, /ai-training\.php/);
});


test('training chat contains only a short evaluation marker and automatic first deployment is not evaluated', async () => {
    const turn = await read('../js/game-turn.js');
    const log = await read('../js/game-log.js');
    const panel = await read('../js/ai-training-overlay.js');
    assert.ok(turn.includes("addAITrainingEvaluation?.(playerName, pendingAIDebugExport.decision.trainedKnowledge ? 'naučeno' : 'vyhodnocení')"));
    assert.match(turn, /legalMoves\.length === 1[\s\S]*?pendingAIForcedMove = trainingAI[\s\S]*?return legalMoves\[0\]/);
    assert.match(turn, /addAITrainingEvaluation\?\.\(game\.players\[playerId\]\.name, 'jediný možný tah'\)/);
    assert.match(turn, /hasPieceInBase[\s\S]*?Number\(game\.diceValue\) === 6/);
    assert.match(turn, /Povinné nasazení při šestce je dané pravidlem/);
    assert.ok(log.includes("'[' + item.sender + ': ' + item.text + ']'"));
    assert.match(panel, /positionLabel\(beforePiece\.steps[\s\S]*?positionLabel\(afterPiece\.steps/);
    assert.match(panel, /cleanExplanation/);
    assert.match(panel, /protože jsem v závod/);
});


test('normal AI reads compiled memory only; trainer imports queued new JSON incrementally', async () => {
    const endpoint = await read('../ai-training-knowledge.php');
    const writer = await read('../ai-training.php');
    const client = await read('../js/ai-training-knowledge.js');
    const turn = await read('../js/game-turn.js');
    const strategy = await read('../js/ai-strategy.js');
    assert.ok(endpoint.includes('HTTP_X_CSRF_TOKEN'));
    assert.ok(endpoint.includes("'/instructions'"));
    assert.ok(endpoint.includes('Require') && endpoint.includes('denied'));
    assert.ok(endpoint.includes('.training-queue'));
    assert.ok(endpoint.includes('queueOffset'));
    assert.ok(endpoint.includes('glob(')); // one-time migration only, not a per-turn directory scan
    assert.ok(writer.includes('.training-queue'));
    assert.ok(writer.includes("fopen($queuePath, 'ab')"));
    assert.ok(client.includes("requestMemory('memory')"));
    assert.ok(client.includes("requestMemory('train')"));
    assert.ok(client.includes('refreshAITrainingKnowledge'));
    assert.ok(turn.includes("refreshAITrainingKnowledge({ trainer: trainingAI })"));
    assert.ok(turn.includes('chooseAIMoveDecision(game, undefined, knowledge.memory)'));
    assert.ok(strategy.includes('learnedMemory.situations'));
    assert.ok(strategy.includes('compiled-memory'));
});

test('training panel explicitly identifies decisions influenced by stored instructions', async () => {
    const panel = await read('../js/ai-training-overlay.js');
    const styles = await read('../css/ai-training.css');
    const turn = await read('../js/game-turn.js');
    assert.match(panel, /NAUČENO/);
    assert.match(panel, /usedInstructions/);
    assert.match(styles, /ai-training-learned/);
    assert.match(turn, /trainedKnowledge/);
    assert.match(turn, /'naučeno'/);
});


test('trainer preserves each decision across chained rolls and exposes earlier decisions', async () => {
    const turn = await read('../js/game-turn.js');
    const panel = await read('../js/ai-training-overlay.js');
    assert.match(turn, /trainingDecisionHistory = \[\]/);
    assert.match(turn, /trainingDecisionHistory\.push\(pendingAIDebugExport\)/);
    assert.match(turn, /clovece:ai-training-decisions/);
    assert.match(turn, /publishTrainingDecisionHistory\(\)/);
    assert.match(panel, /ai-training-history/);
    assert.match(panel, /decisionHistory/);
    assert.match(panel, /reviewedDecisionIds/);
    assert.match(panel, /Učit: figurka/);
});

test('structured correction is compiled only when the preferred piece was legal in that decision', async () => {
    const panel = await read('../js/ai-training-overlay.js');
    const compiler = await read('../ai-training-knowledge.php');
    assert.match(panel, /decisionToSave\.decision\.preferredPieceId = preferredPieceId/);
    assert.match(panel, /context: decisionToSave/);
    assert.match(compiler, /preferredPieceId/);
    assert.match(compiler, /legalMoves/);
    assert.match(compiler, /in_array\(\$id, array_map\('intval', \$legalMoves\), true\)/);
});


test('trainer toolbar renders the dice visibility toggle before the info button', async () => {
    const board = await read('../js/game-board-view.js');
    assert.match(board, /data-dice-display="toggle"/);
    assert.ok(board.indexOf('data-dice-display="toggle"') < board.indexOf('data-game-info="toggle"'));
    assert.match(board, /data-game-info="toggle"/);
    assert.ok(board.indexOf('data-game-info="toggle"') < board.indexOf('data-board-style="\' + style'));
    assert.match(board, /NASTAVENÍ VYTVOŘENÉ HRY/);
    assert.match(board, /game\.trackLength/);
    assert.match(board, /game\.aiDifficulty/);
    assert.match(board, /game\.rules\?\.\[key\]/);
    assert.match(board, /game\.players\.forEach/);
});


test('trainer dice picker supports manual human rolls and selectable automatic/manual AI rolling', async () => {
    const turn = await read('../js/game-turn.js');
    const view = await read('../js/game-view.js');
    const screen = await read('../js/game-screen.js');
    const markup = await read('../screens/game.php');
    const styles = await read('../css/debug.css');
    const board = await read('../js/game-board-view.js');
    assert.match(turn, /trainerDiceModeKey/);
    assert.match(turn, /needsManualAIDice\(\)/);
    assert.match(turn, /function selectDice\(value\)/);
    assert.match(turn, /rollDice\(game, selectedValue === null \? undefined : selectedValue\)/);
    assert.match(turn, /doStartingRoll\(isAI, selectedValue\)/);
    assert.match(view, /trainer-dice-controls/);
    assert.match(board, /data-dice-display="toggle"/);
    assert.ok(board.indexOf('data-dice-display="toggle"') < board.indexOf('data-game-info="toggle"'));
    assert.doesNotMatch(view, /ensureDiceDisplayToggle/);
    assert.match(screen, /\[data-dice-display\]/);
    assert.match(screen, /dice-display-hidden/);
    assert.match(view, /AI KOSTKA: AUTOMATICKY/);
    assert.match(screen, /turnController\.selectDice/);
    assert.match(screen, /turnController\.toggleAIDiceMode/);
    assert.doesNotMatch(markup, /trainer-dice-controls|data-dice-value/);
    assert.match(view, /ensureTrainerDiceControls\(trainerMode\)/);
    assert.match(view, /insertAdjacentHTML\('afterend', markup\)/);
    assert.equal((view.match(/data-dice-value="[1-6]"/g) || []).length, 6);
    assert.match(styles, /\.trainer-die \.pip\.p5/);
    assert.match(styles, /\.trainer-die\.is-selected/);
    assert.doesNotMatch(markup, /trainer-dice-player-name/);
});

test('trainer dice controls are injected only in trainer mode and delegated dynamically', async () => {
    const screen = await read('../screens/game.php');
    const view = await read('../js/game-view.js');
    const controls = await read('../js/game-screen.js');
    assert.doesNotMatch(screen, /trainer-dice-controls|data-dice-value/);
    assert.match(view, /ensureTrainerDiceControls\(trainerMode\)/);
    assert.match(view, /if \(!trainerMode\)[\s\S]*?controls\?\.remove\(\)/);
    assert.match(view, /insertAdjacentHTML\('afterend', markup\)/);
    assert.match(controls, /#trainer-dice-options \[data-dice-value\]/);
    assert.match(controls, /#trainer-ai-dice-mode/);
    assert.match(view, /diceRow\.classList\.toggle\('hidden', !\['start-roll', 'roll'\]\.includes\(game\.phase\)\)/);
});


test('debug weight formatting preserves integer scale and useful decimal precision', async () => {
    const { formatDebugWeight } = await import('../js/debug-overlay.js');
    assert.equal(formatDebugWeight(100000), '100000');
    assert.equal(formatDebugWeight(0.08), '0.08');
    assert.equal(formatDebugWeight(0.035), '0.035');
    assert.equal(formatDebugWeight(0.00000001), '1e-8');
    assert.equal(formatDebugWeight(Number.NaN), '—');
    assert.equal(formatDebugWeight(undefined), '—');
    assert.equal(formatDebugWeight(null), '—');
    assert.equal(formatDebugWeight(''), '—');
});

test('debug diagnostics expose exactly ten named strategic weights and refresh training state', async () => {
    const debug = await read('../js/debug-overlay.js');
    const config = await read('../js/ai-weight-config.js');
    assert.match(debug, /AI_WEIGHT_DEFINITIONS/);
    assert.match(debug, /Aktivní strategické váhy/);
    assert.match(debug, /window\.setInterval\(loadAIWeightState, 30000\)/);
    assert.match(debug, /addEventListener\('visibilitychange'/);
    assert.match(config, /AI_WEIGHT_DEFINITIONS = Object\.freeze\(\[/);
    assert.match(config, /flexibility/);
});

test('debug mode numbers every pawn in the center in both board renderers', async () => {
    const board2D = await read('../js/game-board-2d.js');
    const board3D = await read('../js/game-board-3d.js');
    assert.match(board2D, /debug-piece-number/);
    assert.match(board2D, /fill="#000"/);
    assert.match(board2D, /pieceId \+ 1/);
    assert.match(board3D, /has\('debug'\)/);
    assert.match(board3D, /fillText\(String\(pieceId \+ 1\)/);
    assert.match(board3D, /label\.position\.set/);
});

test('mandatory moves and first deployment are excluded from tactical training review', async () => {
    const turn = await read('../js/game-turn.js');
    assert.match(turn, /if \(legalMoves\.length === 1\)[\s\S]*?pendingAIForcedMove = trainingAI[\s\S]*?return legalMoves\[0\]/);
    assert.match(turn, /if \(Number\(game\.diceValue\) === 6 && hasPieceInBase\)[\s\S]*?return legalMoves\[0\] \?\? null/);
    assert.match(turn, /if \(legalMoves\.length < 2 \|\| \(Number\(game\.diceValue\) === 6 && hasPieceInBase\) \|\| !chooseAIMoveDecision\) return null/);
    assert.match(turn, /const automaticMandatoryDeployment = Number\(game\.diceValue\) === 6 && hasPieceInBase/);
});
