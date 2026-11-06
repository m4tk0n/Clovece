/**
 * Online lobby – napojení obrazovek na anonymní online API.
 * Samotné tahy se zatím nehrají online; serverová validace enginu je další krok.
 */
import { showScreen } from './navigation.js';
import { api, bootstrapOnline } from './online/api.js';
import { notify } from './online/notifications.js';
import { createRoomActions } from './online/room-actions.js';
import { loadOnlineGameRuntime, resetOnlineGameRuntime } from './online/game-runtime.js';
import { renderOnlineGame } from './online/game-view.js';
import { renderRoomView } from './online/room-view.js';

const $ = id => document.getElementById(id);



let pollTimer = null;
let pollInFlight = false;

let onlineState = null;
let currentGameId = null;
let currentInviteUrl = '';
let onlineStateVersion = 0;
let autoMoveVersion = -1;
let currentPlayerIndex = -1;
let onlineMode = false;

let onlineRenderRequest = 0;
const onlineRuntimeState = {
    get currentGameId() { return currentGameId; },
    set currentGameId(value) { currentGameId = value; },
    get currentInviteUrl() { return currentInviteUrl; },
    set currentInviteUrl(value) { currentInviteUrl = value; },
    get onlineRenderRequest() { return onlineRenderRequest; },
    set onlineRenderRequest(value) { onlineRenderRequest = value; },
    get onlineState() { return onlineState; },
    set onlineState(value) { onlineState = value; },
    get onlineStateVersion() { return onlineStateVersion; },
    set onlineStateVersion(value) { onlineStateVersion = value; },
    get currentPlayerIndex() { return currentPlayerIndex; },
    set currentPlayerIndex(value) { currentPlayerIndex = value; },
    get onlineMode() { return onlineMode; },
    set onlineMode(value) { onlineMode = value; },
    get autoMoveVersion() { return autoMoveVersion; },
    set autoMoveVersion(value) { autoMoveVersion = value; }
};
const roomActions = createRoomActions({
    $,
    api,
    notify,
    session: onlineRuntimeState,
    bootstrapOnline,
    showScreen,
    refreshGame,
    openGame,
    stopPolling
});
const { loadMyGames, resumeMyGame, savePlayerName, joinRoom, createRoom, copyInvite, leaveRoom } = roomActions;

window.addEventListener('clovece:game-exit', () => {
    onlineRenderRequest++;
    resetOnlineGameRuntime();
});

function stopPolling() {
    if (pollTimer !== null) {
        clearTimeout(pollTimer);
        pollTimer = null;
    }
}

function schedulePoll() {
    stopPolling();
    if (!onlineRuntimeState.currentGameId) return;
    pollTimer = window.setTimeout(refreshGame, document.hidden ? 8000 : 3000);
}

function renderGame(data) {
    const game = data.game;
    if (['active', 'finished'].includes(game.status) && game.state) {
        void renderOnlineGame(data, {
            state: onlineRuntimeState, loadScreen, showScreen, initOnlineGameControls,
            loadOnlineGameRuntime, sendGameAction
        }).catch(error => {
            console.error('Online herní runtime se nepodařilo načíst:', error);
            notify('Hru se nepodařilo zobrazit: ' + error.message);
        });
        return;
    }
    renderRoomView(data, { state: onlineRuntimeState, onlineRuntimeState.currentInviteUrl, showScreen });
}

async function sendGameAction(actionType, pieceId = null) {
    if (!onlineRuntimeState.currentGameId || !onlineState) return;
    const values = {
        game_id: String(onlineRuntimeState.currentGameId),
        expected_version: String(onlineStateVersion),
        request_id: crypto.randomUUID(),
        action_type: actionType,
    };
    if (pieceId !== null) values.piece_id = String(pieceId);

    try {
        await api('game_action', values);
        await refreshGame();
    } catch (error) {
        notify(error.message);
        await refreshGame();
    }
}

async function refreshGame() {
    if (!onlineRuntimeState.currentGameId || pollInFlight) return;
    pollInFlight = true;
    try {
        const data = await api('get_game', { game_id: String(onlineRuntimeState.currentGameId) });
        renderGame(data);
    } catch (error) {
        notify(error.message);
        stopPolling();
    } finally {
        pollInFlight = false;
        schedulePoll();
    }
}

async function openGame(gameId, inviteUrl = '') {
    onlineRuntimeState.currentGameId = Number(gameId);
    onlineRuntimeState.currentInviteUrl = inviteUrl;
    showScreen('room');
    await refreshGame();
}


let onlineGameControlsInitialized = false;

function initOnlineGameControls() {
    if (onlineGameControlsInitialized) return;
    onlineGameControlsInitialized = true;

    $('roll-dice-btn')?.addEventListener('click', () => {
        if (!onlineMode) return;
        void sendGameAction(onlineState?.phase === 'start-roll' ? 'start_roll' : 'roll');
    });
    $('end-turn-btn')?.addEventListener('click', () => {
        if (onlineMode) void sendGameAction('pass_turn');
    });
    $('game-container')?.addEventListener('click', event => {
        if (!onlineMode || !onlineState || onlineState.phase !== 'move') return;
        const piece = event.target.closest('[data-player][data-piece]');
        if (!piece) return;
        const playerId = Number(piece.dataset.player);
        const pieceId = Number(piece.dataset.piece);
        if (playerId !== currentPlayerIndex || playerId !== onlineState.currentPlayer) return;
        void sendGameAction('move', pieceId);
    });
    $('quit-btn')?.addEventListener('click', event => {
        if (!onlineMode) return;
        event.stopImmediatePropagation();
        void leaveRoom();
    });
    $('close-win-btn')?.addEventListener('click', event => {
        if (!onlineMode) return;
        event.stopImmediatePropagation();
        void leaveRoom();
    });

    $('chat-form')?.addEventListener('submit', async event => {
        if (!onlineMode) return;
        event.preventDefault();
        const input = $('chat-input');
        const message = input?.value.trim();
        if (!message || !onlineRuntimeState.currentGameId) return;
        try {
            await api('send_chat', { game_id: String(onlineRuntimeState.currentGameId), message });
            input.value = '';
            await refreshGame();
        } catch (error) {
            notify(error.message);
        }
    });
}

export async function initOnline() {
    $('my-games-list')?.addEventListener('click', event => {
        const button = event.target.closest?.('[data-game-id]');
        if (!button || button.disabled) return;
        void resumeMyGame(button.dataset.gameId, button);
    });
    document.addEventListener('click', event => {
        if (event.target.closest?.('#back-from-room, #back-from-lobby')) {
            window.setTimeout(() => void loadMyGames(), 0);
        }
    });

    // Delegované navázání: funguje i při změně vnitřní struktury tlačítka.
    document.addEventListener('click', event => {
        const button = event.target.closest?.('#create-room-btn-lobby');
        if (!button) return;
        event.preventDefault();
        void createRoom(button);
    }, true);
    // Tlačítko pro připojení obsluhuje navigation.js přes window.joinRoom().
    $('room-player-settings')?.addEventListener('submit', async event => {
        event.preventDefault();
        if (!onlineRuntimeState.currentGameId) return;
        const name = $('room-player-name')?.value.trim();
        if (!name) {
            notify('Zadej zobrazované jméno.');
            return;
        }
        try {
            const result = await api('rename_participant', {
                game_id: String(onlineRuntimeState.currentGameId),
                display_name: name
            });
            const identityName = $('online-player-name');
            if (identityName) identityName.value = result.display_name;
            await refreshGame();
            notify('Tvoje jméno bylo změněno.');
        } catch (error) {
            notify(error.message);
            await refreshGame();
        }
    });
    $('room-player-color')?.addEventListener('change', async event => {
        if (!onlineRuntimeState.currentGameId) return;
        try {
            await api('set_color', {
                game_id: String(onlineRuntimeState.currentGameId),
                color: event.target.value
            });
            await refreshGame();
        } catch (error) {
            notify(error.message);
            await refreshGame();
        }
    });
    $('random-room-color-btn')?.addEventListener('click', async () => {
        const select = $('room-player-color');
        if (!onlineRuntimeState.currentGameId || !select) return;
        try {
            await api('set_color', {
                game_id: String(onlineRuntimeState.currentGameId),
                color: 'random'
            });
            await refreshGame();
        } catch (error) {
            notify(error.message);
            await refreshGame();
        }
    });
    $('create-transfer-code-btn')?.addEventListener('click', async event => {
        const button = event.currentTarget;
        if (button.disabled) return;
        button.disabled = true;
        try {
            const result = await api('create_transfer_code');
            const output = $('transfer-code-output');
            if (output) {
                output.value = result.transfer_code;
                output.focus();
                output.select();
            }
            try {
                await navigator.clipboard.writeText(result.transfer_code);
                notify('Přenosový kód byl vytvořen a zkopírován. Platí 15 minut.');
            } catch {
                notify('Přenosový kód je připraven. Zkopíruj ho a zadej na druhém zařízení.');
            }
        } catch (error) {
            notify('Kód se nepodařilo vytvořit: ' + error.message);
        } finally {
            button.disabled = false;
        }
    });
    $('claim-transfer-code-btn')?.addEventListener('click', async event => {
        const button = event.currentTarget;
        const input = $('transfer-code-input');
        const code = input?.value.trim() || '';
        if (!code) {
            notify('Nejprve vlož přenosový kód.');
            return;
        }
        button.disabled = true;
        try {
            await api('claim_transfer_code', { transfer_code: code });
            notify('Identita byla převedena. Obnovuji aplikaci…');
            window.setTimeout(() => window.location.reload(), 500);
        } catch (error) {
            notify('Přenos identity se nepodařil: ' + error.message);
            button.disabled = false;
        }
    });

    $('add-ai-player-btn')?.addEventListener('click', async event => {
        const button = event.currentTarget;
        if (!onlineRuntimeState.currentGameId || button.disabled) return;
        button.disabled = true;
        try {
            const result = await api('add_ai_player', { game_id: String(onlineRuntimeState.currentGameId) });
            notify(result.display_name + ' byl přidán do místnosti.');
            await refreshGame();
        } catch (error) {
            notify('AI hráče se nepodařilo přidat: ' + error.message);
        } finally {
            button.disabled = false;
        }
    });
    $('copy-invite-btn')?.addEventListener('click', copyInvite);
    $('room-start-game-btn')?.addEventListener('click', async () => {
        if (!onlineRuntimeState.currentGameId) return;
        try {
            await api('start_game', { game_id: String(onlineRuntimeState.currentGameId) });
            await refreshGame();
        } catch (error) {
            notify(error.message);
        }
    });
    $('leave-room-btn')?.addEventListener('click', leaveRoom);
    $('room-chat-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        const input = $('room-chat-input');
        const message = input?.value.trim();
        if (!message || !onlineRuntimeState.currentGameId) return;

        try {
            await api('send_chat', { game_id: String(onlineRuntimeState.currentGameId), message });
            input.value = '';
            await refreshGame();
        } catch (error) {
            notify(error.message);
        }
    });

    window.joinRoom = joinRoom;
    document.addEventListener('visibilitychange', schedulePoll);

    try {
        const identity = await bootstrapOnline();
        const nameField = $('online-player-name');
        if (nameField && !nameField.value) nameField.value = identity.identity?.display_name || 'Hráč';
        await loadMyGames();
        const invite = new URLSearchParams(window.location.search).get('invite');
        if (invite) {
            showScreen('lobby');
            await joinRoom(invite);
        }
    } catch (error) {
        console.error('Online bootstrap:', error);
        notify('Online část se nepodařilo připojit: ' + error.message);
    }
}
