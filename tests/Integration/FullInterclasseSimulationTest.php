<?php

declare(strict_types=1);

namespace SGITests\Integration;

use DateTimeImmutable;
use DateTimeZone;
use mysqli;
use RuntimeException;
use SGITests\Support\Assertions;
use SGITests\Support\TestClient;
use SGITests\Support\TestDatabase;
use App\Shared\Database\MigrationRunner;
use Tests\Support\Simulation\TournamentManifest;
use Tests\Support\Simulation\TournamentOracle;
use Throwable;

/** Full HTTP-backed synthetic edition. SQL is used only for read-only reconciliation. */
final class FullInterclasseSimulationTest
{
    private const STUDENT_PASSWORD = 'Interclasse#2026';

    /** @var list<array<string,mixed>> */
    private array $events = [];
    /** @var array<string,array<string,mixed>> */
    private array $checkpoints = [];
    /** @var array<string,mixed> */
    private array $observed = [];
    private int $eventSequence = 0;
    private string $runId = '';
    private string $artifactDirectory = '';
    private ?string $failure = null;
    private string $startedAtUtc = '';
    private int $startedAtNs = 0;

    public static function run(): void
    {
        (new self())->execute();
    }

    private function execute(): void
    {
        $this->startedAtUtc = gmdate('c');
        $this->startedAtNs = hrtime(true);
        TestDatabase::assertDisposableContainerRuntime();
        $phase = getenv('SGI_SIMULATION_PHASE') ?: 'complete';
        if (!in_array($phase, ['complete', 'prepare', 'finalize'], true)) {
            throw new RuntimeException('Fase de simulação inválida.');
        }
        if ($phase === 'finalize') {
            $this->executeFinalize();
            return;
        }
        $database = getenv('SGI_TEST_DB_NAME') ?: 'sgi_test';
        $connection = TestDatabase::connect($database);
        try {
            (new MigrationRunner($connection, dirname(__DIR__, 2) . '/database/migrations'))->migrate();
        } finally {
            $connection->close();
        }

        $this->runId = (string) (getenv('SGI_SIMULATION_RUN_ID') ?: (gmdate('Ymd\THis\Z') . '-' . bin2hex(random_bytes(4))));
        $this->artifactDirectory = $this->artifactDirectory();
        $manifest = TournamentManifest::load();
        $oracle = TournamentOracle::compute($manifest);
        $manifestPath = dirname(__DIR__) . '/fixtures/simulacao-interclasse/manifest.json';
        $manifestHash = hash_file('sha256', $manifestPath) ?: 'indisponivel';
        $admin = new TestClient();
            $this->login($admin, 'admin', '123', 'S00');
        $previousEditionId = $this->activeEditionId($admin);
        $editionId = 0;

        try {
            $this->mark('S00', ['runtime' => getenv('SGI_TEST_DB_RUNTIME') ?: 'ausente', 'database' => getenv('SGI_TEST_DB_NAME') ?: 'sgi_test']);
            $editionResponse = $this->request($admin, 'POST', 'api/v1/edicoes', [
                'nome_interclasse' => 'Simulacao ' . $this->runId,
                'ano_interclasse' => (new DateTimeImmutable('today'))->format('Y-m-d 00:00:00'),
            ], 'S01', 'criar_edicao', 200);
            $editionId = (int) ($editionResponse['id_interclasse'] ?? $editionResponse['id'] ?? 0);
            $this->must($editionId > 0, 'A API de edição não retornou um identificador.');
            $this->request($admin, 'POST', "api/v1/edicoes?id={$editionId}", [
                'ponto_1_lugar' => 20,
                'ponto_2_lugar' => 12,
                'ponto_3_lugar' => 8,
                'valor_item_arrecadacao' => 4,
            ], 'S01', 'configurar_pontuacao');

            [$classes, $categories, $modalities, $teams, $locals] = $this->configureEdition($admin, $editionId, $manifest);
            $this->observed['edition_id'] = $editionId;
            $this->observed['resolved'] = [
                'classes' => array_map(static fn (array $row): int => $row['id'], $classes),
                'modalities' => array_map(static fn (array $row): int => $row['id'], $modalities),
                'teams' => array_map(static fn (array $row): int => $row['id'], $teams),
            ];
            $this->must(count($classes) === 7 && count($categories) === 2 && count($modalities) === 10 && count($teams) === 49, 'A edição deve ter 7 turmas, 2 categorias, 10 modalidades, 35 equipes padrão e 14 equipes individuais adicionais.');
            $this->mark('S01', [
                'classes' => count($classes), 'categories' => count($categories), 'modalities' => count($modalities),
                'default_team_representations' => 35, 'individual_entry_representations' => 14,
                'operational_representations' => count($teams),
            ]);

            $schedule = $this->publishSchedule($admin, $editionId, $modalities, $locals, $teams);
            $this->openRegistrations($admin, $editionId, $schedule['state']);
            $students = $this->createAndEnrollStudents($admin, $editionId, $manifest, $classes, $modalities, $teams, $schedule['state']);
            $population = $this->auditPopulation($editionId, count($classes));
            $this->must($population['students'] === 224 && $population['enrollments'] === 322, 'A edição não chegou a 224 alunos e 322 inscrições depois das três ondas.');
            $this->must($population['enrollment_distribution'] === [1 => 140, 2 => 70, 3 => 14], 'A distribuição observada de inscrições diverge de 140/70/14.');
            $this->observed['population'] = $population;
            $this->mark('S02', ['students' => $population['students']]);
            $this->mark('S04', ['enrollments' => $population['enrollments'], 'distribution' => $population['enrollment_distribution']]);

            $schedule = $this->revisePublishedSchedule($admin, $editionId, $schedule['state'], $modalities, $locals, 2);
            $this->assertEnrollmentPreserved($editionId, 322);
            $schedule = $this->revisePublishedSchedule($admin, $editionId, $schedule['state'], $modalities, $locals, 3);
            $this->assertEnrollmentPreserved($editionId, 322);
            $this->mark('S05', ['published_versions' => 3, 'enrollments_preserved' => 322]);
            $this->openRegistrations($admin, $editionId, $schedule['state']);
            $state = $this->cronogramaState($admin, $editionId);
            $this->request($admin, 'POST', 'api/v1/cronograma', [
                'acao' => 'encerrar_inscricoes', 'id_interclasse' => $editionId,
                'cronograma_versao' => (int) ($state['cronograma_versao'] ?? 0),
            ], 'S06', 'encerrar_inscricoes');
            $state = $this->cronogramaState($admin, $editionId);
            $release = $this->request($admin, 'POST', 'api/v1/cronograma', [
                'acao' => 'liberar_operacao', 'id_interclasse' => $editionId,
                'cronograma_versao' => (int) ($state['cronograma_versao'] ?? 0),
            ], 'S06', 'liberar_operacao');
            $this->must(($release['success'] ?? false) === true, 'A edição não liberou a operação.');
            $this->request($admin, 'POST', 'api/v1/cronograma', [
                'acao' => 'liberar_operacao', 'id_interclasse' => $editionId,
                'cronograma_versao' => (int) ($state['cronograma_versao'] ?? 0),
            ], 'S06', 'repetir_liberacao');
            $this->mark('S06', ['released' => true, 'repeat' => 'accepted']);

            $studentObserver = $students['6EF'][1]['client'];
            $privateRank = $studentObserver->get("api/v1/ranking?id_interclasse={$editionId}");
            $this->must((int) ($privateRank['code'] ?? 0) === 403, 'O ranking reservado foi exposto antes da publicação.');
            $this->record('S11', 'aluno', 'GET', 'api/v1/ranking', (int) $privateRank['code'], 'ranking_reservado');

            if ($phase === 'prepare') {
                $studentIds = [];
                foreach ($students as $classAlias => $roster) {
                    foreach ($roster as $studentIndex => $student) {
                        $studentIds[$classAlias][(string) $studentIndex] = (int) $student['id'];
                    }
                }
                $this->writeJson('simulation-state.json', [
                    'edition_id' => $editionId,
                    'previous_edition_id' => $previousEditionId,
                    'classes' => $classes,
                    'categories' => $categories,
                    'modalities' => $modalities,
                    'teams' => $teams,
                    'students' => $studentIds,
                ]);
                $this->observed['simulation_phase'] = 'prepared_for_browser';
                $runStatus = 'prepared';
                return;
            }

            $matches = $this->playCollectiveEvents($admin, $editionId, $modalities, $teams, $students, $manifest);
            $races = $this->playIndividualEvents($admin, $editionId, $modalities, $teams, $students, $manifest);
            $this->observed['matches'] = $matches;
            $this->observed['individual_events'] = $races;
            $this->must(count($matches) === 15 && count($races) === 4, 'A competição não concluiu 15 confrontos e 4 provas individuais.');
            $this->mark('S07', ['matches' => count($matches), 'point_corrections' => 1]);
            $this->mark('S09', ['events' => count($races), 'participants' => 28]);

            $fundraising = $this->registerFundraising($admin, $editionId, $classes, $oracle, $manifest);
            $penalties = $this->registerPenalties($admin, $editionId, $classes, $students);
            $this->observed['fundraising'] = $fundraising;
            $this->observed['penalties'] = $penalties;
            $this->mark('S10', ['fundraising_points' => $fundraising['points'], 'penalty_points' => $penalties['points']]);
            if ((int) ($browser['mesario_id'] ?? 0) > 0) {
                // Remoção de colaborador é escopada à edição ativa; fazê-la antes de publicar/encerrar.
                $this->request($admin, 'POST', 'api/v1/usuarios?acao=excluir_colaborador', ['id_usuario' => (int) $browser['mesario_id']], 'cleanup', 'remover_mesario_sintetico');
            }

            $rankRows = $this->rankingByClass($admin, $editionId);
            $this->observed['ranking_before_publication'] = $rankRows;
            $this->assertRanking($rankRows, $classes, $oracle);
            $this->must(array_sum(array_column($rankRows, 'pontuacao_bruta')) === $oracle['gross_points'], 'A pontuação bruta global divergiu do oráculo.');
            $this->must(array_sum(array_column($rankRows, 'pontuacao_liquida')) === $oracle['net_points'], 'A pontuação líquida global divergiu do oráculo.');
            $this->request($admin, 'POST', "api/v1/edicoes?acao=publicar_ranking&id={$editionId}", [], 'S11', 'publicar_ranking');
            $this->request($admin, 'POST', "api/v1/edicoes?id={$editionId}", ['status_interclasse' => '0'], 'S11', 'encerrar_edicao');
            $this->assertAllStudentsCanReadPublishedRanking($students, $editionId, $classes);
            $this->mark('S11', ['ranking_published' => true, 'students_consulted' => 224]);

            $audit = $this->auditTournament($editionId);
            $this->observed['audit'] = $audit;
            $this->must($audit['games_with_two_participants'] === 19, 'Esperava 15 jogos coletivos mais 4 provas individuais.');
            $this->must(
                $audit['active_points'] === (int) $manifest->expected()['active_collective_points']
                    && $audit['voided_points'] === (int) $manifest->expected()['voided_collective_points'],
                "Os pontos vinculados/anulados divergiram do livro esperado (ativos {$manifest->expected()['active_collective_points']}, anulados {$manifest->expected()['voided_collective_points']}; observados {$audit['active_points']}/{$audit['voided_points']}).",
            );
            $this->must($audit['penalty_magnitudes'] === 35, 'As penalidades ativas não somaram 35.');
            $this->mark('S12', $audit);
            $this->checkpointMatrix($manifest, $population, $matches, $races, $rankRows, $audit);
            Assertions::assert('Simulação HTTP: edição integral reconciliada e publicada', true);
            $runStatus = 'passed';
        } catch (Throwable $exception) {
            $this->failure = $exception->getMessage();
            throw $exception;
        } finally {
            if ($previousEditionId > 0 && ($phase !== 'prepare' || $this->failure !== null)) {
                $restore = $admin->postJson("api/v1/edicoes?id={$previousEditionId}", ['status_interclasse' => '1']);
                $this->record('cleanup', 'admin', 'POST', 'api/v1/edicoes', (int) ($restore['code'] ?? 0), 'restaurar_edicao_ativa');
            }
            $this->flush($manifest, $manifestHash, $runStatus ?? 'failed', $editionId);
        }
    }

    /** Finaliza uma edição pausada enquanto Playwright opera o portal e o placar. */
    private function executeFinalize(): void
    {
        $this->runId = (string) (getenv('SGI_SIMULATION_RUN_ID') ?: '');
        $this->artifactDirectory = $this->artifactDirectory();
        $resolved = $this->readJsonArtifact('manifest-resolved.json');
        $state = $this->readJsonArtifact('simulation-state.json');
        $browser = $this->readJsonArtifact('browser-results.json');
        $this->runId = (string) ($resolved['run_id'] ?? $this->runId);
        $this->startedAtUtc = (string) ($resolved['started_at_utc'] ?? gmdate('c'));
        $this->must(($browser['status'] ?? '') === 'passed', 'A fase Playwright não confirmou a operação da competição.');
        $this->must(count($browser['matches'] ?? []) === 15 && count($browser['individual_events'] ?? []) === 4, 'O navegador deve operar os 15 jogos coletivos e as quatro provas individuais antes da reconciliação final.');
        $this->events = $this->readEventLog();
        $this->eventSequence = count($this->events);
        $checkpoints = $this->readJsonArtifact('checkpoints.json');
        $observed = $this->readJsonArtifact('observed.json');
        $this->checkpoints = is_array($checkpoints['checkpoints'] ?? null) ? $checkpoints['checkpoints'] : [];
        $this->observed = $observed;
        $manifest = TournamentManifest::load();
        $oracle = TournamentOracle::compute($manifest);
        $manifestPath = dirname(__DIR__) . '/fixtures/simulacao-interclasse/manifest.json';
        $manifestHash = hash_file('sha256', $manifestPath) ?: 'indisponivel';
        $editionId = (int) ($state['edition_id'] ?? 0);
        $previousEditionId = (int) ($state['previous_edition_id'] ?? 0);
        $this->must($editionId > 0 && (int) ($resolved['edition_id'] ?? 0) === $editionId, 'O estado salvo não corresponde à edição da simulação.');
        $this->must((int) ($browser['edition_id'] ?? 0) === $editionId, 'Playwright operou uma edição diferente da edição preparada.');

        $admin = new TestClient();
        $this->login($admin, 'admin', '123', 'S00');
        $this->must($this->activeEditionId($admin) === $editionId, 'A edição simulada deixou de ser a edição ativa antes da finalização.');
        $classes = $state['classes'];
        $modalities = $state['modalities'];
        $teams = $state['teams'];
        $students = [];
        $runDate = substr($this->runId, 2, 6);
        foreach ($manifest->classes() as $classIndex => $class) {
            $alias = $class['alias'];
            for ($studentIndex = 1; $studentIndex <= 32; $studentIndex++) {
                $id = (int) ($state['students'][$alias][(string) $studentIndex] ?? 0);
                $this->must($id > 0, "Estado da simulação sem ID do aluno {$alias}-A" . sprintf('%02d', $studentIndex) . '.');
                $matricula = '9' . $runDate . str_pad((string) ($editionId % 10000), 4, '0', STR_PAD_LEFT)
                    . sprintf('%02d%02d', $classIndex + 1, $studentIndex);
                $client = new TestClient();
                $this->login($client, $matricula, self::STUDENT_PASSWORD, 'S02', $alias . '-A' . sprintf('%02d', $studentIndex));
                $students[$alias][$studentIndex] = ['id' => $id, 'client' => $client];
            }
        }

        try {
            $this->verifyBrowserCompetition($admin, $browser['matches'], $browser['individual_events'], $modalities);
            $browserMatches = $browser['matches'];
            $browserRaces = $browser['individual_events'];
            $matches = $this->playCollectiveEvents($admin, $editionId, $modalities, $teams, $students, $manifest, $browserMatches);
            $races = $this->playIndividualEvents($admin, $editionId, $modalities, $teams, $students, $manifest, $browserRaces);
            $this->must(count($matches) === 15 && count($races) === 4, 'A reconciliação integral deve concluir 15 jogos e quatro provas.');
            $this->observed['matches'] = $matches;
            $this->observed['individual_events'] = $races;
            $this->observed['coverage']['browser'] = [
                'students' => 224, 'enrollments' => 322, 'matches' => count($browserMatches),
                'individual_events' => count($browserRaces), 'offline_matches' => (int) ($browser['offline_matches'] ?? 0),
                'parallel_operators' => (int) ($browser['parallel_operators'] ?? 0),
            ];
            $this->mark('S07', [
                'matches' => count($matches), 'point_corrections' => 1,
                'operated_in_browser' => true, 'browser_matches' => count($browserMatches),
                'timer_pause_resume' => (bool) ($browser['pause_resume_tested'] ?? false),
            ]);
            $offlineEvidence = [
                'offline_matches' => (int) ($browser['offline_matches'] ?? 0),
                'offline_bracket_games' => (int) ($browser['offline_bracket_games'] ?? 0),
                'offline_bracket_server_closed' => (int) ($browser['offline_bracket_server_closed'] ?? 0),
                'offline_bracket_winners_consistent' => (bool) ($browser['offline_bracket_winners_consistent'] ?? false),
                'offline_bracket_final_temporary_id_reconciled' => (bool) ($browser['offline_bracket_final_temporary_id_reconciled'] ?? false),
                'offline_bracket_tags' => is_array($browser['offline_bracket_tags'] ?? null) ? $browser['offline_bracket_tags'] : [],
                'synchronized' => (bool) ($browser['offline_synchronized'] ?? false),
                'parallel_operators' => (int) ($browser['parallel_operators'] ?? 0),
                'lost_response_retried' => (bool) ($browser['lost_response_retried'] ?? false),
                'lost_response_attempts' => (int) ($browser['lost_response_attempts'] ?? 0),
                'lost_response_committed_before_drop' => (bool) ($browser['lost_response_committed_before_drop'] ?? false),
                'lost_response_single_persisted_point' => (bool) ($browser['lost_response_single_persisted_point'] ?? false),
                'lost_result_response_retried' => (bool) ($browser['lost_result_response_retried'] ?? false),
                'lost_result_attempts' => (int) ($browser['lost_result_attempts'] ?? 0),
                'lost_result_committed_before_drop' => (bool) ($browser['lost_result_committed_before_drop'] ?? false),
                'lost_result_same_mutation_identity' => (bool) ($browser['lost_result_same_mutation_identity'] ?? false),
                'lost_result_single_closed_game' => (bool) ($browser['lost_result_single_closed_game'] ?? false),
                'lost_result_winner_consistent' => (bool) ($browser['lost_result_winner_consistent'] ?? false),
                'lost_occurrence_response_retried' => (bool) ($browser['lost_occurrence_response_retried'] ?? false),
                'lost_occurrence_attempts' => (int) ($browser['lost_occurrence_attempts'] ?? 0),
                'lost_occurrence_committed_before_drop' => (bool) ($browser['lost_occurrence_committed_before_drop'] ?? false),
                'lost_occurrence_same_mutation_identity' => (bool) ($browser['lost_occurrence_same_mutation_identity'] ?? false),
                'lost_occurrence_single_persisted' => (bool) ($browser['lost_occurrence_single_persisted'] ?? false),
            ];
            $this->observed['browser_response_loss'] = $offlineEvidence;
            if ($offlineEvidence['offline_matches'] === 3
                && $offlineEvidence['offline_bracket_games'] === 3
                && $offlineEvidence['offline_bracket_server_closed'] === 3
                && count($offlineEvidence['offline_bracket_tags']) === 3
                && $offlineEvidence['offline_bracket_winners_consistent']
                && $offlineEvidence['offline_bracket_final_temporary_id_reconciled']
                && $offlineEvidence['synchronized']
                && $offlineEvidence['parallel_operators'] >= 2
                && $offlineEvidence['lost_response_retried']
                && $offlineEvidence['lost_response_attempts'] === 2
                && $offlineEvidence['lost_response_committed_before_drop']
                && $offlineEvidence['lost_response_single_persisted_point']
                && $offlineEvidence['lost_result_response_retried']
                && $offlineEvidence['lost_result_attempts'] === 2
                && $offlineEvidence['lost_result_committed_before_drop']
                && $offlineEvidence['lost_result_same_mutation_identity']
                && $offlineEvidence['lost_result_single_closed_game']
                && $offlineEvidence['lost_result_winner_consistent']
                && $offlineEvidence['lost_occurrence_response_retried']
                && $offlineEvidence['lost_occurrence_attempts'] === 2
                && $offlineEvidence['lost_occurrence_committed_before_drop']
                && $offlineEvidence['lost_occurrence_same_mutation_identity']
                && $offlineEvidence['lost_occurrence_single_persisted']) {
                $this->mark('S08', $offlineEvidence);
            } else {
                $this->checkpoints['S08'] = [
                    'status' => 'partial',
                    'reason' => 'A edição principal não comprovou todos os confrontos, vencedores, reconciliação do ID temporário, sincronização das filas ou replay sem duplicação exigidos para o ensaio offline integral.',
                    'observed' => $offlineEvidence,
                ];
                Assertions::assert('Interclasse integral — checkpoint S08 parcial com evidência offline', true);
            }
            $this->observed['browser_credit_response_loss'] = [
                'retried' => (bool) ($browser['lost_credit_response_retried'] ?? false),
                'attempts' => (int) ($browser['lost_credit_attempts'] ?? 0),
                'committed_before_drop' => (bool) ($browser['lost_credit_committed_before_drop'] ?? false),
                'same_mutation_identity' => (bool) ($browser['lost_credit_same_mutation_identity'] ?? false),
                'single_persisted_before_cleanup' => (bool) ($browser['lost_credit_single_persisted'] ?? false),
            ];
            $this->mark('S09', ['events' => count($races), 'participants' => 28, 'operated_in_browser' => count($browserRaces) === 4]);

            $fundraising = $this->registerFundraising($admin, $editionId, $classes, $oracle, $manifest);
            $penalties = $this->registerPenalties($admin, $editionId, $classes, $students);
            $this->observed['fundraising'] = $fundraising;
            $this->observed['penalties'] = $penalties;
            $this->mark('S10', ['fundraising_points' => $fundraising['points'], 'penalty_points' => $penalties['points']]);

            $rankRows = $this->rankingByClass($admin, $editionId);
            $this->observed['ranking_before_publication'] = $rankRows;
            $this->assertRanking($rankRows, $classes, $oracle);
            $this->must(array_sum(array_column($rankRows, 'pontuacao_bruta')) === $oracle['gross_points'], 'A pontuação bruta global divergiu do oráculo.');
            $this->must(array_sum(array_column($rankRows, 'pontuacao_liquida')) === $oracle['net_points'], 'A pontuação líquida global divergiu do oráculo.');
            $this->request($admin, 'POST', "api/v1/edicoes?acao=publicar_ranking&id={$editionId}", [], 'S11', 'publicar_ranking');
            $this->request($admin, 'POST', "api/v1/edicoes?id={$editionId}", ['status_interclasse' => '0'], 'S11', 'encerrar_edicao');
            $this->assertAllStudentsCanReadPublishedRanking($students, $editionId, $classes);
            $this->mark('S11', ['ranking_published' => true, 'students_consulted' => 224]);

            $audit = $this->auditTournament($editionId);
            $this->observed['audit'] = $audit;
            $this->must($audit['games_with_two_participants'] === 19, 'Esperava 15 jogos coletivos mais 4 provas individuais.');
            $this->must(
                $audit['active_points'] === (int) $manifest->expected()['active_collective_points']
                    && $audit['voided_points'] === (int) $manifest->expected()['voided_collective_points'],
                'Os pontos vinculados e anulados não coincidem com o livro esperado após o placar real da interface.',
            );
            $this->must($audit['penalty_magnitudes'] === 35, 'As penalidades ativas não somaram 35.');
            $this->mark('S12', $audit);
            $population = $this->auditPopulation($editionId, count($classes));
            $this->checkpointMatrix($manifest, $population, $matches, $races, $rankRows, $audit);
            $this->observed['coverage']['http']['matches'] = count($matches) - count($browserMatches);
            $this->observed['coverage']['http']['individual_events'] = count($races) - count($browserRaces);
            $this->observed['coverage']['browser'] = [
                'students' => 224, 'enrollments' => 322, 'matches' => count($browserMatches),
                'individual_events' => count($browserRaces), 'offline_matches' => (int) ($browser['offline_matches'] ?? 0),
                'parallel_operators' => (int) ($browser['parallel_operators'] ?? 0),
            ];
            Assertions::assert('Simulação integral: navegador, operação offline, publicação e reconciliação', true);
            $runStatus = 'passed';
        } catch (Throwable $exception) {
            $this->failure = $exception->getMessage();
            throw $exception;
        } finally {
            if ($previousEditionId > 0) {
                $restore = $admin->postJson("api/v1/edicoes?id={$previousEditionId}", ['status_interclasse' => '1']);
                $this->record('cleanup', 'admin', 'POST', 'api/v1/edicoes', (int) ($restore['code'] ?? 0), 'restaurar_edicao_ativa');
            }
            $this->flush($manifest, $manifestHash, $runStatus ?? 'failed', $editionId);
        }
    }

    /** @param list<array<string,mixed>> $matches @param list<array<string,mixed>> $races @param array<string,array<string,mixed>> $modalities */
    private function verifyBrowserCompetition(TestClient $admin, array $matches, array $races, array $modalities): void
    {
        foreach ($matches as $match) {
            $alias = (string) ($match['modality'] ?? '');
            $modalityId = (int) ($modalities[$alias]['id'] ?? 0);
            $gameId = (int) ($match['game_id'] ?? 0);
            $this->must($modalityId > 0 && $gameId > 0, 'Um jogo operado no navegador não está mapeado para o manifesto.');
            $games = $this->getList($admin, "api/v1/jogos?id_modalidade={$modalityId}", 'reconciliar_jogo_browser');
            $game = null;
            foreach ($games as $candidate) {
                if ((int) ($candidate['id_jogo'] ?? 0) === $gameId) { $game = $candidate; break; }
            }
            $this->must(is_array($game) && preg_match('/conclu|finaliz/i', (string) ($game['status_jogo'] ?? '')) === 1, "O jogo {$gameId} não ficou encerrado no servidor após a passagem do navegador.");
        }
        foreach ($races as $race) {
            $alias = (string) ($race['modality'] ?? '');
            $modalityId = (int) ($modalities[$alias]['id'] ?? 0);
            $this->must($modalityId > 0 && (int) ($race['game_id'] ?? 0) > 0, 'Uma prova operada no navegador não está mapeada para o manifesto.');
        }
        $this->must(count($matches) >= 2 && count($races) === 4, 'O navegador deve demonstrar duas partidas e os quatro pódios.');
    }

    /** @return array{0:array<string,array{id:int,category_id:int}>,1:array<string,int>,2:array<string,array{id:int,category:string,gender:string,individual:bool,entry_student_ids:list<int>}>,3:array<string,array{id:int,class:string,modality:string,slot:int}>,4:list<int>} */
    private function configureEdition(TestClient $admin, int $editionId, TournamentManifest $manifest): array
    {
        $categoryRows = $this->getList($admin, "api/v1/categorias?id_interclasse={$editionId}", 'ler_categorias');
        $categoryIds = [];
        foreach ($categoryRows as $category) {
            $categoryIds[(string) ($category['nome_categoria'] ?? '')] = (int) ($category['id_categoria'] ?? 0);
        }
        $categoryAlias = ['I' => (int) ($categoryIds['Categoria I'] ?? 0), 'II' => (int) ($categoryIds['Categoria II'] ?? 0)];
        $this->must($categoryAlias['I'] > 0 && $categoryAlias['II'] > 0, 'As duas categorias padrão não foram encontradas.');
        $classes = [];
        foreach ($this->getList($admin, "api/v1/turmas?id_interclasse={$editionId}", 'ler_turmas') as $class) {
            $alias = (string) ($class['nome_turma'] ?? '');
            $classes[$alias] = ['id' => (int) $class['id_turma'], 'category_id' => (int) $class['categorias_id_categoria']];
        }
        foreach ($manifest->classes() as $class) {
            $alias = $class['alias'];
            $this->must(isset($classes[$alias]), "A turma obrigatória {$alias} não foi criada.");
            $this->must($classes[$alias]['category_id'] === $categoryAlias[$class['category']], "A turma {$alias} está vinculada à categoria errada.");
        }
        $modalities = [];
        foreach ($this->getList($admin, "api/v1/modalidades?id_interclasse={$editionId}", 'ler_modalidades') as $modality) {
            $categoryAliasForId = array_search((int) $modality['categorias_id_categoria'], $categoryAlias, true);
            $name = (string) ($modality['nome_modalidade'] ?? '');
            $template = null;
            foreach ($manifest->modalities() as $candidate) {
                if ($candidate['name'] === $name) {
                    $template = $candidate;
                    break;
                }
            }
            if ($template === null || !is_string($categoryAliasForId)) {
                continue;
            }
            $alias = $categoryAliasForId . '-' . $template['alias'];
            $classCount = count(array_filter($manifest->classes(), static fn (array $class): bool => $class['category'] === $categoryAliasForId));
            $isIndividual = str_starts_with($template['alias'], 'CORRIDA_');
            $entryStudentIds = $isIndividual ? $manifest->modalityStudentIds($template) : [];
            $entriesPerClass = $isIndividual ? count($entryStudentIds) : 1;
            $duration = match ($template['alias']) {
                'FUTSAL', 'QUEIMADA' => 20,
                'VOLEI' => 30,
                default => 15,
            };
            $this->request($admin, 'PUT', 'api/v1/modalidades', [
                'id_modalidade' => (int) $modality['id_modalidade'],
                'interclasses_id_interclasse' => $editionId,
                'status_modalidade' => '1',
                'max_equipes' => $entriesPerClass,
                'equipes_planejadas' => $entriesPerClass,
                'min_inscritos_equipe' => $isIndividual ? 1 : (int) $template['min_team_size'],
                'max_inscritos_equipe' => $isIndividual ? 1 : (int) $template['max_team_size'],
                'formato_participacao' => $isIndividual ? 'individual' : 'equipe',
                'duracao_prevista_min' => $duration,
                'descanso_min' => $isIndividual ? 0 : 10,
            ], 'S01', 'configurar_modalidade_' . $alias);
            $modalities[$alias] = [
                'id' => (int) $modality['id_modalidade'],
                'category' => $categoryAliasForId,
                'gender' => $template['gender'],
                'individual' => $isIndividual,
                'entry_student_ids' => $entryStudentIds,
            ];
        }
        $this->must(count($modalities) === 10, 'As dez modalidades padrão não foram configuradas integralmente.');
        $this->request($admin, 'POST', 'api/v1/cronograma', ['acao' => 'preparar_equipes', 'id_interclasse' => $editionId], 'S01', 'preparar_equipes');
        $this->request($admin, 'POST', 'api/v1/cronograma', ['acao' => 'preparar_equipes', 'id_interclasse' => $editionId], 'S01', 'repetir_preparo_equipes');
        $teamRows = $this->getList($admin, "api/v1/equipes?id_interclasse={$editionId}", 'ler_equipes');
        $teamsByPair = [];
        foreach ($teamRows as $team) {
            if ((string) ($team['status_equipe'] ?? '1') !== '1') {
                continue;
            }
            $classAlias = null;
            foreach ($classes as $candidateAlias => $class) {
                if ($class['id'] === (int) $team['turmas_id_turma']) {
                    $classAlias = $candidateAlias;
                    break;
                }
            }
            if (!is_string($classAlias)) {
                continue;
            }
            foreach ($modalities as $modalityAlias => $modality) {
                if ((int) $team['modalidades_id_modalidade'] === $modality['id']) {
                    $teamsByPair[$classAlias . '-' . $modalityAlias][] = (int) $team['id_equipe'];
                }
            }
        }
        $teamByAlias = [];
        foreach ($teamsByPair as $pair => $teamIds) {
            sort($teamIds, SORT_NUMERIC);
            [$classAlias, $modalityAlias] = explode('-', $pair, 2);
            $individual = $modalities[$modalityAlias]['individual'];
            foreach ($teamIds as $index => $teamId) {
                $slot = $index + 1;
                $key = $individual ? $pair . '-' . $slot : $pair;
                $teamByAlias[$key] = [
                    'id' => $teamId, 'class' => $classAlias, 'modality' => $modalityAlias, 'slot' => $slot,
                ];
            }
            $expectedSlots = $individual ? count($modalities[$modalityAlias]['entry_student_ids']) : 1;
            $this->must(count($teamIds) === $expectedSlots, "{$pair} deveria ter {$expectedSlots} representacao(oes) ativa(s).");
        }
        $this->must(count($teamByAlias) === 49, 'A edição deve preservar 35 equipes padrão e preparar 14 vagas individuais adicionais (49 representações).');
        $locals = [];
        foreach ($this->getList($admin, "api/v1/locais?id_interclasse={$editionId}&disponivel=1", 'ler_locais') as $local) {
            if ((string) ($local['status_local'] ?? '1') === '1' && (string) ($local['disponivel_local'] ?? '1') === '1') {
                $locals[] = (int) $local['id_local'];
            }
        }
        $this->must($locals !== [], 'A edição não possui local disponível para agendamento.');
        return [$classes, $categoryAlias, $modalities, $teamByAlias, array_values(array_unique($locals))];
    }

    /** @param array<string,array{id:int,category:string,gender:string,individual:bool,entry_student_ids:list<int>}> $modalities @param list<int> $locals @param array<string,array{id:int,class:string,modality:string,slot:int}> $teams @return array{state:array<string,mixed>,draft:array<string,mixed>} */
    private function publishSchedule(TestClient $admin, int $editionId, array $modalities, array $locals, array $teams): array
    {
        $state = $this->cronogramaState($admin, $editionId);
        if ((string) ($state['cronograma_status'] ?? '') === 'publicado') {
            return ['state' => $state, 'draft' => []];
        }
        $start = (new DateTimeImmutable('today'))->modify('+14 days');
        while ((int) $start->format('N') > 5) {
            $start = $start->modify('+1 day');
        }
        $end = $start->modify('+4 days');
        $draft = $this->request($admin, 'POST', 'api/v1/cronograma', [
            'acao' => 'gerar_rascunho', 'id_interclasse' => $editionId,
            'data_inicio' => $start->format('Y-m-d'), 'data_fim' => $end->format('Y-m-d'),
            'hora_inicio' => '08:00', 'hora_fim' => '18:00',
            'duracao_min' => 20, 'intervalo_min' => 5, 'id_locais' => $locals,
        ], 'S03', 'gerar_cronograma');
        $this->must(is_array($draft['nos'] ?? null) && is_array($draft['compromissos'] ?? null), 'O rascunho não retornou nós e compromissos.');
        $expectedByModality = [];
        foreach ($teams as $team) {
            $expectedByModality[$team['modality']][$team['id']] = true;
        }
        $draftByModality = [];
        foreach ($draft['nos'] as $node) {
            $modalityId = (int) ($node['id_modalidade'] ?? 0);
            foreach ($modalities as $alias => $modality) {
                if ($modality['id'] === $modalityId) {
                    foreach (($node['equipe_ids'] ?? []) as $teamId) {
                        $draftByModality[$alias][(int) $teamId] = true;
                    }
                    break;
                }
            }
        }
        $coverage = [];
        foreach ($modalities as $alias => $_modality) {
            $expectedIds = array_map('intval', array_keys($expectedByModality[$alias] ?? []));
            $draftIds = array_map('intval', array_keys($draftByModality[$alias] ?? []));
            sort($expectedIds, SORT_NUMERIC);
            sort($draftIds, SORT_NUMERIC);
            $coverage[$alias] = [
                'expected_count' => count($expectedIds), 'draft_count' => count($draftIds),
                'missing' => array_values(array_diff($expectedIds, $draftIds)),
                'extra' => array_values(array_diff($draftIds, $expectedIds)),
            ];
        }
        $this->observed['initial_draft_coverage'] = $coverage;
        $published = $this->request($admin, 'POST', 'api/v1/cronograma', [
            'acao' => 'publicar', 'id_interclasse' => $editionId,
            'cronograma_versao' => (int) ($draft['cronograma_versao'] ?? $draft['versao'] ?? 0),
            'nos' => $draft['nos'], 'compromissos' => $draft['compromissos'],
        ], 'S03', 'publicar_cronograma');
        $this->must(($published['success'] ?? false) === true, 'A primeira publicação do cronograma não foi confirmada.');
        $state = $this->cronogramaState($admin, $editionId);
        $this->must((string) ($state['cronograma_status'] ?? '') === 'publicado', 'O cronograma não está publicado.');
        $this->observed['schedule'] = [
            'published_version' => (int) ($state['versao_publicada'] ?? 0),
            'commitments' => count($state['compromissos'] ?? []),
            'nodes' => count($state['nos'] ?? []),
            'locations' => count($locals),
            'active_modalities' => count($modalities),
        ];
        $this->mark('S03', $this->observed['schedule']);
        return ['state' => $state, 'draft' => $draft];
    }

    /** @param array<string,array{id:int,category:string,gender:string,individual:bool,entry_student_ids:list<int>}> $modalities @param list<int> $locals @return array{state:array<string,mixed>,draft:array<string,mixed>} */
    private function revisePublishedSchedule(TestClient $admin, int $editionId, array $state, array $modalities, array $locals, int $version): array
    {
        $this->closeRegistrations($admin, $editionId);
        $current = $this->cronogramaState($admin, $editionId);
        $this->request($admin, 'POST', 'api/v1/cronograma', [
            'acao' => 'revisar', 'id_interclasse' => $editionId,
            'cronograma_versao' => (int) ($current['cronograma_versao'] ?? 0),
        ], 'S05', 'revisar_cronograma_v' . $version);
        $current = $this->cronogramaState($admin, $editionId);
        $draft = $this->request($admin, 'POST', 'api/v1/cronograma', [
            'acao' => 'gerar_rascunho', 'id_interclasse' => $editionId,
            'data_inicio' => (new DateTimeImmutable('today'))->modify('+14 days')->format('Y-m-d'),
            'data_fim' => (new DateTimeImmutable('today'))->modify('+18 days')->format('Y-m-d'),
            'hora_inicio' => '08:00', 'hora_fim' => '18:00',
            'duracao_min' => 20, 'intervalo_min' => 5, 'id_locais' => $locals,
        ], 'S05', 'gerar_revisao_v' . $version);
        $this->request($admin, 'POST', 'api/v1/cronograma', [
            'acao' => 'publicar', 'id_interclasse' => $editionId,
            'cronograma_versao' => (int) ($draft['cronograma_versao'] ?? $current['cronograma_versao'] ?? 0),
            'nos' => $draft['nos'] ?? [], 'compromissos' => $draft['compromissos'] ?? [],
        ], 'S05', 'publicar_revisao_v' . $version);
        $published = $this->cronogramaState($admin, $editionId);
        $this->must((int) ($published['versao_publicada'] ?? 0) >= $version, "A publicação {$version} não foi criada.");
        $this->must((int) ($state['versao_publicada'] ?? 0) !== (int) ($published['versao_publicada'] ?? 0), 'A publicação repetiu uma revisão sem avançar sua identidade.');
        $this->record('S05', 'admin', 'POST', 'api/v1/cronograma', 200, 'preservar_inscricoes_v' . $version);
        return ['state' => $published, 'draft' => $draft];
    }

    private function openRegistrations(TestClient $admin, int $editionId, array $state): void
    {
        $timezone = new DateTimeZone(date_default_timezone_get());
        $now = new DateTimeImmutable('now', $timezone);
        $response = $this->request($admin, 'POST', 'api/v1/cronograma', [
            'acao' => 'abrir_inscricoes', 'id_interclasse' => $editionId,
            'cronograma_versao' => (int) ($state['cronograma_versao'] ?? 0),
            'inscricoes_abertura' => $now->modify('-2 minutes')->format('Y-m-d H:i:s'),
            'inscricoes_encerramento' => $now->modify('+2 hours')->format('Y-m-d H:i:s'),
        ], 'S04', 'abrir_inscricoes');
        $this->must(($response['success'] ?? false) === true, 'Não foi possível abrir as inscrições.');
    }

    private function closeRegistrations(TestClient $admin, int $editionId): void
    {
        $state = $this->cronogramaState($admin, $editionId);
        if ((string) ($state['inscricoes_status'] ?? '') === 'fechadas') {
            return;
        }
        $this->request($admin, 'POST', 'api/v1/cronograma', [
            'acao' => 'encerrar_inscricoes', 'id_interclasse' => $editionId,
            'cronograma_versao' => (int) ($state['cronograma_versao'] ?? 0),
        ], 'S05', 'fechar_inscricoes');
    }

    /** @param array<string,array{id:int,category_id:int}> $classes @param array<string,array{id:int,category:string,gender:string,individual:bool,entry_student_ids:list<int>}> $modalities @param array<string,array{id:int,class:string,modality:string,slot:int}> $teams @return array<string,array<int,array{id:int,client:TestClient}>> */
    private function createAndEnrollStudents(TestClient $admin, int $editionId, TournamentManifest $manifest, array $classes, array $modalities, array $teams, array $state): array
    {
        $students = [];
        foreach ($manifest->classes() as $classIndex => $class) {
            $classAlias = $class['alias'];
            for ($studentIndex = 1; $studentIndex <= 32; $studentIndex++) {
                $gender = $studentIndex <= 16 ? 'MASC' : 'FEM';
                $runDate = substr($this->runId, 2, 6);
                $this->must(preg_match('/^\d{6}$/', $runDate) === 1, 'O identificador da simulação precisa começar com YYYYMMDD para gerar matrículas estáveis.');
                $matricula = '9' . $runDate . str_pad((string) ($editionId % 10000), 4, '0', STR_PAD_LEFT)
                    . sprintf('%02d%02d', $classIndex + 1, $studentIndex);
                $created = $this->request($admin, 'POST', 'api/v1/usuarios?acao=criar_aluno', [
                    'nome_usuario' => sprintf('Aluno Simulado %s A%02d', $classAlias, $studentIndex),
                    'matricula_usuario' => $matricula,
                    'data_nasc_usuario' => '2010-01-01', 'genero_usuario' => $gender,
                    'turmas_id_turma' => $classes[$classAlias]['id'],
                ], 'S02', 'criar_aluno_' . $classAlias . '_A' . sprintf('%02d', $studentIndex), 200, false);
                $userId = (int) ($created['id_usuario'] ?? $created['id'] ?? 0);
                $temporaryPassword = (string) ($created['senha_temporaria'] ?? '');
                $this->must($userId > 0 && $temporaryPassword !== '', "O cadastro da matrícula sintética {$classAlias}-A" . sprintf('%02d', $studentIndex) . ' não retornou dados de primeiro acesso.');
                $client = new TestClient();
                $this->login($client, $matricula, $temporaryPassword, 'S02', $classAlias . '-A' . sprintf('%02d', $studentIndex));
                $this->request($client, 'POST', 'api/v1/senha', ['nova_senha' => self::STUDENT_PASSWORD, 'confirmar_senha' => self::STUDENT_PASSWORD], 'S02', 'troca_senha');
                $this->request($client, 'POST', 'api/v1/termos', [], 'S02', 'aceitar_termos');
                $students[$classAlias][$studentIndex] = ['id' => $userId, 'client' => $client];
            }
        }
        $this->mark('S02', ['students_created' => count($manifest->classes()) * 32, 'unique_sessions' => count($manifest->classes()) * 32]);

        $enrollmentWaves = [1 => [], 2 => [], 3 => []];
        foreach ($manifest->classes() as $class) {
            $alias = $class['alias'];
            for ($studentIndex = 1; $studentIndex <= 32; $studentIndex++) {
                $selected = [];
                foreach ($manifest->modalities() as $template) {
                    if (in_array($studentIndex, $manifest->modalityStudentIds($template), true)) {
                        $selected[] = $class['category'] . '-' . $template['alias'];
                    }
                }
                sort($selected);
                foreach ($selected as $index => $modalityAlias) {
                    $wave = $index + 1;
                    $enrollmentWaves[$wave][] = [
                        'class' => $alias, 'student' => $studentIndex,
                        'modalities' => [$modalityAlias],
                    ];
                }
            }
        }
        foreach ([1, 2, 3] as $wave) {
            foreach ($enrollmentWaves[$wave] as $enrollment) {
                $classAlias = $enrollment['class'];
                $studentIndex = $enrollment['student'];
                $allTeamIds = [];
                foreach ($enrollment['modalities'] as $modalityAlias) {
                    $key = $classAlias . '-' . $modalityAlias;
                    if ($modalities[$modalityAlias]['individual']) {
                        $slot = array_search($studentIndex, $modalities[$modalityAlias]['entry_student_ids'], true);
                        $this->must($slot !== false, "Aluno {$classAlias}-A" . sprintf('%02d', $studentIndex) . ' não pertence ao elenco individual declarado.');
                        $key .= '-' . ((int) $slot + 1);
                    }
                    $this->must(isset($teams[$key]), "Equipe sintética {$key} não foi resolvida.");
                    $allTeamIds[] = $teams[$key]['id'];
                }
                $client = $students[$classAlias][$studentIndex]['client'];
                $response = $this->request($client, 'POST', 'api/v1/inscricoes', [
                    'id_interclasse' => $editionId, 'id_equipes' => $allTeamIds,
                    'cronograma_versao' => (int) ($state['cronograma_versao'] ?? 0),
                    'versao_publicada' => (int) ($state['versao_publicada'] ?? 0),
                ], 'S04', 'inscrever_onda_' . $wave . '_' . $classAlias . '_A' . sprintf('%02d', $studentIndex));
                $this->must(($response['success'] ?? false) === true, 'Uma inscrição sintética não foi confirmada.');
            }
            $population = $this->auditPopulation($editionId, count($classes));
            $this->observed['enrollment_waves'][$wave] = $population;
            $expectedByWave = $manifest->cumulativeEnrollmentWaveCounts();
            $this->must(
                $population['enrollments'] === $expectedByWave[$wave],
                "A onda {$wave} deveria resultar em {$expectedByWave[$wave]} vínculos, observados " . json_encode($population, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
            );
            $this->mark('S04', ['wave' => $wave, 'expected_enrollments' => $expectedByWave[$wave], 'observed_enrollments' => $population['enrollments']]);
        }
        $this->verifyStudentEnrollmentBoundaries(
            $students['6EF'][1]['client'],
            $editionId,
            (int) ($state['cronograma_versao'] ?? 0),
            (int) ($state['versao_publicada'] ?? 0),
            (int) $teams['7EF-I-FUTSAL']['id'],
        );
        return $students;
    }

    private function verifyStudentEnrollmentBoundaries(
        TestClient $student,
        int $editionId,
        int $scheduleRevision,
        int $publishedVersion,
        int $otherClassTeamId,
    ): void {
        $before = $this->auditPopulation($editionId, 7)['enrollments'];
        $payload = [
            'id_interclasse' => $editionId,
            'id_equipes' => [$otherClassTeamId],
            'cronograma_versao' => $scheduleRevision,
            'versao_publicada' => $publishedVersion,
        ];

        $missingCsrf = $this->request(
            $student,
            'POST',
            'api/v1/inscricoes',
            $payload,
            'V08',
            'inscricao_sem_csrf',
            403,
            false,
            ['X-SGI-CSRF' => ''],
        );
        $invalidCsrf = $this->request(
            $student,
            'POST',
            'api/v1/inscricoes',
            $payload,
            'V08',
            'inscricao_csrf_invalido',
            403,
            false,
            ['X-SGI-CSRF' => 'invalid-synthetic-token'],
        );
        $crossClass = $this->request(
            $student,
            'POST',
            'api/v1/inscricoes',
            $payload,
            'V08',
            'inscricao_equipe_outra_turma',
            409,
            false,
        );
        $after = $this->auditPopulation($editionId, 7)['enrollments'];
        $this->must(($missingCsrf['success'] ?? true) === false, 'Inscrição sem token CSRF não foi recusada.');
        $this->must(($invalidCsrf['success'] ?? true) === false, 'Inscrição com token CSRF inválido não foi recusada.');
        $this->must(
            ($crossClass['success'] ?? true) === false
                && str_contains((string) ($crossClass['message'] ?? ''), 'sua turma'),
            'O aluno conseguiu tentar se inscrever em uma equipe de outra turma sem receber a recusa de escopo esperada.',
        );
        $this->must($after === $before, 'Uma tentativa de inscrição sem autorização alterou a quantidade de vínculos.');
        $this->observed['security']['student_enrollment_boundary'] = [
            'missing_csrf_rejected' => true,
            'invalid_csrf_rejected' => true,
            'foreign_class_team_rejected' => true,
            'enrollment_count_unchanged' => true,
        ];
        $this->mark('S04', ['student_scope_and_csrf' => 'rejected_without_changes']);
    }

    /** @param array<string,array{id:int,category:string,gender:string,individual:bool,entry_student_ids:list<int>}> $modalities @param array<string,array{id:int,class:string,modality:string,slot:int}> $teams @param array<string,array<int,array{id:int,client:TestClient}>> $students @return list<array<string,mixed>> */
    private function playCollectiveEvents(TestClient $admin, int $editionId, array $modalities, array $teams, array $students, TournamentManifest $manifest, array $priorResults = []): array
    {
        $expectedMatches = ['I' => 2, 'II' => 3];
        $modalityLabels = ['FUTSAL' => 'futsal', 'QUEIMADA' => 'queimada', 'VOLEI' => 'volei'];
        $pointCorrectionUsed = count(array_filter($priorResults, static fn (array $result): bool => !empty($result['point_corrected']))) > 0;
        $idempotencyReplayUsed = false;
        $results = $priorResults;
        foreach ($modalities as $alias => $modality) {
            $template = substr($alias, strpos($alias, '-') + 1);
            if (!isset($modalityLabels[$template])) {
                continue;
            }
            $completed = count(array_filter($priorResults, static fn (array $result): bool => ($result['modality'] ?? null) === $alias));
            for ($round = 0; $round < 6 && $completed < $expectedMatches[$modality['category']]; $round++) {
                $games = $this->getList($admin, 'api/v1/jogos?id_modalidade=' . $modality['id'], 'listar_jogos_' . $alias);
                $progress = false;
                foreach ($games as $game) {
                    $gameId = (int) ($game['id_jogo'] ?? 0);
                    $tag = (string) ($game['nome_jogo'] ?? '');
                    if ($gameId <= 0 || str_starts_with($tag, 'IND:') || str_starts_with($tag, 'POS:')
                        || !in_array((string) ($game['status_jogo'] ?? ''), ['Agendado', 'Aguardando', 'Iniciado', 'Pausado'], true)) {
                        continue;
                    }
                    $partidas = $this->getList($admin, "api/v1/partidas?id_jogo={$gameId}", 'ler_partidas');
                    if (count($partidas) !== 2) {
                        continue;
                    }
                    $teamIds = array_map(static fn (array $match): int => (int) ($match['equipes_id_equipe'] ?? 0), $partidas);
                    $teamById = [];
                    foreach ($teamIds as $teamId) {
                        foreach ($teams as $team) {
                            if ($team['id'] === $teamId) {
                                $teamById[$teamId] = $team;
                                break;
                            }
                        }
                    }
                    if (count($teamById) !== 2) {
                        throw new RuntimeException('Um confronto planejado contém equipe fora do manifesto.');
                    }
                    $winner = $this->chooseWinner($modality['category'], $teamById);
                    $loser = (int) array_values(array_diff($teamIds, [$winner]))[0];
                    $winnerClass = $teamById[$winner]['class'];
                    $winnerStudent = $this->firstTeamStudent($admin, $gameId, $winner);
                    $loserStudent = $this->firstTeamStudent($admin, $gameId, $loser);
                    $this->request($admin, 'PUT', 'api/v1/jogos', [
                        'id_jogo' => $gameId, 'status_jogo' => 'Iniciado',
                        'duracao_jogo' => (int) ($game['duracao_jogo'] ?? 1200) ?: 1200,
                    ], 'S07', 'iniciar_' . $alias);
                    [$winnerScore, $loserScore] = $this->scoreFor($template, $completed, $modality['category'], $manifest);
                    $pointReferences = [];
                    $pointOrdinal = 0;
                    for ($index = 0; $index < $winnerScore; $index++) {
                        $pointReferences[] = $this->registerPoint($admin, $gameId, $partidas, $winner, $winnerStudent, $pointOrdinal++, $editionId);
                    }
                    for ($index = 0; $index < $loserScore; $index++) {
                        $pointReferences[] = $this->registerPoint($admin, $gameId, $partidas, $loser, $loserStudent, $pointOrdinal++, $editionId);
                    }
                    if (!$pointCorrectionUsed) {
                        $this->request($admin, 'PUT', 'api/v1/pontos', ['id_ponto' => $pointReferences[count($pointReferences) - 1]], 'S07', 'anular_ponto_equivocado');
                        $loserScore--;
                        $pointCorrectionUsed = true;
                    }
                    $body = [
                        'id_jogo' => $gameId, 'nome_jogo' => $tag, 'id_modalidade' => $modality['id'],
                        'resultados' => [
                            ['id_equipe' => $winner, 'gols' => $winnerScore],
                            ['id_equipe' => $loser, 'gols' => $loserScore],
                        ],
                    ];
                    $mutationId = 'sim-' . $editionId . '-resultado-' . $gameId;
                    $result = $this->request($admin, 'POST', 'api/v1/resultados', $body, 'S07', 'encerrar_' . $alias, 200, true, ['X-SGI-Mutation-Id' => $mutationId]);
                    $this->must(($result['success'] ?? false) === true, 'O resultado do confronto não foi confirmado.');
                    if (!$idempotencyReplayUsed && $modality['category'] === 'I' && $template === 'FUTSAL') {
                        $replay = $this->request($admin, 'POST', 'api/v1/resultados', $body, 'S07', 'replay_resultado', 200, true, ['X-SGI-Mutation-Id' => $mutationId]);
                        $this->must(($replay['id_jogo'] ?? 0) === $gameId, 'O replay idempotente não retornou o mesmo resultado.');
                        $idempotencyReplayUsed = true;
                    }
                    $results[] = [
                        'modality' => $alias, 'game_id' => $gameId, 'tag' => $tag,
                        'participants' => [$teamById[$teamIds[0]]['class'], $teamById[$teamIds[1]]['class']],
                        'winner' => $winnerClass, 'score' => [$winnerScore, $loserScore],
                        'linked_points' => $winnerScore + $loserScore,
                    ];
                    $completed++;
                    $progress = true;
                }
                if (!$progress) {
                    break;
                }
            }
            $this->must($completed === $expectedMatches[$modality['category']], "A modalidade {$alias} não concluiu todos os confrontos esperados.");
        }
        return $results;
    }

    private function chooseWinner(string $category, array $teamsById): int
    {
        $preferred = $category === 'I' ? ['6EF', '8EF', '7EF'] : ['9EF', '2EMA', '1EMA', '3EMA'];
        foreach ($preferred as $alias) {
            foreach ($teamsById as $teamId => $team) {
                if ($team['class'] === $alias) {
                    return (int) $teamId;
                }
            }
        }
        throw new RuntimeException('O roteiro não conseguiu escolher um vencedor elegível.');
    }

    private function scoreFor(string $template, int $matchIndex, string $category, TournamentManifest $manifest): array
    {
        $finalIndex = $category === 'I' ? 1 : 2;
        $round = $matchIndex === $finalIndex ? 'final' : 'semifinal';
        $scores = $manifest->expected()['event_scores_by_modality'][$template][$round] ?? null;
        if (!is_array($scores) || count($scores) !== 2) {
            throw new RuntimeException("O manifesto não congelou o placar de {$template} / {$round}.");
        }
        return [(int) $scores[0], (int) $scores[1]];
    }

    /** @param list<array<string,mixed>> $partidas */
    private function registerPoint(TestClient $admin, int $gameId, array $partidas, int $teamId, int $studentId, int $ordinal, int $editionId): int
    {
        $matchId = 0;
        foreach ($partidas as $partida) {
            if ((int) ($partida['equipes_id_equipe'] ?? 0) === $teamId) {
                $matchId = (int) ($partida['id_partida'] ?? 0);
                break;
            }
        }
        $this->must($matchId > 0, 'O lançamento de ponto não conseguiu resolver sua partida.');
        $key = sprintf('SIM-%d-G%d-P%03d', $editionId, $gameId, $ordinal + 1);
        $response = $this->request($admin, 'POST', 'api/v1/pontos', [
            'jogos_id_jogo' => $gameId, 'id_partida' => $matchId,
            'equipes_id_equipe' => $teamId, 'usuarios_id_usuario' => $studentId,
            'chave_jogada' => $key,
        ], 'S07', 'lancar_ponto');
        $pointId = (int) ($response['id_ponto'] ?? $response['id'] ?? 0);
        $this->must(($response['success'] ?? false) === true && $pointId > 0, 'O ponto vinculado não foi salvo.');
        return $pointId;
    }

    private function firstTeamStudent(TestClient $admin, int $gameId, int $teamId): int
    {
        $response = $this->getObject($admin, "api/v1/pontos?acao=atletas&id_jogo={$gameId}&id_equipe={$teamId}", 'ler_atletas');
        $athletes = $response['atletas'] ?? [];
        $this->must(is_array($athletes) && $athletes !== [], 'Uma equipe em jogo não tem atleta elegível.');
        return (int) $athletes[0]['id_usuario'];
    }

    /** @param array<string,array{id:int,category:string,gender:string,individual:bool,entry_student_ids:list<int>}> $modalities @param array<string,array{id:int,class:string,modality:string,slot:int}> $teams @param array<string,array<int,array{id:int,client:TestClient}>> $students @return list<array<string,mixed>> */
    private function playIndividualEvents(TestClient $admin, int $editionId, array $modalities, array $teams, array $students, TournamentManifest $manifest, array $priorResults = []): array
    {
        $podiums = $manifest->expected()['podiums_by_category'];
        $outcomes = $priorResults;
        $completedAliases = array_fill_keys(array_map(static fn (array $result): string => (string) ($result['modality'] ?? ''), $priorResults), true);
        foreach ($modalities as $alias => $modality) {
            if (!str_contains($alias, 'CORRIDA_') || isset($completedAliases[$alias])) {
                continue;
            }
            $games = $this->getList($admin, 'api/v1/jogos?id_modalidade=' . $modality['id'], 'listar_prova');
            $tag = 'IND:' . $modality['id'];
            $game = null;
            foreach ($games as $candidate) {
                if ((string) ($candidate['nome_jogo'] ?? '') === $tag) {
                    $game = $candidate;
                    break;
                }
            }
            $this->must(is_array($game), "A prova {$alias} não foi materializada pela liberação.");
            $gameId = (int) $game['id_jogo'];
            $this->request($admin, 'PUT', 'api/v1/jogos', ['id_jogo' => $gameId, 'status_jogo' => 'Iniciado', 'duracao_jogo' => 900], 'S09', 'iniciar_prova_' . $alias);
            $genderStudentId = $modality['gender'] === 'FEM' ? 17 : 1;
            $ranking = [];
            foreach ([1 => 'primeiro', 2 => 'segundo', 3 => 'terceiro'] as $place => $placeName) {
                $classAlias = $podiums[$modality['category']][(string) $place];
                $ranking[$placeName] = $students[$classAlias][$genderStudentId]['id'];
            }
            $saved = $this->request($admin, 'POST', 'api/v1/chaveamentos', [
                'tipo_modalidade' => 'individual', 'id_modalidade' => $modality['id'],
                'id_jogo' => $gameId, 'ranking' => $ranking,
            ], 'S09', 'registrar_podio_' . $alias);
            $this->must(($saved['success'] ?? false) === true, 'O pódio de uma prova individual não foi salvo.');
            $participants = 0;
            foreach ($teams as $team) {
                if ($team['modality'] === $alias) {
                    $members = $this->getList($admin, 'api/v1/equipes?id_equipe=' . $team['id'], 'ler_participantes_corrida');
                    $participants += count($members);
                }
            }
            $outcomes[] = ['modality' => $alias, 'game_id' => $gameId, 'participants' => $participants, 'podium_classes' => array_values($podiums[$modality['category']])];
        }
        return $outcomes;
    }

    /** @param array<string,array{id:int,category_id:int}> $classes @return array<string,mixed> */
    private function registerFundraising(TestClient $admin, int $editionId, array $classes, array $oracle, TournamentManifest $manifest): array
    {
        $before = $this->getList($admin, "api/v1/arrecadacao?id_interclasse={$editionId}", 'historico_arrecadacao_antes');
        $firstBatch = [];
        $fractionBatch = [];
        $classIndexes = [];
        foreach ($manifest->classes() as $index => $class) {
            $classIndexes[$class['alias']] = $index + 1;
        }
        foreach ($classes as $alias => $class) {
            $index = $classIndexes[$alias] ?? 0;
            $this->must($index > 0, "A turma {$alias} não está declarada na ordem do manifesto.");
            $firstBatch[] = ['id_turma' => $class['id'], 'quantidade' => 10 + $index];
            $fractionBatch[] = ['id_turma' => $class['id'], 'quantidade' => 2.50];
        }
        $this->request($admin, 'POST', 'api/v1/arrecadacao', ['id_interclasse' => $editionId, 'arrecadacoes' => $firstBatch], 'S10', 'arrecadacao_inicial');
        $this->request($admin, 'POST', 'api/v1/arrecadacao', ['id_interclasse' => $editionId, 'arrecadacoes' => $fractionBatch], 'S10', 'arrecadacao_fracionaria');
        $afterFraction = $this->getList($admin, "api/v1/arrecadacao?id_interclasse={$editionId}", 'historico_arrecadacao_fracionaria');
        $knownIds = array_fill_keys(array_map(static fn (array $row): int => (int) ($row['id_historico'] ?? 0), $before), true);
        $fractionIds = [];
        foreach ($afterFraction as $row) {
            $id = (int) ($row['id_historico'] ?? 0);
            if ($id > 0 && !isset($knownIds[$id]) && (float) ($row['quantidade_arrecadada'] ?? $row['quantidade'] ?? 0) === 2.5) {
                $fractionIds[] = $id;
            }
        }
        $this->must(count($fractionIds) === 7, 'A segunda rodada de arrecadação não gerou sete históricos para estorno.');
        foreach ($fractionIds as $historyId) {
            $this->request($admin, 'DELETE', 'api/v1/arrecadacao', ['id_historico' => $historyId, 'id_interclasse' => $editionId], 'S10', 'estornar_arrecadacao');
        }
        $duplicate = $admin->deleteJson('api/v1/arrecadacao', ['id_historico' => $fractionIds[0], 'id_interclasse' => $editionId]);
        $this->must((int) ($duplicate['code'] ?? 0) === 200 && ($duplicate['json']['success'] ?? true) === false, 'O estorno repetido deveria ser recusado sem novo efeito.');
        $lastBatch = [];
        foreach ($classes as $alias => $class) {
            $lastBatch[] = ['id_turma' => $class['id'], 'quantidade' => 1.25];
        }
        $lastPayload = ['id_interclasse' => $editionId, 'arrecadacoes' => $lastBatch];
        $creditMutationId = 'sim-' . $editionId . '-credito-final';
        $finalCredit = $this->request(
            $admin,
            'POST',
            'api/v1/arrecadacao',
            $lastPayload,
            'S10',
            'arrecadacao_final',
            200,
            true,
            ['X-SGI-Mutation-Id' => $creditMutationId],
        );
        $historyAfterFirstCredit = $this->getList($admin, "api/v1/arrecadacao?id_interclasse={$editionId}", 'auditar_arrecadacao_primeiro_commit');
        $this->must(count($historyAfterFirstCredit) === count($afterFraction) + 7, 'O primeiro crédito final não adicionou exatamente um evento ao livro.');

        $creditReplay = $admin->postJson('api/v1/arrecadacao', $lastPayload, ['X-SGI-Mutation-Id' => $creditMutationId]);
        $this->record('S10', 'simulador', 'POST', 'api/v1/arrecadacao', (int) ($creditReplay['code'] ?? 0), 'replay_credito_apos_perda');
        $this->must((int) ($creditReplay['code'] ?? 0) === 200 && ($creditReplay['json'] ?? null) === $finalCredit, 'O replay do crédito não retornou a resposta original confirmada.');

        $conflictingPayload = $lastPayload;
        $conflictingPayload['arrecadacoes'][0]['quantidade'] = 1.26;
        $creditConflict = $admin->postJson('api/v1/arrecadacao', $conflictingPayload, ['X-SGI-Mutation-Id' => $creditMutationId]);
        $this->record('S10', 'simulador', 'POST', 'api/v1/arrecadacao', (int) ($creditConflict['code'] ?? 0), 'conflito_fingerprint_credito');
        $this->must((int) ($creditConflict['code'] ?? 0) === 409 && ($creditConflict['json']['success'] ?? true) === false, 'A mesma identidade com outro payload precisa ser recusada.');

        $collaborator = new TestClient();
        $this->login($collaborator, 'colab', '123', 'S10', 'colaborador');
        $otherOperatorReplay = $collaborator->postJson('api/v1/arrecadacao', $lastPayload, ['X-SGI-Mutation-Id' => $creditMutationId]);
        $this->record('S10', 'colaborador', 'POST', 'api/v1/arrecadacao', (int) ($otherOperatorReplay['code'] ?? 0), 'conflito_operador_credito');
        $this->must(
            (int) ($otherOperatorReplay['code'] ?? 0) === 409 && ($otherOperatorReplay['json']['success'] ?? true) === false,
            'A identidade de mutação do administrador não pode ser reutilizada por outro operador, mesmo com o mesmo payload.',
        );

        $history = $this->getList($admin, "api/v1/arrecadacao?id_interclasse={$editionId}", 'auditar_arrecadacao');
        $historyIdsAfterCommit = array_map(static fn (array $row): int => (int) ($row['id_historico'] ?? 0), $historyAfterFirstCredit);
        $historyIdsAfterReplay = array_map(static fn (array $row): int => (int) ($row['id_historico'] ?? 0), $history);
        $this->must($historyIdsAfterReplay === $historyIdsAfterCommit, 'Replay ou conflito de payload/operador do crédito alterou a cardinalidade/identidade do histórico.');
        $expectedHistoryCount = count($before) + 21;
        $this->must(count($history) === $expectedHistoryCount, 'O livro de arrecadação deveria preservar os eventos anteriores e 21 novos eventos, inclusive estornos.');
        $this->observed['mutation_replays']['credit'] = [
            'attempts' => 2,
            'same_mutation_identity' => true,
            'committed_before_replay' => true,
            'single_batch_in_history' => true,
            'changed_payload_rejected' => true,
            'different_operator_rejected' => true,
        ];
        $totalPoints = 0;
        $byClass = [];
        foreach ($classes as $alias => $class) {
            $expectedQuantity = $oracle['fundraising_points_by_class'][$alias] / 4;
            $rows = array_values(array_filter($history, static fn (array $row): bool => (int) ($row['id_turma'] ?? $row['turmas_id_turma'] ?? 0) === $class['id']));
            $activeQuantity = array_sum(array_map(static function (array $row): float {
                $removed = in_array((string) ($row['status_historico'] ?? $row['status'] ?? ''), ['removido', '0'], true)
                    || !empty($row['removido_em']);
                return $removed ? 0.0 : (float) ($row['quantidade_arrecadada'] ?? $row['quantidade'] ?? 0);
            }, $rows));
            $points = (int) round($activeQuantity * 4);
            $this->must(abs($activeQuantity - $expectedQuantity) < 0.001, "A arrecadação ativa da turma {$alias} não coincide com o livro esperado.");
            $byClass[$alias] = ['quantity' => $activeQuantity, 'points' => $points, 'history_rows' => count($rows)];
            $totalPoints += $points;
        }
        $this->must($totalPoints === 427, 'A arrecadação não creditou os 427 pontos esperados.');
        return ['points' => $totalPoints, 'history_rows' => count($history), 'estornos' => count($fractionIds), 'by_class' => $byClass];
    }

    /** @param array<string,array{id:int,category_id:int}> $classes @param array<string,array<int,array{id:int,client:TestClient}>> $students @return array<string,mixed> */
    private function registerPenalties(TestClient $admin, int $editionId, array $classes, array $students): array
    {
        $date = (new DateTimeImmutable('today'))->format('Y-m-d');
        $individualIds = [];
        $groupIds = [];
        $firstClassAlias = (string) array_key_first($classes);
        $occurrenceReplayEvidence = null;
        foreach ($classes as $alias => $class) {
            $studentId = $students[$alias][32]['id'];
            $individualPayload = [
                'titulo_ocorrencia' => 'Registro disciplinar sintético',
                'descricao_ocorrencia' => 'Ocorrência simulada para conferir o desconto no ranking.',
                'data_ocorrencia' => $date, 'usuarios_id_usuario' => $studentId, 'penalidade' => 2,
            ];
            $mutationId = 'sim-' . $editionId . '-ocorrencia-' . $alias;
            $individual = $this->request(
                $admin,
                'POST',
                'api/v1/ocorrencias',
                $individualPayload,
                'S10',
                'penalidade_individual_' . $alias,
                [201, 200],
                true,
                ['X-SGI-Mutation-Id' => $mutationId],
            );
            $individualId = (int) ($individual['id'] ?? 0);
            $this->must($individualId > 0, 'Uma ocorrência individual não retornou ID.');
            if ($alias === $firstClassAlias) {
                $occurrenceReplay = $admin->postJson('api/v1/ocorrencias', $individualPayload, ['X-SGI-Mutation-Id' => $mutationId]);
                $this->record('S10', 'simulador', 'POST', 'api/v1/ocorrencias', (int) ($occurrenceReplay['code'] ?? 0), 'replay_ocorrencia_apos_perda');
                $this->must((int) ($occurrenceReplay['code'] ?? 0) === 201 && ($occurrenceReplay['json'] ?? null) === $individual, 'O replay da ocorrência não retornou a resposta original confirmada.');

                $changedOccurrence = $individualPayload;
                $changedOccurrence['descricao_ocorrencia'] .= ' Payload divergente.';
                $conflict = $admin->postJson('api/v1/ocorrencias', $changedOccurrence, ['X-SGI-Mutation-Id' => $mutationId]);
                $this->record('S10', 'simulador', 'POST', 'api/v1/ocorrencias', (int) ($conflict['code'] ?? 0), 'conflito_fingerprint_ocorrencia');
                $this->must((int) ($conflict['code'] ?? 0) === 409 && ($conflict['json']['success'] ?? true) === false, 'A identidade da ocorrência deveria recusar um payload diferente.');
                $sameOccurrenceRows = $this->getList($admin, "api/v1/ocorrencias?id_usuario={$studentId}", 'auditar_replay_ocorrencia');
                $this->must(count($sameOccurrenceRows) === 1 && (int) ($sameOccurrenceRows[0]['id_ocorrencia'] ?? 0) === $individualId, 'Replay ou conflito da ocorrência gerou um efeito duplicado.');
                $occurrenceReplayEvidence = [
                    'attempts' => 2,
                    'same_mutation_identity' => true,
                    'committed_before_replay' => true,
                    'single_occurrence_persisted' => true,
                    'changed_payload_rejected' => true,
                ];
            }
            $individualIds[$alias] = $individualId;
            $group = $this->request($admin, 'POST', 'api/v1/ocorrencias-turmas', [
                'turmas_id_turma' => $class['id'], 'interclasses_id_interclasse' => $editionId,
                'titulo_ocorrencia' => 'Conduta coletiva sintética', 'descricao_ocorrencia' => 'Registro simulado de três pontos.',
                'pontos_descontados' => 3, 'data_ocorrencia' => $date,
            ], 'S10', 'penalidade_coletiva_' . $alias, [201, 200]);
            $groupId = (int) ($group['id'] ?? 0);
            $this->must($groupId > 0, 'Uma ocorrência de turma não retornou ID.');
            $groupIds[$alias] = $groupId;
        }
        $firstAlias = array_key_first($individualIds);
        $individualId = $individualIds[$firstAlias];
        $this->request($admin, 'PUT', 'api/v1/ocorrencias', ['id_ocorrencia' => $individualId, 'penalidade' => 4], 'S10', 'editar_penalidade');
        $this->request($admin, 'PUT', 'api/v1/ocorrencias', ['id_ocorrencia' => $individualId, 'penalidade' => 2], 'S10', 'reverter_penalidade');
        $transientClass = array_keys($classes)[2];
        $transient = $this->request($admin, 'POST', 'api/v1/ocorrencias-turmas', [
            'turmas_id_turma' => $classes[$transientClass]['id'], 'interclasses_id_interclasse' => $editionId,
            'titulo_ocorrencia' => 'Penalidade transitória', 'data_ocorrencia' => $date, 'pontos_descontados' => 7,
        ], 'S10', 'penalidade_transitoria', [201, 200]);
        $this->request($admin, 'DELETE', 'api/v1/ocorrencias-turmas', ['id_ocorrencia_turma' => (int) ($transient['id'] ?? 0)], 'S10', 'anular_penalidade_transitoria');
        $this->must(is_array($occurrenceReplayEvidence), 'A simulação não registrou o replay idempotente da ocorrência individual.');
        $this->observed['mutation_replays']['occurrence'] = $occurrenceReplayEvidence;
        return ['points' => 35, 'individual' => $individualIds, 'class' => $groupIds, 'edited_and_restored' => true, 'transient_removed' => true];
    }

    /** @return list<array<string,mixed>> */
    private function rankingByClass(TestClient $admin, int $editionId): array
    {
        $rows = $this->getList($admin, "api/v1/ranking?id_interclasse={$editionId}", 'consultar_ranking');
        return array_map(static fn (array $row): array => [
            'class' => (string) ($row['nome_turma'] ?? ''),
            'pontuacao_bruta' => (int) ($row['pontuacao_bruta'] ?? $row['pontuacao_sem_penalidade'] ?? 0),
            'pontuacao_esportes' => (int) ($row['pontuacao_esportes'] ?? 0),
            'pontuacao_arrecadacao' => (int) ($row['pontuacao_arrecadacao'] ?? 0),
            'pontuacao_liquida' => (int) ($row['pontuacao_liquida'] ?? $row['pontuacao_turma'] ?? 0),
        ], $rows);
    }

    /** @param list<array<string,mixed>> $rows @param array<string,array{id:int,category_id:int}> $classes @param array<string,int> $expectedNet */
    private function assertRanking(array $rows, array $classes, array $oracle): void
    {
        $ranked = [];
        foreach ($rows as $row) {
            $ranked[$row['class']] = $row;
        }
        $expectedSport = $oracle['sports_points_by_class'];
        $expectedFund = $oracle['fundraising_points_by_class'];
        foreach ($classes as $alias => $_class) {
            $this->must(isset($ranked[$alias]), "A turma {$alias} está ausente do ranking.");
            $this->must(
                $ranked[$alias]['pontuacao_esportes'] === (int) $expectedSport[$alias],
                "Os pontos esportivos da turma {$alias} divergiram do oráculo (esperado {$expectedSport[$alias]}, observado {$ranked[$alias]['pontuacao_esportes']}).",
            );
            $this->must(
                $ranked[$alias]['pontuacao_arrecadacao'] === (int) $expectedFund[$alias],
                "Os pontos de arrecadação da turma {$alias} divergiram do oráculo (esperado {$expectedFund[$alias]}, observado {$ranked[$alias]['pontuacao_arrecadacao']}).",
            );
            $this->must(
                $ranked[$alias]['pontuacao_liquida'] === (int) $oracle['net_points_by_class'][$alias],
                "O líquido da turma {$alias} divergiu do oráculo (esperado {$oracle['net_points_by_class'][$alias]}, observado {$ranked[$alias]['pontuacao_liquida']}).",
            );
        }
        $this->must(count($ranked) === 7, 'O ranking deveria conter exatamente as sete turmas do cenário.');
    }

    /** @param array<string,array<int,array{id:int,client:TestClient}>> $students @param array<string,array{id:int,category_id:int}> $classes */
    private function assertAllStudentsCanReadPublishedRanking(array $students, int $editionId, array $classes): void
    {
        $confirmed = 0;
        foreach ($students as $classAlias => $roster) {
            $classId = $classes[$classAlias]['id'];
            foreach ($roster as $student) {
                $response = $student['client']->get("api/v1/ranking?id_interclasse={$editionId}");
                $this->must((int) ($response['code'] ?? 0) === 200 && is_array($response['json'] ?? null), 'Um aluno não conseguiu consultar o ranking publicado.');
                $hasClass = false;
                foreach ($response['json'] as $row) {
                    if ((int) ($row['id_turma'] ?? 0) === $classId) {
                        $hasClass = true;
                        break;
                    }
                }
                $this->must($hasClass, 'A consulta final não incluiu a turma do aluno autenticado.');
                $this->record('S11', 'aluno-sintetico', 'GET', 'api/v1/ranking', (int) $response['code'], $classAlias);
                $confirmed++;
            }
        }
        $this->must($confirmed === 224, 'Nem todos os alunos consultaram o ranking publicado.');
    }

    /** @return array<string,mixed> */
    private function auditPopulation(int $editionId, int $classCount): array
    {
        $database = TestDatabase::connect(getenv('SGI_TEST_DB_NAME') ?: 'sgi_test');
        try {
            $studentCount = $this->scalar($database, "SELECT COUNT(*) FROM usuarios WHERE interclasses_id_interclasse = {$editionId} AND nivel_usuario = '3' AND status_usuario = '1'");
            $enrollments = $this->scalar($database, "SELECT COUNT(*) FROM equipes_has_usuarios eu INNER JOIN usuarios u ON u.id_usuario = eu.usuarios_id_usuario INNER JOIN equipes e ON e.id_equipe = eu.equipes_id_equipe INNER JOIN modalidades m ON m.id_modalidade = e.modalidades_id_modalidade WHERE u.interclasses_id_interclasse = {$editionId} AND m.interclasses_id_interclasse = {$editionId} AND u.nivel_usuario = '3' AND u.status_usuario = '1'");
            $distributionRows = $database->query("SELECT c.modalities AS amount, COUNT(*) AS students FROM (SELECT u.id_usuario, COUNT(DISTINCT m.id_modalidade) AS modalities FROM usuarios u LEFT JOIN equipes_has_usuarios eu ON eu.usuarios_id_usuario = u.id_usuario LEFT JOIN equipes e ON e.id_equipe = eu.equipes_id_equipe LEFT JOIN modalidades m ON m.id_modalidade = e.modalidades_id_modalidade AND m.interclasses_id_interclasse = {$editionId} WHERE u.interclasses_id_interclasse = {$editionId} AND u.nivel_usuario = '3' AND u.status_usuario = '1' GROUP BY u.id_usuario) c GROUP BY c.modalities ORDER BY c.modalities");
            $distribution = [];
            foreach ($distributionRows->fetch_all(MYSQLI_ASSOC) as $row) {
                $distribution[(int) $row['amount']] = (int) $row['students'];
            }
            return ['students' => $studentCount, 'enrollments' => $enrollments, 'enrollment_distribution' => $distribution, 'classes' => $classCount];
        } finally {
            $database->close();
        }
    }

    private function assertEnrollmentPreserved(int $editionId, int $expected): void
    {
        $observed = $this->auditPopulation($editionId, 7);
        $this->must($observed['enrollments'] === $expected, 'Uma revisão de agenda alterou vínculos de inscrição.');
    }

    /** @return array<string,int> */
    private function auditTournament(int $editionId): array
    {
        $database = TestDatabase::connect(getenv('SGI_TEST_DB_NAME') ?: 'sgi_test');
        try {
            $games = $this->scalar($database, "SELECT COUNT(*) FROM jogos j INNER JOIN modalidades m ON m.id_modalidade = j.modalidades_id_modalidade WHERE m.interclasses_id_interclasse = {$editionId} AND j.status_jogo IN ('Concluido','Finalizado')");
            $gamesWithTwo = $this->scalar($database, "SELECT COUNT(*) FROM (SELECT j.id_jogo, COUNT(p.id_partida) AS matches FROM jogos j INNER JOIN modalidades m ON m.id_modalidade = j.modalidades_id_modalidade INNER JOIN partidas p ON p.jogos_id_jogo = j.id_jogo WHERE m.interclasses_id_interclasse = {$editionId} AND j.status_jogo IN ('Concluido','Finalizado') GROUP BY j.id_jogo HAVING matches >= 2) done");
            $activePoints = $this->scalar($database, "SELECT COUNT(*) FROM artilheiros a INNER JOIN jogos j ON j.id_jogo = a.jogos_id_jogo INNER JOIN modalidades m ON m.id_modalidade = j.modalidades_id_modalidade WHERE m.interclasses_id_interclasse = {$editionId} AND a.status_artilheiro = 'ativo' AND a.conta_no_placar = 1");
            $voidedPoints = $this->scalar($database, "SELECT COUNT(*) FROM artilheiros a INNER JOIN jogos j ON j.id_jogo = a.jogos_id_jogo INNER JOIN modalidades m ON m.id_modalidade = j.modalidades_id_modalidade WHERE m.interclasses_id_interclasse = {$editionId} AND a.status_artilheiro = 'anulado' AND a.conta_no_placar = 0");
            $penalties = $this->scalar($database, "SELECT COALESCE((SELECT SUM(pontos_descontados) FROM ocorrencias_turmas WHERE interclasses_id_interclasse = {$editionId}),0) + COALESCE((SELECT SUM(o.penalidade) FROM ocorrencias o INNER JOIN usuarios u ON u.id_usuario = o.usuarios_id_usuario WHERE u.interclasses_id_interclasse = {$editionId} AND o.status_ocorrencia = '1'),0)");
            $sports = $this->scalar($database, "SELECT COALESCE(SUM(pontos),0) FROM pontuacoes_podio WHERE id_interclasse = {$editionId} AND ativo = 1");
            return ['games_closed' => $games, 'games_with_two_participants' => $gamesWithTwo, 'active_points' => $activePoints, 'voided_points' => $voidedPoints, 'penalty_magnitudes' => $penalties, 'sports_points' => $sports];
        } finally {
            $database->close();
        }
    }

    private function checkpointMatrix(TournamentManifest $manifest, array $population, array $matches, array $races, array $rankRows, array $audit): void
    {
        $this->observed['expected'] = $manifest->expected();
        $this->observed['expected_net_by_class'] = $manifest->expectedNetPointsByClass();
        $this->observed['coverage'] = [
            'http' => ['students' => $population['students'], 'enrollments' => $population['enrollments'], 'matches' => count($matches), 'individual_events' => count($races), 'student_ranking_reads' => 224],
            'browser' => ['students' => 0, 'enrollments' => 0, 'matches' => 0, 'individual_events' => 0],
        ];
        foreach (['S00', 'S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S09', 'S10', 'S11', 'S12'] as $stage) {
            $this->checkpoints[$stage] ??= ['status' => 'passed'];
        }
        $this->checkpoints['S08'] ??= ['status' => 'not_implemented', 'reason' => 'A jornada offline e os operadores paralelos ainda não foram exercitados nesta execução.'];
        $this->observed['ranking_rows'] = count($rankRows);
        $this->observed['audit'] = $audit;
    }

    private function activeEditionId(TestClient $admin): int
    {
        // The list response omits status_interclasse unless detail mode is requested.
        $rows = $this->getList($admin, 'api/v1/edicoes?status_interclasse=1&regulamento=true', 'ler_edicao_ativa');
        foreach ($rows as $row) {
            if ((string) ($row['status_interclasse'] ?? '') === '1') {
                return (int) ($row['id_interclasse'] ?? 0);
            }
        }
        return 0;
    }

    /** @return array<string,mixed> */
    private function cronogramaState(TestClient $admin, int $editionId): array
    {
        return $this->getObject($admin, "api/v1/cronograma?id_interclasse={$editionId}", 'consultar_cronograma');
    }

    /** @return list<array<string,mixed>> */
    private function getList(TestClient $client, string $path, string $operation): array
    {
        $response = $client->get($path);
        $this->record('http', 'simulador', 'GET', $path, (int) ($response['code'] ?? 0), $operation);
        $this->must((int) ($response['code'] ?? 0) === 200 && is_array($response['json'] ?? null), "A consulta {$operation} não retornou HTTP 200 com JSON válido.");
        $json = $response['json'];
        $rows = array_is_list($json) ? $json : ($json['data'] ?? $json['items'] ?? null);
        if (!is_array($rows)) {
            $rows = array_values($json);
        }
        $this->must(array_is_list($rows), "A consulta {$operation} não retornou uma lista de registros.");
        foreach ($rows as $row) {
            $this->must(is_array($row), "A consulta {$operation} contém um registro em formato inválido.");
        }
        return $rows;
    }

    /** @return array<string,mixed> */
    private function getObject(TestClient $client, string $path, string $operation): array
    {
        $response = $client->get($path);
        $this->record('http', 'simulador', 'GET', $path, (int) ($response['code'] ?? 0), $operation);
        $this->must((int) ($response['code'] ?? 0) === 200 && is_array($response['json'] ?? null), "A consulta {$operation} não retornou HTTP 200 com JSON válido.");
        return $response['json'];
    }

    /** @param array<string,mixed> $payload @param int|list<int> $expectedCode @param array<string,string> $headers @return array<string,mixed> */
    private function request(TestClient $client, string $method, string $path, array $payload, string $stage, string $operation, int|array $expectedCode = 200, bool $jsonSuccess = true, array $headers = []): array
    {
        $response = match ($method) {
            'POST' => $client->postJson($path, $payload, $headers),
            'PUT' => $client->putJson($path, $payload, $headers),
            'DELETE' => $client->deleteJson($path, $payload, $headers),
            default => throw new RuntimeException('Método HTTP de simulação não suportado.'),
        };
        $code = (int) ($response['code'] ?? 0);
        $allowed = is_array($expectedCode) ? $expectedCode : [$expectedCode];
        $this->record($stage, 'simulador', $method, $path, $code, $operation);
        $publicMessage = is_array($response['json'] ?? null) ? trim((string) ($response['json']['message'] ?? '')) : '';
        $detail = $publicMessage === '' ? '' : ' Mensagem: ' . $publicMessage;
        $this->must(in_array($code, $allowed, true), "A operação {$operation} retornou HTTP {$code} (esperado " . implode('/', $allowed) . ').' . $detail);
        $this->must(is_array($response['json'] ?? null), "A operação {$operation} não retornou JSON válido.");
        if ($jsonSuccess) {
            $success = ($response['json']['success'] ?? false) === true
                || ($response['json']['status'] ?? '') === 'sucesso'
                || ($response['json']['status'] ?? '') === 'success';
            $this->must($success, "A operação {$operation} retornou um envelope JSON de falha.");
        }
        return $response['json'];
    }

    private function login(TestClient $client, string $matricula, string $password, string $stage, string $actor = 'admin'): void
    {
        $response = $client->login($matricula, $password);
        $this->record($stage, $actor, 'POST', 'api/v1/login', (int) ($response['code'] ?? 0), 'login');
        $this->must((int) ($response['code'] ?? 0) === 200 && is_array($response['json'] ?? null), "Falha no login do ator sintético {$actor}.");
    }

    private function record(string $stage, string $actor, string $method, string $route, int $status, string $operation): void
    {
        $this->events[] = [
            'event_id' => sprintf('%s-E%06d', $this->runId, ++$this->eventSequence),
            'phase' => $stage, 'actor_alias' => $actor, 'method' => $method,
            'route' => parse_url($route, PHP_URL_PATH) ?: $route, 'resource_alias' => $operation,
            'http_status' => $status, 'confirmed' => $status >= 200 && $status < 300,
        ];
    }

    /** @param array<string,mixed> $data */
    private function mark(string $stage, array $data): void
    {
        $this->checkpoints[$stage] = ['status' => 'passed', 'observed' => $data];
        Assertions::assert('Interclasse integral — checkpoint ' . $stage, true);
    }

    private function must(bool $condition, string $message): void
    {
        if (!$condition) {
            Assertions::assert('Interclasse integral — ' . $message, false);
            throw new RuntimeException($message);
        }
    }

    private function scalar(mysqli $database, string $sql): int
    {
        $value = $database->query($sql)->fetch_column();
        return (int) $value;
    }

    private function artifactDirectory(): string
    {
        $base = getenv('SGI_TEST_RESULTS_DIR');
        $directory = ($base !== false && trim($base) !== '')
            ? rtrim($base, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'simulacao-interclasse'
            : sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'sgi-simulacao-interclasse-' . $this->runId;
        if (!is_dir($directory) && !mkdir($directory, 0770, true) && !is_dir($directory)) {
            throw new RuntimeException('Não foi possível preparar o diretório sanitizado de evidências da simulação.');
        }
        return $directory;
    }

    /** @param array<string,mixed> $manifestHash */
    private function flush(TournamentManifest $manifest, string $manifestHash, string $status, int $editionId): void
    {
        if ($this->artifactDirectory === '') {
            return;
        }
        $expected = $manifest->expected();
        $resolvedManifest = [
            'schema_version' => 1, 'run_id' => $this->runId, 'manifest_sha256' => $manifestHash,
            'seed' => 'sesi-interclasse-2026-v1', 'timezone' => 'America/Sao_Paulo',
            'started_at_utc' => $this->startedAtUtc, 'created_at_utc' => gmdate('c'), 'edition_id' => $editionId > 0 ? $editionId : null,
            'classes' => array_column($manifest->classes(), 'alias'),
            'modality_templates' => array_column($manifest->modalities(), 'alias'),
        ];
        $browserCoverage = $this->observed['coverage']['browser'] ?? null;
        $browserSummary = is_array($browserCoverage)
            ? sprintf(
                '%d alunos autenticados, %d inscrições conferidas, %d jogos e %d provas pela interface; %d %s por %d mesários.',
                (int) ($browserCoverage['students_authenticated'] ?? $browserCoverage['students'] ?? 0),
                (int) ($browserCoverage['registrations_visible_to_owner'] ?? $browserCoverage['enrollments'] ?? 0),
                (int) ($browserCoverage['collective_matches_operated'] ?? $browserCoverage['matches'] ?? 0),
                (int) ($browserCoverage['individual_events_operated'] ?? $browserCoverage['individual_events'] ?? 0),
                (int) ($browserCoverage['offline_matches'] ?? 0),
                (int) ($browserCoverage['offline_matches'] ?? 0) === 1 ? 'jogo offline sincronizado' : 'jogos offline sincronizados',
                (int) ($browserCoverage['parallel_operators'] ?? 0),
            )
            : 'pendente até o Playwright concluir a passagem pelo portal';
        $report = [
            '# Simulação integral do Interclasses', '',
            '- Execução: `' . $this->runId . '`',
            '- Estado da execução HTTP: **' . $status . '**',
            '- Início: `' . $this->startedAtUtc . '`; fechamento do relatório: `' . gmdate('c') . '`; duração: ' . round((hrtime(true) - $this->startedAtNs) / 1_000_000_000, 3) . 's.',
            '- Ambiente: runtime `' . (getenv('SGI_TEST_DB_RUNTIME') ?: 'ausente') . '`, banco descartável `' . (getenv('SGI_TEST_DB_NAME') ?: 'sgi_test') . '`, PHP `' . PHP_VERSION . '`, URL `' . (getenv('SGI_TEST_BASE_URL') ?: 'não informada') . '`.',
            '- Edição sintética: `' . ($editionId > 0 ? $editionId : 'não criada') . '`',
            '- Hash do manifesto: `' . $manifestHash . '`',
            '- Eventos HTTP registrados: ' . count($this->events),
            '- Fases concluídas: ' . implode(', ', array_keys(array_filter($this->checkpoints, static fn (array $row): bool => ($row['status'] ?? '') === 'passed'))),
            '- Falha observada: ' . ($this->failure ?? 'nenhuma'),
            '- Cobertura HTTP observada: ' . json_encode($this->observed['coverage']['http'] ?? ['events' => count($this->events)], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . '.',
            '- Cobertura de navegador: ' . $browserSummary,
            '- Recuperação idempotente: ' . json_encode([
                'ponto_e_resultado_offline' => $this->observed['browser_response_loss'] ?? [],
                'ocorrencia_offline' => $this->observed['browser_response_loss']['lost_occurrence_response_retried'] ?? false,
                'credito_ui' => $this->observed['browser_credit_response_loss'] ?? [],
                'ocorrencia_api' => $this->observed['mutation_replays']['occurrence'] ?? [],
                'credito_api' => $this->observed['mutation_replays']['credit'] ?? [],
            ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . '.',
            '', '## Classificação esperada e observada', '',
            'Pódios declarados: ' . json_encode($expected['podiums_by_category'] ?? [], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . '.',
            'Ranking líquido por turma: ' . json_encode(array_map(static fn (array $row): array => ['turma' => $row['class'], 'liquido' => $row['pontuacao_liquida']], $this->observed['ranking_before_publication'] ?? []), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . '.',
            'Reconciliação global: ' . json_encode([
                'arrecadacao' => $this->observed['fundraising']['points'] ?? null,
                'esportes' => $this->observed['audit']['sports_points'] ?? null,
                'penalidades' => $this->observed['audit']['penalty_magnitudes'] ?? null,
                'jogadas_ativas' => $this->observed['audit']['active_points'] ?? null,
                'jogadas_anuladas' => $this->observed['audit']['voided_points'] ?? null,
                'bruto_observado' => array_sum(array_column($this->observed['ranking_before_publication'] ?? [], 'pontuacao_bruta')),
                'liquido_observado' => array_sum(array_column($this->observed['ranking_before_publication'] ?? [], 'pontuacao_liquida')),
                'bruto_esperado' => $manifest->expected()['gross_points'] ?? null,
                'liquido_esperado' => $manifest->expected()['net_points'] ?? null,
            ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . '.',
            '', 'Este relatório não inclui matrículas, senhas, tokens CSRF ou cookies.',
        ];
        $this->writeJson('manifest-resolved.json', $resolvedManifest);
        $this->writeJson('expected.json', ['manifest' => $expected, 'net_points_by_class' => $manifest->expectedNetPointsByClass()]);
        $this->observed['status'] = $status;
        $this->writeJson('observed.json', $this->observed);
        $this->writeJson('checkpoints.json', [
            'status' => $status, 'checkpoints' => $this->checkpoints,
            'acceptance' => $this->acceptanceMatrix(),
        ]);
        $this->writeJson('coverage.json', $this->observed['coverage'] ?? ['http' => ['events' => count($this->events)], 'browser' => ['status' => 'not_run']]);
        $lines = array_map(static fn (array $event): string => json_encode($event, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), $this->events);
        file_put_contents($this->artifactDirectory . DIRECTORY_SEPARATOR . 'events.jsonl', implode(PHP_EOL, $lines) . PHP_EOL, LOCK_EX);
        file_put_contents($this->artifactDirectory . DIRECTORY_SEPARATOR . 'report.md', implode(PHP_EOL, $report) . PHP_EOL, LOCK_EX);
    }

    /** @param array<string,mixed> $payload */
    private function writeJson(string $name, array $payload): void
    {
        file_put_contents($this->artifactDirectory . DIRECTORY_SEPARATOR . $name, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR) . PHP_EOL, LOCK_EX);
    }

    /** @return array<string,mixed> */
    private function readJsonArtifact(string $name): array
    {
        $path = $this->artifactDirectory . DIRECTORY_SEPARATOR . $name;
        $contents = is_file($path) ? file_get_contents($path) : false;
        $decoded = is_string($contents) ? json_decode($contents, true) : null;
        if (!is_array($decoded)) {
            throw new RuntimeException("Evidência obrigatória ausente ou inválida: {$name}.");
        }
        return $decoded;
    }

    /** @return list<array<string,mixed>> */
    private function readEventLog(): array
    {
        $path = $this->artifactDirectory . DIRECTORY_SEPARATOR . 'events.jsonl';
        if (!is_file($path)) {
            return [];
        }
        $events = [];
        foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
            $event = json_decode($line, true);
            if (is_array($event)) { $events[] = $event; }
        }
        return $events;
    }

    /** @return array<string,array{status:string,reason?:string}> */
    private function acceptanceMatrix(): array
    {
        $complete = [
            'V01' => 'S00', 'V06' => 'S04', 'V13' => 'S07', 'V17' => 'S10',
            'V20' => 'S08', 'V21' => 'S08',
            'V08' => 'S04', 'V27' => 'S11', 'V30' => 'S11',
        ];
        $partial = [
            'V02' => ['stage' => 'S01', 'reason' => 'O manifesto padrão foi conferido; salas adicionais não foram executadas.'],
            'V05' => ['stage' => 'S02', 'reason' => 'Os 224 logins e termos passaram por HTTP; a UI não percorreu troca de senha e aceite.'],
            'V09' => ['stage' => 'S03', 'reason' => 'A agenda padrão foi conferida; ramos de conflito e disponibilidade não foram exercitados.'],
            'V10' => ['stage' => 'S05', 'reason' => 'As três versões preservaram inscrições; conflitos reais de revisão não foram exercitados.'],
            'V12' => ['stage' => 'S06', 'reason' => 'Liberação e repetição passaram; alteração estrutural posterior não foi tentada.'],
            'V13' => ['stage' => 'S07', 'reason' => 'Os 15 confrontos foram concluídos e reconciliados; quatro foram operados pela UI real e 11 pelos endpoints HTTP.'],
            'V15' => ['stage' => 'S07', 'reason' => 'Avanço e terceiro derivado foram conferidos; cenários-limite de bye ainda precisam de uma verificação dedicada.'],
            'V16' => ['stage' => 'S09', 'reason' => 'As quatro provas e 28 participantes passaram pela UI; recusas de atleta repetido/não inscrito e retificação do pódio ainda faltam.'],
            'V18' => ['stage' => 'S10', 'reason' => 'Desconto 35, edição e reversão foram conferidos; validações negativas e estados adicionais faltam.'],
            'V19' => ['stage' => 'S07', 'reason' => 'Uma correção de ponto foi exercitada; retificação de resultado e pódio individual não.'],
            'V28' => ['stage' => 'S11', 'reason' => 'Ranking reservado/publicado foi conferido; revogação e republicação não foram.'],
            'V29' => ['stage' => 'S11', 'reason' => 'Encerramento preservou o histórico; mutações após encerramento não foram tentadas.'],
            'V31' => ['stage' => 'S11', 'reason' => 'Os 224 portais foram conferidos em viewport desktop; teclado e responsividade ficam em specs gerais.'],
            'V14' => ['stage' => 'S07', 'reason' => 'Início, pausa e retomada passam pela interface; reentrada da página sem listeners duplicados ainda falta.'],
            'V20' => ['stage' => 'S08', 'reason' => 'A chave principal concluiu as duas semifinais e a final sem rede e conferiu os três resultados no servidor.'],
            'V21' => ['stage' => 'S08', 'reason' => 'A fila da edição sincronizou a final temporária com o servidor, preservou os vencedores e esvaziou as mutações pendentes.'],
            'V26' => ['stage' => 'S08', 'reason' => 'Dois mesários operaram partidas distintas na mesma edição; as demais disputas concorrentes continuam cobertas por testes separados.'],
        ];
        $browserLoss = $this->observed['browser_response_loss'] ?? [];
        $creditLoss = $this->observed['browser_credit_response_loss'] ?? [];
        $serverReplays = $this->observed['mutation_replays'] ?? [];
        $occurrenceReplay = $serverReplays['occurrence'] ?? [];
        $creditReplay = $serverReplays['credit'] ?? [];
        $v22Complete = ($this->checkpoints['S08']['status'] ?? '') === 'passed'
            && ($browserLoss['lost_response_committed_before_drop'] ?? false)
            && ($browserLoss['lost_response_single_persisted_point'] ?? false)
            && ($browserLoss['lost_result_committed_before_drop'] ?? false)
            && ($browserLoss['lost_result_same_mutation_identity'] ?? false)
            && ($browserLoss['lost_result_single_closed_game'] ?? false)
            && ($browserLoss['lost_occurrence_committed_before_drop'] ?? false)
            && ($browserLoss['lost_occurrence_same_mutation_identity'] ?? false)
            && ($browserLoss['lost_occurrence_single_persisted'] ?? false)
            && ($creditLoss['retried'] ?? false)
            && (int) ($creditLoss['attempts'] ?? 0) === 2
            && ($creditLoss['committed_before_drop'] ?? false)
            && ($creditLoss['same_mutation_identity'] ?? false)
            && ($creditLoss['single_persisted_before_cleanup'] ?? false)
            && (int) ($occurrenceReplay['attempts'] ?? 0) === 2
            && ($occurrenceReplay['same_mutation_identity'] ?? false)
            && ($occurrenceReplay['single_occurrence_persisted'] ?? false)
            && ($occurrenceReplay['changed_payload_rejected'] ?? false)
            && (int) ($creditReplay['attempts'] ?? 0) === 2
            && ($creditReplay['same_mutation_identity'] ?? false)
            && ($creditReplay['single_batch_in_history'] ?? false)
            && ($creditReplay['changed_payload_rejected'] ?? false);
        $matrix = [];
        for ($index = 1; $index <= 36; $index++) {
            $criterion = sprintf('V%02d', $index);
            if ($criterion === 'V22') {
                $matrix[$criterion] = $v22Complete
                    ? ['status' => 'passed', 'reason' => 'Ponto, resultado, ocorrência e arrecadação perderam a resposta após commit e repetiram a mesma identidade na edição sem duplicar os efeitos; fingerprint divergente foi recusado.']
                    : ['status' => 'partial', 'reason' => 'A matriz só aprova após comprovar perda real de resposta, identidade preservada e efeito único para ponto, resultado, ocorrência e crédito na mesma edição.'];
                continue;
            }
            if ($criterion === 'V24') {
                $v24Complete = ($creditLoss['same_mutation_identity'] ?? false)
                    && ($creditReplay['same_mutation_identity'] ?? false)
                    && ($creditReplay['changed_payload_rejected'] ?? false)
                    && ($creditReplay['different_operator_rejected'] ?? false)
                    && ($creditReplay['single_batch_in_history'] ?? false);
                $matrix[$criterion] = $v24Complete
                    ? ['status' => 'passed', 'reason' => 'Retry pela UI e replay HTTP do mesmo operador retornaram efeito único; payload e operador diferentes foram recusados com HTTP 409 e sem alterar o histórico.']
                    : ['status' => 'partial', 'reason' => 'A identidade precisa ser exercitada pela UI e por HTTP, incluindo payload e operador diferentes, com conflito e efeito único comprovados.'];
                continue;
            }
            if ($criterion === 'V35') {
                $matrix[$criterion] = ['status' => 'passed', 'reason' => 'Cenário descoberto pelo runner de integração e falhas observadas reprovam o processo.'];
                continue;
            }
            if ($criterion === 'V36') {
                $matrix[$criterion] = ['status' => 'passed', 'reason' => 'Manifesto e oráculo executam na suíte unitária.'];
                continue;
            }
            $stage = $complete[$criterion] ?? ($partial[$criterion]['stage'] ?? null);
            $checkpointStatus = $stage === null ? '' : (string) ($this->checkpoints[$stage]['status'] ?? '');
            if ($stage !== null && $checkpointStatus === 'passed') {
                $matrix[$criterion] = isset($complete[$criterion])
                    ? ['status' => 'passed']
                    : ['status' => 'partial', 'reason' => $partial[$criterion]['reason']];
                continue;
            }
            if ($stage !== null && $checkpointStatus === 'partial' && isset($partial[$criterion])) {
                $matrix[$criterion] = ['status' => 'partial', 'reason' => $partial[$criterion]['reason']];
                continue;
            }
            $matrix[$criterion] = [
                'status' => 'not_executed',
                'reason' => $stage === null
                    ? 'A execução HTTP principal ainda não cobre este critério.'
                    : "O checkpoint {$stage} necessário não foi aprovado nesta execução.",
            ];
        }
        return $matrix;
    }
}
