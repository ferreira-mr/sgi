<?php

declare(strict_types=1);

namespace App\Modules\Resultados\Application;

use App\Modules\Resultados\Domain\RankingRepository;
use App\Modules\Participantes\Domain\TurmaRankingUpdater;

final class RankingService
{
    public function __construct(
        private readonly RankingRepository $ranking,
        private readonly TurmaRankingUpdater $turmas,
    ) {
    }

    /**
     * @param array<string, mixed> $filters
     * @return list<array<string, mixed>>
     */
    public function listar(array $filters): array
    {
        return $this->ranking->list($filters);
    }

    /**
     * @param array<string, mixed> $data
     */
    public function atualizar(array $data): bool
    {
        return $this->turmas->atualizarPeloRanking($data);
    }

    /**
     * @return array{reconciliadas: int, total_turmas: int, turmas: list<array<string, mixed>>}
     */
    public function reconciliar(int $editionId): array
    {
        if ($editionId <= 0) {
            throw new \InvalidArgumentException('Edição inválida para reconciliação.');
        }

        return $this->ranking->reconciliarEdicao($editionId);
    }
}
