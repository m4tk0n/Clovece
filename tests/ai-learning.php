<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/game-engine.php';
require_once __DIR__ . '/../lib/ai-learning.php';

function aiLearningAssert(bool $condition, string $message): void
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
$game['diceValue'] = 3;
$game['pieces'][0]['pieces'][0]['steps'] = 0;
$game['pieces'][0]['pieces'][1]['steps'] = 10;
$game['pieces'][0]['pieces'][2]['steps'] = 20;
$game['pieces'][0]['pieces'][3]['steps'] = 30;
$game['pieces'][1]['pieces'][0]['steps'] = 4;
$game['pieces'][1]['pieces'][1]['steps'] = 14;
$game['pieces'][1]['pieces'][2]['steps'] = 24;
$game['pieces'][1]['pieces'][3]['steps'] = 34;

aiLearningAssert(count(onlineAiLearningBaseNames()) === 44, 'Model musí mít 44 základních signálů.');
$model = onlineAiLearningDefaultModel();
$decision = onlineAiLearningDecision($game, $model);
$legal = onlineEngineValidMoves($game);

aiLearningAssert($legal !== [], 'Testovací pozice musí mít legální tah.');
$onlineFeatures = onlineAiLearningActionFeatures($game, $legal[0], 0.5, 0.0, 1.0);
aiLearningAssert($onlineFeatures['base'][19] === 1.0, 'Online výchozí pravidlo tří pokusů musí být rozpoznáno.');
aiLearningAssert($onlineFeatures['base'][20] === 1.0, 'Online výchozí povinné nasazení musí být rozpoznáno.');
aiLearningAssert($onlineFeatures['base'][21] === 0.0, 'Online výchozí přeskakování domečku musí zůstat vypnuté.');
aiLearningAssert($onlineFeatures['base'][22] === 0.0, 'Online výchozí povinný vstup do domečku musí zůstat vypnutý.');
aiLearningAssert($onlineFeatures['base'][23] === 0.0, 'Online výchozí trest za tři šestky musí zůstat vypnutý.');

$game['rules'] = [
    'threeRolls' => false,
    'mustDeploy' => false,
    'skipHomePieces' => true,
    'mustEnterHome' => true,
    'threeSixesPenalty' => true,
];
$customRuleFeatures = onlineAiLearningActionFeatures($game, $legal[0], 0.5, 0.0, 1.0);
aiLearningAssert(array_slice($customRuleFeatures['base'], 19, 5) === [0.0, 0.0, 1.0, 1.0, 1.0],
    'AI musí do vektoru vlastností zapsat každé aktivní individuální nastavení pravidel.');
unset($game['rules']);

aiLearningAssert(in_array($decision['pieceId'], $legal, true), 'AI musí vybrat legální tah.');
aiLearningAssert(count($model['weights']) === 1000, 'Model musí zachovat 1000 základních vah.');
aiLearningAssert($model['version'] === 3 && $model['featureSchema']['totalFeatures'] === 1000, 'Online JSON model musí používat společné schéma v3.');
aiLearningAssert($model['decisionsTrained'] === 1, 'Model se musí aktualizovat po každém rozhodnutí.');
aiLearningAssert(count($model['dynamicParameters']) > 0, 'AI musí objevit nové dynamické parametry.');
aiLearningAssert($decision['learning']['totalParameters'] > 1000, 'Celkový počet parametrů musí překročit 1000.');
aiLearningAssert($decision['learning']['newParameterCount'] > 0, 'První rozhodnutí musí vytvořit nové vzorce.');
aiLearningAssert($decision['learning']['teacherSimulations'] === 8, 'Online AI musí použít MCTS učitele.');

$ids = array_column($model['dynamicParameters'], 'id');
aiLearningAssert(count($ids) === count(array_unique($ids)), 'ID dynamických parametrů musí být jedinečná.');
aiLearningAssert(min($ids) >= 1001, 'Dynamické parametry musí začínat ID 1001.');

fwrite(STDOUT, 'OK: online AI průběžně vytvořila ' . count($model['dynamicParameters']) .
    ' dynamických parametrů a uložila rozhodnutí ' . $decision['pieceId'] . ".\n");
