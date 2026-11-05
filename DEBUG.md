# Debug režim hry

Debug režim se zapíná přidáním parametru `?debug=1` do adresy hry, například:

`https://example.com/clovece/?debug=1`

Bez parametru jsou níže popsané debug prvky vypnuté. Režim je určený pro testování a diagnostiku; některé jeho funkce záměrně mění způsob ovládání tahu.

## 1. Diagnostický panel obrazovky

Malý červený panel je připnutý ke spodnímu okraji právě viditelné části obrazovky, nikoli k obsahu stránky. Jeho polohu průběžně přizpůsobuje Visual Viewport API (včetně změn při otevření klávesnice nebo skrytí adresního řádku). Nezabírá místo v herním rozložení a neblokuje dotykové ovládání.

Zobrazuje:

- **DISPLAY** – rozměry obrazovky podle `screen.width × screen.height` v CSS pixelech.
- **OKNO** – rozměry okna stránky podle `window.innerWidth × window.innerHeight`.
- **VIDITELNÉ** – aktuálně viditelný viewport podle Visual Viewport API. Na mobilu se může měnit při otevření klávesnice nebo změně měřítka.
- **DPR** – poměr fyzických pixelů displeje k CSS pixelům (`devicePixelRatio`).
- **FPS** – orientační počet snímků za sekundu podle `requestAnimationFrame`; hodnota se obnovuje přibližně jednou za sekundu.

### Jak údaje vyhodnocovat

- Porovnání **DISPLAY**, **OKNO** a **VIDITELNÉ** pomáhá odhalit rozdíly při otočení telefonu, otevření klávesnice nebo změně měřítka.
- **DPR** odlišuje rozměry v CSS pixelech od fyzického rozlišení.
- **FPS** orientačně ukazuje plynulost vykreslování stránky. Nízká hodnota může ukazovat na vysokou zátěž zařízení, ale sama neurčí její příčinu.

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
