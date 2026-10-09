<?php

declare(strict_types=1);

namespace Tests\Unit\Modules\Competicoes;

use App\Modules\Competicoes\Domain\CronogramaRules;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

final class CronogramaRulesTest extends TestCase
{
    public function testValidatesPlannedTeamQuantityAndRosterCapacity(): void
    {
        self::assertSame([
            'quantidade' => 2,
            'min' => 5,
            'max' => 10,
            'formato' => 'equipe',
            'duracao' => 20,
            'descanso' => 5,
        ], CronogramaRules::modalidade([
            'equipes_planejadas' => '2',
            'min_inscritos_equipe' => '5',
            'max_inscritos_equipe' => '10',
            'formato_participacao' => 'equipe',
            'duracao_prevista_min' => '20',
            'descanso_min' => '5',
        ]));
    }

    public function testRejectsInvalidPairAndFormats(): void
    {
        $this->expectException(InvalidArgumentException::class);
        CronogramaRules::modalidade([
            'equipes_planejadas' => 1,
            'min_inscritos_equipe' => 3,
            'max_inscritos_equipe' => 2,
            'formato_participacao' => 'dupla',
        ]);
    }

    public function testOverlappingIntervalsUseSameDateAndOptionalMargin(): void
    {
        self::assertFalse(CronogramaRules::overlap('2026-10-01', '08:00', '08:20', '2026-10-01', '08:20', '08:40'));
        self::assertTrue(CronogramaRules::overlap('2026-10-01', '08:00', '08:20', '2026-10-01', '08:20', '08:40', 1));
        self::assertFalse(CronogramaRules::overlap('2026-10-01', '08:00', '08:20', '2026-10-02', '08:00', '08:20', 30));
    }

    public function testPlannedEditionMustBePublishedAndOpenWithinWindow(): void
    {
        CronogramaRules::assertPlannedEdition([
            'cronograma_status' => 'publicado',
            'inscricoes_status' => 'abertas',
            'inscricoes_abertura' => '2026-09-21 08:00:00',
            'inscricoes_encerramento' => '2026-09-21 18:00:00',
        ], new \DateTimeImmutable('2026-09-21 12:00:00'));

        $this->expectException(InvalidArgumentException::class);
        CronogramaRules::assertPlannedEdition([
            'cronograma_status' => 'rascunho',
            'inscricoes_status' => 'abertas',
        ]);
    }

    public function testRegistrationWindowIsHalfOpen(): void
    {
        $edition = [
            'cronograma_status' => 'publicado',
            'inscricoes_status' => 'abertas',
            'inscricoes_abertura' => '2026-09-21 08:00:00',
            'inscricoes_encerramento' => '2026-09-21 18:00:00',
        ];
        CronogramaRules::assertPlannedEdition($edition, new \DateTimeImmutable('2026-09-21 08:00:00'));
        $this->expectException(InvalidArgumentException::class);
        CronogramaRules::assertPlannedEdition($edition, new \DateTimeImmutable('2026-09-21 18:00:00'));
    }
}
