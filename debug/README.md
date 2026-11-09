# Vývojové prostředí Debug

Adresář `/debug/` je samostatný vstup do vývojové a testovací verze hry. Otevření debug prostředí nesmí přesměrovat uživatele na běžnou produkční URL ani samo měnit produkční soubory.

## Otevření

https://7x.wz.cz/clovece/debug/

Vstup používá společný HTML shell aplikace, ale aktivuje výukový režim. Ten vynucuje 2D desku a načítá vývojové nástroje AI z adresáře `debug/`.

## Rozdělení odpovědností

### Produkce – kořen projektu

V kořeni zůstávají stabilní části používané běžnou hrou:

- `index.php` – společný HTML shell a načítání aplikace.
- `js/game-engine.js` – jediný společný herní engine a pravidla.
- `js/game-board-geometry.js`, `js/game-board-2d.js` a související stabilní moduly – společná geometrie a 2D vykreslení.
- `docs/GAME_RULES.md` – jediný zdroj pravdy pro pravidla hry.

### Vývoj – adresář /debug/

Všechny nové experimentální a diagnostické části patří do `debug/`:

- `debug/index.php` – samostatný vstup do vývojového prostředí.
- `debug/js/` – vývojový JavaScript, diagnostika, testovací scénáře a nástroje učení AI.
- `debug/css/` – vývojové styly a vzhled testovacích panelů.
- `debug/README.md` – pravidla práce ve vývojovém prostředí.

Nová funkce, která není ověřená, se nesmí zapisovat do produkčních CSS/JS souborů. Pokud experiment vyžaduje změnu společného enginu nebo pravidel, nejprve se změna připraví a ověří ve vývojové kopii dané části; do společného produkčního modulu se přenese až po ověření a s odpovídajícími testy. Nesmí vzniknout druhý dlouhodobě nezávislý zdroj pravidel.

## Co je společné a co oddělené

| Část | Debug | Produkce |
|---|---|---|
| Herní pravidla a stabilní engine | společné | společné |
| Stabilní 2D deska | společná | společná |
| Experimentální AI a její váhy | pouze debug | stabilní AI |
| Diagnostické a tréninkové panely | pouze debug | nenačítají se |
| Experimentální CSS/JS | pouze debug | nenačítají se |
| 3D deska | nepoužívá se | produkční renderer |

Debug používá skutečnou herní desku a skutečný herní engine, nikoliv oddělenou simulaci s vlastními pravidly. Výukový režim záměrně vynucuje 2D vykreslení; 3D se ladí až v produkční části podle samostatného zadání.

## Postup práce

1. Nové experimenty vytvářet výhradně v `debug/js/` a `debug/css/`.
2. Pro testování používat skutečný společný engine, jeho legální tahy a společnou 2D desku.
3. Ověřit chování na deskách 40, 48 a 80 a ve všech relevantních kombinacích pravidel.
4. Doplnit nebo spustit regresní testy.
5. Teprve hotovou a ověřenou změnu přenést do odpovídajícího produkčního souboru.
6. Po přenosu ověřit, že produkční hra nenačítá žádné debug moduly ani debug CSS.

## Důležité zásady

- Debug nesmí měnit produkční soubory při běžném testování.
- Produkce nesmí načítat experimentální soubory z `debug/`, pokud není výslovně zapnutý debug režim.
- Pravidla se neupravují nezávisle ve dvou kopiích. Závazný dokument je `docs/GAME_RULES.md`.
- AI smí vybírat pouze tahy vrácené společným herním enginem.
- Vývojová a produkční verze musí používat stejné datové struktury a formát herního stavu.
- Změny se zapisují přímo do větve `main`; její push spouští automatické FTP nasazení. Konfigurační soubor `.env` se do repozitáře ani nasazení nepřenáší.
