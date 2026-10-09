<?php

declare(strict_types=1);

namespace Tests\Unit\Modules\Participantes;

use App\Modules\Participantes\Application\InscricaoService;
use App\Modules\Participantes\Domain\InscricaoRepository;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

final class InscricaoServiceTest extends TestCase
{
    public function testNormalizesIdsAndDelegatesOnce(): void
    {
        $repository = new InMemoryInscricaoRepository();
        $result = (new InscricaoService($repository))->inscrever(12, [
            'id_interclasse' => 4,
            'id_equipes' => ['8', 8, 3],
        ]);

        self::assertTrue($result['success']);
        self::assertSame([8, 3], $repository->teamIds);
        self::assertSame(12, $repository->userId);
        self::assertSame(4, $repository->editionId);
    }

    public function testRejectsMoreThanThreeSubmittedTeamsBeforePersistence(): void
    {
        $repository = new InMemoryInscricaoRepository();
        $this->expectException(InvalidArgumentException::class);
        (new InscricaoService($repository))->inscrever(12, [
            'id_interclasse' => 4,
            'id_equipes' => [1, 2, 3, 4],
        ]);
        self::assertSame([], $repository->teamIds);
    }
}

final class InMemoryInscricaoRepository implements InscricaoRepository
{
    /** @var list<int> */
    public array $teamIds = [];

    public int $userId = 0;

    public int $editionId = 0;

    public function subscribe(int $userId, int $editionId, array $teamIds, ?int $expectedRevision = null, ?int $expectedPublishedVersion = null): array
    {
        $this->userId = $userId;
        $this->editionId = $editionId;
        $this->teamIds = $teamIds;

        return ['success' => true, 'message' => 'ok', 'insercoes' => count($teamIds), 'ja_existentes' => 0, 'erros' => []];
    }
}
