# Neuronová AI – technický základ

## Stav

**Herní AI je aktivní:** pokud není k dispozici okamžitá výhra, přesná lidská naučená preference ani platný neuronový model, vybírá tah podle taktického učitele (postup, ohrožení vlastních figurek, vyhození soupeře a dokončení figurky). Náhodný výběr už není běžnou záložní strategií. Produkční neuronový model zůstává vypnutý, protože export vah schema v3 zatím není ověřený; prázdné váhy se nesmějí vydávat za natrénovanou síť. Inferenční vrstva a offline trenér jsou připravené.

## Architektura

1. `js/game-engine.js` vypočítá legální tahy a simuluje každý z nich. Pravidla ani generování tahů neuronová síť nepřebírá.
2. `js/ai-neural-network.js` převede každý legální kandidátní tah na pevný vektor 26 čísel (schema v3) a provede dopředný průchod malou plně propojenou sítí.
3. `js/models/ludo-ai.js` obsahuje export vah. Nyní je vypnutý prázdný model.
4. `js/ai-strategy.js` zachová prioritu okamžité výhry a přesné lidské výukové paměti. Poté použije platný neuronový model; pokud zatím není dostupný, použije taktického učitele jako aktivní výchozí strategii.
5. `js/game-turn.js` načítá model dynamicky až při rozhodování AI. Člověk ani běžná úvodní obrazovka nestahují model.

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

Výpočet ohrožení zkouší všech šest výsledků kostky pro každého soupeře samostatně. Jde o příležitost k zásahu při jednom hodu každého soupeře; záměrně se nezapočítává bonusový řetězec šestek ani změna pozic po tahu předchozího soupeře. Příznak šance vlastního vyhození a dokončení zkoumá legální tahy při jednom vlastním hodu. Příznak dalšího hodu je podíl výsledků kostky, pro které existuje alespoň jeden legální tah končící dalším hodem. Nejde o zaručené chování konkrétní strategie soupeře. Všechny hodnoty jsou normalizované do intervalu 0–1.

Schema v1 (18 vstupů) a v2 (23 vstupů) jsou s v3 nekompatibilní. Staré self-play soubory se nesmějí automaticky doplňovat nulami; pro trénink v3 je nutné vytvořit nová data.

Tři taktické vstupy v3 odpovídají měřitelným složkám taktického učitele. Runtime je počítá pouze při platném zapnutém neuronovém modelu; jejich výpočet tedy nezatěžuje běžnou hru s vypnutým modelem. Nejde o herní pravidla ani o změnu výběru legálních tahů.

## Co následuje pro neuronovou síť

- Dokončit nový self-play sběr s 26 příznaky schema v3 na deskách 40/48/80.
- Natrénovat kandidáta s oddělením validačních partií a zaznamenat validační přesnost.
- Odehrát nejméně 200 turnajových her proti taktickému učiteli; kandidát musí překonat základní hranici i intervalem spolehlivosti.
- Ověřit vítěznost na více počtech hráčů a velikostech desky, ne pouze na 40/4.
- Teprve po prokazatelném zlepšení a regresních testech uvažovat o zapnutí `enabled: true`.

Online PHP AI zatím zůstává beze změny. Před jejím napojením je potřeba rozhodnout o společném formátu inference pro PHP; pravidla v `lib/game-engine.php` se kvůli tomu nesmí měnit.
