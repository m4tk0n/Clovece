// /js/profile.js
/**
 * Profil účtu a statistiky hráče.
 * Data účtu i změny profilu spravuje online API.
 */
import { api, bootstrapOnline, resetBootstrap } from './online/api.js';
import { refreshAccountMenu } from './auth.js';

let initialized = false;
const $ = id => document.getElementById(id);

function showMessage(message = '', type = '') {
    const output = $('profile-message');
    if (!output) return;
    output.textContent = message;
    output.className = 'auth-message' + (type ? ' ' + type : '');
}

function updateColorPreview() {
    const select = $('profile-color');
    const preview = $('profile-color-preview');
    if (select && preview) preview.style.background = select.value;
}

async function loadStatistics() {
    const stats = await api('profile_stats');
    $('profile-stat-games').textContent = String(stats.games);
    $('profile-stat-wins').textContent = String(stats.wins);
    $('profile-stat-losses').textContent = String(stats.losses);
    $('profile-stat-rate').textContent = stats.win_rate + ' %';
}

async function loadProfile() {
    const data = await bootstrapOnline();
    if (!data.account) {
        await window.showScreen?.('login');
        return;
    }
    $('profile-display-name').value = data.account.display_name || data.account.username || '';
    $('profile-color').value = data.account.color_preference || '#ff6b6b';
    updateColorPreview();
    showMessage();
    try {
        await loadStatistics();
    } catch (error) {
        $('profile-stat-games').textContent = '—';
        $('profile-stat-wins').textContent = '—';
        $('profile-stat-losses').textContent = '—';
        $('profile-stat-rate').textContent = '—';
        console.warn('Statistiky hráče se nepodařilo načíst:', error);
    }
}

export function initProfile() {
    if (!initialized) {
        initialized = true;
        $('profile-color')?.addEventListener('change', updateColorPreview);
        $('profile-form')?.addEventListener('submit', async event => {
            event.preventDefault();
            const button = $('profile-form')?.querySelector('button[type="submit"]');
            if (button) button.disabled = true;
            showMessage();
            try {
                const displayName = $('profile-display-name').value.trim();
                if (!displayName) throw new Error('Zadej zobrazované jméno.');
                await api('update_profile', {
                    display_name: displayName,
                    color: $('profile-color').value
                });
                resetBootstrap();
                await refreshAccountMenu();
                await loadProfile();
                showMessage('Profil byl uložen.', 'success');
            } catch (error) {
                showMessage(error.message || 'Profil se nepodařilo uložit.', 'error');
            } finally {
                if (button) button.disabled = false;
            }
        });
    }
    return loadProfile();
}
