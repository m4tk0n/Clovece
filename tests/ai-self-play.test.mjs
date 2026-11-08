import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('self-play ukládá úplný záznam po každé dokončené partii', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'clovece-self-play-'));
    const output = path.join(directory, 'games.jsonl');
    const metrics = path.join(directory, 'metrics.json');
    try {
        const result = spawnSync(process.execPath, [
            'scripts/ai-self-play.mjs',
            '--games=1', '--players=2', '--board=40', '--seed=1700000001',
            '--max-actions=1000', '--run-id=self-play-test',
            '--output=' + output, '--metrics=' + metrics
        ], { encoding: 'utf8', timeout: 120000 });
        assert.equal(result.status, 0, result.stderr || result.stdout);
        const records = fs.readFileSync(output, 'utf8').trim().split(/\r?\n/).map(line => JSON.parse(line));
        assert.ok(records.length > 0, 'musí být uložen alespoň jeden tah');
        assert.ok(records.every(record => record.gameId === 'self-play-test-1700000001-1'));
        assert.ok(records.every(record => record.gameState && Array.isArray(record.gameState.pieces)));
        assert.ok(records.every(record => record.candidates.length > 0 && Array.isArray(record.selectedFeatures)));
        assert.ok(records.every(record => typeof record.completed === 'boolean'));
        assert.ok(records.every(record => record.selection === 'reinforce-softmax' || record.selection === 'forced-immediate-win'));
        assert.ok(records.every(record => Number.isFinite(record.selectedProbability) && record.selectedProbability > 0));
        assert.ok(records.every(record => Number.isFinite(record.policyTemperature) && record.policyTemperature >= 0.25));
        assert.ok(records.every(record => record.behaviorWeights && record.behaviorWeights.immediateWin === 100000));
        assert.ok(records.every(record => record.completed || record.reward === null));
        const report = JSON.parse(fs.readFileSync(metrics, 'utf8'));
        assert.equal(report.gamesProcessed, 1);
        assert.equal(report.decisions, records.length);
        assert.equal(report.runId, 'self-play-test');
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
