/**
 * Potvrzení opuštění aplikace systémovým tlačítkem Zpět.
 * Ochranná položka historie se spravuje pouze v paměti aktuální stránky.
 */
export function initExitGuard() {
    const mainMenu = document.getElementById('main-menu');
    const modal = document.getElementById('exit-confirm');
    const yesButton = document.getElementById('exit-confirm-yes');
    const noButton = document.getElementById('exit-confirm-no');

    if (!mainMenu || !modal || !yesButton || !noButton) return;

    const isMainMenuVisible = () => !mainMenu.classList.contains('hidden');
    let modalOpen = false;
    let guardArmed = false;
    let allowExit = false;

    const reportGuardState = reason => {
        window.dispatchEvent(new CustomEvent('clovece:debug-exit-guard', {
            detail: {
                active: guardArmed && isMainMenuVisible(),
                armed: guardArmed,
                mainMenuVisible: isMainMenuVisible(),
                modalOpen,
                reason
            }
        }));
    };

    const showModal = () => {
        if (modalOpen) return;
        modalOpen = true;
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
        noButton.focus();
        reportGuardState('Otevřeno potvrzení opuštění');
    };

    const hideModal = () => {
        modalOpen = false;
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
        reportGuardState('Potvrzení zavřeno');
    };

    // Každé načtení stránky dostane vlastní ochrannou položku.
    // Nespoléháme na history.state, který může přežít obnovení stránky.
    const armHistoryGuard = () => {
        if (!isMainMenuVisible() || guardArmed) return;

        window.history.pushState(
            { cloveceExitGuard: true },
            '',
            window.location.href
        );
        guardArmed = true;
        reportGuardState('Ochrana historie aktivována');
    };

    window.addEventListener('clovece:main-menu-shown', armHistoryGuard);
    armHistoryGuard();
    reportGuardState('Inicializace Exit Guard');

    // Změna viditelnosti menu mění skutečnou účinnost ochrany.
    if (window.MutationObserver) {
        const menuObserver = new MutationObserver(() => {
            reportGuardState(isMainMenuVisible()
                ? 'Hlavní menu je viditelné'
                : 'Hlavní menu není viditelné');
        });
        menuObserver.observe(mainMenu, { attributes: true, attributeFilter: ['class'] });
    }

    window.addEventListener('popstate', () => {
        guardArmed = false;
        reportGuardState('Zachyceno systémové Zpět');

        if (allowExit) {
            allowExit = false;
            reportGuardState('Povolen odchod uživatelem');
            return;
        }

        // Na ostatních obrazovkách systémové Zpět funguje běžně.
        if (!isMainMenuVisible()) {
            reportGuardState('Mimo hlavní menu – ochrana se neuplatňuje');
            return;
        }

        // Znovu vložíme ochranu ještě před zobrazením potvrzení.
        armHistoryGuard();
        showModal();
    });

    noButton.addEventListener('click', hideModal);

    yesButton.addEventListener('click', () => {
        hideModal();
        allowExit = true;
        guardArmed = false;
        reportGuardState('Uživatel potvrdil opuštění');
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
