# Neuronová AI – technický základ

## Stav

**Stav v místní hře: inferenční modul je připraven, ale běžný tah jej nyní nepoužívá.** `js/models/ludo-ai.js` má `enabled: true` a heuristicky inicializované váhy `heuristic-seed-v1`, avšak `js/game-turn.js` předává do `chooseAIMoveDecision` hodnotu `null`. Místní hra proto rozhoduje pomocí taktického váhového učitele a 1000-slot konfigurace. Heuristická inicializace není offline natrénovaný model ani důkaz vyšší výhernosti.

## Architektura

1. `js/game-engine.js` vypočítá legální tahy a simuluje každý z nich. Pravidla ani generování tahů neuronová síť nepřebírá.
2. `js/ai-neural-network.js` převede každý legální kandidátní tah na pevný vektor 26 čísel (schema v3) a provede dopředný průchod malou plně propojenou sítí.
3. `js/models/ludo-ai.js` obsahuje aktivní nenulové počáteční váhy `heuristic-seed-v1` pro architekturu 26→32→16→1.
4. `js/ai-strategy.js` zachová prioritu okamžité výhry a přesné lidské výukové paměti. Poté používá platný neuronový model; taktický učitel je záloha.
5. `js/game-turn.js` má připravené místo pro dynamické předání modelu, ale v současném místním provozu výslovně předává `null`; model se proto při běžném tahu nepoužije.

## Vstupní příznaky modelu

Schema v3 má přesně 26 hodnot. Prvních 18 zachovává původní pořadí: hod kostkou, normalizovanou délku okruhu, počet hráčů, počty vlastních figurek v základně/na okruhu/v domečku, polohu vybrané figurky před a po tahu, velikost posunu, nasazení, vyhození soupeře, vlastní vyhození na startu, dokončení figurky, okamžitou výhru, počty vlastních figurek po tahu a počty soupeřových figurek na okruhu a legálních možností. Hodnoty 18–22 jsou pravděpodobnostní příznaky vypočtené enumerací hodů 1–6 a skutečných legálních tahů enginu: riziko vyhození vybrané figurky při jednom hodu každého soupeře, příležitost vlastního vyhození soupeře při jednom vlastním hodu, šance dokončit vybranou figurku při jednom vlastním hodu, šance získat další hod při jednom vlastním hodu a zvláštní riziko napadení právě nasazené figurky. Poslední tři hodnoty jsou normalizované taktické faktory učitele: vlastní postup, vrácený postup soupeře a změna celkového ohrožení vlastních figurek po tahu.

Všechny pozice se normalizují podle délky okruhu. Vektor proto není svázán jen s deskou 40 polí a lze jej použít pro 40/48/80.

## Formát vah

Model je JavaScriptový modul exportující objekt:
- `format: clovece-ai-neural-model`
- `version: 1`
- `featureSchemaVersion: 3`
- `inputSize: 26`
- `enabled: true`
- `layers`: pole vrstev `{ outputSize, activation, weights, biases }`; poslední vrstva má jeden lineární výstup.

Aktivace: `relu`, `tanh`, `linear`. Runtime odmítne neplatné rozměry, nečíselné váhy i nekompatibilní verzi příznaků.

## Omezení pravděpodobnostních příznaků v2 a taktických vstupů v3

Pravděpodobnostní příznaky neuronového vektoru zkoušejí všech šest výsledků kostky a legální tahy enginu; jde o dostupnost příležitosti, nikoli o jistou předpověď konkrétní strategie soupeře. Samostatný přesný výpočet ohrožení v `ai-strategy.js` navíc prohledává bonusové šestky s omezenou hloubkou a změnu rizika přesouvané figurky přímo započítává do taktického skóre. Všechny pravděpodobnostní vstupy neuronového modelu jsou normalizované do intervalu 0–1.

Schema v1 (18 vstupů) a v2 (23 vstupů) jsou s v3 nekompatibilní. Staré self-play soubory se nesmějí automaticky doplňovat nulami; pro trénink v3 je nutné vytvořit nová data.

Tři taktické vstupy v3 odpovídají měřitelným složkám taktického učitele. Runtime je počítá pouze při platném předaném neuronovém modelu; protože místní `game-turn.js` nyní předává `null`, tyto vstupy se v běžném místním tahu nepočítají. Nejde o herní pravidla ani o změnu výběru legálních tahů.

## Další učení a ověřování

Aktuální aktivní model je pouze heuristicky inicializovaný. Nesmí se označovat za natrénovaný ani za prokazatelně silnější než taktický učitel. Další krok je vytvořit nové schema v3 zkušenosti, natrénovat kandidáta a porovnat jej v turnaji; kandidáta nasadit až po prokázaném zlepšení.

## Co následuje pro neuronovou síť

- Dokončit nový self-play sběr s 26 příznaky schema v3 na deskách 40/48/80.
- Natrénovat kandidáta s oddělením validačních partií a zaznamenat validační přesnost.
- Odehrát nejméně 200 turnajových her proti taktickému učiteli; kandidát musí překonat základní hranici i intervalem spolehlivosti.
- Ověřit vítěznost na více počtech hráčů a velikostech desky, ne pouze na 40/4.
- Teprve po prokazatelném zlepšení a regresních testech uvažovat o zapnutí `enabled: true`.

Online PHP AI zatím zůstává beze změny. Před jejím napojením je potřeba rozhodnout o společném formátu inference pro PHP; pravidla v `lib/game-engine.php` se kvůli tomu nesmí měnit.
