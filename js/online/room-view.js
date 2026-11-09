// /js/online/room-view.js
/**
 * Vykreslení čekající online místnosti a seznamu účastníků.
 * Síťové akce zůstávají v online controlleru.
 */
import { renderChat } from './chat-view.js';
const $ = id => document.getElementById(id);

export function renderRoomView(data, deps) {
    const { state, currentInviteUrl, showScreen } = deps;
    const game = data.game;
    const participants = data.participants || [];

    state.onlineRenderRequest++;
    state.onlineMode = false;
    $('win-modal')?.classList.add('hidden');
    showScreen('room');
    $('room-code-display')?.replaceChildren(document.createTextNode(game.public_id));
    if ($('room-invite-url')) $('room-invite-url').value = currentInviteUrl;

    const status = game.status === 'waiting' ? 'Čeká na hráče' : game.status;
    if ($('room-status-display')) {
        $('room-status-display').textContent = status + ' · ' + participants.length + '/' + game.player_limit;
    }

    const list = $('participant-list');
    if (list) {
        const participantKey = JSON.stringify(participants.map(player => ({
            id: player.id,
            display_name: player.display_name,
            color: player.color,
            player_type: player.player_type
        })));
        if (list.dataset.renderKey !== participantKey) {
            list.dataset.renderKey = participantKey;
            list.replaceChildren();
            participants.forEach(player => {
            const row = document.createElement('div');
            row.className = 'participant-item';
            const dot = document.createElement('span');
            dot.className = 'participant-color';
            dot.style.backgroundColor = player.color === 'random' ? '#778196' : player.color;
            const name = document.createElement('span');
            name.textContent = player.display_name;
            const type = document.createElement('small');
            const ownerLabel = player.player_type === 'ai' ? 'POČÍTAČ'
                : (Number(player.id) === Number(data.current_participant_id) ? 'TY' : 'HRÁČ');
            type.textContent = player.color === 'random' && player.player_type !== 'ai' ? ownerLabel + ' · NÁHODNÁ' : ownerLabel;
            row.append(dot, name, type);
            list.appendChild(row);
            });
        }
    }

    const ownParticipant = participants.find(player =>
        Number(player.id) === Number(data.current_participant_id)
    );
    const nameInput = $('room-player-name');
    if (nameInput && document.activeElement !== nameInput && ownParticipant) {
        nameInput.value = ownParticipant.display_name;
    }

    const colorSelect = $('room-player-color');
    if (colorSelect && ownParticipant) {
        const usedByOthers = new Set(participants
            .filter(player => Number(player.id) !== Number(data.current_participant_id))
            .map(player => player.color));
        const colorKey = JSON.stringify({
            ownColor: ownParticipant.color,
            usedByOthers: [...usedByOthers].sort()
        });
        if (document.activeElement !== colorSelect && colorSelect.dataset.renderKey !== colorKey) {
            colorSelect.dataset.renderKey = colorKey;
            colorSelect.replaceChildren();
            const randomOption = document.createElement('option');
            randomOption.value = 'random';
            randomOption.textContent = 'Náhodná';
            randomOption.selected = ownParticipant.color === 'random';
            colorSelect.appendChild(randomOption);

            ["#E53935","#1E88E5","#43A047","#F9A825","#FB8C00","#8E24AA","#00ACC1","#D81B60"].forEach((color, index) => {
                const option = document.createElement('option');
                option.value = color;
                option.textContent = ["Červená","Modrá","Zelená","Žlutá","Oranžová","Fialová","Tyrkysová","Růžová"][index];
                option.disabled = usedByOthers.has(color);
                option.selected = color === ownParticipant.color;
                colorSelect.appendChild(option);
            });
        }
        colorSelect.disabled = game.status !== 'waiting';
    }
    $('room-player-settings')?.classList.toggle('hidden', !ownParticipant);
    $('random-room-color-btn')?.classList.toggle('hidden', game.status !== 'waiting');

    $('ready-btn')?.classList.add('hidden');
    $('add-ai-player-btn')?.classList.toggle('hidden', !data.is_creator || participants.length >= Number(game.player_limit) || game.status !== 'waiting');
    $('room-start-game-btn')?.classList.toggle(
        'hidden',
        !data.is_creator || Number(data.human_count || 0) < 2 || participants.length < 2 || game.status !== 'waiting'
    );
    renderChat(data.chat || [], participants);
}
