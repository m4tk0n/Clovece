// /js/online/game-view.js
/**
 * Vykreslení aktivní online hry.
 * Síťové požadavky a životní cyklus relace zajišťuje online controller.
 */
import { renderGameChat } from './chat-view.js';
import { loadOnlineGameRuntime } from './game-runtime.js';
const $ = id => document.getElementById(id);

export async function renderOnlineGame(data, deps) {
    const { state, loadScreen, showScreen, initOnlineGameControls, sendGameAction } = deps;
    const requestId = ++state.onlineRenderRequest;
    await loadScreen('game');
    if (requestId !== state.onlineRenderRequest) return;
    await showScreen('game');
    await initOnlineGameControls();
    const game = data.game;
    const runtime = await loadOnlineGameRuntime();
    if (requestId !== state.onlineRenderRequest) return;
    try {
        await runtime.ensureModeStyles(runtime.getBoardView());
    } catch (error) {
        console.error('Herní CSS online hry se nepodařilo připravit:', error);
    }
    if (requestId !== state.onlineRenderRequest) return;
    const previousState = state.onlineState;
    const previousVersion = state.onlineStateVersion;
    const hasNewRoll = Boolean(
        previousState &&
        Number(game.state_version) > previousVersion &&
        previousState.phase === 'roll' &&
        ['move', 'no-move', 'roll'].includes(game.state.phase)
    );

    state.onlineState = game.state;
    state.onlineStateVersion = Number(game.state_version);
    state.currentPlayerIndex = Number(data.current_player_index);
    state.onlineMode = true;

    if (!state.onlineState) return;
    runtime.renderBoard($('game-container'), state.onlineState);

    // Animaci a zvuk spustíme pouze při přechodu po novém online hodu.
    const forcedMove = hasNewRoll && state.currentPlayerIndex === Number(state.onlineState.currentPlayer)
        ? runtime.getForcedMove(state.onlineState)
        : null;
    if (hasNewRoll && state.onlineState.diceValue) {
        const rollVersion = state.onlineStateVersion;
        void runtime.animateDice(state.onlineState.diceValue).then(() => {
            if (forcedMove !== null && state.autoMoveVersion !== rollVersion) {
                state.autoMoveVersion = rollVersion;
                if (state.onlineStateVersion === rollVersion && state.onlineState?.phase === 'move') {
                    void sendGameAction('move', forcedMove);
                }
            }
        });
    }

    const player = state.onlineState.players[state.onlineState.currentPlayer];
    const ownTurn = state.currentPlayerIndex === Number(state.onlineState.currentPlayer);
    $('current-player-name').textContent = player.name;
    $('current-player-display')?.style.setProperty('--player-color', player.color);
    $('dice-value').textContent = state.onlineState.diceValue || '—';

    let status = 'Čeká se na tah.';
    if (state.onlineState.phase === 'start-roll') {
        status = ownTurn ? 'Rozstřel: jsi na řadě. Hoď kostkou.' : 'Rozstřel: hází ' + player.name + '.';
    } else if (state.onlineState.phase === 'roll') {
        const pieces = state.onlineState.pieces?.[state.onlineState.currentPlayer]?.pieces || [];
        const retry = pieces.length === 4 && pieces.every(piece => Number(piece.steps) === -1) && Number(state.onlineState.baseRollAttempts) > 0;
        status = ownTurn ? 'Jsi na tahu. Hoď kostkou' + (retry ? ' (pokus ' + (Number(state.onlineState.baseRollAttempts) + 1) + '/3 o šestku)' : '') + '.' : 'Na tahu je ' + player.name + '.';
    } else if (state.onlineState.phase === 'move') {
        status = ownTurn ? 'Vyber figurku, kterou chceš posunout.' : player.name + ' vybírá figurku.';
    } else if (state.onlineState.phase === 'no-move') {
        status = ownTurn ? 'Nemáš platný tah. Přeskoč tah.' : player.name + ' nemá platný tah.';
    } else if (state.onlineState.phase === 'finished') {
        status = player.name + ' vyhrál.';
    }
    $('game-status').textContent = status;

    const rollButton = $('roll-dice-btn');
    const canRoll = ownTurn && ['start-roll', 'roll'].includes(state.onlineState.phase);
    rollButton?.classList.toggle('hidden', !canRoll);
    if (rollButton) {
        rollButton.disabled = !canRoll;
        const label = rollButton.querySelector('span');
        if (label) label.textContent = state.onlineState.phase === 'start-roll' ? 'HODIT ROZSTŘEL' : 'HODIT';
    }

    const passButton = $('end-turn-btn');
    passButton?.classList.toggle('hidden', !ownTurn || state.onlineState.phase !== 'no-move');
    if (passButton) {
        passButton.disabled = !ownTurn || state.onlineState.phase !== 'no-move';
        const label = passButton.querySelector('span');
        if (label) label.textContent = 'PŘESKOČIT TAH';
    }

    $('restart-btn')?.classList.add('hidden');
    renderGameChat(data.chat || [], data.participants || [], data.moves || []);

    const winModal = $('win-modal');
    if (state.onlineState.winner !== null && winModal) {
        const winner = state.onlineState.players[state.onlineState.winner];
        $('winner-name').textContent = winner.name;
        $('win-title').textContent = 'VÍTĚZSTVÍ!';
        $('win-message').textContent = winner.name + ' dostal všechny čtyři figurky domů.';
        winModal.classList.remove('hidden');
    } else {
        winModal?.classList.add('hidden');
    }
}
