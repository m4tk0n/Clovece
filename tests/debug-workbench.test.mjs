import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('debug vstup vykresluje společnou hru v izolovaném výukovém režimu', async () => {
 const [page,index,board,bootstrap] = await Promise.all([
  read('../debug/index.php'),read('../index.php'),read('../js/game-board-view.js'),read('../debug/js/debug-bootstrap.js')
 ]);
 assert.match(page,/\$_GET\['debug'\]\s*=\s*'training'/);
 assert.match(page,/<base href="\.\.\/">);
 assert.match(index,/debug\/js\/debug-bootstrap\.js/);
 assert.match(index,/debug\/css\/ai-training\.css/);
 assert.match(board,/trainingMode/);
 assert.match(bootstrap,/initAITrainingOverlay/);
});


test('vstup /debug/ nastaví výukový režim ještě před spuštěním JavaScriptových modulů', async () => {
 const [page,view,turn,bootstrap,board] = await Promise.all([
  read('../debug/index.php'),read('../js/game-board-view.js'),read('../debug/js/game-turn.js'),
  read('../debug/js/debug-bootstrap.js'),read('../js/game-board-2d.js')
 ]);
 assert.match(page,/searchParams\.set\("debug","training"\)/);
 assert.match(view,/trainingMode = debugParam === 'trainer' \|\| debugParam === 'training'/);
 assert.match(view,/if \(trainingMode\)[\s\S]*?ensureModeStyles\('2d'\)[\s\S]*?return '2d'/);
 assert.match(view,/if \(trainingMode\) \{[\s\S]*?return '2d';\s*\}/);
 assert.match(turn,/isDebugPath[\s\S]*?trainingAI = isDebugPath/);
 assert.match(bootstrap,/return trainingMode \? true : false/);
 assert.match(board,/new URLSearchParams\(window\.location\.search\)\.has\('debug'\)/);
 assert.match(board,/debug-piece-number/);
});

test('vynucený tah se provede automaticky i člověku a do chatu zapíše konkrétní pravidlo', async () => {
 const turn = await read('../debug/js/game-turn.js');
 assert.match(turn,/function getForcedRuleCommand\(pieceId\)/);
 assert.match(turn,/return '\/pravidlo nasadit'/);
 assert.match(turn,/return '\/povinnost do domecku'/);
 assert.match(turn,/addAITrainingEvaluation\?\.\(game\.players\[playerId\]\.name, forcedRuleCommand/);
 assert.match(turn,/else if \(trainingAI\)[\s\S]*?pendingAIForcedMove = true/);
 assert.match(turn,/if \(trainingAI\) executeMove\(forcedMove\)/);
 assert.doesNotMatch(turn,/const automaticMandatoryDeployment/);
});

test('AI strategicky vyhodnocuje více možností nasazení a panel dostává i rozhodnutí bez reason stringu', async () => {
 const turn = await read('../debug/js/game-turn.js');
 const panel = await read('../debug/js/ai-training-overlay.js');
 assert.match(turn,/if \(legalMoves\.length === 1\)[\s\S]*?publishForcedAIDecision/);
 assert.doesNotMatch(turn,/if \(Number\(game\.diceValue\) === 6 && hasPieceInBase\)[\s\S]*?publishForcedAIDecision/);
 assert.match(turn,/if \(!decision\) return null;[\s\S]*?if \(\(debugAI \|\| trainingAI\) && decision\)/);
 assert.match(panel,/PROČ AI VYBRALA TENTO TAH/);
 assert.match(panel,/decision\.explanation/);
 assert.match(panel,/VÝPOČET VŠECH 6 MOŽNÝCH PŘÍŠTÍCH HODŮ/);
 assert.match(panel,/MOŽNÉ REAKCE SOUPEŘŮ/);
});
