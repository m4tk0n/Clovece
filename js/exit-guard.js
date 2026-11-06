/**
 * Ochrana před nechtěným opuštěním celé stránky.
 * beforeunload se spustí pouze při skutečném opuštění dokumentu,
 * nikoli při přechodech mezi interními obrazovkami aplikace.
 *
 * Text potvrzení určuje prohlížeč a nelze jej spolehlivě přepsat.
 */
export function initExitGuard() {
    let hasUserInteracted = false;

    const markInteraction = () => {
        hasUserInteracted = true;
    };

    window.addEventListener('pointerdown', markInteraction, { once: true, capture: true });
    window.addEventListener('keydown', markInteraction, { once: true, capture: true });
    window.addEventListener('beforeunload', event => {
        if (!hasUserInteracted) return;

        event.preventDefault();
        // Vyžadováno pro zobrazení nativního potvrzení v podporovaných prohlížečích.
        event.returnValue = '';
    });
}
