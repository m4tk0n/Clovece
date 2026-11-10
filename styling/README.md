# Vývoj menu

Vývojové menu je dostupné na `/styling/`. Produkční `index.php`, produkční CSS ani produkční navigace se při úpravách tohoto prostředí nemění.

## Rozsah

Menu používá původní HTML obrazovky z `/screens/`:

- hlavní menu,
- přihlášení a registrace,
- profil a statistiky,
- nastavení aplikace,
- pravidla,
- rozehrané hry,
- online lobby a místnost.

Výběr hráčů, nastavení desky, figurek a vlastní herní obrazovka jsou záměrně mimo tuto etapu.

## Načítání

Při prvním otevření se načítají pouze společné styly a hlavní menu. HTML dalších obrazovek se načte přes `screen.php` až při jejich otevření. CSS konkrétní obrazovky se připojí až současně s ní a při návratu na hlavní menu se odpojí. Nastavení, profil a autentizace používají původní moduly; nastavení a profil se importují až při otevření.

Herní engine, desky, figurky, kostky, audio a herní CSS se v tomto prostředí nenačítají.

## Konfigurace vzhledu

Společné vizuální hodnoty jsou v `css/00_styles.css`:

- šířky a odsazení panelů,
- rozměry ovládacích prvků,
- velikost nadpisu a loga,
- barvy a pozadí,
- písmo,
- mobilní breakpointy.

Obrazovkové CSS se přebírá z funkční produkční verze, aby se styly neduplikovaly. Pokud se později bude měnit vzhled konkrétní obrazovky, její pravidla se přesunou do samostatného souboru v `styling/css/`.

## Navigace

Seznam obrazovek a jejich CSS je v `js/menu.js` v konstantě `SCREEN_CONFIG`. Serverová povolená jména obrazovek jsou zároveň bezpečnostně omezena v `screen.php`. Herní obrazovky nejsou povoleným cílem.
