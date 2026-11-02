/**
 * Navigace a načítání obrazovek na vyžádání.
 * Herní logika (přihlášení, místnosti a tahy) není součástí tohoto repozitáře.
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

async function showScreen(name) {
  const id = screenIds[name];
  if (!id) return;

  if (name !== 'main-menu' && typeof window.loadScreen === 'function') {
    const loaded = await window.loadScreen(name);
    if (!loaded) return;
  }

  document.querySelectorAll('.menu-screen, .game-screen').forEach(screen => {
    screen.classList.add('hidden');
  });
  const target = document.getElementById(id);
  if (target) target.classList.remove('hidden');
  else if (name === 'main-menu') document.getElementById('main-menu')?.classList.remove('hidden');
}

window.showScreen = showScreen;

function bindClick(id, callback) {
  document.addEventListener('click', event => {
    const element = event.target.closest('#' + id);
    if (element) callback(event, element);
  });
}

function bindNavigation() {
  bindClick('show-register', () => showScreen('register'));
  bindClick('show-login', () => showScreen('login'));
  bindClick('back-from-login', () => showScreen('main-menu'));
  bindClick('back-from-register', () => showScreen('main-menu'));
  bindClick('back-from-lobby', () => showScreen('main-menu'));
  bindClick('back-from-room', () => showScreen('lobby'));
  bindClick('create-room-btn-lobby', () => showScreen('player-selection'));
  bindClick('back-to-menu-btn', () => showScreen('main-menu'));
  bindClick('back-settings-btn', () => showScreen('main-menu'));
  bindClick('back-rules-btn', () => showScreen('main-menu'));

  bindClick('login-menu-btn', () => showScreen('login'));
  bindClick('register-menu-btn', () => showScreen('register'));
  bindClick('settings-btn', () => showScreen('settings'));
  bindClick('rules-btn', () => showScreen('rules'));
  bindClick('play-btn', () => showScreen('player-selection'));
  bindClick('create-room-btn', () => showScreen('lobby'));
  bindClick('join-room-btn', () => showScreen('lobby'));

  const joinFromInput = () => {
    const roomCode = document.getElementById('room-code-input')?.value.trim();
    if (roomCode && typeof window.joinRoom === 'function') window.joinRoom(roomCode);
  };
  bindClick('join-room-btn-lobby', joinFromInput);
  document.addEventListener('keydown', event => {
    if (event.target?.id === 'room-code-input' && event.key === 'Enter') {
      event.preventDefault();
      joinFromInput();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindNavigation, { once: true });
} else {
  bindNavigation();
}
