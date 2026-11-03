<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/game-engine.php';

function checkSame(mixed $expected, mixed $actual, string $message): void
{
    if ($expected !== $actual) {
        throw new RuntimeException(
            $message . "\nExpected: " . var_export($expected, true)
            . "\nActual: " . var_export($actual, true)
        );
    }
}

function testParticipants(int $count): array
{
    $colors = ['#f05b62', '#36c9c1', '#f4c84a', '#67c98b', '#e77ab4', '#9b83e8', '#e99555', '#6c9de8'];
    $players = [];
    for ($i = 0; $i < $count; $i++) {
        $players[] = [
            'player_index' => $i,
            'display_name' => 'Hráč ' . ($i + 1),
            'color' => $colors[$i],
        ];
    }
    return $players;
}

$two = onlineEngineCreateState(testParticipants(2));
checkSame(52, $two['trackLength'], 'Dva hráči musí mít 52 polí.');
checkSame([0, 26], array_column($two['players'], 'start'), 'Startovní pole pro dva hráče nesouhlasí.');

$three = onlineEngineCreateState(testParticipants(3));
checkSame([0, 17, 35], array_column($three['players'], 'start'), 'Startovní pole pro tři hráče nesouhlasí.');

$four = onlineEngineCreateState(testParticipants(4));
checkSame([0, 13, 26, 39], array_column($four['players'], 'start'), 'Startovní pole pro čtyři hráče nesouhlasí.');

$five = onlineEngineCreateState(testParticipants(5));
checkSame(64, $five['trackLength'], 'Pět hráčů musí mít rozšířenou desku.');
checkSame([0, 13, 26, 38, 51], array_column($five['players'], 'start'), 'Startovní pole pro pět hráčů nesouhlasí.');

$eight = onlineEngineCreateState(testParticipants(8));
checkSame([0, 8, 16, 24, 32, 40, 48, 56], array_column($eight['players'], 'start'), 'Startovní pole pro osm hráčů nesouhlasí.');

$capture = onlineEngineCreateState(testParticipants(2));
$capture['phase'] = 'move';
$capture['diceValue'] = 1;
$capture['pieces'][0]['pieces'][0]['steps'] = 1;
$capture['pieces'][1]['pieces'][0]['steps'] = 28;
checkSame([0], onlineEngineValidMoves($capture), 'Tah na obsazené nebezpečné pole má být povolen.');
$move = onlineEngineMovePiece($capture, 0);
checkSame(1, $move['captured']['playerId'], 'Tah musí vyhodit soupeřovu figurku.');
checkSame(-1, $capture['pieces'][1]['pieces'][0]['steps'], 'Vyhozená figurka se musí vrátit domů.');
checkSame(2, $capture['pieces'][0]['pieces'][0]['steps'], 'Vlastní figurka se musí posunout na cílové pole.');

$spawnCapture = onlineEngineCreateState(testParticipants(2));
$spawnCapture['phase'] = 'move';
$spawnCapture['diceValue'] = 6;
$spawnCapture['pieces'][1]['pieces'][0]['steps'] = 26; // Soupeř stojí na startovním poli hráče 1.
checkSame([0], onlineEngineValidMoves($spawnCapture), 'Nasazení na vlastní startovní pole musí být povoleno i při obsazení soupeřem.');
$spawnMove = onlineEngineMovePiece($spawnCapture, 0);
checkSame(1, $spawnMove['captured']['playerId'], 'Nasazením na vlastní startovní pole se musí vyhodit soupeř.');
checkSame(-1, $spawnCapture['pieces'][1]['pieces'][0]['steps'], 'Vyhozená figurka ze startovního pole se musí vrátit domů.');
checkSame(0, $spawnCapture['pieces'][0]['pieces'][0]['steps'], 'Nasazená figurka musí stát na vlastním startovním poli.');

$safe = onlineEngineCreateState(testParticipants(2));
$safe['phase'] = 'move';
$safe['diceValue'] = 1;
$safe['pieces'][0]['pieces'][0]['steps'] = 25;
$safe['pieces'][1]['pieces'][0]['steps'] = 0;
checkSame([], onlineEngineValidMoves($safe), 'Na obsazené bezpečné pole nelze vstoupit.');

$finish = onlineEngineCreateState(testParticipants(2));
$max = $finish['trackLength'] + 4;
foreach ($finish['pieces'][0]['pieces'] as &$piece) {
    $piece['steps'] = $max;
}
unset($piece);
$finish['pieces'][0]['pieces'][0]['steps'] = $max - 1;
$finish['phase'] = 'move';
$finish['diceValue'] = 1;
checkSame([0], onlineEngineValidMoves($finish), 'Přesný dojezd do cíle musí být povolen.');
onlineEngineMovePiece($finish, 0);
checkSame(0, $finish['winner'], 'Hráč musí vyhrát po dojezdu poslední figurky.');
checkSame('finished', $finish['phase'], 'Stav hry musí být finished.');

echo "PHP online game engine tests: OK\n";
