/**
 * Člověče, nezlob se! – herní rozhraní a lokální AI.
 * Stav hry spravuje game-engine.js; vykreslení game-board.js.
 */
import {
    createGame, rollDice, getValidMoves, movePiece,
    advanceTurn, chooseAIMove
} from './game-engine.js';
import { renderBoard } from './game-board.js';
import { showScreen } from './navigation.js';

let game = null;
let humanCount = 1;
let aiCount = 3;
let aiTimer = null;
let modalOpen = false;
let settings = { aiSpeed: 'medium', animations: true };

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
    $('setup-board-note').textContent = total <= 4
        ? 'Čtyři základny, čtyři domácí dráhy.'
        : 'Každý hráč má vlastní barevný domeček a domácí dráhu.';
    $('preview-players').innerHTML = Array.from({ length: total }, (_, index) => {
        const color = ['#f05b62','#36c9c1','#f4c84a','#67c98b','#e77ab4','#9b83e8','#e99555','#6c9de8'][index];
        const isAI = index >= humanCount;
        return '<div class="preview-player" style="--player-color:' + color + '">' +
            '<span class="preview-player-orb">' + (isAI ? 'AI' : (index + 1)) + '</span>' +
            '<span>' + (isAI ? 'Umělá inteligence' : 'Člověk ' + (index + 1)) + '</span>' +
            '<small>' + (isAI ? 'BOT' : 'ŽIVÝ HRÁČ') + '</small></div>';
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
        const pieces = game.pieces[index].pieces;
        const finished = pieces.filter(piece => piece.steps === game.trackLength + 4).length;
        return '<div class="premium-player-card ' + (index === game.currentPlayer ? 'is-active' : '') + '" style="--player-color:' + player.color + '">' +
            '<span class="player-card-orb">' + (player.isAI ? 'AI' : index + 1) + '</span>' +
            '<span class="player-card-copy"><strong>' + player.name + '</strong><small>' + (player.isAI ? 'UMĚLÁ INTELIGENCE' : 'ŽIVÝ HRÁČ') + '</small></span>' +
            '<span class="player-card-progress">' + finished + '<small>/4</small></span>' +
        '</div>';
    }).join('');
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

function animateDice(value) {
    $('dice-value').textContent = value;
    const animation = $('dice-animation');
    if (!animation || !settings.animations) return Promise.resolve();
    animation.classList.remove('hidden');
    animation.classList.add('is-rolling');
    play('dice-sound');
    return new Promise(resolve => setTimeout(() => {
        animation.classList.remove('is-rolling');
        animation.classList.add('hidden');
        resolve();
    }, 650));
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
        game = createGame(humanCount, aiCount);
    } catch (error) {
        toast(error.message);
        return;
    }
    clearTimeout(aiTimer);
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
    $('start-game-btn')?.addEventListener('click', startGame);
    $('back-to-menu-btn')?.addEventListener('click', () => showScreen('main-menu'));
    $('roll-dice-btn')?.addEventListener('click', () => doRoll(false));
    $('game-container')?.addEventListener('click', onBoardClick);
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

    $('play-btn')?.addEventListener('click', () => {
        showScreen('player-selection');
        updateSetup();
    });
    $('create-room-btn')?.addEventListener('click', () => {
        toast('Online místnosti připravíme v další etapě. Teď si můžeš zahrát lokálně.');
        showScreen('player-selection');
        updateSetup();
    });
    $('settings-btn')?.addEventListener('click', () => showScreen('settings'));
    $('rules-btn')?.addEventListener('click', () => showScreen('rules'));
    $('join-room-btn')?.addEventListener('click', () => toast('Online připojení bude doplněno v další etapě.'));
    $('create-room-btn-lobby')?.addEventListener('click', () => {
        showScreen('player-selection');
        updateSetup();
    });

    updateSetup();
}
