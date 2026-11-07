<?php
declare(strict_types=1);

/**
 * Společné průběžné učení serverové online AI.
 * Jeden globální JSON model je zamčený řádkem InnoDB; souběžné partie
 * proto aktualizace slučují a nepřepisují si navzájem.
 */

function onlineAiLearningClamp(float $value, float $min = -1.0, float $max = 1.0): float
{
    return max($min, min($max, $value));
}

function onlineAiLearningBaseNames(): array
{
    return [
        'strategic_score', 'progress', 'opponent_capture', 'finish_piece',
        'deploy_piece', 'own_capture', 'enter_home', 'route_spread',
        'expected_own_loss', 'base_pieces', 'home_pieces',
        'opponent_progress_advantage', 'capture_risk_after', 'threat_count_after',
        'bonus_roll_legal_options', 'bonus_roll_expected_gain',
        'bonus_roll_capture_chance', 'dice_value', 'consecutive_sixes',
        'rule_three_rolls', 'rule_must_deploy', 'rule_skip_home_pieces',
        'rule_must_enter_home', 'rule_three_sixes_penalty',
        'active_pieces_after', 'base_pieces_after', 'home_pieces_after',
        'moved_piece_progress', 'moved_piece_distance_home', 'moved_piece_remaining_route',
        'closest_opponent_distance', 'average_opponent_distance',
        'opponent_threats_before', 'opponent_threats_after',
        'own_finish_probability_next_roll', 'own_deploy_probability_next_roll',
        'opponent_active_piece_density', 'own_lead_over_best_opponent',
        'own_gap_to_farthest_opponent', 'players_remaining', 'player_count',
        'board_length_scale', 'route_coverage_after', 'cluster_density_after'
    ];
}

function onlineAiLearningDefaultModel(): array
{
    return [
        'version' => 3,
        'featureSchema' => ['version' => 3, 'baseFeatures' => 44, 'pairwiseFeatures' => 946, 'tripleFeatures' => 10, 'totalFeatures' => 1000],
        'generation' => 0,
        'decisionsTrained' => 0,
        'gamesTrained' => 0,
        'learningRate' => 0.02,
        'temperature' => 0.22,
        'weights' => array_fill(0, 1000, 0.0),
        'dynamicParameters' => [],
    ];
}

function onlineAiLearningPips(array $game, int $playerId): float
{
    $pieces = $game['pieces'][$playerId]['pieces'] ?? [];
    $track = max(1, (int) $game['trackLength']);
    $base = 0;
    $active = 0;
    foreach ($pieces as $piece) {
        $steps = (int) $piece['steps'];
        if ($steps === -1) $base++;
        elseif ($steps < $track) $active++;
    }
    $allBase = $pieces !== [] && $base === count($pieces);
    $pips = 0.0;
    foreach ($pieces as $piece) {
        $steps = (int) $piece['steps'];
        $pips += $steps === -1
            ? $track + 9
            : max(0, $track + 3 - $steps);
    }
    if ($allBase) $pips += $track + 3;
    $flexibility = [-1.5, 0.0, 1.5, 2.2, 2.5];
    $pips -= $flexibility[min(4, $active)];
    return max(0.0, $pips);
}

function onlineAiLearningRouteSpread(array $game, int $playerId): float
{
    $track = max(1, (int) $game['trackLength']);
    $quadrants = [];
    foreach ($game['pieces'][$playerId]['pieces'] as $piece) {
        $steps = (int) $piece['steps'];
        if ($steps >= 0 && $steps < $track) $quadrants[(int) floor(($steps / $track) * 4)] = true;
    }
    return count($quadrants) / 4;
}

function onlineAiLearningThreats(array $game, int $playerId, int $pieceId): array
{
    $track = max(1, (int) $game['trackLength']);
    $piece = $game['pieces'][$playerId]['pieces'][$pieceId] ?? null;
    if (!$piece) return ['risk' => 0.0, 'count' => 0.0];
    $steps = (int) $piece['steps'];
    if ($steps < 0 || $steps >= $track) return ['risk' => 0.0, 'count' => 0.0];
    $target = (((int) $game['players'][$playerId]['start']) + $steps) % $track;
    $threatCount = 0;
    $captureProbability = 0.0;
    foreach ($game['players'] as $opponent) {
        $opponentId = (int) $opponent['id'];
        if ($opponentId === $playerId || !empty($opponent['finished'])) continue;
        $distances = [];
        foreach ($game['pieces'][$opponentId]['pieces'] as $enemyPiece) {
            $enemySteps = (int) $enemyPiece['steps'];
            if ($enemySteps < 0 || $enemySteps >= $track) continue;
            $position = onlineEnginePiecePosition($game, $opponentId, $enemyPiece);
            $distance = ($target - $position + $track) % $track;
            if ($distance >= 1 && $distance <= 6) {
                $threatCount++;
                $distances[$distance] = true;
            }
        }
        $captureProbability += count($distances) / 6;
    }
    return [
        'risk' => onlineAiLearningClamp($captureProbability, 0.0, 1.0),
        'count' => onlineAiLearningClamp($threatCount / 12, 0.0, 1.0),
    ];
}

function onlineAiLearningBonus(array $game, int $playerId): array
{
    if ((int) $game['currentPlayer'] !== $playerId || ($game['phase'] ?? '') !== 'roll') {
        return ['legalOptions' => 0.0, 'expectedGain' => 0.0, 'captureChance' => 0.0];
    }
    $track = max(1, (int) $game['trackLength']);
    $beforePips = onlineAiLearningPips($game, $playerId);
    $options = 0.0;
    $gain = 0.0;
    $captureRolls = 0;
    for ($die = 1; $die <= 6; $die++) {
        $rolled = $game;
        onlineEngineRollDice($rolled, static fn(): int => $die);
        $moves = ($rolled['phase'] ?? '') === 'move' ? onlineEngineValidMoves($rolled) : [];
        $options += min(4, count($moves)) / 4;
        $bestGain = 0.0;
        $canCapture = false;
        foreach ($moves as $nextPieceId) {
            $after = $rolled;
            $move = onlineEngineMovePiece($after, (int) $nextPieceId);
            $afterPips = onlineAiLearningPips($after, $playerId);
            $bestGain = max($bestGain, onlineAiLearningClamp(
                ($beforePips - $afterPips) / ($track * 4), -1.0, 1.0
            ));
            if (!empty($move['captured']) && empty($move['captured']['ownPiece'])) $canCapture = true;
        }
        $gain += $bestGain;
        if ($canCapture) $captureRolls++;
    }
    return [
        'legalOptions' => $options / 6,
        'expectedGain' => $gain / 6,
        'captureChance' => $captureRolls / 6,
    ];
}

function onlineAiLearningActionFeatures(array $game, int $pieceId, float $strategicScore, float $scoreMin, float $scoreMax): array
{
    $playerId = (int) $game['currentPlayer'];
    $track = max(1, (int) $game['trackLength']);
    $beforePips = onlineAiLearningPips($game, $playerId);
    $beforeSpread = onlineAiLearningRouteSpread($game, $playerId);
    $simulation = $game;
    $transition = onlineEngineMovePiece($simulation, $pieceId);
    $afterPips = onlineAiLearningPips($simulation, $playerId);
    $ownCapture = !empty($transition['captured']['ownPiece']);
    $captureValue = 0.0;
    if (!empty($transition['captured']) && !$ownCapture) {
        $victimId = (int) $transition['captured']['playerId'];
        $victimBefore = onlineAiLearningPips($game, $victimId);
        $victimAfter = onlineAiLearningPips($simulation, $victimId);
        $captureValue = onlineAiLearningClamp(($victimAfter - $victimBefore) / ($track * 4), 0.0, 1.0);
    }
    $beforeSteps = (int) $game['pieces'][$playerId]['pieces'][$pieceId]['steps'];
    $movedSteps = (int) $simulation['pieces'][$playerId]['pieces'][$pieceId]['steps'];
    $enteringHome = $beforeSteps >= 0 && $beforeSteps < $track && $movedSteps >= $track;
    $threatsBefore = onlineAiLearningThreats($game, $playerId, $pieceId);
    $threatsAfter = onlineAiLearningThreats($simulation, $playerId, $pieceId);
    $bonus = onlineAiLearningBonus($simulation, $playerId);
    $opponents = [];
    $opponentPips = [];
    foreach ($simulation['players'] as $opponent) {
        $opponentId = (int) $opponent['id'];
        if ($opponentId === $playerId || !empty($opponent['finished'])) continue;
        $opponents[] = $opponentId;
        $opponentPips[] = onlineAiLearningPips($simulation, $opponentId);
    }
    $opponentAverage = $opponentPips ? array_sum($opponentPips) / count($opponentPips) : $afterPips;
    $bestOpponent = $opponentPips ? min($opponentPips) : $afterPips;
    $farthestOpponent = $opponentPips ? max($opponentPips) : $afterPips;
    $afterPieces = $simulation['pieces'][$playerId]['pieces'];
    $baseCount = count(array_filter($game['pieces'][$playerId]['pieces'], static fn(array $p): bool => (int) $p['steps'] === -1));
    $homeCount = count(array_filter($game['pieces'][$playerId]['pieces'], static fn(array $p): bool => (int) $p['steps'] >= $track));
    $afterBase = count(array_filter($afterPieces, static fn(array $p): bool => (int) $p['steps'] === -1));
    $afterHome = count(array_filter($afterPieces, static fn(array $p): bool => (int) $p['steps'] >= $track));
    $afterTrack = array_values(array_filter($afterPieces, static fn(array $p): bool => (int) $p['steps'] >= 0 && (int) $p['steps'] < $track));
    $activeCount = count($afterTrack);
    $finishDistance = $track + 3 - $movedSteps;
    $finishProbability = $movedSteps >= 0 && $movedSteps < $track + 3 && $finishDistance >= 1 && $finishDistance <= 6 ? 1 / 6 : 0;
    $deployProbability = $afterBase > 0 ? 1 / 6 : 0;
    $targetPosition = $movedSteps >= 0 && $movedSteps < $track
        ? (((int) $simulation['players'][$playerId]['start']) + $movedSteps) % $track
        : null;
    $opponentDistances = [];
    if ($targetPosition !== null) {
        foreach ($opponents as $opponentId) {
            foreach ($simulation['pieces'][$opponentId]['pieces'] as $enemyPiece) {
                $enemySteps = (int) $enemyPiece['steps'];
                if ($enemySteps < 0 || $enemySteps >= $track) continue;
                $position = onlineEnginePiecePosition($simulation, $opponentId, $enemyPiece);
                $opponentDistances[] = ($position - $targetPosition + $track) % $track;
            }
        }
    }
    $nearestDistance = $opponentDistances ? min($opponentDistances) : $track;
    $averageDistance = $opponentDistances ? array_sum($opponentDistances) / count($opponentDistances) : $track;
    $clusterPairs = 0;
    for ($left = 0; $left < count($afterTrack); $left++) {
        for ($right = $left + 1; $right < count($afterTrack); $right++) {
            $a = (int) $afterTrack[$left]['steps'];
            $b = (int) $afterTrack[$right]['steps'];
            $distance = min(abs($a - $b), $track - abs($a - $b));
            if ($distance <= 6) $clusterPairs++;
        }
    }
    $playerCount = max(1, count($simulation['players']));
    $activeOpponents = 0;
    foreach ($opponents as $opponentId) {
        foreach ($simulation['pieces'][$opponentId]['pieces'] as $enemyPiece) {
            $steps = (int) $enemyPiece['steps'];
            if ($steps >= 0 && $steps < $track) $activeOpponents++;
        }
    }
    $strategicNormalized = $scoreMax > $scoreMin
        ? ($strategicScore - $scoreMin) / ($scoreMax - $scoreMin) : 0.5;

    $base = [
        onlineAiLearningClamp($strategicNormalized, 0.0, 1.0),
        onlineAiLearningClamp(($beforePips - $afterPips) / $track),
        $captureValue,
        !empty($transition['finishedNow']) ? 1.0 : 0.0,
        !empty($transition['deployed']) ? 1.0 : 0.0,
        $ownCapture ? 1.0 : 0.0,
        $enteringHome ? 1.0 : 0.0,
        onlineAiLearningRouteSpread($simulation, $playerId) - $beforeSpread,
        onlineAiLearningClamp($threatsAfter['risk'], 0.0, 1.0),
        $baseCount / 4,
        $homeCount / 4,
        onlineAiLearningClamp(($opponentAverage - $beforePips) / ($track * 4)),
        $threatsAfter['risk'],
        $threatsAfter['count'],
        $bonus['legalOptions'],
        $bonus['expectedGain'],
        $bonus['captureChance'],
        onlineAiLearningClamp(((int) ($game['diceValue'] ?? 0)) / 6, 0.0, 1.0),
        onlineAiLearningClamp(((int) ($game['consecutiveSixes'] ?? 0)) / 3, 0.0, 1.0),
        1.0, 1.0, 0.0, 1.0, 0.0,
        $activeCount / 4,
        $afterBase / 4,
        $afterHome / 4,
        $movedSteps >= 0 ? onlineAiLearningClamp($movedSteps / ($track + 3), 0.0, 1.0) : -1.0,
        $movedSteps >= 0 ? onlineAiLearningClamp(($track + 3 - $movedSteps) / ($track + 3), 0.0, 1.0) : 1.0,
        $movedSteps >= 0 && $movedSteps < $track ? onlineAiLearningClamp(($track - $movedSteps) / $track, 0.0, 1.0) : 0.0,
        onlineAiLearningClamp($nearestDistance / $track, 0.0, 1.0),
        onlineAiLearningClamp($averageDistance / $track, 0.0, 1.0),
        $threatsBefore['count'],
        $threatsAfter['count'],
        $finishProbability,
        $deployProbability,
        count($opponents) ? $activeOpponents / (count($opponents) * 4) : 0.0,
        onlineAiLearningClamp(($bestOpponent - $afterPips) / ($track * 4)),
        onlineAiLearningClamp(($farthestOpponent - $afterPips) / ($track * 4)),
        count(array_filter($simulation['players'], static fn(array $p): bool => empty($p['finished'])) ) / $playerCount,
        onlineAiLearningClamp(($playerCount - 2) / 6, 0.0, 1.0),
        onlineAiLearningClamp($track / 80, 0.0, 1.0),
        onlineAiLearningRouteSpread($simulation, $playerId),
        $clusterPairs / 6
    ];
    if (count($base) !== 44) {
        throw new RuntimeException('Online AI vytvořila neplatný počet základních vlastností.');
    }
    $features = $base;
    for ($left = 0; $left < 44; $left++) {
        for ($right = $left + 1; $right < 44; $right++) {
            $features[] = $base[$left] * $base[$right];
        }
    }
    $triples = [
        [4, 15, 16], [4, 2, 14], [12, 11, 24], [3, 6, 22], [5, 33, 12],
        [1, 28, 34], [20, 4, 9], [21, 10, 0], [18, 23, 17], [42, 7, 43]
    ];
    foreach ($triples as [$a, $b, $c]) $features[] = $base[$a] * $base[$b] * $base[$c];
    if (count($features) !== 1000) throw new RuntimeException('Online AI musí mít přesně 1000 základních parametrů.');
    return ['base' => $base, 'features' => $features, 'simulation' => $simulation, 'transition' => $transition];
}

function onlineAiLearningBucket(float $value): string
{
    $magnitude = min(4, (int) floor(abs($value) * 5));
    return ($value < 0 ? 'n' : 'p') . $magnitude;
}

function onlineAiLearningDynamicPatterns(array $base): array
{
    $active = [];
    foreach ($base as $index => $value) {
        $strength = abs((float) $value);
        if ($strength >= 0.08) $active[] = ['index' => $index, 'value' => (float) $value, 'strength' => $strength];
    }
    usort($active, static fn(array $a, array $b): int => $b['strength'] <=> $a['strength']);
    $active = array_slice($active, 0, 9);
    $candidates = [];
    $names = onlineAiLearningBaseNames();
    for ($left = 0; $left < count($active); $left++) {
        for ($right = $left + 1; $right < count($active); $right++) {
            $a = $active[$left];
            $b = $active[$right];
            $candidates[] = [
                'key' => 'd1:' . $a['index'] . ':' . onlineAiLearningBucket($a['value']) . ':' . $b['index'] . ':' . onlineAiLearningBucket($b['value']),
                'value' => 1.0,
                'strength' => $a['strength'] * $b['strength'],
                'featureNames' => [$names[$a['index']], $names[$b['index']]],
            ];
        }
    }
    usort($candidates, static fn(array $a, array $b): int => $b['strength'] <=> $a['strength']);
    return array_slice($candidates, 0, 8);
}

function onlineAiLearningSoftmax(array $scores, float $temperature): array
{
    if ($scores === []) return [];
    $temperature = max(0.04, $temperature);
    $max = max($scores);
    $values = [];
    foreach ($scores as $score) $values[] = exp(max(-40.0, min(0.0, ($score - $max) / $temperature)));
    $sum = array_sum($values);
    return array_map(static fn(float $value): float => $sum > 0 ? $value / $sum : 1 / count($values), $values);
}

function onlineAiMctsAdvanceToDecision(array &$state, int $maxChanceRolls = 80): void
{
    $chanceRolls = 0;
    while (($state['winner'] ?? null) === null && $chanceRolls < $maxChanceRolls) {
        if (($state['phase'] ?? '') === 'move' || ($state['phase'] ?? '') === 'finished') return;
        if (($state['phase'] ?? '') === 'no-move') {
            onlineEngineAdvanceTurn($state);
            continue;
        }
        if (($state['phase'] ?? '') !== 'roll') return;
        onlineEngineRollDice($state, static fn(): int => random_int(1, 6));
        $chanceRolls++;
        if (($state['phase'] ?? '') === 'no-move') onlineEngineAdvanceTurn($state);
    }
}

function onlineAiMctsRewardVector(array $state): array
{
    $count = count($state['players']);
    if (($state['winner'] ?? null) !== null) {
        return array_map(static fn(int $id): float => $id === (int) $state['winner'] ? 1.0 : 0.0, range(0, $count - 1));
    }
    $pips = [];
    foreach ($state['players'] as $player) $pips[] = onlineAiLearningPips($state, (int) $player['id']);
    $minimum = min($pips);
    $average = array_sum($pips) / max(1, count($pips));
    $temperature = max(8.0, 1.24 * sqrt(max(1.0, $average)));
    $weights = array_map(static fn(float $value): float => exp(-($value - $minimum) / $temperature), $pips);
    $total = array_sum($weights);
    return array_map(static fn(float $value): float => $total > 0 ? $value / $total : 1 / max(1, $count), $weights);
}

function onlineAiMctsRolloutMove(array $state): ?int
{
    $valid = onlineEngineValidMoves($state);
    if ($valid === []) return null;
    $playerId = (int) $state['currentPlayer'];
    $bestScore = INF;
    $best = [];
    foreach ($valid as $pieceId) {
        $next = $state;
        onlineEngineMovePiece($next, (int) $pieceId);
        if (($next['winner'] ?? null) === $playerId) return (int) $pieceId;
        $ownPips = onlineAiLearningPips($next, $playerId);
        $opponents = [];
        foreach ($next['players'] as $opponent) {
            $id = (int) $opponent['id'];
            if ($id === $playerId || !empty($opponent['finished'])) continue;
            $opponents[] = onlineAiLearningPips($next, $id);
        }
        $opponentAverage = $opponents ? array_sum($opponents) / count($opponents) : $ownPips;
        $score = $ownPips - $opponentAverage * 0.18;
        if ($score < $bestScore - 1e-9) {
            $bestScore = $score;
            $best = [(int) $pieceId];
        } elseif (abs($score - $bestScore) <= 1e-9) {
            $best[] = (int) $pieceId;
        }
    }
    return $best ? $best[random_int(0, count($best) - 1)] : null;
}

function onlineAiMctsRollout(array $state, int $maxTurns): array
{
    $turns = 0;
    while (($state['winner'] ?? null) === null && $turns < $maxTurns) {
        if (($state['phase'] ?? '') === 'roll') {
            $beforePlayer = (int) $state['currentPlayer'];
            onlineEngineRollDice($state, static fn(): int => random_int(1, 6));
            if (($state['phase'] ?? '') === 'no-move') onlineEngineAdvanceTurn($state);
            if ((int) $state['currentPlayer'] !== $beforePlayer) $turns++;
            continue;
        }
        if (($state['phase'] ?? '') === 'no-move') {
            onlineEngineAdvanceTurn($state);
            $turns++;
            continue;
        }
        if (($state['phase'] ?? '') === 'move') {
            $beforePlayer = (int) $state['currentPlayer'];
            $pieceId = onlineAiMctsRolloutMove($state);
            if ($pieceId === null) {
                onlineEngineAdvanceTurn($state);
                $turns++;
            } else {
                onlineEngineMovePiece($state, $pieceId);
                if ((int) $state['currentPlayer'] !== $beforePlayer) $turns++;
            }
            continue;
        }
        break;
    }
    return onlineAiMctsRewardVector($state);
}

function onlineAiMctsSelectChild(object $node, float $exploration): ?object
{
    $logParent = log(max(1, (int) $node->visits));
    $best = null;
    $bestScore = -INF;
    foreach ($node->children as $child) {
        if ($child->visits === 0) return $child;
        $exploitation = $child->valueSums[$node->playerId] / $child->visits;
        $bonus = $exploration * sqrt($logParent / $child->visits);
        $score = $exploitation + $bonus;
        if ($score > $bestScore) {
            $bestScore = $score;
            $best = $child;
        }
    }
    return $best;
}

function onlineAiLearningMctsTeacher(array $game, int $simulations = 12, int $maxTurns = 80): array
{
    $valid = onlineEngineValidMoves($game);
    if ($valid === []) return ['ranked' => [], 'simulations' => 0];
    $count = count($game['players']);
    $root = (object) [
        'state' => $game,
        'playerId' => (int) $game['currentPlayer'],
        'visits' => 0,
        'valueSums' => array_fill(0, $count, 0.0),
        'children' => [],
        'unexpandedMoves' => array_values($valid),
        'parent' => null,
        'parentMove' => null,
    ];
    for ($iteration = 0; $iteration < $simulations; $iteration++) {
        $node = $root;
        $terminalState = null;
        while (true) {
            if (($node->state['winner'] ?? null) !== null) {
                $terminalState = $node->state;
                break;
            }
            if ($node->unexpandedMoves === null) {
                $node->unexpandedMoves = onlineEngineValidMoves($node->state);
            }
            if ($node->unexpandedMoves !== []) {
                $choiceIndex = random_int(0, count($node->unexpandedMoves) - 1);
                $pieceId = $node->unexpandedMoves[$choiceIndex];
                array_splice($node->unexpandedMoves, $choiceIndex, 1);
                $next = $node->state;
                onlineEngineMovePiece($next, (int) $pieceId);
                onlineAiMctsAdvanceToDecision($next);
                $child = (object) [
                    'state' => $next,
                    'playerId' => (int) $next['currentPlayer'],
                    'visits' => 0,
                    'valueSums' => array_fill(0, $count, 0.0),
                    'children' => [],
                    'unexpandedMoves' => null,
                    'parent' => $node,
                    'parentMove' => (int) $pieceId,
                ];
                $node->children[] = $child;
                $node = $child;
                $terminalState = $next;
                break;
            }
            if ($node->children === []) {
                $terminalState = $node->state;
                break;
            }
            $node = onlineAiMctsSelectChild($node, 1.41421356237);
            if ($node === null) {
                $terminalState = $root->state;
                break;
            }
        }
        if ($terminalState !== null && ($terminalState['winner'] ?? null) !== null) {
            $rewards = onlineAiMctsRewardVector($terminalState);
        } else {
            $rewards = onlineAiMctsRollout($terminalState ?? $node->state, $maxTurns);
        }
        $backprop = $node;
        while ($backprop !== null) {
            $backprop->visits++;
            foreach ($rewards as $playerId => $value) $backprop->valueSums[$playerId] += $value;
            $backprop = $backprop->parent;
        }
    }
    $ranked = [];
    foreach ($root->children as $child) {
        $ranked[] = [
            'pieceId' => (int) $child->parentMove,
            'visits' => (int) $child->visits,
            'score' => $child->visits > 0 ? $child->valueSums[$root->playerId] / $child->visits : 0.0,
        ];
    }
    usort($ranked, static fn(array $a, array $b): int =>
        ($b['visits'] <=> $a['visits']) ?: ($b['score'] <=> $a['score'])
    );
    return ['ranked' => $ranked, 'simulations' => $simulations];
}

function onlineAiLearningDecision(array $game, array &$model): array
{
    $valid = onlineEngineValidMoves($game);
    if ($valid === []) return ['pieceId' => null, 'learning' => null];
    $playerId = (int) $game['currentPlayer'];
    $player = $game['players'][$playerId];
    $track = (int) $game['trackLength'];
    $rawScores = [];
    $simulations = [];
    foreach ($valid as $pieceId) {
        $piece = $game['pieces'][$playerId]['pieces'][$pieceId];
        $nextSteps = (int) $piece['steps'] < 0 ? 0 : (int) $piece['steps'] + (int) $game['diceValue'];
        $destination = $nextSteps < $track ? (((int) $player['start']) + $nextSteps) % $track : null;
        $score = $nextSteps;
        if ((int) $piece['steps'] < 0) $score += 18;
        if ($nextSteps === $track + 3) $score += 1000;
        if ($destination !== null) {
            foreach ($game['pieces'] as $enemyId => $group) {
                if ((int) $enemyId === $playerId) continue;
                foreach ($group['pieces'] as $enemyPiece) {
                    $enemySteps = (int) $enemyPiece['steps'];
                    if ($enemySteps >= 0 && $enemySteps < $track
                        && onlineEnginePiecePosition($game, (int) $enemyId, $enemyPiece) === $destination) $score += 90;
                }
            }
        }
        $rawScores[] = (float) $score;
        $simulations[] = (int) $pieceId;
    }
    $scoreMin = min($rawScores);
    $scoreMax = max($rawScores);
    $heuristicBestIndex = array_search(max($rawScores), $rawScores, true);
    $heuristicBestPiece = $simulations[$heuristicBestIndex === false ? 0 : $heuristicBestIndex];
    $actions = [];
    foreach ($simulations as $index => $pieceId) {
        $extracted = onlineAiLearningActionFeatures($game, $pieceId, $rawScores[$index], $scoreMin, $scoreMax);
        $actions[] = [
            'pieceId' => $pieceId,
            'teacherScore' => $rawScores[$index],
            'features' => $extracted['features'],
            'dynamicFeatures' => onlineAiLearningDynamicPatterns($extracted['base']),
        ];
    }

    $weights = $model['weights'] ?? [];
    if (!is_array($weights) || count($weights) !== 1000) $weights = array_fill(0, 1000, 0.0);
    $model['weights'] = array_map(static fn($v): float => onlineAiLearningClamp((float) $v, -5.0, 5.0), $weights);
    $model['version'] = 3;
    $model['featureSchema'] = ['version' => 3, 'baseFeatures' => 44, 'pairwiseFeatures' => 946, 'tripleFeatures' => 10, 'totalFeatures' => 1000];
    $model['dynamicParameters'] = is_array($model['dynamicParameters'] ?? null) ? $model['dynamicParameters'] : [];
    $byKey = [];
    $byId = [];
    $maxId = 1000;
    foreach ($model['dynamicParameters'] as $index => &$parameter) {
        $parameter['id'] = max(1001, (int) ($parameter['id'] ?? (1001 + $index)));
        $parameter['weight'] = onlineAiLearningClamp((float) ($parameter['weight'] ?? 0), -5.0, 5.0);
        $parameter['visits'] = max(0, (int) ($parameter['visits'] ?? 0));
        $parameter['teacherSupport'] = max(0, (int) ($parameter['teacherSupport'] ?? 0));
        $parameter['teacherRejects'] = max(0, (int) ($parameter['teacherRejects'] ?? 0));
        $byKey[$parameter['key']] = $parameter;
        $byId[$parameter['id']] = $parameter;
        $maxId = max($maxId, $parameter['id']);
    }
    unset($parameter);

    $newParameters = [];
    foreach ($actions as &$action) {
        foreach ($action['dynamicFeatures'] as &$feature) {
            $key = $feature['key'];
            if (!isset($byKey[$key]) && count($model['dynamicParameters']) < 50000) {
                $parameter = [
                    'id' => ++$maxId,
                    'key' => $key,
                    'featureNames' => $feature['featureNames'],
                    'weight' => 0.0,
                    'visits' => 0,
                    'teacherSupport' => 0,
                    'teacherRejects' => 0,
                    'createdGeneration' => (int) ($model['generation'] ?? 0),
                    'lastUpdatedGeneration' => (int) ($model['generation'] ?? 0),
                ];
                $model['dynamicParameters'][] = $parameter;
                $byKey[$key] = $parameter;
                $byId[$parameter['id']] = $parameter;
                $newParameters[] = ['id' => $parameter['id'], 'key' => $key, 'featureNames' => $feature['featureNames']];
            }
            $feature['id'] = $byKey[$key]['id'] ?? null;
        }
        unset($feature);
    }
    unset($action);

    $teacher = onlineAiLearningMctsTeacher($game, 8, 40);
    $teacherVisits = [];
    foreach ($teacher['ranked'] as $rankedTeacherMove) {
        $teacherVisits[(int) $rankedTeacherMove['pieceId']] = (int) $rankedTeacherMove['visits'];
    }
    $visitTotal = array_sum($teacherVisits);
    $teacherProbabilities = $visitTotal > 0
        ? array_map(static fn(array $action): float => ($teacherVisits[$action['pieceId']] ?? 0) / $visitTotal, $actions)
        : onlineAiLearningSoftmax($rawScores, max(8.0, ($scoreMax - $scoreMin) * 0.22));
    $temperature = (float) ($model['temperature'] ?? 0.22);
    $studentLogits = [];
    foreach ($actions as $action) {
        $score = 0.0;
        foreach ($action['features'] as $index => $value) $score += $value * $model['weights'][$index];
        foreach ($action['dynamicFeatures'] as $feature) {
            if ($feature['id'] !== null && isset($byId[$feature['id']])) {
                $score += $feature['value'] * $byId[$feature['id']]['weight'];
            }
        }
        $studentLogits[] = $score;
    }
    $studentProbabilities = onlineAiLearningSoftmax($studentLogits, $temperature);
    $loss = 0.0;
    $fixedGradient = array_fill(0, 1000, 0.0);
    $dynamicGradient = [];
    foreach ($actions as $actionIndex => $action) {
        $target = $teacherProbabilities[$actionIndex];
        $predicted = max(PHP_FLOAT_EPSILON, $studentProbabilities[$actionIndex]);
        if ($target > 0) $loss -= $target * log($predicted);
        $coefficient = ($target - $studentProbabilities[$actionIndex]) / $temperature;
        foreach ($action['features'] as $index => $value) {
            $fixedGradient[$index] += $coefficient * $value;
        }
        foreach ($action['dynamicFeatures'] as $feature) {
            $id = $feature['id'];
            if ($id === null) continue;
            $dynamicGradient[$id] = ($dynamicGradient[$id] ?? 0.0) + $coefficient * $feature['value'];
            foreach ($model['dynamicParameters'] as &$parameter) {
                if ((int) $parameter['id'] !== (int) $id) continue;
                $parameter['visits']++;
                if ($target > $studentProbabilities[$actionIndex]) $parameter['teacherSupport']++;
                elseif ($target < $studentProbabilities[$actionIndex]) $parameter['teacherRejects']++;
                break;
            }
            unset($parameter);
        }
    }

    $learningRate = max(0.001, min(0.2, (float) ($model['learningRate'] ?? 0.02)));
    $regularization = 0.0005;
    $changedParameters = 0;
    foreach ($model['weights'] as $index => $weight) {
        $update = $fixedGradient[$index] - $regularization * $weight;
        $model['weights'][$index] = onlineAiLearningClamp($weight + $learningRate * $update, -5.0, 5.0);
    }
    foreach ($model['dynamicParameters'] as &$parameter) {
        $id = (int) $parameter['id'];
        $gradient = $dynamicGradient[$id] ?? 0.0;
        if ($gradient !== 0.0) {
            $oldWeight = (float) $parameter['weight'];
            $parameter['weight'] = onlineAiLearningClamp(
                $oldWeight + $learningRate * ($gradient - $regularization * $oldWeight), -5.0, 5.0
            );
            $parameter['lastUpdatedGeneration'] = (int) ($model['generation'] ?? 0) + 1;
            if (abs($parameter['weight'] - $oldWeight) > 1e-9) $changedParameters++;
        }
    }
    unset($parameter);
    $model['decisionsTrained'] = (int) ($model['decisionsTrained'] ?? 0) + 1;
    $model['generation'] = (int) ($model['generation'] ?? 0) + 1;

    // Přepočet naučené politiky po aktualizaci vah; její vliv je omezený,
    // aby počáteční model nepřebil stávající bezpečnou strategii.
    $updatedById = [];
    foreach ($model['dynamicParameters'] as $parameter) $updatedById[(int) $parameter['id']] = (float) $parameter['weight'];
    $updatedLogits = [];
    foreach ($actions as $action) {
        $score = 0.0;
        foreach ($action['features'] as $index => $value) $score += $value * $model['weights'][$index];
        foreach ($action['dynamicFeatures'] as $feature) {
            if ($feature['id'] !== null) $score += $feature['value'] * ($updatedById[$feature['id']] ?? 0.0);
        }
        $updatedLogits[] = $score;
    }
    $updatedProbabilities = onlineAiLearningSoftmax($updatedLogits, $temperature);
    $count = count($actions);
    $ranked = [];
    foreach ($actions as $index => $action) {
        $strategic = $scoreMax > $scoreMin
            ? ($action['teacherScore'] - $scoreMin) / ($scoreMax - $scoreMin) : 0.5;
        $policy = $updatedProbabilities[$index] * $count;
        $ranked[] = [
            'pieceId' => $action['pieceId'],
            'combinedScore' => $strategic * 0.88 + $policy * 0.12,
            'policyProbability' => $updatedProbabilities[$index],
        ];
    }
    usort($ranked, static fn(array $a, array $b): int =>
        ($b['combinedScore'] <=> $a['combinedScore']) ?: ($a['pieceId'] <=> $b['pieceId'])
    );
    $selected = $ranked[0];

    return [
        'pieceId' => (int) $selected['pieceId'],
        'learning' => [
            'decisionsTrained' => (int) $model['decisionsTrained'],
            'generation' => (int) $model['generation'],
            'newParameterCount' => count($newParameters),
            'newParameters' => array_map(static fn(array $item): array => [
                'id' => $item['id'],
                'featureNames' => $item['featureNames'],
            ], array_slice($newParameters, 0, 8)),
            'dynamicParameterCount' => count($model['dynamicParameters']),
            'totalParameters' => 1000 + count($model['dynamicParameters']),
            'changedParameters' => $changedParameters,
            'averageCrossEntropy' => count($actions) ? $loss : 0.0,
            'teacherSimulations' => (int) ($teacher['simulations'] ?? 0),
            'policyInfluencedChoice' => (int) $selected['pieceId'] !== (int) $heuristicBestPiece,
        ],
    ];
}

function onlineAiLearningCompleteGame(PDO $db, int $gameId, array $currentActionResult = []): ?array
{
    $stmt = $db->prepare(
        'SELECT action_json FROM ' . onlineTable('game_moves') .
        ' WHERE game_id = ? AND action_type = \'move\' ORDER BY id'
    );
    $stmt->execute([$gameId]);
    $decisions = [];
    foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $json) {
        $action = is_string($json) ? json_decode($json, true) : null;
        if (is_array($action) && is_array($action['aiLearning'] ?? null)) {
            $decisions[] = $action['aiLearning'];
        }
    }
    if (is_array($currentActionResult['aiLearning'] ?? null)) {
        $decisions[] = $currentActionResult['aiLearning'];
    }
    if ($decisions === []) return null;

    $first = $decisions[0];
    $last = $decisions[count($decisions) - 1];
    $newParameters = array_sum(array_map(
        static fn(array $item): int => max(0, (int) ($item['newParameterCount'] ?? 0)),
        $decisions
    ));
    $changedParameters = array_sum(array_map(
        static fn(array $item): int => max(0, (int) ($item['changedParameters'] ?? 0)),
        $decisions
    ));
    $lossValues = array_values(array_filter(array_map(
        static fn(array $item): float => max(0.0, (float) ($item['averageCrossEntropy'] ?? 0)),
        $decisions
    ), static fn(float $value): bool => is_finite($value)));
    $summary = [
        'parametersAtStart' => max(1000, (int) ($first['totalParameters'] ?? 1000) - (int) ($first['newParameterCount'] ?? 0)),
        'newParameters' => $newParameters,
        'parametersAtEnd' => (int) ($last['totalParameters'] ?? 1000),
        'decisions' => count($decisions),
        'changedParameters' => $changedParameters,
        'averageCrossEntropy' => $lossValues ? array_sum($lossValues) / count($lossValues) : 0.0,
    ];

    $modelStmt = $db->query('SELECT model_json FROM ' . onlineTable('ai_learning_model') . ' WHERE id = 1 FOR UPDATE');
    $modelJson = $modelStmt->fetchColumn();
    $model = is_string($modelJson) ? json_decode($modelJson, true) : null;
    if (is_array($model)) {
        $model['gamesTrained'] = (int) ($model['gamesTrained'] ?? 0) + 1;
        $db->prepare(
            'UPDATE ' . onlineTable('ai_learning_model') . ' SET model_json = ?, generation = ? WHERE id = 1'
        )->execute([
            json_encode($model, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
            (int) ($model['generation'] ?? 0),
        ]);
        $summary['gamesTrained'] = (int) $model['gamesTrained'];
    }
    return $summary;
}

function onlineAiLearningEnsureSchema(PDO $db): void
{
    $db->exec(
        'CREATE TABLE IF NOT EXISTS ' . onlineTable('ai_learning_model') . ' (
            id TINYINT UNSIGNED NOT NULL,
            model_json JSON NOT NULL,
            generation BIGINT UNSIGNED NOT NULL DEFAULT 0,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $initial = json_encode(onlineAiLearningDefaultModel(), JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    $stmt = $db->prepare('INSERT IGNORE INTO ' . onlineTable('ai_learning_model') . ' (id, model_json, generation) VALUES (1, ?, 0)');
    $stmt->execute([$initial]);
    $migration = $db->prepare(
        'INSERT INTO ' . onlineTable('schema_migrations') . ' (version, name) VALUES (3, ?) ' .
        'ON DUPLICATE KEY UPDATE name = VALUES(name)'
    );
    $migration->execute(['global_online_ai_learning_model']);
}

function onlineAiLearningChooseMove(PDO $db, array $game): array
{
    $stmt = $db->query('SELECT model_json FROM ' . onlineTable('ai_learning_model') . ' WHERE id = 1 FOR UPDATE');
    $json = $stmt->fetchColumn();
    $model = is_string($json) ? json_decode($json, true) : null;
    if (!is_array($model) || count($model['weights'] ?? []) !== 1000) $model = onlineAiLearningDefaultModel();

    $decision = onlineAiLearningDecision($game, $model);
    $stmt = $db->prepare('UPDATE ' . onlineTable('ai_learning_model') . ' SET model_json = ?, generation = ? WHERE id = 1');
    $stmt->execute([
        json_encode($model, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR),
        (int) ($model['generation'] ?? 0),
    ]);
    return $decision;
}
