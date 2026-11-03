/**
 * Hlavní vstup aplikace.
 * Všechny obrazovky jsou už v index.html; žádné HTML se nestahuje za běhu.
 */
import { initNavigation } from './navigation.js';
import { initAudio } from './audio.js';
import { initGame } from './app.js?v=20261103-1';
import { initOnline } from './online.js?v=20261103-3';

function startApp() {
    document.getElementById('loading-screen')?.classList.add('hidden');
    document.getElementById('main-menu')?.classList.remove('hidden');

    void initOnline();
    initNavigation();
    initAudio();
    initGame();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp, { once: true });
} else {
    startApp();
}
