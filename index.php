<?php
declare(strict_types=1);

/**
 * Vstupní bod webu.
 * Spustí lehkou pseudo-CRON kontrolu (nejvýše jednou za 5 minut)
 * a následně zobrazí základní shell aplikace.
 */

require_once __DIR__ . '/cron/cron.php';

// Verze assetů se mění pouze při změně konkrétního souboru.
$assetVersion = static function (string $path): int {
    $file = __DIR__ . '/' . ltrim($path, '/');
    return is_file($file) ? (int) filemtime($file) : 1;
};
$debugMode = isset($_GET['debug']) && (string) $_GET['debug'] === '1';
?>

<!DOCTYPE html>
<html lang="cs">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Člověče, nezlob se! | Online Ludo Game</title>
    <link rel="stylesheet" href="css/variables.css?v=<?= $assetVersion('css/variables.css') ?>">
    <link rel="stylesheet" href="css/reset.css?v=<?= $assetVersion('css/reset.css') ?>">
    <link rel="stylesheet" href="css/menu-base.css?v=<?= $assetVersion('css/menu-base.css') ?>">
    <link rel="stylesheet" href="css/menu-main.css?v=<?= $assetVersion('css/menu-main.css') ?>">
    <link rel="stylesheet" href="css/toast.css?v=<?= $assetVersion('css/toast.css') ?>">
    <link href="https://fonts.googleapis.com/css2?family=Bangers&family=Press+Start+2P&family=Rubik:wght@500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script type="importmap">
    {
        "imports": {
            "three": "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js",
            "./js/app.js": "./js/app.js?v=<?= $assetVersion('js/app.js') ?>",
            "./js/audio.js": "./js/audio.js?v=<?= $assetVersion('js/audio.js') ?>",
            "./js/dice.js": "./js/dice.js?v=<?= $assetVersion('js/dice.js') ?>",
            "./js/dice-rotation.js": "./js/dice-rotation.js?v=<?= $assetVersion('js/dice-rotation.js') ?>",
            "./js/game-board.js": "./js/game-board.js?v=<?= $assetVersion('js/game-board.js') ?>",
            "./js/game-engine.js": "./js/game-engine.js?v=<?= $assetVersion('js/game-engine.js') ?>",
            "./js/lazy-load.js": "./js/lazy-load.js?v=<?= $assetVersion('js/lazy-load.js') ?>",
            "./js/navigation.js": "./js/navigation.js?v=<?= $assetVersion('js/navigation.js') ?>",
            "./js/exit-guard.js": "./js/exit-guard.js?v=<?= $assetVersion('js/exit-guard.js') ?>",
            "./js/online.js": "./js/online.js?v=<?= $assetVersion('js/online.js') ?>",
            "./js/game-screen.js": "./js/game-screen.js?v=<?= $assetVersion('js/game-screen.js') ?>",
            "./js/online/api.js": "./js/online/api.js?v=<?= $assetVersion('js/online/api.js') ?>",
            "./js/online/notifications.js": "./js/online/notifications.js?v=<?= $assetVersion('js/online/notifications.js') ?>",
            "./js/online/chat-view.js": "./js/online/chat-view.js?v=<?= $assetVersion('js/online/chat-view.js') ?>",
            "./js/online/my-games-view.js": "./js/online/my-games-view.js?v=<?= $assetVersion('js/online/my-games-view.js') ?>",
            "./js/online/game-runtime.js": "./js/online/game-runtime.js?v=<?= $assetVersion('js/online/game-runtime.js') ?>",
            "./js/online/game-view.js": "./js/online/game-view.js?v=<?= $assetVersion('js/online/game-view.js') ?>",
            "./js/online/room-view.js": "./js/online/room-view.js?v=<?= $assetVersion('js/online/room-view.js') ?>",
            "./js/online/room-actions.js": "./js/online/room-actions.js?v=<?= $assetVersion('js/online/room-actions.js') ?>",
            "./js/online/game-controls.js": "./js/online/game-controls.js?v=<?= $assetVersion('js/online/game-controls.js') ?>",
            "./js/online/lobby-controls.js": "./js/online/lobby-controls.js?v=<?= $assetVersion('js/online/lobby-controls.js') ?>",
            "./js/online/room-controls.js": "./js/online/room-controls.js?v=<?= $assetVersion('js/online/room-controls.js') ?>"
        }
    }
    </script>
</head>
<body data-css-versions='<?= htmlspecialchars(json_encode([
            'css/components-auth.css' => $assetVersion('css/components-auth.css'),
            'css/components-player-selection.css' => $assetVersion('css/components-player-selection.css'),
            'css/components-online.css' => $assetVersion('css/components-online.css'),
            'css/components-chat.css' => $assetVersion('css/components-chat.css'),
            'css/components-settings.css' => $assetVersion('css/components-settings.css'),
            'css/components-rules.css' => $assetVersion('css/components-rules.css'),
            'css/components-game.css' => $assetVersion('css/components-game.css'),
            'css/animations.css' => $assetVersion('css/animations.css')
        ]), ENT_QUOTES, 'UTF-8') ?>'>
<!-- Loading Screen -->
    <div id="loading-screen" class="loading-screen">
        <div class="loader">
            <h2 class="glitch">ČLOVĚČE NEZLOB SE</h2>
            <p>Načítání hry...</p>
        </div>
    </div>

    <!-- Main Menu -->
    <div id="main-menu" class="menu-screen hidden">
        <div class="menu-bg">
            <div class="auth-buttons">
                <button id="login-menu-btn" class="menu-btn secondary">
                    <span>PŘIHLÁSIT SE</span>
                    <i class="fas fa-sign-in-alt"></i>
                </button>
            </div>
            <div class="menu-content">
                <div id="user-info" class="user-info hidden">
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
                
                <h1 class="game-title glitch">ČLOVĚČE NEZLOB SE</h1>
                <div class="game-logo">
                    <i class="fas fa-dice"></i>
                </div>
                
                <div class="menu-buttons">
                    <button id="play-btn" class="menu-btn">
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
                
            </div>
            <div class="credits">
                <p>Vytvořeno s <i class="fas fa-heart"></i> pro zábavu</p>
            </div>
        </div>
    </div>

    <!-- Potvrzení opuštění aplikace při systémovém tlačítku Zpět na hlavním menu. -->
    <div id="exit-confirm" class="exit-confirm hidden" aria-hidden="true">
        <div class="exit-confirm__backdrop"></div>
        <section class="exit-confirm__dialog" role="dialog" aria-modal="true" aria-labelledby="exit-confirm-title">
            <div class="exit-confirm__icon"><i class="fas fa-door-open" aria-hidden="true"></i></div>
            <h2 id="exit-confirm-title">Opravdu opustit</h2>
            <p>Člověče, nezlob se</p>
            <div class="exit-confirm__actions">
                <button id="exit-confirm-yes" class="menu-btn" type="button">ANO</button>
                <button id="exit-confirm-no" class="menu-btn secondary" type="button">NE</button>
            </div>
        </section>
    </div>

    <!-- Obrazovky se načítají jednotlivě až při otevření. -->
    <div id="screen-container"></div>


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
    <?php if ($debugMode): ?>
    <script type="module" src="js/debug-bootstrap.js?v=<?= $assetVersion('js/debug-bootstrap.js') ?>"></script>
    <?php endif; ?>
    <script type="module" src="js/bootstrap.js?v=<?= $assetVersion('js/bootstrap.js') ?>"></script>
</body>
</html>
