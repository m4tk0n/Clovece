<?php
declare(strict_types=1);

/** Persistent, immediately applied human feedback for individual AI weight IDs. */
$requestIsHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
ini_set('session.use_strict_mode', '1');
ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_secure', $requestIsHttps ? '1' : '0');
ini_set('session.cookie_samesite', 'Lax');
if (session_status() !== PHP_SESSION_ACTIVE) session_start();
require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

function aiWeightRespond(array $data, int $status = 200): never {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function aiWeightFail(string $message, int $status): never {
    aiWeightRespond(['success' => false, 'error' => $message], $status);
}
function aiWeightSameOrigin(): bool {
    if (strtolower((string)($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '')) === 'cross-site') return false;
    $origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
    if ($origin === '') return true;
    $originHost = strtolower((string)parse_url($origin, PHP_URL_HOST));
    $requestHost = strtolower(preg_replace('/:\\d+$/', '', (string)($_SERVER['HTTP_HOST'] ?? '')));
    return $originHost !== '' && $requestHost !== '' && hash_equals($requestHost, $originHost);
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    aiWeightFail('Nepodporovaná metoda.', 405);
}
if (!aiWeightSameOrigin()) aiWeightFail('Požadavek musí pocházet z této stránky.', 403);
$csrf = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
$sessionCsrf = (string)($_SESSION['ai_training_csrf'] ?? '');
if ($csrf === '' || $sessionCsrf === '' || !hash_equals($sessionCsrf, $csrf)) {
    aiWeightFail('Bezpečnostní token vypršel. Obnov stránku a zkus to znovu.', 403);
}
$raw = file_get_contents('php://input');
if (!is_string($raw) || $raw === '' || strlen($raw) > 8192) aiWeightFail('Neplatný požadavek.', 400);
try { $payload = json_decode($raw, true, 16, JSON_THROW_ON_ERROR); }
catch (JsonException $error) { aiWeightFail('Požadavek nemá platný JSON.', 400); }
$action = (string)($payload['action'] ?? '');
if (!in_array($action, ['load', 'feedback'], true)) aiWeightFail('Neznámá operace.', 400);

$storage = __DIR__ . '/storage';
$root = $storage . '/ai-training';
if (is_link($storage) || is_link($root)) aiWeightFail('Úložiště AI není bezpečné.', 500);
if (!is_dir($storage) && !@mkdir($storage, 0700, true) && !is_dir($storage)) aiWeightFail('Nelze vytvořit úložiště.', 500);
if (!is_dir($root) && !@mkdir($root, 0700, true) && !is_dir($root)) aiWeightFail('Nelze vytvořit adresář AI.', 500);
$storageDeny = $storage . '/.htaccess';
if (!is_file($storageDeny)) {
    $denyHandle = @fopen($storageDeny, 'x');
    if ($denyHandle !== false) {
        $denyRule = "Require all denied\\n";
        $ok = fwrite($denyHandle, $denyRule) === strlen($denyRule) && fflush($denyHandle);
        fclose($denyHandle);
        if (!$ok) aiWeightFail('Nelze zabezpečit úložiště AI.', 500);
    }
}
$rootDeny = $root . '/.htaccess';
if (!is_file($rootDeny)) {
    $denyHandle = @fopen($rootDeny, 'x');
    if ($denyHandle !== false) {
        $denyRule = "Require all denied\\n";
        $ok = fwrite($denyHandle, $denyRule) === strlen($denyRule) && fflush($denyHandle);
        fclose($denyHandle);
        if (!$ok) aiWeightFail('Nelze zabezpečit váhy AI.', 500);
    }
}
$realStorage = realpath($storage);
$realRoot = realpath($root);
if ($realStorage === false || $realRoot === false
    || !str_starts_with($realRoot . DIRECTORY_SEPARATOR, $realStorage . DIRECTORY_SEPARATOR)
    || is_link($storage) || is_link($root)
    || !is_file($storageDeny) || !preg_match('/^\\s*Require\\s+all\\s+denied\\s*$/mi', (string)@file_get_contents($storageDeny))
    || !is_file($rootDeny) || !preg_match('/^\\s*Require\\s+all\\s+denied\\s*$/mi', (string)@file_get_contents($rootDeny))) {
    aiWeightFail('Úložiště AI nemá potvrzenou ochranu.', 500);
}
$file = $realRoot . '/ai-learned-weights.json';
$lockPath = $realRoot . '/.ai-learned-weights.lock';
if (is_link($file) || is_link($lockPath)) aiWeightFail('Soubor naučených vah není bezpečný.', 500);
$lock = @fopen($lockPath, 'c');
if ($lock === false || !flock($lock, LOCK_EX)) {
    if (is_resource($lock)) fclose($lock);
    aiWeightFail('Váhy AI jsou právě uzamčeny.', 503);
}
$state = ['version' => 1, 'updatedAt' => null, 'feedbackCount' => 0, 'values' => [], 'history' => []];
if (is_file($file)) {
    $saved = json_decode((string)@file_get_contents($file), true);
    if (!is_array($saved) || (int)($saved['version'] ?? 0) !== 1 || !is_array($saved['values'] ?? null)) {
        flock($lock, LOCK_UN); fclose($lock);
        aiWeightFail('Soubor naučených vah je poškozený.', 500);
    }
    $state = array_merge($state, $saved);
}
if ($action === 'feedback') {
    $id = filter_var($payload['id'] ?? null, FILTER_VALIDATE_INT);
    $answer = (string)($payload['answer'] ?? '');
    $signalDelta = filter_var($payload['signalDelta'] ?? null, FILTER_VALIDATE_FLOAT);
    $currentValue = filter_var($payload['currentValue'] ?? null, FILTER_VALIDATE_FLOAT);
    $reserved = is_int($id) && (
        ($id >= 417 && $id <= 430) || ($id >= 441 && $id <= 500)
        || ($id >= 941 && $id <= 960) || ($id >= 971 && $id <= 1000)
    );
    if (!is_int($id) || $id < 1 || $id > 1000 || $reserved
        || !in_array($answer, ['yes', 'no'], true)
        || $signalDelta === false || !is_finite((float)$signalDelta)
        || abs((float)$signalDelta) < 0.001 || abs((float)$signalDelta) > 1
        || $currentValue === false || !is_finite((float)$currentValue)
        || abs((float)$currentValue) > 10000) {
        flock($lock, LOCK_UN); fclose($lock);
        aiWeightFail('Hodnocení proměnné nemá platné údaje.', 400);
    }
    $before = array_key_exists((string)$id, $state['values'])
        ? (float)$state['values'][(string)$id] : (float)$currentValue;
    $direction = ((float)$signalDelta > 0 ? 1 : -1) * ($answer === 'yes' ? 1 : -1);
    $step = max(0.1, min(5.0, abs($before) * 0.02));
    $after = max(-10000, min(10000, $before + $direction * $step));
    if (!is_finite($after)) {
        flock($lock, LOCK_UN); fclose($lock);
        aiWeightFail('Výpočet nové váhy selhal.', 500);
    }
    $state['values'][(string)$id] = round($after, 8);
    $state['feedbackCount'] = (int)$state['feedbackCount'] + 1;
    $state['updatedAt'] = gmdate('c');
    $state['history'][] = [
        'id' => $id, 'answer' => $answer, 'signalDelta' => (float)$signalDelta,
        'before' => $before, 'after' => $after, 'createdAt' => $state['updatedAt']
    ];
    if (count($state['history']) > 500) $state['history'] = array_slice($state['history'], -500);
}
$json = json_encode($state, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . PHP_EOL;
$temp = $file . '.tmp';
$written = @file_put_contents($temp, $json, LOCK_EX);
if ($written !== strlen($json) || !@rename($temp, $file)) {
    @unlink($temp);
    flock($lock, LOCK_UN); fclose($lock);
    aiWeightFail('Naučené váhy se nepodařilo uložit.', 500);
}
flock($lock, LOCK_UN);
fclose($lock);
aiWeightRespond([
    'success' => true,
    'values' => $state['values'],
    'feedbackCount' => (int)$state['feedbackCount'],
    'updatedId' => $action === 'feedback' ? $id : null,
    'before' => $action === 'feedback' ? $before : null,
    'after' => $action === 'feedback' ? $after : null,
    'updatedAt' => $state['updatedAt']
]);
