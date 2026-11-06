/**
 * Potvrzení opuštění aplikace systémovým tlačítkem Zpět.
 * Ochranná položka historie existuje pouze na hlavní úvodní obrazovce.
 */
export function initExitGuard() {
    const mainMenu = document.getElementById('main-menu');
    const modal = document.getElementById('exit-confirm');
    const yesButton = document.getElementById('exit-confirm-yes');
    const noButton = document.getElementById('exit-confirm-no');

    if (!mainMenu || !modal || !yesButton || !noButton) return;

    const isMainMenuVisible = () => !mainMenu.classList.contains('hidden');
    let modalOpen = false;
    let allowExit = false;

    const showModal = () => {
        if (modalOpen) return;
        modalOpen = true;
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        noButton.focus();
    };

    const hideModal = () => {
        modalOpen = false;
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
    };

    // Vloží právě jednu ochrannou položku pro aktuální zobrazení hlavního menu.
    const armHistoryGuard = () => {
        if (!isMainMenuVisible()) return;
        if (window.history.state?.cloveceExitGuard === true) return;

        window.history.pushState(
            { ...(window.history.state || {}), cloveceExitGuard: true },
            '',
            window.location.href
        );
    };

    // Při návratu do hlavního menu obnovíme ochranu, pokud ji mezitím
    // systémové Zpět na jiné obrazovce odstranilo.
    window.addEventListener('clovece:main-menu-shown', armHistoryGuard);
    armHistoryGuard();

    window.addEventListener('popstate', () => {
        if (allowExit) {
            allowExit = false;
            return;
        }

        // Ostatní obrazovky používají systémové Zpět bez potvrzovacího dialogu.
        if (!isMainMenuVisible()) return;

        // Okamžitě obnovíme ochrannou položku, aby prohlížeč neopustil stránku.
        armHistoryGuard();
        showModal();
    });

    noButton.addEventListener('click', hideModal);

    yesButton.addEventListener('click', () => {
        hideModal();
        // Uvolníme ochrannou položku. Samotné zavření panelu prohlížeč
        // JavaScriptem povolit nemusí; systémové Zpět pak může stránku opustit.
        allowExit = true;
        window.history.back();
    });

    modal.addEventListener('click', event => {
        if (event.target.classList.contains('exit-confirm__backdrop')) {
            hideModal();
        }
    });

    window.addEventListener('keydown', event => {
        if (event.key === 'Escape' && modalOpen) {
            event.preventDefault();
            hideModal();
        }
    });
}
