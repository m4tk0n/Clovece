<?php
// /debug/ai-training.php
declare(strict_types=1);

/**
 * Ukládání výslovných lidských instrukcí pro AI.
 * Každá instrukce vzniká jako nový JSON soubor ve storage; endpoint neumí číst,
 * upravovat ani mazat již uložené záznamy.
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

require_once dirname(__DIR__) . '/config.php';

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

function aiTrainingRespond(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function aiTrainingFail(string $message, int $status): never
{
    aiTrainingRespond(['success' => false, 'error' => $message], $status);
}

function aiTrainingSameOrigin(): bool
{
    if (strtolower((string) ($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '')) === 'cross-site') {
        return false;
    }

    $origin = (string) ($_SERVER['HTTP_ORIGIN'] ?? '');
    if ($origin === '') {
        return true;
    }

    $originHost = strtolower((string) parse_url($origin, PHP_URL_HOST));
    $requestHost = strtolower(preg_replace('/:\\d+$/', '', (string) ($_SERVER['HTTP_HOST'] ?? '')));
    return $originHost !== '' && $requestHost !== '' && hash_equals($requestHost, $originHost);
}

if ($_SERVER['REQUEST_METHOD'] === 'GET' && ($_GET['action'] ?? '') === 'token') {
    if (!isset($_SESSION['debug_ai_training_csrf'])) {
        $_SESSION['debug_ai_training_csrf'] = bin2hex(random_bytes(32));
    }
    aiTrainingRespond(['success' => true, 'token' => $_SESSION['debug_ai_training_csrf']]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: GET, POST');
    aiTrainingFail('Nepodporovaná metoda.', 405);
}

if (!aiTrainingSameOrigin()) {
    aiTrainingFail('Požadavek musí pocházet z této stránky.', 403);
}

$csrf = (string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? '');
$sessionCsrf = (string) ($_SESSION['debug_ai_training_csrf'] ?? '');
if ($csrf === '' || $sessionCsrf === '' || !hash_equals($sessionCsrf, $csrf)) {
    aiTrainingFail('Bezpečnostní token vypršel. Obnov stránku a zkus to znovu.', 403);
}

$contentLength = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
if ($contentLength > 65536) {
    aiTrainingFail('Instrukce je příliš velká.', 413);
}

$raw = file_get_contents('php://input');
if (!is_string($raw) || $raw === '' || strlen($raw) > 65536) {
    aiTrainingFail('Chybí obsah instrukce.', 400);
}

try {
    $payload = json_decode($raw, true, 32, JSON_THROW_ON_ERROR);
} catch (JsonException $error) {
    aiTrainingFail('Instrukce nemá platný JSON formát.', 400);
}

$feedbackType = (string) ($payload['feedbackType'] ?? 'correction');
$instruction = trim((string) ($payload['instruction'] ?? ''));
$note = trim((string) ($payload['note'] ?? ''));
$context = $payload['context'] ?? null;
if (!in_array($feedbackType, ['correction', 'positive'], true)) {
    aiTrainingFail('Neznámý typ výukového záznamu.', 400);
}
$instructionLength = preg_match_all('/./us', $instruction, $instructionCharacters);
if ($feedbackType === 'correction'
    && ($instruction === '' || $instructionLength === false || $instructionLength > 3000)
) {
    aiTrainingFail('Instrukce musí obsahovat 1 až 3000 znaků.', 400);
}
if ($feedbackType === 'positive' && $instruction !== '') {
    aiTrainingFail('Potvrzení správného rozhodnutí nesmí obsahovat opravnou instrukci.', 400);
}
$noteLength = preg_match_all('/./us', $note, $noteCharacters);
if ($noteLength === false || $noteLength > 3000) {
    aiTrainingFail('Poznámka k rozhodnutí může mít nejvýše 3000 znaků.', 400);
}
if ($feedbackType === 'correction' && $note !== '') {
    aiTrainingFail('Opravná instrukce se ukládá do pole instruction.', 400);
}
if (!is_array($context)
    || ($context['format'] ?? '') !== 'clovece-ai-debug'
    || !is_array($context['game'] ?? null)
    || !is_array($context['decision'] ?? null)
    || !is_array($context['result'] ?? null)
) {
    aiTrainingFail('Chybí úplný záznam rozhodnutí AI.', 400);
}

$createdAtUnix = time();
$record = [
    'format' => $feedbackType === 'positive'
        ? 'clovece-ai-positive-example'
        : 'clovece-ai-human-instruction',
    'formatVersion' => 1,
    'feedbackType' => $feedbackType,
    'id' => bin2hex(random_bytes(16)),
    'createdAt' => gmdate('c', $createdAtUnix),
    'instruction' => $feedbackType === 'positive' ? null : $instruction,
    'note' => $feedbackType === 'positive' ? ($note !== '' ? $note : null) : null,
    'context' => $context,
    'sessionFingerprint' => hash('sha256', session_id()),
];

try {
    $json = json_encode(
        $record,
        JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
    ) . PHP_EOL;
} catch (JsonException $error) {
    aiTrainingFail('Záznam instrukce se nepodařilo připravit.', 400);
}

$directory = __DIR__ . '/storage/ai-training/instructions';
if (!is_dir($directory) && !@mkdir($directory, 0700, true) && !is_dir($directory)) {
    aiTrainingFail('Na serveru nelze vytvořit úložiště výuky AI.', 500);
}

// Zajistíme zákaz přímého HTTP přístupu i na hostingu, kde storage/.htaccess
// nebyl součástí FTP deploye. Existující ochranný soubor nikdy nepřepisujeme.
$instructionsHtaccess = $directory . DIRECTORY_SEPARATOR . '.htaccess';
$denyRule = "Require all denied\n";
if (!is_file($instructionsHtaccess)) {
    $denyHandle = @fopen($instructionsHtaccess, 'x');
    if ($denyHandle !== false) {
        $denyWritten = fwrite($denyHandle, $denyRule);
        fflush($denyHandle);
        fclose($denyHandle);
        if ($denyWritten !== strlen($denyRule)) {
            aiTrainingFail('Nepodařilo se zabezpečit úložiště instrukcí.', 500);
        }
    } elseif (!is_file($instructionsHtaccess)) {
        aiTrainingFail('Nepodařilo se zabezpečit úložiště instrukcí.', 500);
    }
}
$denyContents = @file_get_contents($instructionsHtaccess);
// Opravíme pouze přesně známý chybný soubor vytvořený starší verzí endpointu.
// Jiné existující ochranné soubory nikdy automaticky nepřepisujeme.
if (is_string($denyContents)
    && trim($denyContents) === 'Require all denied\\n'
    && !is_link($instructionsHtaccess)
) {
    $repairHandle = @fopen($instructionsHtaccess, 'c');
    if ($repairHandle === false) {
        aiTrainingFail('Chybně vytvořenou ochranu úložiště nelze opravit.', 500);
    }
    $repairOk = flock($repairHandle, LOCK_EX)
        && ftruncate($repairHandle, 0)
        && rewind($repairHandle)
        && fwrite($repairHandle, $denyRule) === strlen($denyRule)
        && fflush($repairHandle);
    flock($repairHandle, LOCK_UN);
    fclose($repairHandle);
    if (!$repairOk) {
        aiTrainingFail('Chybně vytvořenou ochranu úložiště nelze opravit.', 500);
    }
    $denyContents = @file_get_contents($instructionsHtaccess);
}
if (!is_string($denyContents) || !preg_match('/^\\s*Require\\s+all\\s+denied\\s*$/mi', $denyContents)) {
    aiTrainingFail('Úložiště instrukcí nemá potvrzenou ochranu proti přímému přístupu.', 500);
}

$realDirectory = realpath($directory);
$storageRoot = realpath(__DIR__ . '/storage');
if ($realDirectory === false || $storageRoot === false
    || !str_starts_with($realDirectory . DIRECTORY_SEPARATOR, $storageRoot . DIRECTORY_SEPARATOR)
    || !is_writable($realDirectory)
) {
    aiTrainingFail('Úložiště výuky AI není bezpečně dostupné.', 500);
}

// Přidělení pořadového čísla musí být serializované: souběžné požadavky
// nesmějí dostat stejné číslo. Zámek je samostatný skrytý soubor v privátním
// adresáři; pořadí se zjišťuje z již existujících JSON názvů, bez další DB.
$sequenceLockPath = $realDirectory . DIRECTORY_SEPARATOR . '.sequence.lock';
if (is_link($sequenceLockPath)) {
    aiTrainingFail('Zámek pořadí výukových záznamů není bezpečný.', 500);
}
$sequenceLock = @fopen($sequenceLockPath, 'c');
if ($sequenceLock === false || !flock($sequenceLock, LOCK_EX)) {
    if (is_resource($sequenceLock)) fclose($sequenceLock);
    aiTrainingFail('Nelze bezpečně přidělit pořadové číslo výukového záznamu.', 500);
}

$maxSequence = 0;
$existingFiles = glob($realDirectory . DIRECTORY_SEPARATOR . '*.json') ?: [];
foreach ($existingFiles as $existingFile) {
    if (preg_match('/^\\d{8}-\\d{6}-(\\d{4,})-(?:ok|err)\\.json$/', basename($existingFile), $sequenceMatch)) {
        $existingSequence = (int) $sequenceMatch[1];
        if ($existingSequence > $maxSequence) $maxSequence = $existingSequence;
    }
}
if ($maxSequence >= PHP_INT_MAX - 1) {
    flock($sequenceLock, LOCK_UN);
    fclose($sequenceLock);
    aiTrainingFail('Došlo pořadové číslování výukových záznamů.', 500);
}
$nextSequence = $maxSequence + 1;
$resultCode = $feedbackType === 'positive' ? 'ok' : 'err';
$fileName = gmdate('Ymd-His', $createdAtUnix)
    . '-' . sprintf('%04d', $nextSequence)
    . '-' . $resultCode . '.json';
$filePath = $realDirectory . DIRECTORY_SEPARATOR . $fileName;
$handle = @fopen($filePath, 'x');
if ($handle === false) {
    flock($sequenceLock, LOCK_UN);
    fclose($sequenceLock);
    aiTrainingFail('Nový soubor instrukce se nepodařilo vytvořit.', 500);
}

$written = 0;
$totalBytes = strlen($json);
$writeOk = flock($handle, LOCK_EX);
while ($writeOk && $written < $totalBytes) {
    $chunk = fwrite($handle, substr($json, $written));
    if ($chunk === false || $chunk === 0) {
        $writeOk = false;
        break;
    }
    $written += $chunk;
}
if ($writeOk) {
    $writeOk = fflush($handle);
}
flock($handle, LOCK_UN);
fclose($handle);
flock($sequenceLock, LOCK_UN);
fclose($sequenceLock);

if (!$writeOk || $written !== $totalBytes) {
    aiTrainingFail('Soubor instrukce se nepodařilo celý uložit. Původní záznam nebyl přepsán.', 500);
}

// Queue append makes new feedback discoverable without scanning the directory on every AI turn.
$trainingRoot = dirname($realDirectory);
$queuePath = $trainingRoot . DIRECTORY_SEPARATOR . '.training-queue';
$queueLockPath = $trainingRoot . DIRECTORY_SEPARATOR . '.training-queue.lock';
if (is_link($queuePath) || is_link($queueLockPath)) {
    @file_put_contents($trainingRoot . DIRECTORY_SEPARATOR . '.training-queue.needs-rebuild', "1\n", LOCK_EX);
    aiTrainingFail('Záznam byl uložen, ale frontu výuky je nutné obnovit.', 500);
}
$queueLock = @fopen($queueLockPath, 'c');
$queueOk = $queueLock !== false && flock($queueLock, LOCK_EX);
$queueHandle = $queueOk ? @fopen($queuePath, 'ab') : false;
$queueLine = $fileName . "\n";
if ($queueHandle === false || fwrite($queueHandle, $queueLine) !== strlen($queueLine) || !fflush($queueHandle)) {
    $queueOk = false;
}
if (is_resource($queueHandle)) fclose($queueHandle);
if (is_resource($queueLock)) {
    if ($queueOk) flock($queueLock, LOCK_UN);
    fclose($queueLock);
}
if (!$queueOk) {
    @file_put_contents($trainingRoot . DIRECTORY_SEPARATOR . '.training-queue.needs-rebuild', "1\n", LOCK_EX);
    aiTrainingFail('Záznam byl uložen, ale frontu výuky je nutné obnovit.', 500);
}

aiTrainingRespond([
    'success' => true,
    'id' => $record['id'],
    'createdAt' => $record['createdAt'],
]);
