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

$tiebreak = onlineEngineCreateState(testParticipants(4));
$tiebreakValues = [6, 2, 6, 1, 3, 4];
$tiebreakSeen = [];
$tiebreakResult = onlineEngineDetermineStartingPlayer(
    $tiebreak,
    static function (int $playerId, int $round) use (&$tiebreakValues, &$tiebreakSeen): int {
        $tiebreakSeen[] = $playerId;
        return array_shift($tiebreakValues);
    }
);
checkSame([0, 1, 2, 3, 0, 2], $tiebreakSeen, 'Při shodě smějí znovu házet pouze hráči s nejvyšším výsledkem.');
checkSame(2, $tiebreakResult['playerId'], 'Vítězem rozstřelu musí být hráč s nejvyšším rozhodujícím hodem.');
checkSame(2, $tiebreak['currentPlayer'], 'První tah musí dostat vítěz rozstřelu.');
checkSame([0, 1, 2, 3], array_column($tiebreak['players'], 'id'), 'Rozstřel nesmí měnit pořadí hráčů.');

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
checkSame([0, 1, 2, 3], onlineEngineValidMoves($spawnCapture), 'Nasazení na vlastní startovní pole musí být povoleno i při obsazení soupeřem.');
$spawnMove = onlineEngineMovePiece($spawnCapture, 0);
checkSame(1, $spawnMove['captured']['playerId'], 'Nasazením na vlastní startovní pole se musí vyhodit soupeř.');
checkSame(-1, $spawnCapture['pieces'][1]['pieces'][0]['steps'], 'Vyhozená figurka ze startovního pole se musí vrátit domů.');
checkSame(0, $spawnCapture['pieces'][0]['pieces'][0]['steps'], 'Nasazená figurka musí stát na vlastním startovním poli.');

$safe = onlineEngineCreateState(testParticipants(2));
$safe['phase'] = 'move';
$safe['diceValue'] = 1;
$safe['pieces'][0]['pieces'][0]['steps'] = 25;
$safe['pieces'][1]['pieces'][0]['steps'] = 0;
checkSame([0], onlineEngineValidMoves($safe), 'Na obsazené startovní pole soupeře musí být možné vstoupit.');
$safeMove = onlineEngineMovePiece($safe, 0);
checkSame(1, $safeMove['captured']['playerId'], 'Na startovním poli soupeře se musí dát vyhodit jeho figurka.');
checkSame(-1, $safe['pieces'][1]['pieces'][0]['steps'], 'Vyhozená figurka ze startovního pole soupeře se musí vrátit domů.');

$circuit = onlineEngineCreateState(testParticipants(2));
$circuit['pieces'][0]['pieces'][0]['steps'] = $circuit['trackLength'] - 1;
$circuit['phase'] = 'move';
$circuit['diceValue'] = 1;
checkSame([0], onlineEngineValidMoves($circuit), 'Návrat na vlastní startovní pole po celém okruhu musí být povolen.');
onlineEngineMovePiece($circuit, 0);
checkSame($circuit['trackLength'], $circuit['pieces'][0]['pieces'][0]['steps'], 'Celý okruh musí skončit na vlastním startovním poli.');
checkSame($circuit['players'][0]['start'], onlineEnginePiecePosition($circuit, 0, $circuit['pieces'][0]['pieces'][0]), 'Startovní pole se musí započítat jako poslední pole okruhu.');
$circuit['currentPlayer'] = 0;
$circuit['phase'] = 'move';
$circuit['diceValue'] = 1;
checkSame([0], onlineEngineValidMoves($circuit), 'Z vlastního startovního pole musí být možné vstoupit do domečku.');
onlineEngineMovePiece($circuit, 0);
checkSame($circuit['trackLength'] + 1, $circuit['pieces'][0]['pieces'][0]['steps'], 'První políčko domečku musí následovat až za návratem na start.');


$jump = onlineEngineCreateState(testParticipants(2));
$jump['phase'] = 'move';
$jump['diceValue'] = 2;
$jump['pieces'][0]['pieces'][0]['steps'] = 0;
$jump['pieces'][0]['pieces'][1]['steps'] = 1;
checkSame([0], onlineEngineValidMoves($jump), 'Vlastní figurku na hlavní dráze musí být možné přeskočit.');
onlineEngineMovePiece($jump, 0);
checkSame(2, $jump['pieces'][0]['pieces'][0]['steps'], 'Figurka musí přeskočit vlastní figurku.');
checkSame(1, $jump['pieces'][0]['pieces'][1]['steps'], 'Přeskočená vlastní figurka musí zůstat na místě.');

$homeJump = onlineEngineCreateState(testParticipants(2));
$homeJump['phase'] = 'move';
$homeJump['diceValue'] = 2;
$homeJump['pieces'][0]['pieces'][0]['steps'] = $homeJump['trackLength'] + 1;
$homeJump['pieces'][0]['pieces'][1]['steps'] = $homeJump['trackLength'] + 2;
checkSame([0], onlineEngineValidMoves($homeJump), 'Vlastní figurku v domácím sloupci musí být možné přeskočit.');
onlineEngineMovePiece($homeJump, 0);
checkSame($homeJump['trackLength'] + 3, $homeJump['pieces'][0]['pieces'][0]['steps'], 'Figurka musí přeskočit vlastní figurku v domácím sloupci.');

$homeBlock = onlineEngineCreateState(testParticipants(2));
$homeBlock['phase'] = 'move';
$homeBlock['diceValue'] = 1;
$homeBlock['pieces'][0]['pieces'][0]['steps'] = $homeBlock['trackLength'] + 1;
$homeBlock['pieces'][0]['pieces'][1]['steps'] = $homeBlock['trackLength'] + 2;
checkSame([], onlineEngineValidMoves($homeBlock), 'Na obsazené políčko domácího sloupce nesmí vstoupit druhá vlastní figurka.');

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
