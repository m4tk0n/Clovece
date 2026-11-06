/**
 * Potvrzení opuštění aplikace systémovým tlačítkem Zpět.
 * Dialog se zobrazuje pouze na hlavní úvodní obrazovce.
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

    const currentUrl = window.location.href;
    // Počet pomocných položek historie vložených za aktuální načtení stránky.
    let guardEntries = 2;

    window.history.pushState({ cloveceExitBase: true }, '', currentUrl);
    window.history.pushState({ cloveceExitGuard: true }, '', currentUrl);

    window.addEventListener('popstate', () => {
        // Na ostatních obrazovkách ponecháme systémové Zpět bez vlastního dialogu.
        if (!isMainMenuVisible()) return;

        // Na úvodní stránce obnovíme ochrannou položku a zobrazíme potvrzení.
        window.history.pushState({ cloveceExitGuard: true }, '', currentUrl);
        guardEntries++;
        showModal();
    });

    noButton.addEventListener('click', () => {
        hideModal();
    });

    yesButton.addEventListener('click', () => {
        hideModal();
        // Přeskočíme všechny pomocné položky a vrátíme se na předchozí stránku.
        window.history.go(-(guardEntries + 1));
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
