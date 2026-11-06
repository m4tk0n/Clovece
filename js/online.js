/**
 * Online lobby – napojení obrazovek na anonymní online API.
 * Samotné tahy se zatím nehrají online; serverová validace enginu je další krok.
 */
import { showScreen, loadScreen } from './navigation.js';
import { api, bootstrapOnline } from './online/api.js';
import { notify } from './online/notifications.js';
import { initOnlineLobbyControls } from './online/lobby-controls.js';
import { createRoomActions } from './online/room-actions.js';
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
let onlineGameControlsPromise = null;
async function initOnlineGameControls() {
    if (!onlineGameControlsPromise) {
        onlineGameControlsPromise = import('./online/game-controls.js').then(({ createOnlineGameControls }) =>
            createOnlineGameControls({
                session: onlineRuntimeState, sendGameAction, leaveRoom, api, notify, refreshGame
            })
        ).catch(error => {
            onlineGameControlsPromise = null;
            throw error;
        });
    }
    const initialize = await onlineGameControlsPromise;
    initialize();
}

window.addEventListener('clovece:game-exit', () => {
    onlineRenderRequest++;
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
        void import('./online/game-view.js').then(({ renderOnlineGame }) =>
            renderOnlineGame(data, {
                state: onlineRuntimeState, loadScreen, showScreen, initOnlineGameControls, sendGameAction
            })
        ).catch(error => {
            console.error('Online herní runtime se nepodařilo načíst:', error);
            notify('Hru se nepodařilo zobrazit: ' + error.message);
        });
        return;
    }
    renderRoomView(data, { state: onlineRuntimeState, currentInviteUrl: onlineRuntimeState.currentInviteUrl, showScreen });
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
    await loadScreen('room');
    const { initOnlineRoomControls } = await import('./online/room-controls.js');
    initOnlineRoomControls({ api, notify, session: onlineRuntimeState, refreshGame, copyInvite, leaveRoom });
    await showScreen('room');
    await refreshGame();
}


export async function initOnline() {
    initOnlineLobbyControls({ resumeMyGame, loadMyGames, createRoom, api, notify, joinRoom, schedulePoll });

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
