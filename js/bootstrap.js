/**
 * Hlavní vstup aplikace.
 * Verzi hlavních modulů nastavuje import map v index.php.
 */
const loadModule = path => import(path);

async function startApp() {
    const debugEnabled = /(?:^|[?&])debug=1(?:&|$)/.test(window.location.search);
    let debugLog = null;

    try {
        if (debugEnabled) {
            const startedAt = Date.now();
            try {
                // Relativní cesta funguje i při umístění aplikace v podadresáři.
                const debugModule = await import('./debug-overlay.js?v=20261105-2');
                debugLog = debugModule.initDebugOverlay();
                if (debugLog) {
                    debugLog('Modul debug-overlay.js načten', 'OK', Date.now() - startedAt);
                }
            } catch (error) {
                console.warn('Nepodařilo se spustit debug overlay:', error);
                const fallback = document.createElement('div');
                fallback.id = 'clovece-debug-overlay-fallback';
                fallback.style.cssText = 'position:fixed;left:2px;bottom:2px;z-index:2147483647;max-width:calc(100vw - 8px);padding:5px 7px;background:#300;color:#ff5555;border:1px solid #f44;font:11px/1.4 monospace;white-space:normal;overflow-wrap:anywhere;pointer-events:auto';
                fallback.textContent = 'DEBUG CHYBA MODULU | ' +
                    (error && error.message ? error.message : String(error)) +
                    ' | DISPLAY ' + (window.screen ? window.screen.width : 0) + 'x' +
                    (window.screen ? window.screen.height : 0) +
                    ' | OKNO ' + window.innerWidth + 'x' + window.innerHeight;
                document.body.appendChild(fallback);
            }
        }

        async function trackedImport(name, path) {
            const startedAt = Date.now();
            if (debugLog) debugLog(name + ' – načítání', '…');
            try {
                const module = await loadModule(path);
                if (debugLog) debugLog(name + ' – načteno', 'OK', Date.now() - startedAt);
                return module;
            } catch (error) {
                if (debugLog) debugLog(name + ' – chyba načítání: ' + (error && error.message ? error.message : String(error)), 'CHYBA', Date.now() - startedAt);
                throw error;
            }
        }

        const [
            { initNavigation },
            { initAudio },
            { initOnline }
        ] = await Promise.all([
            trackedImport('navigation.js', './navigation.js'),
            trackedImport('audio.js', './audio.js'),
            trackedImport('online.js', './online.js')
        ]);

        function trackedInit(name, callback) {
            const startedAt = Date.now();
            if (debugLog) debugLog(name + ' – inicializace', '…');
            try {
                const result = callback();
                if (result && typeof result.then === 'function') {
                    return result.then(value => {
                        if (debugLog) debugLog(name + ' – dokončeno', 'OK', Date.now() - startedAt);
                        return value;
                    }).catch(error => {
                        if (debugLog) debugLog(name + ' – chyba: ' + (error && error.message ? error.message : String(error)), 'CHYBA', Date.now() - startedAt);
                        throw error;
                    });
                }
                if (debugLog) debugLog(name + ' – dokončeno', 'OK', Date.now() - startedAt);
                return result;
            } catch (error) {
                if (debugLog) debugLog(name + ' – chyba: ' + (error && error.message ? error.message : String(error)), 'CHYBA', Date.now() - startedAt);
                throw error;
            }
        }

        document.getElementById('loading-screen')?.classList.add('hidden');
        document.getElementById('main-menu')?.classList.remove('hidden');

        // Online inicializace běží samostatně; její chyby se zaznamenají do panelu.
        const onlineInit = trackedInit('initOnline()', initOnline);
        if (onlineInit && typeof onlineInit.catch === 'function') {
            onlineInit.catch(error => console.error('Chyba initOnline():', error));
        }
        trackedInit('initNavigation()', initNavigation);
        trackedInit('initAudio()', initAudio);
    } catch (error) {
        console.error('Nepodařilo se inicializovat aplikaci:', error);
        if (debugLog) debugLog('Inicializace aplikace selhala: ' + (error && error.message ? error.message : String(error)), 'CHYBA');
        const loadingText = document.querySelector('#loading-screen p');
        if (loadingText) {
            loadingText.textContent = 'Hru se nepodařilo načíst: ' + (error && error.message ? error.message : 'neznámá chyba');
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void startApp(), { once: true });
} else {
    void startApp();
}
