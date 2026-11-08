# Průběžné učení AI – společná architektura

Tento dokument popisuje požadované chování AI napříč místní hrou, online hrou a GitHub tréninkem. Pravidla hry zůstávají výhradně v [GAME_RULES.md](GAME_RULES.md); AI pouze vyhodnocuje tahy, které povolí příslušný herní engine.

## Základní princip

- Model začíná se 1 000 pevnými vstupy: 44 základních vlastností, 946 párových interakcí a 10 vybraných trojitých interakcí.
- Dynamické taktické parametry vznikají za běhu z dosud neznámých kombinací základních vlastností. Dostávají ID od 1001; počet není omezen na 1 000 (implementační limit je 50 000).
- Nový parametr se přidá do modelu před vyhodnocením volby tahu, takže se může zapojit už v rozhodnutí, při kterém byl objeven.
- Každé rozhodnutí AI je samostatný učicí vzorek. MCTS poskytuje cílové rozdělení mezi legálními tahy; model se aktualizuje po každém rozhodnutí, nikoli až po skončení partie.
- Model vyhodnocuje celý stav: figurky v základně, na okruhu a v domečku, vzdálenosti k cíli, soupeřům a jejich hrozbám, možnost vyhazování, bonusové hody, závod o vítězství, fázi hry, velikost desky, počet hráčů a aktivní pravidla.
- Herní engine zůstává jedinou autoritou pro legální tahy, přechody a následky. AI nesmí sama vytvářet ani měnit pravidla.

## Pravidla a nastavení

Trénink musí kombinovat všechny podporované profily pravidel, nikoli pouze výchozí nastavení. Aktuální model obsahuje samostatné signály pro:
- tři pokusy o šestku;
- povinné nasazení;
- přeskakování figurek v domečku;
- povinný vstup do domečku;
- trest za tři šestky za sebou.

Pět booleovských přepínačů tvoří 32 kombinací. Tréninkový self-play musí tyto profily střídat a zahrnout desky 40/48/80 a sestavy 2–8 hráčů. Každý vzorek musí obsahovat skutečné nastavení partie, nikoliv pouze implicitní výchozí hodnoty.

Některá rozšíření jsou podle GAME_RULES.md zatím dostupná pouze v místní hře. Online engine je nesmí předstírat ani aplikovat, dokud nedostane odpovídající implementaci pravidel. Online AI proto používá online výchozí hodnoty těchto voleb. Pokud online stav obsahuje explicitní objekt `rules`, extrakce vlastností přečte skutečné hodnoty; jinak použije výchozí online profil.

## Učení v jednotlivých režimech

### Místní hra
- AI načítá model zařízení z úložiště prohlížeče.
- Po každém tahu aktualizuje váhy a dynamické parametry a uloží model.
- Výpis učení může uvádět počet rozhodnutí, nové parametry, změněné váhy a vliv naučené politiky.

### Online hra
- AI načítá a aktualizuje globální model v MySQL tabulce `ai_learning_model`.
- Zápis je chráněn databázovou transakcí / zámkem řádku, aby souběžné partie nepřepisovaly změny.
- Serverový engine je autoritou pro online legální tahy.

### GitHub self-play trénink
- Trénink používá stejný formát modelu `clovece-search-policy` v3.
- Každé rozhodnutí ukládá stav, legální možnosti, jejich vlastnosti, MCTS cíle a výsledek.
- Kandidát se nesmí stát produkčním modelem bez validace proti šampionovi.
- Export sdíleného modelu obsahuje pouze ověřeného šampiona.

## Navazující 30minutové běhy GitHub Actions

Workflow **AI search-guided training** používá samostatné běhy, každý s limitem 30 minut. Trénovací výpočet má limit 22 minut, aby zbyl čas na testy, kontrolu, checkpoint, archivaci a spuštění dalšího běhu.

- Ruční spuštění má výchozí řetězec 100 běhů (`chain_runs=100`); rozsah je 1–100.
- Na konci běhu se nejprve uloží kompletní checkpoint a archiv na SFTP.
- Teprve po úspěšné archivaci se spustí nový YAML přes `workflow_dispatch`, který obnoví předchozí archiv a ověří jeho manifest.
- Další běh pokračuje z uloženého modelu, generace, rozhodnutí a statistik; nezačíná od nuly.
- Pokud selže trénink, validace nebo archivace, automatické řetězení se zastaví.
- Každý běh je samostatná GitHub Actions exekuce. Sto běhů může dát přibližně 50 hodin výpočtu bez jediného 110minutového jobu.

## Důležitý stav integrace – neplést formát s jedním úložištěm

Společný formát JSON a export šampiona jsou připravené, ale všechny tři režimy zatím **nepoužívají jedno fyzické živé úložiště**:
- místní hra má model v localStorage konkrétního zařízení;
- online hra má model v MySQL na hostingu;
- GitHub trénink má checkpointy a zkušenosti v SFTP archivu a GitHub Actions artefaktech.

To znamená, že samotná shoda formátu ještě nezaručuje, že se každý místní tah okamžitě projeví v online modelu a naopak. Úplné sjednocení vyžaduje bezpečné načítání a slučování verzí mezi těmito úložišti, ochranu proti přepsání novějšího modelu a napojení GitHub tréninku na stejný sdílený zdroj zkušeností. Produkční model se nesmí automaticky nahradit neověřeným kandidátem.

## Příklad taktického rozhodnutí

Pokud AI hodí šestku, má volitelnou možnost nasazení a zároveň figurku blízko domečku, musí vyhodnotit všechny legální varianty a celé pokračování tahu:
- nasazení může otevřít bonusový hod a následné vyhození soupeře;
- pohyb figurkou blízko domečku může přinést rychlejší dokončení nebo snížit riziko;
- porovná se také ohrožení ostatních figurek a možné odpovědi soupeřů.

AI nesmí mít pevnou poučku typu „vždy nasazuj“ nebo „vždy postupuj do domečku“. Výsledek musí vyplynout z aktuálních pravidel, legálních pokračování, MCTS a naučených vah.
