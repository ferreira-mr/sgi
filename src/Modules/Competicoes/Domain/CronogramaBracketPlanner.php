<?php

declare(strict_types=1);

namespace App\Modules\Competicoes\Domain;

use InvalidArgumentException;

/**
 * Monta a árvore estrutural que será usada pelo cronograma antes das inscrições.
 * A árvore não cria jogos, atletas ou resultados: ela apenas descreve os
 * confrontos possíveis e as dependências entre fases.
 */
final class CronogramaBracketPlanner
{
    /**
     * @param list<int> $teamIds
     * @return list<array<string,mixed>>
     */
    public static function plan(int $modalityId, ?int $classId, array $teamIds): array
    {
        if ($modalityId <= 0 || ($classId !== null && $classId <= 0)) {
            throw new InvalidArgumentException('A modalidade e, quando aplicável, a turma são obrigatórias para montar o chaveamento.');
        }
        $teamIds = array_values(array_unique(array_filter(array_map('intval', $teamIds), static fn (int $id): bool => $id > 0)));
        if ($teamIds === []) {
            return [];
        }
        sort($teamIds, SORT_NUMERIC);
        $width = self::nextPowerOfTwo(count($teamIds));
        $levels = [];
        $slots = [];
        $counts = self::slotCounts(count($teamIds), $width);
        $offset = 0;
        for ($slot = 0; $slot < intdiv($width, 2); $slot++) {
            $count = $counts[$slot] ?? 0;
            if ($count === 0) {
                $slots[$slot] = null;
                continue;
            }
            $candidateIds = array_slice($teamIds, $offset, $count);
            $offset += $count;
            $slots[$slot] = self::node($modalityId, $classId, $width, $width, $slot, $candidateIds, null, null);
        }
        $levels[$width] = $slots;

        while ($width > 2) {
            $nextWidth = intdiv($width, 2);
            $parents = [];
            for ($slot = 0; $slot < intdiv($nextWidth, 2); $slot++) {
                $left = $levels[$width][$slot * 2] ?? null;
                $right = $levels[$width][$slot * 2 + 1] ?? null;
                if ($left === null && $right === null) {
                    $parents[$slot] = null;
                    continue;
                }
                $candidateIds = array_values(array_unique(array_merge(
                    $left['equipe_ids'] ?? [],
                    $right['equipe_ids'] ?? [],
                )));
                $parents[$slot] = self::node(
                    $modalityId,
                    $classId,
                    self::nextPowerOfTwo(count($teamIds)),
                    $nextWidth,
                    $slot,
                    $candidateIds,
                    $left['chave_tag'] ?? null,
                    $right['chave_tag'] ?? null,
                );
            }
            $levels[$nextWidth] = $parents;
            $width = $nextWidth;
        }

        $nodes = [];
        foreach ($levels as $level) {
            foreach ($level as $node) {
                if ($node !== null) {
                    $nodes[] = $node;
                }
            }
        }
        return $nodes;
    }

    /** @return array<string,mixed> */
    private static function node(int $modalityId, ?int $classId, int $initialWidth, int $width, int $slot, array $teamIds, ?string $left, ?string $right): array
    {
        $isBye = ($left === null && $right === null && count($teamIds) === 1)
            || (($left === null) xor ($right === null));
        $kind = $isBye ? 'B' : 'N';
        return [
            'chave_tag' => sprintf('PL:%d:%d:MM:%d:%d:%s', $modalityId, $classId ?? 0, $width, $slot, $kind),
            'tipo_no' => $isBye ? 'bye' : 'normal',
            'fase_largura' => $width,
            'slot' => $slot,
            'condicional' => $width < $initialWidth ? 1 : 0,
            'id_equipe_a' => $teamIds[0] ?? null,
            'id_equipe_b' => $teamIds[1] ?? null,
            'equipe_ids' => $teamIds,
            'origem_a_tag' => $left,
            'origem_b_tag' => $right,
        ];
    }

    /** @return list<int> */
    private static function slotCounts(int $teamCount, int $width): array
    {
        $numSlots = intdiv($width, 2);
        if ($numSlots <= 1) {
            return [$teamCount];
        }
        if ($width === 4) {
            return $teamCount === 3 ? [2, 1] : [2, 2];
        }
        if ($width === 8) {
            return match ($teamCount) {
                5 => [2, 1, 2, 0],
                6 => [2, 2, 2, 0],
                7 => [2, 2, 2, 1],
                default => [2, 2, 2, 2],
            };
        }
        $numPairs = intdiv($numSlots, 2);
        $base = intdiv($teamCount, $numPairs);
        $rem = $teamCount % $numPairs;
        $slots = [];
        for ($i = 0; $i < $numPairs; $i++) {
            $sum = $base + ($i < $rem ? 1 : 0);
            if ($sum >= 4) {
                $slots[] = 2;
                $slots[] = 2;
            } elseif ($sum === 3) {
                $slots[] = 2;
                $slots[] = 1;
            } elseif ($sum === 2) {
                $slots[] = 2;
                $slots[] = 0;
            } elseif ($sum === 1) {
                $slots[] = 1;
                $slots[] = 0;
            } else {
                $slots[] = 0;
                $slots[] = 0;
            }
        }
        return $slots;
    }

    private static function nextPowerOfTwo(int $number): int
    {
        $width = 1;
        while ($width < $number) {
            $width *= 2;
        }
        return max(2, $width);
    }
}
