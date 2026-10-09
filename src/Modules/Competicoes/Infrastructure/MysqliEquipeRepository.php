<?php

declare(strict_types=1);

namespace App\Modules\Competicoes\Infrastructure;

use App\Modules\Competicoes\Application\EquipeLimiteException;
use App\Modules\Competicoes\Domain\EquipeCapacityRules;
use App\Modules\Competicoes\Domain\EquipeRepository;
use App\Modules\Competicoes\Domain\EquipeRosterRules;
use App\Modules\Competicoes\Domain\CronogramaRepository;
use App\Modules\Competicoes\Domain\CronogramaRules;
use App\Shared\Database\Transaction;
use mysqli;
use RuntimeException;

final class MysqliEquipeRepository implements EquipeRepository
{
    public function __construct(private readonly mysqli $connection, private readonly ?CronogramaRepository $cronograma = null)
    {
    }

    private ?bool $planningAvailable = null;

    public function create(array $data): array
    {
        $modalityId = (int) $data['modalidades_id_modalidade'];
        $classId = (int) $data['turmas_id_turma'];
        $status = (string) ($data['status_equipe'] ?? '1');

        Transaction::begin($this->connection);
        try {
            $scope = $this->lockScope($modalityId, $classId);
            if ($status === '1') {
                $active = $this->activeCount($modalityId, $classId);
                $this->assertCapacity($scope['max_equipes'], $active);
            }
            $name = $data['nome_equipe'] === null ? $this->generateName($modalityId, $classId) : (string) $data['nome_equipe'];

            $statement = $this->connection->prepare(
                'INSERT INTO equipes (modalidades_id_modalidade, turmas_id_turma, status_equipe, nome_equipe)
                 VALUES (?, ?, ?, ?)',
            );
            if ($statement === false) {
                throw new RuntimeException('Não foi possível criar equipe.');
            }
            $statement->bind_param('iiss', $modalityId, $classId, $status, $name);
            if (!$statement->execute()) {
                $statement->close();
                throw new RuntimeException('Não foi possível criar equipe.');
            }
            $id = (int) $this->connection->insert_id;
            $statement->close();
            Transaction::commit($this->connection);

            return ['id_equipe' => $id, 'nome_equipe' => $name];
        } catch (\Throwable $exception) {
            Transaction::rollback($this->connection);
            throw $exception;
        }
    }

    public function addUsers(int $teamId, array $userIds): void
    {
        if ($userIds === []) {
            return;
        }

        $lockIds = array_values(array_unique(array_map('intval', $userIds)));
        sort($lockIds, SORT_NUMERIC);

        // Find the serialization lock before opening the transaction. A plain
        // read here would establish a REPEATABLE READ snapshot; if this request
        // then waited on the edition lock, later capacity counts could miss a
        // member committed by the request that held it.
        $teamSeed = $this->one(
            'SELECT e.modalidades_id_modalidade, e.turmas_id_turma,
                    m.interclasses_id_interclasse
             FROM equipes e
             INNER JOIN modalidades m ON m.id_modalidade = e.modalidades_id_modalidade
             WHERE e.id_equipe = ? LIMIT 1',
            'i',
            [$teamId],
        );
        if ($teamSeed === null) {
            throw new \InvalidArgumentException('Equipe não encontrada.');
        }

        $editionId = (int) $teamSeed['interclasses_id_interclasse'];
        Transaction::begin($this->connection);
        try {
            if ($this->one(
                'SELECT id_interclasse FROM interclasses WHERE id_interclasse = ? LIMIT 1 FOR UPDATE',
                'i',
                [$editionId],
            ) === null) {
                throw new \InvalidArgumentException('Edição da equipe não encontrada.');
            }

            $students = [];
            foreach ($lockIds as $userId) {
                $student = $this->one(
                    'SELECT id_usuario, nivel_usuario, status_usuario, genero_usuario,
                            turmas_id_turma, interclasses_id_interclasse
                     FROM usuarios WHERE id_usuario = ? LIMIT 1 FOR UPDATE',
                    'i',
                    [$userId],
                );
                if ($student === null) {
                    throw new \InvalidArgumentException('Um ou mais usuários informados não existem.');
                }
                $students[$userId] = $student;
            }

            // Match the modality -> class order used by team creation and roster
            // redistribution. Portal enrollment is serialized by the edition row.
            $modalityId = (int) $teamSeed['modalidades_id_modalidade'];
            $classId = (int) $teamSeed['turmas_id_turma'];
            $modality = $this->one(
                'SELECT id_modalidade, status_modalidade, genero_modalidade,
                        categorias_id_categoria, interclasses_id_interclasse,
                        max_inscrito_modalidade, max_equipes
                 FROM modalidades WHERE id_modalidade = ? LIMIT 1 FOR UPDATE',
                'i',
                [$modalityId],
            );
            $class = $this->one(
                'SELECT id_turma, status_turma, interclasses_id_interclasse, categorias_id_categoria
                 FROM turmas WHERE id_turma = ? LIMIT 1 FOR UPDATE',
                'i',
                [$classId],
            );
            $team = $this->one(
                'SELECT id_equipe, status_equipe, modalidades_id_modalidade, turmas_id_turma
                 FROM equipes WHERE id_equipe = ? LIMIT 1 FOR UPDATE',
                'i',
                [$teamId],
            );
            if ($modality === null || $class === null || $team === null
                || (int) $team['modalidades_id_modalidade'] !== $modalityId
                || (int) $team['turmas_id_turma'] !== $classId
            ) {
                throw new \InvalidArgumentException('A turma, modalidade ou equipe foi alterada durante a vinculação. Tente novamente.');
            }

            EquipeRosterRules::validarContexto($team, $class, $modality);
            if ((int) $modality['interclasses_id_interclasse'] !== $editionId) {
                throw new \InvalidArgumentException('A edição da equipe foi alterada durante a vinculação.');
            }

            $newUserIds = [];
            foreach ($lockIds as $userId) {
                $student = $students[$userId];
                $memberships = $this->activeMembershipsInEdition($userId, $editionId);
                $alreadyOnTarget = false;
                foreach ($memberships as $membership) {
                    if ((int) $membership['id_modalidade'] !== $modalityId) {
                        continue;
                    }
                    if ((int) $membership['id_equipe'] === $teamId) {
                        $alreadyOnTarget = true;
                        continue;
                    }
                    throw new \InvalidArgumentException('O estudante já está vinculado a outra equipe desta modalidade.');
                }
                if ($alreadyOnTarget) {
                    // Replaying the same administrative request remains idempotent,
                    // even if the student's eligibility changed after it succeeded.
                    continue;
                }

                EquipeRosterRules::validarAluno($student, $team, $class, $modality);
                $existingModalityIds = array_values(array_unique(array_map(
                    static fn (array $membership): int => (int) $membership['id_modalidade'],
                    $memberships,
                )));
                EquipeRosterRules::validarLimiteModalidades($existingModalityIds, $modalityId);
                $newUserIds[] = $userId;
            }

            $newMembers = count($newUserIds);
            if ($newMembers > 0) {
                foreach ($newUserIds as $newUserId) {
                    $this->assertScheduleCompatibility($newUserId, $editionId, $teamId, $modalityId);
                }
                $teamMembers = $this->activeMemberCountForTeam($teamId);
                $plannedConfig = $this->plannedModality($modalityId);
                $maxMembers = $plannedConfig !== null
                    ? (int) $plannedConfig['max_inscritos_equipe']
                    : ($modality['max_inscrito_modalidade'] === null
                    ? null
                    : (int) $modality['max_inscrito_modalidade']);
                EquipeRosterRules::validarCapacidadeEquipe($teamMembers, $newMembers, $maxMembers);

                $modalityMembers = $this->activeMemberCountForModalityClass($modalityId, $classId);
                $maxTeams = $modality['max_equipes'] === null ? null : (int) $modality['max_equipes'];
                EquipeRosterRules::validarCapacidadeModalidade($modalityMembers, $newMembers, $maxMembers, $maxTeams);

                $statement = $this->connection->prepare(
                    'INSERT IGNORE INTO equipes_has_usuarios (equipes_id_equipe, usuarios_id_usuario) VALUES (?, ?)',
                );
                if ($statement === false) {
                    throw new RuntimeException('Não foi possível vincular usuários à equipe.');
                }
                $userId = 0;
                $statement->bind_param('ii', $teamId, $userId);
                foreach ($newUserIds as $userId) {
                    if (!$statement->execute()) {
                        $statement->close();
                        throw new RuntimeException('Não foi possível vincular usuários à equipe.');
                    }
                }
                $statement->close();
            }

            Transaction::commit($this->connection);
        } catch (\Throwable $exception) {
            Transaction::rollback($this->connection);
            throw $exception;
        }
    }

    /** @return list<array{id_equipe:int,id_modalidade:int}> */
    private function activeMembershipsInEdition(int $userId, int $editionId): array
    {
        $statement = $this->connection->prepare(
            "SELECT e.id_equipe, m.id_modalidade
             FROM equipes_has_usuarios eu
             INNER JOIN equipes e ON e.id_equipe = eu.equipes_id_equipe AND e.status_equipe = '1'
             INNER JOIN modalidades m ON m.id_modalidade = e.modalidades_id_modalidade
             WHERE eu.usuarios_id_usuario = ? AND m.interclasses_id_interclasse = ?
             ORDER BY m.id_modalidade, e.id_equipe",
        );
        if ($statement === false) {
            throw new RuntimeException('Não foi possível consultar as modalidades do estudante.');
        }
        $statement->bind_param('ii', $userId, $editionId);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível consultar as modalidades do estudante.');
        }
        $rows = $statement->get_result()->fetch_all(MYSQLI_ASSOC);
        $statement->close();

        return array_map(
            static fn (array $row): array => [
                'id_equipe' => (int) $row['id_equipe'],
                'id_modalidade' => (int) $row['id_modalidade'],
            ],
            $rows,
        );
    }

    private function activeMemberCountForTeam(int $teamId): int
    {
        return $this->count(
            "SELECT COUNT(DISTINCT eu.usuarios_id_usuario)
             FROM equipes_has_usuarios eu
             INNER JOIN usuarios u ON u.id_usuario = eu.usuarios_id_usuario AND u.status_usuario = '1'
             WHERE eu.equipes_id_equipe = ?",
            [$teamId],
        );
    }

    private function activeMemberCountForModalityClass(int $modalityId, int $classId): int
    {
        return $this->count(
            "SELECT COUNT(DISTINCT eu.usuarios_id_usuario)
             FROM equipes_has_usuarios eu
             INNER JOIN equipes e ON e.id_equipe = eu.equipes_id_equipe AND e.status_equipe = '1'
             INNER JOIN usuarios u ON u.id_usuario = eu.usuarios_id_usuario AND u.status_usuario = '1'
             WHERE e.modalidades_id_modalidade = ? AND e.turmas_id_turma = ?",
            [$modalityId, $classId],
        );
    }

    private function assertScheduleCompatibility(int $userId, int $editionId, int $teamId, int $modalityId): void
    {
        if ($this->cronograma === null || !$this->planningAvailable()) {
            return;
        }
        $edition = $this->one('SELECT cronograma_status, inscricoes_status, inscricoes_abertura, inscricoes_encerramento FROM interclasse_planejamentos WHERE id_interclasse = ? LIMIT 1', 'i', [$editionId]);
        if ($edition === null) {
            return;
        }
        // O elenco administrativo é preparado antes da publicação. A janela
        // pública de inscrições só deve ser exigida pelo caso de uso de
        // inscrição; no rascunho/revisão ainda não há compromissos publicados
        // contra os quais comparar a equipe.
        if ((string) ($edition['cronograma_status'] ?? CronogramaRules::RASCUNHO) !== CronogramaRules::PUBLICADO) {
            return;
        }
        $prepared = $this->one('SELECT id_equipe FROM equipe_planejamentos WHERE id_equipe = ? AND planejada = 1 LIMIT 1', 'i', [$teamId]);
        if ($prepared === null) {
            throw new \InvalidArgumentException('A equipe ainda não foi preparada no cronograma publicado.');
        }
        $existingIds = array_map(static fn (array $row): int => (int) $row['id_equipe'], $this->activeMembershipsInEdition($userId, $editionId));
        $existingCommitments = $this->cronograma->commitmentsForTeams($editionId, $existingIds);
        $candidateCommitments = $this->cronograma->commitmentsForTeams($editionId, [$teamId]);
        foreach ($candidateCommitments as $candidate) {
            foreach ($existingCommitments as $existing) {
                if ((int) $candidate['id_modalidade'] === (int) $existing['id_modalidade']) {
                    continue;
                }
                if (CronogramaRules::schedulesConflict($candidate, $existing)) {
                    throw new \InvalidArgumentException(sprintf('Conflito de agenda entre as modalidades %s e %s.', $modalityId, (int) $existing['id_modalidade']));
                }
            }
        }
    }

    private function planningAvailable(): bool
    {
        if ($this->planningAvailable !== null) {
            return $this->planningAvailable;
        }
        $result = $this->connection->query("SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'interclasse_planejamentos'");
        if ($result === false) {
            return $this->planningAvailable = false;
        }
        $row = $result->fetch_assoc();
        $result->free();
        return $this->planningAvailable = ((int) ($row['total'] ?? 0) > 0);
    }

    /** @return array<string,mixed>|null */
    private function plannedModality(int $modalityId): ?array
    {
        if (!$this->planningAvailable()) {
            return null;
        }
        return $this->one('SELECT max_inscritos_equipe FROM modalidade_planejamentos WHERE id_modalidade = ? LIMIT 1', 'i', [$modalityId]);
    }

    /** @param list<int> $params */
    private function count(string $sql, array $params): int
    {
        $statement = $this->connection->prepare($sql);
        if ($statement === false) {
            throw new RuntimeException('Não foi possível contar os estudantes da equipe.');
        }
        $statement->bind_param(str_repeat('i', count($params)), ...$params);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível contar os estudantes da equipe.');
        }
        $count = (int) $statement->get_result()->fetch_column();
        $statement->close();

        return $count;
    }

    public function removeUser(int $teamId, int $userId): void
    {
        $statement = $this->connection->prepare(
            'DELETE FROM equipes_has_usuarios WHERE equipes_id_equipe = ? AND usuarios_id_usuario = ?',
        );
        if ($statement === false) {
            throw new RuntimeException('Não foi possível remover estudante da equipe.');
        }
        $statement->bind_param('ii', $teamId, $userId);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível remover estudante da equipe.');
        }
        $statement->close();
    }

    public function update(int $id, array $data): bool
    {
        $fields = [];
        $values = [];
        $types = '';
        foreach ([
            'nome_equipe' => 's',
            'modalidades_id_modalidade' => 'i',
            'turmas_id_turma' => 'i',
            'status_equipe' => 's',
        ] as $field => $type) {
            if (array_key_exists($field, $data)) {
                $fields[] = $field . ' = ?';
                $values[] = $data[$field];
                $types .= $type;
            }
        }
        if ($fields === []) {
            throw new RuntimeException('Nenhum campo válido para atualizar.');
        }

        Transaction::begin($this->connection);
        try {
            $teamSeed = $this->one(
                'SELECT modalidades_id_modalidade, turmas_id_turma, status_equipe
                 FROM equipes WHERE id_equipe = ? LIMIT 1',
                'i',
                [$id],
            );
            if ($teamSeed === null) {
                Transaction::rollback($this->connection);
                return false;
            }
            $targetModality = array_key_exists('modalidades_id_modalidade', $data)
                ? (int) $data['modalidades_id_modalidade']
                : (int) $teamSeed['modalidades_id_modalidade'];
            $targetClass = array_key_exists('turmas_id_turma', $data)
                ? (int) $data['turmas_id_turma']
                : (int) $teamSeed['turmas_id_turma'];
            $targetStatus = array_key_exists('status_equipe', $data)
                ? (string) $data['status_equipe']
                : (string) $teamSeed['status_equipe'];
            $scope = $this->lockScope($targetModality, $targetClass);
            $current = $this->one(
                'SELECT modalidades_id_modalidade, turmas_id_turma, status_equipe
                 FROM equipes WHERE id_equipe = ? LIMIT 1 FOR UPDATE',
                'i',
                [$id],
            );
            if ($current === null
                || (int) $current['modalidades_id_modalidade'] !== (int) $teamSeed['modalidades_id_modalidade']
                || (int) $current['turmas_id_turma'] !== (int) $teamSeed['turmas_id_turma']
                || (string) $current['status_equipe'] !== (string) $teamSeed['status_equipe']
            ) {
                throw new \InvalidArgumentException('A equipe foi alterada durante a atualização. Tente novamente.');
            }
            $changesScope = $targetModality !== (int) $current['modalidades_id_modalidade']
                || $targetClass !== (int) $current['turmas_id_turma'];
            if ($changesScope && $this->hasStructuralDependents($id)) {
                throw new \InvalidArgumentException('A equipe com elenco ou histórico não pode trocar de modalidade ou turma.');
            }
            if ($targetStatus === '1') {
                $this->assertCapacity($scope['max_equipes'], $this->activeCount($targetModality, $targetClass, $id));
            }

            $values[] = $id;
            $types .= 'i';
            $statement = $this->connection->prepare(
                'UPDATE equipes SET ' . implode(', ', $fields) . ' WHERE id_equipe = ?',
            );
            if ($statement === false) {
                throw new RuntimeException('Não foi possível atualizar equipe.');
            }
            $statement->bind_param($types, ...$values);
            if (!$statement->execute()) {
                $statement->close();
                throw new RuntimeException('Não foi possível atualizar equipe.');
            }
            $found = $statement->affected_rows > 0 || $this->exists($id);
            $statement->close();
            Transaction::commit($this->connection);
            return $found;
        } catch (\Throwable $exception) {
            Transaction::rollback($this->connection);
            throw $exception;
        }
    }

    public function deactivate(int $id): bool
    {
        $statement = $this->connection->prepare("UPDATE equipes SET status_equipe = '0' WHERE id_equipe = ?");
        if ($statement === false) {
            throw new RuntimeException('Não foi possível excluir equipe.');
        }
        $statement->bind_param('i', $id);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível excluir equipe.');
        }
        $found = $statement->affected_rows > 0 || $this->exists($id);
        $statement->close();
        return $found;
    }

    /**
     * @return array{nome:string,max_equipes:?int}
     */
    private function modality(int $id): array
    {
        $statement = $this->connection->prepare(
            'SELECT nome_modalidade, max_equipes FROM modalidades WHERE id_modalidade = ? LIMIT 1',
        );
        if ($statement === false) {
            throw new RuntimeException('Não foi possível consultar modalidade.');
        }
        $statement->bind_param('i', $id);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível consultar modalidade.');
        }
        $row = $statement->get_result()->fetch_assoc();
        $statement->close();
        if (!$row) {
            throw new RuntimeException('Modalidade não encontrada.');
        }
        return [
            'nome' => (string) $row['nome_modalidade'],
            'max_equipes' => $row['max_equipes'] === null ? null : (int) $row['max_equipes'],
        ];
    }

    /** @return array{max_equipes:?int} */
    private function lockScope(int $modalityId, int $classId): array
    {
        $modality = $this->one(
            'SELECT nome_modalidade, max_equipes, categorias_id_categoria, interclasses_id_interclasse, status_modalidade
             FROM modalidades WHERE id_modalidade = ? LIMIT 1 FOR UPDATE',
            'i',
            [$modalityId],
        );
        if ($modality === null || (string) $modality['status_modalidade'] !== '1') {
            throw new RuntimeException('Modalidade não encontrada ou inativa.');
        }
        $class = $this->one(
            'SELECT categorias_id_categoria, interclasses_id_interclasse, status_turma
             FROM turmas WHERE id_turma = ? LIMIT 1 FOR UPDATE',
            'i',
            [$classId],
        );
        if ($class === null || (string) $class['status_turma'] !== '1') {
            throw new RuntimeException('Turma não encontrada ou inativa.');
        }
        if ((int) $modality['interclasses_id_interclasse'] !== (int) $class['interclasses_id_interclasse']) {
            throw new RuntimeException('Modalidade e turma não pertencem ao mesmo interclasse.');
        }
        if ((int) $modality['categorias_id_categoria'] !== (int) $class['categorias_id_categoria']) {
            throw new RuntimeException('Modalidade e turma não pertencem à mesma categoria.');
        }
        return ['max_equipes' => $modality['max_equipes'] === null ? null : (int) $modality['max_equipes']];
    }

    private function hasStructuralDependents(int $teamId): bool
    {
        foreach ([
            'SELECT 1 FROM equipes_has_usuarios WHERE equipes_id_equipe = ? LIMIT 1 FOR UPDATE',
            'SELECT 1 FROM partidas WHERE equipes_id_equipe = ? LIMIT 1 FOR UPDATE',
            'SELECT 1 FROM artilheiros WHERE equipes_id_equipe = ? LIMIT 1 FOR UPDATE',
            'SELECT 1 FROM pontuacoes_podio WHERE id_equipe = ? LIMIT 1 FOR UPDATE',
        ] as $sql) {
            $statement = $this->connection->prepare($sql);
            if ($statement === false) {
                throw new RuntimeException('Não foi possível verificar os vínculos da equipe.');
            }
            $statement->bind_param('i', $teamId);
            if (!$statement->execute()) {
                $statement->close();
                throw new RuntimeException('Não foi possível verificar os vínculos da equipe.');
            }
            $hasRows = $statement->get_result()->fetch_row() !== null;
            $statement->close();
            if ($hasRows) {
                return true;
            }
        }

        return false;
    }

    private function activeCount(int $modalityId, int $classId, ?int $excludeId = null): int
    {
        $sql = "SELECT COUNT(*) FROM equipes
                WHERE modalidades_id_modalidade = ? AND turmas_id_turma = ? AND status_equipe = '1'";
        $params = [$modalityId, $classId];
        $types = 'ii';
        if ($excludeId !== null) {
            $sql .= ' AND id_equipe <> ?';
            $params[] = $excludeId;
            $types .= 'i';
        }
        $statement = $this->connection->prepare($sql);
        if ($statement === false) {
            throw new RuntimeException('Não foi possível contar equipes ativas.');
        }
        $statement->bind_param($types, ...$params);
        $statement->execute();
        $count = (int) $statement->get_result()->fetch_column();
        $statement->close();
        return $count;
    }

    private function assertCapacity(?int $maxTeams, int $active): void
    {
        if (!EquipeCapacityRules::podeAtivar($maxTeams, $active)) {
            throw new EquipeLimiteException(
                'Limite de ' . $maxTeams . ' equipes por turma atingido para esta modalidade.',
            );
        }
    }

    /** @param list<int> $params @return array<string,mixed>|null */
    private function one(string $sql, string $types, array $params): ?array
    {
        $statement = $this->connection->prepare($sql);
        if ($statement === false) {
            throw new RuntimeException('Não foi possível consultar equipe.');
        }
        $statement->bind_param($types, ...$params);
        $statement->execute();
        $row = $statement->get_result()->fetch_assoc() ?: null;
        $statement->close();
        return $row;
    }

    private function className(int $id): string
    {
        $statement = $this->connection->prepare('SELECT nome_turma FROM turmas WHERE id_turma = ? LIMIT 1');
        if ($statement === false) {
            throw new RuntimeException('Não foi possível consultar turma.');
        }
        $statement->bind_param('i', $id);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível consultar turma.');
        }
        $row = $statement->get_result()->fetch_assoc();
        $statement->close();
        if (!$row) {
            throw new RuntimeException('Turma não encontrada.');
        }
        return trim((string) $row['nome_turma']);
    }

    private function generateName(int $modalityId, int $classId): string
    {
        $modality = $this->modality($modalityId);
        $className = $this->className($classId);
        $statement = $this->connection->prepare(
            "SELECT COUNT(*) AS total FROM equipes
             WHERE modalidades_id_modalidade = ? AND turmas_id_turma = ? AND status_equipe = '1'",
        );
        if ($statement === false) {
            throw new RuntimeException('Não foi possível numerar equipe.');
        }
        $statement->bind_param('ii', $modalityId, $classId);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível numerar equipe.');
        }
        $total = (int) (($statement->get_result()->fetch_assoc()['total'] ?? 0));
        $statement->close();
        $number = $total + 1;
        $base = preg_replace('/\s*-\s*(MA|MI|FE|MASC|FEM|MISTO|MISTA)$/i', '', trim($modality['nome'])) ?? $modality['nome'];
        $name = $base . ' - ' . $number;
        return $className !== '' ? $className . ' ' . $name : $name;
    }

    private function exists(int $id): bool
    {
        $statement = $this->connection->prepare('SELECT 1 FROM equipes WHERE id_equipe = ? LIMIT 1');
        if ($statement === false) {
            return false;
        }
        $statement->bind_param('i', $id);
        $statement->execute();
        $exists = $statement->get_result()->num_rows > 0;
        $statement->close();
        return $exists;
    }
}
