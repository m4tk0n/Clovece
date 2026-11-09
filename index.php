<?php
// /index.php
declare(strict_types=1);

/**
 * Vstupní bod webu.
 * Spustí lehkou pseudo-CRON kontrolu (nejvýše jednou za 5 minut)
 * a následně zobrazí základní shell aplikace.
 */

require_once __DIR__ . '/cron/cron.php';

// Verze všech lokálních assetů se odvozují z času změny konkrétního souboru.
$assetVersion = static function (string $path): int {
    $file = __DIR__ . '/' . ltrim($path, '/');
    return is_file($file) ? (int) filemtime($file) : 1;
};
$jsImportMap = [];
$cssAssetVersions = [];
foreach (['js', 'css'] as $assetDirectory) {
    $directory = __DIR__ . '/' . $assetDirectory;
    if (!is_dir($directory)) {
        continue;
    }
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($directory, FilesystemIterator::SKIP_DOTS)
    );
    foreach ($iterator as $assetFile) {
        if (!$assetFile->isFile()) {
            continue;
        }
        $relativePath = str_replace(
            DIRECTORY_SEPARATOR,
            '/',
            substr($assetFile->getPathname(), strlen(__DIR__) + 1)
        );
        $version = (int) $assetFile->getMTime();
        if ($assetDirectory === 'js' && str_ends_with($relativePath, '.js')) {
            $specifier = './' . $relativePath;
            $jsImportMap[$specifier] = $specifier . '?v=' . $version;
        } elseif ($assetDirectory === 'css' && str_ends_with($relativePath, '.css')) {
            $cssAssetVersions[$relativePath] = $version;
        }
    }
}
$importMap = [
    'imports' => array_merge(
        ['three' => 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js'],
        $jsImportMap
    )
];
$debugMode = isset($_GET['debug']) && (string) $_GET['debug'] === '1';
$trainingMode = isset($_GET['debug']) && in_array((string) $_GET['debug'], ['trainer', 'training'], true);
$testMode = isset($_GET['test']) && (string) $_GET['test'] === '1';
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
    <?php if ($testMode): ?>
    <link rel="stylesheet" href="css/test-runner.css?v=<?= $assetVersion('css/test-runner.css') ?>">
    <?php endif; ?>
    <?php if ($trainingMode): ?>
    <link rel="stylesheet" href="debug/css/ai-training.css?v=<?= $assetVersion('debug/css/ai-training.css') ?>">
    <?php endif; ?>
    <link href="https://fonts.googleapis.com/css2?family=Bangers&family=Press+Start+2P&family=Rubik:wght@500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script type="importmap">
    <?= json_encode($importMap, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>
    </script>
</head>
<body data-css-versions='<?= htmlspecialchars(json_encode($cssAssetVersions, JSON_UNESCAPED_SLASHES | JSON_HEX_APOS | JSON_HEX_QUOT), ENT_QUOTES, 'UTF-8') ?>'>
<?php if ($testMode): ?>
<aside id="live-test-panel" class="live-test-panel" aria-label="Automatické testování místní hry">
    <div class="live-test-heading" id="test-panel-drag-handle">
        <div class="test-heading-title"><strong>TESTOVACÍ LABORATOŘ</strong><span id="test-status">Připraveno</span></div>
        <div class="test-heading-actions" aria-label="Rychlé ovládání testu">
            <button id="test-start" type="button" title="Spustit" aria-label="Spustit test">▶</button>
            <button id="test-pause" type="button" title="Pozastavit" aria-label="Pozastavit test" disabled>Ⅱ</button>
            <button id="test-resume" type="button" title="Pokračovat" aria-label="Pokračovat v testu" disabled>▶</button>
            <button id="test-stop" type="button" title="Zastavit" aria-label="Zastavit test" disabled>■</button>
            <button id="test-report" type="button" title="Nahlásit chybu" aria-label="Nahlásit chybu" disabled>⚑</button>
            <button id="test-panel-collapse" type="button" aria-expanded="true" aria-label="Sbalit testovací panel" title="Sbalit panel">−</button>
        </div>
    </div>
    <div id="test-panel-content">
        <div class="test-rule-grid">
            <label><input type="checkbox" data-test-rule="threeRolls" checked> 3 hody</label>
            <label><input type="checkbox" data-test-rule="mustDeploy" checked> Povinnost nasadit</label>
            <label><input type="checkbox" data-test-rule="skipHomePieces" checked> Přeskakování v domečku</label>
            <label><input type="checkbox" data-test-rule="mustEnterHome" checked> Povinný vstup do domečku</label>
        </div>

        <div class="test-log-heading"><strong>Průběh testu</strong><span id="test-step-count">0 událostí</span></div>
        <ol id="test-live-log" class="test-live-log" aria-live="polite"><li>Čekám na spuštění automatické hry.</li></ol>
        <p class="test-panel-note">Hra běží ve skutečném herním rozhraní. Pravidla se předávají přímo do herního enginu.</p>

    </div>
</aside>
<?php endif; ?>

<!-- Loading Screen -->
    <div id="loading-screen" class="loading-screen">
        <div class="loader">
            <h2 class="glitch">ČLOVĚČE, NEZLOB SE!</h2>
            <p>Načítání hry...</p>
        </div>
    </div>

    <!-- Main Menu -->
    <div id="main-menu" class="menu-screen hidden">
        <div class="menu-bg">
            <div class="auth-buttons" id="auth-buttons">
                <button id="login-menu-btn" class="menu-btn secondary">
                    <span>PŘIHLÁSIT SE</span>
                    <i class="fas fa-sign-in-alt"></i>
                </button>
                <button id="account-avatar-btn" class="account-avatar hidden" type="button" aria-label="Uživatelský účet" aria-haspopup="menu" aria-expanded="false"></button>
                <div id="account-menu" class="account-dropdown hidden" role="menu" aria-label="Menu uživatelského účtu">
                    <button type="button" role="menuitem" data-account-action="profile"><i class="fas fa-user"></i><span>Profil</span></button>
                    <button type="button" role="menuitem" data-account-action="games"><i class="fas fa-dice"></i><span>Rozehrané hry</span></button>
                    <button type="button" role="menuitem" data-account-action="stats"><i class="fas fa-chart-column"></i><span>Statistiky</span></button>
                    <div class="account-dropdown-divider"></div>
                    <button type="button" role="menuitem" data-account-action="settings"><i class="fas fa-sliders"></i><span>Nastavení hry</span></button>
                    <button type="button" role="menuitem" data-account-action="logout" class="account-logout"><i class="fas fa-right-from-bracket"></i><span>Odhlásit se</span></button>
                </div>
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

                <h1 class="game-title glitch">ČLOVĚČE, NEZLOB SE!</h1>
                <div class="game-logo" role="img" aria-label="Hrací kostka a dvě herní figurky">
                    <i class="fas fa-dice game-logo-die" aria-hidden="true"></i>
                    <span class="game-logo-pawns" aria-hidden="true">
                        <i class="fas fa-chess-pawn game-logo-pawn game-logo-pawn-one"></i>
                        <i class="fas fa-chess-pawn game-logo-pawn game-logo-pawn-two"></i>
                    </span>
                </div>

                <div class="menu-buttons">
                    <button id="play-btn" class="menu-btn">
                        <span>MÍSTNÍ HRA</span>
                        <i class="fas fa-play"></i>
                    </button>
                    <button id="create-room-btn" class="menu-btn">
                        <span>ROZEHRANÉ HRY</span>
                        <i class="fas fa-folder-open"></i>
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
    <?php if ($debugMode || $trainingMode): ?>
    <script type="module" src="debug/js/debug-bootstrap.js?v=<?= $assetVersion('debug/js/debug-bootstrap.js') ?>"></script>
    <?php endif; ?>
    <script type="module" src="js/bootstrap.js?v=<?= $assetVersion('js/bootstrap.js') ?>"></script>
    <?php if ($testMode): ?>
    <script type="module" src="js/test-runner.js?v=<?= $assetVersion('js/test-runner.js') ?>"></script>
    <?php endif; ?>

</body>
</html>
