<?php
declare(strict_types=1);

/**
 * Vstupní bod webu.
 * Spustí lehkou pseudo-CRON kontrolu (nejvýše jednou za 5 minut)
 * a následně zobrazí původní statickou aplikaci index.html.
 */

require_once __DIR__ . '/cron/cron.php';

$htmlFile = __DIR__ . '/index.html';
if (!is_file($htmlFile) || !is_readable($htmlFile)) {
    http_response_code(500);
    exit('Aplikaci se nepodařilo načíst.');
}

header('Content-Type: text/html; charset=utf-8');
readfile($htmlFile);
