/**
 * Člověče, nezlob se! – herní rozhraní a lokální AI.
 * Stav hry spravuje game-engine.js; vykreslení game-board.js.
 */
import { createGame, getValidMoves, getForcedMove, movePiece, rollDice, advanceTurn, chooseAIMove } from './game-engine.js';
import { renderBoard, ensureModeStyles, getBoardView } from './game-board.js';
import { showScreen, loadScreen } from './navigation.js';
import { settings } from './settings.js';
import { getPlayerSetup, initPlayerSetup, updateSetup, getExtendedRules, setExtendedRulesForTest } from './player-setup.js';
import { createGameView } from './game-view.js';
import { createGameLog } from './game-log.js';
import { createTurnController } from './game-turn.js';

// Zvukový modul se načte až při skutečném spuštění hry.
let audioModule = null;
let audioModulePromise = null;

async function ensureAudioModule() {
    if (!audioModulePromise) {
        audioModulePromise = import('./audio.js')
            .then(module => {
                module.initAudio();
                module.setSoundEffectsEnabled(settings.sfx);
                audioModule = module;
                return module;
            })
            .catch(error => {
                audioModulePromise = null;
                console.error('Zvukový modul se nepodařilo načíst:', error);
                return null;
            });
    }
    return audioModulePromise;
}

const $ = id => document.getElementById(id);
// Kostka je samostatný modul; stáhne se až při prvním hodu.
async function animateDice(value) {
    const diceModule = await import('./dice.js');
    return diceModule.animateDice(value, settings);
}

function isPaused() {
    return !$('game-menu')?.classList.contains('hidden');
}

function toast(message) {
    const element = $('toast');
    const target = $('toast-message');
    if (!element || !target) return;
    target.textContent = message;
    element.classList.remove('hidden');
    clearTimeout(element._hideTimer);
    element._hideTimer = setTimeout(() => element.classList.add('hidden'), 2800);
}

function play(id) {
    if (typeof window.playSound === 'function') window.playSound(id);
}

let game = null;
const { showGame, renderPlayers, updateTurnControls } = createGameView({
    getGame: () => game,
    renderBoard
});


const { resetGameLog, updateStartLog, renderChat, addChatEntry, addGameLogEntry, sendChatMessage } = createGameLog(() => game);

const turnController = createTurnController({
    getValidMoves,
    getForcedMove,
    movePiece,
    rollDice,
    advanceTurn,
    chooseAIMove,
    settings,
    animateDice,
    isPaused,
    toast,
    play,
    showGame,
    updateStartLog,
    addGameLogEntry
});



async function startGame() {
    try {
        await loadScreen('game');
        const { initGameScreen } = await import('./game-screen.js');
        initGameScreen({
            turnController,
            getAudioModule: () => audioModule,
            settings,
            sendChatMessage,
            setGame: value => { game = value; },
            showScreen,
            restartGame,
            toast
        });
    } catch (error) {
        console.error('Herní obrazovku se nepodařilo načíst:', error);
        toast('Herní obrazovku se nepodařilo načíst. Zkus to znovu.');
        return;
    }

    try {
        const setup = getPlayerSetup();
        game = createGame(setup.humanCount, setup.aiCount, setup.names, setup.colors, setup.selectedBoardSize, setup.extendedRules);
        turnController.setGame(game);
        game.phase = 'start-roll';
        game.currentPlayer = 0;
        game.startCandidates = game.players.map(player => player.id);
        game.startRolls = [[]];
        game.startWinner = null;
    } catch (error) {
        toast(error.message);
        return;
    }
    // Zvuk se načte až nyní – po potvrzení konfigurace a při vstupu do hry.
    await ensureAudioModule();

    turnController.resetForNewGame();
    resetGameLog();
    try {
        await ensureModeStyles(getBoardView());
    } catch (error) {
        console.error('Herní CSS se nepodařilo připravit:', error);
    }
    $('win-modal').classList.add('hidden');
    $('kick-modal').classList.add('hidden');
    await showScreen('game');
    showGame();
    turnController.continueGame();
}

function restartGame() {
    startGame();
    $('game-menu').classList.add('hidden');
}

export async function openPlayerSelection() {
    await loadScreen('player-selection');
    // Obrazovka se vkládá až při otevření, proto posluchače připojíme až po jejím načtení.
    initPlayerSetup();
    updateSetup();
    await showScreen('player-selection');
}

export function initGame() {
    $('start-game-btn')?.addEventListener('click', startGame);
    $('back-to-menu-btn')?.addEventListener('click', () => showScreen('main-menu'));
}


/**
 * Testovací režim používá stejný engine, renderer, kostku i tahový automat
 * jako běžná místní hra. Aktivuje se pouze na URL s ?test=1.
 */
export async function startTestGame() {
    await loadScreen('player-selection');
    initPlayerSetup();
    updateSetup();
    const setup = getPlayerSetup();
    await loadScreen('game');
    const { initGameScreen } = await import('./game-screen.js');
    initGameScreen({
        turnController,
        getAudioModule: () => audioModule,
        settings,
        sendChatMessage,
        setGame: value => { game = value; },
        showScreen,
        restartGame,
        toast
    });

    game = createGame(
        setup.humanCount,
        setup.aiCount,
        setup.names,
        setup.colors,
        setup.selectedBoardSize,
        setup.extendedRules
    );
    // V testovacím režimu hrají všichni účastníci automaticky.
    // Nemění se pravidla ani herní engine, pouze příznak řízení hráče.
    game.players.forEach(player => { player.isAI = true; });
    game.phase = 'start-roll';
    game.currentPlayer = 0;
    game.startCandidates = game.players.map(player => player.id);
    game.startRolls = [[]];
    game.startWinner = null;

    await ensureAudioModule();
    turnController.resetForNewGame();
    turnController.setGame(game);
    resetGameLog();
    await ensureModeStyles(getBoardView());
    $('win-modal')?.classList.add('hidden');
    $('kick-modal')?.classList.add('hidden');
    $('game-menu')?.classList.add('hidden');
    await showScreen('game');
    showGame();
    turnController.continueGame();
    return getTestGameState();
}

export function pauseTestGame() {
    if (!game) return false;
    turnController.stopAI();
    $('game-menu')?.classList.remove('hidden');
    return true;
}

export function resumeTestGame() {
    if (!game) return false;
    $('game-menu')?.classList.add('hidden');
    turnController.continueGame();
    return true;
}

export function stopTestGame() {
    turnController.stopAI();
    game = null;
    turnController.setGame(null);
    $('game-menu')?.classList.add('hidden');
    $('kick-modal')?.classList.add('hidden');
    $('win-modal')?.classList.add('hidden');
    showScreen('main-menu');
    return true;
}

export function getTestGameState() {
    if (!game) return null;
    return {
        phase: game.phase,
        diceValue: game.diceValue,
        rollSequence: game.testRollSequence || 0,
        currentPlayer: game.currentPlayer,
        currentPlayerName: game.players[game.currentPlayer]?.name ?? null,
        winner: game.winner,
        rules: { ...game.rules },
        boardSize: game.boardSize,
        players: game.players.map(player => ({ id: player.id, name: player.name, color: player.color, isAI: player.isAI })),
        pieces: game.pieces.map(group => group.pieces.map(piece => piece.steps))
    };
}

export function updateTestRules(rules) {
    setExtendedRulesForTest(rules);
    return getExtendedRules();
}

if (new URLSearchParams(window.location.search).get('test') === '1') {
    window.__cloveceTest = {
        start: startTestGame,
        pause: pauseTestGame,
        resume: resumeTestGame,
        stop: stopTestGame,
        state: getTestGameState,
        rules: getExtendedRules,
        setRules: updateTestRules
    };
}
