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

    if ($action === 'database_report') {
        $prefix = TABLE_PREFIX;
        $stmt = $db->query(
            'SELECT TABLE_NAME, ENGINE, TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH, DATA_FREE
             FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = DATABASE()
             ORDER BY TABLE_NAME'
        );
        $allTables = $stmt->fetchAll();
        $tables = [];
        foreach ($allTables as $tableRow) {
            $tableName = (string) $tableRow['TABLE_NAME'];
            if ($prefix !== '' && !str_starts_with($tableName, $prefix)) {
                continue;
            }

            $columnStmt = $db->prepare(
                'SELECT COLUMN_NAME, ORDINAL_POSITION, COLUMN_TYPE, DATA_TYPE,
                        IS_NULLABLE, COLUMN_DEFAULT, EXTRA, CHARACTER_MAXIMUM_LENGTH,
                        CHARACTER_OCTET_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE
                 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
                 ORDER BY ORDINAL_POSITION'
            );
            $columnStmt->execute([$tableName]);
            $columns = $columnStmt->fetchAll();

            $indexStmt = $db->prepare(
                'SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME,
                        COLLATION, CARDINALITY, INDEX_TYPE
                 FROM information_schema.STATISTICS
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
                 ORDER BY INDEX_NAME, SEQ_IN_INDEX'
            );
            $indexStmt->execute([$tableName]);
            $indexes = $indexStmt->fetchAll();

            $foreignStmt = $db->prepare(
                'SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME,
                        REFERENCED_COLUMN_NAME
                 FROM information_schema.KEY_COLUMN_USAGE
                 WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
                   AND REFERENCED_TABLE_NAME IS NOT NULL
                 ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION'
            );
            $foreignStmt->execute([$tableName]);
            $foreignKeys = $foreignStmt->fetchAll();

            $tables[] = [
                'name' => $tableName,
                'engine' => $tableRow['ENGINE'],
                'rows' => (int) ($tableRow['TABLE_ROWS'] ?? 0),
                'data_bytes' => (int) ($tableRow['DATA_LENGTH'] ?? 0),
                'index_bytes' => (int) ($tableRow['INDEX_LENGTH'] ?? 0),
                'free_bytes' => (int) ($tableRow['DATA_FREE'] ?? 0),
                'columns' => $columns,
                'indexes' => $indexes,
                'foreign_keys' => $foreignKeys,
            ];
        }

        $movesTable = table('game_moves');
        $movesStorage = [];
        foreach ($tables as $tableInfo) {
            if ($tableInfo['name'] !== $movesTable) {
                continue;
            }

            $textColumns = [];
            foreach ($tableInfo['columns'] as $column) {
                if (in_array(strtolower((string) $column['DATA_TYPE']), [
                    'char', 'varchar', 'tinytext', 'text', 'mediumtext', 'longtext',
                    'tinyblob', 'blob', 'mediumblob', 'longblob', 'json', 'binary', 'varbinary'
                ], true)) {
                    $textColumns[] = (string) $column['COLUMN_NAME'];
                }
            }

            if ($textColumns !== []) {
                $select = ['COUNT(*) AS row_count'];
                foreach ($textColumns as $index => $columnName) {
                    $quoted = '\`' . str_replace('\`', '\`\`', $columnName) . '\`';
                    $select[] = 'SUM(OCTET_LENGTH(' . $quoted . ')) AS c' . $index . '_total';
                    $select[] = 'AVG(OCTET_LENGTH(' . $quoted . ')) AS c' . $index . '_avg';
                    $select[] = 'MAX(OCTET_LENGTH(' . $quoted . ')) AS c' . $index . '_max';
                }
                $quotedTable = '\`' . str_replace('\`', '\`\`', $movesTable) . '\`';
                $stats = $db->query('SELECT ' . implode(', ', $select) . ' FROM ' . $quotedTable)->fetch();
                foreach ($textColumns as $index => $columnName) {
                    $movesStorage[] = [
                        'column' => $columnName,
                        'total_bytes' => (int) ($stats['c' . $index . '_total'] ?? 0),
                        'average_bytes' => $stats['c' . $index . '_avg'] === null
                            ? 0 : round((float) $stats['c' . $index . '_avg'], 2),
                        'max_bytes' => (int) ($stats['c' . $index . '_max'] ?? 0),
                    ];
                }
            }
            break;
        }

        remoteTestRespond([
            'success' => true,
            'database' => DB_NAME,
            'table_prefix' => $prefix,
            'table_count' => count($tables),
            'tables' => $tables,
            'game_moves_table' => $movesTable,
            'game_moves_column_storage' => $movesStorage,
            'note' => 'TABLE_ROWS and InnoDB DATA_LENGTH/INDEX_LENGTH are estimates; column byte totals are measured from stored values.',
        ]);
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
