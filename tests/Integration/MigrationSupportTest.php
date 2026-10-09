<?php

declare(strict_types=1);

namespace SGITests\Integration;

use App\Shared\Database\MigrationRunner;
use App\Shared\Database\SchemaInstaller;
use mysqli;
use RuntimeException;
use SGITests\Support\Assertions;
use SGITests\Support\TestDatabase;

final class MigrationSupportTest
{
    public static function run(): void
    {
        echo "\n  [Suporte a migrations futuras]\n";
        $database = getenv('SGI_TEST_DB_NAME') ?: 'sgi_test';
        TestDatabase::assertSafeDatabaseName($database);
        $connection = TestDatabase::connect($database);
        $suffix = bin2hex(random_bytes(4));
        $table = 'migration_probe_' . $suffix;
        $version = '001_future_schema_probe_' . $suffix . '.sql';
        $directory = dirname(__DIR__, 2) . '/test-results/migration-probe-' . $suffix;

        if (!mkdir($directory, 0777, true) && !is_dir($directory)) {
            $connection->close();
            throw new RuntimeException('Não foi possível preparar a migration sintética.');
        }

        try {
            $sql = "CREATE TABLE `{$table}` (id INT NOT NULL PRIMARY KEY) ENGINE=InnoDB;\n";
            if (file_put_contents($directory . '/' . $version, $sql) === false) {
                throw new RuntimeException('Não foi possível gravar a migration sintética.');
            }

            $runner = new MigrationRunner($connection, $directory);
            $applied = $runner->migrate();
            $repeated = $runner->migrate();
            $schemaRepeated = (new SchemaInstaller($connection, dirname(__DIR__, 2) . '/database/schema-inicial.sql'))->install();
            $exists = (int) $connection->query(
                "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '{$table}'",
            )->fetch_column() === 1;
            $recorded = self::hasMigrationRecord($connection, $version);

            Assertions::assert(
                'Migration futura é aplicada sobre o baseline atual e repetição não duplica',
                $applied === [$version] && $repeated === [] && $schemaRepeated === false && $exists && $recorded,
            );

            $root = dirname(__DIR__, 2);
            $planningVersion = '001_cronograma_inscricoes.sql';
            $planningNodesVersion = '002_cronograma_nos.sql';
            $planningContractVersion = '003_cronograma_final_contract.sql';
            $planningGameLinkVersion = '004_cronograma_no_jogo.sql';
            $planningVersions = [$planningVersion, $planningNodesVersion, $planningContractVersion, $planningGameLinkVersion];
            $planningTableNames = ['interclasse_planejamentos', 'modalidade_planejamentos', 'equipe_planejamentos', 'cronograma_compromissos', 'cronograma_nos', 'cronograma_no_equipes'];
            $dropPlanningSchema = static function () use ($connection): void {
                foreach (['cronograma_no_equipes', 'cronograma_nos', 'cronograma_compromissos', 'equipe_planejamentos', 'modalidade_planejamentos', 'interclasse_planejamentos'] as $planningTable) {
                    $connection->query('DROP TABLE IF EXISTS `' . $planningTable . '`');
                }
            };
            $deletePlanningMarkers = static function () use ($connection, $planningVersions): void {
                $statement = $connection->prepare('DELETE FROM sgi_migrations WHERE version IN (?, ?, ?, ?)');
                [$planningVersionOne, $planningVersionTwo, $planningVersionThree, $planningVersionFour] = $planningVersions;
                $statement->bind_param('ssss', $planningVersionOne, $planningVersionTwo, $planningVersionThree, $planningVersionFour);
                $statement->execute();
                $statement->close();
            };
            $planningRunner = new MigrationRunner($connection, $root . '/database/migrations');
            $planningApplied = $planningRunner->migrate();
            $planningRepeated = $planningRunner->migrate();
            $planningTables = 0;
            foreach ($planningTableNames as $planningTable) {
                $planningTables += (int) $connection->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '" . $connection->real_escape_string($planningTable) . "'")->fetch_column();
            }
            Assertions::assert(
                'Migration do cronograma cria as tabelas auxiliares e é idempotente',
                $planningApplied === $planningVersions && $planningRepeated === [] && $planningTables === 6,
            );
            $dropPlanningSchema();
            $deletePlanningMarkers();

            $partialDirectory = $directory . '/before-game-link';
            if (!mkdir($partialDirectory, 0777, true) && !is_dir($partialDirectory)) {
                throw new RuntimeException('Não foi possível preparar o cenário de backfill legado.');
            }
            $backfillNodeIds = [];
            $backfillGameIds = [];
            try {
                foreach (array_slice($planningVersions, 0, 3) as $partialVersion) {
                    $source = $root . '/database/migrations/' . $partialVersion;
                    if (file_put_contents($partialDirectory . '/' . $partialVersion, (string) file_get_contents($source)) === false) {
                        throw new RuntimeException('Não foi possível copiar uma migration do cenário de backfill.');
                    }
                }
                $partialApplied = (new MigrationRunner($connection, $partialDirectory))->migrate();
                $scope = $connection->query('SELECT i.id_interclasse, m.id_modalidade, t.id_turma FROM interclasses i INNER JOIN modalidades m ON m.interclasses_id_interclasse = i.id_interclasse INNER JOIN turmas t ON t.interclasses_id_interclasse = i.id_interclasse AND t.categorias_id_categoria = m.categorias_id_categoria ORDER BY i.id_interclasse, m.id_modalidade, t.id_turma LIMIT 1')->fetch_assoc();
                if ($partialApplied !== array_slice($planningVersions, 0, 3) || $scope === null) {
                    throw new RuntimeException('O cenário de backfill não encontrou o escopo base da migration.');
                }

                $editionId = (int) $scope['id_interclasse'];
                $modalityId = (int) $scope['id_modalidade'];
                $classId = (int) $scope['id_turma'];
                $planning = $connection->prepare("UPDATE interclasse_planejamentos SET cronograma_status = 'publicado', inscricoes_status = 'encerradas', cronograma_versao = 1, versao_publicada = 1, operacao_liberada = 0 WHERE id_interclasse = ?");
                $planning->bind_param('i', $editionId);
                $planning->execute();
                $planning->close();

                $uniqueTag = 'PL:' . $modalityId . ':0:MM:2:900:N';
                $ambiguousTag = 'PL:' . $modalityId . ':0:MM:4:901:N';
                $nodeStatement = $connection->prepare("INSERT INTO cronograma_nos (id_interclasse, id_modalidade, id_turma, chave_tag, tipo_no, fase_largura, slot, origem_a_tag, origem_b_tag, id_equipe_a, id_equipe_b, cronograma_versao) VALUES (?, ?, ?, ?, 'normal', ?, ?, NULL, NULL, NULL, NULL, 1)");
                foreach ([[$uniqueTag, 2, 900], [$ambiguousTag, 4, 901]] as [$tag, $width, $slot]) {
                    $nodeStatement->bind_param('iiisii', $editionId, $modalityId, $classId, $tag, $width, $slot);
                    $nodeStatement->execute();
                    $backfillNodeIds[] = (int) $connection->insert_id;
                }
                $nodeStatement->close();

                $gameStatement = $connection->prepare("INSERT INTO jogos (nome_jogo, status_jogo, modalidades_id_modalidade) VALUES (?, 'Agendado', ?)");
                $gameStatement->bind_param('si', $uniqueTag, $modalityId);
                $gameStatement->execute();
                $backfillGameIds[] = (int) $connection->insert_id;
                $gameStatement->bind_param('si', $ambiguousTag, $modalityId);
                $gameStatement->execute();
                $backfillGameIds[] = (int) $connection->insert_id;
                $gameStatement->execute();
                $backfillGameIds[] = (int) $connection->insert_id;
                $gameStatement->close();

                $backfillApplied = $planningRunner->migrate();
                $uniqueLink = $connection->query('SELECT id_jogo FROM cronograma_nos WHERE id_no = ' . $backfillNodeIds[0])->fetch_column();
                $ambiguousLink = $connection->query('SELECT id_jogo FROM cronograma_nos WHERE id_no = ' . $backfillNodeIds[1])->fetch_column();
                Assertions::assert(
                    'Migration 004 vincula correspondência única e deixa tags legadas ambíguas sem vínculo',
                    $backfillApplied === [$planningGameLinkVersion]
                        && (int) $uniqueLink === $backfillGameIds[0]
                        && $ambiguousLink === null,
                    json_encode(['migration' => $backfillApplied, 'unique_link' => $uniqueLink, 'ambiguous_link' => $ambiguousLink], JSON_UNESCAPED_UNICODE),
                );
            } finally {
                foreach ($backfillNodeIds as $nodeId) {
                    $connection->query('DELETE FROM cronograma_nos WHERE id_no = ' . (int) $nodeId);
                }
                foreach ($backfillGameIds as $gameId) {
                    $connection->query('DELETE FROM jogos WHERE id_jogo = ' . (int) $gameId);
                }
                $dropPlanningSchema();
                $deletePlanningMarkers();
                foreach (glob($partialDirectory . '/*') ?: [] as $file) {
                    if (is_file($file)) {
                        unlink($file);
                    }
                }
                rmdir($partialDirectory);
            }

            // A integração compartilha este banco com as suítes de navegador.
            // Depois de verificar repetição e backfill legado, restaure o contrato
            // para que o servidor entregue o cronograma também ao mesário.
            $planningRestored = $planningRunner->migrate();
            $planningRestoredRepeated = $planningRunner->migrate();
            $restoredTables = 0;
            foreach ($planningTableNames as $planningTable) {
                $restoredTables += (int) $connection->query("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = '" . $connection->real_escape_string($planningTable) . "'")->fetch_column();
            }
            Assertions::assert('Restaurar as migrations deixa o esquema do cronograma disponível e repetível', $planningRestored === $planningVersions && $planningRestoredRepeated === [] && $restoredTables === 6);
        } finally {
            $connection->query("DROP TABLE IF EXISTS `{$table}`");
            $statement = $connection->prepare('DELETE FROM sgi_migrations WHERE version = ?');
            $statement->bind_param('s', $version);
            $statement->execute();
            $statement->close();
            foreach (glob($directory . '/*') ?: [] as $file) {
                if (is_file($file)) {
                    unlink($file);
                }
            }
            rmdir($directory);
            $connection->close();
        }
    }

    private static function hasMigrationRecord(mysqli $connection, string $version): bool
    {
        $statement = $connection->prepare('SELECT COUNT(*) FROM sgi_migrations WHERE version = ? AND dirty = 0');
        $statement->bind_param('s', $version);
        $statement->execute();
        $count = (int) $statement->get_result()->fetch_column();
        $statement->close();
        return $count === 1;
    }
}
