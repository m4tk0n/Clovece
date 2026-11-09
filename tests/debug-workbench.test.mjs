import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('debug vstup vede do živé společné hry v režimu výuky', async () => {
 const [page,index,board,bootstrap] = await Promise.all([
  read('../debug/index.php'),read('../index.php'),read('../js/game-board-view.js'),read('../js/debug-bootstrap.js')
 ]);
 assert.match(page,/Location: '\.\.\/?debug=training'/);
 assert.match(index,/js\/debug-bootstrap\.js/);
 assert.match(index,/css\/ai-training\.css/);
 assert.match(board,/let view3d = trainingMode \? false : loadView\(\)/);
 assert.match(bootstrap,/initAITrainingOverlay/);
});
