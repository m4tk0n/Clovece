/**
 * Vstupní bod aplikace.
 * Navigace je jediný modul potřebný při prvním zobrazení stránky.
 * Pomocné načítání médií se připojí až při první interakci uživatele.
 */
import './navigation.js';

let lazyMediaLoaded = false;

function loadOptionalModules() {
    if (lazyMediaLoaded) return;
    lazyMediaLoaded = true;
    import('./lazy-load.js').catch((error) => {
        console.error('Nepodařilo se načíst modul lazy-load.js:', error);
    });
}

window.addEventListener('pointerdown', loadOptionalModules, { once: true, passive: true });
window.addEventListener('keydown', loadOptionalModules, { once: true });
