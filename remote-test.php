<?php
// /remote-test.php
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
                        kcu.REFERENCED_TABLE_NAME, kcu.REFERENCED_COLUMN_NAME,
                        rc.UPDATE_RULE, rc.DELETE_RULE, rc.MATCH_OPTION
                 FROM information_schema.TABLE_CONSTRAINTS tc
                 LEFT JOIN information_schema.KEY_COLUMN_USAGE kcu
                   ON kcu.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
                  AND kcu.TABLE_NAME = tc.TABLE_NAME
                  AND kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
                 LEFT JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
                   ON rc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
                  AND rc.TABLE_NAME = tc.TABLE_NAME
                  AND rc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
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

            $indexGroups = [];
            foreach ($indexes as $indexPart) {
                $indexGroups[(string) $indexPart['INDEX_NAME']][] = $indexPart;
            }
            $possibleRedundantIndexes = [];
            foreach ($indexGroups as $shortName => $shortParts) {
                if (count($shortParts) === 0 || (int) $shortParts[0]['NON_UNIQUE'] !== 1) {
                    continue;
                }
                $shortColumns = array_column($shortParts, 'COLUMN_NAME');
                if (in_array(null, $shortColumns, true)) {
                    continue;
                }
                foreach ($indexGroups as $longName => $longParts) {
                    if ($shortName === $longName || count($longParts) <= count($shortParts)
                        || (int) $longParts[0]['NON_UNIQUE'] !== 1) {
                        continue;
                    }
                    $longColumns = array_column($longParts, 'COLUMN_NAME');
                    if (array_slice($longColumns, 0, count($shortColumns)) === $shortColumns) {
                        $possibleRedundantIndexes[] = [
                            'candidate_redundant_index' => $shortName,
                            'possible_covering_index' => $longName,
                            'shared_left_prefix' => $shortColumns,
                            'note' => 'Candidate only; confirm actual SQL usage before removing.',
                        ];
                    }
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
                'possible_redundant_indexes' => $possibleRedundantIndexes,
                'constraints' => $constraints,
                'measured_columns' => $measuredColumns,
            ];
        }

        $foreignStmt = $db->prepare(
            'SELECT kcu.TABLE_NAME, kcu.CONSTRAINT_NAME, kcu.COLUMN_NAME, kcu.ORDINAL_POSITION,
                    kcu.REFERENCED_TABLE_NAME, kcu.REFERENCED_COLUMN_NAME,
                    rc.UPDATE_RULE, rc.DELETE_RULE, rc.MATCH_OPTION
             FROM information_schema.KEY_COLUMN_USAGE kcu
             LEFT JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
               ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
              AND rc.TABLE_NAME = kcu.TABLE_NAME
              AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
             WHERE kcu.CONSTRAINT_SCHEMA = ? AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
             ORDER BY kcu.TABLE_NAME, kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION'
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
                'enforced_by_foreign_key' => (bool) array_filter($foreignKeys, static function (array $fk) use ($child, $childColumn, $parent, $parentColumn): bool {
                    return $fk['TABLE_NAME'] === $child
                        && $fk['COLUMN_NAME'] === $childColumn
                        && $fk['REFERENCED_TABLE_NAME'] === $parent
                        && $fk['REFERENCED_COLUMN_NAME'] === $parentColumn;
                }),
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

        $projectDatabaseSize = ['data_bytes' => 0, 'index_bytes' => 0, 'free_bytes' => 0];
        $otherSchemaTables = [];
        foreach ($tableRows as $schemaTable) {
            $schemaTableName = (string) $schemaTable['TABLE_NAME'];
            if ($prefix !== '' && !str_starts_with($schemaTableName, $prefix)) {
                $otherSchemaTables[] = $schemaTableName;
            }
        }
        foreach ($tables as $projectTable) {
            $projectDatabaseSize['data_bytes'] += $projectTable['data_bytes'];
            $projectDatabaseSize['index_bytes'] += $projectTable['index_bytes'];
            $projectDatabaseSize['free_bytes'] += $projectTable['free_bytes'];
        }

        $profiles = [];

        $profiles['identities_by_type'] = $db->query(
            'SELECT identity_type, COUNT(*) AS row_count,
                    SUM(last_seen_at IS NULL) AS never_seen,
                    SUM(last_seen_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)) AS unseen_7d,
                    SUM(last_seen_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)) AS unseen_30d
             FROM ' . $quoteIdentifier(table('player_identities')) . '
             GROUP BY identity_type ORDER BY identity_type'
        )->fetchAll();

        $profiles['identities_without_game_or_account'] = (int) $db->query(
            'SELECT COUNT(*) FROM ' . $quoteIdentifier(table('player_identities')) . ' i
             WHERE NOT EXISTS (SELECT 1 FROM ' . $quoteIdentifier(table('player_accounts')) . ' a WHERE a.identity_id = i.id)
               AND NOT EXISTS (SELECT 1 FROM ' . $quoteIdentifier(table('game_participants')) . ' p WHERE p.identity_id = i.id)
               AND NOT EXISTS (SELECT 1 FROM ' . $quoteIdentifier(table('online_games')) . ' g WHERE g.created_by_identity_id = i.id)'
        )->fetchColumn();

        $profiles['devices_summary'] = $db->query(
            'SELECT COUNT(*) AS total,
                    SUM(revoked_at IS NULL) AS active,
                    SUM(revoked_at IS NOT NULL) AS revoked,
                    SUM(last_seen_at IS NULL) AS never_seen,
                    SUM(revoked_at IS NULL AND last_seen_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)) AS active_unseen_7d
             FROM ' . $quoteIdentifier(table('player_devices'))
        )->fetch();

        $profiles['identities_with_multiple_active_devices'] = (int) $db->query(
            'SELECT COUNT(*) FROM (
                SELECT identity_id FROM ' . $quoteIdentifier(table('player_devices')) . '
                WHERE revoked_at IS NULL GROUP BY identity_id HAVING COUNT(*) > 1
             ) active_device_groups'
        )->fetchColumn();

        $profiles['games_with_null_state'] = $db->query(
            'SELECT g.id, g.status, g.created_at, g.last_activity_at, g.delete_after,
                    COUNT(p.id) AS participant_count
             FROM ' . $quoteIdentifier(table('online_games')) . ' g
             LEFT JOIN ' . $quoteIdentifier(table('game_participants')) . ' p ON p.game_id = g.id
             WHERE g.state_json IS NULL
             GROUP BY g.id, g.status, g.created_at, g.last_activity_at, g.delete_after
             ORDER BY g.created_at'
        )->fetchAll();

        $profiles['game_state_vs_move_log'] = $db->query(
            'SELECT g.id AS game_id, g.status, g.state_version AS game_state_version,
                    COUNT(m.id) AS move_rows, MAX(m.state_version) AS max_move_version,
                    MIN(m.state_version) AS min_move_version,
                    SUM(m.action_type = "start") AS start_log_rows
             FROM ' . $quoteIdentifier(table('online_games')) . ' g
             LEFT JOIN ' . $quoteIdentifier(table('game_moves')) . ' m ON m.game_id = g.id
             GROUP BY g.id, g.status, g.state_version
             HAVING COUNT(m.id) > 0
             ORDER BY g.id'
        )->fetchAll();

        $explainGameId = (int) $db->query(
            'SELECT game_id FROM ' . $quoteIdentifier(table('game_moves')) .
            ' GROUP BY game_id ORDER BY COUNT(*) DESC, game_id LIMIT 1'
        )->fetchColumn();
        $queryPlans = [];
        if ($explainGameId > 0) {
            $planQueries = [
                'game_moves_history' => [
                    'SELECT id, participant_id, state_version, action_type, action_json, created_at
                     FROM ' . $quoteIdentifier(table('game_moves')) . '
                     WHERE game_id = ? ORDER BY id DESC LIMIT 30',
                    [$explainGameId],
                ],
                'game_chat_history' => [
                    'SELECT id, participant_id, message, created_at
                     FROM ' . $quoteIdentifier(table('game_chat')) . '
                     WHERE game_id = ? ORDER BY id DESC LIMIT 30',
                    [$explainGameId],
                ],
                'game_participants_active' => [
                    'SELECT id, identity_id, player_index, player_type, display_name
                     FROM ' . $quoteIdentifier(table('game_participants')) . '
                     WHERE game_id = ? AND left_at IS NULL ORDER BY player_index',
                    [$explainGameId],
                ],
                'game_move_idempotency_lookup' => [
                    'SELECT id FROM ' . $quoteIdentifier(table('game_moves')) . '
                     WHERE game_id = ? AND request_id = ? LIMIT 1',
                    [$explainGameId, (string) ($db->query(
                        'SELECT request_id FROM ' . $quoteIdentifier(table('game_moves')) .
                        ' WHERE game_id = ' . $explainGameId . ' LIMIT 1'
                    )->fetchColumn() ?: '00000000-0000-4000-8000-000000000000')],
                ],
            ];
            foreach ($planQueries as $planName => [$sql, $params]) {
                $stmt = $db->prepare('EXPLAIN ' . $sql);
                $stmt->execute($params);
                $queryPlans[$planName] = $stmt->fetchAll();
            }
        }
        foreach ([
            'online_games_active_by_activity' => 'SELECT id, status, last_activity_at FROM ' .
                $quoteIdentifier(table('online_games')) .
                ' WHERE status IN ("active", "paused") ORDER BY last_activity_at DESC LIMIT 20',
            'player_identities_recent_activity' => 'SELECT id, last_seen_at FROM ' .
                $quoteIdentifier(table('player_identities')) .
                ' WHERE last_seen_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) ORDER BY last_seen_at DESC LIMIT 20',
        ] as $planName => $sql) {
            $queryPlans[$planName] = $db->query('EXPLAIN ' . $sql)->fetchAll();
        }

        $profiles['moves_by_action_type'] = $db->query(
            'SELECT action_type, COUNT(*) AS row_count,
                    SUM(OCTET_LENGTH(action_json)) AS total_action_octets,
                    MAX(OCTET_LENGTH(action_json)) AS max_action_octets
             FROM ' . $quoteIdentifier(table('game_moves')) . '
             GROUP BY action_type ORDER BY row_count DESC'
        )->fetchAll();

        $profiles['games_by_status'] = $db->query(
            'SELECT status, COUNT(*) AS row_count,
                    SUM(state_json IS NULL) AS empty_state,
                    SUM(OCTET_LENGTH(state_json)) AS total_state_octets,
                    MAX(OCTET_LENGTH(state_json)) AS max_state_octets,
                    MIN(created_at) AS oldest_created_at,
                    MAX(last_activity_at) AS latest_activity_at
             FROM ' . $quoteIdentifier(table('online_games')) . '
             GROUP BY status ORDER BY status'
        )->fetchAll();

        $profiles['moves_by_game'] = $db->query(
            'SELECT game_id, COUNT(*) AS move_count,
                    MIN(state_version) AS first_state_version,
                    MAX(state_version) AS last_state_version,
                    SUM(OCTET_LENGTH(action_json)) AS action_json_octets,
                    MAX(OCTET_LENGTH(action_json)) AS max_action_json_octets,
                    MIN(created_at) AS first_move_at,
                    MAX(created_at) AS last_move_at
             FROM ' . $quoteIdentifier(table('game_moves')) . '
             GROUP BY game_id ORDER BY move_count DESC, game_id'
        )->fetchAll();

        $profiles['move_duplicate_checks'] = [
            'duplicate_game_request_pairs' => (int) $db->query(
                'SELECT COUNT(*) FROM (
                    SELECT game_id, request_id FROM ' . $quoteIdentifier(table('game_moves')) . '
                    GROUP BY game_id, request_id HAVING COUNT(*) > 1
                 ) duplicates_found'
            )->fetchColumn(),
            'duplicate_game_state_versions' => (int) $db->query(
                'SELECT COUNT(*) FROM (
                    SELECT game_id, state_version FROM ' . $quoteIdentifier(table('game_moves')) . '
                    GROUP BY game_id, state_version HAVING COUNT(*) > 1
                 ) duplicates_found'
            )->fetchColumn(),
        ];

        $profiles['invites_summary'] = $db->query(
            'SELECT COUNT(*) AS total,
                    SUM(revoked_at IS NULL AND (expires_at IS NULL OR expires_at > UTC_TIMESTAMP()) AND uses_count < uses_limit) AS usable,
                    SUM(revoked_at IS NOT NULL) AS revoked,
                    SUM(expires_at IS NOT NULL AND expires_at <= UTC_TIMESTAMP() AND revoked_at IS NULL) AS expired,
                    SUM(uses_count >= uses_limit) AS exhausted
             FROM ' . $quoteIdentifier(table('game_invites'))
        )->fetch();

        $profiles['cron_tasks_by_status'] = $db->query(
            'SELECT last_status, is_enabled, COUNT(*) AS row_count,
                    SUM(last_error IS NOT NULL AND last_error <> "") AS has_error
             FROM ' . $quoteIdentifier(table('cron_tasks')) . '
             GROUP BY last_status, is_enabled ORDER BY last_status, is_enabled'
        )->fetchAll();

        remoteTestRespond([
            'success' => true,
            'generated_at_utc' => gmdate('c'),
            'php_version' => PHP_VERSION,
            'database' => $schemaName,
            'table_prefix' => $prefix,
            'server' => $server,
            'database_size' => $databaseSize,
            'project_database_size' => $projectDatabaseSize,
            'schema_table_count' => count($tableRows),
            'other_schema_tables' => $otherSchemaTables,
            'profiles' => $profiles,
            'query_plans' => $queryPlans,
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
