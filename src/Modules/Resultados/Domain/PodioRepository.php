<?php

declare(strict_types=1);

namespace App\Modules\Resultados\Domain;

interface PodioRepository
{
    /** @return array{nome_jogo:string,modalidade_id:int,interclasse_id:int,pontos:array{1:int,2:int,3:int}}|null */
    public function carregarContextoJogo(int $gameId): ?array;

    /** @return list<array{equipes_id_equipe:int,resultado_partida:int}> */
    public function carregarPartidasJogo(int $gameId): array;

    /** Retorna o time derrotado pelo campeão em uma semifinal, quando aplicável. */
    public function carregarTerceiroLugarDaFinal(int $gameId): ?int;

    /** @return list<array<string, mixed>> */
    public function carregarBloqueados(int $interclasseId, int $modalidadeId): array;

    /** @param list<array<string, mixed>> $posicoes */
    public function substituirPosicoes(int $interclasseId, int $modalidadeId, array $posicoes): void;

    /** @param array<int, int> $deltas */
    public function aplicarDeltas(array $deltas): void;

    public function turmaDaEquipe(int $equipeId, int $modalidadeId): ?int;

    /** @return array<string, mixed> */
    public function diagnosticar(): array;

    /** @return array<int, int> */
    public function pontosPadraoEdicao(int $editionId): array;

    /** @return list<array<string, mixed>> */
    public function carregarPodioModalidade(int $editionId, int $modalityId): array;

    public function invalidarFontesSemOrigemAtual(int $interclasseId, int $modalidadeId): void;
}
