/**
 * Diagnostický panel aktivovaný parametrem ?debug=1.
 * Kliknutím se rozbalí/zabalí; rozšířený režim zobrazuje pořadí načítání modulů.
 */
export function initDebugOverlay() {
    if (!/(?:^|[?&])debug=1(?:&|$)/.test(window.location.search)) return null;
    if (!document.body || document.getElementById('clovece-debug-overlay')) return null;

    const panel = document.createElement('div');
    panel.id = 'clovece-debug-overlay';
    panel.setAttribute('role', 'button');
    panel.setAttribute('tabindex', '0');
    panel.setAttribute('aria-expanded', 'false');
    panel.style.cssText = [
        'position:fixed','left:2px','bottom:2px','z-index:2147483647',
        'box-sizing:border-box','max-width:calc(100vw - 8px)','width:max-content',
        'padding:4px 6px','border:1px solid rgba(255,0,0,.7)','border-radius:4px',
        'background:rgba(0,0,0,.9)','color:#ff4545','font:10px/1.4 monospace',
        'white-space:normal','overflow-wrap:anywhere','pointer-events:auto',
        'user-select:none','-webkit-user-select:none','touch-action:manipulation',
        'cursor:pointer'
    ].join(';');

    const summary = document.createElement('div');
    summary.textContent = 'DEBUG | načítání…';
    const details = document.createElement('div');
    details.style.cssText = 'display:none;margin-top:5px;padding-top:5px;border-top:1px solid #a33;max-height:55vh;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere';
    panel.appendChild(summary);
    panel.appendChild(details);
    document.body.appendChild(panel);

    let expanded = false;
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
        details.style.display = expanded ? 'block' : 'none';
        panel.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        summary.textContent = expanded
            ? 'DEBUG ▲ | ' + entries.length + ' záznamů – klikni pro sbalení'
            : 'DEBUG ▼ | ' + entries.length + ' záznamů – klikni pro rozbalení';
        updatePosition();
    }
    panel.addEventListener('click', toggle);
    panel.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggle();
        }
    });

    const format = value => Math.round(value);
    let fps = 0;
    let frameCount = 0;
    const getNow = () => window.performance && typeof window.performance.now === 'function'
        ? window.performance.now() : Date.now();
    let lastSample = getNow();

    function updatePosition() {
        const viewport = window.visualViewport;
        if (viewport) {
            const top = Math.max(2, viewport.offsetTop + viewport.height - panel.offsetHeight - 2);
            panel.style.top = format(top) + 'px';
            panel.style.bottom = 'auto';
        } else {
            panel.style.top = 'auto';
            panel.style.bottom = '2px';
        }
    }
    function updateSummary() {
        const screenWidth = window.screen ? window.screen.width : 0;
        const screenHeight = window.screen ? window.screen.height : 0;
        const viewport = window.visualViewport;
        const visibleWidth = viewport ? format(viewport.width) : window.innerWidth;
        const visibleHeight = viewport ? format(viewport.height) : window.innerHeight;
        summary.textContent = (expanded ? 'DEBUG ▲' : 'DEBUG ▼') +
            ' | DISPLAY ' + screenWidth + '×' + screenHeight +
            ' | OKNO ' + window.innerWidth + '×' + window.innerHeight +
            ' | VIDITELNÉ ' + visibleWidth + '×' + visibleHeight +
            ' | DPR ' + (window.devicePixelRatio || 1).toFixed(2) +
            ' | FPS ' + fps + ' | ' + entries.length + ' záznamů';
        updatePosition();
    }
    function measureFrame() {
        const now = getNow();
        frameCount++;
        const elapsed = now - lastSample;
        if (elapsed >= 1000) {
            fps = Math.round(frameCount * 1000 / elapsed);
            frameCount = 0;
            lastSample = now;
            updateSummary();
        }
        if (window.requestAnimationFrame) window.requestAnimationFrame(measureFrame);
        else window.setTimeout(measureFrame, 1000 / 30);
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

    window.addEventListener('clovece:debug-log', event => {
        const detail = event.detail || {};
        log(detail.name || 'Neznámá operace', detail.status || 'INFO',
            typeof detail.duration === 'number' ? detail.duration : null);
    });

    // CSS načtené ještě před spuštěním modulu zjistíme z DOM a Resource Timing.
    // Později vložené stylesheety a <style> elementy zachytí MutationObserver.
    const trackedStyles = new WeakSet();
    function trackStyleNode(node) {
        if (!(node instanceof Element) || trackedStyles.has(node)) return;
        if (node.tagName === 'LINK' && node.rel.split(/\s+/).includes('stylesheet')) {
            trackedStyles.add(node);
            const href = node.href || node.getAttribute('href') || '';
            let fileName = 'inline';
            try {
                fileName = new URL(href, document.baseURI).pathname.split('/').pop() || 'inline';
                fileName = fileName.replace(/\\.css$/i, '') || 'inline';
            } catch (_) {
                fileName = href.split('/').pop().split('?')[0].replace(/\\.css$/i, '') || 'inline';
            }
            const report = status => {
                const resource = window.performance?.getEntriesByType('resource').find(item => item.name === href);
                const duration = resource ? Math.round(resource.duration) : null;
                const bytes = resource
                    ? (resource.encodedBodySize || resource.decodedBodySize || resource.transferSize || 0)
                    : 0;
                const size = bytes > 0 ? Math.max(1, Math.round(bytes / 1024)) : null;
                log('CSS: ' + fileName, status, duration, size);
            };
            if (node.sheet) report('OK');
            else {
                node.addEventListener('load', () => report('OK'), { once: true });
                node.addEventListener('error', () => report('CHYBA'), { once: true });
            }
        } else if (node.tagName === 'STYLE') {
            trackedStyles.add(node);
            log('CSS: ' + (node.id || 'inline style'), 'OK');
        }
    }
    document.querySelectorAll('link[rel~="stylesheet"], style').forEach(trackStyleNode);
    if (window.MutationObserver) {
        const styleObserver = new MutationObserver(records => {
            records.forEach(record => record.addedNodes.forEach(node => {
                trackStyleNode(node);
                node.querySelectorAll?.('link[rel~="stylesheet"], style').forEach(trackStyleNode);
            }));
        });
        styleObserver.observe(document.documentElement, { childList: true, subtree: true });
    }

    window.addEventListener('resize', updateSummary, { passive: true });
    window.addEventListener('orientationchange', updateSummary, { passive: true });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', updateSummary, { passive: true });
        window.visualViewport.addEventListener('scroll', updateSummary, { passive: true });
    }

    log('Debug panel inicializován', 'OK');
    updateSummary();
    if (window.requestAnimationFrame) window.requestAnimationFrame(measureFrame);
    else window.setTimeout(measureFrame, 1000 / 30);
    return log;
}
