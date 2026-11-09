# AI – strategie, výpočty a výuka

**Aktuální stav:** místní hra vybírá tah pomocí taktického hodnocení 1000 konfiguračních hodnot a případné přesné lidské paměti. Výukový režim `/?debug=trainer` navíc před rozhodnutím načítá nová hodnocení a ukládá úpravy vah. Neuronová inferenční vrstva i heuristicky inicializovaný model existují, ale `js/game-turn.js` jí nyní záměrně nepředává model; místní rozhodování proto běží přes váhového učitele. Model není výsledkem offline trénování. Detail: [AI_NEURAL_NETWORK.md](AI_NEURAL_NETWORK.md).

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

`P(d) = 1 / 6^ceil(d/6)`

Jde o orientační matematický odhad. Skutečná možnost konkrétního zásahu se musí vyhodnocovat přes herní engine, aby se zohlednila obsazená pole a aktivní pravidla.

### Zbývající postup

- Figurka na okruhu nebo v domečku: `max(0, L + 3 - q)`.
- Figurka v základně: `L + 3 + 6`, kde 6 představuje nutný hod pro nasazení.
- Pokud jsou všechny figurky v základně, připočítá se matematický odhad čekání na šestku podle nastavení počtu pokusů.

Tyto hodnoty jsou popisné; aktuální výběr tahu je nepoužívá jako taktické skóre.

### Ohrožení figurky

Pravděpodobnost zásahu se simuluje pomocí `rollDice()`, `getValidMoves()` a `movePiece()`. Simulace nesmí přidávat vlastní pravidla. Pro každého soupeře se prohledají legální možnosti včetně bonusových šestek (s omezenou hloubkou), následně se pravděpodobnosti soupeřů kombinují jako pravděpodobnost alespoň jednoho zásahu.

**Riziko nyní přímo ovlivňuje skóre tahu:** pro právě přesouvanou figurku se vypočte pravděpodobnost zásahu před tahem a po tahu. Rozdíl se násobí vahou `captureOwn` a násobitelem rizika dané obtížnosti. Tah, který figurku dostane z dosahu soupeře, získá body; tah, který ji vystaví většímu riziku, body ztratí. U nasazení se stejným způsobem hodnotí nové vystavení figurky. Tato přesná změna rizika již není pouze diagnostický údaj.

Jde o pravděpodobnostní model možností zásahu při nejvýhodnějším legálním útočném tahu, nikoli o jistou předpověď konkrétní strategie soupeře.

## 3. Co je vypnuto

- Neuronová síť není v běžném místním tahu aktivována: `game-turn.js` předává `null`, takže výběr zůstává u váhového učitele.
- Samostatný offline natrénovaný model s prokázaným zlepšením zatím neexistuje.
- Lidská paměť zobecňuje jen omezeně: preference se používá při přesné shodě celé herní situace.
- Serverová PHP AI online hry zatím nepoužívá stejnou rozhodovací a výukovou vrstvu jako místní JavaScriptová AI.

Naopak aktivní jsou váhové profily obtížnosti, taktické hodnocení postupu a vyhození a nově také přímé bodové hodnocení změny přesné pravděpodobnosti vyhození právě přesouvané figurky.

## 4. Současný výběr tahu

1. Engine vrátí seznam legálních tahů.
2. AI ověří, zda některý z nich okamžitě vyhrává; vítězný tah má nejvyšší prioritu.
3. Pokud existuje naučená preference pro přesnou shodu situace, může vybrat nejlépe hodnocený legální tah.
4. Jinak váhový učitel vypočítá skóre všech legálních kandidátů. Zahrnuje postup, vyhození, vlastní vyhození, vstup a postup v domečku, nasazení, bonusový hod, riziko soupeřova startu a změnu pravděpodobnosti zásahu přesouvané figurky.
5. Náhodnost a četnost záměrných chyb se řídí zvolenou obtížností. Výběr nikdy neopustí seznam legálních tahů.

Běžný režim načítá kompilovanou paměť `storage/ai-training/ai-memory.json`; zdrojové výukové JSON neprochází. Paměť se drží v cache prohlížeče po dobu běhu stránky.

Režim `/?debug=trainer` před každým rozhodnutím zavolá `ai-training-knowledge.php`. Endpoint zpracovává pouze názvy souborů z append-only fronty `.training-queue`, pokračuje od uloženého bajtového offsetu a aktualizuje `ai-memory.json`. Celý adresář JSON se pro migraci starších záznamů prohledá pouze jednou.

`js/ai-strategy.js` porovnává přesný podpis situace a vybere legální figurku s nejvyšším počtem naučených hlasů. Rozhodnutí ovlivněné pamětí vrací `trainedKnowledge: true` a souhrn počtu hodnocení. Okamžitá výhra má přednost.

Jde o omezenou formu učení: ukládá se preference konkrétní figurky v přesné situaci, nikoli obecné pochopení libovolného českého taktického pokynu.

## 5. Výuka člověkem

Výukový režim se spouští přes `/?debug=trainer` (starší alias `/?debug=training` zůstává podporován). Člověk může přepínat mezi všemi rozhodnutími AI v aktuálním tahu (například samostatně hodnotit rozhodnutí po šestce i po dalším hodu), opravit je, potvrdit jako správné nebo přeskočit. Opravu lze cílit přímo na konkrétní legální figurku pomocí strukturovaného `preferredPieceId`. Každé odeslané hodnocení se ukládá jako nový neměnný JSON soubor do `storage/ai-training/instructions/`.

Podrobný popis UI, JSON struktury, zabezpečení, současného stavu a úkolů je v [docs/AI_TRAINING.md](AI_TRAINING.md).

## 6. Další fáze

Je nutné rozšířit rozpoznávání na podobné situace a další jasně formulované taktické záměry, doplnit trvalý audit každého použití instrukce a zapojit znalostní vrstvu také do serverové AI online her. U místní AI lze již nyní v debug režimu ověřit konkrétní ID instrukce, která skutečně ovlivnila tah.

Pravidla zůstávají oddělená od strategie. Lidská výuka může ovlivnit pouze pořadí legálních možností, nikdy pravidla nebo seznam legálních tahů.


## 7. Aktivní taktický model vah v2

Výběr legálního tahu používá společné váhy z `config/ai-tactical-weights.json`. Model obsahuje devět trénovatelných parametrů: vlastní postup, zdržení soupeře, snížení ohrožení, vyhození soupeře, penalizaci vlastního vyhození, dokončení figurky, nasazení figurky, vstup do domečku a postup v domečku. Okamžitá výhra je samostatná pevná priorita 100000.

Každý faktor je vypočítán pro simulovaný legální tah a jeho příspěvek vstupuje do skóre. Self-play zaznamená faktory, vybrané rozhodnutí, pravděpodobnost výběru a výsledek celé partie. Trenér optimalizuje všech devět proměnných z výsledků partií; turnaj porovnává kompletní sadu parametrů proti aktivní baseline. PHP online strategie i místní JavaScriptová strategie načítají stejný JSON.


## 8. Konfigurace 1000 vah z `vahy.txt`

Místní rozhodovací vrstva načítá všech 1000 číselných položek z `js/ai-weight-config.js`. Při hodnocení každého legálního kandidáta prochází ID 1–1000. U strategických položek se hodnota normalizuje funkcí `tanh(value / 100)` a násobí jedním z deseti stavových signálů: postup, útok, obrana, domácí sloupec, nasazení, tlak na soupeře, dokončení figurky, pozice na trase, flexibilita a riziko.

**Důležité omezení:** 876 aktivních číselných položek není 876 nezávislých taktických schopností. Kód je přiřazuje opakovaně do deseti společných signálů pomocí `weightSignals[(id - 1) % 10]`. Každá z těchto vah tak může upravit příspěvek svého společného signálu, ale sama o sobě nepředstavuje novou samostatnou vlastnost herní situace.

**Rozdělení položek:**
- 876 strategických / ladicích položek vstupuje do normalizovaného součtu skóre.
- 124 systémových metadat, kontrolních značek, telemetrie, příznaků a rezervovaných slotů je záměrně neutrálních.
- ID 401–416 současně nastavují profily obtížnosti; jejich číselné hodnoty se zároveň účastní strategického součtu, pokud nejde o neutrální metadata.

Vedle tohoto společného součtu používá učitel i konkrétní pojmenované faktory, například `captureOwn`, `captureOpponent`, `deployPiece`, `enterHome` a `homeProgress`. Debug vrací jednotlivé faktory, příspěvek 1000-slot ensemble i skóre alternativ. Změna vah mění pouze pořadí legálních tahů; pravidla a seznam legálních tahů určuje engine.

Místní hra načítá hodnoty 1–1000 z `js/ai-weight-config.js`; index pole odpovídá ID minus jedna. Hodnoty profilů obtížnosti jsou: lehká (agrese 50, riziko 0,2, chyba 0,15, náhodnost 0,35), střední (150, 1,0, 0,05, 0,1) a těžká (250, 1,8, 0, 0).

## 9. Riziko obsazení soupeřova startu

Pokud AI postaví svou figurku na startovní pole soupeře, vyhodnotí zvláštní riziko opětovného nasazení soupeřovy figurky ze základny. Riziko roste podle počtu soupeřových figurek v základně. Ještě vyšší penalizace se použije, pokud má soupeř některou figurku v závěrečné části trasy nebo v cílovém sloupci. Výpočet současně zohledňuje skutečnou pravděpodobnost vyhození podle herního enginu. Debug faktory: `onOpponentStart`, `opponentStartBasePieces`, `opponentNearGoal`, `pieceThreat` a `startSquareDangerScore`.