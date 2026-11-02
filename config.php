<?php
/**
 * Člověče, nezlob se! - Configuration File
 * For wz.cz hosting
 * 
 * Sensitive data is loaded from .env file
 */

// Load environment variables from .env file
if (file_exists(__DIR__ . '/.env')) {
    $envLines = file(__DIR__ . '/.env', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($envLines as $line) {
        // Skip comments and empty lines
        if (strpos(trim($line), '#') === 0) continue;
        
        // Parse key=value
        $parts = explode('=', $line, 2);
        if (count($parts) === 2) {
            $key = trim($parts[0]);
            $value = trim($parts[1]);
            
            // Remove quotes if present
            if (preg_match('/^([\'\"])(.*)\1$/', $value, $matches)) {
                $value = $matches[2];
            }
            
            $_ENV[$key] = $value;
            putenv($key . '=' . $value);
        }
    }
}

// Database configuration (loaded from .env)
define('DB_HOST', $_ENV['DB_HOST'] ?? 'localhost');
define('DB_USER', $_ENV['DB_USER'] ?? 'username');
define('DB_PASS', $_ENV['DB_PASS'] ?? 'password');
define('DB_NAME', $_ENV['DB_NAME'] ?? 'clovece_game');
define('TABLE_PREFIX', $_ENV['TABLE_PREFIX'] ?? 'clovece_');

// Site configuration (loaded from .env with defaults)
define('SITE_NAME', $_ENV['SITE_NAME'] ?? 'Člověče, nezlob se!');
define('SITE_URL', $_ENV['SITE_URL'] ?? 'https://tvujweb.wz.cz/clovece');

// Game configuration (public settings)
define('MIN_PLAYERS', 2);
define('MAX_PLAYERS', 8);
define('PIECE_COUNT', 4);
define('DICE_SIDES', 6);

// Player colors (public settings)
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

// Player names (public settings)
define('PLAYER_NAMES', [
    'Červený', 'Tyrkysový', 'Žlutý', 'Zelený',
    'Růžový', 'Fialový', 'Oranžový', 'Modrý'
]);

// Session configuration (loaded from .env with defaults)
define('SESSION_TIMEOUT', $_ENV['SESSION_TIMEOUT'] ?? 3600);
define('CSRF_TOKEN_NAME', $_ENV['CSRF_TOKEN_NAME'] ?? 'clovece_csrf_token');

// Error reporting (loaded from .env with defaults)
$displayErrors = $_ENV['DISPLAY_ERRORS'] ?? '0';
$errorReporting = $_ENV['ERROR_REPORTING'] ?? 'E_ALL';

ini_set('display_errors', $displayErrors);
ini_set('display_startup_errors', $displayErrors);

if (defined('E_ALL')) {
    error_reporting(constant($errorReporting));
} else {
    error_reporting(E_ALL);
}

// Set default timezone (loaded from .env with defaults)
$timezone = $_ENV['TIMEZONE'] ?? 'Europe/Prague';
date_default_timezone_set($timezone);

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

// Helper function to get table name with prefix
function table($name) {
    return TABLE_PREFIX . $name;
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
