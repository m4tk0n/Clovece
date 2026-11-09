import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('debug page imports only its private game and AI copies', async () => {
 const html=await read('../debug/index.php'),app=await read('../debug/debug.js');
 assert.match(html,/debug\\.css/);assert.match(html,/debug\\.js/);
 assert.match(app,/from ['"]\\.\\/js\\/game-engine\\.js['"]/);
 assert.match(app,/from ['"]\\.\\/js\\/ai-strategy\\.js['"]/);
 assert.match(app,/from ['"]\\.\\/js\\/ai-weight-config\\.js['"]/);
 assert.doesNotMatch(app,/from ['"]\\.\\.\\/js\\//);
});
test('debug game and AI copies stay within debug/js',async()=>{
 for(const path of ['../debug/js/game-engine.js','../debug/js/ai-strategy.js','../debug/js/ai-weight-config.js']) assert.doesNotMatch(await read(path),/\\.\\.\\/js\\//,path);
 assert.match(await read('../debug/js/game-engine.js'),/from ['"]\\.\\/ai-strategy\\.js['"]/);
 assert.match(await read('../debug/js/ai-strategy.js'),/from ['"]\\.\\/ai-weight-config\\.js['"]/);
 assert.match(await read('../debug/js/ai-weight-config.js'),/from ['"]\\.\\/ai-tactical-weights\\.js['"]/);
});
test('debug files begin as an exact production snapshot',async()=>{
 for(const [a,b] of [['../js/game-engine.js','../debug/js/game-engine.js'],['../js/ai-strategy.js','../debug/js/ai-strategy.js'],['../js/ai-weight-config.js','../debug/js/ai-weight-config.js'],['../js/ai-tactical-weights.js','../debug/js/ai-tactical-weights.js']]) assert.equal(await read(a),await read(b),b);
});
test('debug workspace documents manual promotion only',async()=>{const doc=await read('../debug/README.md');assert.match(doc,/nepřenáší automaticky/i);assert.match(doc,/ručně/i);});
