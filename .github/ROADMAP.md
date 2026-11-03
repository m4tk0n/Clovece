# Roadmapa – Člověče, nezlob se!

Průběžný plán vývoje online multiplayeru a souvisejících funkcí.

## Pravidla práce

- Pracujeme přímo ve větvi `main`.
- Před každou změnou načteme aktuální verzi dotčených souborů z GitHubu.
- Jeden update znamená jednu malou, samostatnou a ověřitelnou změnu.
- Každý update má vlastní commit. Push do `main` automaticky spustí testy a FTP nasazení na WZ.cz.
- Po každém updatu ověříme výsledek; další změnu nezačneme, dokud nebude předchozí zkontrolovaná.
- Zachováváme funkční lokální hru. Žádné hromadné přepisování.
- Dokumentace je v `.github/`, kterou FTP workflow vylučuje z nasazení na web.

## Aktuální výchozí stav

- [x] Prohlédnuta struktura projektu a hlavní herní moduly.
- [x] Ověřeno, že současná hra je lokální (více hráčů se střídá na jednom zařízení).
- [x] Ověřeno, že herní pravidla jsou oddělena v `js/game-engine.js` a mají automatické testy.
- [x] Ověřeno, že existuje starší `api.php` a databázový instalátor `install/install.php`.
- [x] Ověřeno, že push do `main` spouští FTP deploy do `/clovece/` a testy.
- [x] Zjištěny zásadní nesoulady staršího API a databázového návrhu s požadovaným anonymním multiplayerem.
- [ ] Ověřit skutečné možnosti a verze PHP/MySQL na WZ.cz a oprávnění databázového uživatele.
- [x] Připravit návrh cílové databázové struktury a migračního postupu (pracovní návrh k potvrzení).

### Zjištění z první kontroly

1. Současný frontend hraje lokálně a stav hry se zatím neukládá na server.
2. Starší API vyžaduje při vytvoření místnosti přihlášeného uživatele, což odporuje záměru začít bez registrace.
3. Tabulky `game_rooms` a `room_participants` mají povinné vazby na registrované hráče; anonymní zakladatel a účastník proto nejsou v současném schématu správně podporováni.
4. Instalátor vytváří tabulky s prefixem z `.env`, ale starší API používá v SQL dotazech názvy tabulek bez tohoto prefixu. Je nutné sjednotit přístup k tabulkám.
5. Tabulka `game_settings` má povinný `setting_key`, zatímco starší API se ji pokouší inicializovat pouze pomocí `room_id`. Tento nesoulad je potřeba opravit v rámci samostatného updatu.
6. Starší API ukládá tahy a figurky v jiném datovém modelu, než používá současný JavaScript engine. Před napojením je nutné navrhnout jednoznačný formát serializovaného stavu hry.
7. Pro synchronizaci budeme počítat s variantou kompatibilní se sdíleným PHP hostingem (pravděpodobně pravidelné dotazování API). WebSockety nebudeme předpokládat, dokud se nepotvrdí jejich podpora na WZ.cz.

Tyto body jsou výsledkem čtení repozitáře; databáze na produkčním hostingu nebyla měněna ani testována.

---

## Fáze 0 – Příprava a ověření hostingu

- [x] Prohlédnout současný frontend, herní engine, API, instalátor a workflow.
- [x] Sepsat zjištěné nesoulady a rizika.
- [ ] Ověřit PHP verzi a dostupnost PDO MySQL na WZ.cz.
- [ ] Ověřit MySQL/MariaDB verzi a oprávnění databázového uživatele.
- [x] Potvrzeno: hosting nemá systémový cron. Použijeme interní plánovač spouštěný při načtení stránky.
- [ ] Rozhodnout způsob synchronizace mezi zařízeními podle možností hostingu.
- [ ] Navrhnout databázové změny tak, aby šly bezpečně spustit nad existující databází bez mazání současných dat.

**Výstup fáze:** potvrzené technické limity hostingu a konkrétní návrh databáze/API. Zatím bez zásahu do herního rozhraní.

## Fáze 1 – Databázový základ

- [ ] Navrhnout tabulku her a její stavy.
- [ ] Navrhnout anonymní identitu hráče a identitu jednotlivých zařízení.
- [ ] Navrhnout účast hráčů v konkrétní hře bez povinného účtu.
- [ ] Navrhnout bezpečné pozvánkové tokeny pro připojení přes odkaz.
- [ ] Ukládat kompletní aktuální stav hry tak, aby šel obnovit po zavření prohlížeče.
- [ ] Navrhnout ukládání tahů a herních událostí.
- [ ] Navrhnout chat; po každé zprávě uložit záznam a ponechat maximálně 30 posledních položek na hru.
- [ ] Přidat indexy a vazby pro bezpečné mazání souvisejících dat.
- [ ] Připravit verzované, opakovatelné databázové migrace.
- [ ] Otestovat migraci na testovacích datech; nemažou se existující tabulky ani data.

## Fáze 2 – Anonymní hráč a obnova hry

- [ ] Vytvořit anonymní identifikátor hráče bez registrace.
- [ ] Bezpečně propojit identitu s prohlížečem/zařízením.
- [ ] Umožnit najít rozehranou hru po návratu na stránku.
- [ ] Nabídnout pokračování, založení nové hry nebo ukončení stávající.
- [ ] Umožnit návrat na jiném zařízení přes pozvánkový odkaz.
- [ ] Ošetřit ztrátu cookie nebo lokálních dat a vysvětlit hráči možnosti obnovy.

## Fáze 3 – Multiplayer mezi zařízeními

- [ ] Vytvořit online místnost bez nutnosti registrace.
- [ ] Vygenerovat bezpečný odkaz pro pozvání dalších hráčů.
- [ ] Umožnit připojení a opětovné připojení ke hře.
- [ ] Synchronizovat herní stav mezi zařízeními.
- [ ] Ověřovat každý tah na serveru; klient nesmí být autoritou nad výsledkem.
- [ ] Zabránit dvojitému tahu a souběžným konfliktům.
- [ ] Synchronizovat chat a herní události.
- [ ] Ošetřit odpojení hráče, obnovení spojení a čekání na jeho tah.
- [ ] Otestovat hru na několika skutečných zařízeních.

## Fáze 4 – Životní cyklus a úklid databáze

- [ ] Ukládat čas poslední skutečné aktivity hry.
- [ ] Rozlišovat čekající, probíhající, pozastavené, dokončené a opuštěné hry.
- [ ] Neoznačovat hru za mrtvou podle počtu hodů kostkou.
- [ ] Nechat dlouho neaktivní hru obnovitelnou po rozumnou dobu.
- [ ] Nastavit pravidla automatického mazání podle stáří a stavu hry.
- [ ] Při mazání hry odstranit její chat, tahy, účastníky a další závislá data.
- [ ] Vytvořit interní plánovač v adresáři `/cron/`, který při požadavku pouze lehce zkontroluje termíny jednotlivých úloh.
- [ ] Každá úloha bude mít vlastní interval a čas posledního spuštění; pokud ještě není splatná, plánovač ihned skončí.
- [ ] Zabránit souběžnému spuštění stejné úlohy pomocí databázového zámku nebo bezpečného atomického nároku.
- [ ] Spouštět pouze splatné úlohy, po malých dávkách a s limitem práce na jeden požadavek, aby se nezatěžoval hosting ani nezdržovalo načtení stránky.
- [ ] Zajistit, aby plánovač nešel spouštět jako veřejný samostatný endpoint bez kontroly; bude volán interně aplikací.
- [ ] Počítat s tím, že úlohy se spustí až při další návštěvě webu; při nulovém provozu neběží na pozadí.

**Plánovač bez systémového cronu:**

Hosting nemá systémový cron. Proto aplikace při běžném načtení stránky zavolá velmi lehký interní plánovač. Ten pouze zkontroluje evidenci úloh (poslední spuštění a interval). Pokud žádná úloha není splatná, okamžitě skončí. Splatné úlohy se spouštějí jednotlivě, s ochranou proti souběhu a omezeným rozsahem práce. Uživatel nemusí nic nastavovat. Nevýhodou je, že bez návštěvnosti webu se úlohy nespustí; nejde o skutečný běh na pozadí.

**Pracovní návrh retenčních lhůt:** neaktivní hry po 30 dnech, dokončené hry po 7 dnech. Před implementací ještě potvrdíme, zda tyto lhůty vyhovují.

## Fáze 5 – Uživatelské rozhraní a nastavení

- [ ] Nabídka pokračování existující hry.
- [ ] Vytvoření nové online hry.
- [ ] Připojení přes pozvánkový odkaz.
- [ ] Zobrazení hráčů a jejich připojení.
- [ ] Možnost opustit hru bez ukončení celé hry.
- [ ] Nastavení hry a individuálních preferencí hráče.
- [ ] Jasné zobrazení čekání na tah soupeře a stavu spojení.

## Fáze 6 – Testování a zabezpečení

- [ ] Testy ukládání a obnovy kompletního stavu hry.
- [ ] Testy přístupových tokenů a oprávnění účastníků.
- [ ] Testy neplatných, opakovaných a souběžných tahů.
- [ ] Testy více zařízení a různých prohlížečů.
- [ ] Testy výpadku internetu a opětovného připojení.
- [ ] Testy limitu 30 zpráv.
- [ ] Testy automatického mazání a cizích vazeb v databázi.
- [ ] Ověřit, že lokální režim hry zůstává funkční.

## Fáze 7 – Pozdější rozšíření

- [ ] Web Push oznámení při tahu (nejprve hráči, který je na tahu).
- [ ] Volba oznámení pouze mně / všem / vypnuto.
- [ ] Oznámení o konci hry a dalších důležitých událostech.
- [ ] Volitelné uživatelské účty a propojení anonymního hráče s účtem.
- [ ] Statistiky a dlouhodobá historie hráčů.

Push oznámení a registrace nejsou součástí prvních etap. Přijdou až po stabilním multiplayeru.

---

## Pracovní pořadí nejbližších updateů

1. **Update 1 – Ověření hostingu a databázových předpokladů.** PHP 8.3 a MySQL 8.0 byly uvedeny jako cílové verze; skutečnou dostupnost PDO MySQL a oprávnění databáze ještě ověříme. Systémový cron není k dispozici, proto použijeme interní plánovač. Bez změny herního kódu a bez zásahu do produkční databáze.
2. Update 2 – Návrh cílového datového modelu a migračního postupu. Pracovní návrh je v `.github/DATABASE-PLAN.md`; před SQL migrací se potvrdí otevřené body.
3. Update 3 – První samostatná, bezpečná databázová migrace.
4. Další updaty budou následovat až po ověření předchozího kroku.

## Rozhodnutí uživatele

- Retenční lhůty 30 dní pro neaktivní a 7 dní pro dokončené hry jsou přijatelné; budou nastavitelné v `/cron/config.php`.
- Chat a herní události se v rozhraní zobrazí společně v jednom časovém proudu, ale v databázi se budou ukládat odděleně.
- Datový model bude připraven na AI hráče. První online verzi doporučujeme spustit s živými hráči; AI doplníme po stabilizaci multiplayeru.

## Záznam provedených updateů

| Update | Změna | Stav |
|---|---|---|
| 0 | Kontrola současného projektu a sepsání roadmapy | Hotovo |

| 1 | Doplnění návrhu interního plánovače bez systémového cronu | Hotovo |
| 2 | Pracovní návrh databáze multiplayeru a migrací (`DATABASE-PLAN.md`) | Hotovo – rozhodnutí doplněna |

## Aktuální stav implementace (2026-11-03)

- [x] Databázové schéma install/schema.sql je v repozitáři a uživatel potvrdil vytvoření tabulek v MySQL 8.0.46.
- [x] Přidán samostatný endpoint online-api.php; původní api.php zůstává nedotčený, protože používá starý registrační datový model.
- [x] Základ endpointu: anonymní identita zařízení, HttpOnly cookie s náhodným tokenem (v DB pouze SHA-256 hash), CSRF ochrana, změna jména, založení čekající hry, pozvánka, připojení přes pozvánku, načtení hry, chat s limitem 30 zpráv a opuštění hry.
- [x] Přidán serverový PHP engine odpovídající JavaScriptovým pravidlům; kostku hází server a tahy ověřuje v transakci se zámkem hry, očekávanou verzí stavu a jedinečným ID požadavku.
- [x] Frontend umí místnost spustit, vykreslit online stav, posílat hody/tahy/přeskočení tahu, synchronizovat pollingem a zobrazit chat společně s posledními herními událostmi.
- [x] Do GitHub Actions přidána kontrola syntaxe PHP 8.3.
- [x] PHP lint 8.3 a dosavadní JS syntaktické kontroly i testy herního enginu prošly v GitHub Actions.
- [x] Napojit frontend na bootstrap identity a online lobby; přidat vytvoření místnosti, pozvánkový odkaz, připojení a chat.
- [ ] Doplnit nabídku pokračování/ukončení rozehrané hry po návratu na web a bezpečný přenos identity na jiné zařízení.
- [ ] Ověřit API na skutečném WZ hostingu a dvou zařízeních; automatické testy ověřují PHP/JS syntaxi a pravidla enginu, nikoli připojení k produkční databázi.

Důležité: online místnosti a serverově ověřované tahy jsou napojené na rozhraní. Lokální hra zůstává beze změny. Před potvrzením funkčnosti je nutný test na skutečném hostingu ve dvou zařízeních.
