<?php
declare(strict_types=1);

/**
 * Vrací HTML jedné obrazovky. Obsah se načítá až při její první návštěvě.
 * Seznam je pevně daný – název souboru nikdy nepřebíráme přímo z URL.
 */
$screens = [
    'login' => 'login.php',
    'register' => 'register.php',
    'lobby' => 'lobby.php',
    'room' => 'room.php',
    'player-selection' => 'player-selection.php',
    'settings' => 'settings.php',
    'rules' => 'rules.php',
    'game' => 'game.php',
    'local-games' => 'local-games.php',
    'profile' => 'profile.php',
];

$name = isset($_GET['screen']) && is_string($_GET['screen'])
    ? $_GET['screen']
    : '';

if (!isset($screens[$name])) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=UTF-8');
    exit('Obrazovka nebyla nalezena.');
}

$file = __DIR__ . '/screens/' . $screens[$name];
if (!is_file($file) || !is_readable($file)) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=UTF-8');
    exit('Obsah obrazovky není dostupný.');
}

$etag = '"' . hash_file('sha256', $file) . '"';
header('Content-Type: text/html; charset=UTF-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: public, max-age=0, must-revalidate');
header('ETag: ' . $etag);

if (trim((string) ($_SERVER['HTTP_IF_NONE_MATCH'] ?? '')) === $etag) {
    http_response_code(304);
    exit;
}

require $file;
