import {
    startTestGame, pauseTestGame, resumeTestGame, stopTestGame,
    getTestGameState, updateTestRules
} from './app.js';

const $ = id => document.getElementById(id);
const panel = $('live-test-panel');
if (panel) {
    const log = $('test-live-log');
    const status = $('test-status');
    const count = $('test-step-count');
    const buttons = {
        start: $('test-start'), pause: $('test-pause'),
        resume: $('test-resume'), stop: $('test-stop'), report: $('test-report')
    };
    const entries = [];
    let lastSignature = '';
    let pollHandle = null;
    let running = false;
    let paused = false;

    function addLog(message) {
        const item = { time: new Date().toLocaleTimeString('cs-CZ', { hour12: false }), message };
        entries.push(item);
        if (entries.length > 120) entries.shift();
        const row = document.createElement('li');
        const time = document.createElement('time');
        time.textContent = item.time;
        row.append(time, document.createTextNode(message));
        log.append(row);
        while (log.children.length > 60) log.firstElementChild.remove();
        log.scrollTop = log.scrollHeight;
        count.textContent = entries.length + ' událostí';
    }
    function setStatus(value) { status.textContent = value; }
    function updateButtons() {
        buttons.start.disabled = running;
        buttons.pause.disabled = !running || paused;
        buttons.resume.disabled = !running || !paused;
        buttons.stop.disabled = !running;
        buttons.report.disabled = entries.length === 0;
        document.querySelectorAll('[data-test-rule]').forEach(input => { input.disabled = running; });
    }
    function describeState(state) {
        const signature = JSON.stringify(state);
        if (signature === lastSignature) return;
        const previous = lastSignature ? JSON.parse(lastSignature) : null;
        lastSignature = signature;
        if (!previous) {
            addLog('Hra spuštěna. Aktivní pravidla: ' + Object.entries(state.rules).map(([key,value]) => key + '=' + (value ? 'ANO' : 'NE')).join(', '));
            addLog('Deska ' + state.boardSize + ' polí; hráči: ' + state.players.map(player => player.name).join(', ') + '.');
            return;
        }
        if (state.diceValue !== previous.diceValue) addLog(state.currentPlayerName + ' hodil ' + state.diceValue + '.');
        if (state.currentPlayer !== previous.currentPlayer) addLog('Na tahu je ' + state.currentPlayerName + '.');
        if (state.phase !== previous.phase) addLog('Změna fáze hry: ' + previous.phase + ' → ' + state.phase + '.');
        state.pieces.forEach((pieces, playerId) => pieces.forEach((steps, pieceId) => {
            if (steps !== previous.pieces[playerId]?.[pieceId]) {
                addLog(state.players[playerId].name + ': figurka ' + (pieceId + 1) + ' změnila pozici ' + previous.pieces[playerId][pieceId] + ' → ' + steps + '.');
            }
        }));
        if (state.winner !== previous.winner && state.winner !== null) {
            addLog('KONEC HRY: vyhrál ' + state.players[state.winner].name + '.');
            setStatus('Dokončeno');
        }
    }
    function poll() {
        const state = getTestGameState();
        if (state) describeState(state);
    }

    document.querySelectorAll('[data-test-rule]').forEach(input => {
        input.addEventListener('change', () => {
            const rules = Object.fromEntries([...document.querySelectorAll('[data-test-rule]')].map(item => [item.dataset.testRule, item.checked]));
            updateTestRules(rules);
            addLog('Nastavení pravidel změněno: ' + input.dataset.testRule + ' = ' + (input.checked ? 'ANO' : 'NE') + '.');
        });
    });
    Object.entries(updateTestRules({})).forEach(([key, value]) => {
        const input = document.querySelector('[data-test-rule="' + key + '"]');
        if (input) input.checked = value;
    });

    buttons.start.addEventListener('click', async () => {
        try {
            entries.length = 0;
            log.replaceChildren();
            lastSignature = '';
            setStatus('Spouštím…');
            await startTestGame();
            running = true;
            paused = false;
            setStatus('Probíhá');
            addLog('Automatická partie začala. Sleduj skutečný herní plán za panelem.');
            poll();
            pollHandle = window.setInterval(poll, 450);
            updateButtons();
        } catch (error) {
            setStatus('Chyba spuštění');
            addLog('CHYBA: ' + error.message);
            console.error('Testovací hra selhala:', error);
            updateButtons();
        }
    });
    buttons.pause.addEventListener('click', () => {
        if (!pauseTestGame()) return;
        paused = true;
        setStatus('Pozastaveno');
        addLog('Test pozastaven. Herní stav zůstává zachován.');
        updateButtons();
    });
    buttons.resume.addEventListener('click', () => {
        if (!resumeTestGame()) return;
        paused = false;
        setStatus('Probíhá');
        addLog('Test pokračuje ze stejného herního stavu.');
        updateButtons();
    });
    buttons.stop.addEventListener('click', () => {
        stopTestGame();
        running = false;
        paused = false;
        if (pollHandle) window.clearInterval(pollHandle);
        pollHandle = null;
        setStatus('Zastaveno');
        addLog('Test byl zastaven. Protokol zůstává v panelu.');
        updateButtons();
    });
    buttons.report.addEventListener('click', async () => {
        const state = getTestGameState();
        const report = [
            '# Hlášení chyby – Člověče, nezlob se!',
            '',
            '## Aktivní pravidla',
            '```json',
            JSON.stringify(state?.rules ?? updateTestRules({}), null, 2),
            '```',
            '## Stav hry',
            '```json',
            JSON.stringify(state, null, 2),
            '```',
            '## Průběh',
            ...entries.map(entry => '- [' + entry.time + '] ' + entry.message),
            '',
            '## Očekávané chování',
            '(doplň)',
            '',
            '## Skutečné chování',
            '(doplň)'
        ].join('\n');
        try {
            await navigator.clipboard.writeText(report);
            addLog('Protokol zkopírován. Otevři formulář GitHub Issue a vlož jej do popisu.');
            window.open('https://github.com/m4tk0n/Clovece/actions/workflows/report-test-issue.yml', '_blank', 'noopener');
        } catch (error) {
            addLog('Kopírování protokolu se nepodařilo: ' + error.message);
        }
    });
    $('test-panel-collapse')?.addEventListener('click', event => {
        const collapsed = panel.classList.toggle('is-collapsed');
        event.currentTarget.textContent = collapsed ? '+' : '−';
        event.currentTarget.setAttribute('aria-expanded', String(!collapsed));
    });
    updateButtons();
}
