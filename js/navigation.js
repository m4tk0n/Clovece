/**
 * Navigace mezi obrazovkami.
 * HTML všech obrazovek zůstává v index.html – nic se nenačítá přes fetch/AJAX.
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

export function showScreen(name) {
    const id = screenIds[name];
    if (!id) return;

    const target = document.getElementById(id);
    if (!target) return;
    const gameScreen = document.getElementById('game-screen');
    const leavingGame = name !== 'game' && gameScreen && !gameScreen.classList.contains('hidden');
    if (leavingGame) {
        window.dispatchEvent(new Event('clovece:game-exit'));
    }

    const screens = document.querySelectorAll('.menu-screen, .game-screen');
    const alreadyActive = !target.classList.contains('hidden') &&
        [...screens].every(screen =>
            screen === target || screen.classList.contains('hidden')
        );

    // Polling může showScreen() volat opakovaně. Aktivní obrazovku
    // v takovém případě vůbec neskrýváme ani znovu nezobrazujeme.
    if (alreadyActive) return;

    screens.forEach(screen => {
        if (screen !== target) screen.classList.add('hidden');
    });
    target.classList.remove('hidden');
}

window.showScreen = showScreen;

function bindClick(id, callback) {
    const element = document.getElementById(id);
    if (element) element.addEventListener('click', callback);
}

export function initNavigation() {
    let localGameModulePromise = null;
    let localGameInitialized = false;
    const openLocalGame = async () => {
        try {
            if (!localGameModulePromise) {
                localGameModulePromise = import('./app.js');
            }
            const gameModule = await localGameModulePromise;
            if (!localGameInitialized) {
                gameModule.initGame();
                localGameInitialized = true;
            }
            gameModule.openPlayerSelection();
        } catch (error) {
            console.error('Herní modul se nepodařilo načíst:', error);
            window.alert('Herní část se nepodařilo načíst. Obnov stránku a zkus to znovu.');
        }
    };
    bindClick('play-btn', openLocalGame);
    bindClick('create-room-btn', openLocalGame);
    window.addEventListener('clovece:game-exit', () => {
        // Uvolníme referenci na namespace; importní cache prohlížeče nelze programově vymazat.
        localGameModulePromise = null;
    });
    bindClick('show-register', () => showScreen('register'));
    bindClick('show-login', () => showScreen('login'));
    bindClick('back-from-login', () => showScreen('main-menu'));
    bindClick('back-from-register', () => showScreen('main-menu'));
    bindClick('back-from-lobby', () => showScreen('main-menu'));
    bindClick('back-from-room', () => showScreen('lobby'));
    bindClick('join-room-btn', () => showScreen('lobby'));
    bindClick('settings-btn', () => showScreen('settings'));
    bindClick('rules-btn', () => showScreen('rules'));

    const logoutButton = document.getElementById('logout-btn');
    logoutButton?.addEventListener('click', () => {
        if (typeof window.logout === 'function') window.logout();
        else console.warn('Funkce logout() zatím není v projektu implementována.');
    });

    const joinButton = document.getElementById('join-room-btn-lobby');
    const roomCodeInput = document.getElementById('room-code-input');

    const joinRoom = () => {
        const roomCode = roomCodeInput?.value.trim();
        if (!roomCode) return;
        if (typeof window.joinRoom === 'function') window.joinRoom(roomCode);
        else console.warn('Funkce joinRoom() zatím není v projektu implementována.');
    };

    joinButton?.addEventListener('click', joinRoom);
    roomCodeInput?.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            joinRoom();
        }
    });
}

