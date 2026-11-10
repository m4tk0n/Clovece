<?php
declare(strict_types=1);

/**
 * Izolované prostředí pro vývoj kompletního menu.
 * Používá původní HTML obrazovek, ale vlastní navigaci a načítání stylů.
 */
$assets = [
    '../css/variables.css',
    '../css/reset.css',
    '../css/menu-base.css',
    '../css/menu-main.css',
    'css/00_styles.css',
];
function assetVersion(string $relative): int {
    $path = __DIR__ . '/' . $relative;
    return is_file($path) ? (int) filemtime($path) : 1;
}
?>
<!DOCTYPE html>
<html lang="cs">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="robots" content="noindex, nofollow">
    <title>Menu – Člověče, nezlob se!</title>
    <?php foreach ($assets as $asset): ?>
    <link rel="stylesheet" href="<?= htmlspecialchars($asset, ENT_QUOTES, 'UTF-8') ?>?v=<?= assetVersion($asset) ?>">
    <?php endforeach; ?>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Bangers&family=Rubik:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
</head>
<body>
    <div id="main-menu" class="menu-screen">
        <div class="menu-bg">
            <div class="auth-buttons" id="auth-buttons">
                <button id="login-menu-btn" class="menu-btn secondary" type="button">
                    <span>PŘIHLÁSIT SE</span><i class="fas fa-sign-in-alt" aria-hidden="true"></i>
                </button>
                <button id="account-avatar-btn" class="account-avatar hidden" type="button"
                    aria-label="Uživatelský účet" aria-haspopup="menu" aria-expanded="false"></button>
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
                <h1 class="game-title glitch">ČLOVĚČE, NEZLOB SE!</h1>
                <div class="game-logo" role="img" aria-label="Hrací kostka a dvě herní figurky">
                    <i class="fas fa-dice game-logo-die" aria-hidden="true"></i>
                    <span class="game-logo-pawns" aria-hidden="true">
                        <i class="fas fa-chess-pawn game-logo-pawn game-logo-pawn-one"></i>
                        <i class="fas fa-chess-pawn game-logo-pawn game-logo-pawn-two"></i>
                    </span>
                </div>
                <nav class="menu-buttons" aria-label="Hlavní menu">
                    <button id="play-btn" class="menu-btn" type="button"><span>MÍSTNÍ HRA</span><i class="fas fa-play"></i></button>
                    <button id="create-room-btn" class="menu-btn" type="button"><span>ROZEHRANÉ HRY</span><i class="fas fa-folder-open"></i></button>
                    <button id="join-room-btn" class="menu-btn" type="button"><span>ONLINE HRANÍ</span><i class="fas fa-door-open"></i></button>
                    <button id="settings-btn" class="menu-btn" type="button"><span>NASTAVENÍ</span><i class="fas fa-cog"></i></button>
                    <button id="rules-btn" class="menu-btn" type="button"><span>PRAVIDLA</span><i class="fas fa-book"></i></button>
                </nav>
            </div>

            <footer class="credits"><p>Vytvořeno pro zábavu</p></footer>
        </div>
    </div>

    <main id="screen-container" aria-live="polite"></main>
    <div id="toast" class="toast hidden" role="status" aria-live="polite"><span id="toast-message"></span></div>
    <script type="module" src="js/menu.js?v=<?= assetVersion('js/menu.js') ?>"></script>
</body>
</html>
