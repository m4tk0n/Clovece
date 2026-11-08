<?php
declare(strict_types=1);

/**
 * Jediné centrální úložiště průběžného učení AI.
 * Model se ukládá do jednoho JSON souboru mimo veřejný přístup.
 */
if (session_status() !== PHP_SESSION_ACTIVE) {
    ini_set('session.use_strict_mode', '1');
    ini_set('session.cookie_httponly', '1');
    ini_set('session.cookie_samesite', 'Lax');
    session_start();
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

const AI_LEARNING_MODEL_FORMAT = 'clovece-search-policy';
const AI_LEARNING_MODEL_VERSION = 3;
const AI_LEARNING_MAX_REQUEST_BYTES = 8_000_000;

function aiLearningRespond(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function aiLearningDefaultModel(): array
{
    return [
        'format' => AI_LEARNING_MODEL_FORMAT,
        'version' => AI_LEARNING_MODEL_VERSION,
        'generation' => 0,
        'decisionsTrained' => 0,
        'gamesTrained' => 0,
        'weights' => array_fill(0, 1000, 0.0),
        'learningRate' => 0.02,
        'temperature' => 0.22,
        'featureNames' => [],
        'dynamicParameters' => [],
    ];
}

function aiLearningStoragePaths(): array
{
    $directory = __DIR__ . '/storage';
    if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) {
        throw new RuntimeException('Nelze vytvořit adresář centrálního učení AI.');
    }
    return [$directory . '/ai-learning-data.json', $directory . '/ai-learning-data.lock'];
}

function aiLearningReadModel(string $path): array
{
    if (!is_file($path)) return ['model' => aiLearningDefaultModel(), 'revision' => 0];
    $raw = file_get_contents($path);
    if ($raw === false || $raw === '') return ['model' => aiLearningDefaultModel(), 'revision' => 0];
    $stored = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
    if (!is_array($stored) || !is_array($stored['model'] ?? null) || !is_int($stored['revision'] ?? null)) {
        throw new RuntimeException('Centrální soubor učení AI má neplatnou strukturu.');
    }
    return $stored;
}

function aiLearningValidateModel(mixed $model): array
{
    if (!is_array($model)
        || ($model['format'] ?? null) !== AI_LEARNING_MODEL_FORMAT
        || (int) ($model['version'] ?? 0) !== AI_LEARNING_MODEL_VERSION
        || !is_array($model['weights'] ?? null)
        || count($model['weights']) !== 1000
        || !is_array($model['dynamicParameters'] ?? null)
    ) {
        aiLearningRespond(['success' => false, 'error' => 'Neplatný formát modelu AI.'], 422);
    }

    foreach ($model['weights'] as $weight) {
        if (!is_numeric($weight) || !is_finite((float) $weight) || abs((float) $weight) > 5.000001) {
            aiLearningRespond(['success' => false, 'error' => 'Model obsahuje neplatné váhy.'], 422);
        }
    }

    $cleanParameters = [];
    $seenKeys = [];
    foreach ($model['dynamicParameters'] as $parameter) {
        if (!is_array($parameter) || !is_string($parameter['key'] ?? null) || $parameter['key'] === '') continue;
        $key = substr($parameter['key'], 0, 240);
        if (isset($seenKeys[$key])) continue;
        $seenKeys[$key] = true;
        $cleanParameters[] = [
            'id' => max(1001, (int) ($parameter['id'] ?? 1001)),
            'key' => $key,
            'featureNames' => array_slice(array_values(array_filter($parameter['featureNames'] ?? [], 'is_string')), 0, 3),
            'weight' => max(-5.0, min(5.0, (float) ($parameter['weight'] ?? 0))),
            'visits' => max(0, (int) ($parameter['visits'] ?? 0)),
            'teacherSupport' => max(0, (int) ($parameter['teacherSupport'] ?? 0)),
            'teacherRejects' => max(0, (int) ($parameter['teacherRejects'] ?? 0)),
            'createdGeneration' => max(0, (int) ($parameter['createdGeneration'] ?? 0)),
            'lastUpdatedGeneration' => max(0, (int) ($parameter['lastUpdatedGeneration'] ?? 0)),
        ];
    }
    if (count($cleanParameters) > 50000) {
        aiLearningRespond(['success' => false, 'error' => 'Model překročil bezpečnostní limit dynamických parametrů.'], 422);
    }

    $model['weights'] = array_map(static fn($value): float => max(-5.0, min(5.0, (float) $value)), $model['weights']);
    $model['dynamicParameters'] = $cleanParameters;
    $model['generation'] = max(0, (int) ($model['generation'] ?? 0));
    $model['decisionsTrained'] = max(0, (int) ($model['decisionsTrained'] ?? 0));
    $model['gamesTrained'] = max(0, (int) ($model['gamesTrained'] ?? 0));
    $model['learningRate'] = max(0.001, min(0.2, (float) ($model['learningRate'] ?? 0.02)));
    $model['temperature'] = max(0.04, min(1.0, (float) ($model['temperature'] ?? 0.22)));
    return $model;
}

try {
    [$dataPath, $lockPath] = aiLearningStoragePaths();
    $lock = fopen($lockPath, 'c');
    if ($lock === false) throw new RuntimeException('Nelze otevřít zámek centrálního učení AI.');

    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($method === 'GET') {
        if (!flock($lock, LOCK_SH)) throw new RuntimeException('Nelze zamknout centrální model AI.');
        try {
            $stored = aiLearningReadModel($dataPath);
        } finally {
            flock($lock, LOCK_UN);
            fclose($lock);
        }
        if (empty($_SESSION['ai_learning_csrf'])) {
            $_SESSION['ai_learning_csrf'] = bin2hex(random_bytes(32));
        }
        aiLearningRespond([
            'success' => true,
            'model' => $stored['model'],
            'revision' => $stored['revision'],
            'csrf_token' => $_SESSION['ai_learning_csrf'],
        ]);
    }

    if ($method !== 'POST') aiLearningRespond(['success' => false, 'error' => 'Nepodporovaná metoda.'], 405);

    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $host = $_SERVER['HTTP_HOST'] ?? '';
    if ($origin !== '' && parse_url($origin, PHP_URL_HOST) !== preg_replace('/:\\d+$/', '', $host)) {
        aiLearningRespond(['success' => false, 'error' => 'Požadavek musí pocházet z tohoto webu.'], 403);
    }

    $length = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($length < 1 || $length > AI_LEARNING_MAX_REQUEST_BYTES) {
        aiLearningRespond(['success' => false, 'error' => 'Neplatná velikost dat modelu.'], 413);
    }
    $body = file_get_contents('php://input');
    $request = json_decode($body === false ? '' : $body, true, 512, JSON_THROW_ON_ERROR);
    $csrf = $request['csrf_token'] ?? '';
    if (!is_string($csrf) || empty($_SESSION['ai_learning_csrf'])
        || !hash_equals($_SESSION['ai_learning_csrf'], $csrf)) {
        aiLearningRespond(['success' => false, 'error' => 'Neplatný bezpečnostní token. Obnov stránku.'], 403);
    }

    $incoming = aiLearningValidateModel($request['model'] ?? null);
    $expectedRevision = filter_var($request['revision'] ?? null, FILTER_VALIDATE_INT);
    if ($expectedRevision === false || $expectedRevision < 0) {
        aiLearningRespond(['success' => false, 'error' => 'Chybí verze modelu.'], 422);
    }

    if (!flock($lock, LOCK_EX)) throw new RuntimeException('Nelze zamknout centrální model AI.');
    try {
        $stored = aiLearningReadModel($dataPath);
        if ($stored['revision'] !== $expectedRevision) {
            aiLearningRespond([
                'success' => false,
                'conflict' => true,
                'error' => 'Model mezitím aktualizovalo jiné zařízení. Načti nejnovější model.',
                'revision' => $stored['revision'],
                'model' => $stored['model'],
            ], 409);
        }

        $next = [
            'revision' => $stored['revision'] + 1,
            'updatedAt' => gmdate('c'),
            'model' => $incoming,
        ];
        $temporaryPath = $dataPath . '.' . bin2hex(random_bytes(6)) . '.tmp';
        $json = json_encode($next, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
        if (file_put_contents($temporaryPath, $json, LOCK_EX) !== strlen($json)) {
            @unlink($temporaryPath);
            throw new RuntimeException('Nepodařilo se zapsat centrální model AI.');
        }
        if (!rename($temporaryPath, $dataPath)) {
            @unlink($temporaryPath);
            throw new RuntimeException('Nepodařilo se bezpečně uložit centrální model AI.');
        }
    } finally {
        flock($lock, LOCK_UN);
        fclose($lock);
    }

    aiLearningRespond(['success' => true, 'revision' => $next['revision']]);
} catch (Throwable $error) {
    error_log('AI learning storage: ' . $error->getMessage());
    aiLearningRespond(['success' => false, 'error' => 'Centrální učení AI se nepodařilo uložit.'], 500);
}
