/**
 * Řízení zobrazení herní desky: výběr stylu, 2D/3D a kompatibilní API.
 *  - klasik: hvězdice s rameny (4 / 6 / 8 ramen = 40 / 48 / 80 polí),
 *  - mnohoúhelník: pole po obvodu čtyř-, šesti- a osmiúhelníku.
 * Základny leží uvnitř desky ve volném místě, takže dráha může zabírat
 * téměř celou plochu. Vzhled lze přepínat tlačítky v horní liště desky.
 */
import { render3DBoard, dispose3DBoard } from './game-board-3d.js';
import { buildBoardSceneData as createBoardSceneData } from './game-board-scene.js';
import { render2DBoard } from './game-board-2d.js';

const STYLE_KEY = 'clovece_board_style';
const STYLES = ['classic', 'polygon'];

let boardStyle = loadStyle();

// SVG je vždy pevný pohled shora. 3D kamera patří výhradně Three.js rendereru.
const VIEW_KEY = 'clovece_board_view';
let view3d = loadView();

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
            '" data-board-view="toggle" aria-pressed="' + view3d + '">' + (view3d ? '3D' : '2D SVG') + '</button>' +
        '</div>';
}

const SWITCH_CSS = '<style>' +
    '.board-style-switch{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:4px}' +
    '.premium-board-shell{position:relative}' +
    '.three-board-stage{display:block;flex:none;width:100%;height:min(72vh,760px);min-height:340px;position:relative;overflow:hidden;touch-action:none;border-radius:10px;background:radial-gradient(ellipse at 50% 42%,#34483d,#111a15 78%)}@media(max-width:600px){.three-board-stage{height:68vh;min-height:320px;border-radius:10px}}' +
    '.three-board-stage canvas{display:block;width:100%;height:100%;touch-action:none}' +
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
    const renderKey = boardStyle + (view3d ? '3d' : '2d') + JSON.stringify(game);
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
        render3DBoard(stage, buildBoardSceneData(game), error => {
            // Selhání WebGL/Three.js nesmí zablokovat samotnou hru.
            // Přepnutí platí pro aktuální zobrazení; při dalším načtení se 3D zkusí znovu.
            if (!stage.isConnected || container.querySelector('.three-board-stage') !== stage || !view3d) return;
            console.error('Přepínám herní desku z 3D na 2D SVG:', error);
            view3d = false;
            container.dataset.renderKey = '';
            renderBoard(container, container._lastGame || game);
        });
        return;
    }
    const previousStage = container.querySelector('.three-board-stage');
    if (previousStage) dispose3DBoard(previousStage);

    render2DBoard(container, game, boardStyle, {
        switchCss: SWITCH_CSS,
        switchMarkup: styleSwitchMarkup()
    });

}
