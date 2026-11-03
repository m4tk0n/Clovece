# Databázový návrh – Člověče, nezlob se!

Stav: návrh k připomínkám. Neobsahuje SQL migraci a nic nemění v databázi.

## Cíle a zásady

- Zachovat současný lokální režim hry beze změn.
- Online hra funguje bez registrace a bez povinného účtu.
- Jeden hráč může používat více zařízení; zařízení lze znovu připojit přes bezpečný token.
- Server je autoritou pro online stav, kostku i tahy. Klient nesmí sám potvrdit výsledek tahu.
- Každá změna stavu má rostoucí číslo verze, aby šlo odmítnout zastaralé nebo duplicitní požadavky.
- Všechny nové tabulky používají prefix z konfigurace. Staré tabulky se nemažou ani nepřejmenovávají.
- Použít InnoDB, UTF-8 (utf8mb4), PDO a připravené dotazy. Návrh míří na MySQL 8.0; skutečnou verzi a oprávnění ještě ověříme.

## Navržené tabulky

V názvech níže je vynechán konfigurační prefix.

### 1. `online_games` – hlavní záznam hry

- `id` – interní BIGINT UNSIGNED, primární klíč.
- `public_id` – náhodný veřejný identifikátor pro URL, unikátní; není to oprávnění ke hře.
- `created_by_identity_id` – anonymní nebo později účtová identita zakladatele.
- `status` – waiting, active, paused, finished, abandoned.
- `player_limit` – 2 až 8.
- `board_type` – klasická nebo rozšířená deska.
- `state_json` – úplný serializovaný stav herního enginu.
- `state_version` – číslo verze stavu, zvyšuje se po každé úspěšné změně.
- `current_turn` – aktuální index hráče podle herního stavu.
- `created_at`, `started_at`, `last_activity_at`, `finished_at`, `delete_after`.
- Volitelně `state_schema_version` – verze formátu uloženého JSON, aby šel stav bezpečně převádět při budoucích změnách.

Indexy: unikátní `public_id`, dále `status + last_activity_at` a `delete_after`.

### 2. `player_identities` – identita hráče bez registrace

- `id` – BIGINT UNSIGNED.
- `identity_type` – anonymous nebo account.
- `legacy_player_id` – nullable vazba na existující tabulku `players`; unikátní, pokud je vyplněná.
- `display_name` – zobrazované jméno.
- `created_at`, `last_seen_at`.

Anonymní hráč vznikne automaticky při prvním použití online funkcí. Pozdější registrace může identitu propojit s účtem, aniž by se musela měnit účast v rozehraných hrách.

### 3. `player_devices` – zařízení a návrat hráče

- `id`, `identity_id`.
- `token_hash` – hash náhodného dlouhého tokenu z cookie; samotný token se do databáze neukládá.
- `device_label` – nepovinný popis zařízení.
- `created_at`, `last_seen_at`, `revoked_at`.

Unikátní index na `token_hash`, index na `identity_id`. Token musí být náhodný, dostatečně dlouhý, cookie HttpOnly + Secure (na HTTPS) + SameSite. Změna zařízení neznamená automaticky nového hráče, pokud se hráč připojí přes pozvánku.

### 4. `game_participants` – hráči v konkrétní hře

- `id`, `game_id`, `identity_id`.
- `player_index` – pořadí 0 až 7, unikátní v rámci hry.
- `display_name`, `color`, `player_type` – human nebo ai.
- `is_ready`, `joined_at`, `last_seen_at`, `left_at`.

Unikátní `(game_id, player_index)` a `(game_id, identity_id)`. Hráč může být v různých hrách, ale v jedné hře jen jednou. AI může být bez identity; pravidla této výjimky ošetří aplikační vrstva.

### 5. `game_invites` – pozvánky

- `id`, `game_id`, `created_by_identity_id`.
- `token_hash` – ukládá se pouze hash pozvánkového tokenu.
- `uses_limit`, `uses_count`, `expires_at`, `revoked_at`, `created_at`.

Pozvánkový token je samostatný od identifikátoru hry. Lze ho odvolat nebo nechat vypršet. Při vstupu server ověří platnost a oprávnění; veřejné ID hry samo o sobě nestačí.

### 6. `game_moves` – historie přijatých herních akcí

- `id`, `game_id`, `participant_id`.
- `state_version` – verze po provedení akce.
- `request_id` – náhodné ID požadavku od klienta pro ochranu proti opakovanému odeslání.
- `action_type` – roll, move, no_move, další pouze podle potřeby.
- `action_json` – validovaná data akce, nikoli slepě převzatý stav od klienta.
- `created_at`.

Unikátní `(game_id, state_version)` a `(game_id, request_id)`. Historie tahů je oddělená od chatu a může se uchovávat po dobu života hry.

### 7. `game_chat` – posledních 30 zpráv

- `id`, `game_id`, `participant_id`.
- `message` – text s limitem délky v aplikační vrstvě.
- `created_at`.

Index `(game_id, id)`. Po vložení nové zprávy se v transakci odstraní starší záznamy tak, aby zůstalo nejvýše 30 zpráv pro danou hru. Mazání chatu nijak neovlivní uložený stav ani historii tahů.

### 8. `cron_tasks` – interní plánovač bez systémového cronu

- `task_key` – unikátní název úlohy.
- `interval_seconds` – požadovaný interval.
- `last_started_at`, `last_finished_at`, `next_run_at`.
- `locked_until` nebo obdobný časový zámek.
- `last_status`, `last_error` – stručná diagnostika bez citlivých údajů.
- `is_enabled`.

Plánovač při načtení stránky provede pouze levnou kontrolu splatných úloh. Nárok na úlohu získá atomicky, aby ji souběžné požadavky nespustily dvakrát. Práce bude omezená počtem záznamů i časem. Pokud úloha není splatná, skončí bez dalších dotazů. Úlohy se spouští jen při návštěvnosti webu – bez návštěv se nic nevykonává.

## Ukládání stavu hry

První verze bude ukládat kompletní objekt herního enginu do `online_games.state_json`. Odpovídá to skutečné struktuře v `js/game-engine.js`: hráči, figurky, pořadí tahu, kostka, fáze, vítěz a poslední tah.

Nebudeme současně udržovat druhou paralelní tabulku pro každou figurku. To by vytvářelo dvě místa pravdy a riziko rozjetí dat. Historie jednotlivých akcí bude samostatně v `game_moves`.

Při každé akci server:
1. začne databázovou transakci;
2. načte hru a zamkne její řádek (InnoDB `SELECT ... FOR UPDATE`);
3. ověří identitu, účast, pořadí hráče, fázi hry a očekávanou `state_version`;
4. provede akci serverovým herním enginem a ověří výsledek;
5. uloží nový JSON, zvýší verzi a zapíše historii akce;
6. potvrdí transakci.

Zastaralý požadavek dostane informaci, že musí načíst aktuální stav. Stejný `request_id` nebude proveden dvakrát.

## Interní plánovač – navržené úlohy

| Úloha | Pracovní interval | Chování |
|---|---:|---|
| Úklid neaktivních her | 1 hodina | Vyhledá omezenou dávku her po uplynutí retenční lhůty. |
| Úklid dokončených her | 1 den | Odstraní hry po uplynutí retenční lhůty dokončených her. |
| Údržba plánovače | 1 den | Odstraní případné staré diagnostické údaje, pokud budou potřeba. |

Pracovní retenční návrh zůstává 30 dní pro neaktivní hry a 7 dní pro dokončené hry. Před implementací potvrdit. Samotné mazání musí proběhnout přes cizí klíče s `ON DELETE CASCADE`, případně řízenou transakci. Nesmí se mazat hra, která má platnou aktivitu nebo právě probíhající tah.

## Bezpečnost a výkon

- Všechny SQL dotazy používají připravené PDO statementy.
- Název tabulky se skládá výhradně z pevného názvu a důvěryhodného prefixu konfigurace, nikdy ze vstupu uživatele.
- Náhodné tokeny se generují kryptograficky; ukládají se pouze jejich hashe.
- Online tahy se validují na serveru. Klient posílá pouze záměr akce, ne nový kompletní stav.
- Transakce a zámek řádku brání souběžným tahům.
- Polling klientů bude mít rozumný interval a bude se omezovat, když stránka není aktivní.
- Úklid bude dávkovaný; žádná návštěva nespustí neomezenou údržbu.
- Chyby se logují bez tokenů, hesel a obsahu citlivých požadavků.

## Migrační strategie

1. Nejdříve ověřit reálnou databázi, prefix, verzi MySQL, PDO MySQL a oprávnění CREATE/ALTER/INDEX/FOREIGN KEY.
2. Před migrací zjistit, které existující tabulky a data jsou skutečně přítomné.
3. Přidat nové tabulky pod stejným prefixem; existující tabulky `players`, `game_rooms` a další se nemažou.
4. Migrace bude verzovaná a opakovatelná; evidovat provedenou verzi.
5. Každý krok se nejprve otestuje na oddělené/testovací databázi, pokud ji hosting dovolí.
6. Teprve po úspěšné kontrole se připraví samostatný produkční update.

## Otevřené body před SQL migrací

- Potvrdit, zda retenční lhůty 30 dní / 7 dní vyhovují.
- Ověřit skutečnou verzi MySQL a oprávnění databázového uživatele.
- Ověřit, zda lze na WZ vytvořit testovací databázi; pokud ne, navrhnout bezpečný testovací prefix.
- Rozhodnout, zda se má chat zobrazovat společně s herními událostmi, nebo v oddělených záložkách. Ukládání zůstane oddělené.
- Potvrdit, zda AI hráči budou v online hře povoleni hned od první verze, nebo až později.

## Co se záměrně nedělá v této fázi

- Žádné změny produkční databáze.
- Žádné změny `api.php`, `config.php` ani herního frontendu.
- Žádné mazání ani přejmenování starých tabulek.
- Žádné zapínání multiplayeru.
