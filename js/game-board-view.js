/**
 * Řízení zobrazení herní desky: výběr stylu, 2D/3D a kompatibilní API.
 *  - klasik: hvězdice s rameny (4 / 6 / 8 ramen = 40 / 48 / 80 polí),
 *  - mnohoúhelník: pole po obvodu čtyř-, šesti- a osmiúhelníku.
 * Základny leží uvnitř desky ve volném místě, takže dráha může zabírat
 * téměř celou plochu. Vzhled lze přepínat tlačítky v horní liště desky.
 */
import { buildBoardSceneData as createBoardSceneData } from './game-board-scene.js';
import { render2DBoard } from './game-board-2d.js';

const STYLE_KEY = 'clovece_board_style';
const STYLES = ['classic', 'polygon'];

let boardStyle = loadStyle();

// SVG je vždy pevný pohled shora. 3D kamera patří výhradně Three.js rendereru.
const VIEW_KEY = 'clovece_board_view';
let view3d = loadView();
let view3dUnavailable = false;
let threeRendererPromise = null;
let activeStylesMode = null;
const modeStylesPromises = new Map();

function emitDebugLoad(name, status, duration) {
    if (new URLSearchParams(window.location.search).get('debug') !== '1') return;
    window.dispatchEvent(new CustomEvent('clovece:debug-log', {
        detail: { name, status, duration }
    }));
}

function loadThreeRenderer() {
    if (!threeRendererPromise) {
        const startedAt = performance.now();
        emitDebugLoad('game-board-3d.js – načítání', '…');
        threeRendererPromise = import('./game-board-3d.js').then(module => {
            emitDebugLoad('game-board-3d.js – načteno', 'OK', Math.round(performance.now() - startedAt));
            return module;
        }).catch(error => {
            emitDebugLoad('game-board-3d.js – chyba načítání', 'CHYBA', Math.round(performance.now() - startedAt));
            threeRendererPromise = null;
            throw error;
        });
    }
    return threeRendererPromise;
}

function disposeThreeRenderer(stage) {
    if (!stage?._threeRendererModule) return;
    stage._threeRendererModule.dispose3DBoard(stage);
}

export function ensureModeStyles(mode) {
    if (mode !== '2d' && mode !== '3d') throw new Error('Neznámý režim CSS: ' + mode);
    if (activeStylesMode !== mode) {
        if (activeStylesMode) {
            for (const name of ['board-' + activeStylesMode, 'dice-' + activeStylesMode]) {
                document.getElementById('clovece-' + name + '-styles')?.remove();
                modeStylesPromises.delete(name);
            }
        }
        activeStylesMode = mode;
    }
    return Promise.all(['game-premium', 'board-' + mode, 'dice-' + mode].map(name => {
        if (modeStylesPromises.has(name)) return modeStylesPromises.get(name);
        const startedAt = performance.now();
        const link = document.createElement('link');
        link.id = 'clovece-' + name + '-styles';
        link.dataset.modeStyle = mode;
        link.rel = 'stylesheet';
        link.href = new URL('../css/' + name + '.css?v=20261106-2', import.meta.url).href;
        const promise = new Promise((resolve, reject) => {
            emitDebugLoad('css/' + name + '.css – načítání', '…');
            link.onload = () => {
                emitDebugLoad('css/' + name + '.css – načteno', 'OK', Math.round(performance.now() - startedAt));
                resolve();
            };
            link.onerror = () => {
                emitDebugLoad('css/' + name + '.css – chyba načítání', 'CHYBA', Math.round(performance.now() - startedAt));
                link.remove();
                modeStylesPromises.delete(name);
                reject(new Error('Nepodařilo se načíst css/' + name + '.css'));
            };
            document.head.appendChild(link);
        });
        modeStylesPromises.set(name, promise);
        return promise;
    }));
}

export function releaseGameView() {
    const container = document.getElementById('game-container');
    const stage = container?.querySelector('.three-board-stage');
    if (stage) disposeThreeRenderer(stage);
    if (container) {
        container.replaceChildren();
        delete container._lastGame;
        delete container._boardStyleBound;
        delete container.dataset.renderKey;
    }

    document.getElementById('clovece-game-premium-styles')?.remove();
    for (const mode of ['2d', '3d']) {
        for (const name of ['board-' + mode, 'dice-' + mode]) {
            document.getElementById('clovece-' + name + '-styles')?.remove();
        }
    }
    modeStylesPromises.clear();
    activeStylesMode = null;
    threeRendererPromise = null;
    document.documentElement.removeAttribute('data-board-view');
}

window.addEventListener('clovece:game-exit', releaseGameView);

function loadView() {
    try {
        const saved = window.localStorage.getItem(VIEW_KEY);
        return saved === null ? true : saved === '3d';
    } catch {
        return true;
    }
}

function saveView() {
    try {
        window.localStorage.setItem(VIEW_KEY, view3d ? '3d' : '2d');
    } catch {
        // Bez úložiště zůstane volba platná do obnovení stránky.
    }
}

function loadStyle() {
    try {
        const saved = window.localStorage.getItem(STYLE_KEY);
        return STYLES.includes(saved) ? saved : 'classic';
    } catch {
        return 'classic';
    }
}

function saveStyle(style) {
    try {
        window.localStorage.setItem(STYLE_KEY, style);
    } catch {
        // Úložiště nemusí být dostupné; vzhled platí aspoň do obnovení stránky.
    }
}

export function getBoardStyle() {
    return boardStyle;
}

function styleSwitchMarkup() {
    const label = { classic: 'KLASIK', polygon: 'MNOHOÚHELNÍK' };
    return '<div class="board-style-switch" role="group" aria-label="Vzhled a vykreslení hrací desky">' +
        STYLES.map(style => '<button type="button" class="board-style-btn' + (style === boardStyle ? ' is-active' : '') +
            '" data-board-style="' + style + '" aria-pressed="' + (style === boardStyle) + '">' + label[style] + '</button>').join('') +
        '<button type="button" class="board-style-btn' + (view3d ? ' is-active' : '') +
            '" data-board-view="toggle" aria-pressed="' + view3d + '">' + (view3dUnavailable ? 'BEZ 3D' : (view3d ? '3D' : '2D')) + '</button>' +
        '</div>';
}

const SWITCH_CSS = '<style>' +
    '.board-style-switch{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:4px}' +
    '.premium-board-shell{position:relative}' +
    '.board-style-btn{padding:4px 7px;border:1px solid rgba(198,169,107,.35);border-radius:6px;background:rgba(255,255,255,.04);' +
    'color:#aeb9ac;font:700 7px/1.2 "Press Start 2P",monospace;letter-spacing:.06em;cursor:pointer;pointer-events:auto}' +
    '.board-style-btn.is-active{background:rgba(198,169,107,.22);border-color:#c6a96b;color:#f3eddf}' +
    '</style>';

// Překreslí desku se zachováním panelu stavu figurek.
function restyle(container) {
    const panel = container.querySelector('#players-panel')?.innerHTML ?? '';
    container.dataset.renderKey = '';
    if (container._lastGame) renderBoard(container, container._lastGame);
    const newPanel = container.querySelector('#players-panel');
    if (newPanel) newPanel.innerHTML = panel;
}

function bindStyleSwitch(container) {
    if (container._boardStyleBound) return;
    container._boardStyleBound = true;

    container.addEventListener('click', event => {
        const styleButton = event.target.closest?.('[data-board-style]');
        if (styleButton) {
            const style = styleButton.dataset.boardStyle;
            if (!STYLES.includes(style) || style === boardStyle) return;
            boardStyle = style;
            saveStyle(style);
            restyle(container);
            return;
        }
        const viewButton = event.target.closest?.('[data-board-view]');
        if (!viewButton) return;
        view3d = !view3d;
        view3dUnavailable = false;
        saveView();
        restyle(container);
    });
}

// Sdílený čistý model. 3D renderer dostává pouze herní data a souřadnice,
// nikdy SVG element, jeho atributy ani DOM uzly.
export function buildBoardSceneData(game) {
    return createBoardSceneData(game, boardStyle);
}

export function renderBoard(container, game) {
    if (!container || !game) return;
    bindStyleSwitch(container);
    container._lastGame = game;

    // Při online pollingu se stejný herní stav nevykresluje opakovaně.
    const mode = view3d ? '3d' : '2d';
    document.documentElement.dataset.boardView = mode;
    const renderKey = boardStyle + mode + JSON.stringify(game);
    if (container.dataset.renderKey === renderKey) return;
    container.dataset.renderKey = renderKey;

    if (view3d) {
        const activePlayer = game.players[game.currentPlayer];
        let stage = container.querySelector('.three-board-stage');
        if (!stage) {
            container.innerHTML =
                '<div class="premium-board-shell">' + SWITCH_CSS +
                    '<div class="board-topline"><span class="board-kicker">THE GRAND TABLE</span>' + styleSwitchMarkup() + '</div>' +
                    '<div class="three-board-stage" aria-label="Plně prostorová hrací deska"></div>' +
                    '<div class="board-player-stats"><div class="players-panel" id="players-panel" aria-label="Stav figurek hráčů"></div></div>' +
                    '<div class="board-corner-info"><div class="board-turn-count"><span>POČET TAHŮ</span><strong>' + game.turnNumber + '</strong></div>' +
                    '<div class="board-current-player" style="--player-color:' + activePlayer.color + '"><span>NA ŘADĚ</span><strong>' + activePlayer.name + '</strong></div></div>' +
                '</div>';
            stage = container.querySelector('.three-board-stage');
        } else {
            const turn = container.querySelector('.board-turn-count strong');
            const current = container.querySelector('.board-current-player');
            if (turn) turn.textContent = game.turnNumber;
            if (current) {
                current.style.setProperty('--player-color', activePlayer.color);
                const name = current.querySelector('strong');
                if (name) name.textContent = activePlayer.name;
            }
            container.querySelectorAll('[data-board-style]').forEach(button => {
                const selected = button.dataset.boardStyle === boardStyle;
                button.classList.toggle('is-active', selected);
                button.setAttribute('aria-pressed', String(selected));
            });
        }
        // 3D renderer a jeho CSS se načtou až při skutečném vykreslení hry v 3D.
        ensureModeStyles('3d').then(() => loadThreeRenderer()).then(module => {
            if (!stage.isConnected || container.querySelector('.three-board-stage') !== stage || !view3d || container.dataset.renderKey !== renderKey) return;
            stage._threeRendererModule = module;
            module.render3DBoard(stage, buildBoardSceneData(container._lastGame || game), error => {
                // Selhání WebGL/Three.js nesmí zablokovat samotnou hru.
                // Přepnutí platí pro aktuální zobrazení; při dalším načtení se 3D zkusí znovu.
                if (!stage.isConnected || container.querySelector('.three-board-stage') !== stage || !view3d) return;
                console.error('Přepínám herní desku z 3D na 2D SVG:', error);
                view3d = false;
                view3dUnavailable = true;
                container.dataset.renderKey = '';
                renderBoard(container, container._lastGame || game);
            });
        }).catch(error => {
            if (!stage.isConnected || container.querySelector('.three-board-stage') !== stage || !view3d || container.dataset.renderKey !== renderKey) return;
            console.error('3D renderer se nepodařilo načíst:', error);
            view3d = false;
            view3dUnavailable = true;
            container.dataset.renderKey = '';
            renderBoard(container, container._lastGame || game);
        });
        return;
    }
    const previousStage = container.querySelector('.three-board-stage');
    if (previousStage) disposeThreeRenderer(previousStage);

    const renderSvg = () => {
        if (document.documentElement.dataset.boardView !== '2d' || container.dataset.renderKey !== renderKey) return;
        render2DBoard(container, game, boardStyle, {
            switchCss: SWITCH_CSS,
            switchMarkup: styleSwitchMarkup()
        });
    };
    // SVG vykreslíme až po načtení jeho CSS, aby se na okamžik neukázala neostylovaná deska.
    ensureModeStyles('2d').then(renderSvg).catch(error => {
        console.error('Styly 2D režimu se nepodařilo načíst:', error);
        renderSvg();
    });

}
