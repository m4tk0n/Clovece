-- /install/database.sql
-- ============================================
-- Člověče, nezlob se! - MySQL Database Schema
-- For wz.cz hosting
-- ============================================

-- Create database
CREATE DATABASE IF NOT EXISTS clovece_game;
USE clovece_game;

-- Players table - stores registered players
CREATE TABLE IF NOT EXISTS players (
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
);

-- Game rooms table - stores game sessions
CREATE TABLE IF NOT EXISTS game_rooms (
    room_id INT AUTO_INCREMENT PRIMARY KEY,
    room_code VARCHAR(10) NOT NULL UNIQUE,  -- Short code for joining (e.g., ABC123)
    name VARCHAR(100) DEFAULT 'Nová hra',
    created_by INT NOT NULL,
    total_players TINYINT NOT NULL DEFAULT 4,  -- 2-8
    human_players TINYINT NOT NULL DEFAULT 4,
    board_type ENUM('4', '8') DEFAULT '4',  -- '4' for 2-4 players, '8' for 5-8
    status ENUM('waiting', 'playing', 'finished', 'abandoned') DEFAULT 'waiting',
    current_player INT DEFAULT 0,
    current_turn INT DEFAULT 0,
    dice_value TINYINT DEFAULT 0,
    winner INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES players(player_id),
    FOREIGN KEY (winner) REFERENCES players(player_id)
);

-- Room participants - players in a room
CREATE TABLE IF NOT EXISTS room_participants (
    participant_id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT NOT NULL,
    player_id INT NOT NULL,
    player_type ENUM('human', 'ai') DEFAULT 'human',
    player_index TINYINT NOT NULL,  -- 0-7 (position in game)
    player_name VARCHAR(50) NOT NULL,
    player_color VARCHAR(20) NOT NULL,
    finished_pieces TINYINT DEFAULT 0,
    has_won BOOLEAN DEFAULT FALSE,
    is_ready BOOLEAN DEFAULT FALSE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES game_rooms(room_id) ON DELETE CASCADE,
    FOREIGN KEY (player_id) REFERENCES players(player_id),
    UNIQUE KEY (room_id, player_index)
);

-- Game pieces - position of each piece
CREATE TABLE IF NOT EXISTS game_pieces (
    piece_id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT NOT NULL,
    participant_id INT NOT NULL,
    piece_number TINYINT NOT NULL,  -- 0-3 (each player has 4 pieces)
    position_row SMALLINT NULL,  -- NULL = in start, -1 = finished
    position_col SMALLINT NULL,
    in_home BOOLEAN DEFAULT FALSE,
    finished BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (room_id) REFERENCES game_rooms(room_id) ON DELETE CASCADE,
    FOREIGN KEY (participant_id) REFERENCES room_participants(participant_id) ON DELETE CASCADE,
    UNIQUE KEY (room_id, participant_id, piece_number)
);

-- Game moves history
CREATE TABLE IF NOT EXISTS game_moves (
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
    FOREIGN KEY (room_id) REFERENCES game_rooms(room_id) ON DELETE CASCADE,
    FOREIGN KEY (participant_id) REFERENCES room_participants(participant_id),
    FOREIGN KEY (kicked_participant_id) REFERENCES room_participants(participant_id)
);

-- Chat messages
CREATE TABLE IF NOT EXISTS chat_messages (
    message_id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT NOT NULL,
    participant_id INT NULL,  -- NULL for system messages
    message TEXT NOT NULL,
    is_system BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES game_rooms(room_id) ON DELETE CASCADE,
    FOREIGN KEY (participant_id) REFERENCES room_participants(participant_id)
);

-- Game settings
CREATE TABLE IF NOT EXISTS game_settings (
    settings_id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT NOT NULL,
    music_enabled BOOLEAN DEFAULT TRUE,
    sfx_enabled BOOLEAN DEFAULT TRUE,
    animations_enabled BOOLEAN DEFAULT TRUE,
    ai_speed ENUM('fast', 'medium', 'slow') DEFAULT 'medium',
    FOREIGN KEY (room_id) REFERENCES game_rooms(room_id) ON DELETE CASCADE
);

-- Sessions table for login
CREATE TABLE IF NOT EXISTS sessions (
    session_id VARCHAR(128) NOT NULL PRIMARY KEY,
    player_id INT NOT NULL,
    session_data TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    FOREIGN KEY (player_id) REFERENCES players(player_id) ON DELETE CASCADE
);

-- Indexes for better performance
CREATE INDEX idx_game_rooms_status ON game_rooms(status);
CREATE INDEX idx_game_rooms_code ON game_rooms(room_code);
CREATE INDEX idx_room_participants_room ON room_participants(room_id);
CREATE INDEX idx_room_participants_player ON room_participants(player_id);
CREATE INDEX idx_game_pieces_room ON game_pieces(room_id);
CREATE INDEX idx_game_pieces_participant ON game_pieces(participant_id);
CREATE INDEX idx_game_moves_room ON game_moves(room_id);
CREATE INDEX idx_chat_room ON chat_messages(room_id);

-- Insert sample data (optional)
-- INSERT INTO players (username, display_name, color_preference) VALUES 
-- ('player1', 'Hráč 1', '#ff6b6b'),
-- ('player2', 'Hráč 2', '#4ecdc4'),
-- ('player3', 'Hráč 3', '#ffe66d'),
-- ('player4', 'Hráč 4', '#a8e6cf');

-- ============================================
-- VIEWS
-- ============================================

-- View for active games
CREATE VIEW IF NOT EXISTS active_games AS
SELECT 
    r.room_id,
    r.room_code,
    r.name,
    r.status,
    r.total_players,
    r.created_at,
    p.display_name AS creator_name,
    COUNT(rp.participant_id) AS current_players
FROM game_rooms r
JOIN players p ON r.created_by = p.player_id
LEFT JOIN room_participants rp ON r.room_id = rp.room_id
WHERE r.status IN ('waiting', 'playing')
GROUP BY r.room_id;

-- View for player statistics
CREATE VIEW IF NOT EXISTS player_stats AS
SELECT 
    p.player_id,
    p.username,
    p.display_name,
    p.wins,
    p.games_played,
    IF(p.games_played > 0, ROUND((p.wins / p.games_played) * 100, 2), 0) AS win_rate
FROM players p
ORDER BY p.wins DESC, p.games_played DESC;

-- ============================================
-- STORED PROCEDURES
-- ============================================

-- Create a new game room
DELIMITER //
CREATE PROCEDURE create_game_room(
    IN p_room_code VARCHAR(10),
    IN p_name VARCHAR(100),
    IN p_creator_id INT,
    IN p_total_players TINYINT,
    IN p_human_players TINYINT
)
BEGIN
    DECLARE v_board_type ENUM('4', '8');
    
    -- Determine board type
    IF p_total_players <= 4 THEN
        SET v_board_type = '4';
    ELSE
        SET v_board_type = '8';
    END IF;
    
    -- Insert room
    INSERT INTO game_rooms (room_code, name, created_by, total_players, human_players, board_type)
    VALUES (p_room_code, p_name, p_creator_id, p_total_players, p_human_players, v_board_type);
    
    -- Get room ID
    DECLARE v_room_id INT;
    SELECT room_id INTO v_room_id FROM game_rooms WHERE room_code = p_room_code;
    
    -- Add creator as first participant
    INSERT INTO room_participants (room_id, player_id, player_index, player_name, player_color, player_type)
    VALUES (v_room_id, p_creator_id, 0, (SELECT display_name FROM players WHERE player_id = p_creator_id), 
            (SELECT color_preference FROM players WHERE player_id = p_creator_id), 'human');
    
    -- Initialize settings
    INSERT INTO game_settings (room_id) VALUES (v_room_id);
    
    -- Initialize pieces for creator
    INSERT INTO game_pieces (room_id, participant_id, piece_number)
    VALUES 
        (v_room_id, LAST_INSERT_ID(), 0),
        (v_room_id, LAST_INSERT_ID(), 1),
        (v_room_id, LAST_INSERT_ID(), 2),
        (v_room_id, LAST_INSERT_ID(), 3);
END //
DELIMITER ;

-- Join a game room
DELIMITER //
CREATE PROCEDURE join_game_room(
    IN p_room_code VARCHAR(10),
    IN p_player_id INT,
    IN p_player_name VARCHAR(50),
    IN p_player_color VARCHAR(20)
)
BEGIN
    DECLARE v_room_id INT;
    DECLARE v_next_index TINYINT;
    DECLARE v_player_type ENUM('human', 'ai');
    
    -- Get room ID
    SELECT room_id INTO v_room_id FROM game_rooms WHERE room_code = p_room_code;
    
    -- Check if room exists
    IF v_room_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Game room not found';
    END IF;
    
    -- Get next available player index
    SELECT MIN(p.player_index + 1) INTO v_next_index
    FROM room_participants p
    WHERE p.room_id = v_room_id AND p.player_index < (SELECT total_players FROM game_rooms WHERE room_id = v_room_id)
    GROUP BY p.room_id;
    
    IF v_next_index IS NULL THEN
        SELECT 0 INTO v_next_index;
    END IF;
    
    -- Determine player type based on room settings
    SELECT 
        CASE 
            WHEN v_next_index < (SELECT human_players FROM game_rooms WHERE room_id = v_room_id) THEN 'human'
            ELSE 'ai'
        END 
    INTO v_player_type;
    
    -- Add participant
    INSERT INTO room_participants (room_id, player_id, player_index, player_name, player_color, player_type)
    VALUES (v_room_id, p_player_id, v_next_index, p_player_name, p_player_color, v_player_type);
    
    -- Initialize pieces
    INSERT INTO game_pieces (room_id, participant_id, piece_number)
    VALUES 
        (v_room_id, LAST_INSERT_ID(), 0),
        (v_room_id, LAST_INSERT_ID(), 1),
        (v_room_id, LAST_INSERT_ID(), 2),
        (v_room_id, LAST_INSERT_ID(), 3);
    
    -- Update room status if enough players
    UPDATE game_rooms r
    SET status = 'playing', current_player = 0
    WHERE r.room_id = v_room_id 
    AND (SELECT COUNT(*) FROM room_participants WHERE room_id = v_room_id) = r.total_players;
END //
DELIMITER ;

-- Record a move
DELIMITER //
CREATE PROCEDURE record_move(
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
    -- Insert move
    INSERT INTO game_moves (
        room_id, participant_id, turn_number, dice_value, piece_number,
        from_row, from_col, to_row, to_col, move_type, kicked_participant_id
    ) VALUES (
        p_room_id, p_participant_id, p_turn_number, p_dice_value, p_piece_number,
        p_from_row, p_from_col, p_to_row, p_to_col, p_move_type, p_kicked_participant_id
    );
    
    -- Update piece position
    IF p_move_type = 'finish' THEN
        UPDATE game_pieces 
        SET position_row = NULL, position_col = NULL, finished = TRUE
        WHERE room_id = p_room_id AND participant_id = p_participant_id AND piece_number = p_piece_number;
    ELSEIF p_move_type = 'start' THEN
        UPDATE game_pieces 
        SET position_row = p_to_row, position_col = p_to_col, in_home = FALSE
        WHERE room_id = p_room_id AND participant_id = p_participant_id AND piece_number = p_piece_number;
    ELSEIF p_move_type = 'home' THEN
        UPDATE game_pieces 
        SET position_row = p_to_row, position_col = p_to_col, in_home = TRUE
        WHERE room_id = p_room_id AND participant_id = p_participant_id AND piece_number = p_piece_number;
    ELSE
        UPDATE game_pieces 
        SET position_row = p_to_row, position_col = p_to_col
        WHERE room_id = p_room_id AND participant_id = p_participant_id AND piece_number = p_piece_number;
    END IF;
    
    -- Update participant finished pieces if finished
    IF p_move_type = 'finish' THEN
        UPDATE room_participants rp
        SET finished_pieces = (
            SELECT COUNT(*) 
            FROM game_pieces gp 
            WHERE gp.participant_id = rp.participant_id AND gp.finished = TRUE
        )
        WHERE rp.participant_id = p_participant_id;
        
        -- Check for win
        IF (SELECT finished_pieces FROM room_participants WHERE participant_id = p_participant_id) = 4 THEN
            UPDATE room_participants SET has_won = TRUE WHERE participant_id = p_participant_id;
            UPDATE game_rooms SET status = 'finished', winner = (
                SELECT player_id FROM room_participants WHERE participant_id = p_participant_id
            ) WHERE room_id = p_room_id;
        END IF;
    END IF;
    
    -- Update room state
    UPDATE game_rooms 
    SET current_turn = p_turn_number + 1, 
        dice_value = 0,
        current_player = (
            SELECT (p_participant_id + 1) % total_players 
            FROM game_rooms 
            WHERE room_id = p_room_id
        )
    WHERE room_id = p_room_id;
END //
DELIMITER ;

-- Clean up old sessions
DELIMITER //
CREATE PROCEDURE cleanup_sessions()
BEGIN
    DELETE FROM sessions WHERE expires_at < NOW();
END //
DELIMITER ;

-- ============================================
-- TRIGGERS
-- ============================================

-- Update timestamp when room is modified
DELIMITER //
CREATE TRIGGER update_room_timestamp
AFTER UPDATE ON game_rooms
FOR EACH ROW
BEGIN
    IF NEW.updated_at != OLD.updated_at THEN
        -- Already updated
    ELSE
        UPDATE game_rooms SET updated_at = CURRENT_TIMESTAMP WHERE room_id = NEW.room_id;
    END IF;
END //
DELIMITER ;

-- Increment games played when room is finished
DELIMITER //
CREATE TRIGGER increment_games_played
AFTER UPDATE ON game_rooms
FOR EACH ROW
BEGIN
    IF NEW.status = 'finished' AND OLD.status != 'finished' THEN
        UPDATE players p
        JOIN room_participants rp ON p.player_id = rp.player_id
        SET p.games_played = p.games_played + 1
        WHERE rp.room_id = NEW.room_id;
        
        -- Increment wins for winner
        IF NEW.winner IS NOT NULL THEN
            UPDATE players SET wins = wins + 1 WHERE player_id = NEW.winner;
        END IF;
    END IF;
END //
DELIMITER ;

-- ============================================
-- COMMENTS
-- ============================================

-- To use this database:
-- 1. Import this SQL file into your MySQL database
-- 2. Update config.php with your database credentials
-- 3. The PHP API (api.php) will use these tables

-- For wz.cz hosting:
-- - Create database in your hosting control panel
-- - Import this SQL file
-- - Update connection details in config.php
