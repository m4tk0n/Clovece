/**
 * Ovládací prvky online lobby.
 * Tento modul se načte při prvním otevření lobby, nikoli při startu aplikace.
 */
let initialized = false;

export function initOnlineLobbyControls(deps) {
    if (initialized) return;
    initialized = true;
    const { resumeMyGame, loadMyGames, createRoom, api, notify, joinRoom, schedulePoll } = deps;
    const $ = id => document.getElementById(id);

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

    window.joinRoom = joinRoom;
    document.addEventListener('visibilitychange', schedulePoll);


}
