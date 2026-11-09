<?php
// /ftp.php
declare(strict_types=1);

/**
 * Minimal bridge to trigger the read-only FTP audit in GitHub Actions.
 *
 * This endpoint does not connect to FTP and does not read, return, or modify
 * server files. It only asks GitHub Actions to run the fixed audit workflow.
 *
 * Required .env values:
 *   FTP_AUDIT_TRIGGER_TOKEN  - a dedicated random token (at least 40 chars)
 *   GITHUB_ACTIONS_TOKEN     - fine-grained GitHub token with Actions: write
 *
 * Invoke over HTTPS: /clovece/ftp.php?key=YOUR_DEDICATED_TRIGGER_TOKEN
 */

header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('X-Content-Type-Options: nosniff');
header('X-Robots-Tag: noindex, nofollow');
header('Referrer-Policy: no-referrer');

function stopRequest(int $status, string $message): never
{
    http_response_code($status);
    echo $message . "\n";
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET');
    stopRequest(405, 'Method not allowed.');
}

$isHttps = (
    (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off')
    || (int) ($_SERVER['SERVER_PORT'] ?? 0) === 443
);
if (!$isHttps) {
    stopRequest(404, 'Not found.');
}

$envPath = __DIR__ . DIRECTORY_SEPARATOR . '.env';
if (!is_file($envPath) || !is_readable($envPath)) {
    stopRequest(503, 'Audit trigger is not configured.');
}

/** Read only the two named values. Never return or log .env contents. */
function readEnvValue(string $path, string $wantedKey): ?string
{
    $handle = @fopen($path, 'rb');
    if ($handle === false) {
        return null;
    }

    try {
        while (($line = fgets($handle)) !== false) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) {
                continue;
            }
            [$key, $value] = explode('=', $line, 2);
            if (trim($key) !== $wantedKey) {
                continue;
            }

            $value = trim($value);
            if (strlen($value) >= 2) {
                $first = $value[0];
                $last = $value[strlen($value) - 1];
                if (($first === '"' && $last === '"') || ($first === "'" && $last === "'")) {
                    $value = substr($value, 1, -1);
                }
            }
            return $value;
        }
    } finally {
        fclose($handle);
    }

    return null;
}

$expectedTrigger = readEnvValue($envPath, 'FTP_AUDIT_TRIGGER_TOKEN');
$githubToken = readEnvValue($envPath, 'GITHUB_ACTIONS_TOKEN');
$providedTrigger = isset($_GET['key']) && is_string($_GET['key']) ? $_GET['key'] : '';

if (
    !is_string($expectedTrigger) || strlen($expectedTrigger) < 40
    || !is_string($githubToken) || strlen($githubToken) < 20
) {
    stopRequest(503, 'Audit trigger is not configured.');
}

if ($providedTrigger === '' || !hash_equals($expectedTrigger, $providedTrigger)) {
    // Do not reveal whether configuration exists or which check failed.
    stopRequest(404, 'Not found.');
}
unset($providedTrigger, $expectedTrigger);

/*
 * Local cooldown prevents repeated workflow dispatches. The lock file is
 * stored in the system temp directory, not in the public website directory.
 */
$lockName = 'clovece-ftp-audit-' . hash('sha256', __DIR__) . '.lock';
$lockPath = rtrim(sys_get_temp_dir(), DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $lockName;
$lock = @fopen($lockPath, 'c+');
if ($lock === false || !flock($lock, LOCK_EX)) {
    if (is_resource($lock)) {
        fclose($lock);
    }
    stopRequest(503, 'Audit trigger temporarily unavailable.');
}
@chmod($lockPath, 0600);

$now = time();
rewind($lock);
$lastRun = (int) trim((string) stream_get_contents($lock));
if ($lastRun > 0 && ($now - $lastRun) < 120) {
    flock($lock, LOCK_UN);
    fclose($lock);
    header('Retry-After: ' . (120 - ($now - $lastRun)));
    stopRequest(429, 'Audit was triggered recently. Please wait before trying again.');
}

$apiUrl = 'https://api.github.com/repos/m4tk0n/Clovece/actions/workflows/ftp-audit.yml/dispatches';
$payload = json_encode(['ref' => 'main'], JSON_UNESCAPED_SLASHES);
if ($payload === false) {
    flock($lock, LOCK_UN);
    fclose($lock);
    stopRequest(500, 'Could not prepare audit request.');
}

$context = stream_context_create([
    'http' => [
        'method' => 'POST',
        'header' => implode("\r\n", [
            'Accept: application/vnd.github+json',
            'Authorization: Bearer ' . $githubToken,
            'X-GitHub-Api-Version: 2022-11-28',
            'User-Agent: Clovece-ReadOnly-FTPAudit',
            'Content-Type: application/json',
            'Content-Length: ' . strlen($payload),
        ]),
        'content' => $payload,
        'timeout' => 20,
        'ignore_errors' => true,
    ],
]);

unset($githubToken, $payload);

$response = @file_get_contents($apiUrl, false, $context);
$status = 0;
foreach (($http_response_header ?? []) as $headerLine) {
    if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $headerLine, $matches)) {
        $status = (int) $matches[1];
    }
}
unset($response, $http_response_header, $context);

if ($status !== 204) {
    flock($lock, LOCK_UN);
    fclose($lock);
    error_log('Člověče FTP audit: GitHub workflow dispatch failed (HTTP ' . $status . ').');
    stopRequest(502, 'GitHub did not accept the audit request. Check the GitHub token permissions and Actions settings.');
}

ftruncate($lock, 0);
rewind($lock);
fwrite($lock, (string) $now);
fflush($lock);
flock($lock, LOCK_UN);
fclose($lock);

http_response_code(202);
echo "FTP audit successfully queued in GitHub Actions.\n";
echo "The report will appear in the workflow run artifacts.\n";
