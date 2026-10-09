<?php

declare(strict_types=1);

namespace Tests\Unit\Modules\Competicoes;

use App\Modules\Competicoes\Application\ResultadoService;
use App\Modules\Competicoes\Domain\PontoRepository;
use App\Modules\Competicoes\Domain\ResultadoRepository;
use App\Modules\Resultados\Application\PontuacaoService;
use App\Modules\Resultados\Domain\PodioRepository;
use App\Shared\Application\TransactionRunner;
use InvalidArgumentException;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class ResultadoServiceTest extends TestCase
{
    public function testLancaResultadoDentroDoRunnerEDelegaAoRepositorio(): void
    {
        $repository = new ResultadoRepositoryFake();
        $runner = new TransactionRunnerFake();
        $service = new ResultadoService($repository, $runner, new PontuacaoService(new PodioRepositoryFake()));

        $resultado = $service->lancar(12, 'MM:2:0:N', 7, [
            ['id_equipe' => 101, 'gols' => 3],
            ['id_equipe' => 102, 'gols' => 1],
        ]);

        self::assertSame(['success' => true, 'message' => 'Resultado lançado!', 'id_jogo' => 12], $resultado);
        self::assertSame(1, $runner->calls);
        self::assertSame([
            12,
            'MM:2:0:N',
            7,
            [
                ['id_equipe' => 101, 'gols' => 3],
                ['id_equipe' => 102, 'gols' => 1],
            ],
        ], $repository->launchArguments);
    }

    public function testPontosOfflineNaoEscolhemSuaPropriaAutoria(): void
    {
        $repository = new ResultadoRepositoryFake();
        $runner = new TransactionRunnerFake();
        $pointsRepository = $this->createMock(PontoRepository::class);
        $receivedPoints = null;
        $pointsRepository->expects(self::once())
            ->method('persistirPontosOffline')
            ->with(12, self::callback(static function (array $points) use (&$receivedPoints): bool {
                $receivedPoints = $points;

                return true;
            }), 2);
        $pointsRepository->method('exigeVinculo')->willReturn(false);
        $service = new ResultadoService(
            $repository,
            $runner,
            new PontuacaoService(new PodioRepositoryFake()),
            $pointsRepository,
        );
        $points = [
            ['id_equipe' => 101, 'usuarios_id_usuario' => 42, 'chave_jogada' => 'offline-forged-author-1', 'registrado_por' => 99],
            ['id_equipe' => 101, 'usuarios_id_usuario' => 42, 'chave_jogada' => 'offline-forged-author-2', 'registrado_por' => 0],
            ['id_equipe' => 101, 'usuarios_id_usuario' => 42, 'chave_jogada' => 'offline-forged-author-3', 'registrado_por' => null],
            ['id_equipe' => 101, 'usuarios_id_usuario' => 42, 'chave_jogada' => 'offline-forged-author-4'],
        ];

        $service->lancar(12, null, 7, [
            ['id_equipe' => 101, 'gols' => 1],
            ['id_equipe' => 102, 'gols' => 0],
        ], $points, 2);

        self::assertSame($points, $receivedPoints);
    }

    public function testSincronizacaoDePontosOfflineExigeOperadorAutenticado(): void
    {
        $repository = new ResultadoRepositoryFake();
        $runner = new TransactionRunnerFake();
        $pointsRepository = $this->createMock(PontoRepository::class);
        $pointsRepository->expects(self::never())->method('persistirPontosOffline');
        $service = new ResultadoService(
            $repository,
            $runner,
            new PontuacaoService(new PodioRepositoryFake()),
            $pointsRepository,
        );

        $this->expectExceptionObject(new InvalidArgumentException('Operador inválido para sincronizar pontos offline.'));
        $service->lancar(12, null, 7, [
            ['id_equipe' => 101, 'gols' => 1],
            ['id_equipe' => 102, 'gols' => 0],
        ], [
            ['id_equipe' => 101, 'usuarios_id_usuario' => 42, 'chave_jogada' => 'offline-no-operator'],
        ], 0);
    }

    public function testResultadoSemEquipesNaoAbreTransacaoNemEscreve(): void
    {
        $repository = new ResultadoRepositoryFake();
        $runner = new TransactionRunnerFake();
        $service = new ResultadoService($repository, $runner, new PontuacaoService(new PodioRepositoryFake()));

        try {
            $service->lancar(12, null, 7, []);
            self::fail('Resultado sem equipes deveria ser rejeitado.');
        } catch (InvalidArgumentException) {
            self::assertSame(0, $runner->calls);
            self::assertNull($repository->launchArguments);
        }
    }

    public function testPlacarInvalidoNaoAbreTransacaoNemAlteraPontuacao(): void
    {
        $repository = new ResultadoRepositoryFake();
        $runner = new TransactionRunnerFake();
        $podium = new PodioRepositoryFake();
        $service = new ResultadoService($repository, $runner, new PontuacaoService($podium));

        try {
            $service->lancar(12, null, 7, [
                ['id_equipe' => 101, 'gols' => -1],
                ['id_equipe' => 102, 'gols' => 0],
            ]);
            self::fail('Placar inválido deveria ser rejeitado.');
        } catch (InvalidArgumentException) {
            self::assertSame(0, $runner->calls);
            self::assertSame([], $podium->calls);
        }
    }

    #[DataProvider('invalidScores')]
    public function testRejectsScoresThatWouldBeCoercedBeforeOpeningTransaction(mixed $score): void
    {
        $repository = new ResultadoRepositoryFake();
        $runner = new TransactionRunnerFake();
        $service = new ResultadoService($repository, $runner, new PontuacaoService(new PodioRepositoryFake()));

        try {
            $service->lancar(12, null, 7, [
                ['id_equipe' => 101, 'gols' => $score],
                ['id_equipe' => 102, 'gols' => 0],
            ]);
            self::fail('Placar decimal, não inteiro ou fora da faixa do banco deveria ser rejeitado.');
        } catch (InvalidArgumentException) {
            self::assertSame(0, $runner->calls);
            self::assertNull($repository->launchArguments);
        }
    }

    public static function invalidScores(): iterable
    {
        yield 'fractional number' => [3.9];
        yield 'negative fraction' => [-0.5];
        yield 'decimal string' => ['3.9'];
        yield 'boolean' => [true];
        yield 'array' => [[3]];
        yield 'above signed database integer range' => [2147483648];
    }

    public function testRejectsScalarResultRowsBeforeOpeningTransaction(): void
    {
        $repository = new ResultadoRepositoryFake();
        $runner = new TransactionRunnerFake();
        $service = new ResultadoService($repository, $runner, new PontuacaoService(new PodioRepositoryFake()));

        try {
            $service->lancar(12, null, 7, [
                ['id_equipe' => 101, 'gols' => 3],
                ['id_equipe' => 102, 'gols' => 1],
                'not-a-team-result',
            ]);
            self::fail('O item escalar não pode ser descartado do resultado.');
        } catch (InvalidArgumentException) {
            self::assertSame(0, $runner->calls);
            self::assertNull($repository->launchArguments);
        }
    }

    #[DataProvider('invalidTeamIds')]
    public function testRejectsTeamIdsThatWouldBeSilentlyCoerced(mixed $teamId): void
    {
        $repository = new ResultadoRepositoryFake();
        $runner = new TransactionRunnerFake();
        $service = new ResultadoService($repository, $runner, new PontuacaoService(new PodioRepositoryFake()));

        try {
            $service->lancar(12, null, 7, [
                ['id_equipe' => $teamId, 'gols' => 3],
                ['id_equipe' => 102, 'gols' => 1],
            ]);
            self::fail('O ID de equipe precisa ser um inteiro positivo dentro da faixa persistida.');
        } catch (InvalidArgumentException) {
            self::assertSame(0, $runner->calls);
            self::assertNull($repository->launchArguments);
        }
    }

    public static function invalidTeamIds(): iterable
    {
        yield 'fractional number' => [101.9];
        yield 'decimal string' => ['101.9'];
        yield 'boolean' => [true];
        yield 'array' => [[101]];
        yield 'above signed database integer range' => [2147483648];
    }

    public function testRejectsScalarOfflineEventsBeforeOpeningTransaction(): void
    {
        $repository = new ResultadoRepositoryFake();
        $runner = new TransactionRunnerFake();
        $pointsRepository = $this->createMock(PontoRepository::class);
        $pointsRepository->expects(self::never())->method('persistirPontosOffline');
        $service = new ResultadoService(
            $repository,
            $runner,
            new PontuacaoService(new PodioRepositoryFake()),
            $pointsRepository,
        );

        try {
            $service->lancar(12, null, 7, [
                ['id_equipe' => 101, 'gols' => 3],
                ['id_equipe' => 102, 'gols' => 1],
            ], ['not-an-offline-event'], 2);
            self::fail('O item escalar de pontos não pode ser descartado do lote.');
        } catch (InvalidArgumentException) {
            self::assertSame(0, $runner->calls);
            self::assertNull($repository->launchArguments);
        }
    }

    public function testNormalizesIntegerFormStringsBeforePassingResultsToPersistence(): void
    {
        $repository = new ResultadoRepositoryFake();
        $runner = new TransactionRunnerFake();
        $service = new ResultadoService($repository, $runner, new PontuacaoService(new PodioRepositoryFake()));

        $service->lancar(12, null, 7, [
            ['id_equipe' => 101, 'gols' => '03'],
            ['id_equipe' => 102, 'gols' => '1'],
        ]);

        self::assertSame(3, $repository->launchArguments[3][0]['gols']);
        self::assertSame(1, $repository->launchArguments[3][1]['gols']);
    }

    public function testMudancaDeVencedorReconciliaCreditoAntigoENovo(): void
    {
        $repository = new ResultadoRepositoryFake();
        $repository->status = 'Concluido';
        $repository->partidas = [
            ['equipes_id_equipe' => 101, 'resultado_partida' => 3],
            ['equipes_id_equipe' => 102, 'resultado_partida' => 1],
        ];
        $runner = new TransactionRunnerFake();
        $podium = new PodioRepositoryFake();
        $podium->credits = [
            ['posicao' => 1, 'id_turma' => 1, 'id_equipe' => 101, 'pontos' => 10, 'origem_registro' => 'novo'],
            ['posicao' => 2, 'id_turma' => 2, 'id_equipe' => 102, 'pontos' => 7, 'origem_registro' => 'novo'],
        ];
        $podium->parts = [
            ['equipes_id_equipe' => 102, 'resultado_partida' => 3],
            ['equipes_id_equipe' => 101, 'resultado_partida' => 1],
        ];
        $service = new ResultadoService($repository, $runner, new PontuacaoService($podium));

        $service->lancar(12, null, 7, [
            ['id_equipe' => 101, 'gols' => 1],
            ['id_equipe' => 102, 'gols' => 3],
        ]);

        self::assertSame(['resolve', 'lock', 'load', 'persist', 'load', 'rebuild'], $repository->calls);
        self::assertSame(['context', 'credits', 'parts', 'third', 'team', 'team', 'replace', 'delta'], $podium->calls);
        self::assertSame([1 => -3, 2 => 3], $podium->lastDeltas);
    }

    public function testFalhaNoAvancoInterrompeAntesDaPontuacao(): void
    {
        $repository = new ResultadoRepositoryFake();
        $repository->advanceFailure = new \RuntimeException('falha de avanço');
        $runner = new TransactionRunnerFake();
        $podium = new PodioRepositoryFake();
        $service = new ResultadoService($repository, $runner, new PontuacaoService($podium));

        try {
            $service->lancar(12, null, 7, [
                ['id_equipe' => 101, 'gols' => 3],
                ['id_equipe' => 102, 'gols' => 1],
            ]);
            self::fail('A falha de avanço deveria ser relançada.');
        } catch (\RuntimeException $exception) {
            self::assertSame('falha de avanço', $exception->getMessage());
        }

        self::assertSame([], $podium->calls);
    }

    public function testModalidadeIndividualNaoPodeSerConcluidaPeloFluxoDePlacar(): void
    {
        $repository = new ResultadoRepositoryFake();
        $repository->modalityType = 2;
        $runner = new TransactionRunnerFake();
        $podium = new PodioRepositoryFake();
        $service = new ResultadoService($repository, $runner, new PontuacaoService($podium));

        try {
            $service->lancar(12, null, 7, [
                ['id_equipe' => 101, 'gols' => 3],
                ['id_equipe' => 102, 'gols' => 1],
            ]);
            self::fail('A conclusão genérica de modalidade individual deveria ser recusada.');
        } catch (InvalidArgumentException $exception) {
            self::assertStringContainsString('lançamento do pódio', $exception->getMessage());
        }

        self::assertSame(['resolve', 'lock'], $repository->calls);
        self::assertSame([], $podium->calls);
    }
}

final class ResultadoRepositoryFake implements ResultadoRepository
{
    /** @var array<int, mixed>|null */
    public ?array $launchArguments = null;
    public array $calls = [];
    public string $status = 'Agendado';
    /** @var list<array{equipes_id_equipe:int,resultado_partida:int}> */
    public array $partidas = [
        ['equipes_id_equipe' => 101, 'resultado_partida' => 3],
        ['equipes_id_equipe' => 102, 'resultado_partida' => 1],
    ];
    public ?\Throwable $advanceFailure = null;
    public int $modalityType = 1;

    public function inspectResult(int $gameId, ?string $tag, int $modalityId): array
    {
        return [
            'game_id' => $gameId,
            'modality_id' => $modalityId,
            'edition_id' => 1,
            'tag' => $tag,
        ];
    }

    /** @param array<int, array<string, mixed>> $results */
    public function resolveAndValidate(int $gameId, ?string $tag, int $modalityId, array $results): int
    {
        $this->calls[] = 'resolve';
        $this->launchArguments = [$gameId, $tag, $modalityId, $results];
        return $gameId;
    }

    public function lockGame(int $gameId): array
    {
        $this->calls[] = 'lock';
        return [
            'status_jogo' => $this->status,
            'nome_jogo' => 'MM:2:0:N',
            'modalidade_id' => 7,
            'interclasse_id' => 1,
            'tipos_modalidades_id_tipo_modalidade' => $this->modalityType,
            'nome_tipo_modalidade' => $this->modalityType === 2 ? 'Individual' : 'Mata-Mata',
        ];
    }

    public function carregarPartidas(int $gameId): array
    {
        $this->calls[] = 'load';
        return $this->partidas;
    }

    public function persistirPlacar(int $gameId, array $results): void
    {
        $this->calls[] = 'persist';
        foreach ($results as $result) {
            foreach ($this->partidas as $index => $partida) {
                if ($partida['equipes_id_equipe'] === (int) $result['id_equipe']) {
                    $this->partidas[$index]['resultado_partida'] = (int) $result['gols'];
                }
            }
        }
    }

    public function concluirJogo(int $gameId): void
    {
        $this->calls[] = 'conclude';
    }

    public function avancarChaveamento(int $gameId): void
    {
        $this->calls[] = 'advance';
        if ($this->advanceFailure !== null) {
            throw $this->advanceFailure;
        }
    }

    public function reconstruirChaveamento(int $modalityId, int $largura): void
    {
        $this->calls[] = 'rebuild';
    }
}

final class PodioRepositoryFake implements PodioRepository
{
    public array $calls = [];
    public array $credits = [];
    public array $parts = [];
    public array $lastDeltas = [];

    public function carregarContextoJogo(int $gameId): ?array
    {
        $this->calls[] = 'context';
        return [
            'nome_jogo' => 'MM:2:0:N',
            'modalidade_id' => 7,
            'interclasse_id' => 1,
            'pontos' => [1 => 10, 2 => 7, 3 => 5],
        ];
    }

    public function carregarPartidasJogo(int $gameId): array
    {
        $this->calls[] = 'parts';
        return $this->parts !== [] ? $this->parts : [
            ['equipes_id_equipe' => 101, 'resultado_partida' => 3],
            ['equipes_id_equipe' => 102, 'resultado_partida' => 1],
        ];
    }

    public function carregarTerceiroLugarDaFinal(int $gameId): ?int
    {
        $this->calls[] = 'third';
        return null;
    }

    public function carregarBloqueados(int $interclasseId, int $modalidadeId): array
    {
        $this->calls[] = 'credits';
        return $this->credits;
    }

    public function substituirPosicoes(int $interclasseId, int $modalidadeId, array $posicoes): void
    {
        $this->calls[] = 'replace';
    }

    public function aplicarDeltas(array $deltas): void
    {
        $this->calls[] = 'delta';
        $this->lastDeltas = $deltas;
    }

    public function turmaDaEquipe(int $equipeId, int $modalidadeId): ?int
    {
        $this->calls[] = 'team';
        return $equipeId === 101 ? 1 : 2;
    }

    public function diagnosticar(): array
    {
        return [];
    }

    public function adotar(array $creditos): void
    {
    }

    public function invalidarFontesSemOrigemAtual(int $interclasseId, int $modalidadeId): void
    {
    }

    public function pontosPadraoEdicao(int $interclasseId): array
    {
        return [1 => 10, 2 => 7, 3 => 5];
    }

    public function carregarPodioModalidade(int $interclasseId, int $modalidadeId): array
    {
        return [];
    }
}

final class TransactionRunnerFake implements TransactionRunner
{
    public int $calls = 0;

    public function run(callable $callback): mixed
    {
        $this->calls++;

        return $callback();
    }
}
