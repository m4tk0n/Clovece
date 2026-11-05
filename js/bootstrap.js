/**
 * Hlavní vstup aplikace.
 * Verzi předáváme všem hlavním modulům, aby prohlížeč nepoužil staré kopie.
 */
// Verze všech modulů je nastavena centrálně přes import map v index.php.
const loadModule = path => import(path);

async function startApp() {
    try {
        // Diagnostika se načítá pouze při výslovném zapnutí parametrem ?debug=1.
        // Regulární výraz funguje i ve starších prohlížečích bez URLSearchParams.
        const debugEnabled = /(?:^|[?&])debug=1(?:&|$)/.test(window.location.search);
        if (debugEnabled) {
            try {
                // Import přes import map zajistí správnou cestu v podadresáři
                // i verzování souboru proti zastaralé cache.
                const debugModule = await loadModule('/js/debug-overlay.js');
                debugModule.initDebugOverlay();
            } catch (error) {
                console.warn('Nepodařilo se spustit debug overlay:', error);

                // Nouzový panel: i při chybě modulu musí být na telefonu vidět
                // alespoň základní diagnostika a důvod selhání.
                const fallback = document.createElement('div');
                fallback.id = 'clovece-debug-overlay-fallback';
                fallback.style.cssText = 'position:fixed;left:2px;bottom:2px;z-index:2147483647;max-width:calc(100vw - 8px);padding:4px 6px;background:#300;color:#ff5555;border:1px solid #f44;font:10px/1.4 monospace;white-space:normal;overflow-wrap:anywhere;pointer-events:none';
                fallback.textContent = 'DEBUG CHYBA MODULU | ' +
                    (error && error.message ? error.message : String(error)) +
                    ' | DISPLAY ' + window.screen.width + 'x' + window.screen.height +
                    ' | OKNO ' + window.innerWidth + 'x' + window.innerHeight;
                document.body.appendChild(fallback);
            }
        }

        const [
            { initNavigation },
            { initAudio },
            { initGame },
            { initOnline }
        ] = await Promise.all([
            loadModule('./navigation.js'),
            loadModule('./audio.js'),
            loadModule('./app.js'),
            loadModule('./online.js')
        ]);

        document.getElementById('loading-screen')?.classList.add('hidden');
        document.getElementById('main-menu')?.classList.remove('hidden');

        void initOnline();
        initNavigation();
        initAudio();
        initGame();
    } catch (error) {
        console.error('Nepodařilo se inicializovat aplikaci:', error);
        const loadingText = document.querySelector('#loading-screen p');
        if (loadingText) {
            loadingText.textContent = 'Hru se nepodařilo načíst: ' + (error?.message || 'neznámá chyba');
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void startApp(), { once: true });
} else {
    void startApp();
}
