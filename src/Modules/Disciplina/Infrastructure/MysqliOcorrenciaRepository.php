<?php

declare(strict_types=1);

namespace App\Modules\Disciplina\Infrastructure;

use App\Modules\Disciplina\Domain\OcorrenciaRepository;
use App\Modules\Disciplina\Domain\AutomaticOccurrenceConflict;
use App\Modules\Disciplina\Domain\OcorrenciaDescricao;
use mysqli;
use RuntimeException;

final class MysqliOcorrenciaRepository implements OcorrenciaRepository
{
    public function __construct(private readonly mysqli $connection)
    {
    }

    public function create(array $data): array
    {
        \App\Shared\Database\Transaction::begin($this->connection);
        try {
            $title = (string) $data['titulo_ocorrencia'];
            $userId = (int) $data['usuarios_id_usuario'];
            $gameId = (int) ($data['id_jogo'] ?? 0);
            // Serialize every occurrence with student transfers and other
            // writes that use the same user row as their coordination lock.
            $this->lockUser($userId);
            $statement = $this->connection->prepare(
                'INSERT INTO ocorrencias (titulo_ocorrencia, descricao_ocorrencia, data_ocorrencia,
                    usuarios_id_usuario, penalidade) VALUES (?, ?, ?, ?, ?)',
            );
            if ($statement === false) {
                throw new RuntimeException('Não foi possível registrar ocorrência.');
            }
            $description = (string) $data['descricao_ocorrencia'];
            $date = (string) $data['data_ocorrencia'];
            $penalty = (int) $data['penalidade'];
            $statement->bind_param('sssii', $title, $description, $date, $userId, $penalty);
            if (!$statement->execute()) {
                $statement->close();
                throw new RuntimeException('Não foi possível registrar ocorrência.');
            }
            $id = (int) $this->connection->insert_id;
            $statement->close();
            $event = null;
            if ($title === 'Amarelo' && $gameId > 0) {
                if (count($this->activeYellowIds($userId, $gameId)) >= 2) {
                    $event = 'segundo_amarelo';
                    $this->reconcileAutomaticRed($userId, $gameId);
                }
            }
            \App\Shared\Database\Transaction::commit($this->connection);
            return ['id' => $id, 'evento' => $event];
        } catch (\Throwable $exception) {
            \App\Shared\Database\Transaction::rollback($this->connection);
            throw $exception;
        }
    }

    public function find(int $id): ?array
    {
        $statement = $this->prepare(
            'SELECT o.id_ocorrencia, o.usuarios_id_usuario, o.titulo_ocorrencia,
                    o.descricao_ocorrencia, o.status_ocorrencia,
                    EXISTS (SELECT 1 FROM ocorrencias_vermelhos_automaticos a
                            WHERE a.ocorrencia_vermelha_id = o.id_ocorrencia) AS automatico_derivado
             FROM ocorrencias o WHERE o.id_ocorrencia = ? LIMIT 1',
        );
        $statement->bind_param('i', $id);
        $statement->execute();
        $row = $statement->get_result()->fetch_assoc() ?: null;
        $statement->close();
        return $row;
    }

    public function editionOfUser(int $userId): ?int
    {
        return $this->scalar('SELECT interclasses_id_interclasse FROM usuarios WHERE id_usuario = ? LIMIT 1', $userId);
    }

    public function roleOfUser(int $userId): ?int
    {
        $value = $this->scalar('SELECT nivel_usuario FROM usuarios WHERE id_usuario = ? LIMIT 1', $userId);
        return $value;
    }

    public function editionOfGame(int $gameId): ?int
    {
        return $this->scalar(
            'SELECT m.interclasses_id_interclasse
             FROM jogos j
             INNER JOIN modalidades m ON m.id_modalidade = j.modalidades_id_modalidade
             WHERE j.id_jogo = ?
             LIMIT 1',
            $gameId,
        );
    }

    public function editionOfTurma(int $turmaId): ?int
    {
        return $this->scalar('SELECT interclasses_id_interclasse FROM turmas WHERE id_turma = ? LIMIT 1', $turmaId);
    }

    public function gameContainsTurma(int $gameId, int $turmaId): bool
    {
        return $this->exists(
            'SELECT 1
             FROM partidas p
             INNER JOIN equipes e ON e.id_equipe = p.equipes_id_equipe
             INNER JOIN turmas t ON t.id_turma = e.turmas_id_turma
             WHERE p.jogos_id_jogo = ? AND t.id_turma = ?
             LIMIT 1',
            $gameId,
            $turmaId,
        );
    }

    public function userBelongsToTurma(int $userId, int $turmaId): bool
    {
        return $this->exists('SELECT 1 FROM usuarios WHERE id_usuario = ? AND turmas_id_turma = ? LIMIT 1', $userId, $turmaId);
    }

    public function userParticipatesInGame(int $userId, int $gameId): bool
    {
        return $this->exists(
            'SELECT 1
             FROM equipes_has_usuarios eu
             INNER JOIN partidas p ON p.equipes_id_equipe = eu.equipes_id_equipe
             WHERE eu.usuarios_id_usuario = ? AND p.jogos_id_jogo = ?
             LIMIT 1',
            $userId,
            $gameId,
        );
    }

    public function update(int $id, array $data): bool
    {
        $fields = [];
        $values = [];
        $types = '';
        foreach ([
            'titulo_ocorrencia' => 's',
            'descricao_ocorrencia' => 's',
            'status_ocorrencia' => 's',
            'penalidade' => 'i',
        ] as $field => $type) {
            if (array_key_exists($field, $data)) {
                $fields[] = $field . ' = ?';
                $values[] = $data[$field];
                $types .= $type;
            }
        }
        if ($fields === []) {
            throw new RuntimeException('Nenhum dado fornecido para atualização.');
        }
        \App\Shared\Database\Transaction::begin($this->connection);
        try {
            $initial = $this->loadOccurrence($id);
            if ($initial === null) {
                \App\Shared\Database\Transaction::commit($this->connection);
                return false;
            }
            $userId = (int) $initial['usuarios_id_usuario'];
            $this->lockUser($userId);
            $existing = $this->loadOccurrence($id, true);
            if ($existing === null || (int) $existing['usuarios_id_usuario'] !== $userId) {
                \App\Shared\Database\Transaction::commit($this->connection);
                return false;
            }
            if ((int) $existing['automatico_derivado'] === 1) {
                throw new AutomaticOccurrenceConflict('Vermelho automático é atualizado pelos cartões amarelos de origem.');
            }

            $values[] = $id;
            $types .= 'i';
            $statement = $this->connection->prepare(
                'UPDATE ocorrencias SET ' . implode(', ', $fields) . ' WHERE id_ocorrencia = ? AND usuarios_id_usuario = ?',
            );
            if ($statement === false) {
                throw new RuntimeException('Não foi possível atualizar ocorrência.');
            }
            $values[] = $userId;
            $types .= 'i';
            $statement->bind_param($types, ...$values);
            if (!$statement->execute()) {
                $statement->close();
                throw new RuntimeException('Não foi possível atualizar ocorrência.');
            }
            $updated = $statement->affected_rows > 0;
            $statement->close();

            $newTitle = (string) ($data['titulo_ocorrencia'] ?? $existing['titulo_ocorrencia']);
            if ($newTitle === 'Amarelo' || (string) $existing['titulo_ocorrencia'] === 'Amarelo') {
                $gameId = OcorrenciaDescricao::fromStored((string) $existing['descricao_ocorrencia'])['gameId'];
                if ($gameId > 0) {
                    $this->reconcileAutomaticRed($userId, $gameId);
                }
            }
            \App\Shared\Database\Transaction::commit($this->connection);
            return $updated;
        } catch (\Throwable $exception) {
            \App\Shared\Database\Transaction::rollback($this->connection);
            throw $exception;
        }
    }

    private function lockUser(int $userId): void
    {
        $statement = $this->connection->prepare('SELECT id_usuario FROM usuarios WHERE id_usuario = ? FOR UPDATE');
        if ($statement === false) {
            throw new RuntimeException('Não foi possível serializar os cartões do estudante.');
        }
        $statement->bind_param('i', $userId);
        if (!$statement->execute() || $statement->get_result()->num_rows !== 1) {
            $statement->close();
            throw new RuntimeException('Estudante não encontrado.');
        }
        $statement->close();
    }

    /** @return list<int> */
    private function activeYellowIds(int $userId, int $gameId): array
    {
        $statement = $this->connection->prepare(
            "SELECT id_ocorrencia FROM ocorrencias
             WHERE usuarios_id_usuario = ? AND titulo_ocorrencia = 'Amarelo'
               AND descricao_ocorrencia LIKE ? AND status_ocorrencia = '1'
             ORDER BY id_ocorrencia FOR UPDATE",
        );
        if ($statement === false) {
            throw new RuntimeException('Não foi possível verificar cartões.');
        }
        $marker = '%[JOGO:' . $gameId . ']%';
        $statement->bind_param('is', $userId, $marker);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível verificar cartões.');
        }
        $ids = array_map('intval', array_column($statement->get_result()->fetch_all(MYSQLI_ASSOC), 'id_ocorrencia'));
        $statement->close();
        return $ids;
    }

    private function reconcileAutomaticRed(int $userId, int $gameId): void
    {
        $yellowIds = $this->activeYellowIds($userId, $gameId);
        $link = $this->connection->prepare(
            'SELECT ocorrencia_vermelha_id FROM ocorrencias_vermelhos_automaticos
             WHERE usuarios_id_usuario = ? AND jogos_id_jogo = ? FOR UPDATE',
        );
        if ($link === false) {
            throw new RuntimeException('Não foi possível consultar expulsão automática.');
        }
        $link->bind_param('ii', $userId, $gameId);
        if (!$link->execute()) {
            $link->close();
            throw new RuntimeException('Não foi possível consultar expulsão automática.');
        }
        $redId = $link->get_result()->fetch_column();
        $link->close();

        if (count($yellowIds) < 2) {
            if ($redId !== false && $redId !== null) {
                $deactivate = $this->connection->prepare(
                    "UPDATE ocorrencias SET status_ocorrencia = '0'
                     WHERE id_ocorrencia = ? AND usuarios_id_usuario = ?",
                );
                if ($deactivate === false) {
                    throw new RuntimeException('Não foi possível corrigir expulsão automática.');
                }
                $redId = (int) $redId;
                $deactivate->bind_param('ii', $redId, $userId);
                if (!$deactivate->execute()) {
                    $deactivate->close();
                    throw new RuntimeException('Não foi possível corrigir expulsão automática.');
                }
                $deactivate->close();
            }
            return;
        }

        $sourceId = $yellowIds[1];
        $source = $this->connection->prepare(
            "SELECT data_ocorrencia, descricao_ocorrencia FROM ocorrencias
             WHERE id_ocorrencia = ? AND usuarios_id_usuario = ? FOR UPDATE",
        );
        if ($source === false) {
            throw new RuntimeException('Não foi possível consultar cartão de origem.');
        }
        $source->bind_param('ii', $sourceId, $userId);
        if (!$source->execute() || ($sourceRow = $source->get_result()->fetch_assoc()) === null) {
            $source->close();
            throw new RuntimeException('Não foi possível consultar cartão de origem.');
        }
        $source->close();
        $classId = OcorrenciaDescricao::fromStored((string) $sourceRow['descricao_ocorrencia'])['classId'];
        $redDescription = '[JOGO:' . $gameId . ']' . ($classId > 0 ? '[TURMA:' . $classId . ']' : '')
            . 'Segundo cartão amarelo — expulso automático';
        $redDate = (string) $sourceRow['data_ocorrencia'];

        if ($redId === false || $redId === null) {
            $insert = $this->connection->prepare(
                "INSERT INTO ocorrencias (titulo_ocorrencia, descricao_ocorrencia, data_ocorrencia,
                    usuarios_id_usuario, penalidade, status_ocorrencia)
                 VALUES ('Vermelho', ?, ?, ?, 1, '1')",
            );
            if ($insert === false) {
                throw new RuntimeException('Não foi possível registrar expulsão automática.');
            }
            $insert->bind_param('ssi', $redDescription, $redDate, $userId);
            if (!$insert->execute()) {
                $insert->close();
                throw new RuntimeException('Não foi possível registrar expulsão automática.');
            }
            $redId = (int) $this->connection->insert_id;
            $insert->close();
            $createLink = $this->connection->prepare(
                'INSERT INTO ocorrencias_vermelhos_automaticos
                    (ocorrencia_vermelha_id, usuarios_id_usuario, jogos_id_jogo, ocorrencia_amarela_origem_id)
                 VALUES (?, ?, ?, ?)',
            );
            if ($createLink === false) {
                throw new RuntimeException('Não foi possível vincular expulsão automática.');
            }
            $createLink->bind_param('iiii', $redId, $userId, $gameId, $sourceId);
            if (!$createLink->execute()) {
                $createLink->close();
                throw new RuntimeException('Não foi possível vincular expulsão automática.');
            }
            $createLink->close();
            return;
        }

        $redId = (int) $redId;
        $activate = $this->connection->prepare(
            "UPDATE ocorrencias SET titulo_ocorrencia = 'Vermelho', descricao_ocorrencia = ?,
                data_ocorrencia = ?, penalidade = 1, status_ocorrencia = '1'
             WHERE id_ocorrencia = ? AND usuarios_id_usuario = ?",
        );
        if ($activate === false) {
            throw new RuntimeException('Não foi possível reativar expulsão automática.');
        }
        $activate->bind_param('ssii', $redDescription, $redDate, $redId, $userId);
        if (!$activate->execute()) {
            $activate->close();
            throw new RuntimeException('Não foi possível reativar expulsão automática.');
        }
        $activate->close();
        $updateSource = $this->connection->prepare(
            'UPDATE ocorrencias_vermelhos_automaticos SET ocorrencia_amarela_origem_id = ?
             WHERE ocorrencia_vermelha_id = ? AND usuarios_id_usuario = ? AND jogos_id_jogo = ?',
        );
        if ($updateSource === false) {
            throw new RuntimeException('Não foi possível atualizar origem da expulsão automática.');
        }
        $updateSource->bind_param('iiii', $sourceId, $redId, $userId, $gameId);
        if (!$updateSource->execute()) {
            $updateSource->close();
            throw new RuntimeException('Não foi possível atualizar origem da expulsão automática.');
        }
        $updateSource->close();
    }

    /** @return array<string, mixed>|null */
    private function loadOccurrence(int $id, bool $forUpdate = false): ?array
    {
        $sql = 'SELECT o.id_ocorrencia, o.usuarios_id_usuario, o.titulo_ocorrencia,
                       o.descricao_ocorrencia, o.data_ocorrencia, o.status_ocorrencia,
                       EXISTS (SELECT 1 FROM ocorrencias_vermelhos_automaticos a
                               WHERE a.ocorrencia_vermelha_id = o.id_ocorrencia) AS automatico_derivado
                FROM ocorrencias o WHERE o.id_ocorrencia = ? LIMIT 1' . ($forUpdate ? ' FOR UPDATE' : '');
        $statement = $this->prepare($sql);
        $statement->bind_param('i', $id);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível consultar ocorrência.');
        }
        $row = $statement->get_result()->fetch_assoc() ?: null;
        $statement->close();
        if ($row !== null && $forUpdate) {
            $row['automatico_derivado'] = $this->isAutomaticRed($id, true) ? 1 : 0;
        }
        return $row;
    }

    private function isAutomaticRed(int $occurrenceId, bool $forUpdate = false): bool
    {
        $statement = $this->prepare(
            'SELECT ocorrencia_vermelha_id FROM ocorrencias_vermelhos_automaticos
             WHERE ocorrencia_vermelha_id = ? LIMIT 1' . ($forUpdate ? ' FOR UPDATE' : ''),
        );
        $statement->bind_param('i', $occurrenceId);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível verificar a origem da ocorrência.');
        }
        $found = $statement->get_result()->num_rows > 0;
        $statement->close();
        return $found;
    }

    private function prepare(string $sql): \mysqli_stmt
    {
        $statement = $this->connection->prepare($sql);
        if ($statement === false) {
            throw new RuntimeException('Não foi possível consultar ocorrência.');
        }
        return $statement;
    }

    private function scalar(string $sql, int $id): ?int
    {
        $statement = $this->prepare($sql);
        $statement->bind_param('i', $id);
        $statement->execute();
        $value = $statement->get_result()->fetch_column();
        $statement->close();
        return $value === null || $value === false ? null : (int) $value;
    }

    private function exists(string $sql, int $firstId, int $secondId): bool
    {
        $statement = $this->prepare($sql);
        $statement->bind_param('ii', $firstId, $secondId);
        $statement->execute();
        $exists = $statement->get_result()->num_rows > 0;
        $statement->close();
        return $exists;
    }
}
