/**
 * SVG vykreslení herního plánu pro 2–8 hráčů.
 * Čtyři hráči: čtyři výrazné základny. Pět až osm: osmisměrná aréna,
 * každý hráč má vlastní start, čtyři domácí pole a čtyři figurky.
 */
import { getPiecePosition, getHomeLaneIndex, getValidMoves } from './game-engine.js';

const SIZE = 720;
const CENTER = SIZE / 2;
const TRACK_RADIUS = 245;
const BASE_RADIUS = 300;
const HOME_RADII = [202, 164, 126, 88];

function point(angle, radius) {
    const radians = angle * Math.PI / 180;
    return {
        x: CENTER + Math.cos(radians) * radius,
        y: CENTER + Math.sin(radians) * radius
    };
}

function playerAngle(player, total, trackLength) {
    const startAngle = total <= 4 ? -135 : -90;
    return startAngle + player.start * 360 / trackLength;
}

function trackAngle(index, game) {
    return (game.players.length <= 4 ? -135 : -90) + index * 360 / game.trackLength;
}

function svgText(x, y, value, size, fill) {
    return '<text x="' + x + '" y="' + y + '" text-anchor="middle" dominant-baseline="central" font-size="' + size + '" fill="' + fill + '" font-weight="800">' + value + '</text>';
}

function baseMarkup(game, player, validMoves) {
    const angle = playerAngle(player, game.players.length, game.trackLength);
    const center = point(angle, BASE_RADIUS);
    const color = player.color;
    const pieces = game.pieces[player.id].pieces;
    let markup = '<g class="base-zone" style="--player-color:' + color + '">';
    markup += '<circle cx="' + center.x + '" cy="' + center.y + '" r="48" fill="' + color + '" fill-opacity=".13" stroke="' + color + '" stroke-opacity=".7" stroke-width="2"/>';
    markup += '<circle cx="' + center.x + '" cy="' + center.y + '" r="41" fill="none" stroke="' + color + '" stroke-opacity=".3" stroke-dasharray="3 7"/>';
    const labelAngle = (angle + 90) * Math.PI / 180;
    markup += svgText(center.x + Math.cos(labelAngle) * 55, center.y + Math.sin(labelAngle) * 55, player.name, 10, '#f4f0e8');

    pieces.forEach(piece => {
        if (piece.steps !== -1) return;
        const offset = [
            [-17, -17], [17, -17], [-17, 17], [17, 17]
        ][piece.id];
        const x = center.x + offset[0];
        const y = center.y + offset[1];
        markup += '<g class="board-piece ' + (game.currentPlayer === player.id && validMoves.has(piece.id) ? 'piece-selectable' : '') + '" data-player="' + player.id + '" data-piece="' + piece.id + '">';
        markup += '<circle class="piece-shadow" cx="' + x + '" cy="' + (y + 4) + '" r="13"/>';
        markup += '<circle class="piece-core" cx="' + x + '" cy="' + y + '" r="12" fill="' + color + '"/>';
        markup += '<circle cx="' + (x - 3) + '" cy="' + (y - 4) + '" r="3.5" fill="#fff" fill-opacity=".65"/>';
        markup += svgText(x, y + 1, piece.id + 1, 9, color === '#F9A825' ? '#17211f' : '#fff');
        markup += '</g>';
    });
    markup += '</g>';
    return markup;
}

function pieceMarkup(game, player, piece, stackIndex, stackCount, validMoves) {
    const color = player.color;
    const maxSteps = game.trackLength + 4;
    if (piece.steps < 0 || piece.steps === maxSteps) return '';

    let pos;
    if (piece.steps <= game.trackLength) {
        const trackIndex = getPiecePosition(game, player.id, piece);
        const angle = trackAngle(trackIndex, game);
        pos = point(angle, TRACK_RADIUS);
    } else {
        const laneIndex = getHomeLaneIndex(game, piece);
        pos = point(playerAngle(player, game.players.length, game.trackLength), HOME_RADII[Math.min(3, laneIndex)]);
    }

    const spread = (stackIndex - (stackCount - 1) / 2) * 9;
    const angle = playerAngle(player, game.players.length, game.trackLength) + 90;
    const radians = angle * Math.PI / 180;
    const x = pos.x + Math.cos(radians) * spread;
    const y = pos.y + Math.sin(radians) * spread;
    const selectable = player.id === game.currentPlayer && validMoves.has(piece.id);
    return '<g class="board-piece ' + (selectable ? 'piece-selectable' : '') + '" data-player="' + player.id + '" data-piece="' + piece.id + '">' +
        '<circle class="piece-shadow" cx="' + x + '" cy="' + (y + 5) + '" r="14"/>' +
        '<circle class="piece-core" cx="' + x + '" cy="' + y + '" r="13" fill="' + color + '"/>' +
        '<circle cx="' + (x - 3.5) + '" cy="' + (y - 4) + '" r="4" fill="#fff" fill-opacity=".68"/>' +
        svgText(x, y + 1, piece.id + 1, 10, color === '#F9A825' ? '#17211f' : '#fff') +
        '</g>';
}

export function renderBoard(container, game) {
    if (!container || !game) return;
    const total = game.players.length;
    const validMoves = new Set(getValidMoves(game));
    const track = [];
    for (let i = 0; i < game.trackLength; i++) {
        const angle = trackAngle(i, game);
        const p = point(angle, TRACK_RADIUS);
        const startPlayer = game.players.find(player => player.start === i);
        track.push(
            '<g class="track-space ' + (startPlayer ? 'track-start' : '') + '">' +
            '<circle cx="' + p.x + '" cy="' + p.y + '" r="13" fill="' + (startPlayer ? startPlayer.color : '#d9d2c3') + '" fill-opacity="' + (startPlayer ? '.95' : '.12') + '" stroke="' + (startPlayer ? startPlayer.color : '#fff') + '" stroke-opacity="' + (startPlayer ? '.9' : '.22') + '" stroke-width="1.4"/>' +
            (startPlayer ? '<circle cx="' + p.x + '" cy="' + p.y + '" r="5" fill="#fff" fill-opacity=".9"/>' : '') +
            '</g>'
        );
    }

    const homeLanes = game.players.map(player => {
        const angle = playerAngle(player, total, game.trackLength);
        const cells = HOME_RADII.map(radius => {
            const p = point(angle, radius);
            return '<circle cx="' + p.x + '" cy="' + p.y + '" r="14" fill="' + player.color + '" fill-opacity=".28" stroke="' + player.color + '" stroke-opacity=".85" stroke-width="1.5"/>';
        }).join('');
        return '<g class="home-lane">' + cells + '</g>';
    }).join('');

    const bases = game.players.map(player => baseMarkup(game, player, validMoves)).join('');
    const boardPieces = game.players.map(player => {
        const active = game.pieces[player.id].pieces.filter(piece => piece.steps >= 0 && piece.steps <= game.trackLength + 4);
        return active.map(piece => {
            let stackIndex = 0;
            let stackCount = 1;
            if (piece.steps <= game.trackLength) {
                const position = getPiecePosition(game, player.id, piece);
                const all = game.pieces.flatMap(group => group.pieces.map((item, index) => ({
                    playerId: group === game.pieces[player.id] ? player.id : game.pieces.indexOf(group),
                    piece: item,
                    index
                }))).filter(item => item.piece.steps >= 0 && item.piece.steps <= game.trackLength &&
                    getPiecePosition(game, item.playerId, item.piece) === position);
                stackIndex = all.findIndex(item => item.playerId === player.id && item.piece.id === piece.id);
                stackCount = all.length;
            }
            return pieceMarkup(game, player, piece, stackIndex, stackCount, validMoves);
        }).join('');
    }).join('');

    const active = game.players[game.currentPlayer];
    container.innerHTML =
        '<div class="premium-board-shell">' +
            '<div class="board-topline"><span class="board-kicker">THE GRAND TABLE</span><span class="board-mode">' + (total <= 4 ? 'KLASICKÁ ARÉNA · 4 BARVY' : 'OSMISMĚRNÁ ARÉNA · ' + total + ' HRÁČŮ') + '</span></div>' +
            '<svg class="premium-board" viewBox="0 0 720 720" role="img" aria-label="Hrací plán pro ' + total + ' hráčů">' +
                '<defs>' +
                    '<radialGradient id="boardBg"><stop offset="0" stop-color="#34423f"/><stop offset=".68" stop-color="#182522"/><stop offset="1" stop-color="#0c1413"/></radialGradient>' +
                    '<linearGradient id="trackRing" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f2e7d2"/><stop offset="1" stop-color="#8e9a8d"/></linearGradient>' +
                    '<filter id="pieceGlow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
                '</defs>' +
                '<circle cx="360" cy="360" r="347" fill="url(#boardBg)" stroke="#c6a96b" stroke-opacity=".55" stroke-width="3"/>' +
                '<circle cx="360" cy="360" r="270" fill="none" stroke="url(#trackRing)" stroke-opacity=".18" stroke-width="44"/>' +
                '<circle cx="360" cy="360" r="222" fill="none" stroke="#d6c6a5" stroke-opacity=".12" stroke-width="1" stroke-dasharray="3 8"/>' +
                homeLanes + track.join('') + bases +
                '<circle cx="360" cy="360" r="68" fill="#0b1714" stroke="#c6a96b" stroke-width="2"/>' +
                '<circle cx="360" cy="360" r="57" fill="none" stroke="#c6a96b" stroke-opacity=".45" stroke-dasharray="2 5"/>' +
                svgText(360, 350, 'ČLOVĚČE', 14, '#e9d7ac') +
                svgText(360, 373, 'NEZLOB SE', 11, '#aab9aa') +
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
}
