import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('debug page imports only its private game and AI copies', async () => {
 const html=await read('../debug/index.php'),app=await read('../debug/debug.js');
 assert.ok(html.includes('debug.css'));
 assert.ok(html.includes('debug.js'));
 for (const module of ['game-engine','ai-strategy','ai-weight-config']) {
   assert.ok(app.includes("from './js/" + module + ".js'"));
 }
 assert.ok(!app.includes("from '../js/"));
});
test('debug modules stay within debug/js',async()=>{
 for(const path of ['../debug/js/game-engine.js','../debug/js/ai-strategy.js','../debug/js/ai-weight-config.js','../debug/js/ai-tactical-weights.js']) {
   const source=await read(path);
   assert.ok(!source.includes("from '../js/"));
 }
 assert.ok((await read('../debug/js/game-engine.js')).includes("from './ai-strategy.js'"));
 assert.ok((await read('../debug/js/ai-strategy.js')).includes("from './ai-weight-config.js'"));
 assert.ok((await read('../debug/js/ai-weight-config.js')).includes("from './ai-tactical-weights.js'"));
});
test('debug copies expose their own game and strategy APIs',async()=>{
 const engine=await read('../debug/js/game-engine.js'),strategy=await read('../debug/js/ai-strategy.js'),config=await read('../debug/js/ai-weight-config.js');
 assert.ok(engine.includes('export function createGame'));
 assert.ok(engine.includes('export function getValidMoves'));
 assert.ok(strategy.includes('export function chooseStrategicDecision'));
 assert.ok(config.includes('export const AI_WEIGHT_COUNT'));
});
test('debug workspace documents manual promotion only',async()=>{const doc=await read('../debug/README.md');assert.match(doc,/nepřenášejí automaticky/i);assert.match(doc,/ručně přenesou/i);});
