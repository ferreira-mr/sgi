<?php

declare(strict_types=1);

namespace App\Modules\Participantes\Infrastructure;

use mysqli;

final class MysqliPortalAlunoRepository
{
    public function __construct(private readonly mysqli $connection)
    {
    }

    /** @return array<string, mixed> */
    public function context(int $userId, int $editionId): array
    {
        if ($editionId <= 0) {
            $editionId = (int) ($this->connection->query("SELECT id_interclasse FROM interclasses WHERE status_interclasse = '1' ORDER BY id_interclasse DESC LIMIT 1")->fetch_assoc()['id_interclasse'] ?? 0);
        }
        $statement = $this->connection->prepare('SELECT u.genero_usuario, t.categorias_id_categoria, t.id_turma FROM usuarios u LEFT JOIN turmas t ON u.turmas_id_turma = t.id_turma WHERE u.id_usuario = ?');
        $statement->bind_param('i', $userId);
        $statement->execute();
        $user = $statement->get_result()->fetch_assoc() ?? [];
        $statement->close();
        $statement = $this->connection->prepare("SELECT m.id_modalidade, m.nome_modalidade, m.genero_modalidade, e.id_equipe, c.nome_categoria, m.categorias_id_categoria FROM equipes_has_usuarios eu JOIN equipes e ON eu.equipes_id_equipe = e.id_equipe JOIN modalidades m ON e.modalidades_id_modalidade = m.id_modalidade JOIN categorias c ON m.categorias_id_categoria = c.id_categoria WHERE eu.usuarios_id_usuario = ? AND e.status_equipe = '1' AND (? = 0 OR m.interclasses_id_interclasse = ?)");
        $statement->bind_param('iii', $userId, $editionId, $editionId);
        $statement->execute();
        $subscriptions = $statement->get_result()->fetch_all(MYSQLI_ASSOC);
        $statement->close();
        $planning = null;
        $table = $this->connection->query("SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'interclasse_planejamentos'");
        if ($table !== false && (int) ($table->fetch_assoc()['total'] ?? 0) > 0) {
            $statement = $this->connection->prepare('SELECT cronograma_versao, versao_publicada, cronograma_status, inscricoes_status FROM interclasse_planejamentos WHERE id_interclasse = ? LIMIT 1');
            $statement->bind_param('i', $editionId);
            $statement->execute();
            $planning = $statement->get_result()->fetch_assoc() ?: null;
            $statement->close();
        }
        return [
            'id_usuario' => $userId,
            'genero_usuario' => $user['genero_usuario'] ?? 'MASC',
            'categoria_usuario' => (int) ($user['categorias_id_categoria'] ?? 0),
            'turma_usuario' => (int) ($user['id_turma'] ?? 0),
            'idInterclassePagina' => $editionId,
            'modalidades_inscritas' => $subscriptions,
            'cronograma_versao' => $planning === null ? null : (int) $planning['cronograma_versao'],
            'versao_publicada' => $planning === null || $planning['versao_publicada'] === null ? null : (int) $planning['versao_publicada'],
            'cronograma_status' => $planning['cronograma_status'] ?? null,
            'inscricoes_status' => $planning['inscricoes_status'] ?? null,
        ];
    }
}
