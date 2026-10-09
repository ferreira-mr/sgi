<?php

declare(strict_types=1);

namespace SGITests\Support;

use App\Shared\Database\SchemaInstaller;
use App\Shared\Database\SqlScript;
use mysqli;
use RuntimeException;

final class TestDatabase
{
    public static function assertDisposableContainerRuntime(): void
    {
        if (getenv('SGI_TEST_DB_RUNTIME') !== 'container') {
            throw new RuntimeException(
                'Testes com banco exigem o executor Docker e SGI_TEST_DB_RUNTIME=container. '
                . 'Use tools/test-docker.ps1/.sh ou tools/test-local.ps1; nenhum banco local será alterado.',
            );
        }
    }

    public static function resetFromSchema(string $databaseName): void
    {
        require_once dirname(__DIR__, 2) . '/bootstrap/autoload.php';
        self::assertDisposableContainerRuntime();
        self::assertSafeDatabaseName($databaseName);
        $server = (new TestClient())->get('api/v1/health');
        if (($server['json']['test_environment']['database'] ?? null) !== $databaseName) {
            throw new RuntimeException('O servidor HTTP não confirmou o mesmo banco isolado de teste. Nenhum banco foi alterado.');
        }
        if (($server['json']['test_environment']['database_runtime'] ?? null) !== 'container') {
            throw new RuntimeException('O servidor HTTP não confirmou um banco em container. Nenhum banco foi alterado.');
        }
        $connection = self::connect();
        $connection->query('DROP DATABASE IF EXISTS `' . $databaseName . '`');
        $connection->query('CREATE DATABASE `' . $databaseName . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci');
        $connection->select_db($databaseName);
        $root = dirname(__DIR__, 2);
        (new SchemaInstaller($connection, $root . '/database/schema-inicial.sql'))->install();
        foreach (SqlScript::statements((string) file_get_contents($root . '/database/seeders/test.sql')) as $sql) {
            $connection->query($sql);
        }
        $connection->close();
    }

    public static function assertExistingDisposableDatabase(string $databaseName): void
    {
        require_once dirname(__DIR__, 2) . '/bootstrap/autoload.php';
        self::assertDisposableContainerRuntime();
        self::assertSafeDatabaseName($databaseName);
        $server = (new TestClient())->get('api/v1/health');
        if (($server['json']['test_environment']['database'] ?? null) !== $databaseName) {
            throw new RuntimeException('O servidor HTTP não confirmou o banco descartável esperado. Nenhum dado foi alterado.');
        }
        if (($server['json']['test_environment']['database_runtime'] ?? null) !== 'container') {
            throw new RuntimeException('O servidor HTTP não confirmou um banco em container. Nenhum dado foi alterado.');
        }
    }

    public static function connect(?string $database = null): mysqli
    {
        self::assertDisposableContainerRuntime();
        mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
        $connection = new mysqli(getenv('SGI_DB_HOST') ?: '127.0.0.1', getenv('SGI_DB_USER') ?: 'root', getenv('SGI_DB_PASSWORD') ?: '', $database, (int) (getenv('SGI_DB_PORT') ?: 3306));
        $connection->set_charset('utf8mb4');
        return $connection;
    }

    public static function assertSafeDatabaseName(string $name): void
    {
        if (!preg_match('/^[a-zA-Z0-9_]+$/', $name) || !preg_match('/(^|_)(test|testing)(_|$)/i', $name)) {
            throw new RuntimeException('Recusada operação destrutiva em banco que não é de teste: ' . $name);
        }
    }
}
