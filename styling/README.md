# Vývoj menu

Vývojové menu je dostupné na `/styling/`. Produkční `index.php`, HTML obrazovky, CSS ani produkční navigace se při úpravách tohoto prostředí nemění.

## Rozsah

Menu používá pracovní kopie původních HTML obrazovek v `/styling/screens/`:

- hlavní menu,
- přihlášení a registrace,
- profil a statistiky,
- nastavení aplikace,
- pravidla,
- rozehrané hry,
- online lobby a místnost.

Výběr hráčů, nastavení desky, figurek a vlastní herní obrazovka jsou záměrně mimo tuto etapu.

## Načítání

Při otevření vývojového prostředí se načte jediný soubor `css/menu.css`, který obsahuje kompletní vzhled všech obrazovek menu. HTML dalších obrazovek se načítá přes `screen.php` až při jejich otevření. Navigace proto stále načítá HTML a JavaScript funkcí postupně, ale CSS menu je záměrně pohromadě v jednom souboru. Nastavení, profil a autentizace používají původní moduly; nastavení a profil se importují až při otevření.

Herní engine, desky, figurky, kostky, audio a herní CSS se v tomto prostředí nenačítají.

## Konfigurace vzhledu

Veškeré CSS menu je v jediném souboru `css/menu.css`. Pro snadnou orientaci je rozdělené do jasně označených sekcí. Centrální proměnné a rozměry jsou v sekci `00_styles.css`:

- šířky a odsazení panelů,
- rozměry ovládacích prvků,
- velikost nadpisu a loga,
- barvy a pozadí,
- písmo,
- mobilní breakpointy.

CSS vychází z funkční produkční verze, ale je sloučené do jedné pracovní kopie. Vývoj vzhledu proto nezasahuje do produkčních stylů. Jednotlivé sekce jsou označené komentáři, aby se v souboru dalo rychle orientovat a upravovat styly na jednom místě.

## Navigace

Seznam obrazovek a jejich HTML souborů je v `js/menu.js` v konstantě `SCREEN_CONFIG`. CSS se načítá jako jeden soubor a v navigaci se už samostatně neřeší. Serverová povolená jména obrazovek jsou zároveň bezpečnostně omezena v `screen.php`. Herní obrazovky nejsou povoleným cílem.
