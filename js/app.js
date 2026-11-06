/**
 * Člověče, nezlob se! – herní rozhraní a lokální AI.
 * Stav hry spravuje game-engine.js; vykreslení game-board.js.
 */
import {
    createGame, rollDice, getValidMoves, getForcedMove, movePiece,
    advanceTurn, chooseAIMove
} from './game-engine.js';
import { renderBoard, ensureModeStyles, ensureGameStyles, getBoardView } from './game-board.js';
import { showScreen } from './navigation.js';
import { setMasterVolume, toggleMasterMute, getAudioState } from './audio.js';
import { settings } from './settings.js';
import { getPlayerSetup, initPlayerSetup, updateSetup } from './player-setup.js';
import { createGameView } from './game-view.js';
import { createGameLog } from './game-log.js';

const $ = id => document.getElementById(id);
const speedDelay = () => 950;

let aiTimer = null;
let modalOpen = false;
let moveAnimating = false;

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


function openKickModal(move) {
    modalOpen = true;
    const player = game.players[move.playerId];
    $('kicker-piece').style.background = player.color;
    $('kicked-piece').style.background = move.captured.color;
    $('kick-title').textContent = move.captured.ownPiece ? 'VÝMĚNA NA STARTU' : 'PŘESNÝ ZÁSAH!';
    $('kick-message').textContent = move.captured.ownPiece
        ? 'Při nasazení nové figurky se vaše původní figurka vrátila do základny.'
        : player.name + ' poslal hráče ' + move.captured.playerName + ' zpět do domečku.';
    $('kick-modal').classList.remove('hidden');
    play('kick-sound');
}

function closeKickModal() {
    $('kick-modal').classList.add('hidden');
    modalOpen = false;
    showGame();
    continueGame();
}

function snapshotPieceSteps() {
    return game.pieces.map(group => group.pieces.map(piece => piece.steps));
}

function restorePieceSteps(snapshot) {
    game.pieces.forEach((group, playerId) => group.pieces.forEach((piece, pieceId) => {
        piece.steps = snapshot[playerId][pieceId];
    }));
}

function delay(ms) {
    return new Promise(resolve => window.setTimeout(resolve, ms));
}

function performMove(pieceId) {
    if (!game || moveAnimating) return;
    const before = snapshotPieceSteps();
    const move = movePiece(game, pieceId);
    const after = snapshotPieceSteps();
    return finishMove(move, { before, after });
}

async function animatePieceMove(move, movement) {
    if (!movement || settings.moveSpeed !== 'normal' || !settings.animations) return;
    const { before, after } = movement;
    const playerId = move.playerId;
    const pieceId = move.pieceId;
    const piece = game.pieces[playerId].pieces[pieceId];
    const from = before[playerId][pieceId];
    const to = after[playerId][pieceId];
    if (from === to) return;

    moveAnimating = true;
    try {
        const steps = from < 0 ? [0] : Array.from(
            { length: to - from }, (_, index) => from + index + 1
        );
        for (const step of steps) {
            piece.steps = step;
            if (move.captured) {
                const captured = move.captured;
                game.pieces[captured.playerId].pieces[captured.pieceId].steps =
                    before[captured.playerId][captured.pieceId];
            }
            showGame();
            await delay(350);
        }
    } finally {
        restorePieceSteps(after);
        moveAnimating = false;
        showGame();
    }
}

async function finishMove(move, movement) {
    await animatePieceMove(move, movement);
    const wasInBase = movement?.before?.[move.playerId]?.[move.pieceId] === -1;
    const logText = ['hodil ' + move.diceValue];
    if (wasInBase) {
        logText.push('nasadil figurku ' + (move.pieceId + 1));
    } else {
        logText.push('posunul figurku ' + (move.pieceId + 1) + ' o ' + move.diceValue + ' polí');
    }
    if (move.captured) logText.push(move.captured.ownPiece
        ? 'vyměnil vlastní figurku na startu (původní se vrátila do základny)'
        : 'vyhodil hráče ' + move.captured.playerName);
    if (move.finishedNow) logText.push('dostal figurku do domečku');
    addGameLogEntry(move.playerName, logText.join(', '));

    showGame();
    if (move.captured) {
        openKickModal(move);
        if (game.players[move.playerId]?.isAI) {
            setTimeout(() => {
                if (modalOpen) closeKickModal();
            }, 1900);
        }
        return;
    }
    if (move.finishedNow) toast('Figurka dorazila do domečku!');
    continueGame();
}

function continueGame() {
    if (!game || modalOpen || isPaused()) return;
    if (game.winner !== null) {
        showGame();
        showWin();
        return;
    }
    if (game.phase === 'no-move') {
        advanceTurn(game);
        continueGame();
        return;
    }
    showGame();

    if (game.players[game.currentPlayer].isAI) {
        scheduleAI();
    }
}

function showWin() {
    const winner = game.players[game.winner];
    $('winner-name').textContent = winner.name;
    $('win-title').textContent = winner.isAI ? 'AI VYHRÁLA!' : 'VÍTĚZSTVÍ!';
    $('win-message').textContent = winner.name + ' dostal všechny čtyři figurky domů.';
    $('win-modal').classList.remove('hidden');
    play('win-sound');
    const confetti = $('confetti');
    if (confetti) {
        confetti.innerHTML = Array.from({ length: 42 }, (_, i) =>
            '<i style="--i:' + i + ';--h:' + (i * 37 % 360) + 'deg"></i>'
        ).join('');
    }
}

async function doStartingRoll(isAI = false) {
    if (!game || game.phase !== 'start-roll' || modalOpen) return;
    const playerId = game.currentPlayer;
    const player = game.players[playerId];
    if (!isAI && player.isAI) return;

    const value = Math.floor(Math.random() * 6) + 1;
    game.diceValue = value;
    await animateDice(value, settings);
    if (!game || game.phase !== 'start-roll' || game.currentPlayer !== playerId || isPaused()) return;

    const roundIndex = game.startRolls.length - 1;
    game.startRolls[roundIndex].push({ playerId, value });

    const candidates = game.startCandidates;
    const round = game.startRolls[roundIndex];
    if (round.length < candidates.length) {
        game.currentPlayer = candidates[round.length];
    } else {
        const highest = Math.max(...round.map(roll => roll.value));
        const winners = round.filter(roll => roll.value === highest).map(roll => roll.playerId);
        if (winners.length === 1) {
            game.startWinner = winners[0];
            game.startCandidates = [];
            game.currentPlayer = winners[0];
            game.phase = 'roll';
        } else {
            game.startCandidates = winners;
            game.startRolls.push([]);
            game.currentPlayer = winners[0];
        }
    }

    updateStartLog();
    showGame();
    if (game.phase === 'roll') {
        toast(game.players[game.currentPlayer].name + ' začíná hru.');
        // Pokud rozstřel vyhrála AI, musí se po přechodu do běžné hry
        // naplánovat její první hod. Bez continueGame() by hra zůstala stát.
        continueGame();
        return;
    }
    continueGame();
}

async function doRoll(isAI = false) {
    if (!game || modalOpen) return;
    if (game.phase === 'start-roll') {
        await doStartingRoll(isAI);
        return;
    }
    if (game.phase !== 'roll') return;
    if (!isAI && game.players[game.currentPlayer].isAI) return;

    const result = rollDice(game);
    await animateDice(result.value, settings);
    if (!game || game.winner !== null || isPaused()) return;

    if (result.retrying) {
        const retryText = result.value === 6
            ? 'hodil 6, nemá legální tah a hází znovu'
            : 'hodil ' + result.value + ', bez šestky (pokus ' + result.attempt + '/3)';
        addGameLogEntry(game.players[game.currentPlayer].name, retryText);
        continueGame();
        return;
    }

    if (game.phase === 'no-move') {
        const noMoveText = result.attempt && result.maxAttempts
            ? 'hodil ' + result.value + ', bez šestky (pokus ' + result.attempt + '/' + result.maxAttempts + '), nemá platný tah'
            : 'hodil ' + result.value + ', nemá platný tah';
        addGameLogEntry(game.players[game.currentPlayer].name, noMoveText);
        toast(game.players[game.currentPlayer].name + ' nemá platný tah.');
        showGame();
        setTimeout(() => {
            if (game && game.phase === 'no-move' && !isPaused()) {
                advanceTurn(game);
                continueGame();
            }
        }, 650);
        return;
    }

    const debugManualMoves = new URLSearchParams(window.location.search).get('debug') === '1';
    const forcedMove = getForcedMove(game);
    if (forcedMove !== null && !debugManualMoves) {
        performMove(forcedMove);
        return;
    }

    showGame();
    if (isAI) {
        const selected = chooseAIMove(game);
        if (selected !== null) {
            aiTimer = setTimeout(() => {
                if (!game || game.phase !== 'move' || isPaused()) return;
                performMove(selected);
            }, speedDelay());
        }
    }
}

function scheduleAI() {
    clearTimeout(aiTimer);
    if (!game || game.winner !== null || modalOpen || isPaused()) return;
    const player = game.players[game.currentPlayer];
    if (!player || !player.isAI) return;

    aiTimer = setTimeout(() => {
        if (!game || modalOpen || moveAnimating || game.winner !== null || isPaused()) return;
        if (game.phase === 'start-roll' || game.phase === 'roll') {
            doRoll(true);
        } else if (game.phase === 'move') {
            const selected = chooseAIMove(game);
            if (selected !== null) performMove(selected);
        }
    }, speedDelay());
}

function onBoardClick(event) {
    const piece = event.target.closest?.('[data-player][data-piece]');
    const playerId = Number(event.detail?.playerId ?? piece?.dataset.player);
    const pieceId = Number(event.detail?.pieceId ?? piece?.dataset.piece);
    if (!Number.isInteger(playerId) || !Number.isInteger(pieceId) || !game || game.phase !== 'move' || modalOpen || moveAnimating) return;
    if (playerId !== game.currentPlayer || game.players[playerId].isAI) return;

    if (!getValidMoves(game).includes(pieceId)) {
        toast('Tuto figurku tímto hodem posunout nelze.');
        return;
    }

    try {
        performMove(pieceId);
    } catch (error) {
        toast(error.message);
    }
}

async function startGame() {
    try {
        const setup = getPlayerSetup();
        game = createGame(setup.humanCount, setup.aiCount, setup.names, setup.colors, setup.selectedBoardSize);
        game.phase = 'start-roll';
        game.currentPlayer = 0;
        game.startCandidates = game.players.map(player => player.id);
        game.startRolls = [[]];
        game.startWinner = null;
    } catch (error) {
        toast(error.message);
        return;
    }
    clearTimeout(aiTimer);
    resetGameLog();
    modalOpen = false;
    try {
        await ensureModeStyles(getBoardView());
    } catch (error) {
        console.error('Herní CSS se nepodařilo připravit:', error);
    }
    $('win-modal').classList.add('hidden');
    $('kick-modal').classList.add('hidden');
    showScreen('game');
    showGame();
    continueGame();
}

function restartGame() {
    startGame();
    $('game-menu').classList.add('hidden');
}

export async function openPlayerSelection() {
    try {
        await ensureGameStyles();
    } catch (error) {
        console.error('Styly výběru hry se nepodařilo načíst:', error);
    }
    updateSetup();
    showScreen('player-selection');
}

export function initGame() {
    initPlayerSetup();
    $('start-game-btn')?.addEventListener('click', startGame);
    $('back-to-menu-btn')?.addEventListener('click', () => showScreen('main-menu'));
    $('roll-dice-btn')?.addEventListener('click', () => doRoll(false));

    const audioToggle = $('game-audio-toggle');
    const volumeSlider = $('game-volume');

    const syncAudioControls = () => {
        const state = getAudioState();
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
        toggleMasterMute();
        syncAudioControls();
    });
    volumeSlider?.addEventListener('input', event => {
        setMasterVolume(Number(event.target.value) / 100);
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

    $('game-container')?.addEventListener('click', onBoardClick);
    $('game-container')?.addEventListener('boardpiececlick', onBoardClick);
    $('chat-form')?.addEventListener('submit', event => {
        event.preventDefault();
        const input = $('chat-input');
        if (!input) return;
        sendChatMessage(input.value);
        input.value = '';
        input.focus();
    });
    $('close-kick-btn')?.addEventListener('click', closeKickModal);
    $('close-win-btn')?.addEventListener('click', () => {
        $('win-modal').classList.add('hidden');
        game = null;
        showScreen('main-menu');
    });
    $('menu-btn')?.addEventListener('click', () => {
        clearTimeout(aiTimer);
        const gameSpeedSelect = $('game-speed');
        if (gameSpeedSelect) gameSpeedSelect.value = settings.moveSpeed;
        $('game-menu').classList.remove('hidden');
    });
    $('resume-btn')?.addEventListener('click', () => {
        $('game-menu').classList.add('hidden');
        continueGame();
    });
    $('restart-btn')?.addEventListener('click', restartGame);
    $('quit-btn')?.addEventListener('click', () => {
        clearTimeout(aiTimer);
        $('game-menu').classList.add('hidden');
        game = null;
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

    // Online navigace je navázaná v hlavním inicializátoru, nezávisle na API bootstrapu.


}
