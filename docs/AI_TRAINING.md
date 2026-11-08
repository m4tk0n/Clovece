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

### DODĚLAT

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
- Pokud pro situaci žádná přesná naučená preference neexistuje, použije náhradní výběr z legálních tahů.
- Odhady zbývajících kroků a ohrožení jsou zatím pouze popisné; obecné taktické váhy a zobecňování podobných situací ještě nejsou hotové.

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
