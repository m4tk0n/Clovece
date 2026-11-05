# Herní log a chat

Tento dokument popisuje, co se zobrazuje v chatu během lokální i online partie.

## Zobrazení

- Herní události a běžné zprávy hráčů se zobrazují ve společném seznamu chatu.
- Herní událost má formát `Jméno hráče: popis událostí`.
- Po sobě jdoucí herní události stejného hráče se slučují do jednoho řádku. Další hráč nebo běžná zpráva chatu vytvoří nový řádek.
- Log se průběžně doplňuje po potvrzení akce; zaznamenává provedené akce, nikoli pouze zamýšlené tahy.
- Nejnovější zprávy jsou dole. Při nových událostech se seznam posune dolů, pokud uživatel zůstal na konci.
- Lokální hra uchovává v paměti posledních 40 položek. Online API vrací posledních 30 běžných zpráv a 30 herních událostí.
- Log je součástí chatu a výpis lze rozbalit kliknutím.

## Co se loguje

### Rozstřel
- Průběžný přehled kol a jednotlivých hodů.
- Při shodě nejvyšších výsledků se zaznamenají opakovaná kola, do kterých postupují pouze hráči ve shodě.
- Po ukončení rozstřelu se uvede hráč, který začíná.
- V lokální i online hře se průběžný rozstřel aktualizuje v jednom záznamu.

### Běžný tah
- Každý hod kostkou, včetně šestek a bonusových hodů.
- Hod bez legálního tahu.
- Opakovaný hod po šestce bez legálního tahu.
- Pokusy o šestku při pravidle tří pokusů, včetně pořadí pokusu.
- Nasazení figurky ze základny.
- Posun figurky a počet polí.
- Vyhození soupeřovy figurky včetně jména soupeře.
- Výměna vlastní figurky na startovním poli; původní figurka se vrací do základny.
- Dosažení cílového domečku figurkou.
- Konec tahu bez možného tahu.

### Běžné zprávy
- Textové zprávy hráčů se zobrazují ve stejném časovém proudu jako herní události.
- Běžná zpráva přeruší slučování herních událostí, aby se její text nespojil s automatickým logem.

## Příklady

Nasazení a následný bonusový hod s vyhozením soupeře:
```text
Hráč 1: hodil 6, nasadil figurku 2, hodil 4, vyhodil hráče 3
```

Výměna vlastní figurky na startu:
```text
Hráč 1: hodil 6, nasadil figurku 1, vyměnil vlastní figurku na startu (původní se vrátila do základny)
```

Tah bez možného pohybu:
```text
Hráč 2: hodil 3, nemá platný tah
```

## Rozdíly mezi režimy

- Lokální režim zapisuje události z JavaScriptového herního enginu a rozhraní.
- Online režim ukládá akce na serveru do historie herních událostí; klienti z nich sestavují čitelný log.
- Oba režimy používají stejný význam událostí. Serverový záznam pohybu obsahuje také informaci, zda šlo o nasazení z domečku.
- Běžné zprávy chatu zůstávají oddělené od automatického herního logu.
