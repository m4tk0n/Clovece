// /styling/js/menu.js
/**
 * Samostatná navigace vývojového menu.
 * Herní engine, desky, figurky a herní CSS se z tohoto modulu nenačítají.
 */

const SCREEN_CONFIG = Object.freeze({
    login:       { id: 'login-screen',       file: 'login',       css: ['css/10_auth.css'] },
    register:    { id: 'register-screen',    file: 'register',    css: ['css/10_auth.css'] },
    lobby:       { id: 'lobby-screen',       file: 'lobby',       css: ['css/14_online.css'] },
    room:        { id: 'room-screen',        file: 'room',        css: ['css/14_online.css'] },
    settings:    { id: 'settings-screen',    file: 'settings',    css: ['css/12_settings.css'] },
    rules:       { id: 'rules-screen',       file: 'rules',       css: ['css/13_rules.css'] },
    'local-games': { id: 'local-games-screen', file: 'local-games', css: ['css/15_local-games.css'] },
    profile:     { id: 'profile-screen',     file: 'profile',     css: ['css/10_auth.css', 'css/11_profile.css'] }
});

const loadedScreens = new Map();
let screenCssVersions = null;
const loadedStyles = new Map();
let navigationToken = 0;
let authModulePromise = null;
let profileModulePromise = null;
let settingsModulePromise = null;

const $ = id => document.getElementById(id);

function showToast(message) {
    const toast = $('toast');
    const target = $('toast-message');
    if (!toast || !target) return;
    target.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(toast._timer);
    toast._timer = window.setTimeout(() => toast.classList.add('hidden'), 2600);
}

function loadStyle(path) {
    if (loadedStyles.has(path)) return loadedStyles.get(path);
    if (!screenCssVersions) {
        try { screenCssVersions = JSON.parse(document.body.dataset.screenCssVersions || '{}'); }
        catch { screenCssVersions = {}; }
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = path + '?v=' + encodeURIComponent(screenCssVersions[path] || 1);
    link.dataset.menuStyle = path;
    const promise = new Promise((resolve, reject) => {
        link.addEventListener('load', resolve, { once: true });
        link.addEventListener('error', () => {
            loadedStyles.delete(path);
            link.remove();
            reject(new Error('Nepodařilo se načíst styl ' + path));
        }, { once: true });
    });
    loadedStyles.set(path, promise);
    document.head.append(link);
    return promise;
}

async function prepareStyles(name) {
    const required = SCREEN_CONFIG[name]?.css || [];
    await Promise.all(required.map(loadStyle));
    for (const [path] of loadedStyles) {
        if (!required.includes(path)) {
            document.querySelector('link[data-menu-style="' + path + '"]')?.remove();
            loadedStyles.delete(path);
        }
    }
}

export async function loadMenuScreen(name) {
    const config = SCREEN_CONFIG[name];
    if (!config) throw new Error('Neznámá obrazovka: ' + name);
    const existing = $(config.id);
    if (existing) return existing;
    if (!loadedScreens.has(name)) {
        const request = fetch('screen.php?screen=' + encodeURIComponent(config.file), {
            credentials: 'same-origin'
        }).then(async response => {
            if (!response.ok) throw new Error('Načtení obrazovky selhalo (' + response.status + ').');
            const html = await response.text();
            const template = document.createElement('template');
            template.innerHTML = html;
            $('screen-container').append(template.content);
            const target = $(config.id);
            if (!target) throw new Error('V HTML chybí #' + config.id);
            return target;
        }).catch(error => {
            loadedScreens.delete(name);
            throw error;
        });
        loadedScreens.set(name, request);
    }
    return loadedScreens.get(name);
}

export async function showMenuScreen(name) {
    const token = ++navigationToken;
    const target = name === 'main-menu' ? $('main-menu') : await loadMenuScreen(name);
    await prepareStyles(name);
    if (token !== navigationToken) return false;

    document.querySelectorAll('.menu-screen').forEach(screen => {
        screen.classList.toggle('hidden', screen !== target);
    });
    window.scrollTo(0, 0);
    return true;
}
window.showScreen = showMenuScreen;

async function ensureAuth() {
    if (!authModulePromise) {
        authModulePromise = import('../../js/auth.js').then(module => {
            module.initAuth();
            return module;
        });
    }
    return authModulePromise;
}

async function openSettings() {
    await loadMenuScreen('settings');
    await prepareStyles('settings');
    if (!settingsModulePromise) settingsModulePromise = import('../../js/settings.js');
    const module = await settingsModulePromise;
    module.initSettings();
    await showMenuScreen('settings');
}

async function openProfile() {
    await loadMenuScreen('profile');
    await prepareStyles('profile');
    if (!profileModulePromise) profileModulePromise = import('../../js/profile.js');
    await showMenuScreen('profile');
    const module = await profileModulePromise;
    await module.initProfile();
}

async function openGamesList() {
    await showMenuScreen('local-games');
    try {
        const online = await import('./online.js');
        await online.initOnline({ gamesContainerId: 'online-games-list' });
    } catch (error) {
        console.error('Seznam online her se nepodařilo načíst:', error);
        showToast('Seznam rozehraných her se nepodařilo načíst.');
    }
}

function closeAccountMenu() {
    $('account-menu')?.classList.add('hidden');
    $('account-avatar-btn')?.setAttribute('aria-expanded', 'false');
}

function bindMainMenu() {
    $('play-btn')?.addEventListener('click', () => {
        showToast('Výběr hráčů a nastavení hry doplníme samostatně.');
    });
    $('create-room-btn')?.addEventListener('click', openGamesList);
    $('join-room-btn')?.addEventListener('click', async () => {
        await showMenuScreen('lobby');
        try {
            const online = await import('./online.js');
            await online.initOnline();
        } catch (error) {
            console.error('Online lobby se nepodařilo načíst:', error);
            showToast('Online lobby se nepodařilo načíst.');
        }
    });
    $('settings-btn')?.addEventListener('click', () => void openSettings());
    $('rules-btn')?.addEventListener('click', () => void showMenuScreen('rules'));
    $('login-menu-btn')?.addEventListener('click', () => void showMenuScreen('login'));

    const avatar = $('account-avatar-btn');
    avatar?.addEventListener('click', event => {
        event.stopPropagation();
        const opening = $('account-menu')?.classList.contains('hidden');
        $('account-menu')?.classList.toggle('hidden', !opening);
        avatar.setAttribute('aria-expanded', opening ? 'true' : 'false');
    });

    document.addEventListener('click', event => {
        if (!event.target.closest('#auth-buttons')) closeAccountMenu();
        const item = event.target.closest('[data-account-action]');
        if (!item) return;
        event.preventDefault();
        const action = item.dataset.accountAction;
        closeAccountMenu();
        if (action === 'profile') void openProfile();
        if (action === 'games') void openGamesList();
        if (action === 'stats') {
            void openProfile().then(() => $('profile-statistics')?.scrollIntoView({ block: 'start' }));
        }
        if (action === 'settings') void openSettings();
        if (action === 'logout') void ensureAuth().then(() => window.logout?.());
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeAccountMenu();
    });
}

function bindScreenActions() {
    const container = $('screen-container');
    container.addEventListener('keydown', event => {
        if (event.target.id === 'room-code-input' && event.key === 'Enter') {
            event.preventDefault();
            void window.joinRoom?.(event.target.value.trim());
        }
    });
    container.addEventListener('click', event => {
        const button = event.target.closest('button[id]');
        if (!button) return;
        const routes = {
            'show-register': 'register',
            'show-login': 'login',
            'back-from-login': 'main-menu',
            'back-from-register': 'main-menu',
            'back-from-lobby': 'main-menu',
            'back-from-room': 'lobby',
            'back-settings-btn': 'main-menu',
            'back-rules-btn': 'main-menu',
            'back-local-games-btn': 'main-menu',
            'back-profile-btn': 'main-menu'
        };
        const destination = routes[button.id];
        if (destination) void showMenuScreen(destination);
        if (button.id === 'join-room-btn-lobby') {
            const value = $('room-code-input')?.value.trim();
            if (value) void window.joinRoom?.(value);
        }
    });
}

async function init() {
    bindMainMenu();
    bindScreenActions();
    await ensureAuth().catch(error => console.warn('Účet se nepodařilo inicializovat:', error));
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void init(), { once: true });
} else {
    void init();
}
