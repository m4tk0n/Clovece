/**
 * Vstupní bod rozšířených režimů debug.
 * ?debug=1 = technická diagnostika.
 * ?debug=training = výuka AI bez technických diagnostických údajů.
 */
import { registerGameExtension } from './game-extensions.js';
import { buildDebugMovePaths } from './game-board-debug.js?v=20261106-1';
import { geometry, trackPosition, armPoint, laneRadius } from './game-board-geometry.js';

const mode = new URLSearchParams(window.location.search).get('debug');
const trainingMode = mode === 'trainer' || mode === 'training';
const log = trainingMode ? null : await import('./debug-overlay.js').then(module => module.initDebugOverlay());

if (trainingMode) {
    const { initAITrainingOverlay } = await import('./ai-training-overlay.js');
    initAITrainingOverlay();
}

const format = value => Number.isFinite(value) ? Number(value).toFixed(3) : '—';

function cameraSnapshot(stage) {
    if (!stage?._camera || !stage?._controls) return;
    const camera = stage._camera.position;
    const target = stage._controls.target;
    const dx = camera.x - target.x;
    const dy = camera.y - target.y;
    const dz = camera.z - target.z;
    const tilt = Math.atan2(Math.hypot(dx, dz), dy) * 180 / Math.PI;
    window.dispatchEvent(new CustomEvent('clovece:debug-camera', {
        detail: {
            x: camera.x, y: camera.y, z: camera.z,
            targetX: target.x, targetY: target.y, targetZ: target.z,
            tilt
        }
    }));
}

function addFieldNumber(THREE, parent, label, x, y, z, size, color = '#18221e') {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, 128, 128);
    context.fillStyle = color;
    context.font = 'bold 68px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, 64, 66);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshBasicMaterial({
        map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.renderOrder = 5;
    parent.add(mesh);
}

function trainingFieldNumbers({ game, style, boardGeometry }) {
    const g = boardGeometry || geometry(game, style);
    const labels = [];
    for (let index = 0; index < game.trackLength; index++) {
        const point = trackPosition(index, game, style);
        const x = point.x + g.field * .58;
        const y = point.y - g.field * .58;
        const radius = Math.max(4.5, g.field * .48);
        const fontSize = Math.max(6, g.field * .64);
        labels.push(
            '<g class="training-field-number">' +
            '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + radius.toFixed(1) + '" fill="#07100e" fill-opacity=".88" stroke="#fff" stroke-opacity=".8" stroke-width=".8"/>' +
            '<text x="' + x.toFixed(1) + '" y="' + (y + fontSize * .34).toFixed(1) + '" text-anchor="middle" font-family="Arial,sans-serif" font-size="' + fontSize.toFixed(1) + '" font-weight="900" fill="#fff">' + (index + 1) + '</text>' +
            '</g>'
        );
    }
    for (let slot = 0; slot < g.n; slot++) {
        const angle = (-90 + slot * 360 / g.n) * Math.PI / 180;
        for (let lane = 0; lane < 4; lane++) {
            const point = armPoint(slot, g.n, laneRadius(g, lane), 0);
            const x = point.x + Math.cos(angle) * g.field * .55;
            const y = point.y + Math.sin(angle) * g.field * .55;
            labels.push(
                '<text class="training-home-number" x="' + x.toFixed(1) + '" y="' + (y + 2.1).toFixed(1) +
                '" text-anchor="middle" font-family="Arial,sans-serif" font-size="' + Math.max(5, g.field * .43).toFixed(1) +
                '" font-weight="900" fill="#fff" stroke="#07100e" stroke-width="1.8" paint-order="stroke">D' +
                (slot + 1) + '-' + (lane + 1) + '</text>'
            );
        }
    }
    return labels.join('');
}

const debugExtension = {
    onResourceLoad({ name, status, duration }) {
        if (log) log(name, status, duration);
    },

    shouldAutoMoveForced() {
        // Technický debug ponechává i jediný tah k ručnímu potvrzení.
        // Výukový režim naopak nesmí měnit běžné chování hry.
        return trainingMode ? undefined : false;
    },

    renderBoardOverlay2D({ game, style, boardGeometry }) {
        if (trainingMode) return '';
        const paths = buildDebugMovePaths(game, style);
        return paths.map(path => path.points.map(point => {
            const offset = (path.pieceId - 1.5) * boardGeometry.field * .12;
            const x = point.x + offset;
            const y = point.y - offset;
            const radius = Math.max(7, boardGeometry.field * .72);
            return '<g class="debug-move-step" data-debug-player="' + path.playerId + '" data-debug-piece="' + path.pieceId + '">' +
                '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + radius.toFixed(1) + '" fill="' + path.color + '" fill-opacity=".88" stroke="#fff" stroke-width="2"/>' +
                '<text x="' + x.toFixed(1) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="middle" font-family="Arial,sans-serif" font-size="' + Math.max(10, boardGeometry.field * .9).toFixed(1) + '" font-weight="900" fill="#fff" stroke="#17211d" stroke-width="1.8" paint-order="stroke">' + point.number + '</text>' +
                '</g>';
        }).join('')).join('');
    },

    renderBoardLabels2D(context) {
        return trainingMode ? trainingFieldNumbers(context) : '';
    },

    onBoardSceneBuilt({ THREE, board, data, unit }) {
        if (trainingMode) return;
        data.track.forEach(cell => {
            addFieldNumber(THREE, board, String(cell.index + 1),
                cell.x * unit, .415, cell.z * unit,
                Math.max(.20, cell.radius * unit * 1.45));
        });
        data.lanes.forEach(lane => lane.cells.forEach((cell, index) => {
            addFieldNumber(THREE, board, 'D' + (lane.slot + 1) + '-' + (index + 1),
                cell.x * unit, .415, cell.z * unit,
                Math.max(.19, cell.radius * unit * 1.45), '#ffffff');
        }));
    },

    onBoardStageReady(stage) {
        if (trainingMode || !stage?._controls) return;
        if (!stage._debugCameraListener) {
            stage._debugCameraListener = () => cameraSnapshot(stage);
            stage._controls.addEventListener('change', stage._debugCameraListener);
        }
        cameraSnapshot(stage);
    },

    onBoardDispose(stage) {
        if (stage?._debugCameraListener) {
            stage._controls?.removeEventListener('change', stage._debugCameraListener);
            stage._debugCameraListener = null;
        }
        if (!trainingMode) {
            window.dispatchEvent(new CustomEvent('clovece:debug-camera', { detail: { active: false } }));
        }
    }
};

registerGameExtension(debugExtension);
if (log) log('Diagnostické moduly připojeny', 'OK');
