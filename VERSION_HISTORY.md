# Historie verzí projektu Člověče, nezlob se!

Tento dokument eviduje změny aplikace v pořadí, v jakém byly zařazeny do projektu. Každá nová úprava dostane vlastní čtyřdílné číslo verze.

## Číslování verzí

Formát: `MAJOR.MINOR.PATCH.REVISION`

- **MAJOR** – zásadní změna nebo nová generace aplikace.
- **MINOR** – větší nová funkce.
- **PATCH** – oprava nebo menší funkční úprava.
- **REVISION** – pořadové číslo evidované změny v rámci dané verze.

Při běžné nové úpravě se zvýší poslední část: `1.00.00.01`, `1.00.00.02`, `1.00.00.03` atd. Pokud pozdější změna upraví chování zavedené starší verzí, dostane nové číslo a výslovně uvede, kterou verzi mění. Starší záznamy se nepřepisují.

Historie začíná verzí 1.00.00.01. Starší změny před zavedením tohoto přehledu zůstávají dohledatelné v historii GitHub commitů a nejsou zpětně očíslovány.

---

## 1.00.00.01 – Automatické 3D a záložní 2D zobrazení

**Datum:** 5. 11. 2026  
**Typ:** Nová funkce / kompatibilita

- Při prvním spuštění se hrací deska automaticky otevře ve 3D.
- Pokud se nepodaří načíst Three.js, vytvořit WebGL renderer nebo vykreslit 3D scénu, hra automaticky přepne desku na 2D SVG.
- Automatický přechod na 2D se provede také při ztrátě WebGL kontextu nebo chybě během vykreslování.
- Chyba 3D zobrazení již nezablokuje pokračování hry.
- Automatický fallback se neuloží jako trvalá volba. Při dalším načtení stránky se 3D zkusí znovu.
- Ruční přepnutí mezi 2D a 3D zůstává zachováno a uživatelská volba se ukládá.

**Dotčené soubory:**
- `js/game-board-view.js`
- `js/game-board-3d.js`
- `README.md`

**Navazující změny:** žádné.
