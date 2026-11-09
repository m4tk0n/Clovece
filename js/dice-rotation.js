// /js/dice-rotation.js
/**
 * Společná logika natočení kostky pro 2D CSS a 3D Three.js.
 * Neobsahuje DOM ani vykreslování; oba renderery dostávají stejný plán.
 */
let diceCurrentX = 0;
let diceCurrentY = 0;

const DICE_FACE_ROTATIONS = {
    1: { x: 0, y: 0 }, 2: { x: 0, y: -90 }, 3: { x: -90, y: 0 },
    4: { x: 90, y: 0 }, 5: { x: 0, y: 90 }, 6: { x: 0, y: 180 }
};

// Jeden plán rotace používá CSS kostka i Three.js kostka.
export function createDiceRotationPlan(value, fast) {
    const target = DICE_FACE_ROTATIONS[value];
    const spin = (current, base) => {
        const turns = Math.ceil((current - base) / 360) + 2 + Math.floor(Math.random() * 2);
        return base + turns * 360;
    };
    const plan = fast
        ? { startX: target.x, startY: target.y, endX: target.x, endY: target.y, duration: 0, fast: true }
        : {
            startX: diceCurrentX, startY: diceCurrentY,
            endX: spin(diceCurrentX, target.x), endY: spin(diceCurrentY, target.y),
            duration: 1500, fast: false
        };
    diceCurrentX = plan.endX;
    diceCurrentY = plan.endY;
    return plan;
}
