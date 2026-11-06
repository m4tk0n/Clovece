## 1.00.00.25 – Testovací laboratoř a rozšířená diagnostika

**Datum:** 7. 11. 2026  
**Typ:** Testovací a diagnostické nástroje

- Aplikace obsahuje automatickou testovací laboratoř dostupnou přes parametr `?test=1`: [otevřít testovací laboratoř](https://7x.wz.cz/clovece/?test=1).
- Laboratoř spouští automatickou místní partii v aktuálním prohlížeči nad skutečným herním enginem a rendererem. Umožňuje testovací běh pozastavit, obnovit a zastavit a sleduje průběh hry v protokolu.
- Testovací režim používá izolovanou místní hru; nevytváří online místnosti ani nemění běžné rozehrané online hry.
- Diagnostický režim je dostupný přes parametr `?debug=1`: [otevřít debug režim](https://7x.wz.cz/clovece/?debug=1).
- Debug panel sleduje rozměry displeje a viewportu, DPR, FPS a načítání JavaScriptových modulů a CSS. Panel lze sbalit, rozbalit a přesouvat.
- Při zobrazení 3D desky debug panel zobrazuje živé souřadnice kamery, její náklon ve stupních a souřadnice cílového bodu. Hodnoty se aktualizují také při ručním pohybu kamery.
- Testovací a diagnostické nástroje jsou oddělené od běžného herního režimu.

**Dokumentace a implementace:**
- Testovací laboratoř: `TEST_RUNNER.md`, `js/` a související testovací soubory.
- Diagnostika: `DEBUG.md`, `js/debug-bootstrap.js`, `js/debug-overlay.js` a `js/game-board-debug.js`.
- Izolaci debug režimu ověřuje `tests/debug-isolation.test.mjs`.

**Ověření:** existence a popsané funkce ověřeny kontrolou zdrojových souborů a dokumentace. Praktický kompletní běh testovací laboratoře na živém hostingu nebyl v rámci této změny spuštěn.

---

## 1.00.00.24 – Jednotné místo nastavení 3D kamery

**Datum:** 7. 11. 2026  
**Typ:** Technické sjednocení nastavení 3D zobrazení

- Výchozí pohled 3D hrací desky se nastavuje z jediné konfigurace v `js/game-camera-config.js`.
- V tomto souboru jsou soustředěny náklon kamery (aktuálně 55°), vzdálenost, směr pohledu, cílový bod, zorný úhel i limity přiblížení a otáčení.
- Funkce `configureBoardCamera()` předává tato nastavení Three.js kameře a ovládacím prvkům.
- Renderer `js/game-board-3d.js` nastavení kamery pouze používá; nemá obsahovat vlastní kopie výchozích hodnot.
- Výběr režimu 2D/3D, automatické ověření podpory a přepnutí při chybě zůstávají řízeny v `js/game-board-view.js`.

**Kde se co nastavuje:**
- Parametry 3D kamery a výchozího pohledu: `js/game-camera-config.js`.
- Řízení režimu 2D/3D: `js/game-board-view.js`.
- Samotné prostorové vykreslení desky: `js/game-board-3d.js`.

**Ověření:** zdrojová kontrola konfigurace a jejího použití v rendereru; praktické ověření na telefonu nebylo provedeno.

---

## 1.00.00.23 – Strategická AI se třemi úrovněmi obtížnosti

**Datum:** 6. 11. 2026  
**Typ:** Nová funkce – lokální počítačová AI

- Přidán samostatný modul `js/ai-strategy.js` pro hodnocení legálních tahů.
- AI vyhodnocuje postup, dokončení figurek, vyhození soupeře, ztracený postup soupeře a pravděpodobnost ohrožení vlastních figurek.
- Pravděpodobnost zásahu počítá také s řetězením šestek; například vzdálenost 4 má pravděpodobnost 1/6 a vzdálenost 20 má pravděpodobnost 1/1296 za předpokladů modelu.
- Přidány obtížnosti Lehká, Střední a Těžká. Výchozí je Střední.
- Těžká AI vyhodnocuje očekávanou hodnotu pokračování po bonusové šestce pro všech šest možných dalších hodů.
- Obtížnost se vybírá při vytváření místní hry a ukládá se do stavu hry jako `aiDifficulty`.
- AI používá stejná pravidla a stejné legální tahy jako lidský hráč; nemá přístup k budoucím hodům.

**Nové soubory:**
- `AI_STRATEGY.md`
- `js/ai-strategy.js`
- `tests/ai-strategy.test.mjs`

**Upravené soubory:**
- `README.md`, `VERSION_HISTORY.md`, `.github/ROADMAP.md`
- `js/game-engine.js`, `js/player-setup.js`, `js/app.js`
- `screens/player-selection.php`, `css/components-player-selection.css`

**Ověření:** přidány regresní testy; automatické spuštění testů a praktické ověření hry je nutné potvrdit po CI.

---

## 1.00.00.22 – Povinnost vstoupit do domečku

**Datum:** 6. 11. 2026  
**Typ:** Nové rozšířené pravidlo místní hry

- Do nabídky rozšířených pravidel přidána volba „Povinnost vstoupit do domečku“ s přepínačem ANO/NE a informační nápovědou.
- Při zapnutí musí hráč využít alespoň jeden dostupný legální tah do volného cílového pole, pokud takový tah podle hodu a ostatních aktivních pravidel existuje.
- Pokud legální vstup neexistuje, zůstávají dostupné ostatní legální tahy.
- Při vypnutí může hráč zvolit jiný legální tah i tehdy, když má možnost vstoupit do domečku.
- Výchozí stav je ANO. Pravidlo ovlivňuje pouze místní JavaScriptový engine; online hra zůstává beze změny.

**Dotčené soubory:**
- `screens/player-selection.php`, `js/player-setup.js`, `js/game-engine.js`
- `GAME_RULES.md`, `.github/ROADMAP.md`

**Ověření:** zdrojová kontrola; automatické a praktické testy čekají.

---

## 1.00.00.21 – Přeskakování vlastních figurek v domečku

**Datum:** 6. 11. 2026  
**Typ:** Nové rozšířené pravidlo místní hry

- Do nabídky rozšířených pravidel přidána volba „Přeskakování v domečku“ s přepínačem ANO/NE a informační nápovědou.
- Při zapnutí lze přeskočit vlastní figurky na mezilehlých polích cílové dráhy.
- Hod kostkou stále určuje přesný cílový krok; například z D1 při hodu 2 lze skončit na D3 i při obsazeném D2.
- Na obsazené cílové pole vstoupit nelze.
- Výchozí stav je ANO. Volba se předává pouze lokálnímu JavaScriptovému enginu; online hra zůstává beze změny.

**Dotčené soubory:**
- `screens/player-selection.php`, `js/player-setup.js`, `js/game-engine.js`
- `GAME_RULES.md`, `.github/ROADMAP.md`

**Ověření:** zdrojová změna; automatické a praktické testy čekají.

---

## 1.00.00.20 – Nastavitelná rozšířená pravidla místní hry

**Datum:** 6. 11. 2026  
**Typ:** Nová funkce – nastavení místní hry

- Ukázkové položky nahrazeny pravidly 3 hody a Povinnost nasadit.
- Každé pravidlo má informační nápovědu a přepínač ANO/NE.
- Výchozí stav obou pravidel je ANO; zachovává dosavadní chování.
- Vypnutí pravidla 3 hody omezí získání šestky na jediný pokus.
- Vypnutí povinnosti nasadit dovolí při šestce táhnout již nasazenou figurkou.
- Volby ovlivňují pouze lokální JavaScriptový engine; online režim zůstává beze změny.

**Dotčené soubory:**
- `screens/player-selection.php`, `css/components-player-selection.css`
- `js/player-setup.js`, `js/game-engine.js`, `js/app.js`, `js/game-turn.js`

**Ověření:** čeká na automatické a praktické testy.

---

## 1.00.00.19 – Automatická volba velikosti desky podle počtu hráčů

**Datum:** 6. 11. 2026  
**Typ:** Úprava výběru místní hry

- Při snížení počtu hráčů se automaticky zvolí nejmenší dostupná velikost desky.
- Při zvýšení počtu hráčů zůstane ruční volba zachována, pokud je pro nový počet stále dostupná.
- Pokud zvolená deska přestane být dostupná, automaticky se vybere nejmenší dostupná velikost.
- Dostupné velikosti: 2–4 hráči: 40, 48 nebo 80 polí; 5–6 hráčů: 48 nebo 80 polí; 7–8 hráčů: 80 polí.

**Dotčené soubory:**
- `js/player-setup.js`

**Ověření:** uživatel potvrdil funkčnost změny po sloučení PR #32.

---

## 1.00.00.18 – Registrace a přihlašování uživatelských účtů

**Datum:** 6. 11. 2026  
**Typ:** Nová funkce – uživatelské účty

- Hlavní obrazovka nabízí samostatná tlačítka Registrace a Přihlásit se.
- Registrační a přihlašovací formuláře komunikují s novými akcemi online API.
- Hesla se ukládají pomocí `password_hash()` a kontrolují pomocí `password_verify()`.
- Účet je navázán na dosavadní anonymní identitu zařízení.
- Při přihlášení na jiném zařízení se anonymní identita sloučí s účtem; zachová se přístup k jeho rozehraným hrám.
- Odhlášení převede pouze aktuální zařízení zpět na anonymní identitu.
- Přidána tabulka `player_accounts`; opakovatelný instalátor ji vytvoří bez mazání existujících tabulek.

**Dotčené soubory:**
- `index.php`, `screens/login.php`, `screens/register.php`
- `online-api.php`, `lib/account-auth.php`
- `js/auth.js`, `js/navigation.js`, `js/online/api.js`
- `install/schema.sql`, `css/components-auth.css`
- `README.md`, `.github/ROADMAP.md`

**Ověření:** automatická kontrola syntaxe a praktický test na WZ.cz zatím čekají. Po nasazení je nutné jednou znovu spustit `install/install.php`, aby vznikla nová tabulka.

---

## 1.00.00.11 – Společná rotace kostky v režimech 2D a 3D

**Datum:** 6. 11. 2026  
**Typ:** Sjednocení animace

- 2D CSS kostka a 3D Three.js kostka používají jeden společně vypočítaný plán rotace.
- Sjednocen výchozí a cílový úhel, počet otoček, směr, délka běžné animace (1 500 ms) i časování rychlého režimu.
- Three.js používá stejnou Bézierovu křivku jako CSS animace; zachovává si vlastní prostorové vykreslení, materiály a osvětlení.
- Při chybě Three.js může CSS náhradní animace pokračovat podle stejného plánu.

**Dotčené soubory:**
- `js/app.js`
- `js/game-board-3d.js`

**Ověření:** zdrojové změny a návaznost sdílených parametrů; vizuální kontrola v prohlížeči ani na telefonu nebyla provedena.

---

## 1.00.00.10 – Pomalejší rotace a větší body 3D kostky

**Datum:** 6. 11. 2026  
**Typ:** Vizuální úprava

- Zpomalení animace rotace: běžný hod z 1 650 na 2 600 ms, rychlý hod ze 480 na 720 ms.
- Zvětšení prostorových bodů kostky přibližně o 27 % a odpovídající zvětšení jejich kovových kroužků.
- Zachována velikost kostky, rozložení bodů, barvy, materiály a výsledná orientace všech šesti stran.

**Dotčené soubory:**
- `js/game-board-3d.js`

**Ověření:** automatická kontrola změněných hodnot a načtení souboru z GitHubu; vizuální kontrola na zařízení nebyla provedena.

---

## 1.00.00.09 – Sjednocení velikosti 2D a 3D kostky

**Datum:** 6. 11. 2026  
**Typ:** Vizuální úprava

- 3D kostka má stejnou cílovou velikost jako CSS kostka v režimu 2D: 120 px na větších displejích a 104 px na telefonech do šířky 600 px.
- Měřítko Three.js vykreslení se vypočítává podle rozměru geometrie a výšky viewportu; prostorový vzhled, zaoblené hrany, materiály, barvy a animace zůstávají zachovány.

**Dotčené soubory:**
- `js/game-board-3d.js`

**Ověření:** změna zdrojového kódu a návaznost velikostí ověřeny; vizuální kontrola na zařízení nebyla provedena.

---

## 1.00.00.05 – Prémiová Three.js kostka pro 3D režim

**Datum:** 6. 11. 2026  
**Typ:** Vizuální úprava

- Kostka v režimu 3D má samostatný Three.js vzhled, odlišný od CSS kostky v režimu 2D.
- Zaoblené keramické tělo, kovové detaily, lesklé body, prostorové nasvícení a stín.
- 2D kostka zůstává beze změny.

**Dotčené soubory:**
- `js/game-board-3d.js`

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


## 1.00.00.08 – Odložené načítání herního runtime a uvolnění prostředků

**Datum:** 6. 11. 2026  
**Typ:** Optimalizace načítání a životního cyklu hry  
**Navazuje na:** verzi 1.00.00.07

- Lokální herní runtime se neimportuje při startu hlavního menu; načte se až při vstupu do lokálního nastavení hry.
- Samotný modul online lobby se importuje až po otevření lobby; při startu se nenačítá ani online API bootstrap.
- Online herní renderer, herní engine a animace kostky se načtou až při aktivní online hře.
- Herní CSS se připojí až při zobrazení hry společně se styly aktivního režimu.
- Při odchodu z herní obrazovky se herní stylesheety odpojí, DOM desky vyčistí a 3D renderer uvolní grafické prostředky i vlastní reference.
- ES moduly nelze standardním API odebrat z modulové cache prohlížeče; uvolňují se aplikační reference a aktivní prostředky.

**Dotčené soubory:**
- `index.php`
- `js/bootstrap.js`, `js/navigation.js`, `js/app.js`, `js/online.js`
- `js/game-board.js`, `js/game-board-view.js`, `js/game-board-3d.js`
- `README.md`, `DEBUG.md`, `.github/ROADMAP.md`

**Ověření:** čeká na automatické testy a praktické ověření v prohlížeči.

## 1.00.00.07 – Oddělení CSS 2D a 3D desky a kostky

**Datum:** 6. 11. 2026  
**Typ:** Refaktoring CSS a odložené načítání

- Vzhled 2D SVG desky je samostatně v `css/board-2d.css`.
- Vzhled 3D desky a jejího HUD je v `css/board-3d.css`.
- Plochá animace kostky je v `css/dice-2d.css`; prostorová animace je v `css/dice-3d.css`.
- Při spuštění hry se načítá pouze dvojice CSS odpovídající aktivnímu režimu; při přepnutí se předchozí dvojice odpojí.
- Z `css/game-premium.css` byly odstraněny grafické styly desky a animace kostky.

**Dotčené soubory:**
- `css/game-premium.css`, `css/board-2d.css`, `css/board-3d.css`, `css/dice-2d.css`, `css/dice-3d.css`
- `js/game-board-view.js`, `js/app.js`
- `README.md`, `DEBUG.md`, `.github/ROADMAP.md`

**Ověření:** čeká na automatické testy a vizuální kontrolu.


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


## 1.00.00.12 – Oddělení logiky kostky od app.js

- Společné cílové úhly a plán rotace přesunuty do `js/dice-rotation.js`.
- Řízení hodu a volba mezi CSS 2D a Three.js 3D přesunuty do samostatného `js/dice.js`.
- Lokální hra předává nastavení kostky modulu; online režim načítá modul kostky samostatně a až při prvním hodu.
- Opraveno předávání společného rotačního plánu přes `game-board-view.js` až do 3D rendereru.


## 1.00.00.13 – Oddělení nastavení od herního runtime

- Uživatelská nastavení přesunuta do `js/settings.js`.
- Obrazovka Nastavení načítá samostatný modul bez importu `app.js`, herního enginu a rendereru desky.
- Lokální hra sdílí stejný objekt nastavení; modul se inicializuje pouze jednou.
- Rozšířena CI kontrola syntaxe o samostatné moduly kostky a nastavení.


## 1.00.00.14 – Oddělení výběru hráčů

- Výběr počtu hráčů, jejich jmen a barev i výběr velikosti desky přesunut do `js/player-setup.js`.
- `app.js` pouze převezme hotovou konfiguraci a vytvoří novou hru.
- Modul výběru hráčů je samostatný a nepřebírá řízení herního kola.


## 1.00.00.15 – Oddělení herního chatu a logu

- Chat, slučování herních událostí a souhrn rozstřelu přesunuty do `js/game-log.js`.
- Modul dostává stav hry přes getter a neimportuje `app.js`.


## 1.00.00.16 – Oddělení herního zobrazení

- Vykreslení statistik hráčů, desky a stavových ovládacích prvků přesunuto do `js/game-view.js`.
- Modul dostává herní stav přes getter a vykreslovač desky přes parametr; neimportuje `app.js`.


## 1.00.00.17 – Oddělení řízení tahů

- Pohyb figurek, animace kroků, hody kostkou, rozstřel, automatické tahy AI a návaznost tahů přesunuty do `js/game-turn.js`.
- Modul má vlastní stav právě probíhající hry a přijímá potřebné funkce jako závislosti.
- `app.js` zůstává koordinátorem obrazovek a propojení jednotlivých modulů.
