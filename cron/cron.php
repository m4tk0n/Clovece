<?php
declare(strict_types=1);

/**
 * /cron/cron.php
 * Pseudo-CRON volaný interně z index.php.
 * Hlavní kontrola nejvýše 1x za 5 minut; úlohy mají vlastní intervaly v cron_tasks.
 */

if (isset($_SERVER['SCRIPT_FILENAME'])
    && realpath((string) $_SERVER['SCRIPT_FILENAME']) === realpath(__FILE__)) {
    http_response_code(404);
    exit;
}

try {
    $envPath = dirname(__DIR__) . '/.env';
    if (!is_file($envPath) || !is_readable($envPath)) {
        throw new RuntimeException('.env není dostupný.');
    }

    $env = [];
    foreach (file($envPath, FILE_IGNORE_NEW_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#')) continue;
        [$key, $value] = array_pad(explode('=', $line, 2), 2, '');
        $key = trim($key);
        $value = trim($value);
        if (strlen($value) >= 2 && (
            ($value[0] === '"' && substr($value, -1) === '"')
            || ($value[0] === "'" && substr($value, -1) === "'")
        )) $value = substr($value, 1, -1);
        if ($key !== '') $env[$key] = $value;
    }

    $prefix = $env['TABLE_PREFIX'] ?? '';
    if ($prefix !== '' && !preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $prefix)) {
        throw new RuntimeException('Neplatný TABLE_PREFIX.');
    }

    $pdo = new PDO(
        'mysql:host=' . ($env['DB_HOST'] ?? 'localhost') . ';dbname=' . ($env['DB_NAME'] ?? '') . ';charset=utf8mb4',
        $env['DB_USER'] ?? '',
        $env['DB_PASS'] ?? '',
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]
    );

    $table = '"' . $prefix . 'cron_tasks"';

    // Hlavní throttling: nejvýše jeden průchod úlohami za 5 minut.
    $pdo->prepare("INSERT IGNORE INTO {$table} (task_key, next_run_at, is_enabled) VALUES ('__main__', NOW(), 1)")->execute();
    $main = $pdo->exec(
        "UPDATE {$table}
         SET next_run_at = DATE_ADD(NOW(), INTERVAL 5 MINUTE),
             last_started_at = NOW(), last_status = 'running', last_error = NULL
         WHERE task_key = '__main__' AND is_enabled = 1
           AND (next_run_at IS NULL OR next_run_at <= NOW())
           AND (locked_until IS NULL OR locked_until < NOW())"
    );
    if ($main !== 1) return;

    $pdo->exec("UPDATE {$table} SET locked_until = DATE_ADD(NOW(), INTERVAL 4 MINUTE) WHERE task_key = '__main__'");

    $games = '"' . $prefix . 'online_games"';
    $invites = '"' . $prefix . 'game_invites"';

    $tasks = [
        'cleanup_games' => [
            'interval' => 900,
            'run' => static function () use ($pdo, $games): array {
                $stmt = $pdo->prepare(
                    "DELETE FROM {$games}
                     WHERE (status = 'waiting' AND last_activity_at < DATE_SUB(NOW(), INTERVAL 48 HOUR))
                        OR (status IN ('finished', 'abandoned') AND (
                            (delete_after IS NOT NULL AND delete_after <= NOW())
                            OR (delete_after IS NULL AND COALESCE(finished_at, last_activity_at) < DATE_SUB(NOW(), INTERVAL 7 DAY))
                        ))"
                );
                $stmt->execute();
                return ['deleted_games' => $stmt->rowCount()];
            },
        ],
        'cleanup_invites' => [
            'interval' => 3600,
            'run' => static function () use ($pdo, $invites): array {
                $stmt = $pdo->prepare(
                    "DELETE FROM {$invites}
                     WHERE (expires_at IS NOT NULL AND expires_at < DATE_SUB(NOW(), INTERVAL 7 DAY))
                        OR (revoked_at IS NOT NULL AND revoked_at < DATE_SUB(NOW(), INTERVAL 7 DAY))
                        OR (uses_count >= uses_limit AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY))"
                );
                $stmt->execute();
                return ['deleted_invites' => $stmt->rowCount()];
            },
        ],
    ];

    foreach ($tasks as $key => $task) {
        $pdo->prepare("INSERT IGNORE INTO {$table} (task_key, next_run_at, is_enabled) VALUES (?, NOW(), 1)")->execute([$key]);

        $claim = $pdo->prepare(
            "UPDATE {$table}
             SET locked_until = DATE_ADD(NOW(), INTERVAL 10 MINUTE),
                 last_started_at = NOW(), last_status = 'running', last_error = NULL
             WHERE task_key = ? AND is_enabled = 1
               AND (next_run_at IS NULL OR next_run_at <= NOW())
               AND (locked_until IS NULL OR locked_until < NOW())"
        );
        $claim->execute([$key]);
        if ($claim->rowCount() !== 1) continue;

        try {
            $details = $task['run']();
            $finish = $pdo->prepare(
                "UPDATE {$table}
                 SET last_finished_at = NOW(),
                     next_run_at = DATE_ADD(NOW(), INTERVAL " . (int) $task['interval'] . " SECOND),
                     locked_until = NULL, last_status = 'success', last_error = NULL
                 WHERE task_key = ?"
            );
            $finish->execute([$key]);
            cronWriteLog($key . ' OK ' . json_encode($details, JSON_UNESCAPED_UNICODE));
        } catch (Throwable $e) {
            $error = substr($e->getMessage(), 0, 500);
            $fail = $pdo->prepare(
                "UPDATE {$table}
                 SET next_run_at = DATE_ADD(NOW(), INTERVAL 5 MINUTE),
                     locked_until = NULL, last_status = 'error', last_error = ?
                 WHERE task_key = ?"
            );
            $fail->execute([$error, $key]);
            cronWriteLog($key . ' ERROR ' . $error);
        }
    }

    $pdo->exec("UPDATE {$table} SET last_finished_at = NOW(), locked_until = NULL, last_status = 'success' WHERE task_key = '__main__'");
} catch (Throwable $e) {
    cronWriteLog('FATAL ' . $e->getMessage());
}

/** Diagnostický log nesmí ovlivnit načtení stránky. */
function cronWriteLog(string $message): void
{
    @file_put_contents(
        __DIR__ . '/.cron.log',
        date('Y-m-d H:i:s') . ' | ' . $message . PHP_EOL,
        FILE_APPEND | LOCK_EX
    );
}
