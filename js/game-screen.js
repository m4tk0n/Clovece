/**
 * Ovládání herní obrazovky lokální hry.
 * Modul se načítá až po otevření herní obrazovky.
 */
const $ = id => document.getElementById(id);
let gameScreenInitialized = false;

export function initGameScreen(deps) {
    const { turnController, getAudioModule, settings, sendChatMessage, setGame, showScreen, restartGame, toast } = deps;
    if (gameScreenInitialized) return;
    if (!$('game-screen')) throw new Error('Herní obrazovka není načtená.');
    gameScreenInitialized = true;

    $('roll-dice-btn')?.addEventListener('click', () => turnController.doRoll(false));

    const audioToggle = $('game-audio-toggle');
    const volumeSlider = $('game-volume');

    const syncAudioControls = () => {
        const state = getAudioModule()?.getAudioState() || { volume: 0.7, muted: false };
        if (volumeSlider) volumeSlider.value = String(Math.round(state.volume * 100));
        if (audioToggle) {
            const icon = audioToggle.querySelector('i');
            const isAudible = !state.muted && state.volume > 0;
            if (icon) icon.className = isAudible ? 'fas fa-volume-high' : 'fas fa-volume-xmark';
            audioToggle.setAttribute('aria-pressed', String(isAudible));
            audioToggle.setAttribute('aria-label', isAudible ? 'Vypnout zvuk' : 'Zapnout zvuk');
            audioToggle.title = isAudible ? 'Vypnout zvuk' : 'Zapnout zvuk';
        }
    };

    audioToggle?.addEventListener('click', () => {
        const audioModule = getAudioModule();
        if (!audioModule) return;
        audioModule.toggleMasterMute();
        syncAudioControls();
    });
    volumeSlider?.addEventListener('input', event => {
        const audioModule = getAudioModule();
        if (!audioModule) return;
        audioModule.setMasterVolume(Number(event.target.value) / 100);
        syncAudioControls();
    });
    syncAudioControls();

    // Kliknutím na výpis jej rozbalíme; kliknutí mimo něj jej opět sbalí.
    const chat = document.querySelector('#game-screen .game-chat');
    const chatMessages = $('chat-messages');
    if (chat && chatMessages) {
        chat.classList.remove('is-expanded');
        chatMessages.setAttribute('aria-expanded', 'false');
        document.addEventListener('click', event => {
            if (chatMessages.contains(event.target)) {
                const expanded = chat.classList.toggle('is-expanded');
                chatMessages.setAttribute('aria-expanded', String(expanded));
            } else if (chat.classList.contains('is-expanded')) {
                chat.classList.remove('is-expanded');
                chatMessages.setAttribute('aria-expanded', 'false');
            }
        });
    }

    $('game-container')?.addEventListener('click', event => turnController.onBoardClick(event));
    $('game-container')?.addEventListener('boardpiececlick', event => turnController.onBoardClick(event));
    $('chat-form')?.addEventListener('submit', event => {
        event.preventDefault();
        const input = $('chat-input');
        if (!input) return;
        sendChatMessage(input.value);
        input.value = '';
        input.focus();
    });
    $('close-kick-btn')?.addEventListener('click', turnController.closeKickModal);
    $('close-win-btn')?.addEventListener('click', () => {
        $('win-modal').classList.add('hidden');
        setGame(null);
        turnController.setGame(null);
        showScreen('main-menu');
    });
    $('menu-btn')?.addEventListener('click', () => {
        turnController.stopAI();
        const gameSpeedSelect = $('game-speed');
        if (gameSpeedSelect) gameSpeedSelect.value = settings.moveSpeed;
        $('game-menu').classList.remove('hidden');
    });
    $('resume-btn')?.addEventListener('click', () => {
        $('game-menu').classList.add('hidden');
        turnController.continueGame();
    });
    $('restart-btn')?.addEventListener('click', restartGame);
    $('quit-btn')?.addEventListener('click', () => {
        turnController.stopAI();
        $('game-menu').classList.add('hidden');
        setGame(null);
        turnController.setGame(null);
        showScreen('main-menu');
    });

    const gameSpeedSelect = $('game-speed');
    if (gameSpeedSelect) gameSpeedSelect.value = settings.moveSpeed;

    gameSpeedSelect?.addEventListener('change', event => {
        settings.moveSpeed = event.target.value === 'fast' ? 'fast' : 'normal';
        try {
            localStorage.setItem('clovece-settings', JSON.stringify(settings));
        } catch (error) {
            console.warn('Rychlost hry se nepodařilo uložit:', error);
        }
        toast('Rychlost pohybu figurek: ' + (settings.moveSpeed === 'fast' ? 'Rychlá' : 'Normální'));
    });
