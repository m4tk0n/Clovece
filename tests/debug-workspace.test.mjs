// /tests/debug-workspace.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('debug vstup používá společný engine a 2D renderer bez přesměrování do produkční URL', async () => {
 const [page,board,engine,doc] = await Promise.all([
  read('../debug/index.php'),read('../js/game-board-view.js'),read('../js/game-engine.js'),read('../debug/README.md')
 ]);
 assert.match(page,/\$_GET\['debug'\]\s*=\s*'training'/);
 assert.match(page,/require dirname\(__DIR__\)\s*\.\s*'\/index\.php'/);
 assert.match(page, /<base href="\.\.\/">/);
 assert.doesNotMatch(page,/header\('Location:/);
 assert.match(board,/if \(trainingMode\) \{/);
 assert.match(engine,/export function createGame/);
 assert.match(doc,/společné/);
 assert.match(doc,/pouze debug/);
});
