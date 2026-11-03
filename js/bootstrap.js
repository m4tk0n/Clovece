/**
 * Hlavní vstup aplikace.
 * Verzi předáváme všem hlavním modulům, aby prohlížeč nepoužil staré kopie.
 */
const appVersion = new URL(import.meta.url).searchParams.get('v') || Date.now();
const loadModule = path => import(`${path}?v=${encodeURIComponent(appVersion)}`);

async function startApp() {
    try {
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
            loadingText.textContent = 'Hru se nepodařilo načíst. Obnovte stránku.';
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void startApp(), { once: true });
} else {
    void startApp();
}
