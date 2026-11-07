/**
 * Výběr hráčů, barev a velikosti herní desky.
 * Tento modul neimportuje herní engine ani vykreslování.
 */
import { PLAYER_COLORS, getAvailableBoardSizes } from './game-engine.js';
import { bootstrapOnline } from './online/api.js';

const $ = id => document.getElementById(id);
let humanCount = 1;
let aiCount = 1;
let selectedBoardSize = 40;
let previousTotalPlayerCount = 2;
const customPlayerNames = new Map();
const customPlayerColors = new Map();
// Výchozí ANO zachovává dosavadní pravidla lokální hry.
const extendedRules = { threeRolls: true, mustDeploy: true, skipHomePieces: true, mustEnterHome: true, threeSixesPenalty: false };
// Obrazovka výběru zůstává po opuštění v DOM; posluchače proto registrujeme jen jednou.
const initializedSetupRoots = new WeakSet();
const PLAYER_COLOR_LABELS = ['Červená', 'Modrá', 'Zelená', 'Žlutá', 'Oranžová', 'Fialová', 'Tyrkysová', 'Růžová'];
// Krátká jména AI: ženská, mužská i genderově neutrální.
const AI_NAMES = [
    'Claude', 'Alex', 'Sam', 'Robin', 'Kim', 'Charlie', 'Mika', 'Niki', 'Toni', 'Andrea',
    'Adam', 'Eliáš', 'Max', 'Leo', 'Oliver', 'Theo', 'Mia', 'Ema', 'Luna', 'Nora',
    'Sofie', 'Kira', 'Lia', 'Zoe', 'Aria', 'Noel', 'Rene', 'Sasha', 'Dani', 'Jamie'
];

function ensureAiNames(count) {
    const usedNames = new Set();
    for (let number = 1; number <= count; number++) {
        const existing = customPlayerNames.get('ai:' + number);
        if (existing) usedNames.add(existing.split(' ').slice(1).join(' '));
    }

    const available = shuffleColors(AI_NAMES.filter(name => !usedNames.has(name)));
    for (let number = 1; number <= count; number++) {
        const key = 'ai:' + number;
        if (customPlayerNames.has(key)) continue;
        const name = available.shift() || 'Max';
        customPlayerNames.set(key, 'AI' + number + ' ' + name);
    }
}

export function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
}

function shuffleColors(colors) {
    const shuffled = [...colors];
    for (let index = shuffled.length - 1; index > 0; index--) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
}

function updateSetup() {
    const humanInput = $('human-players');
    const aiInput = $('ai-players');
    if (!humanInput || !aiInput) return;

    humanCount = Math.max(1, Math.min(8, Number(humanInput.value) || 1));
    aiCount = Math.max(0, Math.min(7, Number(aiInput.value) || 0));

    if (humanCount + aiCount < 2) {
        aiCount = 1;
        aiInput.value = '1';
    }
    if (humanCount + aiCount > 8) {
        aiCount = 8 - humanCount;
        aiInput.value = String(aiCount);
    }

    const total = humanCount + aiCount;
    $('human-players-value').textContent = humanCount;
    $('ai-players-value').textContent = aiCount;

    document.querySelectorAll('[data-count-target][data-count-step]').forEach(button => {
        const isHuman = button.dataset.countTarget === 'human-players';
        const current = isHuman ? humanCount : aiCount;
        const minimum = isHuman ? 1 : (humanCount === 1 ? 1 : 0);
        const maximum = isHuman ? 8 : Math.min(7, 8 - humanCount);
        const step = Number(button.dataset.countStep);
        button.disabled = step < 0 ? current <= minimum : current >= maximum;
    });

    const availableBoardSizes = getAvailableBoardSizes(total);
    // Při snížení počtu hráčů vždy zvolíme nejmenší dostupnou desku.
    // Při zvýšení zachováme ruční volbu, pokud je pro nový počet stále dostupná.
    if (total < previousTotalPlayerCount || !availableBoardSizes.includes(selectedBoardSize)) {
        selectedBoardSize = availableBoardSizes[0] || 40;
    }
    previousTotalPlayerCount = total;
    $('board-size-options')?.querySelectorAll('[data-board-size]').forEach(button => {
        const size = Number(button.dataset.boardSize);
        const active = size === selectedBoardSize;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
        button.disabled = !availableBoardSizes.includes(size);
    });

    ensureAiNames(aiCount);

    const players = Array.from({ length: total }, (_, index) => {
        const isAI = index >= humanCount;
        const number = isAI ? index - humanCount + 1 : index + 1;
        const key = (isAI ? 'ai:' : 'human:') + number;
        const requestedColor = customPlayerColors.get(key);
        return {
            isAI,
            number,
            key,
            selectedColor: PLAYER_COLORS.includes(requestedColor) ? requestedColor : 'random',
            name: customPlayerNames.get(key) || (isAI ? 'AI' + number + ' Max' : 'Hráč ' + number)
        };
    });

    // Konkrétní barvy jsou rezervované. Náhodní hráči dostanou zbytek.
    const reservedColors = new Set(players
        .filter(player => player.selectedColor !== 'random')
        .map(player => player.selectedColor));
    const randomColors = shuffleColors(PLAYER_COLORS.filter(color => !reservedColors.has(color)));
    let randomColorIndex = 0;

    players.forEach(player => {
        player.displayColor = player.selectedColor === 'random'
            ? randomColors[randomColorIndex++]
            : player.selectedColor;
    });

    $('preview-players').innerHTML = players.map(player => {
        const availableColors = PLAYER_COLORS
            .map((value, colorIndex) => ({ value, label: PLAYER_COLOR_LABELS[colorIndex] }))
            .filter(color => color.value === player.selectedColor || !reservedColors.has(color.value));

        return '<div class="preview-player" style="--player-color:' + player.displayColor + '">' +
            '<span class="preview-player-orb">' + (player.isAI ? 'AI' : player.number) + '</span>' +
            '<input class="preview-player-name" type="text" maxlength="20" autocomplete="off" ' +
                'aria-label="Jméno ' + (player.isAI ? 'AI ' : 'hráče ') + player.number + '" ' +
                'data-name-key="' + player.key + '" value="' + escapeHtml(player.name) + '">' +
            '<label class="preview-color-label">' +
                '<select class="preview-player-color" data-color-key="' + player.key + '" data-resolved-color="' + player.displayColor + '" aria-label="Barva hráče ' + escapeHtml(player.name) + '">' +
                    '<option value="random"' + (player.selectedColor === 'random' ? ' selected' : '') + '>Náhodná</option>' +
                    availableColors.map(color => '<option value="' + color.value + '"' +
                        (color.value === player.selectedColor ? ' selected' : '') + '>' + color.label + '</option>').join('') +
                '</select></label></div>';
    }).join('');
}

export function getPlayerSetup() {
    const preview = $('preview-players');
    const names = Array.from(preview.querySelectorAll('[data-name-key]'), input => {
        const name = input.value.trim().slice(0, 30);
        if (name) return name;
        const number = input.dataset.nameKey.split(':')[1];
        return input.dataset.nameKey.startsWith('ai:') ? 'AI' + number + ' Max' : 'Hráč ' + number;
    });
    // Náhodné barvy jsou už v náhledu vylosované. Do hry použijeme přesně ty zobrazené.
    const colors = Array.from(preview.querySelectorAll('[data-color-key]'), select =>
        select.value === 'random' ? select.dataset.resolvedColor : select.value
    );
    return { humanCount, aiCount, selectedBoardSize, names, colors, aiDifficulty: $('ai-difficulty')?.value || 'medium', extendedRules: { ...extendedRules } };
}

export function initPlayerSetup() {
    const setupRoot = $('player-selection');
    if (setupRoot && initializedSetupRoots.has(setupRoot)) return;
    if (setupRoot) initializedSetupRoots.add(setupRoot);

    $('setup-grid')?.addEventListener('click', event => {
        const button = event.target.closest('[data-count-target][data-count-step]');
        if (!button || button.disabled) return;

        const input = $(button.dataset.countTarget);
        if (!input) return;
        const step = Number(button.dataset.countStep);
        const current = Number(input.value) || 0;
        input.value = String(current + step);
        updateSetup();
    });
    $('board-size-options')?.addEventListener('click', event => {
        const button = event.target.closest('[data-board-size]');
        if (!button || button.disabled) return;
        selectedBoardSize = Number(button.dataset.boardSize);
        updateSetup();
    });
    $('preview-players')?.addEventListener('input', event => {
        const input = event.target.closest('[data-name-key]');
        if (!input) return;
        customPlayerNames.set(input.dataset.nameKey, input.value.trim());
    });
    $('preview-players')?.addEventListener('change', event => {
        const select = event.target.closest('[data-color-key]');
        if (!select) return;

        customPlayerColors.set(select.dataset.colorKey, select.value);
        updateSetup();
    });
    $('random-player-colors-btn')?.addEventListener('click', () => {
        $('preview-players')?.querySelectorAll('[data-color-key]').forEach(select => {
            customPlayerColors.set(select.dataset.colorKey, 'random');
        });
        updateSetup();
    });

    $('extended-rules-toggle')?.addEventListener('click', () => {
        const button = $('extended-rules-toggle');
        const panel = $('extended-rules-panel');
        if (!button || !panel) return;
        const expanded = button.getAttribute('aria-expanded') !== 'true';
        button.setAttribute('aria-expanded', String(expanded));
        panel.classList.toggle('hidden', !expanded);
    });
    $('extended-rules-panel')?.addEventListener('click', event => {
        const info = event.target.closest('[data-rule-info]');
        if (info) {
            const row = info.closest('.extended-rule-row');
            const hint = row?.querySelector('.rule-hint');
            if (!hint) return;
            const opening = hint.hidden;
            document.querySelectorAll('.rule-hint').forEach(item => { item.hidden = true; });
            document.querySelectorAll('[data-rule-info]').forEach(item => item.setAttribute('aria-expanded', 'false'));
            hint.hidden = !opening;
            info.setAttribute('aria-expanded', String(opening));
            return;
        }
        const button = event.target.closest('[data-rule-toggle]');
        if (!button) return;
        const key = button.dataset.ruleToggle;
        if (!Object.prototype.hasOwnProperty.call(extendedRules, key)) return;
        extendedRules[key] = !extendedRules[key];
        button.setAttribute('aria-pressed', String(extendedRules[key]));
        button.querySelector('span').textContent = extendedRules[key] ? 'ANO' : 'NE';
    });

    updateSetup();

    // Přihlášený hráč začne jako první člověk se svým profilem.
    // Výchozí hodnoty se nastaví pouze jednou a nepřepisují ruční úpravy.
    void bootstrapOnline().then(data => {
        const account = data.account;
        if (!account) return;

        if (!customPlayerNames.has('human:1')) {
            const displayName = String(account.display_name || account.username || '').trim().slice(0, 20);
            if (displayName) customPlayerNames.set('human:1', displayName);
        }
        if (!customPlayerColors.has('human:1') && PLAYER_COLORS.includes(account.color_preference)) {
            customPlayerColors.set('human:1', account.color_preference);
        }
        updateSetup();
    }).catch(error => {
        console.warn('Výchozí údaje profilu se nepodařilo načíst:', error);
    });

    document.querySelectorAll('[data-rule-toggle]').forEach(button => {
        const enabled = extendedRules[button.dataset.ruleToggle] === true;
        button.setAttribute('aria-pressed', String(enabled));
        button.querySelector('span').textContent = enabled ? 'ANO' : 'NE';
    });
}

export { updateSetup };


/** Aktuální přepínače rozšířených pravidel sdílené UI a testovacím režimem. */
export function getExtendedRules() {
    return { ...extendedRules };
}

/** Testovací panel mění stejný objekt, který se předává do createGame(). */
export function setExtendedRulesForTest(values = {}) {
    for (const key of Object.keys(extendedRules)) {
        if (typeof values[key] === 'boolean') extendedRules[key] = values[key];
    }
    document.querySelectorAll('[data-rule-toggle]').forEach(button => {
        const key = button.dataset.ruleToggle;
        if (!(key in extendedRules)) return;
        button.setAttribute('aria-pressed', String(extendedRules[key]));
        const label = button.querySelector('span');
        if (label) label.textContent = extendedRules[key] ? 'ANO' : 'NE';
    });
    return getExtendedRules();
}
