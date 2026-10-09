<?php

declare(strict_types=1);

namespace Tests\Support\Simulation;

use InvalidArgumentException;

/** Computes the expected medals and class totals from the scenario, without production ranking code. */
final class TournamentOracle
{
    /** @return array<string,mixed> */
    public static function compute(TournamentManifest $manifest): array
    {
        $expected = $manifest->expected();
        $podiums = $expected['podiums_by_category'] ?? null;
        $awards = $expected['award_points'] ?? null;
        if (!is_array($podiums) || !is_array($awards)) {
            throw new InvalidArgumentException('O manifesto precisa declarar pódios e valores de premiação.');
        }

        $sports = [];
        $fundraising = [];
        foreach ($manifest->classes() as $index => $class) {
            $sports[$class['alias']] = 0;
            $fundraising[$class['alias']] = 45 + 4 * ($index + 1);
        }
        foreach ($podiums as $category => $podium) {
            foreach ([1, 2, 3] as $place) {
                $classAlias = $podium[(string) $place] ?? $podium[$place] ?? null;
                if (!is_string($classAlias) || !array_key_exists($classAlias, $sports)) {
                    throw new InvalidArgumentException("O pódio da categoria {$category} aponta para turma inexistente.");
                }
                $class = null;
                foreach ($manifest->classes() as $candidate) {
                    if ($candidate['alias'] === $classAlias) {
                        $class = $candidate;
                        break;
                    }
                }
                if ($class === null || $class['category'] !== $category) {
                    throw new InvalidArgumentException("A turma {$classAlias} não pertence à categoria {$category} do pódio.");
                }
                $sports[$classAlias] += (int) ($awards[(string) $place] ?? $awards[$place] ?? 0)
                    * count($manifest->modalities());
            }
        }

        $penaltyPerClass = (int) ($expected['penalty_points_per_class'] ?? 0);
        $net = [];
        foreach ($sports as $classAlias => $points) {
            $net[$classAlias] = $points + $fundraising[$classAlias] - $penaltyPerClass;
        }
        $order = array_keys($net);
        usort($order, static fn (string $left, string $right): int => ($net[$right] <=> $net[$left]) ?: strcmp($left, $right));

        return [
            'sports_points_by_class' => $sports,
            'fundraising_points_by_class' => $fundraising,
            'penalty_points_per_class' => $penaltyPerClass,
            'net_points_by_class' => $net,
            'ranking_order' => $order,
            'sports_points' => array_sum($sports),
            'fundraising_points' => array_sum($fundraising),
            'gross_points' => array_sum($sports) + array_sum($fundraising),
            'penalty_points' => $penaltyPerClass * count($manifest->classes()),
            'net_points' => array_sum($net),
        ];
    }
}
