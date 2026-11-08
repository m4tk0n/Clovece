# Zobrazení herní desky

## Aktuální nastavení

- V nabídce vzhledu desky je dostupná pouze varianta **KLASIK**.
- Varianta **MNOHOÚHELNÍK** je skrytá a nesmí se zobrazovat jako přepínač.
- Kód polygonové varianty zatím nemažeme; jde pouze o skrytí volby v uživatelském rozhraní.
- Pokud má prohlížeč v místním úložišti uloženou dřívější volbu `polygon`, aplikace ji odmítne a použije `classic`.
- 2D/3D přepínač zůstává samostatný a tímto nastavením se nemění.

## Implementace

- Soubor: `js/game-board-view.js`
- Povolené styly v nabídce: `STYLES = ['classic']`.
- Dokumentace popisuje aktuální stav, nikoli odstranění podpory polygonového rendereru.

## Změna nastavení

Polygonovou variantu lze znovu zpřístupnit změnou seznamu `STYLES` v `js/game-board-view.js` na `['classic', 'polygon']` a aktualizací této dokumentace.
