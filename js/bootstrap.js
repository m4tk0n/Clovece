/**
 * Hlavní vstup aplikace.
 * Verzi předáváme všem hlavním modulům, aby prohlížeč nepoužil staré kopie.
 */
// Verze hlavních modulů je nastavena centrálně přes import map v index.php.
const loadModule = path => import(path);

async function startApp() {
    try {
        // Diagnostika se načítá pouze při výslovném zapnutí parametrem ?debug=1.
        const debugEnabled = /(?:^|[?&])debug=1(?:&|$)/.test(window.location.search);
        if (debugEnabled) {
            try {
                // Relativní import se řeší vůči tomuto souboru bootstrap.js.
                // Nepotřebuje import-map alias s absolutní cestou od kořene webu.
                const debugModule = await import('./debug-overlay.js?v=20261105');
                debugModule.initDebugOverlay();
            } catch (error) {
                console.warn('Nepodařilo se spustit debug overlay:', error);

                // Nouzový panel při chybě načtení nebo inicializace diagnostického modulu.
                const fallback = document.createElement('div');
                fallback.id = 'clovece-debug-overlay-fallback';
                fallback.style.cssText = 'position:fixed;left:2px;bottom:2px;z-index:2147483647;max-width:calc(100vw - 8px);padding:4px 6px;background:#300;color:#ff5555;border:1px solid #f44;font:10px/1.4 monospace;white-space:normal;overflow-wrap:anywhere;pointer-events:none';
                fallback.textContent = 'DEBUG CHYBA MODULU | ' +
                    (error && error.message ? error.message : String(error)) +
                    ' | DISPLAY ' + (window.screen ? window.screen.width : 0) + 'x' +
                    (window.screen ? window.screen.height : 0) +
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
