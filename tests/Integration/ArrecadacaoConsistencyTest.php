<?php

declare(strict_types=1);

namespace SGITests\Integration;

use SGITests\Support\Assertions;
use SGITests\Support\TestClient;
use SGITests\Support\TestDatabase;

final class ArrecadacaoConsistencyTest
{
    public static function run(int $interclasseId, int $turmaId): void
    {
        echo "\n  \033[1;34m[Suite 2.2: Registro e estorno consistente da arrecadação]\033[0m\n";
        $admin = new TestClient();
        $admin->login('admin', '123');
        $database = getenv('SGI_TEST_DB_NAME') ?: 'sgi_test';
        TestDatabase::assertSafeDatabaseName($database);
        $connection = TestDatabase::connect($database);

        try {
            self::setEditionValue($connection, $interclasseId, 2);
            self::setTurma($connection, $turmaId, '0', 30);
            $historyId = self::add($admin, $interclasseId, $turmaId, 10);
            self::setEditionValue($connection, $interclasseId, 3);

            $removed = $admin->deleteJson('api/v1/arrecadacao', [
                'id_historico' => $historyId,
                'id_interclasse' => $interclasseId,
            ]);
            Assertions::assertJsonSuccess('Estorno usa o valor atual sem apagar pontos esportivos', $removed);
            $row = self::turma($connection, $turmaId);
            Assertions::assert('Estorno reverte Q10 e bruto 60 para Q0 e bruto esportivo 30', $row['quantidade'] === '0.00' && $row['pontos'] === 30, json_encode($row));

            $again = $admin->deleteJson('api/v1/arrecadacao', [
                'id_historico' => $historyId,
                'id_interclasse' => $interclasseId,
            ]);
            Assertions::assertStatus('Segundo estorno preserva a resposta contratada', $again, 200);
            $afterAgain = self::turma($connection, $turmaId);
            Assertions::assert('Segundo estorno não altera quantidade nem pontuação', $afterAgain === $row);

            self::setEditionValue($connection, $interclasseId, 2);
            self::setTurma($connection, $turmaId, '0', 30);
            $mutationId = 'arrec-consistency-' . bin2hex(random_bytes(6));
            $payload = [
                'id_interclasse' => $interclasseId,
                'arrecadacoes' => [['id_turma' => $turmaId, 'quantidade' => 10]],
            ];
            $historyBeforeReplay = self::historyCountForClass($connection, $interclasseId, $turmaId);
            $firstCredit = $admin->postJson('api/v1/arrecadacao', $payload, ['X-SGI-Mutation-Id' => $mutationId]);
            Assertions::assertJsonSuccess('Crédito com identidade de mutação é aceito', $firstCredit);
            $creditAfterFirst = self::turma($connection, $turmaId);
            Assertions::assert('Primeiro crédito altera quantidade e pontuação uma vez', $creditAfterFirst['quantidade'] === '10.00' && $creditAfterFirst['pontos'] === 50);

            $replayedCredit = $admin->postJson('api/v1/arrecadacao', $payload, ['X-SGI-Mutation-Id' => $mutationId]);
            Assertions::assertStatus('Replay de crédito devolve a resposta original', $replayedCredit, (int) $firstCredit['code']);
            Assertions::assert('Replay de crédito devolve o mesmo corpo confirmado', $replayedCredit['json'] === $firstCredit['json']);
            Assertions::assert('Replay de crédito não duplica histórico nem pontos', self::turma($connection, $turmaId) === $creditAfterFirst && self::historyCountForClass($connection, $interclasseId, $turmaId) === $historyBeforeReplay + 1);

            $changedCredit = $payload;
            $changedCredit['arrecadacoes'][0]['quantidade'] = 11;
            $conflictingCredit = $admin->postJson('api/v1/arrecadacao', $changedCredit, ['X-SGI-Mutation-Id' => $mutationId]);
            Assertions::assertStatus('A mesma identidade não pode representar outro crédito', $conflictingCredit, 409);
            Assertions::assert('Conflito de fingerprint não altera quantidade, pontos ou histórico', self::turma($connection, $turmaId) === $creditAfterFirst && self::historyCountForClass($connection, $interclasseId, $turmaId) === $historyBeforeReplay + 1);

            $creditHistoryId = self::latestHistoryId($connection, $interclasseId, $turmaId);
            $deleteMutationId = 'arrec-delete-' . bin2hex(random_bytes(6));
            $deletePayload = ['id_historico' => $creditHistoryId, 'id_interclasse' => $interclasseId];
            $firstCreditReversal = $admin->deleteJson('api/v1/arrecadacao', $deletePayload, ['X-SGI-Mutation-Id' => $deleteMutationId]);
            Assertions::assertJsonSuccess('Estorno com identidade de mutação é aceito', $firstCreditReversal);
            $replayedCreditReversal = $admin->deleteJson('api/v1/arrecadacao', $deletePayload, ['X-SGI-Mutation-Id' => $deleteMutationId]);
            Assertions::assertStatus('Replay de estorno devolve a resposta original', $replayedCreditReversal, (int) $firstCreditReversal['code']);
            Assertions::assert('Replay de estorno não aplica o desconto duas vezes', self::turma($connection, $turmaId) === ['quantidade' => '0.00', 'pontos' => 30]);

            self::setEditionValue($connection, $interclasseId, 2);
            self::setTurma($connection, $turmaId, '0', 30);
            $batch = $admin->postJson('api/v1/arrecadacao', [
                'id_interclasse' => $interclasseId,
                'arrecadacoes' => [
                    ['id_turma' => $turmaId, 'quantidade' => 10],
                    ['id_turma' => 999999, 'quantidade' => 1],
                ],
            ]);
            Assertions::assertStatus('Lote inválido falha sem confirmar itens anteriores', $batch, 500);
            $afterBatch = self::turma($connection, $turmaId);
            Assertions::assert('Lote inválido reverte quantidade, pontos e histórico', $afterBatch['quantidade'] === '0.00' && $afterBatch['pontos'] === 30 && self::activeHistoryCount($connection, $interclasseId) === 0);

            self::setEditionValue($connection, $interclasseId, 1);
            self::setTurma($connection, $turmaId, '0', 17);
            $fractionA = self::add($admin, $interclasseId, $turmaId, 1.24);
            $fractionB = self::add($admin, $interclasseId, $turmaId, 0.01);
            $fractionRow = self::turma($connection, $turmaId);
            Assertions::assert('Delta zero registra a fração sem alterar pontos duas vezes', $fractionRow['quantidade'] === '1.25' && $fractionRow['pontos'] === 18 && self::historyPoints($connection, $fractionB) === 0);
            $admin->deleteJson('api/v1/arrecadacao', ['id_historico' => $fractionB, 'id_interclasse' => $interclasseId]);
            $admin->deleteJson('api/v1/arrecadacao', ['id_historico' => $fractionA, 'id_interclasse' => $interclasseId]);
            $fractionRestored = self::turma($connection, $turmaId);
            Assertions::assert('Estorno fracionário restaura o bruto original', $fractionRestored['quantidade'] === '0.00' && $fractionRestored['pontos'] === 17);

            self::setEditionValue($connection, $interclasseId, 2);
            self::setTurma($connection, $turmaId, '0', 30);
            $concurrentHistory = self::add($admin, $interclasseId, $turmaId, 10);
            self::assertConcurrentRemoval($connection, $interclasseId, $turmaId, $concurrentHistory);
        } finally {
            $connection->close();
        }
    }

    private static function add(TestClient $admin, int $editionId, int $classId, float $quantity): int
    {
        $response = $admin->postJson('api/v1/arrecadacao', [
            'id_interclasse' => $editionId,
            'arrecadacoes' => [['id_turma' => $classId, 'quantidade' => $quantity]],
        ]);
        Assertions::assertJsonSuccess('Registro de arrecadação aceito', $response);
        $connection = TestDatabase::connect(getenv('SGI_TEST_DB_NAME') ?: 'sgi_test');
        $statement = $connection->prepare('SELECT id_historico FROM historico_arrecadacoes WHERE id_interclasse = ? AND id_turma = ? ORDER BY id_historico DESC LIMIT 1');
        $statement->bind_param('ii', $editionId, $classId);
        $statement->execute();
        $id = (int) $statement->get_result()->fetch_column();
        $statement->close();
        $connection->close();
        return $id;
    }

    private static function assertConcurrentRemoval(\mysqli $connection, int $editionId, int $classId, int $historyId): void
    {
        $connection->begin_transaction();
        $editionLock = $connection->prepare('SELECT id_interclasse FROM interclasses WHERE id_interclasse = ? FOR UPDATE');
        $editionLock->bind_param('i', $editionId);
        $editionLock->execute();
        $editionLock->close();
        $classLock = $connection->prepare('SELECT id_turma FROM turmas WHERE id_turma = ? AND interclasses_id_interclasse = ? FOR UPDATE');
        $classLock->bind_param('ii', $classId, $editionId);
        $classLock->execute();
        $classLock->close();

        $processes = [];
        try {
            for ($index = 0; $index < 2; $index++) {
                $pipes = [];
                $process = proc_open([
                    PHP_BINARY,
                    '-d',
                    'display_startup_errors=0',
                    __DIR__ . '/../Support/ConcurrentScenarioWorker.php',
                    (string) $historyId,
                    (string) $editionId,
                ], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
                if (!is_resource($process)) {
                    throw new \RuntimeException('Não foi possível iniciar processo concorrente de arrecadação.');
                }
                fclose($pipes[0]);
                $processes[] = [$process, $pipes];
            }

            $deadline = microtime(true) + 5.0;
            $waiters = 0;
            $states = [];
            while ($waiters < 2 && microtime(true) < $deadline) {
                $lockWaits = (int) $connection->query("SELECT COUNT(*) FROM information_schema.INNODB_TRX WHERE trx_state = 'LOCK WAIT'")->fetch_column();
                $trxWaits = (int) $connection->query("SELECT COUNT(*) FROM information_schema.INNODB_TRX WHERE trx_state = 'LOCK WAIT'")->fetch_column();
                $processList = $connection->query('SELECT STATE, INFO FROM information_schema.PROCESSLIST WHERE ID <> CONNECTION_ID() AND DB = DATABASE()');
                $states = [];
                while ($processList !== false && ($process = $processList->fetch_assoc()) !== null) {
                    $states[] = ($process['STATE'] ?? '') . '|' . ($process['INFO'] ?? '');
                }
                $processWaits = count(array_filter($states, static fn (string $state): bool => str_contains(strtolower($state), 'lock')));
                $lockQueries = count(array_filter($states, static fn (string $state): bool => str_contains($state, 'FOR UPDATE') && str_contains($state, 'interclasses')));
                $waiters = max($lockWaits, $trxWaits, $processWaits, $lockQueries);
                if ($waiters < 2) {
                    usleep(20000);
                }
            }
            Assertions::assert('Dois workers alcançam a espera de trava antes da liberação', $waiters >= 2, 'Esperas observadas: ' . $waiters . '; estados: ' . json_encode($states));
            $connection->commit();

            $results = [];
            foreach ($processes as [$process, $pipes]) {
                $output = stream_get_contents($pipes[1]);
                $errors = stream_get_contents($pipes[2]);
                fclose($pipes[1]);
                fclose($pipes[2]);
                if (proc_close($process) !== 0) {
                    throw new \RuntimeException('Falha no worker concorrente: ' . $errors);
                }
                $results[] = json_decode($output, true, 512, JSON_THROW_ON_ERROR);
            }
            sort($results);
            Assertions::assert('Concorrência realiza um estorno e uma resposta já removida', $results === [['result' => 'already_removed'], ['result' => 'removed']], json_encode($results));
            $row = self::turma($connection, $classId);
            Assertions::assert('Concorrência desconta quantidade e pontos somente uma vez', $row['quantidade'] === '0.00' && $row['pontos'] === 30, json_encode($row));
        } finally {
            if ($processes !== [] && ($connection->thread_id ?? 0) > 0) {
                foreach ($processes as [$process, $pipes]) {
                    if (is_resource($process)) {
                        $status = proc_get_status($process);
                        if ($status['running']) {
                            proc_terminate($process);
                        }
                    }
                    foreach ([1, 2] as $pipeIndex) {
                        if (isset($pipes[$pipeIndex]) && is_resource($pipes[$pipeIndex])) {
                            fclose($pipes[$pipeIndex]);
                        }
                    }
                    if (is_resource($process)) {
                        proc_close($process);
                    }
                }
            }
            $connection->rollback();
        }
    }

    private static function setEditionValue(\mysqli $connection, int $editionId, int $value): void
    {
        $statement = $connection->prepare('UPDATE interclasses SET valor_item_arrecadacao = ? WHERE id_interclasse = ?');
        $statement->bind_param('ii', $value, $editionId);
        $statement->execute();
        $statement->close();
    }

    private static function setTurma(\mysqli $connection, int $classId, string $quantity, int $points): void
    {
        $statement = $connection->prepare('UPDATE turmas SET qtd_itens_arrecadados = ?, pontuacao_turma = ? WHERE id_turma = ?');
        $statement->bind_param('sii', $quantity, $points, $classId);
        $statement->execute();
        $statement->close();
    }

    /** @return array{quantidade: string, pontos: int} */
    private static function turma(\mysqli $connection, int $classId): array
    {
        $statement = $connection->prepare('SELECT qtd_itens_arrecadados, pontuacao_turma FROM turmas WHERE id_turma = ?');
        $statement->bind_param('i', $classId);
        $statement->execute();
        $row = $statement->get_result()->fetch_assoc() ?: [];
        $statement->close();
        return ['quantidade' => number_format((float) ($row['qtd_itens_arrecadados'] ?? 0), 2, '.', ''), 'pontos' => (int) ($row['pontuacao_turma'] ?? 0)];
    }

    private static function activeHistoryCount(\mysqli $connection, int $editionId): int
    {
        $statement = $connection->prepare("SELECT COUNT(*) FROM historico_arrecadacoes WHERE id_interclasse = ? AND status_historico = '1'");
        $statement->bind_param('i', $editionId);
        $statement->execute();
        $count = (int) $statement->get_result()->fetch_column();
        $statement->close();
        return $count;
    }

    private static function historyCountForClass(\mysqli $connection, int $editionId, int $classId): int
    {
        $statement = $connection->prepare('SELECT COUNT(*) FROM historico_arrecadacoes WHERE id_interclasse = ? AND id_turma = ?');
        $statement->bind_param('ii', $editionId, $classId);
        $statement->execute();
        $count = (int) $statement->get_result()->fetch_column();
        $statement->close();
        return $count;
    }

    private static function latestHistoryId(\mysqli $connection, int $editionId, int $classId): int
    {
        $statement = $connection->prepare('SELECT id_historico FROM historico_arrecadacoes WHERE id_interclasse = ? AND id_turma = ? ORDER BY id_historico DESC LIMIT 1');
        $statement->bind_param('ii', $editionId, $classId);
        $statement->execute();
        $id = (int) $statement->get_result()->fetch_column();
        $statement->close();
        return $id;
    }

    private static function historyPoints(\mysqli $connection, int $historyId): int
    {
        $statement = $connection->prepare('SELECT pontos_adicionados FROM historico_arrecadacoes WHERE id_historico = ?');
        $statement->bind_param('i', $historyId);
        $statement->execute();
        $points = (int) $statement->get_result()->fetch_column();
        $statement->close();
        return $points;
    }
}
