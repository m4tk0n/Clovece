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

// Debug prostředí používá vlastní bootstrap a vlastní kopie AI/engine modulů.
$html = str_replace('src="js/bootstrap.js', 'src="debug/js/bootstrap.js', $html);

// Import map přidá filemtime cache-busting pro všechny moduly v /debug/js/.
// Relativní importy mezi debug moduly se tak po každém FTP nasazení obnoví,
// aniž bychom museli měnit jejich názvy nebo zasahovat do produkčního index.php.
$html = preg_replace_callback(
    '/<script type="importmap">\\s*(.*?)\\s*<\\/script>/is',
    static function (array $match): string {
        $map = json_decode($match[1], true);
        if (!is_array($map) || !is_array($map['imports'] ?? null)) {
            return $match[0];
        }

        $debugJsDirectory = __DIR__ . '/js';
        $scriptDirectory = rtrim(dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/debug/index.php')), '/') . '/';
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
            ? 'https'
            : 'http';
        $host = (string) ($_SERVER['HTTP_HOST'] ?? '');
        if ($host === '' || !is_dir($debugJsDirectory)) {
            return $match[0];
        }

        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($debugJsDirectory, FilesystemIterator::SKIP_DOTS)
        );
        foreach ($iterator as $assetFile) {
            if (!$assetFile->isFile() || !str_ends_with($assetFile->getFilename(), '.js')) {
                continue;
            }
            $relativePath = str_replace(
                DIRECTORY_SEPARATOR,
                '/',
                substr($assetFile->getPathname(), strlen($debugJsDirectory) + 1)
            );
            $url = $scheme . '://' . $host . $scriptDirectory . 'js/' . $relativePath;
            $map['imports'][$url] = $url . '?v=' . (int) $assetFile->getMTime();
        }

        $json = json_encode(
            $map,
            JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
        );
        return is_string($json) ? '<script type="importmap">' . $json . '</script>' : $match[0];
    },
    $html,
    1
);

echo $html;
