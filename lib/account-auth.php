<?php
// /lib/account-auth.php
declare(strict_types=1);

/**
 * Uživatelské účty navázané na trvalou identitu online hráče.
 * Zařízení používá nadále stejný bezpečný token; při přihlášení se
 * anonymní identita sloučí s účtem a zachová přístup k jejím hrám.
 */

function onlineAuthAccount(PDO $db, int $identityId): ?array
{
    $stmt = $db->prepare(
        'SELECT a.id, a.username, a.color_preference, i.display_name
         FROM ' . onlineTable('player_accounts') . ' a
         JOIN ' . onlineTable('player_identities') . ' i ON i.id = a.identity_id
         WHERE a.identity_id = ? LIMIT 1'
    );
    $stmt->execute([$identityId]);
    $account = $stmt->fetch();
    return $account ?: null;
}

function onlineAuthCleanUsername(mixed $value): string
{
    return trim(is_string($value) ? $value : '');
}

function onlineAuthSession(int $accountId): string
{
    if (!session_regenerate_id(true)) {
        throw new RuntimeException('Bezpečné obnovení přihlašovací relace se nezdařilo.');
    }
    unset($_SESSION[CSRF_TOKEN_NAME]);
    $_SESSION['player_account_id'] = $accountId;
    return generateCsrfToken();
}

function onlineAuthMergeIdentity(PDO $db, int $sourceId, int $targetId): void
{
    if ($sourceId === $targetId) {
        return;
    }

    // Dva záznamy stejného účtu ve stejné hře nelze sloučit kvůli
    // unikátnímu klíči (game_id, identity_id). Starší duplicitní účast
    // zůstane v historii, ale bude odpojena a označena jako opuštěná.
    $db->prepare(
        'UPDATE ' . onlineTable('game_participants') . ' source
         INNER JOIN ' . onlineTable('game_participants') . ' target
            ON target.game_id = source.game_id AND target.identity_id = ?
         SET source.identity_id = NULL, source.left_at = COALESCE(source.left_at, NOW())
         WHERE source.identity_id = ?'
    )->execute([$targetId, $sourceId]);

    $db->prepare(
        'UPDATE ' . onlineTable('game_participants') . '
         SET identity_id = ? WHERE identity_id = ?'
    )->execute([$targetId, $sourceId]);

    $db->prepare(
        'UPDATE ' . onlineTable('online_games') . '
         SET created_by_identity_id = ? WHERE created_by_identity_id = ?'
    )->execute([$targetId, $sourceId]);

    $db->prepare(
        'UPDATE ' . onlineTable('game_invites') . '
         SET created_by_identity_id = ? WHERE created_by_identity_id = ?'
    )->execute([$targetId, $sourceId]);

    $db->prepare(
        'UPDATE ' . onlineTable('player_devices') . '
         SET identity_id = ? WHERE identity_id = ?'
    )->execute([$targetId, $sourceId]);

    $db->prepare(
        'DELETE FROM ' . onlineTable('player_identities') . ' WHERE id = ?'
    )->execute([$sourceId]);
}

function onlineAuthRegister(PDO $db, int $identityId, array $input): never
{
    $username = onlineAuthCleanUsername($input['username'] ?? '');
    $password = $input['password'] ?? '';
    $displayName = onlineCleanName($input['display_name'] ?? '');
    if ($displayName === 'Hráč') {
        $displayName = $username;
    }
    $color = $input['color'] ?? PLAYER_COLORS[0];

    if (!preg_match('/^[\p{L}\p{N}_.-]{3,50}$/u', $username)) {
        onlineFail('Uživatelské jméno musí mít 3–50 znaků. Použij písmena, čísla, tečku, pomlčku nebo podtržítko.');
    }
    if (!is_string($password) || strlen($password) < 6 || strlen($password) > 200) {
        onlineFail('Heslo musí mít alespoň 6 znaků a nejvýše 200 znaků.');
    }
    if (!in_array($color, PLAYER_COLORS, true)) {
        onlineFail('Vybraná barva není platná.');
    }

    $db->beginTransaction();
    try {
        $stmt = $db->prepare(
            'SELECT id FROM ' . onlineTable('player_accounts') . ' WHERE username = ? LIMIT 1'
        );
        $stmt->execute([$username]);
        if ($stmt->fetch()) {
            onlineFail('Toto uživatelské jméno je již obsazené.', 409);
        }

        $stmt = $db->prepare(
            'SELECT identity_type FROM ' . onlineTable('player_identities') . ' WHERE id = ? FOR UPDATE'
        );
        $stmt->execute([$identityId]);
        $identityType = $stmt->fetchColumn();
        if ($identityType !== 'anonymous') {
            onlineFail('Na tomto zařízení je již přihlášený účet. Nejprve se odhlaš.');
        }

        $db->prepare(
            'UPDATE ' . onlineTable('player_identities') . '
             SET identity_type = \'account\', display_name = ?, last_seen_at = NOW()
             WHERE id = ?'
        )->execute([$displayName, $identityId]);

        $db->prepare(
            'INSERT INTO ' . onlineTable('player_accounts') . '
             (identity_id, username, password_hash, color_preference)
             VALUES (?, ?, ?, ?)'
        )->execute([$identityId, $username, password_hash($password, PASSWORD_DEFAULT), $color]);

        $accountId = (int) $db->lastInsertId();
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }

    $csrfToken = onlineAuthSession($accountId);
    onlineRespond([
        'success' => true,
        'player' => [
            'id' => $accountId,
            'username' => $username,
            'display_name' => $displayName,
            'color_preference' => $color,
        ],
        'csrf_token' => $csrfToken,
    ]);
}

function onlineAuthLogin(PDO $db, int $currentIdentityId, array $input): never
{
    $username = onlineAuthCleanUsername($input['username'] ?? '');
    $password = $input['password'] ?? '';
    if ($username === '' || !is_string($password) || $password === '' || strlen($password) > 200) {
        onlineFail('Zadej uživatelské jméno a heslo.');
    }

    $stmt = $db->prepare(
        'SELECT a.id, a.identity_id, a.username, a.password_hash, a.color_preference,
                i.display_name
         FROM ' . onlineTable('player_accounts') . ' a
         JOIN ' . onlineTable('player_identities') . ' i ON i.id = a.identity_id
         WHERE a.username = ? LIMIT 1'
    );
    $stmt->execute([$username]);
    $account = $stmt->fetch();

    if (!$account || !password_verify($password, $account['password_hash'])) {
        onlineFail('Uživatelské jméno nebo heslo není správné.', 401);
    }

    $targetIdentityId = (int) $account['identity_id'];
    $db->beginTransaction();
    try {
        $stmt = $db->prepare(
            'SELECT identity_type FROM ' . onlineTable('player_identities') . ' WHERE id = ? FOR UPDATE'
        );
        $stmt->execute([$currentIdentityId]);
        $currentType = $stmt->fetchColumn();

        if ($currentType === false) {
            onlineFail('Identita zařízení již neexistuje. Obnov stránku.');
        }
        if ($currentIdentityId !== $targetIdentityId && $currentType !== 'anonymous') {
            onlineFail('Na tomto zařízení je přihlášený jiný účet. Nejprve se odhlaš.');
        }

        onlineAuthMergeIdentity($db, $currentIdentityId, $targetIdentityId);
        $db->prepare(
            'UPDATE ' . onlineTable('player_accounts') . ' SET last_login_at = NOW() WHERE id = ?'
        )->execute([(int) $account['id']]);
        $db->prepare(
            'UPDATE ' . onlineTable('player_identities') . ' SET last_seen_at = NOW() WHERE id = ?'
        )->execute([$targetIdentityId]);

        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }

    $csrfToken = onlineAuthSession((int) $account['id']);
    onlineRespond([
        'success' => true,
        'player' => [
            'id' => (int) $account['id'],
            'username' => $account['username'],
            'display_name' => $account['display_name'],
            'color_preference' => $account['color_preference'],
        ],
        'csrf_token' => $csrfToken,
    ]);
}

function onlineAuthLogout(PDO $db, int $identityId): never
{
    $db->beginTransaction();
    try {
        $stmt = $db->prepare(
            'SELECT identity_type FROM ' . onlineTable('player_identities') . ' WHERE id = ? FOR UPDATE'
        );
        $stmt->execute([$identityId]);
        if ($stmt->fetchColumn() !== 'account') {
            onlineFail('Na tomto zařízení není přihlášený účet.', 409);
        }

        $stmt = $db->prepare(
            'INSERT INTO ' . onlineTable('player_identities') . '
             (identity_type, display_name, last_seen_at) VALUES (\'anonymous\', \'Hráč\', NOW())'
        );
        $stmt->execute();
        $anonymousIdentityId = (int) $db->lastInsertId();

        $deviceToken = $_COOKIE['clovece_device'] ?? '';
        if (!is_string($deviceToken) || !preg_match('/^[A-Za-z0-9_-]{40,60}$/', $deviceToken)) {
            onlineFail('Identita zařízení chybí. Obnov stránku a zkus to znovu.', 401);
        }

        $stmt = $db->prepare(
            'UPDATE ' . onlineTable('player_devices') . '
             SET identity_id = ?, last_seen_at = NOW()
             WHERE identity_id = ? AND token_hash = ? AND revoked_at IS NULL'
        );
        $stmt->execute([$anonymousIdentityId, $identityId, hash('sha256', $deviceToken)]);
        if ($stmt->rowCount() !== 1) {
            onlineFail('Odhlášení zařízení se nepodařilo. Obnov stránku a zkus to znovu.', 409);
        }
        $db->commit();
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        throw $e;
    }

    if (!session_regenerate_id(true)) {
        throw new RuntimeException('Bezpečné obnovení přihlašovací relace se nezdařilo.');
    }
    unset($_SESSION['player_account_id'], $_SESSION[CSRF_TOKEN_NAME]);
    onlineRespond([
        'success' => true,
        'csrf_token' => generateCsrfToken(),
        'identity' => ['id' => $anonymousIdentityId, 'display_name' => 'Hráč'],
    ]);
}
