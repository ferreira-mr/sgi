<?php
declare(strict_types=1);

/**
 * Runner Principal da Suite Completa de Testes Automatizados do SGI
 * Execute somente por um executor que criou o container descartável.
 */

require_once __DIR__ . '/Support/TestClient.php';
require_once __DIR__ . '/Support/Assertions.php';
require_once __DIR__ . '/Support/TestDatabase.php';
require_once __DIR__ . '/Support/ProcessExitCode.php';
require_once __DIR__ . '/Support/AuditFixtures.php';
require_once __DIR__ . '/Integration/AuditFixturesTest.php';
require_once __DIR__ . '/Integration/MesarioResourceScopeTest.php';
require_once __DIR__ . '/Integration/TemporaryResolutionScopeTest.php';
require_once __DIR__ . '/Integration/ExceptionEnvelopeTest.php';
require_once __DIR__ . '/Integration/CronometroPersistenceTest.php';
require_once __DIR__ . '/Integration/AuthAndRbacTest.php';
require_once __DIR__ . '/Integration/InterclasseLifecycleTest.php';
require_once __DIR__ . '/Integration/FirstLoginPasswordChangeTest.php';
require_once __DIR__ . '/Integration/PontuacaoReconciliationTest.php';
require_once __DIR__ . '/Integration/ArrecadacaoConsistencyTest.php';
require_once __DIR__ . '/Integration/PodiumCreditTest.php';
require_once __DIR__ . '/Integration/IndividualSyncCreditTest.php';
require_once __DIR__ . '/Integration/HistoryRankingReconciliationTest.php';
require_once __DIR__ . '/Integration/ConcurrentInvariantsTest.php';
require_once __DIR__ . '/Integration/ConcurrentPontoFinalizationTest.php';
require_once __DIR__ . '/Integration/ConcurrentScheduleTest.php';
require_once __DIR__ . '/Integration/TurmasAndPdfImportTest.php';
require_once __DIR__ . '/Integration/ModalidadesAndEquipesTest.php';
require_once __DIR__ . '/Integration/InscricaoModalidadesTest.php';
require_once __DIR__ . '/Integration/JogosAndConflitosTest.php';
require_once __DIR__ . '/Integration/AgendamentoBlocoTest.php';
require_once __DIR__ . '/Integration/AgendamentoSequencialTest.php';
require_once __DIR__ . '/Integration/PlacarAndArtilhariaTest.php';
require_once __DIR__ . '/Integration/OcorrenciasAndRankingTest.php';
require_once __DIR__ . '/Integration/HistoricoTurmaAndClassificacaoTest.php';
require_once __DIR__ . '/Integration/FotoPerfilAndUsuariosTest.php';
require_once __DIR__ . '/Integration/AlunosPortalTest.php';
require_once __DIR__ . '/Integration/RankingPublicationTest.php';
require_once __DIR__ . '/Integration/TurmaScopeConsistencyTest.php';
require_once __DIR__ . '/Integration/PublicBoundaryTest.php';
require_once __DIR__ . '/Integration/RefactorContractsTest.php';
require_once __DIR__ . '/Integration/MigrationsTest.php';
require_once __DIR__ . '/Integration/CronogramaPlanejadoTest.php';
require_once __DIR__ . '/Integration/MigrationSupportTest.php';
require_once __DIR__ . '/Integration/RecoveryRehearsalTest.php';
require_once __DIR__ . '/Integration/ConsistencyGuardsTest.php';
require_once __DIR__ . '/Integration/InitialAdminTest.php';
require_once __DIR__ . '/Integration/StudentPasswordInitializerTest.php';
require_once __DIR__ . '/Integration/FullInterclasseSimulationTest.php';
require_once __DIR__ . '/Integration/AtomicMutationTest.php';
require_once __DIR__ . '/Integration/MataMataEdgeCasesTest.php';
require_once __DIR__ . '/E2E/FullOfflineTournamentTest.php';

use SGITests\Support\Assertions;
use SGITests\Support\TestDatabase;
use SGITests\Integration\AuditFixturesTest;
use SGITests\Integration\MesarioResourceScopeTest;
use SGITests\Integration\TemporaryResolutionScopeTest;
use SGITests\Integration\ExceptionEnvelopeTest;
use SGITests\Integration\CronometroPersistenceTest;
use SGITests\Integration\AuthAndRbacTest;
use SGITests\Integration\InterclasseLifecycleTest;
use SGITests\Integration\FirstLoginPasswordChangeTest;
use SGITests\Integration\PontuacaoReconciliationTest;
use SGITests\Integration\ArrecadacaoConsistencyTest;
use SGITests\Integration\PodiumCreditTest;
use SGITests\Integration\IndividualSyncCreditTest;
use SGITests\Integration\HistoryRankingReconciliationTest;
use SGITests\Integration\ConcurrentInvariantsTest;
use SGITests\Integration\ConcurrentPontoFinalizationTest;
use SGITests\Integration\ConcurrentScheduleTest;
use SGITests\Integration\TurmasAndPdfImportTest;
use SGITests\Integration\ModalidadesAndEquipesTest;
use SGITests\Integration\InscricaoModalidadesTest;
use SGITests\Integration\JogosAndConflitosTest;
use SGITests\Integration\AgendamentoBlocoTest;
use SGITests\Integration\AgendamentoSequencialTest;
use SGITests\Integration\PlacarAndArtilhariaTest;
use SGITests\Integration\OcorrenciasAndRankingTest;
use SGITests\Integration\HistoricoTurmaAndClassificacaoTest;
use SGITests\Integration\FotoPerfilAndUsuariosTest;
use SGITests\Integration\AlunosPortalTest;
use SGITests\Integration\RankingPublicationTest;
use SGITests\Integration\TurmaScopeConsistencyTest;
use SGITests\Integration\PublicBoundaryTest;
use SGITests\Integration\MataMataEdgeCasesTest;
use SGITests\E2E\FullOfflineTournamentTest;

$inicio = microtime(true);
Assertions::reset();

$testBaseUrl = getenv('SGI_TEST_BASE_URL');
$testDatabase = getenv('SGI_TEST_DB_NAME') ?: 'sgi_test';
$scenarioFilter = trim((string) (getenv('SGI_TEST_INTEGRATION_SCENARIO') ?: ''));
$simulationPhase = trim((string) (getenv('SGI_SIMULATION_PHASE') ?: 'complete'));
$preserveSimulationDatabase = getenv('SGI_TEST_PRESERVE_DATABASE') === '1';

if ($testBaseUrl === false || trim($testBaseUrl) === '') {
    fwrite(STDERR, "SGI_TEST_BASE_URL é obrigatório. Inicie um servidor de teste separado antes da suíte.\n");
    exit(2);
}

try {
    TestDatabase::assertDisposableContainerRuntime();
    if ($preserveSimulationDatabase) {
        if ($scenarioFilter !== 'FullInterclasseSimulationTest' || $simulationPhase !== 'finalize') {
            throw new RuntimeException('A preservação de banco só é permitida na fase finalize da simulação integral.');
        }
        TestDatabase::assertExistingDisposableDatabase($testDatabase);
    } else {
        TestDatabase::resetFromSchema($testDatabase);
    }
} catch (Throwable $e) {
    fwrite(STDERR, "Falha ao preparar ambiente de teste: " . $e->getMessage() . "\n");
    exit(2);
}

echo "\033[1;36m====================================================================\033[0m\n";
echo "\033[1;36m       SGI — SUITE COMPLETA DE TESTES AUTOMATIZADOS E AUDITORIA       \033[0m\n";
echo "\033[1;36m====================================================================\033[0m\n";

$aborted = false;
$scenarioDurations = [];
$deferSimulation = filter_var(getenv('SGI_TEST_DEFER_SIMULATION') ?: '0', FILTER_VALIDATE_BOOL);
$suiteStartedAtUtc = gmdate('c');
$suiteStartedAt = hrtime(true);
$runScenario = static function (string $name, callable $scenario) use (&$scenarioDurations): mixed {
    $startedAt = hrtime(true);
    $status = 'completed';
    try {
        return $scenario();
    } catch (Throwable $exception) {
        $status = 'failed';
        throw $exception;
    } finally {
        $duration = round((hrtime(true) - $startedAt) / 1_000_000_000, 3);
        $scenarioDurations[] = [
            'name' => $name,
            'duration_seconds' => $duration,
            'status' => $status,
        ];
        printf("[TEMPO] %s: %.3fs (%s)\n", $name, $duration, $status);
    }
};

try {
    if ($scenarioFilter === 'FullInterclasseSimulationTest') {
        echo "Executando somente FullInterclasseSimulationTest dentro do container descartável.\n";
        $runScenario('FullInterclasseSimulationTest', static fn () => \SGITests\Integration\FullInterclasseSimulationTest::run());
    } elseif ($scenarioFilter !== '') {
        throw new RuntimeException('Filtro de integração desconhecido; o único cenário focal habilitado é FullInterclasseSimulationTest.');
    } else {
    // 0. Fixtures sintéticas das regressões da auditoria
    $runScenario('AuditFixturesTest', static fn () => AuditFixturesTest::run());
    $runScenario('MesarioResourceScopeTest', static fn () => MesarioResourceScopeTest::run());
    $runScenario('TemporaryResolutionScopeTest', static fn () => TemporaryResolutionScopeTest::run());
    $runScenario('ExceptionEnvelopeTest', static fn () => ExceptionEnvelopeTest::run());

    // 1. Autenticação e RBAC
    $runScenario('AuthAndRbacTest', static fn () => AuthAndRbacTest::run());

    // 2. Ciclo de vida da edição
    $idEdicao = $runScenario('InterclasseLifecycleTest', static fn () => InterclasseLifecycleTest::run());

    // 3. Turmas e importação de PDF
    $idTurma = $runScenario('TurmasAndPdfImportTest', static fn () => TurmasAndPdfImportTest::run($idEdicao));
    $runScenario('FirstLoginPasswordChangeTest', static fn () => FirstLoginPasswordChangeTest::run($idEdicao));
    $runScenario('PontuacaoReconciliationTest', static fn () => PontuacaoReconciliationTest::run($idEdicao, $idTurma));
    $runScenario('ArrecadacaoConsistencyTest', static fn () => ArrecadacaoConsistencyTest::run($idEdicao, $idTurma));

    // 4. Modalidades e Equipes
    $dadosMod = $runScenario('ModalidadesAndEquipesTest', static fn () => ModalidadesAndEquipesTest::run($idEdicao));
    $mod = $dadosMod['modalidade'];
    $equipes = $dadosMod['equipes'];
    $idModalidade = (int) $mod['id_modalidade'];

    // 5. Inscrição em Modalidades e Limites
    $runScenario('InscricaoModalidadesTest', static fn () => InscricaoModalidadesTest::run($idEdicao, $equipes));

    // 6. Agendamento e Conflitos
    $dadosJogos = $runScenario('JogosAndConflitosTest', static fn () => JogosAndConflitosTest::run($idEdicao, $idModalidade, $equipes));
    $idJogo1 = $dadosJogos['id_jogo_1'];
    $idJogo2 = $dadosJogos['id_jogo_2'];
    $equipesIds = $dadosJogos['equipes_ids'];
    $runScenario('AgendamentoBlocoTest', static fn () => AgendamentoBlocoTest::run($idEdicao, $idModalidade, $dadosJogos));
    $runScenario('AgendamentoSequencialTest', static fn () => AgendamentoSequencialTest::run($idEdicao, $idModalidade, $dadosJogos));
    $runScenario('ConcurrentScheduleTest', static fn () => ConcurrentScheduleTest::run($idEdicao, $idModalidade, $dadosJogos));

    // 6.1 Persistência e replay do cronômetro
    $runScenario('CronometroPersistenceTest', static fn () => CronometroPersistenceTest::run($idModalidade, $idJogo1));

    // 7. Placar e Artilharia
    $runScenario('PlacarAndArtilhariaTest', static fn () => PlacarAndArtilhariaTest::run($idJogo1, $idModalidade, $equipesIds, $idEdicao));
    $runScenario('AtomicMutationTest', static fn () => \SGITests\Integration\AtomicMutationTest::run($idJogo1));

    // 8. Ocorrências e Ranking
    $runScenario('OcorrenciasAndRankingTest', static fn () => OcorrenciasAndRankingTest::run($idEdicao, $idTurma));

    // 9. Histórico de Turma e Pódios
    $runScenario('HistoricoTurmaAndClassificacaoTest', static fn () => HistoricoTurmaAndClassificacaoTest::run($idEdicao, $idTurma, $idModalidade));

    // 10. Gestão de Fotos e Perfil
    $runScenario('FotoPerfilAndUsuariosTest', static fn () => FotoPerfilAndUsuariosTest::run($idTurma, $idEdicao));

    // 11. Portal do Aluno
    $runScenario('AlunosPortalTest', static fn () => AlunosPortalTest::run());
    $runScenario('RankingPublicationTest', static fn () => RankingPublicationTest::run());
    $runScenario('TurmaScopeConsistencyTest', static fn () => TurmaScopeConsistencyTest::run());

    // 12. Casos Limites do Motor de Chaveamento
    $runScenario('MataMataEdgeCasesTest', static fn () => MataMataEdgeCasesTest::run($idEdicao, $idTurma, $idJogo1, $idModalidade, $equipesIds));

    // 13. Torneio Completo e Sincronização Offline
    $runScenario('FullOfflineTournamentTest', static fn () => FullOfflineTournamentTest::run($idEdicao, $idModalidade, $idJogo2, $equipesIds));
    $runScenario('PodiumCreditTest', static fn () => PodiumCreditTest::run($idEdicao, $idModalidade, $equipesIds));
    $runScenario('IndividualSyncCreditTest', static fn () => IndividualSyncCreditTest::run($idEdicao, $idModalidade));
    $runScenario('HistoryRankingReconciliationTest', static fn () => HistoryRankingReconciliationTest::run($idEdicao, $idTurma));
    $runScenario('ConcurrentInvariantsTest', static fn () => ConcurrentInvariantsTest::run($idEdicao, $idTurma));
    $runScenario('ConcurrentPontoFinalizationTest', static fn () => ConcurrentPontoFinalizationTest::run($idEdicao, $idTurma));

    // 14. Fronteira pública e proteção de arquivos internos
    $runScenario('PublicBoundaryTest', static fn () => PublicBoundaryTest::run());
    $runScenario('RefactorContractsTest', static fn () => \SGITests\Integration\RefactorContractsTest::run());
    $runScenario('MigrationsTest', static fn () => \SGITests\Integration\MigrationsTest::run());
    $runScenario('MigrationSupportTest', static fn () => \SGITests\Integration\MigrationSupportTest::run());
    $runScenario('RecoveryRehearsalTest', static fn () => \SGITests\Integration\RecoveryRehearsalTest::run());
    $runScenario('ConsistencyGuardsTest', static fn () => \SGITests\Integration\ConsistencyGuardsTest::run());
    $runScenario('InitialAdminTest', static fn () => \SGITests\Integration\InitialAdminTest::run());
    $runScenario('StudentPasswordInitializerTest', static fn () => \SGITests\Integration\StudentPasswordInitializerTest::run());
    if (!$deferSimulation) {
        $runScenario('FullInterclasseSimulationTest', static fn () => \SGITests\Integration\FullInterclasseSimulationTest::run());
    } else {
        echo "FullInterclasseSimulationTest será executado em sua fase isolada após os cenários gerais.\n";
    }
    $runScenario('CronogramaPlanejadoTest', static fn () => \SGITests\Integration\CronogramaPlanejadoTest::run());
    }

} catch (Throwable $e) {
    $aborted = true;
    echo "\n\033[31m[ERRO CRÍTICO NA EXECUÇÃO DOS TESTES]\033[0m " . $e->getMessage() . "\n";
    echo $e->getTraceAsString() . "\n";
}

$tempoTotal = round(microtime(true) - $inicio, 2);
$stats = Assertions::getStats();
$suiteStatus = ($stats['failed'] > 0 || $aborted) ? 'failed' : 'passed';
$testResultsDirectory = getenv('SGI_TEST_RESULTS_DIR');
if ($testResultsDirectory !== false && trim($testResultsDirectory) !== '' && is_dir($testResultsDirectory) && is_writable($testResultsDirectory)) {
    usort($scenarioDurations, static fn (array $a, array $b): int => $b['duration_seconds'] <=> $a['duration_seconds']);
    $timingReport = [
        'schema_version' => 1,
        'suite' => 'integration',
        'status' => $suiteStatus,
        'aborted' => $aborted,
        'started_at_utc' => $suiteStartedAtUtc,
        'duration_seconds' => round((hrtime(true) - $suiteStartedAt) / 1_000_000_000, 3),
        'assertions' => [
            'total' => $stats['total'],
            'failed' => $stats['failed'],
        ],
        'scenarios_slowest_first' => $scenarioDurations,
    ];
    try {
        $timingFilename = $scenarioFilter === 'FullInterclasseSimulationTest'
            ? 'simulation-integration-timings.json'
            : 'integration-timings.json';
        $timingPath = rtrim($testResultsDirectory, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . $timingFilename;
        $written = @file_put_contents($timingPath, json_encode($timingReport, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR) . PHP_EOL);
        if ($written === false) {
            fwrite(STDERR, "Não foi possível gravar o relatório de duração da integração em {$timingPath}.\n");
        }
    } catch (Throwable $exception) {
        fwrite(STDERR, "Não foi possível gravar o relatório de duração da integração: {$exception->getMessage()}\n");
    }
}

echo "\n\033[1;36m====================================================================\033[0m\n";
echo "\033[1;36m                       RESULTADO DA EXECUÇÃO                         \033[0m\n";
echo "\033[1;36m====================================================================\033[0m\n";
echo " Total de Asserções: \033[1m{$stats['total']}\033[0m\n";
echo " Aprovadas:          \033[32m\033[1m{$stats['passed']}\033[0m\n";
echo " Falhas:             " . ($stats['failed'] > 0 ? "\033[31m\033[1m{$stats['failed']}\033[0m" : "0") . "\n";
echo " Tempo de Execução:  \033[33m{$tempoTotal}s\033[0m\n";
echo "\033[1;36m====================================================================\033[0m\n";

if ($stats['failed'] > 0 || $aborted) {
    echo "\n\033[31mAsserções que falharam:\033[0m\n";
    foreach ($stats['failures'] as $f) {
        echo " - $f\n";
    }
    exit(1);
} else {
    echo "\n\033[32m\033[1m>>> TODOS OS TESTES FORAM APROVADOS COM 100% DE SUCESSO! <<<\033[0m\n";
    echo "\033[32mCenários desta suíte aprovados. Execute também os testes unitários e de navegador.\033[0m\n\n";
    exit(0);
}
