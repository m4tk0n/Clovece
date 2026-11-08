# AI – strategie, výpočty a výuka

**Aktuální stav:** místní JavaScriptová AI načítá nové lidské instrukce před každým rozhodnutím a umí je použít při přesné shodě herní situace. Rozpoznání textu je zatím omezené na výslovně uvedené číslo figurky; obecné podobné situace a online PHP AI jsou další práce.

**Místní implementace:** `js/ai-strategy.js`  
**Pravidla a legální tahy:** centrální herní pravidla a herní engine.  
**Podrobný popis výuky:** [AI_TRAINING.md](AI_TRAINING.md)

## 1. Oddělení odpovědností

- Herní engine rozhoduje, co je legální. AI nesmí vytvářet vlastní tahy ani měnit pravidla.
- Výpočtová vrstva poskytuje číselné údaje, například zbývající postup, pravděpodobnost dosažení cíle a pravděpodobnost ohrožení figurky.
- Výpočty samy o sobě neurčují, který tah je dobrý.
- Místní taktická vrstva může použít uloženou lidskou instrukci, pouze pokud přesně odpovídá aktuálnímu stavu a cílová figurka je legální.\n- Serverová AI online her zatím lidské instrukce nepoužívá.
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

Místní AI před každým výběrem tahu volá `ai-training-knowledge.php`. Nové JSON soubory si uloží do paměti aktuální hry a další kontroly načítají pouze nově vytvořené soubory. `js/ai-strategy.js` porovnává přesnou situaci a vybírá pouze z legálních tahů. Rozhodnutí, které ovlivnila instrukce, vrací `trainedKnowledge: true` a ID použitého záznamu. Okamžitá výhra má přednost.\n\nToto je první omezená fáze učení, nikoli obecné porozumění libovolnému českému textu. Online PHP AI zatím používá oddělenou strategii.

## 5. Výuka člověkem

Výukový režim se spouští přes `/?debug=training`. Člověk může rozhodnutí AI opravit, potvrdit jako správné nebo přeskočit. Každé odeslané hodnocení se ukládá jako nový neměnný JSON soubor do `storage/ai-training/instructions/`.

Podrobný popis UI, JSON struktury, zabezpečení, současného stavu a úkolů je v [docs/AI_TRAINING.md](AI_TRAINING.md).

## 6. Další fáze

Je nutné rozšířit rozpoznávání na podobné situace a další jasně formulované taktické záměry, doplnit trvalý audit každého použití instrukce a zapojit znalostní vrstvu také do serverové AI online her. U místní AI lze již nyní v debug režimu ověřit konkrétní ID instrukce, která skutečně ovlivnila tah.

Pravidla zůstávají oddělená od strategie. Lidská výuka může ovlivnit pouze pořadí legálních možností, nikdy pravidla nebo seznam legálních tahů.
