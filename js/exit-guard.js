/**
 * Potvrzení opuštění aplikace při systémovém tlačítku Zpět.
 * Vnitřní navigace aplikace zůstává beze změny.
 */
export function initExitGuard() {
    const modal = document.getElementById('exit-confirm-modal');
    const stayButton = document.getElementById('exit-stay-btn');
    const leaveButton = document.getElementById('exit-leave-btn');

    if (!modal || !stayButton || !leaveButton || !window.history?.pushState) return;

    let dialogOpen = false;
    let allowExit = false;

    const closeDialog = () => {
        dialogOpen = false;
        modal.classList.add('hidden');
    };

    const openDialog = () => {
        if (dialogOpen) return;
        dialogOpen = true;
        modal.classList.remove('hidden');
        stayButton.focus();
    };

    // Strážíme pouze odchod z webu; přechody mezi obrazovkami hry nemění historii.
    window.history.replaceState(
        { ...(window.history.state || {}), cloveceAppEntry: true },
        '',
        window.location.href
    );
    window.history.pushState(
        { ...(window.history.state || {}), cloveceExitGuard: true },
        '',
        window.location.href
    );

    window.addEventListener('popstate', () => {
        if (allowExit) return;

        // Vrátíme ochranný záznam, aby uživatel mohl volbu potvrdit nebo zrušit.
        window.history.pushState(
            { ...(window.history.state || {}), cloveceExitGuard: true },
            '',
            window.location.href
        );
        openDialog();
    });

    stayButton.addEventListener('click', closeDialog);

    leaveButton.addEventListener('click', () => {
        allowExit = true;
        closeDialog();

        // Přeskočíme ochranný i původní záznam aplikace a pokračujeme zpět mimo web.
        window.history.go(-2);
    });

    modal.addEventListener('keydown', event => {
        if (event.key === 'Escape' && dialogOpen) {
            event.preventDefault();
            closeDialog();
        }
    });
}
