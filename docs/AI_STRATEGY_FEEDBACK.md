# Debug rozbor a zpětná vazba AI

## Účel

AI se nebude automaticky trénovat. Její strategii budeme zlepšovat řízeně podle konkrétních situací, které hráč označí jako chybné.

## Co hráč uvidí

V debug režimu (`?debug=1`) musí být vidět:
1. Hod kostkou a hodnota, kterou AI skutečně obdržela.
2. Všechny legální tahy poskytnuté herním enginem.
3. Zásady, které byly pro daný tah vyhodnoceny.
4. Bodové složky každé možnosti a jejich slovní vysvětlení.
5. Vybranou figurku, cílové pole a důvod volby.
6. Průběh provedení tahu a výsledek.

Rozhodnutí a herní události zůstávají samostatnými řádky chatu. Více navazujících tahových událostí stejného hráče se může slučovat podle pravidel v [CHAT_LOG.md](CHAT_LOG.md), ale vysvětlení AI se nesmí ztratit.

## Kopírování posledního tahu

V debug chatu bude tlačítko **Zkopírovat JSON**. Kliknutí uloží do systémové schránky úplný export posledního rozhodnutí AI. Export musí být samostatný, čitelný JSON a musí umožnit znovu sestavit přesně stejný stav hry.

Doporučená struktura:

```json
{
  "format": "clovece-ai-debug",
  "formatVersion": 1,
  "strategyVersion": "fixed-v1",
  "game": {
    "boardSize": 40,
    "playerCount": 4,
    "players": [],
    "rules": {
      "threeRolls": true,
      "mustDeploy": true,
      "skipHomePieces": false,
      "mustEnterHome": false,
      "threeSixesPenalty": false
    },
    "currentPlayer": 0,
    "phase": "move",
    "diceValue": 6,
    "turnNumber": 1,
    "piecesBefore": []
  },
  "decision": {
    "legalMoves": [0, 1],
    "candidates": [],
    "selectedPieceId": 0,
    "explanation": "..."
  },
  "result": {
    "move": {},
    "piecesAfter": []
  }
}
```

Pole pravidel se vždy exportují ve skutečných hodnotách dané partie. Pokud některé pole není v daném herním režimu podporováno, uvede se jako `null` nebo se výslovně označí jako nepodporované; nesmí se tiše nahradit výchozí hodnotou.

## Jak se záznam použije

Hráč vloží JSON do konverzace a doplní, jak měla AI podle něj táhnout. Při úpravě:
- zrekonstruujeme stav z JSON;
- ověříme legální tahy přes herní engine;
- porovnáme skutečně vybraný tah s navrženým tahem;
- upravíme pevné výpočty nebo strategické zásady;
- přidáme automatický regresní test;
- ověříme místní i online AI.

Záznam nesmí obsahovat hesla, session cookies, CSRF tokeny, přístupové klíče, e-mailové adresy ani interní ID účtů. Pro rekonstrukci stačí herní identifikátory hráčů v rámci jedné partie, jména zobrazená na desce, barvy, pravidla a pozice figurek.

## Rozhodovací zásady

Skóre musí kontextově vyvažovat zejména:
- okamžité vítězství a dokončení figurky;
- vyhození soupeře a hodnotu jeho ztraceného postupu;
- únik z ohrožení a riziko budoucího vyhození;
- postup již nasazených figurek;
- nasazení nové figurky podle počtu a polohy aktivních figurek;
- zachování možností pro další tahy;
- velikost desky, počet hráčů a aktivní pravidla.

Žádná zásada (včetně nasazování nebo postupu do domečku) nesmí být bezvýhradně nejlepší ve všech situacích.

## Ukládání a provoz

Strategie je součástí aplikace v repozitáři `m4tk0n/Clovece`. Produkční server používá pouze nasazené soubory tohoto repozitáře. Neexistuje samostatný trénovací server, synchronizace modelu ani požadavek na stahování dat při každém hodu.

Změny strategie se testují v repozitáři Člověče a po úspěšných kontrolách se ihned slučují do `main`, odkud probíhá FTP nasazení.
