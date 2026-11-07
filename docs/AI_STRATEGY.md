# Strategie počítačové AI – Člověče, nezlob se!

**Stav:** pipový strategický model implementovaný pro místní hru  
**Implementace:** `js/ai-strategy.js`  
**Napojení:** `js/game-engine.js`, `js/game-turn.js`, `js/app.js`  
**Testy:** `tests/ai-strategy.test.mjs`

Herní pravidla a legálnost tahů určuje výhradně `docs/GAME_RULES.md` a `js/game-engine.js`. AI nesmí pravidla obcházet ani si vytvářet vlastní legální tahy.

## 1. Základní principy

- AI vybírá výhradně z tahů vrácených `getValidMoves()`.
- Každý kandidátní tah simuluje na kopii stavu pomocí `movePiece()`.
- Pravděpodobnostní simulace používá `rollDice()`, `getValidMoves()` a `movePiece()` z enginu. Neimplementuje vlastní pravidla nasazení, domečku, bonusových hodů ani trestů.
- AI nezná budoucí výsledky kostky a nikdy si je nevybírá.
- Okamžitá výhra má absolutní prioritu.
- Při shodném skóre rozhoduje nižší ID figurky, takže je výběr reprodukovatelný.
- Algoritmus je nezávislý na délce trasy: používá `game.trackLength` a podporuje desky 40, 48 i 80 polí.
- Tato implementace řídí místní počítačové hráče. Serverový PHP engine a pravidla online hry se tím nemění.

## 2. Jednotná hodnota pozice – pipy

Všechny strategické výhody a ztráty se převádějí na společnou jednotku – pipy, tedy odhad zbývajícího postupu do vítězství.

Pro délku okruhu (L):

- Figurku na hlavní trase s postupem (q) stojí zbývající cesta (R=L+3-q).
- Figurku v domečku na pozici D1–D4 stojí (R=L+3-q); D4 má hodnotu 0.
- Figurka v základně má hodnotu (R=L+3+6). Šestka potřebná k nasazení je započítána jako spotřebovaný postup.
- Čekání na šestku se přičítá pouze jednou na úrovni hráče, a jen pokud jsou všechny čtyři figurky v základně.

### Čekání na šestku

Pokud má hráč všechny figurky v základně, pravděpodobnost získání šestky během jednoho tahu je:

[
p_{exit}=1-(5/6)^K
]

K je 3 při zapnutém pravidle tří pokusů a 1 při vypnutém pravidle.

Čekání se převádí na pipy odhadem:

[
C_{wait}=4{,}2cdot(1/p_{exit}-1)
]

Hodnota 4,2 je očekávaný součet hodnot kostky v tahu s neomezeným řetězením šestek, pokud nejsou uplatněna omezení legálních tahů. Převod čekání na pipy je modelový odhad, ne přesná délka partie.

### Flexibilita a blokovaný start

K pipům se přidávají malé heuristické korekce:

| Aktivní figurky na hlavní trase | Flexibilita (pipy) |
|---:|---:|
| 0 | −1,5 |
| 1 | 0 |
| 2 | +1,5 |
| 3 | +2,2 |
| 4 | +2,5 |

Flexibilita se od pipů odečítá, protože více aktivních figurek obvykle nabízí více možností. Pokud hráč musí nasazovat a jeho vlastní figurka blokuje start, přičte se penalizace 2 pipy.

Tyto hodnoty jsou heuristiky určené k pozdějšímu ladění self-play testy.

## 3. Hodnota vyhození

Při vyhození figurky z hlavní trasy se její zbývající hodnota změní na cenu figurky v základně.

Přírůstek pipů soupeře je:

[
V_{hit}=q+6+C_{wait}
]

- q je dosavadní postup vyhozené figurky.
- 6 je cena jejího opětovného nasazení.
- Čekání (C_{wait}) se přičte pouze tehdy, pokud vyhození vrátí do základny poslední aktivní figurku a po vyhození budou všechny čtyři figurky v základně.

Vyhození soupeře, který postoupil daleko, má tedy vyšší hodnotu než vyhození figurky těsně po nasazení. Hodnota se automaticky přepočítává podle délky desky a stavu hráče.

## 4. Riziko vyhození vlastních figurek

Pro každou vlastní figurku na hlavním okruhu AI odhaduje pravděpodobnost, že ji soupeři mohou vyhodit během svých příštích tahů.

### Simulace jednoho soupeřova tahu

1. Vytvoří se kopie aktuálního stavu a nastaví se tah zkoumaného soupeře.
2. Pro každou možnou hodnotu kostky 1–6 se zavolá skutečný `rollDice()`.
3. Legální pokračování se získají z `getValidMoves()`.
4. Každá možnost se simuluje přes `movePiece()`.
5. Pokud některá možnost vyhodí sledovanou figurku, větev má pravděpodobnost zásahu 1.
6. Pokud šestka ponechá tah stejnému hráči, pokračuje se dalším uzlem. Soupeř si může vybrat libovolný legální tah; model zvolí ten, který maximalizuje šanci zasáhnout sledovaný cíl.
7. Pravděpodobnosti všech výsledků kostky se váží hodnotou 1/6.

Tím se respektují skutečné důsledky pravidel: povinné nasazení, tři pokusy o šestku, opakované šestky, povinný vstup do domečku, blokování vlastních figurek i volitelné pravidlo tří šestek.

Simulace pokračuje nejvýše přes tři navazující bonusové hody. Zbytek pravděpodobnostního stromu se ořízne; maximální pravděpodobnost vynechaného pokračování je 1/1296 na tah soupeře.

### Model soupeře a přesnost

- Pro jednoho soupeře jde o přesný výpočet pravděpodobnosti v prohledané hloubce za předpokladu, že soupeř se snaží maximalizovat zásah sledované figurky.
- Tento předpoklad je konzervativní: neznamená, že soupeř bude v reálné hře vždy volit právě tento tah.
- U více soupeřů se jejich odhady spojí horní mezí – součtem omezeným na 1. Je to konzervativní aproximace, protože tahy soupeřů mění společný stav a nejsou nezávislé.
- Při hodnocení pozice se u vlastních figurek počítá hrozba od všech soupeřů. U soupeřových figurek se započítává hrozba od aktuální AI; vzájemné hrozby mezi ostatními soupeři se vynechávají, protože nejsou přímým důsledkem jejího tahu. Tím se zároveň omezuje výpočetní náročnost při 8 hráčích.
- Model nepředstírá, že jde o přesnou pravděpodobnost celé budoucí partie.

### Očekávaná ztráta

Pro každou ohroženou figurku:

[
Loss_i=P(hit_i)cdot V_{hit,i}
]

Očekávané ztráty figurek hráče se sečtou a přičtou k jeho efektivním pipům. Figurka v domečku ani figurka v základně není běžným pohybem po hlavní trase ohrožena.

## 5. Převod pozice na modelové skóre výhry

Pro každého hráče se spočítají:

- surové pipy,
- očekávaná ztráta z ohrožených figurek,
- efektivní pipy po započtení rizika.

Efektivní pipy:

[
\widetilde P_i=P_i+RiskLoss_i
]

Pro porovnání více hráčů se používá stabilní softmax:

[
W_i=\frac{e^{-(\widetilde P_i-P_{min})/\tau}}
{\sum_j e^{-(\widetilde P_j-P_{min})/\tau}}
]

[
\tau=\max(8,1{,}24\cdot\sqrt{\overline P})
]

W je relativní modelové skóre pozice, nikoli ověřená skutečná pravděpodobnost vítězství. Parametr tau je počáteční aproximace a musí se později kalibrovat na výsledcích velkého počtu her.

AI vybere tah s nejvyšším W. Vyhození, dokončení figurky, nasazení i únik před hrozbou tak soutěží ve stejné hodnoticí funkci. Neexistuje pevné pravidlo „vždy vyhoď“ nebo „vždy jdi do domečku“.

## 6. Obtížnosti

### Lehká – `easy`

- Používá pipový model a engine-based odhad hrozeb.
- Riziko vlastních figurek má váhu 0,55.
- Neprovádí simulaci bonusového pokračování.
- Tahy jsou stále legální a deterministické; lehčí obtížnost neznamená úmyslné porušování pravidel.

### Střední – `medium` (výchozí)

- Používá plnou váhu rizika 1,0.
- Porovnává všechny legální tahy podle efektivních pipů a modelového skóre výhry.
- Zohledňuje cenu vyhození, čekání na šestku, flexibilitu a blokovaný start.

### Těžká – `hard`

- Používá váhu rizika 1,1.
- Pokud šestka ponechá tah stejnému hráči, simuluje další hody přes skutečný engine.
- V každém uzlu vyhodnotí všechny legální tahy a vybere nejlepší pokračování.
- Simulace pokračování má hloubku nejvýše dvou dalších hodových úrovní. Koncové stavy se vyhodnocují levnějším pipovým modelem bez opakovaného výpočtu všech hrozeb.
- Výsledné skóre kombinuje 65 % rizikově upravené pozice a 35 % očekávaného výsledku bonusového pokračování.

Těžká úroveň tedy nezná budoucí hody; počítá jejich očekávaný výsledek.

## 7. Adaptivní ochota riskovat

AI upravuje váhu rizika podle relativního pořadí hráče v pipovém závodu:

- Pokud má AI nižší pipový odhad než soupeři, tedy je vpředu, zvyšuje váhu rizika vlastních figurek.
- Pokud zaostává, snižuje tuto váhu a přijímá větší riziko ve snaze zlepšit šanci na vítězství.
- Při vyrovnané pozici zůstává původní váha obtížnosti.
- Korekce je omezena na násobek 0,8 až 1,2, aby změna pořadí nepřevážila ostatní strategické faktory.

Úprava se týká pouze rizika vlastních figurek AI. Ohrožení soupeřů se nadále hodnotí plnou vahou, aby ochota AI riskovat neoslabovala její schopnost využít soupeřovy chyby. Rozhodnutí se počítá z pipů po provedení kandidátního tahu.

Jde o heuristiku, nikoli o předpověď skutečné pravděpodobnosti výhry. Její přínos se musí ověřit turnaji AI proti AI.

## 8. Vysvětlování rozhodnutí

`chooseStrategicDecision()` vrací kromě ID figurky také:

- modelové skóre vybraného tahu,
- očekávanou ztrátu vlastních figurek,
- hodnotu vyhozené soupeřovy figurky,
- surové a efektivní pipy,
- očekávané skóre bonusového pokračování,
- skóre a základní rozklad alternativních tahů.

V režimu `?debug=1` se hlavní důvody zapisují do herního chatu jako samostatná zpráva **AI rozhodování**. Text se generuje z vypočtených hodnot; nesmí tvrdit, že AI zvažovala faktor, který ve skóre nebyl.

## 9. Technická architektura

- `js/ai-strategy.js`: pipový model, pravděpodobnostní simulace hrozeb, vyhodnocení pozic, obtížnosti a vysvětlení.
- `js/game-engine.js`: poskytuje AI závislosti `getValidMoves`, `getPiecePosition`, `movePiece` a `rollDice`; pravidla zůstávají v enginu.
- `js/game-turn.js`: vybere tah a v debug režimu zapíše vysvětlení.
- `js/app.js`: předává rozhodování do tahového automatu.
- `tests/ai-strategy.test.mjs`: regresní testy pravděpodobností, simulace pravidel, pipů, legálních tahů a vysvětlení.

## 10. Testovací požadavky

Testy musí ověřovat zejména:

- základní pravděpodobnost pevné cesty: vzdálenost 4 = 1/6, vzdálenost 20 = 1/1296,
- engine-based simulaci bonusových šestek,
- blokované mezilehlé pole,
- respektování pravidel nasazení, tří pokusů a trestu za tři šestky,
- cenu čekání při jednom a třech pokusech o šestku,
- podporu desek 40, 48 a 80 bez pevně zakódované délky,
- adaptaci rizika: vedoucí AI je opatrnější, zaostávající AI přijímá větší riziko a při shodě zůstává neutrální,
- výběr výhradně legálního tahu,
- absolutní prioritu okamžité výhry,
- povinný vstup do domečku,
- deterministické rozhodnutí a rozklad skóre.

## 11. Známá omezení a další ladění

- Pipový převod, flexibilita, penalizace blokovaného startu, váhy obtížností a softmax jsou heuristiky.
- Model více soupeřů používá konzervativní horní mez a nepřepočítává celý společný stav po každém soupeřově tahu.
- Těžká úroveň simuluje bonusové pokračování, nikoli kompletní minimax celé partie.
- Pro další posílení je vhodné spustit automatické turnaje AI proti AI na deskách 40/48/80 a při 2–8 hráčích. Z výsledků kalibrovat parametry self-play, měřit Elo a porovnávat míru vítězství.
- Monte Carlo rollouty a plná simulace celých kol se mají přidávat až po změření rychlosti na mobilních zařízeních. Nesmí způsobit prodlevy v běžném tahu.
