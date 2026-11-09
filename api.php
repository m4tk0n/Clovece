<?php
// /api.php
/**
 * Člověče, nezlob se! - API Endpoint
 * Handles all AJAX requests for the game
 * For wz.cz hosting
 */

require_once 'config.php';

// Get action from request
$action = $_REQUEST['action'] ?? '';

// Validate CSRF token for POST requests
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $token = $_REQUEST['csrf_token'] ?? '';
    if (!validateCsrfToken($token)) {
        errorResponse('Neplatný CSRF token', 403);
    }
}

// Route to appropriate handler
switch ($action) {
    // Authentication
    case 'login':
        handleLogin();
        break;
    case 'register':
        handleRegister();
        break;
    case 'logout':
        handleLogout();
        break;
    case 'get_current_player':
        handleGetCurrentPlayer();
        break;
    
    // Game Rooms
    case 'create_room':
        handleCreateRoom();
        break;
    case 'join_room':
        handleJoinRoom();
        break;
    case 'leave_room':
        handleLeaveRoom();
        break;
    case 'get_room':
        handleGetRoom();
        break;
    case 'get_room_list':
        handleGetRoomList();
        break;
    case 'set_ready':
        handleSetReady();
        break;
    case 'start_game':
        handleStartGame();
        break;
    
    // Game Actions
    case 'roll_dice':
        handleRollDice();
        break;
    case 'make_move':
        handleMakeMove();
        break;
    case 'end_turn':
        handleEndTurn();
        break;
    case 'get_game_state':
        handleGetGameState();
        break;
    
    // Chat
    case 'send_message':
        handleSendMessage();
        break;
    case 'get_messages':
        handleGetMessages();
        break;
    
    // Settings
    case 'update_settings':
        handleUpdateSettings();
        break;
    case 'get_settings':
        handleGetSettings();
        break;
    
    // Stats
    case 'get_stats':
        handleGetStats();
        break;
    
    default:
        errorResponse('Neznámá akce', 404);
}

// ============================================
// AUTHENTICATION HANDLERS
// ============================================

function handleLogin() {
    $username = sanitize($_POST['username'] ?? '');
    $password = $_POST['password'] ?? '';
    
    if (empty($username) || empty($password)) {
        errorResponse('Uživatelské jméno a heslo jsou povinné', 400);
    }
    
    try {
        $db = getDatabaseConnection();
        
        // Get player
        $stmt = $db->prepare("SELECT * FROM players WHERE username = ?");
        $stmt->execute([$username]);
        $player = $stmt->fetch();
        
        if (!$player) {
            errorResponse('Neplatné uživatelské jméno nebo heslo', 401);
        }
        
        // Verify password
        if (!password_verify($password, $player['password_hash'])) {
            errorResponse('Neplatné uživatelské jméno nebo heslo', 401);
        }
        
        // Update last login
        $stmt = $db->prepare("UPDATE players SET last_login = NOW() WHERE player_id = ?");
        $stmt->execute([$player['player_id']]);
        
        // Start session
        $_SESSION['player_id'] = $player['player_id'];
        $_SESSION['username'] = $player['username'];
        $_SESSION['display_name'] = $player['display_name'] ?? $player['username'];
        $_SESSION['logged_in'] = true;
        
        // Generate new CSRF token
        generateCsrfToken();
        
        successResponse([
            'player' => [
                'player_id' => $player['player_id'],
                'username' => $player['username'],
                'display_name' => $player['display_name'] ?? $player['username'],
                'color_preference' => $player['color_preference'],
                'wins' => $player['wins'],
                'games_played' => $player['games_played']
            ],
            'csrf_token' => $_SESSION[CSRF_TOKEN_NAME]
        ]);
    } catch (PDOException $e) {
        errorResponse('Chyba databáze: ' . $e->getMessage(), 500);
    }
}

function handleRegister() {
    $username = sanitize($_POST['username'] ?? '');
    $password = $_POST['password'] ?? '';
    $displayName = sanitize($_POST['display_name'] ?? '');
    $color = sanitize($_POST['color'] ?? PLAYER_COLORS[0]);
    
    if (empty($username) || empty($password)) {
        errorResponse('Uživatelské jméno a heslo jsou povinné', 400);
    }
    
    if (strlen($username) < 3 || strlen($username) > 50) {
        errorResponse('Uživatelské jméno musí mít 3-50 znaků', 400);
    }
    
    if (strlen($password) < 6) {
        errorResponse('Heslo musí mít alespoň 6 znaků', 400);
    }
    
    try {
        $db = getDatabaseConnection();
        
        // Check if username exists
        $stmt = $db->prepare("SELECT player_id FROM players WHERE username = ?");
        $stmt->execute([$username]);
        if ($stmt->fetch()) {
            errorResponse('Uživatelské jméno již existuje', 400);
        }
        
        // Hash password
        $passwordHash = password_hash($password, PASSWORD_DEFAULT);
        
        // Insert player
        $stmt = $db->prepare(
            "INSERT INTO players (username, display_name, password_hash, color_preference) 
             VALUES (?, ?, ?, ?)"
        );
        $stmt->execute([$username, $displayName ?: $username, $passwordHash, $color]);
        
        $playerId = $db->lastInsertId();
        
        // Auto-login
        $_SESSION['player_id'] = $playerId;
        $_SESSION['username'] = $username;
        $_SESSION['display_name'] = $displayName ?: $username;
        $_SESSION['logged_in'] = true;
        
        generateCsrfToken();
        
        successResponse([
            'player' => [
                'player_id' => $playerId,
                'username' => $username,
                'display_name' => $displayName ?: $username,
                'color_preference' => $color
            ],
            'csrf_token' => $_SESSION[CSRF_TOKEN_NAME]
        ]);
    } catch (PDOException $e) {
        errorResponse('Chyba databáze: ' . $e->getMessage(), 500);
    }
}

function handleLogout() {
    session_destroy();
    successResponse();
}

function handleGetCurrentPlayer() {
    if (!isLoggedIn()) {
        errorResponse('Nejste přihlášeni', 401);
    }
    
    $player = getCurrentPlayer();
    if (!$player) {
        errorResponse('Hráč nenalezen', 404);
    }
    
    successResponse([
        'player' => $player,
        'csrf_token' => $_SESSION[CSRF_TOKEN_NAME]
    ]);
}

// ============================================
// GAME ROOM HANDLERS
// ============================================

function handleCreateRoom() {
    if (!isLoggedIn()) {
        errorResponse('Nejste přihlášeni', 401);
    }
    
    $name = sanitize($_POST['name'] ?? 'Nová hra');
    $totalPlayers = intval($_POST['total_players'] ?? 4);
    $humanPlayers = intval($_POST['human_players'] ?? 4);
    
    if ($totalPlayers < MIN_PLAYERS || $totalPlayers > MAX_PLAYERS) {
        errorResponse('Počet hráčů musí být 2-8', 400);
    }
    
    if ($humanPlayers < 1 || $humanPlayers > $totalPlayers) {
        errorResponse('Počet lidí musí být 1-' . $totalPlayers, 400);
    }
    
    try {
        $db = getDatabaseConnection();
        
        // Generate unique room code
        $roomCode = generateRoomCode();
        while (true) {
            $stmt = $db->prepare("SELECT room_id FROM game_rooms WHERE room_code = ?");
            $stmt->execute([$roomCode]);
            if (!$stmt->fetch()) {
                break;
            }
            $roomCode = generateRoomCode();
        }
        
        // Create room
        $boardType = $totalPlayers <= 4 ? '4' : '8';
        
        $stmt = $db->prepare(
            "INSERT INTO game_rooms (room_code, name, created_by, total_players, human_players, board_type) 
             VALUES (?, ?, ?, ?, ?, ?)"
        );
        $stmt->execute([$roomCode, $name, getCurrentPlayerId(), $totalPlayers, $humanPlayers, $boardType]);
        
        $roomId = $db->lastInsertId();
        
        // Add creator as participant
        $player = getCurrentPlayer();
        $stmt = $db->prepare(
            "INSERT INTO room_participants 
             (room_id, player_id, player_index, player_name, player_color, player_type, is_ready) 
             VALUES (?, ?, 0, ?, ?, 'human', 1)"
        );
        $stmt->execute([
            $roomId, 
            getCurrentPlayerId(),
            $player['display_name'] ?? $player['username'],
            $player['color_preference']
        ]);
        
        $participantId = $db->lastInsertId();
        
        // Initialize settings
        $stmt = $db->prepare("INSERT INTO game_settings (room_id) VALUES (?)");
        $stmt->execute([$roomId]);
        
        // Initialize pieces
        for ($i = 0; $i < PIECE_COUNT; $i++) {
            $stmt = $db->prepare(
                "INSERT INTO game_pieces (room_id, participant_id, piece_number) 
                 VALUES (?, ?, ?)"
            );
            $stmt->execute([$roomId, $participantId, $i]);
        }
        
        successResponse([
            'room_id' => $roomId,
            'room_code' => $roomCode,
            'name' => $name,
            'total_players' => $totalPlayers,
            'human_players' => $humanPlayers,
            'board_type' => $boardType
        ]);
    } catch (PDOException $e) {
        errorResponse('Chyba databáze: ' . $e->getMessage(), 500);
    }
}

function handleJoinRoom() {
    $roomCode = sanitize($_POST['room_code'] ?? '');
    $playerName = sanitize($_POST['player_name'] ?? '');
    $playerColor = sanitize($_POST['player_color'] ?? PLAYER_COLORS[0]);
    
    if (empty($roomCode)) {
        errorResponse('Kód místnosti je povinný', 400);
    }
    
    try {
        $db = getDatabaseConnection();
        
        // Get room
        $stmt = $db->prepare(
            "SELECT * FROM game_rooms 
             WHERE room_code = ? AND status IN ('waiting', 'playing')"
        );
        $stmt->execute([$roomCode]);
        $room = $stmt->fetch();
        
        if (!$room) {
            errorResponse('Místnost nenalezena nebo není dostupná', 404);
        }
        
        // Check if room is full
        $stmt = $db->prepare("SELECT COUNT(*) as count FROM room_participants WHERE room_id = ?");
        $stmt->execute([$room['room_id']]);
        $participantCount = $stmt->fetch()['count'];
        
        if ($participantCount >= $room['total_players']) {
            errorResponse('Místnost je plná', 400);
        }
        
        // Determine player type
        $stmt = $db->prepare("SELECT COUNT(*) as human_count FROM room_participants 
                              WHERE room_id = ? AND player_type = 'human'");
        $stmt->execute([$room['room_id']]);
        $humanCount = $stmt->fetch()['human_count'];
        $playerType = ($humanCount < $room['human_players']) ? 'human' : 'ai';
        
        // Get next player index
        $stmt = $db->prepare("SELECT MAX(player_index) as max_index FROM room_participants WHERE room_id = ?");
        $stmt->execute([$room['room_id']]);
        $maxIndex = $stmt->fetch()['max_index'];
        $playerIndex = ($maxIndex === null) ? 0 : ($maxIndex + 1);
        
        // Add participant
        $playerId = isLoggedIn() ? getCurrentPlayerId() : null;
        $displayName = $playerName ?: (isLoggedIn() ? (getCurrentPlayer()['display_name'] ?? getCurrentPlayer()['username']) : 'Hráč ' . ($playerIndex + 1));
        
        $stmt = $db->prepare(
            "INSERT INTO room_participants 
             (room_id, player_id, player_index, player_name, player_color, player_type) 
             VALUES (?, ?, ?, ?, ?, ?)"
        );
        $stmt->execute([$room['room_id'], $playerId, $playerIndex, $displayName, $playerColor, $playerType]);
        
        $participantId = $db->lastInsertId();
        
        // Initialize pieces
        for ($i = 0; $i < PIECE_COUNT; $i++) {
            $stmt = $db->prepare(
                "INSERT INTO game_pieces (room_id, participant_id, piece_number) 
                 VALUES (?, ?, ?)"
            );
            $stmt->execute([$room['room_id'], $participantId, $i]);
        }
        
        // Store room in session
        $_SESSION['current_room_id'] = $room['room_id'];
        $_SESSION['current_participant_id'] = $participantId;
        
        successResponse([
            'room_id' => $room['room_id'],
            'room_code' => $roomCode,
            'name' => $room['name'],
            'total_players' => $room['total_players'],
            'human_players' => $room['human_players'],
            'board_type' => $room['board_type'],
            'participant_id' => $participantId,
            'player_index' => $playerIndex,
            'player_type' => $playerType
        ]);
    } catch (PDOException $e) {
        errorResponse('Chyba databáze: ' . $e->getMessage(), 500);
    }
}

function handleLeaveRoom() {
    if (!isset($_SESSION['current_room_id']) || !isset($_SESSION['current_participant_id'])) {
        errorResponse('Nejste v žádné místnosti', 400);
    }
    
    try {
        $db = getDatabaseConnection();
        
        $roomId = $_SESSION['current_room_id'];
        $participantId = $_SESSION['current_participant_id'];
        
        // Delete participant and their pieces
        $stmt = $db->prepare("DELETE FROM game_pieces WHERE participant_id = ?");
        $stmt->execute([$participantId]);
        
        $stmt = $db->prepare("DELETE FROM room_participants WHERE participant_id = ?");
        $stmt->execute([$participantId]);
        
        // Check if room is empty
        $stmt = $db->prepare("SELECT COUNT(*) as count FROM room_participants WHERE room_id = ?");
        $stmt->execute([$roomId]);
        $count = $stmt->fetch()['count'];
        
        if ($count === 0) {
            // Delete room
            $stmt = $db->prepare("DELETE FROM game_rooms WHERE room_id = ?");
            $stmt->execute([$roomId]);
            $stmt = $db->prepare("DELETE FROM game_settings WHERE room_id = ?");
            $stmt->execute([$roomId]);
            $stmt = $db->prepare("DELETE FROM game_moves WHERE room_id = ?");
            $stmt->execute([$roomId]);
            $stmt = $db->prepare("DELETE FROM chat_messages WHERE room_id = ?");
            $stmt->execute([$roomId]);
        } else {
            // Update room status if needed
            $stmt = $db->prepare("SELECT COUNT(*) as human_count FROM room_participants 
                                  WHERE room_id = ? AND player_type = 'human'");
            $stmt->execute([$roomId]);
            $humanCount = $stmt->fetch()['human_count'];
            
            if ($humanCount < 2) {
                $stmt = $db->prepare("UPDATE game_rooms SET status = 'waiting' WHERE room_id = ?");
                $stmt->execute([$roomId]);
            }
        }
        
        // Clear session
        unset($_SESSION['current_room_id']);
        unset($_SESSION['current_participant_id']);
        
        successResponse();
    } catch (PDOException $e) {
        errorResponse('Chyba databáze: ' . $e->getMessage(), 500);
    }
}

function handleGetRoom($roomId = null) {
    $roomId = $roomId ?: (isset($_SESSION['current_room_id']) ? $_SESSION['current_room_id'] : null);
    
    if (!$roomId) {
        $roomCode = sanitize($_GET['room_code'] ?? '');
        if (empty($roomCode)) {
            errorResponse('Kód místnosti je povinný', 400);
        }
        
        try {
            $db = getDatabaseConnection();
            $stmt = $db->prepare("SELECT room_id FROM game_rooms WHERE room_code = ?");
            $stmt->execute([$roomCode]);
            $room = $stmt->fetch();
            $roomId = $room['room_id'] ?? null;
        } catch (PDOException $e) {
            errorResponse('Chyba databáze: ' . $e->getMessage(), 500);
        }
    }
    
    if (!$roomId) {
        errorResponse('Místnost nenalezena', 404);
    }
    
    try {
        $db = getDatabaseConnection();
        
        // Get room info
        $stmt = $db->prepare(
            "SELECT * FROM game_rooms WHERE room_id = ?"
        );
        $stmt->execute([$roomId]);
        $room = $stmt->fetch();
        
        if (!$room) {
            errorResponse('Místnost nenalezena', 404);
        }
        
        // Get participants
        $stmt = $db->prepare(
            "SELECT * FROM room_participants WHERE room_id = ? ORDER BY player_index"
        );
        $stmt->execute([$roomId]);
        $participants = $stmt->fetchAll();
        
        // Get pieces
        $stmt = $db->prepare(
            "SELECT * FROM game_pieces WHERE room_id = ? ORDER BY participant_id, piece_number"
        );
        $stmt->execute([$roomId]);
        $pieces = $stmt->fetchAll();
        
        // Get settings
        $stmt = $db->prepare("SELECT * FROM game_settings WHERE room_id = ?");
        $stmt->execute([$roomId]);
        $settings = $stmt->fetch();
        
        // Get current participant
        $currentParticipantId = $_SESSION['current_participant_id'] ?? null;
        
        successResponse([
            'room' => $room,
            'participants' => $participants,
            'pieces' => $pieces,
            'settings' => $settings,
            'current_participant_id' => $currentParticipantId
        ]);
    } catch (PDOException $e) {
        errorResponse('Chyba databáze: ' . $e->getMessage(), 500);
    }
}

function handleGetRoomList() {
    try {
        $db = getDatabaseConnection();
        
        $stmt = $db->prepare(
            "SELECT r.room_id, r.room_code, r.name, r.status, r.total_players, r.created_at,
                    p.display_name as creator_name, p.username as creator_username,
                    COUNT(rp.participant_id) as current_players
             FROM game_rooms r
             JOIN players p ON r.created_by = p.player_id
             LEFT JOIN room_participants rp ON r.room_id = rp.room_id
             WHERE r.status IN ('waiting', 'playing')
             GROUP BY r.room_id
             ORDER BY r.created_at DESC"
        );
        $stmt->execute();
        $rooms = $stmt->fetchAll();
        
        successResponse(['rooms' => $rooms]);
    } catch (PDOException $e) {
        errorResponse('Chyba databáze: ' . $e->getMessage(), 500);
    }
}

function handleSetReady() {
    if (!isset($_SESSION['current_participant_id'])) {
        errorResponse('Nejste v žádné místnosti', 400);
    }
    
    $isReady = isset($_POST['is_ready']) ? boolval($_POST['is_ready']) : true;
    
    try {
        $db = getDatabaseConnection();
        
        $stmt = $db->prepare(
            "UPDATE room_participants SET is_ready = ? WHERE participant_id = ?"
        );
        $stmt->execute([$isReady ? 1 : 0, $_SESSION['current_participant_id']]);
        
        successResponse();
    } catch (PDOException $e) {
        errorResponse('Chyba databáze: ' . $e->getMessage(), 500);
    }
}

function handleStartGame() {
    if (!isset($_SESSION['current_room_id'])) {
        errorResponse('Nejste v žádné místnosti', 400);
    }
    
    try {
        $db = getDatabaseConnection();
        
        $roomId = $_SESSION['current_room_id'];
        
        // Check if all human players are ready
        $stmt = $db->prepare(
            "SELECT COUNT(*) as total, 
                    SUM(CASE WHEN is_ready = 1 THEN 1 ELSE 0 END) as ready 
             FROM room_participants 
             WHERE room_id = ? AND player_type = 'human'"
        );
        $stmt->execute([$roomId]);
        $result = $stmt->fetch();
        
        if ($result['total'] > 0 && $result['ready'] < $result['total']) {
            errorResponse('Ne všichni hráči jsou připraveni', 400);
        }
        
        // Check if room has enough players
        $stmt = $db->prepare(
            "SELECT total_players, status FROM game_rooms WHERE room_id = ?"
        );
        $stmt->execute([$roomId]);
        $room = $stmt->fetch();
        
        $stmt = $db->prepare("SELECT COUNT(*) as count FROM room_participants WHERE room_id = ?");
        $stmt->execute([$roomId]);
        $participantCount = $stmt->fetch()['count'];
        
        if ($participantCount < $room['total_players']) {
            errorResponse('Není dostatek hráčů', 400);
        }
        
        // Start game
        $stmt = $db->prepare(
            "UPDATE game_rooms SET status = 'playing', current_turn = 0, current_player = 0 WHERE room_id = ?"
        );
        $stmt->execute([$roomId]);
        
        successResponse();
    } catch (PDOException $e) {
        errorResponse('Chyba databáze: ' . $e->getMessage(), 500);
    }
}

// ============================================
// GAME ACTION HANDLERS
// ============================================

function handleRollDice() {
    if (!isset($_SESSION['current_room_id']) || !isset($_SESSION['current_participant_id'])) {
        errorResponse('Nejste v žádné místnosti', 400);
    }
    
    try {
        $db = getDatabaseConnection();
        
        $roomId = $_SESSION['current_room_id'];
        $participantId = $_SESSION['current_participant_id'];
        
        // Check if it's this player's turn
        $stmt = $db->prepare(
            "SELECT current_player, status FROM game_rooms WHERE room_id = ?"
        );
        $stmt->execute([$roomId]);
        $room = $stmt->fetch();
        
        if ($room['status'] !== 'playing') {
            errorResponse('Hra ještě nezačala', 400);
        }
        
        // Get participant index
        $stmt = $db->prepare("SELECT player_index FROM room_participants WHERE participant_id = ?");
        $stmt->execute([$participantId]);
        $participant = $stmt->fetch();
        
        if ($participant['player_index'] != $room['current_player']) {
            errorResponse('Není váš tah', 400);
        }
        
        // Roll dice
        $diceValue = random_int(1, DICE_SIDES);
        
        // Update room
        $stmt = $db->prepare(
            "UPDATE game_rooms SET dice_value = ? WHERE room_id = ?"
        );
        $stmt->execute([$diceValue, $roomId]);
        
        successResponse(['dice_value' => $diceValue]);
    } catch (PDOException $e) {
        errorResponse('Chyba databáze: ' . $e->getMessage(), 500);
    }
}

function handleMakeMove() {
    if (!isset($_SESSION['current_room_id']) || !isset($_SESSION['current_participant_id'])) {
        errorResponse('Nejste v žádné místnosti', 400);
    }
    
    $pieceNumber = intval($_POST['piece_number'] ?? 0);
    $fromRow = isset($_POST['from_row']) ? intval($_POST['from_row']) : null;
    $fromCol = isset($_POST['from_col']) ? intval($_POST['from_col']) : null;
    $toRow = isset($_POST['to_row']) ? intval($_POST['to_row']) : null;
    $toCol = isset($_POST['to_col']) ? intval($_POST['to_col']) : null;
    $moveType = sanitize($_POST['move_type'] ?? '');
    
    if (!in_array($moveType, ['start', 'move', 'home', 'finish', 'kick'])) {
        errorResponse('Neplatný typ tahu', 400);
    }
    
    try {
        $db = getDatabaseConnection();
        
        $roomId = $_SESSION['current_room_id'];
        $participantId = $_SESSION['current_participant_id'];
        
        // Get room state
        $stmt = $db->prepare(
            "SELECT current_player, dice_value, current_turn, status FROM game_rooms WHERE room_id = ?"
        );
        $stmt->execute([$roomId]);
        $room = $stmt->fetch();
        
        if ($room['status'] !== 'playing') {
            errorResponse('Hra ještě nezačala', 400);
        }
        
        // Get participant index
        $stmt = $db->prepare("SELECT player_index FROM room_participants WHERE participant_id = ?");
        $stmt->execute([$participantId]);
        $participant = $stmt->fetch();
        
        if ($participant['player_index'] != $room['current_player']) {
            errorResponse('Není váš tah', 400);
        }
        
        if ($room['dice_value'] === 0) {
            errorResponse('Nejdříve házíte kostkou', 400);
        }
        
        // Get current piece position
        $stmt = $db->prepare(
            "SELECT position_row, position_col, in_home, finished 
             FROM game_pieces 
             WHERE participant_id = ? AND piece_number = ?"
        );
        $stmt->execute([$participantId, $pieceNumber]);
        $piece = $stmt->fetch();
        
        // Validate move based on type
        if ($moveType === 'start') {
            // Must be from start (position is null)
            if ($piece['position_row'] !== null) {
                errorResponse('Figurka není ve startu', 400);
            }
            if ($room['dice_value'] !== 6) {
                errorResponse('Pro vyvedení figurky potřebujete 6', 400);
            }
        } else if ($moveType === 'finish') {
            // Must be exact move to finish
            if ($toRow === null || $toCol === null) {
                errorResponse('Cílová pozice je povinná', 400);
            }
        }
        
        // Check if to position is occupied by own piece
        if ($toRow !== null && $toCol !== null) {
            $stmt = $db->prepare(
                "SELECT gp.participant_id 
                 FROM game_pieces gp
                 JOIN room_participants rp ON gp.participant_id = rp.participant_id
                 WHERE gp.position_row = ? AND gp.position_col = ? 
                 AND gp.finished = 0 AND gp.participant_id != ?"
            );
            $stmt->execute([$toRow, $toCol, $participantId]);
            $opponentPiece = $stmt->fetch();
            
            if ($opponentPiece) {
                $moveType = 'kick';
                $kickedParticipantId = $opponentPiece['participant_id'];
                
                // Move opponent piece back to start
                $stmt = $db->prepare(
                    "UPDATE game_pieces 
                     SET position_row = NULL, position_col = NULL, in_home = 0, finished = 0
                     WHERE participant_id = ?"
                );
                $stmt->execute([$kickedParticipantId]);
            }
        }
        
        // Record move
        $turnNumber = $room['current_turn'];
        $kickedParticipantId = $moveType === 'kick' ? $opponentPiece['participant_id'] : null;
        
        $stmt = $db->prepare(
            "INSERT INTO game_moves 
             (room_id, participant_id, turn_number, dice_value, piece_number, 
              from_row, from_col, to_row, to_col, move_type, kicked_participant_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        );
        $stmt->execute([
            $roomId, $participantId, $turnNumber, $room['dice_value'], 
            $pieceNumber, $fromRow, $fromCol, $toRow, $toCol, $moveType, $kickedParticipantId
        ]);
        
        // Update piece position
        if ($moveType === 'finish') {
            $stmt = $db->prepare(
                "UPDATE game_pieces 
                 SET position_row = NULL, position_col = NULL, finished = 1, in_home = 0
                 WHERE participant_id = ? AND piece_number = ?"
            );
            $stmt->execute([$participantId, $pieceNumber]);
        } else if ($moveType === 'start') {
            $stmt = $db->prepare(
                "UPDATE game_pieces 
                 SET position_row = ?, position_col = ?, in_home = 0
                 WHERE participant_id = ? AND piece_number = ?"
            );
            $stmt->execute([$toRow, $toCol, $participantId, $pieceNumber]);
        } else if ($toRow !== null && $toCol !== null) {
            $inHome = ($moveType === 'home') ? 1 : 0;
            $stmt = $db->prepare(
                "UPDATE game_pieces 
                 SET position_row = ?, position_col = ?, in_home = ?
                 WHERE participant_id = ? AND piece_number = ?"
            );
            $stmt->execute([$toRow, $toCol, $inHome, $participantId, $pieceNumber]);
        }
        
        // Update participant finished pieces
        $stmt = $db->prepare(
            "SELECT COUNT(*) as finished FROM game_pieces 
             WHERE participant_id = ? AND finished = 1"
        );
        $stmt->execute([$participantId]);
        $finishedCount = $stmt->fetch()['finished'];
        
        $stmt = $db->prepare(
            "UPDATE room_participants SET finished_pieces = ? WHERE participant_id = ?"
        );
        $stmt->execute([$finishedCount, $participantId]);
        
        // Check for win
        if ($finishedCount === PIECE_COUNT) {
            $stmt = $db->prepare(
                "UPDATE room_participants SET has_won = 1 WHERE participant_id = ?"
            );
            $stmt->execute([$participantId]);
            
            $stmt = $db->prepare(
                "UPDATE game_rooms SET status = 'finished', winner = ? WHERE room_id = ?"
            );
            $stmt->execute([$participantId, $roomId]);
        }
        
        // End turn if not rolling 6 (unless it's a finish move)
        $nextTurn = $room['current_turn'] + 1;
        $nextPlayer = ($participant['player_index'] + 1) % $room['total_players'];
        
        if ($room['dice_value'] !== 6 || $moveType === 'finish') {
            $stmt = $db->prepare(
                "UPDATE game_rooms 
                 SET current_turn = ?, current_player = ?, dice_value = 0 
                 WHERE room_id = ?"
            );
            $stmt->execute([$nextTurn, $nextPlayer, $roomId]);
        } else {
            // Keep same player for another roll
            $stmt = $db->prepare(
                "UPDATE game_rooms SET dice_value = 0 WHERE room_id = ?"
            );
            $stmt->execute([$roomId]);
        }
        
        successResponse([
            'move_recorded' => true,
            'next_turn' => $nextTurn,
            'next_player' => $nextPlayer,
            'finished_count' => $finishedCount
        ]);
    } catch (PDOException $e) {
        errorResponse('Chyba databáze: ' . $e->getMessage(), 500);
    }
}

function handleEndTurn() {
    if (!isset($_SESSION['current_room_id']) || !isset($_SESSION['current_participant_id'])) {
        errorResponse('Nejste v žádné místnosti', 400);
    }
    
    try {
        $db = getDatabaseConnection();
        
        $roomId = $_SESSION['current_room_id'];
        $participantId = $_SESSION['current_participant_id'];
        
        // Get room state
        $stmt = $db->prepare(
            "SELECT current_player, current_turn, total_players FROM game_rooms WHERE room_id = ?"
        );
        $stmt->execute([$roomId]);
        $room = $stmt->fetch();
        
        // Get participant index
        $stmt = $db->prepare("SELECT player_index FROM room_participants WHERE participant_id = ?");
        $stmt->execute([$participantId]);
        $participant = $stmt->fetch();
        
        if ($participant['player_index'] != $room['current_player']) {
            errorResponse('Není váš tah', 400);
        }
        
        // End turn
        $nextTurn = $room['current_turn'] + 1;
        $nextPlayer = ($participant['player_index'] + 1) % $room['total_players'];
        
        $stmt = $db->prepare(
            "UPDATE game_rooms 
             SET current_turn = ?, current_player = ?, dice_value = 0 
             WHERE room_id = ?"
        );
        $stmt->execute([$nextTurn, $nextPlayer, $roomId]);
        
        successResponse([
            'next_turn' => $nextTurn,
            'next_player' => $nextPlayer
        ]);
    } catch (PDOException $e) {
        errorResponse('Chyba databáze: ' . $e->getMessage(), 500);
    }
}

function handleGetGameState() {
    if (!isset($_SESSION['current_room_id'])) {
        errorResponse('Nejste v žádné místnosti', 400);
    }
    
    $roomId = $_SESSION['current_room_id'];
    handleGetRoom($roomId);
}

// ============================================
// CHAT HANDLERS
// ============================================

function handleSendMessage() {
    if (!isset($_SESSION['current_room_id']) || !isset($_SESSION['current_participant_id'])) {
        errorResponse('Nejste v žádné místnosti', 400);
    }
    
    $message = sanitize($_POST['message'] ?? '');
    
    if (empty($message)) {
        errorResponse('Zpráva nesmí být prázdná', 400);
    }
    
    try {
        $db = getDatabaseConnection();
        
        $roomId = $_SESSION['current_room_id'];
        $participantId = $_SESSION['current_participant_id'];
        
        $stmt = $db->prepare(
            "INSERT INTO chat_messages (room_id, participant_id, message) 
             VALUES (?, ?, ?)"
        );
        $stmt->execute([$roomId, $participantId, $message]);
        
        successResponse(['message_id' => $db->lastInsertId()]);
    } catch (PDOException $e) {
        errorResponse('Chyba databáze: ' . $e->getMessage(), 500);
    }
}

function handleGetMessages() {
    if (!isset($_SESSION['current_room_id'])) {
        errorResponse('Nejste v žádné místnosti', 400);
    }
    
    $limit = intval($_GET['limit'] ?? 50);
    $offset = intval($_GET['offset'] ?? 0);
    
    try {
        $db = getDatabaseConnection();
        
        $roomId = $_SESSION['current_room_id'];
        
        $stmt = $db->prepare(
            "SELECT cm.*, rp.player_name, rp.player_color, rp.player_index
             FROM chat_messages cm
             LEFT JOIN room_participants rp ON cm.participant_id = rp.participant_id
             WHERE cm.room_id = ?
             ORDER BY cm.created_at DESC
             LIMIT ? OFFSET ?"
        );
        $stmt->execute([$roomId, $limit, $offset]);
        $messages = $stmt->fetchAll();
        
        // Reverse to get chronological order
        $messages = array_reverse($messages);
        
        successResponse(['messages' => $messages]);
    } catch (PDOException $e) {
        errorResponse('Chyba databáze: ' . $e->getMessage(), 500);
    }
}

// ============================================
// SETTINGS HANDLERS
// ============================================

function handleUpdateSettings() {
    if (!isset($_SESSION['current_room_id'])) {
        errorResponse('Nejste v žádné místnosti', 400);
    }
    
    $music = isset($_POST['music']) ? boolval($_POST['music']) : true;
    $sfx = isset($_POST['sfx']) ? boolval($_POST['sfx']) : true;
    $animations = isset($_POST['animations']) ? boolval($_POST['animations']) : true;
    $aiSpeed = sanitize($_POST['ai_speed'] ?? 'medium');
    
    if (!in_array($aiSpeed, ['fast', 'medium', 'slow'])) {
        errorResponse('Neplatná rychlost AI', 400);
    }
    
    try {
        $db = getDatabaseConnection();
        
        $roomId = $_SESSION['current_room_id'];
        
        $stmt = $db->prepare(
            "UPDATE game_settings 
             SET music_enabled = ?, sfx_enabled = ?, animations_enabled = ?, ai_speed = ?
             WHERE room_id = ?"
        );
        $stmt->execute([$music ? 1 : 0, $sfx ? 1 : 0, $animations ? 1 : 0, $aiSpeed, $roomId]);
        
        successResponse();
    } catch (PDOException $e) {
        errorResponse('Chyba databáze: ' . $e->getMessage(), 500);
    }
}

function handleGetSettings() {
    if (!isset($_SESSION['current_room_id'])) {
        errorResponse('Nejste v žádné místnosti', 400);
    }
    
    try {
        $db = getDatabaseConnection();
        
        $roomId = $_SESSION['current_room_id'];
        
        $stmt = $db->prepare("SELECT * FROM game_settings WHERE room_id = ?");
        $stmt->execute([$roomId]);
        $settings = $stmt->fetch();
        
        if (!$settings) {
            // Create default settings
            $stmt = $db->prepare(
                "INSERT INTO game_settings (room_id) VALUES (?)"
            );
            $stmt->execute([$roomId]);
            $settings = [
                'music_enabled' => 1,
                'sfx_enabled' => 1,
                'animations_enabled' => 1,
                'ai_speed' => 'medium'
            ];
        }
        
        successResponse(['settings' => $settings]);
    } catch (PDOException $e) {
        errorResponse('Chyba databáze: ' . $e->getMessage(), 500);
    }
}

// ============================================
// STATS HANDLERS
// ============================================

function handleGetStats() {
    try {
        $db = getDatabaseConnection();
        
        $playerId = getCurrentPlayerId();
        
        if ($playerId) {
            // Get stats for current player
            $stmt = $db->prepare(
                "SELECT p.*, 
                        COUNT(DISTINCT r.room_id) as games_created,
                        COUNT(DISTINCT CASE WHEN r.status = 'finished' AND r.winner = p.player_id THEN r.room_id END) as games_won,
                        COUNT(DISTINCT rp.room_id) as games_played
                 FROM players p
                 LEFT JOIN game_rooms r ON p.player_id = r.created_by
                 LEFT JOIN room_participants rp ON p.player_id = rp.player_id
                 WHERE p.player_id = ?
                 GROUP BY p.player_id"
            );
            $stmt->execute([$playerId]);
            $playerStats = $stmt->fetch();
        } else {
            $playerStats = null;
        }
        
        // Get top players
        $stmt = $db->query(
            "SELECT p.username, p.display_name, p.wins, p.games_played,
                    IF(p.games_played > 0, ROUND((p.wins / p.games_played) * 100, 2), 0) as win_rate
             FROM players p
             WHERE p.games_played > 0
             ORDER BY p.wins DESC, p.games_played DESC
             LIMIT 10"
        );
        $topPlayers = $stmt->fetchAll();
        
        // Get recent games
        $stmt = $db->query(
            "SELECT r.room_id, r.room_code, r.name, r.status, r.created_at,
                    p.display_name as creator_name,
                    COUNT(rp.participant_id) as players
             FROM game_rooms r
             JOIN players p ON r.created_by = p.player_id
             LEFT JOIN room_participants rp ON r.room_id = rp.room_id
             WHERE r.created_at > DATE_SUB(NOW(), INTERVAL 7 DAY)
             GROUP BY r.room_id
             ORDER BY r.created_at DESC
             LIMIT 10"
        );
        $recentGames = $stmt->fetchAll();
        
        successResponse([
            'player_stats' => $playerStats,
            'top_players' => $topPlayers,
            'recent_games' => $recentGames
        ]);
    } catch (PDOException $e) {
        errorResponse('Chyba databáze: ' . $e->getMessage(), 500);
    }
}
