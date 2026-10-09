<?php

declare(strict_types=1);

namespace Tests\Unit\Modules\Resultados;

use App\Modules\Resultados\Application\PontuacaoService;
use App\Modules\Resultados\Domain\PodioRepository;
use PHPUnit\Framework\TestCase;

final class PontuacaoServiceTest extends TestCase
{
    public function testFinalConcedeAutomaticamenteOterceiroLugarDerivadoDaSemifinal(): void
    {
        $repository = new PontuacaoPodioRepositoryFake();
        $repository->thirdTeamId = 103;

        (new PontuacaoService($repository))->reconciliarJogo(12);

        self::assertSame([
            [
                'posicao' => 1,
                'id_turma' => 1,
                'id_equipe' => 101,
                'id_usuario' => null,
                'id_jogo' => 12,
                'pontos' => 10,
                'ativo' => 1,
                'origem_registro' => 'novo',
            ],
            [
                'posicao' => 2,
                'id_turma' => 2,
                'id_equipe' => 102,
                'id_usuario' => null,
                'id_jogo' => 12,
                'pontos' => 7,
                'ativo' => 1,
                'origem_registro' => 'novo',
            ],
            [
                'posicao' => 3,
                'id_turma' => 3,
                'id_equipe' => 103,
                'id_usuario' => null,
                'id_jogo' => 12,
                'pontos' => 5,
                'ativo' => 1,
                'origem_registro' => 'novo',
            ],
        ], $repository->replaced);
        self::assertSame([1 => 10, 2 => 7, 3 => 5], $repository->deltas);
    }

    public function testSalvarPodioManualAppliesPositionsAndDeltas(): void
    {
        $repository = new PontuacaoPodioRepositoryFake();
        $service = new PontuacaoService($repository);
        $service->salvarPodioManual(1, 7, [
            ['posicao' => 1, 'id_equipe' => 101],
            ['posicao' => 2, 'id_equipe' => 102],
            ['posicao' => 3, 'id_turma' => 3],
        ]);

        self::assertCount(3, $repository->replaced);
        self::assertSame(1, $repository->replaced[0]['posicao']);
        self::assertSame(1, $repository->replaced[0]['id_turma']);
        self::assertSame('manual', $repository->replaced[0]['origem_registro']);
        self::assertSame([1 => 10, 2 => 7, 3 => 5], $repository->deltas);
    }
}

final class PontuacaoPodioRepositoryFake implements PodioRepository
{
    public ?int $thirdTeamId = null;
    public array $replaced = [];
    public array $deltas = [];

    public function carregarContextoJogo(int $gameId): ?array
    {
        return [
            'nome_jogo' => 'MM:2:0:N',
            'modalidade_id' => 7,
            'interclasse_id' => 1,
            'pontos' => [1 => 10, 2 => 7, 3 => 5],
        ];
    }

    public function carregarPartidasJogo(int $gameId): array
    {
        return [
            ['equipes_id_equipe' => 101, 'resultado_partida' => 3],
            ['equipes_id_equipe' => 102, 'resultado_partida' => 1],
        ];
    }

    public function carregarTerceiroLugarDaFinal(int $gameId): ?int
    {
        return $this->thirdTeamId;
    }

    public function carregarBloqueados(int $interclasseId, int $modalidadeId): array
    {
        return [];
    }

    public function substituirPosicoes(int $interclasseId, int $modalidadeId, array $posicoes): void
    {
        $this->replaced = $posicoes;
    }

    public function aplicarDeltas(array $deltas): void
    {
        $this->deltas = $deltas;
    }

    public function turmaDaEquipe(int $equipeId, int $modalidadeId): ?int
    {
        return $equipeId - 100;
    }

    public function diagnosticar(): array
    {
        return [];
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
