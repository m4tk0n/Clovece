# Ruční výuka AI

## Spuštění

Otevři `/?debug=training`. Režim automaticky otevře výběr místní hry, vynutí 2D vykreslení a zobrazí výukový panel. Vyber lidského hráče a alespoň jednu AI.

Pravidla hry ani legální tahy se v tomto režimu nemění. Číslování polí v SVG desce slouží pouze k přesnému popisu pozic.

## Co se zaznamenává

Po dokončení tahu AI se vytvoří výukový kontext obsahující:
- verzi formátu a strategie;
- velikost desky, délku okruhu, počet hráčů a jejich jména, barvy, typy a startovní pozice;
- kompletní aktivní nastavení pravidel;
- hráče na tahu, fázi hry, hodnotu kostky a číslo tahu;
- pozice všech figurek před rozhodnutím;
- seznam legálních tahů a rozbor možností;
- vybranou figurku a textové vysvětlení AI;
- skutečně provedený tah a stav figurek po tahu.

Člověk přidá volný text: co měla AI udělat a proč. Odeslaný text se připojí ke kontextu a uloží jako samostatný JSON.

## Serverové úložiště

Cesta: `storage/ai-training/instructions/{id}.json`.

Každý soubor má náhodné 128bitové ID. PHP endpoint používá výhradní vytvoření souboru (`fopen(..., 'x')`), takže již existující instrukci nemůže přepsat. Endpoint neposkytuje čtení, aktualizaci ani mazání. Složka `storage/` je blokována pro přímý HTTP přístup přes `.htaccess`.

Záznamy se neukládají do MySQL ani do GitHub repozitáře. FTP deploy složku `storage/` vynechává, takže uložené instrukce zůstávají na serveru i při nasazení nové verze aplikace.

## Bezpečnost a limity

- Uložení vyžaduje session CSRF token a požadavek ze stejného webu.
- Maximální velikost požadavku je 64 KiB; text instrukce má nejvýše 3000 znaků.
- Do názvu souboru se nikdy nepřebírá hodnota od uživatele.
- Záznamy se pouze přidávají. Není implementováno automatické čištění ani mazání.
- Pokud serverové úložiště není zapisovatelné, endpoint vrátí chybu; instrukce se nebude vydávat za uloženou.

## Stav učení

Tato fáze sbírá opravy a přesný kontext chybných rozhodnutí. AI je zatím automaticky nenačítá a nepoužívá. Navazující fáze musí doplnit vyhledávání relevantních instrukcí, jejich použití při rozhodnutí a auditní záznam ID skutečně použitých instrukcí. Teprve tento audit prokáže, zda AI tvoje opravy využila.
