<?php
// /install/install.php
declare(strict_types=1);

/**
 * Instalátor databáze pro Člověče, nezlob se!
 *
 * Konfiguraci načítá výhradně z kořenového .env.
 * SQL šablona: install/schema.sql
 * Před spuštěním se {DB_PREFIX} nahradí hodnotou TABLE_PREFIX.
 */

ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
error_reporting(E_ALL);

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

/** Bezpečné escapování HTML výstupu. */
function h(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** Načte jednoduchý soubor .env bez závislosti na knihovnách třetích stran. */
function loadEnvFile(string $path): array
{
    if (!is_file($path) || !is_readable($path)) {
        throw new RuntimeException('Soubor .env nebyl nalezen nebo jej nelze přečíst.');
    }

    $lines = file($path, FILE_IGNORE_NEW_LINES);
    if ($lines === false) {
        throw new RuntimeException('Soubor .env se nepodařilo načíst.');
    }

    $env = [];

    foreach ($lines as $line) {
        $line = trim($line);

        if ($line === '' || str_starts_with($line, '#')) {
            continue;
        }

        if (str_starts_with($line, 'export ')) {
            $line = trim(substr($line, 7));
        }

        $parts = explode('=', $line, 2);
        if (count($parts) !== 2) {
            continue;
        }

        $key = trim($parts[0]);
        $value = trim($parts[1]);

        if (!preg_match('/^[A-Z][A-Z0-9_]*$/i', $key)) {
            continue;
        }

        // Odstraníme pouze párové vnější uvozovky. Znak # uvnitř hodnoty
        // ponecháváme, protože může být součástí hesla.
        if (strlen($value) >= 2) {
            $first = $value[0];
            $last = substr($value, -1);

            if (($first === '"' && $last === '"') || ($first === "'" && $last === "'")) {
                $value = substr($value, 1, -1);
            }
        }

        $env[$key] = $value;
    }

    return $env;
}

/** Ověří povinné položky a bezpečnost prefixu pro SQL identifikátory. */
function validateConfig(array $env): array
{
    $required = ['DB_HOST', 'DB_USER', 'DB_NAME', 'TABLE_PREFIX'];
    $missing = [];

    foreach ($required as $key) {
        if (!array_key_exists($key, $env)) {
            $missing[] = $key;
        }
    }

    if ($missing !== []) {
        throw new RuntimeException(
            'V souboru .env chybí povinné položky: ' . implode(', ', $missing)
        );
    }

    $prefix = $env['TABLE_PREFIX'];

    // Prázdný prefix je povolený. Neprázdný musí být bezpečný a nesmí
    // způsobit překročení limitu 64 znaků pro MySQL názvy.
    if ($prefix !== '' && !preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $prefix)) {
        throw new RuntimeException(
            'TABLE_PREFIX obsahuje nepovolené znaky. Použij písmena, číslice a podtržítko; první znak musí být písmeno nebo podtržítko.'
        );
    }

    $longestSuffix = 'fk_participant_identity';
    if (strlen($prefix . $longestSuffix) > 64) {
        throw new RuntimeException('TABLE_PREFIX je příliš dlouhý pro názvy databázových omezení.');
    }

    return [
        'host' => $env['DB_HOST'],
        'user' => $env['DB_USER'],
        'pass' => $env['DB_PASS'] ?? '',
        'name' => $env['DB_NAME'],
        'prefix' => $prefix,
    ];
}

/** Vykreslí jednotnou HTML stránku instalátoru. */
function renderPage(array $config, string $content): void
{
    $prefix = $config['prefix'] ?? '(nenastaven)';
    $host = $config['host'] ?? '(nenastaven)';
    $database = $config['name'] ?? '(nenastavena)';
    $user = $config['user'] ?? '(nenastaven)';

    echo '<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Člověče, nezlob se! – instalace databáze</title>
<style>
*{box-sizing:border-box}
body{margin:0;padding:24px;background:#151b2b;color:#edf2f7;font:16px/1.55 Arial,sans-serif}
main{max-width:760px;margin:30px auto;padding:28px;background:#202a40;border:1px solid #394761;border-radius:12px}
h1{margin-top:0;color:#ff8585;font-size:25px}
h2{font-size:19px}
.config{padding:16px;background:#172033;border-radius:8px;margin:20px 0}
.config div{padding:5px 0;overflow-wrap:anywhere}
.config strong{display:inline-block;min-width:130px;color:#aab8cc}
button{width:100%;padding:14px;border:0;border-radius:8px;background:#e85f70;color:white;font-size:17px;font-weight:bold;cursor:pointer}
button:hover{background:#d94d60}
.status{padding:14px;margin:14px 0;border-radius:8px;overflow-wrap:anywhere}
.ok{background:#123c38;color:#8ce4d3}
.err{background:#4a2029;color:#ffb2b2}
.note{color:#b8c4d6;font-size:14px}
ul{padding-left:22px}
</style>
</head>
<body>
<main>
<h1>Člověče, nezlob se!</h1>
<h2>Instalace online databáze</h2>
<div class="config">
<div><strong>Databázový server:</strong> ' . h($host) . '</div>
<div><strong>Databáze:</strong> ' . h($database) . '</div>
<div><strong>Uživatel:</strong> ' . h($user) . '</div>
<div><strong>TABLE_PREFIX:</strong> ' . h($prefix) . '</div>
</div>
' . $content . '
<p class="note">Instalátor používá nastavení z kořenového souboru .env. Heslo nikde nezobrazuje.</p>
</main>
</body>
</html>';
}

// Načtení konfigurace probíhá před jakýmkoliv připojením k databázi.
$config = [];
$envError = null;

try {
    $env = loadEnvFile(dirname(__DIR__) . '/.env');
    $config = validateConfig($env);
} catch (Throwable $e) {
    $envError = $e->getMessage();
}

if ($envError !== null) {
    renderPage($config, '<div class="status err">' . h($envError) . '</div>');
    exit;
}

// Ochrana instalační akce proti nechtěnému spuštění cizím požadavkem.
if (empty($_SESSION['clovece_install_csrf'])) {
    $_SESSION['clovece_install_csrf'] = bin2hex(random_bytes(32));
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    $token = h($_SESSION['clovece_install_csrf']);
    $body = '
<p>Instalátor načte SQL šablonu, dosadí do ní prefix z .env a vytvoří nové tabulky.</p>
<p class="note">Databáze uvedená v .env musí již existovat a databázový uživatel musí mít oprávnění CREATE, ALTER/INDEX a INSERT. Instalátor nemaže žádné tabulky.</p>
<form method="post">
<input type="hidden" name="csrf_token" value="' . $token . '">
<button type="submit">Vytvořit databázové tabulky</button>
</form>';
    renderPage($config, $body);
    exit;
}

$postedToken = $_POST['csrf_token'] ?? '';
if (!is_string($postedToken) || !hash_equals($_SESSION['clovece_install_csrf'], $postedToken)) {
    http_response_code(403);
    renderPage($config, '<div class="status err">Neplatný bezpečnostní token. Obnov stránku a spusť instalaci znovu.</div>');
    exit;
}

try {
    $schemaPath = __DIR__ . '/schema.sql';
    if (!is_file($schemaPath) || !is_readable($schemaPath)) {
        throw new RuntimeException('Instalační SQL soubor install/schema.sql nebyl nalezen nebo jej nelze přečíst.');
    }

    $sqlTemplate = file_get_contents($schemaPath);
    if ($sqlTemplate === false || $sqlTemplate === '') {
        throw new RuntimeException('Instalační SQL soubor je prázdný nebo jej nelze načíst.');
    }

    if (strpos($sqlTemplate, '{DB_PREFIX}') === false) {
        throw new RuntimeException('V SQL šabloně chybí zástupný token {DB_PREFIX}.');
    }

    $sql = str_replace('{DB_PREFIX}', $config['prefix'], $sqlTemplate);
    if (strpos($sql, '{DB_PREFIX}') !== false) {
        throw new RuntimeException('V SQL šabloně zůstal nenahrazený token {DB_PREFIX}.');
    }

    $db = new PDO(
        'mysql:host=' . $config['host'] . ';dbname=' . $config['name'] . ';charset=utf8mb4',
        $config['user'],
        $config['pass'],
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );

    // Šablona obsahuje pouze běžné SQL příkazy ukončené středníkem;
    // neobsahuje procedury, triggery ani bloky s vnitřními středníky.
    $statements = preg_split('/;\s*(?:\r\n|\r|\n|$)/', $sql);
    if ($statements === false) {
        throw new RuntimeException('SQL šablonu se nepodařilo rozdělit na příkazy.');
    }

    $executed = 0;
    $statementNumber = 0;
    $failedStatement = null;
    $tables = [];

    foreach ($statements as $statement) {
        $statement = trim($statement);
        if ($statement === '') {
            continue;
        }

        $statementNumber++;
        $failedStatement = $statement;
        $db->exec($statement);
        $executed++;
        $failedStatement = null;

        if (preg_match('/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+([A-Za-z0-9_]+)/i', $statement, $match)) {
            $tables[] = $match[1];
        }
    }

    $list = '<ul>';
    foreach ($tables as $tableName) {
        $list .= '<li>' . h($tableName) . '</li>';
    }
    $list .= '</ul>';

    renderPage(
        $config,
        '<div class="status ok"><strong>Instalace databázového schématu byla dokončena.</strong></div>
         <p>Provedených SQL příkazů: <strong>' . (string) $executed . '</strong></p>
         <p>Tabulky zpracované instalátorem:</p>' . $list . '
         <p class="note">Použitý prefix: <strong>' . h($config['prefix']) . '</strong>. Existující tabulky nebyly odstraněny. Při opakovaném spuštění se již existující tabulky znovu nevytvoří a výchozí nastavení se neduplikují.</p>'
    );
} catch (Throwable $e) {
    http_response_code(500);
    $diagnostics = '';
    if (isset($failedStatement) && is_string($failedStatement) && $failedStatement !== '') {
        $diagnostics = '<h3>Selhal SQL příkaz č. ' . (string) ($statementNumber ?? 0) . ':</h3>'
            . '<pre style="white-space:pre-wrap;overflow-wrap:anywhere;background:#172033;padding:12px;border-radius:8px;color:#ffd2d2">'
            . h(substr($failedStatement, 0, 5000))
            . '</pre>';
    }

    renderPage(
        $config,
        '<div class="status err"><strong>Instalace nebyla dokončena.</strong><br>' . h($e->getMessage()) . '</div>'
        . $diagnostics
        . '<p class="note">Část tabulek mohla být vytvořena před vznikem chyby. Před opakováním instalace nejprve odstraň příčinu. Instalátor žádné tabulky nemaže.</p>'
    );
}
