# Automatické vizuální testování hry

## Cíl

Přidat samostatný testovací režim, ve kterém lze sledovat automaticky hranou místní hru ve skutečném prohlížeči. Testovací režim nesmí používat vlastní kopii pravidel ani nahrazovat herní engine.

## Závazné zásady

- Zdroj pravidel: `GAME_RULES.md`; běhové chování se ověřuje proti skutečnému `js/game-engine.js`.
- Rozšířená pravidla se načítají z aktuální konfigurace hry. Test nesmí mít druhou natvrdo zapsanou implementaci pravidel.
- Automatické ovládání používá skutečné UI, skutečné animace kostky a skutečný pohyb figurek.
- Testovací hry jsou izolované od online místností, účtů a běžných rozehraných her.
- Testovací režim je výslovně označený a nesmí být dostupný běžným hráčům bez autorizace.
- Každý krok zapisuje čas, akci, hráče, hod, aktivní pravidla, očekávaný výsledek a skutečný výsledek.

## Ovládací panel

- Start: založí novou izolovanou místní testovací hru.
- Pause: zastaví plánování dalších akcí a bezpečně pozastaví automatizaci.
- Pokračovat: naváže ze stejného herního stavu.
- Stop: ukončí běh a uloží protokol.
- Rychlost: zpomalí nebo zrychlí prodlevy automatizace; nemění herní pravidla ani výsledek hodů.
- Živý obraz: přenos obrazu skutečného prohlížeče, nikoli napodobenina desky.

Pozastavení musí být kooperativní. Nesmí přerušit probíhající atomickou akci uprostřed změny stavu. Pokud se právě animuje hod nebo pohyb, doběhne tato animace a další herní akce se nespustí. Stav hry, aktuální hráč, fáze, hod a pozice figurek se zachovají.

## Pravidla a testovací scénáře

- Před spuštěním se zaznamená konfigurace hráčů, velikost desky a všechny aktivní rozšířené přepínače.
- Základní sada scénářů pokrývá rozstřel, nasazení, šestku, tři pokusy, povinné nasazení, řetězení šestek, vyhazování, vlastní výměnu na startu, pohyb po okruhu, přesný vstup do domečku, přeskakování figurek v domečku, povinný vstup do domečku a vítězství.
- Konfigurační test projde všechny kombinace čtyř aktuálních rozšířených přepínačů (16 kombinací).
- Testy ověřují lokální engine; online engine se testuje odděleně podle pravidel a jeho serverové autority.
- Náhodné hody musí být v automatických scénářích reprodukovatelné přes řízený zdroj hodů, aniž by se měnila produkční pravidla.

## Protokol a hlášení chyby

Každá událost protokolu obsahuje:
- identifikátor běhu a pořadové číslo kroku,
- čas a název scénáře,
- hráče, fázi tahu, hodnotu kostky a poslední akci,
- úplnou konfiguraci rozšířených pravidel,
- očekávaný a skutečný stav,
- chybu a stack trace, pokud existuje.

Tlačítko „Nahlásit chybu“ připraví GitHub Issue s protokolem, konfigurací a reprodukčním scénářem. Screenshot se připojí, pokud jej prohlížeč poskytne. Odeslání musí být chráněné serverovým tokenem; token nikdy nesmí být vložen do JavaScriptu ani poslán do prohlížeče. Před odesláním uživatel uvidí náhled hlášení. Tajné údaje, cookies, hesla a identifikátory účtů se do hlášení nezařazují.

## Doporučená technická architektura

1. Playwright ovládá skutečný prohlížeč nad testovací instancí aplikace.
2. Testovací adaptér dodá deterministické hody a automatické klikání, ale volá stejné UI a stejné produkční herní funkce.
3. Samostatný chráněný testovací kanál přenáší stav běhu, log a snímky obrazovky do testovací obrazovky, kterou lze otevřít na telefonu.
4. Ovládací příkazy Pause/Resume/Stop se předávají běžícímu Playwright procesu; při pauze se zachová kontext stránky i herní stav.
5. GitHub Actions spouští regresní scénáře a ukládá video, screenshoty, Playwright trace a protokol jako artefakty.
6. Reportér vytvoří GitHub Issue až po potvrzení uživatelem.

## Bezpečnost a izolace

- Testovací běhy používají samostatné testovací identity a testovací data.
- Automatický úklid smí mazat pouze data s jednoznačným testovacím prefixem.
- Žádný test nesmí vytvářet ani měnit skutečnou online rozehranou hru.
- Vzdálený živý panel i příjem příkazů musí být chráněné náhodným tokenem s omezenou platností.
- Pokud není živý přenos dostupný, test nesmí tvrdit, že uživatel sleduje živý obraz; nabídne video a artefakty po dokončení.

## Stav implementace

Tento dokument definuje cílové chování. Stávající Node.js testy ověřují herní engine a rozšířená pravidla, ale zatím samy neposkytují živý obraz prohlížeče, vzdálené Pause/Resume ani odesílání GitHub Issue. Tyto části je nutné implementovat a ověřit samostatně.
