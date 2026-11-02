<?php
/**
 * Člověče, nezlob se! - Configuration File
 * For wz.cz hosting
 */

// Database configuration
define('DB_HOST', 'localhost');      // Usually 'localhost' for wz.cz
define('DB_USER', 'username');        // Your MySQL username
define('DB_PASS', 'password');        // Your MySQL password
define('DB_NAME', 'clovece_game');    // Database name

// Site configuration
define('SITE_NAME', 'Člověče, nezlob se!');
define('SITE_URL', 'https://tvujweb.wz.cz/clovece'); // Update with your URL

// Game configuration
define('MIN_PLAYERS', 2);
define('MAX_PLAYERS', 8);
define('PIECE_COUNT', 4);
define('DICE_SIDES', 6);

// Player colors
define('PLAYER_COLORS', [
    '#ff6b6b', // Red
    '#4ecdc4', // Teal
    '#ffe66d', // Yellow
    '#a8e6cf', // Green
    '#ff8b94', // Pink
    '#b4a7d6', // Purple
    '#d4a373', // Orange
    '#9999ff'  // Blue
]);

// Player names
define('PLAYER_NAMES', [
    'Červený', 'Tyrkysový', 'Žlutý', 'Zelený',
    'Růžový', 'Fialový', 'Oranžový', 'Modrý'
]);

// Session configuration
define('SESSION_TIMEOUT', 3600); // 1 hour in seconds

// Security
define('CSRF_TOKEN_NAME', 'clovece_csrf_token');

// Error reporting (disable in production)
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

// Start session
session_start();

// Set default timezone
date_default_timezone_set('Europe/Prague');

// Helper function to generate CSRF token
function generateCsrfToken() {
    if (empty($_SESSION[CSRF_TOKEN_NAME])) {
        $_SESSION[CSRF_TOKEN_NAME] = bin2hex(random_bytes(32));
    }
    return $_SESSION[CSRF_TOKEN_NAME];
}

// Helper function to validate CSRF token
function validateCsrfToken($token) {
    return isset($_SESSION[CSRF_TOKEN_NAME]) && hash_equals($_SESSION[CSRF_TOKEN_NAME], $token);
}

// Database connection function
function getDatabaseConnection() {
    static $connection = null;
    
    if ($connection === null) {
        try {
            $connection = new PDO(
                "mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4",
                DB_USER,
                DB_PASS,
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                ]
            );
        } catch (PDOException $e) {
            // Log error (in production, log to file)
            error_log("Database connection failed: " . $e->getMessage());
            die("Nelze se připojit k databázi. Zkontrolujte nastavení.");
        }
    }
    
    return $connection;
}

// Sanitize input
function sanitize($data) {
    if (is_array($data)) {
        return array_map('sanitize', $data);
    }
    return htmlspecialchars(trim($data), ENT_QUOTES, 'UTF-8');
}

// Generate random room code
function generateRoomCode() {
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $code = '';
    for ($i = 0; $i < 6; $i++) {
        $code .= $chars[random_int(0, strlen($chars) - 1)];
    }
    return $code;
}

// Check if user is logged in
function isLoggedIn() {
    return isset($_SESSION['player_id']) && !empty($_SESSION['player_id']);
}

// Get current player ID
function getCurrentPlayerId() {
    return $_SESSION['player_id'] ?? null;
}

// Get current player info
function getCurrentPlayer() {
    if (!isLoggedIn()) {
        return null;
    }
    
    try {
        $db = getDatabaseConnection();
        $stmt = $db->prepare("SELECT * FROM players WHERE player_id = ?");
        $stmt->execute([getCurrentPlayerId()]);
        return $stmt->fetch();
    } catch (PDOException $e) {
        error_log("Error fetching player: " . $e->getMessage());
        return null;
    }
}

// Redirect function
function redirect($url) {
    header("Location: " . $url);
    exit;
}

// JSON response helper
function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    header('Content-Type: application/json');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

// Error response helper
function errorResponse($message, $statusCode = 400) {
    jsonResponse(['error' => $message], $statusCode);
}

// Success response helper
function successResponse($data = []) {
    jsonResponse(['success' => true, 'data' => $data]);
}
