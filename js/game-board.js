/**
 * SVG vykreslení herní desky pro 2–8 hráčů ve dvou vzhledech:
 *  - klasik: hvězdice s rameny (4 / 6 / 8 ramen = 40 / 48 / 80 polí),
 *  - mnohoúhelník: pole po obvodu čtyř-, šesti- a osmiúhelníku.
 * Základny leží uvnitř desky ve volném místě, takže dráha může zabírat
 * téměř celou plochu. Vzhled lze přepínat tlačítky v horní liště desky.
 */
import { getPiecePosition, getHomeLaneIndex, getValidMoves } from './game-engine.js';
import { render3DPawns } from './game-board-3d.js';

const SIZE = 720;
const CENTER = SIZE / 2;
const BOARD_BY_TRACK = { 40: 4, 48: 6, 80: 8 };
const STYLE_KEY = 'clovece_board_style';
const STYLES = ['classic', 'polygon'];

// Klasik: arm = délka ramene, w = poloviční šířka ramene,
// r0 = vzdálenost sdíleného vnitřního rohu od středu.
const CLASSIC = {
    4: { arm: 325, w: 51, r0: 51, field: 14.5, piece: 16, base: 54, baseDist: 205 },
    6: { arm: 325, w: 42, r0: 42 / Math.tan(Math.PI / 6), field: 12.5, piece: 14.5, base: 46, baseDist: 218, laneStep: 64 },
    8: { arm: 325, w: 33, r0: 33 / Math.tan(Math.PI / 8), field: 11.5, piece: 13, base: 36, baseDist: 236 }
};

// Mnohoúhelník: rp = poloměr opsané kružnice, ls = rozestup polí domečku.
const POLYGON = {
    4: { rp: 328 / Math.cos(Math.PI / 4), field: 17, piece: 18, base: 80, baseDist: 250, ls: 65 },
    6: { rp: 330, field: 14, piece: 15, base: 70, baseDist: 188, ls: 48 },
    8: { rp: 328 / Math.cos(Math.PI / 8), field: 11, piece: 13, base: 56, baseDist: 208, ls: 60 }
};

let boardStyle = loadStyle();

// 3D pohled: náklon (rotateX) a otočení desky (rotateZ) tahem prstu / myši.
const VIEW_KEY = 'clovece_board_view';
const DEFAULT_TILT = 52;
let view3d = loadView();
let tilt = DEFAULT_TILT;
let rotation = 0;

function loadView() {
    try {
        return window.localStorage.getItem(VIEW_KEY) === '3d';
    } catch {
        return false;
    }
}

function saveView() {
    try {
        window.localStorage.setItem(VIEW_KEY, view3d ? '3d' : '2d');
    } catch {
        // Bez úložiště zůstane pohled platný do obnovení stránky.
    }
}

function viewTransform() {
    const radians = rotation * Math.PI / 180;
    // Zmenšení podle natočení, aby se rozlehlá deska nikdy neořízla o okraj.
    const fit = 0.92 / (Math.abs(Math.cos(radians)) + Math.abs(Math.sin(radians)));
    return 'perspective(1100px) rotateX(' + tilt.toFixed(1) + 'deg) rotateZ(' + rotation.toFixed(1) + 'deg) scale(' + fit.toFixed(3) + ')';
}

function applyView(container) {
    const svg = container.querySelector?.('.premium-board');
    if (!svg) return;
    svg.style.transform = view3d ? viewTransform() : '';
    svg.style.touchAction = view3d ? 'none' : '';
    svg.style.cursor = view3d ? 'grab' : '';
    container.style.overflow = view3d ? 'hidden' : '';
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

function boardSize(game) {
    return game.slotCount || BOARD_BY_TRACK[game.trackLength] || 4;
}

function geometry(game) {
    const n = boardSize(game);
    return { n, style: boardStyle, ...(boardStyle === 'polygon' ? POLYGON[n] : CLASSIC[n]) };
}

function slotOf(player, game) {
    if (Number.isInteger(player.slot)) return player.slot;
    const n = boardSize(game);
    return Math.floor(player.start / (game.trackLength / n));
}

function slotAngle(slot, n) {
    return (-90 + slot * 360 / n) * Math.PI / 180;
}

function polar(angle, radius) {
    return { x: CENTER + Math.cos(angle) * radius, y: CENTER + Math.sin(angle) * radius };
}

// along = vzdálenost od středu po ose ramene, side = posun do strany (+ po směru hodin).
function armPoint(slot, n, along, side) {
    const angle = slotAngle(slot, n);
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    return {
        x: CENTER + ux * along - uy * side,
        y: CENTER + uy * along + ux * side
    };
}

function laneRadius(g, laneIndex) {
    if (g.style === 'polygon') {
        return g.rp * Math.cos(Math.PI / g.n) - (laneIndex + 1) * g.ls;
    }
    if (g.laneStep) return g.arm - g.laneStep * (laneIndex + 1);
    return g.arm - (laneIndex + 1) * (g.arm - g.r0) / 4;
}

/**
 * Pole dráhy po směru hodin. Každé rameno má m = trackLength / n polí;
 * start hráče je vždy pole s indexem m / 2 uvnitř ramene.
 */
export function trackPosition(index, game) {
    const g = geometry(game);
    const length = game.trackLength;
    const i = ((index % length) + length) % length;
    const m = length / g.n;
    const arm = Math.floor(i / m);
    const t = i % m;

    if (g.style === 'polygon') {
        // Strana mnohoúhelníku: pole j = 1..m, pole j = m je sdílený roh.
        const mid = slotAngle(arm, g.n);
        const half = Math.PI / g.n;
        const a = polar(mid - half, g.rp);
        const b = polar(mid + half, g.rp);
        const ratio = (t + 1) / m;
        return { x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio };
    }

    // Klasik: k polí vlevo, špička, k+1 polí vpravo (poslední je sdílený roh).
    const k = m / 2 - 1;
    const step = (g.arm - g.r0) / k;
    if (t < k) return armPoint(arm, g.n, g.r0 + (t + 1) * step, -g.w);
    if (t === k) return armPoint(arm, g.n, g.arm, 0);
    return armPoint(arm, g.n, g.r0 + (2 * k + 1 - t) * step, g.w);
}

function svgText(x, y, value, size, fill) {
    return '<text x="' + x + '" y="' + y + '" text-anchor="middle" dominant-baseline="central" font-size="' + size + '" fill="' + fill + '" font-weight="800">' + value + '</text>';
}

function pieceLabelColor(color) {
    return color === '#F9A825' ? '#17211f' : '#fff';
}


function pawnMarkup(x, y, pr, color, playerId, pieceId, selectable) {
    const bodyId = 'pawnBodyGradient' + playerId;
    const headId = 'pawnHeadGradient' + playerId;
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
        '" data-player="' + playerId + '" data-piece="' + pieceId + '" data-x="' + x.toFixed(2) + '" data-y="' + y.toFixed(2) + '">' +
        // Měkký stín pod figurkou.
        '<ellipse class="piece-shadow" cx="' + x.toFixed(2) + '" cy="' + (baseY + pr * .22).toFixed(2) +
        '" rx="' + (pr * .92).toFixed(2) + '" ry="' + (pr * .25).toFixed(2) +
        '" fill="#000" fill-opacity=".5" filter="url(#pieceGlow)"/>' +
        // Boční stěna podstavce – posun vytváří skutečně viditelnou hloubku.
        '<path d="M ' + (x - pr * .78).toFixed(2) + ' ' + baseY.toFixed(2) +
        ' A ' + (pr * .78).toFixed(2) + ' ' + (pr * .30).toFixed(2) + ' 0 0 0 ' +
        (x + pr * .78).toFixed(2) + ' ' + baseY.toFixed(2) +
        ' L ' + (x + pr * .78).toFixed(2) + ' ' + (baseY + pr * .20).toFixed(2) +
        ' A ' + (pr * .78).toFixed(2) + ' ' + (pr * .30).toFixed(2) + ' 0 0 1 ' +
        (x - pr * .78).toFixed(2) + ' ' + (baseY + pr * .20).toFixed(2) + ' Z' +
        '" fill="#07100e" stroke="#050a09" stroke-width=".8"/>' +
        '<ellipse cx="' + x.toFixed(2) + '" cy="' + baseY.toFixed(2) +
        '" rx="' + (pr * .78).toFixed(2) + '" ry="' + (pr * .30).toFixed(2) +
        '" fill="url(#' + bodyId + ')" stroke="#07100e" stroke-opacity=".75" stroke-width="1"/>' +
        // Tělo má tmavou boční hranu a světlejší čelní plochu.
        '<path d="' + bodyPath + '" transform="translate(' + (pr * .12).toFixed(2) + ' ' + (pr * .10).toFixed(2) +
        ')" fill="#07100e" fill-opacity=".82"/>' +
        '<path class="piece-core" d="' + bodyPath + '" fill="url(#' + bodyId +
        ')" stroke="#07100e" stroke-opacity=".72" stroke-width="1"/>' +
        '<path d="M ' + (x - pr * .42).toFixed(2) + ' ' + (y - pr * .27).toFixed(2) +
        ' C ' + (x - pr * .54).toFixed(2) + ' ' + (y - pr * .02).toFixed(2) + ', ' +
        (x - pr * .48).toFixed(2) + ' ' + (y + pr * .13).toFixed(2) + ', ' +
        (x - pr * .42).toFixed(2) + ' ' + (baseY - pr * .10).toFixed(2) +
        '" fill="none" stroke="#fff" stroke-opacity=".42" stroke-width="' + (pr * .10).toFixed(2) +
        '" stroke-linecap="round"/>' +
        // Samostatná kulová hlava s odleskem a tmavým okrajem.
        '<circle cx="' + x.toFixed(2) + '" cy="' + headY.toFixed(2) + '" r="' + headR.toFixed(2) +
        '" fill="#07100e" fill-opacity=".8" transform="translate(' + (pr * .07).toFixed(2) + ' ' + (pr * .08).toFixed(2) + ')"/>' +
        '<circle cx="' + x.toFixed(2) + '" cy="' + headY.toFixed(2) + '" r="' + headR.toFixed(2) +
        '" fill="url(#' + headId + ')" stroke="#07100e" stroke-opacity=".68" stroke-width=".9"/>' +
        '<ellipse cx="' + (x - pr * .13).toFixed(2) + '" cy="' + (headY - pr * .14).toFixed(2) +
        '" rx="' + (pr * .13).toFixed(2) + '" ry="' + (pr * .075).toFixed(2) +
        '" fill="#fff" fill-opacity=".72"/>' +
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
    return '<div class="board-style-switch" role="group" aria-label="Vzhled hrací desky">' +
        STYLES.map(style => '<button type="button" class="board-style-btn' + (style === boardStyle ? ' is-active' : '') +
            '" data-board-style="' + style + '" aria-pressed="' + (style === boardStyle) + '">' + label[style] + '</button>').join('') +
        '<button type="button" class="board-style-btn' + (view3d ? ' is-active' : '') + '" data-board-view="toggle" aria-pressed="' + view3d + '" title="3D pohled – otáčej deskou tahem prstu">3D</button>' +
        (view3d ? '<button type="button" class="board-style-btn" data-board-view="reset" title="Obnovit výchozí pohled" aria-label="Obnovit výchozí pohled">↺</button>' : '') +
        '</div>';
}

const SWITCH_CSS = '<style>' +
    '.board-style-switch{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:4px}' +
    '.three-pawns-layer{position:absolute;z-index:2;pointer-events:none;display:block;overflow:visible}' +
    '.three-pawns-layer canvas{display:block;width:100%;height:100%;pointer-events:none}' +
    '.premium-board.three-pawns-active .pawn-piece{opacity:0}' +
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

    // Po tahu prstem nesmí vzniknout klik na figurku pod prstem.
    container.addEventListener('click', event => {
        if (container._suppressClick) {
            event.stopPropagation();
            event.preventDefault();
        }
    }, true);

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
        if (viewButton.dataset.boardView === 'toggle') {
            view3d = !view3d;
            saveView();
        } else {
            tilt = DEFAULT_TILT;
            rotation = 0;
        }
        restyle(container);
    });

    container.addEventListener('pointerdown', event => {
        if (!view3d || !event.target.closest?.('.premium-board')) return;
        const start = { x: event.clientX, y: event.clientY, rotation, tilt, id: event.pointerId };
        let moved = false;

        const move = moveEvent => {
            if (moveEvent.pointerId !== start.id) return;
            const dx = moveEvent.clientX - start.x;
            const dy = moveEvent.clientY - start.y;
            if (!moved && Math.hypot(dx, dy) < 8) return;
            moved = true;
            rotation = start.rotation + dx * 0.5;
            tilt = Math.max(0, Math.min(75, start.tilt + dy * 0.3));
            applyView(container);
        };
        const end = endEvent => {
            if (endEvent.pointerId !== start.id) return;
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', end);
            window.removeEventListener('pointercancel', end);
            if (moved) {
                container._suppressClick = true;
                window.setTimeout(() => { container._suppressClick = false; }, 60);
            }
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', end);
        window.addEventListener('pointercancel', end);
    });
}

export function renderBoard(container, game) {
    if (!container || !game) return;
    bindStyleSwitch(container);
    container._lastGame = game;

    // Při online pollingu přichází stejný stav opakovaně. SVG překreslíme
    // pouze tehdy, když se skutečně změnil herní stav nebo vzhled desky.
    const renderKey = boardStyle + (view3d ? '3d' : '2d') + JSON.stringify(game);
    if (container.dataset.renderKey === renderKey) return;
    container.dataset.renderKey = renderKey;

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
        const emptyStart = !startPlayer && i % m === m / 2;
        const r = startPlayer ? g.field + 2 : g.field;
        track += '<g class="track-space ' + (startPlayer ? 'track-start' : '') + '">' +
            '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + r + '" fill="' +
            (startPlayer ? startPlayer.color : (emptyStart ? '#c6a96b' : '#d9d2c3')) + '" fill-opacity="' +
            (startPlayer ? '.95' : (emptyStart ? '.4' : '.12')) + '" stroke="' +
            (startPlayer ? startPlayer.color : (emptyStart ? '#c6a96b' : '#fff')) + '" stroke-opacity="' +
            (startPlayer ? '.9' : (emptyStart ? '.65' : '.22')) + '" stroke-width="1.4"/>' +
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
    applyView(container);
    render3DPawns(container, container.querySelector('.premium-board'), view3d);
}
