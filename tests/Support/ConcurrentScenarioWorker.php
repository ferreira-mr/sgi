<?php

declare(strict_types=1);

require dirname(__DIR__, 2) . '/bootstrap/autoload.php';
require __DIR__ . '/TestDatabase.php';
require __DIR__ . '/AnnulmentBarrierPontoRepository.php';
require __DIR__ . '/ConcurrentScheduleBarrierRepository.php';

use App\Modules\Competicoes\Infrastructure\MysqliEquipePadraoRepositoryAdapter;
use App\Modules\Competicoes\Infrastructure\MysqliEquipeRepository;
use App\Modules\Competicoes\Infrastructure\MysqliAgendamentoBlocoRepository;
use App\Modules\Competicoes\Infrastructure\MysqliJogoGateway;
use App\Modules\Competicoes\Infrastructure\MysqliJogoRepository;
use App\Modules\Competicoes\Infrastructure\MysqliPartidaGateway;
use App\Modules\Competicoes\Infrastructure\MysqliPontoRepository;
use App\Modules\Competicoes\Application\JogoService;
use App\Modules\Competicoes\Application\PontoService;
use App\Modules\Disciplina\Domain\OcorrenciaDescricao;
use App\Modules\Disciplina\Infrastructure\MysqliOcorrenciaRepository;
use App\Modules\Eventos\Infrastructure\MysqliEdicaoRepository;
use App\Modules\Participantes\Infrastructure\MysqliInscricaoRepository;
use App\Modules\Resultados\Infrastructure\MysqliArrecadacaoRepository;
use App\Shared\Database\MysqliTransactionRunner;
use SGITests\Support\TestDatabase;

$database = getenv('SGI_TEST_DB_NAME') ?: 'sgi_test';
TestDatabase::assertSafeDatabaseName($database);
$connection = TestDatabase::connect($database);

/*
 * T13 already used this worker with (historyId, editionId). Keep that
 * invocation intact while allowing T18 to coordinate distinct scenarios.
 */
if (count($argv) <= 3 || !in_array((string) ($argv[1] ?? ''), ['arrecadacao', 'inscricao', 'equipe', 'equipe-vincular', 'equipe-transfer', 'jogo-partida', 'edicao', 'ponto-anular', 'resultado-finalizar', 'resultado-finalizar-snapshot', 'jogo-criar', 'jogo-editar', 'agenda-confirmar', 'ocorrencia-amarelo'], true)) {
    $historyId = (int) ($argv[1] ?? 0);
    $editionId = (int) ($argv[2] ?? 0);

    try {
        $result = (new MysqliArrecadacaoRepository($connection))->remove($historyId, $editionId);
        echo json_encode(['result' => $result], JSON_THROW_ON_ERROR);
    } catch (Throwable $exception) {
        fwrite(STDERR, $exception->getMessage());
        exit(1);
    } finally {
        $connection->close();
    }
    exit(0);
}

$scenario = (string) $argv[1];
$barrier = (string) ($argv[2] ?? '');
$workerId = (string) ($argv[3] ?? '');
if ($barrier === '' || $workerId === '') {
    fwrite(STDERR, 'Barreira concorrente ausente.');
    exit(1);
}

$ready = $barrier . DIRECTORY_SEPARATOR . 'ready-' . $workerId;
$release = $barrier . DIRECTORY_SEPARATOR . 'release';
if (!writeAtomicBarrierFile($ready, json_encode([
    'pid' => getmypid(),
    'db_thread' => $connection->thread_id,
    'worker' => $workerId,
], JSON_THROW_ON_ERROR))) {
    fwrite(STDERR, 'Não foi possível anunciar o worker concorrente.');
    exit(1);
}

$deadline = microtime(true) + 10.0;
while (!is_file($release) && microtime(true) < $deadline) {
    usleep(10000);
}
if (!is_file($release)) {
    fwrite(STDERR, 'O coordenador não liberou o início do worker.');
    exit(1);
}

try {
    $result = match ($scenario) {
        'arrecadacao' => remove($connection, (int) ($argv[4] ?? 0), (int) ($argv[5] ?? 0)),
        'inscricao' => subscribe($connection, (int) ($argv[4] ?? 0), (int) ($argv[5] ?? 0), (int) ($argv[6] ?? 0)),
        'equipe' => createTeam($connection, (int) ($argv[4] ?? 0), (int) ($argv[5] ?? 0), (string) ($argv[6] ?? '')),
        'equipe-vincular' => addRosterMember($connection, (int) ($argv[4] ?? 0), (int) ($argv[5] ?? 0)),
        'equipe-transfer' => transferTeam($connection, (int) ($argv[4] ?? 0), (int) ($argv[5] ?? 0)),
        'jogo-partida' => createGameWithTeam($connection, array_slice($argv, 4)),
        'edicao' => edition($connection, (string) ($argv[4] ?? ''), array_slice($argv, 5)),
        'ponto-anular' => annulPoint(
            $connection,
            (int) ($argv[4] ?? 0),
            (int) ($argv[5] ?? 0),
            $barrier,
        ),
        'resultado-finalizar' => finalizeGame(
            $connection,
            (int) ($argv[4] ?? 0),
            (int) ($argv[5] ?? 0),
            (int) ($argv[6] ?? 0),
            (int) ($argv[7] ?? 0),
        ),
        'resultado-finalizar-snapshot' => finalizeGameAfterSnapshot(
            $connection,
            (int) ($argv[4] ?? 0),
            (int) ($argv[5] ?? 0),
            (int) ($argv[6] ?? 0),
            (int) ($argv[7] ?? 0),
            (string) ($argv[8] ?? ''),
        ),
        'jogo-criar' => createScheduledGame($connection, $barrier, $workerId, array_slice($argv, 4)),
        'jogo-editar' => updateScheduledGame($connection, array_slice($argv, 4)),
        'agenda-confirmar' => confirmScheduleBlock($connection, array_slice($argv, 4)),
        'ocorrencia-amarelo' => createYellow(
            $connection,
            (int) ($argv[4] ?? 0),
            (int) ($argv[5] ?? 0),
            (int) ($argv[6] ?? 0),
            (string) ($argv[7] ?? ''),
        ),
        default => throw new RuntimeException('Cenário concorrente desconhecido.'),
    };
    echo json_encode(['result' => $result], JSON_THROW_ON_ERROR);
} catch (mysqli_sql_exception $exception) {
    fwrite(STDERR, $exception->getMessage());
    exit(1);
} catch (InvalidArgumentException $exception) {
    echo json_encode(['result' => 'rejected', 'message' => $exception->getMessage()], JSON_THROW_ON_ERROR);
} catch (RuntimeException $exception) {
    // Rejeições de regra são resultados normais do cenário; falhas de processo
    // continuam sendo representadas por erro e exit 1 no bloco externo.
    echo json_encode(['result' => 'rejected', 'message' => $exception->getMessage()], JSON_THROW_ON_ERROR);
} catch (Throwable $exception) {
    fwrite(STDERR, $exception->getMessage());
    exit(1);
} finally {
    $connection->close();
}

function remove(mysqli $connection, int $historyId, int $editionId): string
{
    return (new MysqliArrecadacaoRepository($connection))->remove($historyId, $editionId);
}

function subscribe(mysqli $connection, int $userId, int $editionId, int $teamId): string
{
    $result = (new MysqliInscricaoRepository(
        $connection,
        new MysqliEquipePadraoRepositoryAdapter($connection),
    ))->subscribe($userId, $editionId, [$teamId]);
    if (($result['success'] ?? false) !== true) {
        return 'rejected';
    }
    return ($result['insercoes'] ?? 0) > 0 ? 'accepted' : 'existing';
}

function addRosterMember(mysqli $connection, int $teamId, int $userId): string
{
    (new MysqliEquipeRepository($connection))->addUsers($teamId, [$userId]);
    return 'accepted';
}

function transferTeam(mysqli $connection, int $teamId, int $targetModalityId): string
{
    (new MysqliEquipeRepository($connection))->update($teamId, [
        'modalidades_id_modalidade' => $targetModalityId,
    ]);
    return 'accepted';
}

/** @param list<string> $arguments */
function createGameWithTeam(mysqli $connection, array $arguments): string
{
    [$name, $date, $start, $end, $modality, $local, $team] = array_pad($arguments, 7, '');
    (new MysqliJogoRepository($connection))->create([
        'nome_jogo' => $name,
        'data_jogo' => $date,
        'inicio_jogo' => $start,
        'termino_jogo' => $end,
        'status_jogo' => 'Agendado',
        'modalidades_id_modalidade' => (int) $modality,
        'locais_id_local' => (int) $local,
        'equipes' => [(int) $team],
    ]);
    return 'accepted';
}

function createTeam(mysqli $connection, int $modalityId, int $classId, string $name): string
{
    (new MysqliEquipeRepository($connection))->create([
        'modalidades_id_modalidade' => $modalityId,
        'turmas_id_turma' => $classId,
        'status_equipe' => '1',
        'nome_equipe' => $name === '' ? null : $name,
    ]);
    return 'accepted';
}

function annulPoint(mysqli $connection, int $pointId, int $operatorId, string $barrier): string
{
    (new MysqliTransactionRunner($connection))->run(
        static fn (): array => (new PontoService(
            new AnnulmentBarrierPontoRepository(new MysqliPontoRepository($connection), $barrier),
        ))->anular($pointId, $operatorId),
    );
    return 'accepted';
}

function finalizeGame(mysqli $connection, int $gameId, int $modalityId, int $firstTeamId, int $secondTeamId): string
{
    $result = (new MysqliPartidaGateway($connection))->launch($gameId, null, $modalityId, [
        ['id_equipe' => $firstTeamId, 'gols' => 1],
        ['id_equipe' => $secondTeamId, 'gols' => 0],
    ]);
    return ($result['success'] ?? false) === true ? 'accepted' : 'rejected';
}

function finalizeGameAfterSnapshot(mysqli $connection, int $gameId, int $modalityId, int $firstTeamId, int $secondTeamId, string $barrier): string
{
    if ($barrier === '') {
        throw new RuntimeException('Barreira de snapshot ausente.');
    }
    $gateway = new MysqliPartidaGateway($connection);
    $results = [
        ['id_equipe' => $firstTeamId, 'gols' => 1],
        ['id_equipe' => $secondTeamId, 'gols' => 0],
    ];
    $result = (new MysqliTransactionRunner($connection))->run(
        static function () use ($gateway, $gameId, $modalityId, $results, $barrier): array {
            // Establish a REPEATABLE READ snapshot before the annulment commits.
            $gateway->resolveAndValidate($gameId, null, $modalityId, $results);
            if (!writeAtomicBarrierFile($barrier . DIRECTORY_SEPARATOR . 'snapshot', 'ready')) {
                throw new RuntimeException('Não foi possível sinalizar o snapshot da finalização.');
            }
            awaitBarrier($barrier . DIRECTORY_SEPARATOR . 'continue', 'snapshot da finalização');
            return $gateway->launch($gameId, null, $modalityId, $results);
        },
    );
    return ($result['success'] ?? false) === true ? 'accepted' : 'rejected';
}

function writeAtomicBarrierFile(string $path, string $content): bool
{
    $tmp = $path . '.tmp.' . getmypid() . '.' . bin2hex(random_bytes(4));
    if (@file_put_contents($tmp, $content, LOCK_EX) === false) {
        @unlink($tmp);
        return false;
    }
    if (!@rename($tmp, $path)) {
        @unlink($tmp);
        return false;
    }
    return true;
}

function awaitBarrier(string $path, string $description): void
{
    $deadline = microtime(true) + 10.0;
    while (!is_file($path) && microtime(true) < $deadline) {
        usleep(10000);
    }
    if (!is_file($path)) {
        throw new RuntimeException('A barreira não foi liberada: ' . $description . '.');
    }
}

function createYellow(mysqli $connection, int $userId, int $gameId, int $classId, string $workerId): string
{
    $result = (new MysqliOcorrenciaRepository($connection))->create([
        'titulo_ocorrencia' => 'Amarelo',
        'descricao_ocorrencia' => OcorrenciaDescricao::withReferences($gameId, $classId, 'Concorrência L10 ' . $workerId),
        'data_ocorrencia' => date('Y-m-d'),
        'usuarios_id_usuario' => $userId,
        'penalidade' => 0,
        'id_jogo' => $gameId,
        'id_turma' => $classId,
    ]);
    return (int) ($result['id'] ?? 0) > 0 ? 'created' : 'failed';
}

/** @param list<string> $arguments */
function createScheduledGame(mysqli $connection, string $barrier, string $workerId, array $arguments): string
{
    [$name, $date, $start, $end, $modality, $local, $firstTeam, $secondTeam] = array_pad($arguments, 8, '');
    (new JogoService(new \SGITests\Support\ConcurrentScheduleBarrierRepository(
        new MysqliJogoRepository($connection),
        $barrier,
        $workerId,
    )))->agendar([
        'nome_jogo' => $name,
        'data_jogo' => $date,
        'inicio_jogo' => $start,
        'termino_jogo' => $end,
        'modalidades_id_modalidade' => (int) $modality,
        'locais_id_local' => (int) $local,
        'equipes' => [(int) $firstTeam, (int) $secondTeam],
    ]);

    return 'accepted';
}

/** @param list<string> $arguments */
function updateScheduledGame(mysqli $connection, array $arguments): string
{
    [$game, $date, $start, $end, $local] = array_pad($arguments, 5, '');
    (new MysqliJogoGateway($connection))->update((int) $game, [
        'data_jogo' => $date,
        'inicio_jogo' => $start,
        'termino_jogo' => $end,
        'locais_id_local' => (int) $local,
    ]);

    return 'accepted';
}

/** @param list<string> $arguments */
function confirmScheduleBlock(mysqli $connection, array $arguments): string
{
    [$edition, $modality, $user, $game, $date, $start, $end, $local, $idempotency] = array_pad($arguments, 9, '');
    (new MysqliAgendamentoBlocoRepository($connection))->confirm([
        'id_interclasse' => (int) $edition,
        'id_modalidade' => (int) $modality,
        'jogos' => [['id_jogo' => (int) $game]],
        'janelas' => [[
            'data' => $date,
            'inicio' => substr($start, 0, 5),
            'fim' => substr($end, 0, 5),
            'locais' => [(int) $local],
        ]],
        'opcoes' => ['duracao_min' => 30, 'intervalo_troca_min' => 10],
        'idempotencia' => $idempotency,
    ], (int) $edition, (int) $user);

    return 'accepted';
}

/** @param list<string> $arguments @return array<string,mixed>|string */
function edition(mysqli $connection, string $operation, array $arguments): array|string
{
    $repository = new MysqliEdicaoRepository(
        $connection,
        new MysqliEquipePadraoRepositoryAdapter($connection),
    );
    if ($operation === 'activate') {
        $editionId = (int) ($arguments[0] ?? 0);
        $repository->update($editionId, ['status_interclasse' => '1']);
        return 'accepted';
    }
    if ($operation === 'create') {
        $result = $repository->create([
            'nome_interclasse' => (string) ($arguments[0] ?? ''),
            'ano_interclasse' => (string) ($arguments[1] ?? ''),
        ]);
        return ['status' => 'accepted', ...$result];
    }
    throw new RuntimeException('Operação de edição desconhecida.');
}
