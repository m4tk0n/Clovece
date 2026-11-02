/**
 * Hlavní vstup aplikace.
 * Všechny obrazovky jsou už v index.html; žádné HTML se nestahuje za běhu.
 */
import { initNavigation } from './navigation.js';
import { initAudio } from './audio.js';

function startApp() {
    document.getElementById('loading-screen')?.classList.add('hidden');
    document.getElementById('main-menu')?.classList.remove('hidden');

    initNavigation();
    initAudio();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp, { once: true });
} else {
    startApp();
}
