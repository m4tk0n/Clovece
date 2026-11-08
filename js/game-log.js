/**
 * Herní chat a stručný záznam událostí.
 * Stav hry se předává přes getter, modul proto není závislý na app.js.
 */
export function createGameLog(getGame) {
    const $ = id => document.getElementById(id);
    const chatHistory = [];
    let startLogEntry = null;
    let lastAIDebugExport = null;
    
    function updateStartLog() {
        const game = getGame();
        if (!game || !startLogEntry) return;
        const rounds = (game.startRolls || []).filter(round => round.length > 0);
        const summary = rounds.map((round, index) =>
            'kolo ' + (index + 1) + ': ' + round.map(roll =>
                game.players[roll.playerId].name + ' ' + roll.value
            ).join(', ')
        ).join('; ');
        startLogEntry.text = 'Rozstřel: ' + (summary || 'čeká se na první hod')
            + (game.phase === 'start-roll'
                ? ' · čeká se na hod hráče ' + game.players[game.currentPlayer].name
                : '. ' + game.players[game.startWinner].name + ' začíná.');
        renderChat();
    }
    
    function renderChat() {
        const messages = $('chat-messages');
        if (!messages) return;
        messages.innerHTML = '';
        chatHistory.slice(-40).forEach(item => {
            const line = document.createElement('div');
            line.className = 'game-chat-message' + (item.type === 'ai-evaluation' ? ' ai-training-evaluation' : '');
            if (item.type === 'ai-evaluation') {
                line.textContent = '[' + item.sender + ': ' + item.text + ']';
            } else {
                const sender = document.createElement('strong');
                sender.textContent = item.sender + ': ';
                const body = document.createElement('span');
                body.textContent = item.text;
                line.append(sender, body);
            }
            messages.appendChild(line);
        });
        if (lastAIDebugExport) {
            const copyButton = document.createElement('button');
            copyButton.type = 'button';
            copyButton.className = 'game-btn small ai-debug-copy';
            copyButton.textContent = 'Zkopírovat JSON posledního tahu AI';
            copyButton.addEventListener('click', async () => {
                const json = JSON.stringify(lastAIDebugExport, null, 2);
                try {
                    if (navigator.clipboard?.writeText) {
                        await navigator.clipboard.writeText(json);
                    } else {
                        const field = document.createElement('textarea');
                        field.value = json;
                        document.body.appendChild(field);
                        field.select();
                        document.execCommand('copy');
                        field.remove();
                    }
                    copyButton.textContent = 'JSON zkopírován';
                } catch {
                    copyButton.textContent = 'Kopírování se nezdařilo';
                }
            });
            messages.appendChild(copyButton);
        }
        messages.scrollTop = messages.scrollHeight;
    }
    
    function addChatEntry(sender, text) {
        const message = String(text || '').trim().slice(0, 240);
        if (!message) return;
        chatHistory.push({ sender: String(sender || 'Hra'), text: message, type: 'chat' });
        renderChat();
    }
    
    function addGameLogEntry(sender, text) {
        const message = String(text || '').trim();
        if (!message) return;
    
        const playerName = String(sender || 'Hra');
        const lastEntry = chatHistory[chatHistory.length - 1];
    
        // Herní události stejného hráče spojujeme, ale chatová zpráva řádek vždy přeruší.
        if (lastEntry && lastEntry.type === 'game' && lastEntry.sender === playerName) {
            lastEntry.text += ', ' + message;
        } else {
            chatHistory.push({ sender: playerName, text: message, type: 'game' });
        }
    
        renderChat();
    }
    
    function addAITrainingEvaluation(sender, text) {
        const message = String(text || '').trim().slice(0, 500);
        if (!message) return;
        chatHistory.push({ sender: String(sender || 'AI'), text: message, type: 'ai-evaluation' });
        renderChat();
    }

    function setAIDebugExport(value) {
        lastAIDebugExport = value && typeof value === 'object' ? value : null;
        renderChat();
    }

    function sendChatMessage(text) {
        const game = getGame();
        if (!game) return;
        addChatEntry(game.players[game.currentPlayer].name, text);
    }
    
    
    function resetGameLog() {
        chatHistory.length = 0;
        lastAIDebugExport = null;
        renderChat();
        startLogEntry = { sender: 'Rozstřel', text: 'Čeká se na první hod.', type: 'game' };
        chatHistory.push(startLogEntry);
        updateStartLog();
    }

    return {
        resetGameLog,
        updateStartLog,
        renderChat,
        addChatEntry,
        addGameLogEntry,
        addAITrainingEvaluation,
        setAIDebugExport,
        sendChatMessage
    };
}
