/**
 * Člověče, nezlob se! – herní rozhraní a lokální AI.
 * Stav hry spravuje game-engine.js; vykreslení game-board.js.
 */
import {
    createGame, rollDice, getValidMoves, getForcedMove, movePiece, PLAYER_COLORS,
    advanceTurn, chooseAIMove, getAvailableBoardSizes
} from './game-engine.js';
import { renderBoard } from './game-board.js';
import { showScreen } from './navigation.js';
import { setMasterVolume, toggleMasterMute, getAudioState, setSoundEffectsEnabled } from './audio.js';

let game = null;
let humanCount = 1;
let aiCount = 1;
let selectedBoardSize = 40;
let aiTimer = null;
let modalOpen = false;
let moveAnimating = false;
function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem('clovece-settings') || '{}');
        return {
            moveSpeed: (saved.moveSpeed || saved.aiSpeed) === 'fast' ? 'fast' : 'normal',
            animations: saved.animations !== false,
            sfx: saved.sfx !== false
        };
    } catch (error) {
        console.warn('Nastavení se nepodařilo načíst:', error);
        return { moveSpeed: 'normal', animations: true, sfx: true };
    }
}

let settings = loadSettings();
const customPlayerNames = new Map();
const customPlayerColors = new Map();
const PLAYER_COLOR_LABELS = ['Červená', 'Modrá', 'Zelená', 'Žlutá', 'Oranžová', 'Fialová', 'Tyrkysová', 'Růžová'];

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
}

const $ = id => document.getElementById(id);
const speedDelay = () => 950;

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

function shuffleColors(colors) {
    const shuffled = [...colors];
    for (let index = shuffled.length - 1; index > 0; index--) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
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

    const availableBoardSizes = getAvailableBoardSizes(total);
    if (!availableBoardSizes.includes(selectedBoardSize)) {
        selectedBoardSize = availableBoardSizes[0] || 40;
    }
    $('board-size-options')?.querySelectorAll('[data-board-size]').forEach(button => {
        const size = Number(button.dataset.boardSize);
        const active = size === selectedBoardSize;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
        button.disabled = !availableBoardSizes.includes(size);
    });

    const players = Array.from({ length: total }, (_, index) => {
        const isAI = index >= humanCount;
        const number = isAI ? index - humanCount + 1 : index + 1;
        const key = (isAI ? 'ai:' : 'human:') + number;
        const requestedColor = customPlayerColors.get(key);
        return {
            isAI,
            number,
            key,
            selectedColor: PLAYER_COLORS.includes(requestedColor) ? requestedColor : 'random',
            name: customPlayerNames.get(key) || (isAI ? 'AI ' : 'Hráč ') + number
        };
    });

    // Konkrétní barvy jsou rezervované. Náhodní hráči dostanou zbytek.
    const reservedColors = new Set(players
        .filter(player => player.selectedColor !== 'random')
        .map(player => player.selectedColor));
    const randomColors = shuffleColors(PLAYER_COLORS.filter(color => !reservedColors.has(color)));
    let randomColorIndex = 0;

    players.forEach(player => {
        player.displayColor = player.selectedColor === 'random'
            ? randomColors[randomColorIndex++]
            : player.selectedColor;
    });

    $('preview-players').innerHTML = players.map(player => {
        const availableColors = PLAYER_COLORS
            .map((value, colorIndex) => ({ value, label: PLAYER_COLOR_LABELS[colorIndex] }))
            .filter(color => color.value === player.selectedColor || !reservedColors.has(color.value));

        return '<div class="preview-player" style="--player-color:' + player.displayColor + '">' +
            '<span class="preview-player-orb">' + (player.isAI ? 'AI' : player.number) + '</span>' +
            '<input class="preview-player-name" type="text" maxlength="20" autocomplete="off" ' +
                'aria-label="Jméno ' + (player.isAI ? 'AI ' : 'hráče ') + player.number + '" ' +
                'data-name-key="' + player.key + '" value="' + escapeHtml(player.name) + '">' +
            '<label class="preview-color-label">' +
                '<select class="preview-player-color" data-color-key="' + player.key + '" data-resolved-color="' + player.displayColor + '" aria-label="Barva hráče ' + escapeHtml(player.name) + '">' +
                    '<option value="random"' + (player.selectedColor === 'random' ? ' selected' : '') + '>Náhodná</option>' +
                    availableColors.map(color => '<option value="' + color.value + '"' +
                        (color.value === player.selectedColor ? ' selected' : '') + '>' + color.label + '</option>').join('') +
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
            piece => piece.steps >= game.trackLength
        ).length;
        return '<div class="board-player-stat" style="--player-color:' + player.color + '" title="' +
            escapeHtml(player.name) + '">' +
            '<strong>' + finished + '/4</strong>' +
        '</div>';
    }).join('');
}

const chatHistory = [];
let startLogEntry = null;

function updateStartLog() {
    if (!game || !startLogEntry) return;
    const rounds = (game.startRolls || []).filter(round => round.length > 0);
    const summary = rounds.map((round, index) =>
        'kolo ' + (index + 1) + ': ' + round.map(roll =>
            game.players[roll.playerId].name + ' ' + roll.value
        ).join(', ')
    ).join('; ');
    startLogEntry.text = 'Rozstřel: ' + (summary || 'čeká se na první hod')
        + (game.phase === 'start-roll'
            ? ' · čeká se na hod hráče ' + game.players[game.currentPlayer].name
            : '. ' + game.players[game.startWinner].name + ' začíná.');
    renderChat();
}

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
    $('game-status').textContent = game.phase === 'start-roll'
        ? (isHuman ? 'Rozstřel: hoď kostkou, až přijdeš na řadu.' : 'AI hází v rozstřelu…')
        : game.phase === 'move'
            ? (isHuman ? 'Vyber figurku, kterou chceš posunout.' : 'AI vybírá svůj tah…')
            : game.phase === 'no-move'
                ? 'Žádný možný tah.'
                : game.phase === 'finished'
                    ? 'Hra skončila.'
                    : (isHuman ? 'Hoď kostkou a hraj.' : 'AI hází kostkou…');

    const canRoll = isHuman && ['start-roll', 'roll'].includes(game.phase);
    $('roll-dice-btn').classList.toggle('hidden', !canRoll);
    $('roll-dice-btn').disabled = !canRoll;
    const rollLabel = $('roll-dice-btn').querySelector('span');
    if (rollLabel) rollLabel.textContent = game.phase === 'start-roll' ? 'HODIT ROZSTŘEL' : 'HODIT';
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

    // Rychlý režim ukáže rovnou správnou stěnu bez roztočení kostky.
    if (settings.moveSpeed === 'fast') {
        animation.classList.remove('hidden');
        scene.classList.remove('rolling');
        cube.style.transition = 'none';
        cube.style.transform =
            'rotateX(' + (target.x - 24) + 'deg) rotateY(' + (target.y - 32) + 'deg)';
        void cube.offsetWidth;
        cube.style.transition = '';
        diceCurrentX = target.x;
        diceCurrentY = target.y;

        return new Promise(resolve => {
            window.setTimeout(() => {
                animation.classList.add('hidden');
                resolve();
            }, 450);
        });
    }

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
        }, 1500);
    });
}

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
    await animateDice(value);
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
    await animateDice(result.value);
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
        addGameLogEntry(game.players[game.currentPlayer].name, 'hodil ' + result.value + ', nemá platný tah');
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

function startGame() {
    try {
        const names = Array.from($('preview-players').querySelectorAll('[data-name-key]'), input => {
            const name = input.value.trim().slice(0, 20);
            if (name) return name;
            const number = input.dataset.nameKey.split(':')[1];
            return input.dataset.nameKey.startsWith('ai:') ? 'AI ' + number : 'Hráč ' + number;
        });
        // Náhodné barvy jsou už v náhledu vylosované. Do hry použijeme přesně ty zobrazené.
        const colors = Array.from($('preview-players').querySelectorAll('[data-color-key]'), select =>
            select.value === 'random' ? select.dataset.resolvedColor : select.value
        );
        game = createGame(humanCount, aiCount, names, colors, selectedBoardSize);
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
    chatHistory.length = 0;
    renderChat();
    startLogEntry = { sender: 'Rozstřel', text: 'Čeká se na první hod.', type: 'game' };
    chatHistory.push(startLogEntry);
    updateStartLog();
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
    $('board-size-options')?.addEventListener('click', event => {
        const button = event.target.closest('[data-board-size]');
        if (!button || button.disabled) return;
        selectedBoardSize = Number(button.dataset.boardSize);
        updateSetup();
    });
    $('preview-players')?.addEventListener('input', event => {
        const input = event.target.closest('[data-name-key]');
        if (!input) return;
        customPlayerNames.set(input.dataset.nameKey, input.value.trim());
    });
    $('preview-players')?.addEventListener('change', event => {
        const select = event.target.closest('[data-color-key]');
        if (!select) return;

        customPlayerColors.set(select.dataset.colorKey, select.value);
        updateSetup();
    });
    $('random-player-colors-btn')?.addEventListener('click', () => {
        $('preview-players')?.querySelectorAll('[data-color-key]').forEach(select => {
            customPlayerColors.set(select.dataset.colorKey, 'random');
        });
        updateSetup();
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
    $('back-settings-btn')?.addEventListener('click', () => showScreen('main-menu'));
    $('back-rules-btn')?.addEventListener('click', () => showScreen('main-menu'));

    const aiSpeedSelect = $('ai-speed');
    const animationsToggle = $('animations-toggle');
    const sfxToggle = $('sfx-toggle');

    if (aiSpeedSelect) aiSpeedSelect.value = settings.moveSpeed;
    const gameSpeedSelect = $('game-speed');
    if (gameSpeedSelect) gameSpeedSelect.value = settings.moveSpeed;
    if (animationsToggle) animationsToggle.checked = settings.animations;
    if (sfxToggle) sfxToggle.checked = settings.sfx;

    const applyAnimationSetting = () => {
        document.documentElement.classList.toggle('animations-disabled', !settings.animations);
    };
    applyAnimationSetting();
    setSoundEffectsEnabled(settings.sfx);

    aiSpeedSelect?.addEventListener('change', event => {
        settings.moveSpeed = event.target.value === 'fast' ? 'fast' : 'normal';
        gameSpeedSelect && (gameSpeedSelect.value = settings.moveSpeed);
        try { localStorage.setItem('clovece-settings', JSON.stringify(settings)); }
        catch (error) { console.warn('Nastavení rychlosti pohybu se nepodařilo uložit:', error); }
    });
    gameSpeedSelect?.addEventListener('change', event => {
        settings.moveSpeed = event.target.value === 'fast' ? 'fast' : 'normal';
        aiSpeedSelect && (aiSpeedSelect.value = settings.moveSpeed);
        try {
            localStorage.setItem('clovece-settings', JSON.stringify(settings));
        } catch (error) {
            console.warn('Rychlost hry se nepodařilo uložit:', error);
        }
        toast('Rychlost pohybu figurek: ' + (settings.moveSpeed === 'fast' ? 'Rychlá' : 'Normální'));
    });
    animationsToggle?.addEventListener('change', event => {
        settings.animations = event.target.checked;
        applyAnimationSetting();
    });
    sfxToggle?.addEventListener('change', event => {
        settings.sfx = event.target.checked;
        setSoundEffectsEnabled(settings.sfx);
    });
    $('save-settings-btn')?.addEventListener('click', () => {
        settings.moveSpeed = aiSpeedSelect?.value === 'fast' ? 'fast' : 'normal';
        settings.animations = animationsToggle?.checked !== false;
        settings.sfx = sfxToggle?.checked !== false;
        applyAnimationSetting();
        setSoundEffectsEnabled(settings.sfx);
        try {
            localStorage.setItem('clovece-settings', JSON.stringify(settings));
        } catch (error) {
            console.warn('Nastavení se nepodařilo uložit:', error);
        }
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
