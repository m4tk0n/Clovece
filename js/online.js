/**
 * Online lobby – napojení obrazovek na anonymní online API.
 * Samotné tahy se zatím nehrají online; serverová validace enginu je další krok.
 */
import { showScreen } from './navigation.js';

const $ = id => document.getElementById(id);
const API_URL = 'online-api.php';

let csrfToken = '';
let currentGameId = null;
let currentInviteUrl = '';
let pollTimer = null;
let pollInFlight = false;

async function api(action, values = {}) {
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

function renderChat(messages, participants) {
    const container = $('room-chat-messages');
    if (!container) return;

    const names = new Map(participants.map(player => [
        Number(player.id),
        player.display_name
    ]));

    container.replaceChildren();
    messages.forEach(message => {
        const line = document.createElement('div');
        line.className = 'chat-message';

        const sender = document.createElement('strong');
        sender.textContent = (names.get(Number(message.participant_id)) || 'Hráč') + ': ';

        const body = document.createElement('span');
        body.textContent = message.message;

        line.append(sender, body);
        container.appendChild(line);
    });
    container.scrollTop = container.scrollHeight;
}

function renderGame(data) {
    const game = data.game;
    const participants = data.participants || [];

    $('room-code-display')?.replaceChildren(
        document.createTextNode(currentInviteUrl || game.public_id)
    );

    const status = game.status === 'waiting'
        ? 'Čeká na hráče'
        : game.status === 'active'
            ? 'Probíhá'
            : game.status;

    if ($('room-status-display')) {
        $('room-status-display').textContent =
            status + ' · ' + participants.length + '/' + game.player_limit;
    }

    const list = $('participant-list');
    if (list) {
        list.replaceChildren();
        participants.forEach(player => {
            const row = document.createElement('div');
            row.className = 'participant-item';

            const dot = document.createElement('span');
            dot.className = 'participant-color';
            dot.style.backgroundColor = player.color;

            const name = document.createElement('span');
            name.textContent = player.display_name;

            const type = document.createElement('small');
            type.textContent = Number(player.id) === Number(data.current_participant_id)
                ? 'TY'
                : 'HRÁČ';

            row.append(dot, name, type);
            list.appendChild(row);
        });
    }

    // Tlačítka pro start a připravenost zůstávají skrytá do dokončení serverového enginu.
    $('ready-btn')?.classList.add('hidden');
    $('room-start-game-btn')?.classList.add('hidden');
    renderChat(data.chat || [], participants);
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

async function createRoom() {
    const select = $('online-player-limit');
    const playerLimit = Number(select?.value || 4);

    try {
        const result = await api('create_game', { player_limit: String(playerLimit) });
        const inviteUrl = new URL(result.invite_url, window.location.href).toString();
        await openGame(result.game_id, inviteUrl);
        notify('Místnost byla vytvořena. Zkopíruj pozvánku a pošli ji ostatním hráčům.');
    } catch (error) {
        notify(error.message);
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
        stopPolling();
        showScreen('lobby');
    } catch (error) {
        notify(error.message);
    }
}

export async function initOnline() {
    $('join-room-btn')?.addEventListener('click', () => showScreen('lobby'));
    $('create-room-btn-lobby')?.addEventListener('click', createRoom);
    $('join-room-btn-lobby')?.addEventListener('click', event => {
        event.preventDefault();
        joinRoom($('room-code-input')?.value);
    });
    $('copy-invite-btn')?.addEventListener('click', copyInvite);
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

    try {
        const response = await fetch(API_URL + '?action=bootstrap', {
            credentials: 'same-origin',
            cache: 'no-store'
        });
        const data = await response.json();
        if (!response.ok || data.success !== true) {
            throw new Error(data.error || 'Nepodařilo se připravit anonymní identitu.');
        }
        csrfToken = data.csrf_token || '';

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
