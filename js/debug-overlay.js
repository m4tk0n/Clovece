/**
 * Diagnostický panel aktivovaný parametrem ?debug=1.
 * Kliknutím se rozbalí/zabalí; rozšířený režim zobrazuje pořadí načítání modulů.
 */
export function initDebugOverlay() {
    if (!/(?:^|[?&])debug=1(?:&|$)/.test(window.location.search)) return null;
    if (!document.body || document.getElementById('clovece-debug-overlay')) return null;

    const panel = document.createElement('div');
    panel.id = 'clovece-debug-overlay';
    panel.className = 'clovece-debug-overlay';

    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.textContent = '+';
    toggleButton.setAttribute('aria-label', 'Rozbalit debug panel');
    toggleButton.setAttribute('aria-expanded', 'false');
    toggleButton.className = 'debug-overlay-toggle';

    const content = document.createElement('div');
    content.className = 'debug-overlay-content';
    const summary = document.createElement('div');
    summary.textContent = 'DEBUG';
    const cameraSummary = document.createElement('div');
    cameraSummary.textContent = '3D KAMERA –';
    cameraSummary.className = 'debug-overlay-camera';
    const details = document.createElement('div');
    details.className = 'debug-overlay-details';
    const aiWeights = document.createElement('div');
    aiWeights.className = 'debug-overlay-ai-weights';
    aiWeights.textContent = 'AI VÁHY: načítám…';
    content.appendChild(summary);
    content.appendChild(cameraSummary);
    content.appendChild(details);
    content.appendChild(aiWeights);
    panel.appendChild(toggleButton);
    panel.appendChild(content);
    document.body.appendChild(panel);

    let expanded = false;
    let isDragging = false;
    let dragPointerId = null;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    let dragged = false;

    // Přetažení panelu za jeho informační část; tlačítko +/− zůstává klikací.
    content.classList.add('is-draggable');
    content.addEventListener('pointerdown', event => {
        if (event.target === details || details.contains(event.target)) return;
        if (event.button !== 0 && event.pointerType !== 'touch') return;
        const rect = panel.getBoundingClientRect();
        isDragging = true;
        dragged = true;
        dragPointerId = event.pointerId;
        dragOffsetX = event.clientX - rect.left;
        dragOffsetY = event.clientY - rect.top;
        panel.style.left = Math.round(rect.left) + 'px';
        panel.style.top = Math.round(rect.top) + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
        content.classList.add('is-dragging');
        content.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    });
    content.addEventListener('pointermove', event => {
        if (!isDragging || event.pointerId !== dragPointerId) return;
        const viewport = window.visualViewport;
        const minX = viewport ? viewport.offsetLeft : 0;
        const minY = viewport ? viewport.offsetTop : 0;
        const maxX = minX + (viewport ? viewport.width : window.innerWidth) - panel.offsetWidth;
        const maxY = minY + (viewport ? viewport.height : window.innerHeight) - panel.offsetHeight;
        const left = Math.min(Math.max(minX, event.clientX - dragOffsetX), Math.max(minX, maxX));
        const top = Math.min(Math.max(minY, event.clientY - dragOffsetY), Math.max(minY, maxY));
        panel.style.left = Math.round(left) + 'px';
        panel.style.top = Math.round(top) + 'px';
    });
    const stopDragging = event => {
        if (!isDragging || (event && event.pointerId !== dragPointerId)) return;
        isDragging = false;
        dragPointerId = null;
        content.classList.remove('is-dragging');
    };
    content.addEventListener('pointerup', stopDragging);
    content.addEventListener('pointercancel', stopDragging);
    content.addEventListener('lostpointercapture', stopDragging);
    const entries = [];
    function renderLog() {
        details.textContent = entries.map((entry, index) => {
            const metrics = [];
            if (entry.duration !== null) metrics.push(entry.duration + ' ms');
            if (entry.size !== null) metrics.push(entry.size + ' kB');
            const suffix = metrics.length ? ' (' + metrics.join(', ') + ')' : '';
            return (index + 1 < 10 ? '0' : '') + (index + 1) + ' [' + entry.status + '] ' +
                entry.name + suffix;
        }).join('\n');
    }
    function toggle() {
        expanded = !expanded;
        details.classList.toggle('is-visible', expanded);
        aiWeights.classList.toggle('is-visible', expanded);
        toggleButton.textContent = expanded ? '−' : '+';
        toggleButton.setAttribute('aria-label', expanded ? 'Sbalit debug panel' : 'Rozbalit debug panel');
        toggleButton.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        updateSummary();
    }
    toggleButton.addEventListener('click', toggle);

    function updatePosition() {
        const viewport = window.visualViewport;
        if (dragged) {
            const minX = viewport ? viewport.offsetLeft : 0;
            const minY = viewport ? viewport.offsetTop : 0;
            const maxX = minX + (viewport ? viewport.width : window.innerWidth) - panel.offsetWidth;
            const maxY = minY + (viewport ? viewport.height : window.innerHeight) - panel.offsetHeight;
            const left = Math.min(Math.max(minX, panel.offsetLeft), Math.max(minX, maxX));
            const top = Math.min(Math.max(minY, panel.offsetTop), Math.max(minY, maxY));
            panel.style.left = format(left) + 'px';
            panel.style.top = format(top) + 'px';
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
        } else if (viewport) {
            const top = Math.max(2, viewport.offsetTop + viewport.height - panel.offsetHeight - 2);
            panel.style.top = format(top) + 'px';
            panel.style.bottom = 'auto';
        } else {
            panel.style.top = 'auto';
            panel.style.bottom = '2px';
        }
    }
    function updateSummary() {
        summary.textContent = 'DEBUG';
        updatePosition();
    }
    function log(name, status, duration, size) {
        entries.push({
            name: String(name),
            status: status || 'INFO',
            duration: typeof duration === 'number' ? duration : null,
            size: typeof size === 'number' ? size : null
        });
        renderLog();
        updateSummary();
    }

    async function loadAIWeightState() {
        try {
            const response = await fetch('config/ai-training-state.json?v=' + Date.now(), {
                cache: 'no-store',
                credentials: 'same-origin',
                headers: { Accept: 'application/json' }
            });
            if (!response.ok) throw new Error('HTTP ' + response.status);
            const state = await response.json();
            const keys = [
                ['immediateWin', 'Okamžitá výhra', true],
                ['ownProgress', 'Vlastní postup'],
                ['opponentSetback', 'Zdržení soupeře'],
                ['threatReduction', 'Snížení ohrožení'],
                ['captureOpponent', 'Vyhození soupeře'],
                ['captureOwn', 'Vyhození vlastní figurky'],
                ['finishPiece', 'Dokončení figurky']
            ];
            const oldWeights = state.previousWeights || state.baselineWeights || {};
            const nextWeights = state.candidateWeights || state.finalWeights || {};
            const activeWeights = state.finalWeights || state.activeWeights || {};
            const delta = state.delta || {};
            const fmt = value => Number.isFinite(value) ? Number(value).toFixed(5).replace(/\\.?0+$/, '') : '—';
            aiWeights.replaceChildren();
            const heading = document.createElement('div');
            heading.className = 'debug-ai-heading';
            heading.textContent = 'AI VÁHY · ' + (state.statusLabel || state.status || 'stav neznámý');
            aiWeights.appendChild(heading);
            const table = document.createElement('table');
            table.className = 'debug-ai-weight-table';
            const thead = document.createElement('thead');
            const head = document.createElement('tr');
            ['Váha', 'Původní', 'Kandidát', 'Rozdíl', 'Aktivní'].forEach(label => {
                const th = document.createElement('th'); th.textContent = label; head.appendChild(th);
            });
            thead.appendChild(head); table.appendChild(thead);
            const tbody = document.createElement('tbody');
            keys.forEach(([key, label, fixed]) => {
                const row = document.createElement('tr');
                const oldValue = Number(oldWeights[key]);
                const newValue = Number(nextWeights[key]);
                const activeValue = Number(activeWeights[key]);
                const change = Number(delta[key]);
                const values = [label + (fixed ? ' *' : ''), fmt(oldValue), fmt(newValue),
                    Number.isFinite(change) ? (change > 0 ? '+' : '') + fmt(change) : '—', fmt(activeValue)];
                values.forEach((value, index) => {
                    const cell = document.createElement(index === 0 ? 'th' : 'td');
                    cell.textContent = value; row.appendChild(cell);
                });
                tbody.appendChild(row);
            });
            table.appendChild(tbody);
            aiWeights.appendChild(table);
            const note = document.createElement('div');
            note.className = 'debug-ai-note';
            note.textContent = '* Okamžitá výhra má pevnou prioritu 100000 a trénink ji nemění.';
            aiWeights.appendChild(note);
            const info = document.createElement('div');
            info.className = 'debug-ai-results';
            if (state.training?.validation) {
                info.appendChild(document.createTextNode('Validace: ' + state.training.validation.improvement));
            }
            if (state.tournament) {
                const result = state.tournament;
                info.appendChild(document.createElement('br'));
                info.appendChild(document.createTextNode('Turnaj: ' + (result.accepted ? 'KANDIDÁT PŘIJAT' : 'KANDIDÁT ZAMÍTNUT') +
                    ' · ' + (result.gamesCompleted ?? 0) + ' her · výhry ' +
                    (result.candidateWins ?? 0) + '/' + (result.baselineWins ?? 0)));
                Object.entries(result.boards || {}).forEach(([board, item]) => {
                    info.appendChild(document.createElement('br'));
                    info.appendChild(document.createTextNode(board + '/' + item.playerCount + ' hráčů: ' +
                        item.candidateWins + '/' + item.gamesCompleted + ' (' +
                        Math.round(Number(item.candidateWinRate || 0) * 100) + '%), 95% dolní mez ' +
                        Math.round(Number(item.candidateWinRate95CI?.lower || 0) * 100) + '%; základ ' +
                        Math.round(Number(item.expectedRandomWinRate || 0) * 100) + '%'));
                });
            } else {
                info.appendChild(document.createTextNode('Turnaj: zatím neproběhl'));
            }
            if (state.updatedAt) {
                info.appendChild(document.createElement('br'));
                info.appendChild(document.createTextNode('Aktualizováno: ' + state.updatedAt));
            }
            aiWeights.appendChild(info);
        } catch (error) {
            aiWeights.textContent = 'AI VÁHY: report zatím není dostupný (' + error.message + ').';
        }
    }
    loadAIWeightState();

    window.addEventListener('clovece:debug-camera', event => {
        const camera = event.detail || {};
        if (camera.active === false) {
            cameraSummary.classList.remove('is-visible');
            return;
        }
        const fmt = value => Number.isFinite(value) ? Number(value).toFixed(3) : '—';
        if (![camera.x, camera.y, camera.z, camera.targetX, camera.targetY, camera.targetZ, camera.tilt].every(Number.isFinite)) return;
        cameraSummary.textContent = '3D KAMERA X ' + fmt(camera.x) + ' Y ' + fmt(camera.y) + ' Z ' + fmt(camera.z) +
            ' | NÁKLON ' + camera.tilt.toFixed(1) + '° | CÍL ' +
            fmt(camera.targetX) + ' / ' + fmt(camera.targetY) + ' / ' + fmt(camera.targetZ);
        cameraSummary.classList.add('is-visible');
    });

    window.addEventListener('clovece:debug-log', event => {
        const detail = event.detail || {};
        log(detail.name || 'Neznámá operace', detail.status || 'INFO',
            typeof detail.duration === 'number' ? detail.duration : null);
    });

    log('Debug panel inicializován', 'OK');
    updateSummary();
    return log;
}
