# Člověče, nezlob se!

Moderní webová verze deskové hry pro PHP hosting na WZ.cz.

## Aktuální stav

První hratelná verze podporuje lokální hru na jednom zařízení. Více živých hráčů se střídá u stejného zařízení a do hry lze přidat počítačové soupeře.

### Herní možnosti

- 2 až 8 hráčů v libovolné kombinaci lidí a AI
- Podrobná a závazná pravidla hry včetně dostupných desek jsou vedena výhradně v [GAME_RULES.md](docs/GAME_RULES.md)
- Automatické tahy AI se třemi úrovněmi obtížnosti (lehká, střední, těžká); taktika a pravděpodobnostní model jsou popsány v [AI_STRATEGY.md](docs/AI_STRATEGY.md)
- Animace kostky, vyhození a vítězství
- Responzivní rozhraní pro mobil i počítač

## Uživatelské účty

- Registrace a přihlášení jsou součástí online API.
- Účty jsou navázané na anonymní identitu zařízení; při registraci se zachová dosavadní identita a při přihlášení se převede do účtu.
- Hesla se ukládají pomocí `password_hash()` a ověřují pomocí `password_verify()`.
- Odhlášení odpojí pouze aktuální zařízení; ostatní přihlášená zařízení zůstanou připojena.
- Nová tabulka `player_accounts` se vytvoří opětovným spuštěním `install/install.php`. Instalátor používá `CREATE TABLE IF NOT EXISTS` a nemaže existující tabulky.

## Online multiplayer – plán

Online režim je implementovaný v základní podobě a probíhá ověřování na hostingu:
- anonymní identita zařízení a opětovné připojení na stejném zařízení
- pozvánkový odkaz pro připojení do čekající místnosti
- vytváření místností a připojování dalších hráčů
- synchronizace stavu hry přes PHP API a MySQL
- serverové házení kostkou a ověřování tahů
- chat a společný časový proud chatu a herních událostí (pravidla logování: [CHAT_LOG.md](docs/CHAT_LOG.md))
- pravidelné dotazování API; WebSockety nejsou vyžadovány

Před nasazením pro běžné hraní je nutné dokončit test na WZ.cz ve dvou samostatných zařízeních.

Herní pravidla jsou oddělená od vykreslování a rozhraní, aby bylo možné později připojit serverový herní engine bez přepisování celé hry.

## Počítačová AI

- Architektura průběžného učení, dynamických parametrů a návaznosti místní/online/GitHub AI: [AI_LEARNING_ARCHITECTURE.md](docs/AI_LEARNING_ARCHITECTURE.md).

- Obtížnost místní AI se nastavuje při vytváření hry: lehká, střední nebo těžká.
- Všechny úrovně vybírají pouze legální tahy herního enginu.
- AI vyhodnocuje postup, dokončení figurek, vyhazování, riziko zásahu soupeřem a podle obtížnosti také očekávané pokračování po šestce.
- Kompletní popis algoritmu, pravděpodobností, omezení a testů je v [AI_STRATEGY.md](docs/AI_STRATEGY.md).

## Historie verzí

Přehled verzovaných změn projektu je veden v [docs/VERSION_HISTORY.md](docs/VERSION_HISTORY.md).

## Struktura

- index.php – vstupní bod, pseudo-CRON a obrazovky aplikace
- js/game-engine.js – pravidla a stav hry
- js/ai-strategy.js – samostatné strategické vyhodnocení tahů AI a pravděpodobnost ohrožení
- js/game-board.js – SVG hrací plán pro 2–8 hráčů
- js/app.js – koordinace lokální hry a AI
- js/dice.js – řízení hodu a volba 2D/3D animace kostky (načítá se až při použití lokální/online hry)
- js/dice-rotation.js – společný rotační plán pro 2D a 3D kostku
- js/settings.js – nastavení hry; načítá se samostatně z menu bez načtení herního enginu a rendereru
- js/player-setup.js – výběr hráčů, barev, velikosti desky a obtížnosti AI
- js/game-log.js – herní chat, log událostí a rozstřel
- js/game-view.js – vykreslení hráčů a stavu tahu
- js/game-turn.js – pohyb figurek, hody, průběh tahů a AI
- css/menu-components.css – základní komponenty hlavního menu, načítá se při startu
- css/components.css – společné odkazy a drobné komponenty pro ostatní obrazovky
- css/components-auth.css – přihlašovací a registrační formuláře
- css/components-player-selection.css – výběr hráčů a náhled sestavy
- css/components-online.css – lobby, místnosti a seznam účastníků
- css/components-chat.css – společné styly chatu v místnosti a ve hře
- css/components-settings.css – ovládací prvky nastavení
- css/components-rules.css – zobrazení pravidel
- css/components-game.css – herní tlačítka a karty hráčů
- css/menu-animations.css – animace načítané při startu mimo herní obrazovku
- css/animations.css – herní animace, načítají se až při vstupu do hry
- css/game-premium.css – herní rozhraní a animace herních událostí; načítá se až při vstupu do hry společně se styly desky a kostky
- online-api.php – online API, účty, anonymní identity a serverově ověřované herní tahy
- lib/account-auth.php – registrace, přihlášení, odhlášení a sloučení identit
- js/auth.js – obsluha přihlašovacích a registračních formulářů
- api.php – původní API pro starý registrační datový model (online režim ho nepoužívá)
- install/install.php – instalace databázových tabulek

## Oddělené styly 2D/3D

- `css/board-2d.css` a `css/dice-2d.css` obsahují vzhled 2D desky a CSS 3D animaci šestistranné kostky bez WebGL.
- `css/board-3d.css` obsahuje vzhled 3D desky; kostka v tomto režimu se vykresluje a animuje samostatně pomocí Three.js.
- Při spuštění hry se načte pouze dvojice CSS odpovídající aktivnímu režimu. Při přepnutí režimu se předchozí dvojice odpojí.
- Základní `game-premium.css` již neobsahuje grafická pravidla desky ani animace kostky.

## Odložené načítání herních částí

- Při otevření webu se načítá pouze navigace a zvuk. Lokální herní runtime se importuje až při vstupu do lokální hry nebo nastavení; online modul až po otevření lobby a renderer/engine až při aktivní online hře.
- `css/game-premium.css` se připojí až při otevření výběru lokální hry. CSS desky a kostky se připojí až při spuštění hry a načte se pouze sada pro právě zvolený režim 2D nebo 3D.
- `css/menu-animations.css` obsahuje pouze animace potřebné mimo hru a načítá se při startu.
- `css/animations.css` obsahuje herní animace a načítá se až při otevření herní obrazovky.
- `css/menu-components.css` obsahuje pouze tlačítka a glitch vzhled hlavního menu.
- Komponenty jsou rozdělené podle obrazovek do `components-auth.css`, `components-player-selection.css`, `components-online.css`, `components-chat.css`, `components-settings.css`, `components-rules.css` a `components-game.css`. Navigace načte pouze moduly potřebné pro právě otevřenou obrazovku a při přechodu je nepotřebné moduly odpojí.
- Všechny dynamicky načítané CSS používají verzi z `filemtime()`, takže změna jednoho souboru nezneplatní cache ostatních.
- Při odchodu z herní obrazovky se herní stylesheety odpojí, DOM desky se vyčistí a 3D renderer uvolní WebGL prostředky, geometrii, materiály, ovladače a animační smyčku.
- Online lobby zůstává bez herního rendereru a bez importu lokálního herního runtime.
- Prohlížeče nemají standardní API pro odregistrování již importovaného ES modulu z modulové cache. Po odchodu proto uvolňujeme reference a aktivní prostředky; nelze zaručit okamžité fyzické odstranění samotného kódu modulu z paměti.

## Instalace a nasazení

1. Nastav databázové údaje v .env.
2. Spusť install/install.php, pokud databáze ještě není připravená.
3. Push do větve main automaticky spustí FTP nasazení do /clovece/.
4. Automatické testy herních pravidel se spouštějí v GitHub Actions.

## Technologie

- HTML5, CSS3, JavaScript ES modules
- Samostatný SVG renderer pro pevný 2D pohled shora a samostatný Three.js renderer pro 3D desku i prostorovou animaci kostky; SVG se do 3D režimu vůbec nezapojuje
- 3D kamera začíná shora a podporuje naklonění, otáčení a přiblížení; SVG režim zůstává vždy bez náklonu a perspektivy
- Varianty desky classic a polygon
- PHP a MySQL pro budoucí online režim
- GitHub Actions pro testování a FTP nasazení

## Cache statických souborů

- Lokální CSS a JavaScriptové soubory načítané přes `index.php` používají verzovací parametr `?v=` odvozený z času poslední změny konkrétního souboru pomocí PHP `filemtime()`.
- Verze se tedy změní pouze u souboru, který byl upraven. Ostatní soubory si mohou prohlížeče ponechat v cache.
- Verze se používá u všech lokálních CSS odkazů, u lokálních JavaScriptových modulů v `importmap` i u vstupního `js/bootstrap.js`.
- Externí knihovny a externí fonty mají vlastní URL a tímto mechanismem se neoznačují.
- Pokud lokální soubor neexistuje nebo jeho čas změny nelze načíst, funkce použije záložní verzi `1`; chybějící soubor tím samozřejmě nebude nahrazen.


## Oddělení logiky kostky

- `js/dice-rotation.js` obsahuje pouze společné cílové úhly a plán rotace; nemá závislost na DOM ani na rendereru.
- `js/dice.js` zajišťuje průběh hodu a podle aktivního režimu předá plán CSS animaci nebo 3D rendereru. Modul se importuje až při načtení herního runtime; v online režimu až při prvním hodu.
- `js/game-board-3d.js` vykresluje prostorovou kostku přes Three.js. Samotné Three.js se nadále importuje až při prvním použití 3D rendereru.
- `css/dice-2d.css` a `css/dice-3d.css` zůstávají oddělenými soubory vzhledu.


## Samostatné načítání nastavení

- Otevření obrazovky Nastavení načte pouze `js/settings.js` a potřebný zvukový modul. Nemusí kvůli tomu načítat `app.js`, herní engine ani renderer desky.
- Lokální herní runtime (`app.js`) se načte až při vstupu do výběru hry; modul kostky (`dice.js`) až při prvním hodu.
