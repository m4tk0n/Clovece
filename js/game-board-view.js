/**
 * Řízení zobrazení herní desky: výběr stylu, 2D/3D a kompatibilní API.
 *  - klasik: hvězdice s rameny (4 / 6 / 8 ramen = 40 / 48 / 80 polí),
 *  - mnohoúhelník: pole po obvodu čtyř-, šesti- a osmiúhelníku.
 * Základny leží uvnitř desky ve volném místě, takže dráha může zabírat
 * téměř celou plochu. Vzhled lze přepínat tlačítky v horní liště desky.
 */
import { buildBoardSceneData as createBoardSceneData } from './game-board-scene.js?v=20261107-2';
import { render2DBoard } from './game-board-2d.js?v=20261108-4';
import { notifyGameExtensions } from './game-extensions.js';

const STYLE_KEY = 'clovece_board_style';
// Mnohoúhelníková varianta je dočasně skrytá; aktivní je pouze klasická deska.
const STYLES = ['classic'];

let boardStyle = loadStyle();

// SVG je vždy pevný pohled shora. 3D kamera patří výhradně Three.js rendereru.
const VIEW_KEY = 'clovece_board_view';
const debugParam = new URLSearchParams(window.location.search).get('debug');
const trainingMode = debugParam === 'trainer' || debugParam === 'training';
let view3d = trainingMode ? false : loadView();
let view3dUnavailable = false;
let threeRendererPromise = null;
const modeStylesPromises = new Map();

function loadThreeRenderer() {
    if (!threeRendererPromise) {
        const startedAt = performance.now();
        notifyGameExtensions('onResourceLoad', { name: 'game-board-3d.js – načítání', status: '…' });
        threeRendererPromise = import('./game-board-3d.js?v=20261107-2').then(module => {
            notifyGameExtensions('onResourceLoad', { name: 'game-board-3d.js – načteno', status: 'OK', duration: Math.round(performance.now() - startedAt) });
            return module;
        }).catch(error => {
            notifyGameExtensions('onResourceLoad', { name: 'game-board-3d.js – chyba načítání', status: 'CHYBA', duration: Math.round(performance.now() - startedAt) });
            threeRendererPromise = null;
            throw error;
        });
    }
    return threeRendererPromise;
}

function disposeThreeRenderer(stage) {
    if (!stage?._threeRendererModule) return;
    stage._threeRendererModule.dispose3DBoard(stage);
    stage._threeRendererModule.release3DResources?.();
    stage._threeRendererModule = null;
}

function ensureStylesheet(name, mode = 'game') {
    if (modeStylesPromises.has(name)) return modeStylesPromises.get(name);
    const startedAt = performance.now();
    const link = document.createElement('link');
    link.id = 'clovece-' + name + '-styles';
    link.dataset.modeStyle = mode;
    link.rel = 'stylesheet';
    link.href = new URL('../css/' + name + '.css?v=20261106-3', import.meta.url).href;
    const promise = new Promise((resolve, reject) => {
        notifyGameExtensions('onResourceLoad', { name: 'css/' + name + '.css – načítání', status: '…' });
        link.onload = () => {
            notifyGameExtensions('onResourceLoad', { name: 'css/' + name + '.css – načteno', status: 'OK', duration: Math.round(performance.now() - startedAt) });
            resolve();
        };
        link.onerror = () => {
            notifyGameExtensions('onResourceLoad', { name: 'css/' + name + '.css – chyba načítání', status: 'CHYBA', duration: Math.round(performance.now() - startedAt) });
            link.remove();
            modeStylesPromises.delete(name);
            reject(new Error('Nepodařilo se načíst css/' + name + '.css'));
        };
        document.head.appendChild(link);
    });
    modeStylesPromises.set(name, promise);
    return promise;
}

export function ensureGameStyles() {
    return Promise.all([
        ensureStylesheet('game-base'),
        ensureStylesheet('game-premium')
    ]);
}

export function ensureModeStyles(mode) {
    if (mode !== '2d' && mode !== '3d') throw new Error('Neznámý režim CSS: ' + mode);
    return Promise.all([
        ensureGameStyles(),
        ensureStylesheet('board-' + mode, mode),
        ensureStylesheet('dice-' + mode, mode)
    ]);
}

/** Ověří reálnou možnost vytvořit Three.js renderer a přednačte styly režimů. */
export async function prepareBoardRendering() {
    view3d = false;
    if (trainingMode) {
        view3dUnavailable = false;
        await ensureModeStyles('2d');
        return '2d';
    }
    view3dUnavailable = false;
    let canUse3D = false;
    const probeCanvas = document.createElement('canvas');
    let probeContext = null;
    try {
        // Three.js r180 vyžaduje WebGL 2. Bez něj vůbec nenačítáme 3D moduly.
        probeContext = probeCanvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false });
        canUse3D = Boolean(probeContext && !probeContext.isContextLost());
    } catch (error) {
        canUse3D = false;
    } finally {
        probeContext?.getExtension('WEBGL_lose_context')?.loseContext();
    }
    if (canUse3D) {
        try {
            const module = await loadThreeRenderer();
            canUse3D = await module.probe3D();
        } catch (error) {
            console.info('3D renderer není dostupný; používá se 2D.', error);
            canUse3D = false;
        }
    }
    view3d = canUse3D;
    view3dUnavailable = !canUse3D;
    saveView();
    if (canUse3D) {
        try {
            // Oba režimy jsou připravené před zobrazením desky, takže přepnutí
            // nečeká na síť ani na načítání CSS.
            await Promise.all([ensureModeStyles('2d'), ensureModeStyles('3d')]);
        } catch (error) {
            console.info('Styly 3D nejsou dostupné; používá se 2D.', error);
            canUse3D = false;
            view3d = false;
            view3dUnavailable = true;
            // Odstraníme jen neúspěšné 3D styly; 2D zůstane připravené.
            for (const name of ['board-3d', 'dice-3d']) {
                document.getElementById('clovece-' + name + '-styles')?.remove();
                modeStylesPromises.delete(name);
            }
            await ensureModeStyles('2d');
        }
    } else {
        await ensureModeStyles('2d');
    }
    saveView();
    return canUse3D ? '3d' : '2d';
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

    document.getElementById('clovece-game-base-styles')?.remove();
    document.getElementById('clovece-game-premium-styles')?.remove();
    for (const mode of ['2d', '3d']) {
        for (const name of ['board-' + mode, 'dice-' + mode]) {
            document.getElementById('clovece-' + name + '-styles')?.remove();
        }
    }
    modeStylesPromises.clear();
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

export async function animateThreeDice(value, fast = false, rotationPlan = null) {
    const module = await loadThreeRenderer();
    return module.animateThreeDice(value, fast, rotationPlan);
}

export function getBoardView() {
    return view3d ? '3d' : '2d';
}

export function getBoardStyle() {
    return boardStyle;
}

function styleSwitchMarkup() {
    const label = { classic: 'KLASIK', polygon: 'MNOHOÚHELNÍK' };
    return '<div class="board-style-switch" role="group" aria-label="Vzhled a vykreslení hrací desky">' +
        (trainingMode ? '<button type="button" class="board-style-btn board-dice-display-btn" data-dice-display="toggle" aria-pressed="true" title="Skrýt výběr kostek">KOSTKY</button>' : '') +
        (trainingMode ? '<button type="button" class="board-style-btn board-game-info-btn" data-game-info="toggle" aria-label="Zobrazit nastavení vytvořené hry" aria-expanded="false" title="Nastavení vytvořené hry">i</button>' : '') +
        STYLES.map(style => '<button type="button" class="board-style-btn' + (style === boardStyle ? ' is-active' : '') +
            '" data-board-style="' + style + '" aria-pressed="' + (style === boardStyle) + '">' + label[style] + '</button>').join('') +
        (trainingMode ? '' : '<button type="button" class="board-style-btn' + (view3d ? ' is-active' : '') +
            '" data-board-view="toggle" aria-pressed="' + view3d + '"' + (view3dUnavailable ? ' disabled title="3D není na tomto zařízení dostupné"' : '') + '>' + (view3dUnavailable ? 'BEZ 3D' : (view3d ? '3D' : '2D')) + '</button>') +
        '</div>';
}

const SWITCH_CSS = '<style>' +
    '.board-style-switch{display:flex;flex-wrap:nowrap;justify-content:flex-end;align-items:center;gap:4px}' +
    '.premium-board-shell{position:relative}' +
    '.board-style-btn{padding:4px 7px;border:1px solid rgba(198,169,107,.35);border-radius:6px;background:rgba(255,255,255,.04);' +
    'color:#aeb9ac;font:700 7px/1.2 "Press Start 2P",monospace;letter-spacing:.06em;cursor:pointer;pointer-events:auto}' +
    '.board-style-btn.is-active{background:rgba(198,169,107,.22);border-color:#c6a96b;color:#f3eddf}' +
    '.board-game-info-btn{min-width:20px;padding:3px 5px;border-radius:50%;font:800 10px/1 system-ui,sans-serif;text-transform:none}' +
    '.board-game-info-panel{position:absolute;top:34px;right:6px;z-index:30;box-sizing:border-box;width:min(290px,calc(100% - 12px));max-height:min(65dvh,420px);overflow:auto;padding:10px;border:1px solid rgba(198,169,107,.75);border-radius:9px;background:rgba(9,17,15,.98);color:#f3eddf;box-shadow:0 8px 26px rgba(0,0,0,.5);font:11px/1.4 system-ui,sans-serif;letter-spacing:normal}' +
    '.board-game-info-panel h3{margin:0 0 7px;color:#e6c98a;font-size:12px}' +
    '.board-game-info-panel h4{margin:8px 0 3px;color:#c6a96b;font-size:10px}' +
    '.board-game-info-panel ul{margin:0;padding-left:16px}' +
    '.board-game-info-panel li{margin:2px 0}' +
    '.board-game-info-player{display:flex;align-items:center;gap:6px}' +
    '.board-game-info-dot{display:inline-block;width:9px;height:9px;flex:0 0 9px;border-radius:50%}' +
    '.board-game-info-close{float:right;margin:-2px -2px 4px 8px;padding:2px 7px;border:1px solid #718075;border-radius:4px;background:#23352b;color:#fff;font-size:12px}' +
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
        const path = typeof event.composedPath === 'function' ? event.composedPath() : [];
        const infoButton = path.find(node => node instanceof Element && node.matches('[data-game-info]')) ||
            event.target.closest?.('[data-game-info]');
        if (infoButton && container.contains(infoButton)) {
            event.preventDefault();
            const shell = container.querySelector('.premium-board-shell');
            const existing = shell?.querySelector('.board-game-info-panel');
            if (existing) {
                existing.remove();
                infoButton.setAttribute('aria-expanded', 'false');
                return;
            }
            if (!shell || !container._lastGame) return;
            const game = container._lastGame;
            const info = document.createElement('section');
            info.className = 'board-game-info-panel';
            info.setAttribute('role', 'dialog');
            info.setAttribute('aria-label', 'Nastavení vytvořené hry');
            const close = document.createElement('button');
            close.type = 'button';
            close.className = 'board-game-info-close';
            close.textContent = '×';
            close.setAttribute('aria-label', 'Zavřít nastavení hry');
            close.addEventListener('click', () => {
                info.remove();
                infoButton.setAttribute('aria-expanded', 'false');
            });
            info.appendChild(close);
            const heading = document.createElement('h3');
            heading.textContent = 'NASTAVENÍ VYTVOŘENÉ HRY';
            info.appendChild(heading);
            const summary = document.createElement('ul');
            const addSetting = (label, value) => {
                const item = document.createElement('li');
                item.textContent = label + ': ' + value;
                summary.appendChild(item);
            };
            addSetting('Deska', game.trackLength + ' polí');
            addSetting('Počet hráčů', game.players.length + ' (' +
                game.players.filter(player => !player.isAI).length + ' lidští, ' +
                game.players.filter(player => player.isAI).length + ' AI)');
            addSetting('Obtížnost AI', ({ easy: 'Lehká', medium: 'Střední', hard: 'Těžká' })[game.aiDifficulty] || 'Střední');
            info.appendChild(summary);
            const playersTitle = document.createElement('h4');
            playersTitle.textContent = 'HRÁČI';
            info.appendChild(playersTitle);
            const players = document.createElement('ul');
            game.players.forEach(player => {
                const item = document.createElement('li');
                item.className = 'board-game-info-player';
                const dot = document.createElement('span');
                dot.className = 'board-game-info-dot';
                dot.style.backgroundColor = player.color;
                dot.setAttribute('aria-hidden', 'true');
                const name = document.createElement('span');
                name.textContent = player.name + (player.isAI ? ' · AI' : ' · člověk');
                item.append(dot, name);
                players.appendChild(item);
            });
            info.appendChild(players);
            const rulesTitle = document.createElement('h4');
            rulesTitle.textContent = 'VOLBY PRAVIDEL';
            info.appendChild(rulesTitle);
            const rules = document.createElement('ul');
            const ruleLabels = [
                ['threeRolls', 'Až tři pokusy o šestku'],
                ['mustDeploy', 'Povinné nasazení'],
                ['skipHomePieces', 'Přeskakování figurek v domečku'],
                ['mustEnterHome', 'Povinný vstup do domečku'],
                ['threeSixesPenalty', 'Trest za třetí šestku']
            ];
            ruleLabels.forEach(([key, label]) => {
                const item = document.createElement('li');
                item.textContent = label + ': ' + (game.rules?.[key] ? 'ANO' : 'NE');
                rules.appendChild(item);
            });
            info.appendChild(rules);
            shell.appendChild(info);
            infoButton.setAttribute('aria-expanded', 'true');
            return;
        }
        // Přepínač režimu vykreslení (v traineru je skrytý).
        const viewButton = path.find(node => node instanceof Element && node.matches('[data-board-view]')) ||
            event.target.closest?.('[data-board-view]');
        if (viewButton && container.contains(viewButton)) {
            if (trainingMode) return;
            event.preventDefault();
            if (view3dUnavailable) return;
            view3d = !view3d;
            view3dUnavailable = false;
            saveView();
            restyle(container);
            return;
        }

        const styleButton = path.find(node => node instanceof Element && node.matches('[data-board-style]')) ||
            event.target.closest?.('[data-board-style]');
        if (!styleButton || !container.contains(styleButton)) return;
        const style = styleButton.dataset.boardStyle;
        if (!STYLES.includes(style) || style === boardStyle) return;
        event.preventDefault();
        boardStyle = style;
        saveStyle(style);
        restyle(container);
    });
}

// Sdílený čistý model. 3D renderer dostává pouze herní data a souřadnice,
// nikdy SVG element, jeho atributy ani DOM uzly.
export function buildBoardSceneData(game) {
    return createBoardSceneData(game, boardStyle);
}

function capturePlayerPanel(container) {
    const panel = container.querySelector('#players-panel');
    if (panel && panel.innerHTML.trim()) {
        container._playersPanelMarkup = panel.innerHTML;
    }
}

function restorePlayerPanel(container) {
    const panel = container.querySelector('#players-panel');
    if (panel && container._playersPanelMarkup !== undefined) {
        panel.innerHTML = container._playersPanelMarkup;
    }
}

export function renderBoard(container, game) {
    if (!container || !game) return;
    capturePlayerPanel(container);
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
                    (trainingMode ? '<div class="board-dice-trainer-slot"></div>' : '') +
                    '<div class="three-board-stage" aria-label="Plně prostorová hrací deska"></div>' +
                    '<div class="board-player-stats"><div class="players-panel" id="players-panel" aria-label="Stav figurek hráčů"></div></div>' +
                    '<div class="board-corner-info"><div class="board-turn-count"><span>POČET TAHŮ</span><strong>' + game.turnNumber + '</strong></div>' +
                    '<div class="board-current-player" style="--player-color:' + activePlayer.color + '"><span>NA ŘADĚ</span><strong>' + activePlayer.name + '</strong></div></div>' +
                '</div>';
            stage = container.querySelector('.three-board-stage');
            restorePlayerPanel(container);
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
            const viewButton = container.querySelector('[data-board-view]');
            if (viewButton) {
                viewButton.classList.toggle('is-active', view3d);
                viewButton.setAttribute('aria-pressed', String(view3d));
                viewButton.textContent = view3d ? '3D' : '2D';
                viewButton.disabled = view3dUnavailable;
            }
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
                saveView();
                container.dataset.renderKey = '';
                renderBoard(container, container._lastGame || game);
            });
        }).catch(error => {
            if (!stage.isConnected || container.querySelector('.three-board-stage') !== stage || !view3d || container.dataset.renderKey !== renderKey) return;
            console.error('3D renderer se nepodařilo načíst:', error);
            view3d = false;
            view3dUnavailable = true;
            saveView();
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
        restorePlayerPanel(container);
        // game-view mohl aktualizovat počty ještě před dokončením asynchronního SVG renderu.
        container.dispatchEvent(new CustomEvent('clovece:board-rendered'));
    };
    // SVG vykreslíme až po načtení jeho CSS, aby se na okamžik neukázala neostylovaná deska.
    ensureModeStyles('2d').then(renderSvg).catch(error => {
        console.error('Styly 2D režimu se nepodařilo načíst:', error);
        renderSvg();
    });

}
