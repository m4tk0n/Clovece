/**
 * Aplikace načítá sekundární obrazovky až při první návštěvě.
 * Hlavní menu zůstává přímo v HTML kvůli rychlému vykreslení.
 */
import './navigation.js';

const screenFiles = {
  login: 'views/login-screen.html',
  register: 'views/register-screen.html',
  lobby: 'views/lobby-screen.html',
  room: 'views/room-screen.html',
  'player-selection': 'views/player-selection.html',
  settings: 'views/settings-screen.html',
  rules: 'views/rules-screen.html',
  game: 'views/game-screen.html',
  'game-overlays': 'views/game-overlays.html'
};

const loadedScreens = new Set();
const host = document.getElementById('screen-host');

export async function loadScreen(name) {
  const path = screenFiles[name];
  if (!path || !host) return false;
  if (loadedScreens.has(name)) return true;

  try {
    const response = await fetch(path, { headers: { 'X-Requested-With': 'fetch' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${path}`);
    const markup = await response.text();
    const template = document.createElement('template');
    template.innerHTML = markup;
    host.append(template.content);
    loadedScreens.add(name);
    return true;
  } catch (error) {
    console.error('Nepodařilo se načíst obrazovku:', name, error);
    return false;
  }
}

window.loadScreen = loadScreen;

// Médium se registruje až při první interakci; samotné obrazovky se načítají
// nezávisle až podle navigace.
let lazyMediaLoaded = false;
function loadOptionalModules() {
  if (lazyMediaLoaded) return;
  lazyMediaLoaded = true;
  import('./lazy-load.js').catch(error => console.error('Lazy media:', error));
}
window.addEventListener('pointerdown', loadOptionalModules, { once: true, passive: true });
window.addEventListener('keydown', loadOptionalModules, { once: true });
