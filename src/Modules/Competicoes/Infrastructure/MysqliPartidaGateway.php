<?php

declare(strict_types=1);

namespace App\Modules\Competicoes\Infrastructure;

use App\Modules\Competicoes\Application\JogoResolucaoAmbiguaException;
use App\Modules\Competicoes\Application\JogoNaoEncontradoException;
use App\Modules\Competicoes\Application\ModalidadeNaoEncontradaException;
use App\Modules\Competicoes\Application\ResultadoService;
use App\Modules\Competicoes\Domain\ChaveamentoRules;
use App\Modules\Competicoes\Domain\ResultadoRepository;
use App\Modules\Resultados\Application\PontuacaoService;
use App\Modules\Resultados\Infrastructure\MysqliPodioRepository;
use App\Shared\Database\MysqliTransactionRunner;
use App\Shared\Database\SqlFilters;
use mysqli;
use RuntimeException;

final class MysqliPartidaGateway implements ResultadoRepository
{
    public function __construct(private readonly mysqli $connection)
    {
    }

    /** @param array<string, mixed> $filters @return list<array<string, mixed>> */
    public function list(array $filters): array
    {
        $filter = SqlFilters::aplicarFiltrosPartidas($filters);
        $sql = "SELECT p.id_partida, p.equipes_id_equipe, p.resultado_partida,
                       j.id_jogo, j.nome_jogo, j.status_jogo, j.data_jogo,
                       j.inicio_jogo, j.termino_jogo,
                       j.modalidades_id_modalidade, t.id_turma, t.nome_turma,
                       t.nome_fantasia_turma, m.nome_modalidade,
                       m.categorias_id_categoria, c.nome_categoria, l.nome_local
                FROM partidas p
                INNER JOIN jogos j ON p.jogos_id_jogo = j.id_jogo
                INNER JOIN equipes e ON p.equipes_id_equipe = e.id_equipe
                INNER JOIN turmas t ON e.turmas_id_turma = t.id_turma
                INNER JOIN modalidades m ON j.modalidades_id_modalidade = m.id_modalidade
                INNER JOIN categorias c ON c.id_categoria = m.categorias_id_categoria
                LEFT JOIN locais l ON l.id_local = j.locais_id_local
                WHERE 1=1" . $filter['sql'];
        $statement = $this->prepare($sql);
        if ($filter['params'] !== []) {
            $statement->bind_param($filter['types'], ...$filter['params']);
        }
        if (!$statement->execute()) {
            $message = $statement->error;
            $statement->close();
            throw new RuntimeException($message !== '' ? $message : 'Não foi possível consultar partidas.');
        }
        $rows = $statement->get_result()->fetch_all(MYSQLI_ASSOC);
        $statement->close();
        return $rows;
    }

    public function editionOfModality(int $id): ?int
    {
        $row = $this->one('SELECT interclasses_id_interclasse AS edition_id FROM modalidades WHERE id_modalidade = ? LIMIT 1', 'i', [$id]);
        return $row === null ? null : (int) $row['edition_id'];
    }

    /** @return array{game_id:int,modality_id:int,edition_id:int,tag:?string} */
    public function inspectResult(int $gameId, ?string $tag, int $modalityId): array
    {
        if ($gameId > 0) {
            $game = $this->one(
                'SELECT j.id_jogo, j.modalidades_id_modalidade AS modality_id,
                        m.interclasses_id_interclasse AS edition_id
                 FROM jogos j
                 INNER JOIN modalidades m ON m.id_modalidade = j.modalidades_id_modalidade
                 WHERE j.id_jogo = ?
                 LIMIT 1',
                'i',
                [$gameId],
            );
            if ($game === null) {
                throw new JogoNaoEncontradoException('Jogo não encontrado.');
            }
            $realModality = (int) $game['modality_id'];
            if ($modalityId > 0 && $modalityId !== $realModality) {
                throw new \InvalidArgumentException('A modalidade não pertence ao jogo informado.');
            }
            return [
                'game_id' => $gameId,
                'modality_id' => $realModality,
                'edition_id' => (int) $game['edition_id'],
                'tag' => null,
            ];
        }
        if ($gameId === 0) {
            throw new \InvalidArgumentException('Identificador de jogo temporário inválido.');
        }
        if ($modalityId <= 0) {
            throw new \InvalidArgumentException('A modalidade é obrigatória para jogo temporário.');
        }
        $edition = $this->editionOfModality($modalityId);
        if ($edition === null) {
            throw new ModalidadeNaoEncontradaException('Modalidade não encontrada.');
        }
        $normalizedTag = trim((string) $tag);
        $tagIdentity = ChaveamentoRules::parse($normalizedTag);
        if ($tagIdentity === null || strlen($normalizedTag) > 45) {
            throw new \InvalidArgumentException('A tag do jogo temporário é inválida.');
        }
        if (!empty($tagIdentity['planejado'])) {
            if ((int) ($tagIdentity['modalidade'] ?? 0) !== $modalityId) {
                throw new \InvalidArgumentException('A tag planejada não pertence à modalidade informada.');
            }
            return [
                'game_id' => 0,
                'modality_id' => $modalityId,
                'edition_id' => $edition,
                'tag' => $normalizedTag,
            ];
        }
        $existing = MysqliChaveamentoRepository::buscarJogoPorTag($this->connection, $modalityId, $normalizedTag);
        return [
            'game_id' => $existing === null ? 0 : (int) $existing['id_jogo'],
            'modality_id' => $modalityId,
            'edition_id' => $edition,
            'tag' => $normalizedTag,
        ];
    }

    /** @return list<array{id_equipe:int,gols:int}> */
    public function scoresOfGame(int $gameId): array
    {
        $statement = $this->prepare(
            'SELECT equipes_id_equipe, resultado_partida
             FROM partidas
             WHERE jogos_id_jogo = ?
             ORDER BY id_partida',
        );
        $statement->bind_param('i', $gameId);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível consultar o placar do jogo.');
        }
        $rows = $statement->get_result()->fetch_all(MYSQLI_ASSOC);
        $statement->close();
        return array_map(
            static fn (array $row): array => [
                'id_equipe' => (int) $row['equipes_id_equipe'],
                'gols' => (int) $row['resultado_partida'],
            ],
            $rows,
        );
    }

    /** @param list<array<string, mixed>> $results */
    public function resolveAndValidate(int $gameId, ?string $gameTag, int $modalityId, array $results): int
    {
        return $this->resolveGame($gameId, $gameTag, $modalityId, $results);
    }

    /** @return array{status_jogo:string,nome_jogo:string,modalidade_id:int,interclasse_id:int,tipos_modalidades_id_tipo_modalidade:int} */
    public function lockGame(int $gameId): array
    {
        $row = $this->one(
            'SELECT j.status_jogo, j.nome_jogo, j.modalidades_id_modalidade AS modalidade_id,
                    m.interclasses_id_interclasse AS interclasse_id,
                    m.tipos_modalidades_id_tipo_modalidade, tm.nome_tipo_modalidade
             FROM jogos j
             INNER JOIN modalidades m ON m.id_modalidade = j.modalidades_id_modalidade
             LEFT JOIN tipos_modalidades tm ON tm.id_tipo_modalidade = m.tipos_modalidades_id_tipo_modalidade
             WHERE j.id_jogo = ? LIMIT 1 FOR UPDATE',
            'i',
            [$gameId],
        );
        if ($row === null) {
            throw new JogoNaoEncontradoException('Jogo não encontrado.');
        }
        return [
            'status_jogo' => (string) $row['status_jogo'],
            'nome_jogo' => (string) $row['nome_jogo'],
            'modalidade_id' => (int) $row['modalidade_id'],
            'interclasse_id' => (int) $row['interclasse_id'],
            'tipos_modalidades_id_tipo_modalidade' => (int) $row['tipos_modalidades_id_tipo_modalidade'],
            'nome_tipo_modalidade' => (string) ($row['nome_tipo_modalidade'] ?? ''),
            'tipo_competicao' => \App\Modules\Competicoes\Domain\TipoCompeticaoRules::resolve($row),
        ];
    }

    /** @return list<array{equipes_id_equipe:int,resultado_partida:int}> */
    public function carregarPartidas(int $gameId): array
    {
        return MysqliChaveamentoRepository::carregarPartidasJogo($this->connection, $gameId);
    }

    /** @param list<array<string, mixed>> $results */
    public function persistirPlacar(int $gameId, array $results): void
    {
        foreach ($results as $result) {
            $teamId = (int) ($result['id_equipe'] ?? 0);
            MysqliChaveamentoRepository::garantirPartidaEquipe($this->connection, $gameId, $teamId);
            $statement = $this->prepare('UPDATE partidas SET resultado_partida = ? WHERE jogos_id_jogo = ? AND equipes_id_equipe = ?');
            $score = (int) ($result['gols'] ?? 0);
            $statement->bind_param('iii', $score, $gameId, $teamId);
            if (!$statement->execute()) {
                $statement->close();
                throw new RuntimeException('Não foi possível registrar o placar.');
            }
            $statement->close();
        }
    }

    public function concluirJogo(int $gameId): void
    {
        $statement = $this->prepare("UPDATE jogos SET status_jogo = 'Concluido' WHERE id_jogo = ?");
        $statement->bind_param('i', $gameId);
        $statement->execute();
        $statement->close();
    }

    public function avancarChaveamento(int $gameId): void
    {
        if ((new MysqliCronogramaRepository($this->connection))->advancePlannedFromGame($gameId)) {
            return;
        }
        MysqliChaveamentoRepository::chaveamentoProcessarAvanco($this->connection, $gameId);
    }

    public function reconstruirChaveamento(int $modalityId, int $largura): void
    {
        if ((new MysqliCronogramaRepository($this->connection))->rebuildPlannedFromRound($modalityId, $largura)) {
            return;
        }
        MysqliChaveamentoRepository::chaveamentoRebuildFromRound($this->connection, $modalityId, $largura);
    }

    /** @param list<array<string, mixed>> $results @param list<array<string, mixed>> $points */
    public function launch(int $gameId, ?string $gameTag, int $modalityId, array $results, array $points = [], int $operatorId = 0): array
    {
        return (new ResultadoService(
            $this,
            new MysqliTransactionRunner($this->connection),
            new PontuacaoService(new MysqliPodioRepository($this->connection)),
            new MysqliPontoRepository($this->connection),
        ))->lancar($gameId, $gameTag, $modalityId, $results, $points, $operatorId);
    }

    private function resolveGame(int $gameId, ?string $tag, int $modalityId, array $results): int
    {
        $context = $this->inspectResult($gameId, $tag, $modalityId);
        $this->validateResultParticipants(
            $results,
            $context['modality_id'],
            $context['edition_id'],
            $context['game_id'],
        );
        if ($context['game_id'] > 0) {
            return $context['game_id'];
        }

        $teamIds = $this->teamIds($results);
        $tagValue = $context['tag'];
        if ($tagValue !== null && $tagValue !== '') {
            $plannedGameId = (new MysqliCronogramaRepository($this->connection))->materializePlannedGameForResult(
                $context['edition_id'],
                $context['modality_id'],
                $tagValue,
                $teamIds,
            );
            if ($plannedGameId !== null) {
                return $plannedGameId;
            }
        }
        $candidates = $this->findCandidateGames(
            $context['modality_id'],
            $context['edition_id'],
            $teamIds,
        );
        if (count($candidates) > 1) {
            throw new JogoResolucaoAmbiguaException('Há mais de um jogo compatível para a sincronização.');
        }
        if ($candidates !== []) {
            return $candidates[0];
        }

        if ($tagValue === null || $tagValue === '') {
            throw new RuntimeException('Não foi possível identificar a tag do jogo temporário.');
        }
        $materializedModality = $context['modality_id'];
        $statement = $this->prepare("INSERT INTO jogos (nome_jogo, data_jogo, inicio_jogo, termino_jogo, status_jogo, modalidades_id_modalidade, locais_id_local) VALUES (?, NULL, NULL, NULL, 'Agendado', ?, NULL)");
        $statement->bind_param('si', $tagValue, $materializedModality);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível materializar o jogo temporário.');
        }
        $id = (int) $this->connection->insert_id;
        $statement->close();
        MysqliChaveamentoRepository::aplicarReservaAgenda($this->connection, $materializedModality, $tagValue, $id);
        return $id;
    }

    /** @param list<array<string, mixed>> $results */
    private function validateResultParticipants(array $results, int $modalityId, int $editionId, int $gameId): void
    {
        $teamIds = $this->teamIds($results);
        if ($teamIds === []) {
            throw new \InvalidArgumentException('Nenhuma equipe foi informada para o resultado.');
        }
        $placeholders = implode(',', array_fill(0, count($teamIds), '?'));
        $types = 'ii' . str_repeat('i', count($teamIds));
        $params = array_merge([$modalityId, $editionId], $teamIds);
        $statement = $this->prepare(
            'SELECT e.id_equipe
             FROM equipes e
             INNER JOIN modalidades m ON m.id_modalidade = e.modalidades_id_modalidade
             WHERE e.modalidades_id_modalidade = ?
               AND m.interclasses_id_interclasse = ?
               AND e.id_equipe IN (' . $placeholders . ')',
        );
        $statement->bind_param($types, ...$params);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível validar as equipes do resultado.');
        }
        $rows = $statement->get_result()->fetch_all(MYSQLI_ASSOC);
        $statement->close();
        $validIds = array_map(static fn (array $row): int => (int) $row['id_equipe'], $rows);
        if (count($validIds) !== count($teamIds)) {
            throw new \InvalidArgumentException('Todas as equipes devem pertencer à modalidade e à edição informadas.');
        }
        if ($gameId <= 0) {
            return;
        }
        $countStatement = $this->prepare('SELECT COUNT(*) FROM partidas WHERE jogos_id_jogo = ?');
        $countStatement->bind_param('i', $gameId);
        if (!$countStatement->execute()) {
            $countStatement->close();
            throw new RuntimeException('Não foi possível consultar os participantes do jogo.');
        }
        $participantCount = (int) $countStatement->get_result()->fetch_column();
        $countStatement->close();
        if ($participantCount === 0) {
            return;
        }
        $placeholders = implode(',', array_fill(0, count($teamIds), '?'));
        $types = 'i' . str_repeat('i', count($teamIds));
        $params = array_merge([$gameId], $teamIds);
        $statement = $this->prepare(
            'SELECT equipes_id_equipe FROM partidas WHERE jogos_id_jogo = ? AND equipes_id_equipe IN (' . $placeholders . ')',
        );
        $statement->bind_param($types, ...$params);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível validar os participantes do jogo.');
        }
        $rows = $statement->get_result()->fetch_all(MYSQLI_ASSOC);
        $statement->close();
        $participants = array_map(static fn (array $row): int => (int) $row['equipes_id_equipe'], $rows);
        if (count(array_unique($participants)) !== count($teamIds)) {
            throw new \InvalidArgumentException('Todas as equipes informadas devem participar do jogo persistido.');
        }
    }

    /** @param list<array<string, mixed>> $results @return list<int> */
    private function teamIds(array $results): array
    {
        $teamIds = [];
        foreach ($results as $result) {
            $teamId = (int) ($result['id_equipe'] ?? 0);
            if ($teamId <= 0 || in_array($teamId, $teamIds, true)) {
                throw new \InvalidArgumentException('As equipes do resultado devem ser válidas e distintas.');
            }
            $teamIds[] = $teamId;
        }
        return $teamIds;
    }

    /** @param list<int> $teamIds @return list<int> */
    private function findCandidateGames(int $modalityId, int $editionId, array $teamIds): array
    {
        if (count($teamIds) < 2) {
            return [];
        }
        $statement = $this->prepare(
            'SELECT DISTINCT p1.jogos_id_jogo
             FROM partidas p1
             INNER JOIN partidas p2 ON p2.jogos_id_jogo = p1.jogos_id_jogo
             INNER JOIN jogos j ON j.id_jogo = p1.jogos_id_jogo
             INNER JOIN modalidades m ON m.id_modalidade = j.modalidades_id_modalidade
             WHERE p1.equipes_id_equipe = ?
               AND p2.equipes_id_equipe = ?
               AND j.modalidades_id_modalidade = ?
               AND m.interclasses_id_interclasse = ?
             ORDER BY p1.jogos_id_jogo DESC',
        );
        $statement->bind_param('iiii', $teamIds[0], $teamIds[1], $modalityId, $editionId);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível localizar o jogo compatível.');
        }
        $rows = $statement->get_result()->fetch_all(MYSQLI_ASSOC);
        $statement->close();
        return array_map(static fn (array $row): int => (int) $row['jogos_id_jogo'], $rows);
    }

    /** @param list<int> $params @return array<string, mixed>|null */
    private function one(string $sql, string $types, array $params): ?array
    {
        $statement = $this->prepare($sql);
        $statement->bind_param($types, ...$params);
        $statement->execute();
        $row = $statement->get_result()->fetch_assoc() ?: null;
        $statement->close();
        return $row;
    }

    private function prepare(string $sql): \mysqli_stmt
    {
        $statement = $this->connection->prepare($sql);
        if ($statement === false) {
            throw new RuntimeException('Não foi possível preparar operação de partida.');
        }
        return $statement;
    }
}
