/**
 * Hlavní vstup aplikace.
 * Diagnostické nástroje se vkládají samostatně pouze serverovou podmínkou.
 */
async function startApp() {
    try {
        const { initNavigation } = await import('./navigation.js');
        document.getElementById('loading-screen')?.classList.add('hidden');
        document.getElementById('main-menu')?.classList.remove('hidden');
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
