<?php
declare(strict_types=1);

/**
 * Samostatný vstup vývojového prostředí.
 *
 * Vykreslení a stabilní herní části sdílí s produkcí, ale všechny
 * experimentální moduly a styly se připojují z adresáře /debug/.
 * Parametr training vynutí 2D renderer a načte výukové nástroje AI.
 */
$_GET['debug'] = 'training';

// Použijeme produkční HTML shell a jeho stabilní herní moduly.
// Základní URL zajistí, že relativní assety vždy míří do kořene aplikace,
// nikoli do /debug/; vlastní experimentální soubory zůstávají v /debug/.
ob_start();
require dirname(__DIR__) . '/index.php';
$html = (string) ob_get_clean();

$html = preg_replace(
    '/<head>(?!.*<base\b)/is',
    '<head>' . PHP_EOL . '    <base href="../">' ,
    $html,
    1
);

echo $html;
