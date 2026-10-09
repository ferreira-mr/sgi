<?php

declare (strict_types=1);

namespace App\Modules\Eventos\Infrastructure;

use App\Modules\Competicoes\Domain\EquipePadraoRepository;
use App\Modules\Eventos\Domain\EdicaoRepository;
use App\Shared\Database\Transaction;
use mysqli;
use RuntimeException;

final class MysqliEdicaoRepository implements EdicaoRepository
{
    private readonly mysqli $connection;

    private readonly EquipePadraoRepository $equipesPadrao;

    public function __construct(mysqli $connection, EquipePadraoRepository $equipesPadrao)
    {
        $this->connection = $connection;
        $this->equipesPadrao = $equipesPadrao;
    }
    public function list(array $filters): array
    {
        $details = (bool) ($filters['detalhes'] ?? false);
        $sql = 'SELECT ' . ($details ? '*' : 'id_interclasse, nome_interclasse, ano_interclasse') . ' FROM interclasses WHERE 1=1';
        $types = '';
        $params = [];
        if ((int) ($filters['id_interclasse'] ?? 0) > 0) {
            $sql .= ' AND id_interclasse = ?';
            $types .= 'i';
            $params[] = (int) $filters['id_interclasse'];
        }
        if ((int) ($filters['ano'] ?? 0) > 0) {
            $sql .= ' AND YEAR(ano_interclasse) = ?';
            $types .= 'i';
            $params[] = (int) $filters['ano'];
        }
        if ((string) ($filters['status_interclasse'] ?? '') !== '') {
            $sql .= ' AND status_interclasse = ?';
            $types .= 's';
            $params[] = (string) $filters['status_interclasse'];
        }
        if ((string) ($filters['ranking_publicado'] ?? '') === '1') {
            $sql .= " AND ranking_publicado_em IS NOT NULL AND status_interclasse = '0'";
        }
        if ((string) ($filters['busca'] ?? '') !== '') {
            $sql .= ' AND nome_interclasse LIKE ?';
            $types .= 's';
            $params[] = '%' . (string) $filters['busca'] . '%';
        }
        $sql .= ' ORDER BY ano_interclasse DESC';
        $statement = $this->connection->prepare($sql);
        if ($statement === false) {
            throw new RuntimeException('Não foi possível consultar edições.');
        }
        if ($types !== '') {
            $statement->bind_param($types, ...$params);
        }
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível consultar edições.');
        }
        $rows = $statement->get_result()->fetch_all(MYSQLI_ASSOC);
        $statement->close();
        return $rows;
    }
    public function create(array $data): array
    {
        $lockName = $this->acquireEditionLock();
        $transactionOpen = false;
        try {
            Transaction::begin($this->connection);
            $transactionOpen = true;
            $interclasse = $this->connection->prepare("INSERT INTO interclasses (nome_interclasse, ano_interclasse, regulamento_interclasse, status_interclasse)\n                 VALUES (?, ?, '', '1')");
            if ($interclasse === false) {
                throw new RuntimeException('Não foi possível criar edição.');
            }
            $name = (string) $data['nome_interclasse'];
            $year = (string) $data['ano_interclasse'];
            $interclasse->bind_param('ss', $name, $year);
            if (!$interclasse->execute()) {
                $interclasse->close();
                throw new RuntimeException('Não foi possível criar edição.');
            }
            $id = (int) $this->connection->insert_id;
            $interclasse->close();
            $this->initializePlanningIfAvailable($id);
            $this->deactivateOtherEditions($id);
            $categoryI = $this->createCategory($id, 'Categoria I');
            $categoryII = $this->createCategory($id, 'Categoria II');
            [$mataMata, $individual] = $this->ensureModalityTypes();
            $this->createDefaultClasses($id, $categoryI, $categoryII);
            $this->createDefaultModalities($id, $categoryI, $categoryII, $mataMata, $individual);
            \App\Modules\Eventos\Infrastructure\MysqliLocalPadraoRepository::criarLocaisPadraoInterclasse($this->connection, $id);
            $teams = $this->equipesPadrao->generateForEdition($id);
            Transaction::commit($this->connection);
            $transactionOpen = false;
            return ['id' => $id, 'equipes_padrao_garantidas' => (int) $teams['criadas'], 'erros_equipes' => $teams['erros']];
        } catch (\Throwable $exception) {
            if ($transactionOpen) {
                Transaction::rollback($this->connection);
            }
            throw $exception;
        } finally {
            $this->releaseEditionLock($lockName);
        }
    }
    public function update(int $id, array $data): void
    {
        $fields = [];
        $values = [];
        $types = '';
        foreach (['nome_interclasse' => 's', 'ano_interclasse' => 's', 'regulamento_interclasse' => 's', 'status_interclasse' => 's', 'valor_item_arrecadacao' => 'i', 'ponto_1_lugar' => 'i', 'ponto_2_lugar' => 'i', 'ponto_3_lugar' => 'i'] as $field => $type) {
            if (array_key_exists($field, $data)) {
                $fields[] = $field . ' = ?';
                $values[] = $data[$field];
                $types .= $type;
            }
        }
        if ($fields === []) {
            throw new RuntimeException('Nenhum campo válido para atualizar edição.');
        }
        if (array_key_exists('status_interclasse', $data) && !in_array((string) $data['status_interclasse'], ['0', '1'], true)) {
            throw new RuntimeException('O status da edição deve ser 0 ou 1.');
        }
        $lockName = $this->acquireEditionLock();
        $transactionOpen = false;
        try {
            Transaction::begin($this->connection);
            $transactionOpen = true;
            $this->lockEditionScope($id);
            if (($data['status_interclasse'] ?? null) === '1') {
                $this->deactivateOtherEditions($id);
            }
            $values[] = $id;
            $types .= 'i';
            $statement = $this->connection->prepare('UPDATE interclasses SET ' . implode(', ', $fields) . ' WHERE id_interclasse = ?');
            if ($statement === false) {
                throw new RuntimeException('Não foi possível atualizar edição.');
            }
            $statement->bind_param($types, ...$values);
            if (!$statement->execute()) {
                $statement->close();
                throw new RuntimeException('Não foi possível atualizar edição.');
            }
            $statement->close();
            Transaction::commit($this->connection);
            $transactionOpen = false;
        } catch (\Throwable $exception) {
            if ($transactionOpen) {
                Transaction::rollback($this->connection);
            }
            throw $exception;
        } finally {
            $this->releaseEditionLock($lockName);
        }
    }

    public function publishRanking(int $id, int $userId): void
    {
        $statement = $this->connection->prepare(
            "UPDATE interclasses
             SET ranking_publicado_em = COALESCE(ranking_publicado_em, CURRENT_TIMESTAMP),
                 ranking_publicado_por = COALESCE(ranking_publicado_por, ?),
                 status_interclasse = '0'
             WHERE id_interclasse = ?
               AND NOT EXISTS (
                   SELECT 1 FROM jogos j
                   INNER JOIN modalidades m ON m.id_modalidade = j.modalidades_id_modalidade
                   WHERE m.interclasses_id_interclasse = interclasses.id_interclasse
                     AND j.status_jogo NOT IN ('Concluido', 'Finalizado')
               )",
        );
        if ($statement === false) {
            throw new RuntimeException('Não foi possível publicar o ranking.');
        }
        $statement->bind_param('ii', $userId, $id);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível publicar o ranking.');
        }
        $changed = $statement->affected_rows > 0;
        $statement->close();
        if (!$changed) {
            throw new RuntimeException('A edição possui jogos pendentes ou não foi encontrada.');
        }
    }

    private function acquireEditionLock(): string
    {
        $database = (string) ($this->connection->query('SELECT DATABASE()')->fetch_column() ?? '');
        $name = sha1($database . ':edicao-ativa');
        $statement = $this->connection->prepare('SELECT GET_LOCK(?, 10)');
        if ($statement === false) {
            throw new RuntimeException('Não foi possível reservar a trava da edição.');
        }
        $statement->bind_param('s', $name);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível reservar a trava da edição.');
        }
        $acquired = (int) ($statement->get_result()->fetch_column() ?? 0);
        $statement->close();
        if ($acquired !== 1) {
            throw new RuntimeException('A edição está ocupada por outra operação. Tente novamente.');
        }
        return $name;
    }

    private function releaseEditionLock(string $name): void
    {
        $statement = $this->connection->prepare('SELECT RELEASE_LOCK(?)');
        if ($statement === false) {
            return;
        }
        $statement->bind_param('s', $name);
        $statement->execute();
        $statement->close();
    }

    private function lockEditionScope(int $id): void
    {
        $statement = $this->connection->prepare(
            "SELECT id_interclasse FROM interclasses
             WHERE id_interclasse = ? OR status_interclasse = '1'
             ORDER BY id_interclasse FOR UPDATE",
        );
        if ($statement === false) {
            throw new RuntimeException('Não foi possível verificar a edição.');
        }
        $statement->bind_param('i', $id);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível verificar a edição.');
        }
        $rows = $statement->get_result()->fetch_all(MYSQLI_ASSOC);
        $statement->close();
        foreach ($rows as $row) {
            if ((int) ($row['id_interclasse'] ?? 0) === $id) {
                return;
            }
        }
        throw new RuntimeException('Edição não encontrada.');
    }

    private function deactivateOtherEditions(int $id): void
    {
        $deactivate = $this->connection->prepare("UPDATE interclasses SET status_interclasse = '0' WHERE id_interclasse != ? AND status_interclasse = '1'");
        if ($deactivate === false) {
            throw new RuntimeException('Não foi possível alternar edição ativa.');
        }
        $deactivate->bind_param('i', $id);
        if (!$deactivate->execute()) {
            $deactivate->close();
            throw new RuntimeException('Não foi possível alternar edição ativa.');
        }
        $deactivate->close();
    }
    private function createCategory(int $interclasseId, string $name): int
    {
        $statement = $this->connection->prepare("INSERT INTO categorias (nome_categoria, status_categoria, interclasses_id_interclasse) VALUES (?, '1', ?)");
        if ($statement === false) {
            throw new RuntimeException('Não foi possível criar categoria padrão.');
        }
        $statement->bind_param('si', $name, $interclasseId);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível criar categoria padrão.');
        }
        $id = (int) $this->connection->insert_id;
        $statement->close();
        return $id;
    }
    /** @return array{0:int,1:int} */
    private function ensureModalityTypes(): array
    {
        $ids = ['Mata-Mata' => 0, 'Individual' => 0];
        $result = $this->connection->query('SELECT id_tipo_modalidade, nome_tipo_modalidade FROM tipos_modalidades');
        if ($result !== false) {
            while ($row = $result->fetch_assoc()) {
                if (isset($ids[$row['nome_tipo_modalidade']])) {
                    $ids[$row['nome_tipo_modalidade']] = (int) $row['id_tipo_modalidade'];
                }
            }
        }
        foreach ($ids as $name => $typeId) {
            if ($typeId > 0) {
                continue;
            }
            $statement = $this->connection->prepare("INSERT INTO tipos_modalidades (nome_tipo_modalidade, status_tipo_modalidade) VALUES (?, '1')");
            if ($statement === false) {
                throw new RuntimeException('Não foi possível criar tipo de modalidade.');
            }
            $statement->bind_param('s', $name);
            if (!$statement->execute()) {
                $statement->close();
                throw new RuntimeException('Não foi possível criar tipo de modalidade.');
            }
            $ids[$name] = (int) $this->connection->insert_id;
            $statement->close();
        }
        return [$ids['Mata-Mata'], $ids['Individual']];
    }
    private function createDefaultClasses(int $interclasseId, int $categoryI, int $categoryII): void
    {
        $classes = [['6EF', 'Sexto Ano', $categoryI], ['7EF', 'Sétimo Ano', $categoryI], ['8EF', 'Oitavo Ano', $categoryI], ['9EF', 'Nono Ano', $categoryII], ['1EMA', '1º Ano Médio', $categoryII], ['2EMA', '2º Ano Médio', $categoryII], ['3EMA', '3º Ano Médio', $categoryII]];
        $statement = $this->connection->prepare("INSERT INTO turmas (nome_turma, turno_turma, nome_fantasia_turma, status_turma,\n                interclasses_id_interclasse, categorias_id_categoria) VALUES (?, 'manha', ?, '1', ?, ?)");
        if ($statement === false) {
            throw new RuntimeException('Não foi possível criar turmas padrão.');
        }
        foreach ($classes as [$name, $fantasy, $categoryId]) {
            $statement->bind_param('ssii', $name, $fantasy, $interclasseId, $categoryId);
            if (!$statement->execute()) {
                $statement->close();
                throw new RuntimeException('Não foi possível criar turmas padrão.');
            }
        }
        $statement->close();
    }
    private function createDefaultModalities(int $interclasseId, int $categoryI, int $categoryII, int $mataMata, int $individual): void
    {
        $definitions = [['Futsal - MA', 'MASC', 10, $mataMata], ['Queimada - MI', 'MISTO', 20, $mataMata], ['Volei - MI', 'MISTO', 12, $mataMata], ['Corrida - FE', 'FEM', 2, $individual], ['Corrida - MA', 'MASC', 2, $individual]];
        $statement = $this->connection->prepare("INSERT INTO modalidades (nome_modalidade, genero_modalidade, max_inscrito_modalidade,\n                max_equipes, status_modalidade, tipos_modalidades_id_tipo_modalidade,\n                categorias_id_categoria, interclasses_id_interclasse)\n             VALUES (?, ?, ?, NULL, '1', ?, ?, ?)");
        if ($statement === false) {
            throw new RuntimeException('Não foi possível criar modalidades padrão.');
        }
        foreach ([$categoryI, $categoryII] as $categoryId) {
            foreach ($definitions as [$name, $gender, $limit, $typeId]) {
                $statement->bind_param('ssiiii', $name, $gender, $limit, $typeId, $categoryId, $interclasseId);
                if (!$statement->execute()) {
                    $statement->close();
                    throw new RuntimeException('Não foi possível criar modalidades padrão.');
                }
            }
        }
        $statement->close();
    }

    private function initializePlanningIfAvailable(int $editionId): void
    {
        $available = $this->connection->query("SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'interclasse_planejamentos'");
        if ($available === false) {
            return;
        }
        $row = $available->fetch_assoc();
        $available->free();
        if ((int) ($row['total'] ?? 0) === 0) {
            return;
        }
        $statement = $this->connection->prepare("INSERT INTO interclasse_planejamentos (id_interclasse, cronograma_status, inscricoes_status) VALUES (?, 'rascunho', 'fechadas')");
        if ($statement === false) {
            throw new RuntimeException('Não foi possível inicializar o planejamento da edição.');
        }
        $statement->bind_param('i', $editionId);
        if (!$statement->execute()) {
            $statement->close();
            throw new RuntimeException('Não foi possível inicializar o planejamento da edição.');
        }
        $statement->close();
    }
}
