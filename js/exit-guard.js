/**
 * Potvrzení opuštění aplikace systémovým tlačítkem Zpět.
 * Aktivní je pouze na hlavní úvodní obrazovce.
 */
export function initExitGuard() {
    const mainMenu = document.getElementById('main-menu');
    const modal = document.getElementById('exit-confirm');
    const yesButton = document.getElementById('exit-confirm-yes');
    const noButton = document.getElementById('exit-confirm-no');

    if (!mainMenu || !modal || !yesButton || !noButton) return;

    const isMainMenuVisible = () => !mainMenu.classList.contains('hidden');
    const showModal = () => {
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        noButton.focus();
    };
    const hideModal = () => {
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
    };

    // Dvě položky stejné adresy umožní zachytit první systémové Zpět.
    const currentUrl = window.location.href;
    window.history.pushState({ cloveceExitBase: true }, '', currentUrl);
    window.history.pushState({ cloveceExitGuard: true }, '', currentUrl);

    window.addEventListener('popstate', () => {
        if (!isMainMenuVisible()) {
            // Na ostatních obrazovkách potvrzení nezobrazujeme.
            window.history.back();
            return;
        }

        // Obnovíme ochrannou položku, aby NE ponechalo hráče na úvodní stránce.
        window.history.pushState({ cloveceExitGuard: true }, '', currentUrl);
        showModal();
    });

    noButton.addEventListener('click', () => {
        hideModal();
        mainMenu.focus?.();
    });

    yesButton.addEventListener('click', () => {
        hideModal();
        // Přeskočíme ochrannou i pomocnou položku a skutečně opustíme aplikaci.
        window.history.go(-2);
    });

    modal.addEventListener('click', event => {
        if (event.target.classList.contains('exit-confirm__backdrop')) {
            hideModal();
        }
    });

    window.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !modal.classList.contains('hidden')) {
            event.preventDefault();
            hideModal();
        }
    });
}
