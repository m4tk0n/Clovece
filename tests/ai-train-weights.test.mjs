import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

test('reward trainer uses completed game results and keeps immediate win fixed', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'clovece-weight-train-'));
    const input = path.join(directory, 'self-play');
    const weights = path.join(directory, 'weights.json');
    const module = path.join(directory, 'ai-tactical-weights.js');
    const reportPath = path.join(directory, 'report.json');
    fs.mkdirSync(input, { recursive: true });
    try {
        const lines = [];
        for (let game = 0; game < 40; game++) {
            for (let player = 0; player < 2; player++) {
                for (let turn = 0; turn < 4; turn++) {
                    const winner = player === 0;
                    lines.push(JSON.stringify({
                        gameId: 'training-game-' + game,
                        completed: true,
                        playerId: player,
                        reward: winner ? 1 : -1,
                        selection: 'reinforce-softmax',
                        policyTemperature: 4,
                        behaviorWeights: { immediateWin: 100000, ownProgress: 0.08, opponentSetback: 0.035, threatReduction: 12, captureOpponent: 5, captureOwn: 7, finishPiece: 8, deployPiece: 1.5, enterHome: 2.5, homeProgress: 0.4 },
                        selectedProbability: winner ? 0.549834 : 0.450166,
                        selectedPieceId: winner ? 0 : 1,
                        candidates: [
                            { pieceId: 0, teacherScore: 0.8, teacherFactors: { ownProgress: 10, opponentSetback: 0, threatReduction: 0, capturedOpponent: false, capturedOwnPiece: false, finishedPiece: false, winning: false } },
                            { pieceId: 1, teacherScore: 0, teacherFactors: { ownProgress: 0, opponentSetback: 0, threatReduction: 0, capturedOpponent: false, capturedOwnPiece: false, finishedPiece: false, winning: false } }
                        ]
                    }));
                }
            }
        }
        fs.writeFileSync(path.join(input, 'games.jsonl'), lines.join('\n') + '\n');
        const result = spawnSync(process.execPath, [
            'scripts/ai-train-weights.mjs',
            '--input-dir=' + input,
            '--output-weights=' + weights,
            '--module=' + module,
            '--report=' + reportPath,
            '--epochs=40',
            '--learning-rate=0.05'
        ], { encoding: 'utf8', timeout: 120000 });
        assert.equal(result.status, 0, result.stderr || result.stdout);
        const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        assert.equal(report.method, 'Off-policy REINFORCE with centered final-placement rewards and clipped action-probability correction');
        assert.ok(report.source.completedGames >= 10);
        assert.ok(report.decisions.training >= 100);
        assert.ok(report.decisions.validation >= 20);
        assert.equal(report.safeguards.immediateWinFixed, true);
        assert.equal(report.finalWeights.immediateWin, 100000);
        assert.equal(typeof report.accepted, 'boolean');
        if (report.accepted) {
            const config = JSON.parse(fs.readFileSync(weights, 'utf8'));
            assert.equal(config.weights.immediateWin, 100000);
            assert.ok(fs.readFileSync(module, 'utf8').includes('immediateWin'));
        }
    } finally {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});
