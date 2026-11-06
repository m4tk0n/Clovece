# Pravidla hry – Člověče, nezlob se!

> Závazná specifikace herních pravidel. Lokální JavaScriptový engine i serverový PHP engine musí pravidla vyhodnocovat shodně.

## 1. Rozsah
- Základní herní pravidla platí pro lokální i online hru, lidské i počítačové hráče a zobrazení 2D i 3D.
- Volitelná rozšířená pravidla mohou být dočasně dostupná pouze v jednom režimu; jejich rozsah je vždy výslovně uveden u konkrétního pravidla.
- AI ani způsob zobrazení nesmějí měnit pravidla.
- Herní logika je oddělena od vykreslování desky.
- Tento dokument je jediným technickým zdrojem pravdy pro pravidla hry.

## 2. Hráči, figurky a deska
- Hraje 2 až 8 hráčů; každý má čtyři figurky, vlastní startovní pole a vlastní cílovou dráhu.
- Povolené délky hlavního okruhu jsou 40, 48 a 80 polí.
- Deska 40 má 4 pozice, deska 48 má 6 pozic a deska 80 má 8 pozic.
- Pro 2–4 hráče jsou dostupné všechny tři desky; pro 5–6 hráčů desky 48 a 80; pro 7–8 hráčů pouze deska 80.
- Neobsazené pozice zůstávají součástí geometrie desky, ale nemají hráče ani figurky.
- Každý hráč má čtyři cílová pole D1 až D4. Domeček/základna je mimo hlavní okruh.

## 3. Rozstřel
- Na začátku hry určí začínajícího hráče rozstřel hodem kostkou.
- Živí hráči házejí ručně, AI automaticky pouze ve chvíli, kdy je na řadě.
- V prvním kole házejí všichni hráči.
- Při shodě nejvyšších výsledků házejí znovu pouze hráči, kteří dosáhli nejvyššího výsledku.
- Rozstřel se opakuje, dokud nezůstane jediný vítěz. Ten začíná hru.
- Pořadí ostatních hráčů se nemění.

## 4. Základna, nasazení a šestka
- Figurka v základně se může nasadit pouze při hodu 6.
- Pokud má hráč při šestce alespoň jednu figurku v základně, musí nasadit jednu z nich. Nesmí místo toho táhnout jinou figurkou.
- Nasazení spotřebuje celý hod šestky. Nově nasazená figurka se neposouvá o dalších šest polí.
- Je-li vlastní startovní pole obsazeno vlastní figurkou, vrátí se tato figurka do základny a nově nasazená figurka obsadí start. To je jediný případ, kdy hráč smí vyhodit vlastní figurku.
- Je-li startovní pole obsazeno soupeřovou figurkou, vrátí se soupeřova figurka do své základny.
- Po nasazení následuje bonusový hod. Výjimkou je šestka na třetí pokus při pravidle tří pokusů.
- Číslo z bonusového hodu lze použít k pohybu libovolnou vlastní figurkou na desce, včetně právě nasazené.
- Pokud má po bonusovém hodu legální tah pouze právě nasazená figurka, musí táhnout jí. Pokud nemá legální tah žádná figurka, postupuje se podle pravidel pro daný hod.

## 5. Pravidlo tří pokusů
- Pokud jsou všechny čtyři figurky v základně na začátku tahu, má hráč nejvýše tři po sobě jdoucí pokusy hodit šestku.
- Šestka na prvním nebo druhém pokusu znamená povinné nasazení a běžný bonusový hod.
- Šestka na třetím pokusu znamená povinné nasazení, ale bez bonusového hodu; tah po nasazení končí.
- Pokud šestka nepadne ani na třetí pokus, tah končí bez nasazení.
- Jakmile má hráč alespoň jednu figurku mimo základnu, pravidlo tří pokusů se v tomto tahu neuplatní.
- Pravidlo se znovu uplatní, až když jsou všechny čtyři figurky hráče opět v základně.

## 6. Pohyb po hlavním okruhu
- Hod určuje počet polí, o která se figurka posune.
- Hlavní okruh se absolvuje pouze jednou. Po posledním poli okruhu následuje vlastní D1, nikoli opět první pole okruhu.
- Vlastní figurky na hlavním okruhu lze přeskočit, ale tah nesmí skončit na poli obsazeném vlastní figurkou.
- Soupeřovy figurky pohyb neblokují. Dopadne-li hráč na soupeřovu figurku, soupeřova figurka se vrátí do základny.
- Každé pole hlavního okruhu může obsadit nejvýše jedna figurka.
- Na hlavním okruhu neexistují bezpečná pole. Ani startovní pole není chráněné před vyhozením.

## 7. Cílová dráha
- Po jednom oběhnutí hlavního okruhu pokračuje figurka do vlastní cílové dráhy D1, D2, D3 a D4.
- Vstup do cílové dráhy i dojezd na D4 musí být přesný. Přestřelení D4 není možné.
- Ve výchozím režimu se vlastní figurky v cílové dráze nesmějí přeskakovat; každé mezilehlé pole musí být volné.
- Je-li v rozšířených pravidlech místní hry zapnuto **Přeskakování v domečku**, lze vlastní figurky v cílové dráze přeskočit. Hod kostkou ale vždy určuje přesnou cílovou pozici; například z D1 při hodu 2 lze skončit na D3, i když je D2 obsazené.
- Tah nesmí skončit na obsazeném cílovém poli. Přeskočení je možné pouze přes mezilehlá obsazená pole, nikoli na obsazené cílové pole.
- V místní hře lze zapnout volitelné pravidlo **Povinnost vstoupit do domečku** (výchozí ANO). Je-li zapnuté a alespoň jedna figurka může podle aktuálního hodu legálně a přesně vstoupit do volného cílového pole, hráč musí zvolit některý takový tah a nesmí táhnout jinou figurkou.
- Za legální vstup se považuje pouze tah, který splňuje všechna ostatní aktivní pravidla, včetně přesného počtu kroků, volného cílového pole a případného pravidla přeskakování vlastních figurek.
- Pokud žádná figurka nemá legální vstup do cílové dráhy, povinnost se neuplatní a hráč může využít jiný legální tah.
- Při vypnutí pravidla může hráč zvolit libovolný jiný legální tah, i když má možnost vstoupit do domečku.
- Toto volitelné pravidlo je dostupné pouze pro místní hru. Online hra zůstává beze změny.
- Cílová pole se nehromadí; na každém může stát nejvýše jedna figurka.
- Volitelné pravidlo Přeskakování v domečku je v této verzi dostupné pouze pro místní hru. Online hra nadále používá dosavadní pravidlo bez přeskakování; online engine se touto změnou nemění.

## 8. Vyhazování
- Při běžném pohybu se vyhazují pouze soupeřovy figurky.
- Vlastní figurku lze vrátit do základny pouze povinným nasazením jiné figurky na vlastní obsazené startovní pole při hodu 6.
- Nasazení na obsazené startovní pole vždy končí tím, že na něm stojí právě nasazovaná figurka.
- Vyhozená figurka se vrací do základny a k jejímu opětovnému nasazení je potřeba šestka.

## 9. Další hod a konec tahu
- Každá šestka dává po provedení příslušné akce právo na další hod; výjimkou je šestka na třetí pokus podle pravidla tří pokusů.
- Řetězení šestek není omezeno.
- Pokud hráč hodí šestku, ale nemá žádný legální tah ani možnost povinného nasazení, tah s šestkou propadá, ale hráč přesto hází znovu.
- Pokud hráč hodí 1 až 5 a nemá žádný legální tah, jeho tah končí a pokračuje další hráč.
- Hráč vyhrává, když všechny čtyři jeho figurky obsadí čtyři různá cílová pole D1–D4. Hra v tu chvíli končí.

## 10. Technické požadavky na implementaci
- Lokální JavaScriptový engine a serverový PHP engine musí používat totožná základní pravidla pro validaci hodů, legálních tahů, nasazení, vyhazování, vstupu do cíle, bonusových hodů a ukončení tahu.
- Každé volitelné rozšíření dostupné v obou režimech musí mít shodnou serverovou i klientskou implementaci. Rozšíření výslovně omezená na lokální hru se do online enginu nepřenášejí, dokud nebude jejich online podpora samostatně doplněna.
- Server je autoritou pro online hru; klient nesmí být schopen vynutit neplatný tah.
- Testy obou enginů musí pokrývat všechna pravidla uvedená výše.
- Vzhled desky, animace, rychlost pohybu a režim 2D/3D nesmějí ovlivnit výsledek herní akce.

## 11. Režimy pohybu figurek
- **Normální:** figurka se při tahu viditelně přesouvá postupně přes jednotlivá políčka.
- **Rychlá:** mezilehlá políčka se přeskočí a figurka se zobrazí rovnou na cílovém poli.
- Oba režimy mají totožná pravidla a cílové pozice. Nastavení se vztahuje na lidi i AI a na 2D i 3D zobrazení.
- Globální vypnutí animací může animaci vypnout bez ohledu na zvolený režim.

## 12. Režimy animace kostky
- **Normální:** kostka se viditelně roztočí a zastaví na hozené hodnotě; animace trvá přibližně 1,5 sekundy.
- **Rychlá:** kostka se neroztáčí a ihned zobrazí konečnou hozenou hodnotu.
- Rychlost kostky používá stejný přepínač Normální / Rychlá jako pohyb figurek.
- Výsledek hodu se v obou režimech nemění.

## 13. Příklad: opakované nasazení při řetězení šestek
- Hráč má na začátku tahu všechny čtyři figurky v základně.
- Na první pokus hodí 6. Podle pravidel musí jednu figurku nasadit na své startovní pole. Šestka se spotřebuje na nasazení a následuje bonusový hod.
- Při bonusovém hodu padne znovu 6. Hráč má stále alespoň jednu figurku v základně, proto musí znovu nasadit další figurku. Nesmí místo toho táhnout figurkou, která už stojí na okruhu.
- Protože je startovní pole obsazeno jeho první figurkou, tato figurka se vrátí do základny a nově nasazená figurka ji na startovním poli nahradí.
- Druhá šestka rovněž zakládá nárok na další bonusový hod. Řetězení šestek není omezeno.
- **Důležité:** Vrácení vlastní figurky do základny při tomto povinném nasazení není chyba ani zrušení tahu. Je to výslovně povolená a povinná součást pravidel.
