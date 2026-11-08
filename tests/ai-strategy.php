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

$decisionA = onlineEngineChooseAIMoveDecision($game);
$decisionB = onlineEngineChooseAIMoveDecision($game);
$legal = onlineEngineValidMoves($game);
aiStrategyAssert($legal !== [], 'Testovací pozice musí mít legální tah.');
aiStrategyAssert(in_array($decisionA['pieceId'], $legal, true), 'AI musí vybrat pouze legální tah.');
aiStrategyAssert($decisionA['pieceId'] === $decisionB['pieceId'], 'Stejný stav musí vést ke stejnému tahu.');
aiStrategyAssert(count($decisionA['candidates']) === count($legal), 'Rozbor musí obsahovat všechny legální možnosti.');
aiStrategyAssert(is_string($decisionA['reason']) && $decisionA['reason'] !== '', 'AI musí vysvětlit vybraný tah.');

$winning = onlineEngineCreateState($participants, 40);
$winning['phase'] = 'move';
$winning['currentPlayer'] = 0;
$winning['diceValue'] = 1;
$winning['pieces'][0]['pieces'][0]['steps'] = 39;
$winning['pieces'][0]['pieces'][1]['steps'] = 41;
$winning['pieces'][0]['pieces'][2]['steps'] = 42;
$winning['pieces'][0]['pieces'][3]['steps'] = 43;
$winningDecision = onlineEngineChooseAIMoveDecision($winning);
aiStrategyAssert($winningDecision['pieceId'] !== null, 'AI musí najít vítězný tah.');
aiStrategyAssert($winningDecision['candidates'][0]['score'] >= 1000000, 'Okamžité vítězství musí mít nejvyšší prioritu.');

$game['diceValue'] = 3;
$game['pieces'][0]['pieces'][0]['steps'] = 5;
$game['pieces'][0]['pieces'][1]['steps'] = 15;
$game['pieces'][1]['pieces'][0]['steps'] = 8;
$game['pieces'][1]['pieces'][1]['steps'] = 18;
$decision = onlineEngineChooseAIMoveDecision($game);
aiStrategyAssert(in_array($decision['pieceId'], onlineEngineValidMoves($game), true),
    'AI musí respektovat legální tahy i při rozmístěných figurkách.');
aiStrategyAssert(array_key_exists('riskReduction', $decision['candidates'][0]),
    'Rozbor musí obsahovat vyhodnocení rizika.');

fwrite(STDOUT, "OK: pevná online AI strategie je deterministická, vysvětluje tahy a vybírá pouze legální možnosti.\n");
