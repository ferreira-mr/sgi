<?php

declare(strict_types=1);

namespace App\Modules\Resultados\Application;

use App\Modules\Competicoes\Domain\ChaveamentoRules;
use App\Modules\Resultados\Domain\PodioRepository;
use RuntimeException;

final class PontuacaoService
{
    public function __construct(private readonly PodioRepository $repository)
    {
    }

    public function reconciliarJogo(int $gameId, bool $correction = false): void
    {
        $game = $this->repository->carregarContextoJogo($gameId);
        if ($game === null) {
            return;
        }
        $meta = ChaveamentoRules::parse($game['nome_jogo']);
        $isFinal = $meta !== null && $meta['largura'] === 2 && !isset($meta['posicao']);
        $isLegacyThirdPlace = $meta !== null && (int) ($meta['posicao'] ?? 0) === 3;
        if (!$isFinal && !$isLegacyThirdPlace) {
            return;
        }
        $positions = $isFinal ? [1, 2, 3] : [3];
        $old = $this->repository->carregarBloqueados($game['interclasse_id'], $game['modalidade_id']);
        $oldRelevant = array_values(array_filter(
            $old,
            static fn (array $credit): bool => in_array((int) ($credit['posicao'] ?? 0), $positions, true),
        ));
        $oldByPosition = [];
        foreach ($oldRelevant as $credit) {
            $oldByPosition[(int) $credit['posicao']] = $credit;
        }
        $parts = $this->repository->carregarPartidasJogo($gameId);
        usort($parts, static function (array $a, array $b): int {
            $scoreOrder = (int) $b['resultado_partida'] <=> (int) $a['resultado_partida'];
            return $scoreOrder !== 0 ? $scoreOrder : (int) $a['equipes_id_equipe'] <=> (int) $b['equipes_id_equipe'];
        });
        $new = [];
        $thirdPlaceTeamId = $isFinal ? $this->repository->carregarTerceiroLugarDaFinal($gameId) : null;
        foreach ($positions as $index => $position) {
            if ($isFinal && $position === 3) {
                $teamId = $thirdPlaceTeamId ?? 0;
                if ($teamId <= 0) {
                    $existing = $oldByPosition[$position] ?? null;
                    if ($existing === null) {
                        continue;
                    }
                    $new[] = array_replace($existing, [
                        'posicao' => 3,
                        'id_jogo' => $gameId,
                        'ativo' => 0,
                    ]);
                    continue;
                }
            } else {
                $teamId = (int) ($parts[$index]['equipes_id_equipe'] ?? 0);
            }
            $classId = $this->repository->turmaDaEquipe($teamId, $game['modalidade_id']);
            if ($teamId <= 0 || $classId === null) {
                throw new RuntimeException('Não foi possível identificar o beneficiário do pódio.');
            }
            // A correção precisa de uma origem anterior para as posições
            // definidas pelo placar. O terceiro lugar derivado pode ser
            // criado durante a transição de partidas POS:3 legadas.
            if ($correction && $position !== 3 && !isset($oldByPosition[$position])) {
                throw new RuntimeException('Pódio sem origem atual não pode ser retificado.');
            }
            $existing = $oldByPosition[$position] ?? null;
            $new[] = [
                'posicao' => $position,
                'id_turma' => $classId,
                'id_equipe' => $teamId,
                'id_usuario' => null,
                'id_jogo' => $gameId,
                'pontos' => $existing !== null ? (int) $existing['pontos'] : $game['pontos'][$position],
                'ativo' => 1,
                'origem_registro' => $existing !== null ? (string) $existing['origem_registro'] : 'novo',
            ];
        }
        $this->repository->substituirPosicoes($game['interclasse_id'], $game['modalidade_id'], $new);
        $this->repository->aplicarDeltas(\App\Modules\Resultados\Domain\PodioRules::deltas($oldRelevant, $new));
    }

    public function invalidarSemOrigemAtual(int $editionId, int $modalityId): void
    {
        $this->repository->invalidarFontesSemOrigemAtual($editionId, $modalityId);
    }

    /**
     * @param list<array<string, mixed>> $podioManual
     */
    public function salvarPodioManual(int $editionId, int $modalityId, array $podioManual): void
    {
        if ($editionId <= 0 || $modalityId <= 0) {
            throw new \InvalidArgumentException('Edição e modalidade são obrigatórias.');
        }

        $pontosPadrao = $this->repository->pontosPadraoEdicao($editionId);
        $old = $this->repository->carregarBloqueados($editionId, $modalityId);
        $new = [];

        foreach ($podioManual as $item) {
            $posicao = (int) ($item['posicao'] ?? 0);
            if (!in_array($posicao, [1, 2, 3], true)) {
                continue;
            }
            $teamId = isset($item['id_equipe']) && (int) $item['id_equipe'] > 0 ? (int) $item['id_equipe'] : null;
            $classId = isset($item['id_turma']) && (int) $item['id_turma'] > 0 ? (int) $item['id_turma'] : null;

            if ($classId === null && $teamId !== null) {
                $classId = $this->repository->turmaDaEquipe($teamId, $modalityId);
            }
            if ($classId === null || $classId <= 0) {
                continue;
            }

            $pontos = (int) ($pontosPadrao[$posicao] ?? ($posicao === 1 ? 10 : ($posicao === 2 ? 7 : 5)));
            $new[] = [
                'posicao' => $posicao,
                'id_turma' => $classId,
                'id_equipe' => $teamId,
                'id_usuario' => isset($item['id_usuario']) && (int) $item['id_usuario'] > 0 ? (int) $item['id_usuario'] : null,
                'id_jogo' => isset($item['id_jogo']) && (int) $item['id_jogo'] > 0 ? (int) $item['id_jogo'] : null,
                'pontos' => $pontos,
                'ativo' => 1,
                'origem_registro' => 'manual',
            ];
        }

        $this->repository->substituirPosicoes($editionId, $modalityId, $new);
        $this->repository->aplicarDeltas(\App\Modules\Resultados\Domain\PodioRules::deltas($old, $new));
    }

    /** @return list<array<string, mixed>> */
    public function carregarPodioModalidade(int $editionId, int $modalityId): array
    {
        return $this->repository->carregarPodioModalidade($editionId, $modalityId);
    }
}
