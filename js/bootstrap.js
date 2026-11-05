/**
 * Hlavní vstup aplikace.
 * Verzi předáváme všem hlavním modulům, aby prohlížeč nepoužil staré kopie.
 */
// Verze všech modulů je nastavena centrálně přes import map v index.php.
const loadModule = path => import(path);

async function startApp() {
    try {
        // Diagnostika se načítá pouze při výslovném zapnutí parametrem ?debug=1.
        if (new URLSearchParams(window.location.search).get('debug') === '1') {
            try {
                const { initDebugOverlay } = await loadModule('./debug-overlay.js');
                initDebugOverlay();
            } catch (error) {
                console.warn('Nepodařilo se spustit debug overlay:', error);
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
