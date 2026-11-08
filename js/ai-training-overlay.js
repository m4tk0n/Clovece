/**
 * Malé plovoucí výukové okno pro režim ?debug=training.
 * Zobrazuje rozhodnutí AI a ukládá pouze výslovné opravy člověka.
 */
export function initAITrainingOverlay() {
    if (document.getElementById('ai-training-panel')) return;
    const panel = document.createElement('aside');
    panel.id = 'ai-training-panel';
    panel.className = 'ai-training-panel is-hidden';
    panel.setAttribute('aria-label', 'Výuka umělé inteligence');
    panel.innerHTML = `
        <div class="ai-training-header">
            <strong>VÝUKA AI</strong>
            <span id="ai-training-status">Čekám na rozhodnutí AI</span>
            <div class="ai-training-window-controls" aria-label="Velikost okna">
                <button id="ai-training-smaller" type="button" aria-label="Zmenšit okno" title="Zmenšit">−</button>
                <button id="ai-training-larger" type="button" aria-label="Zvětšit okno" title="Zvětšit">+</button>
            </div>
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
                <div class="ai-training-buttons">
                    <button id="ai-training-skip" type="button">PŘESKOČIT</button>
                    <button id="ai-training-submit" type="submit" disabled>ODESLAT</button>
                </div>
            </div>
        </form>`;
    document.body.appendChild(panel);

    // Stejně jako debug=1 lze malé okno uchopit za hlavičku a přesunout.
    const header = panel.querySelector('.ai-training-header');
    header.style.cursor = 'grab';
    header.style.touchAction = 'none';
    let dragging = false;
    let pointerId = null;
    let offsetX = 0;
    let offsetY = 0;
    header.addEventListener('pointerdown', event => {
        if (event.target.closest('button')) return;
        if (event.button !== 0 && event.pointerType !== 'touch') return;
        const rect = panel.getBoundingClientRect();
        dragging = true;
        pointerId = event.pointerId;
        offsetX = event.clientX - rect.left;
        offsetY = event.clientY - rect.top;
        panel.style.left = Math.round(rect.left) + 'px';
        panel.style.top = Math.round(rect.top) + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        header.style.cursor = 'grabbing';
        header.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    });
    header.addEventListener('pointermove', event => {
        if (!dragging || event.pointerId !== pointerId) return;
        const viewport = window.visualViewport;
        const minX = viewport ? viewport.offsetLeft : 0;
        const minY = viewport ? viewport.offsetTop : 0;
        const width = viewport ? viewport.width : window.innerWidth;
        const height = viewport ? viewport.height : window.innerHeight;
        const left = Math.min(Math.max(minX, event.clientX - offsetX), Math.max(minX, minX + width - panel.offsetWidth));
        const top = Math.min(Math.max(minY, event.clientY - offsetY), Math.max(minY, minY + height - panel.offsetHeight));
        panel.style.left = Math.round(left) + 'px';
        panel.style.top = Math.round(top) + 'px';
    });
    const stopDragging = event => {
        if (!dragging || (event && event.pointerId !== pointerId)) return;
        dragging = false;
        pointerId = null;
        header.style.cursor = 'grab';
    };
    header.addEventListener('pointerup', stopDragging);
    header.addEventListener('pointercancel', stopDragging);
    header.addEventListener('lostpointercapture', stopDragging);

    const analysis = panel.querySelector('#ai-training-analysis');
    const status = panel.querySelector('#ai-training-status');
    const saveStatus = panel.querySelector('#ai-training-save-status');
    const form = panel.querySelector('#ai-training-form');
    const input = panel.querySelector('#ai-training-instruction');
    const submit = panel.querySelector('#ai-training-submit');
    const skip = panel.querySelector('#ai-training-skip');
    let currentDecision = null;
    let csrfToken = null;
    let saving = false;
    let windowSize = 0;

    const setSubmitState = () => {
        submit.disabled = saving || !currentDecision || !input.value.trim();
        skip.disabled = saving || !currentDecision;
    };

    const setWindowSize = value => {
        windowSize = Math.max(0, Math.min(2, value));
        panel.dataset.size = String(windowSize);
        panel.querySelector('#ai-training-smaller').disabled = windowSize === 0;
        panel.querySelector('#ai-training-larger').disabled = windowSize === 2;
    };
    panel.querySelector('#ai-training-smaller').addEventListener('click', () => setWindowSize(windowSize - 1));
    panel.querySelector('#ai-training-larger').addEventListener('click', () => setWindowSize(windowSize + 1));
    setWindowSize(0);

    // Panel se ukáže až ve chvíli, kdy je skutečně viditelná herní deska.
    const syncBoardVisibility = () => {
        const screen = document.getElementById('game-screen');
        const board = screen?.querySelector('#game-container');
        const visible = Boolean(screen && !screen.classList.contains('hidden') &&
            board && board.childElementCount > 0 &&
            screen.getClientRects().length && board.getClientRects().length);
        panel.classList.toggle('is-hidden', !visible);
    };
    const visibilityObserver = new MutationObserver(syncBoardVisibility);
    visibilityObserver.observe(document.documentElement, {
        subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style']
    });
    window.addEventListener('resize', syncBoardVisibility, { passive: true });
    syncBoardVisibility();

    const addText = (parent, tag, className, value) => {
        const element = document.createElement(tag);
        if (className) element.className = className;
        element.textContent = String(value ?? '');
        parent.appendChild(element);
        return element;
    };

    function renderDecision(detail) {
        currentDecision = detail;
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
                            'pole ' + ((((game.players || [])[playerId]?.start || 0) + Number(piece.steps)) % Number(game.boardSize || game.trackLength) + 1))
                ).join(', ');
            }).join('\\n');
            addText(analysis, 'details', 'ai-training-position', snapshot);
        }

        status.textContent = 'Rozhodnutí zaznamenáno – čekám na tvoji opravu.';
        input.value = '';
        setSubmitState();
        syncBoardVisibility();
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
    skip.addEventListener('click', () => {
        if (!currentDecision || saving) return;
        currentDecision = null;
        input.value = '';
        saveStatus.textContent = 'Bez instrukce – nic nebylo uloženo.';
        status.textContent = 'Rozhodnutí přeskočeno.';
        setSubmitState();
    });
    form.addEventListener('submit', async event => {
        event.preventDefault();
        const instruction = input.value.trim();
        if (!instruction || !currentDecision || saving) return;
        const decisionToSave = currentDecision;
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
                    context: decisionToSave
                })
            });
            const payload = await response.json();
            if (!response.ok || !payload.success || !payload.id) {
                throw new Error(payload.error || 'Instrukci se nepodařilo uložit.');
            }
            currentDecision = null;
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
