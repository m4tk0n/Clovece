# Monte Carlo AI a samostatné ladění

## Co je přidáno

- `js/ai-mcts.js` obsahuje Monte Carlo Tree Search (MCTS).
- Každý rozhodovací uzel používá výhradně legální tahy z `game-engine.js`.
- Mezi rozhodnutími se kostka vzorkuje jako náhodná událost přes skutečné `rollDice()`.
- Strom používá UCT (Upper Confidence Bound for Trees). Každý hráč vybírá pokračování podle vlastní složky odměny, takže soupeři nehrají jako jeden spolupracující tým.
- Po rozšíření uzlu proběhne rychlá simulace partie. Rollout vybírá tah podle pipového postupu a relativního znevýhodnění soupeřů.
- Výsledek simulace se vrací zpět všem navštíveným uzlům.
- Vyhledávání pracuje s kopiemi stavu; živou rozehranou partii nemění.

## API

```js
chooseAIMoveMonteCarlo(game, {
  simulations: 160,
  exploration: Math.SQRT2,
  maxPlayoutTurns: 500,
  seed: 123
});

chooseAIMoveMonteCarloDecision(game, options);
```

Výchozí rozpočet je 160 simulací. Lze jej zvýšit pro laboratorní turnaje; pro běžný mobilní tah je nutné nejprve změřit dobu výpočtu. MCTS je dostupné přes engine API, ale zatím nenahrazuje výchozí obtížnosti easy/medium/hard v běžné hře.

## Samostatné turnaje a ladění

Spuštění:

```bash
npm run train:ai
npm run train:ai -- --games=10 --simulations=96 --max-turns=2500
```

Tréninkový runner:

- hraje kandidátní MCTS proti pevné střední strategii,
- střídá pozici kandidáta mezi hráči,
- pokrývá 2 hráče / desku 40, 4 hráče / desku 40, 6 hráčů / desku 48 a 8 hráčů / desku 80,
- porovnává tři hodnoty UCT exploration (0,7 / odmocnina 2 / 2,2),
- používá reprodukovatelné seed hodnoty,
- kontroluje, že AI nikdy nevrátí nelegální tah,
- ukládá výsledky do `artifacts/ai-training-report.json`.

Výchozí běh je krátký orientační experiment. Pro rozhodnutí o nasazení je potřeba větší nezávislý turnaj a porovnání na nových seedech.

## Co se automaticky nemění

Trénink **nepřepisuje produkční strategii ani pravidla**. Zatím optimalizuje parametry vyhledávání MCTS (UCT exploration) a vytváří report. Nejde o neuronovou síť ani o automatické učení nových vah pipového modelu. Výsledek se musí vyhodnotit a případně samostatně schválit; produkční obtížnosti se nemění samovolně.

## Bezpečnost a výkon

- Pravidla zůstávají pouze v enginu; MCTS si je znovu neimplementuje.
- Výchozí AI v běžné hře zůstává beze změny.
- Vyhledávání má omezený počet simulací a délku rolloutů.
- Před zapojením MCTS do obtížnosti hard je nutné změřit latenci na slabších telefonech a porovnat výhernost proti současné hard AI.
