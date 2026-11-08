# AI – výpočty a postupné učení

**Aktuální stav:** nevyučený základ; taktické preference jsou vypnuté.  
**Implementace:** `js/ai-strategy.js`  
**Pravidla a legální tahy:** výhradně `docs/GAME_RULES.md` a `js/game-engine.js`.

## 1. Oddělení odpovědností

- Herní engine rozhoduje, co je legální. AI nesmí vytvářet vlastní tahy ani měnit pravidla.
- Výpočtová vrstva poskytuje číselné údaje: zbývající postup v pipech, pravděpodobnost dosažení cíle hodem a pravděpodobnost ohrožení konkrétní figurky.
- Výpočty samy o sobě neurčují, který tah je dobrý. Neobsahují taktické váhy, bonusy za vyhození, ochranu figurek, flexibilitu ani adaptaci podle pořadí.
- Taktická vrstva je zatím prázdná. Nevyučená AI vybírá rovnoměrně z legálních tahů.
- Okamžitě vítězný tah má přednost, protože přímo ukončuje hru ve prospěch AI; nejde o naučenou taktiku.

## 2. Zachované výpočty

### Pravděpodobnost dosažení cíle

Pro vzdálenost (d) a možnost řetězení šestek:

[
P(d)=rac{1}{6^{lceil d/6ceil}}
]

Jde o základní výpočet pro přehled a budoucí učení. Skutečná pravděpodobnost konkrétního zásahu se počítá simulací přes herní engine, aby se zohlednily obsazené cíle, povinné nasazení a další aktivní pravidla.

### Zbývající postup

- Figurka na okruhu nebo v domečku: (max(0,L+3-q)).
- Figurka v základně: (L+3+6), kde 6 představuje nutný hod pro nasazení.
- Pokud jsou všechny figurky v základně, připočítá se matematický odhad čekání na šestku podle nastavení počtu pokusů.

Tyto hodnoty jsou pouze popisné. AI je zatím nepoužívá k řazení tahů.

### Ohrožení figurky

Pravděpodobnost zásahu se počítá přes `rollDice()`, `getValidMoves()` a `movePiece()`. Simulace nepřidává vlastní pravidla. Výsledek je údaj o možnosti zásahu, nikoliv automatický pokyn k útěku.

## 3. Co bylo z taktiky vypnuto

- pevné preference pro vyhození soupeře;
- automatické upřednostňování bezpečí;
- bonusy za počet aktivních figurek a flexibilitu;
- penalizace blokovaného startu;
- adaptivní ochota riskovat podle pořadí;
- bodové váhy obtížností easy / medium / hard;
- přednastavené slovní závěry typu „lepší kombinace postupu a bezpečí“.

Nastavení obtížnosti zatím nemění taktické rozhodování. Všichni AI hráči začínají bez taktické zkušenosti.

## 4. Výběr tahu bez zkušeností

1. Engine vrátí seznam legálních tahů.
2. AI ověří, zda některý z nich okamžitě vyhrává.
3. Pokud ano, provede vítězný tah.
4. Jinak vybere rovnoměrně jednu možnost ze seznamu.
5. Debug chat výslovně uvede, že AI zatím nemá naučenou taktiku.

## 5. Další fáze – výuka člověkem

Samostatná výuková vrstva bude ukládat pouze výslovné opravy od člověka. Každá zkušenost bude obsahovat:
- stav hry a aktivní pravidla;
- všechny legální možnosti;
- původní volbu AI;
- doporučený tah člověka;
- vysvětlení, proč byl původní tah špatný nebo proč je doporučený lepší.

AI nebude automaticky přepisovat své znalosti podle běžně odehraných partií ani podle her AI proti AI. Zkušenost se stane součástí taktiky až po výslovném lidském hodnocení. Při podobné situaci bude AI schopna zkušenost znovu vyhledat a zohlednit.

Ukládání výukových záznamů, jejich správa a rozhraní pro hodnocení tahů budou implementovány jako samostatný další krok. Tento základ zatím nic nemaže z databáze ani ze starých souborů na serveru.
