# Návrh nové strategické AI

## Platný směr

Dosavadní návrhy založené na 1000 konfiguračních hodnotách, devíti taktických vahách, neuronové síti a samostatných systémech lidské paměti se tímto dokumentem nahrazují. Cílem je jedna srozumitelná strategická AI postavená na **10 naučitelných vahách**.

Jde o cílový návrh, nikoli tvrzení, že je již implementovaný nebo natrénovaný.

## 10 naučitelných vah

Každá váha bude mít jeden jasně pojmenovaný strategický význam. Váhy budou přímo ovlivňovat hodnocení legálních kandidátních tahů.

Navržené strategické oblasti:

1. **Postup k cíli** – hodnota posunu figurky směrem k dokončení okruhu a cílovému domečku.
2. **Dokončení figurky** – priorita tahu, který bezpečně dovede figurku do cíle.
3. **Vyhození soupeře** – přínos tahu, kterým se soupeřova figurka vrátí do základny.
4. **Ochrana vlastních figurek** – hodnota snížení pravděpodobnosti, že soupeř figurku vyhodí.
5. **Taktické ohrožení soupeře** – hodnota pozice, ze které může AI v dalších tazích soupeře napadnout.
6. **Nasazení z vlastní základny** – strategická hodnota uvedení další figurky do hry.
7. **Postup v cílovém domečku** – hodnota bezpečného postupu v cílových polích a dokončení celé sestavy.
8. **Bonusový hod a pokračování** – hodnota situací, které umožňují další hod nebo navazující tah.
9. **Bezpečnost a riziko startovních polí** – vyhodnocení nebezpečí spojeného s pozicí na startovních polích soupeřů a s možností jejich nasazení.
10. **Strategická flexibilita** – hodnota zachování více užitečných možností pro další tahy místo krátkodobě výhodného, ale omezujícího rozhodnutí.

Konečná definice vstupního signálu každé váhy musí být měřitelná, jednotná a použitelná pro všechny podporované velikosti desky. Váhy nesmějí představovat stovky skrytých nebo duplicitních parametrů.

## Rozhodování a simulace

- AI nejprve získá legální možnosti výhradně z herního enginu. Nesmí vytvářet vlastní tahy ani měnit pravidla.
- Při rozhodování vyhodnotí všech šest možných výsledků kostky.
- Simulace bude pokračovat do dalších rozhodnutí a zohlední bonusové hody, zejména řetězení šestek.
- AI bude vyhodnocovat nejen bezprostřední výsledek tahu, ale také očekávaný stav po navazujících tazích.
- Při simulaci bude zohledňovat možné legální reakce soupeřů, včetně jejich pokusů o vyhození, nasazení a postupu do cíle.
- Výsledek simulací se převede na deset srozumitelných strategických signálů a jejich deset naučitelných vah.
- Vítězný tah, pokud existuje mezi legálními možnostmi, musí být vyhodnocen jako okamžitá výhra.

## Automatické učení

- AI se bude automaticky učit z výsledků dokončených partií.
- Trénink bude upravovat pouze deset definovaných vah.
- Učení bude vycházet z výsledků partií, nikoli z ručně vymyšlených cílových hodnot.
- Nová sada vah se nejprve vyhodnotí na oddělených partiích; bez ověření se nesmí automaticky považovat za lepší.
- Bude zachována možnost vrátit se k původní sadě vah.

## Vysvětlení každého rozhodnutí

U každého rozhodnutí se zaznamená:

- stav hry a hod kostkou,
- seznam legálních kandidátních tahů,
- všech deset použitých strategických hodnot,
- výsledek simulace dalších hodů a tahů,
- předpokládané reakce soupeřů,
- výsledné skóre kandidátů,
- vybraný tah a konkrétní důvody, proč dostal přednost.

Záznam musí umožnit zpětně vysvětlit, proč AI zvolila daný tah, a porovnat jej s ostatními legálními možnostmi.

## Turnajové porovnávání

- Nová AI se bude pravidelně porovnávat v turnajích s původní AI.
- Obě verze musí hrát za stejných podmínek, se stejnými pravidly a srovnatelnými sestavami hráčů.
- Testování musí zahrnovat podporované velikosti desek a různé počty hráčů.
- Výsledky turnajů rozhodnou, zda je nová sada vah skutečně lepší.
- Původní AI zůstane zachována jako srovnávací základna, dokud nová AI neprokáže zlepšení.

## Základní zásada

Strategie, simulace a učení mohou měnit pouze hodnocení a pořadí legálních tahů. Herní pravidla, generování legálních tahů a stav hry zůstávají odpovědností společného herního enginu.
