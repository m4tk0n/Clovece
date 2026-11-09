// /tests/debug-layout.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('debug jediný legální tah se neodesílá do panelu AI', async () => {
    const turn = await read('../debug/js/game-turn.js');
    const app = await read('../debug/js/app.js');
    const branch = turn.match(/if \(legalMoves\.length === 1\) \{([\s\S]*?)\n        \}/);
    assert.ok(branch, 'musí existovat samostatná větev jediného legálního tahu');
    assert.match(branch[1], /pendingAIForcedMove = true/);
    assert.match(branch[1], /return legalMoves\[0\]/);
    assert.doesNotMatch(branch[1], /publishForcedAIDecision|clovece:ai-training-decision/);
    assert.match(turn, /addChatEntry\?\.\([\s\S]*?#hrac \[' \+ player\.name \+ '\][\s\S]*?jediný možný tah \{\/pravidlo\} #F/);
    assert.match(app, /addChatEntry,/);
});

test('debug chat shows more recent log lines and AI panel scrolls internally', async () => {
    const styles = await read('../debug/css/debug-layout.css');
    const trainingStyles = await read('../debug/css/ai-training.css');
    const index = await read('../debug/index.php');
    assert.match(styles, /#game-screen \.game-footer[\s\S]*?flex: 1 1 0%;[\s\S]*?min-height: 0/);
    assert.match(styles, /#game-screen \.game-chat \.chat-messages[\s\S]*?flex: 1 1 auto;[\s\S]*?height: auto;[\s\S]*?min-height: 0;[\s\S]*?max-height: none/);
    assert.match(trainingStyles, /\.ai-training-analysis[\s\S]*?overflow: auto/);
    assert.match(trainingStyles, /\.ai-training-panel[\s\S]*?max-height: min\(/);
    assert.match(index, /debug\/css\/debug-layout\.css/);
});
