<?php

declare(strict_types=1);

namespace SGITests\Integration;

use App\Modules\Competicoes\Application\JogoService;
use App\Modules\Competicoes\Infrastructure\MysqliJogoRepository;
use mysqli;
use RuntimeException;
use SGITests\Support\Assertions;
use SGITests\Support\ProcessExitCode;
use SGITests\Support\TestDatabase;

final class ConcurrentScheduleTest
{
    /** @param array<string,mixed> $jogos */
    public static function run(int $edition, int $modality, array $jogos): void
    {
        echo "\n  \033[1;34m[Suite: Concorrência do agendamento por local/data]\033[0m\n";
        $database = getenv('SGI_TEST_DB_NAME') ?: 'sgi_test';
        TestDatabase::assertSafeDatabaseName($database);
        $connection = TestDatabase::connect($database);
        $fixture = self::createFixture($connection, $edition, $modality, $jogos);

        try {
            self::runManualRace($connection, $fixture);
            self::runEditRace($connection, $fixture);
            self::runBatchRace($connection, $fixture);
            self::runLocalScopeCase($connection, $fixture);
            self::runBoundaryCases($connection, $fixture);
        } finally {
            self::removeFixture($connection, $fixture);
            $connection->close();
        }
    }

    /** @param array<string,mixed> $fixture */
    private static function runManualRace(mysqli $connection, array &$fixture): void
    {
        $barrier = self::createBarrier('manual');
        $names = [$fixture['prefix'] . ':MANUAL-A', $fixture['prefix'] . ':MANUAL-B'];
        array_push($fixture['game_names'], ...$names);
        $args = [
            self::createArgs($names[0], $fixture['date_manual'], $fixture['local_id'], $fixture['modality_id'], $fixture['team_ids']),
            self::createArgs($names[1], $fixture['date_manual'], $fixture['local_id'], $fixture['modality_id'], $fixture['team_ids']),
        ];
        $workers = [];
        try {
            $workers[] = self::startWorker($barrier, 'manual-a', 'jogo-criar', $args[0]);
            $workers[] = self::startWorker($barrier, 'manual-b', 'jogo-criar', $args[1]);
            self::releaseStart($barrier);
            self::waitForFile($barrier . DIRECTORY_SEPARATOR . 'validated-manual-a', $workers[0], 'pré-checagem manual A');
            self::waitForFile($barrier . DIRECTORY_SEPARATOR . 'validated-manual-b', $workers[1], 'pré-checagem manual B');
            Assertions::assert(
                'As duas criações manuais observam o local sem conflito antes da corrida',
                file_get_contents($barrier . DIRECTORY_SEPARATOR . 'validated-manual-a') === 'no-conflict'
                    && file_get_contents($barrier . DIRECTORY_SEPARATOR . 'validated-manual-b') === 'no-conflict',
            );
            self::continueWorkers($barrier);
            $results = [self::collectWorker($workers[0]), self::collectWorker($workers[1])];
            $workers = [];

            $state = self::readNamedGames($connection, $names);
            $accepted = count(array_filter($results, static fn (array $result): bool => ($result['result'] ?? '') === 'accepted'));
            $rejected = count(array_filter($results, static fn (array $result): bool => ($result['result'] ?? '') === 'rejected'));
            Assertions::assert(
                'Criações manuais concorrentes persistem no máximo um jogo e recusam o outro',
                $accepted === 1 && $rejected === 1 && count($state) === 1,
                json_encode(['workers' => $results, 'games' => $state], JSON_UNESCAPED_UNICODE),
            );
            Assertions::assert(
                'A criação manual recusada não deixa partida órfã nem parcial',
                self::countPartsForNames($connection, $names) === 2,
                'Jogos persistidos: ' . count($state) . '; partidas persistidas: ' . self::countPartsForNames($connection, $names),
            );
        } finally {
            self::stopWorkers($workers);
            self::removeBarrier($barrier);
        }
    }

    /** @param array<string,mixed> $fixture */
    private static function runEditRace(mysqli $connection, array &$fixture): void
    {
        $name = $fixture['prefix'] . ':EDIT';
        $manualName = $fixture['prefix'] . ':EDIT-MANUAL';
        $fixture['game_names'][] = $name;
        $fixture['game_names'][] = $manualName;
        $gameId = self::insertGame($connection, $name, $fixture['date_edit'], '13:00:00', '13:30:00', $fixture['modality_id'], $fixture['local_id']);
        $fixture['game_ids'][] = $gameId;

        $connection->begin_transaction();
        $blockerOpen = true;
        $workers = [];
        $earlyManualResult = null;
        $editBarrier = self::createBarrier('edit-worker');
        $manualBarrier = self::createBarrier('edit-manual');
        try {
            self::lockGame($connection, $gameId);
            $editWorker = self::startWorker($editBarrier, 'editor', 'jogo-editar', [
                $gameId,
                $fixture['date_edit'],
                '08:00:00',
                '08:30:00',
                $fixture['local_id'],
            ]);
            $workers[] = $editWorker;
            self::releaseStart($editBarrier);
            self::waitForGameUpdateLock($connection, $editWorker, 'edição do jogo');

            $manualWorker = self::startWorker($manualBarrier, 'edit-manual', 'jogo-criar', self::createArgs(
                $manualName,
                $fixture['date_edit'],
                $fixture['local_id'],
                $fixture['modality_id'],
                $fixture['team_ids'],
            ));
            $workers[] = $manualWorker;
            self::releaseStart($manualBarrier);
            self::waitForFile($manualBarrier . DIRECTORY_SEPARATOR . 'validated-edit-manual', $manualWorker, 'pré-checagem manual durante edição');
            self::continueWorkers($manualBarrier);
            $manualBoundary = self::waitForManualBoundary($connection, $manualWorker);
            if ($manualBoundary === 'completed') {
                $earlyManualResult = self::collectWorker($manualWorker);
                $workers[1] = null;
            }
            $connection->commit();
            $blockerOpen = false;

            $editResult = self::collectWorker($editWorker);
            $workers[0] = null;
            $manualResult = $earlyManualResult ?? self::collectWorker($manualWorker);
            if ($earlyManualResult === null) {
                $workers[1] = null;
            }
            $state = self::readNamedGames($connection, [$name, $manualName]);
            $collisionCount = self::countConflictingGames(
                $connection,
                $fixture['date_edit'],
                $fixture['local_id'],
                '08:00:00',
                '08:30:00',
            );
            $results = [$editResult, $manualResult];
            Assertions::assert(
                'Edição de jogo e criação manual concorrentes não ocupam a mesma faixa',
                count(array_filter($results, static fn (array $result): bool => ($result['result'] ?? '') === 'accepted')) === 1
                    && count(array_filter($results, static fn (array $result): bool => ($result['result'] ?? '') === 'rejected')) === 1
                    && $collisionCount === 1
                    && count($state) === 1,
                json_encode(['workers' => $results, 'games' => $state, 'collisions' => $collisionCount, 'manual_boundary' => $manualBoundary], JSON_UNESCAPED_UNICODE),
            );
            Assertions::assert(
                'A edição concorrente deixa somente as partidas do jogo manual que persistiu',
                self::countPartsForNames($connection, [$name, $manualName]) === (isset($state[0]) && $state[0]['nome_jogo'] === $manualName ? 2 : 0),
            );
        } finally {
            if ($blockerOpen) {
                $connection->rollback();
            }
            self::stopWorkers($workers);
            self::removeBarrier($editBarrier);
            self::removeBarrier($manualBarrier);
        }
    }

    /** @param array<string,mixed> $fixture */
    private static function runBatchRace(mysqli $connection, array &$fixture): void
    {
        $batchName = $fixture['prefix'] . ':BATCH';
        $manualName = $fixture['prefix'] . ':BATCH-MANUAL';
        $fixture['game_names'][] = $batchName;
        $fixture['game_names'][] = $manualName;
        $gameId = self::insertGame($connection, $batchName, null, null, null, $fixture['modality_id'], null);
        $fixture['game_ids'][] = $gameId;
        $idempotency = 'n12-' . bin2hex(random_bytes(8));
        $fixture['idempotencies'][] = $idempotency;

        $connection->begin_transaction();
        $blockerOpen = true;
        $workers = [];
        $earlyManualResult = null;
        $batchBarrier = self::createBarrier('batch-worker');
        $manualBarrier = self::createBarrier('batch-manual');
        try {
            self::lockGame($connection, $gameId);
            $batchWorker = self::startWorker($batchBarrier, 'batch', 'agenda-confirmar', [
                $fixture['edition_id'],
                $fixture['modality_id'],
                $fixture['admin_id'],
                $gameId,
                $fixture['date_batch'],
                '08:00:00',
                '08:30:00',
                $fixture['local_id'],
                $idempotency,
            ]);
            $workers[] = $batchWorker;
            self::releaseStart($batchBarrier);
            self::waitForGameUpdateLock($connection, $batchWorker, 'confirmação em lote');

            $manualWorker = self::startWorker($manualBarrier, 'batch-manual', 'jogo-criar', self::createArgs(
                $manualName,
                $fixture['date_batch'],
                $fixture['local_id'],
                $fixture['modality_id'],
                $fixture['team_ids'],
            ));
            $workers[] = $manualWorker;
            self::releaseStart($manualBarrier);
            self::waitForFile($manualBarrier . DIRECTORY_SEPARATOR . 'validated-batch-manual', $manualWorker, 'pré-checagem manual durante lote');
            self::continueWorkers($manualBarrier);
            $manualBoundary = self::waitForManualBoundary($connection, $manualWorker);
            if ($manualBoundary === 'completed') {
                $earlyManualResult = self::collectWorker($manualWorker);
                $workers[1] = null;
            }
            $connection->commit();
            $blockerOpen = false;

            $batchResult = self::collectWorker($batchWorker);
            $workers[0] = null;
            $manualResult = $earlyManualResult ?? self::collectWorker($manualWorker);
            if ($earlyManualResult === null) {
                $workers[1] = null;
            }
            $state = self::readNamedGames($connection, [$batchName, $manualName]);
            $collisionCount = self::countConflictingGames(
                $connection,
                $fixture['date_batch'],
                $fixture['local_id'],
                '08:00:00',
                '08:30:00',
            );
            $block = self::readBatchState($connection, $idempotency);
            Assertions::assert(
                'Confirmação em lote e criação manual concorrentes preservam a faixa e a reserva',
                ($batchResult['result'] ?? '') === 'accepted'
                    && ($manualResult['result'] ?? '') === 'rejected'
                    && count($state) === 1
                    && $collisionCount === 1
                    && (int) ($block['reservas'] ?? 0) === 1
                    && ($block['game_date'] ?? null) === $fixture['date_batch'],
                json_encode(['batch' => $batchResult, 'manual' => $manualResult, 'games' => $state, 'conflicts' => $collisionCount, 'block' => $block, 'manual_boundary' => $manualBoundary], JSON_UNESCAPED_UNICODE),
            );
            Assertions::assert(
                'O lote concorrente não deixa partidas sem jogo nem partidas de criação recusada',
                self::countPartsForNames($connection, [$batchName, $manualName]) === 0,
                'Partidas para jogos do lote: ' . self::countPartsForNames($connection, [$batchName, $manualName]),
            );
        } finally {
            if ($blockerOpen) {
                $connection->rollback();
            }
            self::stopWorkers($workers);
            self::removeBarrier($batchBarrier);
            self::removeBarrier($manualBarrier);
        }
    }

    /** @param array<string,mixed> $fixture */
    private static function runLocalScopeCase(mysqli $connection, array &$fixture): void
    {
        $name = $fixture['prefix'] . ':OTHER-LOCAL';
        $fixture['game_names'][] = $name;
        $barrier = self::createBarrier('other-local');
        $connection->begin_transaction();
        $blockerOpen = true;
        $workers = [];
        try {
            $statement = $connection->prepare('SELECT id_local FROM locais WHERE id_local = ? FOR UPDATE');
            $localId = (int) $fixture['local_id'];
            $statement->bind_param('i', $localId);
            $statement->execute();
            $statement->close();
            $worker = self::startWorker($barrier, 'other-local', 'jogo-criar', self::createArgs(
                $name,
                $fixture['date_scope'],
                $fixture['other_local_id'],
                $fixture['modality_id'],
                $fixture['team_ids'],
            ));
            $workers[] = $worker;
            self::releaseStart($barrier);
            self::waitForFile($barrier . DIRECTORY_SEPARATOR . 'validated-other-local', $worker, 'pré-checagem em local independente');
            self::continueWorkers($barrier);
            $completedBeforeUnlock = self::waitForCompletion($worker, 5.0);
            if ($completedBeforeUnlock) {
                $result = self::collectWorker($worker);
                $workers[0] = null;
            } else {
                $result = ['result' => 'blocked'];
            }
            $connection->commit();
            $blockerOpen = false;
            if (!$completedBeforeUnlock) {
                $result = self::collectWorker($worker);
                $workers[0] = null;
            }
            Assertions::assert(
                'Agendamento em outro local não aguarda a trava do local ocupado',
                $completedBeforeUnlock && ($result['result'] ?? '') === 'accepted',
                json_encode(['completed_before_unlock' => $completedBeforeUnlock, 'worker' => $result], JSON_UNESCAPED_UNICODE),
            );
        } finally {
            if ($blockerOpen) {
                $connection->rollback();
            }
            self::stopWorkers($workers);
            self::removeBarrier($barrier);
        }
    }

    /** @param array<string,mixed> $fixture */
    private static function runBoundaryCases(mysqli $connection, array &$fixture): void
    {
        $repo = new MysqliJogoRepository($connection);
        $service = new JogoService($repo);
        $names = [$fixture['prefix'] . ':ADJACENT-A', $fixture['prefix'] . ':ADJACENT-B', $fixture['prefix'] . ':OTHER-DAY'];
        array_push($fixture['game_names'], ...$names);
        $first = self::manualData($fixture, $names[0], $fixture['date_adjacent'], '08:00:00', '08:30:00', $fixture['local_id']);
        $second = self::manualData($fixture, $names[1], $fixture['date_adjacent'], '08:40:00', '09:10:00', $fixture['local_id']);
        $otherDay = self::manualData($fixture, $names[2], $fixture['date_other_day'], '08:00:00', '08:30:00', $fixture['local_id']);
        $ids = [$service->agendar($first), $service->agendar($second), $service->agendar($otherDay)];
        array_push($fixture['game_ids'], ...$ids);
        Assertions::assert(
            'Mesmo local em outro dia e faixa iniciada exatamente dez minutos depois continuam permitidos',
            count(self::readNamedGames($connection, $names)) === 3,
            json_encode(self::readNamedGames($connection, $names), JSON_UNESCAPED_UNICODE),
        );

        $invalidName = $fixture['prefix'] . ':INVALID-INTERVAL';
        $fixture['game_names'][] = $invalidName;
        $invalidRejected = false;
        try {
            $service->agendar(self::manualData($fixture, $invalidName, $fixture['date_invalid'], '09:00:00', '09:00:00', $fixture['local_id']));
        } catch (\InvalidArgumentException) {
            $invalidRejected = true;
        }
        Assertions::assert(
            'Intervalo vazio é rejeitado antes da persistência',
            $invalidRejected && self::countGamesByNames($connection, [$invalidName]) === 0,
        );

        $failureName = $fixture['prefix'] . ':ROLLBACK';
        $fixture['game_names'][] = $failureName;
        $wrongTeam = self::differentModalityTeam($connection, (int) $fixture['edition_id'], (int) $fixture['modality_id']);
        $creationRolledBack = false;
        try {
            $data = self::manualData($fixture, $failureName, $fixture['date_rollback'], '08:00:00', '08:30:00', $fixture['local_id']);
            $data['equipes'] = [(int) $fixture['team_ids'][0], $wrongTeam];
            $service->agendar($data);
        } catch (RuntimeException) {
            $creationRolledBack = true;
        }
        Assertions::assert(
            'Falha ao validar equipe desfaz o jogo e suas partidas no mesmo fluxo transacional',
            $creationRolledBack
                && self::countGamesByNames($connection, [$failureName]) === 0
                && self::countPartsForNames($connection, [$failureName]) === 0,
        );
    }

    /** @param array<string,mixed> $fixture @return array<string,mixed> */
    private static function manualData(array $fixture, string $name, string $date, string $start, string $end, int $local): array
    {
        return [
            'nome_jogo' => $name,
            'data_jogo' => $date,
            'inicio_jogo' => $start,
            'termino_jogo' => $end,
            'modalidades_id_modalidade' => (int) $fixture['modality_id'],
            'locais_id_local' => $local,
            'equipes' => [(int) $fixture['team_ids'][0], (int) $fixture['team_ids'][1]],
        ];
    }

    /** @param list<int> $teams @return list<int|string> */
    private static function createArgs(string $name, string $date, int $local, int $modality, array $teams): array
    {
        return [$name, $date, '08:00:00', '08:30:00', $modality, $local, (int) $teams[0], (int) $teams[1]];
    }

    /** @param array<string,mixed> $jogos @return array<string,mixed> */
    private static function createFixture(mysqli $connection, int $edition, int $modality, array $jogos): array
    {
        $token = bin2hex(random_bytes(4));
        $prefix = 'N12' . $token;
        $localIds = [];
        $localStatement = $connection->prepare("INSERT INTO locais (nome_local, disponivel_local, carga_local, status_local, interclasses_id_interclasse) VALUES (?, '1', 6, '1', ?)");
        foreach (['A', 'B'] as $suffix) {
            $name = $prefix . ' ' . $suffix;
            $localStatement->bind_param('si', $name, $edition);
            $localStatement->execute();
            $localIds[] = (int) $connection->insert_id;
        }
        $localStatement->close();

        $adminId = (int) $connection->query("SELECT id_usuario FROM usuarios WHERE nivel_usuario = '0' ORDER BY id_usuario LIMIT 1")->fetch_column();
        $teamIds = array_values(array_map('intval', (array) ($jogos['equipes_ids'] ?? [])));
        if ($adminId <= 0 || count($teamIds) < 2) {
            throw new RuntimeException('Fixture de agendamento concorrente sem administrador ou equipes ativas.');
        }
        $base = new \DateTimeImmutable('today', new \DateTimeZone('America/Sao_Paulo'));

        return [
            'edition_id' => $edition,
            'modality_id' => $modality,
            'admin_id' => $adminId,
            'team_ids' => array_slice($teamIds, 0, 2),
            'local_id' => $localIds[0],
            'other_local_id' => $localIds[1],
            'local_ids' => $localIds,
            'prefix' => $prefix,
            'game_ids' => [],
            'game_names' => [],
            'idempotencies' => [],
            'date_manual' => $base->modify('+300 days')->format('Y-m-d'),
            'date_edit' => $base->modify('+301 days')->format('Y-m-d'),
            'date_batch' => $base->modify('+302 days')->format('Y-m-d'),
            'date_scope' => $base->modify('+303 days')->format('Y-m-d'),
            'date_adjacent' => $base->modify('+304 days')->format('Y-m-d'),
            'date_other_day' => $base->modify('+305 days')->format('Y-m-d'),
            'date_invalid' => $base->modify('+306 days')->format('Y-m-d'),
            'date_rollback' => $base->modify('+307 days')->format('Y-m-d'),
        ];
    }

    private static function insertGame(mysqli $connection, string $name, ?string $date, ?string $start, ?string $end, int $modality, ?int $local): int
    {
        $statement = $connection->prepare("INSERT INTO jogos (nome_jogo, data_jogo, inicio_jogo, termino_jogo, status_jogo, modalidades_id_modalidade, locais_id_local) VALUES (?, ?, ?, ?, 'Agendado', ?, ?)");
        $statement->bind_param('ssssii', $name, $date, $start, $end, $modality, $local);
        $statement->execute();
        $id = (int) $connection->insert_id;
        $statement->close();
        return $id;
    }

    private static function lockGame(mysqli $connection, int $gameId): void
    {
        $statement = $connection->prepare('SELECT id_jogo FROM jogos WHERE id_jogo = ? FOR UPDATE');
        $statement->bind_param('i', $gameId);
        $statement->execute();
        if ($statement->get_result()->num_rows !== 1) {
            $statement->close();
            throw new RuntimeException('O jogo usado como barreira concorrente não existe.');
        }
        $statement->close();
    }

    /** @return list<array<string,mixed>> */
    private static function readNamedGames(mysqli $connection, array $names): array
    {
        $names = array_values($names);
        $placeholders = implode(', ', array_fill(0, count($names), '?'));
        $statement = $connection->prepare('SELECT id_jogo, nome_jogo, data_jogo, inicio_jogo, termino_jogo, locais_id_local FROM jogos WHERE nome_jogo IN (' . $placeholders . ') ORDER BY nome_jogo');
        $types = str_repeat('s', count($names));
        $statement->bind_param($types, ...$names);
        $statement->execute();
        $rows = $statement->get_result()->fetch_all(MYSQLI_ASSOC);
        $statement->close();
        return $rows;
    }

    private static function countGamesByNames(mysqli $connection, array $names): int
    {
        $names = array_values($names);
        $placeholders = implode(', ', array_fill(0, count($names), '?'));
        $statement = $connection->prepare('SELECT COUNT(*) FROM jogos WHERE nome_jogo IN (' . $placeholders . ')');
        $types = str_repeat('s', count($names));
        $statement->bind_param($types, ...$names);
        $statement->execute();
        $count = (int) $statement->get_result()->fetch_column();
        $statement->close();
        return $count;
    }

    private static function countPartsForNames(mysqli $connection, array $names): int
    {
        $names = array_values($names);
        $placeholders = implode(', ', array_fill(0, count($names), '?'));
        $statement = $connection->prepare('SELECT COUNT(*) FROM partidas p INNER JOIN jogos j ON j.id_jogo = p.jogos_id_jogo WHERE j.nome_jogo IN (' . $placeholders . ')');
        $types = str_repeat('s', count($names));
        $statement->bind_param($types, ...$names);
        $statement->execute();
        $count = (int) $statement->get_result()->fetch_column();
        $statement->close();
        return $count;
    }

    private static function countConflictingGames(mysqli $connection, string $date, int $local, string $start, string $end): int
    {
        $statement = $connection->prepare("SELECT COUNT(*) FROM jogos WHERE data_jogo = ? AND locais_id_local = ? AND status_jogo IN ('Agendado','Iniciado','Pausado') AND ? < ADDTIME(termino_jogo, '00:10:00') AND ADDTIME(?, '00:10:00') > inicio_jogo");
        $statement->bind_param('siss', $date, $local, $start, $end);
        $statement->execute();
        $count = (int) $statement->get_result()->fetch_column();
        $statement->close();
        return $count;
    }

    /** @return array<string,mixed> */
    private static function readBatchState(mysqli $connection, string $idempotency): array
    {
        $statement = $connection->prepare('SELECT ab.id_bloco, COUNT(ar.id_reserva) AS reservas, MAX(j.data_jogo) AS game_date FROM agenda_blocos ab LEFT JOIN agenda_reservas ar ON ar.id_bloco = ab.id_bloco LEFT JOIN jogos j ON j.id_jogo = ar.id_jogo WHERE ab.chave_idempotencia = ? GROUP BY ab.id_bloco');
        $statement->bind_param('s', $idempotency);
        $statement->execute();
        $row = $statement->get_result()->fetch_assoc() ?: [];
        $statement->close();
        return $row;
    }

    private static function differentModalityTeam(mysqli $connection, int $edition, int $modality): int
    {
        $statement = $connection->prepare("SELECT e.id_equipe FROM equipes e INNER JOIN modalidades m ON m.id_modalidade = e.modalidades_id_modalidade WHERE m.interclasses_id_interclasse = ? AND m.id_modalidade <> ? AND e.status_equipe = '1' ORDER BY e.id_equipe LIMIT 1");
        $statement->bind_param('ii', $edition, $modality);
        $statement->execute();
        $team = (int) $statement->get_result()->fetch_column();
        $statement->close();
        if ($team <= 0) {
            throw new RuntimeException('Não há equipe ativa de outra modalidade para testar rollback do jogo.');
        }
        return $team;
    }

    /** @param list<string> $names */
    private static function removeFixture(mysqli $connection, array $fixture): void
    {
        $gameIds = array_map('intval', $fixture['game_ids']);
        $prefixLike = (string) $fixture['prefix'] . '%';
        $statement = $connection->prepare('SELECT id_jogo FROM jogos WHERE nome_jogo LIKE ?');
        $statement->bind_param('s', $prefixLike);
        $statement->execute();
        foreach ($statement->get_result()->fetch_all(MYSQLI_ASSOC) as $row) {
            $gameIds[] = (int) $row['id_jogo'];
        }
        $statement->close();
        $gameIds = array_values(array_unique(array_filter($gameIds, static fn (int $id): bool => $id > 0)));

        foreach ($fixture['idempotencies'] as $idempotency) {
            $find = $connection->prepare('SELECT id_bloco FROM agenda_blocos WHERE chave_idempotencia = ?');
            $find->bind_param('s', $idempotency);
            $find->execute();
            $blockIds = array_map(static fn (array $row): int => (int) $row['id_bloco'], $find->get_result()->fetch_all(MYSQLI_ASSOC));
            $find->close();
            foreach ($blockIds as $blockId) {
                foreach (['agenda_reservas_historico', 'agenda_reservas', 'agenda_blocos'] as $table) {
                    $delete = $connection->prepare('DELETE FROM ' . $table . ' WHERE id_bloco = ?');
                    $delete->bind_param('i', $blockId);
                    $delete->execute();
                    $delete->close();
                }
            }
        }
        foreach ($gameIds as $gameId) {
            foreach (['partidas', 'jogos'] as $table) {
                $column = $table === 'partidas' ? 'jogos_id_jogo' : 'id_jogo';
                $delete = $connection->prepare('DELETE FROM ' . $table . ' WHERE ' . $column . ' = ?');
                $delete->bind_param('i', $gameId);
                $delete->execute();
                $delete->close();
            }
        }
        foreach ($fixture['local_ids'] as $localId) {
            $delete = $connection->prepare('DELETE FROM locais WHERE id_local = ?');
            $delete->bind_param('i', $localId);
            $delete->execute();
            $delete->close();
        }
    }

    private static function createBarrier(string $name): string
    {
        $path = dirname(__DIR__, 2) . '/test-results/concurrency-n12-' . $name . '-' . bin2hex(random_bytes(6));
        if (!mkdir($path, 0777, true)) {
            throw new RuntimeException('Não foi possível criar a barreira ' . $name . ' da N12.');
        }
        return $path;
    }

    /** @param list<int|string> $arguments @return array{process:resource,pipes:array<int,resource>,thread_id:int,exit_code:int} */
    private static function startWorker(string $barrier, string $id, string $scenario, array $arguments): array
    {
        $command = [PHP_BINARY, '-d', 'display_startup_errors=0', dirname(__DIR__) . '/Support/ConcurrentScenarioWorker.php', $scenario, $barrier, $id, ...array_map('strval', $arguments)];
        $pipes = [];
        $process = proc_open($command, [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        if (!is_resource($process)) {
            throw new RuntimeException('Não foi possível iniciar worker concorrente de agendamento.');
        }
        fclose($pipes[0]);
        $worker = ['process' => $process, 'pipes' => $pipes, 'thread_id' => 0, 'exit_code' => -1];
        $readyFile = $barrier . DIRECTORY_SEPARATOR . 'ready-' . $id;
        self::waitForFile($readyFile, $worker, 'conexão independente ' . $id);
        $threadId = 0;
        $decodeDeadline = microtime(true) + 2.0;
        while ($threadId <= 0 && microtime(true) < $decodeDeadline) {
            clearstatcache(true, $readyFile);
            $ready = json_decode((string) @file_get_contents($readyFile), true);
            $threadId = is_array($ready) ? (int) ($ready['db_thread'] ?? 0) : 0;
            if ($threadId <= 0) {
                usleep(10000);
            }
        }
        if ($threadId <= 0) {
            self::stopWorker($worker);
            throw new RuntimeException('Worker de agendamento não informou a conexão ao banco.');
        }
        $worker['thread_id'] = $threadId;
        return $worker;
    }

    /** @param array{process:resource,pipes:array<int,resource>,thread_id:int,exit_code:int} $worker */
    private static function waitForFile(string $path, array $worker, string $description): void
    {
        $deadline = microtime(true) + 8.0;
        while (microtime(true) < $deadline) {
            clearstatcache(true, $path);
            if (is_file($path) && (int) @filesize($path) > 0) {
                return;
            }
            if (!proc_get_status($worker['process'])['running']) {
                clearstatcache(true, $path);
                if (is_file($path) && (int) @filesize($path) > 0) {
                    return;
                }
                throw new RuntimeException('Worker encerrou antes da barreira: ' . $description . '.');
            }
            usleep(10000);
        }
        clearstatcache(true, $path);
        if (!is_file($path) || (int) @filesize($path) <= 0) {
            throw new RuntimeException('Worker não sinalizou: ' . $description . '.');
        }
    }

    private static function releaseStart(string $barrier): void
    {
        if (@file_put_contents($barrier . DIRECTORY_SEPARATOR . 'release', 'go', LOCK_EX) === false) {
            throw new RuntimeException('Não foi possível iniciar workers de agendamento.');
        }
    }

    private static function continueWorkers(string $barrier): void
    {
        if (@file_put_contents($barrier . DIRECTORY_SEPARATOR . 'continue', 'go', LOCK_EX) === false) {
            throw new RuntimeException('Não foi possível retomar workers de agendamento.');
        }
    }

    /** @param array{process:resource,pipes:array<int,resource>,thread_id:int,exit_code:int} $worker */
    private static function waitForGameUpdateLock(mysqli $connection, array $worker, string $description): void
    {
        $deadline = microtime(true) + 8.0;
        do {
            if (!proc_get_status($worker['process'])['running']) {
                throw new RuntimeException('Worker encerrou antes de alcançar a gravação de ' . $description . '.');
            }
            $info = self::processInfo($connection, $worker['thread_id']);
            if (str_contains($info, 'UPDATE jogos SET')
                || (str_contains($info, 'jogos') && str_contains(strtoupper($info), 'FOR UPDATE') && str_contains($info, 'id_jogo'))) {
                return;
            }
            usleep(10000);
        } while (microtime(true) < $deadline);
        throw new RuntimeException('Worker não alcançou a gravação bloqueada de ' . $description . '; SQL observado: ' . self::processInfo($connection, $worker['thread_id']));
    }

    /** @param array{process:resource,pipes:array<int,resource>,thread_id:int,exit_code:int} $worker @return 'completed'|'local-lock' */
    private static function waitForManualBoundary(mysqli $connection, array &$worker): string
    {
        $deadline = microtime(true) + 8.0;
        do {
            $status = proc_get_status($worker['process']);
            $worker['exit_code'] = ProcessExitCode::observe($worker['exit_code'], $status);
            if (!$status['running']) {
                return 'completed';
            }
            $info = strtoupper(self::processInfo($connection, $worker['thread_id']));
            if (str_contains($info, 'FROM LOCAIS') && str_contains($info, 'FOR UPDATE')) {
                return 'local-lock';
            }
            usleep(10000);
        } while (microtime(true) < $deadline);
        throw new RuntimeException('Worker manual não terminou nem aguardou a trava do local; SQL observado: ' . self::processInfo($connection, $worker['thread_id']));
    }

    /** @param array{process:resource,pipes:array<int,resource>,thread_id:int,exit_code:int} $worker */
    private static function waitForCompletion(array &$worker, float $timeout): bool
    {
        $deadline = microtime(true) + $timeout;
        do {
            $status = proc_get_status($worker['process']);
            $worker['exit_code'] = ProcessExitCode::observe($worker['exit_code'], $status);
            if (!$status['running']) {
                return true;
            }
            usleep(10000);
        } while (microtime(true) < $deadline);
        return false;
    }

    private static function processInfo(mysqli $connection, int $threadId): string
    {
        $statement = $connection->prepare('SELECT COALESCE(INFO, \'\') FROM information_schema.PROCESSLIST WHERE ID = ?');
        $statement->bind_param('i', $threadId);
        $statement->execute();
        $info = (string) ($statement->get_result()->fetch_column() ?: '');
        $statement->close();
        return $info;
    }

    /** @param array{process:resource,pipes:array<int,resource>,thread_id:int,exit_code:int} $worker @return array<string,mixed> */
    private static function collectWorker(array $worker): array
    {
        $observedExitCode = $worker['exit_code'];
        $deadline = microtime(true) + 12.0;
        do {
            $status = proc_get_status($worker['process']);
            $observedExitCode = ProcessExitCode::observe($observedExitCode, $status);
            if (!$status['running']) {
                break;
            }
            usleep(10000);
        } while (microtime(true) < $deadline);
        if ($status['running']) {
            self::stopWorker($worker);
            throw new RuntimeException('Worker concorrente de agendamento excedeu o prazo.');
        }
        $output = stream_get_contents($worker['pipes'][1]);
        $errors = stream_get_contents($worker['pipes'][2]);
        fclose($worker['pipes'][1]);
        fclose($worker['pipes'][2]);
        $closeExitCode = proc_close($worker['process']);
        if (ProcessExitCode::resolve($closeExitCode, $observedExitCode) !== 0) {
            throw new RuntimeException('Falha no worker concorrente de agendamento: ' . $errors);
        }
        $decoded = json_decode($output, true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($decoded)) {
            throw new RuntimeException('Worker de agendamento retornou resposta inválida.');
        }
        return $decoded;
    }

    /** @param list<array{process:resource,pipes:array<int,resource>,thread_id:int,exit_code:int}|null> $workers */
    private static function stopWorkers(array $workers): void
    {
        foreach ($workers as $worker) {
            if ($worker !== null) {
                self::stopWorker($worker);
            }
        }
    }

    /** @param array{process:resource,pipes:array<int,resource>,thread_id:int,exit_code:int} $worker */
    private static function stopWorker(array $worker): void
    {
        if (is_resource($worker['process']) && proc_get_status($worker['process'])['running']) {
            proc_terminate($worker['process']);
        }
        foreach ([1, 2] as $index) {
            if (isset($worker['pipes'][$index]) && is_resource($worker['pipes'][$index])) {
                fclose($worker['pipes'][$index]);
            }
        }
        if (is_resource($worker['process'])) {
            proc_close($worker['process']);
        }
    }

    private static function removeBarrier(string $barrier): void
    {
        foreach (glob($barrier . DIRECTORY_SEPARATOR . '*') ?: [] as $path) {
            if (is_file($path)) {
                @unlink($path);
            }
        }
        @rmdir($barrier);
    }
}
