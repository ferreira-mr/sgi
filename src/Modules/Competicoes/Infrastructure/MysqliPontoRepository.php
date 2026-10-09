<?php

declare(strict_types=1);

namespace App\Modules\Competicoes\Infrastructure;

use App\Modules\Competicoes\Domain\ChaveamentoRules;
use App\Modules\Competicoes\Domain\PontoRepository;
use InvalidArgumentException;
use mysqli;
use RuntimeException;

final class MysqliPontoRepository implements PontoRepository
{
    public function __construct(private readonly mysqli $connection)
    {
    }

    public function edicaoDoJogo(int $gameId): ?int
    {
        return $this->editionId(
            'SELECT m.interclasses_id_interclasse
             FROM jogos j
             INNER JOIN modalidades m ON m.id_modalidade = j.modalidades_id_modalidade
             WHERE j.id_jogo = ? LIMIT 1 FOR UPDATE',
            $gameId,
        );
    }

    public function edicaoDaEquipe(int $teamId): ?int
    {
        return $this->editionId(
            'SELECT m.interclasses_id_interclasse
             FROM equipes e
             INNER JOIN modalidades m ON m.id_modalidade = e.modalidades_id_modalidade
             WHERE e.id_equipe = ? LIMIT 1 FOR UPDATE',
            $teamId,
        );
    }

    public function edicaoDoPonto(int $pointId): ?int
    {
        return $this->editionId(
            'SELECT m.interclasses_id_interclasse
             FROM artilheiros a
             INNER JOIN jogos j ON j.id_jogo = a.jogos_id_jogo
             INNER JOIN modalidades m ON m.id_modalidade = j.modalidades_id_modalidade
             WHERE a.id_artilheiro = ? LIMIT 1 FOR UPDATE',
            $pointId,
        );
    }

    /** @return list<array<string, mixed>> */
    public function listarAtletas(int $gameId, int $teamId): array
    {
        $sql = 'SELECT DISTINCT u.id_usuario, u.nome_usuario, u.matricula_usuario,
                       e.id_equipe AS equipes_id_equipe, e.turmas_id_turma AS id_turma
                FROM equipes e
                INNER JOIN equipes_has_usuarios ehu ON ehu.equipes_id_equipe = e.id_equipe
                INNER JOIN usuarios u ON u.id_usuario = ehu.usuarios_id_usuario
                WHERE e.id_equipe = ?
                  AND e.status_equipe = \'1\'
                  AND u.status_usuario = \'1\'
                  AND u.nivel_usuario = \'3\'';
        $types = 'i';
        $params = [$teamId];
        if ($gameId > 0) {
            $sql = 'SELECT DISTINCT u.id_usuario, u.nome_usuario, u.matricula_usuario,
                           e.id_equipe AS equipes_id_equipe, e.turmas_id_turma AS id_turma
                    FROM partidas p
                    INNER JOIN equipes e ON e.id_equipe = p.equipes_id_equipe
                    INNER JOIN equipes_has_usuarios ehu ON ehu.equipes_id_equipe = e.id_equipe
                    INNER JOIN usuarios u ON u.id_usuario = ehu.usuarios_id_usuario
                    WHERE p.jogos_id_jogo = ?
                      AND p.equipes_id_equipe = ?
                      AND p.status_partida = \'1\'
                      AND e.status_equipe = \'1\'
                      AND u.status_usuario = \'1\'
                      AND u.nivel_usuario = \'3\'';
            $types = 'ii';
            $params = [$gameId, $teamId];
        }
        $sql .= $this->eligibilityExclusionSql($gameId > 0 ? $gameId : 0, 'u.id_usuario');
        $sql .= ' ORDER BY u.nome_usuario ASC, u.id_usuario ASC';
        $rows = $this->queryRows($sql, $types, $params);
        return array_map(static function (array $row): array {
            return [
                'id_usuario' => (int) $row['id_usuario'],
                'nome_usuario' => (string) $row['nome_usuario'],
                'matricula_usuario' => (string) ($row['matricula_usuario'] ?? ''),
                'equipes_id_equipe' => (int) $row['equipes_id_equipe'],
                'id_turma' => (int) $row['id_turma'],
            ];
        }, $rows);
    }

    /** @return list<array<string, mixed>> */
    public function listarPontos(int $gameId, ?int $teamId = null): array
    {
        $sql = 'SELECT a.id_artilheiro, a.id_artilheiro AS id_ponto, a.usuarios_id_usuario, a.jogos_id_jogo,
                       a.partidas_id_partida, a.equipes_id_equipe, a.num_gol,
                       a.conta_no_placar, a.status_artilheiro, a.chave_jogada,
                       a.registrado_em, a.anulado_em, u.nome_usuario,
                       p.resultado_partida, e.nome_equipe, e.turmas_id_turma AS id_turma
                FROM artilheiros a
                INNER JOIN usuarios u ON u.id_usuario = a.usuarios_id_usuario
                LEFT JOIN partidas p ON p.id_partida = a.partidas_id_partida
                LEFT JOIN equipes e ON e.id_equipe = a.equipes_id_equipe
                WHERE a.jogos_id_jogo = ?';
        $types = 'i';
        $params = [$gameId];
        if ($teamId !== null && $teamId > 0) {
            $sql .= ' AND a.equipes_id_equipe = ?';
            $types .= 'i';
            $params[] = $teamId;
        }
        $sql .= ' ORDER BY a.registrado_em ASC, a.id_artilheiro ASC';
        return $this->queryRows($sql, $types, $params);
    }

    /** @return array<string, mixed>|null */
    public function contextoPartida(int $gameId, int $partidaId, int $teamId): ?array
    {
        return $this->one(
            'SELECT p.id_partida, p.jogos_id_jogo, p.equipes_id_equipe,
                    p.resultado_partida, p.status_partida, j.status_jogo,
                    j.exige_vinculo_ponto, j.nome_jogo,
                    j.modalidades_id_modalidade AS modalidade_id,
                    m.tipos_modalidades_id_tipo_modalidade, tm.nome_tipo_modalidade,
                    CASE WHEN LOWER(TRIM(COALESCE(tm.nome_tipo_modalidade, \'\'))) IN (\'individual\', \'prova individual\', \'individualizada\')
                         THEN 1 ELSE 0 END AS individual
             FROM partidas p
             INNER JOIN jogos j ON j.id_jogo = p.jogos_id_jogo
             INNER JOIN modalidades m ON m.id_modalidade = j.modalidades_id_modalidade
             LEFT JOIN tipos_modalidades tm ON tm.id_tipo_modalidade = m.tipos_modalidades_id_tipo_modalidade
             WHERE p.id_partida = ? AND p.jogos_id_jogo = ? AND p.equipes_id_equipe = ?
             LIMIT 1 FOR UPDATE',
            'iii',
            [$partidaId, $gameId, $teamId],
        );
    }

    public function atletaElegivel(int $userId, int $gameId, int $teamId): bool
    {
        if ($userId <= 0 || $gameId <= 0 || $teamId <= 0) {
            return false;
        }
        $sql = 'SELECT 1
                FROM partidas p
                INNER JOIN equipes e ON e.id_equipe = p.equipes_id_equipe
                INNER JOIN equipes_has_usuarios ehu ON ehu.equipes_id_equipe = e.id_equipe
                INNER JOIN usuarios u ON u.id_usuario = ehu.usuarios_id_usuario
                WHERE p.jogos_id_jogo = ? AND p.equipes_id_equipe = ?
                  AND p.status_partida = \'1\' AND e.status_equipe = \'1\'
                  AND u.id_usuario = ? AND u.status_usuario = \'1\' AND u.nivel_usuario = \'3\'';
        $sql .= $this->eligibilityExclusionSql($gameId, 'u.id_usuario');
        $sql .= ' LIMIT 1';
        return $this->one($sql, 'iii', [$gameId, $teamId, $userId]) !== null;
    }

    /** @return array<string, mixed>|null */
    public function buscarPorChave(string $key): ?array
    {
        return $this->pointQuery('a.chave_jogada = ?', 's', [$key]);
    }

    /** @param array<string, mixed> $data @return array<string, mixed> */
    public function inserir(array $data): array
    {
        $gameId = (int) $data['jogos_id_jogo'];
        $matchId = (int) $data['partidas_id_partida'];
        $teamId = (int) $data['equipes_id_equipe'];
        $userId = (int) $data['usuarios_id_usuario'];
        $key = (string) $data['chave_jogada'];
        $operatorId = (int) ($data['registrado_por'] ?? 0);
        $this->assertOperator($operatorId);
        return $this->inserirEvento($gameId, $matchId, $teamId, $userId, $key, $operatorId, true);
    }

    /** @return array<string, mixed>|null */
    public function buscar(int $pointId): ?array
    {
        return $this->pointQuery('a.id_artilheiro = ?', 'i', [$pointId]);
    }

    /** @return array<string, mixed> */
    public function anular(int $pointId, int $operatorId, ?string $expectedGameStatus = null): array
    {
        $this->assertOperator($operatorId);
        $target = $this->one(
            'SELECT jogos_id_jogo, partidas_id_partida
             FROM artilheiros
             WHERE id_artilheiro = ? LIMIT 1',
            'i',
            [$pointId],
        );
        if ($target === null) {
            throw new InvalidArgumentException('Ponto não encontrado.');
        }

        // Finalização também trava jogo antes de partidas e pontos. Releia o estado
        // com uma locking read, pois a validação anterior do serviço pode estar obsoleta.
        $gameId = (int) $target['jogos_id_jogo'];
        $partidaId = (int) $target['partidas_id_partida'];
        $game = $this->one(
            'SELECT status_jogo FROM jogos WHERE id_jogo = ? LIMIT 1 FOR UPDATE',
            'i',
            [$gameId],
        );
        if ($game === null) {
            throw new InvalidArgumentException('Ponto não encontrado.');
        }
        $lockedGameStatus = (string) $game['status_jogo'];
        if ($expectedGameStatus !== null && $lockedGameStatus !== $expectedGameStatus) {
            throw new InvalidArgumentException('O estado do jogo mudou durante a anulação do ponto.');
        }

        $match = $this->one(
            'SELECT id_partida, jogos_id_jogo, equipes_id_equipe, resultado_partida
             FROM partidas
             WHERE id_partida = ? AND jogos_id_jogo = ? LIMIT 1 FOR UPDATE',
            'ii',
            [$partidaId, $gameId],
        );
        $point = $this->one(
            'SELECT id_artilheiro, partidas_id_partida, status_artilheiro, conta_no_placar
             FROM artilheiros
             WHERE id_artilheiro = ? AND jogos_id_jogo = ? AND partidas_id_partida = ?
             LIMIT 1 FOR UPDATE',
            'iii',
            [$pointId, $gameId, $partidaId],
        );
        if ($match === null || $point === null) {
            throw new InvalidArgumentException('Ponto não encontrado.');
        }
        if ((string) $point['status_artilheiro'] === 'anulado' || (int) $point['conta_no_placar'] !== 1) {
            return $this->pointQuery('a.id_artilheiro = ?', 'i', [$pointId], true) ?? $point;
        }
        if ((int) $match['resultado_partida'] <= 0) {
            throw new InvalidArgumentException('O ponto não pode ser anulado porque o placar já está zerado.');
        }
        $updatePartida = $this->prepare('UPDATE partidas SET resultado_partida = resultado_partida - 1 WHERE id_partida = ? AND resultado_partida > 0');
        $updatePartida->bind_param('i', $partidaId);
        if (!$updatePartida->execute() || $updatePartida->affected_rows !== 1) {
            $updatePartida->close();
            throw new RuntimeException('Não foi possível retirar o ponto do placar.');
        }
        $updatePartida->close();

        $update = $this->prepare("UPDATE artilheiros SET status_artilheiro = 'anulado', conta_no_placar = 0, anulado_por = ?, anulado_em = CURRENT_TIMESTAMP WHERE id_artilheiro = ? AND status_artilheiro = 'ativo' AND conta_no_placar = 1");
        $update->bind_param('ii', $operatorId, $pointId);
        if (!$update->execute() || $update->affected_rows !== 1) {
            $update->close();
            throw new RuntimeException('Não foi possível preservar a anulação do ponto.');
        }
        $update->close();
        return $this->pointQuery('a.id_artilheiro = ?', 'i', [$pointId], true) ?? $point;
    }

    public function exigeVinculo(int $gameId): bool
    {
        $row = $this->one('SELECT exige_vinculo_ponto, nome_jogo FROM jogos WHERE id_jogo = ? LIMIT 1', 'i', [$gameId]);
        if ($row === null) {
            return true;
        }
        $meta = ChaveamentoRules::parse((string) ($row['nome_jogo'] ?? ''));
        if ($meta !== null && $meta['kind'] === 'B') {
            return false;
        }
        return (int) ($row['exige_vinculo_ponto'] ?? 1) === 1;
    }

    /** @param list<array<string, mixed>> $results */
    public function garantirPartidas(int $gameId, array $results): void
    {
        foreach ($results as $result) {
            $teamId = (int) ($result['id_equipe'] ?? 0);
            if ($teamId <= 0) {
                throw new InvalidArgumentException('As equipes do resultado devem ser válidas.');
            }
            MysqliChaveamentoRepository::garantirPartidaEquipe($this->connection, $gameId, $teamId);
        }
    }

    /** @param list<array<string, mixed>> $results */
    public function validarPlacarVinculado(int $gameId, array $results): void
    {
        if (!$this->exigeVinculo($gameId)) {
            return;
        }
        usort($results, static fn (array $left, array $right): int => (int) ($left['id_equipe'] ?? 0) <=> (int) ($right['id_equipe'] ?? 0));
        foreach ($results as $result) {
            $teamId = (int) ($result['id_equipe'] ?? 0);
            $expected = (int) ($result['gols'] ?? 0);
            $row = $this->one(
                'SELECT id_partida, resultado_partida
                 FROM partidas
                 WHERE jogos_id_jogo = ? AND equipes_id_equipe = ? LIMIT 1 FOR UPDATE',
                'ii',
                [$gameId, $teamId],
            );
            if ($row === null) {
                throw new InvalidArgumentException('O placar só pode conter pontos vinculados a estudantes inscritos e ativos.');
            }
            $partidaId = (int) $row['id_partida'];
            $activePoints = $this->queryRows(
                "SELECT id_artilheiro
                 FROM artilheiros
                 WHERE partidas_id_partida = ? AND status_artilheiro = 'ativo' AND conta_no_placar = 1
                 FOR UPDATE",
                'i',
                [$partidaId],
            );
            if ((int) $row['resultado_partida'] !== $expected || count($activePoints) !== $expected) {
                throw new InvalidArgumentException('O placar só pode conter pontos vinculados a estudantes inscritos e ativos.');
            }
        }
    }

    /** @param list<mixed> $points */
    public function persistirPontosOffline(int $gameId, array $points, int $operatorId, ?string $expectedGameStatus = null): void
    {
        $this->assertOperator($operatorId);
        foreach ($points as $point) {
            if (!is_array($point)) {
                throw new InvalidArgumentException('Evento de ponto offline inválido.');
            }
            $teamId = (int) ($point['id_equipe'] ?? $point['equipes_id_equipe'] ?? 0);
            $userId = (int) ($point['usuarios_id_usuario'] ?? $point['id_usuario'] ?? 0);
            $key = trim((string) ($point['chave_jogada'] ?? ''));
            $pointId = (int) ($point['id_ponto'] ?? $point['id_artilheiro'] ?? 0);
            $isCancellation = (string) ($point['status_artilheiro'] ?? '') === 'anulado';
            if ($isCancellation && $pointId > 0) {
                $existingPoint = $this->buscar($pointId);
                if ($existingPoint === null
                    || (int) ($existingPoint['jogos_id_jogo'] ?? 0) !== $gameId
                    || (int) ($existingPoint['equipes_id_equipe'] ?? 0) !== $teamId
                    || (int) ($existingPoint['usuarios_id_usuario'] ?? 0) !== $userId) {
                    throw new InvalidArgumentException('O cancelamento offline referencia uma jogada inválida.');
                }
                if ((string) ($existingPoint['status_artilheiro'] ?? '') !== 'anulado') {
                    $this->anular($pointId, $operatorId, $expectedGameStatus);
                }
                continue;
            }
            if ($teamId <= 0 || $userId <= 0 || $key === '' || strlen($key) < 12 || strlen($key) > 180) {
                throw new InvalidArgumentException('Cada ponto offline precisa indicar equipe, estudante e identificação da jogada.');
            }
            $existing = $this->buscarPorChave($key);
            if ($existing !== null) {
                if ((int) ($existing['jogos_id_jogo'] ?? 0) !== $gameId
                    || (int) ($existing['equipes_id_equipe'] ?? 0) !== $teamId
                    || (int) ($existing['usuarios_id_usuario'] ?? 0) !== $userId) {
                    throw new InvalidArgumentException('A identificação de uma jogada offline foi reutilizada com dados diferentes.');
                }
                if ($isCancellation && (string) ($existing['status_artilheiro'] ?? '') !== 'anulado') {
                    $this->anular((int) ($existing['id_artilheiro'] ?? 0), $operatorId, $expectedGameStatus);
                }
                continue;
            }
            MysqliChaveamentoRepository::garantirPartidaEquipe($this->connection, $gameId, $teamId);
            $match = $this->one('SELECT id_partida FROM partidas WHERE jogos_id_jogo = ? AND equipes_id_equipe = ? LIMIT 1 FOR UPDATE', 'ii', [$gameId, $teamId]);
            if ($match === null || !$this->atletaElegivel($userId, $gameId, $teamId)) {
                throw new InvalidArgumentException('O estudante não está inscrito e ativo nesta equipe para o jogo offline.');
            }
            $anulado = (string) ($point['status_artilheiro'] ?? '') === 'anulado'
                || (int) ($point['conta_no_placar'] ?? 1) !== 1;
            if ($anulado) {
                $this->inserirHistoricoAnulado($gameId, (int) $match['id_partida'], $teamId, $userId, $key, $operatorId);
            } else {
                $this->inserirEvento($gameId, (int) $match['id_partida'], $teamId, $userId, $key, $operatorId, false);
            }
        }
    }

    private function inserirHistoricoAnulado(int $gameId, int $matchId, int $teamId, int $userId, string $key, int $operatorId): void
    {
        $this->assertOperator($operatorId);
        $statement = $this->prepare(
            "INSERT INTO artilheiros (usuarios_id_usuario, jogos_id_jogo, partidas_id_partida,
                equipes_id_equipe, num_gol, conta_no_placar, status_artilheiro, chave_jogada, registrado_por, anulado_por, anulado_em)
             VALUES (?, ?, ?, ?, 1, 0, 'anulado', ?, ?, ?, CURRENT_TIMESTAMP)",
        );
        $statement->bind_param('iiiisii', $userId, $gameId, $matchId, $teamId, $key, $operatorId, $operatorId);
        if (!$statement->execute()) {
            $message = $statement->error;
            $statement->close();
            throw new RuntimeException($message !== '' ? $message : 'Não foi possível preservar o ponto anulado.');
        }
        $statement->close();
    }

    /** @return array<string, mixed> */
    private function inserirEvento(int $gameId, int $matchId, int $teamId, int $userId, string $key, int $operatorId, bool $checkGameStatus): array
    {
        $this->assertOperator($operatorId);
        $existing = $this->buscarPorChave($key);
        if ($existing !== null) {
            return $existing;
        }
        $statement = $this->prepare(
            'INSERT INTO artilheiros (usuarios_id_usuario, jogos_id_jogo, partidas_id_partida,
                equipes_id_equipe, num_gol, conta_no_placar, status_artilheiro, chave_jogada, registrado_por)
             VALUES (?, ?, ?, ?, 1, 1, \'ativo\', ?, ?)',
        );
        $statement->bind_param('iiiisi', $userId, $gameId, $matchId, $teamId, $key, $operatorId);
        if (!$statement->execute()) {
            $message = $statement->error;
            $statement->close();
            throw new RuntimeException($message !== '' ? $message : 'Não foi possível registrar o ponto.');
        }
        $pointId = (int) $this->connection->insert_id;
        $statement->close();

        $update = $this->prepare('UPDATE partidas SET resultado_partida = resultado_partida + 1 WHERE id_partida = ? AND jogos_id_jogo = ? AND equipes_id_equipe = ?');
        $update->bind_param('iii', $matchId, $gameId, $teamId);
        if (!$update->execute() || $update->affected_rows !== 1) {
            $update->close();
            throw new RuntimeException('Não foi possível atualizar o placar do ponto.');
        }
        $update->close();
        return $this->buscar($pointId) ?? [
            'id_artilheiro' => $pointId,
            'jogos_id_jogo' => $gameId,
            'partidas_id_partida' => $matchId,
            'equipes_id_equipe' => $teamId,
            'usuarios_id_usuario' => $userId,
            'status_artilheiro' => 'ativo',
            'conta_no_placar' => 1,
        ];
    }

    private function eligibilityExclusionSql(int $gameId, string $userExpression): string
    {
        if ($gameId <= 0) {
            return "\n                  AND NOT EXISTS (SELECT 1 FROM ocorrencias o WHERE o.usuarios_id_usuario = {$userExpression} AND o.status_ocorrencia = '1' AND LOWER(o.titulo_ocorrencia) LIKE 'suspens%')";
        }
        return "\n                  AND NOT EXISTS (
                    SELECT 1 FROM ocorrencias o
                    WHERE o.usuarios_id_usuario = {$userExpression}
                      AND o.status_ocorrencia = '1'
                      AND (
                        (LOWER(o.titulo_ocorrencia) LIKE 'suspens%' AND (o.descricao_ocorrencia NOT LIKE '[JOGO:%' OR o.descricao_ocorrencia LIKE CONCAT('%[JOGO:', {$gameId}, ']%')))
                        OR (LOWER(o.titulo_ocorrencia) LIKE 'vermelho%' AND o.descricao_ocorrencia LIKE CONCAT('%[JOGO:', {$gameId}, ']%'))
                      )
                  )";
    }

    private function assertOperator(int $operatorId): void
    {
        if ($operatorId <= 0) {
            throw new InvalidArgumentException('Operador inválido para registrar ou anular pontos.');
        }
    }

    /** @return array<string, mixed>|null */
    private function pointQuery(string $where, string $types, array $params, bool $forUpdate = false): ?array
    {
        return $this->one(
            'SELECT a.id_artilheiro, a.id_artilheiro AS id_ponto, a.usuarios_id_usuario, a.jogos_id_jogo,
                    a.partidas_id_partida, a.equipes_id_equipe, a.num_gol,
                    a.conta_no_placar, a.status_artilheiro, a.chave_jogada,
                    a.registrado_em, a.anulado_em, u.nome_usuario,
                    p.resultado_partida, j.status_jogo, e.nome_equipe,
                    e.turmas_id_turma AS id_turma
             FROM artilheiros a
             INNER JOIN usuarios u ON u.id_usuario = a.usuarios_id_usuario
             LEFT JOIN partidas p ON p.id_partida = a.partidas_id_partida
             LEFT JOIN jogos j ON j.id_jogo = a.jogos_id_jogo
             LEFT JOIN equipes e ON e.id_equipe = a.equipes_id_equipe
             WHERE ' . $where . ' LIMIT 1' . ($forUpdate ? ' FOR UPDATE' : ''),
            $types,
            $params,
        );
    }

    /** @param list<mixed> $params @return list<array<string, mixed>> */
    private function queryRows(string $sql, string $types, array $params): array
    {
        $statement = $this->prepare($sql);
        if ($params !== []) {
            $statement->bind_param($types, ...$params);
        }
        if (!$statement->execute()) {
            $message = $statement->error;
            $statement->close();
            throw new RuntimeException($message !== '' ? $message : 'Não foi possível consultar pontos.');
        }
        $rows = $statement->get_result()->fetch_all(MYSQLI_ASSOC);
        $statement->close();
        return $rows;
    }

    /** @param list<mixed> $params @return array<string, mixed>|null */
    private function one(string $sql, string $types, array $params): ?array
    {
        $rows = $this->queryRows($sql, $types, $params);
        return $rows[0] ?? null;
    }

    private function prepare(string $sql): \mysqli_stmt
    {
        $statement = $this->connection->prepare($sql);
        if ($statement === false) {
            throw new RuntimeException('Não foi possível preparar a operação de pontos.');
        }
        return $statement;
    }

    private function editionId(string $sql, int $resourceId): ?int
    {
        $row = $this->one($sql, 'i', [$resourceId]);
        if ($row === null) {
            return null;
        }
        $editionId = (int) ($row['interclasses_id_interclasse'] ?? 0);
        return $editionId > 0 ? $editionId : null;
    }
}
