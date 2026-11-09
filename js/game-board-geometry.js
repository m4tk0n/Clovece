// FTP sync refresh marker 2026-11-09
/**
 * Čistá geometrie herní desky.
 * Tento modul nepracuje s DOM, úložištěm ani herním stavem.
 */

const SIZE = 720;
export const CENTER = SIZE / 2;
const BOARD_BY_TRACK = { 40: 4, 48: 6, 80: 8 };

// Klasik: arm = délka ramene, w = poloviční šířka ramene,
// r0 = vzdálenost sdíleného vnitřního rohu od středu.
const CLASSIC = {
    4: { arm: 325, w: 51, r0: 51, field: 14.5, piece: 16, base: 54, baseDist: 205 },
    6: { arm: 325, w: 42, r0: 42 / Math.tan(Math.PI / 6), field: 12.5, piece: 14.5, base: 46, baseDist: 248, laneStep: 64 },
    8: { arm: 325, w: 33, r0: 33 / Math.tan(Math.PI / 8), field: 11.5, piece: 13, base: 36, baseDist: 236 }
};

// Mnohoúhelník: rp = poloměr opsané kružnice, ls = rozestup polí domečku.
const POLYGON = {
    4: { rp: 328 / Math.cos(Math.PI / 4), field: 17, piece: 18, base: 80, baseDist: 250, ls: 65 },
    6: { rp: 330, field: 14, piece: 15, base: 70, baseDist: 188, ls: 48 },
    8: { rp: 328 / Math.cos(Math.PI / 8), field: 11, piece: 13, base: 56, baseDist: 208, ls: 60 }
};

export function boardSize(game) {
    return game.slotCount || BOARD_BY_TRACK[game.trackLength] || 4;
}

export function geometry(game, style = 'classic') {
    const n = boardSize(game);
    return { n, style, ...(style === 'polygon' ? POLYGON[n] : CLASSIC[n]) };
}

export function slotOf(player, game) {
    if (Number.isInteger(player.slot)) return player.slot;
    const n = boardSize(game);
    return Math.floor(player.start / (game.trackLength / n));
}

export function slotAngle(slot, n) {
    return (-90 + slot * 360 / n) * Math.PI / 180;
}

export function polar(angle, radius) {
    return { x: CENTER + Math.cos(angle) * radius, y: CENTER + Math.sin(angle) * radius };
}

// along = vzdálenost od středu po ose ramene, side = posun do strany (+ po směru hodin).
export function armPoint(slot, n, along, side) {
    const angle = slotAngle(slot, n);
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    return {
        x: CENTER + ux * along - uy * side,
        y: CENTER + uy * along + ux * side
    };
}

export function laneRadius(g, laneIndex) {
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
export function trackPosition(index, game, style = 'classic') {
    const g = geometry(game, style);
    const length = game.trackLength;
    // Logický start hráče leží uprostřed geometrického ramene.
    // Posun je odvozen od počtu polí v rameni a platí pro všechny varianty desky.
    // Indexy herního enginu zůstávají beze změny.
    const renderOffset = (length / g.n) / 2;
    const i = ((index + renderOffset) % length + length) % length;
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
