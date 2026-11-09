# Vývojové prostředí AI

Otevření: `/clovece/debug/`

## Izolace

- Vstupní stránka je `debug/index.php`.
- Debug používá vlastní `debug/js/bootstrap.js`, `navigation.js`, `app.js`, `game-engine.js`, `game-turn.js`, `ai-strategy.js` a vlastní konfiguraci vah.
- Stabilní obrazovky, pravidla, 2D vykreslování a společné UI moduly se načítají z produkčního adresáře.
- Parametr `debug=training` vynutí 2D vykreslení. V této větvi `prepareBoardRendering()` končí před kontrolou WebGL i před dynamickým importem Three.js rendereru.
- Produkční AI a její rozhodovací soubory se při vývoji nemění. Experimentální úpravy patří do tohoto adresáře.
- Debug má vlastní kopii klientské výukové paměti i vlastní PHP endpointy. Záznamy, fronta, naučená paměť a váhy se ukládají do `debug/storage/`; produkční `storage/ai-training/` se nepoužívá.

## Rozbor každého rozhodnutí

Panel zobrazuje:
- legální figurky, jejich výchozí a cílová pole a bodové hodnocení,
- důvod vybraného tahu a příspěvek každé z deseti vah,
- simulaci všech šesti možných hodnot příští kostky včetně dostupných legálních tahů,
- pro každého soupeře všech šest hodnot kostky a legální odpovědi, včetně možnosti vyhodit právě posuzovanou figurku,
- rozdíl mezi strategickým výběrem, naučenou pamětí a tahem vynuceným pravidly.

Odpovědi soupeřů jsou výčtem legálních možností po jednom hodu, nikoli předpovědí, že soupeř konkrétní možnost určitě vybere. Bonusový hod je označen samostatně.

## Automatický smoke test

Při otevření debug stránky se spustí `debug/js/ai-debug-self-test.js`. Kontroluje legálnost výběru, deset vah, všech šest příštích hodů, šest hodů každého soupeře a výstupní pozice kandidátů. Výsledek se vypíše do konzole a do panelu AI.

## Přenos do produkce

Do produkčních souborů se nic nepřenáší automaticky. Ověřenou změnu lze přenést až po samostatném schválení.
