-- Člověče, nezlob se! – čisté databázové schéma pro online multiplayer
-- Verze schématu: 3
--
-- Určeno pro MySQL 8.0 / InnoDB.
-- Jde o SQL šablonu. PHP instalační skript musí nahradit {DB_PREFIX}
-- hodnotou TABLE_PREFIX načtenou ze souboru .env.
-- SQL se nesmí spouštět přímo s nevyplněným tokenem.
-- Tento soubor NEOBSAHUJE DROP TABLE. Staré tabulky nemaž bez zálohy.
--
-- Toto schéma je cílový základ nového online API. Stávající staré api.php
-- zatím s tímto schématem není kompatibilní. Lokální hra se tímto SQL nemění.

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS {DB_PREFIX}schema_migrations (
    version INT UNSIGNED NOT NULL,
    name VARCHAR(120) NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS {DB_PREFIX}player_identities (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    identity_type ENUM('anonymous', 'account') NOT NULL DEFAULT 'anonymous',
    display_name VARCHAR(50) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_identity_last_seen (last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Přihlašovací účet je navázán na trvalou identitu zařízení/hráče.
-- Heslo se ukládá výhradně jako výstup password_hash().
CREATE TABLE IF NOT EXISTS {DB_PREFIX}player_accounts (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    identity_id BIGINT UNSIGNED NOT NULL,
    username VARCHAR(50) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    color_preference CHAR(7) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '#ff6b6b',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_player_account_identity (identity_id),
    UNIQUE KEY uq_player_account_username (username),
    CONSTRAINT {DB_PREFIX}fk_account_identity
        FOREIGN KEY (identity_id) REFERENCES {DB_PREFIX}player_identities (id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS {DB_PREFIX}player_devices (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    identity_id BIGINT UNSIGNED NOT NULL,
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    device_label VARCHAR(100) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP NULL DEFAULT NULL,
    revoked_at TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_device_token_hash (token_hash),
    KEY idx_device_identity (identity_id),
    KEY idx_device_active (identity_id, revoked_at),
    CONSTRAINT {DB_PREFIX}fk_device_identity
        FOREIGN KEY (identity_id) REFERENCES {DB_PREFIX}player_identities (id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS {DB_PREFIX}online_games (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    public_id CHAR(22) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_by_identity_id BIGINT UNSIGNED NULL,
    status ENUM('waiting', 'active', 'paused', 'finished', 'abandoned') NOT NULL DEFAULT 'waiting',
    player_limit TINYINT UNSIGNED NOT NULL DEFAULT 4,
    board_type ENUM('classic', 'extended') NOT NULL DEFAULT 'classic',
    state_json JSON NULL,
    state_schema_version SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    state_version BIGINT UNSIGNED NOT NULL DEFAULT 0,
    current_turn TINYINT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP NULL DEFAULT NULL,
    last_activity_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP NULL DEFAULT NULL,
    delete_after TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_online_game_public_id (public_id),
    KEY idx_online_game_status_activity (status, last_activity_at),
    KEY idx_online_game_delete_after (delete_after),
    KEY idx_online_game_creator (created_by_identity_id),
    CONSTRAINT {DB_PREFIX}fk_online_game_creator
        FOREIGN KEY (created_by_identity_id) REFERENCES {DB_PREFIX}player_identities (id)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Globální nastavení hry i případná nastavení konkrétní místnosti.
-- Hodnoty jsou textové, aby zůstaly zachovány i případné budoucí typy nastavení.
CREATE TABLE IF NOT EXISTS {DB_PREFIX}game_settings (
    setting_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    room_id BIGINT UNSIGNED NULL,
    setting_key VARCHAR(100) NOT NULL,
    setting_value TEXT NULL,
    scope_id BIGINT UNSIGNED GENERATED ALWAYS AS (COALESCE(room_id, 0)) STORED,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (setting_id),
    UNIQUE KEY uq_game_setting_scope (scope_id, setting_key),
    KEY idx_game_setting_room (room_id),
    CONSTRAINT {DB_PREFIX}fk_game_setting_room
        FOREIGN KEY (room_id) REFERENCES {DB_PREFIX}online_games (id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Převzatá globální nastavení ze staré tabulky game_settings.
INSERT INTO {DB_PREFIX}game_settings (room_id, setting_key, setting_value) VALUES
    (NULL, 'site_name', 'Člověče, nezlob se!'),
    (NULL, 'max_players', '8'),
    (NULL, 'default_board', '4')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);

CREATE TABLE IF NOT EXISTS {DB_PREFIX}game_participants (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    game_id BIGINT UNSIGNED NOT NULL,
    identity_id BIGINT UNSIGNED NULL,
    player_index TINYINT UNSIGNED NOT NULL,
    player_type ENUM('human', 'ai') NOT NULL DEFAULT 'human',
    display_name VARCHAR(50) NOT NULL,
    color CHAR(7) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    is_ready TINYINT(1) NOT NULL DEFAULT 0,
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP NULL DEFAULT NULL,
    left_at TIMESTAMP NULL DEFAULT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_game_player_index (game_id, player_index),
    UNIQUE KEY uq_game_identity (game_id, identity_id),
    KEY idx_participant_identity (identity_id),
    KEY idx_participant_game_presence (game_id, left_at),
    CONSTRAINT {DB_PREFIX}fk_participant_game
        FOREIGN KEY (game_id) REFERENCES {DB_PREFIX}online_games (id)
        ON DELETE CASCADE,
    CONSTRAINT {DB_PREFIX}fk_participant_identity
        FOREIGN KEY (identity_id) REFERENCES {DB_PREFIX}player_identities (id)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS {DB_PREFIX}game_invites (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    game_id BIGINT UNSIGNED NOT NULL,
    created_by_identity_id BIGINT UNSIGNED NULL,
    token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    uses_limit SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    uses_count SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    expires_at TIMESTAMP NULL DEFAULT NULL,
    revoked_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_invite_token_hash (token_hash),
    KEY idx_invite_game (game_id),
    KEY idx_invite_expiry (expires_at, revoked_at),
    CONSTRAINT {DB_PREFIX}fk_invite_game
        FOREIGN KEY (game_id) REFERENCES {DB_PREFIX}online_games (id)
        ON DELETE CASCADE,
    CONSTRAINT {DB_PREFIX}fk_invite_creator
        FOREIGN KEY (created_by_identity_id) REFERENCES {DB_PREFIX}player_identities (id)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS {DB_PREFIX}game_moves (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    game_id BIGINT UNSIGNED NOT NULL,
    participant_id BIGINT UNSIGNED NULL,
    state_version BIGINT UNSIGNED NOT NULL,
    request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    action_type VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    action_json JSON NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_move_game_version (game_id, state_version),
    UNIQUE KEY uq_move_game_request (game_id, request_id),
    KEY idx_move_game_created (game_id, created_at, id),
    KEY idx_move_participant (participant_id),
    CONSTRAINT {DB_PREFIX}fk_move_game
        FOREIGN KEY (game_id) REFERENCES {DB_PREFIX}online_games (id)
        ON DELETE CASCADE,
    CONSTRAINT {DB_PREFIX}fk_move_participant
        FOREIGN KEY (participant_id) REFERENCES {DB_PREFIX}game_participants (id)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS {DB_PREFIX}game_chat (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    game_id BIGINT UNSIGNED NOT NULL,
    participant_id BIGINT UNSIGNED NULL,
    message VARCHAR(1000) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_chat_game_id (game_id, id),
    KEY idx_chat_participant (participant_id),
    CONSTRAINT {DB_PREFIX}fk_chat_game
        FOREIGN KEY (game_id) REFERENCES {DB_PREFIX}online_games (id)
        ON DELETE CASCADE,
    CONSTRAINT {DB_PREFIX}fk_chat_participant
        FOREIGN KEY (participant_id) REFERENCES {DB_PREFIX}game_participants (id)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Jeden globální model online AI; řádek se zamyká při každém tahu AI.
-- Neukládají se zde jednotliví anonymní uživatelé ani jejich partie.
CREATE TABLE IF NOT EXISTS {DB_PREFIX}ai_learning_model (
    id TINYINT UNSIGNED NOT NULL,
    model_json JSON NOT NULL,
    generation BIGINT UNSIGNED NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO {DB_PREFIX}ai_learning_model (id, model_json, generation)
VALUES (1, JSON_OBJECT(
    'version', 1,
    'generation', 0,
    'decisionsTrained', 0,
    'gamesTrained', 0,
    'learningRate', 0.02,
    'temperature', 0.22,
    'weights', JSON_ARRAY(),
    'dynamicParameters', JSON_ARRAY()
), 0)
ON DUPLICATE KEY UPDATE id = VALUES(id);

CREATE TABLE IF NOT EXISTS {DB_PREFIX}cron_tasks (
    task_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    last_started_at TIMESTAMP NULL DEFAULT NULL,
    last_finished_at TIMESTAMP NULL DEFAULT NULL,
    next_run_at TIMESTAMP NULL DEFAULT NULL,
    locked_until TIMESTAMP NULL DEFAULT NULL,
    last_status VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NULL,
    last_error VARCHAR(500) NULL,
    is_enabled TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (task_key),
    KEY idx_cron_due (is_enabled, next_run_at),
    KEY idx_cron_lock (locked_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO {DB_PREFIX}schema_migrations (version, name)
VALUES (1, 'initial_online_multiplayer_schema')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO {DB_PREFIX}schema_migrations (version, name)
VALUES (2, 'player_account_authentication')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO {DB_PREFIX}schema_migrations (version, name)
VALUES (3, 'global_online_ai_learning_model')
ON DUPLICATE KEY UPDATE name = VALUES(name);
