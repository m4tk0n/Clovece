/**
 * Hlavní vstup aplikace.
 * Diagnostické nástroje se vkládají samostatně pouze serverovou podmínkou.
 */
async function startApp() {
    try {
        document.getElementById('loading-screen')?.classList.add('hidden');
        document.getElementById('main-menu')?.classList.remove('hidden');

        const { initExitGuard } = await import('./exit-guard.js');
        initExitGuard();

        const { initNavigation } = await import('./navigation.js');
        initNavigation();
    } catch (error) {
        console.error('Nepodařilo se inicializovat aplikaci:', error);
        const loadingText = document.querySelector('#loading-screen p');
        if (loadingText) {
            loadingText.textContent = 'Hru se nepodařilo načíst: ' +
                (error && error.message ? error.message : 'neznámá chyba');
        }
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void startApp(), { once: true });
} else {
    void startApp();
}
