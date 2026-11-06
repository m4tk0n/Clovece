/**
 * Řízení hodu kostkou.
 * Společný rotační plán je v dice-rotation.js; vzhled 2D v CSS,
 * prostorové vykreslení 3D v game-board-3d.js.
 * Modul se načítá až při otevření lokální hry nebo při prvním online hodu.
 */
import { createDiceRotationPlan } from './dice-rotation.js';

function loadDiceSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem('clovece-settings') || '{}');
        return {
            moveSpeed: (saved.moveSpeed || saved.aiSpeed) === 'fast' ? 'fast' : 'normal',
            animations: saved.animations !== false
        };
    } catch (error) {
        console.warn('Nastavení kostky se nepodařilo načíst:', error);
        return { moveSpeed: 'normal', animations: true };
    }
}

export async function animateDice(value, settings = loadDiceSettings()) {
    const diceValue = Math.max(1, Math.min(6, Number(value) || 1));
    const diceValueElement = document.getElementById('dice-value');
    if (diceValueElement) diceValueElement.textContent = diceValue;

    const animation = document.getElementById('dice-animation');
    const scene = document.getElementById('dice-scene');
    const cube = document.getElementById('dice-3d');

    if (!animation || !scene || !cube || !settings.animations) return;

    const mode = document.documentElement.dataset.boardView === '2d' ? '2d' : '3d';
    try {
        const board = await import('./game-board.js');
        await board.ensureModeStyles(mode);
    } catch (error) {
        console.error('Styly kostky se nepodařilo načíst:', error);
        return;
    }
    if (document.documentElement.dataset.boardView !== mode) return;

    // Oba režimy dostanou totožné cílové úhly, počet otoček a časování.
    const fast = settings.moveSpeed === 'fast';
    const rotationPlan = createDiceRotationPlan(diceValue, fast);

    if (mode === '3d') {
        try {
            if (typeof window.playSound === 'function') window.playSound('dice-sound');
            const board = await import('./game-board.js');
            await board.animateThreeDice(diceValue, fast, rotationPlan);
            return;
        } catch (error) {
            // Pokud Three.js kostku nevykreslí, zachováme funkční CSS animaci.
            console.error('Three.js kostku se nepodařilo animovat, používám CSS náhradu:', error);
        }
    }

    // Kostka používá CSS 3D transformace v obou režimech desky.
    // 2D režim tak nepotřebuje WebGL ani Three.js, ale zachovává plnou animaci šesti stran.
    animation.dataset.mode = mode;
    delete animation.dataset.value;

    // Rychlý režim ukáže rovnou správnou stěnu bez roztočení kostky.
    if (fast) {
        animation.classList.remove('hidden');
        scene.classList.remove('rolling');
        cube.style.transition = 'none';
        cube.style.transform =
            'rotateX(' + (rotationPlan.endX - 24) + 'deg) rotateY(' + (rotationPlan.endY - 32) + 'deg)';
        void cube.offsetWidth;
        cube.style.transition = '';
        return new Promise(resolve => {
            window.setTimeout(() => {
                animation.classList.add('hidden');
                resolve();
            }, 450);
        });
    }

    const nextX = rotationPlan.endX;
    const nextY = rotationPlan.endY;

    // Nejdřív kostku zobrazíme a nastavíme její skutečnou výchozí polohu.
    // Teprve po vynuceném layoutu změníme transformaci, aby prohlížeč
    // přehrál celý CSS transition i po předchozím display:none.
    animation.classList.remove('hidden');
    scene.classList.remove('rolling');
    cube.style.transition = 'none';
    cube.style.transform =
        'rotateX(' + (rotationPlan.startX - 24) + 'deg) rotateY(' + (rotationPlan.startY - 32) + 'deg)';
    void cube.offsetWidth;

    // Obnovíme plynulou rotaci a v dalším snímku spustíme několik otáček.
    cube.style.transition = '';
    scene.classList.add('rolling');
    requestAnimationFrame(() => {
        cube.style.transform =
            'rotateX(' + (nextX - 24) + 'deg) rotateY(' + (nextY - 32) + 'deg)';
    });

    if (typeof window.playSound === 'function') window.playSound('dice-sound');

    return new Promise(resolve => {
        window.setTimeout(() => {
            scene.classList.remove('rolling');
            animation.classList.add('hidden');
            resolve();
        }, rotationPlan.duration);
    });
}
