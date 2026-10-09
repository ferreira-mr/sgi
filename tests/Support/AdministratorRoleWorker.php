<?php

declare(strict_types=1);

require dirname(__DIR__, 2) . '/bootstrap/autoload.php';
require __DIR__ . '/TestDatabase.php';

use App\Modules\Acesso\Application\UsuarioService;
use App\Modules\Acesso\Infrastructure\LocalFotoStorage;
use App\Modules\Acesso\Infrastructure\MysqliUsuarioConsultaRepository;
use App\Modules\Acesso\Infrastructure\MysqliUsuarioManagementRepository;
use App\Shared\Database\MysqliTransactionRunner;
use App\Shared\Storage\StoragePaths;
use SGITests\Support\TestDatabase;

$database = getenv('SGI_TEST_DB_NAME') ?: 'sgi_test';
TestDatabase::assertSafeDatabaseName($database);
$connection = TestDatabase::connect($database);
$barrier = (string) ($argv[1] ?? '');
$workerId = (string) ($argv[2] ?? '');
$userId = (int) ($argv[3] ?? 0);
$editionId = (int) ($argv[4] ?? 0);

if ($barrier === '' || $workerId === '' || $userId <= 0 || $editionId <= 0) {
    fwrite(STDERR, 'Argumentos do worker de papel inválidos.');
    exit(1);
}

$readyPath = $barrier . DIRECTORY_SEPARATOR . 'ready-' . $workerId;
$tmpReady = $readyPath . '.tmp.' . getmypid() . '.' . bin2hex(random_bytes(4));
if (@file_put_contents($tmpReady, 'ready', LOCK_EX) === false || !@rename($tmpReady, $readyPath)) {
    @unlink($tmpReady);
    fwrite(STDERR, 'Não foi possível anunciar o worker de papel.');
    exit(1);
}

$deadline = microtime(true) + 10.0;
while (!is_file($barrier . DIRECTORY_SEPARATOR . 'release') && microtime(true) < $deadline) {
    usleep(10000);
}
if (!is_file($barrier . DIRECTORY_SEPARATOR . 'release')) {
    fwrite(STDERR, 'A barreira não liberou o worker de papel.');
    exit(1);
}

try {
    $service = new UsuarioService(
        new MysqliUsuarioConsultaRepository($connection),
        new MysqliUsuarioManagementRepository($connection),
        new LocalFotoStorage(StoragePaths::fotosUsuarios()),
        new MysqliTransactionRunner($connection),
    );
    $service->atualizarColaborador([
        'id_usuario' => $userId,
        'is_admin_clicado' => '0',
        'is_mesario_clicado' => '0',
    ], $editionId);
    echo json_encode(['result' => 'accepted'], JSON_THROW_ON_ERROR);
} catch (RuntimeException $exception) {
    echo json_encode(['result' => 'rejected', 'message' => $exception->getMessage()], JSON_THROW_ON_ERROR);
} catch (Throwable $exception) {
    fwrite(STDERR, $exception->getMessage());
    exit(1);
} finally {
    $connection->close();
}
