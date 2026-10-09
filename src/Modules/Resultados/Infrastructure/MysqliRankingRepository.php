<?php

declare(strict_types=1);

namespace App\Modules\Resultados\Infrastructure;

use App\Modules\Resultados\Domain\RankingRepository;
use mysqli;
use RuntimeException;

final class MysqliRankingRepository implements RankingRepository
{
    public function __construct(private readonly mysqli $connection)
    {
    }

    public function list(array $filters): array
    {
        $sql = "SELECT turmas.id_turma, turmas.nome_turma, turmas.turno_turma,
                    turmas.nome_fantasia_turma, turmas.pontuacao_turma AS pontuacao_sem_penalidade,
                    turmas.pontuacao_turma AS pontuacao_bruta,
                    ROUND(turmas.qtd_itens_arrecadados * interclasses.valor_item_arrecadacao, 0) AS pontuacao_arrecadacao,
                    COALESCE(podios.pontuacao_esportes, 0) AS pontuacao_esportes,
                    (turmas.pontuacao_turma
                        - ROUND(turmas.qtd_itens_arrecadados * interclasses.valor_item_arrecadacao, 0)
                        - COALESCE(podios.pontuacao_esportes, 0)) AS ajuste_pontuacao,
                    (turmas.pontuacao_turma - COALESCE(penalidades.total_penalidades, 0)) AS pontuacao_turma,
                    (turmas.pontuacao_turma - COALESCE(penalidades.total_penalidades, 0)) AS pontuacao_liquida,
                    interclasses.nome_interclasse, interclasses.status_interclasse AS status_interclasse,
                    categorias.nome_categoria
                FROM turmas
                INNER JOIN interclasses ON interclasses.id_interclasse = turmas.interclasses_id_interclasse
                INNER JOIN categorias ON categorias.id_categoria = turmas.categorias_id_categoria
                LEFT JOIN (
                    SELECT id_interclasse, id_turma, SUM(pontos) AS pontuacao_esportes
                    FROM pontuacoes_podio
                    WHERE ativo = 1
                    GROUP BY id_interclasse, id_turma
                ) podios ON podios.id_interclasse = turmas.interclasses_id_interclasse
                    AND podios.id_turma = turmas.id_turma
                LEFT JOIN (
                    SELECT interclasses_id_interclasse, turmas_id_turma, SUM(total) AS total_penalidades FROM (
                        SELECT ot.interclasses_id_interclasse, ot.turmas_id_turma, SUM(ot.pontos_descontados) AS total
                        FROM ocorrencias_turmas ot GROUP BY ot.interclasses_id_interclasse, ot.turmas_id_turma
                        UNION ALL
                        SELECT u.interclasses_id_interclasse, u.turmas_id_turma, SUM(o.penalidade) AS total
                        FROM ocorrencias o
                        INNER JOIN usuarios u ON o.usuarios_id_usuario = u.id_usuario
                        WHERE o.status_ocorrencia = '1'
                        GROUP BY u.interclasses_id_interclasse, u.turmas_id_turma
                    ) sub GROUP BY interclasses_id_interclasse, turmas_id_turma
                ) penalidades ON penalidades.interclasses_id_interclasse = turmas.interclasses_id_interclasse
                    AND penalidades.turmas_id_turma = turmas.id_turma
                WHERE 1=1";
        $types = '';
        $params = [];
        if (($filters['somente_encerrados'] ?? false) === true) {
            $sql .= " AND interclasses.status_interclasse = '0'";
        }
        if ((int) ($filters['id_turma'] ?? 0) > 0) {
            $sql .= ' AND turmas.id_turma = ?';
            $types .= 'i';
            $params[] = (int) $filters['id_turma'];
        }
        if ((int) ($filters['id_interclasse'] ?? 0) > 0) {
            $sql .= ' AND turmas.interclasses_id_interclasse = ?';
            $types .= 'i';
            $params[] = (int) $filters['id_interclasse'];
        }
        if ((int) ($filters['id_categoria'] ?? 0) > 0) {
            $sql .= ' AND turmas.categorias_id_categoria = ?';
            $types .= 'i';
            $params[] = (int) $filters['id_categoria'];
        }
        if ((string) ($filters['turno'] ?? '') !== '') {
            $sql .= ' AND turmas.turno_turma = ?';
            $types .= 's';
            $params[] = (string) $filters['turno'];
        }
        if ((string) ($filters['busca'] ?? '') !== '') {
            $sql .= ' AND (turmas.nome_turma LIKE ? OR turmas.nome_fantasia_turma LIKE ?)';
            $types .= 'ss';
            $search = '%' . (string) $filters['busca'] . '%';
            $params[] = $search;
            $params[] = $search;
        }
        $sql .= ' ORDER BY pontuacao_liquida DESC, turmas.nome_turma ASC';

        $statement = $this->connection->prepare($sql);
        if ($statement === false) {
            throw new RuntimeException('Não foi possível consultar ranking.');
        }
        if ($types !== '') {
            $statement->bind_param($types, ...$params);
        }
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível consultar ranking.');
        }
        $rows = $statement->get_result()->fetch_all(MYSQLI_ASSOC);
        $statement->close();
        return $rows;
    }

    public function reconciliarEdicao(int $editionId): array
    {
        $sql = "UPDATE turmas t
                INNER JOIN interclasses i ON i.id_interclasse = t.interclasses_id_interclasse
                LEFT JOIN (
                    SELECT id_interclasse, id_turma, SUM(pontos) AS pontuacao_esportes
                    FROM pontuacoes_podio
                    WHERE ativo = 1
                    GROUP BY id_interclasse, id_turma
                ) podios ON podios.id_interclasse = t.interclasses_id_interclasse AND podios.id_turma = t.id_turma
                SET t.pontuacao_turma = ROUND(t.qtd_itens_arrecadados * i.valor_item_arrecadacao, 0) + COALESCE(podios.pontuacao_esportes, 0)
                WHERE t.interclasses_id_interclasse = ?";
        $statement = $this->connection->prepare($sql);
        if ($statement === false) {
            throw new RuntimeException('Não foi possível reconciliar ranking da edição.');
        }
        $statement->bind_param('i', $editionId);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível reconciliar ranking da edição.');
        }
        $affected = $statement->affected_rows;
        $statement->close();

        $turmasAtualizadas = $this->list(['id_interclasse' => $editionId]);

        return [
            'reconciliadas' => $affected,
            'total_turmas' => count($turmasAtualizadas),
            'turmas' => $turmasAtualizadas,
        ];
    }
}
