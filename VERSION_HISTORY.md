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

## 1.00.00.06 – Úplné uvolnění textur 3D desky

**Datum:** 6. 11. 2026  
**Typ:** Oprava správy grafických prostředků

- Při překreslení 3D desky se nyní kromě geometrií a materiálů uvolňují také textury používané materiály.
- Stejné úplné čištění probíhá při ukončení 3D rendereru a odchodu z herní obrazovky.
- Oprava zabraňuje hromadění CanvasTexture objektů při opakovaném vykreslování desky, zejména v debug režimu s číslováním polí.

**Dotčené soubory:**
- `js/game-board-3d.js`



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
