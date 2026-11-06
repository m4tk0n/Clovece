/**
 * Události ovládacích prvků čekající online místnosti.
 * Načítá se až poté, co se poprvé otevře obrazovka místnosti.
 */
let initialized = false;

export function initOnlineRoomControls(deps) {
    if (initialized) return;
    initialized = true;
    const { api, notify, session, refreshGame, copyInvite, leaveRoom } = deps;
    const $ = id => document.getElementById(id);

        $('room-player-settings')?.addEventListener('submit', async event => {
            event.preventDefault();
            if (!session.currentGameId) return;
            const name = $('room-player-name')?.value.trim();
            if (!name) {
                notify('Zadej zobrazované jméno.');
                return;
            }
            try {
                const result = await api('rename_participant', {
                    game_id: String(session.currentGameId),
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
            if (!session.currentGameId) return;
            try {
                await api('set_color', {
                    game_id: String(session.currentGameId),
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
            if (!session.currentGameId || !select) return;
            try {
                await api('set_color', {
                    game_id: String(session.currentGameId),
                    color: 'random'
                });
                await refreshGame();
            } catch (error) {
                notify(error.message);
                await refreshGame();
            }
        });
    
        $('add-ai-player-btn')?.addEventListener('click', async event => {
            const button = event.currentTarget;
            if (!session.currentGameId || button.disabled) return;
            button.disabled = true;
            try {
                const result = await api('add_ai_player', { game_id: String(session.currentGameId) });
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
            if (!session.currentGameId) return;
            try {
                await api('start_game', { game_id: String(session.currentGameId) });
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
            if (!message || !session.currentGameId) return;
    
            try {
                await api('send_chat', { game_id: String(session.currentGameId), message });
                input.value = '';
                await refreshGame();
            } catch (error) {
                notify(error.message);
            }
        });
    
    

}
