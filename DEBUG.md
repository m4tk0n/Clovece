# Debug režim

Zapnutí: přidejte do adresy hry parametr `?debug=1`, například `https://example.com/clovece/?debug=1`. Bez parametru se panel nenačítá.

## Údaje na panelu

- **DISPLAY** – rozměry displeje podle `screen.width × screen.height` v CSS pixelech.
- **OKNO** – rozměry okna stránky podle `window.innerWidth × window.innerHeight`.
- **VIDITELNÉ** – rozměry aktuálně viditelného viewportu podle Visual Viewport API. Na mobilu se mohou měnit při otevření klávesnice nebo změně měřítka.
- **DPR** – poměr fyzických pixelů displeje k CSS pixelům (`devicePixelRatio`).
- **FPS** – orientační počet snímků za sekundu podle `requestAnimationFrame`; aktualizuje se přibližně jednou za sekundu.

Panel je připnutý k hornímu okraji okna obrazovky, nikoli k obsahu stránky. Je malý, červený a neblokuje dotykové ovládání.

## K čemu údaje slouží

- Porovnání **DISPLAY**, **OKNO** a **VIDITELNÉ** pomůže odhalit rozdíly při otočení telefonu, otevření klávesnice nebo změně měřítka.
- **DPR** odlišuje rozměry v CSS pixelech od fyzického rozlišení displeje.
- **FPS** orientačně ukazuje plynulost vykreslování. Nízká hodnota může znamenat vysokou zátěž zařízení, ale sama neurčí její příčinu.
- Panel nic nezapisuje do herního chatu ani logu a nemění herní pravidla nebo stav hry.

## Vypnutí

Odstraňte z adresy parametr `debug=1`. Panel se pak vůbec nezobrazí.
