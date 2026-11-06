/**
 * Vykreslení seznamu hráčových online místností.
 * Načítání dat a obsluha akcí zůstávají v online controlleru.
 */
const $ = id => document.getElementById(id);

export function renderMyGames(games) {
    const container = $('my-games-list');
    if (!container) return;

    // Nemažeme a nevytváříme znovu seznam, pokud server vrátil stejná data.
    const renderKey = JSON.stringify(games);
    if (container.dataset.renderKey === renderKey) return;
    container.dataset.renderKey = renderKey;
    container.replaceChildren();
    if (!games.length) {
        const empty = document.createElement('p');
        empty.className = 'my-games-empty';
        empty.textContent = 'Zatím tu nemáš žádné čekající místnosti ani rozehrané hry.';
        container.appendChild(empty);
        return;
    }

    games.forEach(game => {
        const row = document.createElement('div');
        row.className = 'my-game-item';

        const details = document.createElement('div');
        details.className = 'my-game-details';

        const name = document.createElement('strong');
        name.textContent = 'Místnost ' + game.public_id;
        const meta = document.createElement('span');
        const status = game.status === 'waiting' ? 'Čeká na hráče'
            : game.status === 'active' ? 'Rozehraná hra' : 'Dokončeno';
        meta.textContent = status + ' · ' + game.participant_count + '/' + game.player_limit + ' hráčů';
        details.append(name, meta);

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'menu-btn small my-game-resume';
        button.dataset.gameId = String(game.id);
        button.textContent = game.status === 'finished' ? 'DOKONČENO' : 'POKRAČOVAT';
        button.disabled = game.status === 'finished';

        row.append(details, button);
        container.appendChild(row);
    });
}
