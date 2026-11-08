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

## Jediné centrální úložiště místní a online AI

Místní i online AI používají stejný fyzický soubor na hostingu:

`storage/ai-learning-data.json`

Soubor není součástí Git repozitáře a při nasazení se nepřepisuje. Adresář `storage/` je chráněn proti přímému HTTP čtení; přístup probíhá přes `ai-learning-api.php` nebo serverový herní engine.

- Místní JavaScript načte společný model před prvním rozhodnutím AI a po každém naučeném tahu odešle změny.
- Online PHP AI načítá a aktualizuje tentýž soubor přímo na serveru.
- Oba přístupy používají stejný soubor zámku `storage/ai-learning-data.lock` a atomickou výměnu JSON souboru.
- API používá CSRF ochranu a kontroluje formát, rozsah vah, velikost požadavku a dynamické parametry.
- Zápisy z více zařízení se slučují jako rozdíly proti verzi, ze které zařízení vycházelo. Tím se nezahodí souběžně naučené váhy ani nové dynamické kombinace.
- `localStorage` je pouze nouzová cache pro případ nedostupného serveru; není autoritativním úložištěm.
- Starší MySQL tabulka `ai_learning_model`, pokud již v databázi existuje, se tímto řešením dále nepoužívá.

### Aktuální hranice integrace

GitHub self-play trénink zatím stále ukládá své checkpointy do vlastních artefaktů a SFTP archivu. Není tedy ještě napojen na centrální živý soubor. Produkční model se nesmí automaticky nahradit neověřeným kandidátem; propojení trénovacího runneru musí používat zabezpečený serverový přístup a stejný mechanismus slučování.

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
