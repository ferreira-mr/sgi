<?php

declare (strict_types=1);

namespace App\Modules\Competicoes\Infrastructure;

use App\Modules\Competicoes\Domain\ChaveamentoRules;

final class MysqliArtilheiroQueries
{
    public function __construct(private readonly \mysqli $connection)
    {
    }
    public function resolveGame(object $data): int
    {
        return self::sgi_resolver_jogo_temporario_artilharia($this->connection, $data);
    }

    public function editionOfModality(int $modalityId): ?int
    {
        $statement = $this->connection->prepare('SELECT interclasses_id_interclasse FROM modalidades WHERE id_modalidade = ? LIMIT 1');
        if ($statement === false) {
            return null;
        }
        $statement->bind_param('i', $modalityId);
        $statement->execute();
        $value = $statement->get_result()->fetch_column();
        $statement->close();
        return $value === null || $value === false ? null : (int) $value;
    }

    public function editionOfGame(int $gameId): ?int
    {
        $statement = $this->connection->prepare(
            'SELECT m.interclasses_id_interclasse
             FROM jogos j
             INNER JOIN modalidades m ON m.id_modalidade = j.modalidades_id_modalidade
             WHERE j.id_jogo = ? LIMIT 1',
        );
        if ($statement === false) {
            return null;
        }
        $statement->bind_param('i', $gameId);
        $statement->execute();
        $value = $statement->get_result()->fetch_column();
        $statement->close();
        return $value === null || $value === false ? null : (int) $value;
    }

    private static function revelarDestaquesPorModalidade($conn, $idInterclasse = \null)
    {
        $where = $idInterclasse ? " AND i.id_interclasse = ?" : " AND i.status_interclasse = '1'";
        $sql = "SELECT
                m.id_modalidade,
                m.nome_modalidade,
                c.id_categoria,
                c.nome_categoria,
                u.id_usuario,
                u.nome_usuario,
                u.foto_usuario,
                t.id_turma,
                t.nome_turma,
                t.nome_fantasia_turma,
                SUM(CASE WHEN a.status_artilheiro = 'ativo' AND a.conta_no_placar = 1 THEN a.num_gol ELSE 0 END) AS total_gols,
                COUNT(*) AS total_acoes,
                SUM(CASE WHEN a.status_artilheiro = 'anulado' OR a.conta_no_placar = 0 THEN 1 ELSE 0 END) AS total_anulados
            FROM artilheiros a
            INNER JOIN usuarios u ON a.usuarios_id_usuario = u.id_usuario
            INNER JOIN turmas t ON u.turmas_id_turma = t.id_turma
            INNER JOIN jogos j ON a.jogos_id_jogo = j.id_jogo
            INNER JOIN modalidades m ON j.modalidades_id_modalidade = m.id_modalidade
            INNER JOIN categorias c ON m.categorias_id_categoria = c.id_categoria
            INNER JOIN interclasses i ON c.interclasses_id_interclasse = i.id_interclasse
            WHERE 1=1" . $where . "
            GROUP BY m.id_modalidade, m.nome_modalidade, c.id_categoria, c.nome_categoria,
                     u.id_usuario, u.nome_usuario, u.foto_usuario, t.id_turma,
                     t.nome_turma, t.nome_fantasia_turma
            HAVING NOT EXISTS (
                SELECT 1
                FROM artilheiros a2
                INNER JOIN jogos j2 ON a2.jogos_id_jogo = j2.id_jogo
                WHERE j2.modalidades_id_modalidade = m.id_modalidade
                GROUP BY a2.usuarios_id_usuario
                HAVING SUM(CASE WHEN a2.status_artilheiro = 'ativo' AND a2.conta_no_placar = 1 THEN a2.num_gol ELSE 0 END)
                    > SUM(CASE WHEN a.status_artilheiro = 'ativo' AND a.conta_no_placar = 1 THEN a.num_gol ELSE 0 END)
            )
            ORDER BY c.nome_categoria ASC, m.nome_modalidade ASC, total_gols DESC, total_acoes DESC";
        $stmt = $conn->prepare($sql);
        if ($stmt === false) {
            throw new \RuntimeException('Não foi possível consultar os estudantes em destaque por modalidade.');
        }
        if ($idInterclasse) {
            $stmt->bind_param("i", $idInterclasse);
        }
        $stmt->execute();
        $res = $stmt->get_result();
        return $res->fetch_all(\MYSQLI_ASSOC);
    }
    private static function revelarDestaque($conn)
    {
        $sql = "SELECT
                c.id_categoria,
                c.nome_categoria,
                u.id_usuario,
                u.nome_usuario,
                u.foto_usuario,
                t.nome_turma,
                t.nome_fantasia_turma,
                SUM(CASE WHEN a.status_artilheiro = 'ativo' AND a.conta_no_placar = 1 THEN a.num_gol ELSE 0 END) AS total_gols,
                COUNT(*) AS total_acoes,
                SUM(CASE WHEN a.status_artilheiro = 'anulado' OR a.conta_no_placar = 0 THEN 1 ELSE 0 END) AS total_anulados
            FROM artilheiros a
            INNER JOIN usuarios u ON a.usuarios_id_usuario = u.id_usuario
            INNER JOIN turmas t ON u.turmas_id_turma = t.id_turma
            INNER JOIN jogos j ON a.jogos_id_jogo = j.id_jogo
            INNER JOIN modalidades m ON j.modalidades_id_modalidade = m.id_modalidade
            INNER JOIN categorias c ON m.categorias_id_categoria = c.id_categoria
            INNER JOIN interclasses i ON c.interclasses_id_interclasse = i.id_interclasse
            WHERE i.status_interclasse = '1'
            GROUP BY c.id_categoria, c.nome_categoria, u.id_usuario, u.nome_usuario,
                     u.foto_usuario, t.nome_turma, t.nome_fantasia_turma
            HAVING NOT EXISTS (
                SELECT 1
                FROM artilheiros a2
                INNER JOIN jogos j2 ON a2.jogos_id_jogo = j2.id_jogo
                INNER JOIN modalidades m2 ON j2.modalidades_id_modalidade = m2.id_modalidade
                WHERE m2.categorias_id_categoria = c.id_categoria
                GROUP BY a2.usuarios_id_usuario
                HAVING SUM(CASE WHEN a2.status_artilheiro = 'ativo' AND a2.conta_no_placar = 1 THEN a2.num_gol ELSE 0 END)
                    > SUM(CASE WHEN a.status_artilheiro = 'ativo' AND a.conta_no_placar = 1 THEN a.num_gol ELSE 0 END)
            )
            ORDER BY c.nome_categoria ASC, total_gols DESC, total_acoes DESC";
        $stmt = $conn->prepare($sql);
        if ($stmt === false) {
            throw new \RuntimeException('Não foi possível consultar os estudantes em destaque.');
        }
        $stmt->execute();
        $res = $stmt->get_result();
        return $res->fetch_all(\MYSQLI_ASSOC);
    }
    private static function sgi_resolver_jogo_temporario_artilharia(\mysqli $conn, object $data): int
    {
        $idJogo = (int) ($data->jogos_id_jogo ?? 0);
        if ($idJogo >= 0) {
            return $idJogo;
        }
        $nomeJogo = \trim((string) ($data->nome_jogo ?? ''));
        $idModalidade = (int) ($data->id_modalidade ?? 0);
        if ($nomeJogo === '' || $idModalidade <= 0) {
            return 0;
        }
        $queries = new self($conn);
        if ($queries->editionOfModality($idModalidade) === null || ChaveamentoRules::parse($nomeJogo) === null) {
            return 0;
        }
        $jogo = \App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository::buscarJogoPorTag($conn, $idModalidade, $nomeJogo);
        return $jogo ? (int) $jogo['id_jogo'] : 0;
    }
    public function list(array $filters): array
    {
        $conn = $this->connection;
        // Verifica se a requisição é específica para listar os destaques por modalidade
        if (isset($filters['acao']) && $filters['acao'] === 'destaques_modalidades') {
            $idInterclasse = !empty($filters['id_interclasse']) ? \intval($filters['id_interclasse']) : \null;
            $destaques = self::revelarDestaquesPorModalidade($conn, $idInterclasse);
            return ["success" => \true, "data" => $destaques];
        }
        // Verifica se a requisição é específica para revelar o destaque
        if (isset($filters['acao']) && $filters['acao'] === 'destaques') {
            $destaques = self::revelarDestaque($conn);
            return ["success" => \true, "data" => $destaques];
        }
        // Fluxo normal da artilharia
        $filtro = \App\Shared\Database\SqlFilters::aplicarFiltrosArtilharia($filters);
        $sql = "SELECT \n                    usuarios.id_usuario,\n                    usuarios.nome_usuario, \n                    usuarios.foto_usuario,\n                    SUM(CASE WHEN artilheiros.status_artilheiro = 'ativo' AND artilheiros.conta_no_placar = 1 THEN artilheiros.num_gol ELSE 0 END) AS total_gols,\n                    COUNT(*) AS total_acoes,\n                    SUM(CASE WHEN artilheiros.status_artilheiro = 'anulado' OR artilheiros.conta_no_placar = 0 THEN 1 ELSE 0 END) AS total_anulados,\n                    modalidades.nome_modalidade,\n                    turmas.nome_turma,\n                    turmas.nome_fantasia_turma\n                FROM artilheiros\n                INNER JOIN usuarios ON artilheiros.usuarios_id_usuario = usuarios.id_usuario\n                INNER JOIN turmas ON usuarios.turmas_id_turma = turmas.id_turma\n                INNER JOIN jogos ON artilheiros.jogos_id_jogo = jogos.id_jogo\n                INNER JOIN modalidades ON jogos.modalidades_id_modalidade = modalidades.id_modalidade\n                INNER JOIN categorias ON modalidades.categorias_id_categoria = categorias.id_categoria\n                WHERE 1=1" . $filtro['sql'];
        $sql .= " GROUP BY usuarios.id_usuario, modalidades.id_modalidade \n                  ORDER BY total_gols DESC, total_acoes DESC";
        $stmt = $conn->prepare($sql);
        if ($stmt === false) {
            throw new \RuntimeException('Não foi possível consultar a artilharia.');
        }
        if (!empty($filtro['params'])) {
            $stmt->bind_param($filtro['types'], ...$filtro['params']);
        }
        $stmt->execute();
        $res = $stmt->get_result();
        $artilharia = $res->fetch_all(\MYSQLI_ASSOC);
        return $artilharia;
    }
}
