<?php
declare(strict_types=1);

/**
 * Centrální správce CRON úloh pro Člověče, nezlob se!
 *
 * - Konfiguraci načítá přímo z kořenového .env (bez config.php).
 * - Úlohy eviduje v databázové tabulce {TABLE_PREFIX}cron_tasks.
 * - Je kompatibilní se sdíleným hostingem: nepoužívá exec() ani shell.
 * - Přístup přes HTTP chrání hodnota CRON_SECRET z .env.
 */

ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

$startedAt = microtime(true);
$isCli = PHP_SAPI === 'cli';

/** Načte jednoduchý .env soubor bez externích knihoven. */
function cronLoadEnv(string $path): array
{
    if (!is_file($path) || !is_readable($path)) {
        throw new RuntimeException('Konfigurační soubor .env nebyl nalezen nebo jej nelze číst.');
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES);
    if ($lines === false) {
        throw new RuntimeException('Soubor .env se nepodařilo načíst.');
    }

    $env = [];
    foreach ($lines as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) {
            continue;
        }

        if (str_starts_with($line, 'export ')) {
            $line = trim(substr($line, 7));
        }

        $parts = explode('=', $line, 2);
        if (count($parts) !== 2) {
            continue;
        }

        $key = trim($parts[0]);
        $value = trim($parts[1]);
        if (!preg_match('/^[A-Z][A-Z0-9_]*$/i', $key)) {
            continue;
        }

        if (strlen($value) >= 2) {
            $first = $value[0];
            $last = substr($value, -1);
            if (($first === '"' && $last === '"') || ($first === "'" && $last === "'")) {
                $value = substr($value, 1, -1);
            }
        }

        $env[$key] = $value;
    }

    return $env;
}

/** Vrátí jednotnou odpověď a ukončí požadavek. */
function cronRespond(array $payload, int $status = 200): never
{
    if (PHP_SAPI !== 'cli') {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        header('X-Content-Type-Options: nosniff');
    }

    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    echo PHP_EOL;
    exit;
}

/** Zapisuje log a při překročení 1 MB uchovává jednu záložní kopii. */
function cronLog(string $message): void
{
    $path = __DIR__ . '/.cron.log';
    if (is_file($path) && filesize($path) !== false && filesize($path) > 1024 * 1024) {
        @rename($path, __DIR__ . '/.cron.log.1');
    }

    $line = date('Y-m-d H:i:s') . ' | ' . $message . PHP_EOL;
    file_put_contents($path, $line, FILE_APPEND | LOCK_EX);
}

try {
    $env = cronLoadEnv(dirname(__DIR__) . '/.env');

    $required = ['DB_HOST', 'DB_USER', 'DB_NAME', 'TABLE_PREFIX', 'CRON_SECRET'];
    $missing = array_values(array_filter(
        $required,
        static fn(string $key): bool => !array_key_exists($key, $env) || $env[$key] === ''
    ));
    if ($missing !== []) {
        throw new RuntimeException('V .env chybí povinné položky: ' . implode(', ', $missing));
    }

    $prefix = $env['TABLE_PREFIX'];
    if ($prefix !== '' && !preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $prefix)) {
        throw new RuntimeException('TABLE_PREFIX obsahuje nepovolené znaky.');
    }
    if (strlen($prefix . 'cron_tasks') > 64) {
        throw new RuntimeException('TABLE_PREFIX je příliš dlouhý.');
    }

    $secret = $env['CRON_SECRET'];
    if (strlen($secret) < 32) {
        throw new RuntimeException('CRON_SECRET musí mít alespoň 32 znaků.');
    }

    // CLI spuštění je lokální. HTTP požadavky musí předložit tajný klíč.
    if (!$isCli) {
        $providedSecret = $_GET['key'] ?? '';
        if (!is_string($providedSecret) || $providedSecret === '') {
            $providedSecret = (string) ($_SERVER['HTTP_X_CRON_SECRET'] ?? '');
        }
        if (!is_string($providedSecret) || !hash_equals($secret, $providedSecret)) {
            cronRespond(['success' => false, 'error' => 'Neplatné oprávnění.'], 403);
        }

        if (!in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['GET', 'POST'], true)) {
            cronRespond(['success' => false, 'error' => 'Nepodporovaná metoda požadavku.'], 405);
        }
    }

    date_default_timezone_set($env['TIMEZONE'] ?? 'Europe/Prague');

    // Souborový zámek brání souběžnému běhu celého správce.
    $lockHandle = fopen(__DIR__ . '/.cron.lock', 'c');
    if ($lockHandle === false) {
        throw new RuntimeException('Nelze otevřít souborový zámek CRON.');
    }
    if (!flock($lockHandle, LOCK_EX | LOCK_NB)) {
        fclose($lockHandle);
        cronRespond([
            'success' => true,
            'status' => 'already_running',
            'message' => 'Jiný běh CRONu právě probíhá.',
        ]);
    }

    $pdo = new PDO(
        'mysql:host=' . $env['DB_HOST'] . ';dbname=' . $env['DB_NAME'] . ';charset=utf8mb4',
        $env['DB_USER'],
        $env['DB_PASS'] ?? '',
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );

    $tasksTable = '`' . $prefix . 'cron_tasks`';
    $pdo->query("SELECT task_key FROM {$tasksTable} LIMIT 0"); // Ověření existence tabulky.

    // Intervaly jsou v sekundách. První běh proběhne ihned po registraci úlohy.
    // Samotné úlohy jsou zde jako callbacky, aby první nasazení tvořil jediný soubor.
    $gamesTable = '`' . $prefix . 'online_games`';
    $invitesTable = '`' . $prefix . 'game_invites`';

    $tasks = [
        'cleanup_games' => [
            'interval' => 900,
            'lock_seconds' => 600,
            'run' => static function (PDO $db) use ($gamesTable): array {
                // Čekající místnosti bez aktivity 48 hodin lze odstranit.
                // Dokončené/opuštěné hry uchováváme 7 dní, případně respektujeme delete_after.
                // Aktivní a pozastavené hry se nikdy nemažou.
                $sql = "DELETE FROM {$gamesTable}
                        WHERE (
                            status = 'waiting'
                            AND last_activity_at < DATE_SUB(NOW(), INTERVAL 48 HOUR)
                        ) OR (
                            status IN ('finished', 'abandoned')
                            AND (
                                (delete_after IS NOT NULL AND delete_after <= NOW())
                                OR (
                                    delete_after IS NULL
                                    AND COALESCE(finished_at, last_activity_at) < DATE_SUB(NOW(), INTERVAL 7 DAY)
                                )
                            )
                        )";
                $deleted = $db->exec($sql);

                return [
                    'deleted_games' => (int) $deleted,
                    'waiting_expiry_hours' => 48,
                    'finished_retention_days' => 7,
                    'active_games_preserved' => true,
                ];
            },
        ],
        'cleanup_invites' => [
            'interval' => 3600,
            'lock_seconds' => 600,
            'run' => static function (PDO $db) use ($invitesTable): array {
                // Expirované/odvolané a vyčerpané pozvánky ponecháme ještě 7 dní.
                $sql = "DELETE FROM {$invitesTable}
                        WHERE (
                            expires_at IS NOT NULL
                            AND expires_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
                        ) OR (
                            revoked_at IS NOT NULL
                            AND revoked_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
                        ) OR (
                            uses_count >= uses_limit
                            AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)
                        )";
                $deleted = $db->exec($sql);

                return [
                    'deleted_invites' => (int) $deleted,
                    'expired_grace_days' => 7,
                ];
            },
        ],
    ];

    $results = [];

    foreach ($tasks as $taskKey => $task) {
        $insert = $pdo->prepare(
            "INSERT IGNORE INTO {$tasksTable} (task_key, next_run_at, is_enabled) VALUES (?, NOW(), 1)"
        );
        $insert->execute([$taskKey]);

        $lockSeconds = (int) $task['lock_seconds'];
        $claim = $pdo->prepare(
            "UPDATE {$tasksTable}
             SET locked_until = DATE_ADD(NOW(), INTERVAL {$lockSeconds} SECOND),
                 last_started_at = NOW(), last_status = 'running', last_error = NULL
             WHERE task_key = ?
               AND is_enabled = 1
               AND (next_run_at IS NULL OR next_run_at <= NOW())
               AND (locked_until IS NULL OR locked_until < NOW())"
        );
        $claim->execute([$taskKey]);

        if ($claim->rowCount() !== 1) {
            $results[$taskKey] = ['status' => 'skipped'];
            continue;
        }

        try {
            $taskResult = $task['run']($pdo);
            if (!is_array($taskResult)) {
                $taskResult = ['result' => $taskResult];
            }

            $interval = (int) $task['interval'];
            $finish = $pdo->prepare(
                "UPDATE {$tasksTable}
                 SET last_finished_at = NOW(),
                     next_run_at = DATE_ADD(NOW(), INTERVAL {$interval} SECOND),
                     locked_until = NULL,
                     last_status = 'success',
                     last_error = NULL
                 WHERE task_key = ?"
            );
            $finish->execute([$taskKey]);

            $results[$taskKey] = ['status' => 'success', 'details' => $taskResult];
            cronLog($taskKey . ' | OK | ' . json_encode($taskResult, JSON_UNESCAPED_UNICODE));
        } catch (Throwable $e) {
            $retrySeconds = min(300, (int) $task['interval']);
            $error = substr($e->getMessage(), 0, 500);
            $fail = $pdo->prepare(
                "UPDATE {$tasksTable}
                 SET last_finished_at = NOW(),
                     next_run_at = DATE_ADD(NOW(), INTERVAL {$retrySeconds} SECOND),
                     locked_until = NULL,
                     last_status = 'error',
                     last_error = ?
                 WHERE task_key = ?"
            );
            $fail->execute([$error, $taskKey]);

            $results[$taskKey] = ['status' => 'error', 'error' => $error];
            cronLog($taskKey . ' | ERROR | ' . $error);
        }
    }

    $hasErrors = count(array_filter(
        $results,
        static fn(array $result): bool => ($result['status'] ?? '') === 'error'
    )) > 0;

    cronLog(
        'cron.php | ' . ($hasErrors ? 'COMPLETED_WITH_ERRORS' : 'OK')
        . ' | ' . round(microtime(true) - $startedAt, 3) . ' s'
    );

    cronRespond([
        'success' => !$hasErrors,
        'duration_seconds' => round(microtime(true) - $startedAt, 3),
        'tasks' => $results,
    ], $hasErrors ? 500 : 200);
} catch (Throwable $e) {
    cronLog('FATAL | ' . $e->getMessage());
    cronRespond(['success' => false, 'error' => $e->getMessage()], 500);
}
