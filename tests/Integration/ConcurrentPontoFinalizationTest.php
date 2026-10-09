<?php

declare(strict_types=1);

namespace SGITests\Integration;

use App\Modules\Competicoes\Infrastructure\MysqliPartidaGateway;
use mysqli;
use RuntimeException;
use SGITests\Support\Assertions;
use SGITests\Support\ProcessExitCode;
use SGITests\Support\TestDatabase;
use Throwable;

final class ConcurrentPontoFinalizationTest
{
    public static function run(int $editionId, int $classId): void
    {
        echo "\n  \033[1;34m[Suite: Concorrência entre anulação e finalização]\033[0m\n";
        $database = getenv('SGI_TEST_DB_NAME') ?: 'sgi_test';
        TestDatabase::assertSafeDatabaseName($database);
        $connection = TestDatabase::connect($database);
        $fixture = self::createFixture($connection, $editionId, $classId);
        $additionalFixtures = [];

        try {
            $race = self::runRace($fixture);
            Assertions::assert(
                'Anulação leu o jogo em andamento e parou na barreira antes da gravação',
                ($race['validated']['status_jogo'] ?? '') === 'Iniciado',
                json_encode($race['validated'], JSON_UNESCAPED_UNICODE),
            );
            Assertions::assert(
                'Finalização concorrente confirma o placar vinculado enquanto a anulação está pausada',
                ($race['finalize_result']['result'] ?? '') === 'accepted',
                json_encode($race['finalize_result'], JSON_UNESCAPED_UNICODE),
            );
            Assertions::assert(
                'Anulação revalida o estado depois da finalização concorrente',
                ($race['annul_result']['result'] ?? '') === 'rejected',
                json_encode([
                    'annul' => $race['annul_result'],
                    'finalize' => $race['finalize_result'],
                ], JSON_UNESCAPED_UNICODE),
            );

            $state = self::readState($connection, $fixture);
            Assertions::assert(
                'Jogo concluído preserva o placar e o ponto que foi validado na finalização',
                $state === [
                    'status_jogo' => 'Concluido',
                    'placar_1' => 1,
                    'placar_2' => 0,
                    'status_artilheiro' => 'ativo',
                    'conta_no_placar' => 1,
                ],
                json_encode($state, JSON_UNESCAPED_UNICODE),
            );

            $staleSnapshotFixture = self::createAdditionalGame($connection, $fixture, 2, 'snapshot');
            $additionalFixtures[] = $staleSnapshotFixture;
            $snapshotRace = self::runSnapshotRace($fixture, $staleSnapshotFixture);
            Assertions::assert(
                'Finalização com snapshot anterior valida o placar e os pontos após a anulação confirmada',
                ($snapshotRace['annul_result']['result'] ?? '') === 'accepted'
                    && ($snapshotRace['finalize_result']['result'] ?? '') === 'accepted',
                json_encode($snapshotRace, JSON_UNESCAPED_UNICODE),
            );
            $snapshotState = self::readGameState($connection, $staleSnapshotFixture);
            Assertions::assert(
                'Finalização serializada preserva os dois estados possíveis do placar vinculado',
                $snapshotState === [
                    'status_jogo' => 'Concluido',
                    'placar_1' => 1,
                    'placar_2' => 0,
                    'pontos_ativos' => 1,
                    'pontos_anulados' => 1,
                ],
                json_encode($snapshotState, JSON_UNESCAPED_UNICODE),
            );

            $samePlayFixture = self::createAdditionalGame($connection, $fixture, 1, 'same-play');
            $additionalFixtures[] = $samePlayFixture;
            $samePlayRace = self::runParallelAnnulments(
                $samePlayFixture,
                [$samePlayFixture['point_ids'][0], $samePlayFixture['point_ids'][0]],
            );
            Assertions::assert(
                'Duas anulações concorrentes da mesma jogada retornam sucesso idempotente',
                count(array_filter($samePlayRace, static fn (array $result): bool => ($result['result'] ?? '') === 'accepted')) === 2,
                json_encode($samePlayRace, JSON_UNESCAPED_UNICODE),
            );
            $samePlayState = self::readGameState($connection, $samePlayFixture);
            Assertions::assert(
                'Duas anulações da mesma jogada descontam o placar uma única vez',
                $samePlayState === [
                    'status_jogo' => 'Iniciado',
                    'placar_1' => 0,
                    'placar_2' => 0,
                    'pontos_ativos' => 0,
                    'pontos_anulados' => 1,
                ],
                json_encode($samePlayState, JSON_UNESCAPED_UNICODE),
            );

            $distinctPlaysFixture = self::createAdditionalGame($connection, $fixture, 2, 'distinct-plays');
            $additionalFixtures[] = $distinctPlaysFixture;
            $distinctPlaysRace = self::runParallelAnnulments($distinctPlaysFixture, $distinctPlaysFixture['point_ids']);
            Assertions::assert(
                'Duas anulações concorrentes de jogadas distintas são confirmadas',
                count(array_filter($distinctPlaysRace, static fn (array $result): bool => ($result['result'] ?? '') === 'accepted')) === 2,
                json_encode($distinctPlaysRace, JSON_UNESCAPED_UNICODE),
            );
            $distinctPlaysState = self::readGameState($connection, $distinctPlaysFixture);
            Assertions::assert(
                'Anulações de jogadas distintas retiram exatamente dois pontos e preservam os eventos',
                $distinctPlaysState === [
                    'status_jogo' => 'Iniciado',
                    'placar_1' => 0,
                    'placar_2' => 0,
                    'pontos_ativos' => 0,
                    'pontos_anulados' => 2,
                ],
                json_encode($distinctPlaysState, JSON_UNESCAPED_UNICODE),
            );
        } finally {
            foreach ($additionalFixtures as $additionalFixture) {
                self::removeAdditionalGame($connection, $additionalFixture);
            }
            self::removeFixture($connection, $fixture);
            $connection->close();
        }
    }

    /** @param array<string, int> $base @param array<string, int|string> $game @return array<string, mixed> */
    private static function runSnapshotRace(array $base, array $game): array
    {
        $barrier = dirname(__DIR__, 2) . '/test-results/concurrency-n11-snapshot-' . bin2hex(random_bytes(8));
        $annulBarrier = $barrier . DIRECTORY_SEPARATOR . 'annul';
        if (!mkdir($barrier, 0777, true) || !mkdir($annulBarrier)) {
            self::removeBarrier($barrier);
            throw new RuntimeException('Não foi possível criar as barreiras do snapshot de N11.');
        }

        $workers = [];
        try {
            $finalizer = self::startWorker(
                $barrier,
                'finalizador-snapshot',
                'resultado-finalizar-snapshot',
                [$game['game_id'], $base['modality_id'], $base['team_1_id'], $base['team_2_id'], $barrier],
            );
            $workers[] = $finalizer;
            self::releaseWorkers($barrier);
            self::waitForFile($barrier . DIRECTORY_SEPARATOR . 'snapshot', $finalizer, 'snapshot da finalização');

            $annuller = self::startWorker($annulBarrier, 'anulador-snapshot', 'ponto-anular', [$game['point_ids'][0], 1]);
            $workers[] = $annuller;
            self::releaseWorkers($annulBarrier);
            self::waitForFile($annulBarrier . DIRECTORY_SEPARATOR . 'validated', $annuller, 'validação da anulação');
            if (@file_put_contents($annulBarrier . DIRECTORY_SEPARATOR . 'continue', 'go', LOCK_EX) === false) {
                throw new RuntimeException('Não foi possível liberar a anulação com snapshot aberto.');
            }
            $annulResult = self::collectWorker($annuller);
            $workers[1] = null;

            if (@file_put_contents($barrier . DIRECTORY_SEPARATOR . 'continue', 'go', LOCK_EX) === false) {
                throw new RuntimeException('Não foi possível liberar a finalização com snapshot anterior.');
            }
            $finalizeResult = self::collectWorker($finalizer);
            $workers[0] = null;
            return ['annul_result' => $annulResult, 'finalize_result' => $finalizeResult];
        } finally {
            foreach ($workers as $worker) {
                if (is_array($worker)) {
                    self::stopWorker($worker);
                }
            }
            self::removeBarrier($barrier);
        }
    }

    /** @param array{game_id:int,partida_1_id:int,partida_2_id:int,point_ids:list<int>} $fixture @param list<int> $pointIds @return list<array<string,mixed>> */
    private static function runParallelAnnulments(array $fixture, array $pointIds): array
    {
        $barrier = dirname(__DIR__, 2) . '/test-results/concurrency-n11-annulments-' . bin2hex(random_bytes(8));
        if (!mkdir($barrier, 0777, true)) {
            throw new RuntimeException('Não foi possível criar a barreira de anulações concorrentes de N11.');
        }

        $workers = [];
        $barriers = [];
        try {
            foreach ($pointIds as $index => $pointId) {
                $workerBarrier = $barrier . DIRECTORY_SEPARATOR . 'worker-' . $index;
                if (!mkdir($workerBarrier)) {
                    throw new RuntimeException('Não foi possível criar uma barreira de anulação de N11.');
                }
                $barriers[] = $workerBarrier;
                $workers[] = self::startWorker($workerBarrier, 'anulador-' . $index, 'ponto-anular', [$pointId, 1]);
            }
            foreach ($barriers as $workerBarrier) {
                self::releaseWorkers($workerBarrier);
            }
            foreach ($workers as $index => $worker) {
                self::waitForFile($barriers[$index] . DIRECTORY_SEPARATOR . 'validated', $worker, 'pré-validação concorrente');
            }
            foreach ($barriers as $workerBarrier) {
                if (@file_put_contents($workerBarrier . DIRECTORY_SEPARATOR . 'continue', 'go', LOCK_EX) === false) {
                    throw new RuntimeException('Não foi possível liberar todas as anulações concorrentes de N11.');
                }
            }

            $results = [];
            foreach ($workers as $index => $worker) {
                $results[] = self::collectWorker($worker);
                $workers[$index] = null;
            }
            return $results;
        } finally {
            foreach ($workers as $worker) {
                if (is_array($worker)) {
                    self::stopWorker($worker);
                }
            }
            self::removeBarrier($barrier);
        }
    }

    /** @param array{process:resource,pipes:array<int,resource>,thread_id:int} $worker */
    private static function waitForFile(string $path, array $worker, string $description): void
    {
        $deadline = microtime(true) + 5.0;
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
                throw new RuntimeException('Worker encerrou antes do marcador: ' . $description . '.');
            }
            usleep(10000);
        }
        clearstatcache(true, $path);
        if (!is_file($path) || (int) @filesize($path) <= 0) {
            throw new RuntimeException('Worker não produziu o marcador: ' . $description . '.');
        }
    }

    /** @param array<string, int> $fixture @return array<string, mixed> */
    private static function runRace(array $fixture): array
    {
        $barrier = dirname(__DIR__, 2) . '/test-results/concurrency-n11-' . bin2hex(random_bytes(8));
        if (!mkdir($barrier, 0777, true) && !is_dir($barrier)) {
            throw new RuntimeException('Não foi possível criar a barreira concorrente de N11.');
        }
        $annulBarrier = $barrier . DIRECTORY_SEPARATOR . 'annul';
        $finalizeBarrier = $barrier . DIRECTORY_SEPARATOR . 'finalize';
        if (!mkdir($annulBarrier) || !mkdir($finalizeBarrier)) {
            self::removeBarrier($barrier);
            throw new RuntimeException('Não foi possível criar as barreiras independentes de N11.');
        }

        $workers = [];
        try {
            $annuller = self::startWorker($annulBarrier, 'anulador', 'ponto-anular', [$fixture['point_id'], 1]);
            $workers[] = $annuller;
            self::releaseWorkers($annulBarrier);
            $validatedFile = $annulBarrier . DIRECTORY_SEPARATOR . 'validated';
            self::waitForFile($validatedFile, $annuller, 'validação da anulação');
            $validated = null;
            $decodeDeadline = microtime(true) + 2.0;
            while (!is_array($validated) && microtime(true) < $decodeDeadline) {
                clearstatcache(true, $validatedFile);
                $decoded = json_decode((string) @file_get_contents($validatedFile), true);
                if (is_array($decoded)) {
                    $validated = $decoded;
                    break;
                }
                usleep(10000);
            }
            if (!is_array($validated)) {
                throw new RuntimeException('A barreira de anulação informou estado inválido.');
            }

            $finalizer = self::startWorker(
                $finalizeBarrier,
                'finalizador',
                'resultado-finalizar',
                [
                    $fixture['game_id'],
                    $fixture['modality_id'],
                    $fixture['team_1_id'],
                    $fixture['team_2_id'],
                ],
            );
            $workers[] = $finalizer;
            self::releaseWorkers($finalizeBarrier);
            $finalizeResult = self::collectWorker($finalizer);
            $workers[1] = null;

            if (@file_put_contents($annulBarrier . DIRECTORY_SEPARATOR . 'continue', 'go', LOCK_EX) === false) {
                throw new RuntimeException('Não foi possível retomar a anulação após a finalização.');
            }
            $annulResult = self::collectWorker($annuller);
            $workers[0] = null;

            return [
                'validated' => $validated,
                'annul_result' => $annulResult,
                'finalize_result' => $finalizeResult,
            ];
        } finally {
            foreach ($workers as $worker) {
                if (!is_array($worker)) {
                    continue;
                }
                self::stopWorker($worker);
            }
            self::removeBarrier($barrier);
        }
    }

    /** @param list<int|string> $arguments @return array{process:resource,pipes:array<int,resource>,thread_id:int} */
    private static function startWorker(string $barrier, string $workerId, string $scenario, array $arguments): array
    {
        $command = [
            PHP_BINARY,
            '-d',
            'display_startup_errors=0',
            dirname(__DIR__) . '/Support/ConcurrentScenarioWorker.php',
            $scenario,
            $barrier,
            $workerId,
            ...array_map(static fn (int|string $value): string => (string) $value, $arguments),
        ];
        $pipes = [];
        $process = proc_open($command, [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        if (!is_resource($process)) {
            throw new RuntimeException('Não foi possível iniciar o worker ' . $workerId . ' de N11.');
        }
        fclose($pipes[0]);
        $worker = ['process' => $process, 'pipes' => $pipes, 'thread_id' => 0];

        $readyFile = $barrier . DIRECTORY_SEPARATOR . 'ready-' . $workerId;
        self::waitForFile($readyFile, $worker, 'conexão independente de ' . $workerId);
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
            throw new RuntimeException('O worker ' . $workerId . ' não informou o ID da conexão MySQL.');
        }
        $worker['thread_id'] = $threadId;
        return $worker;
    }

    private static function releaseWorkers(string $barrier): void
    {
        if (@file_put_contents($barrier . DIRECTORY_SEPARATOR . 'release', 'go', LOCK_EX) === false) {
            throw new RuntimeException('Não foi possível liberar os workers de N11.');
        }
    }

    /** @param array{process:resource,pipes:array<int,resource>,thread_id:int} $worker @return array<string,mixed> */
    private static function collectWorker(array $worker): array
    {
        $observedExitCode = -1;
        $deadline = microtime(true) + 10.0;
        do {
            $status = proc_get_status($worker['process']);
            $observedExitCode = ProcessExitCode::observe($observedExitCode, $status) ?? -1;
            if (!$status['running']) {
                break;
            }
            usleep(10000);
        } while (microtime(true) < $deadline);
        if ($status['running']) {
            proc_terminate($worker['process']);
            $stopDeadline = microtime(true) + 1.0;
            do {
                $status = proc_get_status($worker['process']);
                if (!$status['running']) {
                    break;
                }
                usleep(10000);
            } while (microtime(true) < $stopDeadline);
            stream_set_blocking($worker['pipes'][1], false);
            stream_set_blocking($worker['pipes'][2], false);
            $output = stream_get_contents($worker['pipes'][1]);
            $errors = stream_get_contents($worker['pipes'][2]);
            throw new RuntimeException(
                'Worker concorrente de N11 excedeu o prazo; stdout=' . $output . '; stderr=' . $errors,
            );
        }
        $output = stream_get_contents($worker['pipes'][1]);
        $errors = stream_get_contents($worker['pipes'][2]);
        fclose($worker['pipes'][1]);
        fclose($worker['pipes'][2]);
        $closeExitCode = proc_close($worker['process']);
        if (ProcessExitCode::resolve($closeExitCode, $observedExitCode) !== 0) {
            throw new RuntimeException('Falha no worker concorrente de N11: ' . $errors);
        }
        $result = json_decode($output, true, 512, JSON_THROW_ON_ERROR);
        if (!is_array($result)) {
            throw new RuntimeException('Resposta inválida do worker concorrente de N11.');
        }
        return $result;
    }

    /** @param array{process:resource,pipes:array<int,resource>,thread_id:int} $worker */
    private static function stopWorker(array $worker): void
    {
        if (is_resource($worker['process'])) {
            $status = proc_get_status($worker['process']);
            if ($status['running']) {
                proc_terminate($worker['process']);
            }
            foreach ([1, 2] as $index) {
                if (isset($worker['pipes'][$index]) && is_resource($worker['pipes'][$index])) {
                    fclose($worker['pipes'][$index]);
                }
            }
            proc_close($worker['process']);
        }
    }

    private static function removeBarrier(string $barrier): void
    {
        foreach (glob($barrier . DIRECTORY_SEPARATOR . '*') ?: [] as $path) {
            if (is_dir($path)) {
                foreach (glob($path . DIRECTORY_SEPARATOR . '*') ?: [] as $file) {
                    @unlink($file);
                }
                @rmdir($path);
            } else {
                @unlink($path);
            }
        }
        @rmdir($barrier);
    }

    /** @return array<string, int> */
    private static function createFixture(mysqli $connection, int $editionId, int $classId): array
    {
        $category = $connection->prepare(
            'SELECT categorias_id_categoria FROM turmas WHERE id_turma = ? AND interclasses_id_interclasse = ? LIMIT 1',
        );
        $category->bind_param('ii', $classId, $editionId);
        $category->execute();
        $categoryId = (int) $category->get_result()->fetch_column();
        $category->close();
        if ($categoryId <= 0) {
            throw new RuntimeException('A fixture de N11 não encontrou categoria para a turma sintética.');
        }

        $token = bin2hex(random_bytes(6));
        $connection->begin_transaction();
        try {
            $modality = $connection->prepare(
                "INSERT INTO modalidades (nome_modalidade, genero_modalidade, max_inscrito_modalidade, max_equipes, status_modalidade, tipos_modalidades_id_tipo_modalidade, categorias_id_categoria, interclasses_id_interclasse)
                 VALUES (?, 'MASC', 10, 2, '1', 1, ?, ?)",
            );
            $name = 'N11 Concorrência ' . $token;
            $modality->bind_param('sii', $name, $categoryId, $editionId);
            $modality->execute();
            $modalityId = (int) $connection->insert_id;
            $modality->close();

            $teamIds = [];
            $team = $connection->prepare(
                "INSERT INTO equipes (status_equipe, modalidades_id_modalidade, turmas_id_turma, nome_equipe)
                 VALUES ('1', ?, ?, ?)",
            );
            foreach (['A', 'B'] as $label) {
                $teamName = 'N11 ' . $label . ' ' . $token;
                $team->bind_param('iis', $modalityId, $classId, $teamName);
                $team->execute();
                $teamIds[] = (int) $connection->insert_id;
            }
            $team->close();

            $registration = 'n11_' . $token;
            $userName = 'N11 atleta ' . $token;
            $password = password_hash('n11-fixture', PASSWORD_DEFAULT);
            $user = $connection->prepare(
                "INSERT INTO usuarios (sigla_usuario, matricula_usuario, nome_usuario, senha_usuario, nivel_usuario, genero_usuario, data_nasc_usuario, foto_usuario, status_usuario, turmas_id_turma, interclasses_id_interclasse)
                 VALUES ('RM', ?, ?, ?, '3', 'MASC', '2010-01-01', '', '1', ?, ?)",
            );
            $user->bind_param('sssii', $registration, $userName, $password, $classId, $editionId);
            $user->execute();
            $userId = (int) $connection->insert_id;
            $user->close();

            $membership = $connection->prepare('INSERT INTO equipes_has_usuarios (equipes_id_equipe, usuarios_id_usuario) VALUES (?, ?)');
            $membership->bind_param('ii', $teamIds[0], $userId);
            $membership->execute();
            $membership->close();

            $gameName = 'N11:' . $token;
            $game = $connection->prepare(
                "INSERT INTO jogos (nome_jogo, data_jogo, inicio_jogo, termino_jogo, status_jogo, modalidades_id_modalidade, locais_id_local)
                 VALUES (?, CURDATE(), '08:00:00', NULL, 'Iniciado', ?, NULL)",
            );
            $game->bind_param('si', $gameName, $modalityId);
            $game->execute();
            $gameId = (int) $connection->insert_id;
            $game->close();

            $partidaIds = [];
            $partida = $connection->prepare(
                "INSERT INTO partidas (jogos_id_jogo, equipes_id_equipe, usuarios_id_usuario, resultado_partida, status_partida)
                 VALUES (?, ?, NULL, ?, '1')",
            );
            foreach ([1, 0] as $index => $score) {
                $partida->bind_param('iii', $gameId, $teamIds[$index], $score);
                $partida->execute();
                $partidaIds[] = (int) $connection->insert_id;
            }
            $partida->close();

            $key = 'n11-' . $token;
            $point = $connection->prepare(
                "INSERT INTO artilheiros (usuarios_id_usuario, jogos_id_jogo, partidas_id_partida, equipes_id_equipe, num_gol, conta_no_placar, status_artilheiro, chave_jogada, registrado_por)
                 VALUES (?, ?, ?, ?, 1, 1, 'ativo', ?, 1)",
            );
            $point->bind_param('iiiis', $userId, $gameId, $partidaIds[0], $teamIds[0], $key);
            $point->execute();
            $pointId = (int) $connection->insert_id;
            $point->close();

            $connection->commit();
        } catch (Throwable $exception) {
            $connection->rollback();
            throw $exception;
        }

        return [
            'modality_id' => $modalityId,
            'team_1_id' => $teamIds[0],
            'team_2_id' => $teamIds[1],
            'user_id' => $userId,
            'game_id' => $gameId,
            'partida_1_id' => $partidaIds[0],
            'partida_2_id' => $partidaIds[1],
            'point_id' => $pointId,
        ];
    }

    /** @param array<string, int> $base @return array{game_id:int,partida_1_id:int,partida_2_id:int,point_ids:list<int>} */
    private static function createAdditionalGame(mysqli $connection, array $base, int $firstTeamPoints, string $label): array
    {
        if ($firstTeamPoints <= 0) {
            throw new RuntimeException('O jogo adicional de N11 precisa de ao menos um ponto.');
        }
        $token = bin2hex(random_bytes(6));
        $connection->begin_transaction();
        try {
            $gameName = 'N11:' . $label . ':' . $token;
            $game = $connection->prepare(
                "INSERT INTO jogos (nome_jogo, data_jogo, inicio_jogo, termino_jogo, status_jogo, modalidades_id_modalidade, locais_id_local)
                 VALUES (?, CURDATE(), '08:00:00', NULL, 'Iniciado', ?, NULL)",
            );
            $game->bind_param('si', $gameName, $base['modality_id']);
            $game->execute();
            $gameId = (int) $connection->insert_id;
            $game->close();

            $partidaIds = [];
            $partida = $connection->prepare(
                "INSERT INTO partidas (jogos_id_jogo, equipes_id_equipe, usuarios_id_usuario, resultado_partida, status_partida)
                 VALUES (?, ?, NULL, ?, '1')",
            );
            foreach ([$firstTeamPoints, 0] as $index => $score) {
                $teamId = $index === 0 ? $base['team_1_id'] : $base['team_2_id'];
                $partida->bind_param('iii', $gameId, $teamId, $score);
                $partida->execute();
                $partidaIds[] = (int) $connection->insert_id;
            }
            $partida->close();

            $pointIds = [];
            $point = $connection->prepare(
                "INSERT INTO artilheiros (usuarios_id_usuario, jogos_id_jogo, partidas_id_partida, equipes_id_equipe, num_gol, conta_no_placar, status_artilheiro, chave_jogada, registrado_por)
                 VALUES (?, ?, ?, ?, 1, 1, 'ativo', ?, 1)",
            );
            for ($index = 0; $index < $firstTeamPoints; $index++) {
                $key = 'n11-' . $label . '-' . $token . '-' . $index;
                $point->bind_param('iiiis', $base['user_id'], $gameId, $partidaIds[0], $base['team_1_id'], $key);
                $point->execute();
                $pointIds[] = (int) $connection->insert_id;
            }
            $point->close();
            $connection->commit();
        } catch (Throwable $exception) {
            $connection->rollback();
            throw $exception;
        }

        return [
            'game_id' => $gameId,
            'partida_1_id' => $partidaIds[0],
            'partida_2_id' => $partidaIds[1],
            'point_ids' => $pointIds,
        ];
    }

    /** @param array{game_id:int,partida_1_id:int,partida_2_id:int,point_ids:list<int>} $fixture */
    private static function removeAdditionalGame(mysqli $connection, array $fixture): void
    {
        foreach ($fixture['point_ids'] as $pointId) {
            $point = $connection->prepare('DELETE FROM artilheiros WHERE id_artilheiro = ?');
            $point->bind_param('i', $pointId);
            $point->execute();
            $point->close();
        }
        foreach ([$fixture['partida_1_id'], $fixture['partida_2_id']] as $partidaId) {
            $partida = $connection->prepare('DELETE FROM partidas WHERE id_partida = ?');
            $partida->bind_param('i', $partidaId);
            $partida->execute();
            $partida->close();
        }
        $game = $connection->prepare('DELETE FROM jogos WHERE id_jogo = ?');
        $game->bind_param('i', $fixture['game_id']);
        $game->execute();
        $game->close();
    }

    /** @param array{game_id:int,partida_1_id:int,partida_2_id:int,point_ids:list<int>} $fixture @return array<string,int|string> */
    private static function readGameState(mysqli $connection, array $fixture): array
    {
        $statement = $connection->prepare(
            'SELECT j.status_jogo, p1.resultado_partida AS placar_1, p2.resultado_partida AS placar_2,
                    COALESCE(SUM(a.status_artilheiro = \'ativo\' AND a.conta_no_placar = 1), 0) AS pontos_ativos,
                    COALESCE(SUM(a.status_artilheiro = \'anulado\' AND a.conta_no_placar = 0), 0) AS pontos_anulados
             FROM jogos j
             INNER JOIN partidas p1 ON p1.jogos_id_jogo = j.id_jogo AND p1.id_partida = ?
             INNER JOIN partidas p2 ON p2.jogos_id_jogo = j.id_jogo AND p2.id_partida = ?
             LEFT JOIN artilheiros a ON a.jogos_id_jogo = j.id_jogo
             WHERE j.id_jogo = ?
             GROUP BY j.id_jogo, j.status_jogo, p1.resultado_partida, p2.resultado_partida',
        );
        $statement->bind_param('iii', $fixture['partida_1_id'], $fixture['partida_2_id'], $fixture['game_id']);
        $statement->execute();
        $row = $statement->get_result()->fetch_assoc() ?: [];
        $statement->close();
        return [
            'status_jogo' => (string) ($row['status_jogo'] ?? ''),
            'placar_1' => (int) ($row['placar_1'] ?? -1),
            'placar_2' => (int) ($row['placar_2'] ?? -1),
            'pontos_ativos' => (int) ($row['pontos_ativos'] ?? -1),
            'pontos_anulados' => (int) ($row['pontos_anulados'] ?? -1),
        ];
    }

    /** @param array<string, int> $fixture @return array<string, int|string> */
    private static function readState(mysqli $connection, array $fixture): array
    {
        $statement = $connection->prepare(
            'SELECT j.status_jogo, p1.resultado_partida AS placar_1, p2.resultado_partida AS placar_2,
                    a.status_artilheiro, a.conta_no_placar
             FROM jogos j
             INNER JOIN partidas p1 ON p1.jogos_id_jogo = j.id_jogo AND p1.id_partida = ?
             INNER JOIN partidas p2 ON p2.jogos_id_jogo = j.id_jogo AND p2.id_partida = ?
             INNER JOIN artilheiros a ON a.jogos_id_jogo = j.id_jogo AND a.id_artilheiro = ?
             WHERE j.id_jogo = ?',
        );
        $statement->bind_param('iiii', $fixture['partida_1_id'], $fixture['partida_2_id'], $fixture['point_id'], $fixture['game_id']);
        $statement->execute();
        $row = $statement->get_result()->fetch_assoc() ?: [];
        $statement->close();
        return [
            'status_jogo' => (string) ($row['status_jogo'] ?? ''),
            'placar_1' => (int) ($row['placar_1'] ?? -1),
            'placar_2' => (int) ($row['placar_2'] ?? -1),
            'status_artilheiro' => (string) ($row['status_artilheiro'] ?? ''),
            'conta_no_placar' => (int) ($row['conta_no_placar'] ?? -1),
        ];
    }

    /** @param array<string, int> $fixture */
    private static function removeFixture(mysqli $connection, array $fixture): void
    {
        $ids = $fixture;
        $connection->begin_transaction();
        try {
            foreach ([
                ['artilheiros', 'id_artilheiro', $ids['point_id']],
                ['partidas', 'id_partida', $ids['partida_1_id']],
                ['partidas', 'id_partida', $ids['partida_2_id']],
                ['jogos', 'id_jogo', $ids['game_id']],
                ['equipes_has_usuarios', 'equipes_id_equipe', $ids['team_1_id']],
                ['equipes', 'id_equipe', $ids['team_1_id']],
                ['equipes', 'id_equipe', $ids['team_2_id']],
                ['usuarios', 'id_usuario', $ids['user_id']],
                ['modalidades', 'id_modalidade', $ids['modality_id']],
            ] as [$table, $column, $id]) {
                $statement = $connection->prepare("DELETE FROM {$table} WHERE {$column} = ?");
                $statement->bind_param('i', $id);
                $statement->execute();
                $statement->close();
            }
            $connection->commit();
        } catch (Throwable $exception) {
            $connection->rollback();
            throw $exception;
        }
    }
}
