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
