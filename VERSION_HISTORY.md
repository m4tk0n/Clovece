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


## 1.00.00.07 – Odložené načítání herního runtime a uvolnění prostředků

**Datum:** 6. 11. 2026  
**Typ:** Optimalizace načítání a životního cyklu hry  
**Navazuje na:** verzi 1.00.00.06

- Lokální herní runtime se již neimportuje při startu hlavního menu; načte se až při vstupu do lokálního nastavení hry.
- Online lobby již při startu neimportuje renderer desky, herní engine ani animaci kostky. Tyto moduly se načtou až při aktivní online hře.
- `css/game-premium.css` se načítá až při zobrazení hry společně s CSS aktivního režimu.
- Animace vyhození a vítězství byly přesunuty z globálního `css/animations.css` do herního `css/game-premium.css`.
- Při odchodu z herní obrazovky se herní CSS odpojí, DOM desky vyčistí a 3D renderer uvolní WebGL prostředky, geometrii, materiály, ovladače a animační smyčku.
- Prohlížeč neumožňuje standardním API odregistrovat importované ES moduly z modulové cache. Aplikace proto uvolňuje vlastní reference a aktivní prostředky, nikoli s garancí fyzického vymazání kódu z paměti.

**Dotčené soubory:**
- `index.php`
- `js/bootstrap.js`, `js/navigation.js`, `js/app.js`, `js/online.js`
- `js/game-board.js`, `js/game-board-view.js`
- `README.md`, `DEBUG.md`, `.github/ROADMAP.md`

**Ověření:** čeká na GitHub Actions a praktický test v prohlížeči.

## 1.00.00.06 – Oddělení stylů 2D a 3D desky a kostky

**Datum:** 6. 11. 2026  
**Typ:** Refaktoring CSS a odložené načítání

- Vzhled 2D SVG desky je samostatně v `css/board-2d.css`.
- Vzhled 3D desky a jejího HUD je samostatně v `css/board-3d.css`.
- Plochá animace kostky je v `css/dice-2d.css`; prostorová animace je v `css/dice-3d.css`.
- Při spuštění hry se načítá pouze dvojice CSS aktivního režimu; při přepnutí se předchozí dvojice odpojí.
- Z `css/game-premium.css` byly odstraněny styly desky a animace kostky.
- Pravidla hry, stav hry a geometrie desky se nemění.

**Dotčené soubory:**
- `css/game-premium.css`
- `css/board-2d.css`, `css/board-3d.css`
- `css/dice-2d.css`, `css/dice-3d.css`
- `js/game-board-view.js`, `js/app.js`
- `README.md`, `DEBUG.md`, `.github/ROADMAP.md`

**Navazující změny:** žádné.

## 1.00.00.05 – Sjednocení okrajů při nízkém displeji

**Datum:** 5. 11. 2026  
**Typ:** Oprava responzivního rozložení  
**Mění:** úpravu odsazení zavedenou verzí 1.00.00.04

- Při výšce displeje do 680 px má herní obrazovka jednotné vnější odsazení 1 px ze všech čtyř stran.
- Horní a dolní odsazení je tedy stejné jako boční; nepoužívá se velký okraj ani nulové odsazení.

**Dotčené soubory:**
- `css/menu-premium.css`

## 1.00.00.04 – Odstranění horního odsazení herní obrazovky na mobilech

**Datum:** 5. 11. 2026  
**Typ:** Oprava responzivního rozložení  
**Mění:** mobilní rozložení zavedené verzí 1.00.00.03

- Horní vnitřní odsazení herní obrazovky na telefonech do šířky 420 px je nastaveno na 0 px.
- Při nízké výšce displeje se již horní odsazení nepřidává zpět pravidlem pro krátké obrazovky.
- Herní obrazovka začíná na horním okraji viewportu; vnitřní odsazení hlavičky zůstává zachováno kvůli čitelnosti ovládacích prvků.

**Dotčené soubory:**
- `css/menu-premium.css`

## 1.00.00.03 – Kompaktní rozložení pro malé displeje

**Datum:** 5. 11. 2026  
**Typ:** Responzivní úprava uživatelského rozhraní

- Zmenšeny okraje, mezery, vnitřní odsazení a výšky ovládacích prvků na telefonech s malým displejem.
- Herní hlavička, ovládací tlačítka, hrací deska a přehled hráčů využívají dostupnou výšku úsporněji.
- Zachováno zobrazení celé hrací desky bez posouvání herní obrazovky.
- Zkompaktněny také hlavní menu, lobby, nastavení, místnost a pravidla; jejich dosavadní možnost posouvání zůstává zachována.
- Doplněny samostatné úpravy pro šířku do 420 px, do 360 px a výšku do 680 px.

**Dotčené soubory:**
- `css/menu-premium.css`

**Navazující změny:** žádné.

## 1.00.00.02 – Stručné označení nedostupného 3D

**Datum:** 5. 11. 2026  
**Typ:** Úprava uživatelského rozhraní  
**Mění:** chování a zobrazení zavedené verzí 1.00.00.01

- Při automatickém přepnutí z 3D na 2D kvůli chybě se přepínač zobrazí jako `BEZ 3D`.
- Technické označení `2D SVG` se odstranilo.
- Při ruční volbě 2D zůstává označení `2D`; při 3D se zobrazuje `3D`.
- Přepínač zůstává aktivní, takže lze 3D ručně zkusit znovu.

**Dotčené soubory:**
- `js/game-board-view.js`

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
