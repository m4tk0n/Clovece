/**
 * Navigace mezi obrazovkami.
 * Zachovává původní obsluhu tlačítek z index.html.
 * Herní funkce showScreen(), logout() a joinRoom() musí dodat herní aplikace.
 */
function bindClick(id, callback) {
    const element = document.getElementById(id);
    if (element) element.addEventListener('click', callback);
}

function bindNavigation() {
    bindClick('show-register', () => showScreen('register'));
    bindClick('show-login', () => showScreen('login'));
    bindClick('back-from-login', () => showScreen('main-menu'));
    bindClick('back-from-register', () => showScreen('main-menu'));
    bindClick('back-from-lobby', () => showScreen('main-menu'));
    bindClick('back-from-room', () => showScreen('lobby'));
    bindClick('logout-btn', () => logout());
    bindClick('create-room-btn-lobby', () => showScreen('player-selection'));

    const joinButton = document.getElementById('join-room-btn-lobby');
    const roomCodeInput = document.getElementById('room-code-input');

    const joinFromInput = () => {
        const roomCode = roomCodeInput?.value.trim();
        if (roomCode) joinRoom(roomCode);
    };

    if (joinButton) joinButton.addEventListener('click', joinFromInput);

    if (roomCodeInput) {
        roomCodeInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                joinFromInput();
            }
        });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindNavigation, { once: true });
} else {
    bindNavigation();
}
