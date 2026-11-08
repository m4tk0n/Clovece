<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/game-engine.php';

function aiStrategyAssert(bool $condition, string $message): void
{
    if (!$condition) throw new RuntimeException($message);
}

$participants = [
    ['player_index' => 0, 'display_name' => 'AI 1', 'color' => '#E53935', 'player_type' => 'ai'],
    ['player_index' => 1, 'display_name' => 'AI 2', 'color' => '#1E88E5', 'player_type' => 'ai'],
];

$game = onlineEngineCreateState($participants, 40);
$game['phase'] = 'move';
$game['currentPlayer'] = 0;
$game['diceValue'] = 6;

$decision = onlineEngineChooseAIMoveDecision($game, static fn(int $count): int => 0);
$legal = onlineEngineValidMoves($game);
aiStrategyAssert($legal !== [], 'Testovací pozice musí mít legální tah.');
aiStrategyAssert(in_array($decision['pieceId'], $legal, true), 'AI musí vybrat pouze legální tah.');
aiStrategyAssert(count($decision['candidates']) === count($legal), 'Rozbor musí obsahovat všechny legální možnosti.');
aiStrategyAssert(is_string($decision['reason']) && $decision['reason'] !== '', 'AI musí vysvětlit, že zatím nemá taktiku.');

$game['diceValue'] = 3;
$game['pieces'][0]['pieces'][0]['steps'] = 5;
$game['pieces'][0]['pieces'][1]['steps'] = 15;
$game['pieces'][1]['pieces'][0]['steps'] = 8;
$game['pieces'][1]['pieces'][1]['steps'] = 18;
$legal = onlineEngineValidMoves($game);
aiStrategyAssert(count($legal) >= 2, 'Testovací pozice musí nabídnout více legálních tahů.');

$first = onlineEngineChooseAIMoveDecision($game, static fn(int $count): int => 0);
$last = onlineEngineChooseAIMoveDecision($game, static fn(int $count): int => $count - 1);
aiStrategyAssert(in_array($first['pieceId'], $legal, true), 'První náhodná volba musí být legální.');
aiStrategyAssert(in_array($last['pieceId'], $legal, true), 'Poslední náhodná volba musí být legální.');
aiStrategyAssert($first['pieceId'] !== $last['pieceId'], 'Náhodný výběr musí umět zvolit různé legální tahy.');
aiStrategyAssert(str_contains($first['reason'], 'nemám naučenou taktiku'),
    'Nevyučená AI musí v debug vysvětlení přiznat, že taktiku nemá.');
aiStrategyAssert(is_float(onlineEngineAiPips($game, 0)), 'Výpočet zbývajících kroků musí zůstat dostupný.');
aiStrategyAssert(is_float(onlineEngineAiThreatLoss($game, 0)), 'Výpočet ohrožení musí zůstat dostupný.');

$winning = onlineEngineCreateState($participants, 40);
$winning['phase'] = 'move';
$winning['currentPlayer'] = 0;
$winning['diceValue'] = 1;
$winning['pieces'][0]['pieces'][0]['steps'] = 39;
$winning['pieces'][0]['pieces'][1]['steps'] = 41;
$winning['pieces'][0]['pieces'][2]['steps'] = 42;
$winning['pieces'][0]['pieces'][3]['steps'] = 43;
$winningDecision = onlineEngineChooseAIMoveDecision($winning, static fn(int $count): int => $count - 1);
aiStrategyAssert($winningDecision['pieceId'] !== null, 'AI musí najít vítězný tah.');
aiStrategyAssert($winningDecision['pieceId'] === 0, 'Okamžité vítězství musí mít přednost před náhodným výběrem.');
aiStrategyAssert($winningDecision['selectedScore'] === 1.0, 'Vítězný tah musí být označen jako okamžitá výhra.');

fwrite(STDOUT, "OK: online AI je nevyučená, zachovává výpočty a vybírá pouze legální tahy.\n");
