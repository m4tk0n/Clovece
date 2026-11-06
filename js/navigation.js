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
    game: 'game-screen'
};

const screenFiles = {
    login: 'login',
    register: 'register',
    lobby: 'lobby',
    room: 'room',
    'player-selection': 'player-selection',
    settings: 'settings',
    rules: 'rules',
    game: 'game'
};

const screenLoads = new Map();
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
    bindClick('create-room-btn', openLocalGame);
    bindClick('login-menu-btn', () => void showScreen('login'));
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
            'back-rules-btn': 'main-menu'
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
}
