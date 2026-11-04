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

function trackAngle(index, game) {
    return -90 + index * 360 / game.trackLength;
}

// Obvod skutečného kříže: čtyři široká ramena, nikoli kruh ani čtverec.
// Souřadnice leží na vnitřní hraně ramen; všechny varianty používají
// stejnou geometrii a liší se pouze počtem rovnoměrně rozložených polí.
const CROSS_OUTLINE = [
    { x: 270, y: 60 }, { x: 450, y: 60 },
    { x: 450, y: 270 }, { x: 660, y: 270 },
    { x: 660, y: 450 }, { x: 450, y: 450 },
    { x: 450, y: 660 }, { x: 270, y: 660 },
    { x: 270, y: 450 }, { x: 60, y: 450 },
    { x: 60, y: 270 }, { x: 270, y: 270 }
];

function buildCrossTrackPositions(count) {
    const edges = CROSS_OUTLINE.map((start, index) => {
        const end = CROSS_OUTLINE[(index + 1) % CROSS_OUTLINE.length];
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        return { start, dx, dy, length: Math.hypot(dx, dy) };
    });
    const perimeter = edges.reduce((sum, edge) => sum + edge.length, 0);
    return Array.from({ length: count }, (_, index) => {
        let distance = (index + 0.5) * perimeter / count;
        for (const edge of edges) {
            if (distance <= edge.length) {
                const ratio = distance / edge.length;
                return {
                    x: edge.start.x + edge.dx * ratio,
                    y: edge.start.y + edge.dy * ratio
                };
            }
            distance -= edge.length;
        }
        return { ...CROSS_OUTLINE[0] };
    });
}

const TRACK_POSITIONS = Object.freeze({
    40: buildCrossTrackPositions(40),
    48: buildCrossTrackPositions(48),
    52: buildCrossTrackPositions(52),
    64: buildCrossTrackPositions(64),
    80: buildCrossTrackPositions(80)
});

function playerAngle(player, total, trackLength) {
    // Čtyři základny klasické desky směřují do čtyř ramen kříže.
    const slotCount = trackLength === 48 ? 6 : (trackLength === 80 ? 8 : 4);
    const slot = Number.isInteger(player.slot)
        ? player.slot
        : Math.round(player.start * slotCount / trackLength);
    if (slotCount === 4) return [-90, 0, 90, 180][slot % 4];
    return -90 + slot * 360 / slotCount;
}

export function trackPosition(index, game) {
    const positions = TRACK_POSITIONS[game.trackLength];
    if (positions) return positions[((index - 1) % game.trackLength + game.trackLength) % game.trackLength];
    return point(trackAngle(index, game), TRACK_RADIUS);
}

function routeAngle(player, game) {
    return playerAngle(player, game.players.length, game.trackLength);
}

function svgText(x, y, value, size, fill) {
    return '<text x="' + x + '" y="' + y + '" text-anchor="middle" dominant-baseline="central" font-size="' + size + '" fill="' + fill + '" font-weight="800">' + value + '</text>';
}

function baseMarkup(game, player, validMoves) {
    const angle = playerAngle(player, game.players.length, game.trackLength);
    const baseAngle = angle + (game.trackLength === 40 ? -45 : -22.5);
    const center = point(baseAngle, BASE_RADIUS * 1.12);
    const color = player.color;
    const pieces = game.pieces[player.id].pieces;
    let markup = '<g class="base-zone" style="--player-color:' + color + '">';
    const labelAngle = (angle + 90) * Math.PI / 180;
    markup += svgText(center.x + Math.cos(labelAngle) * 55, center.y + Math.sin(labelAngle) * 55, player.name, 10, '#f4f0e8');

    pieces.forEach(piece => {
        if (piece.steps !== -1) return;
        // První figurka leží na ose mezi domečkem a vlastním startovním polem.
        // Další figurky pokračují vedle ní po oblouku směrem nad herní dráhu.
        const baseAngle = angle + (game.trackLength === 40 ? -45 : -22.5);
        const baseCenter = point(baseAngle, BASE_RADIUS * 1.12);
        const offsets = [
            [-19, -19], [19, -19], [-19, 19], [19, 19]
        ];
        const [offsetX, offsetY] = offsets[piece.id];
        const radians = baseAngle * Math.PI / 180;
        const x = baseCenter.x + offsetX * Math.cos(radians) - offsetY * Math.sin(radians);
        const y = baseCenter.y + offsetX * Math.sin(radians) + offsetY * Math.cos(radians);
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
    if (piece.steps < 0) return '';

    let pos;
    if (piece.steps <= game.trackLength) {
        const trackIndex = getPiecePosition(game, player.id, piece);
        const visualIndex = (trackIndex + 1 + game.trackLength) % game.trackLength;
        pos = trackPosition(visualIndex, game);
    } else {
        const laneIndex = getHomeLaneIndex(game, piece);
        pos = point(playerAngle(player, game.players.length, game.trackLength), HOME_RADII[Math.min(3, laneIndex)]);
    }

    const spread = piece.steps === maxSteps ? 0 : (stackIndex - (stackCount - 1) / 2) * 9;
    const angle = playerAngle(player, game.players.length, game.trackLength) + 90;
    const radians = angle * Math.PI / 180;
    let x = pos.x + Math.cos(radians) * spread;
    let y = pos.y + Math.sin(radians) * spread;

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

    // Při online pollingu přichází stejný stav opakovaně. SVG překreslíme
    // pouze tehdy, když se skutečně změnil herní stav.
    const renderKey = JSON.stringify(game);
    if (container.dataset.renderKey === renderKey) return;
    container.dataset.renderKey = renderKey;

    const total = game.players.length;
    const validMoves = new Set(getValidMoves(game));
    const track = [];
    for (let i = 0; i < game.trackLength; i++) {
        const p = trackPosition(i, game);
        const slotCount = game.slotCount || (game.players.length <= 4 ? 4 : 8);
        const occupiedSlots = new Map(game.players.map(player => [
            Number.isInteger(player.slot) ? player.slot : Math.round(player.start * slotCount / game.trackLength),
            player
        ]));
        const startPlayer = game.players.find(player =>
            (player.start + 1 + game.trackLength) % game.trackLength === i
        );
        const emptyStart = !startPlayer && Array.from({ length: slotCount }, (_, slot) =>
            (Math.round(slot * game.trackLength / slotCount) + 1 + game.trackLength) % game.trackLength
        ).includes(i) && !Array.from(occupiedSlots.keys()).some(slot =>
            (Math.round(slot * game.trackLength / slotCount) + 1 + game.trackLength) % game.trackLength === i
        );
        track.push(
            '<g class="track-space ' + (startPlayer ? 'track-start' : '') + '">' +
            '<rect x="' + (p.x - (game.trackLength === 80 ? 8 : game.trackLength === 48 ? 10 : 12)) + '" y="' + (p.y - (game.trackLength === 80 ? 8 : game.trackLength === 48 ? 10 : 12)) + '" width="' + (game.trackLength === 80 ? 16 : game.trackLength === 48 ? 20 : 24) + '" height="' + (game.trackLength === 80 ? 16 : game.trackLength === 48 ? 20 : 24) + '" rx="2" fill="' + (startPlayer ? startPlayer.color : '#d9d2c3') + '" fill-opacity="' + (startPlayer ? '.95' : (emptyStart ? '.42' : '.12')) + '" stroke="' + (startPlayer ? startPlayer.color : (emptyStart ? '#c6a96b' : '#fff')) + '" stroke-opacity="' + (startPlayer ? '.9' : (emptyStart ? '.65' : '.22')) + '" stroke-width="1.4"/>' +
            (startPlayer ? '<circle cx="' + p.x + '" cy="' + p.y + '" r="5" fill="#fff" fill-opacity=".9"/>' : (emptyStart ? '<circle cx="' + p.x + '" cy="' + p.y + '" r="4" fill="#c6a96b" fill-opacity=".8"/>' : '')) +
            '</g>'
        );
    }

    const slotCount = game.slotCount || (total <= 4 ? 4 : 8);
    const playersBySlot = new Map(game.players.map(player => [
        Number.isInteger(player.slot) ? player.slot : Math.round(player.start * slotCount / game.trackLength),
        player
    ]));
    const homeLanes = Array.from({ length: slotCount }, (_, slot) => {
        // Každá pozice desky má vlastní cílový domeček, i když na ní nehraje žádný hráč.
        const player = playersBySlot.get(slot);
        const angle = player
            ? playerAngle(player, total, game.trackLength)
            : (total <= 4 ? -135 : -90) + slot * 360 / slotCount;
        const color = player?.color || '#c6a96b';
        const cells = HOME_RADII.map(radius => {
            const p = point(angle, radius);
            return '<rect x="' + (p.x - 12) + '" y="' + (p.y - 12) + '" width="24" height="24" rx="2" fill="' + color + '" fill-opacity="' + (player ? '.28' : '.08') + '" stroke="' + color + '" stroke-opacity="' + (player ? '.85' : '.42') + '" stroke-width="1.5"/>';
        }).join('');
        return '<g class="home-lane ' + (player ? '' : 'home-lane-empty') + '">' + cells + '</g>';
    }).join('');

    const bases = Array.from({ length: slotCount }, (_, slot) => {
        const player = playersBySlot.get(slot);
        if (player) return baseMarkup(game, player, validMoves);
        const angle = (total <= 4 ? -135 : -90) + slot * 360 / slotCount;
        const center = point(angle, BASE_RADIUS);
        return '<g class="base-zone base-zone-empty"></g>';
    }).join('');
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
            '<div class="board-topline"><span class="board-kicker">THE GRAND TABLE</span><div class="board-appearance" role="group" aria-label="Vzhled hrací desky"><span class="board-appearance-label">DESKA</span><button class="board-appearance-option is-active" type="button" aria-pressed="true" disabled>KŘÍŽOVÁ</button></div></div>' +
            '<svg class="premium-board" viewBox="0 0 720 720" role="img" aria-label="Hrací plán pro ' + total + ' hráčů">' +
                '<defs>' +
                    '<radialGradient id="boardBg"><stop offset="0" stop-color="#34423f"/><stop offset=".68" stop-color="#182522"/><stop offset="1" stop-color="#0c1413"/></radialGradient>' +
                    '<linearGradient id="trackRing" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f2e7d2"/><stop offset="1" stop-color="#8e9a8d"/></linearGradient>' +
                    '<filter id="pieceGlow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
                '</defs>' +
                '<path d="M270 35 H450 V270 H685 V450 H450 V685 H270 V450 H35 V270 H270 Z" fill="url(#boardBg)" stroke="#c6a96b" stroke-opacity=".55" stroke-width="3" stroke-linejoin="round"/>' +
                '<path d="M270 60 H450 V270 H660 V450 H450 V660 H270 V450 H60 V270 H270 Z" fill="none" stroke="url(#trackRing)" stroke-opacity=".16" stroke-width="3" stroke-linejoin="round"/>' +
                homeLanes +
                '<polyline points="' + TRACK_POSITIONS[game.trackLength].map(position => position.x + ',' + position.y).concat([TRACK_POSITIONS[game.trackLength][0].x + ',' + TRACK_POSITIONS[game.trackLength][0].y]).join(' ') + '" fill="none" stroke="url(#trackRing)" stroke-opacity=".28" stroke-width="22" stroke-linejoin="round" stroke-linecap="round"/>' +
                track.join('') + bases +
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
