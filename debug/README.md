# Debug laboratoř

Tento adresář je oddělené experimentální prostředí projektu Člověče, nezlob se! Zkušební engine, strategie a konfigurace vah jsou samostatné kopie v `debug/js/`; laboratoř je používá nezávisle na produkčních souborech.

## Základní pravidla

- Běžná hra nenačítá žádný soubor z `debug/`.
- Experimentální HTML/PHP, CSS a JavaScript patří do tohoto adresáře.
- Změny v `debug/` samy o sobě nemění produkční herní obrazovku ani její styly.
- Debug stránka používá vlastní kopie herního enginu, AI strategie a konfigurace v `debug/js/`.
- Kopie se do debug adresáře nepřenášejí automaticky. Aktualizují se ručně, aby experimenty nemohly změnit hlavní hru.
- Po úpravách a úspěšném ověření se vybrané změny ručně přenesou do hlavních souborů.
- Testovací přepsání vah je pouze v paměti aktuální stránky; neukládá je do databáze ani do produkční konfigurace.
- Neprováděj z debug stránky zápisy do produkční databáze.

## Otevření

Po nasazení přes FTP otevři:

`https://7x.wz.cz/clovece/debug/index.php`

## Soubory

- `index.php` – samostatná testovací stránka.
- `debug.css` – pouze vzhled debug stránky.
- `debug.js` – experimentální ovládání a testy AI včetně samostatného vyhodnocení hodů 1–6.
- `js/` – samostatné kopie herního enginu, AI strategie a konfigurace vah.
- `js/game-engine.js` – samostatná kopie herního enginu pro pokusy.
- `js/ai-strategy.js` – samostatná kopie strategie.
- `js/ai-weight-config.js` a `js/ai-tactical-weights.js` – samostatná konfigurace deseti vah.
- `README.md` – tento návod.

## Jak přenést ověřenou změnu do hry

1. Změnu nejprve vytvoř a ověř v `debug/`.
2. Přidej nebo uprav automatický test v `tests/`.
3. Ověř pravidla a chování na deskách 40, 48 a 80 polí.
4. Teprve po úspěšných testech na všech šesti výsledcích kostky a deskách 40, 48 a 80 přenes konkrétní ověřenou část do produkčních souborů `js/`, `css/` nebo PHP.
5. Spusť znovu všechny regresní testy a živý test webu.
6. Produkční změnu ulož přímo do `main`; FTP workflow ji nasadí.

Debug adresář není druhá kopie celé hry. Je to oddělená laboratoř pro prototypy a ověřování. Pravidla hry zůstávají výhradně v hlavním herním enginu a jejich autoritativním dokumentu.
