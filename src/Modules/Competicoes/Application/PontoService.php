<?php

declare(strict_types=1);

namespace App\Modules\Competicoes\Application;

use App\Modules\Competicoes\Domain\PontoRepository;
use App\Modules\Competicoes\Domain\PontoRules;
use InvalidArgumentException;

final class PontoService
{
    public function __construct(private readonly PontoRepository $pontos)
    {
    }

    public function edicaoDoJogo(int $gameId): ?int
    {
        return $gameId > 0 ? $this->pontos->edicaoDoJogo($gameId) : null;
    }

    public function edicaoDaEquipe(int $teamId): ?int
    {
        return $teamId > 0 ? $this->pontos->edicaoDaEquipe($teamId) : null;
    }

    public function edicaoDoPonto(int $pointId): ?int
    {
        return $pointId > 0 ? $this->pontos->edicaoDoPonto($pointId) : null;
    }

    /** @return list<array<string, mixed>> */
    public function listarAtletas(int $gameId, int $teamId): array
    {
        if ($teamId <= 0) {
            throw new InvalidArgumentException('A equipe deve ser válida.');
        }
        return $this->pontos->listarAtletas($gameId, $teamId);
    }

    /** @return list<array<string, mixed>> */
    public function listarPontos(int $gameId, ?int $teamId = null): array
    {
        if ($gameId <= 0) {
            throw new InvalidArgumentException('O jogo deve ser válido.');
        }
        return $this->pontos->listarPontos($gameId, $teamId !== null && $teamId > 0 ? $teamId : null);
    }

    /** @param array<string, mixed> $data @return array<string, mixed> */
    public function registrar(array $data, int $operatorId): array
    {
        $gameId = (int) ($data['jogos_id_jogo'] ?? $data['id_jogo'] ?? 0);
        $matchId = (int) ($data['id_partida'] ?? $data['partidas_id_partida'] ?? 0);
        $teamId = (int) ($data['equipes_id_equipe'] ?? $data['id_equipe'] ?? 0);
        $userId = (int) ($data['usuarios_id_usuario'] ?? $data['id_usuario'] ?? 0);
        $key = trim((string) ($data['chave_jogada'] ?? ''));

        if ($userId <= 0) {
            throw new InvalidArgumentException('Selecione o estudante responsável pela jogada para confirmar o ponto.');
        }
        if ($gameId <= 0 || $matchId <= 0 || $teamId <= 0) {
            throw new InvalidArgumentException('Jogo, partida, equipe e atleta são obrigatórios.');
        }
        if ($operatorId <= 0) {
            throw new InvalidArgumentException('Operador inválido.');
        }
        if ($key === '' || strlen($key) < 12 || strlen($key) > 180) {
            throw new InvalidArgumentException('A identificação da jogada é obrigatória e deve ser válida.');
        }

        $existing = $this->pontos->buscarPorChave($key);
        if ($existing !== null) {
            $same = (int) ($existing['jogos_id_jogo'] ?? 0) === $gameId
                && (int) ($existing['partidas_id_partida'] ?? 0) === $matchId
                && (int) ($existing['equipes_id_equipe'] ?? 0) === $teamId
                && (int) ($existing['usuarios_id_usuario'] ?? 0) === $userId;
            if (!$same) {
                throw new InvalidArgumentException('A identificação da jogada já foi usada em outro lançamento.');
            }
            return $existing;
        }

        $context = $this->pontos->contextoPartida($gameId, $matchId, $teamId);
        if ($context === null) {
            throw new InvalidArgumentException('A equipe não participa desta partida.');
        }
        if (!in_array((string) ($context['status_jogo'] ?? ''), ['Iniciado', 'Pausado'], true)) {
            throw new InvalidArgumentException('O ponto só pode ser lançado durante uma partida em andamento.');
        }
        if ((int) ($context['individual'] ?? 0) === 1) {
            throw new InvalidArgumentException('Modalidades individuais não aceitam pontos de partida.');
        }
        if (!$this->pontos->atletaElegivel($userId, $gameId, $teamId)) {
            throw new InvalidArgumentException('O atleta não está inscrito e ativo nesta equipe para esta partida.');
        }

        return $this->pontos->inserir([
            'jogos_id_jogo' => $gameId,
            'partidas_id_partida' => $matchId,
            'equipes_id_equipe' => $teamId,
            'usuarios_id_usuario' => $userId,
            'chave_jogada' => $key,
            'registrado_por' => $operatorId,
        ]);
    }

    /** @return array<string, mixed> */
    public function anular(int $pointId, int $operatorId): array
    {
        if ($pointId <= 0 || $operatorId <= 0) {
            throw new InvalidArgumentException('Ponto ou operador inválido.');
        }
        $point = $this->pontos->buscar($pointId);
        if ($point === null) {
            throw new InvalidArgumentException('Ponto não encontrado.');
        }
        if ((string) ($point['status_artilheiro'] ?? '') === 'anulado') {
            return $point;
        }
        if ((int) ($point['conta_no_placar'] ?? 0) !== 1) {
            return $point;
        }
        if (!PontoRules::permiteAnulacao((string) ($point['status_jogo'] ?? ''))) {
            throw new InvalidArgumentException('O ponto só pode ser anulado durante a partida.');
        }
        return $this->pontos->anular($pointId, $operatorId, (string) $point['status_jogo']);
    }
}
