<?php

declare(strict_types=1);

namespace App\Modules\Resultados\Infrastructure;

use App\Modules\Resultados\Domain\PodioRepository;
use App\Modules\Competicoes\Domain\ChaveamentoRules;
use App\Shared\Database\Transaction;
use mysqli;
use RuntimeException;

final class MysqliPodioRepository implements PodioRepository
{
    public function __construct(private readonly mysqli $connection)
    {
    }

    /** @return array{nome_jogo:string,modalidade_id:int,interclasse_id:int,pontos:array{1:int,2:int,3:int}}|null */
    public function carregarContextoJogo(int $gameId): ?array
    {
        $statement = $this->connection->prepare(
            'SELECT j.nome_jogo, j.modalidades_id_modalidade AS modalidade_id,
                    m.interclasses_id_interclasse AS interclasse_id,
                    i.ponto_1_lugar, i.ponto_2_lugar, i.ponto_3_lugar
             FROM jogos j
             INNER JOIN modalidades m ON m.id_modalidade = j.modalidades_id_modalidade
             INNER JOIN interclasses i ON i.id_interclasse = m.interclasses_id_interclasse
             WHERE j.id_jogo = ? LIMIT 1',
        );
        if ($statement === false) {
            throw new RuntimeException('Não foi possível consultar o contexto do pódio.');
        }
        $statement->bind_param('i', $gameId);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível consultar o contexto do pódio.');
        }
        $row = $statement->get_result()->fetch_assoc() ?: null;
        $statement->close();
        if ($row === null) {
            return null;
        }
        return [
            'nome_jogo' => (string) $row['nome_jogo'],
            'modalidade_id' => (int) $row['modalidade_id'],
            'interclasse_id' => (int) $row['interclasse_id'],
            'pontos' => [
                1 => (int) $row['ponto_1_lugar'],
                2 => (int) $row['ponto_2_lugar'],
                3 => (int) $row['ponto_3_lugar'],
            ],
        ];
    }

    /** @return list<array{equipes_id_equipe:int,resultado_partida:int}> */
    public function carregarPartidasJogo(int $gameId): array
    {
        $statement = $this->connection->prepare(
            'SELECT equipes_id_equipe, resultado_partida
             FROM partidas WHERE jogos_id_jogo = ? ORDER BY id_partida',
        );
        if ($statement === false) {
            throw new RuntimeException('Não foi possível consultar as partidas do pódio.');
        }
        $statement->bind_param('i', $gameId);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível consultar as partidas do pódio.');
        }
        $rows = $statement->get_result()->fetch_all(MYSQLI_ASSOC);
        $statement->close();
        return array_map(static fn (array $row): array => [
            'equipes_id_equipe' => (int) $row['equipes_id_equipe'],
            'resultado_partida' => (int) $row['resultado_partida'],
        ], $rows);
    }

    public function carregarTerceiroLugarDaFinal(int $gameId): ?int
    {
        $statement = $this->connection->prepare(
            'SELECT j.nome_jogo, j.status_jogo, j.modalidades_id_modalidade
             FROM jogos j WHERE j.id_jogo = ? LIMIT 1',
        );
        if ($statement === false) {
            throw new RuntimeException('Não foi possível consultar a origem do terceiro lugar.');
        }
        $statement->bind_param('i', $gameId);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível consultar a origem do terceiro lugar.');
        }
        $final = $statement->get_result()->fetch_assoc() ?: null;
        $statement->close();
        if ($final === null) {
            return null;
        }

        $meta = ChaveamentoRules::parse((string) $final['nome_jogo']);
        if ($meta === null || $meta['largura'] !== 2 || isset($meta['posicao'])
            || !ChaveamentoRules::jogoEstaEncerrado((string) $final['status_jogo'])) {
            return null;
        }
        $champion = ChaveamentoRules::vencedorDePartidas($this->carregarPartidasJogo($gameId));
        if ($champion === null) {
            return null;
        }

        $statement = $this->connection->prepare(
            "SELECT j.id_jogo, j.nome_jogo, j.status_jogo,
                    p.equipes_id_equipe, p.resultado_partida
             FROM jogos j
             INNER JOIN partidas p ON p.jogos_id_jogo = j.id_jogo
             WHERE j.modalidades_id_modalidade = ?
               AND j.status_jogo IN ('Concluido', 'Finalizado')
             ORDER BY j.id_jogo ASC, p.id_partida ASC",
        );
        if ($statement === false) {
            throw new RuntimeException('Não foi possível consultar as semifinais.');
        }
        $modalityId = (int) $final['modalidades_id_modalidade'];
        $statement->bind_param('i', $modalityId);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível consultar as semifinais.');
        }
        $rows = $statement->get_result()->fetch_all(MYSQLI_ASSOC);
        $statement->close();

        $semifinais = [];
        foreach ($rows as $row) {
            $semifinalMeta = ChaveamentoRules::parse((string) $row['nome_jogo']);
            if ($semifinalMeta === null || $semifinalMeta['largura'] !== 4 || isset($semifinalMeta['posicao'])) {
                continue;
            }
            $idSemifinal = (int) $row['id_jogo'];
            if (!isset($semifinais[$idSemifinal])) {
                $semifinais[$idSemifinal] = [
                    'kind' => $semifinalMeta['kind'],
                    'partidas' => [],
                ];
            }
            $semifinais[$idSemifinal]['partidas'][] = [
                'equipes_id_equipe' => (int) $row['equipes_id_equipe'],
                'resultado_partida' => (int) $row['resultado_partida'],
            ];
        }

        return ChaveamentoRules::terceiroLugarDoCampeao($champion, array_values($semifinais));
    }

    public function carregarBloqueados(int $interclasseId, int $modalidadeId): array
    {
        $statement = $this->connection->prepare(
            'SELECT id_pontuacao, id_interclasse, id_modalidade, posicao, id_turma,
                    id_equipe, id_usuario, id_jogo, pontos, ativo, origem_registro
             FROM pontuacoes_podio
             WHERE id_interclasse = ? AND id_modalidade = ?
             ORDER BY posicao
             FOR UPDATE',
        );
        if ($statement === false) {
            throw new RuntimeException('Não foi possível consultar os créditos de pódio.');
        }
        $statement->bind_param('ii', $interclasseId, $modalidadeId);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível consultar os créditos de pódio.');
        }
        $rows = $statement->get_result()->fetch_all(MYSQLI_ASSOC);
        $statement->close();
        return array_map(static function (array $row): array {
            foreach (['id_pontuacao', 'id_interclasse', 'id_modalidade', 'posicao', 'id_turma', 'id_equipe', 'id_usuario', 'id_jogo', 'pontos', 'ativo'] as $field) {
                if ($row[$field] !== null) {
                    $row[$field] = (int) $row[$field];
                }
            }
            return $row;
        }, $rows);
    }

    public function substituirPosicoes(int $interclasseId, int $modalidadeId, array $posicoes): void
    {
        foreach ($posicoes as $position) {
            $posicao = (int) ($position['posicao'] ?? 0);
            $turmaId = (int) ($position['id_turma'] ?? 0);
            $teamId = isset($position['id_equipe']) ? (int) $position['id_equipe'] : null;
            $userId = isset($position['id_usuario']) ? (int) $position['id_usuario'] : null;
            $gameId = isset($position['id_jogo']) ? (int) $position['id_jogo'] : null;
            $points = (int) ($position['pontos'] ?? 0);
            $active = (int) ($position['ativo'] ?? 1);
            $origin = (string) ($position['origem_registro'] ?? 'novo');
            $values = [$interclasseId, $modalidadeId, $posicao, $turmaId];
            $types = 'iiii';
            $optional = [$teamId, $userId, $gameId];
            $placeholders = [];
            foreach ($optional as $value) {
                if ($value === null) {
                    $placeholders[] = 'NULL';
                    continue;
                }
                $placeholders[] = '?';
                $types .= 'i';
                $values[] = $value;
            }
            $placeholders[] = '?';
            $placeholders[] = '?';
            $types .= 'ii';
            $values[] = $points;
            $values[] = $active;
            $placeholders[] = '?';
            $types .= 's';
            $values[] = $origin;
            $statement = $this->connection->prepare(
                'INSERT INTO pontuacoes_podio
                    (id_interclasse, id_modalidade, posicao, id_turma, id_equipe, id_usuario, id_jogo, pontos, ativo, origem_registro)
                 VALUES (?, ?, ?, ?, ' . implode(', ', $placeholders) . ')
                 ON DUPLICATE KEY UPDATE
                    id_turma = VALUES(id_turma), id_equipe = VALUES(id_equipe), id_usuario = VALUES(id_usuario),
                    id_jogo = VALUES(id_jogo), pontos = VALUES(pontos), ativo = VALUES(ativo), origem_registro = VALUES(origem_registro)',
            );
            if ($statement === false) {
                throw new RuntimeException('Não foi possível registrar o crédito de pódio.');
            }
            $arguments = [$types];
            foreach ($values as $index => &$value) {
                $arguments[] = &$value;
            }
            unset($value);
            call_user_func_array([$statement, 'bind_param'], $arguments);
            if (!$statement->execute()) {
                $statement->close();
                throw new RuntimeException('Não foi possível registrar o crédito de pódio.');
            }
            $statement->close();
        }
    }

    public function aplicarDeltas(array $deltas): void
    {
        if ($deltas === []) {
            return;
        }
        $statement = $this->connection->prepare('UPDATE turmas SET pontuacao_turma = pontuacao_turma + ? WHERE id_turma = ?');
        if ($statement === false) {
            throw new RuntimeException('Não foi possível aplicar a diferença do pódio.');
        }
        foreach ($deltas as $classId => $delta) {
            $classId = (int) $classId;
            $delta = (int) $delta;
            $statement->bind_param('ii', $delta, $classId);
            if (!$statement->execute()) {
                $statement->close();
                throw new RuntimeException('Não foi possível aplicar a diferença do pódio.');
            }
        }
        $statement->close();
    }

    public function turmaDaEquipe(int $equipeId, int $modalidadeId): ?int
    {
        $statement = $this->connection->prepare('SELECT e.turmas_id_turma FROM equipes e WHERE e.id_equipe = ? AND e.modalidades_id_modalidade = ? LIMIT 1');
        if ($statement === false) {
            throw new RuntimeException('Não foi possível consultar a equipe do pódio.');
        }
        $statement->bind_param('ii', $equipeId, $modalidadeId);
        $statement->execute();
        $value = $statement->get_result()->fetch_column();
        $statement->close();
        return $value === null ? null : (int) $value;
    }

    public function diagnosticar(): array
    {
        $missing = $this->connection->query(
            "SELECT j.id_jogo, j.modalidades_id_modalidade, m.interclasses_id_interclasse,
                    '1/2' AS posicoes
             FROM jogos j INNER JOIN modalidades m ON m.id_modalidade = j.modalidades_id_modalidade
             WHERE j.nome_jogo LIKE 'MM:2:%' AND j.status_jogo IN ('Concluido', 'Finalizado')
               AND NOT EXISTS (
                   SELECT 1 FROM pontuacoes_podio p
                   WHERE p.id_interclasse = m.interclasses_id_interclasse
                     AND p.id_modalidade = j.modalidades_id_modalidade
                     AND p.ativo = 1
                     AND p.posicao IN (1, 2)
               )
             UNION ALL
             SELECT j.id_jogo, j.modalidades_id_modalidade, m.interclasses_id_interclasse,
                    '3' AS posicoes
             FROM jogos j INNER JOIN modalidades m ON m.id_modalidade = j.modalidades_id_modalidade
             WHERE j.nome_jogo LIKE 'POS:3:%' AND j.status_jogo IN ('Concluido', 'Finalizado')
               AND NOT EXISTS (
                   SELECT 1 FROM pontuacoes_podio p
                   WHERE p.id_interclasse = m.interclasses_id_interclasse
                     AND p.id_modalidade = j.modalidades_id_modalidade
                     AND p.ativo = 1
                     AND p.posicao = 3
               )",
        )->fetch_all(MYSQLI_ASSOC);
        $finals = $this->connection->query(
            "SELECT j.id_jogo, j.modalidades_id_modalidade, m.interclasses_id_interclasse
             FROM jogos j INNER JOIN modalidades m ON m.id_modalidade = j.modalidades_id_modalidade
             WHERE j.nome_jogo LIKE 'MM:2:%' AND j.status_jogo IN ('Concluido', 'Finalizado')",
        )->fetch_all(MYSQLI_ASSOC);
        $thirdExists = $this->connection->prepare(
            'SELECT 1 FROM pontuacoes_podio
             WHERE id_interclasse = ? AND id_modalidade = ? AND posicao = 3 AND ativo = 1 LIMIT 1',
        );
        if ($thirdExists === false) {
            throw new RuntimeException('Não foi possível diagnosticar créditos de pódio.');
        }
        foreach ($finals as $final) {
            if ($this->carregarTerceiroLugarDaFinal((int) $final['id_jogo']) === null) {
                continue;
            }
            $editionId = (int) $final['interclasses_id_interclasse'];
            $modalityId = (int) $final['modalidades_id_modalidade'];
            $thirdExists->bind_param('ii', $editionId, $modalityId);
            $thirdExists->execute();
            if ($thirdExists->get_result()->num_rows === 0) {
                $missing[] = [
                    'id_jogo' => (int) $final['id_jogo'],
                    'modalidades_id_modalidade' => $modalityId,
                    'interclasses_id_interclasse' => $editionId,
                    'posicoes' => '3',
                ];
            }
        }
        $thirdExists->close();
        $orphan = $this->connection->query(
            'SELECT p.id_pontuacao, p.id_interclasse, p.id_modalidade, p.posicao, p.id_turma,
                    p.id_equipe, p.id_usuario, p.id_jogo
             FROM pontuacoes_podio p
             LEFT JOIN modalidades m ON m.id_modalidade = p.id_modalidade
             LEFT JOIN turmas t ON t.id_turma = p.id_turma
             LEFT JOIN equipes e ON e.id_equipe = p.id_equipe
             LEFT JOIN jogos j ON j.id_jogo = p.id_jogo
             WHERE m.id_modalidade IS NULL OR t.id_turma IS NULL OR (p.id_equipe IS NOT NULL AND e.id_equipe IS NULL)
                OR (p.id_jogo IS NOT NULL AND j.id_jogo IS NULL)',
        )->fetch_all(MYSQLI_ASSOC);
        $incompatible = $this->connection->query(
            "SELECT id_pontuacao, id_interclasse, id_modalidade, posicao, pontos, origem_registro
             FROM pontuacoes_podio
             WHERE ativo = 1 AND origem_registro <> 'novo'",
        )->fetch_all(MYSQLI_ASSOC);
        return ['podios_sem_origem' => $missing, 'creditos_orfaos' => $orphan, 'diferenças' => $incompatible];
    }

    public function invalidarFontesSemOrigemAtual(int $interclasseId, int $modalidadeId): void
    {
        $credits = $this->carregarBloqueados($interclasseId, $modalidadeId);
        if ($credits === []) {
            return;
        }
        $updated = $credits;
        $changed = [];
        foreach ($credits as $index => $credit) {
            if ((int) ($credit['ativo'] ?? 0) !== 1 || $this->fonteAtualValida($credit, $modalidadeId)) {
                continue;
            }
            $updated[$index]['ativo'] = 0;
            $changed[] = $updated[$index];
        }
        if ($changed === []) {
            return;
        }
        $this->substituirPosicoes($interclasseId, $modalidadeId, $changed);
        $this->aplicarDeltas(\App\Modules\Resultados\Domain\PodioRules::deltas($credits, $updated));
    }

    /** @param array<string, mixed> $credit */
    private function fonteAtualValida(array $credit, int $modalidadeId): bool
    {
        $gameId = $credit['id_jogo'] ?? null;
        if ($gameId === null || (int) $gameId <= 0) {
            return false;
        }
        $statement = $this->connection->prepare(
            'SELECT nome_jogo, status_jogo FROM jogos WHERE id_jogo = ? AND modalidades_id_modalidade = ? LIMIT 1',
        );
        if ($statement === false) {
            throw new RuntimeException('Não foi possível validar a origem do crédito de pódio.');
        }
        $gameId = (int) $gameId;
        $statement->bind_param('ii', $gameId, $modalidadeId);
        $statement->execute();
        $game = $statement->get_result()->fetch_assoc() ?: null;
        $statement->close();
        if ($game === null || !ChaveamentoRules::jogoEstaEncerrado((string) $game['status_jogo'])) {
            return false;
        }
        $meta = ChaveamentoRules::parse((string) $game['nome_jogo']);
        if ($meta === null) {
            return str_starts_with((string) $game['nome_jogo'], 'IND:');
        }
        $position = (int) ($credit['posicao'] ?? 0);
        return ($position === 3 && (int) ($meta['posicao'] ?? 0) === 3)
            || ($position === 3 && $meta['largura'] === 2
                && !isset($meta['posicao'])
                && (int) ($credit['id_equipe'] ?? 0) === ($this->carregarTerceiroLugarDaFinal($gameId) ?? 0))
            || in_array($position, [1, 2], true) && (int) $meta['largura'] === 2 && !isset($meta['posicao']);
    }

    /** @return array<int, int> */
    public function pontosPadraoEdicao(int $editionId): array
    {
        $statement = $this->connection->prepare(
            'SELECT ponto_1_lugar, ponto_2_lugar, ponto_3_lugar FROM interclasses WHERE id_interclasse = ? LIMIT 1',
        );
        if ($statement === false) {
            return [1 => 10, 2 => 7, 3 => 5];
        }
        $statement->bind_param('i', $editionId);
        $statement->execute();
        $row = $statement->get_result()->fetch_assoc();
        $statement->close();
        if ($row === null) {
            return [1 => 10, 2 => 7, 3 => 5];
        }
        return [
            1 => (int) $row['ponto_1_lugar'],
            2 => (int) $row['ponto_2_lugar'],
            3 => (int) $row['ponto_3_lugar'],
        ];
    }

    /** @return list<array<string, mixed>> */
    public function carregarPodioModalidade(int $editionId, int $modalityId): array
    {
        $statement = $this->connection->prepare(
            'SELECT p.id_pontuacao, p.posicao, p.id_turma, p.id_equipe, p.id_usuario, p.pontos, p.ativo,
                    t.nome_turma, t.nome_fantasia_turma, e.nome_equipe
             FROM pontuacoes_podio p
             INNER JOIN turmas t ON t.id_turma = p.id_turma
             LEFT JOIN equipes e ON e.id_equipe = p.id_equipe
             WHERE p.id_interclasse = ? AND p.id_modalidade = ? AND p.ativo = 1
             ORDER BY p.posicao ASC',
        );
        if ($statement === false) {
            return [];
        }
        $statement->bind_param('ii', $editionId, $modalityId);
        $statement->execute();
        $rows = $statement->get_result()->fetch_all(MYSQLI_ASSOC);
        $statement->close();
        return $rows;
    }
}
