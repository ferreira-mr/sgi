<?php

declare(strict_types=1);

namespace App\Modules\Acesso\Infrastructure;

use App\Modules\Acesso\Domain\UsuarioManagementRepository;
use App\Modules\Participantes\Domain\InscricaoRules;
use App\Shared\Database\Transaction;
use App\Shared\Security\StudentInitialPassword;
use mysqli;
use RuntimeException;

final class MysqliUsuarioManagementRepository implements UsuarioManagementRepository
{
    public function __construct(private readonly mysqli $connection)
    {
    }

    public function createStudent(array $data, int $editionId): array
    {
        $name = trim((string) ($data['nome_usuario'] ?? ''));
        $matricula = (string) ($data['matricula_usuario'] ?? '');
        $birth = (string) ($data['data_nasc_usuario'] ?? '');
        $classId = (int) ($data['turmas_id_turma'] ?? 0);
        $gender = strtoupper((string) ($data['genero_usuario'] ?? 'MASC'));
        if ($name === '' || $matricula === '' || $birth === '' || $classId <= 0) {
            throw new RuntimeException('Campos obrigatórios: nome, RM, data de nascimento e turma.');
        }
        if (!in_array($gender, ['FEM', 'MASC'], true)) {
            $gender = 'MASC';
        }
        if ($this->one('SELECT 1 FROM turmas WHERE id_turma = ? AND interclasses_id_interclasse = ? LIMIT 1', 'ii', [$classId, $editionId]) === null) {
            throw new RuntimeException('Turma não pertence à edição ativa.');
        }
        $key = $matricula . '-' . $editionId;
        if ($this->one('SELECT 1 FROM usuarios WHERE chave_usuario_edicao = ? LIMIT 1', 's', [$key]) !== null) {
            throw new RuntimeException('Já existe um estudante com este RM nesta edição do interclasse.');
        }

        $temporaryPassword = StudentInitialPassword::VALUE;
        $password = password_hash($temporaryPassword, PASSWORD_DEFAULT);
        $statement = $this->prepare('INSERT INTO usuarios (sigla_usuario, matricula_usuario, nome_usuario, senha_usuario, senha_troca_pendente, nivel_usuario, genero_usuario, data_nasc_usuario, foto_usuario, status_usuario, turmas_id_turma, interclasses_id_interclasse, chave_usuario_edicao) VALUES (\'RM\', ?, ?, ?, 1, \'3\', ?, ?, \'default.jpg\', \'1\', ?, ?, ?)');
        $statement->bind_param('sssssiis', $matricula, $name, $password, $gender, $birth, $classId, $editionId, $key);
        if (!$statement->execute()) {
            $message = $statement->errno === 1062 ? 'RM já cadastrado nesta edição.' : 'Não foi possível cadastrar estudante.';
            $statement->close();
            throw new RuntimeException($message);
        }
        $id = (int) $statement->insert_id;
        $statement->close();

        return [
            'status' => 'sucesso',
            'mensagem' => 'Estudante cadastrado. A senha inicial é sesi-senai e deverá ser trocada no primeiro acesso.',
            'id_usuario' => $id,
            'senha_temporaria' => $temporaryPassword,
        ];
    }

    public function assignStudent(int $userId, int $classId, int $editionId): void
    {
        Transaction::begin($this->connection);
        try {
            if ($this->one(
                "SELECT id_interclasse FROM interclasses
                 WHERE id_interclasse = ? AND status_interclasse = '1' LIMIT 1 FOR UPDATE",
                'i',
                [$editionId],
            ) === null) {
                throw new RuntimeException('Edição ativa não encontrada.');
            }

            $student = $this->one(
                "SELECT id_usuario, turmas_id_turma FROM usuarios
                 WHERE id_usuario = ? AND nivel_usuario = '3'
                   AND interclasses_id_interclasse = ? LIMIT 1 FOR UPDATE",
                'ii',
                [$userId, $editionId],
            );
            $class = $this->one(
                'SELECT id_turma FROM turmas
                 WHERE id_turma = ? AND interclasses_id_interclasse = ? LIMIT 1 FOR UPDATE',
                'ii',
                [$classId, $editionId],
            );
            if ($student === null || $class === null) {
                throw new RuntimeException('Estudante ou turma não pertence à edição ativa.');
            }
            if ((int) ($student['turmas_id_turma'] ?? 0) === $classId) {
                Transaction::commit($this->connection);
                return;
            }
            if ($this->hasStudentHistory($userId)) {
                throw new RuntimeException('Não é possível transferir estudante com histórico esportivo ou disciplinar.');
            }

            $statement = $this->prepare('UPDATE usuarios SET turmas_id_turma = ?, interclasses_id_interclasse = ?, chave_usuario_edicao = CONCAT(matricula_usuario, \'-\', ?) WHERE id_usuario = ? AND nivel_usuario = \'3\'');
            $statement->bind_param('iiii', $classId, $editionId, $editionId, $userId);
            if (!$statement->execute()) {
                $statement->close();
                throw new RuntimeException('Não foi possível atualizar o vínculo do estudante.');
            }
            $statement->close();
            Transaction::commit($this->connection);
        } catch (\Throwable $exception) {
            Transaction::rollback($this->connection);
            throw $exception;
        }
    }

    public function createStaff(array $data, int $editionId, string $photoFilename = 'default.jpg'): array
    {
        $name = trim((string) ($data['nome_usuario'] ?? ''));
        $registration = trim((string) ($data['matricula_usuario'] ?? ''));
        $password = (string) ($data['senha_usuario'] ?? '');
        $birth = (string) ($data['data_nasc_usuario'] ?? '');
        if ($name === '' || $registration === '' || $password === '' || $birth === '') {
            throw new RuntimeException('Campos incompletos');
        }
        $level = ($data['is_admin_clicado'] ?? '0') === '1' ? '0' : (($data['is_mesario_clicado'] ?? '0') === '1' ? '2' : '1');
        $gender = strtoupper((string) ($data['genero_usuario'] ?? 'MASC'));
        if (!in_array($gender, ['FEM', 'MASC'], true)) {
            $gender = 'MASC';
        }
        $normalised = (string) ($data['matricula_usuario'] ?? $registration);
        $master = ['sgi@sgi.com', 'colab@sgi.com', 'mes@sgi.com'];
        if (in_array(strtolower($registration), $master, true) || in_array(strtolower($normalised), $master, true)) {
            throw new RuntimeException('Este email pertence a uma conta padrão do sistema e não pode ser reutilizado.');
        }
        $key = $normalised . '-' . $editionId;
        if ($this->one('SELECT 1 FROM usuarios WHERE chave_usuario_edicao = ? LIMIT 1', 's', [$key]) !== null) {
            throw new RuntimeException('Já existe um usuário com esta matrícula/email nesta edição do Interclasse.');
        }
        $photoFilename = basename($photoFilename) ?: 'default.jpg';
        $hash = password_hash($password, PASSWORD_DEFAULT);
        $statement = $this->prepare('INSERT INTO usuarios (nome_usuario, matricula_usuario, senha_usuario, nivel_usuario, genero_usuario, foto_usuario, status_usuario, data_nasc_usuario, sigla_usuario, interclasses_id_interclasse, chave_usuario_edicao) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $status = '1';
        $sigla = 'SS';
        $statement->bind_param('sssssssssis', $name, $normalised, $hash, $level, $gender, $photoFilename, $status, $birth, $sigla, $editionId, $key);
        if (!$statement->execute()) {
            $duplicate = $statement->errno === 1062;
            $statement->close();
            throw new RuntimeException($duplicate ? 'Esta matrícula/email já está cadastrada nesta edição do interclasse.' : 'Não foi possível cadastrar usuário.');
        }
        $id = (int) $statement->insert_id;
        $statement->close();

        return ['status' => 'sucesso', 'mensagem' => 'Usuário cadastrado!', 'id_usuario' => $id];
    }

    public function updateStaffRole(array $data, int $editionId): void
    {
        $id = (int) ($data['id_usuario'] ?? 0);
        if ($id <= 0) {
            throw new RuntimeException('ID do colaborador inválido.');
        }
        $level = ($data['is_admin_clicado'] ?? '0') === '1' ? '0' : (($data['is_mesario_clicado'] ?? '0') === '1' ? '2' : '1');
        $lockName = $this->administratorRoleLockName();
        $lock = $this->prepare('SELECT GET_LOCK(?, 10)');
        $lock->bind_param('s', $lockName);
        $lock->execute();
        $acquired = (int) ($lock->get_result()->fetch_column() ?? 0);
        $lock->close();
        if ($acquired !== 1) {
            throw new RuntimeException('Não foi possível bloquear a atualização de papéis. Tente novamente.');
        }

        try {
            $target = $this->one(
                'SELECT nivel_usuario, status_usuario FROM usuarios
                 WHERE id_usuario = ? AND (interclasses_id_interclasse = ? OR interclasses_id_interclasse IS NULL)
                 FOR UPDATE',
                'ii',
                [$id, $editionId],
            );
            if ($target === null) {
                throw new RuntimeException('Colaborador não encontrado ou fora da edição ativa.');
            }

            $currentLevel = (string) $target['nivel_usuario'];
            $currentStatus = (string) $target['status_usuario'];
            if (!in_array($currentLevel, ['0', '1', '2'], true)) {
                throw new RuntimeException('A ação só pode alterar o papel de um colaborador.');
            }
            if ($currentLevel === $level) {
                return;
            }

            if ($currentLevel === '0' && $currentStatus === '1' && $level !== '0') {
                $administrators = $this->connection->query(
                    "SELECT id_usuario FROM usuarios
                     WHERE nivel_usuario = '0' AND status_usuario = '1'
                     ORDER BY id_usuario FOR UPDATE",
                );
                $activeAdministratorCount = $administrators->num_rows;
                $administrators->free();
                if ($activeAdministratorCount <= 1) {
                    throw new RuntimeException('Não é possível rebaixar o último administrador ativo.');
                }
            }

            $statement = $this->prepare(
                'UPDATE usuarios SET nivel_usuario = ?, auth_version = auth_version + 1
                 WHERE id_usuario = ? AND (interclasses_id_interclasse = ? OR interclasses_id_interclasse IS NULL)
                   AND nivel_usuario = ? AND status_usuario = ?',
            );
            $statement->bind_param('siiss', $level, $id, $editionId, $currentLevel, $currentStatus);
            if (!$statement->execute()) {
                $statement->close();
                throw new RuntimeException('Não foi possível atualizar colaborador.');
            }
            $updated = $statement->affected_rows > 0;
            $statement->close();
            if (!$updated) {
                throw new RuntimeException('Colaborador não encontrado ou alterado simultaneamente.');
            }
        } finally {
            $release = $this->prepare('SELECT RELEASE_LOCK(?)');
            $release->bind_param('s', $lockName);
            $release->execute();
            $release->close();
        }
    }

    private function administratorRoleLockName(): string
    {
        $row = $this->connection->query('SELECT DATABASE()')->fetch_row();
        $database = (string) ($row[0] ?? '');
        if ($database === '') {
            throw new RuntimeException('Não foi possível identificar o banco da aplicação.');
        }

        return 'sgi_admin_role_' . substr(hash('sha256', $database), 0, 32);
    }

    public function findStaffLevel(int $id, int $editionId): ?string
    {
        $statement = $this->prepare(
            "SELECT nivel_usuario FROM usuarios
             WHERE id_usuario = ?
               AND (interclasses_id_interclasse = ? OR interclasses_id_interclasse IS NULL)
             LIMIT 1",
        );
        $statement->bind_param('ii', $id, $editionId);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível consultar colaborador.');
        }
        $level = $statement->get_result()->fetch_column();
        $statement->close();

        return $level === false || $level === null ? null : (string) $level;
    }

    public function updateStaffDetails(array $data, int $editionId, int $currentUserId): void
    {
        $id = (int) ($data['id_usuario'] ?? 0);
        $name = trim((string) ($data['nome_usuario'] ?? ''));
        $registration = trim((string) ($data['matricula_usuario'] ?? ''));
        if ($id <= 0 || $name === '' || $registration === '') {
            throw new RuntimeException('Nome e matrícula são obrigatórios.');
        }
        $normalised = (string) ($data['matricula_usuario'] ?? $registration);
        $key = $normalised . '-' . $editionId;
        if ($this->one('SELECT 1 FROM usuarios WHERE chave_usuario_edicao = ? AND id_usuario <> ? LIMIT 1', 'si', [$key, $id]) !== null) {
            throw new RuntimeException('Já existe outro usuário com esta matrícula/email nesta edição.');
        }
        $gender = strtoupper((string) ($data['genero_usuario'] ?? 'MASC'));
        if (!in_array($gender, ['FEM', 'MASC'], true)) {
            $gender = 'MASC';
        }
        $fields = ['nome_usuario = ?', 'matricula_usuario = ?', 'genero_usuario = ?', 'chave_usuario_edicao = ?'];
        $values = [$name, $normalised, $gender, $key];
        $types = 'ssss';
        $password = (string) ($data['senha_usuario'] ?? '');
        if ($password !== '') {
            $fields[] = 'senha_usuario = ?';
            $values[] = password_hash($password, PASSWORD_DEFAULT);
            $types .= 's';
        }
        if ($password !== '') {
            $fields[] = 'auth_version = auth_version + 1';
        }
        $values[] = $id;
        $values[] = $editionId;
        $types .= 'ii';
        $values[] = $currentUserId;
        $types .= 'i';
        $statement = $this->prepare('UPDATE usuarios SET ' . implode(', ', $fields) . ' WHERE id_usuario = ? AND (interclasses_id_interclasse = ? OR interclasses_id_interclasse IS NULL) AND nivel_usuario IN (\'0\', \'1\', \'2\') AND (nivel_usuario <> \'0\' OR id_usuario = ?)');
        $statement->bind_param($types, ...$values);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível atualizar colaborador.');
        }
        $statement->close();
    }

    public function updateStudent(array $data, int $editionId): void
    {
        $id = (int) ($data['id_usuario'] ?? 0);
        $name = trim((string) ($data['nome_usuario'] ?? ''));
        $registration = (string) ($data['matricula_usuario'] ?? '');
        $birth = (string) ($data['data_nasc_usuario'] ?? '');
        if ($id <= 0 || $name === '' || $registration === '' || $birth === '') {
            throw new RuntimeException('Campos obrigatórios: nome, RM e data de nascimento.');
        }
        $normalised = $registration;
        $key = $normalised . '-' . $editionId;
        $gender = strtoupper((string) ($data['genero_usuario'] ?? 'MASC'));
        if (!in_array($gender, ['FEM', 'MASC'], true)) {
            $gender = 'MASC';
        }

        Transaction::begin($this->connection);
        try {
            if ($this->one(
                "SELECT id_interclasse FROM interclasses
                 WHERE id_interclasse = ? AND status_interclasse = '1' LIMIT 1 FOR UPDATE",
                'i',
                [$editionId],
            ) === null) {
                throw new RuntimeException('Edição ativa não encontrada.');
            }
            $student = $this->one(
                "SELECT id_usuario, genero_usuario FROM usuarios
                 WHERE id_usuario = ? AND nivel_usuario = '3'
                   AND interclasses_id_interclasse = ? LIMIT 1 FOR UPDATE",
                'ii',
                [$id, $editionId],
            );
            if ($student === null) {
                throw new RuntimeException('Estudante não pertence à edição ativa.');
            }

            if ((string) $student['genero_usuario'] !== $gender) {
                $rosters = $this->prepare(
                    "SELECT m.genero_modalidade,
                            t.categorias_id_categoria AS categoria_turma,
                            m.categorias_id_categoria AS categoria_modalidade
                     FROM equipes_has_usuarios eu
                     INNER JOIN equipes e ON e.id_equipe = eu.equipes_id_equipe AND e.status_equipe = '1'
                     INNER JOIN modalidades m ON m.id_modalidade = e.modalidades_id_modalidade
                         AND m.interclasses_id_interclasse = ?
                     INNER JOIN turmas t ON t.id_turma = e.turmas_id_turma
                     WHERE eu.usuarios_id_usuario = ?
                     ORDER BY e.id_equipe FOR UPDATE",
                );
                $rosters->bind_param('ii', $editionId, $id);
                if (!$rosters->execute()) {
                    $rosters->close();
                    throw new RuntimeException('Não foi possível conferir o elenco atual do estudante.');
                }
                $activeTeams = $rosters->get_result()->fetch_all(MYSQLI_ASSOC);
                $rosters->close();
                foreach ($activeTeams as $team) {
                    if (!InscricaoRules::modalidadeCompativel(
                        $gender,
                        (string) $team['genero_modalidade'],
                        (int) $team['categoria_turma'],
                        (int) $team['categoria_modalidade'],
                    )) {
                        throw new RuntimeException('O gênero informado é incompatível com um elenco ativo do estudante.');
                    }
                }
            }

            if ($this->one(
                'SELECT 1 FROM usuarios WHERE chave_usuario_edicao = ? AND id_usuario <> ? LIMIT 1',
                'si',
                [$key, $id],
            ) !== null) {
                throw new RuntimeException('Já existe outro estudante com este RM nesta edição.');
            }
            $statement = $this->prepare("UPDATE usuarios SET nome_usuario = ?, matricula_usuario = ?, genero_usuario = ?, data_nasc_usuario = ?, chave_usuario_edicao = ? WHERE id_usuario = ? AND nivel_usuario = '3' AND interclasses_id_interclasse = ?");
            $statement->bind_param('sssssii', $name, $normalised, $gender, $birth, $key, $id, $editionId);
            if (!$statement->execute()) {
                $statement->close();
                throw new RuntimeException('Não foi possível atualizar estudante.');
            }
            $statement->close();
            Transaction::commit($this->connection);
        } catch (\Throwable $exception) {
            Transaction::rollback($this->connection);
            throw $exception;
        }
    }

    private function hasStudentHistory(int $userId): bool
    {
        foreach ([
            'SELECT 1 FROM equipes_has_usuarios WHERE usuarios_id_usuario = ? LIMIT 1 FOR UPDATE',
            'SELECT 1 FROM partidas WHERE usuarios_id_usuario = ? LIMIT 1 FOR UPDATE',
            'SELECT 1 FROM artilheiros WHERE usuarios_id_usuario = ? LIMIT 1 FOR UPDATE',
            'SELECT 1 FROM pontuacoes WHERE usuarios_id_usuario = ? LIMIT 1 FOR UPDATE',
            'SELECT 1 FROM pontuacoes_podio WHERE id_usuario = ? LIMIT 1 FOR UPDATE',
            'SELECT 1 FROM ocorrencias WHERE usuarios_id_usuario = ? LIMIT 1 FOR UPDATE',
        ] as $sql) {
            if ($this->one($sql, 'i', [$userId]) !== null) {
                return true;
            }
        }

        return false;
    }

    /** @param list<int|string> $params @return array<string, mixed>|null */
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
            throw new RuntimeException('Não foi possível preparar operação de usuário.');
        }

        return $statement;
    }
}
