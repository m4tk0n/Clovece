# AI – strategie, výpočty a výuka

**Aktuální stav:** běžná místní AI načte kompilovanou paměť `ai-memory.json` a při dalších tazích ji používá z cache. Pouze `/?debug=trainer` před každým tahem kontroluje frontu nových hodnocení a aktualizuje trvalou paměť. Připravená je také inferenční vrstva neuronové sítě (`js/ai-neural-network.js`) a její rozhraní modelu (`js/models/ludo-ai.js`); model je zatím záměrně vypnutý, protože nemáme natrénované váhy. Detail: [AI_NEURAL_NETWORK.md](AI_NEURAL_NETWORK.md).

**Místní implementace:** `js/ai-strategy.js`  
**Pravidla a legální tahy:** centrální herní pravidla a herní engine.  
**Podrobný popis výuky:** [AI_TRAINING.md](AI_TRAINING.md)

## 1. Oddělení odpovědností

- Herní engine rozhoduje, co je legální. AI nesmí vytvářet vlastní tahy ani měnit pravidla.
- Výpočtová vrstva poskytuje číselné údaje, například zbývající postup, pravděpodobnost dosažení cíle a pravděpodobnost ohrožení figurky.
- Výpočty samy o sobě neurčují, který tah je dobrý.
- Místní taktická vrstva může použít uloženou lidskou instrukci, pouze pokud přesně odpovídá aktuálnímu stavu a cílová figurka je legální.
- Serverová AI online her zatím lidské instrukce nepoužívá.
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
4. Pokud neexistuje naučená preference pro přesnou situaci a je načten platný neuronový model, ohodnotí jím všechny legální kandidáty a vybere nejvyšší skóre.
5. Pokud není dostupný platný model, použije bezpečný náhradní výběr z legálních tahů.

Běžný režim načítá pouze kompilovanou paměť `storage/ai-training/ai-memory.json`; zdrojové výukové JSON neprochází. Paměť se drží v cache prohlížeče po dobu běhu stránky.

Režim `/?debug=trainer` před každým rozhodnutím zavolá `ai-training-knowledge.php`. Endpoint zpracovává pouze názvy souborů z append-only fronty `.training-queue`, pokračuje od uloženého bajtového offsetu a aktualizuje `ai-memory.json`. Celý adresář JSON se pro migraci starších záznamů prohledá pouze jednou. Po úspěšném zpracování lze původní JSON odstranit; kompilovaná paměť a fronta zůstávají.

`js/ai-strategy.js` porovnává přesný podpis situace a vybere legální figurku s nejvyšším počtem naučených hlasů. Rozhodnutí ovlivněné pamětí vrací `trainedKnowledge: true` a souhrn počtu hodnocení. Okamžitá výhra má přednost.

Jde o první omezenou fázi učení: ukládá se preference konkrétní figurky v přesné situaci, nikoli obecné pochopení libovolného českého taktického pokynu. Online PHP AI zatím používá oddělenou strategii.
## 5. Výuka člověkem

Výukový režim se spouští přes `/?debug=trainer` (starší alias `/?debug=training` zůstává podporován). Člověk může přepínat mezi všemi rozhodnutími AI v aktuálním tahu (například samostatně hodnotit rozhodnutí po šestce i po dalším hodu), opravit je, potvrdit jako správné nebo přeskočit. Opravu lze cílit přímo na konkrétní legální figurku pomocí strukturovaného `preferredPieceId`. Každé odeslané hodnocení se ukládá jako nový neměnný JSON soubor do `storage/ai-training/instructions/`.

Podrobný popis UI, JSON struktury, zabezpečení, současného stavu a úkolů je v [docs/AI_TRAINING.md](AI_TRAINING.md).

## 6. Další fáze

Je nutné rozšířit rozpoznávání na podobné situace a další jasně formulované taktické záměry, doplnit trvalý audit každého použití instrukce a zapojit znalostní vrstvu také do serverové AI online her. U místní AI lze již nyní v debug režimu ověřit konkrétní ID instrukce, která skutečně ovlivnila tah.

Pravidla zůstávají oddělená od strategie. Lidská výuka může ovlivnit pouze pořadí legálních možností, nikdy pravidla nebo seznam legálních tahů.


## 7. Aktivní taktický model vah v2

Výběr legálního tahu používá společné váhy z `config/ai-tactical-weights.json`. Model obsahuje devět trénovatelných parametrů: vlastní postup, zdržení soupeře, snížení ohrožení, vyhození soupeře, penalizaci vlastního vyhození, dokončení figurky, nasazení figurky, vstup do domečku a postup v domečku. Okamžitá výhra je samostatná pevná priorita 100000.

Každý faktor je vypočítán pro simulovaný legální tah a jeho příspěvek vstupuje do skóre. Self-play zaznamená faktory, vybrané rozhodnutí, pravděpodobnost výběru a výsledek celé partie. Trenér optimalizuje všech devět proměnných z výsledků partií; turnaj porovnává kompletní sadu parametrů proti aktivní baseline. PHP online strategie i místní JavaScriptová strategie načítají stejný JSON.
