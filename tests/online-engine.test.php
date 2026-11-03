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

$manual = onlineEngineCreateState(testParticipants(3));
checkSame('start-roll', $manual['phase'], 'Online hra musí začít čekáním na ruční rozstřel.');
checkSame([0, 1, 2], $manual['startCandidates'], 'Do prvního kola rozstřelu musí vstoupit všichni hráči.');
$manualValues = [6, 2, 6, 5, 4];
$manualSequence = [];
$manualRoll = static function (int $playerId, int $round) use (&$manualValues, &$manualSequence): int {
    $manualSequence[] = [$playerId, $round];
    return array_shift($manualValues);
};
$r1 = onlineEngineRecordStartingRoll($manual, 0, $manualRoll);
checkSame(false, $r1['roundComplete'], 'Kolo se nesmí uzavřít před hodem všech kandidátů.');
checkSame(1, $manual['currentPlayer'], 'Po prvním hodu musí následovat další hráč.');
onlineEngineRecordStartingRoll($manual, 1, $manualRoll);
onlineEngineRecordStartingRoll($manual, 2, $manualRoll);
checkSame([0, 2], $manual['startCandidates'], 'Při remíze smějí pokračovat pouze hráči s nejvyšším hodem.');
checkSame(0, $manual['currentPlayer'], 'Rozstřel po remíze musí začít prvním remizujícím hráčem.');
onlineEngineRecordStartingRoll($manual, 0, $manualRoll);
$finalRoll = onlineEngineRecordStartingRoll($manual, 2, $manualRoll);
checkSame(true, $finalRoll['finished'], 'Rozstřel musí skončit po jednoznačném výsledku.');
checkSame('roll', $manual['phase'], 'Po rozstřelu musí začít běžná hra.');
checkSame(0, $manual['currentPlayer'], 'Začínat musí vítěz ručního rozstřelu.');
checkSame([[0, 0], [1, 0], [2, 0], [0, 1], [2, 1]], $manualSequence, 'Ruční rozstřel nesmí házet za hráče automaticky ani zapojit hráče bez remízy.');

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

checkSame([40, 48, 80], onlineEngineAvailableBoardSizes(2), 'Dva hráči musí mít dostupné všechny velikosti.');
checkSame([40, 48, 80], onlineEngineAvailableBoardSizes(4), 'Čtyři hráči musí mít dostupné všechny velikosti.');
checkSame([48, 80], onlineEngineAvailableBoardSizes(5), 'Pět hráčů nesmí mít dostupnou desku se 40 poli.');
checkSame([48, 80], onlineEngineAvailableBoardSizes(6), 'Šest hráčů musí mít dostupné desky 48 a 80 polí.');
checkSame([80], onlineEngineAvailableBoardSizes(7), 'Sedm hráčů musí mít dostupnou pouze desku s 80 poli.');
checkSame([80], onlineEngineAvailableBoardSizes(8), 'Osm hráčů musí mít dostupnou pouze desku s 80 poli.');

$board40 = onlineEngineCreateState(testParticipants(2), 40);
checkSame(40, $board40['trackLength'], 'Deska 40 musí mít přesně 40 polí.');
checkSame(4, $board40['slotCount'], 'Deska 40 musí zachovat čtyři pozice.');
checkSame([0, 2], array_column($board40['players'], 'slot'), 'Dva hráči musí být na protilehlých pozicích čtyřmístné desky.');
checkSame([0, 20], array_column($board40['players'], 'start'), 'Starty na desce 40 nesouhlasí.');

$board48 = onlineEngineCreateState(testParticipants(5), 48);
checkSame(48, $board48['trackLength'], 'Deska 48 musí mít přesně 48 polí.');
checkSame(6, $board48['slotCount'], 'Deska 48 musí zachovat šest pozic.');
checkSame([0, 1, 2, 4, 5], array_column($board48['players'], 'slot'), 'Pět hráčů musí ponechat jednu pozici prázdnou.');
checkSame([0, 8, 16, 32, 40], array_column($board48['players'], 'start'), 'Starty na desce 48 nesouhlasí.');

$board80 = onlineEngineCreateState(testParticipants(7), 80);
checkSame(80, $board80['trackLength'], 'Deska 80 musí mít přesně 80 polí.');
checkSame(8, $board80['slotCount'], 'Deska 80 musí zachovat osm pozic.');
checkSame([0, 1, 2, 3, 5, 6, 7], array_column($board80['players'], 'slot'), 'Sedm hráčů musí ponechat jednu pozici prázdnou.');
checkSame([0, 10, 20, 30, 50, 60, 70], array_column($board80['players'], 'start'), 'Starty na desce 80 nesouhlasí.');

$invalidBoard = false;
try {
    onlineEngineCreateState(testParticipants(5), 40);
} catch (InvalidArgumentException) {
    $invalidBoard = true;
}
checkSame(true, $invalidBoard, 'Server musí odmítnout nepodporovanou velikost pro počet hráčů.');

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
checkSame([0, 1], onlineEngineValidMoves($jump), 'Vlastní figurku na hlavní dráze musí být možné přeskočit.');
onlineEngineMovePiece($jump, 0);
checkSame(2, $jump['pieces'][0]['pieces'][0]['steps'], 'Figurka musí přeskočit vlastní figurku.');
checkSame(1, $jump['pieces'][0]['pieces'][1]['steps'], 'Přeskočená vlastní figurka musí zůstat na místě.');

$mainBlock = onlineEngineCreateState(testParticipants(2));
$mainBlock['phase'] = 'move';
$mainBlock['diceValue'] = 2;
$mainBlock['pieces'][0]['pieces'][0]['steps'] = 0;
$mainBlock['pieces'][0]['pieces'][1]['steps'] = 2;
checkSame([1], onlineEngineValidMoves($mainBlock), 'Na obsazené políčko hlavní dráhy nesmí vstoupit druhá vlastní figurka.');

$homeJump = onlineEngineCreateState(testParticipants(2));
$homeJump['phase'] = 'move';
$homeJump['diceValue'] = 2;
$homeJump['pieces'][0]['pieces'][0]['steps'] = $homeJump['trackLength'] + 1;
$homeJump['pieces'][0]['pieces'][1]['steps'] = $homeJump['trackLength'] + 2;
checkSame([0, 1], onlineEngineValidMoves($homeJump), 'Vlastní figurku v domácím sloupci musí být možné přeskočit.');
onlineEngineMovePiece($homeJump, 0);
checkSame($homeJump['trackLength'] + 3, $homeJump['pieces'][0]['pieces'][0]['steps'], 'Figurka musí přeskočit vlastní figurku v domácím sloupci.');

$homeBlock = onlineEngineCreateState(testParticipants(2));
$homeBlock['phase'] = 'move';
$homeBlock['diceValue'] = 1;
$homeBlock['pieces'][0]['pieces'][0]['steps'] = $homeBlock['trackLength'] + 1;
$homeBlock['pieces'][0]['pieces'][1]['steps'] = $homeBlock['trackLength'] + 2;
checkSame([1], onlineEngineValidMoves($homeBlock), 'Na obsazené políčko domácího sloupce nesmí vstoupit druhá vlastní figurka.');

$finish = onlineEngineCreateState(testParticipants(2));
$laneStart = $finish['trackLength'] + 1;
$finish['pieces'][0]['pieces'][0]['steps'] = $laneStart;
$finish['pieces'][0]['pieces'][1]['steps'] = $laneStart + 1;
$finish['pieces'][0]['pieces'][2]['steps'] = $laneStart + 2;
$finish['pieces'][0]['pieces'][3]['steps'] = $finish['trackLength'];
$finish['phase'] = 'move';
$finish['diceValue'] = 4;
checkSame([3], onlineEngineValidMoves($finish), 'Přesný dojezd na poslední volné cílové políčko musí být povolen.');
onlineEngineMovePiece($finish, 3);
checkSame(
    [$laneStart, $laneStart + 1, $laneStart + 2, $laneStart + 3],
    array_column($finish['pieces'][0]['pieces'], 'steps'),
    'Čtyři figurky musí obsadit čtyři různá cílová políčka.'
);
checkSame(0, $finish['winner'], 'Hráč musí vyhrát po obsazení všech čtyř cílových políček.');
checkSame('finished', $finish['phase'], 'Stav hry musí být finished.');

$lastHomeBlocked = onlineEngineCreateState(testParticipants(2));
$lastHomeBlocked['pieces'][0]['pieces'][0]['steps'] = $lastHomeBlocked['trackLength'] + 3;
$lastHomeBlocked['pieces'][0]['pieces'][1]['steps'] = $lastHomeBlocked['trackLength'] + 4;
$lastHomeBlocked['phase'] = 'move';
$lastHomeBlocked['diceValue'] = 1;
checkSame([], onlineEngineValidMoves($lastHomeBlocked), 'Na obsazené poslední cílové políčko nesmí vstoupit druhá vlastní figurka.');

echo "PHP online game engine tests: OK\n";
