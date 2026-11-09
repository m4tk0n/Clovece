// /js/online/notifications.js
/**
 * Jednotné hlášení chyb a stavů v online části.
 */
export function notify(message) {
    const toast = $('toast');
    const target = $('toast-message');
    if (toast && target) {
        target.textContent = message;
        toast.classList.remove('hidden');
        clearTimeout(toast._hideTimer);
        toast._hideTimer = setTimeout(() => toast.classList.add('hidden'), 3200);
    } else {
        window.alert(message);
    }
}
