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
        'immediateWin' => 100000.0,
        'ownProgress' => 0.08,
        'opponentSetback' => 0.035,
        'threatReduction' => 12.0,
        'captureOpponent' => 5.0,
        'captureOwn' => 7.0,
        'finishPiece' => 8.0,
    ];

    $configPath = dirname(__DIR__) . '/config/ai-tactical-weights.json';
    if (!is_file($configPath)) return $weights;

    $config = json_decode((string) file_get_contents($configPath), true);
    $configured = is_array($config) && is_array($config['weights'] ?? null)
        ? $config['weights']
        : [];

    foreach ($weights as $key => $default) {
        if ($key === 'immediateWin') continue;
        if (isset($configured[$key]) && is_numeric($configured[$key]) &&
            is_finite((float) $configured[$key])) {
            $weights[$key] = (float) $configured[$key];
        }
    }

    return $weights;
}

/**
 * Vrací výběr i rozbor pro debug chat. Skóre je deterministické pro stejný stav.
 */
function onlineEngineChooseAIMoveDecision(array $game, ?callable $randomIndex = null): array
{
    $valid = onlineEngineValidMoves($game);
    if ($valid === []) {
        return ['pieceId' => null, 'reason' => 'AI nemá žádný legální tah.', 'candidates' => []];
    }

    $weights = onlineEngineAiTacticalWeights();
    $playerId = (int) $game['currentPlayer'];
    $beforeOwnPips = onlineEngineAiPips($game, $playerId);
    $beforeThreat = onlineEngineAiThreatLoss($game, $playerId);
    $beforeOpponentPips = 0.0;
    foreach ($game['players'] as $opponentId => $_opponent) {
        if ((int) $opponentId !== $playerId) {
            $beforeOpponentPips += onlineEngineAiPips($game, (int) $opponentId);
        }
    }

    $candidates = [];
    foreach ($valid as $pieceId) {
        $simulation = json_decode(json_encode($game, JSON_THROW_ON_ERROR), true, 512, JSON_THROW_ON_ERROR);
        $move = onlineEngineMovePiece($simulation, (int) $pieceId);
        $winning = (int) ($simulation['winner'] ?? -1) === $playerId;
        $ownProgress = $beforeOwnPips - onlineEngineAiPips($simulation, $playerId);
        $opponentSetback = 0.0;
        foreach ($simulation['players'] as $opponentId => $_opponent) {
            if ((int) $opponentId !== $playerId) {
                $opponentSetback += onlineEngineAiPips($simulation, (int) $opponentId);
            }
        }
        $opponentSetback -= $beforeOpponentPips;
        $threatReduction = $beforeThreat - onlineEngineAiThreatLoss($simulation, $playerId);
        $capturedOwn = !empty($move['captured']['ownPiece']);
        $capturedOpponent = !empty($move['captured']) && !$capturedOwn;
        $finishedPiece = !empty($move['finishedNow']);
        $score = $winning ? $weights['immediateWin'] :
            $ownProgress * $weights['ownProgress'] +
            $opponentSetback * $weights['opponentSetback'] +
            $threatReduction * $weights['threatReduction'] +
            ($capturedOpponent ? $weights['captureOpponent'] : 0.0) -
            ($capturedOwn ? $weights['captureOwn'] : 0.0) +
            ($finishedPiece ? $weights['finishPiece'] : 0.0);
        $candidates[] = [
            'pieceId' => (int) $pieceId,
            'score' => $score,
            'winning' => $winning,
            'reason' => $winning ? 'okamžité vítězství' : 'taktické vyhodnocení vahami v1',
            'destinationSteps' => (int) $simulation['pieces'][$playerId]['pieces'][$pieceId]['steps'],
            'move' => $move,
        ];
    }

    $winningMoves = array_values(array_filter(
        $candidates,
        static fn(array $candidate): bool => $candidate['winning']
    ));

    if ($winningMoves !== []) {
        $selected = $winningMoves[0];
    } else {
        usort($candidates, static fn(array $a, array $b): int =>
            ($b['score'] <=> $a['score']) ?: ($a['pieceId'] <=> $b['pieceId'])
        );
        $selected = $candidates[0];
    }

    $alternatives = array_map(
        static fn(array $candidate): array => [
            'pieceId' => $candidate['pieceId'],
            'score' => $candidate['score'],
            'reason' => $candidate['reason'],
            'destinationSteps' => $candidate['destinationSteps'],
        ],
        $candidates
    );

    return [
        'pieceId' => $selected['pieceId'],
        'reason' => $selected['winning']
            ? 'Okamžitě vítězný tah – hra tím končí.'
            : 'Taktická AI vyhodnotila ' . count($valid) .
                ' legálních možností podle společných vah v1.',
        'selectedScore' => $selected['score'],
        'candidates' => $alternatives,
    ];
}

function onlineEngineChooseAIMove(array $game): ?int
{
    return onlineEngineChooseAIMoveDecision($game)['pieceId'];
}
