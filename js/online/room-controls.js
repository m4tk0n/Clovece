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
    
    $('copy-invite-btn')?.addEventListener('click', copyInvite);
    $('leave-room-btn')?.addEventListener('click', leaveRoom);
}
