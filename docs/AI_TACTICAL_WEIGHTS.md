# Společné taktické váhy AI

Verze: 1

Stejné koeficienty jsou použity v místní JavaScriptové strategii
(`js/ai-strategy.js`) a v online PHP strategii (`lib/game-engine.php`).
Obě AI nejprve získají legální tahy od svého herního enginu a následně
ohodnotí simulované výsledky.

| Faktor | Váha |
|---|---:|
| Okamžité vítězství | +100000 |
| Vlastní postup (za jednotku zlepšení) | +0.08 |
| Vrácení soupeře / zhoršení jeho postupu | +0.035 |
| Snížení ohrožení vlastních figurek | +12 |
| Vyhození soupeřovy figurky | +5 |
| Vyhození vlastní figurky při nasazení | -7 |
| Dokončení figurky | +8 |

Váhy se používají pouze pro pořadí legálních kandidátů. Nemění pravidla,
generování legálních tahů ani stav hry.

## Aktuální provoz

- JavaScriptová AI používá tuto taktickou strategii; neuronový model je
  dočasně vypnutý, protože PHP zatím nemá společnou neuronovou inferenci.
- Online PHP AI používá stejné číselné koeficienty a vybírá kandidáta
  s nejvyšším skóre; při shodě rozhoduje nižší ID figurky.
- Nejde o natrénované váhy. Jde o společnou deterministickou výchozí
  taktiku v1, kterou lze později porovnat a upravit na základě turnajů.
- Skutečné skóre jednotlivých kandidátů se může mírně lišit, protože
  oba enginy počítají některé pomocné taktické ukazatele vlastní
  implementací. Koeficienty jsou však totožné.
