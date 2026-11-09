// /js/settings.js
/**
 * Uživatelská nastavení hry.
 * Samostatný modul lze načíst z menu bez načtení herního enginu a rendereru.
 */
// Nastavení zvukových efektů se pouze uloží; audio.js patří až do spuštěné hry.

const $ = id => document.getElementById(id);

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem('clovece-settings') || '{}');
        return {
            moveSpeed: (saved.moveSpeed || saved.aiSpeed) === 'fast' ? 'fast' : 'normal',
            animations: saved.animations !== false,
            sfx: saved.sfx !== false
        };
    } catch (error) {
        console.warn('Nastavení se nepodařilo načíst:', error);
        return { moveSpeed: 'normal', animations: true, sfx: true };
    }
}


export const settings = loadSettings();
let initialized = false;

function showSettingsToast(message) {
    const toast = document.getElementById('toast');
    const target = document.getElementById('toast-message');
    if (!toast || !target) return;
    target.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(toast._hideTimer);
    toast._hideTimer = window.setTimeout(() => toast.classList.add('hidden'), 2800);
}

export function initSettings() {
    if (initialized) return;
    initialized = true;
    const aiSpeedSelect = $('ai-speed');
    const animationsToggle = $('animations-toggle');
    const sfxToggle = $('sfx-toggle');
    
    if (aiSpeedSelect) aiSpeedSelect.value = settings.moveSpeed;
    const gameSpeedSelect = $('game-speed');
    if (gameSpeedSelect) gameSpeedSelect.value = settings.moveSpeed;
    if (animationsToggle) animationsToggle.checked = settings.animations;
    if (sfxToggle) sfxToggle.checked = settings.sfx;
    
    const applyAnimationSetting = () => {
        document.documentElement.classList.toggle('animations-disabled', !settings.animations);
    };
    applyAnimationSetting();

    aiSpeedSelect?.addEventListener('change', event => {
        settings.moveSpeed = event.target.value === 'fast' ? 'fast' : 'normal';
        gameSpeedSelect && (gameSpeedSelect.value = settings.moveSpeed);
        try { localStorage.setItem('clovece-settings', JSON.stringify(settings)); }
        catch (error) { console.warn('Nastavení rychlosti pohybu se nepodařilo uložit:', error); }
    });
    animationsToggle?.addEventListener('change', event => {
        settings.animations = event.target.checked;
        applyAnimationSetting();
    });
    sfxToggle?.addEventListener('change', event => {
        settings.sfx = event.target.checked;
    });
    $('save-settings-btn')?.addEventListener('click', () => {
        settings.moveSpeed = aiSpeedSelect?.value === 'fast' ? 'fast' : 'normal';
        settings.animations = animationsToggle?.checked !== false;
        settings.sfx = sfxToggle?.checked !== false;
        applyAnimationSetting();

        try {
            localStorage.setItem('clovece-settings', JSON.stringify(settings));
        } catch (error) {
            console.warn('Nastavení se nepodařilo uložit:', error);
        }
        showSettingsToast('Nastavení uloženo.');
        if (typeof window.showScreen === 'function') window.showScreen('main-menu');
    });
}
