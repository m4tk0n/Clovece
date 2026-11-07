<?php
declare(strict_types=1);

/**
 * Online API – anonymní identita, místnosti, pozvánky a chat.
 *
 * Tento endpoint je oddělený od původního api.php, které obsluhuje
 * zastaralý registrační datový model. Herní tahy budou doplněny až
 * společně se serverovou validací herního enginu.
 */

if (session_status() !== PHP_SESSION_ACTIVE) {
    $requestIsHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    ini_set('session.use_strict_mode', '1');
    ini_set('session.cookie_httponly', '1');
    ini_set('session.cookie_secure', $requestIsHttps ? '1' : '0');
    ini_set('session.cookie_samesite', 'Lax');
    session_start();
}

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/lib/game-engine.php';
require_once __DIR__ . '/lib/ai-learning.php';
require_once __DIR__ . '/lib/account-auth.php';

header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

function onlineRespond(array $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function onlineFail(string $message, int $status = 400): never
{
    onlineRespond(['success' => false, 'error' => $message], $status);
}

function onlineTable(string $name): string
{
    return '`' . table($name) . '`';
}

function onlineDb(): PDO
{
    return getDatabaseConnection();
}

function onlineDeviceCookiePath(): string
{
    $directory = str_replace(chr(92), '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/'));
    return rtrim($directory, '/') . '/';
}

function onlineUuid(): string
{
    $hex = bin2hex(random_bytes(16));
    return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-'
        . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20, 12);
}

function onlineRandomToken(int $bytes = 32): string
{
    return rtrim(strtr(base64_encode(random_bytes($bytes)), '+/', '-_'), '=');
}

function onlineIdentity(bool $create = true): ?array
{
    $db = onlineDb();
    $rawToken = $_COOKIE['clovece_device'] ?? '';

    if (is_string($rawToken) && preg_match('/^[A-Za-z0-9_-]{40,60}$/', $rawToken)) {
        $stmt = $db->prepare(
            'SELECT i.id, i.display_name
             FROM ' . onlineTable('player_devices') . ' d
             JOIN ' . onlineTable('player_identities') . ' i ON i.id = d.identity_id
             WHERE d.token_hash = ? AND d.revoked_at IS NULL
             LIMIT 1'
        );
        $stmt->execute([hash('sha256', $rawToken)]);
        $identity = $stmt->fetch();

        if ($identity) {
            $db->prepare('UPDATE ' . onlineTable('player_devices') . ' SET last_seen_at = NOW() WHERE token_hash = ?')
                ->execute([hash('sha256', $rawToken)]);
            $db->prepare('UPDATE ' . onlineTable('player_identities') . ' SET last_seen_at = NOW() WHERE id = ?')
                ->execute([$identity['id']]);
            return $identity;
        }
    }

    if (!$create) {
        return null;
    }

    $rawToken = onlineRandomToken();
    $db->beginTransaction();

    try {
        $stmt = $db->prepare(
            'INSERT INTO ' . onlineTable('player_identities') . ' (identity_type, display_name, last_seen_at)
             VALUES (\'anonymous\', \'Hráč\', NOW())'
        );
        $stmt->execute();
        $identityId = (int) $db->lastInsertId();

        $stmt = $db->prepare(
            'INSERT INTO ' . onlineTable('player_devices') . ' (identity_id, token_hash, last_seen_at)
             VALUES (?, ?, NOW())'
        );
        $stmt->execute([$identityId, hash('sha256', $rawToken)]);
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }

    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');

    setcookie('clovece_device', $rawToken, [
        'expires' => time() + (365 * 24 * 60 * 60),
        'path' => onlineDeviceCookiePath(),
        'secure' => $https,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);

    return ['id' => $identityId, 'display_name' => 'Hráč'];
}

function onlineRequireIdentity(): array
{
    $identity = onlineIdentity(false);
    if (!$identity) {
        onlineFail('Identita zařízení chybí. Obnov stránku a zkus to znovu.', 401);
    }
    return $identity;
}

function onlineCleanName(mixed $value): string
{
    $name = trim(strip_tags(is_string($value) ? $value : ''));
    $name = preg_replace('/[\\x00-\\x1F\\x7F]/u', '', $name) ?? '';
    if (function_exists('mb_substr')) {
        $name = mb_substr($name, 0, 50, 'UTF-8');
    } else {
        $name = substr($name, 0, 50);
    }
    return $name !== '' ? $name : 'Hráč';
}

function onlineGameAccess(PDO $db, int $gameId, int $identityId): array
{
    $stmt = $db->prepare(
        'SELECT g.id, g.public_id, g.status, g.player_limit, g.board_type,
                g.created_by_identity_id,
                g.state_json, g.state_version, g.current_turn, g.created_at,
                g.last_activity_at, p.id AS participant_id, p.player_index,
                p.display_name
         FROM ' . onlineTable('online_games') . ' g
         JOIN ' . onlineTable('game_participants') . ' p ON p.game_id = g.id
         WHERE g.id = ? AND p.identity_id = ? AND p.left_at IS NULL
         LIMIT 1'
    );
    $stmt->execute([$gameId, $identityId]);
    $result = $stmt->fetch();

    if (!$result) {
        onlineFail('Hra nebyla nalezena nebo k ní nemáš přístup.', 404);
    }
    return $result;
}

function onlineStartingRollLogData(array $state): array
{
    $rounds = [];
    foreach (($state['startRolls'] ?? []) as $round) {
        if ($round === []) continue;
        $rounds[] = array_map(static function (array $roll) use ($state): array {
            $playerId = (int) $roll['playerId'];
            return $roll + ['playerName' => (string) ($state['players'][$playerId]['name'] ?? 'Hráč')];
        }, $round);
    }

    $winnerId = $state['startWinner'] ?? null;
    return [
        'players' => count($state['players'] ?? []),
        'rounds' => $rounds,
        'inProgress' => ($state['phase'] ?? '') === 'start-roll',
        'currentPlayerName' => ($state['phase'] ?? '') === 'start-roll'
            ? ($state['players'][(int) $state['currentPlayer']]['name'] ?? null)
            : null,
        'startingPlayerId' => $winnerId,
        'startingPlayerName' => $winnerId === null ? null : ($state['players'][$winnerId]['name'] ?? null),
    ];
}

function onlineProcessAiTurns(PDO $db, int $gameId): void
{
    onlineAiLearningEnsureSchema($db);
    for ($step = 0; $step < 12; $step++) {
        $db->beginTransaction();
        try {
            $stmt = $db->prepare('SELECT status, state_json, state_version FROM ' . onlineTable('online_games') . ' WHERE id = ? FOR UPDATE');
            $stmt->execute([$gameId]);
            $game = $stmt->fetch();
            if (!$game || $game['status'] !== 'active' || $game['state_json'] === null) {
                $db->commit();
                return;
            }
            $state = json_decode($game['state_json'], true, 512, JSON_THROW_ON_ERROR);
            $playerIndex = (int) $state['currentPlayer'];
            $stmt = $db->prepare('SELECT id, player_index, player_type FROM ' . onlineTable('game_participants') . ' WHERE game_id = ? AND player_index = ? AND left_at IS NULL LIMIT 1');
            $stmt->execute([$gameId, $playerIndex]);
            $participant = $stmt->fetch();
            if (!$participant || $participant['player_type'] !== 'ai') {
                $db->commit();
                return;
            }
            if ($state['phase'] === 'start-roll') {
                $actionType = 'start_roll';
                $actionResult = onlineEngineRecordStartingRoll($state, (int) $participant['player_index']);
            } elseif ($state['phase'] === 'roll') {
                $actionType = 'roll';
                $actionResult = onlineEngineRollDice($state);
            } elseif ($state['phase'] === 'move') {
                $actionType = 'move';
                $decision = onlineAiLearningChooseMove($db, $state);
                $pieceId = $decision['pieceId'];
                if ($pieceId === null) throw new RuntimeException('AI nemá dostupný platný tah.');
                $actionResult = onlineEngineMovePiece($state, $pieceId);
                $actionResult['pieceId'] = $pieceId;
                $actionResult['aiLearning'] = $decision['learning'];
            } elseif ($state['phase'] === 'no-move') {
                $actionType = 'pass_turn';
                onlineEngineAdvanceTurn($state);
                $actionResult = ['passed' => true];
            } else {
                $db->commit();
                return;
            }
            $newVersion = (int) $game['state_version'] + 1;
            $newStatus = ($state['phase'] ?? '') === 'finished' ? 'finished' : 'active';
            $db->prepare('UPDATE ' . onlineTable('online_games') . ' SET state_json = ?, state_version = ?, current_turn = ?, status = ?, last_activity_at = NOW(), finished_at = IF(? = \'finished\', NOW(), finished_at) WHERE id = ?')
                ->execute([json_encode($state, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), $newVersion, (int) $state['currentPlayer'], $newStatus, $newStatus, $gameId]);
            if ($actionType === 'start_roll') {
                $db->prepare('UPDATE ' . onlineTable('game_moves') . ' SET state_version = ?, action_json = ? WHERE game_id = ? AND action_type = \'start\' ORDER BY id DESC LIMIT 1')
                    ->execute([$newVersion, json_encode(onlineStartingRollLogData($state), JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), $gameId]);
            } else {
                $db->prepare('INSERT INTO ' . onlineTable('game_moves') . ' (game_id, participant_id, state_version, request_id, action_type, action_json) VALUES (?, ?, ?, ?, ?, ?)')
                    ->execute([$gameId, (int) $participant['id'], $newVersion, onlineUuid(), $actionType, json_encode($actionResult, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)]);
            }
            $db->commit();
            if ($newStatus === 'finished') return;
        } catch (Throwable $e) {
            if ($db->inTransaction()) $db->rollBack();
            throw $e;
        }
    }
}

$action = $_GET['action'] ?? $_POST['action'] ?? '';
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

try {
    if ($action === 'bootstrap' && $method === 'GET') {
        $identity = onlineIdentity(true);
        $account = onlineAuthAccount(onlineDb(), (int) $identity['id']);
        if ($account) {
            $account['id'] = (int) $account['id'];
        }
        onlineRespond([
            'success' => true,
            'identity' => [
                'id' => (int) $identity['id'],
                'display_name' => $identity['display_name'],
            ],
            'account' => $account,
            'csrf_token' => generateCsrfToken(),
        ]);
    }

    if ($method !== 'POST') {
        onlineFail('Nepodporovaná metoda požadavku.', 405);
    }

    $csrf = $_POST['csrf_token'] ?? '';
    if (!is_string($csrf) || !validateCsrfToken($csrf)) {
        onlineFail('Neplatný bezpečnostní token. Obnov stránku.', 403);
    }

    $identity = onlineRequireIdentity();
    $identityId = (int) $identity['id'];
    $db = onlineDb();

    switch ($action) {
        case 'register':
            onlineAuthRegister($db, $identityId, $_POST);

        case 'login':
            onlineAuthLogin($db, $identityId, $_POST);

        case 'logout':
            onlineAuthLogout($db, $identityId);

        case 'create_transfer_code': {
            $transferCode = onlineRandomToken(32);
            $db->beginTransaction();
            try {
                $db->prepare(
                    'UPDATE ' . onlineTable('player_devices') . '
                     SET revoked_at = NOW()
                     WHERE identity_id = ? AND device_label = \'transfer\' AND revoked_at IS NULL'
                )->execute([$identityId]);
                $db->prepare(
                    'INSERT INTO ' . onlineTable('player_devices') . '
                     (identity_id, token_hash, device_label, last_seen_at)
                     VALUES (?, ?, \'transfer\', NOW())'
                )->execute([$identityId, hash('sha256', $transferCode)]);
                $db->commit();
            } catch (Throwable $e) {
                if ($db->inTransaction()) $db->rollBack();
                throw $e;
            }
            onlineRespond([
                'success' => true,
                'transfer_code' => $transferCode,
                'expires_in' => 900,
            ]);
        }

        case 'claim_transfer_code': {
            $transferCode = $_POST['transfer_code'] ?? '';
            if (!is_string($transferCode) || !preg_match('/^[A-Za-z0-9_-]{40,60}$/', $transferCode)) {
                onlineFail('Přenosový kód není platný.');
            }
            $deviceToken = $_COOKIE['clovece_device'] ?? '';
            if (!is_string($deviceToken) || !preg_match('/^[A-Za-z0-9_-]{40,60}$/', $deviceToken)) {
                onlineFail('Toto zařízení nemá platnou identitu. Obnov stránku.', 401);
            }

            $db->beginTransaction();
            try {
                $stmt = $db->prepare(
                    'SELECT id, identity_id FROM ' . onlineTable('player_devices') . '
                     WHERE token_hash = ? AND device_label = \'transfer\'
                       AND revoked_at IS NULL
                       AND created_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)
                     LIMIT 1 FOR UPDATE'
                );
                $stmt->execute([hash('sha256', $transferCode)]);
                $transfer = $stmt->fetch();
                if (!$transfer) {
                    onlineFail('Kód vypršel nebo už byl použit. Vygeneruj nový kód.');
                }

                $stmt = $db->prepare(
                    'UPDATE ' . onlineTable('player_devices') . '
                     SET identity_id = ?, last_seen_at = NOW()
                     WHERE token_hash = ? AND device_label IS NULL AND revoked_at IS NULL'
                );
                $stmt->execute([(int) $transfer['identity_id'], hash('sha256', $deviceToken)]);
                if ($stmt->rowCount() !== 1) {
                    onlineFail('Identitu tohoto zařízení se nepodařilo převést.', 409);
                }

                $db->prepare(
                    'UPDATE ' . onlineTable('player_devices') . '
                     SET revoked_at = NOW() WHERE id = ?'
                )->execute([(int) $transfer['id']]);
                $db->prepare(
                    'UPDATE ' . onlineTable('player_identities') . '
                     SET last_seen_at = NOW() WHERE id = ?'
                )->execute([(int) $transfer['identity_id']]);
                $stmt = $db->prepare(
                    'SELECT display_name FROM ' . onlineTable('player_identities') . ' WHERE id = ? LIMIT 1'
                );
                $stmt->execute([(int) $transfer['identity_id']]);
                $displayName = (string) $stmt->fetchColumn();
                $db->commit();
            } catch (Throwable $e) {
                if ($db->inTransaction()) $db->rollBack();
                throw $e;
            }

            onlineRespond([
                'success' => true,
                'display_name' => $displayName,
            ]);
        }

        case 'list_my_games': {
            $stmt = $db->prepare(
                'SELECT g.id, g.public_id, g.status, g.player_limit, g.last_activity_at,
                        (SELECT COUNT(*) FROM ' . onlineTable('game_participants') . ' active
                         WHERE active.game_id = g.id AND active.left_at IS NULL) AS participant_count
                 FROM ' . onlineTable('online_games') . ' g
                 JOIN ' . onlineTable('game_participants') . ' mine ON mine.game_id = g.id
                 WHERE mine.identity_id = ? AND g.status IN (\'waiting\', \'active\', \'finished\')
                 ORDER BY g.last_activity_at DESC, g.id DESC'
            );
            $stmt->execute([$identityId]);
            $games = $stmt->fetchAll();
            foreach ($games as &$game) {
                $game['id'] = (int) $game['id'];
                $game['player_limit'] = (int) $game['player_limit'];
                $game['participant_count'] = (int) $game['participant_count'];
            }
            unset($game);
            onlineRespond(['success' => true, 'games' => $games]);
        }

        case 'resume_game': {
            $gameId = filter_var($_POST['game_id'] ?? 0, FILTER_VALIDATE_INT);
            if (!$gameId || $gameId < 1) {
                onlineFail('Chybí identifikátor hry.');
            }

            $inviteUrl = '';
            $db->beginTransaction();
            try {
                $stmt = $db->prepare(
                    'SELECT g.id, g.status, g.player_limit, g.created_by_identity_id, p.id AS participant_id
                     FROM ' . onlineTable('online_games') . ' g
                     JOIN ' . onlineTable('game_participants') . ' p ON p.game_id = g.id
                     WHERE g.id = ? AND p.identity_id = ? LIMIT 1 FOR UPDATE'
                );
                $stmt->execute([$gameId, $identityId]);
                $game = $stmt->fetch();
                if (!$game || !in_array($game['status'], ['waiting', 'active'], true)) {
                    onlineFail('Tuto hru už nelze obnovit.', 404);
                }

                $db->prepare(
                    'UPDATE ' . onlineTable('game_participants') . '
                     SET left_at = NULL, last_seen_at = NOW() WHERE id = ?'
                )->execute([$game['participant_id']]);

                // Pozvánkový token nelze z databáze obnovit (ukládá se pouze hash).
                // Tvůrci čekající místnosti proto vystavíme nový odkaz.
                if ($game['status'] === 'waiting'
                    && (int) $game['created_by_identity_id'] === $identityId) {
                    $inviteToken = onlineRandomToken(32);
                    $db->prepare(
                        'UPDATE ' . onlineTable('game_invites') . '
                         SET revoked_at = NOW() WHERE game_id = ? AND revoked_at IS NULL'
                    )->execute([$gameId]);
                    $db->prepare(
                        'INSERT INTO ' . onlineTable('game_invites') . '
                         (game_id, created_by_identity_id, token_hash, uses_limit, expires_at)
                         VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))'
                    )->execute([
                        $gameId,
                        $identityId,
                        hash('sha256', $inviteToken),
                        (int) $game['player_limit'] - 1,
                    ]);
                    $inviteUrl = rtrim(onlineDeviceCookiePath(), '/') . '/?invite=' . rawurlencode($inviteToken);
                }

                $db->prepare(
                    'UPDATE ' . onlineTable('online_games') . ' SET last_activity_at = NOW() WHERE id = ?'
                )->execute([$gameId]);
                $db->commit();
            } catch (Throwable $e) {
                if ($db->inTransaction()) $db->rollBack();
                throw $e;
            }

            onlineRespond(['success' => true, 'game_id' => (int) $gameId, 'invite_url' => $inviteUrl]);
        }

        case 'update_profile': {
            $account = onlineAuthAccount($db, $identityId);
            if (!$account) {
                onlineFail('Úpravy profilu jsou dostupné pouze přihlášenému účtu.', 403);
            }

            $rawName = $_POST['display_name'] ?? '';
            if (!is_string($rawName) || trim($rawName) === '') {
                onlineFail('Zobrazované jméno nesmí být prázdné.');
            }
            $name = onlineCleanName($rawName);
            $color = $_POST['color'] ?? '';
            $allowedColors = PLAYER_COLORS;
            if (!is_string($color) || !in_array($color, $allowedColors, true)) {
                onlineFail('Vybraná barva hráče není platná.');
            }

            $db->beginTransaction();
            try {
                $db->prepare(
                    'UPDATE ' . onlineTable('player_identities') . '
                     SET display_name = ?, last_seen_at = NOW() WHERE id = ?'
                )->execute([$name, $identityId]);
                $db->prepare(
                    'UPDATE ' . onlineTable('player_accounts') . '
                     SET color_preference = ? WHERE identity_id = ?'
                )->execute([$color, $identityId]);
                $db->prepare(
                    'UPDATE ' . onlineTable('game_participants') . '
                     SET display_name = ? WHERE identity_id = ? AND left_at IS NULL'
                )->execute([$name, $identityId]);
                $db->commit();
            } catch (Throwable $e) {
                if ($db->inTransaction()) $db->rollBack();
                throw $e;
            }

            onlineRespond([
                'success' => true,
                'account' => [
                    'display_name' => $name,
                    'color_preference' => $color,
                ],
            ]);
        }

        case 'profile_stats': {
            if (!onlineAuthAccount($db, $identityId)) {
                onlineFail('Statistiky jsou dostupné pouze přihlášenému účtu.', 403);
            }
            $stmt = $db->prepare(
                'SELECT COUNT(DISTINCT g.id) AS games,
                        COUNT(DISTINCT CASE
                            WHEN JSON_UNQUOTE(JSON_EXTRACT(g.state_json, \'$.winner\')) = CAST(p.player_index AS CHAR)
                            THEN g.id END) AS wins
                 FROM ' . onlineTable('online_games') . ' g
                 INNER JOIN ' . onlineTable('game_participants') . ' p ON p.game_id = g.id
                 WHERE p.identity_id = ? AND g.status = \'finished\''
            );
            $stmt->execute([$identityId]);
            $row = $stmt->fetch() ?: ['games' => 0, 'wins' => 0];
            $games = (int) $row['games'];
            $wins = (int) $row['wins'];
            $losses = max(0, $games - $wins);
            onlineRespond([
                'success' => true,
                'games' => $games,
                'wins' => $wins,
                'losses' => $losses,
                'win_rate' => $games > 0 ? (int) round(($wins / $games) * 100) : 0,
            ]);
        }

        case 'set_name': {
            $name = onlineCleanName($_POST['display_name'] ?? '');
            $db->prepare('UPDATE ' . onlineTable('player_identities') . ' SET display_name = ?, last_seen_at = NOW() WHERE id = ?')
                ->execute([$name, $identityId]);
            onlineRespond(['success' => true, 'display_name' => $name]);
        }

        case 'rename_participant': {
            $gameId = filter_var($_POST['game_id'] ?? 0, FILTER_VALIDATE_INT);
            if (!$gameId || $gameId < 1) {
                onlineFail('Chybí identifikátor hry.');
            }
            $name = onlineCleanName($_POST['display_name'] ?? '');
            $db->beginTransaction();
            try {
                $stmt = $db->prepare(
                    'SELECT id, status, state_json FROM ' . onlineTable('online_games') . ' WHERE id = ? FOR UPDATE'
                );
                $stmt->execute([$gameId]);
                $gameRow = $stmt->fetch();
                if (!$gameRow) onlineFail('Místnost nebyla nalezena.', 404);

                $stmt = $db->prepare(
                    'SELECT id, player_index FROM ' . onlineTable('game_participants') . '
                     WHERE game_id = ? AND identity_id = ? AND left_at IS NULL LIMIT 1'
                );
                $stmt->execute([$gameId, $identityId]);
                $participant = $stmt->fetch();
                if (!$participant) onlineFail('Nejsi aktivním hráčem této místnosti.', 403);

                $db->prepare('UPDATE ' . onlineTable('game_participants') . ' SET display_name = ? WHERE id = ?')
                    ->execute([$name, $participant['id']]);
                $db->prepare('UPDATE ' . onlineTable('player_identities') . ' SET display_name = ?, last_seen_at = NOW() WHERE id = ?')
                    ->execute([$name, $identityId]);

                if ($gameRow['state_json'] !== null) {
                    $state = json_decode($gameRow['state_json'], true, 512, JSON_THROW_ON_ERROR);
                    $playerIndex = (int) $participant['player_index'];
                    if (isset($state['players'][$playerIndex])) {
                        $state['players'][$playerIndex]['name'] = $name;
                        $stateJson = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
                        $db->prepare('UPDATE ' . onlineTable('online_games') . ' SET state_json = ?, last_activity_at = NOW() WHERE id = ?')
                            ->execute([$stateJson, $gameId]);
                    }
                } else {
                    $db->prepare('UPDATE ' . onlineTable('online_games') . ' SET last_activity_at = NOW() WHERE id = ?')
                        ->execute([$gameId]);
                }
                $db->commit();
            } catch (Throwable $e) {
                if ($db->inTransaction()) $db->rollBack();
                throw $e;
            }
            onlineRespond(['success' => true, 'display_name' => $name]);
        }

        case 'set_color': {
            $gameId = filter_var($_POST['game_id'] ?? 0, FILTER_VALIDATE_INT);
            $color = $_POST['color'] ?? '';
            $allowedColors = ['#E53935', '#1E88E5', '#43A047', '#F9A825', '#FB8C00', '#8E24AA', '#00ACC1', '#D81B60'];
            // "random" znamená, že hráč zatím nerezervuje žádnou konkrétní barvu.
            if (!$gameId || $gameId < 1 || !is_string($color)
                || ($color !== 'random' && !in_array($color, $allowedColors, true))) {
                onlineFail('Neplatná barva nebo identifikátor místnosti.');
            }
            $db->beginTransaction();
            try {
                $stmt = $db->prepare(
                    'SELECT id, status FROM ' . onlineTable('online_games') . ' WHERE id = ? FOR UPDATE'
                );
                $stmt->execute([$gameId]);
                $gameRow = $stmt->fetch();
                if (!$gameRow) onlineFail('Místnost nebyla nalezena.', 404);
                if ($gameRow['status'] !== 'waiting') {
                    onlineFail('Barvu lze změnit pouze před zahájením hry.', 409);
                }

                $stmt = $db->prepare(
                    'SELECT id FROM ' . onlineTable('game_participants') . '
                     WHERE game_id = ? AND identity_id = ? AND left_at IS NULL LIMIT 1'
                );
                $stmt->execute([$gameId, $identityId]);
                $participant = $stmt->fetch();
                if (!$participant) onlineFail('Nejsi aktivním hráčem této místnosti.', 403);

                if ($color !== 'random') {
                    $stmt = $db->prepare(
                        'SELECT id FROM ' . onlineTable('game_participants') . '
                         WHERE game_id = ? AND left_at IS NULL AND color = ? AND id <> ? LIMIT 1'
                    );
                    $stmt->execute([$gameId, $color, $participant['id']]);
                    if ($stmt->fetch()) onlineFail('Tuto barvu už má vybranou jiný hráč.', 409);
                }

                $db->prepare('UPDATE ' . onlineTable('game_participants') . ' SET color = ? WHERE id = ?')
                    ->execute([$color, $participant['id']]);
                $db->prepare('UPDATE ' . onlineTable('online_games') . ' SET last_activity_at = NOW() WHERE id = ?')
                    ->execute([$gameId]);
                $db->commit();
            } catch (Throwable $e) {
                if ($db->inTransaction()) $db->rollBack();
                throw $e;
            }
            onlineRespond(['success' => true, 'color' => $color]);
        }

        case 'create_game': {
            $playerLimit = filter_var($_POST['player_limit'] ?? 4, FILTER_VALIDATE_INT);
            if ($playerLimit === false || $playerLimit < 2 || $playerLimit > 8) {
                onlineFail('Počet hráčů musí být 2 až 8.');
            }

            $publicId = onlineRandomToken(16);
            $inviteToken = onlineRandomToken(32);
            $boardType = $playerLimit <= 4 ? 'classic' : 'extended';
            $displayName = onlineCleanName($identity['display_name'] ?? 'Hráč');

            $db->beginTransaction();
            try {
                $stmt = $db->prepare(
                    'INSERT INTO ' . onlineTable('online_games') . '
                     (public_id, created_by_identity_id, status, player_limit, board_type, last_activity_at)
                     VALUES (?, ?, \'waiting\', ?, ?, NOW())'
                );
                $stmt->execute([$publicId, $identityId, $playerLimit, $boardType]);
                $gameId = (int) $db->lastInsertId();

                $stmt = $db->prepare(
                    'INSERT INTO ' . onlineTable('game_participants') . '
                     (game_id, identity_id, player_index, player_type, display_name, color, is_ready)
                     VALUES (?, ?, 0, \'human\', ?, \'random\', 1)'
                );
                $stmt->execute([$gameId, $identityId, $displayName]);

                $stmt = $db->prepare(
                    'INSERT INTO ' . onlineTable('game_invites') . '
                     (game_id, created_by_identity_id, token_hash, uses_limit, expires_at)
                     VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 DAY))'
                );
                $stmt->execute([$gameId, $identityId, hash('sha256', $inviteToken), $playerLimit - 1]);
                $db->commit();
            } catch (Throwable $e) {
                if ($db->inTransaction()) {
                    $db->rollBack();
                }
                throw $e;
            }

            $path = onlineDeviceCookiePath();
            $inviteUrl = rtrim($path, '/') . '/?invite=' . rawurlencode($inviteToken);
            onlineRespond([
                'success' => true,
                'game_id' => $gameId,
                'public_id' => $publicId,
                'status' => 'waiting',
                'player_limit' => $playerLimit,
                'board_type' => $boardType,
                'invite_token' => $inviteToken,
                'invite_url' => $inviteUrl,
            ], 201);
        }

        case 'join_game': {
            $inviteToken = $_POST['invite_token'] ?? '';
            if (!is_string($inviteToken) || !preg_match('/^[A-Za-z0-9_-]{40,60}$/', $inviteToken)) {
                onlineFail('Pozvánkový odkaz není platný.');
            }

            $db->beginTransaction();
            try {
                $stmt = $db->prepare(
                    'SELECT v.id AS invite_id, v.game_id, v.uses_limit, v.uses_count,
                            v.expires_at, v.revoked_at, g.status, g.player_limit
                     FROM ' . onlineTable('game_invites') . ' v
                     JOIN ' . onlineTable('online_games') . ' g ON g.id = v.game_id
                     WHERE v.token_hash = ? FOR UPDATE'
                );
                $stmt->execute([hash('sha256', $inviteToken)]);
                $invite = $stmt->fetch();

                if (!$invite || $invite['revoked_at'] !== null
                    || ($invite['expires_at'] !== null && strtotime($invite['expires_at']) < time())) {
                    onlineFail('Pozvánka vypršela nebo byla odvolána.', 404);
                }

                $gameId = (int) $invite['game_id'];
                $stmt = $db->prepare(
                    'SELECT id, player_index FROM ' . onlineTable('game_participants') . '
                     WHERE game_id = ? AND identity_id = ? LIMIT 1'
                );
                $stmt->execute([$gameId, $identityId]);
                $existing = $stmt->fetch();

                if ($existing) {
                    $participantId = (int) $existing['id'];
                    $playerIndex = (int) $existing['player_index'];
                    $db->prepare('UPDATE ' . onlineTable('game_participants') . ' SET left_at = NULL, last_seen_at = NOW() WHERE id = ?')
                        ->execute([$participantId]);
                } else {
                    if ($invite['status'] !== 'waiting') {
                        onlineFail('Hra již nepřijímá nové hráče.', 409);
                    }
                    if ((int) $invite['uses_count'] >= (int) $invite['uses_limit']) {
                        onlineFail('Tato pozvánka již byla použita maximální početkrát.', 409);
                    }

                    $stmt = $db->prepare(
                        'SELECT player_index FROM ' . onlineTable('game_participants') . '
                         WHERE game_id = ? AND left_at IS NULL'
                    );
                    $stmt->execute([$gameId]);
                    $used = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
                    $playerIndex = 0;
                    while (in_array($playerIndex, $used, true) && $playerIndex < 8) {
                        $playerIndex++;
                    }

                    if ($playerIndex >= (int) $invite['player_limit']) {
                        onlineFail('Hra je již plná.', 409);
                    }

                    $stmt = $db->prepare(
                        'INSERT INTO ' . onlineTable('game_participants') . '
                         (game_id, identity_id, player_index, player_type, display_name, color, is_ready, last_seen_at)
                         VALUES (?, ?, ?, \'human\', ?, \'random\', 0, NOW())'
                    );
                    $stmt->execute([
                        $gameId,
                        $identityId,
                        $playerIndex,
                        onlineCleanName($identity['display_name'] ?? 'Hráč'),
                    ]);
                    $participantId = (int) $db->lastInsertId();

                    $db->prepare('UPDATE ' . onlineTable('game_invites') . ' SET uses_count = uses_count + 1 WHERE id = ?')
                        ->execute([$invite['invite_id']]);
                }

                $db->prepare('UPDATE ' . onlineTable('online_games') . ' SET last_activity_at = NOW() WHERE id = ?')
                    ->execute([$gameId]);
                $db->commit();
            } catch (Throwable $e) {
                if ($db->inTransaction()) {
                    $db->rollBack();
                }
                throw $e;
            }

            onlineRespond([
                'success' => true,
                'game_id' => $gameId,
                'participant_id' => $participantId,
                'player_index' => $playerIndex,
            ]);
        }


        case 'add_ai_player': {
            $gameId = filter_var($_POST['game_id'] ?? 0, FILTER_VALIDATE_INT);
            if (!$gameId || $gameId < 1) onlineFail('Chybí identifikátor místnosti.');
            $db->beginTransaction();
            try {
                $stmt = $db->prepare('SELECT id, status, player_limit, created_by_identity_id FROM ' . onlineTable('online_games') . ' WHERE id = ? FOR UPDATE');
                $stmt->execute([$gameId]);
                $gameRow = $stmt->fetch();
                if (!$gameRow) onlineFail('Místnost nebyla nalezena.', 404);
                if ((int) $gameRow['created_by_identity_id'] !== $identityId) onlineFail('Počítačové hráče může přidávat pouze zakladatel.', 403);
                if ($gameRow['status'] !== 'waiting') onlineFail('Počítačového hráče lze přidat pouze před zahájením hry.', 409);
                $stmt = $db->prepare('SELECT player_index, player_type FROM ' . onlineTable('game_participants') . ' WHERE game_id = ? AND left_at IS NULL');
                $stmt->execute([$gameId]);
                $participants = $stmt->fetchAll();
                if (count($participants) >= (int) $gameRow['player_limit']) onlineFail('Místnost už je plná.', 409);
                $usedIndexes = array_map(static fn(array $p): int => (int) $p['player_index'], $participants);
                $playerIndex = 0;
                while (in_array($playerIndex, $usedIndexes, true)) $playerIndex++;
                if ($playerIndex >= (int) $gameRow['player_limit']) onlineFail('V místnosti už není volné místo.', 409);
                $aiNumber = 1;
                foreach ($participants as $participant) if ($participant['player_type'] === 'ai') $aiNumber++;
                $name = 'Počítač ' . $aiNumber;
                $db->prepare('INSERT INTO ' . onlineTable('game_participants') . ' (game_id, identity_id, player_index, player_type, display_name, color, is_ready, last_seen_at) VALUES (?, NULL, ?, \'ai\', ?, \'random\', 1, NOW())')
                    ->execute([$gameId, $playerIndex, $name]);
                $db->prepare('UPDATE ' . onlineTable('online_games') . ' SET last_activity_at = NOW() WHERE id = ?')->execute([$gameId]);
                $db->commit();
            } catch (Throwable $e) {
                if ($db->inTransaction()) $db->rollBack();
                throw $e;
            }
            onlineRespond(['success' => true, 'display_name' => $name, 'player_index' => $playerIndex]);
        }

        case 'start_game': {
            $gameId = filter_var($_POST['game_id'] ?? 0, FILTER_VALIDATE_INT);
            if (!$gameId || $gameId < 1) {
                onlineFail('Chybí identifikátor hry.');
            }

            $db->beginTransaction();
            try {
                $stmt = $db->prepare(
                    'SELECT id, status, player_limit, created_by_identity_id
                     FROM ' . onlineTable('online_games') . ' WHERE id = ? FOR UPDATE'
                );
                $stmt->execute([$gameId]);
                $gameRow = $stmt->fetch();

                if (!$gameRow || (int) $gameRow['created_by_identity_id'] !== $identityId) {
                    onlineFail('Hru může spustit pouze její zakladatel.', 403);
                }
                if ($gameRow['status'] !== 'waiting') {
                    onlineFail('Tato hra již není ve stavu čekání.', 409);
                }

                $stmt = $db->prepare(
                    'SELECT id, identity_id, player_index, player_type, display_name, color
                     FROM ' . onlineTable('game_participants') . '
                     WHERE game_id = ? AND left_at IS NULL ORDER BY player_index'
                );
                $stmt->execute([$gameId]);
                $participants = $stmt->fetchAll();

                $humanIdentityIds = [];
                foreach ($participants as $participant) {
                    if (($participant['player_type'] ?? 'human') === 'human'
                        && $participant['identity_id'] !== null) {
                        $humanIdentityIds[(int) $participant['identity_id']] = true;
                    }
                }
                if (count($humanIdentityIds) < 2) {
                    onlineFail('Online hru mohou spustit pouze alespoň dva lidé na různých zařízeních. Počítač se počítá jako další hráč, ne jako náhrada druhého člověka.', 409);
                }
                if (count($participants) < 2) {
                    onlineFail('Ke spuštění hry jsou potřeba alespoň dva účastníci.', 409);
                }
                if (count($participants) > (int) $gameRow['player_limit']) {
                    onlineFail('Počet hráčů překračuje limit místnosti.', 409);
                }
                $creatorIsPresent = false;
                foreach ($participants as $participant) {
                    if ((int) $participant['identity_id'] === $identityId) {
                        $creatorIsPresent = true;
                        break;
                    }
                }
                if (!$creatorIsPresent) {
                    onlineFail('Zakladatel musí být před spuštěním stále v místnosti.', 403);
                }

                // Dvoufázové přečíslování zabrání kolizi unikátního indexu.
                $db->prepare(
                    'UPDATE ' . onlineTable('game_participants') . '
                     SET player_index = player_index + 100
                     WHERE game_id = ? AND left_at IS NULL'
                )->execute([$gameId]);

                foreach ($participants as $index => $participant) {
                    $db->prepare(
                        'UPDATE ' . onlineTable('game_participants') . '
                         SET player_index = ? WHERE id = ?'
                    )->execute([$index, $participant['id']]);
                    $participants[$index]['player_index'] = $index;
                }

                // Ručně zvolené barvy mají přednost. Hráči s volbou "random"
                // dostanou náhodně jednu ze zbývajících barev až při startu hry.
                $allColors = ['#E53935', '#1E88E5', '#43A047', '#F9A825', '#FB8C00', '#8E24AA', '#00ACC1', '#D81B60'];
                $usedColors = array_values(array_filter(
                    array_column($participants, 'color'),
                    static fn(string $color): bool => $color !== 'random'
                ));
                if (count($usedColors) !== count(array_unique($usedColors))) {
                    onlineFail('V místnosti jsou duplicitní ručně vybrané barvy.', 409);
                }
                $freeColors = array_values(array_diff($allColors, $usedColors));
                shuffle($freeColors);
                foreach ($participants as $index => &$participant) {
                    if ($participant['color'] !== 'random') {
                        continue;
                    }
                    if ($freeColors === []) {
                        onlineFail('Pro všechny hráče už nezbývá volná barva.', 409);
                    }
                    $participant['color'] = array_pop($freeColors);
                    $db->prepare(
                        'UPDATE ' . onlineTable('game_participants') . ' SET color = ? WHERE id = ?'
                    )->execute([$participant['color'], $participant['id']]);
                }
                unset($participant);

                // Hra začíná skutečným rozstřelem. Živí hráči házejí ručně;
                // AI případně provede svůj hod ve chvíli, kdy na ni přijde řada.
                $state = onlineEngineCreateState($participants);
                $stateJson = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
                $requestId = onlineUuid();

                $db->prepare(
                    'UPDATE ' . onlineTable('online_games') . '
                     SET status = \'active\', state_json = ?, state_schema_version = 1,
                         state_version = 1, current_turn = 0, started_at = NOW(),
                         last_activity_at = NOW()
                     WHERE id = ?'
                )->execute([$stateJson, $gameId]);

                $creatorParticipantId = null;
                foreach ($participants as $participant) {
                    if ((int) $participant['identity_id'] === $identityId) {
                        $creatorParticipantId = (int) $participant['id'];
                        break;
                    }
                }

                $db->prepare(
                    'INSERT INTO ' . onlineTable('game_moves') . '
                     (game_id, participant_id, state_version, request_id, action_type, action_json)
                     VALUES (?, ?, 1, ?, \'start\', ?)'
                )->execute([
                    $gameId,
                    $creatorParticipantId,
                    $requestId,
                    json_encode(onlineStartingRollLogData($state), JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                ]);

                $db->commit();
            } catch (Throwable $e) {
                if ($db->inTransaction()) {
                    $db->rollBack();
                }
                throw $e;
            }

            onlineRespond([
                'success' => true,
                'game_id' => $gameId,
                'state' => $state,
                'state_version' => 1,
            ]);
        }

        case 'game_action': {
            $gameId = filter_var($_POST['game_id'] ?? 0, FILTER_VALIDATE_INT);
            $expectedVersion = filter_var($_POST['expected_version'] ?? -1, FILTER_VALIDATE_INT);
            $requestId = $_POST['request_id'] ?? '';
            $actionType = $_POST['action_type'] ?? '';

            if (!$gameId || $gameId < 1 || $expectedVersion === false || $expectedVersion < 0) {
                onlineFail('Chybí nebo je neplatná verze hry.');
            }
            if (!is_string($requestId) || !preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i', $requestId)) {
                onlineFail('Neplatné ID požadavku.');
            }
            if (!in_array($actionType, ['start_roll', 'roll', 'move', 'pass_turn'], true)) {
                onlineFail('Neznámý typ herní akce.');
            }

            $db->beginTransaction();
            try {
                $stmt = $db->prepare(
                    'SELECT id, status, state_json, state_version
                     FROM ' . onlineTable('online_games') . ' WHERE id = ? FOR UPDATE'
                );
                $stmt->execute([$gameId]);
                $gameRow = $stmt->fetch();
                if (!$gameRow || $gameRow['state_json'] === null) {
                    onlineFail('Hra nebyla nalezena nebo ještě nebyla spuštěna.', 404);
                }
                if ($gameRow['status'] !== 'active') {
                    onlineFail('Hra právě nepřijímá tahy.', 409);
                }

                $stmt = $db->prepare(
                    'SELECT id, player_index FROM ' . onlineTable('game_participants') . '
                     WHERE game_id = ? AND identity_id = ? AND left_at IS NULL LIMIT 1'
                );
                $stmt->execute([$gameId, $identityId]);
                $participant = $stmt->fetch();
                if (!$participant) {
                    onlineFail('Nejsi aktivním hráčem této hry.', 403);
                }

                $state = json_decode($gameRow['state_json'], true, 512, JSON_THROW_ON_ERROR);
                $currentVersion = (int) $gameRow['state_version'];

                $stmt = $db->prepare(
                    'SELECT id FROM ' . onlineTable('game_moves') . '
                     WHERE game_id = ? AND request_id = ? LIMIT 1'
                );
                $stmt->execute([$gameId, $requestId]);
                if ($stmt->fetch()) {
                    $db->commit();
                    onlineRespond([
                        'success' => true,
                        'duplicate' => true,
                        'state' => $state,
                        'state_version' => $currentVersion,
                    ]);
                }

                if ($expectedVersion !== $currentVersion) {
                    $db->rollBack();
                    onlineRespond([
                        'success' => false,
                        'error' => 'Stav hry se mezitím změnil. Načítám aktuální stav.',
                        'state' => $state,
                        'state_version' => $currentVersion,
                    ], 409);
                }

                if ((int) $participant['player_index'] !== (int) $state['currentPlayer']) {
                    onlineFail('Nyní je na tahu jiný hráč.', 409);
                }

                $actionResult = [];
                if ($actionType === 'start_roll') {
                    if (($state['phase'] ?? '') !== 'start-roll') {
                        onlineFail('Rozstřel již skončil.', 409);
                    }
                    $actionResult = onlineEngineRecordStartingRoll($state, (int) $participant['player_index']);
                } elseif ($actionType === 'roll') {
                    if (($state['phase'] ?? '') !== 'roll') {
                        onlineFail('Nejprve musí být dokončen rozstřel.', 409);
                    }
                    $actionResult = onlineEngineRollDice($state);
                } elseif ($actionType === 'move') {
                    $pieceId = filter_var($_POST['piece_id'] ?? -1, FILTER_VALIDATE_INT);
                    if ($pieceId === false || $pieceId < 0 || $pieceId > 3) {
                        onlineFail('Neplatná figurka.');
                    }
                    $actionResult = onlineEngineMovePiece($state, $pieceId);
                } else {
                    if (($state['phase'] ?? '') !== 'no-move') {
                        onlineFail('Tah nelze přeskočit, protože hráč má možný tah.');
                    }
                    onlineEngineAdvanceTurn($state);
                    $actionResult = ['passed' => true];
                }

                $newVersion = $currentVersion + 1;
                $newStatus = ($state['phase'] ?? '') === 'finished' ? 'finished' : 'active';
                $stateJson = json_encode($state, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
                $actionJson = json_encode($actionResult, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);

                $db->prepare(
                    'UPDATE ' . onlineTable('online_games') . '
                     SET state_json = ?, state_version = ?, current_turn = ?,
                         status = ?, last_activity_at = NOW(),
                         finished_at = IF(? = \'finished\', NOW(), finished_at)
                     WHERE id = ?'
                )->execute([
                    $stateJson,
                    $newVersion,
                    (int) $state['currentPlayer'],
                    $newStatus,
                    $newStatus,
                    $gameId,
                ]);

                if ($actionType === 'start_roll') {
                    // Průběžný rozstřel upravuje jediný startovní záznam v logu.
                    $db->prepare(
                        'UPDATE ' . onlineTable('game_moves') . '
                         SET state_version = ?, action_json = ?
                         WHERE game_id = ? AND action_type = \'start\'
                         ORDER BY id DESC LIMIT 1'
                    )->execute([
                        $newVersion,
                        json_encode(onlineStartingRollLogData($state), JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
                        $gameId,
                    ]);
                } else {
                    $db->prepare(
                        'INSERT INTO ' . onlineTable('game_moves') . '
                         (game_id, participant_id, state_version, request_id, action_type, action_json)
                         VALUES (?, ?, ?, ?, ?, ?)'
                    )->execute([
                        $gameId,
                        $participant['id'],
                        $newVersion,
                        $requestId,
                        $actionType,
                        $actionJson,
                    ]);
                }

                $db->commit();
            } catch (Throwable $e) {
                if ($db->inTransaction()) {
                    $db->rollBack();
                }
                throw $e;
            }

            onlineRespond([
                'success' => true,
                'state' => $state,
                'state_version' => $newVersion,
                'action_result' => $actionResult,
            ]);
        }

        case 'get_game': {
            $gameId = filter_var($_POST['game_id'] ?? 0, FILTER_VALIDATE_INT);
            if (!$gameId || $gameId < 1) {
                onlineFail('Chybí identifikátor hry.');
            }

            $game = onlineGameAccess($db, $gameId, $identityId);
            onlineProcessAiTurns($db, $gameId);
            $game = onlineGameAccess($db, $gameId, $identityId);
            $stmt = $db->prepare(
                'SELECT id, identity_id, player_index, player_type, display_name, color, is_ready, joined_at, last_seen_at
                 FROM ' . onlineTable('game_participants') . '
                 WHERE game_id = ? AND left_at IS NULL ORDER BY player_index'
            );
            $stmt->execute([$gameId]);
            $participants = $stmt->fetchAll();

            $stmt = $db->prepare(
                'SELECT id, participant_id, message, created_at
                 FROM ' . onlineTable('game_chat') . '
                 WHERE game_id = ? ORDER BY id DESC LIMIT 30'
            );
            $stmt->execute([$gameId]);
            $chat = array_reverse($stmt->fetchAll());

            $stmt = $db->prepare(
                'SELECT id, participant_id, state_version, action_type, action_json, created_at
                 FROM ' . onlineTable('game_moves') . '
                 WHERE game_id = ? ORDER BY id DESC LIMIT 30'
            );
            $stmt->execute([$gameId]);
            $moves = array_reverse($stmt->fetchAll());

            $state = $game['state_json'] !== null ? json_decode($game['state_json'], true) : null;
            onlineRespond([
                'success' => true,
                'game' => [
                    'id' => (int) $game['id'],
                    'public_id' => $game['public_id'],
                    'status' => $game['status'],
                    'player_limit' => (int) $game['player_limit'],
                    'board_type' => $game['board_type'],
                    'state' => $state,
                    'state_version' => (int) $game['state_version'],
                    'current_turn' => $game['current_turn'] === null ? null : (int) $game['current_turn'],
                ],
                'participants' => array_map(static function (array $participant): array {
                    unset($participant['identity_id']);
                    return $participant;
                }, $participants),
                'human_count' => count(array_unique(array_filter(
                    array_column($participants, 'identity_id'),
                    static fn($id): bool => $id !== null
                ))),
                'chat' => $chat,
                'moves' => $moves,
                'current_participant_id' => (int) $game['participant_id'],
                'current_player_index' => (int) $game['player_index'],
                'is_creator' => (int) $game['created_by_identity_id'] === $identityId,
            ]);
        }

        case 'send_chat': {
            $gameId = filter_var($_POST['game_id'] ?? 0, FILTER_VALIDATE_INT);
            $message = trim(strip_tags(is_string($_POST['message'] ?? null) ? $_POST['message'] : ''));
            if (!$gameId || $gameId < 1 || $message === '') {
                onlineFail('Zpráva nebo identifikátor hry chybí.');
            }
            if (function_exists('mb_substr')) {
                $message = mb_substr($message, 0, 1000, 'UTF-8');
            } else {
                $message = substr($message, 0, 1000);
            }

            $game = onlineGameAccess($db, $gameId, $identityId);
            $db->beginTransaction();
            try {
                $stmt = $db->prepare(
                    'INSERT INTO ' . onlineTable('game_chat') . ' (game_id, participant_id, message)
                     VALUES (?, ?, ?)'
                );
                $stmt->execute([$gameId, $game['participant_id'], $message]);

                $db->prepare(
                    'DELETE FROM ' . onlineTable('game_chat') . '
                     WHERE game_id = ? AND id NOT IN (
                         SELECT id FROM (
                             SELECT id FROM ' . onlineTable('game_chat') . '
                             WHERE game_id = ? ORDER BY id DESC LIMIT 30
                         ) AS recent_messages
                     )'
                )->execute([$gameId, $gameId]);

                $db->prepare('UPDATE ' . onlineTable('online_games') . ' SET last_activity_at = NOW() WHERE id = ?')
                    ->execute([$gameId]);
                $db->commit();
            } catch (Throwable $e) {
                if ($db->inTransaction()) {
                    $db->rollBack();
                }
                throw $e;
            }

            onlineRespond(['success' => true]);
        }

        case 'leave_game': {
            $gameId = filter_var($_POST['game_id'] ?? 0, FILTER_VALIDATE_INT);
            if (!$gameId || $gameId < 1) {
                onlineFail('Chybí identifikátor hry.');
            }
            $game = onlineGameAccess($db, $gameId, $identityId);
            if ($game['status'] === 'waiting') {
                // V čekající místnosti lze bezpečně uvolnit místo; žádné tahy ještě neexistují.
                $db->prepare('DELETE FROM ' . onlineTable('game_participants') . ' WHERE id = ?')
                    ->execute([$game['participant_id']]);

                if ((int) $game['created_by_identity_id'] === $identityId) {
                    $stmt = $db->prepare(
                        'SELECT identity_id FROM ' . onlineTable('game_participants') . '
                         WHERE game_id = ? AND left_at IS NULL ORDER BY player_index LIMIT 1'
                    );
                    $stmt->execute([$gameId]);
                    $nextCreatorId = $stmt->fetchColumn();
                    if ($nextCreatorId !== false) {
                        $db->prepare(
                            'UPDATE ' . onlineTable('online_games') . '
                             SET created_by_identity_id = ? WHERE id = ?'
                        )->execute([$nextCreatorId, $gameId]);
                    } else {
                        $db->prepare(
                            'UPDATE ' . onlineTable('online_games') . '
                             SET status = \'abandoned\', created_by_identity_id = NULL
                             WHERE id = ?'
                        )->execute([$gameId]);
                    }
                }
            } else {
                $db->prepare('UPDATE ' . onlineTable('game_participants') . ' SET left_at = NOW() WHERE id = ?')
                    ->execute([$game['participant_id']]);
            }
            $db->prepare('UPDATE ' . onlineTable('online_games') . ' SET last_activity_at = NOW() WHERE id = ?')
                ->execute([$gameId]);
            onlineRespond(['success' => true]);
        }

        default:
            onlineFail('Neznámá akce.', 404);
    }
} catch (Throwable $e) {
    error_log('Online API error: ' . $e->getMessage());
    onlineFail('Interní chyba online API.', 500);
}
