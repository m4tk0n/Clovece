<!-- /docs/AI_STRATEGY.md -->
# Strategická AI – deset naučitelných vah

## Stav implementace

Nová strategická AI je zapojená do místní JavaScriptové hry i serverové PHP hry. Obě varianty používají stejných deset pojmenovaných vah a stejnou zásadu: herní engine je jediný zdroj legálních tahů a AI pouze řadí jeho kandidáty.

Výchozí hodnoty jsou inicializované, ale **nejsou vydávány za natrénované**. Automatické učení se spouští nad archivovanými dokončenými self-play partiemi. Kandidát se nesmí stát aktivní sadou, dokud neprojde oddělenou validací a turnajem proti původní AI.

## Deset naučitelných vah

Všechny signály jsou normalizované a mají pevně daný význam. Učit lze pouze těchto deset parametrů.

| ID | Klíč | Výchozí hodnota | Strategický význam |
|---:|---|---:|---|
| 1 | `progressToGoal` | 2 | Zkrácení zbývající cesty vlastní figurky |
| 2 | `finishPiece` | 80 | Dokončení figurky v cílovém domečku |
| 3 | `captureOpponent` | 18 | Vyhození soupeřovy figurky |
| 4 | `protectOwn` | 25 | Snížení pravděpodobnosti vyhození vlastních figurek |
| 5 | `threatenOpponent` | 12 | Možnost napadnout soupeře v navazujících tazích |
| 6 | `deployPiece` | 8 | Nasazení další figurky ze základny |
| 7 | `homeProgress` | 20 | Vstup a postup v cílovém domečku |
| 8 | `bonusContinuation` | 10 | Bonusový hod a možnost pokračovat po šestce |
| 9 | `startFieldRisk` | 18 | Riziko na startovních polích soupeřů |
| 10 | `flexibility` | 4 | Zachování více použitelných možností pro další tah |

Konfigurace je v `js/ai-weight-config.js`; definice a limity jsou u každé váhy. Serverové PHP čte odpovídající hodnoty z `config/ai-tactical-weights.json`. Lidská zpětná vazba smí měnit pouze ID 1–10. Soubor `ai-learned-weights.json` používá schéma `ai-weights-10-v1`; stejné přepsané hodnoty načítá lokální JavaScript i online PHP. Starý soubor z původního 1000-slot modelu se ignoruje.

## Rozhodování a simulace

- AI si vyžádá legální tahy z herního enginu. Nesmí si sama vytvářet tahy ani měnit pravidla.
- U každého kandidáta simuluje všech šest hodnot další kostky.
- Simulace po hodu také skutečně vyhodnotí dostupné pokračující tahy, takže bonusový hod není odhadnut pouze podle čísla šest.
- Lokální AI používá výpočet rizika vyhození a možné reakce soupeřů včetně řetězení šestek.
- Online PHP AI provádí simulaci šesti hodů a vyhodnocuje riziko soupeřových figurek serverovým enginem.
- Pokud existuje legální okamžitě vítězný tah, má vždy přednost před váhovým skóre.
- Výsledné rozhodnutí zaznamenává všech deset signálů, příspěvek každé váhy, skóre kandidátů a simulované výsledky kostky.

## Automatické učení

Self-play používá stejných deset signálů jako produkční AI. Po dokončení partie uloží výsledek a odměnu podle konečného pořadí.

Trénovací skript `scripts/ai-train-weights.mjs`:
- učí pouze deset definovaných vah metodou REINFORCE,
- rozděluje trénovací a validační data podle celých partií,
- kontroluje, že uložená rozhodnutí odpovídají skutečné behavior policy,
- odmítne kandidáta, pokud se nezlepší výsledek na validačních partiích.

Přijatý kandidát musí následně projít turnajem na deskách 40, 48 a 80. Bez úspěšné validace a turnaje zůstávají aktivní váhy beze změny.

## Porovnání s původní AI

Původní lokální AI s 1000 konfiguračními hodnotami je zachována v souborech:
- `js/ai-original-baseline.js`
- `js/ai-original-weight-config.js`
- `js/ai-original-tactical-weights.js`

Tyto soubory se nepoužívají v běžné hře. Jsou pouze neměnnou turnajovou základnou; nová desetiváhová AI se proti ní porovnává se stejným herním enginem, pravidly, seedovanými hody a rotací míst hráčů. Původní váhy se automatickým učením nepřepisují.

## Záznam a vysvětlení rozhodnutí

Každé rozhodnutí může v debug/trainer režimu zobrazit:
- stav hry, hráče a hod kostkou,
- všechny legální kandidáty,
- deset signálů a deset příspěvků vah,
- simulaci šesti výsledků kostky,
- vybranou figurku a důvod výběru,
- informaci, zda rozhodnutí ovlivnila uložená výuková instrukce.

## Základní zásada

Strategie a učení mohou měnit pouze pořadí legálních tahů. Pravidla, generování legálních tahů a stav hry zůstávají odpovědností společného herního enginu.
