<?php
declare(strict_types=1);

/** Read compact AI memory, or incrementally train it from new human feedback files. */
$requestIsHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
ini_set('session.use_strict_mode', '1');
ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_secure', $requestIsHttps ? '1' : '0');
ini_set('session.cookie_samesite', 'Lax');
if (session_status() !== PHP_SESSION_ACTIVE) session_start();
require_once __DIR__ . '/config.php';
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Content-Type: application/json; charset=utf-8');

function aiMemoryRespond(array $data, int $status = 200): never {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function aiMemoryFail(string $message, int $status): never { aiMemoryRespond(['success' => false, 'error' => $message], $status); }

function aiMemorySignature(array $game): ?string {
    $players = is_array($game['players'] ?? null) ? $game['players'] : [];
    $piecesSource = is_array($game['piecesBefore'] ?? null) ? $game['piecesBefore'] : [];
    usort($players, static fn($a, $b) => (int)($a['slot'] ?? 0) <=> (int)($b['slot'] ?? 0));
    $currentSlot = (int)($game['currentPlayer'] ?? -1);
    foreach ($players as $player) {
        if ((int)($player['id'] ?? -2) === (int)($game['currentPlayer'] ?? -1)) {
            $currentSlot = (int)($player['slot'] ?? $currentSlot);
            break;
        }
    }
    $normalizedPlayers = [];
    foreach ($players as $player) {
        $group = null;
        foreach ($piecesSource as $candidate) {
            if ((int)($candidate['playerId'] ?? -999) === (int)($player['id'] ?? -1)) { $group = $candidate; break; }
        }
        $steps = [];
        foreach (($group['pieces'] ?? []) as $piece) $steps[] = (int)($piece['steps'] ?? -1);
        $normalizedPlayers[] = ['slot' => (int)($player['slot'] ?? 0), 'start' => (int)($player['start'] ?? 0), 'pieces' => $steps];
    }
    $normalized = [
        'boardSize' => (int)($game['boardSize'] ?? $game['trackLength'] ?? 0),
        'trackLength' => (int)($game['trackLength'] ?? 0),
        'playerCount' => count($players),
        'rules' => is_array($game['rules'] ?? null) ? $game['rules'] : (object)[],
        'currentSlot' => $currentSlot,
        'diceValue' => (int)($game['diceValue'] ?? 0),
        'players' => $normalizedPlayers,
    ];
    return json_encode($normalized, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}
function aiMemoryPieceId(array $record): ?int {
    if (($record['feedbackType'] ?? '') === 'positive') {
        $id = $record['context']['decision']['selectedPieceId'] ?? null;
        return is_numeric($id) && (int)$id >= 0 && (int)$id < 4 ? (int)$id : null;
    }
    $instruction = strtolower((string)($record['instruction'] ?? ''));
    if (preg_match('/(?:figurk(?:u|a|y|ou)?|fig\.?|\bf)\s*(?:č(?:íslo)?\.?\s*)?([1-4])\b/u', $instruction, $m)) return (int)$m[1] - 1;
    return null;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { header('Allow: POST'); aiMemoryFail('Nepodporovaná metoda.', 405); }
if (strtolower((string)($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '')) === 'cross-site') aiMemoryFail('Požadavek musí pocházet z této stránky.', 403);
$origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
if ($origin !== '') {
    $originHost = strtolower((string)parse_url($origin, PHP_URL_HOST));
    $requestHost = strtolower(preg_replace('/:\\d+$/', '', (string)($_SERVER['HTTP_HOST'] ?? '')));
    if ($originHost === '' || $requestHost === '' || !hash_equals($requestHost, $originHost)) aiMemoryFail('Požadavek musí pocházet z této stránky.', 403);
}
$csrf = (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
$sessionCsrf = (string)($_SESSION['ai_training_csrf'] ?? '');
if ($csrf === '' || $sessionCsrf === '' || !hash_equals($sessionCsrf, $csrf)) aiMemoryFail('Bezpečnostní token vypršel. Obnov stránku a zkus to znovu.', 403);
$raw = file_get_contents('php://input');
if (!is_string($raw) || strlen($raw) > 8192) aiMemoryFail('Neplatný požadavek.', 400);
try { $payload = json_decode($raw, true, 16, JSON_THROW_ON_ERROR); }
catch (JsonException $error) { aiMemoryFail('Neplatný JSON požadavku.', 400); }
$action = (string)($payload['action'] ?? '');
if (!in_array($action, ['memory', 'train'], true)) aiMemoryFail('Neznámá operace.', 400);

$root = __DIR__ . '/storage/ai-training';
$directory = $root . '/instructions';
$storageRoot = realpath(__DIR__ . '/storage');
$realRoot = realpath($root);
$realDirectory = realpath($directory);
$rootDeny = $root . '/.htaccess';
$instructionsDeny = $directory . '/.htaccess';
if ($storageRoot === false || $realRoot === false || $realDirectory === false
    || !str_starts_with($realRoot . DIRECTORY_SEPARATOR, $storageRoot . DIRECTORY_SEPARATOR)
    || !str_starts_with($realDirectory . DIRECTORY_SEPARATOR, $realRoot . DIRECTORY_SEPARATOR)
    || is_link($root) || is_link($directory)
    || !is_file($rootDeny) || !preg_match('/^\s*Require\s+all\s+denied\s*$/mi', (string)@file_get_contents($rootDeny))
    || !is_file($instructionsDeny) || !preg_match('/^\s*Require\s+all\s+denied\s*$/mi', (string)@file_get_contents($instructionsDeny))) {
    aiMemoryFail('Úložiště AI nemá potvrzenou ochranu.', 500);
}
$memoryPath = $realRoot . '/ai-memory.json';
$lock = @fopen($realRoot . '/ai-memory.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX)) aiMemoryFail('Paměť AI je právě uzamčena.', 503);
$memory = ['version' => 1, 'updatedAt' => null, 'totalProcessed' => 0, 'lastFile' => '', 'situations' => []];
if (is_file($memoryPath) && !is_link($memoryPath)) {
    $saved = json_decode((string)@file_get_contents($memoryPath), true);
    if (is_array($saved) && (int)($saved['version'] ?? 0) === 1 && is_array($saved['situations'] ?? null)) $memory = $saved;
}
$processedNow = 0;
if ($action === 'train') {
    // The queue is append-only. It is initialized from old JSON files once,
    // then each new feedback save appends one filename. No directory scan per turn.
    $queuePath = $realRoot . '/.training-queue';
    $queueLock = @fopen($realRoot . '/.training-queue.lock', 'c');
    if (!$queueLock || !flock($queueLock, LOCK_EX)) {
        if (is_resource($queueLock)) fclose($queueLock);
        flock($lock, LOCK_UN); fclose($lock);
        aiMemoryFail('Fronta výuky AI je právě uzamčena.', 503);
    }
    $initializedPath = $realRoot . '/.training-queue.initialized';
    if (!is_file($initializedPath)) {
        $existing = glob($realDirectory . DIRECTORY_SEPARATOR . '*.json') ?: [];
        sort($existing, SORT_STRING);
        $queueTemp = $queuePath . '.tmp';
        $queueHandle = @fopen($queueTemp, 'wb');
        $queueOk = $queueHandle !== false;
        if ($queueOk) {
            foreach ($existing as $existingPath) {
                $line = basename($existingPath) . "\n";
                if (fwrite($queueHandle, $line) !== strlen($line)) { $queueOk = false; break; }
            }
            $queueOk = fflush($queueHandle) && $queueOk;
            fclose($queueHandle);
        }
        if (!$queueOk || !rename($queueTemp, $queuePath) || file_put_contents($initializedPath, "1\n", LOCK_EX) === false) {
            @unlink($queueTemp);
            flock($queueLock, LOCK_UN); fclose($queueLock);
            flock($lock, LOCK_UN); fclose($lock);
            aiMemoryFail('Frontu výuky AI se nepodařilo bezpečně připravit.', 500);
        }
    }
    $queueHandle = @fopen($queuePath, 'rb');
    if ($queueHandle === false || is_link($queuePath)) {
        if (is_resource($queueHandle)) fclose($queueHandle);
        flock($queueLock, LOCK_UN); fclose($queueLock);
        flock($lock, LOCK_UN); fclose($lock);
        aiMemoryFail('Fronta výuky AI není dostupná.', 500);
    }
    $offset = max(0, (int)($memory['queueOffset'] ?? 0));
    if (fseek($queueHandle, $offset) !== 0) {
        fclose($queueHandle); flock($queueLock, LOCK_UN); fclose($queueLock);
        flock($lock, LOCK_UN); fclose($lock);
        aiMemoryFail('Nelze pokračovat ve frontě výuky AI.', 500);
    }
    while (($line = fgets($queueHandle)) !== false) {
        $nextOffset = ftell($queueHandle);
        $name = trim($line);
        if ($name === '' || !preg_match('/^\\d{8}-\\d{6}-\\d{4,}-(ok|err)\\.json$/', $name, $nameMatch)) {
            $memory['queueOffset'] = $nextOffset;
            continue;
        }
        if ($name <= (string)($memory['lastFile'] ?? '')) {
            $memory['queueOffset'] = $nextOffset;
            continue;
        }
        $filePath = $realDirectory . DIRECTORY_SEPARATOR . $name;
        if (is_link($filePath) || !is_file($filePath) || filesize($filePath) > 65536) {
            $memory['lastFile'] = $name;
            $memory['queueOffset'] = $nextOffset;
            continue;
        }
        $record = json_decode((string)@file_get_contents($filePath), true);
        if (!is_array($record) || !in_array($record['feedbackType'] ?? '', ['correction', 'positive'], true)
            || !is_array($record['context']['game'] ?? null) || !is_array($record['context']['decision'] ?? null)) {
            $memory['lastFile'] = $name;
            $memory['queueOffset'] = $nextOffset;
            continue;
        }
        $expected = $record['feedbackType'] === 'positive' ? 'ok' : 'err';
        if (!hash_equals($expected, $nameMatch[1])) {
            $memory['lastFile'] = $name;
            $memory['queueOffset'] = $nextOffset;
            continue;
        }
        $pieceId = aiMemoryPieceId($record);
        $signature = aiMemorySignature($record['context']['game']);
        if ($pieceId !== null && $signature !== null) {
            if (!isset($memory['situations'][$signature])) $memory['situations'][$signature] = ['votes' => [0, 0, 0, 0], 'ok' => 0, 'err' => 0, 'samples' => 0];
            $memory['situations'][$signature]['votes'][$pieceId] = (int)($memory['situations'][$signature]['votes'][$pieceId] ?? 0) + 1;
            $memory['situations'][$signature][$expected] = (int)($memory['situations'][$signature][$expected] ?? 0) + 1;
            $memory['situations'][$signature]['samples'] = (int)($memory['situations'][$signature]['samples'] ?? 0) + 1;
        }
        $memory['lastFile'] = $name;
        $memory['queueOffset'] = $nextOffset;
        $memory['totalProcessed'] = (int)($memory['totalProcessed'] ?? 0) + 1;
        $processedNow++;
    }
    $memory['updatedAt'] = gmdate('c');
    $json = json_encode($memory, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    $temp = $memoryPath . '.tmp';
    fclose($queueHandle);
    flock($queueLock, LOCK_UN); fclose($queueLock);
    if (!is_string($json) || file_put_contents($temp, $json, LOCK_EX) === false || !rename($temp, $memoryPath)) {
        @unlink($temp); flock($lock, LOCK_UN); fclose($lock);
        aiMemoryFail('Zápis trvalé paměti AI selhal; zdrojové JSON zůstaly zachovány.', 500);
    }
}
flock($lock, LOCK_UN); fclose($lock);
aiMemoryRespond(['success' => true, 'mode' => $action, 'processedNow' => $processedNow,
    'totalProcessed' => (int)($memory['totalProcessed'] ?? 0), 'situationCount' => count($memory['situations'] ?? []), 'memory' => $memory]);
