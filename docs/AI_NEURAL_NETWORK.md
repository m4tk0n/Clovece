# Neuronová AI – technický základ

## Stav

Připravena je pouze inferenční vrstva a rozhraní modelu. **Model zatím není natrénovaný a běžná hra proto dál používá dosavadní rozhodování.** V repozitáři nejsou žádné vymyšlené váhy ani převzatý model cizí hry.

## Architektura

1. `js/game-engine.js` vypočítá legální tahy a simuluje každý z nich. Pravidla ani generování tahů neuronová síť nepřebírá.
2. `js/ai-neural-network.js` převede každý legální kandidátní tah na pevný vektor 18 čísel a provede dopředný průchod malou plně propojenou sítí.
3. `models/ludo-ai.js` obsahuje export vah. Nyní je vypnutý prázdný model.
4. `js/ai-strategy.js` zachová prioritu okamžité výhry a přesné lidské výukové paměti. Pokud pro situaci není přesná lidská preference a model je platný, vybere kandidáta s nejvyšším neuronovým skóre.
5. `js/game-turn.js` načítá model dynamicky až při rozhodování AI. Člověk ani běžná úvodní obrazovka nestahují model.

## Vstupní příznaky modelu

Vektor verze 1 má přesně 18 hodnot: hod kostkou, normalizovanou délku okruhu, počet hráčů, počty vlastních figurek v základně/na okruhu/v domečku, polohu vybrané figurky před a po tahu, velikost posunu, nasazení, vyhození soupeře, vlastní vyhození na startu, dokončení figurky, okamžitou výhru, počty vlastních figurek po tahu a počty soupeřových figurek na okruhu a legálních možností.

Všechny pozice se normalizují podle délky okruhu. Vektor proto není svázán jen s deskou 40 polí a lze jej použít pro 40/48/80.

## Formát vah

Model je JavaScriptový modul exportující objekt:
- `format: clovece-ai-neural-model`
- `version: 1`
- `featureSchemaVersion: 1`
- `inputSize: 18`
- `enabled: true`
- `layers`: pole vrstev `{ outputSize, activation, weights, biases }`; poslední vrstva má jeden lineární výstup.

Aktivace: `relu`, `tanh`, `linear`. Runtime odmítne neplatné rozměry, nečíselné váhy i nekompatibilní verzi příznaků.

## Co následuje před zapnutím

- Připravit offline trénovací pipeline a převod lidských rozhodnutí / partií na příklady.
- Trénovat na přesných pravidlech našeho enginu, nikoliv na cizím Ludo prostředí.
- Rozdělit data na trénovací a validační množinu a porovnat síť proti současné náhodné a lidsky učené AI.
- Exportovat skutečné váhy do `models/ludo-ai.js`.
- Teprve po regresních testech zapnout `enabled: true`.

Online PHP AI zatím zůstává beze změny. Před jejím napojením je potřeba rozhodnout o společném formátu inference pro PHP; pravidla v `lib/game-engine.php` se kvůli tomu nesmí měnit.
