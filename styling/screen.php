<?php
declare(strict_types=1);

/**
 * HTML menu obrazovek načítaný až při prvním otevření.
 * Povolené obrazovky jsou explicitní; herní obrazovka a výběr desky
 * ani figurek sem záměrně nepatří.
 */
$screens = [
    'login' => 'login.php',
    'register' => 'register.php',
    'lobby' => 'lobby.php',
    'room' => 'room.php',
    'settings' => 'settings.php',
    'rules' => 'rules.php',
    'local-games' => 'local-games.php',
    'profile' => 'profile.php',
];

$name = isset($_GET['screen']) && is_string($_GET['screen']) ? $_GET['screen'] : '';
if (!isset($screens[$name])) {
    http_response_code(404);
    header('Content-Type: text/plain; charset=UTF-8');
    exit('Obrazovka není součástí vývojového menu.');
}

$file = __DIR__ . '/../screens/' . $screens[$name];
if (!is_file($file) || !is_readable($file)) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=UTF-8');
    exit('HTML obrazovky není dostupné.');
}

header('Content-Type: text/html; charset=UTF-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
ob_start();
require $file;
$html = (string) ob_get_clean();
$html = preg_replace('/^\\/\\/ \\/screens\\/[^\\r\\n]*\\R/u', '', $html, 1) ?? $html;
echo $html;
