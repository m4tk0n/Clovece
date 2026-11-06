# Debug režim hry

Debug režim se zapíná přidáním parametru `?debug=1` do adresy hry, například:

`https://example.com/clovece/?debug=1`

Bez parametru jsou níže popsané debug prvky vypnuté. Režim je určený pro testování a diagnostiku; některé jeho funkce záměrně mění způsob ovládání tahu.

## 1. Diagnostický panel obrazovky

Malý červený panel je připnutý ke spodnímu okraji právě viditelné části obrazovky, nikoli k obsahu stránky. Jeho polohu průběžně přizpůsobuje Visual Viewport API (včetně změn při otevření klávesnice nebo skrytí adresního řádku). Nezabírá místo v herním rozložení a neblokuje dotykové ovládání.

Panel lze klepnutím rozbalit a dalším klepnutím opět sbalit. Rozbalený panel obsahuje chronologický protokol načítání a inicializace modulů. U každé operace je stav (`…` probíhá, `OK` dokončeno, `CHYBA` selhalo) a po dokončení také doba trvání v milisekundách. Panel lze ovládat také klávesami Enter a mezerník.

Protokol sleduje načtení hlavních JavaScript modulů, spuštění jejich inicializačních funkcí a také CSS soubory. U CSS uvádí adresu, stav a dostupnou dobu načítání. Sleduje i později vložené stylesheety a elementy <style>. Načítání čtyř hlavních modulů probíhá souběžně, proto jejich pořadí dokončení nemusí odpovídat pořadí v seznamu. Záznam „načteno“ znamená, že prohlížeč dokončil import modulu; sám o sobě neznamená, že každá jeho funkce nebo pozdější síťový požadavek již skončil.

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

Při otevření webu ani při zobrazení obrazovky „Vytvoření hry“ se CSS herní desky ani kostky nenačítá. Volba režimu se vyhodnotí až při prvním vykreslení skutečné hry:

- **2D:** načte se pouze `css/board-2d.css` a `css/dice-2d.css`; desku vykresluje SVG renderer.
- **3D:** načte se pouze `css/board-3d.css` a `css/dice-3d.css`, modul `js/game-board-3d.js` a následně Three.js s OrbitControls.
- Při přepnutí režimu se stylesheety předchozího režimu odstraní a načte se pouze dvojice pro nový režim.
- Při chybě 3D rendereru se aplikace vrátí do 2D a přepne také odpovídající CSS.

V debug protokolu se musí objevit pouze soubory aktivního režimu. Načtení 2D CSS nesmí vyžadovat 3D renderer ani knihovnu Three.js a naopak 3D CSS se nesmí načíst při 2D hře.

## 2. Číslování polí na 3D desce

Při zobrazení desky ve 3D se zobrazí čísla všech polí hlavního okruhu a označení všech cílových polí:

- **Hlavní okruh:** čísla od 1 do délky okruhu (40, 48 nebo 80).
- **Cílové dráhy:** označení ve tvaru `D1-1` až `D1-4`, obdobně pro další pozice hráčů.
- Číslování vychází přímo z indexů herních dat desky; není to samostatné číslování podle pořadí hráčů, kteří se skutečně účastní hry.

Číslování je implementováno v 3D rendereru. Ve 2D zobrazení se úplná čísla polí hlavního okruhu a cílových drah nevykreslují.

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

## 5. Co debug režim aktuálně nezobrazuje

Aktuální debug režim nezobrazuje samostatný textový výpis všech souřadnic polí a figurek, kompletní interní stav herního enginu, síťové požadavky online hry ani automatický záznam všech rozhodnutí AI. Tyto údaje nejsou součástí současných debug nástrojů.

## 6. Vypnutí

Odstraňte z adresy parametr `debug=1`. Diagnostický panel, číslování 3D polí, vizualizace legálních tahů a ruční výběr místo automatického vynuceného tahu se pak vypnou.
