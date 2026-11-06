<?php
declare(strict_types=1);

/**
 * Chráněný diagnostický endpoint pro GitHub Actions.
 * Token nastav shodně v .env (REMOTE_TEST_TOKEN) a v GitHub Actions secret.
 */
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
error_reporting(E_ALL);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

function remoteTestRespond(array $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    remoteTestRespond(['success' => false, 'error' => 'POST required'], 405);
}

require_once __DIR__ . '/config.php';

$expectedToken = $_ENV['REMOTE_TEST_TOKEN'] ?? '';
$providedToken = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
if (str_starts_with($providedToken, 'Bearer ')) {
    $providedToken = substr($providedToken, 7);
}
if (!is_string($expectedToken) || strlen($expectedToken) < 32
    || !is_string($providedToken) || !hash_equals($expectedToken, $providedToken)) {
    remoteTestRespond(['success' => false, 'error' => 'Unauthorized'], 401);
}

try {
    $db = getDatabaseConnection();
    $action = $_POST['action'] ?? 'status';

    if ($action === 'status') {
        $requiredTables = ['schema_migrations', 'player_identities', 'player_devices', 'player_accounts'];
        $stmt = $db->prepare(
            'SELECT COUNT(*) FROM information_schema.tables
             WHERE table_schema = DATABASE() AND table_name = ?'
        );
        $tables = [];
        foreach ($requiredTables as $suffix) {
            $name = table($suffix);
            $stmt->execute([$name]);
            $tables[$suffix] = (int) $stmt->fetchColumn() === 1;
        }
        remoteTestRespond([
            'success' => !in_array(false, $tables, true),
            'php_version' => PHP_VERSION,
            'database' => 'connected',
            'tables' => $tables,
        ], !in_array(false, $tables, true) ? 200 : 503);
    }

    if ($action === 'cleanup') {
        $username = $_POST['username'] ?? '';
        if (!is_string($username) || !preg_match('/^ghatest_[a-f0-9]{12}$/', $username)) {
            remoteTestRespond(['success' => false, 'error' => 'Invalid test username'], 400);
        }

        $db->beginTransaction();
        try {
            $stmt = $db->prepare(
                'SELECT a.id, a.identity_id
                 FROM ' . table('player_accounts') . ' a
                 WHERE a.username = ? LIMIT 1 FOR UPDATE'
            );
            $stmt->execute([$username]);
            $account = $stmt->fetch();

            if (!$account) {
                $db->commit();
                remoteTestRespond(['success' => true, 'cleaned' => false, 'reason' => 'already_absent']);
            }

            $identityId = (int) $account['identity_id'];
            $stmt = $db->prepare(
                'SELECT
                    (SELECT COUNT(*) FROM ' . table('online_games') . ' WHERE created_by_identity_id = ?) +
                    (SELECT COUNT(*) FROM ' . table('game_participants') . ' WHERE identity_id = ?)'
            );
            $stmt->execute([$identityId, $identityId]);
            if ((int) $stmt->fetchColumn() !== 0) {
                throw new RuntimeException('Test identity unexpectedly owns game data; cleanup stopped.');
            }

            $db->prepare('DELETE FROM ' . table('player_accounts') . ' WHERE id = ?')
                ->execute([(int) $account['id']]);
            $db->prepare('DELETE FROM ' . table('player_identities') . ' WHERE id = ?')
                ->execute([$identityId]);
            $db->commit();
            remoteTestRespond(['success' => true, 'cleaned' => true]);
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            throw $e;
        }
    }

    remoteTestRespond(['success' => false, 'error' => 'Unknown action'], 400);
} catch (Throwable $e) {
    error_log('Remote test endpoint: ' . $e->getMessage());
    remoteTestRespond(['success' => false, 'error' => 'Remote test failed: ' . $e->getMessage()], 500);
}
