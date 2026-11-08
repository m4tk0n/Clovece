<?php
declare(strict_types=1);

/**
 * Read-only delivery of newly saved AI teaching examples.
 * Original JSON files remain private and immutable.
 */
$requestIsHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
ini_set('session.use_strict_mode', '1');
ini_set('session.cookie_httponly', '1');
ini_set('session.cookie_secure', $requestIsHttps ? '1' : '0');
ini_set('session.cookie_samesite', 'Lax');
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
require_once __DIR__ . '/config.php';

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Content-Type: application/json; charset=utf-8');

function knowledgeRespond(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function knowledgeFail(string $message, int $status): never
{
    knowledgeRespond(['success' => false, 'error' => $message], $status);
}

function knowledgeSameOrigin(): bool
{
    if (strtolower((string) ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '')) === 'cross-site') {
        return false;
    }
    $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    if ($origin === '') return true;
    $originHost = strtolower((string) parse_url($origin, PHP_URL_HOST));
    $requestHost = strtolower(preg_replace('/:\\d+$/', '', (string) ($_SERVER['HTTP_HOST'] ?? '')));
    return $originHost !== '' && $requestHost !== '' && hash_equals($requestHost, $originHost);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: POST');
    knowledgeFail('Nepodporovaná metoda.', 405);
}
if (!knowledgeSameOrigin()) knowledgeFail('Požadavek musí pocházet z této stránky.', 403);

$csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
$sessionCsrf = (string) ($_SESSION['ai_training_csrf'] ?? '');
if ($csrf === '' || $sessionCsrf === '' || !hash_equals($sessionCsrf, $csrf)) {
    knowledgeFail('Bezpečnostní token vypršel. Obnov stránku a zkus to znovu.', 403);
}

$contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($contentLength > 8192) knowledgeFail('Požadavek je příliš velký.', 413);
$raw = file_get_contents('php://input');
if (!is_string($raw) || $raw === '' || strlen($raw) > 8192) {
    knowledgeFail('Chybí požadavek na načtení instrukcí.', 400);
}
try {
    $payload = json_decode($raw, true, 16, JSON_THROW_ON_ERROR);
} catch (JsonException $error) {
    knowledgeFail('Požadavek nemá platný JSON formát.', 400);
}
if (($payload['action'] ?? '') !== 'knowledge') knowledgeFail('Neznámá operace.', 400);
$since = $payload['since'] ?? 0;
if (!is_numeric($since) || !is_finite((float) $since) || (float) $since < 0) {
    knowledgeFail('Neplatný čas poslední kontroly.', 400);
}

$scanStartedAt = time();
$directory = __DIR__ . '/storage/ai-training/instructions';
$storageRoot = realpath(__DIR__ . '/storage');
if (!is_dir($directory)) {
    knowledgeRespond(['success' => true, 'scanStartedAt' => $scanStartedAt, 'instructions' => []]);
}
$realDirectory = realpath($directory);
$htaccess = $directory . DIRECTORY_SEPARATOR . '.htaccess';
$denyContents = is_file($htaccess) && !is_link($htaccess) ? @file_get_contents($htaccess) : false;
if ($realDirectory === false || $storageRoot === false || is_link($directory)
    || !str_starts_with($realDirectory . DIRECTORY_SEPARATOR, $storageRoot . DIRECTORY_SEPARATOR)
    || !is_string($denyContents)
    || !preg_match('/^\\s*Require\\s+all\\s+denied\\s*$/mi', $denyContents)
) {
    knowledgeFail('Úložiště instrukcí nemá potvrzenou ochranu proti přímému přístupu.', 500);
}

$instructions = [];
$minimumMtime = max(0, (int) floor((float) $since) - 2);
$files = glob($realDirectory . DIRECTORY_SEPARATOR . '*.json') ?: [];
foreach ($files as $filePath) {
    $fileName = basename($filePath);
    if (!preg_match('/^\\d{8}-\\d{6}-(\\d{4,})-(ok|err)\\.json$/', $fileName, $matches)) continue;
    if (is_link($filePath) || !is_file($filePath)) continue;
    $modifiedAt = @filemtime($filePath);
    if ($modifiedAt === false || $modifiedAt < $minimumMtime) continue;
    $contents = @file_get_contents($filePath);
    if (!is_string($contents) || strlen($contents) > 65536) continue;
    try {
        $record = json_decode($contents, true, 32, JSON_THROW_ON_ERROR);
    } catch (JsonException $error) {
        continue;
    }
    $recordId = strtolower((string) ($record['id'] ?? ''));
    $expectedSuffix = ($record['feedbackType'] ?? '') === 'positive' ? 'ok' : 'err';
    if (!is_array($record)
        || !preg_match('/^[a-f0-9]{32}$/', $recordId)
        || !in_array($record['feedbackType'] ?? '', ['correction', 'positive'], true)
        || !hash_equals($expectedSuffix, $matches[2])
        || !is_array($record['context'] ?? null)
        || !is_array($record['context']['game'] ?? null)
        || !is_array($record['context']['decision'] ?? null)
    ) continue;

    $sourceGame = $record['context']['game'];
    $sourcePlayers = is_array($sourceGame['players'] ?? null) ? $sourceGame['players'] : [];
    $sourcePieces = is_array($sourceGame['piecesBefore'] ?? null) ? $sourceGame['piecesBefore'] : [];
    $players = [];
    foreach ($sourcePlayers as $player) {
        if (!is_array($player)) continue;
        $players[] = [
            'id' => (int) ($player['id'] ?? -1),
            'slot' => (int) ($player['slot'] ?? -1),
            'start' => (int) ($player['start'] ?? 0),
        ];
    }
    $piecesBefore = [];
    foreach ($sourcePieces as $group) {
        if (!is_array($group)) continue;
        $pieces = [];
        foreach (($group['pieces'] ?? []) as $piece) {
            if (is_array($piece) && isset($piece['steps'])) $pieces[] = ['steps' => (int) $piece['steps']];
        }
        $piecesBefore[] = ['playerId' => (int) ($group['playerId'] ?? -1), 'pieces' => $pieces];
    }

    $instruction = trim((string) ($record['instruction'] ?? ''));
    if (($record['feedbackType'] ?? '') === 'correction' && $instruction === '') continue;
    $instructions[] = [
        'id' => $recordId,
        'feedbackType' => $record['feedbackType'],
        'createdAt' => (string) ($record['createdAt'] ?? ''),
        'instruction' => $record['feedbackType'] === 'correction' ? $instruction : null,
        'note' => $record['feedbackType'] === 'positive' ? (string) ($record['note'] ?? '') : null,
        'context' => [
            'game' => [
                'boardSize' => (int) ($sourceGame['boardSize'] ?? 0),
                'trackLength' => (int) ($sourceGame['trackLength'] ?? 0),
                'playerCount' => (int) ($sourceGame['playerCount'] ?? count($players)),
                'players' => $players,
                'rules' => is_array($sourceGame['rules'] ?? null) ? $sourceGame['rules'] : [],
                'currentPlayer' => (int) ($sourceGame['currentPlayer'] ?? -1),
                'diceValue' => (int) ($sourceGame['diceValue'] ?? 0),
                'piecesBefore' => $piecesBefore,
            ],
            'decision' => [
                'selectedPieceId' => isset($record['context']['decision']['selectedPieceId'])
                    ? (int) $record['context']['decision']['selectedPieceId'] : null,
            ],
        ],
    ];
}
usort($instructions, static fn(array $a, array $b): int => strcmp($a['createdAt'], $b['createdAt']));
knowledgeRespond([
    'success' => true,
    'scanStartedAt' => $scanStartedAt,
    'instructions' => $instructions,
]);
