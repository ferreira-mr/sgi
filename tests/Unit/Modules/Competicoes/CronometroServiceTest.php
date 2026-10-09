<?php

declare(strict_types=1);

namespace Tests\Unit\Modules\Competicoes;

use App\Modules\Competicoes\Application\CronometroService;
use App\Modules\Competicoes\Domain\CronometroRepository;
use PHPUnit\Framework\TestCase;

final class CronometroServiceTest extends TestCase
{
    public function testConclusaoPorSnapshotDeModalidadeIndividualERecusada(): void
    {
        $repository = new CronometroRepositoryFake();
        $repository->state['tipos_modalidades_id_tipo_modalidade'] = 37;
        $repository->state['nome_tipo_modalidade'] = 'Individual';
        $service = new CronometroService($repository, static fn (): int => 1000);

        try {
            $service->atualizar(12, [
                'cronometro' => [
                    'versao' => 2,
                    'saldo_segundos' => 0,
                    'referencia_epoch_ms' => 1000000,
                    'status_jogo' => 'Concluido',
                ],
            ]);
            self::fail('A conclusão por snapshot deveria ser recusada.');
        } catch (\InvalidArgumentException $exception) {
            self::assertStringContainsString('lançamento do pódio', $exception->getMessage());
        }

        self::assertSame(0, $repository->saveCalls);
    }

    public function testInicioEPausaContinuamPermitidosParaModalidadeIndividual(): void
    {
        $repository = new CronometroRepositoryFake();
        $repository->state['tipos_modalidades_id_tipo_modalidade'] = 37;
        $repository->state['nome_tipo_modalidade'] = 'Individual';
        $service = new CronometroService($repository, static fn (): int => 1000);

        $service->atualizar(12, ['status_jogo' => 'Pausado']);

        self::assertSame(1, $repository->saveCalls);
        self::assertSame('Pausado', $repository->saved['status_jogo']);
    }

    public function testTipoDesconhecidoNaoPodeSerIniciadoPeloCronometro(): void
    {
        $repository = new CronometroRepositoryFake();
        unset($repository->state['nome_tipo_modalidade']);
        $service = new CronometroService($repository, static fn (): int => 1000);

        $this->expectException(\InvalidArgumentException::class);
        $service->atualizar(12, ['status_jogo' => 'Iniciado']);
        self::assertSame(0, $repository->saveCalls);
    }

    public function testConclusaoDiretaDeModalidadeColetivaDeveSerRecusada(): void
    {
        $repository = new CronometroRepositoryFake();
        $service = new CronometroService($repository, static fn (): int => 1000);

        try {
            $service->atualizar(12, ['status_jogo' => 'Concluido']);
            self::fail('O cronômetro não pode concluir uma partida coletiva sem o resultado.');
        } catch (\InvalidArgumentException $exception) {
            self::assertStringContainsString('resultado', $exception->getMessage());
        }

        self::assertSame(0, $repository->saveCalls);
    }

    public function testPrimeiraFaseAindaExigeHorarioParaIniciar(): void
    {
        $repository = new CronometroRepositoryFake();
        $repository->state['status_jogo'] = 'Agendado';
        $repository->state['inicio_jogo'] = null;
        $repository->state['termino_jogo'] = null;
        $repository->state['exige_horario_agendado'] = true;

        $this->expectException(\InvalidArgumentException::class);
        (new CronometroService($repository, static fn (): int => 1000))->atualizar(12, [
            'cronometro' => [
                'versao' => 2,
                'saldo_segundos' => 1200,
                'referencia_epoch_ms' => 1000000,
                'status_jogo' => 'Iniciado',
            ],
        ]);
    }

    public function testFasePosteriorIniciaComDataELocalMesmoSemHorario(): void
    {
        $repository = new CronometroRepositoryFake();
        $repository->state['status_jogo'] = 'Agendado';
        $repository->state['inicio_jogo'] = null;
        $repository->state['termino_jogo'] = null;
        $repository->state['exige_horario_agendado'] = false;

        $result = (new CronometroService($repository, static fn (): int => 1000))->atualizar(12, [
            'cronometro' => [
                'versao' => 2,
                'saldo_segundos' => 1200,
                'referencia_epoch_ms' => 1000000,
                'status_jogo' => 'Iniciado',
            ],
        ]);

        self::assertSame('Iniciado', $result['snapshot']['status_jogo']);
        self::assertSame(1, $repository->saveCalls);
    }

    public function testSnapshotTerminalNaoConcluiPartidaColetivaAberta(): void
    {
        $repository = new CronometroRepositoryFake();
        $service = new CronometroService($repository, static fn (): int => 1000);

        try {
            $service->atualizar(12, [
                'status_jogo' => 'Concluido',
                'cronometro' => [
                    'versao' => 2,
                    'saldo_segundos' => 0,
                    'referencia_epoch_ms' => 1000000,
                ],
            ]);
            self::fail('Um snapshot terminal não pode concluir uma partida coletiva sem o resultado.');
        } catch (\InvalidArgumentException $exception) {
            self::assertStringContainsString('resultado', $exception->getMessage());
        }

        self::assertSame(0, $repository->saveCalls);
    }

    public function testSnapshotAtrasadoNaoReabrePartidaEncerrada(): void
    {
        foreach (['Iniciado', 'Pausado'] as $status) {
            $repository = new CronometroRepositoryFake();
            $repository->state['status_jogo'] = 'Concluido';
            $service = new CronometroService($repository, static fn (): int => 1000);

            try {
                $service->atualizar(12, [
                    'status_jogo' => $status,
                    'cronometro' => [
                        'versao' => 2,
                        'saldo_segundos' => 30,
                        'referencia_epoch_ms' => 990000,
                    ],
                ]);
                self::fail('Snapshot atrasado de ' . $status . ' não pode reabrir a partida.');
            } catch (\InvalidArgumentException $exception) {
                self::assertStringContainsString('encerrado', $exception->getMessage());
            }

            self::assertSame(0, $repository->saveCalls);
            self::assertSame('Concluido', $repository->state['status_jogo']);
        }
    }

    public function testSnapshotTerminalLegadoEmPartidaEncerradaEConfirmadoSemGravar(): void
    {
        $repository = new CronometroRepositoryFake();
        $repository->state['status_jogo'] = 'Concluido';
        $service = new CronometroService($repository, static fn (): int => 1000);

        $result = $service->atualizar(12, [
            'status_jogo' => 'Concluido',
            'cronometro' => [
                'versao' => 2,
                'saldo_segundos' => 1200,
                'referencia_epoch_ms' => 1000000,
            ],
        ]);

        self::assertSame('Concluido', $result['snapshot']['status_jogo']);
        self::assertSame(0, $repository->saveCalls);
        self::assertSame('Concluido', $repository->state['status_jogo']);
    }
}

final class CronometroRepositoryFake implements CronometroRepository
{
    /** @var array<string,mixed> */
    public array $state = [
        'status_jogo' => 'Iniciado',
        'data_jogo' => '2026-09-09',
        'inicio_jogo' => '08:00:00',
        'termino_jogo' => '09:00:00',
        'locais_id_local' => 1,
        'duracao_jogo' => 3600,
        'tempo_extra_jogo' => 0,
        'tempo_restante_jogo' => 3600,
        'data_inicio_real' => 1000,
        'tipos_modalidades_id_tipo_modalidade' => 1,
        'nome_tipo_modalidade' => 'Mata-Mata',
    ];
    public int $saveCalls = 0;
    /** @var array<string,mixed> */
    public array $saved = [];

    public function findForUpdate(int $gameId): ?array
    {
        return $this->state;
    }

    /** @param array{status_jogo:string,duracao_jogo:int,tempo_extra_jogo:int,tempo_restante_jogo:int|null,data_inicio_real:int|null} $snapshot */
    public function save(int $gameId, array $snapshot): void
    {
        $this->saveCalls++;
        $this->saved = $snapshot;
    }
}
