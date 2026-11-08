# Ruční výuka AI

## Spuštění

Otevři `/?debug=training`. Režim automaticky otevře výběr místní hry, vynutí 2D vykreslení a zobrazí malé plovoucí výukové okno až po zobrazení hrací desky. Pomocí tlačítek `+` a `−` lze okno zvětšit nebo zmenšit. Vyber lidského hráče a alespoň jednu AI.

Pravidla hry ani legální tahy se v tomto režimu nemění. Číslování polí v SVG desce slouží pouze k přesnému popisu pozic.

## Ovládání výuky

Po dokončení tahu AI okno zobrazí její rozhodnutí a vysvětlení. Člověk může:
- napsat opravu a zvolit **ODESLAT** – vznikne nový samostatný JSON záznam s negativní zpětnou vazbou a vysvětlením správného postupu;
- zvolit **SPRÁVNĚ** – vznikne samostatný JSON pozitivního příkladu se stejným kontextem rozhodnutí, ale bez opravné instrukce;
- zvolit **PŘESKOČIT** – rozhodnutí se zahodí bez uložení a bez vytvoření prázdného či zavádějícího záznamu.

Pozitivní potvrzení se ukládá jako feedbackType=positive a formát clovece-ai-positive-example. Nejde o další textové hodnocení ani o automaticky přičtené body v herním skóre. Je to samostatný kladný tréninkový signál, který bude možné využít při budoucím vyhledávání příkladů a vyhodnocování strategie. Po potvrzení se aktuální rozhodnutí uzavře a výuka pokračuje až u dalšího tahu AI.

## Co se zaznamenává

Každý uložený záznam obsahuje typ zpětné vazby (correction nebo positive) a úplný kontext rozhodnutí. Opravný záznam navíc obsahuje lidskou instrukci; pozitivní příklad má instruction=null.

Každý záznam obsahuje:
- verzi formátu a strategie;
- velikost desky, délku okruhu, počet hráčů a jejich jména, barvy, typy a startovní pozice;
- kompletní aktivní nastavení pravidel;
- hráče na tahu, fázi hry, hodnotu kostky a číslo tahu;
- pozice všech figurek před rozhodnutím;
- seznam legálních tahů a rozbor možností;
- vybranou figurku a textové vysvětlení AI;
- skutečně provedený tah a stav figurek po tahu.

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
