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
2. Odměnu vystředí vůči průměrné odměně hráčů v dané partii.
3. Změří, jak změna vah ovlivňuje pravděpodobnost vybraného tahu oproti ostatním legálním kandidátům.
4. Aktualizuje pouze šest běžných taktických vah. Okamžitá výhra zůstává pevná.
5. Celé partie rozdělí mezi trénovací a validační množinu; tahy z jedné partie se nikdy nerozdělí mezi obě množiny.
6. Nové váhy přijme pouze tehdy, pokud se zlepší odměnou vážené skóre na oddělených validačních partiích.

Trénink nepoužívá `teacherScore` jako cílovou hodnotu a nepředstírá tak, že pouhé kopírování učitele je nové učení. Validační skóre je kontrola kvality tréninku, nikoliv důkaz vyšší úspěšnosti v turnaji. Nezávislé turnajové porovnání zůstává samostatným krokem.

## Automatický cyklus

- Workflow `.github/workflows/ai-self-play.yml` vytváří partie a archivuje je ve větvi `ai-training-data`.
- Workflow `.github/workflows/ai-train-weights.yml` se spustí po úspěšném dokončení self-play workflow.
- Trénink vytvoří report `ai-weight-training-report.json`.
- Pokud validační kontrola přijme lepší hodnoty, aktualizuje společný JSON a JS modul a uloží změny do `main`.
- Pokud se zlepšení nepotvrdí, aktuální váhy zůstanou beze změny.

Report obsahuje původní, navržené a výsledné váhy, počty partií a rozhodnutí, validační skóre i informaci, zda byl kandidát přijat.

## Ochrany

- Trénink nemění pravidla hry ani generování legálních tahů.
- Nedokončené partie a rozhodnutí s okamžitě vítězným tahem se do aktualizace běžných vah nezapočítávají.
- Okamžitá výhra má vždy přednost.
- Při nedostatku dat nebo chybějící oddělené validaci se trénink zastaví bez změny vah.
- PHP a JavaScript používají stejné naučené číselné hodnoty.
