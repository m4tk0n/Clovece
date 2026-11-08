# Společné taktické váhy AI

Verze konfigurace: 1

## Jediný zdroj vah

Aktuální hodnoty jsou uloženy v `config/ai-tactical-weights.json`.

- JavaScript načítá vygenerovaný modul `js/ai-tactical-weights.js`.
- Online PHP načítá stejný JSON soubor při požadavku.
- Modul JavaScriptu vytváří trénovací skript z JSON konfigurace.
- `immediateWin = 100000` je pevná priorita a trénink ji nikdy nemění.

Výchozí hodnoty:

| Faktor | Váha |
|---|---:|
| Okamžité vítězství | +100000 (pevná) |
| Vlastní postup | +0.08 |
| Vrácení soupeře / zhoršení jeho postupu | +0.035 |
| Snížení ohrožení vlastních figurek | +12 |
| Vyhození soupeřovy figurky | +5 |
| Vyhození vlastní figurky při nasazení | -7 |
| Dokončení figurky | +8 |

## Skutečné učení podle výsledků

`scripts/ai-train-weights.mjs` používá dokončené self-play partie a jejich odměny podle konečného umístění. Učí se metodou REINFORCE (policy gradient):

1. Z každé dokončené partie převezme rozhodnutí, dostupné kandidáty a konečnou odměnu hráče.
2. Self-play vybírá tah ze softmaxového rozdělení podle aktuálních taktických vah a do záznamu ukládá pravděpodobnost výběru, teplotu i použité váhy. Okamžitě vítězný tah zůstává vynucený.
3. Odměnu vystředí vůči průměrné odměně hráčů v dané partii.
4. Změří, jak změna vah ovlivňuje pravděpodobnost vybraného tahu oproti ostatním legálním kandidátům. Historická data koriguje poměrem aktuální a původní pravděpodobnosti výběru (oříznutý importance sampling).
5. Aktualizuje pouze šest běžných taktických vah. Okamžitá výhra zůstává pevná.
6. Celé partie rozdělí mezi trénovací a validační množinu; tahy z jedné partie se nikdy nerozdělí mezi obě množiny.
7. Nové váhy přijme pouze tehdy, pokud se zlepší odměnou vážené skóre na oddělených validačních partiích.

Trénink nepoužívá `teacherScore` jako cílovou hodnotu. Starší deterministické záznamy bez pravděpodobnosti výběru přeskočí; tím se neplete napodobování učitele s učením podle výsledků. Validační skóre je kontrola kvality tréninku, nikoliv důkaz vyšší úspěšnosti v turnaji. Nezávislé turnajové porovnání zůstává samostatným krokem.

## Automatický cyklus

- Workflow `.github/workflows/ai-self-play.yml` vytváří partie a archivuje je ve větvi `ai-training-data`.
- Workflow `.github/workflows/ai-train-weights.yml` se spustí po úspěšném dokončení self-play workflow.
- Trénink vytvoří report `ai-weight-training-report.json` a při úspěšné validaci kandidátní soubory `ai-tactical-weights-candidate.json` a `ai-tactical-weights-candidate.js`.
- Kandidát se uloží jako GitHub Actions artefakt; aktivní `config/ai-tactical-weights.json` ani `js/ai-tactical-weights.js` se v tomto kroku nemění.
- Pokud se validační zlepšení nepotvrdí, kandidátní soubory se nevytvoří.
- Teprve samostatný turnaj v bodě 3 rozhodne, zda se kandidát smí stát aktivní sadou vah.

Report obsahuje původní, navržené a výsledné kandidátní váhy, počty partií a rozhodnutí, validační skóre i informaci, zda byl kandidát přijat. Přijetí v této fázi znamená pouze úspěšnou offline validaci, nikoliv nasazení do hry.

## Ochrany

- Trénink nemění pravidla hry ani generování legálních tahů.
- Nedokončené partie, staré deterministické záznamy a rozhodnutí s okamžitě vítězným tahem se do aktualizace běžných vah nezapočítávají.
- Okamžitá výhra má vždy přednost.
- Při nedostatku dat nebo chybějící oddělené validaci se trénink zastaví bez změny vah.
- Po schválení kandidáta v bodě 3 budou PHP a JavaScript používat stejnou aktivní sadu naučených číselných hodnot.
