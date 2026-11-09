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
    const index = await read('../debug/index.php');
    assert.match(styles, /\.game-chat \.chat-messages[\s\S]*?height: clamp\(84px, 19dvh, 190px\)/);
    assert.match(styles, /\.ai-training-content[\s\S]*?overflow-y: auto/);
    assert.match(styles, /max-height: calc\(100dvh - 8px\)/);
    assert.match(index, /debug\/css\/debug-layout\.css/);
});
