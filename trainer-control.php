<?php
declare(strict_types=1);

/**
 * Chráněný startovací bod pro vzdálený browser test hry.
 * GitHub Actions si vyžádá cílovou URL a následně ji otevře v Chromium.
 * Samotná hra se spouští přes existující testovací API v prohlížeči.
 */
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
error_reporting(E_ALL);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('X-Content-Type-Options: nosniff');

function trainerRespond(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    trainerRespond(['success' => false, 'error' => 'POST required'], 405);
}

require_once __DIR__ . '/config.php';

$expectedToken = $_ENV['REMOTE_TEST_TOKEN'] ?? '';
$authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
$providedToken = str_starts_with($authorization, 'Bearer ')
    ? substr($authorization, 7)
    : '';

if (!is_string($expectedToken) || strlen($expectedToken) < 32
    || !is_string($providedToken) || !hash_equals($expectedToken, $providedToken)) {
    trainerRespond(['success' => false, 'error' => 'Unauthorized'], 401);
}

$action = (string) ($_POST['action'] ?? '');
if ($action !== 'launch') {
    trainerRespond(['success' => false, 'error' => 'Unsupported action'], 400);
}

$baseUrl = 'https://' . ($_SERVER['HTTP_HOST'] ?? '7x.wz.cz') . rtrim(
    str_replace('\\\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/clovece/trainer-control.php')),
    '/'
) . '/';

trainerRespond([
    'success' => true,
    'action' => 'launch',
    'game_url' => $baseUrl . '?debug=trainer&test=1',
    'mode' => 'local-ai-browser-test',
    'message' => 'Cílová stránka je připravena. Hru spustí automatizovaný prohlížeč.',
]);
