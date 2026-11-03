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

    document.querySelectorAll('.menu-screen, .game-screen').forEach(screen => {
        screen.classList.add('hidden');
    });

    document.getElementById(id)?.classList.remove('hidden');
}

window.showScreen = showScreen;

function bindClick(id, callback) {
    const element = document.getElementById(id);
    if (element) element.addEventListener('click', callback);
}

export function initNavigation() {
    bindClick('show-register', () => showScreen('register'));
    bindClick('show-login', () => showScreen('login'));
    bindClick('back-from-login', () => showScreen('main-menu'));
    bindClick('back-from-register', () => showScreen('main-menu'));
    bindClick('back-from-lobby', () => showScreen('main-menu'));
    bindClick('back-from-room', () => showScreen('lobby'));

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

