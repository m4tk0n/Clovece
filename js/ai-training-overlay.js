/**
 * Plovoucí výukové okno pro režim ?debug=training.
 * Zobrazuje rozhodnutí AI a ukládá pouze výslovné opravy člověka.
 */
export function initAITrainingOverlay() {
    if (document.getElementById('ai-training-panel')) return;
    const panel = document.createElement('aside');
    panel.id = 'ai-training-panel';
    panel.className = 'ai-training-panel';
    panel.setAttribute('aria-label', 'Výuka umělé inteligence');
    panel.innerHTML = `
        <div class="ai-training-header">
            <strong>VÝUKA AI</strong>
            <span id="ai-training-status">Čekám na rozhodnutí AI</span>
        </div>
        <div id="ai-training-analysis" class="ai-training-analysis" aria-live="polite">
            Až AI provede tah, zobrazím zde její rozhodnutí a vysvětlení.
        </div>
        <form id="ai-training-form" class="ai-training-form">
            <label for="ai-training-instruction">Co měla AI udělat správně a proč?</label>
            <textarea id="ai-training-instruction" rows="3" maxlength="3000"
                placeholder="Např. Měla zachránit figurku na poli 12, protože soupeř ji může příštím hodem vyhodit."></textarea>
            <div class="ai-training-actions">
                <span id="ai-training-save-status" role="status"></span>
                <button id="ai-training-submit" type="submit" disabled>ODESLAT INSTRUKCI</button>
            </div>
        </form>`;
    document.body.appendChild(panel);

    const analysis = panel.querySelector('#ai-training-analysis');
    const status = panel.querySelector('#ai-training-status');
    const saveStatus = panel.querySelector('#ai-training-save-status');
    const form = panel.querySelector('#ai-training-form');
    const input = panel.querySelector('#ai-training-instruction');
    const submit = panel.querySelector('#ai-training-submit');
    let currentDecision = null;
    let csrfToken = null;
    let saving = false;
    let savedDecisionId = null;

    const setSubmitState = () => {
        submit.disabled = saving || !currentDecision || !input.value.trim() || savedDecisionId === currentDecision?.id;
    };

    const addText = (parent, tag, className, value) => {
        const element = document.createElement(tag);
        if (className) element.className = className;
        element.textContent = String(value ?? '');
        parent.appendChild(element);
        return element;
    };

    function renderDecision(detail) {
        currentDecision = detail;
        savedDecisionId = null;
        saveStatus.textContent = '';
        analysis.replaceChildren();

        const game = detail.game || {};
        const decision = detail.decision || {};
        const result = detail.result || {};
        const player = (game.players || []).find(item => Number(item.id) === Number(game.currentPlayer));
        addText(analysis, 'div', 'ai-training-player', (detail.aiName || player?.name || 'AI') +
            ' · tah ' + (game.turnNumber ?? '—') + ' · hod ' + (game.diceValue ?? '—'));

        addText(analysis, 'div', 'ai-training-section-title', 'CO AI UDĚLALA');
        addText(analysis, 'p', 'ai-training-explanation',
            decision.explanation || 'AI zatím nemá taktické zkušenosti. Vybrala legální tah podle aktuálního způsobu výběru.');

        const selected = decision.selectedPieceId;
        if (selected !== null && selected !== undefined) {
            addText(analysis, 'p', 'ai-training-selected', 'Vybraná figurka: ' + (Number(selected) + 1));
        }

        const candidates = Array.isArray(decision.candidates) ? decision.candidates : [];
        if (candidates.length) {
            addText(analysis, 'div', 'ai-training-section-title', 'OSTATNÍ MOŽNOSTI');
            const list = document.createElement('ul');
            list.className = 'ai-training-candidates';
            candidates.forEach(candidate => {
                const chosen = Number(candidate.pieceId) === Number(selected);
                const reason = candidate.reason || candidate.reasons?.join(', ') || 'bez taktického hodnocení';
                addText(list, 'li', chosen ? 'is-selected' : '',
                    'Figurka ' + (Number(candidate.pieceId) + 1) + (chosen ? ' – vybraná' : '') + ': ' + reason);
            });
            analysis.appendChild(list);
        }

        const move = result.move || {};
        if (move.pieceId !== undefined) {
            addText(analysis, 'div', 'ai-training-section-title', 'VÝSLEDEK TAHU');
            let outcome = 'Figurka ' + (Number(move.pieceId) + 1);
            if (move.captured) outcome += move.captured.ownPiece
                ? ' – výměna vlastní figurky na startu'
                : ' – vyhození soupeřovy figurky';
            if (move.finishedNow) outcome += ' – vstup do domečku';
            const afterPlayer = (result.piecesAfter || [])[Number(game.currentPlayer)];
            const afterPiece = afterPlayer?.pieces?.[Number(move.pieceId)];
            if (afterPiece && Number.isFinite(Number(afterPiece.steps))) {
                const steps = Number(afterPiece.steps);
                const trackLength = Number(game.trackLength || game.boardSize || 40);
                const playerStart = Number(player?.start || 0);
                const destination = steps < 0 ? 'základna'
                    : steps >= trackLength ? 'domeček D' + (steps - trackLength + 1)
                        : 'pole ' + (((playerStart + steps) % trackLength) + 1);
                outcome += ' → ' + destination;
            }
            addText(analysis, 'p', 'ai-training-result', outcome);
        }

        const pieces = game.piecesBefore || [];
        if (pieces.length) {
            const snapshot = pieces.map((group, playerId) => {
                const playerName = (game.players || []).find(item => Number(item.id) === playerId)?.name || ('Hráč ' + (playerId + 1));
                return playerName + ': ' + (group.pieces || []).map((piece, pieceId) =>
                    'F' + (pieceId + 1) + '=' + (Number(piece.steps) < 0 ? 'základna' :
                        Number(piece.steps) >= Number(game.boardSize || game.trackLength) ? 'domeček' :
                            'pole ' + (((Number(playerName === '' ? 0 : (game.players || [])[playerId]?.start || 0) + Number(piece.steps)) % Number(game.boardSize || game.trackLength)) + 1))
                ).join(', ');
            }).join('\n');
            addText(analysis, 'details', 'ai-training-position', snapshot);
        }

        status.textContent = 'Rozhodnutí zaznamenáno – čekám na tvoji opravu.';
        input.value = '';
        setSubmitState();
    }

    async function getToken() {
        const response = await fetch('ai-training.php?action=token', {
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { Accept: 'application/json' }
        });
        const payload = await response.json();
        if (!response.ok || !payload.success || !payload.token) {
            throw new Error(payload.error || 'Nepodařilo se připravit bezpečné uložení instrukce.');
        }
        csrfToken = payload.token;
    }

    input.addEventListener('input', setSubmitState);
    form.addEventListener('submit', async event => {
        event.preventDefault();
        const instruction = input.value.trim();
        if (!instruction || !currentDecision || saving || savedDecisionId === currentDecision.id) return;
        saving = true;
        setSubmitState();
        saveStatus.textContent = 'Ukládám…';
        try {
            if (!csrfToken) await getToken();
            const response = await fetch('ai-training.php', {
                method: 'POST',
                credentials: 'same-origin',
                cache: 'no-store',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'X-CSRF-Token': csrfToken
                },
                body: JSON.stringify({
                    instruction,
                    context: currentDecision
                })
            });
            const payload = await response.json();
            if (!response.ok || !payload.success || !payload.id) {
                throw new Error(payload.error || 'Instrukci se nepodařilo uložit.');
            }
            savedDecisionId = currentDecision.id;
            saveStatus.textContent = 'Uloženo · ' + payload.id;
            status.textContent = 'Instrukce byla uložena jako samostatný soubor.';
            input.value = '';
        } catch (error) {
            saveStatus.textContent = error.message || 'Chyba při ukládání.';
        } finally {
            saving = false;
            setSubmitState();
        }
    });

    window.addEventListener('clovece:ai-training-decision', event => {
        const detail = event.detail;
        if (!detail || typeof detail !== 'object') return;
        detail.id = detail.id || (Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
        renderDecision(detail);
    });

    getToken().catch(error => {
        saveStatus.textContent = error.message;
    });
}
