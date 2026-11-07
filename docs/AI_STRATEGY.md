# Strategie počítačové AI – Člověče, nezlob se!

**Stav:** implementováno pro místní hru  
**Implementace:** `js/ai-strategy.js`  
**Napojení:** `js/game-engine.js`, `js/player-setup.js`, `js/app.js`  
**Testy:** `tests/ai-strategy.test.mjs`

Tento dokument popisuje rozhodování lokální počítačové AI. Herní pravidla a legálnost tahů nadále určuje `GAME_RULES.md` a `js/game-engine.js`. AI nesmí pravidla obcházet.

## 1. Zásady

- AI vybírá pouze tah z množiny vrácené `getValidMoves()`.
- Samotný tah provádí výhradně `movePiece()`; AI nemění pravidla ani stav hry ručně.
- AI nezná budoucí hody kostkou a nesmí si vybírat výsledek hodu.
- Každá úroveň používá stejnou sadu legálních tahů; obtížnost mění kvalitu vyhodnocení, nikoli pravidla nebo pravděpodobnost kostky.
- Rozhodování probíhá pro každou figurku samostatně a následně se porovnají výsledky všech legálních možností.
- Při shodném skóre se zvolí figurka s nižším ID, aby byl výsledek reprodukovatelný.

## 2. Vyhodnocované faktory

1. **Vítězství:** tah, který okamžitě ukončí hru výhrou, má absolutní prioritu.
2. **Dokončení figurky:** vstup na poslední cílové pole je velmi hodnotný.
3. **Vyhození soupeře:** hodnota závisí také na tom, jak daleko soupeř s vyhozenou figurkou postoupil. Ztráta dlouhého postupu je cennější než vyhození figurky, která právě opustila základnu.
4. **Postup vlastní figurky:** zohledňuje počet polí a vstup do domečku.
5. **Nasazení:** nasazení další figurky má přínos zejména tehdy, když AI dosud nemá žádnou aktivní figurku.
6. **Ohrožení vlastních figurek:** AI odhaduje pravděpodobnost, že soupeř v některém následujícím tahu figurku vyhodí, a násobí ji hodnotou ohrožené figurky.
7. **Budoucí pokračování:** těžká AI navíc vyhodnocuje očekávanou hodnotu dalšího hodu, pokud šestka ponechává tah stejnému hráči.

## 3. Pravděpodobnost zásahu kostkou

Pro konkrétní soupeřovu figurku na stejné hlavní dráze se určí počet kroků vpřed k cílové figurce. Při běžné šestistěnné kostce a pravidle, že šestka dává další hod, platí:

| Vzdálenost | Potřebné hody | Pravděpodobnost |
|---:|---:|---:|
| 1–6 polí | jeden přesný hod | 1/6 = 16,67 % |
| 7–12 polí | šestka + přesný další hod | 1/36 = 2,78 % |
| 13–18 polí | dvě šestky + přesný další hod | 1/216 = 0,463 % |
| 19–24 polí | tři šestky + přesný další hod | 1/1296 = 0,077 % |
| 25–30 polí | čtyři šestky + přesný další hod | 1/7776 = 0,0129 % |

Obecný model pro kladnou vzdálenost (d):

[
P(d)=\frac{1}{6^{\lceil d/6 \rceil}}
]

Tento model předpokládá, že každá mezilehlá šestka umožní pokračovat stejnou figurkou. Výpočet dále kontroluje, zda figurka před cílem nevstoupí do vlastního domečku a zda její vlastní figurky neblokují mezilehlá místa po šestkách ani cílové pole.

### Více soupeřových figurek a hráčů

- U více figurek jednoho soupeře se odhady spojí jako pravděpodobnost alespoň jednoho zásahu: (1-\prod(1-p_i)).
- Pravděpodobnosti přežití jednotlivých soupeřů se násobí; výsledkem je odhad rizika od všech soupeřů před dalším kolem.
- Dokončení hry soupeřem a figurky v domečku se do útoku nezapočítávají.
- Pokud je figurka v základně nebo v domečku, nemůže být běžným pohybem po hlavním okruhu zasažena.

**Omezení modelu:** u více útočných figurek mohou jejich možnosti sdílet stejné hody a bonusové hody. Výpočet sjednocení je proto praktický odhad, nikoli úplný enumerátor všech společných tahových stromů. Blokace se posuzují podle aktuálního stavu; model nepředpovídá, že soupeř nejprve jinou figurkou uvolní cestu.

## 4. Hodnocení rizika

Ohrožená vlastní figurka má vyšší hodnotu, pokud už urazila velkou část okruhu. Základní hodnota figurky roste s postupem:

[
V=24+46\cdot\frac{\text{postup}}{\text{délka okruhu}}
]

Očekávaná ztráta se počítá jako součet pravděpodobností zásahu krát hodnota každé vlastní figurky. Výsledek se odečte od skóre kandidátního tahu podle obtížnosti.

## 5. Obtížnosti

### Lehká – `easy`

- Vyhodnocuje okamžitý postup, nasazení, dokončení a vyhození.
- Riziko vyhození zohledňuje jen mírně.
- Nepočítá očekávané pokračování po bonusové šestce.
- Je vhodná pro začátečníky.

### Střední – `medium` (výchozí)

- Používá okamžité taktické hodnocení.
- Počítá pravděpodobnost ohrožení vlastních figurek podle vzdálenosti soupeřů, řetězení šestek a aktuálních blokací.
- Zohledňuje hodnotu postupu, který soupeř ztratí vyhozením.
- Je určena pro běžnou hru.

### Těžká – `hard`

- Používá stejné pravděpodobnostní vyhodnocení s vyšší vahou rizika.
- Při bonusové šestce vypočítá očekávanou hodnotu nejlepšího legálního pokračování pro všech šest možných hodnot dalšího hodu.
- Při každé volbě znovu vyhodnotí aktuální stav; neplánuje tahy na základě neznámých budoucích výsledků kostky.
- Je nejsilnější dostupná úroveň. Nejde o dokonalý úplný minimax všech možných herních stavů.

## 6. Pravidla a rozšířená pravidla

- AI respektuje povinnost nasadit, povinnost vstoupit do domečku, přeskakování figurek a počet pokusů o šestku podle nastavení konkrétní hry.
- Pokud je zapnutá povinnost vstoupit do domečku a engine odstraní ostatní tahy z nabídky, AI nesmí zvolit vyhození místo povinného vstupu.
- Pokud je povinnost vstupu vypnutá, AI může porovnat vstup do domečku s vyhozením nebo jiným legálním tahem.
- AI nikdy nepřidává nelegální tah do nabídky.

## 7. Nastavení

Obtížnost se vybírá při vytváření místní hry: **Lehká**, **Střední** nebo **Těžká**.

Volba se uloží do stavu konkrétní hry jako `game.aiDifficulty`. Pokud není uvedena, použije se `medium`. Všichni AI hráči v jedné místní hře používají zvolenou obtížnost. Živých hráčů se nastavení netýká.

## 8. Technická architektura

- `js/ai-strategy.js`: pravděpodobnosti, odhad ohrožení, hodnocení kandidátů a výběr tahu.
- `js/game-engine.js`: předání legálních tahů, simulace kandidáta a kontrola pravidel.
- `js/player-setup.js`: výběr obtížnosti při založení hry.
- `screens/player-selection.php` a `css/components-player-selection.css`: ovládací prvek obtížnosti.
- `js/app.js`: předání konfigurace do nového stavu hry.
- `js/game-turn.js`: volá `chooseAIMove()` ve chvíli, kdy je na tahu AI.
- `tests/ai-strategy.test.mjs`: regresní testy pravděpodobností a rozhodování.

## 9. Testovací požadavky

- Pravděpodobnost vzdálenosti 4 je 1/6.
- Pravděpodobnost vzdálenosti 20 je 1/1296, nikoli nula.
- Vzdálenost přesahující zbývající hlavní okruh útočící figurky nepředstavuje zásah.
- Blokovaná mezilehlá pozice po šestce znemožní modelovaný útok touto figurkou.
- AI vybírá pouze legální tah.
- Vítězný tah má přednost.
- Lehká, střední a těžká obtížnost lze zvolit a uložit do stavu hry.

## 10. Budoucí rozšíření

Možné další zlepšení je úplná enumerace všech tahových posloupností soupeřů, včetně volby figurky po každém hodu, společného rozdělení pravděpodobností, blokování a více kol dopředu. Takový model musí zůstat výpočetně omezený, aby hra nezpomalovala zejména na mobilních telefonech.


## 11. Vysvětlení rozhodnutí v debug režimu

- Při otevření hry s parametrem `?debug=1` zapisuje AI do herního chatu samostatné zprávy od odesílatele **AI rozhodování**.
- Zpráva vysvětluje hlavní důvod vybraného tahu: dokončení figurky v domečku, vyhození soupeře, nasazení další figurky, pokračování právě nasazenou figurkou nebo omezení rizika.
- Pokud existuje alternativa s vyhozením soupeře, vysvětlení může uvést, proč AI zvolila bezpečnější postup nebo dokončení figurky.
- Při jediném legálním tahu AI oznámí, že nemá jinou možnost.
- V běžném režimu bez `?debug=1` se rozhodovací komentáře nezobrazují.
- Rozhodovací text je pouze diagnostický. Nemění skóre, legální tahy ani pravidla hry.
