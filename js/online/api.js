/**
 * Online API klient a anonymní identita.
 * Bootstrap i CSRF token jsou sdílené pouze uvnitř online části.
 */
export const API_URL = 'online-api.php';
let csrfToken = '';
let bootstrapPromise = null;

export function bootstrapOnline() {
    if (!bootstrapPromise) {
        bootstrapPromise = (async () => {
            const response = await fetch(API_URL + '?action=bootstrap', {
                credentials: 'same-origin',
                cache: 'no-store'
            });
            const data = await response.json();
            if (!response.ok || data.success !== true) {
                throw new Error(data.error || 'Nepodařilo se připravit anonymní identitu.');
            }
            csrfToken = data.csrf_token || '';
            if (!csrfToken) throw new Error('Server neposlal bezpečnostní token.');
            return data;
        })().catch(error => {
            bootstrapPromise = null;
            throw error;
        });
    }
    return bootstrapPromise;
}

export async function api(action, values = {}) {
    await bootstrapOnline();
    if (!csrfToken) throw new Error('Online identita není připravená. Obnov stránku.');
    const body = new URLSearchParams({ action, ...values });
    if (csrfToken) body.set('csrf_token', csrfToken);

    const response = await fetch(API_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body
    });

    let result;
    try {
        result = await response.json();
    } catch {
        throw new Error('Server vrátil neplatnou odpověď.');
    }

    if (!response.ok || result.success !== true) {
        throw new Error(result.error || 'Požadavek se nepodařilo dokončit.');
    }
    return result;
}
