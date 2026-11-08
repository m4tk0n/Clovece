/**
 * Diagnostický panel aktivovaný parametrem ?debug=1.
 * Kliknutím se rozbalí/zabalí; rozšířený režim zobrazuje pořadí načítání modulů.
 */
export function formatDebugWeight(value) {
    if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value))) return '—';
    return String(Number(Number(value).toFixed(8)));
}

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
        }).join('\n            const fmt = formatDebugWeight;