# Debug a výuka AI

Debug vstup otevírá skutečnou hru v tréninkovém režimu. Používá společný herní engine, stejná pravidla, stejnou AI a stejné 2D vykreslení jako běžná hra.

## Otevření
https://7x.wz.cz/clovece/debug/

Vstup přesměruje do hry s parametrem `?debug=training`. Tréninkový režim vynucuje 2D desku a nenačítá 3D renderer.

## Zásady
- Na desce je vidět živá hra, nikoli samostatná textová simulace.
- Testování používá výhradně 2D SVG desku.
- Produkční 3D zobrazení zůstává mimo debug a výuku.
- Pravidla, herní stav a AI rozhodování jsou společné s produkční hrou.
- Výukový panel zobrazuje rozhodnutí AI, jeho rozbor a umožňuje uložit zpětnou vazbu.
- Velikosti desky jsou 40, 48 a 80 polí.
- Debug režim nesmí vytvářet druhou kopii pravidel nebo enginu.

## Technické poznámky
- `index.php` – přesměrování do živé hry v režimu výuky.
- `js/` a `css/` – původní experimentální soubory; jejich úplné přesunutí pod `debug/` je samostatný úklid, nesmí změnit společný engine ani pravidla.
- Produkční hra bez parametru debug nenačítá výukový panel.
