<?php

declare(strict_types=1);

namespace Tests\Unit\Modules\Resultados;

use App\Modules\Resultados\Application\RankingService;
use App\Modules\Resultados\Domain\RankingRepository;
use App\Modules\Participantes\Domain\TurmaRankingUpdater;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

final class RankingServiceTest extends TestCase
{
    public function testUpdatesScoreAndReturnsRepositoryResult(): void
    {
        $repository = new InMemoryRankingRepository();
        $updater = new InMemoryTurmaRankingUpdater();
        $service = new RankingService($repository, $updater);
        self::assertTrue($service->atualizar(['id_turma' => 7, 'pontuacao_turma' => 10]));
        self::assertSame(['id_turma' => 7, 'pontuacao_turma' => 10], $updater->updated);
    }

    public function testRejectsNegativeScore(): void
    {
        $this->expectException(InvalidArgumentException::class);
        (new RankingService(new InMemoryRankingRepository(), new InMemoryTurmaRankingUpdater()))->atualizar([
            'id_turma' => 7,
            'pontuacao_turma' => -1,
        ]);
    }
    public function testReconciliarCallsRepository(): void
    {
        $repository = new InMemoryRankingRepository();
        $updater = new InMemoryTurmaRankingUpdater();
        $service = new RankingService($repository, $updater);

        $result = $service->reconciliar(4);
        self::assertSame(['reconciliadas' => 3, 'total_turmas' => 3, 'turmas' => []], $result);
        self::assertSame(4, $repository->reconciledEditionId);
    }

    public function testReconciliarRejectsInvalidEdition(): void
    {
        $this->expectException(InvalidArgumentException::class);
        $service = new RankingService(new InMemoryRankingRepository(), new InMemoryTurmaRankingUpdater());
        $service->reconciliar(0);
    }
}

final class InMemoryRankingRepository implements RankingRepository
{
    public ?int $reconciledEditionId = null;

    public function list(array $filters): array
    {
        return [];
    }

    public function reconciliarEdicao(int $editionId): array
    {
        $this->reconciledEditionId = $editionId;
        return [
            'reconciliadas' => 3,
            'total_turmas' => 3,
            'turmas' => [],
        ];
    }
}

final class InMemoryTurmaRankingUpdater implements TurmaRankingUpdater
{
    /** @var array<string, mixed> */
    public array $updated = [];

    /** @param array<string, mixed> $data */
    public function atualizarPeloRanking(array $data): bool
    {
        if ((int) ($data['pontuacao_turma'] ?? 0) < 0) {
            throw new InvalidArgumentException('A pontuação não pode ser negativa.');
        }
        $this->updated = $data;
        return true;
    }
}
