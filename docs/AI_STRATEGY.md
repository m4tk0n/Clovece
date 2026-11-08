# AI – strategie, výpočty a výuka

**Aktuální stav:** AI nemá zapojené naučené taktické preference. Ruční sběr lidské zpětné vazby je implementovaný, její automatické využívání při rozhodování zatím ne.

**Místní implementace:** `js/ai-strategy.js`  
**Pravidla a legální tahy:** centrální herní pravidla a herní engine.  
**Podrobný popis výuky:** [AI_TRAINING.md](AI_TRAINING.md)

## 1. Oddělení odpovědností

- Herní engine rozhoduje, co je legální. AI nesmí vytvářet vlastní tahy ani měnit pravidla.
- Výpočtová vrstva poskytuje číselné údaje, například zbývající postup, pravděpodobnost dosažení cíle a pravděpodobnost ohrožení figurky.
- Výpočty samy o sobě neurčují, který tah je dobrý.
- Taktická vrstva zatím nepoužívá lidské instrukce ani naučený model.
- Okamžitě vítězný tah má přednost, protože přímo ukončuje hru ve prospěch AI.

## 2. Zachované výpočty

### Pravděpodobnost dosažení cíle

Pro vzdálenost (d) a možnost řetězení šestek:

[
P(d)=rac{1}{6^{\lceil d/6\rceil}}
]

Jde o orientační matematický odhad. Skutečná možnost konkrétního zásahu se musí vyhodnocovat přes herní engine, aby se zohlednila obsazená pole a aktivní pravidla.

### Zbývající postup

- Figurka na okruhu nebo v domečku: `max(0, L + 3 - q)`.
- Figurka v základně: `L + 3 + 6`, kde 6 představuje nutný hod pro nasazení.
- Pokud jsou všechny figurky v základně, připočítá se matematický odhad čekání na šestku podle nastavení počtu pokusů.

Tyto hodnoty jsou popisné; aktuální výběr tahu je nepoužívá jako taktické skóre.

### Ohrožení figurky

Pravděpodobnost zásahu se simuluje pomocí `rollDice()`, `getValidMoves()` a `movePiece()`. Simulace nesmí přidávat vlastní pravidla. Výsledek je údaj o možnosti zásahu, nikoli automatický pokyn k útěku.

## 3. Co je vypnuto

- pevné preference pro vyhození soupeře;
- automatické upřednostňování bezpečí;
- bonusy za počet aktivních figurek a flexibilitu;
- penalizace blokovaného startu;
- adaptivní ochota riskovat podle pořadí;
- bodové váhy obtížností easy / medium / hard;
- staré checkpointy a modely původního trénovacího systému.

## 4. Současný výběr tahu

1. Engine vrátí seznam legálních tahů.
2. AI ověří, zda některý z nich okamžitě vyhrává.
3. Pokud ano, provede vítězný tah.
4. Jinak vybere rovnoměrně jednu možnost ze seznamu.
5. Výukový panel může rozhodnutí zobrazit a uložit lidské hodnocení.

Aktuální AI **nečte** uložené lidské instrukce. Nejde tedy zatím o naučenou strategii.

## 5. Výuka člověkem

Výukový režim se spouští přes `/?debug=training`. Člověk může rozhodnutí AI opravit, potvrdit jako správné nebo přeskočit. Každé odeslané hodnocení se ukládá jako nový neměnný JSON soubor do `storage/ai-training/instructions/`.

Podrobný popis UI, JSON struktury, zabezpečení, současného stavu a úkolů je v [docs/AI_TRAINING.md](AI_TRAINING.md).

## 6. Další fáze

Je nutné doplnit vyhledávání relevantních lidských instrukcí, jejich bezpečné využití při hodnocení legálních tahů a audit konkrétních ID instrukcí použitých při každém rozhodnutí. Dokud tyto části nejsou hotové, nesmí se tvrdit, že AI už lidské opravy používá.

Pravidla zůstávají oddělená od strategie. Lidská výuka může ovlivnit pouze pořadí legálních možností, nikdy pravidla nebo seznam legálních tahů.
