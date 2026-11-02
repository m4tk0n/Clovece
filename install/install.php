<?php
/**
 * Člověče, nezlob se! - Database Installation Script
 * Creates all database tables with prefix from .env 'TABLE_PREFIX'
 */

// Set error reporting
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

// Load environment variables from .env file
if (file_exists(__DIR__ . '/../.env')) {
    $envLines = file(__DIR__ . '/../.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($envLines as $line) {
        if (strpos(trim($line), '#') === 0) continue;
        
        $parts = explode('=', $line, 2);
        if (count($parts) === 2) {
            $key = trim($parts[0]);
            $value = trim($parts[1]);
            
            if (preg_match('/^([\'\"])(.*)\1$/', $value, $matches)) {
                $value = $matches[2];
            }
            
            $_ENV[$key] = $value;
            putenv($key . '=' . $value);
        }
    }
} else {
    die("Error: .env file not found. Please create it in the root directory.");
}

// Get configuration from .env
define('DB_HOST', $_ENV['DB_HOST'] ?? 'localhost');
define('DB_USER', $_ENV['DB_USER'] ?? 'username');
define('DB_PASS', $_ENV['DB_PASS'] ?? 'password');
define('DB_NAME', $_ENV['DB_NAME'] ?? 'clovece_game');
define('TABLE_PREFIX', $_ENV['TABLE_PREFIX'] ?? 'clovece_');

function t($name) {
    return TABLE_PREFIX . $name;
}

// HTML output
function outputHeader() {
    echo "<!DOCTYPE html>
<html lang='cs'>
<head>
    <meta charset='UTF-8'>
    <meta name='viewport' content='width=device-width, initial-scale=1.0'>
    <title>Člověče, nezlob se! - Instalace</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            color: #fff;
            padding: 20px;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: rgba(0,0,0,0.3);
            border-radius: 20px;
            padding: 40px;
            backdrop-filter: blur(10px);
            border: 2px solid rgba(255,255,255,0.1);
        }
        h1 {
            text-align: center;
            margin-bottom: 30px;
            font-size: 2.5em;
            text-shadow: 0 0 20px rgba(255,107,107,0.8);
            color: #ff6b6b;
        }
        .config-box {
            background: rgba(255,255,255,0.1);
            border-radius: 10px;
            padding: 20px;
            margin-bottom: 30px;
            border-left: 4px solid #ff6b6b;
        }
        .config-box h2 {
            margin-bottom: 15px;
            color: #ff6b6b;
            font-size: 1.2em;
        }
        .config-item {
            margin-bottom: 10px;
            padding: 8px 0;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .config-item:last-child {
            border-bottom: none;
        }
        .config-label {
            font-weight: bold;
            color: #a0a0a0;
        }
        .config-value {
            color: #4ecdc4;
        }
        .progress-bar {
            width: 100%;
            height: 30px;
            background: rgba(255,255,255,0.1);
            border-radius: 15px;
            overflow: hidden;
            margin: 20px 0;
        }
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #ff6b6b, #4ecdc4);
            transition: width 0.3s ease;
        }
        .status {
            padding: 15px;
            border-radius: 10px;
            margin: 10px 0;
        }
        .status-success {
            background: rgba(78, 205, 196, 0.2);
            border-left: 4px solid #4ecdc4;
            color: #4ecdc4;
        }
        .status-error {
            background: rgba(255, 107, 107, 0.2);
            border-left: 4px solid #ff6b6b;
            color: #ff6b6b;
        }
        .status-warning {
            background: rgba(255, 230, 109, 0.2);
            border-left: 4px solid #ffe66d;
            color: #ffe66d;
        }
        button {
            display: block;
            width: 100%;
            padding: 15px;
            margin: 20px auto;
            background: linear-gradient(135deg, #ff6b6b, #ee5a6f);
            border: none;
            border-radius: 10px;
            color: white;
            font-size: 1.2em;
            cursor: pointer;
            transition: all 0.3s ease;
            font-weight: bold;
        }
        button:hover {
            background: linear-gradient(135deg, #ee5a6f, #ff6b6b);
            transform: translateY(-2px);
            box-shadow: 0 5px 20px rgba(255,107,107,0.4);
        }
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .result-summary {
            background: rgba(0,0,0,0.2);
            border-radius: 10px;
            padding: 20px;
            margin-top: 30px;
        }
        .result-summary h3 {
            margin-bottom: 15px;
            color: #ff6b6b;
        }
        .result-item {
            padding: 8px 0;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .result-item:last-child {
            border-bottom: none;
        }
        a {
            color: #4ecdc4;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
        .logo {
            text-align: center;
            font-size: 0.9em;
            color: #888;
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class='container'>
        <h1>🎲 Člověče, nezlob se!</h1>
        <h2 style='text-align:center; margin-bottom:30px; color:#fff;'>Instalace databáze</h2>";
}

function outputFooter() {
    echo "
        <div class='logo'>
            Vytvořeno pro wz.cz hosting | Prefix tabulek: <strong>" . TABLE_PREFIX . "</strong>
        </div>
    </div>
</body>
</html>";
}

// Main installation logic
try {
    // Connect to database
    $db = new PDO(
        "mysql:host=" . DB_HOST . ";charset=utf8mb4",
        DB_USER,
        DB_PASS,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );

    // Create database if not exists
    $db->exec("CREATE DATABASE IF NOT EXISTS " . DB_NAME . " CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    $db->exec("USE " . DB_NAME);

    outputHeader();
    
    echo "<div class='config-box'>
        <h2>⚙️ Konfigurace</h2>
        <div class='config-item'><span class='config-label'>Host:</span> <span class='config-value'>" . htmlspecialchars(DB_HOST) . "</span></div>
        <div class='config-item'><span class='config-label'>Uživatel:</span> <span class='config-value'>" . htmlspecialchars(DB_USER) . "</span></div>
        <div class='config-item'><span class='config-label'>Databáze:</span> <span class='config-value'>" . htmlspecialchars(DB_NAME) . "</span></div>
        <div class='config-item'><span class='config-label'>Prefix tabulek:</span> <span class='config-value'>" . htmlspecialchars(TABLE_PREFIX) . "</span></div>
    </div>";

    // SQL statements with table prefix
    $sqlStatements = [
        // Players table
        "CREATE TABLE IF NOT EXISTS " . t('players') . " (
            player_id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) NOT NULL UNIQUE,
            email VARCHAR(100),
            password_hash VARCHAR(255),
            display_name VARCHAR(50) DEFAULT '',
            color_preference VARCHAR(20) DEFAULT '#ff6b6b',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_login TIMESTAMP NULL,
            wins INT DEFAULT 0,
            games_played INT DEFAULT 0,
            is_active BOOLEAN DEFAULT TRUE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        // Game rooms table
        "CREATE TABLE IF NOT EXISTS " . t('game_rooms') . " (
            room_id INT AUTO_INCREMENT PRIMARY KEY,
            room_code VARCHAR(10) NOT NULL UNIQUE,
            name VARCHAR(100) DEFAULT 'Nová hra',
            created_by INT NOT NULL,
            total_players TINYINT NOT NULL DEFAULT 4,
            human_players TINYINT NOT NULL DEFAULT 4,
            board_type ENUM('4', '8') DEFAULT '4',
            status ENUM('waiting', 'playing', 'finished', 'abandoned') DEFAULT 'waiting',
            current_player INT DEFAULT 0,
            current_turn INT DEFAULT 0,
            dice_value TINYINT DEFAULT 0,
            winner INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES " . t('players') . "(player_id) ON DELETE CASCADE,
            FOREIGN KEY (winner) REFERENCES " . t('players') . "(player_id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        // Room participants table
        "CREATE TABLE IF NOT EXISTS " . t('room_participants') . " (
            participant_id INT AUTO_INCREMENT PRIMARY KEY,
            room_id INT NOT NULL,
            player_id INT NOT NULL,
            player_type ENUM('human', 'ai') DEFAULT 'human',
            player_index TINYINT NOT NULL,
            player_name VARCHAR(50) NOT NULL,
            player_color VARCHAR(20) NOT NULL,
            finished_pieces TINYINT DEFAULT 0,
            has_won BOOLEAN DEFAULT FALSE,
            is_ready BOOLEAN DEFAULT FALSE,
            joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (room_id) REFERENCES " . t('game_rooms') . "(room_id) ON DELETE CASCADE,
            FOREIGN KEY (player_id) REFERENCES " . t('players') . "(player_id) ON DELETE CASCADE,
            UNIQUE KEY (room_id, player_index)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        // Game pieces table
        "CREATE TABLE IF NOT EXISTS " . t('game_pieces') . " (
            piece_id INT AUTO_INCREMENT PRIMARY KEY,
            room_id INT NOT NULL,
            participant_id INT NOT NULL,
            piece_number TINYINT NOT NULL,
            position_row SMALLINT NULL,
            position_col SMALLINT NULL,
            in_home BOOLEAN DEFAULT FALSE,
            finished BOOLEAN DEFAULT FALSE,
            FOREIGN KEY (room_id) REFERENCES " . t('game_rooms') . "(room_id) ON DELETE CASCADE,
            FOREIGN KEY (participant_id) REFERENCES " . t('room_participants') . "(participant_id) ON DELETE CASCADE,
            UNIQUE KEY (room_id, participant_id, piece_number)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        // Game moves table
        "CREATE TABLE IF NOT EXISTS " . t('game_moves') . " (
            move_id INT AUTO_INCREMENT PRIMARY KEY,
            room_id INT NOT NULL,
            participant_id INT NOT NULL,
            turn_number INT NOT NULL,
            dice_value TINYINT NOT NULL,
            piece_number TINYINT NOT NULL,
            from_row SMALLINT NULL,
            from_col SMALLINT NULL,
            to_row SMALLINT NULL,
            to_col SMALLINT NULL,
            move_type ENUM('start', 'move', 'home', 'finish', 'kick') NOT NULL,
            kicked_participant_id INT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (room_id) REFERENCES " . t('game_rooms') . "(room_id) ON DELETE CASCADE,
            FOREIGN KEY (participant_id) REFERENCES " . t('room_participants') . "(participant_id) ON DELETE CASCADE,
            FOREIGN KEY (kicked_participant_id) REFERENCES " . t('room_participants') . "(participant_id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        // Chat messages table
        "CREATE TABLE IF NOT EXISTS " . t('chat_messages') . " (
            message_id INT AUTO_INCREMENT PRIMARY KEY,
            room_id INT NOT NULL,
            participant_id INT,
            player_id INT,
            message TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (room_id) REFERENCES " . t('game_rooms') . "(room_id) ON DELETE CASCADE,
            FOREIGN KEY (participant_id) REFERENCES " . t('room_participants') . "(participant_id) ON DELETE SET NULL,
            FOREIGN KEY (player_id) REFERENCES " . t('players') . "(player_id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        // Game settings table
        "CREATE TABLE IF NOT EXISTS " . t('game_settings') . " (
            setting_id INT AUTO_INCREMENT PRIMARY KEY,
            room_id INT,
            setting_key VARCHAR(100) NOT NULL UNIQUE,
            setting_value TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        // Sessions table
        "CREATE TABLE IF NOT EXISTS " . t('sessions') . " (
            session_id VARCHAR(128) NOT NULL PRIMARY KEY,
            player_id INT,
            ip_address VARCHAR(45),
            user_agent TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (player_id) REFERENCES " . t('players') . "(player_id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",

        // Stored procedures
        "DELIMITER //
        CREATE PROCEDURE " . t('create_game_room') . "(
            IN p_created_by INT,
            IN p_total_players TINYINT,
            IN p_human_players TINYINT,
            IN p_board_type ENUM('4', '8'),
            OUT p_room_id INT,
            OUT p_room_code VARCHAR(10)
        )
        BEGIN
            DECLARE v_code VARCHAR(10);
            DECLARE chars VARCHAR(36) DEFAULT 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
            DECLARE i INT DEFAULT 0;
            
            WHILE TRUE DO
                SET v_code = '';
                SET i = 0;
                WHILE i < 6 DO
                    SET v_code = CONCAT(v_code, SUBSTRING(chars, FLOOR(1 + RAND() * 36), 1));
                    SET i = i + 1;
                END WHILE;
                
                IF NOT EXISTS (SELECT 1 FROM " . t('game_rooms') . " WHERE room_code = v_code) THEN
                    LEAVE;
                END IF;
            END WHILE;
            
            INSERT INTO " . t('game_rooms') . " (room_code, created_by, total_players, human_players, board_type, status)
            VALUES (v_code, p_created_by, p_total_players, p_human_players, p_board_type, 'waiting');
            
            SET p_room_id = LAST_INSERT_ID();
            SET p_room_code = v_code;
        END //
        DELIMITER ;",

        "DELIMITER //
        CREATE PROCEDURE " . t('join_game_room') . "(
            IN p_room_id INT,
            IN p_player_id INT,
            IN p_player_type ENUM('human', 'ai'),
            IN p_player_name VARCHAR(50),
            IN p_player_color VARCHAR(20),
            OUT p_participant_id INT
        )
        BEGIN
            DECLARE v_player_index TINYINT;
            
            SELECT COUNT(*) INTO v_player_index FROM " . t('room_participants') . " WHERE room_id = p_room_id;
            
            INSERT INTO " . t('room_participants') . " (room_id, player_id, player_type, player_index, player_name, player_color)
            VALUES (p_room_id, p_player_id, p_player_type, v_player_index, p_player_name, p_player_color);
            
            SET p_participant_id = LAST_INSERT_ID();
            
            INSERT INTO " . t('game_pieces') . " (room_id, participant_id, piece_number)
            VALUES (p_room_id, p_participant_id, 0),
                   (p_room_id, p_participant_id, 1),
                   (p_room_id, p_participant_id, 2),
                   (p_room_id, p_participant_id, 3);
        END //
        DELIMITER ;",

        "DELIMITER //
        CREATE PROCEDURE " . t('record_move') . "(
            IN p_room_id INT,
            IN p_participant_id INT,
            IN p_turn_number INT,
            IN p_dice_value TINYINT,
            IN p_piece_number TINYINT,
            IN p_from_row SMALLINT,
            IN p_from_col SMALLINT,
            IN p_to_row SMALLINT,
            IN p_to_col SMALLINT,
            IN p_move_type ENUM('start', 'move', 'home', 'finish', 'kick'),
            IN p_kicked_participant_id INT
        )
        BEGIN
            INSERT INTO " . t('game_moves') . " (
                room_id, participant_id, turn_number, dice_value, piece_number,
                from_row, from_col, to_row, to_col, move_type, kicked_participant_id
            ) VALUES (
                p_room_id, p_participant_id, p_turn_number, p_dice_value, p_piece_number,
                p_from_row, p_from_col, p_to_row, p_to_col, p_move_type, p_kicked_participant_id
            );
            
            UPDATE " . t('game_rooms') . " SET updated_at = CURRENT_TIMESTAMP WHERE room_id = p_room_id;
            UPDATE " . t('room_participants') . " SET last_activity = CURRENT_TIMESTAMP WHERE participant_id = p_participant_id;
        END //
        DELIMITER ;",

        "DELIMITER //
        CREATE PROCEDURE " . t('cleanup_sessions') . "(
            IN p_max_age INT
        )
        BEGIN
            DELETE FROM " . t('sessions') . " 
            WHERE last_activity < DATE_SUB(NOW(), INTERVAL p_max_age SECOND);
        END //
        DELIMITER ;",

        // Views
        "CREATE OR REPLACE VIEW " . t('active_games') . " AS
        SELECT 
            r.room_id,
            r.room_code,
            r.name,
            r.status,
            r.created_at,
            COUNT(rp.participant_id) as player_count,
            p.display_name as created_by_name
        FROM " . t('game_rooms') . " r
        LEFT JOIN " . t('room_participants') . " rp ON r.room_id = rp.room_id
        LEFT JOIN " . t('players') . " p ON r.created_by = p.player_id
        WHERE r.status IN ('waiting', 'playing')
        GROUP BY r.room_id;",

        "CREATE OR REPLACE VIEW " . t('player_stats') . " AS
        SELECT 
            p.player_id,
            p.username,
            p.display_name,
            p.wins,
            p.games_played,
            ROUND(p.wins / NULLIF(p.games_played, 0) * 100, 2) as win_rate,
            p.created_at
        FROM " . t('players') . " p
        ORDER BY p.wins DESC;",

        // Triggers
        "DELIMITER //
        CREATE TRIGGER " . t('update_room_timestamp') . "
        BEFORE UPDATE ON " . t('game_rooms') . "
        FOR EACH ROW
        BEGIN
            SET NEW.updated_at = CURRENT_TIMESTAMP;
        END //
        DELIMITER ;",

        "DELIMITER //
        CREATE TRIGGER " . t('increment_games_played') . "
        AFTER INSERT ON " . t('room_participants') . "
        FOR EACH ROW
        BEGIN
            UPDATE " . t('players') . " 
            SET games_played = games_played + 1 
            WHERE player_id = NEW.player_id;
        END //
        DELIMITER ;",

        // Indexes
        "CREATE INDEX idx_" . t('players_username') . " ON " . t('players') . "(username);",
        "CREATE INDEX idx_" . t('players_email') . " ON " . t('players') . "(email);",
        "CREATE INDEX idx_" . t('game_rooms_code') . " ON " . t('game_rooms') . "(room_code);",
        "CREATE INDEX idx_" . t('game_rooms_status') . " ON " . t('game_rooms') . "(status);",
        "CREATE INDEX idx_" . t('room_participants_room') . " ON " . t('room_participants') . "(room_id);",
        "CREATE INDEX idx_" . t('room_participants_player') . " ON " . t('room_participants') . "(player_id);",
        "CREATE INDEX idx_" . t('game_pieces_room') . " ON " . t('game_pieces') . "(room_id);",
        "CREATE INDEX idx_" . t('game_pieces_participant') . " ON " . t('game_pieces') . "(participant_id);",
        "CREATE INDEX idx_" . t('game_moves_room') . " ON " . t('game_moves') . "(room_id);",
        "CREATE INDEX idx_" . t('chat_messages_room') . " ON " . t('chat_messages') . "(room_id);",

        // Sample data
        "INSERT IGNORE INTO " . t('game_settings') . " (setting_key, setting_value) VALUES ('site_name', 'Člověče, nezlob se!');",
        "INSERT IGNORE INTO " . t('game_settings') . " (setting_key, setting_value) VALUES ('max_players', '8');",
        "INSERT IGNORE INTO " . t('game_settings') . " (setting_key, setting_value) VALUES ('default_board', '4');"
    ];

    // Count total items
    $totalItems = count($sqlStatements);
    $completedItems = 0;
    $errors = [];
    $created = [];

    echo "<div class='progress-bar'><div class='progress-fill' id='progress' style='width:0%'></div></div>";
    echo "<div id='status-container'></div>";
    
    ob_flush();
    flush();

    // Execute all SQL statements
    foreach ($sqlStatements as $sql) {
        try {
            $db->exec($sql);
            
            // Extract what was created for display
            if (preg_match('/CREATE TABLE.*?`([^`]+)`/', $sql, $m)) {
                $created[] = "Tabulka: <strong>" . $m[1] . "</strong>";
            } elseif (preg_match('/CREATE PROCEDURE.*?`([^`]+)`/', $sql, $m)) {
                $created[] = "Procedura: <strong>" . $m[1] . "</strong>";
            } elseif (preg_match('/CREATE.*?VIEW.*?`([^`]+)`/', $sql, $m)) {
                $created[] = "View: <strong>" . $m[1] . "</strong>";
            } elseif (preg_match('/CREATE TRIGGER.*?`([^`]+)`/', $sql, $m)) {
                $created[] = "Trigger: <strong>" . $m[1] . "</strong>";
            } elseif (preg_match('/CREATE INDEX.*?ON.*?`([^`]+)`/', $sql, $m)) {
                $created[] = "Index: <strong>" . $m[1] . "</strong>";
            } elseif (preg_match('/INSERT INTO.*?`([^`]+)`/', $sql, $m)) {
                $created[] = "Data: <strong>" . $m[1] . "</strong>";
            } else {
                $created[] = "SQL: <strong>" . substr($sql, 0, 50) . "...</strong>";
            }
        } catch (Exception $e) {
            $errors[] = "Chyba: " . $e->getMessage();
        }
        $completedItems++;
        $progress = ($completedItems / $totalItems) * 100;
        echo "<script>document.getElementById('progress').style.width='$progress%';</script>";
        ob_flush();
        flush();
    }

    // Display results
    echo "<div class='result-summary'>";
    
    if (empty($errors)) {
        echo "<h3>✅ Instalace úspěšná!</h3>";
        echo "<div class='status status-success'>Všechny tabulky, procedury, view a indexy byly vytvořeny s prefixem <strong>" . TABLE_PREFIX . "</strong>.</div>";
    } else {
        echo "<h3>⚠️ Instalace dokončena s některými chybami</h3>";
        if (!empty($created)) {
            echo "<div class='status status-success'>Úspěšně vytvořeno:</div>";
            foreach ($created as $item) {
                echo "<div class='result-item'>✓ $item</div>";
            }
        }
        if (!empty($errors)) {
            echo "<div class='status status-error'>Chyby:</div>";
            foreach ($errors as $error) {
                echo "<div class='result-item'>✗ $error</div>";
            }
        }
    }
    
    echo "</div>";
    
    // Next steps
    echo "<div style='text-align:center; margin-top:30px;'>";
    echo "<a href='../index.html'><button>Pokračovat na hru</button></a>";
    echo "</div>";
    
    outputFooter();

} catch (Exception $e) {
    outputHeader();
    echo "<div class='status status-error'>";
    echo "<h3>❌ Chyba připojení k databázi</h3>";
    echo "<p><strong>Chyba:</strong> " . htmlspecialchars($e->getMessage()) . "</p>";
    echo "<p>Zkontrolujte prosím nastavení v souboru <strong>.env</strong>:</p>";
    echo "<ul>";
    echo "<li>DB_HOST = " . htmlspecialchars(DB_HOST) . "</li>";
    echo "<li>DB_USER = " . htmlspecialchars(DB_USER) . "</li>";
    echo "<li>DB_NAME = " . htmlspecialchars(DB_NAME) . "</li>";
    echo "<li>TABLE_PREFIX = " . htmlspecialchars(TABLE_PREFIX) . "</li>";
    echo "</ul>";
    echo "</div>";
    echo "<div style='text-align:center; margin-top:20px;'>";
    echo "<button onclick='window.location.reload()'>Zkusit znovu</button>";
    echo "</div>";
    outputFooter();
}
