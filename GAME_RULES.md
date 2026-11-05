# Pravidla hry – Člověče, nezlob se!

> Stav dokumentu: pracovní specifikace. Potvrzená pravidla jsou oddělena od současného technického chování a od bodů, které musí rozhodnout autor hry. Nevyřešené body se nesmějí domýšlet ani jednostranně měnit v herním enginu.

## 1. Rozsah a závaznost

- Jedna společná sada pravidel platí pro lokální i online hru, s AI i bez AI.
- AI, typ hry ani způsob zobrazení (2D/3D) nesmějí měnit pravidla.
- Herní logika je nezávislá na vykreslování desky.
- Serverový PHP engine a lokální JavaScript engine musí pravidla vyhodnocovat shodně.
- Tento dokument popisuje pravidla hry. Geometrie a grafický vzhled desky jsou samostatná témata.

## 2. Hráči a figurky

- Hraje 2 až 8 hráčů.
- Každý hráč má vlastní startovní pozici a vlastní domeček/cílovou dráhu.
- Každý hráč má 4 figurky.
- Hráči mají pevné pořadí. Vítěz rozstřelu získá první tah, ale pořadí ostatních hráčů se nepřeskupuje.

## 3. Deska a dráha

### Potvrzené varianty

- Jediné povolené logické délky hlavního okruhu jsou 40, 48 a 80 polí. Žádné jiné délky nejsou povolené; neexistuje výchozí ani záložní varianta mimo tyto tři hodnoty.
- Deska 40 má 4 možné hráčské pozice.
- Deska 48 má 6 možných hráčských pozic.
- Deska 80 má 8 možných hráčských pozic.
- Dostupnost podle počtu hráčů:
  - 2–4 hráči: 40, 48 nebo 80 polí.
  - 5–6 hráčů: 48 nebo 80 polí.
  - 7–8 hráčů: pouze 80 polí.
- Neobsazené pozice zůstávají součástí geometrie desky, ale nemají hráče ani figurky.
- Startovní domečky jsou mimo hlavní okruh.
- Každý hráč má vlastní čtyřpolíčkovou cílovou dráhu označenou D1 až D4.

### Pohyb po okruhu

- Hráčova figurka postupuje po hlavním okruhu ve směru daném pořadím polí na desce.
- Každá figurka smí absolvovat hlavní okruh pouze jednou.
- Po posledním poli hlavního okruhu následuje přímo vlastní D1. Pole 1 se při vstupu do domečku nesmí započítat podruhé.
- Pro desku 40 tedy posloupnost po poli 40 pokračuje na D1, nikoliv znovu na pole 1.
- Po vstupu na D1 pokračuje figurka přes D2 a D3 na D4.

## 4. Určení začínajícího hráče – rozstřel

- Na začátku nové hry proběhne rozstřel hodem kostkou.
- Každý živý hráč hází ručně kliknutím na kostku, až na něj přijde řada.
- AI hází automaticky pouze tehdy, když je na řadě.
- Všichni hráči házejí v prvním kole rozstřelu.
- Pokud dosáhne nejvyššího výsledku více hráčů, házejí znovu pouze tito hráči.
- Rozstřel se opakuje, dokud nezůstane jediný vítěz.
- Vítěz rozstřelu začíná běžnou hru. Pořadí hráčů se nemění.
- Průběh rozstřelu se v herním logu zobrazuje a ukládá jako jediný průběžně aktualizovaný řádek; jednotlivé hody nevytvářejí samostatné řádky.
- Server odmítne hod hráče, který není právě na řadě, opakovaný hod i běžný tah před dokončením rozstřelu.

## 5. Nasazení figurek a šestka

- Figurka v základně může být nasazena na vlastní startovní pole pouze při hodu 6.
- Pokud má hráč při hodu 6 alespoň jednu figurku v základně, musí jednu z nich nasadit. Nemůže místo toho táhnout jinou figurkou.
- Pokud je vlastní startovní pole obsazeno vlastní figurkou, tato dosavadní figurka se vrátí do základny a nově nasazovaná figurka obsadí startovní pole. Jde o jedinou situaci, ve které hráč smí vyhodit vlastní figurku.
- Pokud je vlastní startovní pole obsazeno soupeřovou figurkou, soupeřova figurka se vrátí do své základny.
- Nasazení spotřebuje celý hod 6; nasazená figurka se při tomto tahu neposouvá o dalších šest polí.
- Za šestku při nasazení získá hráč další hod. S číslem z tohoto nového hodu může pohnout libovolnou svou figurkou na desce, včetně právě nasazené.
- Pokud po bonusovém hodu nemá žádná jiná jeho figurka než právě nasazená legální tah, musí pohnout právě nasazenou figurkou. Pokud ani ta nemá legální tah, uplatní se pravidla pro šestku bez legálního tahu.
- Pokud jsou všechny čtyři figurky hráče v základně, má hráč nejvýše tři pokusy získat šestku. Nezíská-li ji ani při třetím pokusu, tah končí.
- Jakmile hráč získá šestku a nasadí figurku, další hod už je běžným bonusovým hodem; pravidlo tří pokusů se tímto nasazením ukončí.
- Výhoda tří pokusů se obnoví, jakmile jsou všechny čtyři figurky znovu v základně.

## 6. Pohyb a obsazování polí

- Hod kostkou určuje počet polí, o který se zvolená figurka posune.
- Vlastní figurky na hlavním okruhu lze přeskočit, ale tah nesmí skončit na poli obsazeném vlastní figurkou.
- Soupeřovy figurky na hlavním okruhu pohyb neblokují; pokud tah skončí na jejich poli, jsou vyhozeny do základny.
- Na cílovou dráhu vstupuje figurka po dokončení jednoho průchodu hlavním okruhem.
- Do cílové dráhy je nutné vstoupit přesným hodem. Pokud by tah skončil za D4, takový tah není možný.
- V cílové dráze se vlastní figurky nesmějí přeskakovat. Každé pole v pořadí D1 až D4 musí být při průchodu volné; figurka nesmí přeskočit vlastní figurku ani ukončit tah na obsazeném poli.
- Pokud hozené číslo umožňuje některé figurce na hlavním okruhu přesný a volný vstup do cílové dráhy, hráč musí provést právě tento vstup. Nesmí místo něj táhnout jinou figurkou.
- Povinnost vstoupit do cílové dráhy se neuplatní, pokud je vstup zablokovaný vlastní figurkou nebo pokud přesný vstup žádné figurce neumožňuje aktuální hod.

## 7. Vyhazování

- Startovní pole není chráněné před vyhozením.
- Pokud figurka vstoupí běžným pohybem na pole obsazené soupeřovou figurkou na hlavním okruhu, soupeřova figurka se vrátí do své základny.
- Běžným pohybem nelze vyhodit vlastní figurku; na pole obsazené vlastní figurkou nelze ukončit tah.
- Jediný způsob, jak může hráč vyhodit vlastní figurku, je povinné nasazení jiné figurky ze základny na vlastní startovní pole při hodu 6. Dosavadní vlastní figurka na tomto poli se vrátí do základny.
- Vyhození při nasazení se vztahuje také na soupeřovu figurku, pokud stojí na vlastním startovním poli.
- Vyhozená figurka začíná znovu od základny a pro její nasazení je potřeba šestka.

## 8. Cílová dráha a vítězství

- Každý hráč má čtyři samostatná cílová pole D1 až D4.
- Dvě vlastní figurky nesmějí stát na stejném cílovém poli.
- V cílové dráze se figurky nesmějí přeskakovat; cesta k cílovému poli musí být volná.
- Přesný dojezd na volné cílové pole je povinný.
- Hráč vyhrává, když všechny čtyři jeho figurky obsadí čtyři různá cílová pole D1–D4.

## 9. Další hod, řetězení šestek a konec tahu

- Každá hozená šestka dává hráči právo na další hod po vyhodnocení tahu nebo nasazení.
- Počet po sobě jdoucích šestek není omezen. Po každé šestce hráč provede příslušnou akci a znovu hází.
- Pokud hráč hodí 6, ale nemá žádný legální tah ani možnost povinného nasazení, tah s touto šestkou propadá, ale hráč přesto hází znovu.
- Pokud hráč hodí 1 až 5 a nemá žádný legální tah, jeho tah končí a pokračuje další hráč.
- Po nasazení za šestku následuje bonusový hod. Číslo z bonusového hodu se použije k běžnému pohybu libovolnou vlastní figurkou s legálním tahem; právě nasazená figurka není automaticky upřednostněna.
- Pokud je jedinou figurkou s legálním tahem právě nasazená figurka, hráč musí táhnout jí.
- Pokud hráč dokončí všechny čtyři figurky v domečku, hra okamžitě končí.

## 10. Otevřené otázky

Před implementací je nutné vyřešit pouze následující okrajové případy:

1. **Bezpečná pole:** Jsou všechna pole hlavního okruhu běžná a lze na každém vyhodit soupeře, nebo existují další chráněná pole?
2. **Více soupeřových figurek na jednom poli:** Pokud by na stejném poli stály figurky více soupeřů, vyhodí příchozí figurka všechny, jen jednu, nebo na takové pole nesmí vstoupit?
3. **Tři pokusy při všech figurkách v základně:** Zůstává zachováno pravidlo nejvýše tří pokusů o šestku, pokud jsou všechny čtyři figurky v základně?

## 11. Rozdíly mezi specifikací a současnou implementací

- Lokální i serverový engine smějí vytvořit pouze desku s délkou 40, 48 nebo 80 polí.
- Pokud volající velikost desky výslovně nepředá, použije se první dostupná velikost pro daný počet hráčů: 40 pro 2–4 hráče, 48 pro 5–6 hráčů a 80 pro 7–8 hráčů.
- Zpětná kompatibilita nesmí vytvářet ani vybírat žádnou nepodporovanou délku.
- Tento dokument je jediným zdrojem herních pravidel. README na něj pouze odkazuje.

## 13. Režimy animace hrací kostky

Rychlost animace kostky se řídí stejným přepínačem Normální / Rychlá jako pohyb figurek. Výsledek hodu ani herní pravidla se nemění.

- **Normální:** kostka se viditelně roztočí a zastaví na hozené hodnotě. Animace trvá přibližně 1,5 sekundy.
- **Rychlá:** kostka se neroztáčí; ihned se zobrazí v konečné poloze se správnou hozenou hodnotou.
- Rychlý režim se vztahuje na běžné hody i rozstřel.
- Globální vypnutí animací může zobrazení animované kostky vypnout bez ohledu na zvolený režim.

## 12. Režimy pohybu figurek

Nastavení rychlosti se vztahuje výhradně na animaci pohybu figurek. Nesmí měnit rychlost hodu kostkou, prodlevy AI, délku zobrazení vyhození ani jiné časování hry.

- **Normální:** každá figurka se při tahu viditelně přesouvá postupně z jednoho políčka na další. Platí to stejně pro lidské hráče i AI.
- **Rychlá:** animace mezilehlých políček se přeskočí a figurka se zobrazí rovnou na cílovém políčku.
- Pravidla pohybu, vyhodnocení tahu a cílová pozice jsou v obou režimech totožné.
- Animace se používá pro 2D i 3D zobrazení; režim zobrazení nesmí měnit její pravidla.
- Globální vypnutí animací může pohybovou animaci vypnout bez ohledu na zvolený režim.

