# Debug režim hry

Debug režim se zapíná přidáním parametru `?debug=1` do adresy hry, například:

`https://example.com/clovece/?debug=1`

Bez parametru jsou níže popsané debug prvky vypnuté. Režim je určený pro testování a diagnostiku; některé jeho funkce záměrně mění způsob ovládání tahu.


## Ovládání debug režimů

Režimy se přepínají parametrem v adrese stránky; nejde o přepínač uvnitř herního panelu.

| Režim | Adresa | Ovládání a účel |
|---|---|---|
| Běžná hra | bez parametru | Bez diagnostických a výukových panelů. |
| Technický debug | `/?debug=1` | Zobrazí červený diagnostický panel. Klepnutím se rozbalí nebo sbalí; rozbalený protokol lze ovládat také klávesami Enter a mezerník. |
| Výuka AI | `/?debug=training` | Zobrazí samostatný plovoucí panel **VÝUKA AI**. Technický diagnostický panel se nezobrazuje. |

Při přechodu mezi režimy změňte parametr v adrese a stránku znovu načtěte. Z technického debug režimu přejdete do výuky změnou `debug=1` na `debug=training`; opačně změňte hodnotu na `1`. Běžný režim otevřete odstraněním celého parametru `debug`.

### Ovládání panelu výuky AI

- Panel se zobrazí po vykreslení herní desky.
- Přesouvá se tažením za hlavičku; tlačítka v hlavičce slouží ke změně velikosti.
- Tlačítka **−** a **+** zmenšují a zvětšují panel.
- **PŘESKOČIT** uzavře hodnocení aktuálního rozhodnutí bez uložení.
- **SPRÁVNĚ** uloží pozitivní hodnocení rozhodnutí AI.
- **ODESLAT** uloží textovou opravu napsanou člověkem. Tlačítko je aktivní až po zadání textu a dostupnosti kontextu rozhodnutí.
- Stav uložení se zobrazí v panelu; úspěch se potvrzuje až po odpovědi serveru.

Výukový panel není technický debug panel a jeho ovládání ani hodnocení nemění pravidla hry.

## 1. Diagnostický panel obrazovky

Malý červený panel je připnutý ke spodnímu okraji právě viditelné části obrazovky, nikoli k obsahu stránky. Jeho polohu průběžně přizpůsobuje Visual Viewport API (včetně změn při otevření klávesnice nebo skrytí adresního řádku). Nezabírá místo v herním rozložení a neblokuje dotykové ovládání.

Panel lze klepnutím rozbalit a dalším klepnutím opět sbalit. Rozbalený panel obsahuje chronologický protokol načítání a inicializace modulů. U každé operace je stav (`…` probíhá, `OK` dokončeno, `CHYBA` selhalo) a po dokončení také doba trvání v milisekundách. Panel lze ovládat také klávesami Enter a mezerník.

Protokol sleduje načtení hlavních JavaScript modulů, spuštění jejich inicializačních funkcí a také CSS soubory. U CSS uvádí adresu, stav a dostupnou dobu načítání. Sleduje i později vložené stylesheety a elementy <style>. Při startu se souběžně načítá pouze navigace a zvuk. Online lobby se importuje až po kliknutí na ONLINE HRANÍ (nebo při otevření pozvánkového odkazu). Lokální herní runtime se načítá až po vstupu do lokální hry nebo nastavení; online herní runtime až po přechodu do aktivní online hry. Záznam „načteno“ znamená, že prohlížeč dokončil import modulu; sám o sobě neznamená, že každá jeho funkce nebo pozdější síťový požadavek již skončil.

Zobrazuje:

- **DISPLAY** – rozměry obrazovky podle `screen.width × screen.height` v CSS pixelech.
- **OKNO** – rozměry okna stránky podle `window.innerWidth × window.innerHeight`.
- **VIDITELNÉ** – aktuálně viditelný viewport podle Visual Viewport API. Na mobilu se může měnit při otevření klávesnice nebo změně měřítka.
- **DPR** – poměr fyzických pixelů displeje k CSS pixelům (`devicePixelRatio`).
- **FPS** – orientační počet snímků za sekundu podle `requestAnimationFrame`; hodnota se obnovuje přibližně jednou za sekundu.

Pokud prohlížeč nepodporuje Visual Viewport API, panel se připne 2 px od spodního okraje okna. Pokud se diagnostický modul nepodaří načíst (například kvůli nepodporované import mapě nebo staré cache), bootstrap zobrazí nouzový červený panel s chybou a základními rozměry displeje a okna.

### Jak údaje vyhodnocovat

- Porovnání **DISPLAY**, **OKNO** a **VIDITELNÉ** pomáhá odhalit rozdíly při otočení telefonu, otevření klávesnice nebo změně měřítka.
- **DPR** odlišuje rozměry v CSS pixelech od fyzického rozlišení.
- **FPS** orientačně ukazuje plynulost vykreslování stránky. Nízká hodnota může ukazovat na vysokou zátěž zařízení, ale sama neurčí její příčinu.

### Co je a není zbytečné

Protokol ukazuje, které moduly aplikace při startu skutečně importuje a které inicializační funkce spouští. Zda je některý modul zbytečný, nelze rozhodnout jen podle toho, že se načítá: může být potřeba až po otevření konkrétní obrazovky nebo při online hře. K takovému závěru je nutné prověřit jeho použití a závislosti v kódu. Protokol nesleduje jednotlivé obrázky, zvukové soubory ani všechny síťové požadavky. U CSS vloženého přímo do DOM uvádí jeho identifikátor, nikoli přenesený objem dat.

### Odložené načítání 2D/3D

Při otevření webu se načítá pouze navigace, zvuk a základní CSS menu. Lokální herní runtime a společné herní UI CSS se načtou až po kliknutí na HRÁT, NOVÁ LOKÁLNÍ HRA nebo NASTAVENÍ. Při vstupu do výběru hry se načte pouze `game-premium.css`; CSS desky a kostky i konkrétní renderer se načtou až při spuštění hry. Online modul se importuje až po otevření lobby a online herní runtime až při přechodu místnosti do aktivní hry:

- **2D:** `game-premium.css` už je načtený z výběru hry; při spuštění hry se doplní `css/board-2d.css` a `css/dice-2d.css` a použije se SVG renderer.
- **3D:** `game-premium.css` už je načtený z výběru hry; při spuštění hry se doplní `css/board-3d.css`, `css/dice-3d.css`, modul `js/game-board-3d.js` a následně Three.js s OrbitControls.
- Při přepnutí režimu se stylesheety desky a kostky předchozího režimu odstraní a načte se odpovídající dvojice; společné `game-premium.css` zůstává připojené po dobu hry.
- Herní animace vyhození a vítězství (`kickerMove`, `kickedMove`, `kickEffect`, `confettiFall`, `trophyShine`) jsou součástí `game-premium.css`, takže se nenačítají v hlavním menu. Globální `animations.css` si ponechává animace potřebné pro menu a úvodní načítání.
- Při opuštění výběru hry nebo herní obrazovky se herní stylesheety odpojí, obsah desky vyčistí a 3D renderer uvolní WebGL prostředky, geometrii, materiály, ovladače, animační smyčku i vlastní reference na scénu a načtené knihovny.
- Již importované ES moduly nelze standardním API odebrat z modulové cache prohlížeče. Aplikace proto načítá herní moduly až při potřebě a po odchodu uvolní jejich aplikační reference a prostředky; fyzické vymazání kódu z paměti není garantovatelné.
- Při chybě 3D rendereru se aplikace vrátí do 2D a přepne také odpovídající CSS.

V debug protokolu se musí objevit pouze soubory aktivního režimu. Načtení 2D CSS nesmí vyžadovat 3D renderer ani knihovnu Three.js a naopak 3D CSS se nesmí načíst při 2D hře.

## 2. Číslování polí na 3D desce

Při zobrazení desky ve 3D se zobrazí čísla všech polí hlavního okruhu a označení všech cílových polí:

- **Hlavní okruh:** čísla od 1 do délky okruhu (40, 48 nebo 80).
- **Cílové dráhy:** označení ve tvaru `D1-1` až `D1-4`, obdobně pro další pozice hráčů.
- Číslování vychází přímo z indexů herních dat desky; není to samostatné číslování podle pořadí hráčů, kteří se skutečně účastní hry.

Číslování je implementováno v 3D rendereru. Ve 2D zobrazení se úplná čísla polí hlavního okruhu a cílových drah nevykreslují.

## 3. Diagnostika 3D kamery

V debug režimu se v panelu zobrazuje živá poloha 3D kamery a její náklon:

- **X, Y, Z** – aktuální souřadnice pozice kamery v prostoru scény.
- **NÁKLON** – úhel pohledu od svislé osy; 0° znamená pohled přímo shora.
- **CÍL** – souřadnice bodu, na který kamera míří.

Hodnoty se aktualizují při pohybu kamery, včetně ručního otáčení a přiblížení/oddálení. Souřadnice jsou uváděny na tři desetinná místa a úhel na jedno desetinné místo. Mimo 3D režim se údaje nezobrazují.

## 3. Vizualizace možných tahů ve 2D

Při fázi výběru figurky se na 2D desce zobrazí barevné značky tras legálních tahů aktuálního hráče:

- Značky se vykreslí pouze pro figurky, se kterými lze podle herního enginu legálně táhnout.
- Číslo ve značce označuje pořadí kroku v rámci právě dostupného tahu.
- U nasazení ze základny značka ukazuje startovní pole; nasazení se neposouvá o šest polí.
- Při pohybu po okruhu značky ukazují jednotlivé kroky a při vstupu do cílové dráhy také příslušná cílová pole.
- Barva značek rozlišuje figurky; samotný výpočet legálních tahů používá herní engine.

Jde o vizualizaci legálních tahů, nikoli o samostatný herní algoritmus. Značky nemění herní stav.

## 4. Ruční výběr tahu místo automatického vynuceného tahu

V běžném režimu může hra automaticky provést tah, pokud pravidla ponechávají pouze jedinou legální možnost. V debug režimu se toto automatické provedení přeskočí a zobrazí se výběr tahu.

To umožňuje testerovi zkontrolovat dostupnou možnost a ručně vybrat figurku. Neznamená to, že debug režim povoluje nelegální tahy: výběr a provedení nadále kontroluje herní engine.

Toto nastavení se týká běžného zpracování tahu v lokální herní logice. Automatické rozhodování AI má vlastní větev a AI si tah vybírá sama.

## 5. Ruční trénink AI

Samostatný režim výuky se spouští adresou:

`/?debug=training`

Po otevření se zobrazí výběr místní hry. Režim používá stejný herní engine a stejná aktivní pravidla jako běžná místní hra, ale vždy vynutí 2D desku.

- Na všech polích hlavního okruhu jsou viditelná čísla 1 až 40, 1 až 48 nebo 1 až 80.
- Cílová pole jsou označena `D1-1` až `D8-4` podle pozice ramene.
- Technický debug panel, měření CSS, velikost okna, FPS a informace o 3D kameře se v tomto režimu nezobrazují.
- Běžný herní chat zůstává zachován. Po tahu AI se přidá zelená zpráva ve formátu `[Jméno AI: vyhodnocení]`.
- Plovoucí panel ukazuje, co AI vybrala, její vysvětlení, ostatní legální možnosti a výsledek tahu.
- Ve spodní části panelu člověk napíše, co měla AI udělat a proč, a odešle instrukci.

### Ukládání instrukcí

Každé odeslané hodnocení dostane vlastní JSON soubor s názvem `YYYYMMDD-HHmmss-XXXX-[ok|err].json` ve složce `storage/ai-training/instructions/`. Pořadové číslo je společné pro oba typy záznamů a začíná hodnotou `0001`.

Záznam obsahuje čas vytvoření, text instrukce, verzi formátu a úplný kontext rozhodnutí: nastavení pravidel, hráče, stav figurek před tahem, legální možnosti, výběr AI, vysvětlení a výsledek tahu.

- `ok` označuje pozitivní hodnocení (`feedbackType: positive`), `err` opravnou instrukci (`feedbackType: correction`).
- Pořadové číslo `XXXX` se zvyšuje společně pro všechny záznamy: `0001`, `0002`, `0003`…
- Soubor se vytváří výhradně v režimu „create new“; existující záznam se nikdy nepřepisuje.
- Endpoint nemá operaci pro mazání ani úpravu instrukcí.
- Úložiště je uvnitř složky `storage/`, kterou webový server blokuje přes `.htaccess`.
- Ukládání používá session CSRF token, kontrolu původu požadavku a limit velikosti instrukce.
- Záznamy se neodesílají do GitHubu ani do databáze. Zůstávají na serveru.

**Důležité:** tato část zatím bezpečně shromažďuje tvoje opravy a kontext. Samotné vyhledávání podobných instrukcí, jejich zapojení do rozhodování AI a audit toho, které uložené instrukce AI při konkrétním tahu skutečně použila, bude navazující implementace. Uložené soubory se proto nesmějí považovat za již naučenou taktiku.

## 6. Vypnutí

Odstraňte z adresy parametr `debug=1`. Diagnostický panel, číslování 3D polí, vizualizace legálních tahů a ruční výběr místo automatického vynuceného tahu se pak vypnou.


## Oddělení debug režimu

- `index.php` vkládá `js/debug-bootstrap.js` pouze při parametru `?debug=1`.
- Běžný vstup `js/bootstrap.js` nezná debug režim a nenačítá diagnostické moduly.
- Diagnostika je v `js/debug-bootstrap.js`, `js/debug-overlay.js` a `js/game-board-debug.js`.
- Standardní herní moduly používají pouze obecné rozhraní `js/game-extensions.js`; bez registrovaného rozšíření nemá žádné diagnostické chování.
- Číslování 2D/3D polí, trasy legálních tahů, diagnostika kamery a ruční potvrzení jediného možného tahu se připojují výhradně přes debug rozšíření.
- Regresní kontrolu oddělení provádí `tests/debug-isolation.test.mjs`.

## 7. Hlavní dokumentace ruční výuky AI

Kompletní popis režimu `/?debug=training`, výukového panelu, tlačítek ODESLAT / SPRÁVNĚ / PŘESKOČIT, struktury JSON, serverového úložiště, zabezpečení a dalšího vývoje je v [AI_TRAINING.md](AI_TRAINING.md). Tento dokument je hlavním zdrojem informací o výuce AI.

## Umístění stylů diagnostického panelu

- Plovoucí technický panel zobrazovaný pouze při `?debug=1` vytváří `js/debug-overlay.js`.
- Veškerý vzhled panelu je definován v `css/debug.css`: pozice, rozměry, barvy, rámečky, typografie, tlačítko rozbalení, informační část, údaje o kameře a rozbalený protokol.
- JavaScript smí nastavovat pouze dynamické hodnoty nutné pro funkčnost a umístění při přetažení nebo změně viditelného viewportu. Nesmí obsahovat pevné definice vzhledu přes `style.cssText` ani nastavování vizuálních vlastností přes `element.style`.
- CSS třídy ovládané JavaScriptem (například zobrazení/skrytí údajů, rozbalení panelu a stav tažení) slouží pouze ke změně stavu; jejich vizuální podobu určuje `css/debug.css`.
- `css/debug.css` se načítá dynamicky pouze při aktivním debug režimu. Nesmí se načítat v běžné hře.
- Stejné oddělení platí pro všechny prvky určené výhradně pro debug a výuku AI: jejich vzhled patří do `css/debug.css`, nikoli do běžných herních stylesheetů.
- Při přidání nového debug prvku se jeho styly zapisují rovnou do `css/debug.css`; do běžných CSS souborů se nepřidávají.



## Stav a změny taktických vah AI

V rozbaleném panelu `?debug=1` se načítá `config/ai-training-state.json`. Panel zobrazuje původní a kandidátní hodnotu každé taktické váhy, rozdíl po tréninku, validační zlepšení a výsledek turnaje. Kandidát může být zobrazen i tehdy, když jej turnaj zamítl; produkční hodnoty se v takovém případě nemění.
