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
- [x] Základní multiplayer vyzkoušen uživatelem na více skutečných zařízeních.
- [ ] Otestovat opětovné připojení, návrat do rozehrané hry a konkrétní nedostatky zjištěné při praktickém hraní.

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

### Volitelná pravidla při vytváření hry

- [ ] Při zakládání nové hry nabídnout výběr pravidel; výchozí nastavení zachová současná pravidla.
- [ ] První volitelné pravidlo: pokud hráč nemá na herním plánu žádnou nasazenou figurku, má až tři hody, aby získal šestku.
- [ ] Pokud hráč během těchto pokusů hodí šestku, může nasadit figurku podle běžných pravidel; pokud šestku nezíská ani na třetí pokus, jeho tah končí.
- [ ] Ukládat zvolená pravidla ke konkrétní místnosti/hře a po zahájení hry je uzamknout.
- [ ] Pravidla musí vyhodnocovat server a musí být stejná pro všechny hráče v multiplayeru.
- [ ] V rozhraní zobrazit hráčům, jaká pravidla jsou pro danou hru aktivní.
- [ ] Připravit návrh tak, aby šlo později přidávat další volitelné varianty bez přepisování herního enginu.

### Jména a barvy hráčů (lokální i online)

- [x] Každý účastník online místnosti si může sám nastavit nebo změnit své zobrazované jméno; změna se synchronizuje všem hráčům. Hráč nesmí měnit jména ostatních.
- [x] Při vytváření lokální hry umožnit každému hráči vybrat si jednu z osmi výrazných a dobře rozlišitelných barev.
- [x] V online místnosti umožnit každému hráči vybrat si vlastní barvu před zahájením hry.
- [x] Nabídnout náhodné přidělení barev v lokální hře a náhodný výběr volné barvy v online místnosti.
- [x] Zabránit duplicitním barvám v lokální hře i online místnosti; server online volbu kontroluje pod zámkem místnosti.
- [x] U online hry ukládat barvu na serveru k účastníkovi místnosti a synchronizovat ji všem klientům; po zahájení hry se barvy stanou součástí stavu hry.
- [x] Použít společnou paletu osmi barev pro lokální i online režim; u žlutých figurek použít tmavé číslování pro lepší kontrast.
- [x] Přidat regresní testy výběru barev a kontroly jedinečnosti v lokálním herním enginu.
- [ ] Prakticky otestovat změnu jména a výběr barev mezi více zařízeními v produkční místnosti.
- [x] Přidat AI hráče do online čekající místnosti; AI provádí tahy serverově.
- [x] Vyžadovat pro spuštění online hry alespoň dvě různé lidské identity/zařízení; AI se počítá pouze jako další hráč.
- [ ] Prakticky otestovat online hru se dvěma lidmi a alespoň jedním AI hráčem.

### Velikosti a geometrie hracích desek

- [ ] Oddělit logickou velikost hlavního okruhu od grafického vzhledu desky.
- [ ] Podporovat tři pevné velikosti hlavního okruhu: 40, 48 a 80 polí.
- [ ] Počet polí počítat podle pravidla (Start + X) × Y:
  - 40 polí = (1 + 9) × 4; čtyři možné hráčské pozice.
  - 48 polí = (1 + 7) × 6; šest možných hráčských pozic.
  - 80 polí = (1 + 9) × 8; osm možných hráčských pozic.
- [ ] Startovní domečky jsou mimo hlavní okruh. Neobsazené hráčské pozice zůstávají prázdné; jejich startovní pole i domečky se přesto zachovají v geometrii desky.
- [x] Vykreslit všechny pevné pozice desky včetně prázdných domečků, čtyř cílových polí a startovního pole; prázdná pozice nemá jméno, barvu hráče ani figurky.
- [ ] Dostupnost velikostí podle počtu hráčů: 2–4 hráči: 40/48/80; 5–6 hráčů: 48/80; 7–8 hráčů: pouze 80.
- [ ] Herní engine musí pracovat s vybranou délkou okruhu nezávisle na rendereru; stejná pravidla platí pro lokální i online hru.
- [ ] Zachovat čtyři cílová pole v domečku a současnou správnou logiku startovního pole a vstupu do domečku.
- [ ] Grafické varianty nabídnou pouze podporované kombinace: kulatá deska pro 40 a 48 polí; hranatá deska pro 40, 48 a 80 polí. Další vzhledy se doplní samostatně.
- [ ] Vybranou velikost a vzhled uložit do nastavení konkrétní hry; v online hře musí být shodná logická velikost pro všechny účastníky.
- [x] V lokálním menu vytvoření hry nabídnout tři tlačítka 40/48/80; vždy je vybraná právě jedna velikost a nedostupné varianty se podle počtu hráčů deaktivují. Vybranou velikost předat do lokálního herního enginu.

### Alternativní vzhled hrací plochy

- [x] Na stávající kruhové desce umístit startovní pole na vizuální pozici 0 + 1. Posun se týká pouze vykreslení; logické indexy, pravidla a pohyb figurek zůstávají beze změny. Čeká na vizuální ověření na webu.
- [x] Přidat do herní desky vizuální přepínač vzhledu; zatím je aktivní kulatá varianta a hranatá je označena jako připravovaná.
- [ ] Oddělit vykreslování jednotlivých vzhledů od herní logiky; pravidla, pozice a synchronizace zůstanou společné.
- [ ] Umožnit každému hráči zvolit si vlastní vzhled i v multiplayeru, aniž by se měnil pohled ostatních hráčů.
- [ ] Uložit preferovaný vzhled hráče pro další návštěvy.
- [ ] Realizovat nejprve hranatou variantu; obě 3D varianty plánovat jako samostatné grafické etapy.

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
| 3 | Zápis potvrzeného pravidla rozstřelu do roadmapy | Hotovo |
| 4 | Původní automatický rozstřel při zahájení hry | Nahrazen ručním rozstřelem (Update 7) |
| 5 | Vlastní jméno online hráče, výběr a náhodné přidělení osmi barev pro lokální i online hru | Implementováno; čeká na praktický multiplayer test |
| 6 | Online AI hráči a povinné minimum dvou lidských zařízení | Implementováno; automatické testy a FTP deploy úspěšné, čeká na praktický test |
| 7 | Ruční rozstřel živých hráčů v lokální i online hře, automatické hody AI a jediný průběžný řádek logu | Implementováno; PHP lint, JS syntaxe, testy enginu a FTP deploy úspěšné; čeká na praktický test více zařízení |
| 8 | Vizuální umístění startovního pole na kruhové desce na pozici 0 + 1 | Upraveno podle upřesnění; čeká na ověření na webu |
| 9 | Výběr velikosti desky 40/48/80 v menu lokální hry | Implementováno ve větvi `feature/board-size-selector`; čeká na CI a nasazení |
| 10 | Vykreslení prázdných domečků a startovních polí pro neobsazené pozice desky | Implementováno; automatické kontroly a FTP deploy úspěšné; čeká na vizuální ověření |
| 11 | Osmiúhelníková 80políčková trasa se třemi obvodovými poli na rameno a vnitřními návraty | Implementováno; test geometrie, herní testy a FTP deploy úspěšné; čeká na vizuální ověření |
| 12 | Oddělení CSS 2D/3D desky a kostky s odloženým načítáním | Implementováno; čeká na CI a vizuální ověření |

## Pravidla hry

Závazná a úplná pravidla jsou vedena pouze v [`GAME_RULES.md`](../GAME_RULES.md). Tento dokument je jediným zdrojem pravidel; roadmapa obsahuje pouze stav a úkoly vývoje.

---

## Aktuální stav implementace (2026-11-03)

- [x] Databázové schéma install/schema.sql je v repozitáři a uživatel potvrdil vytvoření tabulek v MySQL 8.0.46.
- [x] Přidán samostatný endpoint online-api.php; původní api.php zůstává nedotčený, protože používá starý registrační datový model.
- [x] Základ endpointu: anonymní identita zařízení, HttpOnly cookie s náhodným tokenem (v DB pouze SHA-256 hash), CSRF ochrana, změna jména, založení čekající hry, pozvánka, připojení přes pozvánku, načtení hry, chat s limitem 30 zpráv a opuštění hry.
- [x] Přidán serverový PHP engine odpovídající JavaScriptovým pravidlům; běžné online hody generuje server a tahy ověřuje v transakci se zámkem hry, očekávanou verzí stavu a jedinečným ID požadavku.
- [x] Rozstřel online hry začíná ve fázi `start-roll`; živý hráč jej spouští kliknutím, server kontroluje pořadí a výsledek hodu. AI hází automaticky pouze při svém tahu.
- [x] Online rozstřel používá jediný záznam `start` v `game_moves`; jeho obsah se po každém hodu aktualizuje, takže v herním logu zůstává jeden řádek.
- [x] Lokální hra používá stejné pořadí ručních hodů živých hráčů a automatických hodů AI; průběh rozstřelu se průběžně přepisuje v jediném řádku logu.
- [x] Frontend umí místnost spustit, vykreslit online stav, posílat hody/tahy/přeskočení tahu, synchronizovat pollingem a zobrazit chat společně s posledními herními událostmi.
- [x] Do GitHub Actions přidána kontrola syntaxe PHP 8.3.
- [x] PHP lint 8.3 a dosavadní JS syntaktické kontroly i testy herního enginu prošly v GitHub Actions.
- [x] Napojit frontend na bootstrap identity a online lobby; přidat vytvoření místnosti, pozvánkový odkaz, připojení a chat.
- [ ] Doplnit nabídku pokračování/ukončení rozehrané hry po návratu na web a bezpečný přenos identity na jiné zařízení.
- [x] Základní multiplayer byl uživatelem vyzkoušen na více zařízeních.
- [ ] Ověřit opětovné připojení, obnovu rozehrané hry a opravit nedostatky z praktického testování; automatické testy samy neověřují všechny produkční situace.

Důležité: online místnosti a serverově ověřované tahy jsou napojené na rozhraní. Lokální hra zůstává beze změny. Před potvrzením funkčnosti je nutný test na skutečném hostingu ve dvou zařízeních.

- [x] Pravidlo tří pokusů o šestku při všech čtyřech figurkách v základně; po vyhození poslední nasazené figurky se výhoda obnovuje. Prakticky ověřeno v lokální hře proti AI: neúspěšné hody končí po třetím pokusu, šestka na třetí pokus umožní pokračovat dalším hodem a po vyhození poslední figurky se hráči se všemi čtyřmi figurkami v základně obnoví tři pokusy. Ověřeno z herních logů uživatele; online režim tímto testem samostatně potvrzen nebyl.

## Záznam opravy rozhraní – 2026-11-04

- [x] Přesunout tlačítka velikosti desky 40/48/80 na místo souhrnného řádku s počtem hráčů.
- [x] Zachovat sestavu u stolu včetně editace jmen a barev; výslovně zajistit viditelnost seznamu hráčů.


## Záznam opravy rozmístění domečků – 2026-11-04

- [x] U kruhové desky 40 umístit čtyři startovní domečky jednotlivě vně obvodu dráhy, každý radiálně nad vlastním startovním polem.
- [x] U kruhové desky 48 umístit šest startovních domečků stejným způsobem.
- [x] Zachovat pořadí pozic po směru hodinových ručiček; cílové dráhy směřují od domečků dovnitř.
- [x] Prázdné pozice zůstávají neutrální a deska 80 zůstává beze změny.
- [ ] Vizuálně ověřit obě varianty na živém webu.


## Záznam úpravy figurek v základně – 2026-11-04

- [x] První figurku umístit na osu směřující k vlastnímu startovnímu poli.
- [x] Zbývající figurky rozmístit vedle ní po oblouku směrem nad herní dráhu.
- [ ] Vizuálně ověřit rozestavení na živém webu a podle potřeby doladit směr i rozestupy.

## Záznam úpravy polohy figurek – 2026-11-04

- [x] Figurky umístěné v základně mají středy přímo na referenční kružnici (střed desky 360,360; poloměr 283,05).
- [x] Zachováno jejich pořadí a úhlové rozestupy; pravidla ani logické pozice figurek se nemění.
- [ ] Vizuálně ověřit polohu na živé desce.
- [x] Rozestup čtyř figurek v základně zmenšen na 6° po kružnici; při poloměru 283,05 je vzdálenost středů sousedních figurek přibližně 29,6 jednotky (průměr figurky 24), takže se nedotýkají.
- [x] Kruhová deska: první pozice figurky základny nastavena na (190, 135); referenční kružnice prochází tímto bodem (poloměr 282,00 jednotek). Rozestupy figurek zůstávají 6°.


## Geometrie osmiúhelníkové desky 80 polí – 2026-11-04

### Potvrzené rozložení

- [x] Půdorys hlavní dráhy tvoří osmiúhelník, ale trasa nekopíruje celý jeho obvod.
- [x] Na každém z osmi ramen leží na vnějším obvodu pouze tři pole: celkem 8 × 3 = 24 polí.
- [x] Mezi sousedními rameny vede trasa čtyřmi poli směrem ke středu a čtyřmi poli zpět k dalšímu rameni; zatáčkové pole je společné oběma úsekům a krajní pole je již prvním polem dalšího ramene.
- [x] Každé propojení ramen tak přidává 7 vnitřních polí. Osm propojení = 56 vnitřních polí; spolu s 24 obvodovými poli přesně 80.
- [x] Osm startovních polí je na začátku jednotlivých ramen; vizuální indexy 1, 11, 21, 31, 41, 51, 61 a 71 zachovávají dosavadní posun startovního pole.
- [x] Všech 80 souřadnic je jedinečných; automatický test kontroluje tři obvodová pole, směr dovnitř, zatáčku a návrat k sousednímu rameni.
- [x] Vnější osmiúhelník zmenšen (apotéma 190); zatáčka je na poloměru 60. Rozestupy sousedních polí jsou nyní přibližně 34–43 jednotek místo původních přibližně 34–62.
- [x] Kruhové vykreslení desek 40 a 48 polí zůstává beze změny. Herní engine, logické indexy a pravidla se nemění.
- [ ] Vizuálně ověřit rozmístění a rozestupy na živém webu; případně doladit pouze souřadnice SVG.

## Úprava geometrie 80políčkové desky – 2026-11-04

- [x] Odstranit souřadnicovou mřížku, referenční kružnici a ladicí značky z viditelné desky.
- [x] Vykreslit hlavní trasu 80 polí jako pás s konstantní šířkou, aby ramena nepůsobila kuželově.
- [x] Zachovat všech 80 středů polí a jejich pořadí; nepřekrývání ověřovat testem všech dvojic polí.
- [ ] Vizuálně ověřit tvar ramen a rozestupy na živém webu.


## Integrace plnohodnotné 3D desky – 2026-11-04

- [x] Nahradit samostatnou 3D vrstvu figurek kompletním vykreslením desky v Three.js.
- [x] Převzít skutečné souřadnice polí, domečků, základen a figurek z herního rendereru; pravidla a logické indexy zůstávají beze změny.
- [x] Podporovat všechny velikosti 40/48/80 a oba vzhledy classic/polygon přes společný datový model SVG.
- [x] Zachovat průhlednou interakční vrstvu SVG pro výběr figurek a ovládání hry.
- [x] Nastavit 3D jako výchozí pohled; možnost přepnout na 2D zůstává dostupná.
- [ ] Ověřit vykreslení, výběr figurek a výkon na mobilu a desktopu; doladit kameru a měřítko podle živého testu.
- [ ] Ověřit kompatibilitu se všemi kombinacemi hráčů a velikostí desky v online místnosti.


## Oddělení CSS herní desky a kostky – 2026-11-06

- [x] Přesunout vzhled 2D SVG desky do `css/board-2d.css`.
- [x] Zachovat samostatné `css/board-3d.css` a doplnit do něj pouze styly 3D desky a jejího HUD.
- [x] Přesunout prostorovou animaci kostky do `css/dice-3d.css`.
- [x] Připravit samostatný plochý vzhled a animaci kostky v `css/dice-2d.css`.
- [x] Zajistit načítání pouze dvojice CSS aktivního režimu; při přepnutí předchozí dvojici odpojit.
- [x] Odstranit grafické styly desky a kostky ze základního `css/game-premium.css`.
- [x] Aktualizovat README, debug dokumentaci a historii verzí.
- [ ] Vizuálně ověřit 2D a 3D desku i kostku na mobilu a desktopu.

