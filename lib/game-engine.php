<?php
declare(strict_types=1);

/**
 * Serverový herní engine.
 * Logika odpovídá js/game-engine.js; server je autoritou pro online tahy.
 */

function onlineEngineCreateState(array $participants): array
{
    $total = count($participants);
    if ($total < 2 || $total > 8) {
        throw new InvalidArgumentException('Hra vyžaduje 2 až 8 živých hráčů.');
    }

    usort($participants, static fn(array $a, array $b): int =>
        (int) $a['player_index'] <=> (int) $b['player_index']
    );

    $trackLength = $total <= 4 ? 52 : 64;
    $classicSlots = match ($total) {
        2 => [0, 2],
        3 => [0, 1, 2],
        default => [0, 1, 2, 3],
    };

    $players = [];
    foreach ($participants as $index => $participant) {
        $slot = $total <= 4
            ? $classicSlots[$index]
            : (int) floor(($index * 8 / $total) + 0.5);
        $start = ($total === 3 || $total >= 5)
            ? (int) floor(($index * $trackLength / $total) + 0.5)
            : $slot * 13;

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
        'currentPlayer' => 0,
        'startRolls' => [[]],
        'startCandidates' => array_keys($players),
        'startWinner' => null,
        'diceValue' => 0,
        'baseRollAttempts' => 0,
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
    if ($steps < 0 || $steps > (int) $game['trackLength']) {
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
    $maxSteps = $trackLength + 4;
    $playerPieces = $game['pieces'][$playerId]['pieces'];
    $valid = [];

    foreach ($playerPieces as $piece) {
        $pieceId = (int) $piece['id'];
        $steps = (int) $piece['steps'];
        if ($steps === $maxSteps || ($steps === -1 && (int) $game['diceValue'] !== 6)) {
            continue;
        }

        $nextSteps = $steps === -1 ? 0 : $steps + (int) $game['diceValue'];
        if ($nextSteps > $maxSteps) {
            continue;
        }

        // Vlastní figurku lze přeskočit, ale nelze skončit na žádném jejím políčku.
        // Startovní pole je posledním polem hlavního okruhu (trackLength);
        // až následující krok vstupuje na první ze čtyř samostatných cílových polí.
        $ownBlock = false;
        foreach ($playerPieces as $other) {
            if ((int) $other['id'] === $pieceId) {
                continue;
            }
            $otherSteps = (int) $other['steps'];
            if ($otherSteps < 0) {
                continue;
            }

            if ($nextSteps <= $trackLength) {
                if ($otherSteps <= $trackLength
                    && onlineEnginePiecePosition($game, $playerId, $other)
                        === ((((int) $game['players'][$playerId]['start']) + $nextSteps) % $trackLength)) {
                    $ownBlock = true;
                    break;
                }
            } elseif ($otherSteps === $nextSteps) {
                $ownBlock = true;
                break;
            }
        }
        if ($ownBlock) {
            continue;
        }

        $valid[] = $pieceId;
    }

    return $valid;
}

function onlineEngineRollDice(array &$game): array
{
    if (($game['phase'] ?? '') !== 'roll' || ($game['winner'] ?? null) !== null) {
        throw new DomainException('Nyní nelze házet kostkou.');
    }

    $value = random_int(1, 6);
    $game['diceValue'] = $value;
    $game['phase'] = 'move';
    $moves = onlineEngineValidMoves($game);

    if ($moves === []) {
        $game['phase'] = 'no-move';
    }

    return ['value' => $value, 'validMoves' => $moves];
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
    $piece = &$game['pieces'][$playerId]['pieces'][$pieceId];
    $fromSteps = (int) $piece['steps'];
    $diceValue = (int) $game['diceValue'];
    $nextSteps = $fromSteps === -1 ? 0 : $fromSteps + $diceValue;
    $captured = null;

    if ($nextSteps <= (int) $game['trackLength']) {
        $destination = (((int) $player['start']) + $nextSteps) % (int) $game['trackLength'];
        // Startovní pole nemá žádnou ochranu – obsazenou soupeřovu figurku lze vyhodit.
        foreach ($game['pieces'] as $enemyId => &$group) {
            if ((int) $enemyId === $playerId) {
                continue;
            }
            foreach ($group['pieces'] as &$enemyPiece) {
                $enemySteps = (int) $enemyPiece['steps'];
                if ($enemySteps >= 0 && $enemySteps <= (int) $game['trackLength']
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

    $piece['steps'] = $nextSteps;
    unset($piece);

    $maxSteps = (int) $game['trackLength'] + 4;
    $finishedNow = $nextSteps === $maxSteps;
    // Vítězství nastane, když všechny čtyři figurky obsadí čtyři různá cílová pole.
    $playerFinished = true;
    $homeSteps = [];
    foreach ($game['pieces'][$playerId]['pieces'] as $item) {
        $itemSteps = (int) $item['steps'];
        if ($itemSteps <= (int) $game['trackLength'] || $itemSteps > $maxSteps) {
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
    } elseif ($diceValue === 6 && !$finishedNow) {
        $game['phase'] = 'roll';
    } else {
        onlineEngineAdvanceTurn($game);
    }

    $move = [
        'playerId' => $playerId,
        'playerName' => (string) $player['name'],
        'pieceId' => $pieceId,
        'captured' => $captured,
        'finishedNow' => $finishedNow,
        'diceValue' => $diceValue,
    ];
    $game['lastMove'] = $move;

    return $move;
}


function onlineEngineChooseAIMove(array $game): ?int
{
    $valid = onlineEngineValidMoves($game);
    if ($valid === []) return null;
    $playerId = (int) $game['currentPlayer'];
    $player = $game['players'][$playerId];
    $trackLength = (int) $game['trackLength'];
    $bestPiece = null;
    $bestScore = PHP_INT_MIN;
    foreach ($valid as $pieceId) {
        $piece = $game['pieces'][$playerId]['pieces'][$pieceId];
        $nextSteps = (int) $piece['steps'] < 0 ? 0 : (int) $piece['steps'] + (int) $game['diceValue'];
        $destination = $nextSteps <= $trackLength ? (((int) $player['start']) + $nextSteps) % $trackLength : null;
        $score = $nextSteps;
        if ((int) $piece['steps'] < 0) $score += 18;
        if ($nextSteps === $trackLength + 4) $score += 1000;
        if ($destination !== null) {
            foreach ($game['pieces'] as $enemyId => $group) {
                if ((int) $enemyId === $playerId) continue;
                foreach ($group['pieces'] as $enemyPiece) {
                    $enemySteps = (int) $enemyPiece['steps'];
                    if ($enemySteps >= 0 && $enemySteps <= $trackLength
                        && onlineEnginePiecePosition($game, (int) $enemyId, $enemyPiece) === $destination) $score += 90;
                }
            }
        }
        if ($score > $bestScore) {
            $bestScore = $score;
            $bestPiece = (int) $pieceId;
        }
    }
    return $bestPiece;
}
