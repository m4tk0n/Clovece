<?php
declare(strict_types=1);

/**
 * Vstupní bod webu.
 * Spustí lehkou pseudo-CRON kontrolu (nejvýše jednou za 5 minut)
 * a následně zobrazí původní statickou aplikaci.
 */

require_once __DIR__ . '/cron/cron.php';

$ver = date('Ymd-His');
?>

<!DOCTYPE html>
<html lang="cs">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Člověče, nezlob se! | Online Ludo Game</title>
    <link rel="stylesheet" href="css/variables.css?v=<?= $ver ?>">
    <link rel="stylesheet" href="css/reset.css?v=<?= $ver ?>">
    <link rel="stylesheet" href="css/animations.css?v=<?= $ver ?>">
    <link rel="stylesheet" href="css/layout.css?v=<?= $ver ?>">
    <link rel="stylesheet" href="css/components.css?v=<?= $ver ?>">
    <link rel="stylesheet" href="css/board.css?v=<?= $ver ?>">
    <link rel="stylesheet" href="css/modals.css?v=<?= $ver ?>">
    <link rel="stylesheet" href="css/toast.css?v=<?= $ver ?>">
    <link rel="stylesheet" href="css/responsive.css?v=<?= $ver ?>">
    <link rel="stylesheet" href="css/game-premium.css?v=<?= $ver ?>">
    <link rel="stylesheet" href="css/menu-premium.css?v=<?= $ver ?>">
    <link href="https://fonts.googleapis.com/css2?family=Bangers&family=Press+Start+2P&family=Rubik+Glitch&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script type="importmap">
    {
        "imports": {
            "three": "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js",
            "/js/app.js": "/js/app.js?v=<?= $ver ?>",
            "/js/audio.js": "/js/audio.js?v=<?= $ver ?>",
            "/js/game-board.js": "/js/game-board.js?v=<?= $ver ?>",
            "/js/game-engine.js": "/js/game-engine.js?v=<?= $ver ?>",
            "/js/lazy-load.js": "/js/lazy-load.js?v=<?= $ver ?>",
            "/js/navigation.js": "/js/navigation.js?v=<?= $ver ?>",
            "/js/online.js": "/js/online.js?v=<?= $ver ?>"
        }
    }
    </script>
</head>
<body>
    <!-- Loading Screen -->
    <div id="loading-screen" class="loading-screen">
        <div class="loader">
            <div class="dice-loader">
                <div class="dice"></div>
                <div class="dice"></div>
                <div class="dice"></div>
            </div>
            <h2 class="glitch" data-text="ČLOVĚČE NEZLOB SE">ČLOVĚČE NEZLOB SE</h2>
            <p>Načítání hry...</p>
        </div>
    </div>

    <!-- Main Menu -->
    <div id="main-menu" class="menu-screen hidden">
        <div class="menu-bg">
            <div class="particles" id="particles"></div>
            <div class="menu-content">
                <div class="user-info" id="user-info" class="hidden">
                    <div class="user-avatar">
                        <i class="fas fa-user"></i>
                    </div>
                    <div class="user-details">
                        <span class="user-name" id="user-display-name">Hráč</span>
                        <div class="user-stats">
                            <span id="user-wins">0</span> výher | 
                            <span id="user-games">0</span> her
                        </div>
                    </div>
                    <button id="logout-btn" class="menu-btn secondary">
                        <span>ODHLÁSIT</span>
                        <i class="fas fa-sign-out-alt"></i>
                    </button>
                </div>
                
                <h1 class="game-title glitch" data-text="ČLOVĚČE NEZLOB SE">ČLOVĚČE NEZLOB SE</h1>
                <div class="game-logo">
                    <i class="fas fa-dice"></i>
                </div>
                
                <div class="menu-buttons">
                    <button id="play-btn" class="menu-btn pulse">
                        <span>HRÁT</span>
                        <i class="fas fa-play"></i>
                    </button>
                    <button id="create-room-btn" class="menu-btn">
                        <span>NOVÁ LOKÁLNÍ HRA</span>
                        <i class="fas fa-plus"></i>
                    </button>
                    <button id="join-room-btn" class="menu-btn">
                        <span>ONLINE HRANÍ</span>
                        <i class="fas fa-door-open"></i>
                    </button>
                    <button id="settings-btn" class="menu-btn">
                        <span>NASTAVENÍ</span>
                        <i class="fas fa-cog"></i>
                    </button>
                    <button id="rules-btn" class="menu-btn">
                        <span>PRAVIDLA</span>
                        <i class="fas fa-book"></i>
                    </button>
                </div>
                
                <div class="auth-buttons">
                    <button id="login-menu-btn" class="menu-btn secondary">
                        <span>PŘIHLÁSIT SE</span>
                        <i class="fas fa-sign-in-alt"></i>
                    </button>
                    <button id="register-menu-btn" class="menu-btn secondary">
                        <span>REGISTRACE</span>
                        <i class="fas fa-user-plus"></i>
                    </button>
                </div>
                
                <div class="credits">
                    <p>Vytvořeno s <i class="fas fa-heart"></i> pro zábavu</p>
                </div>
            </div>
        </div>
    </div>

    <!-- Login Screen -->
    <div id="login-screen" class="menu-screen hidden">
        <div class="menu-bg">
            <div class="menu-content">
                <h2 class="glitch" data-text="PŘIHLÁŠENÍ">PŘIHLÁŠENÍ</h2>
                <form id="login-form" class="auth-form">
                    <div class="form-group">
                        <label for="login-username">Uživatelské jméno</label>
                        <input type="text" id="login-username" name="username" required autocomplete="username">
                        <i class="fas fa-user"></i>
                    </div>
                    <div class="form-group">
                        <label for="login-password">Heslo</label>
                        <input type="password" id="login-password" name="password" required autocomplete="current-password">
                        <i class="fas fa-lock"></i>
                    </div>
                    <button type="submit" class="menu-btn">
                        <span>PŘIHLÁSIT SE</span>
                        <i class="fas fa-sign-in-alt"></i>
                    </button>
                </form>
                <p class="auth-link">
                    Nemáte účet? <button type="button" id="show-register" class="link-btn">Registrujte se</button>
                </p>
                <button id="back-from-login" class="menu-btn secondary">
                    <span>ZPĚT</span>
                    <i class="fas fa-arrow-left"></i>
                </button>
            </div>
        </div>
    </div>

    <!-- Register Screen -->
    <div id="register-screen" class="menu-screen hidden">
        <div class="menu-bg">
            <div class="menu-content">
                <h2 class="glitch" data-text="REGISTRACE">REGISTRACE</h2>
                <form id="register-form" class="auth-form">
                    <div class="form-group">
                        <label for="register-username">Uživatelské jméno (3-50 znaků)</label>
                        <input type="text" id="register-username" name="username" required minlength="3" maxlength="50" autocomplete="username">
                        <i class="fas fa-user"></i>
                    </div>
                    <div class="form-group">
                        <label for="register-password">Heslo (min. 6 znaků)</label>
                        <input type="password" id="register-password" name="password" required minlength="6" autocomplete="new-password">
                        <i class="fas fa-lock"></i>
                    </div>
                    <div class="form-group">
                        <label for="register-display-name">Zobrazované jméno (volitelné)</label>
                        <input type="text" id="register-display-name" name="display_name" autocomplete="name">
                        <i class="fas fa-tag"></i>
                    </div>
                    <div class="form-group">
                        <label for="register-color">Barva</label>
                        <select id="register-color" name="color" class="color-select">
                            <option value="#ff6b6b">Červená</option>
                            <option value="#4ecdc4">Tyrkysová</option>
                            <option value="#ffe66d">Žlutá</option>
                            <option value="#a8e6cf">Zelená</option>
                            <option value="#ff8b94">Růžová</option>
                            <option value="#b4a7d6">Fialová</option>
                            <option value="#d4a373">Oranžová</option>
                            <option value="#9999ff">Modrá</option>
                        </select>
                    </div>
                    <button type="submit" class="menu-btn">
                        <span>REGISTROVAT</span>
                        <i class="fas fa-user-plus"></i>
                    </button>
                </form>
                <p class="auth-link">
                    Již máte účet? <button type="button" id="show-login" class="link-btn">Přihlašte se</button>
                </p>
                <button id="back-from-register" class="menu-btn secondary">
                    <span>ZPĚT</span>
                    <i class="fas fa-arrow-left"></i>
                </button>
            </div>
        </div>
    </div>

    <!-- Lobby Screen -->
    <div id="lobby-screen" class="menu-screen hidden">
        <div class="menu-bg">
            <div class="menu-content">
                <h2 class="glitch" data-text="LOBBY">LOBBY</h2>
                
                <div class="lobby-actions">
                    <label for="online-player-name">Tvoje jméno</label>
                    <input id="online-player-name" type="text" maxlength="50" autocomplete="nickname" placeholder="Zobrazované jméno">
                    <label for="online-player-limit">Počet hráčů v místnosti</label>
                    <select id="online-player-limit" class="color-select">
                        <option value="2">2 hráči</option>
                        <option value="3">3 hráči</option>
                        <option value="4" selected>4 hráči</option>
                        <option value="5">5 hráčů</option>
                        <option value="6">6 hráčů</option>
                        <option value="7">7 hráčů</option>
                        <option value="8">8 hráčů</option>
                    </select>
                    <button id="create-room-btn-lobby" class="menu-btn pulse">
                        <span>VYTVOŘIT NOVOU MÍSTNOST</span>
                        <i class="fas fa-plus"></i>
                    </button>
                    
                    <div class="join-room-form">
                        <input type="text" id="room-code-input" placeholder="Vlož pozvánkový odkaz" maxlength="300">
                        <button id="join-room-btn-lobby" class="menu-btn">
                            <span>PŘIPOJIT SE</span>
                            <i class="fas fa-door-open"></i>
                        </button>
                    </div>
                </div>
                
                <section class="identity-transfer">
                    <h3>Přenos identity na jiné zařízení</h3>
                    <p>Na původním zařízení vytvoř kód. Na novém zařízení ho zadej zde. Platí 15 minut a lze ho použít pouze jednou.</p>
                    <button id="create-transfer-code-btn" type="button" class="menu-btn secondary">
                        <span>VYTVOŘIT PŘENOSOVÝ KÓD</span>
                        <i class="fas fa-key"></i>
                    </button>
                    <input id="transfer-code-output" type="text" readonly autocomplete="off" placeholder="Zde se zobrazí přenosový kód">
                    <label for="transfer-code-input">Kód z druhého zařízení</label>
                    <input id="transfer-code-input" type="text" maxlength="60" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Vlož přenosový kód">
                    <button id="claim-transfer-code-btn" type="button" class="menu-btn">
                        <span>PŘEVÉST IDENTITU NA TOTO ZAŘÍZENÍ</span>
                        <i class="fas fa-right-left"></i>
                    </button>
                </section>

                <h3>Moje hry</h3>
                <div id="my-games-list" class="my-games-list">
                    <p class="my-games-empty">Načítám tvoje hry…</p>
                </div>

                <h3>Seznam místností</h3>
                <div id="room-list" class="room-list"></div>
                
                <button id="back-from-lobby" class="menu-btn secondary">
                    <span>ZPĚT</span>
                    <i class="fas fa-arrow-left"></i>
                </button>
            </div>
        </div>
    </div>

    <!-- Room Screen -->
    <div id="room-screen" class="menu-screen hidden">
        <div class="menu-bg">
            <div class="menu-content">
                <h2 class="glitch" data-text="MÍSTNOST">MÍSTNOST</h2>
                
                <div id="room-info" class="room-info">
                    <div class="room-code-display">
                        Pozvánka: <span id="room-code-display" class="highlight"></span>
                    </div>
                    <input id="room-invite-url" type="url" readonly aria-label="Pozvánkový odkaz">
                    <button id="copy-invite-btn" type="button" class="menu-btn secondary">
                        <span>ZKOPÍROVAT POZVÁNKU</span>
                        <i class="fas fa-copy"></i>
                    </button>
                    <div class="room-status">
                        Status: <span id="room-status-display">Čeká</span>
                    </div>
                </div>
                
                <h3>Hráči</h3>
                <div id="participant-list" class="participant-list"></div>
                <form id="room-player-settings" class="room-actions hidden">
                    <label for="room-player-name">Tvoje zobrazované jméno</label>
                    <input id="room-player-name" type="text" maxlength="50" autocomplete="nickname" required>
                    <button type="submit" class="menu-btn secondary">
                        <span>ZMĚNIT JMÉNO</span>
                        <i class="fas fa-user-pen"></i>
                    </button>
                    <label for="room-player-color">Tvoje barva figurek</label>
                    <select id="room-player-color" class="color-select"></select>
                    <button id="random-room-color-btn" type="button" class="menu-btn secondary">
                        <span>NASTAVIT NÁHODNOU</span>
                        <i class="fas fa-shuffle"></i>
                    </button>
                </form>
                
                <div class="room-actions">
                    <button id="add-ai-player-btn" type="button" class="menu-btn secondary hidden">
                        <span>PŘIDAT POČÍTAČOVÉHO HRÁČE</span>
                        <i class="fas fa-robot"></i>
                    </button>
                    <button id="ready-btn" class="menu-btn">
                        <span id="ready-btn-text">JSem připraven</span>
                        <i class="fas fa-check"></i>
                    </button>
                    
                    <button id="room-start-game-btn" class="menu-btn pulse hidden">
                        <span>ZAČÍT HRU</span>
                        <i class="fas fa-play"></i>
                    </button>
                    
                    <button id="leave-room-btn" class="menu-btn secondary">
                        <span>OPUSTIT MÍSTNOST</span>
                        <i class="fas fa-door-closed"></i>
                    </button>
                </div>
                
                <div class="room-chat">
                    <h4>Chat</h4>
                    <div id="room-chat-messages" class="chat-messages"></div>
                    <form id="room-chat-form" class="chat-form">
                        <input type="text" id="room-chat-input" placeholder="Napište zprávu..." maxlength="1000" autocomplete="off">
                        <button type="submit" class="menu-btn small">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </form>
                </div>
                
                <button id="back-from-room" class="menu-btn secondary">
                    <span>ZPĚT DO LOBBY</span>
                    <i class="fas fa-arrow-left"></i>
                </button>
            </div>
        </div>
    </div>

    <!-- Player Selection Screen -->
    <div id="player-selection" class="menu-screen hidden">
        <div class="menu-bg">
            <div class="menu-content">
                <h2 class="glitch" data-text="VYTVOŘENÍ HRY">VYTVOŘENÍ HRY</h2>
                <div class="selection-container">
                    <div class="setup-grid">
                        <div class="setup-control">
                            <label for="human-players">ŽIVÍ HRÁČI</label>
                            <div class="setup-number"><strong id="human-players-value">1</strong><span>ČLOVĚK</span></div>
                            <input type="range" id="human-players" min="1" max="8" value="1" class="slider">
                        </div>
                        <div class="setup-control">
                            <label for="ai-players">AI SOUPEŘI</label>
                            <div class="setup-number"><strong id="ai-players-value">1</strong><span>POČET BOTŮ</span></div>
                            <input type="range" id="ai-players" min="0" max="7" value="1" class="slider">
                        </div>
                    </div>
                    <div class="board-size-control">
                        <span class="board-size-label">VELIKOST DESKY</span>
                        <div class="board-size-options" id="board-size-options" role="group" aria-label="Velikost hrací desky">
                            <button type="button" class="board-size-btn is-active" data-board-size="40" aria-pressed="true">40</button>
                            <button type="button" class="board-size-btn" data-board-size="48" aria-pressed="false">48</button>
                            <button type="button" class="board-size-btn" data-board-size="80" aria-pressed="false">80</button>
                        </div>
                    </div>
                    <div class="player-preview" id="player-preview">
                        <h3>SESTAVA U STOLU</h3>
                        <div class="preview-players" id="preview-players"></div>
                        <button id="random-player-colors-btn" type="button" class="menu-btn secondary">
                            <span>NÁHODNĚ ROZDĚLIT BARVY</span>
                            <i class="fas fa-shuffle"></i>
                        </button>
                    </div>
                </div>
                <button id="start-game-btn" class="menu-btn pulse">
                    <span>ZAČÍT HRU</span>
                    <i class="fas fa-dice"></i>
                </button>
                <button id="back-to-menu-btn" class="menu-btn secondary">
                    <span>ZPĚT</span>
                    <i class="fas fa-arrow-left"></i>
                </button>
            </div>
        </div>
    </div>

    <!-- Settings Screen -->
    <div id="settings-screen" class="menu-screen hidden">
        <div class="menu-bg">
            <div class="menu-content">
                <h2 class="glitch" data-text="NASTAVENÍ">NASTAVENÍ</h2>
                <div class="settings-container">
                    <div class="setting-item">
                        <label for="sfx-toggle">Zvukové efekty</label>
                        <label class="toggle-switch">
                            <input type="checkbox" id="sfx-toggle" checked>
                            <span class="slider-round"></span>
                        </label>
                    </div>
                    <div class="setting-item">
                        <label>Animace</label>
                        <label class="toggle-switch">
                            <input type="checkbox" id="animations-toggle" checked>
                            <span class="slider-round"></span>
                        </label>
                    </div>
                    <div class="setting-item">
                        <label>Rychlost pohybu figurek</label>
                        <select id="ai-speed">
                            <option value="normal" selected>Normální</option>
                            <option value="fast">Rychlá</option>
                        </select>
                    </div>
                </div>
                <button id="save-settings-btn" class="menu-btn">
                    <span>ULOŽIT</span>
                    <i class="fas fa-save"></i>
                </button>
                <button id="back-settings-btn" class="menu-btn secondary">
                    <span>ZPĚT</span>
                    <i class="fas fa-arrow-left"></i>
                </button>
            </div>
        </div>
    </div>

    <!-- Rules Screen -->
    <div id="rules-screen" class="menu-screen hidden">
        <div class="menu-bg">
            <div class="menu-content rules-content">
                <h2 class="glitch" data-text="PRAVIDLA">PRAVIDLA</h2>
                <div class="rules-text">
                    <h3>Cíl hry</h3>
                    <p>Dostat všechny čtyři figurky do domečku jako první hráč.</p>
                    
                    <h3>Pohyb</h3>
                    <p>Hráč hází kostkou a posunuje jednu ze svých figurek o počet políček odpovídající číslu na kostce.</p>
                    
                    <h3>Start</h3>
                    <p>Figurka může vyjít ze startu pouze při hození 6. Pokud hráč hodí 6, může vyvést novou figurku nebo posunout již aktivní.</p>
                    
                    <h3>Vyhazování</h3>
                    <p>Pokud figurka dopadne na políčko obsazené soupeřovou figurkou, soupeřova figurka se vrací zpět do startu.</p>
                    
                    <h3>Bezpečné zóny</h3>
                    <p>Vlastní barva políčka a domeček jsou bezpečné zóny, kde vás nelze vyhodit.</p>
                    
                    <h3>Cesta domů</h3>
                    <p>Pro vstup do domečku je třeba přesné číslo na kostce. Figurka se posunuje po cestě své barvy.</p>
                    
                    <h3>Online hra</h3>
                    <p>Lokální hra podporuje 2 až 8 hráčů včetně AI. Online režim umožňuje založit místnost, pozvat další hráče odkazem a synchronizovat tahy přes server.</p>
                </div>
                <button id="back-rules-btn" class="menu-btn secondary">
                    <span>ZPĚT</span>
                    <i class="fas fa-arrow-left"></i>
                </button>
            </div>
        </div>
    </div>

    <!-- Game Screen -->
    <div id="game-screen" class="game-screen hidden">
        <div class="game-header">
            <div class="game-info">
                <span id="current-player-display" class="current-player">Hráč: <span id="current-player-name">--</span></span>
                <span id="dice-result" class="dice-result">Kostka: <span id="dice-value">0</span></span>
                <span id="game-status" class="game-status">Čeká se na tah...</span>
            </div>
            <div class="game-controls">
                <button id="roll-dice-btn" class="game-btn dice-btn">
                    <i class="fas fa-dice"></i>
                    <span>HODIT</span>
                </button>
                <button id="end-turn-btn" class="game-btn end-btn hidden">
                    <i class="fas fa-check"></i>
                    <span>KONEC TAHU</span>
                </button>
                <button id="menu-btn" class="game-btn menu-btn">
                    <i class="fas fa-bars"></i>
                </button>
            </div>
        </div>

        <div class="game-container" id="game-container">
            <!-- Board will be generated by JavaScript -->
        </div>

        <div class="game-footer">
            <div class="game-chat">
                <div id="chat-messages" class="chat-messages"></div>
                <form id="chat-form" class="chat-form">
                    <input type="text" id="chat-input" placeholder="Napište zprávu..." autocomplete="off">
                    <button type="submit" class="game-btn small">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </form>
            </div>
        </div>
    </div>

    <!-- Game Menu (Pause) -->
    <div id="game-menu" class="modal hidden">
        <div class="modal-content">
            <h3>PAUZA</h3>
            <div class="menu-audio-row">
                <span>Nastavení zvuku</span>
                <div class="game-audio-control">
                <button id="game-audio-toggle" class="game-btn audio-toggle" type="button"
                aria-label="Vypnout zvuk" aria-pressed="true" title="Vypnout zvuk">
                <i class="fas fa-volume-high" aria-hidden="true"></i>
                </button>
                <input id="game-volume" class="game-volume" type="range"
                min="0" max="100" value="70" step="1"
                aria-label="Hlasitost zvuku" title="Hlasitost">
                </div>
            </div>
            <div class="menu-audio-row">
                <label for="game-speed">Rychlost pohybu figurek</label>
                <select id="game-speed" aria-label="Rychlost pohybu figurek">
                    <option value="normal">Normální</option>
                    <option value="fast">Rychlá</option>
                </select>
            </div>
            <button id="resume-btn" class="menu-btn">
                <span>POKRAČOVAT</span>
                <i class="fas fa-play"></i>
            </button>
            <button id="restart-btn" class="menu-btn">
                <span>RESTART</span>
                <i class="fas fa-redo"></i>
            </button>
            <button id="quit-btn" class="menu-btn secondary">
                <span>OPUSTIT HRU</span>
                <i class="fas fa-door-open"></i>
            </button>
        </div>
    </div>

    <!-- Kick Animation Modal -->
    <div id="kick-modal" class="modal hidden">
        <div class="modal-content kick-content">
            <div class="kick-animation">
                <div class="kicker-piece" id="kicker-piece"></div>
                <div class="kicked-piece" id="kicked-piece"></div>
                <div class="kick-effect" id="kick-effect"></div>
            </div>
            <h3 id="kick-title">VYHOZENÍ!</h3>
            <p id="kick-message">Hráč X vyhodil hráče Y!</p>
            <button id="close-kick-btn" class="menu-btn">
                <span>POKRAČOVAT</span>
                <i class="fas fa-check"></i>
            </button>
        </div>
    </div>

    <!-- Win Modal -->
    <div id="win-modal" class="modal hidden">
        <div class="modal-content win-content">
            <div class="win-animation">
                <div class="trophy">
                    <i class="fas fa-trophy"></i>
                </div>
                <div class="confetti" id="confetti"></div>
            </div>
            <h3 id="win-title">VÍTĚZSTVÍ!</h3>
            <p id="win-message">Hráč <span id="winner-name">--</span> vyhrál!</p>
            <button id="close-win-btn" class="menu-btn">
                <span>ZPĚT DO MENU</span>
                <i class="fas fa-home"></i>
            </button>
        </div>
    </div>

    <!-- 3D Dice Roll Animation -->
    <div id="dice-animation" class="dice-animation hidden" aria-hidden="true">
        <div class="scene" id="dice-scene">
            <div class="shadow"></div>
            <div class="jump">
                <div class="cube" id="dice-3d">
                    <div class="face f1"><i class="pip p5"></i></div>
                    <div class="face f2"><i class="pip p1"></i><i class="pip p9"></i></div>
                    <div class="face f3"><i class="pip p1"></i><i class="pip p5"></i><i class="pip p9"></i></div>
                    <div class="face f4"><i class="pip p1"></i><i class="pip p3"></i><i class="pip p7"></i><i class="pip p9"></i></div>
                    <div class="face f5"><i class="pip p1"></i><i class="pip p3"></i><i class="pip p5"></i><i class="pip p7"></i><i class="pip p9"></i></div>
                    <div class="face f6"><i class="pip p1"></i><i class="pip p3"></i><i class="pip p4"></i><i class="pip p6"></i><i class="pip p7"></i><i class="pip p9"></i></div>
                </div>
            </div>
        </div>
    </div>

    <!-- Notification Toast -->
    <div id="toast" class="toast hidden">
        <span id="toast-message"></span>
    </div>

    <!-- Audio Elements -->
    <audio id="dice-sound" src="https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3" preload="none"></audio>
    <audio id="kick-sound" src="https://assets.mixkit.co/active_storage/sfx/2955/2955-preview.mp3" preload="none"></audio>
    <audio id="win-sound" src="https://assets.mixkit.co/active_storage/sfx/284/284-preview.mp3" preload="none"></audio>
    <audio id="move-sound" src="https://assets.mixkit.co/active_storage/sfx/270/270-preview.mp3" preload="none"></audio>

    <!-- JavaScript -->
    <script type="module" src="js/bootstrap.js?v=<?= $ver ?>"></script>
</body>
</html>
