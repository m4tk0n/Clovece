<?php
declare(strict_types=1);

/**
 * Serverový herní engine.
 * Logika odpovídá js/game-engine.js; server je autoritou pro online tahy.
 */

function onlineEngineBoardConfigs(): array
{
    return [
        40 => ['trackLength' => 40, 'slotCount' => 4],
        48 => ['trackLength' => 48, 'slotCount' => 6],
        80 => ['trackLength' => 80, 'slotCount' => 8],
    ];
}

function onlineEngineAvailableBoardSizes(int $playerCount): array
{
    if ($playerCount < 2 || $playerCount > 8) {
        return [];
    }
    return array_values(array_map(
        'intval',
        array_keys(array_filter(
            onlineEngineBoardConfigs(),
            static fn(array $config): bool => $playerCount <= $config['slotCount']
        ))
    ));
}

function onlineEngineCreateState(array $participants, ?int $boardSize = null): array
{
    $total = count($participants);
    if ($total < 2 || $total > 8) {
        throw new InvalidArgumentException('Hra vyžaduje 2 až 8 živých hráčů.');
    }

    usort($participants, static fn(array $a, array $b): int =>
        (int) $a['player_index'] <=> (int) $b['player_index']
    );

    $configs = onlineEngineBoardConfigs();
    $availableBoardSizes = onlineEngineAvailableBoardSizes($total);
    $effectiveBoardSize = $boardSize ?? $availableBoardSizes[0];
    $selectedBoard = $configs[$effectiveBoardSize] ?? null;
    if ($selectedBoard === null || !in_array($effectiveBoardSize, $availableBoardSizes, true)) {
        throw new InvalidArgumentException('Zvolená velikost desky není pro tento počet hráčů dostupná.');
    }

    $trackLength = $selectedBoard['trackLength'];
    $slotCount = $selectedBoard['slotCount'];

    $players = [];
    foreach ($participants as $index => $participant) {
        $slot = (int) floor(($index * $slotCount / $total) + 0.5);
        $start = (int) ($slot * ($trackLength / $slotCount));

        $players[] = [
            'id' => $index,
            'slot' => $slot,
            'name' => (string) $participant['display_name'],
            'color' => (string) $participant['color'],
            'isAI' => (($participant['player_type'] ?? 'human') === 'ai'),
            'start' => $start,
            'finished' => false,
        ];
    }

    $pieces = [];
    foreach ($players as $index => $_player) {
        $playerPieces = [];
        for ($pieceId = 0; $pieceId < 4; $pieceId++) {
            $playerPieces[] = ['id' => $pieceId, 'steps' => -1];
        }
        $pieces[] = ['playerId' => $index, 'pieces' => $playerPieces];
    }

    return [
        'players' => $players,
        'trackLength' => $trackLength,
        'boardSize' => $trackLength,
        'slotCount' => $slotCount,
        'currentPlayer' => 0,
        'startRolls' => [[]],
        'startCandidates' => array_keys($players),
        'startWinner' => null,
        'diceValue' => 0,
        'baseRollAttempts' => 0,
        'thirdAttemptSix' => false,
        'phase' => 'start-roll',
        'turnNumber' => 1,
        'winner' => null,
        'lastMove' => null,
        'pieces' => $pieces,
    ];
}

/**
 * Serverový rozstřel. Pořadí hráčů zůstává zachováno, začíná pouze vítěz.
 *
 * @param callable|null $rollFn Testovací generátor hodů; v produkci random_int().
 */
function onlineEngineDetermineStartingPlayer(array &$game, ?callable $rollFn = null): array
{
    $rollFn ??= static fn(): int => random_int(1, 6);
    $candidates = array_keys($game['players']);
    $rounds = [];

    while (count($candidates) > 1) {
        $rolls = [];
        foreach ($candidates as $playerId) {
            $value = (int) $rollFn($playerId, count($rounds));
            if ($value < 1 || $value > 6) {
                throw new InvalidArgumentException('Hod rozstřelu musí být číslo od 1 do 6.');
            }
            $rolls[] = ['playerId' => (int) $playerId, 'value' => $value];
        }

        $rounds[] = $rolls;
        $highest = max(array_column($rolls, 'value'));
        $candidates = array_values(array_map(
            static fn(array $roll): int => (int) $roll['playerId'],
            array_filter($rolls, static fn(array $roll): bool => (int) $roll['value'] === $highest)
        ));
    }

    $game['currentPlayer'] = $candidates[0];
    $game['startRolls'] = $rounds;

    return ['playerId' => $candidates[0], 'rounds' => $rounds];
}

/**
 * Zaznamená jeden skutečně vyžádaný hod rozstřelu.
 * Lidský hráč akci spouští kliknutím; AI je obsloužena samostatně serverem.
 */
function onlineEngineRecordStartingRoll(array &$game, int $playerId, ?callable $rollFn = null): array
{
    if (($game['phase'] ?? '') !== 'start-roll') {
        throw new RuntimeException('Rozstřel právě neprobíhá.');
    }
    if ((int) ($game['currentPlayer'] ?? -1) !== $playerId) {
        throw new RuntimeException('Nyní hází jiný hráč.');
    }

    $rollFn ??= static fn(): int => random_int(1, 6);
    $value = (int) $rollFn($playerId, count($game['startRolls']) - 1);
    if ($value < 1 || $value > 6) {
        throw new InvalidArgumentException('Hod rozstřelu musí být číslo od 1 do 6.');
    }

    if (!isset($game['startRolls']) || $game['startRolls'] === []) {
        $game['startRolls'] = [[]];
    }
    $roundIndex = count($game['startRolls']) - 1;
    $game['startRolls'][$roundIndex][] = [
        'playerId' => $playerId,
        'value' => $value,
    ];
    $game['diceValue'] = $value;

    $candidates = array_values(array_map('intval', $game['startCandidates'] ?? []));
    $round = $game['startRolls'][$roundIndex];
    if (count($round) < count($candidates)) {
        $game['currentPlayer'] = $candidates[count($round)];
        return ['value' => $value, 'roundComplete' => false, 'finished' => false];
    }

    $highest = max(array_column($round, 'value'));
    $winners = array_values(array_map(
        static fn(array $roll): int => (int) $roll['playerId'],
        array_filter($round, static fn(array $roll): bool => (int) $roll['value'] === $highest)
    ));

    if (count($winners) === 1) {
        $game['currentPlayer'] = $winners[0];
        $game['startWinner'] = $winners[0];
        $game['startCandidates'] = [];
        $game['phase'] = 'roll';
        return ['value' => $value, 'roundComplete' => true, 'finished' => true];
    }

    $game['startCandidates'] = $winners;
    $game['startRolls'][] = [];
    $game['currentPlayer'] = $winners[0];
    return ['value' => $value, 'roundComplete' => true, 'finished' => false];
}

function onlineEnginePiecePosition(array $game, int $playerId, array $piece): ?int
{
    $steps = (int) $piece['steps'];
    if ($steps < 0 || $steps >= (int) $game['trackLength']) {
        return null;
    }
    return (((int) $game['players'][$playerId]['start']) + $steps) % (int) $game['trackLength'];
}

function onlineEngineValidMoves(array $game, ?int $playerId = null): array
{
    $playerId ??= (int) $game['currentPlayer'];
    if (($game['phase'] ?? '') !== 'move' || $playerId !== (int) $game['currentPlayer']) {
        return [];
    }

    $trackLength = (int) $game['trackLength'];
    $maxSteps = $trackLength + 3;
    $playerPieces = $game['pieces'][$playerId]['pieces'];
    $hasBasePiece = false;
    foreach ($playerPieces as $piece) {
        if ((int) $piece['steps'] === -1) {
            $hasBasePiece = true;
            break;
        }
    }

    $candidates = [];
    foreach ($playerPieces as $piece) {
        $pieceId = (int) $piece['id'];
        $steps = (int) $piece['steps'];
        if ($steps === $maxSteps) continue;
        if ($hasBasePiece && (int) $game['diceValue'] === 6 && $steps !== -1) continue;
        if ($steps === -1 && (int) $game['diceValue'] !== 6) continue;

        $nextSteps = $steps === -1 ? 0 : $steps + (int) $game['diceValue'];
        if ($nextSteps > $maxSteps) continue;

        $ownBlock = false;
        foreach ($playerPieces as $other) {
            if ($steps === -1) break;
            if ((int) $other['id'] === $pieceId) continue;
            $otherSteps = (int) $other['steps'];
            if ($otherSteps < 0) continue;

            if ($nextSteps < $trackLength) {
                if ($otherSteps < $trackLength
                    && onlineEnginePiecePosition($game, $playerId, $other)
                        === ((((int) $game['players'][$playerId]['start']) + $nextSteps) % $trackLength)) {
                    $ownBlock = true;
                    break;
                }
            } else {
                // V cílové dráze se nesmí přeskočit žádná vlastní figurka.
                $firstHomeStep = max($trackLength, $steps + 1);
                for ($step = $firstHomeStep; $step <= $nextSteps; $step++) {
                    if ($otherSteps === $step) {
                        $ownBlock = true;
                        break 2;
                    }
                }
            }
        }
        if (!$ownBlock) $candidates[] = $pieceId;
    }

    // Přesný a volný vstup do cílové dráhy je povinný.
    $forcedHomeEntries = [];
    foreach ($candidates as $pieceId) {
        $steps = (int) $playerPieces[$pieceId]['steps'];
        if ($steps >= 0 && $steps < $trackLength
            && $steps + (int) $game['diceValue'] >= $trackLength) {
            $forcedHomeEntries[] = $pieceId;
        }
    }
    return $forcedHomeEntries !== [] ? $forcedHomeEntries : $candidates;
}

function onlineEngineRollDice(array &$game, ?callable $rollFn = null): array
{
    if (($game['phase'] ?? '') !== 'roll' || ($game['winner'] ?? null) !== null) {
        throw new DomainException('Nyní nelze házet kostkou.');
    }

    $rollFn ??= static fn(): int => random_int(1, 6);
    $value = (int) $rollFn();
    if ($value < 1 || $value > 6) {
        throw new InvalidArgumentException('Hod kostkou musí být číslo od 1 do 6.');
    }
    $game['diceValue'] = $value;

    $playerId = (int) $game['currentPlayer'];
    $allAtBase = true;
    foreach ($game['pieces'][$playerId]['pieces'] as $piece) {
        if ((int) $piece['steps'] !== -1) {
            $allAtBase = false;
            break;
        }
    }

    if ($allAtBase) {
        if ($value !== 6) {
            $game['baseRollAttempts'] = (int) ($game['baseRollAttempts'] ?? 0) + 1;
            $retrying = $game['baseRollAttempts'] < 3;
            $game['phase'] = $retrying ? 'roll' : 'no-move';
            return [
                'value' => $value,
                'validMoves' => [],
                'retrying' => $retrying,
                'attempt' => $game['baseRollAttempts'],
                'maxAttempts' => 3,
            ];
        }

        $game['baseRollAttempts'] = (int) ($game['baseRollAttempts'] ?? 0) + 1;
        $game['thirdAttemptSix'] = $game['baseRollAttempts'] === 3;
    } else {
        $game['baseRollAttempts'] = 0;
        $game['thirdAttemptSix'] = false;
    }

    $game['phase'] = 'move';
    $moves = onlineEngineValidMoves($game);
    if ($moves === []) {
        if ($value === 6) {
            $game['phase'] = 'roll';
            $game['baseRollAttempts'] = 0;
            $game['thirdAttemptSix'] = false;
            return ['value' => $value, 'validMoves' => [], 'retrying' => true];
        }
        $game['phase'] = 'no-move';
    }

    return [
        'value' => $value,
        'validMoves' => $moves,
        'retrying' => false,
        'attempt' => $allAtBase ? $game['baseRollAttempts'] : null,
        'maxAttempts' => $allAtBase ? 3 : null,
    ];
}

function onlineEngineAdvanceTurn(array &$game): void
{
    if (($game['winner'] ?? null) !== null) {
        return;
    }

    $next = (int) $game['currentPlayer'];
    $count = count($game['players']);
    for ($attempt = 0; $attempt < $count; $attempt++) {
        $next = ($next + 1) % $count;
        if (empty($game['players'][$next]['finished'])) {
            break;
        }
    }

    $game['currentPlayer'] = $next;
    $game['diceValue'] = 0;
    $game['baseRollAttempts'] = 0;
    $game['phase'] = 'roll';
    $game['turnNumber'] = (int) $game['turnNumber'] + 1;
}

function onlineEngineMovePiece(array &$game, int $pieceId): array
{
    $valid = onlineEngineValidMoves($game);
    if (!in_array($pieceId, $valid, true)) {
        throw new DomainException('Tuto figurku nyní nelze táhnout.');
    }

    $playerId = (int) $game['currentPlayer'];
    $player = $game['players'][$playerId];
    $fromSteps = (int) $game['pieces'][$playerId]['pieces'][$pieceId]['steps'];
    $diceValue = (int) $game['diceValue'];
    $nextSteps = $fromSteps === -1 ? 0 : $fromSteps + $diceValue;
    $captured = null;

    if ($fromSteps === -1) {
        // Nasazení na vlastní obsazený start vrací dosavadní figurku do základny.
        foreach ($game['pieces'][$playerId]['pieces'] as &$ownPiece) {
            if ((int) $ownPiece['id'] === $pieceId) continue;
            $ownSteps = (int) $ownPiece['steps'];
            if ($ownSteps >= 0 && $ownSteps < (int) $game['trackLength']
                && onlineEnginePiecePosition($game, $playerId, $ownPiece) === (int) $player['start']) {
                $captured = [
                    'playerId' => $playerId,
                    'pieceId' => (int) $ownPiece['id'],
                    'playerName' => (string) $player['name'],
                    'color' => (string) $player['color'],
                    'ownPiece' => true,
                ];
                $ownPiece['steps'] = -1;
            }
        }
        unset($ownPiece);
    }

    if ($nextSteps < (int) $game['trackLength']) {
        $destination = (((int) $player['start']) + $nextSteps) % (int) $game['trackLength'];
        foreach ($game['pieces'] as $enemyId => &$group) {
            if ((int) $enemyId === $playerId) continue;
            foreach ($group['pieces'] as &$enemyPiece) {
                $enemySteps = (int) $enemyPiece['steps'];
                if ($enemySteps >= 0 && $enemySteps < (int) $game['trackLength']
                    && onlineEnginePiecePosition($game, (int) $enemyId, $enemyPiece) === $destination) {
                    $captured = [
                        'playerId' => (int) $enemyId,
                        'pieceId' => (int) $enemyPiece['id'],
                        'playerName' => (string) $game['players'][$enemyId]['name'],
                        'color' => (string) $game['players'][$enemyId]['color'],
                    ];
                    $enemyPiece['steps'] = -1;
                }
            }
            unset($enemyPiece);
        }
        unset($group);
    }

    $game['pieces'][$playerId]['pieces'][$pieceId]['steps'] = $nextSteps;
    $maxSteps = (int) $game['trackLength'] + 3;
    $finishedNow = $nextSteps === $maxSteps;
    $playerFinished = true;
    $homeSteps = [];
    foreach ($game['pieces'][$playerId]['pieces'] as $item) {
        $itemSteps = (int) $item['steps'];
        if ($itemSteps < (int) $game['trackLength'] || $itemSteps > $maxSteps) {
            $playerFinished = false;
            break;
        }
        $homeSteps[] = $itemSteps;
    }
    $playerFinished = $playerFinished && count(array_unique($homeSteps)) === 4;

    if ($playerFinished) {
        $game['players'][$playerId]['finished'] = true;
        $game['winner'] = $playerId;
        $game['phase'] = 'finished';
    } elseif (!empty($game['thirdAttemptSix'])) {
        $game['thirdAttemptSix'] = false;
        onlineEngineAdvanceTurn($game);
    } elseif ($diceValue === 6) {
        $game['baseRollAttempts'] = 0;
        $game['phase'] = 'roll';
    } else {
        onlineEngineAdvanceTurn($game);
    }

    $move = [
        'playerId' => $playerId,
        'playerName' => (string) $player['name'],
        'pieceId' => $pieceId,
        'deployed' => $fromSteps === -1,
        'captured' => $captured,
        'finishedNow' => $finishedNow,
        'diceValue' => $diceValue,
    ];
    $game['lastMove'] = $move;
    return $move;
}

/**
 * Pevná serverová strategie AI. Legální tahy vždy dodává herní engine;
 * tato funkce pouze simuluje a boduje jejich následky.
 */
function onlineEngineAiPips(array $game, int $playerId): float
{
    $track = (int) $game['trackLength'];
    $maxSteps = $track + 3;
    $active = 0;
    foreach ($game['pieces'][$playerId]['pieces'] as $piece) {
        $steps = (int) $piece['steps'];
        if ($steps >= 0 && $steps < $track) $active++;
    }

    $pips = 0.0;
    foreach ($game['pieces'][$playerId]['pieces'] as $piece) {
        $steps = (int) $piece['steps'];
        if ($steps < 0) {
            $pips += $maxSteps + 3;
        } elseif ($steps < $track) {
            $pips += $maxSteps - $steps;
        } else {
            $pips += max(0, $maxSteps - $steps);
        }
    }
    return $pips;
}

function onlineEngineAiThreatLoss(array $game, int $playerId): float
{
    $track = (int) $game['trackLength'];
    $loss = 0.0;
    foreach ($game['pieces'][$playerId]['pieces'] as $piece) {
        $steps = (int) $piece['steps'];
        if ($steps < 0 || $steps >= $track) continue;
        $target = onlineEnginePiecePosition($game, $playerId, $piece);
        if ($target === null) continue;
        $survival = 1.0;
        foreach ($game['pieces'] as $enemyId => $group) {
            if ((int) $enemyId === $playerId) continue;
            foreach ($group['pieces'] as $enemyPiece) {
                $enemySteps = (int) $enemyPiece['steps'];
                if ($enemySteps < 0 || $enemySteps >= $track) continue;
                $enemyPosition = onlineEnginePiecePosition($game, (int) $enemyId, $enemyPiece);
                if ($enemyPosition === null) continue;
                $distance = ($target - $enemyPosition + $track) % $track;
                if ($distance >= 1 && $distance <= 6) $survival *= (5.0 / 6.0);
            }
        }
        $hitProbability = 1.0 - $survival;
        $pieceValue = max(1, $track + 3 - $steps);
        $loss += $hitProbability * $pieceValue;
    }
    return $loss;
}

/**
 * Načte společné taktické váhy vytvořené tréninkem AI.
 * JSON je jediný zdroj pravdy pro serverovou PHP strategii.
 */
function onlineEngineAiTacticalWeights(): array
{
    static $weights = null;
    if ($weights !== null) return $weights;
    $weights = [
        'progressToGoal' => 2.0,
        'finishPiece' => 80.0,
        'captureOpponent' => 18.0,
        'protectOwn' => 25.0,
        'threatenOpponent' => 12.0,
        'deployPiece' => 8.0,
        'homeProgress' => 20.0,
        'bonusContinuation' => 10.0,
        'startFieldRisk' => 18.0,
        'flexibility' => 4.0,
    ];
    $configPath = dirname(__DIR__) . '/config/ai-tactical-weights.json';
    if (!is_file($configPath)) return $weights;
    $config = json_decode((string) file_get_contents($configPath), true);
    $configured = is_array($config) && is_array($config['weights'] ?? null) ? $config['weights'] : [];
    foreach ($weights as $key => $default) {
        if (isset($configured[$key]) && is_numeric($configured[$key]) && is_finite((float) $configured[$key])) {
            $weights[$key] = (float) $configured[$key];
        }
    }
    return $weights;
}

/** Simulace všech šesti hodnot další kostky přes tentýž PHP engine. */
function onlineEngineAiNextDiceOutcomes(array $source, int $playerId): array
{
    $outcomes = [];
    for ($dice = 1; $dice <= 6; $dice++) {
        $branch = $source;
        $branch['currentPlayer'] = $playerId;
        $branch['phase'] = 'roll';
        $result = onlineEngineRollDice($branch, static fn(): int => $dice);
        $legal = is_array($result['validMoves'] ?? null) ? $result['validMoves'] : [];
        if ($legal === [] && ($branch['phase'] ?? '') === 'move') {
            $legal = onlineEngineValidMoves($branch, $playerId);
        }
        $capture = false;
        $finish = false;
        $bonusRoll = (int) ($branch['currentPlayer'] ?? -1) === $playerId && ($branch['phase'] ?? '') === 'roll';
        foreach ($legal as $pieceId) {
            $next = $branch;
            $move = onlineEngineMovePiece($next, (int) $pieceId);
            if (!empty($move['captured']) && empty($move['captured']['ownPiece'])) $capture = true;
            if (!empty($move['finishedNow']) || (($next['winner'] ?? null) !== null && (int) $next['winner'] === $playerId)) $finish = true;
            if ((int) ($next['currentPlayer'] ?? -1) === $playerId && ($next['phase'] ?? '') === 'roll') $bonusRoll = true;
        }
        $outcomes[] = [
            'dice' => $dice,
            'legalMoveCount' => count($legal),
            'retrying' => !empty($result['retrying']),
            'bonusRoll' => $bonusRoll,
            'capture' => $capture,
            'finish' => $finish,
        ];
    }
    return $outcomes;
}

/**
 * Serverová AI vybírá pouze z tahů povolených onlineEngineValidMoves().
 * Deset signálů a vah má stejný význam jako v JavaScriptové strategii.
 */
function onlineEngineChooseAIMoveDecision(array $game, ?callable $randomIndex = null): array
{
    $valid = onlineEngineValidMoves($game);
    if ($valid === []) {
        return ['pieceId' => null, 'reason' => 'AI nemá žádný legální tah.', 'candidates' => []];
    }
    $weights = onlineEngineAiTacticalWeights();
    $playerId = (int) $game['currentPlayer'];
    $track = max(1, (int) $game['trackLength']);
    $beforePips = onlineEngineAiPips($game, $playerId);
    $beforeThreat = onlineEngineAiThreatLoss($game, $playerId);
    $candidates = [];
    foreach ($valid as $pieceId) {
        $simulation = json_decode(json_encode($game, JSON_THROW_ON_ERROR), true, 512, JSON_THROW_ON_ERROR);
        $move = onlineEngineMovePiece($simulation, (int) $pieceId);
        $winning = ($simulation['winner'] ?? null) !== null && (int) $simulation['winner'] === $playerId;
        $beforeSteps = (int) ($game['pieces'][$playerId]['pieces'][$pieceId]['steps'] ?? -1);
        $afterSteps = (int) ($simulation['pieces'][$playerId]['pieces'][$pieceId]['steps'] ?? -1);
        $deployed = !empty($move['deployed']) || ($beforeSteps === -1 && $afterSteps >= 0);
        $enteredHome = $beforeSteps < $track && $afterSteps >= $track;
        $homeProgress = $beforeSteps >= $track && $afterSteps >= $beforeSteps ? $afterSteps - $beforeSteps : 0;
        $enemyCapture = !empty($move['captured']) && empty($move['captured']['ownPiece']);
        $protect = ($beforeThreat - onlineEngineAiThreatLoss($simulation, $playerId)) / $track;
        $diceOutcomes = $winning ? [] : onlineEngineAiNextDiceOutcomes($simulation, $playerId);
        $threaten = count(array_filter($diceOutcomes, static fn(array $item): bool => $item['capture'])) / 6;
        $bonus = count(array_filter($diceOutcomes, static fn(array $item): bool => $item['bonusRoll'])) / 6;
        $flexibility = array_sum(array_map(static fn(array $item): int => min(4, (int) $item['legalMoveCount']), $diceOutcomes)) / 24;
        $piece = $simulation['pieces'][$playerId]['pieces'][$pieceId];
        $position = onlineEnginePiecePosition($simulation, $playerId, $piece);
        $startRisk = 0.0;
        if ($position !== null) {
            foreach ($simulation['players'] as $opponentId => $opponent) {
                if ((int) $opponentId === $playerId || (int) ($opponent['start'] ?? -1) !== $position) continue;
                $baseCount = count(array_filter($simulation['pieces'][$opponentId]['pieces'],
                    static fn(array $item): bool => (int) $item['steps'] === -1));
                if ($baseCount > 0) $startRisk = max($startRisk, min(1.0, 0.25 + $baseCount * 0.15));
            }
        }
        $signals = [
            'progressToGoal' => max(-1.0, min(1.0, ($beforePips - onlineEngineAiPips($simulation, $playerId)) / $track)),
            'finishPiece' => !empty($move['finishedNow']) ? 1.0 : 0.0,
            'captureOpponent' => $enemyCapture ? 1.0 : 0.0,
            'protectOwn' => max(-1.0, min(1.0, $protect)),
            'threatenOpponent' => $threaten,
            'deployPiece' => $deployed ? 1.0 : 0.0,
            'homeProgress' => max(-1.0, min(1.0, ($enteredHome ? 1.0 : 0.0) + $homeProgress / 4)),
            'bonusContinuation' => $bonus,
            'startFieldRisk' => -$startRisk,
            'flexibility' => $flexibility,
        ];
        $score = $winning ? 1000000.0 : 0.0;
        if (!$winning) foreach ($weights as $key => $weight) $score += $weight * $signals[$key];
        $contributions = [];
        foreach ($weights as $key => $weight) $contributions[$key] = $weight * $signals[$key];
        $candidates[] = [
            'pieceId' => (int) $pieceId,
            'score' => $score,
            'winning' => $winning,
            'reason' => $winning ? 'okamžité vítězství' : 'vyhodnocení deseti strategických vah',
            'destinationSteps' => $afterSteps,
            'weightSignals' => $signals,
            'weightContributions' => $contributions,
            'diceSimulation' => $diceOutcomes,
            'move' => $move,
        ];
    }
    $winningMoves = array_values(array_filter($candidates, static fn(array $candidate): bool => $candidate['winning']));
    if ($winningMoves !== []) {
        $selected = $winningMoves[0];
    } else {
        usort($candidates, static fn(array $a, array $b): int =>
            ($b['score'] <=> $a['score']) ?: ($a['pieceId'] <=> $b['pieceId'])
        );
        $selected = $candidates[0];
    }
    $alternatives = array_map(static fn(array $candidate): array => [
        'pieceId' => $candidate['pieceId'],
        'score' => $candidate['score'],
        'reason' => $candidate['reason'],
        'destinationSteps' => $candidate['destinationSteps'],
        'weightSignals' => $candidate['weightSignals'],
        'weightContributions' => $candidate['weightContributions'],
    ], $candidates);
    return [
        'pieceId' => $selected['pieceId'],
        'reason' => $selected['winning']
            ? 'Okamžitě vítězný tah – hra tím končí.'
            : 'AI vyhodnotila ' . count($valid) . ' legálních možností pomocí deseti strategických vah a simulace šesti dalších hodů.',
        'selectedScore' => $selected['score'],
        'weightCount' => 10,
        'weightSignals' => $selected['weightSignals'],
        'weightContributions' => $selected['weightContributions'],
        'diceSimulation' => $selected['diceSimulation'],
        'candidates' => $alternatives,
    ];
}

function onlineEngineChooseAIMove(array $game): ?int
{
    return onlineEngineChooseAIMoveDecision($game)['pieceId'];
}
