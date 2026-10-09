<?php

declare(strict_types=1);

namespace App\Modules\Competicoes\Infrastructure;

use App\Modules\Competicoes\Domain\ModalidadeRepository;
use App\Modules\Competicoes\Domain\ModalidadeScopeRules;
use App\Modules\Competicoes\Domain\CronogramaRules;
use App\Shared\Database\Transaction;
use InvalidArgumentException;
use mysqli;
use RuntimeException;

final class MysqliModalidadeRepository implements ModalidadeRepository
{
    public function __construct(private readonly mysqli $connection)
    {
    }

    public function list(array $filters): array
    {
        $idTurma = (int) ($filters['id_turma'] ?? 0);
        $selectTurma = $idTurma > 0
            ? ', (SELECT COUNT(DISTINCT eu.usuarios_id_usuario)
                    FROM equipes_has_usuarios eu
                    INNER JOIN equipes e2 ON e2.id_equipe = eu.equipes_id_equipe
                    INNER JOIN usuarios u2 ON u2.id_usuario = eu.usuarios_id_usuario
                    WHERE e2.modalidades_id_modalidade = modalidades.id_modalidade
                      AND e2.turmas_id_turma = ?
                      AND e2.status_equipe = \'1\' AND u2.status_usuario = \'1\') AS qtd_inscritos_turma'
            : '';
        $sql = 'SELECT DISTINCT modalidades.id_modalidade, modalidades.nome_modalidade,
                    modalidades.genero_modalidade, modalidades.max_inscrito_modalidade,
                    modalidades.max_equipes, modalidades.status_modalidade,
                    modalidades.categorias_id_categoria, tipos_modalidades.nome_tipo_modalidade,
                    tipos_modalidades.id_tipo_modalidade, categorias.nome_categoria,
                    modalidades.interclasses_id_interclasse, interclasses.nome_interclasse,
                    (SELECT COUNT(*) FROM equipes e2 WHERE e2.modalidades_id_modalidade = modalidades.id_modalidade
                      AND e2.status_equipe = \'1\') AS qtd_equipes,
                    (SELECT COUNT(*) FROM turmas t2 WHERE t2.categorias_id_categoria = modalidades.categorias_id_categoria)
                      AS max_turmas' . $selectTurma . '
             FROM modalidades
             INNER JOIN tipos_modalidades ON tipos_modalidades.id_tipo_modalidade = modalidades.tipos_modalidades_id_tipo_modalidade
             INNER JOIN categorias ON categorias.id_categoria = modalidades.categorias_id_categoria
             INNER JOIN interclasses ON interclasses.id_interclasse = modalidades.interclasses_id_interclasse';
        if (array_key_exists('ano', $filters)) {
            $sql .= ' INNER JOIN jogos ON jogos.modalidades_id_modalidade = modalidades.id_modalidade';
        }
        $sql .= " WHERE modalidades.status_modalidade = '1'";
        $types = $idTurma > 0 ? 'i' : '';
        $params = $idTurma > 0 ? [$idTurma] : [];
        foreach ([
            'id_interclasse' => ['i', 'modalidades.interclasses_id_interclasse'],
            'id_modalidade' => ['i', 'modalidades.id_modalidade'],
            'id_categoria' => ['i', 'modalidades.categorias_id_categoria'],
            'id_tipo_modalidade' => ['i', 'modalidades.tipos_modalidades_id_tipo_modalidade'],
        ] as $field => [$type, $column]) {
            if ((int) ($filters[$field] ?? 0) > 0) {
                $sql .= ' AND ' . $column . ' = ?';
                $types .= $type;
                $params[] = (int) $filters[$field];
            }
        }
        if ((string) ($filters['genero'] ?? '') !== '') {
            $sql .= ' AND modalidades.genero_modalidade = ?';
            $types .= 's';
            $params[] = strtoupper((string) $filters['genero']);
        }

        $statement = $this->connection->prepare($sql);
        if ($statement === false) {
            throw new RuntimeException('Não foi possível consultar modalidades.');
        }
        if ($types !== '') {
            $statement->bind_param($types, ...$params);
        }
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível consultar modalidades.');
        }
        $rows = $statement->get_result()->fetch_all(MYSQLI_ASSOC);
        $statement->close();
        if ($rows !== [] && $this->planningTableExists()) {
            $ids = array_map(static fn (array $row): int => (int) $row['id_modalidade'], $rows);
            $marks = implode(',', array_fill(0, count($ids), '?'));
            $meta = $this->connection->prepare('SELECT id_modalidade, equipes_planejadas, min_inscritos_equipe, max_inscritos_equipe, formato_participacao, duracao_prevista_min, descanso_min FROM modalidade_planejamentos WHERE id_modalidade IN (' . $marks . ')');
            if ($meta !== false) {
                $meta->bind_param(str_repeat('i', count($ids)), ...$ids);
                if ($meta->execute()) {
                    $planning = [];
                    foreach ($meta->get_result()->fetch_all(MYSQLI_ASSOC) as $config) {
                        $planning[(int) $config['id_modalidade']] = $config;
                    }
                    foreach ($rows as &$row) {
                        $row = array_merge($row, $planning[(int) $row['id_modalidade']] ?? []);
                    }
                    unset($row);
                }
                $meta->close();
            }
        }
        return array_map(static function (array $row): array {
            $row['tipo_competicao'] = \App\Modules\Competicoes\Domain\TipoCompeticaoRules::resolve($row);
            return $row;
        }, $rows);
    }

    public function create(array $data): int
    {
        Transaction::begin($this->connection);
        try {
            $categoryId = (int) $data['categorias_id_categoria'];
            $interclasseId = (int) $data['interclasses_id_interclasse'];
            $this->lockEditions([$interclasseId]);
            $planning = $this->planningTableExists()
                ? $this->one('SELECT cronograma_versao, operacao_liberada FROM interclasse_planejamentos WHERE id_interclasse = ? LIMIT 1 FOR UPDATE', 'i', [$interclasseId])
                : null;
            if ($planning !== null && (int) $planning['operacao_liberada'] === 1) {
                throw new InvalidArgumentException('Não é possível adicionar modalidades depois que a competição foi liberada.');
            }
            $categories = $this->lockCategories([$categoryId]);
            ModalidadeScopeRules::assertCategoryMatchesEdition(
                (int) $categories[$categoryId]['interclasses_id_interclasse'],
                $interclasseId,
                (string) $categories[$categoryId]['status_categoria'],
            );

            $statement = $this->connection->prepare(
                'INSERT INTO modalidades (nome_modalidade, genero_modalidade, max_inscrito_modalidade, max_equipes,
                    tipos_modalidades_id_tipo_modalidade, status_modalidade, categorias_id_categoria, interclasses_id_interclasse)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            );
            if ($statement === false) {
                throw new RuntimeException('Não foi possível criar modalidade.');
            }
            $name = (string) $data['nome_modalidade'];
            $gender = (string) $data['genero_modalidade'];
            $maxInscritos = (int) $data['max_inscrito_modalidade'];
            $maxEquipes = $data['max_equipes'] === null ? 0 : (int) $data['max_equipes'];
            $typeId = (int) $data['tipos_modalidades_id_tipo_modalidade'];
            $status = (string) $data['status_modalidade'];
            $statement->bind_param('ssiisiii', $name, $gender, $maxInscritos, $maxEquipes, $typeId, $status, $categoryId, $interclasseId);
            if (!$statement->execute()) {
                $statement->close();
                throw new RuntimeException('Não foi possível criar modalidade.');
            }
            $id = (int) $this->connection->insert_id;
            $statement->close();
            if (array_key_exists('equipes_planejadas', $data)) {
                $this->savePlanning($id, $data);
            }
            if ($planning !== null) {
                $currentPlanning = $this->one('SELECT cronograma_versao FROM interclasse_planejamentos WHERE id_interclasse = ? LIMIT 1 FOR UPDATE', 'i', [$interclasseId]);
                if ($currentPlanning !== null && (int) $currentPlanning['cronograma_versao'] === (int) $planning['cronograma_versao']) {
                    $this->invalidatePlanning($interclasseId);
                }
            }
            Transaction::commit($this->connection);
            return $id;
        } catch (\Throwable $exception) {
            Transaction::rollback($this->connection);
            throw $exception;
        }
    }

    public function update(int $id, array $data): bool
    {
        if (array_key_exists('categorias_id_categoria', $data) || array_key_exists('interclasses_id_interclasse', $data)) {
            return $this->updateScope($id, $data);
        }

        return $this->persistUpdates($id, $data);
    }

    /** @param array<string, mixed> $data */
    private function persistUpdates(int $id, array $data): bool
    {
        Transaction::begin($this->connection);
        try {
            $scope = $this->one('SELECT interclasses_id_interclasse FROM modalidades WHERE id_modalidade = ? LIMIT 1', 'i', [$id]);
            if ($scope === null) {
                Transaction::rollback($this->connection);
                return false;
            }
            $editionId = (int) $scope['interclasses_id_interclasse'];
            $planning = $this->planningTableExists()
                ? $this->one('SELECT cronograma_status, cronograma_versao, operacao_liberada FROM interclasse_planejamentos WHERE id_interclasse = ? LIMIT 1 FOR UPDATE', 'i', [$editionId])
                : null;
            $structuralFields = [
                'genero_modalidade', 'max_inscrito_modalidade', 'max_equipes',
                'status_modalidade', 'tipos_modalidades_id_tipo_modalidade',
                'categorias_id_categoria', 'interclasses_id_interclasse',
                'equipes_planejadas', 'min_inscritos_equipe',
                'max_inscritos_equipe', 'formato_participacao',
                'duracao_prevista_min', 'descanso_min',
            ];
            $requestedStructuralFields = array_intersect($structuralFields, array_keys($data));
            $structuralChanged = false;
            if ($requestedStructuralFields !== []) {
                $planningFields = $this->planningTableExists();
                $planningColumns = $planningFields
                    ? ', mp.equipes_planejadas, mp.min_inscritos_equipe, mp.max_inscritos_equipe, mp.formato_participacao, mp.duracao_prevista_min, mp.descanso_min'
                    : '';
                $planningJoin = $planningFields ? ' LEFT JOIN modalidade_planejamentos mp ON mp.id_modalidade = m.id_modalidade' : '';
                $current = $this->one(
                    'SELECT m.genero_modalidade, m.max_inscrito_modalidade, m.max_equipes, m.status_modalidade, m.tipos_modalidades_id_tipo_modalidade, m.categorias_id_categoria, m.interclasses_id_interclasse' . $planningColumns . ' FROM modalidades m' . $planningJoin . ' WHERE m.id_modalidade = ? LIMIT 1 FOR UPDATE',
                    'i',
                    [$id],
                );
                if ($current === null) {
                    throw new InvalidArgumentException('Modalidade não encontrada.');
                }
                foreach ($requestedStructuralFields as $field) {
                    $before = $current[$field] ?? null;
                    $after = $data[$field] ?? null;
                    if ($field === 'duracao_prevista_min') {
                        $before = $before === null || $before === '' ? null : (int) $before;
                        $after = $after === null || $after === '' ? null : (int) $after;
                        $structuralChanged = $before !== $after;
                    } elseif (in_array($field, ['formato_participacao', 'genero_modalidade', 'status_modalidade'], true)) {
                        $structuralChanged = (string) $before !== (string) $after;
                    } else {
                        $structuralChanged = (int) ($before ?? 0) !== (int) ($after ?? 0);
                    }
                    if ($structuralChanged) {
                        break;
                    }
                }
            }
            if ($planning !== null && (int) $planning['operacao_liberada'] === 1 && $structuralChanged) {
                throw new InvalidArgumentException('A configuração das modalidades não pode mudar depois que a competição foi liberada.');
            }
            $revisionBefore = $planning === null ? null : (int) $planning['cronograma_versao'];
            $updated = $this->persistUpdatesLocked($id, $data);
            if ($structuralChanged && $planning !== null && (int) $planning['operacao_liberada'] === 0) {
                $currentRevision = $this->one('SELECT cronograma_versao FROM interclasse_planejamentos WHERE id_interclasse = ? LIMIT 1 FOR UPDATE', 'i', [$editionId]);
                if ($currentRevision !== null && (int) $currentRevision['cronograma_versao'] === $revisionBefore) {
                    $this->invalidatePlanning($editionId);
                }
            }
            Transaction::commit($this->connection);
            return $updated;
        } catch (\Throwable $exception) {
            Transaction::rollback($this->connection);
            throw $exception;
        }
    }

    /** @param array<string, mixed> $data */
    private function persistUpdatesLocked(int $id, array $data): bool
    {
        $fields = [];
        $values = [];
        $types = '';
        foreach (['nome_modalidade' => 's', 'genero_modalidade' => 's', 'max_inscrito_modalidade' => 'i', 'max_equipes' => 'i', 'status_modalidade' => 's', 'tipos_modalidades_id_tipo_modalidade' => 'i', 'categorias_id_categoria' => 'i', 'interclasses_id_interclasse' => 'i'] as $field => $type) {
            if (array_key_exists($field, $data)) {
                $fields[] = $field . ' = ?';
                $values[] = $data[$field] === null ? 0 : $data[$field];
                $types .= $type;
            }
        }
        if ($fields === []) {
            if (array_intersect(['equipes_planejadas', 'min_inscritos_equipe', 'max_inscritos_equipe', 'formato_participacao', 'duracao_prevista_min', 'descanso_min'], array_keys($data)) !== []) {
                return $this->savePlanning($id, $data);
            }
            throw new RuntimeException('Nenhum campo válido para atualizar.');
        }
        $values[] = $id;
        $types .= 'i';
        $statement = $this->connection->prepare('UPDATE modalidades SET ' . implode(', ', $fields) . ' WHERE id_modalidade = ?');
        if ($statement === false) {
            throw new RuntimeException('Não foi possível atualizar modalidade.');
        }
        $statement->bind_param($types, ...$values);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível atualizar modalidade.');
        }
        $found = $statement->affected_rows > 0;
        if (!$found) {
            $check = $this->connection->prepare('SELECT 1 FROM modalidades WHERE id_modalidade = ?');
            if ($check !== false) {
                $check->bind_param('i', $id);
                $check->execute();
                $found = $check->get_result()->num_rows > 0;
                $check->close();
            }
        }
        $statement->close();
        if (array_intersect(['equipes_planejadas', 'min_inscritos_equipe', 'max_inscritos_equipe', 'formato_participacao', 'duracao_prevista_min', 'descanso_min'], array_keys($data)) !== []) {
            $this->savePlanning($id, $data);
        }
        return $found;
    }

    /** @param array<string,mixed> $data */
    private function savePlanning(int $modalityId, array $data): bool
    {
        if (!$this->planningTableExists()) {
            throw new RuntimeException('A migration do cronograma planejado ainda não foi aplicada.');
        }
        $existing = null;
        $read = $this->connection->prepare('SELECT m.interclasses_id_interclasse, mp.equipes_planejadas, mp.min_inscritos_equipe, mp.max_inscritos_equipe, mp.formato_participacao, mp.duracao_prevista_min, mp.descanso_min, m.max_inscrito_modalidade FROM modalidades m LEFT JOIN modalidade_planejamentos mp ON mp.id_modalidade = m.id_modalidade WHERE m.id_modalidade = ? LIMIT 1 FOR UPDATE');
        if ($read !== false) {
            $read->bind_param('i', $modalityId);
            if ($read->execute()) {
                $existing = $read->get_result()->fetch_assoc() ?: null;
            }
            $read->close();
        }
        if ($existing === null) {
            throw new RuntimeException('Modalidade não encontrada.');
        }
        $config = CronogramaRules::modalidade([
            'equipes_planejadas' => $data['equipes_planejadas'] ?? $existing['equipes_planejadas'],
            'min_inscritos_equipe' => $data['min_inscritos_equipe'] ?? ($existing['min_inscritos_equipe'] ?? 1),
            'max_inscritos_equipe' => $data['max_inscritos_equipe'] ?? ($existing['max_inscritos_equipe'] ?? ($existing['max_inscrito_modalidade'] ?? 1)),
            'formato_participacao' => $data['formato_participacao'] ?? ($existing['formato_participacao'] ?? 'equipe'),
            'duracao_prevista_min' => array_key_exists('duracao_prevista_min', $data) ? $data['duracao_prevista_min'] : ($existing['duracao_prevista_min'] ?? null),
            'descanso_min' => $data['descanso_min'] ?? ($existing['descanso_min'] ?? 0),
            'max_inscrito_modalidade' => $existing['max_inscrito_modalidade'] ?? 1,
        ]);
        $quantity = $config['quantidade'];
        $min = $config['min'];
        $max = $config['max'];
        $format = $config['formato'];
        $duration = $config['duracao'];
        $rest = $config['descanso'];
        $samePlanning = $existing['equipes_planejadas'] !== null
            && (int) $existing['equipes_planejadas'] === $quantity
            && (int) $existing['min_inscritos_equipe'] === $min
            && (int) $existing['max_inscritos_equipe'] === $max
            && (string) $existing['formato_participacao'] === $format
            && ($existing['duracao_prevista_min'] === null ? null : (int) $existing['duracao_prevista_min']) === $duration
            && (int) $existing['descanso_min'] === $rest;
        $editionId = (int) $existing['interclasses_id_interclasse'];
        $edition = $this->one('SELECT cronograma_status, cronograma_versao, operacao_liberada FROM interclasse_planejamentos WHERE id_interclasse = ? LIMIT 1 FOR UPDATE', 'i', [$editionId]);
        if ($edition !== null && (int) $edition['operacao_liberada'] === 1 && !$samePlanning) {
            throw new InvalidArgumentException('O planejamento não pode ser alterado depois que a competição foi liberada.');
        }
        if ($samePlanning) {
            return true;
        }
        $statement = $this->connection->prepare('INSERT INTO modalidade_planejamentos (id_modalidade, equipes_planejadas, min_inscritos_equipe, max_inscritos_equipe, formato_participacao, duracao_prevista_min, descanso_min) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE equipes_planejadas = VALUES(equipes_planejadas), min_inscritos_equipe = VALUES(min_inscritos_equipe), max_inscritos_equipe = VALUES(max_inscritos_equipe), formato_participacao = VALUES(formato_participacao), duracao_prevista_min = VALUES(duracao_prevista_min), descanso_min = VALUES(descanso_min)');
        if ($statement === false) {
            throw new RuntimeException('A migration do cronograma planejado ainda não foi aplicada.');
        }
        $statement->bind_param('iiiisii', $modalityId, $quantity, $min, $max, $format, $duration, $rest);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível salvar o planejamento da modalidade.');
        }
        $statement->close();
        if ($edition !== null) {
            $this->invalidatePlanning($editionId);
        }
        return true;
    }

    private function planningTableExists(): bool
    {
        $result = $this->connection->query("SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'modalidade_planejamentos'");
        if ($result === false) {
            return false;
        }
        $row = $result->fetch_assoc();
        $result->free();
        return (int) ($row['total'] ?? 0) > 0;
    }

    /** @param list<mixed> $values @return array<string,mixed>|null */
    private function one(string $sql, string $types, array $values): ?array
    {
        $statement = $this->connection->prepare($sql);
        if ($statement === false) {
            throw new RuntimeException('Não foi possível preparar a consulta da modalidade.');
        }
        if ($types !== '') {
            $statement->bind_param($types, ...$values);
        }
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível consultar os dados da modalidade.');
        }
        $row = $statement->get_result()->fetch_assoc();
        $statement->close();

        return $row === null ? null : $row;
    }

    private function invalidatePlanning(int $editionId): void
    {
        $statement = $this->connection->prepare("UPDATE interclasse_planejamentos SET inscricoes_status = IF(cronograma_status = 'publicado', 'fechadas', inscricoes_status), cronograma_status = IF(cronograma_status = 'publicado', 'revisao', cronograma_status), cronograma_versao = cronograma_versao + 1 WHERE id_interclasse = ? AND operacao_liberada = 0");
        if ($statement === false) {
            throw new RuntimeException('Não foi possível invalidar a proposta do cronograma.');
        }
        $statement->bind_param('i', $editionId);
        if (!$statement->execute() || $statement->affected_rows !== 1) {
            $statement->close();
            throw new RuntimeException('Não foi possível invalidar a proposta do cronograma.');
        }
        $statement->close();
    }

    /** @param array<string, mixed> $data */
    private function updateScope(int $id, array $data): bool
    {
        Transaction::begin($this->connection);
        try {
            $initial = $this->modalityScope($id, false);
            if ($initial === null) {
                Transaction::rollback($this->connection);
                return false;
            }

            $targetCategoryId = (int) ($data['categorias_id_categoria'] ?? $initial['categorias_id_categoria']);
            $targetEditionId = (int) ($data['interclasses_id_interclasse'] ?? $initial['interclasses_id_interclasse']);
            $this->lockEditions([$initial['interclasses_id_interclasse'], $targetEditionId]);
            $categories = $this->lockCategories([$initial['categorias_id_categoria'], $targetCategoryId]);
            $current = $this->modalityScope($id, true);
            if ($current === null) {
                Transaction::rollback($this->connection);
                return false;
            }
            if ($current !== $initial) {
                throw new InvalidArgumentException('A modalidade foi alterada por outra operação. Recarregue os dados.');
            }

            ModalidadeScopeRules::assertCategoryMatchesEdition(
                (int) $categories[$targetCategoryId]['interclasses_id_interclasse'],
                $targetEditionId,
                (string) $categories[$targetCategoryId]['status_categoria'],
            );
            $scopeChanged = $targetCategoryId !== (int) $initial['categorias_id_categoria']
                || $targetEditionId !== (int) $initial['interclasses_id_interclasse'];
            $hasRelatedData = $scopeChanged && $this->hasRelatedData($id);
            ModalidadeScopeRules::assertEditionTransferAllowed(
                $current['interclasses_id_interclasse'],
                $targetEditionId,
                $hasRelatedData,
            );
            if ((int) $current['categorias_id_categoria'] !== $targetCategoryId && $hasRelatedData) {
                throw new InvalidArgumentException('Não é possível trocar a categoria de uma modalidade que já possui equipes, inscrições, jogos ou reservas vinculados.');
            }

            $planningRevisions = [];
            if ($scopeChanged && $this->planningTableExists()) {
                $editionIds = array_values(array_unique([(int) $initial['interclasses_id_interclasse'], $targetEditionId]));
                sort($editionIds, SORT_NUMERIC);
                foreach ($editionIds as $editionId) {
                    $planning = $this->one('SELECT cronograma_versao, operacao_liberada FROM interclasse_planejamentos WHERE id_interclasse = ? LIMIT 1 FOR UPDATE', 'i', [$editionId]);
                    if ($planning !== null && (int) $planning['operacao_liberada'] === 1) {
                        throw new InvalidArgumentException('A modalidade não pode trocar de categoria ou edição depois que a competição foi liberada.');
                    }
                    if ($planning !== null) {
                        $planningRevisions[$editionId] = (int) $planning['cronograma_versao'];
                    }
                }
            }

            $updated = $this->persistUpdates($id, $data);
            foreach ($planningRevisions as $editionId => $revision) {
                $currentRevision = $this->one('SELECT cronograma_versao FROM interclasse_planejamentos WHERE id_interclasse = ? LIMIT 1 FOR UPDATE', 'i', [$editionId]);
                if ($currentRevision !== null && (int) $currentRevision['cronograma_versao'] === $revision) {
                    $this->invalidatePlanning((int) $editionId);
                }
            }
            Transaction::commit($this->connection);
            return $updated;
        } catch (\Throwable $exception) {
            Transaction::rollback($this->connection);
            throw $exception;
        }
    }

    /** @param list<int> $editionIds */
    private function lockEditions(array $editionIds): void
    {
        $editionIds = array_values(array_unique($editionIds));
        sort($editionIds, SORT_NUMERIC);
        $placeholders = implode(', ', array_fill(0, count($editionIds), '?'));
        $statement = $this->connection->prepare(
            'SELECT id_interclasse FROM interclasses WHERE id_interclasse IN (' . $placeholders . ') ORDER BY id_interclasse FOR UPDATE',
        );
        if ($statement === false) {
            throw new RuntimeException('Não foi possível validar a edição da modalidade.');
        }
        $types = str_repeat('i', count($editionIds));
        $statement->bind_param($types, ...$editionIds);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível validar a edição da modalidade.');
        }
        $found = $statement->get_result()->num_rows;
        $statement->close();
        if ($found !== count($editionIds)) {
            throw new InvalidArgumentException('A edição informada não foi encontrada.');
        }
    }

    /**
     * @param list<int> $categoryIds
     * @return array<int, array{status_categoria:string,interclasses_id_interclasse:int}>
     */
    private function lockCategories(array $categoryIds): array
    {
        $categoryIds = array_values(array_unique($categoryIds));
        sort($categoryIds, SORT_NUMERIC);
        $placeholders = implode(', ', array_fill(0, count($categoryIds), '?'));
        $statement = $this->connection->prepare(
            'SELECT id_categoria, status_categoria, interclasses_id_interclasse
             FROM categorias WHERE id_categoria IN (' . $placeholders . ') ORDER BY id_categoria FOR UPDATE',
        );
        if ($statement === false) {
            throw new RuntimeException('Não foi possível validar a categoria da modalidade.');
        }
        $types = str_repeat('i', count($categoryIds));
        $statement->bind_param($types, ...$categoryIds);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível validar a categoria da modalidade.');
        }
        $rows = $statement->get_result()->fetch_all(MYSQLI_ASSOC);
        $statement->close();
        if (count($rows) !== count($categoryIds)) {
            throw new InvalidArgumentException('A categoria informada não foi encontrada.');
        }

        $categories = [];
        foreach ($rows as $row) {
            $categories[(int) $row['id_categoria']] = [
                'status_categoria' => (string) $row['status_categoria'],
                'interclasses_id_interclasse' => (int) $row['interclasses_id_interclasse'],
            ];
        }
        return $categories;
    }

    /** @return array{categorias_id_categoria:int,interclasses_id_interclasse:int}|null */
    private function modalityScope(int $id, bool $forUpdate): ?array
    {
        $sql = 'SELECT categorias_id_categoria, interclasses_id_interclasse FROM modalidades WHERE id_modalidade = ? LIMIT 1';
        if ($forUpdate) {
            $sql .= ' FOR UPDATE';
        }
        $statement = $this->connection->prepare($sql);
        if ($statement === false) {
            throw new RuntimeException('Não foi possível consultar a modalidade.');
        }
        $statement->bind_param('i', $id);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível consultar a modalidade.');
        }
        $row = $statement->get_result()->fetch_assoc();
        $statement->close();
        if ($row === null) {
            return null;
        }
        return [
            'categorias_id_categoria' => (int) $row['categorias_id_categoria'],
            'interclasses_id_interclasse' => (int) $row['interclasses_id_interclasse'],
        ];
    }

    private function hasRelatedData(int $modalityId): bool
    {
        $queries = [
            'SELECT 1 FROM equipes WHERE modalidades_id_modalidade = ? LIMIT 1 FOR UPDATE',
            'SELECT 1 FROM equipes_has_usuarios eu
             INNER JOIN equipes e ON e.id_equipe = eu.equipes_id_equipe
             WHERE e.modalidades_id_modalidade = ? LIMIT 1 FOR UPDATE',
            'SELECT 1 FROM jogos WHERE modalidades_id_modalidade = ? LIMIT 1 FOR UPDATE',
            'SELECT 1 FROM agenda_reservas WHERE id_modalidade = ? LIMIT 1 FOR UPDATE',
            'SELECT 1 FROM pontuacoes_podio WHERE id_modalidade = ? LIMIT 1 FOR UPDATE',
        ];
        foreach ($queries as $sql) {
            $statement = $this->connection->prepare($sql);
            if ($statement === false) {
                throw new RuntimeException('Não foi possível verificar os vínculos da modalidade.');
            }
            $statement->bind_param('i', $modalityId);
            if (!$statement->execute()) {
                $statement->close();
                throw new RuntimeException('Não foi possível verificar os vínculos da modalidade.');
            }
            $found = $statement->get_result()->num_rows > 0;
            $statement->close();
            if ($found) {
                return true;
            }
        }
        return false;
    }

    public function deactivate(int $id): bool
    {
        Transaction::begin($this->connection);
        try {
            $scope = $this->one('SELECT interclasses_id_interclasse FROM modalidades WHERE id_modalidade = ? LIMIT 1', 'i', [$id]);
            if ($scope === null) {
                Transaction::rollback($this->connection);
                return false;
            }
            $editionId = (int) $scope['interclasses_id_interclasse'];
            $planning = $this->planningTableExists()
                ? $this->one('SELECT cronograma_status, operacao_liberada FROM interclasse_planejamentos WHERE id_interclasse = ? LIMIT 1 FOR UPDATE', 'i', [$editionId])
                : null;
            if ($planning !== null && (int) $planning['operacao_liberada'] === 1) {
                throw new InvalidArgumentException('Não é possível desativar modalidades depois que a competição foi liberada.');
            }
            $modalidade = $this->connection->prepare("UPDATE modalidades SET status_modalidade = '0' WHERE id_modalidade = ?");
            $equipes = $this->connection->prepare("UPDATE equipes SET status_equipe = '0' WHERE modalidades_id_modalidade = ?");
            if ($modalidade === false || $equipes === false) {
                if ($modalidade !== false) {
                    $modalidade->close();
                }
                if ($equipes !== false) {
                    $equipes->close();
                }
                throw new RuntimeException('Não foi possível excluir modalidade.');
            }
            $modalidade->bind_param('i', $id);
            if (!$modalidade->execute()) {
                throw new RuntimeException('Não foi possível excluir modalidade.');
            }
            $found = $modalidade->affected_rows > 0;
            $changed = $found;
            $equipes->bind_param('i', $id);
            if (!$equipes->execute()) {
                throw new RuntimeException('Não foi possível desativar equipes.');
            }
            $changed = $changed || $equipes->affected_rows > 0;
            $modalidade->close();
            $equipes->close();
            if ($planning !== null && $changed) {
                $this->invalidatePlanning($editionId);
            }
            Transaction::commit($this->connection);
            if (!$found) {
                $check = $this->connection->prepare('SELECT 1 FROM modalidades WHERE id_modalidade = ?');
                if ($check !== false) {
                    $check->bind_param('i', $id);
                    $check->execute();
                    $found = $check->get_result()->num_rows > 0;
                    $check->close();
                }
            }
            return $found;
        } catch (\Throwable $exception) {
            Transaction::rollback($this->connection);
            throw $exception;
        }
    }
}
