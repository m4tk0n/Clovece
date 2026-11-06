/**
 * Online lobby – napojení obrazovek na anonymní online API.
 * Samotné tahy se zatím nehrají online; serverová validace enginu je další krok.
 */
import { showScreen, loadScreen } from './navigation.js';
import { renderChat } from './online/chat-view.js';
import { renderMyGames } from './online/my-games-view.js';
import { loadOnlineGameRuntime, resetOnlineGameRuntime } from './online/game-runtime.js';
import { renderOnlineGame } from './online/game-view.js';
import { renderRoomView } from './online/room-view.js';

const $ = id => document.getElementById(id);
const API_URL = 'online-api.php';

let csrfToken = '';
let currentGameId = null;
let currentInviteUrl = '';
let pollTimer = null;
let pollInFlight = false;
let bootstrapPromise = Promise.resolve();
let onlineState = null;
let onlineStateVersion = 0;
let autoMoveVersion = -1;
let currentPlayerIndex = -1;
let onlineMode = false;

let onlineRenderRequest = 0;
const onlineRuntimeState = {
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
window.addEventListener('clovece:game-exit', () => {
    onlineRenderRequest++;
    resetOnlineGameRuntime();
});

async function api(action, values = {}) {
    await bootstrapPromise;
    if (!csrfToken) throw new Error('Online identita není připravená. Obnov stránku.');
    const body = new URLSearchParams({ action, ...values });
    if (csrfToken) body.set('csrf_token', csrfToken);

    const response = await fetch(API_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body
    });

    let result;
    try {
        result = await response.json();
    } catch {
        throw new Error('Server vrátil neplatnou odpověď.');
    }

    if (!response.ok || result.success !== true) {
        throw new Error(result.error || 'Požadavek se nepodařilo dokončit.');
    }
    return result;
}

function notify(message) {
    const toast = $('toast');
    const target = $('toast-message');
    if (toast && target) {
        target.textContent = message;
        toast.classList.remove('hidden');
        clearTimeout(toast._hideTimer);
        toast._hideTimer = setTimeout(() => toast.classList.add('hidden'), 3200);
    } else {
        window.alert(message);
    }
}

function stopPolling() {
    if (pollTimer !== null) {
        clearTimeout(pollTimer);
        pollTimer = null;
    }
}

function schedulePoll() {
    stopPolling();
    if (!currentGameId) return;
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
    renderRoomView(data, { state: onlineRuntimeState, currentInviteUrl, showScreen });
}

async function sendGameAction(actionType, pieceId = null) {
    if (!currentGameId || !onlineState) return;
    const values = {
        game_id: String(currentGameId),
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
    if (!currentGameId || pollInFlight) return;
    pollInFlight = true;
    try {
        const data = await api('get_game', { game_id: String(currentGameId) });
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
    currentGameId = Number(gameId);
    currentInviteUrl = inviteUrl;
    showScreen('room');
    await refreshGame();
}


async function loadMyGames() {
    const container = $('my-games-list');
    if (!container) return;
    try {
        const result = await api('list_my_games');
        renderMyGames(result.games || []);
    } catch (error) {
        container.textContent = 'Seznam her se nepodařilo načíst: ' + error.message;
    }
}

async function resumeMyGame(gameId, button) {
    if (button) button.disabled = true;
    try {
        const result = await api('resume_game', { game_id: String(gameId) });
        const inviteUrl = result.invite_url
            ? new URL(result.invite_url, window.location.href).toString()
            : '';
        const url = new URL(window.location.href);
        url.searchParams.delete('invite');
        history.replaceState({}, '', url);
        await openGame(result.game_id, inviteUrl);
    } catch (error) {
        notify(error.message);
        await loadMyGames();
    } finally {
        if (button) button.disabled = false;
    }
}

async function savePlayerName() {
    await bootstrapPromise;
    const name = $('online-player-name')?.value.trim();
    if (name) await api('set_name', { display_name: name });
}

function extractInviteToken(value) {
    const text = String(value || '').trim();
    if (!text) return '';

    try {
        const url = new URL(text, window.location.href);
        const token = url.searchParams.get('invite');
        if (token) return token;
    } catch {
        // Vstup může být přímo token, nikoli URL.
    }

    return /^[A-Za-z0-9_-]{40,60}$/.test(text) ? text : '';
}

async function joinRoom(value) {
    const inviteToken = extractInviteToken(value);
    if (!inviteToken) {
        notify('Vlož celý pozvánkový odkaz nebo jeho token. Samotný starý kód místnosti není podporován.');
        return;
    }

    try {
        await savePlayerName();
        const result = await api('join_game', { invite_token: inviteToken });
        const url = new URL(window.location.href);
        url.search = '';
        url.searchParams.set('invite', inviteToken);
        history.replaceState({}, '', url);
        await openGame(result.game_id, url.toString());
    } catch (error) {
        notify(error.message);
    }
}

async function createRoom(button = $('create-room-btn-lobby')) {
    if (button?.dataset.creating === '1') return;

    const select = $('online-player-limit');
    const playerLimit = Number(select?.value || 4);
    const label = button?.querySelector('span');
    const originalLabel = label?.textContent || 'VYTVOŘIT NOVOU MÍSTNOST';

    if (button) {
        button.dataset.creating = '1';
        button.disabled = true;
        if (label) label.textContent = 'VYTVÁŘÍM MÍSTNOST…';
    }

    try {
        await savePlayerName();
        const result = await api('create_game', { player_limit: String(playerLimit) });
        const inviteUrl = new URL(result.invite_url, window.location.href).toString();
        await openGame(result.game_id, inviteUrl);
        notify('Místnost byla vytvořena. Zkopíruj pozvánku a pošli ji ostatním hráčům.');
    } catch (error) {
        console.error('Vytvoření online místnosti selhalo:', error);
        notify('Místnost se nepodařilo vytvořit: ' + error.message);
    } finally {
        if (button) {
            button.disabled = false;
            delete button.dataset.creating;
        }
        if (label) label.textContent = originalLabel;
    }
}

async function copyInvite() {
    if (!currentInviteUrl) {
        notify('Pozvánkový odkaz zatím není k dispozici.');
        return;
    }

    try {
        await navigator.clipboard.writeText(currentInviteUrl);
        notify('Pozvánkový odkaz zkopírován.');
    } catch {
        const field = $('room-invite-url');
        if (field) {
            field.value = currentInviteUrl;
            field.focus();
            field.select();
            notify('Označil jsem odkaz. Zkopíruj ho pomocí nabídky telefonu.');
        }
    }
}

async function leaveRoom() {
    if (!currentGameId) {
        showScreen('lobby');
        return;
    }

    try {
        await api('leave_game', { game_id: String(currentGameId) });
        currentGameId = null;
        currentInviteUrl = '';
        onlineState = null;
        onlineMode = false;
        stopPolling();
        showScreen('lobby');
        await loadMyGames();
    } catch (error) {
        notify(error.message);
    }
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
        if (!message || !currentGameId) return;
        try {
            await api('send_chat', { game_id: String(currentGameId), message });
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
        if (!currentGameId) return;
        const name = $('room-player-name')?.value.trim();
        if (!name) {
            notify('Zadej zobrazované jméno.');
            return;
        }
        try {
            const result = await api('rename_participant', {
                game_id: String(currentGameId),
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
        if (!currentGameId) return;
        try {
            await api('set_color', {
                game_id: String(currentGameId),
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
        if (!currentGameId || !select) return;
        try {
            await api('set_color', {
                game_id: String(currentGameId),
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
        if (!currentGameId || button.disabled) return;
        button.disabled = true;
        try {
            const result = await api('add_ai_player', { game_id: String(currentGameId) });
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
        if (!currentGameId) return;
        try {
            await api('start_game', { game_id: String(currentGameId) });
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
        if (!message || !currentGameId) return;

        try {
            await api('send_chat', { game_id: String(currentGameId), message });
            input.value = '';
            await refreshGame();
        } catch (error) {
            notify(error.message);
        }
    });

    window.joinRoom = joinRoom;
    document.addEventListener('visibilitychange', schedulePoll);

    bootstrapPromise = (async () => {
        const response = await fetch(API_URL + '?action=bootstrap', {
            credentials: 'same-origin',
            cache: 'no-store'
        });
        const data = await response.json();
        if (!response.ok || data.success !== true) {
            throw new Error(data.error || 'Nepodařilo se připravit anonymní identitu.');
        }
        csrfToken = data.csrf_token || '';
        if (!csrfToken) throw new Error('Server neposlal bezpečnostní token.');
        const nameField = $('online-player-name');
        if (nameField && !nameField.value) nameField.value = data.identity?.display_name || 'Hráč';
        return data;
    })();

    try {
        await bootstrapPromise;
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
