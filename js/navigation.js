/**
 * Navigace mezi obrazovkami.
 * HTML jednotlivých obrazovek se načítá samostatně až při první návštěvě.
 */

const screenIds = {
    'main-menu': 'main-menu',
    login: 'login-screen',
    register: 'register-screen',
    lobby: 'lobby-screen',
    room: 'room-screen',
    'player-selection': 'player-selection',
    settings: 'settings-screen',
    rules: 'rules-screen',
    game: 'game-screen',
    'local-games': 'local-games-screen',
    profile: 'profile-screen'
};

const screenFiles = {
    login: 'login',
    register: 'register',
    lobby: 'lobby',
    room: 'room',
    'player-selection': 'player-selection',
    settings: 'settings',
    rules: 'rules',
    game: 'game',
    'local-games': 'local-games',
    profile: 'profile'
};

const screenLoads = new Map();
const screenStyleLinks = new Map();

const screenStyles = {
    login: ['css/components-auth.css'],
    register: ['css/components-auth.css'],
    lobby: ['css/components-online.css'],
    room: ['css/components-online.css'],
    'player-selection': ['css/components-player-selection.css'],
    settings: ['css/components-settings.css'],
    rules: ['css/components-rules.css'],
    game: ['css/components-game.css', 'css/components-chat.css', 'css/game-premium.css', 'css/animations.css'],
    'local-games': ['css/components-local-games.css'],
    profile: ['css/components-auth.css', 'css/components-profile.css']
};

let cssAssetVersions = null;

function getCssAssetVersion(path) {
    if (!cssAssetVersions) {
        try {
            cssAssetVersions = JSON.parse(document.body.dataset.cssVersions || '{}');
        } catch (error) {
            console.warn('Verze CSS souborů se nepodařilo načíst:', error);
            cssAssetVersions = {};
        }
    }
    return cssAssetVersions[path] || 1;
}

async function ensureStylesheet(path) {
    if (screenStyleLinks.has(path)) return screenStyleLinks.get(path);

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = path + '?v=' + encodeURIComponent(getCssAssetVersion(path));
    link.dataset.screenStylesheet = path;

    const loaded = new Promise((resolve, reject) => {
        link.addEventListener('load', resolve, { once: true });
        link.addEventListener('error', () => {
            screenStyleLinks.delete(path);
            link.remove();
            reject(new Error('Nepodařilo se načíst CSS: ' + path));
        }, { once: true });
    });

    screenStyleLinks.set(path, loaded);
    document.head.append(link);
    return loaded;
}

function releaseStylesheet(path) {
    document.querySelector('link[data-screen-stylesheet="' + path + '"]')?.remove();
    screenStyleLinks.delete(path);
}

async function prepareScreenStyles(name) {
    const required = screenStyles[name] || [];
    for (const path of screenStyleLinks.keys()) {
        if (!required.includes(path)) releaseStylesheet(path);
    }
    await Promise.all(required.map(ensureStylesheet));
}

let navigationRequest = 0;

export async function loadScreen(name) {
    const id = screenIds[name];
    if (!id) throw new Error('Neznámá obrazovka: ' + name);

    const existing = document.getElementById(id);
    if (existing) return existing;
    if (name === 'main-menu') return null;

    if (!screenLoads.has(name)) {
        const container = document.getElementById('screen-container');
        if (!container) throw new Error('Chybí kontejner obrazovek.');

        const request = fetch('screen.php?screen=' + encodeURIComponent(screenFiles[name]), {
            credentials: 'same-origin'
        }).then(async response => {
            if (!response.ok) {
                throw new Error('Načtení obrazovky ' + name + ' selhalo (' + response.status + ').');
            }
            const html = await response.text();
            const template = document.createElement('template');
            template.innerHTML = html;
            container.append(template.content);

            const target = document.getElementById(id);
            if (!target) throw new Error('V načteném HTML chybí #' + id + '.');
            return target;
        }).catch(error => {
            screenLoads.delete(name);
            throw error;
        });

        screenLoads.set(name, request);
    }

    return screenLoads.get(name);
}

export async function showScreen(name) {
    const id = screenIds[name];
    if (!id) return false;

    const requestId = ++navigationRequest;
    let target;

    try {
        target = await loadScreen(name);
    } catch (error) {
        console.error('Obrazovku se nepodařilo načíst:', error);
        window.alert('Obrazovku se nepodařilo načíst. Obnov stránku a zkus to znovu.');
        return false;
    }

    // Styly se načítají až podle cílové obrazovky.
    try {
        await prepareScreenStyles(name);
    } catch (error) {
        console.error('Styly obrazovky se nepodařilo načíst:', error);
        window.alert('Vzhled obrazovky se nepodařilo načíst. Obnov stránku a zkus to znovu.');
        return false;
    }

    // Pokud uživatel během načítání přešel jinam, starší požadavek nesmí změnit obrazovku.
    if (requestId !== navigationRequest) return false;

    if (!target) target = document.getElementById(id);
    if (!target) return false;

    const gameScreen = document.getElementById('game-screen');
    const playerSelection = document.getElementById('player-selection');
    const leavingGame = name !== 'game' && (
        (gameScreen && !gameScreen.classList.contains('hidden')) ||
        (playerSelection && !playerSelection.classList.contains('hidden'))
    );
    if (leavingGame) {
        window.dispatchEvent(new Event('clovece:game-exit'));
    }

    const screens = document.querySelectorAll('.menu-screen, .game-screen');
    const alreadyActive = !target.classList.contains('hidden') &&
        [...screens].every(screen =>
            screen === target || screen.classList.contains('hidden')
        );

    if (alreadyActive) return true;

    screens.forEach(screen => {
        if (screen !== target) screen.classList.add('hidden');
    });
    target.classList.remove('hidden');
    return true;
}

window.showScreen = showScreen;

function bindClick(id, callback) {
    const element = document.getElementById(id);
    if (element) element.addEventListener('click', callback);
}

export function initNavigation() {
    let localGameModulePromise = null;
    let localGameInitialized = false;

    const ensureLocalGame = async () => {
        await loadScreen('player-selection');
        if (!localGameModulePromise) {
            localGameModulePromise = import('./app.js');
        }
        const gameModule = await localGameModulePromise;
        if (!localGameInitialized) {
            gameModule.initGame();
            localGameInitialized = true;
        }
        return gameModule;
    };

    const openLocalGame = async () => {
        try {
            const gameModule = await ensureLocalGame();
            await gameModule.openPlayerSelection();
        } catch (error) {
            console.error('Herní modul se nepodařilo načíst:', error);
            window.alert('Herní část se nepodařilo načíst. Obnov stránku a zkus to znovu.');
        }
    };

    const openProfile = async () => {
        try {
            await loadScreen('profile');
            const profileModule = await import('./profile.js');
            await showScreen('profile');
            await profileModule.initProfile();
        } catch (error) {
            console.error('Profil se nepodařilo načíst:', error);
            window.alert('Profil se nepodařilo načíst. Obnov stránku a zkus to znovu.');
        }
    };

    const openSettings = async () => {
        try {
            await loadScreen('settings');
            const settingsModule = await import('./settings.js');
            settingsModule.initSettings();
            await showScreen('settings');
        } catch (error) {
            console.error('Nastavení se nepodařilo načíst:', error);
            window.alert('Nastavení se nepodařilo načíst. Obnov stránku a zkus to znovu.');
        }
    };

    bindClick('play-btn', openLocalGame);
    bindClick('create-room-btn', async () => {
        const opened = await showScreen('local-games');
        if (!opened) return;
        try {
            const onlineModule = await import('./online.js');
            await onlineModule.initOnline({ gamesContainerId: 'online-games-list' });
        } catch (error) {
            console.error('Seznam online her se nepodařilo načíst:', error);
            const list = document.getElementById('online-games-list');
            if (list) list.textContent = 'Seznam online her se nepodařilo načíst.';
        }
    });
    void import('./auth.js').then(({ initAuth }) => initAuth()).catch(error => {
        console.error('Autentizaci se nepodařilo inicializovat:', error);
    });

    bindClick('login-menu-btn', () => void showScreen('login'));
    const accountAvatar = document.getElementById('account-avatar-btn');
    const accountMenu = document.getElementById('account-menu');
    const closeAccountMenu = () => {
        accountMenu?.classList.add('hidden');
        accountAvatar?.setAttribute('aria-expanded', 'false');
    };
    accountAvatar?.addEventListener('click', event => {
        event.stopPropagation();
        const opening = accountMenu?.classList.contains('hidden');
        accountMenu?.classList.toggle('hidden', !opening);
        accountAvatar.setAttribute('aria-expanded', opening ? 'true' : 'false');
    });
    document.addEventListener('click', event => {
        if (!event.target.closest('#auth-buttons')) closeAccountMenu();
        const item = event.target.closest('[data-account-action]');
        if (!item) return;
        event.preventDefault();
        const action = item.dataset.accountAction;
        closeAccountMenu();
        if (action === 'profile') void openProfile();
        if (action === 'games') {
            void (async () => {
                const opened = await showScreen('local-games');
                if (!opened) return;
                try {
                    const onlineModule = await import('./online.js');
                    await onlineModule.initOnline({ gamesContainerId: 'online-games-list' });
                } catch (error) {
                    console.error('Seznam her se nepodařilo načíst:', error);
                }
            })();
        }
        if (action === 'stats') {
            void (async () => {
                await openProfile();
                document.getElementById('profile-statistics')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            })();
        }
        if (action === 'settings') void openSettings();
        if (action === 'logout' && typeof window.logout === 'function') void window.logout();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeAccountMenu();
    });
    bindClick('register-menu-btn', () => void showScreen('register'));

    window.addEventListener('clovece:game-exit', () => {
        // Importní cache prohlížeče nelze programově vymazat.
        localGameModulePromise = null;
    });

    // Tlačítka uvnitř načítaných obrazovek obsluhujeme delegovaně.
    const container = document.getElementById('screen-container');
    container?.addEventListener('click', event => {
        const button = event.target.closest('button[id]');
        if (!button) return;

        const destinations = {
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
        const destination = destinations[button.id];
        if (destination) void showScreen(destination);
    });

    let onlineInitPromise = null;
    const openOnlineLobby = async () => {
        try {
            // Lobby se načítá samostatně; místnost až při vytvoření nebo připojení ke hře.
            await loadScreen('lobby');
            await showScreen('lobby');

            if (!onlineInitPromise) {
                onlineInitPromise = import('./online.js')
                    .then(module => module.initOnline())
                    .catch(error => {
                        onlineInitPromise = null;
                        console.error('Online lobby se nepodařilo načíst:', error);
                        window.alert('Online část se nepodařilo načíst. Obnov stránku a zkus to znovu.');
                    });
            }
            await onlineInitPromise;
        } catch (error) {
            console.error('Online obrazovky se nepodařilo načíst:', error);
            window.alert('Online část se nepodařilo načíst. Obnov stránku a zkus to znovu.');
        }
    };

    bindClick('join-room-btn', openOnlineLobby);
    if (new URLSearchParams(window.location.search).has('invite')) {
        void openOnlineLobby();
    }

    bindClick('settings-btn', openSettings);
    bindClick('rules-btn', () => void showScreen('rules'));

    const logoutButton = document.getElementById('logout-btn');
    logoutButton?.addEventListener('click', () => {
        if (typeof window.logout === 'function') window.logout();
        else console.warn('Funkce logout() zatím není v projektu implementována.');
    });

    // Připojení přes kód/odkaz v lobby.
    const joinRoom = () => {
        const roomCodeInput = document.getElementById('room-code-input');
        const roomCode = roomCodeInput?.value.trim();
        if (!roomCode) return;
        if (typeof window.joinRoom === 'function') window.joinRoom(roomCode);
        else console.warn('Funkce joinRoom() zatím není v projektu implementována.');
    };
    container?.addEventListener('click', event => {
        if (event.target.closest('#join-room-btn-lobby')) joinRoom();
    });
    container?.addEventListener('keydown', event => {
        if (event.target.id === 'room-code-input' && event.key === 'Enter') {
            event.preventDefault();
            joinRoom();
        }
    });

    // Výuková adresa rovnou otevře nastavení místní hry; hráč zvolí AI a pravidla.
    if (new URLSearchParams(window.location.search).get('debug') === 'training') {
        void openLocalGame();
    }
}
