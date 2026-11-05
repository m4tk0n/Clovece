/**
 * SVG vykreslení herní desky pro 2–8 hráčů ve dvou vzhledech:
 *  - klasik: hvězdice s rameny (4 / 6 / 8 ramen = 40 / 48 / 80 polí),
 *  - mnohoúhelník: pole po obvodu čtyř-, šesti- a osmiúhelníku.
 * Základny leží uvnitř desky ve volném místě, takže dráha může zabírat
 * téměř celou plochu. Vzhled lze přepínat tlačítky v horní liště desky.
 */
import { getPiecePosition, getHomeLaneIndex, getValidMoves } from './game-engine.js';
import { render3DBoard, dispose3DBoard } from './game-board-3d.js';
import { CENTER, geometry as getGeometry, slotOf, slotAngle, polar, armPoint, laneRadius, trackPosition as getTrackPosition } from './game-board-geometry.js';
import { buildBoardSceneData as createBoardSceneData } from './game-board-scene.js';

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

function geometry(game) {
    return getGeometry(game, boardStyle);
}

function trackPosition(index, game) {
    return getTrackPosition(index, game, boardStyle);
}

function svgText(x, y, value, size, fill) {
    return '<text x="' + x + '" y="' + y + '" text-anchor="middle" dominant-baseline="central" font-size="' + size + '" fill="' + fill + '" font-weight="800">' + value + '</text>';
}

function pieceLabelColor(color) {
    return color === '#F9A825' ? '#17211f' : '#fff';
}


function pawnMarkup(x, y, pr, color, playerId, pieceId, selectable) {
    const baseY = y + pr * 0.43;
    const headY = y - pr * 0.78;
    const headR = pr * 0.39;

    // Tělo klasické figurky – samostatná silueta, aby hlava působila jako koule.
    const bodyPath =
        'M ' + (x - pr * .68).toFixed(2) + ' ' + (baseY - pr * .02).toFixed(2) +
        ' C ' + (x - pr * .72).toFixed(2) + ' ' + (y + pr * .16).toFixed(2) + ', ' +
        (x - pr * .34).toFixed(2) + ' ' + (y + pr * .10).toFixed(2) + ', ' +
        (x - pr * .27).toFixed(2) + ' ' + (y - pr * .12).toFixed(2) +
        ' C ' + (x - pr * .20).toFixed(2) + ' ' + (y - pr * .35).toFixed(2) + ', ' +
        (x - pr * .27).toFixed(2) + ' ' + (y - pr * .43).toFixed(2) + ', ' +
        (x - pr * .36).toFixed(2) + ' ' + (y - pr * .48).toFixed(2) +
        ' L ' + (x + pr * .36).toFixed(2) + ' ' + (y - pr * .48).toFixed(2) +
        ' C ' + (x + pr * .27).toFixed(2) + ' ' + (y - pr * .43).toFixed(2) + ', ' +
        (x + pr * .20).toFixed(2) + ' ' + (y - pr * .35).toFixed(2) + ', ' +
        (x + pr * .27).toFixed(2) + ' ' + (y - pr * .12).toFixed(2) +
        ' C ' + (x + pr * .34).toFixed(2) + ' ' + (y + pr * .10).toFixed(2) + ', ' +
        (x + pr * .72).toFixed(2) + ' ' + (y + pr * .16).toFixed(2) + ', ' +
        (x + pr * .68).toFixed(2) + ' ' + (baseY - pr * .02).toFixed(2) + ' Z';

    return '<g class="board-piece pawn-piece ' + (selectable ? 'piece-selectable' : '') +
        '" data-player="' + playerId + '" data-piece="' + pieceId + '" data-x="' + x.toFixed(2) + '" data-y="' + y.toFixed(2) + '" data-radius="' + pr.toFixed(2) + '" data-color="' + color + '">' +
        '<ellipse cx="' + x.toFixed(2) + '" cy="' + baseY.toFixed(2) +
        '" rx="' + (pr * .78).toFixed(2) + '" ry="' + (pr * .30).toFixed(2) +
        '" fill="' + color + '"/>' +
        // Ploché tělo v jednotné barvě hráče.
        '<path class="piece-core" d="' + bodyPath + '" fill="' + color + '"/>' +
        // Hlava a tělo používají výhradně základní barvu hráče.
        '<circle cx="' + x.toFixed(2) + '" cy="' + headY.toFixed(2) + '" r="' + headR.toFixed(2) +
        '" fill="' + color + '"/>' +

        '</g>';
}

function pawnGradientMarkup(players) {
    return players.map(player =>
        '<linearGradient id="pawnBodyGradient' + player.id + '" x1="0" y1="0" x2="1" y2="0">' +
        '<stop offset="0" stop-color="#07100e" stop-opacity=".72"/>' +
        '<stop offset=".24" stop-color="' + player.color + '"/>' +
        '<stop offset=".58" stop-color="' + player.color + '"/>' +
        '<stop offset="1" stop-color="#07100e" stop-opacity=".62"/>' +
        '</linearGradient>' +
        '<radialGradient id="pawnHeadGradient' + player.id + '" cx="30%" cy="24%" r="78%">' +
        '<stop offset="0" stop-color="#fff" stop-opacity=".95"/>' +
        '<stop offset=".24" stop-color="' + player.color + '"/>' +
        '<stop offset=".72" stop-color="' + player.color + '"/>' +
        '<stop offset="1" stop-color="#07100e" stop-opacity=".78"/>' +
        '</radialGradient>'
    ).join('');
}

function baseMarkup(game, player, validMoves, g) {
    const slot = slotOf(player, game);
    // Základna leží ve volném místě mezi domečky, po směru hodin od ramene hráče.
    const angle = slotAngle(slot, g.n) + Math.PI / g.n;
    const c = polar(angle, g.baseDist);
    const color = player.color;
    const offset = g.base * 0.4;
    const offsets = [[-offset, -offset], [offset, -offset], [-offset, offset], [offset, offset]];
    const pr = g.piece;

    let markup = '<g class="base-zone" style="--player-color:' + color + '">';
    markup += '<circle cx="' + c.x.toFixed(1) + '" cy="' + c.y.toFixed(1) + '" r="' + g.base + '" fill="' + color + '" fill-opacity=".14" stroke="' + color + '" stroke-opacity=".8" stroke-width="2"/>';

    game.pieces[player.id].pieces.forEach(piece => {
        if (piece.steps !== -1) return;
        const x = c.x + offsets[piece.id][0];
        const y = c.y + offsets[piece.id][1];
        const selectable = game.currentPlayer === player.id && validMoves.has(piece.id);
        markup += pawnMarkup(x, y, pr, color, player.id, piece.id, selectable);
    });
    markup += '</g>';
    return markup;
}

function pieceMarkup(game, player, piece, stackIndex, stackCount, validMoves, g) {
    const color = player.color;
    const maxSteps = game.trackLength + 4;
    if (piece.steps < 0) return '';

    const slot = slotOf(player, game);
    let pos;
    if (piece.steps <= game.trackLength) {
        pos = trackPosition(getPiecePosition(game, player.id, piece), game);
    } else {
        const laneIndex = Math.min(3, getHomeLaneIndex(game, piece));
        pos = armPoint(slot, g.n, laneRadius(g, laneIndex), 0);
    }

    const spread = piece.steps === maxSteps ? 0 : (stackIndex - (stackCount - 1) / 2) * 9;
    const angle = slotAngle(slot, g.n) + Math.PI / 2;
    const x = pos.x + Math.cos(angle) * spread;
    const y = pos.y + Math.sin(angle) * spread;
    const selectable = player.id === game.currentPlayer && validMoves.has(piece.id);
    const pr = g.piece;

    return pawnMarkup(x, y, pr, color, player.id, piece.id, selectable);
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
        render3DBoard(stage, buildBoardSceneData(game));
        return;
    }
    const previousStage = container.querySelector('.three-board-stage');
    if (previousStage) dispose3DBoard(previousStage);

    const g = geometry(game);
    const total = game.players.length;
    const m = game.trackLength / g.n;
    const validMoves = new Set(getValidMoves(game));
    const playersBySlot = new Map(game.players.map(player => [slotOf(player, game), player]));

    // Tenké spojnice: vždy od okraje jednoho pole k okraji následujícího.
    let links = '';
    for (let i = 0; i < game.trackLength; i++) {
        const from = trackPosition(i, game);
        const to = trackPosition(i + 1, game);
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const distance = Math.hypot(dx, dy);
        if (distance <= g.field * 2) continue;
        const ux = dx / distance;
        const uy = dy / distance;
        links += '<line x1="' + (from.x + ux * g.field).toFixed(1) + '" y1="' + (from.y + uy * g.field).toFixed(1) +
            '" x2="' + (to.x - ux * g.field).toFixed(1) + '" y2="' + (to.y - uy * g.field).toFixed(1) +
            '" stroke="#d9d2c3" stroke-opacity=".35" stroke-width="1.5" stroke-linecap="round"/>';
    }

    // Pole dráhy.
    let track = '';
    for (let i = 0; i < game.trackLength; i++) {
        const p = trackPosition(i, game);
        const startPlayer = game.players.find(player => player.start === i);
        const r = startPlayer ? g.field + 2 : g.field;
        track += '<g class="track-space ' + (startPlayer ? 'track-start' : '') + '">' +
            '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + r + '" fill="' +
            (startPlayer ? startPlayer.color : '#d9d2c3') + '" fill-opacity="' +
            (startPlayer ? '.95' : '.12') + '" stroke="' +
            (startPlayer ? startPlayer.color : '#fff') + '" stroke-opacity="' +
            (startPlayer ? '.9' : '.22') + '" stroke-width="1.4"/>' +
            (startPlayer ? '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="4" fill="#fff" fill-opacity=".9"/>' : '') +
            '</g>';
    }

    // Domečky: každé rameno má vlastní, i když na něm nikdo nehraje.
    let homeLanes = '';
    for (let slot = 0; slot < g.n; slot++) {
        const player = playersBySlot.get(slot);
        const color = player ? player.color : '#c6a96b';
        let cells = '';
        for (let lane = 0; lane < 4; lane++) {
            const p = armPoint(slot, g.n, laneRadius(g, lane), 0);
            cells += '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (g.field + 1) + '" fill="' + color + '" fill-opacity="' + (player ? '.28' : '.08') + '" stroke="' + color + '" stroke-opacity="' + (player ? '.85' : '.42') + '" stroke-width="1.5"/>';
        }
        homeLanes += '<g class="home-lane ' + (player ? '' : 'home-lane-empty') + '">' + cells + '</g>';
    }

    const bases = game.players.map(player => baseMarkup(game, player, validMoves, g)).join('');

    const boardPieces = game.players.map(player => {
        const active = game.pieces[player.id].pieces.filter(piece => piece.steps >= 0 && piece.steps <= game.trackLength + 4);
        return active.map(piece => {
            let stackIndex = 0;
            let stackCount = 1;
            if (piece.steps <= game.trackLength) {
                const position = getPiecePosition(game, player.id, piece);
                const all = game.pieces.flatMap((group, groupId) => group.pieces.map(item => ({
                    playerId: groupId,
                    piece: item
                }))).filter(item => item.piece.steps >= 0 && item.piece.steps <= game.trackLength &&
                    getPiecePosition(game, item.playerId, item.piece) === position);
                stackIndex = all.findIndex(item => item.playerId === player.id && item.piece.id === piece.id);
                stackCount = all.length;
            }
            return pieceMarkup(game, player, piece, stackIndex, stackCount, validMoves, g);
        }).join('');
    }).join('');

    const active = game.players[game.currentPlayer];
    container.innerHTML =
        '<div class="premium-board-shell">' + SWITCH_CSS +
            '<div class="board-topline"><span class="board-kicker">THE GRAND TABLE</span>' + styleSwitchMarkup() + '</div>' +
            '<svg class="premium-board" viewBox="0 0 720 720" role="img" aria-label="Hrací plán pro ' + total + ' hráčů">' +
                '<defs>' +
                    '<radialGradient id="boardBg"><stop offset="0" stop-color="#34423f"/><stop offset=".68" stop-color="#182522"/><stop offset="1" stop-color="#0c1413"/></radialGradient>' +
                    '<filter id="pieceGlow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
                    pawnGradientMarkup(game.players) +
                '</defs>' +
                '<rect x="13" y="13" width="694" height="694" rx="40" fill="url(#boardBg)" stroke="#c6a96b" stroke-opacity=".55" stroke-width="3"/>' +
                homeLanes + links + track + bases +
                '<circle cx="360" cy="360" r="22" fill="#0b1714" stroke="#c6a96b" stroke-width="2"/>' +
                boardPieces +
            '</svg>' +
            '<div class="board-player-stats">' +
                '<div class="players-panel" id="players-panel" aria-label="Stav figurek hráčů"></div>' +
            '</div>' +
            '<div class="board-corner-info">' +
                '<div class="board-turn-count"><span>POČET TAHŮ</span><strong>' + game.turnNumber + '</strong></div>' +
                '<div class="board-current-player" style="--player-color:' + active.color + '"><span>NA ŘADĚ</span><strong>' + active.name + '</strong></div>' +
            '</div>' +
        '</div>';
    // SVG renderer: pevný pohled shora, bez transformace, náklonu či perspektivy.
}
