/**
 * Samostatný SVG renderer herní desky.
 * Přijímá herní stav pouze ke čtení a nevykonává herní pravidla.
 */
import { getPiecePosition, getHomeLaneIndex, getValidMoves } from './game-engine.js';
import { buildDebugMovePaths } from './game-board-debug.js';
import { CENTER, geometry, slotOf, slotAngle, polar, armPoint, laneRadius, trackPosition } from './game-board-geometry.js';

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

function pieceMarkup(game, player, piece, stackIndex, stackCount, validMoves, g, style) {
    const color = player.color;
    const maxSteps = game.trackLength + 3;
    if (piece.steps < 0) return '';

    const slot = slotOf(player, game);
    let pos;
    if (piece.steps < game.trackLength) {
        pos = trackPosition(getPiecePosition(game, player.id, piece), game, style);
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


export function render2DBoard(container, game, style, ui) {
    const g = geometry(game, style);
    const total = game.players.length;
    const m = game.trackLength / g.n;
    const validMoves = new Set(getValidMoves(game));
    const playersBySlot = new Map(game.players.map(player => [slotOf(player, game), player]));

    // Tenké spojnice: vždy od okraje jednoho pole k okraji následujícího.
    let links = '';
    for (let i = 0; i < game.trackLength; i++) {
        const from = trackPosition(i, game, style);
        const to = trackPosition(i + 1, game, style);
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
        const p = trackPosition(i, game, style);
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

    const debugMode = new URLSearchParams(window.location.search).get('debug') === '1';
    const debugPaths = debugMode ? buildDebugMovePaths(game, style) : [];
    const debugMarkup = debugPaths.map(path => path.points.map(point => {
        const offset = (path.pieceId - 1.5) * g.field * .12;
        const x = point.x + offset;
        const y = point.y - offset;
        const radius = Math.max(7, g.field * .72);
        return '<g class="debug-move-step" data-debug-player="' + path.playerId + '" data-debug-piece="' + path.pieceId + '">' +
            '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + radius.toFixed(1) + '" fill="' + path.color + '" fill-opacity=".88" stroke="#fff" stroke-width="2"/>' +
            '<text x="' + x.toFixed(1) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="middle" font-family="Arial,sans-serif" font-size="' + Math.max(10, g.field * .9).toFixed(1) + '" font-weight="900" fill="#fff" stroke="#17211d" stroke-width="1.8" paint-order="stroke">' + point.number + '</text>' +
            '</g>';
    }).join('')).join('');

    const bases = game.players.map(player => baseMarkup(game, player, validMoves, g)).join('');

    const boardPieces = game.players.map(player => {
        const active = game.pieces[player.id].pieces.filter(piece => piece.steps >= 0 && piece.steps <= game.trackLength + 3);
        return active.map(piece => {
            let stackIndex = 0;
            let stackCount = 1;
            if (piece.steps < game.trackLength) {
                const position = getPiecePosition(game, player.id, piece);
                const all = game.pieces.flatMap((group, groupId) => group.pieces.map(item => ({
                    playerId: groupId,
                    piece: item
                }))).filter(item => item.piece.steps >= 0 && item.piece.steps < game.trackLength &&
                    getPiecePosition(game, item.playerId, item.piece) === position);
                stackIndex = all.findIndex(item => item.playerId === player.id && item.piece.id === piece.id);
                stackCount = all.length;
            }
            return pieceMarkup(game, player, piece, stackIndex, stackCount, validMoves, g, style);
        }).join('');
    }).join('');

    const active = game.players[game.currentPlayer];
    container.innerHTML =
        '<div class="premium-board-shell">' + ui.switchCss +
            '<div class="board-topline"><span class="board-kicker">THE GRAND TABLE</span>' + ui.switchMarkup + '</div>' +
            '<svg class="premium-board" viewBox="0 0 720 720" role="img" aria-label="Hrací plán pro ' + total + ' hráčů">' +
                '<defs>' +
                    '<radialGradient id="boardBg"><stop offset="0" stop-color="#34423f"/><stop offset=".68" stop-color="#182522"/><stop offset="1" stop-color="#0c1413"/></radialGradient>' +
                    '<filter id="pieceGlow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
                    pawnGradientMarkup(game.players) +
                '</defs>' +
                '<rect x="13" y="13" width="694" height="694" rx="40" fill="url(#boardBg)" stroke="#c6a96b" stroke-opacity=".55" stroke-width="3"/>' +
                homeLanes + links + track + debugMarkup + bases +
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
