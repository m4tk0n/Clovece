<?php
// /styling/index.php
declare(strict_types=1);

/**
 * Samostatný vstup pro vývoj vzhledu aplikace.
 * Nezasahuje do produkčního ani debug prostředí.
 */
$cssDirectory = __DIR__ . '/css';
$cssFiles = [];

if (is_dir($cssDirectory)) {
    foreach (glob($cssDirectory . '/*.css') ?: [] as $file) {
        if (is_file($file)) {
            $cssFiles[] = [
                'url' => 'css/' . rawurlencode(basename($file)),
                'version' => (int) filemtime($file),
            ];
        }
    }
}
?>
<!DOCTYPE html>
<html lang="cs">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="robots" content="noindex, nofollow">
    <title>Styling | Člověče, nezlob se!</title>
    <?php foreach ($cssFiles as $css): ?>
    <link rel="stylesheet" href="<?= htmlspecialchars($css['url'], ENT_QUOTES, 'UTF-8') ?>?v=<?= $css['version'] ?>">
    <?php endforeach; ?>
</head>
<body>
    <main class="styling-app" id="styling-app">
        <header class="styling-header">
            <h1>Styling – vývoj vzhledu</h1>
        </header>
        <section class="styling-screen" id="screen-container" aria-live="polite">
            <!-- Vývojové obrazovky budou umístěny do adresáře styling/screens/. -->
        </section>
    </main>
</body>
</html>
