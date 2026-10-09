<?php

declare(strict_types=1);

namespace App\Modules\Resultados\Domain;

interface RankingRepository
{
    /**
     * @param array<string, mixed> $filters
     * @return list<array<string, mixed>>
     */
    public function list(array $filters): array;

    /**
     * Reconcilia a pontuação das turmas da edição com base na soma de arrecadação e pódios ativos.
     *
     * @return array{reconciliadas: int, total_turmas: int, turmas: list<array<string, mixed>>}
     */
    public function reconciliarEdicao(int $editionId): array;
}
