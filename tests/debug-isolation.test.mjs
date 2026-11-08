import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerGameExtension, getGameExtensionValue } from '../js/game-extensions.js';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('standard game modules do not import or contain debug implementation', async () => {
    const paths = [
        '../js/bootstrap.js',
        '../js/app.js',
        '../js/game-board-view.js',
        '../js/game-board-3d.js',
        '../js/game-board-2d.js',
        '../js/game-board-scene.js',
        '../js/game-turn.js'
    ];
    for (const path of paths) {
        const source = await read(path);
        assert.doesNotMatch(source, /debug-overlay|game-board-debug|debug-bootstrap|clovece:debug/i, path);
        assert.doesNotMatch(source, /(?:^|[?&])debug=1/i, path);
    }
});

test('debug entry point is emitted only inside the server-side debug condition', async () => {
    const source = await read('../index.php');
    assert.match(source, /\$debugMode\s*=\s*isset\(\$_GET\['debug'\]\).*?===\s*'1'/s);
    assert.match(source, /if\s*\(\$debugMode\s*\|\|\s*\$trainingMode\)\s*:\s*\?>\s*<script type="module" src="js\/debug-bootstrap\.js/s);
    assert.doesNotMatch(source, /"\.\/js\/debug-overlay\.js"\s*:/);
});

test('optional extension hooks preserve standard behavior when no extension is registered', () => {
    assert.equal(getGameExtensionValue('shouldAutoMoveForced', true, {}), true);
    const unregister = registerGameExtension({
        shouldAutoMoveForced: () => false
    });
    try {
        assert.equal(getGameExtensionValue('shouldAutoMoveForced', true, {}), false);
    } finally {
        unregister();
    }
    assert.equal(getGameExtensionValue('shouldAutoMoveForced', true, {}), true);
});
