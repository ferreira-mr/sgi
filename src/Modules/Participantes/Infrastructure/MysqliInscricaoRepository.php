<?php

declare(strict_types=1);

namespace App\Modules\Participantes\Infrastructure;

use App\Modules\Competicoes\Domain\EquipePadraoRepository;
use App\Modules\Competicoes\Domain\CronogramaRepository;
use App\Modules\Competicoes\Domain\CronogramaRules;
use App\Modules\Participantes\Domain\InscricaoRepository;
use App\Modules\Participantes\Domain\InscricaoRecusadaException;
use App\Modules\Participantes\Domain\InscricaoRules;
use App\Shared\Database\Transaction;
use mysqli;
use RuntimeException;

final class MysqliInscricaoRepository implements InscricaoRepository
{
    private readonly EquipePadraoRepository $equipesPadrao;

    public function __construct(mysqli $connection, EquipePadraoRepository $equipesPadrao, ?CronogramaRepository $cronograma = null)
    {
        $this->connection = $connection;
        $this->equipesPadrao = $equipesPadrao;
        $this->cronograma = $cronograma;
    }

    private readonly mysqli $connection;
    private readonly ?CronogramaRepository $cronograma;
    private ?bool $planningAvailable = null;

    public function subscribe(int $userId, int $editionId, array $teamIds, ?int $expectedRevision = null, ?int $expectedPublishedVersion = null): array
    {
        Transaction::begin($this->connection);
        try {
            $this->lockEdition($editionId);
            $planning = $this->planningState($editionId);
            if ($planning !== null && $expectedRevision === null) {
                throw new InscricaoRecusadaException('A revisão do cronograma é obrigatória para esta edição.');
            }
            if ($planning !== null && $expectedPublishedVersion === null) {
                throw new InscricaoRecusadaException('A versão publicada do cronograma é obrigatória para esta edição.');
            }
            if ($planning !== null && (int) $planning['cronograma_versao'] !== $expectedRevision) {
                throw new InscricaoRecusadaException('O cronograma foi alterado. Atualize a página e tente novamente.');
            }
            if ($planning !== null && (int) ($planning['versao_publicada'] ?? -1) !== $expectedPublishedVersion) {
                throw new InscricaoRecusadaException('A publicação do cronograma foi alterada. Atualize a página e tente novamente.');
            }
            $user = $this->one(
                'SELECT turmas_id_turma, interclasses_id_interclasse, status_usuario, genero_usuario
                 FROM usuarios WHERE id_usuario = ? LIMIT 1 FOR UPDATE',
                'i',
                [$userId],
            );
            if ($user === null) {
                throw new InscricaoRecusadaException('Usuário não encontrado.');
            }
            if ((int) ($user['interclasses_id_interclasse'] ?? 0) !== $editionId || (string) ($user['status_usuario'] ?? '0') !== '1') {
                throw new InscricaoRecusadaException('Usuário não pertence a este interclasse.');
            }
            $classId = (int) ($user['turmas_id_turma'] ?? 0);
            if ($classId <= 0) {
                throw new InscricaoRecusadaException('Usuário não possui turma vinculada.');
            }
            $classCategoryId = $this->lockClass($classId, $editionId);

            $candidateTeams = [];
            $errors = [];
            foreach ($teamIds as $teamId) {
                $row = $this->one(
                    'SELECT id_equipe, modalidades_id_modalidade
                     FROM equipes WHERE id_equipe = ? LIMIT 1',
                    'i',
                    [$teamId],
                );
                if ($row === null) {
                    $errors[] = "Equipe {$teamId} não encontrada.";
                    continue;
                }
                $candidateTeams[] = [
                    'id_equipe' => (int) $row['id_equipe'],
                    'id_modalidade' => (int) $row['modalidades_id_modalidade'],
                ];
            }
            if ($candidateTeams === []) {
                throw new InscricaoRecusadaException('Nenhuma equipe válida informada.' . ($errors !== [] ? ' ' . implode(' ', array_unique($errors)) : ''));
            }
            if ($errors !== []) {
                throw new InscricaoRecusadaException(implode(' ', array_unique($errors)));
            }

            $candidateModalityIds = array_values(array_unique(array_column($candidateTeams, 'id_modalidade')));
            sort($candidateModalityIds, SORT_NUMERIC);
            $lockedModalities = $this->lockModalities($candidateModalityIds);

            $validTeams = [];
            foreach ($candidateTeams as $candidate) {
                $teamId = $candidate['id_equipe'];
                $modalityId = $candidate['id_modalidade'];
                $modality = $lockedModalities[$modalityId] ?? null;
                if ($modality === null) {
                    $errors[] = "Modalidade {$modalityId} não encontrada.";
                    continue;
                }
                if ((int) $modality['interclasses_id_interclasse'] !== $editionId) {
                    $errors[] = "Modalidade {$modalityId} não pertence a este interclasse.";
                    continue;
                }
                if ((string) $modality['status_modalidade'] !== '1') {
                    $errors[] = "Modalidade {$modalityId} está inativa.";
                    continue;
                }

                $team = $this->one(
                    'SELECT id_equipe, status_equipe, turmas_id_turma, modalidades_id_modalidade
                     FROM equipes WHERE id_equipe = ? AND modalidades_id_modalidade = ? LIMIT 1 FOR UPDATE',
                    'ii',
                    [$teamId, $modalityId],
                );
                if ($team === null) {
                    $errors[] = "Equipe {$teamId} foi alterada durante a inscrição.";
                    continue;
                }
                if ((string) $team['status_equipe'] !== '1') {
                    $errors[] = "Equipe {$teamId} está inativa.";
                    continue;
                }
                if ((int) $team['turmas_id_turma'] !== $classId) {
                    $errors[] = 'Você só pode se inscrever em equipes da sua turma.';
                    continue;
                }
                $categoryId = (int) $modality['categorias_id_categoria'];
                $studentGender = (string) $user['genero_usuario'];
                $modalityGender = (string) $modality['genero_modalidade'];
                if (!InscricaoRules::modalidadeCompativel($studentGender, $modalityGender, $classCategoryId, $categoryId)) {
                    $errors[] = !InscricaoRules::categoriaCompativel($classCategoryId, $categoryId)
                        ? "Categoria da modalidade {$modalityId} não corresponde à categoria da sua turma."
                        : "Gênero incompatível com a modalidade {$modalityId}.";
                    continue;
                }

                $validTeams[] = [
                    'id_equipe' => $teamId,
                    'id_modalidade' => $modalityId,
                ];
            }
            if ($validTeams === []) {
                throw new InscricaoRecusadaException('Nenhuma equipe válida informada.' . ($errors !== [] ? ' ' . implode(' ', array_unique($errors)) : ''));
            }
            if ($errors !== []) {
                throw new InscricaoRecusadaException(implode(' ', array_unique($errors)));
            }

            $modalities = array_values(array_unique(array_column($validTeams, 'id_modalidade')));
            sort($modalities, SORT_NUMERIC);

            $this->assertScheduleCompatibility($userId, $editionId, $validTeams);
            $candidateByModality = [];
            foreach ($validTeams as $validTeam) {
                $candidateByModality[(int) $validTeam['id_modalidade']] ??= (int) $validTeam['id_equipe'];
            }

            $already = [];
            $statement = $this->prepare(
                "SELECT m.id_modalidade
                 FROM equipes_has_usuarios eu
                 INNER JOIN equipes e ON e.id_equipe = eu.equipes_id_equipe
                 INNER JOIN modalidades m ON m.id_modalidade = e.modalidades_id_modalidade
                 WHERE eu.usuarios_id_usuario = ? AND e.status_equipe = '1'
                   AND m.interclasses_id_interclasse = ?",
            );
            $statement->bind_param('ii', $userId, $editionId);
            $statement->execute();
            foreach ($statement->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
                $already[(int) $row['id_modalidade']] = true;
            }
            $statement->close();

            try {
                $union = InscricaoRules::uniaoModalidades(array_keys($already), $modalities);
            } catch (\InvalidArgumentException $exception) {
                throw new InscricaoRecusadaException($exception->getMessage(), 0, $exception);
            }
            $newModalities = array_values(array_filter($union, static fn (int $id): bool => !isset($already[$id])));
            $existingModalities = array_fill_keys(array_values(array_intersect($modalities, array_keys($already))), true);

            $insertions = 0;
            foreach ($newModalities as $modalityId) {
                $modality = $lockedModalities[$modalityId] ?? null;
                $maxStudents = (int) ($modality['max_inscrito_modalidade'] ?? 0);
                $maxTeams = isset($modality['max_equipes']) ? (int) $modality['max_equipes'] : 0;
                $capacity = $maxStudents > 0 && $maxTeams > 0 ? $maxStudents * $maxTeams : 0;
                $plannedConfig = $planning !== null
                    ? $this->plannedModality($modalityId)
                    : null;
                if ($plannedConfig !== null) {
                    $teamId = (int) ($candidateByModality[$modalityId] ?? 0);
                    $occupied = $this->one(
                        "SELECT COUNT(DISTINCT eu.usuarios_id_usuario) AS total
                         FROM equipes_has_usuarios eu
                         INNER JOIN usuarios u ON u.id_usuario = eu.usuarios_id_usuario
                         WHERE eu.equipes_id_equipe = ? AND u.status_usuario = '1'",
                        'i',
                        [$teamId],
                    );
                    if ((int) ($occupied['total'] ?? 0) >= (int) $plannedConfig['max_inscritos_equipe']) {
                        throw new InscricaoRecusadaException("A equipe {$teamId} está lotada.");
                    }
                } elseif ($capacity > 0) {
                    $occupied = $this->one(
                        "SELECT COUNT(DISTINCT eu.usuarios_id_usuario) AS total
                         FROM equipes_has_usuarios eu
                         INNER JOIN equipes e ON e.id_equipe = eu.equipes_id_equipe
                         INNER JOIN usuarios u ON u.id_usuario = eu.usuarios_id_usuario
                         WHERE e.modalidades_id_modalidade = ? AND e.turmas_id_turma = ?
                           AND e.status_equipe = '1' AND u.status_usuario = '1'
                         ",
                        'ii',
                        [$modalityId, $classId],
                    );
                    if ((int) ($occupied['total'] ?? 0) >= $capacity) {
                        throw new InscricaoRecusadaException("A modalidade {$modalityId} está lotada.");
                    }
                }

                $teamId = $plannedConfig !== null
                    ? (int) ($candidateByModality[$modalityId] ?? 0)
                    : $this->equipesPadrao->findOrCreateDefault($modalityId, $classId);
                if ($teamId <= 0) {
                    throw new InscricaoRecusadaException("Erro ao localizar ou criar a equipe padrão para a modalidade {$modalityId}.");
                }
                $check = $this->one('SELECT 1 FROM equipes_has_usuarios WHERE equipes_id_equipe = ? AND usuarios_id_usuario = ? LIMIT 1', 'ii', [$teamId, $userId]);
                if ($check !== null) {
                    $existingModalities[$modalityId] = true;
                    continue;
                }
                $statement = $this->prepare('INSERT INTO equipes_has_usuarios (equipes_id_equipe, usuarios_id_usuario) VALUES (?, ?)');
                $statement->bind_param('ii', $teamId, $userId);
                if (!$statement->execute()) {
                    $statement->close();
                    throw new RuntimeException('Não foi possível concluir a inscrição.');
                }
                $statement->close();
                $insertions++;
            }
            $existing = count($existingModalities);
            Transaction::commit($this->connection);
        } catch (\Throwable $exception) {
            Transaction::rollback($this->connection);
            throw $exception;
        }

        $success = $insertions > 0 || $existing > 0;
        $message = $insertions > 0 ? 'Inscrição realizada com sucesso!' : 'Nenhuma inscrição nova foi necessária.';
        if ($existing > 0) {
            $message .= " Você já estava inscrito em {$existing} equipe(s).";
        }
        return [
            'success' => $success,
            'message' => $message,
            'insercoes' => $insertions,
            'ja_existentes' => $existing,
            'erros' => array_values(array_unique($errors)),
        ];
    }

    private function lockEdition(int $editionId): void
    {
        $row = $this->one('SELECT id_interclasse FROM interclasses WHERE id_interclasse = ? LIMIT 1 FOR UPDATE', 'i', [$editionId]);
        if ($row === null) {
            throw new InscricaoRecusadaException('Interclasse não encontrado.');
        }
    }

    private function lockClass(int $classId, int $editionId): int
    {
        $row = $this->one(
            'SELECT categorias_id_categoria FROM turmas WHERE id_turma = ? AND interclasses_id_interclasse = ? AND status_turma = \'1\' LIMIT 1 FOR UPDATE',
            'ii',
            [$classId, $editionId],
        );
        if ($row === null) {
            throw new InscricaoRecusadaException('Turma do usuário não pertence a este interclasse.');
        }

        return (int) $row['categorias_id_categoria'];
    }

    /** @param list<int> $modalityIds @return array<int, array<string, mixed>|null> */
    private function lockModalities(array $modalityIds): array
    {
        $modalities = [];
        foreach ($modalityIds as $modalityId) {
            $modalities[$modalityId] = $this->one(
                'SELECT id_modalidade, interclasses_id_interclasse, status_modalidade,
                        genero_modalidade, categorias_id_categoria, max_inscrito_modalidade, max_equipes
                 FROM modalidades WHERE id_modalidade = ? LIMIT 1 FOR UPDATE',
                'i',
                [$modalityId],
            );
        }

        return $modalities;
    }

    /** @param list<array{id_equipe:int,id_modalidade:int}> $candidateTeams */
    private function assertScheduleCompatibility(int $userId, int $editionId, array $candidateTeams): void
    {
        if ($this->cronograma === null || !$this->planningAvailable()) {
            return;
        }
        $edition = $this->one('SELECT cronograma_status, inscricoes_status, cronograma_versao, inscricoes_abertura, inscricoes_encerramento FROM interclasse_planejamentos WHERE id_interclasse = ? LIMIT 1 FOR UPDATE', 'i', [$editionId]);
        if ($edition === null) {
            return;
        }
        try {
            CronogramaRules::assertPlannedEdition($edition);
        } catch (\InvalidArgumentException $exception) {
            throw new InscricaoRecusadaException($exception->getMessage(), 0, $exception);
        }
        $candidateIds = array_values(array_unique(array_map(static fn (array $team): int => (int) $team['id_equipe'], $candidateTeams)));
        $candidateMarks = implode(',', array_fill(0, count($candidateIds), '?'));
        $prepared = $this->all('SELECT id_equipe FROM equipe_planejamentos WHERE id_equipe IN (' . $candidateMarks . ') AND planejada = 1', str_repeat('i', count($candidateIds)), $candidateIds);
        if (count($prepared) !== count($candidateIds)) {
            throw new InscricaoRecusadaException('Escolha uma equipe preparada no cronograma publicado.');
        }
        $existingIds = $this->userTeamIds($userId, $editionId);
        $existingCommitments = $this->cronograma->commitmentsForTeams($editionId, $existingIds);
        $candidateCommitments = $this->cronograma->commitmentsForTeams($editionId, $candidateIds);
        foreach ($candidateCommitments as $candidate) {
            foreach ($existingCommitments as $existing) {
                if ((int) ($candidate['id_modalidade'] ?? 0) === (int) ($existing['id_modalidade'] ?? 0)
                    || (int) ($candidate['id_equipe'] ?? 0) === (int) ($existing['id_equipe'] ?? 0)) {
                    continue;
                }
                if (CronogramaRules::schedulesConflict($candidate, $existing)) {
                    throw new InscricaoRecusadaException($this->conflictMessage($candidate, $existing));
                }
            }
        }
        foreach ($candidateCommitments as $firstIndex => $first) {
            foreach (array_slice($candidateCommitments, $firstIndex + 1) as $second) {
                if ((int) ($first['id_modalidade'] ?? 0) === (int) ($second['id_modalidade'] ?? 0)) {
                    continue;
                }
                if (CronogramaRules::schedulesConflict($first, $second)) {
                    throw new InscricaoRecusadaException($this->conflictMessage($first, $second));
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
    private function planningState(int $editionId): ?array
    {
        if (!$this->planningAvailable()) {
            return null;
        }
        return $this->one('SELECT cronograma_status, inscricoes_status, cronograma_versao, versao_publicada, inscricoes_abertura, inscricoes_encerramento FROM interclasse_planejamentos WHERE id_interclasse = ? LIMIT 1 FOR UPDATE', 'i', [$editionId]);
    }

    /** @return array<string,mixed>|null */
    private function plannedModality(int $modalityId): ?array
    {
        if (!$this->planningAvailable()) {
            return null;
        }
        return $this->one('SELECT equipes_planejadas, min_inscritos_equipe, max_inscritos_equipe, formato_participacao FROM modalidade_planejamentos WHERE id_modalidade = ? LIMIT 1', 'i', [$modalityId]);
    }

    /** @return list<int> */
    private function userTeamIds(int $userId, int $editionId): array
    {
        $rows = $this->all('SELECT e.id_equipe FROM equipes_has_usuarios eu INNER JOIN equipes e ON e.id_equipe = eu.equipes_id_equipe INNER JOIN modalidades m ON m.id_modalidade = e.modalidades_id_modalidade WHERE eu.usuarios_id_usuario = ? AND m.interclasses_id_interclasse = ? AND e.status_equipe = \'1\'', 'ii', [$userId, $editionId]);
        return array_map(static fn (array $row): int => (int) $row['id_equipe'], $rows);
    }

    /** @param array<string,mixed> $first @param array<string,mixed> $second */
    private function conflictMessage(array $first, array $second): string
    {
        return sprintf(
            'Conflito de agenda entre as modalidades %s e %s em %s (%s–%s).',
            (string) ($first['id_modalidade'] ?? '?'),
            (string) ($second['id_modalidade'] ?? '?'),
            (string) ($first['data_compromisso'] ?? $second['data_compromisso'] ?? '?'),
            substr((string) ($first['inicio_compromisso'] ?? ''), 0, 5),
            substr((string) ($first['termino_compromisso'] ?? ''), 0, 5),
        );
    }

    /** @param list<int> $params @return array<string, mixed>|null */
    private function one(string $sql, string $types, array $params): ?array
    {
        $statement = $this->prepare($sql);
        $statement->bind_param($types, ...$params);
        if (!$statement->execute()) {
            $message = $statement->error;
            $statement->close();
            throw new RuntimeException($message !== '' ? $message : 'Não foi possível consultar inscrição.');
        }
        $row = $statement->get_result()->fetch_assoc() ?: null;
        $statement->close();
        return $row;
    }

    /** @return list<array<string,mixed>> */
    private function all(string $sql, string $types, array $params): array
    {
        $statement = $this->prepare($sql);
        $statement->bind_param($types, ...$params);
        if (!$statement->execute()) {
            $message = $statement->error;
            $statement->close();
            throw new RuntimeException($message !== '' ? $message : 'Não foi possível consultar inscrição.');
        }
        $rows = $statement->get_result()->fetch_all(MYSQLI_ASSOC);
        $statement->close();
        return $rows;
    }

    private function prepare(string $sql): \mysqli_stmt
    {
        $statement = $this->connection->prepare($sql);
        if ($statement === false) {
            throw new RuntimeException('Não foi possível preparar operação de inscrição.');
        }
        return $statement;
    }
}
