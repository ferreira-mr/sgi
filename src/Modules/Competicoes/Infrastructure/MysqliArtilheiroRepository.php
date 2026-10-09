<?php

declare(strict_types=1);

namespace App\Modules\Competicoes\Infrastructure;

use App\Modules\Competicoes\Domain\ArtilheiroRepository;
use mysqli;
use RuntimeException;

final class MysqliArtilheiroRepository implements ArtilheiroRepository
{
    public function __construct(private readonly mysqli $connection)
    {
    }

    public function create(int $userId, int $gameId, int $goals): int
    {
        $statement = $this->connection->prepare(
            'INSERT INTO artilheiros (usuarios_id_usuario, jogos_id_jogo, num_gol) VALUES (?, ?, ?)',
        );
        if ($statement === false) {
            throw new RuntimeException('Não foi possível registrar artilharia.');
        }
        $statement->bind_param('iii', $userId, $gameId, $goals);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível registrar artilharia.');
        }
        $id = (int) $this->connection->insert_id;
        $statement->close();
        return $id;
    }

    public function update(int $userId, int $gameId, int $goals): bool
    {
        $statement = $this->connection->prepare(
            'UPDATE artilheiros SET num_gol = ? WHERE usuarios_id_usuario = ? AND jogos_id_jogo = ?',
        );
        if ($statement === false) {
            throw new RuntimeException('Não foi possível atualizar artilharia.');
        }
        $statement->bind_param('iii', $goals, $userId, $gameId);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível atualizar artilharia.');
        }
        $updated = $statement->affected_rows > 0;
        $statement->close();
        return $updated;
    }

    public function editionOfGame(int $gameId): ?int
    {
        return $this->scalarEdition(
            'SELECT m.interclasses_id_interclasse
             FROM jogos j
             INNER JOIN modalidades m ON m.id_modalidade = j.modalidades_id_modalidade
             WHERE j.id_jogo = ?
             LIMIT 1',
            $gameId,
        );
    }

    public function editionOfUser(int $userId): ?int
    {
        return $this->scalarEdition(
            'SELECT interclasses_id_interclasse FROM usuarios WHERE id_usuario = ? LIMIT 1',
            $userId,
        );
    }

    public function roleOfUser(int $userId): ?int
    {
        $statement = $this->connection->prepare('SELECT nivel_usuario FROM usuarios WHERE id_usuario = ? LIMIT 1');
        if ($statement === false) {
            throw new RuntimeException('Não foi possível consultar o estudante.');
        }
        $statement->bind_param('i', $userId);
        $statement->execute();
        $value = $statement->get_result()->fetch_column();
        $statement->close();
        return $value === null || $value === false ? null : (int) $value;
    }

    public function athleteParticipatesInGame(int $userId, int $gameId): bool
    {
        $statement = $this->connection->prepare(
            'SELECT 1
             FROM equipes_has_usuarios eu
             INNER JOIN partidas p ON p.equipes_id_equipe = eu.equipes_id_equipe
             WHERE eu.usuarios_id_usuario = ? AND p.jogos_id_jogo = ?
             LIMIT 1',
        );
        if ($statement === false) {
            throw new RuntimeException('Não foi possível validar o estudante no jogo.');
        }
        $statement->bind_param('ii', $userId, $gameId);
        $statement->execute();
        $exists = $statement->get_result()->num_rows > 0;
        $statement->close();
        return $exists;
    }

    private function scalarEdition(string $sql, int $id): ?int
    {
        $statement = $this->connection->prepare($sql);
        if ($statement === false) {
            throw new RuntimeException('Não foi possível consultar a edição do recurso.');
        }
        $statement->bind_param('i', $id);
        $statement->execute();
        $value = $statement->get_result()->fetch_column();
        $statement->close();
        return $value === null || $value === false ? null : (int) $value;
    }
}
