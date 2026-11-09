import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('debug stránka používá živou hru, společná pravidla a pouze 2D desku', async () => {
 const [page,board,engine,doc] = await Promise.all([
  read('../debug/index.php'),read('../js/game-board-view.js'),read('../js/game-engine.js'),read('../debug/README.md')
 ]);
 assert.match(page,/debug=training/);
 assert.match(board,/if \(trainingMode\) \{/);
 assert.match(engine,/export function createGame/);
 assert.match(doc,/společný herní engine/);
 assert.match(doc,/výhradně 2D/);
});
