#!/usr/bin/env node
/**
 * Skutečný přínos jednotlivých vah (ablace).
 *
 * Pro každou váhu vezme šampiona z checkpointu, váhu vynuluje a nechá takto oslabenou AI
 * hrát proti plnému šampionovi na stejných semínkách. Pokud oslabená verze prohrává
 * (záporné z), váha hráči pomáhá. Pokud je z kolem nuly, váha nic nepřináší.
 * Nic nezapisuje do hry.
 *
 * Použití: node debug/scripts/ablate-signals.mjs --checkpoint=artifacts/selfplay-checkpoint.json --games=300
 *          [--all]  (ablace všech 18 vah; jinak jen nových 11–18)
 */
import { readFile, writeFile } from 'node:fs/promises';
import { evaluateMatch, KEYS, clampVector } from './train-selfplay.mjs';

const argv = process.argv.slice(2);
const read = (name, fallback) => {
    const item = argv.find(value => value.startsWith('--' + name + '='));
    return item ? item.slice(name.length + 3) : fallback;
};
const state = JSON.parse(await readFile(read('checkpoint', 'artifacts/selfplay-checkpoint.json'), 'utf8'));
if (state.version !== 2 || state.champion?.length !== KEYS.length) throw new Error('Checkpoint nemá platný formát.');
const games = Math.max(60, Number(read('games', 300)));
const champion = clampVector(state.champion.map(Number));
const setups = [{ playerCount: 2, boardSize: 40 }, { playerCount: 4, boardSize: 40 }];
const from = argv.includes('--all') ? 0 : 10;
const opponent = { type: 'weights', weights: champion, temperature: 0 };

const rows = [];
for (let index = from; index < KEYS.length; index++) {
    const weight = champion[index];
    if (Math.abs(weight) < 1e-9) {
        rows.push({ key: KEYS[index], weight, verdict: 'váha je nulová, nemá vliv' });
        process.stdout.write(KEYS[index].padEnd(18) + ' váha 0 → nemá vliv\n');
        continue;
    }
    const candidate = [...champion];
    candidate[index] = 0;
    const result = evaluateMatch({ candidate, opponent, setups, games, seedBase: 41000000, maxTurns: 1500 });
    const verdict = result.z < -1.645 ? 'POMÁHÁ (bez ní AI prokazatelně slábne)'
        : (result.z > 1.645 ? 'ŠKODÍ (bez ní AI hraje lépe)' : 'neprokázáno (rozdíl v rámci šumu)');
    rows.push({ key: KEYS[index], weight, winRateWithout: result.winRate, chance: result.chanceRate, z: result.z, decisive: result.decisive, verdict });
    process.stdout.write(KEYS[index].padEnd(18) + ' váha ' + weight.toFixed(2).padStart(8) + ' | bez ní ' +
        (result.winRate * 100).toFixed(1) + ' % (šance ' + (result.chanceRate * 100).toFixed(1) + ' %) z ' + result.z.toFixed(2) + ' → ' + verdict + '\n');
}
const out = read('out', '');
if (out) await writeFile(out, JSON.stringify({ schema: 'clovece-ablation-v1', games, rows }, null, 2) + '\n');
