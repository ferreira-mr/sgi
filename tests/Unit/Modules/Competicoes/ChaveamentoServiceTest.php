<?php

declare(strict_types=1);

namespace Tests\Unit\Modules\Competicoes;

use App\Modules\Competicoes\Application\ChaveamentoService;
use App\Modules\Competicoes\Domain\ChaveamentoManagement;
use PHPUnit\Framework\TestCase;

final class ChaveamentoServiceTest extends TestCase
{
    public function testRejectsMissingModalityBeforePersistence(): void
    {
        $repository = $this->createMock(ChaveamentoManagement::class);
        $this->expectException(\InvalidArgumentException::class);
        (new ChaveamentoService($repository))->gerar(0, false, null);
    }

    public function testIndividualPreparationMustComeFromThePublishedSchedule(): void
    {
        $repository = $this->createMock(ChaveamentoManagement::class);
        $repository->method('modality')->with(7)->willReturn([
            'tipos_modalidades_id_tipo_modalidade' => 37,
            'nome_tipo_modalidade' => 'Individual',
        ]);
        $repository->expects(self::never())->method('saveIndividual');
        $this->expectException(\InvalidArgumentException::class);
        (new ChaveamentoService($repository))->gerar(7, false, null);
    }

    public function testIndividualTypeUsesSemanticNameEvenWhenForeignKeyIsNotTwo(): void
    {
        $repository = $this->createMock(ChaveamentoManagement::class);
        $repository->method('modality')->with(17)->willReturn([
            'tipos_modalidades_id_tipo_modalidade' => 37,
            'nome_tipo_modalidade' => 'Individual',
        ]);
        $repository->expects(self::never())->method('saveIndividual');
        $this->expectException(\InvalidArgumentException::class);
        (new ChaveamentoService($repository))->gerar(17, false, null);
    }

    public function testTeamBracketGenerationIsRejectedAndDoesNotReachPersistence(): void
    {
        $repository = $this->createMock(ChaveamentoManagement::class);
        $repository->method('modality')->with(22)->willReturn([
            'tipos_modalidades_id_tipo_modalidade' => 4,
            'nome_tipo_modalidade' => 'Mata-Mata',
        ]);

        $this->expectException(\InvalidArgumentException::class);
        (new ChaveamentoService($repository))->gerar(22, false, null);
    }

    public function testNormalizesIndividualPodiumIdentifiers(): void
    {
        $repository = $this->createMock(ChaveamentoManagement::class);
        $repository->expects(self::once())->method('saveIndividual')->with(7, ['primeiro' => 1, 'segundo' => 2, 'terceiro' => 3])->willReturn(['success' => true]);
        self::assertTrue((new ChaveamentoService($repository))->gerar(7, true, ['primeiro' => '1', 'segundo' => '2', 'terceiro' => '3'])['success']);
    }

    public function testIncompletePodiumIsRejectedWithoutDelegating(): void
    {
        $repository = $this->createMock(ChaveamentoManagement::class);
        $repository->expects(self::never())->method('saveIndividual');
        $this->expectException(\InvalidArgumentException::class);
        (new ChaveamentoService($repository))->gerar(7, true, ['primeiro' => 1]);
    }

    public function testIndividualPodiumCanBindToTheGameCurrentlyOpenInTheScreen(): void
    {
        $repository = $this->createMock(ChaveamentoManagement::class);
        $repository->expects(self::once())->method('saveIndividual')
            ->with(7, ['primeiro' => 1, 'segundo' => 2, 'terceiro' => 3], 20)
            ->willReturn(['success' => true]);

        self::assertTrue((new ChaveamentoService($repository))->gerar(
            7,
            true,
            ['primeiro' => 1, 'segundo' => 2, 'terceiro' => 3],
            true,
            20,
        )['success']);
    }

    public function testExplicitNullRankingIsNotInterpretedAsAgendaGeneration(): void
    {
        $repository = $this->createMock(ChaveamentoManagement::class);
        $repository->expects(self::never())->method('saveIndividual');

        $this->expectException(\InvalidArgumentException::class);
        (new ChaveamentoService($repository))->gerar(7, true, null, true);
    }

    public function testClassificationOmitsMatchesButPreservesThePodium(): void
    {
        $repository = $this->createMock(ChaveamentoManagement::class);
        $repository->method('read')->with(7, false, 'historico')->willReturn(['confrontos' => [['id' => 1]], 'podio' => [1, 2, 3]]);
        self::assertSame(['podio' => [1, 2, 3]], (new ChaveamentoService($repository))->consultar(7, false, 'classificacao'));
    }
}
