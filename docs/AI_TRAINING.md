# Výuka a budoucí učení AI

Tento dokument je hlavním technickým popisem výuky AI v projektu Člověče, nezlob se. Popisuje spuštění, uživatelské rozhraní, tok dat, serverové ukládání, současné chování AI, bezpečnost i další práci.

**Stav dokumentace:** 2026-11-08  
**Vstupní adresa:** `/?debug=trainer` (starší alias `/?debug=training`)  
**Parametr:** `trainer` je hlavní název; `training` zůstává podporovaný jako alias.

## 1. Stav v kostce

### HOTOVO

- Samostatný režim ruční výuky a průběžného importu na `/?debug=trainer` (`training` zůstává jako alias).
- Výukový režim se zapíná přes `index.php` a debug bootstrap; používá lokální hru a vynucuje 2D zobrazení.
- Číslování polí na 2D desce pro přesný popis situace.
- Malé plovoucí okno výuky AI, které se zobrazí až po zobrazení hrací desky.
- Okno lze přesouvat myší i dotykem a měnit jeho velikost tlačítky − / +.
- Zobrazení rozhodnutí AI, jejího vysvětlení, alternativních kandidátů, výsledku tahu a pozic figurek před tahem.
- Herní chat zůstává běžným herním chatem; po tahu AI se přidá pouze krátká zelená zpráva ve tvaru `[Jméno AI: vyhodnocení]`. Podrobný rozbor je ve výukovém panelu.
- Tlačítko **ODESLAT** ukládá lidskou opravu.
- Tlačítko **SPRÁVNĚ** ukládá pozitivní příklad. Volitelný text v poli se ukládá jako poznámka `note`.
- Tlačítko **PŘESKOČIT** uzavře aktuální hodnocení bez uložení prázdného záznamu.
- Každé hodnocení se ukládá jako samostatný JSON soubor.
- Ukládání je append-only: endpoint vytváří nový soubor a neposkytuje operaci pro přepsání ani smazání záznamu.
- Ochrana úložiště proti přímému HTTP přístupu, CSRF token, kontrola původu požadavku a limit velikosti vstupu.
- Regresní testy v `tests/ai-training.test.mjs` a `tests/ai-strategy.test.mjs`.
- Běžný režim bez debug načte pouze kompilovanou paměť `ai-memory.json` a drží ji v cache; neprochází zdrojové JSON.
- Pouze `/?debug=trainer` před každým rozhodnutím volá `ai-training-knowledge.php` a zpracuje nové záznamy z append-only fronty.
- Nové záznamy se zpracují pouze jednou podle fronty `.training-queue` a uloženého bajtového offsetu. Adresář se pro migraci starších záznamů prohledá pouze při prvotním vytvoření fronty.
- Přesná shoda situace porovnává desku, pravidla, hráče, startovní sloty, kostku a pozice všech figurek.
- Opravná instrukce může obsahovat výslovné číslo figurky nebo může být cílová figurka vybrána přímo z nabídky legálních kandidátů. Kompilátor ověří, že cílová figurka byla v daném rozhodnutí legální.
- Pozitivní příklad znovu upřednostní dříve potvrzenou legální figurku ve stejné situaci.
- AI do rozhodnutí přidá `trainedKnowledge` a ID skutečně použité instrukce; debug log a výukový panel zobrazí `NAUČENO`.
- Naučená preference nikdy nepřekročí seznam legálních tahů a okamžitá výhra má stále přednost.
- Připravena inferenční vrstva neuronové sítě v `js/ai-neural-network.js` s verzovaným 18prvkovým vstupem.
- Místní AI umí neuronovým modelem ohodnotit pouze kandidáty vrácené herním enginem; výsledek se označuje `neuralNetwork` a `neural-network-v1`.
- Model se načítá dynamicky až při tahu AI ze souboru `js/models/ludo-ai.js`.
- Okamžitá výhra a přesná lidská naučená preference mají před neuronovým skóre přednost.
- Přidány regresní testy v `tests/ai-neural-network.test.mjs`.

### DODĚLAT

- Offline trénovací pipeline, která převede ověřené partie a lidská hodnocení na trénovací příklady a vyexportuje skutečné váhy do `js/models/ludo-ai.js`.
- Validační sadu a měření úspěšnosti proti dosavadní AI; dokud model neprojde testy, musí zůstat `enabled: false`.
- Vyhledávání relevantních uložených lidských instrukcí při rozhodování AI.
- Vyhodnocení podobnosti situace podle pravidel, desky, hráčů, pozic figurek, kostky a legálních tahů.
- Bezpečné zapojení nalezených instrukcí do taktického hodnocení. Instrukce nikdy nesmí změnit pravidla ani vytvořit nelegální tah.
- Audit každého rozhodnutí: uložit ID instrukcí, které AI skutečně použila, míru shody a důvod jejich použití.
- Přehled využití výuky: kolik je oprav, pozitivních příkladů a kolik z nich AI skutečně použila.
- Změnit názvy JSON souborů na časové názvy s výsledkem `ok` / `err` (viz kapitola 6).
- Prověřit a odstranit ze serveru staré nepoužívané checkpointy původního trénovacího systému. Nesmí se při tom odstranit nové lidské instrukce.

## 2A. Rozdíl mezi běžným režimem a trenérem

**Ano – i při běžném spuštění bez debug režimu AI používá to, co se už naučila.** Není potřeba spouštět trenéra, aby využívala dříve uložené zkušenosti.

| Režim | Co načítá před tahem | Co zapisuje |
|---|---|---|
| Bez `debug` | Používá kompilovanou paměť `ai-memory.json`, kterou načte při prvním použití a následně drží v cache stránky. Další tahy už kvůli výuce nevolají server. | Nic; pouze využívá již zpracované zkušenosti. |
| `?debug=trainer` | Před každým rozhodnutím zkontroluje frontu od posledního uloženého offsetu a zpracuje pouze nové JSON záznamy. | Aktualizuje `ai-memory.json` před rozhodnutím, takže nově zpracované zkušenosti může ihned použít. |

**Praktický postup:** nové hodnocení ulož v trenéru (`?debug=trainer`). Trenér ho zpracuje do trvalé paměti. Potom můžeš otevřít obyčejnou hru bez `debug` – AI už bude používat aktualizovanou paměť. Běžná hra sama nové výukové JSON nehledá ani nezpracovává.

Fronta `.training-queue` se doplňuje při uložení každého nového hodnocení. Při prvním spuštění trenéra se vytvoří jednorázový seznam již existujících JSON, aby se neztratila starší výuka. Při dalších tazích se nepoužívá `glob()` ani procházení celého adresáře.

Kompilovaná paměť je uložena v `storage/ai-training/ai-memory.json`. Uchovává agregované počty preferovaných figurek pro přesnou herní situaci, nikoli kopie celých původních záznamů. Po zpracování lze původní JSON smazat; paměť se tím nemaže. Neodstraňuj však `.training-queue`, `.training-queue.initialized` ani `ai-memory.json`.

## 2. Jak výukový režim spustit

Otevři:

```
https://7x.wz.cz/clovece/?debug=trainer
```

Běžná hra bez parametru `debug` pouze načítá kompilovanou paměť. Nečte adresář s výukovými JSON.

Vstupní bod je `index.php`. Rozpozná parametr `debug=training`, načte CSS výukového panelu a připojí `js/debug-bootstrap.js`. Samotná výuka je určena pro místní hru; panel se zobrazí až ve chvíli, kdy je herní deska skutečně vykreslená.

Režim používá stejný herní engine, pravidla a legální tahy jako běžná místní hra. Vynucení 2D zobrazení a číslování polí slouží pouze k přehlednému hodnocení situace. Výukový režim nesmí měnit pravidla ani povolené tahy.

## 3. Výukové okno a ovládání

Hlavní implementace panelu je v `js/ai-training-overlay.js`, vzhled v `css/ai-training.css`.

Panel obsahuje:

- hlavičku **VÝUKA AI** a stav aktuálního hodnocení;
- tlačítka − / + pro změnu velikosti;
- rozbor rozhodnutí AI;
- textové pole „Co měla AI udělat správně a proč?“;
- seznam všech rozhodnutí AI v aktuálním tahu (včetně dřívějších hodů, například šestky);\n- tlačítka pro výběr konkrétní legální figurky, kterou měla AI zvolit;\n- tlačítka **PŘESKOČIT**, **SPRÁVNĚ** a **ODESLAT**;
- stav ukládání a ID uloženého záznamu.

Panel je možné uchopit za hlavičku a přesunout. Umístění se omezuje na viditelný viewport, aby okno nezůstalo mimo obrazovku při otevřené klávesnici nebo změně velikosti okna.

### Co se v panelu zobrazuje

- jméno AI, číslo tahu a hod kostkou;\n- přepínač rozhodnutí v rámci tahu, aby bylo možné zpětně otevřít i rozhodnutí po předchozím hodu;
- vysvětlení vybraného tahu;
- vybraná figurka;
- ostatní zvažované legální možnosti a stručné důvody;
- výsledek tahu včetně pozice před a po tahu;
- přehled pozic figurek před rozhodnutím.

### Význam tlačítek

**ODESLAT**
- Vyžaduje neprázdný text.
- Uloží `feedbackType: correction`.
- Text se uloží do `instruction`.
- Jde o lidskou opravu původního rozhodnutí AI.

**SPRÁVNĚ**
- Potvrdí, že rozhodnutí AI bylo správné.
- Uloží `feedbackType: positive`.
- `instruction` je `null`.
- Případný text z pole se uloží do `note` jako vysvětlení, proč bylo rozhodnutí správné.
- Nejde o body do herního skóre ani o okamžitou změnu vah AI. Je to pozitivní výukový příklad pro budoucí fázi.

**PŘESKOČIT**
- Zahodí aktuální hodnocení.
- Nevytvoří žádný JSON soubor.
- Neznamená potvrzení správnosti ani chyby.

## 4. Tok dat a odpovědnosti souborů

| Soubor / část | Odpovědnost |
|---|---|
| `index.php` | Rozpozná `debug=training`, načte výukové CSS a debug bootstrap. |
| `js/debug-bootstrap.js` | Spouští debug rozšíření pro výukový režim. |
| `js/ai-training-overlay.js` | Vykreslení panelu, zobrazení rozhodnutí, obsluha tlačítek a odeslání JSON. |
| `css/ai-training.css` | Vzhled plovoucího panelu. |
| Událost `clovece:ai-training-decision` | Předává panelu kontext rozhodnutí AI. |
| `ai-training.php` | Vydání CSRF tokenu a bezpečné uložení jednoho záznamu. |\n| `ai-training-knowledge.php` | Read-only načtení nových souborů z privátní složky po ověření CSRF a ochrany úložiště. |\n| `js/ai-training-knowledge.js` | Kontrola serveru před každým rozhodnutím a cache načtených instrukcí v paměti hry. |
| `storage/ai-training/instructions/` | Trvalé soubory jednotlivých lidských hodnocení. |
| `tests/ai-training.test.mjs` | Regresní kontroly výukového režimu a ukládání. |
| `docs/AI_TRAINING.md` | Tento hlavní popis výuky a plánu dalšího vývoje. |
| `docs/AI_STRATEGY.md` | Popis aktuální strategie a oddělení výpočtů od pravidel. |

Událost `clovece:ai-training-decision` předává objekt s částmi `game`, `decision` a `result`. Panel z něj čte stav hry, hráče, pravidla, pozice figurek, legální kandidáty, vybraný tah, vysvětlení a výsledek. Server požaduje úplný kontext ve formátu `clovece-ai-debug`.

Panel sám nevymýšlí legální tahy a neprovádí herní simulaci. Je prezentační a sběrnou vrstvou. Výpočet legálních možností zůstává v herním enginu.

## 5. JSON záznam – co se ukládá

Endpoint je `ai-training.php`. Každý úspěšný požadavek vytvoří jeden nový JSON soubor ve složce:

```
storage/ai-training/instructions/
```

Záznam obsahuje zejména:

- `format` a `formatVersion`;
- `feedbackType`: `correction` nebo `positive`;
- jedinečné náhodné `id`;
- `createdAt` v UTC ve formátu ISO 8601;
- `instruction` – lidská opravná instrukce, u pozitivního příkladu `null`;
- `note` – volitelná poznámka k pozitivnímu příkladu;
- `context` – úplný kontext rozhodnutí;
- `sessionFingerprint` – hash session ID, nikoli samotné session ID.

Kontext rozhodnutí obsahuje podle předaného herního stavu a rozhodnutí například:

- velikost desky a délku okruhu;
- hráče, jejich typy a aktivní nastavení pravidel;
- hráče na tahu, fázi hry, kostku a číslo tahu;
- pozice všech figurek před rozhodnutím;
- seznam legálních tahů a kandidátů;
- vybranou figurku, důvody a vysvětlení AI;
- provedený tah a pozice figurek po tahu.

### Typy záznamů

| Typ | `feedbackType` | Formát | Obsah |
|---|---|---|---|
| Oprava | `correction` | `clovece-ai-human-instruction` | `instruction` obsahuje lidskou opravu. |
| Potvrzení | `positive` | `clovece-ai-positive-example` | `instruction=null`, volitelně `note`. |

## 6. Názvy souborů

Každý záznam má vlastní JSON soubor s názvem v tomto formátu:

```
YYYYMMDD-HHmmss-XXXX-[ok|err].json
```

Příklady:

```
20261108-063015-0001-ok.json
20261108-063118-0002-err.json
20261108-064205-0003-ok.json
```

Význam jednotlivých částí:

- `YYYYMMDD-HHmmss` – datum a čas vytvoření záznamu na serveru.
- `XXXX` – společné pořadové číslo s minimálně čtyřmi číslicemi, první záznam má `0001`, další `0002`, `0003` atd. Po dosažení `9999` pokračuje `10000`. Číslování se nezávisle neresetuje pro `ok` a `err`.
- `ok` – člověk označil rozhodnutí AI jako správné (`feedbackType: positive`).
- `err` – člověk odeslal opravu rozhodnutí AI (`feedbackType: correction`).

Pořadové číslo se přiděluje podle dosavadních záznamů v adresáři pod výhradním zámkem `.sequence.lock`, aby bylo jedinečné i při souběžném ukládání. Nový soubor se vytváří výhradně; existující záznam se nikdy nepřepisuje. Čas v názvu ani pořadové číslo nemění obsah a strukturu JSON. Starší záznamy se kvůli změně pojmenování nepřejmenovávají.

## 7. Serverové úložiště a ochrana dat

- Úložiště je v `storage/ai-training/instructions/`.
- Přístup přes HTTP blokuje soubor `.htaccess` s pravidlem `Require all denied`.
- Endpoint při prvním použití vytvoří potřebnou složku a ochranný soubor, pokud chybí.
- Ochranný soubor se nepřepisuje libovolně; opravuje se pouze přesně známá historická chybná varianta.
- JSON vzniká přes `fopen(..., 'x')`, tedy pouze jako nový soubor.
- Endpoint neumí číst, aktualizovat ani mazat uložené záznamy.
- Uložení vyžaduje session CSRF token a kontrolu původu požadavku.
- Limit těla požadavku je 64 KiB; text instrukce i poznámky má nejvýše 3000 znaků.
- Při chybě server vrátí neúspěšný stav; panel nesmí hlásit úspěšné uložení bez potvrzení endpointu.

### Kde data jsou a nejsou

- Lidské výukové JSON záznamy jsou na serveru v `storage/ai-training/instructions/`.
- Nejsou v MySQL.
- Nejsou v GitHub repozitáři.
- FTP deploy nesmí složku `storage/` přepsat ani synchronizací odstranit.
- Dokumentace v `docs/` je v FTP workflow vyloučena, takže se na webový server nenasazuje.

**Důležité rozlišení:** nové soubory v `storage/ai-training/instructions/` jsou aktuální lidské instrukce a pozitivní příklady – ty se musí zachovat. Staré checkpointy a soubory původního trénovacího systému jsou jiná data, současná AI je nepoužívá a nejsou součástí této výuky.

## 8. Jak se AI rozhoduje nyní

Aktuální místní strategie je v `js/ai-strategy.js`.

- Herní engine určuje legální tahy.
- AI nesmí měnit pravidla ani vytvořit vlastní nelegální tah.
- Pokud existuje okamžitě vítězný tah, AI ho upřednostní.
- Pokud kompilovaná paměť obsahuje naučenou preferenci pro přesně stejnou herní situaci, AI ji použije a vybere legální tah s nejvyšší podporou v uložených hodnoceních.
- Pokud přesná lidská preference neexistuje a je dostupný platný zapnutý model, neuronová síť ohodnotí legální kandidáty a vybere nejvyšší skóre.
- Pokud není dostupná ani lidská preference, ani platný model, použije se náhradní výběr z legálních tahů.
- Aktuální neuronový model je záměrně vypnutý (`enabled: false`), protože zatím nemá natrénované váhy. Běžné chování AI se proto nemění.
- Odhady zbývajících kroků a ohrožení jsou zatím pouze popisné; offline trénování a zobecňování lidských příkladů ještě nejsou hotové.
- Technický popis neuronové vrstvy, 18 vstupních příznaků, formátu modelu a podmínek zapnutí je v [AI_NEURAL_NETWORK.md](AI_NEURAL_NETWORK.md).

**Běžná hra bez debug režimu naučené informace používá.** Načítá pouze hotovou kompilovanou paměť `ai-memory.json`, nikoli jednotlivé výukové JSON soubory. Paměť zůstává v cache stránky, takže se před každým tahem znovu neprohledává server ani adresář.

**Nové záznamy zpracovává pouze trenér `/?debug=trainer`.** Ten před každým rozhodnutím kontroluje frontu nových záznamů, aktualizuje `ai-memory.json` a může nově zpracované zkušenosti hned použít.

Současné učení je omezené: preference se použije při přesné shodě herní situace. Oprava může určit figurku strukturovaně z nabídky legálních kandidátů nebo textovým zápisem čísla figurky. Obecné pokyny a podobné situace AI zatím neumí bezpečně zobecnit. Serverová AI online her zatím tuto znalostní vrstvu nepoužívá.

## 9. Jak má fungovat skutečné učení – cílový návrh

### HOTOVO
- Sběr lidských oprav a pozitivních příkladů včetně kontextu rozhodnutí.
- Trvalé uložení každého hodnocení jako samostatného neměnného JSON.

### DODĚLAT

1. Načítat z úložiště pouze relevantní a bezpečně ověřené záznamy.
2. Porovnávat situaci s uloženými příklady: aktivní pravidla, délka desky, počet hráčů, fáze hry, kostka, pozice figurek a dostupné legální tahy.
3. Vyhodnotit podobnost; nepoužít instrukci z odlišné situace jen proto, že obsahuje podobná slova.
4. Převést lidskou instrukci na taktickou preferenci pouze v rámci legálních kandidátů.
5. Pozitivní příklady používat jako potvrzení vhodného rozhodovacího vzorce, ne jako bezpodmínečný příkaz.
6. Při konfliktu s pravidly nebo s legálními tahy má vždy přednost herní engine.
7. Při každém rozhodnutí zaznamenat ID použitých instrukcí, skóre podobnosti a vysvětlení, jak ovlivnily pořadí kandidátů.
8. Pokud nebyla použita žádná instrukce, zaznamenat prázdný seznam; nikdy nevykazovat nepoužitou instrukci jako použitou.
9. V debug režimu zobrazit, které konkrétní instrukce AI použila a proč.
10. Připravit přehled, který umožní ověřit, zda se konkrétní lidská oprava promítla do pozdějšího rozhodnutí.

### Zásady, které se nesmí porušit

- `game_rules.md` / centrální herní pravidla jsou jediným zdrojem pravdy pro pravidla.
- AI vybírá pouze z tahů vrácených herním enginem.
- Výuková instrukce nikdy nesmí přepsat pravidla konkrétní hry.
- Lokální, AI-versus-AI i online režim musí používat stejný princip pravidel a legálních tahů.
- Běžná partie ani partie AI proti AI nesmí sama vytvářet lidské výukové instrukce.
- Uložené původní JSON záznamy se nesmějí přepisovat ani mazat automatickým učením.

## 10. Starý trénovací systém a úklid serveru

Původní systém checkpointů/modelů už není součástí aktuální strategie AI. Aktuální runtime ho nemá načítat ani vyžadovat.

Na FTP auditu byly dříve nalezeny staré soubory a adresáře související s názvy `ai-training` a `ai-training-search`. Samotná existence na FTP neznamená, že jsou používány aplikací.

**HOTOVO**
- Aktuální strategie AI nepoužívá staré checkpointy.
- Nová výuka ukládá lidské záznamy do oddělené cesty `storage/ai-training/instructions/`.
- `storage/` se vynechává z FTP deploye.

**DODĚLAT**
- Před odstraněním starých souborů na FTP znovu ověřit jejich přesné cesty a závislosti.
- Odstranit pouze prokazatelně nepoužívané checkpointy a pomocné soubory původního systému.
- Nikdy nesmazat `storage/ai-training/instructions/`, nové lidské JSON záznamy ani jejich ochranný `.htaccess`.
- Do budoucna starý trénovací systém nevracet do deploy workflow ani do runtime.

Dokumentace se ukládá v repozitáři v `docs/`; díky výjimce `docs/**` ve FTP workflow se na server nekopíruje. Na server patří jen soubory potřebné pro běh aplikace a zabezpečené úložiště uživatelských záznamů.


## 11. Hodnocení více rozhodnutí během jednoho tahu

Každé taktické rozhodnutí AI po hodu se uloží do historie aktuálního tahu. Historie je oddělená podle hráče a čísla tahu a resetuje se při nové hře. Další hod (například šestka a následná trojka) přidá další položku; nepřepíše předchozí rozhodnutí.

Ve výukovém panelu je seznam **Rozhodnutí v tomto tahu**. Lze přepnout na dřívější hod, zkontrolovat jeho původní pozice, kostku a legální možnosti a samostatně jej potvrdit, opravit nebo přeskočit. Již vyhodnocené položky zůstávají v seznamu označené jako vyhodnocené.

Oprava může být zadána textem (například „měla pohnout figurkou 3“) nebo výběrem tlačítka **Učit: figurka N** u konkrétního legálního kandidáta. Strukturovaná oprava uloží `decision.preferredPieceId`; textové vysvětlení je volitelné.

Kompilátor paměti přijme strukturovanou preferenci pouze tehdy, pokud její figurka patří do `decision.legalMoves` uloženého pro hodnocené rozhodnutí. Oprava rozhodnutí po šestce se tak nepřipíše následnému rozhodnutí po trojce a učení nikdy nevytvoří nelegální tah.


## 12. Přehled nastavení vytvořené hry v traineru

V režimu `/?debug=trainer` je před tlačítkem **KLASIK** informační tlačítko **i**. Otevře přehled skutečné konfigurace právě spuštěné partie: velikost desky, počet a typ hráčů, jejich jména a barvy, obtížnost AI a všechny volby rozšířených pravidel. Přehled čte přímo aktuální objekt hry; nezobrazuje výchozí hodnoty z formuláře pro vytvoření nové hry. Zavřít jej lze křížkem nebo opětovným kliknutím na **i**.


## 13. Ruční výběr hodnoty kostky v trenéru

V režimu `/?debug=trainer` je nad hrací deskou řada šesti kostek s puntíky 1–6. Člověk vždy vybírá hodnotu kliknutím na kostku; stejné ovládání platí i pro úvodní rozstřel a opakované hody po šestce. AI má přepínač `AI KOSTKA: RUČNĚ / AUTOMATICKY`. V ručním režimu čeká na výběr jedné z šesti hodnot, v automatickém režimu si hodnotu losuje jako dosud. Výchozí režim trenéru je ruční a volba se ukládá v localStorage daného prohlížeče. Po výběru hodnoty pokračuje původní herní engine; pravidla hodů, opakování šestek, tří pokusů, nasazení i trestů se nemění. Mimo trenérský režim zůstává původní automatické házení AI a tlačítko pro hod člověka beze změny.


## 14. Neuronová síť – připravená inferenční vrstva

Neuronová síť je samostatná hodnoticí vrstva nad existujícím herním enginem. Engine nadále vytváří legální tahy a simuluje jejich výsledky; síť nesmí vytvářet tahy ani implementovat vlastní pravidla.

- Runtime: `js/ai-neural-network.js`.
- Rozhodování místní AI: `js/ai-strategy.js`; předání modelu: `js/game-engine.js`; dynamické načtení při tahu: `js/game-turn.js`.
- Váhy modelu: `js/models/ludo-ai.js`. Aktuální soubor obsahuje pouze vypnutou prázdnou kostru, nikoli natrénovaný model.
- Vstupní vektor verze 1 obsahuje 18 normalizovaných hodnot a podporuje délky okruhu 40, 48 a 80.
- Model je plně propojená síť s vrstvami `weights`, `biases` a aktivacemi `relu`, `tanh` nebo `linear`. Runtime ověřuje formát, verzi, rozměry a konečné číselné hodnoty vah.
- Výběr tahu: okamžitá výhra → přesná lidská preference → neuronové skóre (pokud je model platný a zapnutý) → náhradní výběr.
- Testy: `tests/ai-neural-network.test.mjs`.

**Co zatím není hotové:** sběr a příprava trénovací množiny pro neuronovou síť, offline trénovací skript, validace výsledného modelu a export skutečných vah. Online PHP AI zatím neuronový model nepoužívá. Detailní technický popis je v [AI_NEURAL_NETWORK.md](AI_NEURAL_NETWORK.md).


---

## 15. Automatický self-play – první implementovaná fáze

**Stav:** sběr zkušeností a automatické spouštění jsou implementovány; neuronové trénování a nasazení nových vah zůstávají oddělenou další fází.

### Spuštění lokálně

```bash
npm run ai:self-play -- --games=250 --players=4 --board=40 --seed=20261108
```

Volby:
- `--games`: počet partií (1–10 000, výchozí 100).
- `--players`: počet automatických hráčů (2–8, výchozí 4).
- `--board`: deska 40, 48 nebo 80; kompatibilita odpovídá pravidlům.
- `--seed`: opakovatelný generátor hodů a rozhodovací náhody.
- `--max-actions`: limit tahů jedné partie (výchozí 20 000).
- `--output` a `--metrics`: cílové soubory JSONL a JSON.

Simulátor vytváří hru přes `createGame`, všechny hráče přepne na AI a tahy, hody, vyhazování i vítězství zpracovává přes produkční funkce `rollDice`, `getValidMoves`, `movePiece` a `advanceTurn`. Nepíše vlastní pravidla.

### Výstupy

- `artifacts/ai-self-play.jsonl`: jeden řádek na každé rozhodnutí; obsahuje legální kandidáty, 18prvkové vstupní vektory, vybraný tah, hráče, hod a konečný výsledek partie.
- `artifacts/ai-self-play-metrics.json`: souhrn počtu dokončených/nedokončených partií, vítězů, rozhodnutí a průměrné délky. Počty umístění se počítají pouze z dokončených partií.

Nedokončené partie mají `reward: null` a nesmějí být použity jako dokončené výsledkové příklady.

### Automatické spuštění na GitHubu

Workflow `.github/workflows/ai-self-play.yml`:
- lze spustit ručně přes GitHub Actions s volbou počtu partií, hráčů a desky;
- automaticky se spouští každé pondělí v 03:17 UTC;
- výsledky ukládá jako GitHub Actions artifact s retencí 90 dní;
- běží na GitHub runneru, nikoli na Webzdarma hostingu;
- má pouze oprávnění číst obsah repozitáře a nic automaticky necommitne do `main`.

Výchozí plán je 4 AI hráči na desce 40. Další kombinace lze spouštět ručně podle validačního plánu.

### Testování workflow

Před simulací se spouštějí cílené testy herního enginu, pravidel a AI (`game-engine`, `local-game-rules`, `ai-neural-network`, `ai-strategy`). Kompletní `npm test` nyní obsahuje dvě známé chyby v oddělených testech trenérského rozhraní (`ai-training.test.mjs`): kontrola inkrementální fronty a chyba `board is not defined` v testu ručního házení. Tyto chyby nejsou zakryté ani vydávané za úspěšné; jsou mimo rozsah self-play a musí se opravit samostatně.

### Důležité omezení první fáze

Aktuální strategie bez aktivního naučeného modelu vybírá mimo okamžitou výhru náhodně. Self-play proto nyní bezpečně sbírá reprodukovatelné herní záznamy, ale samotné opakování náhodných partií **není důkaz učení ani zlepšení**. Než se zapne automatická změna vah, musí být doplněn kvalitní učitel / hodnoticí algoritmus, trénovací skript a turnajové ověření nové verze proti původní. Model zůstává `enabled: false`.

### Vyhodnocovací zásady

- Porovnávat verze na stejné sadě seedů, stejném počtu hráčů, stejné desce a stejných pravidlech.
- Uvádět počet dokončených partií; nedokončené partie nezapočítávat jako výhru ani prohru.
- Výsledky oddělovat podle počtu hráčů a velikosti desky.
- Uchovávat původní data jako neměnné workflow artifacts; lidské instrukce v `storage/ai-training/instructions/` jsou zcela oddělené.
- Nový model nasadit pouze po statisticky smysluplném zlepšení a regresních testech.


---

## 16. Taktický učitel – druhá fáze

**Stav:** první deterministická heuristická verze implementována. Jde o učitele pro generování kvalitnějších self-play příkladů, nikoli o natrénovaný neuronový model.

### Co učitel hodnotí

Funkce `chooseTacticalTeacherDecision` v `js/ai-strategy.js` sestaví kandidáty výhradně z `getValidMoves` a simuluje každý kandidát přes produkční `movePiece`. Hodnocení zohledňuje:
- okamžitou výhru (má absolutní prioritu);
- snížení vlastních zbývajících kroků;
- zdržení soupeřů při vyhození;
- změnu rychlého odhadu ohrožení vlastních figurek na hlavním okruhu;
- dokončení figurky;
- penalizaci vyhození vlastní figurky při povinném nasazení.

Odhad ohrožení je záměrně rychlý: porovnává pozice figurek na okruhu a pravděpodobnost zásahu při vzdálenosti 1–6. Nenahrazuje přesnou enumeraci všech budoucích hodů a nesmí se vydávat za plnohodnotné prohledávání stromu hry.

### Self-play s učitelem

`scripts/ai-self-play.mjs` nyní vybírá tah taktickým učitelem a do každého rozhodnutí ukládá:
- skóre všech legálních kandidátů;
- rozpad skóre na postup, zdržení soupeře, změnu ohrožení, vyhození a dokončení;
- pořadí kandidátů učitele a vybraný tah;
- původní 18prvkové vstupní příznaky pro neuronovou síť.

Tím vznikají supervised trénovací preference: kandidát s vyšším učitelským skóre je preferovanější než kandidát s nižším skóre. Výsledné pořadí partie se ukládá samostatně jako výsledek celé hry.

### Omezení a další ověření

Učitel je první vysvětlitelná heuristika, nikoli zaručeně optimální strategie. Váhy jeho faktorů je nutné ověřit turnajově pro 2–8 hráčů a desky 40/48/80. Než se jeho data použijí k exportu modelu, je potřeba porovnat jeho výsledky s náhodnou baseline a ověřit, že se výhry a průměrné pořadí zlepšují. Učitel ani simulátor nemění herní pravidla.


---

## 17. Offline neuronové trénování – třetí fáze

**Stav:** trénovací skript a ruční GitHub Actions workflow jsou připravené. Výstupem je kandidátní model, nikoli automatická změna produkčních vah.

### Spuštění lokálně

Nejprve je potřeba mít stažené archivované soubory `*.jsonl.gz` z větve `ai-training-data` do `training-data/self-play/`. Potom:

```bash
npm run ai:train -- --input-dir=training-data/self-play --epochs=40 --seed=20261108
```

Volby:
- `--input-dir`: adresář s archivovanými `.jsonl` nebo `.jsonl.gz` soubory.
- `--epochs`: počet epoch (1–300, výchozí 40).
- `--learning-rate`: rychlost učení (0.0001–0.1, výchozí 0.01).
- `--seed`: reprodukovatelná inicializace vah a míchání příkladů.
- `--output`: výstupní kandidátní ES modul.
- `--metrics`: JSON report.

### Co se trénuje

- Vstup: stávajících 18 normalizovaných příznaků z `AI_FEATURE_SCHEMA_VERSION=1`.
- Architektura: plně propojená síť 18 → 32 → 16 → 1, ReLU v skrytých vrstvách a lineární výstup.
- Metoda: pairwise ranking. Pro každou situaci se porovnávají dvojice legálních kandidátů podle skóre taktického učitele. Síť se učí dát lepšímu kandidátu vyšší skóre.
- Nedokončené partie a neplatné vzorky se vynechají; shodné učitelské skóre nevytváří umělou preferenci.
- Validační rozdělení je oddělené po ID partie, nikoli náhodně po jednotlivých tazích.
- Nejlepší validační epochu skript exportuje jako `artifacts/ludo-ai-candidate.js`; metriky ukládá do `artifacts/ai-training-metrics.json`.

### Spuštění na GitHubu

1. Otevři GitHub Actions v repozitáři.
2. Vyber workflow **AI neuronové trénování (kandidát)**.
3. Klikni **Run workflow**.
4. Ponech 40 epoch a výchozí seed, případně změň hodnoty.
5. Po dokončení stáhni artifact `ai-neural-candidate-N`; obsahuje kandidátní model a report.

Workflow načte archiv z větve `ai-training-data`, spustí cílené testy a vyrobí kandidáta. Má pouze `contents: read`, nic necommituje do `main` ani nemění produkční model. Kandidát má `enabled: true` uvnitř odděleného artifactu, ale v aplikaci se nepoužívá, dokud jej člověk výslovně neověří a nenasadí.

### První neuronový trénovací běh (2026-11-08)

GitHub Actions run [#1](https://github.com/m4tk0n/Clovece/actions/runs/42480133631) úspěšně dokončil trénování. Zpracoval 272 878 záznamů ze 3 souborů; 174 006 záznamů nemělo alespoň dvě porovnatelné kandidátní volby a 120 566 dvojic mělo shodné učitelské skóre. Vzniklo 60 968 dvojic (48 192 trénovacích, 12 776 validačních). Nejlepší epocha byla 22, validační přesnost 71,462 % a log-loss 0,51109. Jde o napodobení učitele, nikoli důkaz vyšší úspěšnosti ve hře.

**Oprava formátu:** runtime validátor vyžaduje u každé vrstvy `outputSize`. Trénovací export nyní tuto hodnotu zapisuje; bez ní by vytvořený model nebyl runtime platný.

### Co znamenají metriky

- `train.accuracy`: podíl dvojic, u kterých síť správně napodobila pořadí učitele na trénovací množině.
- `validation.accuracy`: totéž na oddělených partiích.
- `logLoss`: kvalita pravděpodobnostního pořadí dvojic; nižší je lepší.
- `bestEpoch`: epocha s nejlepším validačním výsledkem.

Tyto metriky měří napodobení taktického učitele. **Neprokazují vyšší úspěšnost ve hře.** Před nasazením musí následovat turnaj kandidáta proti učiteli a dosavadní AI na stejných seedech, s výměnou startovních pozic.

### Pravděpodobnostní výpočty a vstupy

Runtime již obsahuje `estimateCaptureProbability(distance)` a přesnější `estimatePieceThreat(...)`, která enumeruje možné hody soupeře přes produkční engine včetně bonusových šestek a legálních tahů. Tato enumerace je přesnější než zjednodušený odhad učitele.

Aktuální síť ale stále přijímá **18 vstupů**; pravděpodobnostní výpočty nejsou samostatnými vstupy modelu verze 1. Učitel je používá při tvorbě taktického hodnocení. Rozšíření vstupního schématu o pravděpodobnost zásahu a další odvozené hodnoty vyžaduje novou verzi schématu, změnu runtime extrakce, trenéru i testů současně. Nesmí se potichu změnit pořadí ani význam existujících 18 hodnot.

### Bezpečnost nasazení

- Trénovací workflow nikdy nepřepisuje `js/models/ludo-ai.js`.
- Model v aplikaci zůstává vypnutý, dokud není dokončen turnaj a regresní testy.
- Při neplatném modelu runtime dál používá stávající náhradní strategii.
- Herní engine zůstává jediným zdrojem legálních tahů a pravidel.


### Regresní kontrola exportu modelu

Test `tests/ai-train.test.mjs` spouští trénovací skript nad malou umělou sadou, načte vzniklý ES modul a ověří jej skutečným runtime validátorem `isValidAINeuralModel`. Kontroluje také rozměry první a poslední vrstvy a počet trénovacích dvojic. Tento test běží před každým trénováním v GitHub Actions, aby se nevyrobil kandidát, který herní runtime odmítne.
