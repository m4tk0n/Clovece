# Člověče, nezlob se! 🎲

Online multiplayer verze klasické deskové hry pro wz.cz hosting.

## 📋 Popis

Kompletní implementace hry Člověče nezlob se! s podporou:
- **2-8 hráčů** (lidé + AI)
- **Online multiplayer** přes PHP API
- **Moderní design** s animacemi
- **Responsive** pro mobil, tablet i PC

## 📁 Struktura

```
/Clovece/
├── index.html      # Hlavní stránka
├── styles.css      # CSS stylování
├── config.php      # DB konfigurace
├── api.php         # Serverové API
└── database.sql    # MySQL databáze
```

## 🚀 Instalace na wz.cz

1. **Vytvoř databázi** v kontrolním panelu wz.cz
2. **Importuj** `database.sql` do databáze
3. **Uprav** `config.php` s přihlašovacími údaji:
   ```php
   define('DB_HOST', 'localhost');
   define('DB_USER', 'tvé_uživatelské_jméno');
   define('DB_PASS', 'tvé_heslo');
   define('DB_NAME', 'název_databáze');
   ```
4. **Nahraj všechny soubory** na server
5. **Hraj!** 🎉

## 🎮 Funkce

### Herní logika
- Klasická pravidla Člověče nezlob se!
- Hození 6 = vyvedení figurky
- Vyhazování soupeřů
- Bezpečné zóny
- Cesta domů

### Design
- Glitch efekty
- 3D animace kostky
- Kick animace
- Confetti při vítězství
- Responsive design

### AI
- 3 úrovně obtížnosti
- Inteligentní strategie

### Online
- Vytváření místností
- Připojování k místnostem
- Chat v reálném čase
- Synchronizace stavu hry

## 🎨 Barvy hráčů

| Hráč | Barva | Hex |
|------|-------|-----|
| 1 | Červená | #ff6b6b |
| 2 | Tyrkysová | #4ecdc4 |
| 3 | Žlutá | #ffe66d |
| 4 | Zelená | #a8e6cf |
| 5 | Růžová | #ff8b94 |
| 6 | Fialová | #b4a7d6 |
| 7 | Oranžová | #d4a373 |
| 8 | Modrá | #9999ff |

## 📖 Pravidla

1. **Cíl**: Dostat všechny 4 figurky do domečku
2. **Start**: Figurka vyjede ze startu při hození 6
3. **Pohyb**: Posun o počet políček na kostce
4. **Vyhazování**: Pokud dopadnete na soupeřovu figurku, vyhodíte ji zpět do startu
5. **Bezpečné zóny**: Vlastní barva a domeček jsou bezpečné
6. **Cesta domů**: Potřeba přesného čísla na kostce

## 🔧 Technologie

- **Frontend**: HTML5, CSS3, JavaScript
- **Backend**: PHP 7.4+
- **Databáze**: MySQL 5.7+
- **Fonty**: Google Fonts (Bangers, Press Start 2P)
- **Ikony**: Font Awesome 6

## 💡 Tipy

- Pro lepší zážitek zapněte zvuky v nastavení
- AI hráči hrají automaticky
- Můžete hrát s přáteli v reálném čase
- Hra je plně responsive - hrajte na mobilu!

---

Vytvořeno pro zábavu ❤️
