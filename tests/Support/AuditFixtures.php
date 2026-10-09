<?php

declare(strict_types=1);

namespace SGITests\Support;

use mysqli;
use Throwable;

final class AuditFixtures
{
    /** @return array<string, mixed> */
    public static function createAuthorizationFixture(mysqli $connection): array
    {
        $token = bin2hex(random_bytes(6));
        $passwordHash = password_hash('fixture-password', PASSWORD_DEFAULT);
        $autoIncrements = self::captureAutoIncrements($connection);

        $connection->begin_transaction();
        try {
            $connection->query("UPDATE interclasses SET status_interclasse = '0' WHERE status_interclasse = '1'");

            $editionA = self::insertEdition($connection, "Luna A {$token}", '1');
            $editionB = self::insertEdition($connection, "Luna B {$token}", '0');
            $byEdition = [];

            foreach ([
                'A' => [$editionA, '1'],
                'B' => [$editionB, '0'],
            ] as $label => [$editionId, $editionStatus]) {
                $categoryId = self::insertCategory($connection, "Categoria {$label} {$token}", $editionId);
                $turmaIds = [
                    self::insertTurma($connection, $editionId, $categoryId, "Luna {$label} 1 {$token}"),
                    self::insertTurma($connection, $editionId, $categoryId, "Luna {$label} 2 {$token}"),
                ];
                $modalityId = self::insertModality($connection, $editionId, $categoryId, "Luna {$label} {$token}");
                $localId = self::insertLocal($connection, $editionId, "Luna {$label} {$token}");
                $equipeIds = [
                    self::insertEquipe($connection, $modalityId, $turmaIds[0], "Luna {$label} 1 {$token}"),
                    self::insertEquipe($connection, $modalityId, $turmaIds[1], "Luna {$label} 2 {$token}"),
                ];
                $atletaIds = [
                    self::insertAtleta($connection, $editionId, $turmaIds[0], $editionStatus, "luna_{$label}_1_{$token}", $passwordHash),
                    self::insertAtleta($connection, $editionId, $turmaIds[1], $editionStatus, "luna_{$label}_2_{$token}", $passwordHash),
                ];
                self::insertMembership($connection, $equipeIds[0], $atletaIds[0]);
                self::insertMembership($connection, $equipeIds[1], $atletaIds[1]);
                $gameId = self::insertGame($connection, $modalityId, $localId, "AUD:{$label}:{$token}");
                $partidaIds = [
                    self::insertPartida($connection, $gameId, $equipeIds[0]),
                    self::insertPartida($connection, $gameId, $equipeIds[1]),
                ];

                $byEdition[$label] = [
                    'interclasse_id' => $editionId,
                    'categoria_id' => $categoryId,
                    'turma_ids' => $turmaIds,
                    'modalidade_id' => $modalityId,
                    'local_id' => $localId,
                    'equipe_ids' => $equipeIds,
                    'atleta_ids' => $atletaIds,
                    'jogo_ids' => [$gameId],
                    'partida_ids' => $partidaIds,
                ];
            }

            $connection->commit();
        } catch (Throwable $exception) {
            $connection->rollback();
            throw $exception;
        }

        return [
            'by_edition' => $byEdition,
            'auto_increments' => $autoIncrements,
            'ids' => [
                'interclasses' => [$editionA, $editionB],
                'categorias' => [$byEdition['A']['categoria_id'], $byEdition['B']['categoria_id']],
                'turmas' => array_merge($byEdition['A']['turma_ids'], $byEdition['B']['turma_ids']),
                'modalidades' => [$byEdition['A']['modalidade_id'], $byEdition['B']['modalidade_id']],
                'locais' => [$byEdition['A']['local_id'], $byEdition['B']['local_id']],
                'equipes' => array_merge($byEdition['A']['equipe_ids'], $byEdition['B']['equipe_ids']),
                'usuarios' => array_merge($byEdition['A']['atleta_ids'], $byEdition['B']['atleta_ids']),
                'jogos' => array_merge($byEdition['A']['jogo_ids'], $byEdition['B']['jogo_ids']),
                'partidas' => array_merge($byEdition['A']['partida_ids'], $byEdition['B']['partida_ids']),
            ],
        ];
    }

    /** @param array<string, mixed> $fixture */
    public static function restoreAndRemove(mysqli $connection, array $fixture, ?int $previousActiveId): void
    {
        $connection->begin_transaction();
        try {
            $connection->query("UPDATE interclasses SET status_interclasse = '0' WHERE status_interclasse = '1'");
            $ids = $fixture['ids'];
            self::deleteByIds($connection, 'artilheiros', 'jogos_id_jogo', $ids['jogos']);
            self::deleteByIds($connection, 'partidas', 'id_partida', $ids['partidas']);
            self::deleteByIds($connection, 'equipes_has_usuarios', 'equipes_id_equipe', $ids['equipes']);
            self::deleteByIds($connection, 'jogos', 'id_jogo', $ids['jogos']);
            self::deleteByIds($connection, 'equipes', 'id_equipe', $ids['equipes']);
            self::deleteByIds($connection, 'usuarios', 'id_usuario', $ids['usuarios']);
            self::deleteByIds($connection, 'modalidades', 'id_modalidade', $ids['modalidades']);
            self::deleteByIds($connection, 'locais', 'id_local', $ids['locais']);
            self::deleteByIds($connection, 'turmas', 'id_turma', $ids['turmas']);
            self::deleteByIds($connection, 'categorias', 'id_categoria', $ids['categorias']);
            self::deleteByIds($connection, 'interclasses', 'id_interclasse', $ids['interclasses']);

            if ($previousActiveId !== null) {
                $statement = $connection->prepare("UPDATE interclasses SET status_interclasse = '1' WHERE id_interclasse = ?");
                $statement->bind_param('i', $previousActiveId);
                $statement->execute();
                $statement->close();
            }
            $connection->commit();

            foreach ($fixture['auto_increments'] as $table => $value) {
                if ($value !== null && $value > 0) {
                    self::assertIdentifier($table);
                    $connection->query("ALTER TABLE `{$table}` AUTO_INCREMENT = " . (int) $value);
                }
            }
        } catch (Throwable $exception) {
            $connection->rollback();
            throw $exception;
        }
    }

    public static function activeEditionId(mysqli $connection): ?int
    {
        $result = $connection->query("SELECT id_interclasse FROM interclasses WHERE status_interclasse = '1' ORDER BY id_interclasse DESC LIMIT 1");
        $value = $result->fetch_column();
        return $value === null ? null : (int) $value;
    }

    /** @param list<int> $ids */
    public static function countRowsByIds(mysqli $connection, string $table, string $column, array $ids): int
    {
        self::assertIdentifier($table);
        self::assertIdentifier($column);
        if ($ids === []) {
            return 0;
        }
        $ids = array_values(array_map('intval', $ids));
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $statement = $connection->prepare("SELECT COUNT(*) FROM {$table} WHERE {$column} IN ({$placeholders})");
        $types = str_repeat('i', count($ids));
        $statement->bind_param($types, ...$ids);
        $statement->execute();
        $count = (int) $statement->get_result()->fetch_column();
        $statement->close();
        return $count;
    }

    public static function autoIncrement(mysqli $connection, string $table): ?int
    {
        self::assertIdentifier($table);
        $statement = $connection->prepare('SELECT AUTO_INCREMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?');
        $statement->bind_param('s', $table);
        $statement->execute();
        $value = $statement->get_result()->fetch_column();
        $statement->close();
        return $value === null ? null : (int) $value;
    }

    private static function insertEdition(mysqli $connection, string $name, string $status): int
    {
        $statement = $connection->prepare('INSERT INTO interclasses (nome_interclasse, ano_interclasse, regulamento_interclasse, status_interclasse, ponto_1_lugar, ponto_2_lugar, ponto_3_lugar, valor_item_arrecadacao) VALUES (?, NOW(), ?, ?, 10, 7, 5, 2)');
        $regulamento = 'fixture-auditoria';
        $statement->bind_param('sss', $name, $regulamento, $status);
        $editionId = self::executeInsert($statement);
        // O runner inicia a suíte sobre o baseline e aplica as migrações de
        // cronograma mais adiante. Quando a tabela já estiver disponível, o
        // fixture precisa respeitar o contrato final para que as jornadas de
        // navegador possam preparar a edição offline.
        if (self::tableExists($connection, 'interclasse_planejamentos')) {
            $planning = $connection->prepare("INSERT INTO interclasse_planejamentos (id_interclasse, cronograma_status, inscricoes_status) VALUES (?, 'rascunho', 'fechadas')");
            $planning->bind_param('i', $editionId);
            if (!$planning->execute()) {
                $planning->close();
                throw new \RuntimeException('Não foi possível criar o planejamento da edição fixture.');
            }
            $planning->close();
        }
        return $editionId;
    }

    private static function tableExists(mysqli $connection, string $table): bool
    {
        $statement = $connection->prepare('SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?');
        $statement->bind_param('s', $table);
        $statement->execute();
        $exists = (int) $statement->get_result()->fetch_column() > 0;
        $statement->close();
        return $exists;
    }

    private static function insertCategory(mysqli $connection, string $name, int $editionId): int
    {
        $statement = $connection->prepare("INSERT INTO categorias (nome_categoria, status_categoria, interclasses_id_interclasse) VALUES (?, '1', ?)");
        $statement->bind_param('si', $name, $editionId);
        return self::executeInsert($statement);
    }

    private static function insertTurma(mysqli $connection, int $editionId, int $categoryId, string $name): int
    {
        $statement = $connection->prepare("INSERT INTO turmas (interclasses_id_interclasse, nome_turma, turno_turma, nome_fantasia_turma, status_turma, categorias_id_categoria) VALUES (?, ?, 'manha', ?, '1', ?)");
        $statement->bind_param('issi', $editionId, $name, $name, $categoryId);
        return self::executeInsert($statement);
    }

    private static function insertModality(mysqli $connection, int $editionId, int $categoryId, string $name): int
    {
        $statement = $connection->prepare("INSERT INTO modalidades (nome_modalidade, genero_modalidade, max_inscrito_modalidade, max_equipes, status_modalidade, tipos_modalidades_id_tipo_modalidade, categorias_id_categoria, interclasses_id_interclasse) VALUES (?, 'MASC', 10, 2, '1', 1, ?, ?)");
        $statement->bind_param('sii', $name, $categoryId, $editionId);
        return self::executeInsert($statement);
    }

    private static function insertLocal(mysqli $connection, int $editionId, string $name): int
    {
        $statement = $connection->prepare("INSERT INTO locais (nome_local, disponivel_local, carga_local, status_local, interclasses_id_interclasse) VALUES (?, '1', 100, '1', ?)");
        $statement->bind_param('si', $name, $editionId);
        return self::executeInsert($statement);
    }

    private static function insertEquipe(mysqli $connection, int $modalityId, int $classId, string $name): int
    {
        $statement = $connection->prepare("INSERT INTO equipes (status_equipe, modalidades_id_modalidade, turmas_id_turma, nome_equipe) VALUES ('1', ?, ?, ?)");
        $statement->bind_param('iis', $modalityId, $classId, $name);
        return self::executeInsert($statement);
    }

    private static function insertAtleta(mysqli $connection, int $editionId, int $classId, string $status, string $registration, string $passwordHash): int
    {
        $statement = $connection->prepare("INSERT INTO usuarios (sigla_usuario, matricula_usuario, nome_usuario, senha_usuario, nivel_usuario, genero_usuario, data_nasc_usuario, foto_usuario, status_usuario, turmas_id_turma, interclasses_id_interclasse, chave_usuario_edicao) VALUES ('RM', ?, ?, ?, '3', 'MASC', '2010-01-01', '', ?, ?, ?, NULL)");
        $name = "Atleta {$registration}";
        $statement->bind_param('ssssii', $registration, $name, $passwordHash, $status, $classId, $editionId);
        return self::executeInsert($statement);
    }

    private static function insertMembership(mysqli $connection, int $teamId, int $athleteId): void
    {
        $statement = $connection->prepare('INSERT INTO equipes_has_usuarios (equipes_id_equipe, usuarios_id_usuario) VALUES (?, ?)');
        $statement->bind_param('ii', $teamId, $athleteId);
        $statement->execute();
        $statement->close();
    }

    private static function insertGame(mysqli $connection, int $modalityId, int $localId, string $name): int
    {
        $statement = $connection->prepare("INSERT INTO jogos (nome_jogo, data_jogo, inicio_jogo, termino_jogo, status_jogo, modalidades_id_modalidade, locais_id_local) VALUES (?, CURDATE(), '08:00:00', NULL, 'Agendado', ?, ?)");
        $statement->bind_param('sii', $name, $modalityId, $localId);
        return self::executeInsert($statement);
    }

    private static function insertPartida(mysqli $connection, int $gameId, int $teamId): int
    {
        $statement = $connection->prepare("INSERT INTO partidas (jogos_id_jogo, equipes_id_equipe, usuarios_id_usuario, resultado_partida, status_partida) VALUES (?, ?, NULL, 0, '1')");
        $statement->bind_param('ii', $gameId, $teamId);
        return self::executeInsert($statement);
    }

    /** @return array<string, int|null> */
    private static function captureAutoIncrements(mysqli $connection): array
    {
        $tables = ['interclasses', 'categorias', 'turmas', 'modalidades', 'locais', 'equipes', 'usuarios', 'jogos', 'partidas'];
        $values = [];
        foreach ($tables as $table) {
            $values[$table] = self::autoIncrement($connection, $table);
        }
        return $values;
    }

    private static function executeInsert(\mysqli_stmt $statement): int
    {
        $statement->execute();
        $id = $statement->insert_id;
        $statement->close();
        return (int) $id;
    }

    /** @param list<int> $ids */
    private static function deleteByIds(mysqli $connection, string $table, string $column, array $ids): void
    {
        self::assertIdentifier($table);
        self::assertIdentifier($column);
        if ($ids === []) {
            return;
        }
        $ids = array_values(array_map('intval', $ids));
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $statement = $connection->prepare("DELETE FROM {$table} WHERE {$column} IN ({$placeholders})");
        $types = str_repeat('i', count($ids));
        $statement->bind_param($types, ...$ids);
        $statement->execute();
        $statement->close();
    }

    private static function assertIdentifier(string $identifier): void
    {
        if (!preg_match('/^[a-z_]+$/', $identifier)) {
            throw new \InvalidArgumentException('Identificador SQL de fixture inválido.');
        }
    }
}
