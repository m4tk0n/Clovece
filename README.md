# Člověče, nezlob se!

Moderní webová verze deskové hry pro PHP hosting na WZ.cz.

## Aktuální stav

První hratelná verze podporuje lokální hru na jednom zařízení. Více živých hráčů se střídá u stejného zařízení a do hry lze přidat počítačové soupeře.

### Herní možnosti

- 2 až 8 hráčů v libovolné kombinaci lidí a AI
- Podrobná a závazná pravidla hry včetně dostupných desek jsou vedena výhradně v [GAME_RULES.md](GAME_RULES.md)
- Automatické tahy AI
- Animace kostky, vyhození a vítězství
- Responzivní rozhraní pro mobil i počítač

## Online multiplayer – plán

Online režim je implementovaný v základní podobě a probíhá ověřování na hostingu:
- anonymní identita zařízení a opětovné připojení na stejném zařízení
- pozvánkový odkaz pro připojení do čekající místnosti
- vytváření místností a připojování dalších hráčů
- synchronizace stavu hry přes PHP API a MySQL
- serverové házení kostkou a ověřování tahů
- chat a společný časový proud chatu a herních událostí
- pravidelné dotazování API; WebSockety nejsou vyžadovány

Před nasazením pro běžné hraní je nutné dokončit test na WZ.cz ve dvou samostatných zařízeních.

Herní pravidla jsou oddělená od vykreslování a rozhraní, aby bylo možné později připojit serverový herní engine bez přepisování celé hry.

## Struktura

- index.php – vstupní bod, pseudo-CRON a obrazovky aplikace
- js/game-engine.js – pravidla a stav hry
- js/game-board.js – SVG hrací plán pro 2–8 hráčů
- js/app.js – ovládání hry a AI
- css/game-premium.css – vzhled herního plánu a rozhraní
- online-api.php – anonymní online API a serverově ověřované herní tahy
- api.php – původní API pro starý registrační datový model (online režim ho nepoužívá)
- install/install.php – instalace databázových tabulek

## Instalace a nasazení

1. Nastav databázové údaje v .env.
2. Spusť install/install.php, pokud databáze ještě není připravená.
3. Push do větve main automaticky spustí FTP nasazení do /clovece/.
4. Automatické testy herních pravidel se spouštějí v GitHub Actions.

## Technologie

- HTML5, CSS3, JavaScript ES modules
- Samostatný SVG renderer pro pevný 2D pohled shora a samostatný Three.js renderer, který vytváří vlastní 3D scénu přímo z herních dat; SVG se do 3D režimu vůbec nezapojuje
- 3D kamera začíná shora a podporuje naklonění, otáčení a přiblížení; SVG režim zůstává vždy bez náklonu a perspektivy
- Varianty desky classic a polygon, velikosti 40/48/80 polí
- PHP a MySQL pro budoucí online režim
- GitHub Actions pro testování a FTP nasazení
