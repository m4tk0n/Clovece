/**
 * Člověče, nezlob se! – herní rozhraní a lokální AI.
 * Stav hry spravuje game-engine.js; vykreslení game-board.js.
 */
import {
    createGame, determineStartingPlayer, rollDice, getValidMoves, getForcedMove, movePiece, PLAYER_COLORS,
    advanceTurn, chooseAIMove
} from './game-engine.js';
import { renderBoard } from './game-board.js';
import { showScreen } from './navigation.js';
import { setMasterVolume, toggleMasterMute, getAudioState } from './audio.js';

let game = null;
let humanCount = 1;
let aiCount = 3;
let aiTimer = null;
let modalOpen = false;
let settings = { aiSpeed: 'medium', animations: true };
const customPlayerNames = new Map();
const customPlayerColors = new Map();
const PLAYER_COLOR_LABELS = ['Červená', 'Modrá', 'Zelená', 'Žlutá', 'Oranžová', 'Fialová', 'Tyrkysová', 'Růžová'];

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
}

const $ = id => document.getElementById(id);
const speedDelay = () => ({ fast: 450, medium: 950, slow: 1600 }[settings.aiSpeed] || 950);

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

function updateSetup() {
    const humanInput = $('human-players');
    const aiInput = $('ai-players');
    if (!humanInput || !aiInput) return;

    humanCount = Math.max(1, Math.min(8, Number(humanInput.value) || 1));
    aiCount = Math.max(0, Math.min(7, Number(aiInput.value) || 0));

    if (humanCount + aiCount < 2) {
        aiCount = 1;
        aiInput.value = '1';
    }
    if (humanCount + aiCount > 8) {
        aiCount = 8 - humanCount;
        aiInput.value = String(aiCount);
    }

    const total = humanCount + aiCount;
    $('human-players-value').textContent = humanCount;
    $('ai-players-value').textContent = aiCount;
    $('setup-total').textContent = total + ' ' + (total === 1 ? 'hráč' : total < 5 ? 'hráči' : 'hráčů');
    $('setup-board-type').textContent = total <= 4
        ? 'Klasická čtyřbarevná aréna'
        : 'Rozšířená osmisměrná aréna';
    const usedColors = new Set();
    $('preview-players').innerHTML = Array.from({ length: total }, (_, index) => {
        const isAI = index >= humanCount;
        const number = isAI ? index - humanCount + 1 : index + 1;
        const key = (isAI ? 'ai:' : 'human:') + number;
        const requestedColor = customPlayerColors.get(key);
        let color = PLAYER_COLORS.includes(requestedColor) && !usedColors.has(requestedColor)
            ? requestedColor
            : null;
        if (!color) {
            const availableColors = PLAYER_COLORS.filter(candidate => !usedColors.has(candidate));
            color = availableColors[Math.floor(Math.random() * availableColors.length)];
        }
        usedColors.add(color);
        customPlayerColors.set(key, color);
        const defaultName = (isAI ? 'AI ' : 'Hráč ') + number;
        const name = customPlayerNames.get(key) || defaultName;
        return '<div class="preview-player" style="--player-color:' + color + '">' +
            '<span class="preview-player-orb">' + (isAI ? 'AI' : number) + '</span>' +
            '<input class="preview-player-name" type="text" maxlength="20" autocomplete="off" ' +
                'aria-label="Jméno ' + (isAI ? 'AI ' : 'hráče ') + number + '" ' +
                'data-name-key="' + key + '" value="' + escapeHtml(name) + '">' +
            '<label class="preview-color-label">' +
                '<select class="preview-player-color" data-color-key="' + key + '" aria-label="Barva hráče ' + escapeHtml(name) + '">' +
                    PLAYER_COLORS.map((value, colorIndex) => '<option value="' + value + '"' + (value === color ? ' selected' : '') + '>' + PLAYER_COLOR_LABELS[colorIndex] + '</option>').join('') +
                '</select></label></div>';
    }).join('');
}

function showGame() {
    if (!game) return;
    renderBoard($('game-container'), game);
    renderPlayers();
    updateTurnControls();
}

function renderPlayers() {
    const panel = $('players-panel');
    if (!panel || !game) return;
    panel.innerHTML = game.players.map((player, index) => {
        const finished = game.pieces[index].pieces.filter(
            piece => piece.steps === game.trackLength + 4
        ).length;
        return '<div class="board-player-stat" style="--player-color:' + player.color + '" title="' +
            escapeHtml(player.name) + '">' +
            '<strong>' + finished + '/4</strong>' +
        '</div>';
    }).join('');
}

const chatHistory = [];

function renderChat() {
    const messages = $('chat-messages');
    if (!messages) return;
    messages.innerHTML = '';
    chatHistory.slice(-40).forEach(item => {
        const line = document.createElement('div');
        line.className = 'game-chat-message';
        const sender = document.createElement('strong');
        sender.textContent = item.sender + ': ';
        const body = document.createElement('span');
        body.textContent = item.text;
        line.append(sender, body);
        messages.appendChild(line);
    });
    messages.scrollTop = messages.scrollHeight;
}

function addChatEntry(sender, text) {
    const message = String(text || '').trim().slice(0, 240);
    if (!message) return;
    chatHistory.push({ sender: String(sender || 'Hra'), text: message, type: 'chat' });
    renderChat();
}

function addGameLogEntry(sender, text) {
    const message = String(text || '').trim();
    if (!message) return;

    const playerName = String(sender || 'Hra');
    const lastEntry = chatHistory[chatHistory.length - 1];

    // Herní události stejného hráče spojujeme, ale chatová zpráva řádek vždy přeruší.
    if (lastEntry && lastEntry.type === 'game' && lastEntry.sender === playerName) {
        lastEntry.text += ', ' + message;
    } else {
        chatHistory.push({ sender: playerName, text: message, type: 'game' });
    }

    renderChat();
}

function sendChatMessage(text) {
    if (!game) return;
    addChatEntry(game.players[game.currentPlayer].name, text);
}

function updateTurnControls() {
    if (!game) return;
    const player = game.players[game.currentPlayer];
    const isHuman = !player.isAI;
    $('current-player-name').textContent = player.name;
    $('current-player-display').style.setProperty('--player-color', player.color);
    $('dice-value').textContent = game.diceValue || '—';
    $('game-status').textContent = game.phase === 'move'
        ? (isHuman ? 'Vyber figurku, kterou chceš posunout.' : 'AI vybírá svůj tah…')
        : game.phase === 'no-move'
            ? 'Žádný možný tah.'
            : game.phase === 'finished'
                ? 'Hra skončila.'
                : (isHuman ? 'Hoď kostkou a hraj.' : 'AI hází kostkou…');

    $('roll-dice-btn').classList.toggle('hidden', !isHuman || game.phase !== 'roll');
    $('roll-dice-btn').disabled = !isHuman || game.phase !== 'roll';
    $('end-turn-btn').classList.add('hidden');
}

// Aktuální natočení kostky se uchovává mezi jednotlivými hody.
let diceCurrentX = 0;
let diceCurrentY = 0;

export function animateDice(value) {
    const diceValue = Math.max(1, Math.min(6, Number(value) || 1));
    $('dice-value').textContent = diceValue;

    const animation = $('dice-animation');
    const scene = $('dice-scene');
    const cube = $('dice-3d');

    if (!animation || !scene || !cube || !settings.animations) {
        return Promise.resolve();
    }

    const BASE = {
        1: { x: 0, y: 0 },
        2: { x: 0, y: -90 },
        3: { x: -90, y: 0 },
        4: { x: 90, y: 0 },
        5: { x: 0, y: 90 },
        6: { x: 0, y: 180 }
    };

    const spin = (current, base) => {
        const turns = Math.ceil((current - base) / 360) + 2 + Math.floor(Math.random() * 2);
        return base + turns * 360;
    };

    // Cílové natočení vždy končí správnou stěnou směrem k divákovi.
    const target = BASE[diceValue];
    const nextX = spin(diceCurrentX, target.x);
    const nextY = spin(diceCurrentY, target.y);

    // Nejdřív kostku zobrazíme a nastavíme její skutečnou výchozí polohu.
    // Teprve po vynuceném layoutu změníme transformaci, aby prohlížeč
    // přehrál celý CSS transition i po předchozím display:none.
    animation.classList.remove('hidden');
    scene.classList.remove('rolling');
    cube.style.transition = 'none';
    cube.style.transform =
        'rotateX(' + (diceCurrentX - 24) + 'deg) rotateY(' + (diceCurrentY - 32) + 'deg)';
    void cube.offsetWidth;

    // Obnovíme plynulou rotaci a v dalším snímku spustíme několik otáček.
    cube.style.transition = '';
    scene.classList.add('rolling');
    requestAnimationFrame(() => {
        cube.style.transform =
            'rotateX(' + (nextX - 24) + 'deg) rotateY(' + (nextY - 32) + 'deg)';
    });

    diceCurrentX = nextX;
    diceCurrentY = nextY;
    play('dice-sound');

    return new Promise(resolve => {
        window.setTimeout(() => {
            scene.classList.remove('rolling');
            animation.classList.add('hidden');
            resolve();
        }, 1200);
    });
}

function openKickModal(move) {
    modalOpen = true;
    const player = game.players[move.playerId];
    $('kicker-piece').style.background = player.color;
    $('kicked-piece').style.background = move.captured.color;
    $('kick-title').textContent = 'PŘESNÝ ZÁSAH!';
    $('kick-message').textContent = player.name + ' poslal hráče ' + move.captured.playerName + ' zpět do domečku.';
    $('kick-modal').classList.remove('hidden');
    play('kick-sound');
}

function closeKickModal() {
    $('kick-modal').classList.add('hidden');
    modalOpen = false;
    showGame();
    continueGame();
}

function finishMove(move) {
    const logText = ['hodil ' + move.diceValue];
    if (move.captured) logText.push('vyhodil ' + move.captured.playerName);
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

async function doRoll(isAI = false) {
    if (!game || game.phase !== 'roll' || modalOpen) return;
    if (!isAI && game.players[game.currentPlayer].isAI) return;

    const result = rollDice(game);
    await animateDice(result.value);
    if (!game || game.winner !== null || isPaused()) return;

    if (game.phase === 'no-move') {
        addGameLogEntry(game.players[game.currentPlayer].name, 'hodil ' + result.value + ', nemá platný tah');
        toast(game.players[game.currentPlayer].name + ' nemá platný tah.');
        showGame();
        setTimeout(() => {
            if (game && game.phase === 'no-move' && !isPaused()) {
                advanceTurn(game);
                continueGame();
            }
        }, isAI ? 350 : 650);
        return;
    }

    const forcedMove = getForcedMove(game);
    if (forcedMove !== null) {
        finishMove(movePiece(game, forcedMove));
        return;
    }

    showGame();
    if (isAI) {
        const selected = chooseAIMove(game);
        if (selected !== null) {
            aiTimer = setTimeout(() => {
                if (!game || game.phase !== 'move' || isPaused()) return;
                finishMove(movePiece(game, selected));
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
        if (!game || modalOpen || game.winner !== null || isPaused()) return;
        if (game.phase === 'roll') {
            doRoll(true);
        } else if (game.phase === 'move') {
            const selected = chooseAIMove(game);
            if (selected !== null) finishMove(movePiece(game, selected));
        }
    }, speedDelay());
}

function onBoardClick(event) {
    const piece = event.target.closest('[data-player][data-piece]');
    if (!piece || !game || game.phase !== 'move' || modalOpen) return;
    const playerId = Number(piece.dataset.player);
    const pieceId = Number(piece.dataset.piece);
    if (playerId !== game.currentPlayer || game.players[playerId].isAI) return;

    if (!getValidMoves(game).includes(pieceId)) {
        toast('Tuto figurku tímto hodem posunout nelze.');
        return;
    }

    try {
        finishMove(movePiece(game, pieceId));
    } catch (error) {
        toast(error.message);
    }
}

function startGame() {
    updateSetup();
    try {
        const names = Array.from($('preview-players').querySelectorAll('[data-name-key]'), input => {
            const name = input.value.trim().slice(0, 20);
            if (name) return name;
            const number = input.dataset.nameKey.split(':')[1];
            return input.dataset.nameKey.startsWith('ai:') ? 'AI ' + number : 'Hráč ' + number;
        });
        const colors = Array.from($('preview-players').querySelectorAll('[data-color-key]'), select => select.value);
        game = createGame(humanCount, aiCount, names, colors);
        determineStartingPlayer(game);
    } catch (error) {
        toast(error.message);
        return;
    }
    clearTimeout(aiTimer);
    chatHistory.length = 0;
    renderChat();
    game.startRolls.forEach((round, index) => {
        const results = round.map(roll =>
            game.players[roll.playerId].name + ' hodil ' + roll.value
        ).join(' · ');
        addGameLogEntry('Rozstřel', 'Kolo ' + (index + 1) + ': ' + results);
    });
    addGameLogEntry('Hra', game.players[game.currentPlayer].name + ' vyhrává rozstřel a začíná.');
    toast(game.players[game.currentPlayer].name + ' začíná hru.');
    modalOpen = false;
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

export function initGame() {
    $('human-players')?.addEventListener('input', updateSetup);
    $('ai-players')?.addEventListener('input', updateSetup);
    $('preview-players')?.addEventListener('input', event => {
        const input = event.target.closest('[data-name-key]');
        if (!input) return;
        customPlayerNames.set(input.dataset.nameKey, input.value.trim());
    });
    $('preview-players')?.addEventListener('change', event => {
        const select = event.target.closest('[data-color-key]');
        if (!select) return;
        const preview = $('preview-players');
        const duplicate = Array.from(preview.querySelectorAll('[data-color-key]')).some(other =>
            other !== select && other.value === select.value
        );
        if (duplicate) {
            const previous = customPlayerColors.get(select.dataset.colorKey);
            select.value = previous || PLAYER_COLORS[0];
            toast('Tuto barvu už má vybraný jiný hráč.');
            return;
        }
        customPlayerColors.set(select.dataset.colorKey, select.value);
        select.closest('.preview-player')?.style.setProperty('--player-color', select.value);
    });
    $('random-player-colors-btn')?.addEventListener('click', () => {
        const shuffled = [...PLAYER_COLORS];
        for (let index = shuffled.length - 1; index > 0; index--) {
            const swapIndex = Math.floor(Math.random() * (index + 1));
            [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
        }
        const preview = $('preview-players');
        preview?.querySelectorAll('[data-color-key]').forEach((select, index) => {
            select.value = shuffled[index];
            customPlayerColors.set(select.dataset.colorKey, select.value);
            select.closest('.preview-player')?.style.setProperty('--player-color', select.value);
        });
    });
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
    $('back-settings-btn')?.addEventListener('click', () => showScreen('main-menu'));
    $('back-rules-btn')?.addEventListener('click', () => showScreen('main-menu'));

    $('ai-speed')?.addEventListener('change', event => settings.aiSpeed = event.target.value);
    $('animations-toggle')?.addEventListener('change', event => settings.animations = event.target.checked);
    $('save-settings-btn')?.addEventListener('click', () => {
        settings.aiSpeed = $('ai-speed')?.value || 'medium';
        settings.animations = $('animations-toggle')?.checked !== false;
        toast('Nastavení uloženo.');
        showScreen('main-menu');
    });

    // Online navigace je navázaná v hlavním inicializátoru, nezávisle na API bootstrapu.
    $('join-room-btn')?.addEventListener('click', () => showScreen('lobby'));

    $('play-btn')?.addEventListener('click', () => {
        showScreen('player-selection');
        updateSetup();
    });
    $('create-room-btn')?.addEventListener('click', () => {
        showScreen('player-selection');
        updateSetup();
    });
    $('settings-btn')?.addEventListener('click', () => showScreen('settings'));
    $('rules-btn')?.addEventListener('click', () => showScreen('rules'));

    updateSetup();
}
