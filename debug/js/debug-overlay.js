/**
 * Diagnostický panel aktivovaný pouze v režimu ?debug=1.
 * Zobrazuje deset aktivních strategických vah a stav tréninku.
 */
import { AI_WEIGHT_DEFINITIONS, getAIWeightValues, setAIWeightOverrides } from '../../js/ai-weight-config.js';
import { loadAIWeightOverrides } from '../../js/ai-training-knowledge.js';

export function formatDebugWeight(value) {
    if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return '—';
    return String(Number(Number(value).toFixed(8)));
}

export function initDebugOverlay() {
    if (!/(?:^|[?&])debug=1(?:&|$)/.test(window.location.search)) return null;
    if (!document.body || document.getElementById('clovece-debug-overlay')) return null;
    const panel = document.createElement('section');
    panel.id = 'clovece-debug-overlay';
    panel.className = 'clovece-debug-overlay';
    const toggle = document.createElement('button');
    toggle.type = 'button'; toggle.className = 'debug-overlay-toggle'; toggle.textContent = '+';
    toggle.setAttribute('aria-label', 'Rozbalit debug panel'); toggle.setAttribute('aria-expanded', 'false');
    const content = document.createElement('div'); content.className = 'debug-overlay-content';
    const summary = document.createElement('div'); summary.className = 'debug-overlay-summary'; summary.textContent = 'DEBUG';
    const camera = document.createElement('div'); camera.className = 'debug-overlay-camera'; camera.textContent = '3D KAMERA –';
    const details = document.createElement('pre'); details.className = 'debug-overlay-details';
    const aiWeights = document.createElement('div'); aiWeights.className = 'debug-overlay-ai-weights';
    content.append(summary, camera, details, aiWeights); panel.append(toggle, content); document.body.appendChild(panel);

    // Panel si rezervuje méně výšky podle skutečné výšky zobrazených kostek.
    const syncDiceSpace = () => {
        const slot = document.querySelector('#game-container .board-dice-trainer-slot');
        const controls = slot?.querySelector('.trainer-dice-controls');
        const visible = slot && controls && !controls.hidden &&
            !controls.classList.contains('hidden') && !controls.classList.contains('dice-display-hidden') &&
            getComputedStyle(controls).display !== 'none';
        const height = visible ? Math.ceil(slot.getBoundingClientRect().height) : 0;
        const reserve = height + 'px';
        if (panel.style.getPropertyValue('--debug-dice-reserve') !== reserve) {
            panel.style.setProperty('--debug-dice-reserve', reserve);
        }
    };
    const diceObserver = new MutationObserver(syncDiceSpace);
    diceObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
    const resizeObserver = new ResizeObserver(syncDiceSpace);
    const observeDiceSlot = () => {
        const slot = document.querySelector('#game-container .board-dice-trainer-slot');
        if (slot && slot !== resizeObserver._observedSlot) {
            if (resizeObserver._observedSlot) resizeObserver.unobserve(resizeObserver._observedSlot);
            resizeObserver.observe(slot);
            resizeObserver._observedSlot = slot;
        }
        syncDiceSpace();
    };
    window.addEventListener('resize', observeDiceSlot, { passive: true });
    observeDiceSlot();

    let expanded = false;
    toggle.addEventListener('click', () => {
        expanded = !expanded; panel.classList.toggle('is-expanded', expanded); content.hidden = !expanded;
        toggle.textContent = expanded ? '−' : '+';
        toggle.setAttribute('aria-expanded', String(expanded));
        toggle.setAttribute('aria-label', expanded ? 'Sbalit debug panel' : 'Rozbalit debug panel');
    });
    content.hidden = true;
    const entries = [];
    function renderLog() {
        details.textContent = entries.map((entry, index) => {
            const metrics = [];
            if (entry.duration !== null) metrics.push(entry.duration + ' ms');
            if (entry.size !== null) metrics.push(entry.size + ' kB');
            return String(index + 1).padStart(2, '0') + ' [' + entry.status + '] ' + entry.name +
                (metrics.length ? ' (' + metrics.join(', ') + ')' : '');
        }).join('\\n');
    }
    function log(name, status = 'OK', duration = null, size = null) {
        entries.push({ name: String(name), status: String(status),
            duration: Number.isFinite(Number(duration)) ? Number(duration) : null,
            size: Number.isFinite(Number(size)) ? Number(size) : null });
        if (entries.length > 80) entries.shift();
        renderLog();
    }
    function renderWeights(state = null) {
        const heading = document.createElement('div');
        heading.className = 'debug-overlay-weight-status';
        heading.textContent = 'Aktivní strategické váhy: ' + AI_WEIGHT_DEFINITIONS.length + '\\n' +
            (state?.statusLabel || 'Stav učení zatím není uložen');
        const table = document.createElement('table'); table.className = 'debug-overlay-weight-table';
        const head = document.createElement('thead'); const headerRow = document.createElement('tr');
        ['Strategický význam', 'Hodnota'].forEach(label => { const cell = document.createElement('th'); cell.textContent = label; headerRow.appendChild(cell); });
        head.appendChild(headerRow); table.appendChild(head);
        const body = document.createElement('tbody'); const values = getAIWeightValues();
        AI_WEIGHT_DEFINITIONS.forEach((definition, index) => {
            const row = document.createElement('tr'); const name = document.createElement('td'); const value = document.createElement('td');
            name.textContent = definition.name; name.title = definition.description; value.textContent = formatDebugWeight(values[index]);
            row.append(name, value); body.appendChild(row);
        });
        table.appendChild(body); aiWeights.replaceChildren(heading, table);
    }
    async function loadAIWeightState() {
        if (document.visibilityState === 'hidden') return;
        try {
            const response = await fetch(new URL('../../config/ai-training-state.json?v=' + Date.now(), import.meta.url), { cache: 'no-store' });
            renderWeights(response.ok ? await response.json() : null);
        } catch { renderWeights(null); }
    }
    window.addEventListener('clovece:debug-camera', event => {
        const value = event.detail || {};
        camera.textContent = value.active === false ? '3D KAMERA –' :
            '3D KAMERA X ' + formatDebugWeight(value.x) + ' Y ' + formatDebugWeight(value.y) +
            ' Z ' + formatDebugWeight(value.z) + ' | NÁKLON ' + formatDebugWeight(value.tilt) + '°';
    });
    document.addEventListener('visibilitychange', loadAIWeightState);
    window.setInterval(loadAIWeightState, 30000);
    renderWeights(null);
    void loadAIWeightOverrides().then(result => { setAIWeightOverrides(result.values || {}); renderWeights(null); });
    void loadAIWeightState();
    return log;
}
