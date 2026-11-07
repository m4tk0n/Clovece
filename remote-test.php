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
        $schemaName = (string) $db->query('SELECT DATABASE()')->fetchColumn();
        $quoteIdentifier = static function (string $identifier): string {
            $tick = chr(96);
            return $tick . str_replace($tick, $tick . $tick, $identifier) . $tick;
        };
        $prefix = TABLE_PREFIX;

        $server = $db->query(
            "SELECT VERSION() AS version, @@version_comment AS version_comment,
                    @@character_set_server AS character_set_server,
                    @@collation_server AS collation_server,
                    @@sql_mode AS sql_mode, @@time_zone AS time_zone,
                    @@transaction_isolation AS transaction_isolation,
                    @@max_allowed_packet AS max_allowed_packet"
        )->fetch();

        $tableStmt = $db->prepare(
            'SELECT TABLE_NAME, ENGINE, TABLE_ROWS, DATA_LENGTH, INDEX_LENGTH, DATA_FREE,
                    TABLE_COLLATION, CREATE_OPTIONS
             FROM information_schema.TABLES
             WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = "BASE TABLE"
             ORDER BY TABLE_NAME'
        );
        $tableStmt->execute([$schemaName]);
        $tableRows = $tableStmt->fetchAll();

        $tables = [];
        $tableColumnMap = [];
        $tableNameMap = [];
        foreach ($tableRows as $tableRow) {
            $tableName = (string) $tableRow['TABLE_NAME'];
            if ($prefix !== '' && !str_starts_with($tableName, $prefix)) {
                continue;
            }
            $tableNameMap[$tableName] = true;

            $columnStmt = $db->prepare(
                'SELECT COLUMN_NAME, ORDINAL_POSITION, COLUMN_DEFAULT, IS_NULLABLE,
                        DATA_TYPE, COLUMN_TYPE, CHARACTER_MAXIMUM_LENGTH,
                        CHARACTER_OCTET_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE,
                        DATETIME_PRECISION, CHARACTER_SET_NAME, COLLATION_NAME,
                        COLUMN_KEY, EXTRA, GENERATION_EXPRESSION, COLUMN_COMMENT
                 FROM information_schema.COLUMNS
                 WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
                 ORDER BY ORDINAL_POSITION'
            );
            $columnStmt->execute([$schemaName, $tableName]);
            $columns = $columnStmt->fetchAll();
            $tableColumnMap[$tableName] = [];
            foreach ($columns as $column) {
                $tableColumnMap[$tableName][(string) $column['COLUMN_NAME']] = $column;
            }

            $indexStmt = $db->prepare(
                'SELECT INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME,
                        COLLATION, CARDINALITY, SUB_PART, NULLABLE, INDEX_TYPE,
                        IS_VISIBLE, EXPRESSION
                 FROM information_schema.STATISTICS
                 WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
                 ORDER BY INDEX_NAME, SEQ_IN_INDEX'
            );
            $indexStmt->execute([$schemaName, $tableName]);
            $indexes = $indexStmt->fetchAll();

            $constraintStmt = $db->prepare(
                'SELECT tc.CONSTRAINT_NAME, tc.CONSTRAINT_TYPE,
                        kcu.COLUMN_NAME, kcu.ORDINAL_POSITION,
                        kcu.REFERENCED_TABLE_NAME, kcu.REFERENCED_COLUMN_NAME
                 FROM information_schema.TABLE_CONSTRAINTS tc
                 LEFT JOIN information_schema.KEY_COLUMN_USAGE kcu
                   ON kcu.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
                  AND kcu.TABLE_NAME = tc.TABLE_NAME
                  AND kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
                 WHERE tc.CONSTRAINT_SCHEMA = ? AND tc.TABLE_NAME = ?
                 ORDER BY tc.CONSTRAINT_NAME, kcu.ORDINAL_POSITION'
            );
            $constraintStmt->execute([$schemaName, $tableName]);
            $constraints = $constraintStmt->fetchAll();

            $exactCount = (int) $db->query(
                'SELECT COUNT(*) FROM ' . $quoteIdentifier($tableName)
            )->fetchColumn();

            $measuredColumns = [];
            $measurable = [];
            foreach ($columns as $column) {
                $type = strtolower((string) $column['DATA_TYPE']);
                if (in_array($type, [
                    'char', 'varchar', 'tinytext', 'text', 'mediumtext', 'longtext',
                    'tinyblob', 'blob', 'mediumblob', 'longblob', 'json',
                    'binary', 'varbinary', 'enum', 'set'
                ], true)) {
                    $measurable[] = (string) $column['COLUMN_NAME'];
                }
            }
            if ($measurable !== []) {
                $selectParts = [];
                foreach ($measurable as $i => $columnName) {
                    $columnSql = $quoteIdentifier($columnName);
                    $selectParts[] = 'SUM(OCTET_LENGTH(' . $columnSql . ')) AS c' . $i . '_total';
                    $selectParts[] = 'AVG(OCTET_LENGTH(' . $columnSql . ')) AS c' . $i . '_avg';
                    $selectParts[] = 'MAX(OCTET_LENGTH(' . $columnSql . ')) AS c' . $i . '_max';
                    $selectParts[] = 'SUM(' . $columnSql . ' IS NULL) AS c' . $i . '_nulls';
                }
                $measureStmt = $db->query(
                    'SELECT ' . implode(', ', $selectParts) .
                    ' FROM ' . $quoteIdentifier($tableName)
                );
                $measure = $measureStmt->fetch();
                foreach ($measurable as $i => $columnName) {
                    $measuredColumns[] = [
                        'column' => $columnName,
                        'total_value_octets' => (int) ($measure['c' . $i . '_total'] ?? 0),
                        'average_value_octets' => $measure['c' . $i . '_avg'] === null
                            ? 0 : round((float) $measure['c' . $i . '_avg'], 2),
                        'max_value_octets' => (int) ($measure['c' . $i . '_max'] ?? 0),
                        'null_rows' => (int) ($measure['c' . $i . '_nulls'] ?? 0),
                    ];
                }
            }

            $tables[] = [
                'name' => $tableName,
                'engine' => $tableRow['ENGINE'],
                'exact_rows' => $exactCount,
                'estimated_rows' => (int) ($tableRow['TABLE_ROWS'] ?? 0),
                'data_bytes' => (int) ($tableRow['DATA_LENGTH'] ?? 0),
                'index_bytes' => (int) ($tableRow['INDEX_LENGTH'] ?? 0),
                'free_bytes' => (int) ($tableRow['DATA_FREE'] ?? 0),
                'collation' => $tableRow['TABLE_COLLATION'],
                'create_options' => $tableRow['CREATE_OPTIONS'],
                'columns' => $columns,
                'indexes' => $indexes,
                'constraints' => $constraints,
                'measured_columns' => $measuredColumns,
            ];
        }

        $foreignStmt = $db->prepare(
            'SELECT TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME, ORDINAL_POSITION,
                    REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
             FROM information_schema.KEY_COLUMN_USAGE
             WHERE CONSTRAINT_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL
             ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION'
        );
        $foreignStmt->execute([$schemaName]);
        $foreignKeyRows = $foreignStmt->fetchAll();
        $foreignKeys = [];
        foreach ($foreignKeyRows as $fk) {
            $tableName = (string) $fk['TABLE_NAME'];
            if ($prefix !== '' && !str_starts_with($tableName, $prefix)) {
                continue;
            }
            $foreignKeys[] = $fk;
        }

        $orphanChecks = [];
        $fkGroups = [];
        foreach ($foreignKeys as $fk) {
            $key = $fk['TABLE_NAME'] . "\0" . $fk['CONSTRAINT_NAME'] . "\0" . $fk['REFERENCED_TABLE_NAME'];
            $fkGroups[$key][] = $fk;
        }
        foreach ($fkGroups as $parts) {
            $childTable = (string) $parts[0]['TABLE_NAME'];
            $parentTable = (string) $parts[0]['REFERENCED_TABLE_NAME'];
            if (!isset($tableNameMap[$childTable], $tableNameMap[$parentTable])) {
                continue;
            }
            $conditions = [];
            $nonnull = [];
            foreach ($parts as $part) {
                $childColumn = $quoteIdentifier((string) $part['COLUMN_NAME']);
                $parentColumn = $quoteIdentifier((string) $part['REFERENCED_COLUMN_NAME']);
                $conditions[] = 'p.' . $parentColumn . ' = c.' . $childColumn;
                $nonnull[] = 'c.' . $childColumn . ' IS NOT NULL';
            }
            $sql = 'SELECT COUNT(*) FROM ' . $quoteIdentifier($childTable) . ' c LEFT JOIN ' .
                $quoteIdentifier($parentTable) . ' p ON ' . implode(' AND ', $conditions) .
                ' WHERE ' . implode(' AND ', $nonnull) .
                ' AND p.' . $quoteIdentifier((string) $parts[0]['REFERENCED_COLUMN_NAME']) . ' IS NULL';
            $orphanChecks[] = [
                'table' => $childTable,
                'constraint' => $parts[0]['CONSTRAINT_NAME'],
                'referenced_table' => $parentTable,
                'orphan_rows' => (int) $db->query($sql)->fetchColumn(),
            ];
        }

        $logicalRelations = [
            ['child' => 'game_participants', 'child_column' => 'game_id', 'parent' => 'online_games', 'parent_column' => 'id'],
            ['child' => 'game_participants', 'child_column' => 'identity_id', 'parent' => 'player_identities', 'parent_column' => 'id'],
            ['child' => 'game_moves', 'child_column' => 'game_id', 'parent' => 'online_games', 'parent_column' => 'id'],
            ['child' => 'game_moves', 'child_column' => 'participant_id', 'parent' => 'game_participants', 'parent_column' => 'id'],
            ['child' => 'game_chat', 'child_column' => 'game_id', 'parent' => 'online_games', 'parent_column' => 'id'],
            ['child' => 'game_invites', 'child_column' => 'game_id', 'parent' => 'online_games', 'parent_column' => 'id'],
        ];
        $logicalIntegrity = [];
        foreach ($logicalRelations as $relation) {
            $child = table($relation['child']);
            $parent = table($relation['parent']);
            $childColumn = $relation['child_column'];
            $parentColumn = $relation['parent_column'];
            if (!isset($tableNameMap[$child], $tableNameMap[$parent])
                || !isset($tableColumnMap[$child][$childColumn], $tableColumnMap[$parent][$parentColumn])) {
                continue;
            }
            $sql = 'SELECT COUNT(*) FROM ' . $quoteIdentifier($child) . ' c LEFT JOIN ' .
                $quoteIdentifier($parent) . ' p ON p.' . $quoteIdentifier($parentColumn) .
                ' = c.' . $quoteIdentifier($childColumn) . ' WHERE c.' .
                $quoteIdentifier($childColumn) . ' IS NOT NULL AND p.' .
                $quoteIdentifier($parentColumn) . ' IS NULL';
            $logicalIntegrity[] = [
                'child_table' => $child,
                'child_column' => $childColumn,
                'parent_table' => $parent,
                'parent_column' => $parentColumn,
                'orphan_rows' => (int) $db->query($sql)->fetchColumn(),
                'enforced_by_foreign_key' => false,
            ];
        }

        $triggersStmt = $db->prepare(
            'SELECT TRIGGER_NAME, EVENT_MANIPULATION, EVENT_OBJECT_TABLE,
                    ACTION_TIMING, ACTION_STATEMENT, SQL_MODE, DEFINER
             FROM information_schema.TRIGGERS
             WHERE TRIGGER_SCHEMA = ? ORDER BY EVENT_OBJECT_TABLE, TRIGGER_NAME'
        );
        $triggersStmt->execute([$schemaName]);
        $triggers = $triggersStmt->fetchAll();

        $viewsStmt = $db->prepare(
            'SELECT TABLE_NAME, VIEW_DEFINITION, CHECK_OPTION, IS_UPDATABLE,
                    DEFINER, SECURITY_TYPE
             FROM information_schema.VIEWS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME'
        );
        $viewsStmt->execute([$schemaName]);
        $views = $viewsStmt->fetchAll();

        $routinesStmt = $db->prepare(
            'SELECT ROUTINE_NAME, ROUTINE_TYPE, DATA_TYPE, DTD_IDENTIFIER,
                    ROUTINE_DEFINITION, SQL_DATA_ACCESS, IS_DETERMINISTIC,
                    SECURITY_TYPE, DEFINER
             FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ?
             ORDER BY ROUTINE_TYPE, ROUTINE_NAME'
        );
        $routinesStmt->execute([$schemaName]);
        $routines = $routinesStmt->fetchAll();

        $eventsStmt = $db->prepare(
            'SELECT EVENT_NAME, DEFINER, TIME_ZONE, EVENT_TYPE, EXECUTE_AT,
                    INTERVAL_VALUE, INTERVAL_FIELD, STATUS, EVENT_DEFINITION
             FROM information_schema.EVENTS WHERE EVENT_SCHEMA = ? ORDER BY EVENT_NAME'
        );
        $eventsStmt->execute([$schemaName]);
        $events = $eventsStmt->fetchAll();

        $databaseSizeStmt = $db->prepare(
            'SELECT SUM(DATA_LENGTH) AS data_bytes, SUM(INDEX_LENGTH) AS index_bytes,
                    SUM(DATA_FREE) AS free_bytes
             FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = "BASE TABLE"'
        );
        $databaseSizeStmt->execute([$schemaName]);
        $databaseSize = $databaseSizeStmt->fetch();

        remoteTestRespond([
            'success' => true,
            'generated_at_utc' => gmdate('c'),
            'php_version' => PHP_VERSION,
            'database' => $schemaName,
            'table_prefix' => $prefix,
            'server' => $server,
            'database_size' => $databaseSize,
            'table_count' => count($tables),
            'tables' => $tables,
            'foreign_keys' => $foreignKeys,
            'foreign_key_orphan_checks' => $orphanChecks,
            'logical_integrity_checks' => $logicalIntegrity,
            'triggers' => $triggers,
            'views' => $views,
            'routines' => $routines,
            'events' => $events,
            'limitations' => [
                'data_bytes_and_index_bytes' => 'InnoDB storage estimates from information_schema.',
                'measured_columns' => 'Actual OCTET_LENGTH totals of stored values; not physical InnoDB row overhead.',
                'logical_integrity_checks' => 'Checks likely game relationships when columns exist; they are not schema-enforced foreign keys.',
                'no_user_values' => 'No player names, chat messages, tokens, passwords or game payload contents are returned.',
            ],
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
