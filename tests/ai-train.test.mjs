import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { isValidAINeuralModel } from '../js/ai-neural-network.js';

test('offline trainer exports a runtime-valid neural model', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clovece-ai-train-'));
    try {
        const input = path.join(dir, 'input');
        const output = path.join(dir, 'candidate.js');
        const metrics = path.join(dir, 'metrics.json');
        fs.mkdirSync(input);
        const lines = [];
        for (let gameId = 1; gameId <= 120; gameId++) {
            const a = Array(18).fill(0);
            const b = Array(18).fill(0);
            a[6] = gameId / 120;
            b[7] = gameId / 20;
            lines.push(JSON.stringify({
                gameId, completed: true,
                candidates: [
                    { pieceId: 0, features: a, teacherScore: 10 },
                    { pieceId: 1, features: b, teacherScore: 0 }
                ]
            }));
        }
        fs.writeFileSync(path.join(input, 'fixture.jsonl'), lines.join('\n') + '\n');
        const run = spawnSync(process.execPath, [
            'scripts/ai-train.mjs', '--input-dir=' + input, '--epochs=1',
            '--output=' + output, '--metrics=' + metrics
        ], { encoding: 'utf8' });
        assert.equal(run.status, 0, run.stderr || run.stdout);
        const imported = await import(pathToFileURL(output).href + '?test=' + Date.now());
        assert.equal(isValidAINeuralModel(imported.default), true);
        assert.equal(imported.default.layers[0].outputSize, 32);
        assert.equal(imported.default.layers.at(-1).outputSize, 1);
        assert.equal(JSON.parse(fs.readFileSync(metrics, 'utf8')).pairs.total, 120);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
