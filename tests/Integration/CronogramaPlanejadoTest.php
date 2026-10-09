<?php

declare(strict_types=1);

namespace SGITests\Integration;

use App\Modules\Competicoes\Application\CronogramaService;
use App\Modules\Competicoes\Infrastructure\MysqliCronogramaRepository;
use App\Modules\Competicoes\Infrastructure\MysqliEquipeRepository;
use App\Modules\Competicoes\Infrastructure\MysqliChaveamentoRepository;
use App\Modules\Competicoes\Infrastructure\MysqliLocalScheduleGuard;
use App\Modules\Competicoes\Infrastructure\MysqliModalidadeRepository;
use App\Shared\Database\MigrationRunner;
use App\Shared\Database\Transaction;
use App\Modules\Competicoes\Infrastructure\MysqliPartidaGateway;
use mysqli;
use SGITests\Support\Assertions;
use SGITests\Support\TestClient;
use SGITests\Support\TestDatabase;

final class CronogramaPlanejadoTest
{
    public static function run(): void
    {
        echo "\n  [Cronograma planejado antes das inscrições]\n";
        $database = getenv('SGI_TEST_DB_NAME') ?: 'sgi_test';
        $connection = TestDatabase::connect($database);
        $root = dirname(__DIR__, 2);
        $version = '001_cronograma_inscricoes.sql';
        $runner = new MigrationRunner($connection, $root . '/database/migrations');
        $runner->migrate();
        $editionId = 0;
        $originalStatuses = [];
        $originalClassStatuses = [];
        $reservationId = 0;
        $lateReservationId = 0;
        $createdModalityId = 0;
        $createdIndividualModalityId = 0;
        $createdStudentId = 0;
        $createdStudentIds = [];
        $releaseBlockerGameId = 0;
        try {
            $editionId = (int) $connection->query("SELECT id_interclasse FROM interclasses ORDER BY id_interclasse LIMIT 1")->fetch_column();
            $modalityId = (int) $connection->query("SELECT id_modalidade FROM modalidades WHERE interclasses_id_interclasse = {$editionId} AND status_modalidade = '1' ORDER BY id_modalidade LIMIT 1")->fetch_column();
            $localId = (int) $connection->query("SELECT id_local FROM locais WHERE interclasses_id_interclasse = {$editionId} AND status_local = '1' AND disponivel_local = '1' ORDER BY id_local LIMIT 1")->fetch_column();
            $categoryId = (int) $connection->query("SELECT categorias_id_categoria FROM modalidades WHERE id_modalidade = {$modalityId}")->fetch_column();
            $classRows = $connection->query("SELECT id_turma, status_turma FROM turmas WHERE interclasses_id_interclasse = {$editionId} AND categorias_id_categoria = {$categoryId} ORDER BY id_turma")->fetch_all(MYSQLI_ASSOC);
            $firstClassId = (int) ($classRows[0]['id_turma'] ?? 0);
            foreach ($classRows as $classRow) {
                $originalClassStatuses[(int) $classRow['id_turma']] = (string) $classRow['status_turma'];
            }
            $statusRows = $connection->query("SELECT id_modalidade, status_modalidade FROM modalidades WHERE interclasses_id_interclasse = {$editionId}")->fetch_all(MYSQLI_ASSOC);
            foreach ($statusRows as $statusRow) {
                $originalStatuses[(int) $statusRow['id_modalidade']] = (string) $statusRow['status_modalidade'];
            }
            $connection->query("UPDATE modalidades SET status_modalidade = '0' WHERE interclasses_id_interclasse = {$editionId} AND id_modalidade <> {$modalityId}");
            $connection->query("UPDATE turmas SET status_turma = '0' WHERE interclasses_id_interclasse = {$editionId} AND categorias_id_categoria = {$categoryId} AND id_turma <> {$firstClassId}");
            $primaryGender = $connection->real_escape_string((string) $connection->query("SELECT genero_modalidade FROM modalidades WHERE id_modalidade = {$modalityId}")->fetch_column());
            $registration = 'CRONOGRAMA-' . bin2hex(random_bytes(4));
            $studentName = 'Aluno Cronograma';
            $studentPassword = password_hash('cronograma-fixture', PASSWORD_DEFAULT);
            $student = $connection->prepare("INSERT INTO usuarios (sigla_usuario, matricula_usuario, nome_usuario, senha_usuario, nivel_usuario, genero_usuario, data_nasc_usuario, foto_usuario, status_usuario, turmas_id_turma, interclasses_id_interclasse, chave_usuario_edicao) VALUES ('RM', ?, ?, ?, '3', ?, '2010-01-01', '', '1', ?, ?, NULL)");
            $student->bind_param('ssssii', $registration, $studentName, $studentPassword, $primaryGender, $firstClassId, $editionId);
            $student->execute();
            $createdStudentId = (int) $connection->insert_id;
            $createdStudentIds[] = $createdStudentId;
            $student->close();
            $modalityTypeId = (int) $connection->query("SELECT tipos_modalidades_id_tipo_modalidade FROM modalidades WHERE id_modalidade = {$modalityId}")->fetch_column();
            $admin = new TestClient();
            $admin->login('admin', '123');
            $createdModality = $admin->postJson('api/v1/modalidades', [
                'nome_modalidade' => 'Modalidade cronograma ' . bin2hex(random_bytes(3)),
                'genero_modalidade' => $primaryGender,
                'max_inscrito_modalidade' => 10,
                'max_equipes' => 6,
                'tipos_modalidades_id_tipo_modalidade' => $modalityTypeId,
                'categorias_id_categoria' => $categoryId,
                'interclasses_id_interclasse' => $editionId,
            ]);
            $createdModalityId = (int) ($createdModality['json']['id_modalidade'] ?? 0);
            if ($createdModalityId <= 0 || ($createdModality['code'] ?? 0) < 200 || ($createdModality['code'] ?? 0) >= 300) {
                throw new \RuntimeException('Não foi possível criar a segunda modalidade da fixture de cronograma.');
            }
            Assertions::assert('Fixture cria outra modalidade coletiva de mesma categoria e gênero', $createdModalityId > 0);
            $secondModalityId = $createdModalityId;
            $connection->query("UPDATE modalidades SET status_modalidade = '1' WHERE id_modalidade = {$secondModalityId}");
            $individualTypeId = (int) $connection->query("SELECT id_tipo_modalidade FROM tipos_modalidades WHERE LOWER(TRIM(nome_tipo_modalidade)) = 'individual' ORDER BY id_tipo_modalidade LIMIT 1")->fetch_column();
            if ($individualTypeId <= 0) {
                throw new \RuntimeException('A fixture não encontrou o tipo de modalidade individual.');
            }
            $createdIndividual = $admin->postJson('api/v1/modalidades', [
                'nome_modalidade' => 'Prova individual cronograma ' . bin2hex(random_bytes(3)),
                'genero_modalidade' => $primaryGender,
                'max_inscrito_modalidade' => 3,
                'max_equipes' => 3,
                'tipos_modalidades_id_tipo_modalidade' => $individualTypeId,
                'categorias_id_categoria' => $categoryId,
                'interclasses_id_interclasse' => $editionId,
            ]);
            $createdIndividualModalityId = (int) ($createdIndividual['json']['id_modalidade'] ?? 0);
            if ($createdIndividualModalityId <= 0 || ($createdIndividual['code'] ?? 0) < 200 || ($createdIndividual['code'] ?? 0) >= 300) {
                throw new \RuntimeException('Não foi possível criar a modalidade individual da fixture.');
            }
            $connection->query("UPDATE modalidades SET status_modalidade = '1' WHERE id_modalidade = {$createdIndividualModalityId}");
            $connection->query("INSERT INTO interclasse_planejamentos (id_interclasse, cronograma_status, inscricoes_status) VALUES ({$editionId}, 'rascunho', 'fechadas') ON DUPLICATE KEY UPDATE cronograma_status = 'rascunho', inscricoes_status = 'fechadas', cronograma_versao = 0");
            $connection->query("INSERT INTO modalidade_planejamentos (id_modalidade, equipes_planejadas, min_inscritos_equipe, max_inscritos_equipe, formato_participacao, duracao_prevista_min, descanso_min) VALUES ({$modalityId}, 3, 1, 1, 'equipe', 20, 10) ON DUPLICATE KEY UPDATE equipes_planejadas = 3, min_inscritos_equipe = 1, max_inscritos_equipe = 1, formato_participacao = 'equipe'");
            $connection->query("INSERT INTO modalidade_planejamentos (id_modalidade, equipes_planejadas, min_inscritos_equipe, max_inscritos_equipe, formato_participacao, duracao_prevista_min, descanso_min) VALUES ({$secondModalityId}, 6, 1, 1, 'equipe', 20, 10) ON DUPLICATE KEY UPDATE equipes_planejadas = 6, min_inscritos_equipe = 1, max_inscritos_equipe = 1, formato_participacao = 'equipe'");
            $connection->query("INSERT INTO modalidade_planejamentos (id_modalidade, equipes_planejadas, min_inscritos_equipe, max_inscritos_equipe, formato_participacao, duracao_prevista_min, descanso_min) VALUES ({$createdIndividualModalityId}, 3, 1, 1, 'individual', 20, 10) ON DUPLICATE KEY UPDATE equipes_planejadas = 3, min_inscritos_equipe = 1, max_inscritos_equipe = 1, formato_participacao = 'individual'");
            $cronogramaHttpAdmin = new TestClient();
            Assertions::assertJsonSuccess('Administrador autentica para consultar o cronograma preparado', $cronogramaHttpAdmin->login('admin', '123'));
            Assertions::assertStatus('Administrador autorizado consulta o cronograma preparado pela API',
                $cronogramaHttpAdmin->get('api/v1/cronograma?id_interclasse=' . $editionId), 200);
            $connection->query("INSERT INTO agenda_reservas (id_interclasse, id_modalidade, chave_versao, chave_tag, data_reserva, inicio_reserva, termino_reserva, id_local) VALUES ({$editionId}, {$modalityId}, 'manual-test', 'BLOQUEIO-CRONOGRAMA', '2030-10-01', '08:15:00', '08:25:00', {$localId})");
            $reservationId = (int) $connection->insert_id;
            $legacyTeamId = (int) $connection->query("SELECT e.id_equipe FROM equipes e LEFT JOIN equipe_planejamentos ep ON ep.id_equipe = e.id_equipe WHERE e.modalidades_id_modalidade = {$modalityId} AND e.turmas_id_turma = {$firstClassId} AND e.status_equipe = '1' AND ep.id_equipe IS NULL ORDER BY e.id_equipe LIMIT 1")->fetch_column();
            if ($legacyTeamId <= 0) {
                $legacyName = $connection->real_escape_string('Equipe padrão sem planejamento');
                $connection->query("INSERT INTO equipes (status_equipe, modalidades_id_modalidade, turmas_id_turma, nome_equipe) VALUES ('1', {$modalityId}, {$firstClassId}, '{$legacyName}')");
                $legacyTeamId = (int) $connection->insert_id;
            }
            $service = new CronogramaService(new MysqliCronogramaRepository($connection));
            $service->preparar($editionId, 1);
            $legacyPrepared = (int) $connection->query("SELECT planejada FROM equipe_planejamentos WHERE id_equipe = {$legacyTeamId}")->fetch_column();
            Assertions::assert('Preparação incorpora equipes padrão sem metadados', $legacyPrepared === 1);
            $preparedTeamForRegression = (int) $connection->query("SELECT e.id_equipe FROM equipes e INNER JOIN equipe_planejamentos ep ON ep.id_equipe = e.id_equipe WHERE e.modalidades_id_modalidade = {$modalityId} AND e.turmas_id_turma = {$firstClassId} AND e.status_equipe = '1' ORDER BY ep.ordem_planejada, e.id_equipe LIMIT 1")->fetch_column();
            if ($preparedTeamForRegression <= 0) {
                throw new \RuntimeException('A fixture não criou equipe planejada para a regressão de reativação.');
            }
            $connection->query("UPDATE equipe_planejamentos SET planejada = 0 WHERE id_equipe = {$preparedTeamForRegression}");
            $service->preparar($editionId, 1);
            $reactivated = (int) $connection->query("SELECT planejada FROM equipe_planejamentos WHERE id_equipe = {$preparedTeamForRegression}")->fetch_column();
            Assertions::assert('Preparação reativa equipes padrão existentes', $reactivated === 1);
            $connection->query("DELETE ehu FROM equipes_has_usuarios ehu INNER JOIN equipes e ON e.id_equipe = ehu.equipes_id_equipe INNER JOIN equipe_planejamentos ep ON ep.id_equipe = e.id_equipe WHERE e.modalidades_id_modalidade IN ({$modalityId}, {$secondModalityId}, {$createdIndividualModalityId})");
            $membershipsBeforePlanning = (int) $connection->query("SELECT COUNT(*) FROM equipes_has_usuarios ehu INNER JOIN equipes e ON e.id_equipe = ehu.equipes_id_equipe WHERE e.modalidades_id_modalidade IN ({$modalityId}, {$secondModalityId}, {$createdIndividualModalityId})")->fetch_column();
            Assertions::assert('Planejamento começa sem alunos vinculados às equipes', $membershipsBeforePlanning === 0);
            $connection->query("UPDATE modalidade_planejamentos SET equipes_planejadas = 4 WHERE id_modalidade = {$modalityId}");
            $staleTeamsRejected = false;
            try {
                $service->gerar($editionId, 1, [
                    'data_inicio' => '2030-10-01', 'data_fim' => '2030-10-01',
                    'hora_inicio' => '08:00', 'hora_fim' => '18:00', 'duracao_min' => 20,
                    'id_locais' => [$localId],
                ]);
            } catch (\InvalidArgumentException $exception) {
                $staleTeamsRejected = str_contains($exception->getMessage(), 'Preparar equipes');
            }
            $connection->query("UPDATE modalidade_planejamentos SET equipes_planejadas = 3 WHERE id_modalidade = {$modalityId}");
            Assertions::assert('Geração bloqueia configuração divergente das equipes preparadas', $staleTeamsRejected);
            $draft = $service->gerar($editionId, 1, [
                'data_inicio' => '2030-10-01',
                'data_fim' => '2030-10-01',
                'hora_inicio' => '08:00',
                'hora_fim' => '18:00',
                'duracao_min' => 20,
                'id_locais' => [$localId],
            ]);
            $firstNodes = array_values(array_filter($draft['nos'] ?? [], static fn (array $node): bool => (int) ($node['id_modalidade'] ?? 0) === $modalityId));
            $normalNodes = array_values(array_filter($firstNodes, static fn (array $node): bool => ($node['tipo_no'] ?? '') === 'normal'));
            $byeNodes = array_values(array_filter($firstNodes, static fn (array $node): bool => ($node['tipo_no'] ?? '') === 'bye'));
            $firstCommitments = array_values(array_filter($draft['compromissos'] ?? [], static fn (array $item): bool => (int) ($item['id_modalidade'] ?? 0) === $modalityId));
            Assertions::assert('Geração planejada usa a árvore exata de três equipes', $draft['success'] === true && count($normalNodes) === 2 && count($byeNodes) === 1 && count($firstCommitments) === 2 && ($firstCommitments[0]['condicional'] ?? 1) === 0);
            Assertions::assert('Busca o primeiro horário livre após reserva e margem de troca', ($firstCommitments[0]['inicio_compromisso'] ?? '') === '08:35:00');
            Assertions::assert('A geração persiste a árvore planejada sem jogos reais', count($draft['nos'] ?? []) >= count($draft['compromissos'] ?? []) && count($draft['nos'] ?? []) > 0);
            $incompleteRejected = false;
            try {
                $service->publicar($editionId, 1, ['cronograma_versao' => 0, 'compromissos' => [], 'nos' => $draft['nos']]);
            } catch (\InvalidArgumentException $exception) {
                $incompleteRejected = str_contains($exception->getMessage(), 'compromisso') || str_contains($exception->getMessage(), 'cronograma');
            }
            $publishedRowsAfterRejectedAttempt = (int) $connection->query("SELECT COUNT(*) FROM cronograma_nos WHERE id_interclasse = {$editionId}")->fetch_column();
            Assertions::assert('Publicação incompleta recusa a proposta e não grava árvore parcial', $incompleteRejected && $publishedRowsAfterRejectedAttempt === 0);
            $published = $service->publicar($editionId, 1, ['cronograma_versao' => 0, 'compromissos' => $draft['compromissos'], 'nos' => $draft['nos']]);
            $timezone = new \DateTimeZone(date_default_timezone_get());
            $expiredClosing = (new \DateTimeImmutable('now', $timezone))->modify('-1 minute')->format('Y-m-d H:i:s');
            $expiredOpening = (new \DateTimeImmutable($expiredClosing, $timezone))->modify('-1 hour')->format('Y-m-d H:i:s');
            $expiredWindowRejected = false;
            try {
                $service->abrir($editionId, 1, ['cronograma_versao' => $published['cronograma_versao'], 'inscricoes_abertura' => $expiredOpening, 'inscricoes_encerramento' => $expiredClosing]);
            } catch (\InvalidArgumentException $exception) {
                $expiredWindowRejected = str_contains($exception->getMessage(), 'no futuro');
            }
            Assertions::assert('Abertura recusa janela já encerrada', $expiredWindowRejected && $service->estado($editionId)['inscricoes_status'] === 'fechadas');
            $opened = $service->abrir($editionId, 1, ['cronograma_versao' => $published['cronograma_versao'], 'inscricoes_abertura' => '2020-01-01 00:00:00', 'inscricoes_encerramento' => '2031-01-01 00:00:00']);
            Assertions::assert('Publicação ocorre antes da abertura das inscrições', $published['cronograma_status'] === 'publicado' && $opened['inscricoes_status'] === 'abertas');
            $openedAgain = $service->abrir($editionId, 1, ['cronograma_versao' => $published['cronograma_versao'], 'inscricoes_abertura' => '2020-01-01 00:00:00', 'inscricoes_encerramento' => '2031-01-01 00:00:00']);
            Assertions::assert('Repetir a mesma abertura de inscrições é idempotente', $openedAgain['inscricoes_status'] === 'abertas');
            $publishedState = $service->estado($editionId);
            Assertions::assert('Estado publicado expõe a mesma revisão e compromisso', $publishedState['cronograma_versao'] === $published['cronograma_versao']);
            $adminPreviewCommitment = $publishedState['compromissos'][0] ?? [];
            Assertions::assert('Prévia administrativa inclui modalidade e local legíveis', trim((string) ($adminPreviewCommitment['nome_modalidade'] ?? '')) !== '' && trim((string) ($adminPreviewCommitment['nome_local'] ?? '')) !== '');
            $service->fechar($editionId, 1, ['cronograma_versao' => $published['cronograma_versao']]);
            $closedAgain = $service->fechar($editionId, 1, ['cronograma_versao' => $published['cronograma_versao']]);
            Assertions::assert('Repetir o encerramento das inscrições é idempotente', $closedAgain['inscricoes_status'] === 'encerradas');
            $nodeId = (int) $connection->query("SELECT id_no FROM cronograma_nos WHERE id_interclasse = {$editionId} AND cronograma_versao = {$published['cronograma_versao']} AND tipo_no = 'normal' ORDER BY id_no LIMIT 1")->fetch_column();
            $releaseRejected = false;
            try {
                $service->liberar($editionId, 1, ['cronograma_versao' => $published['cronograma_versao']]);
            } catch (\InvalidArgumentException $exception) {
                $releaseRejected = str_contains($exception->getMessage(), 'mínimos de elenco');
            }
            Assertions::assert('Liberação exige mínimos de elenco antes da operação', $releaseRejected);
            $materializationRejected = false;
            try {
                $service->materializar($editionId, 1, ['id_no' => $nodeId]);
            } catch (\InvalidArgumentException $exception) {
                $materializationRejected = str_contains($exception->getMessage(), 'operação liberada');
            }
            Assertions::assert('Materialização bloqueia operação não liberada', $materializationRejected);
            $teamId = (int) $connection->query("SELECT e.id_equipe FROM equipes e INNER JOIN equipe_planejamentos ep ON ep.id_equipe = e.id_equipe WHERE e.modalidades_id_modalidade = {$modalityId} AND e.turmas_id_turma = {$firstClassId} AND e.status_equipe = '1' ORDER BY ep.ordem_planejada LIMIT 1")->fetch_column();
            $cronogramaRepository = new MysqliCronogramaRepository($connection);
            $parallelTeams = $connection->query("SELECT id_equipe FROM equipes WHERE modalidades_id_modalidade = {$modalityId} AND status_equipe = '1' ORDER BY id_equipe LIMIT 2")->fetch_all(MYSQLI_ASSOC);
            $parallelName = 'FORA-DO-PLANO-' . bin2hex(random_bytes(4));
            $parallelResponse = $admin->postJson('api/v1/sincronizacao/chaveamento', [
                'id_modalidade' => $modalityId,
                'tipo_modalidade' => 'mata_mata',
                'jogos' => [[
                    'nome_jogo' => $parallelName,
                    'status_jogo' => 'Agendado',
                    'partidas' => [
                        ['id_equipe' => (int) ($parallelTeams[0]['id_equipe'] ?? 0), 'resultado' => 0],
                        ['id_equipe' => (int) ($parallelTeams[1]['id_equipe'] ?? 0), 'resultado' => 0],
                    ],
                ]],
            ]);
            $parallelGameCount = (int) $connection->query("SELECT COUNT(*) FROM jogos WHERE modalidades_id_modalidade = {$modalityId} AND nome_jogo = '{$connection->real_escape_string($parallelName)}'")->fetch_column();
            Assertions::assert(
                'Sincronização legada não cria outro jogo depois da publicação do calendário',
                ($parallelResponse['code'] ?? 0) === 400
                && ($parallelResponse['json']['success'] ?? true) === false
                && $parallelGameCount === 0,
                json_encode(['response' => $parallelResponse, 'games' => $parallelGameCount], JSON_UNESCAPED_UNICODE),
            );
            $projected = $cronogramaRepository->commitmentsForTeams($editionId, [$teamId]);
            Assertions::assert('Projeção da inscrição inclui as fases possíveis da equipe', count($projected) === 2 && count(array_filter($projected, static fn (array $item): bool => (int) ($item['condicional'] ?? 0) === 1)) === 1);
            $studentAgenda = $cronogramaRepository->studentAgenda($editionId, $createdStudentId, [$teamId]);
            Assertions::assert('Aluno consulta a agenda publicada antes de possuir elenco', ($studentAgenda['publicado'] ?? false) === true && count($studentAgenda['compromissos'] ?? []) === 2 && count($studentAgenda['equipes'] ?? []) === 1);
            $service->abrir($editionId, 1, ['cronograma_versao' => $published['cronograma_versao'], 'inscricoes_abertura' => '2020-01-01 00:00:00', 'inscricoes_encerramento' => '2031-01-01 00:00:00']);
            $secondTeamId = (int) $connection->query("SELECT e.id_equipe FROM equipes e INNER JOIN equipe_planejamentos ep ON ep.id_equipe = e.id_equipe WHERE e.modalidades_id_modalidade = {$secondModalityId} AND e.turmas_id_turma = {$firstClassId} AND e.status_equipe = '1' ORDER BY ep.ordem_planejada LIMIT 1")->fetch_column();
            $studentId = $createdStudentId;
            if ($secondTeamId <= 0 || $studentId <= 0) {
                throw new \RuntimeException('A fixture não possui equipe e estudante compatíveis para o conflito planejado.');
            }
            $secondOriginalCommitments = $connection->query("SELECT id_compromisso, data_compromisso, inicio_compromisso, termino_compromisso, id_local FROM cronograma_compromissos WHERE id_interclasse = {$editionId} AND id_modalidade = {$secondModalityId} AND cronograma_versao = {$published['cronograma_versao']} ORDER BY data_compromisso, inicio_compromisso, id_compromisso")->fetch_all(MYSQLI_ASSOC);
            $firstSlot = $firstCommitments[0] ?? [];
            $overlapDate = $connection->real_escape_string((string) ($firstSlot['data_compromisso'] ?? '2030-10-01'));
            $overlapStart = $connection->real_escape_string((string) ($firstSlot['inicio_compromisso'] ?? '08:30:00'));
            $overlapEnd = $connection->real_escape_string((string) ($firstSlot['termino_compromisso'] ?? '08:50:00'));
            $overlapLocal = (int) ($firstSlot['id_local'] ?? $localId);
            $connection->query("UPDATE cronograma_compromissos SET data_compromisso = '{$overlapDate}', inicio_compromisso = '{$overlapStart}', termino_compromisso = '{$overlapEnd}', id_local = {$overlapLocal} WHERE id_interclasse = {$editionId} AND id_modalidade = {$secondModalityId} AND cronograma_versao = {$published['cronograma_versao']}");
            $equipes = new MysqliEquipeRepository($connection, new MysqliCronogramaRepository($connection));
            $equipes->addUsers($teamId, [$studentId]);
            $conflictRejected = false;
            try {
                $equipes->addUsers($secondTeamId, [$studentId]);
            } catch (\InvalidArgumentException $exception) {
                $conflictRejected = str_contains($exception->getMessage(), 'Conflito de agenda');
            }
            Assertions::assert('Inscrição planejada recusa conflito entre modalidades da mesma turma', $conflictRejected);
            $restoreCommitment = $connection->prepare('UPDATE cronograma_compromissos SET data_compromisso = ?, inicio_compromisso = ?, termino_compromisso = ?, id_local = ? WHERE id_compromisso = ?');
            foreach ($secondOriginalCommitments as $commitment) {
                $date = (string) $commitment['data_compromisso'];
                $start = (string) $commitment['inicio_compromisso'];
                $end = (string) $commitment['termino_compromisso'];
                $venue = (int) $commitment['id_local'];
                $commitmentId = (int) $commitment['id_compromisso'];
                $restoreCommitment->bind_param('sssii', $date, $start, $end, $venue, $commitmentId);
                $restoreCommitment->execute();
            }
            $restoreCommitment->close();

            $createFixtureStudent = static function () use ($connection, $firstClassId, $editionId, $primaryGender, &$createdStudentIds): int {
                $registration = 'CRONOGRAMA-' . bin2hex(random_bytes(4));
                $name = 'Aluno Cronograma ' . count($createdStudentIds);
                $password = password_hash('cronograma-fixture', PASSWORD_DEFAULT);
                $statement = $connection->prepare("INSERT INTO usuarios (sigla_usuario, matricula_usuario, nome_usuario, senha_usuario, nivel_usuario, genero_usuario, data_nasc_usuario, foto_usuario, status_usuario, turmas_id_turma, interclasses_id_interclasse, chave_usuario_edicao) VALUES ('RM', ?, ?, ?, '3', ?, '2010-01-01', '', '1', ?, ?, NULL)");
                $statement->bind_param('ssssii', $registration, $name, $password, $primaryGender, $firstClassId, $editionId);
                $statement->execute();
                $studentId = (int) $connection->insert_id;
                $statement->close();
                $createdStudentIds[] = $studentId;
                return $studentId;
            };
            $allPlannedTeams = $connection->query("SELECT e.id_equipe, e.modalidades_id_modalidade FROM equipes e INNER JOIN equipe_planejamentos ep ON ep.id_equipe = e.id_equipe WHERE e.modalidades_id_modalidade IN ({$modalityId}, {$secondModalityId}, {$createdIndividualModalityId}) AND e.status_equipe = '1' ORDER BY e.modalidades_id_modalidade, ep.ordem_planejada, e.id_equipe")->fetch_all(MYSQLI_ASSOC);
            foreach ($allPlannedTeams as $plannedTeam) {
                $plannedTeamId = (int) $plannedTeam['id_equipe'];
                if ($plannedTeamId === $teamId || $plannedTeamId === $secondTeamId) {
                    continue;
                }
                $equipes->addUsers($plannedTeamId, [$createFixtureStudent()]);
            }
            $sharedStudentAllowed = true;
            try {
                $equipes->addUsers($secondTeamId, [$studentId]);
            } catch (\InvalidArgumentException) {
                $sharedStudentAllowed = false;
            }
            Assertions::assert('Aluno pode permanecer em duas modalidades com horários separados', $sharedStudentAllowed);
            $reviewed = $service->revisar($editionId, 1, ['cronograma_versao' => $published['cronograma_versao']]);
            $oldSnapshot = (int) $connection->query("SELECT COUNT(*) FROM cronograma_compromissos WHERE id_interclasse = {$editionId} AND cronograma_versao = {$published['cronograma_versao']}")->fetch_column();
            Assertions::assert('Revisão fecha o cronograma', $reviewed['cronograma_status'] === 'revisao');
            Assertions::assert('Revisão fecha as inscrições', $reviewed['inscricoes_status'] === 'fechadas');
            Assertions::assert('Revisão avança a versão', (int) $reviewed['cronograma_versao'] === (int) $published['cronograma_versao'] + 1);
            Assertions::assert('Revisão preserva todos os compromissos da versão suspensa', $oldSnapshot === (int) ($published['compromissos'] ?? -1));

            $suspendedSlots = $connection->query("SELECT data_compromisso, inicio_compromisso, termino_compromisso, id_local FROM cronograma_compromissos WHERE id_interclasse = {$editionId} AND id_modalidade = {$modalityId} AND cronograma_versao = {$published['cronograma_versao']} ORDER BY data_compromisso, inicio_compromisso")->fetch_all(MYSQLI_ASSOC);
            if (count($suspendedSlots) !== 2) {
                throw new \RuntimeException('A fixture precisa de dois compromissos da modalidade para a revisão de janela justa.');
            }
            $tightDate = (string) $suspendedSlots[0]['data_compromisso'];
            $tightStart = (string) $suspendedSlots[0]['inicio_compromisso'];
            $tightEnd = (string) $suspendedSlots[array_key_last($suspendedSlots)]['termino_compromisso'];
            $connection->query("UPDATE modalidades SET status_modalidade = '0' WHERE id_modalidade IN ({$secondModalityId}, {$createdIndividualModalityId})");
            $tightDraft = $service->gerar($editionId, 1, [
                'data_inicio' => $tightDate,
                'data_fim' => $tightDate,
                'hora_inicio' => $tightStart,
                'hora_fim' => $tightEnd,
                'duracao_min' => 20,
                'id_locais' => [$localId],
            ]);
            $tightModalSlots = array_values(array_filter($tightDraft['compromissos'], static fn (array $item): bool => (int) $item['id_modalidade'] === $modalityId));
            $sameSlots = count($tightModalSlots) === count($suspendedSlots);
            foreach ($tightModalSlots as $index => $item) {
                $old = $suspendedSlots[$index] ?? [];
                $sameSlots = $sameSlots
                    && (string) $item['data_compromisso'] === (string) ($old['data_compromisso'] ?? '')
                    && (string) $item['inicio_compromisso'] === (string) ($old['inicio_compromisso'] ?? '')
                    && (string) $item['termino_compromisso'] === (string) ($old['termino_compromisso'] ?? '')
                    && (int) $item['id_local'] === (int) ($old['id_local'] ?? 0);
            }
            Assertions::assert('Revisão reaproveita a mesma janela justa e os horários da publicação suspensa',
                $tightDraft['success'] === true && $tightDraft['pendencias'] === [] && $sameSlots);

            $stalePublishRejected = false;
            try {
                $service->publicar($editionId, 1, [
                    'cronograma_versao' => $published['cronograma_versao'],
                    'compromissos' => $tightDraft['compromissos'],
                    'nos' => $tightDraft['nos'],
                ]);
            } catch (\InvalidArgumentException) {
                $stalePublishRejected = true;
            }
            $revisionAfterStalePublish = $service->estado($editionId);
            $rowsFromRejectedRevision = (int) $connection->query("SELECT COUNT(*) FROM cronograma_nos WHERE id_interclasse = {$editionId} AND cronograma_versao = {$reviewed['cronograma_versao']}")->fetch_column();
            $oldSnapshotAfterStalePublish = (int) $connection->query("SELECT COUNT(*) FROM cronograma_compromissos WHERE id_interclasse = {$editionId} AND cronograma_versao = {$published['cronograma_versao']}")->fetch_column();
            Assertions::assert('Publicação com revisão antiga é recusada sem gravar nem substituir snapshots',
                $stalePublishRejected
                && (int) $revisionAfterStalePublish['cronograma_versao'] === (int) $reviewed['cronograma_versao']
                && $rowsFromRejectedRevision === 0
                && $oldSnapshotAfterStalePublish === $oldSnapshot);
            $connection->query("UPDATE modalidades SET status_modalidade = '1' WHERE id_modalidade IN ({$secondModalityId}, {$createdIndividualModalityId})");

            $finalDraft = $service->gerar($editionId, 1, [
                'data_inicio' => '2030-10-01',
                'data_fim' => '2030-10-01',
                'hora_inicio' => '08:00',
                'hora_fim' => '18:00',
                'duracao_min' => 20,
                'id_locais' => [$localId],
            ]);
            $lateSlot = $finalDraft['compromissos'][0] ?? [];
            $lateDate = $connection->real_escape_string((string) ($lateSlot['data_compromisso'] ?? ''));
            $lateStart = $connection->real_escape_string((string) ($lateSlot['inicio_compromisso'] ?? ''));
            $lateEnd = $connection->real_escape_string((string) ($lateSlot['termino_compromisso'] ?? ''));
            $lateLocalId = (int) ($lateSlot['id_local'] ?? 0);
            $connection->query("INSERT INTO agenda_reservas (id_interclasse, id_modalidade, chave_versao, chave_tag, data_reserva, inicio_reserva, termino_reserva, id_local) VALUES ({$editionId}, {$modalityId}, 'late-test', 'BLOQUEIO-DEPOIS-DA-GERACAO', '{$lateDate}', '{$lateStart}', '{$lateEnd}', {$lateLocalId})");
            $lateReservationId = (int) $connection->insert_id;
            $lateConflictRejected = false;
            try {
                $service->publicar($editionId, 1, [
                    'cronograma_versao' => $reviewed['cronograma_versao'],
                    'compromissos' => $finalDraft['compromissos'],
                    'nos' => $finalDraft['nos'],
                ]);
            } catch (\InvalidArgumentException $exception) {
                $lateConflictRejected = str_contains($exception->getMessage(), 'reserva independente');
            }
            $stateAfterLateConflict = $service->estado($editionId);
            Assertions::assert('Publicação revalida e recusa reserva criada depois da geração sem gravar a árvore',
                $lateConflictRejected
                && (int) $stateAfterLateConflict['cronograma_versao'] === (int) $reviewed['cronograma_versao']
                && (int) $stateAfterLateConflict['versao_publicada'] === (int) $published['cronograma_versao']);
            $connection->query('DELETE FROM agenda_reservas WHERE id_reserva = ' . $lateReservationId);
            $lateReservationId = 0;
            $finalPublished = $service->publicar($editionId, 1, [
                'cronograma_versao' => $reviewed['cronograma_versao'],
                'compromissos' => $finalDraft['compromissos'],
                'nos' => $finalDraft['nos'],
            ]);
            Assertions::assert('Republicação com o mesmo aluno em modalidades sem conflito é aceita', $finalPublished['cronograma_status'] === 'publicado' && (int) $finalPublished['cronograma_versao'] === (int) $reviewed['cronograma_versao'] + 1);
            $oldCommitmentId = (int) $connection->query("SELECT id_compromisso FROM cronograma_compromissos WHERE id_interclasse = {$editionId} AND cronograma_versao = {$published['cronograma_versao']} ORDER BY id_compromisso LIMIT 1")->fetch_column();
            $connection->query("UPDATE cronograma_compromissos SET data_compromisso = '2032-10-01', inicio_compromisso = '08:00:00', termino_compromisso = '08:20:00', id_local = {$localId} WHERE id_compromisso = {$oldCommitmentId}");
            $historicPlanConflict = MysqliLocalScheduleGuard::conflict($connection, '2032-10-01', $localId, '08:00:00', '08:20:00');
            $activeSlot = $finalDraft['compromissos'][0] ?? [];
            $activePlanConflict = MysqliLocalScheduleGuard::conflict(
                $connection,
                (string) ($activeSlot['data_compromisso'] ?? ''),
                (int) ($activeSlot['id_local'] ?? 0),
                (string) ($activeSlot['inicio_compromisso'] ?? ''),
                (string) ($activeSlot['termino_compromisso'] ?? ''),
            );
            Assertions::assert('Guarda ignora snapshot antigo e continua bloqueando a publicação atual', $historicPlanConflict === null && str_contains((string) $activePlanConflict, 'compromisso publicado'));
            $service->fechar($editionId, 1, ['cronograma_versao' => $finalPublished['cronograma_versao']]);
            $teamChangedAfterPublish = $secondTeamId;
            $equipes->update($teamChangedAfterPublish, ['status_equipe' => '0']);
            $releaseOfStaleTreeRejected = false;
            $staleTreeReleaseMessage = '';
            $staleTreeReleaseResult = null;
            try {
                $staleTreeReleaseResult = $service->liberar($editionId, 1, ['cronograma_versao' => $finalPublished['cronograma_versao']]);
            } catch (\InvalidArgumentException $exception) {
                $staleTreeReleaseMessage = $exception->getMessage();
                $releaseOfStaleTreeRejected = str_contains($exception->getMessage(), 'equipe') || str_contains($exception->getMessage(), 'equipes');
            }
            $equipes->update($teamChangedAfterPublish, ['status_equipe' => '1']);
            Assertions::assert(
                'Liberação recusa árvore cuja configuração de equipes mudou após publicar',
                $releaseOfStaleTreeRejected,
                json_encode(['message' => $staleTreeReleaseMessage, 'result' => $staleTreeReleaseResult], JSON_UNESCAPED_UNICODE),
            );
            $preview = MysqliChaveamentoRepository::montarJsonArvore($connection, $modalityId);
            $plannedPreview = array_values(array_filter($preview['jogos'] ?? [], static fn (array $game): bool => (bool) ($game['virtual_planejado'] ?? false)));
            Assertions::assert('Árvore publicada aparece como prevista antes da liberação', count($plannedPreview) === 3 && count(array_filter($plannedPreview, static fn (array $game): bool => ($game['status_jogo'] ?? '') === 'Previsto')) >= 2);
            $sixTeamPreview = MysqliChaveamentoRepository::montarJsonArvore($connection, $secondModalityId);
            $sixTeamNodes = array_values(array_filter($sixTeamPreview['jogos'] ?? [], static fn (array $game): bool => ($game['virtual_planejado'] ?? false)));
            $sixTeamOpeningGames = array_values(array_filter($sixTeamNodes, static fn (array $game): bool => (int) ($game['fase_nivel'] ?? 0) === 8 && !($game['eh_bye'] ?? false)));
            $sixTeamByes = array_values(array_filter($sixTeamNodes, static fn (array $game): bool => (int) ($game['fase_nivel'] ?? 0) === 4 && (bool) ($game['eh_bye'] ?? false)));
            Assertions::assert('Modalidade com seis equipes prevê três jogos iniciais, uma semifinal e BYE intermediário', count($sixTeamNodes) === 6 && count($sixTeamOpeningGames) === 3 && count($sixTeamByes) === 1, 'nós=' . count($sixTeamNodes) . ', abertura=' . count($sixTeamOpeningGames) . ', byes=' . count($sixTeamByes) . ', árvore=' . json_encode($sixTeamPreview['jogos'] ?? []));
            $releaseNodes = $connection->query("SELECT cn.id_no, cn.id_modalidade, cn.chave_tag, cc.data_compromisso, cc.inicio_compromisso, cc.termino_compromisso, cc.id_local FROM cronograma_nos cn INNER JOIN cronograma_compromissos cc ON cc.id_interclasse = cn.id_interclasse AND cc.id_modalidade = cn.id_modalidade AND cc.cronograma_versao = cn.cronograma_versao AND cc.chave_tag = cn.chave_tag WHERE cn.id_interclasse = {$editionId} AND cn.cronograma_versao = {$finalPublished['cronograma_versao']} AND cn.origem_a_tag IS NULL AND cn.origem_b_tag IS NULL AND cn.tipo_no <> 'bye' ORDER BY cn.fase_largura DESC, cn.slot, cn.id_no")->fetch_all(MYSQLI_ASSOC);
            if (count($releaseNodes) < 2) {
                throw new \RuntimeException('A fixture precisa de dois confrontos iniciais para testar rollback da liberação.');
            }
            $blockerTarget = $releaseNodes[1];
            $blockerName = 'BLOQUEIO-LIBERACAO-' . bin2hex(random_bytes(4));
            $blocker = $connection->prepare("INSERT INTO jogos (nome_jogo, data_jogo, inicio_jogo, termino_jogo, status_jogo, modalidades_id_modalidade, locais_id_local) VALUES (?, ?, ?, ?, 'Agendado', ?, ?)");
            $blockerDate = (string) $blockerTarget['data_compromisso'];
            $blockerStart = (string) $blockerTarget['inicio_compromisso'];
            $blockerEnd = (string) $blockerTarget['termino_compromisso'];
            $blockerModalityId = (int) $blockerTarget['id_modalidade'];
            $blockerLocalId = (int) $blockerTarget['id_local'];
            $blocker->bind_param('ssssii', $blockerName, $blockerDate, $blockerStart, $blockerEnd, $blockerModalityId, $blockerLocalId);
            $blocker->execute();
            $releaseBlockerGameId = (int) $connection->insert_id;
            $blocker->close();
            $releaseRollback = false;
            try {
                $service->liberar($editionId, 1, ['cronograma_versao' => $finalPublished['cronograma_versao']]);
            } catch (\InvalidArgumentException $exception) {
                $releaseRollback = str_contains($exception->getMessage(), 'conflito') || str_contains($exception->getMessage(), 'agendado');
            }
            $rolledBackGameLinks = (int) $connection->query("SELECT COUNT(*) FROM cronograma_nos WHERE id_interclasse = {$editionId} AND cronograma_versao = {$finalPublished['cronograma_versao']} AND id_jogo IS NOT NULL")->fetch_column();
            $rolledBackOperationFlag = (int) $connection->query("SELECT operacao_liberada FROM interclasse_planejamentos WHERE id_interclasse = {$editionId}")->fetch_column();
            Assertions::assert('Falha em confronto posterior reverte jogos, vínculos e flag da liberação', $releaseRollback && $rolledBackGameLinks === 0 && $rolledBackOperationFlag === 0, 'erro=' . (int) $releaseRollback . ', vínculos=' . $rolledBackGameLinks . ', flag=' . $rolledBackOperationFlag);
            $connection->query('DELETE FROM jogos WHERE id_jogo = ' . $releaseBlockerGameId);
            $releaseBlockerGameId = 0;
            $released = $service->liberar($editionId, 1, ['cronograma_versao' => $finalPublished['cronograma_versao']]);
            Assertions::assert('Liberação materializa confrontos coletivos e prova individual publicados', $released['liberada'] === true && (int) $released['jogos_criados'] === 5, 'jogos_criados=' . (int) ($released['jogos_criados'] ?? -1));
            $modalityRepository = new MysqliModalidadeRepository($connection);
            $currentPlanning = $connection->query("SELECT equipes_planejadas, min_inscritos_equipe, max_inscritos_equipe, formato_participacao, duracao_prevista_min, descanso_min FROM modalidade_planejamentos WHERE id_modalidade = {$modalityId}")->fetch_assoc();
            $samePlanningSaved = $modalityRepository->update($modalityId, $currentPlanning);
            $samePlanningState = $service->estado($editionId);
            Assertions::assert('Reenviar configuração idêntica após liberação não invalida a operação', $samePlanningSaved && (int) $samePlanningState['operacao_liberada'] === 1 && (int) $samePlanningState['cronograma_versao'] === (int) $finalPublished['cronograma_versao']);
            $changedPlanningRejected = false;
            try {
                $modalityRepository->update($modalityId, array_merge($currentPlanning, ['equipes_planejadas' => 99]));
            } catch (\InvalidArgumentException) {
                $changedPlanningRejected = true;
            }
            $changedPlanningState = $service->estado($editionId);
            Assertions::assert('Alteração estrutural após liberação é recusada sem retirar a flag', $changedPlanningRejected && (int) $changedPlanningState['operacao_liberada'] === 1 && (int) $changedPlanningState['cronograma_versao'] === (int) $finalPublished['cronograma_versao']);
            $deactivationRejected = false;
            try {
                $modalityRepository->deactivate($secondModalityId);
            } catch (\InvalidArgumentException) {
                $deactivationRejected = true;
            }
            Assertions::assert('Desativar modalidade após liberação é recusado', $deactivationRejected && (string) $connection->query("SELECT status_modalidade FROM modalidades WHERE id_modalidade = {$secondModalityId}")->fetch_column() === '1');
            $initialGameCount = (int) $connection->query("SELECT COUNT(*) FROM cronograma_nos WHERE id_interclasse = {$editionId} AND cronograma_versao = {$finalPublished['cronograma_versao']} AND id_jogo IS NOT NULL")->fetch_column();
            Assertions::assert('Liberação associa cada confronto físico ao nó publicado', $initialGameCount === 5, 'vínculos=' . $initialGameCount);
            $individualNode = $connection->query("SELECT id_no, chave_tag, id_jogo FROM cronograma_nos WHERE id_interclasse = {$editionId} AND id_modalidade = {$createdIndividualModalityId} AND cronograma_versao = {$finalPublished['cronograma_versao']} AND tipo_no = 'individual' LIMIT 1")->fetch_assoc();
            $individualGameId = (int) ($individualNode['id_jogo'] ?? 0);
            $individualGame = $individualGameId > 0
                ? $connection->query('SELECT nome_jogo, status_jogo, data_jogo, inicio_jogo, locais_id_local FROM jogos WHERE id_jogo = ' . $individualGameId)->fetch_assoc()
                : null;
            $individualCommitment = $connection->query("SELECT data_compromisso, inicio_compromisso, id_local FROM cronograma_compromissos WHERE id_interclasse = {$editionId} AND id_modalidade = {$createdIndividualModalityId} AND cronograma_versao = {$finalPublished['cronograma_versao']} LIMIT 1")->fetch_assoc();
            Assertions::assert('Liberação prepara a prova individual na sessão publicada sem geração paralela',
                $individualGame !== null
                && $individualNode !== null
                && str_starts_with((string) $individualGame['nome_jogo'], 'IND:')
                && $individualGame['status_jogo'] === 'Agendado'
                && $individualCommitment !== null
                && $individualGame['data_jogo'] === $individualCommitment['data_compromisso']
                && $individualGame['inicio_jogo'] === $individualCommitment['inicio_compromisso']
                && (int) $individualGame['locais_id_local'] === (int) $individualCommitment['id_local']);
            $individualParticipants = array_map(
                static fn (array $row): int => (int) $row['usuarios_id_usuario'],
                $connection->query("SELECT ehu.usuarios_id_usuario FROM equipes_has_usuarios ehu INNER JOIN equipes e ON e.id_equipe = ehu.equipes_id_equipe WHERE e.modalidades_id_modalidade = {$createdIndividualModalityId} ORDER BY e.id_equipe, ehu.usuarios_id_usuario")->fetch_all(MYSQLI_ASSOC),
            );
            if (count($individualParticipants) !== 3) {
                throw new \RuntimeException('A prova individual planejada precisa de três atletas de fixture para registrar o pódio.');
            }
            $connection->query("UPDATE jogos SET status_jogo = 'Iniciado' WHERE id_jogo = {$individualGameId}");
            $individualRanking = [
                'primeiro' => $individualParticipants[0],
                'segundo' => $individualParticipants[1],
                'terceiro' => $individualParticipants[2],
            ];
            $rankingResponse = $admin->postJson('api/v1/chaveamentos', [
                'tipo_modalidade' => 'individual',
                'id_modalidade' => $createdIndividualModalityId,
                'id_jogo' => $individualGameId,
                'ranking' => $individualRanking,
            ]);
            $rankingRows = $connection->query("SELECT usuarios_id_usuario, resultado_partida FROM partidas WHERE jogos_id_jogo = {$individualGameId} ORDER BY resultado_partida")->fetch_all(MYSQLI_ASSOC);
            Assertions::assert('Resultado individual usa o jogo do planejamento e grava as três posições',
                ($rankingResponse['code'] ?? 0) === 200
                && ($rankingResponse['json']['success'] ?? false) === true
                && count($rankingRows) === 3
                && array_map(static fn (array $row): int => (int) $row['usuarios_id_usuario'], $rankingRows) === array_values($individualRanking));
            $rankingRetry = $admin->postJson('api/v1/chaveamentos', [
                'tipo_modalidade' => 'individual',
                'id_modalidade' => $createdIndividualModalityId,
                'id_jogo' => $individualGameId,
                'ranking' => $individualRanking,
            ]);
            $rankingRowsAfterRetry = (int) $connection->query("SELECT COUNT(*) FROM partidas WHERE jogos_id_jogo = {$individualGameId}")->fetch_column();
            $linkedIndividualGames = (int) $connection->query("SELECT COUNT(*) FROM cronograma_nos WHERE id_no = " . (int) ($individualNode['id_no'] ?? 0) . " AND id_jogo = {$individualGameId}")->fetch_column();
            Assertions::assert('Retry de pódio individual preserva o vínculo e três posições sem duplicar jogo',
                ($rankingRetry['code'] ?? 0) === 200
                && ($rankingRetry['json']['success'] ?? false) === true
                && $rankingRowsAfterRetry === 3
                && $linkedIndividualGames === 1);
            $treeAfterRelease = MysqliChaveamentoRepository::montarJsonArvore($connection, $modalityId);
            Assertions::assert('A árvore mantém fases futuras sem criar jogos fictícios', count($treeAfterRelease['jogos'] ?? []) === 3 && count(array_filter($treeAfterRelease['jogos'] ?? [], static fn (array $game): bool => (bool) ($game['virtual_planejado'] ?? false))) === 2);
            $retry = $service->liberar($editionId, 1, ['cronograma_versao' => $finalPublished['cronograma_versao']]);
            $retryGameCount = (int) $connection->query("SELECT COUNT(*) FROM cronograma_nos WHERE id_interclasse = {$editionId} AND cronograma_versao = {$finalPublished['cronograma_versao']} AND id_jogo IS NOT NULL")->fetch_column();
            Assertions::assert('Repetição da liberação não duplica partidas', ($retry['idempotente'] ?? false) === true && $retryGameCount === $initialGameCount);
            $reviewAfterReleaseRejected = false;
            try {
                $service->revisar($editionId, 1, ['cronograma_versao' => $finalPublished['cronograma_versao']]);
            } catch (\InvalidArgumentException $exception) {
                $reviewAfterReleaseRejected = str_contains($exception->getMessage(), 'operação já começou');
            }
            Assertions::assert('Revisão não substitui a árvore depois de liberar a operação', $reviewAfterReleaseRejected);
            $reopenAfterReleaseRejected = false;
            try {
                $service->abrir($editionId, 1, ['cronograma_versao' => $finalPublished['cronograma_versao'], 'inscricoes_abertura' => '2020-01-01 00:00:00', 'inscricoes_encerramento' => '2031-01-01 00:00:00']);
            } catch (\InvalidArgumentException $exception) {
                $reopenAfterReleaseRejected = str_contains($exception->getMessage(), 'não podem ser reabertas');
            }
            Assertions::assert('Inscrições não reabrem depois da liberação da operação', $reopenAfterReleaseRejected);

            $gateway = new MysqliPartidaGateway($connection);
            $completePlannedGame = static function (int $gameId, int $winnerIndex) use ($connection, $gateway): int {
                $participants = $connection->query('SELECT equipes_id_equipe FROM partidas WHERE jogos_id_jogo = ' . $gameId . ' ORDER BY id_partida')->fetch_all(MYSQLI_ASSOC);
                if (count($participants) !== 2 || $winnerIndex < 0 || $winnerIndex > 1) {
                    throw new \RuntimeException('O confronto planejado não possui exatamente dois participantes válidos.');
                }
                $results = [];
                foreach ($participants as $index => $participant) {
                    $results[] = [
                        'id_equipe' => (int) $participant['equipes_id_equipe'],
                        'gols' => $index === $winnerIndex ? 1 : 0,
                    ];
                }
                Transaction::begin($connection);
                try {
                    $gateway->persistirPlacar($gameId, $results);
                    $gateway->concluirJogo($gameId);
                    $gateway->avancarChaveamento($gameId);
                    Transaction::commit($connection);
                } catch (\Throwable $exception) {
                    Transaction::rollback($connection);
                    throw $exception;
                }
                return (int) $participants[$winnerIndex]['equipes_id_equipe'];
            };
            $sixOpeningRows = $connection->query("SELECT id_jogo FROM cronograma_nos WHERE id_interclasse = {$editionId} AND id_modalidade = {$secondModalityId} AND cronograma_versao = {$finalPublished['cronograma_versao']} AND fase_largura = 8 AND tipo_no = 'normal' AND id_jogo IS NOT NULL ORDER BY slot")->fetch_all(MYSQLI_ASSOC);
            Assertions::assert('Seis equipes liberam exatamente três jogos iniciais', count($sixOpeningRows) === 3);
            $sixOpeningWinners = [];
            foreach ($sixOpeningRows as $index => $openingRow) {
                $sixOpeningWinners[] = $completePlannedGame((int) $openingRow['id_jogo'], $index === 2 ? 1 : 0);
            }
            $sixIntermediateByeGames = (int) $connection->query("SELECT COUNT(*) FROM cronograma_nos WHERE id_interclasse = {$editionId} AND id_modalidade = {$secondModalityId} AND cronograma_versao = {$finalPublished['cronograma_versao']} AND fase_largura = 4 AND tipo_no = 'bye' AND id_jogo IS NOT NULL")->fetch_column();
            $sixSemifinalId = (int) $connection->query("SELECT id_jogo FROM cronograma_nos WHERE id_interclasse = {$editionId} AND id_modalidade = {$secondModalityId} AND cronograma_versao = {$finalPublished['cronograma_versao']} AND fase_largura = 4 AND tipo_no = 'normal' ORDER BY slot LIMIT 1")->fetch_column();
            $sixSemifinalTeams = array_map(
                static fn (array $row): int => (int) $row['equipes_id_equipe'],
                $connection->query('SELECT equipes_id_equipe FROM partidas WHERE jogos_id_jogo = ' . $sixSemifinalId . ' ORDER BY id_partida')->fetch_all(MYSQLI_ASSOC),
            );
            sort($sixSemifinalTeams);
            $expectedSixSemifinalTeams = [$sixOpeningWinners[0], $sixOpeningWinners[1]];
            sort($expectedSixSemifinalTeams);
            Assertions::assert('Resultados de duas origens criam a semifinal com vencedores canônicos e mantêm o BYE sem jogo',
                $sixSemifinalId > 0 && $sixSemifinalTeams === $expectedSixSemifinalTeams && $sixIntermediateByeGames === 0);

            $sixSemifinalWinner = $completePlannedGame($sixSemifinalId, 1);
            $sixFinalId = (int) $connection->query("SELECT id_jogo FROM cronograma_nos WHERE id_interclasse = {$editionId} AND id_modalidade = {$secondModalityId} AND cronograma_versao = {$finalPublished['cronograma_versao']} AND fase_largura = 2 AND tipo_no = 'normal' ORDER BY slot LIMIT 1")->fetch_column();
            $sixFinalTeams = array_map(
                static fn (array $row): int => (int) $row['equipes_id_equipe'],
                $connection->query('SELECT equipes_id_equipe FROM partidas WHERE jogos_id_jogo = ' . $sixFinalId . ' ORDER BY id_partida')->fetch_all(MYSQLI_ASSOC),
            );
            sort($sixFinalTeams);
            $expectedSixFinalTeams = [$sixSemifinalWinner, $sixOpeningWinners[2]];
            sort($expectedSixFinalTeams);
            Assertions::assert('BYE intermediário avança apenas o vencedor real para a final publicada', $sixFinalId > 0 && $sixFinalTeams === $expectedSixFinalTeams);
            $completePlannedGame($sixFinalId, 0);
            $sixPhysicalGames = (int) $connection->query("SELECT COUNT(*) FROM cronograma_nos WHERE id_interclasse = {$editionId} AND id_modalidade = {$secondModalityId} AND cronograma_versao = {$finalPublished['cronograma_versao']} AND id_jogo IS NOT NULL")->fetch_column();
            $sixConcludedGames = (int) $connection->query("SELECT COUNT(*) FROM cronograma_nos cn INNER JOIN jogos j ON j.id_jogo = cn.id_jogo WHERE cn.id_interclasse = {$editionId} AND cn.id_modalidade = {$secondModalityId} AND cn.cronograma_versao = {$finalPublished['cronograma_versao']} AND j.status_jogo = 'Concluido'")->fetch_column();
            Assertions::assert('Torneio de seis equipes termina com cinco confrontos e sem criar fase depois da final', $sixPhysicalGames === 5 && $sixConcludedGames === 5);

            $initialGame = $connection->query("SELECT cn.id_jogo FROM cronograma_nos cn WHERE cn.id_interclasse = {$editionId} AND cn.id_modalidade = {$modalityId} AND cn.cronograma_versao = {$finalPublished['cronograma_versao']} AND cn.tipo_no = 'normal' AND cn.origem_a_tag IS NULL AND cn.origem_b_tag IS NULL AND cn.id_jogo IS NOT NULL ORDER BY cn.slot LIMIT 1")->fetch_column();
            $initialGameId = (int) $initialGame;
            $scores = $connection->query("SELECT equipes_id_equipe FROM partidas WHERE jogos_id_jogo = {$initialGameId} ORDER BY id_partida")->fetch_all(MYSQLI_ASSOC);
            if ($initialGameId <= 0 || count($scores) !== 2) {
                throw new \RuntimeException('A liberação não preparou uma partida inicial com duas equipes.');
            }
            Transaction::begin($connection);
            $gateway->persistirPlacar($initialGameId, [
                ['id_equipe' => (int) $scores[0]['equipes_id_equipe'], 'gols' => 1],
                ['id_equipe' => (int) $scores[1]['equipes_id_equipe'], 'gols' => 0],
            ]);
            $gateway->concluirJogo($initialGameId);
            $gateway->avancarChaveamento($initialGameId);
            Transaction::commit($connection);
            $finalNode = $connection->query("SELECT cn.id_jogo FROM cronograma_nos cn WHERE cn.id_interclasse = {$editionId} AND cn.id_modalidade = {$modalityId} AND cn.cronograma_versao = {$finalPublished['cronograma_versao']} AND cn.fase_largura = 2 ORDER BY cn.slot LIMIT 1")->fetch_column();
            $finalTeams = $connection->query('SELECT equipes_id_equipe FROM partidas WHERE jogos_id_jogo = ' . (int) $finalNode . ' ORDER BY id_partida')->fetch_all(MYSQLI_ASSOC);
            $winner = (int) $scores[0]['equipes_id_equipe'];
            $byeWinner = (int) $connection->query("SELECT cne.id_equipe FROM cronograma_nos cn INNER JOIN cronograma_no_equipes cne ON cne.id_no = cn.id_no WHERE cn.id_interclasse = {$editionId} AND cn.id_modalidade = {$modalityId} AND cn.cronograma_versao = {$finalPublished['cronograma_versao']} AND cn.tipo_no = 'bye' LIMIT 1")->fetch_column();
            $actualFinalTeams = array_map(static fn (array $team): int => (int) $team['equipes_id_equipe'], $finalTeams);
            sort($actualFinalTeams);
            $expectedFinalTeams = [$winner, $byeWinner];
            sort($expectedFinalTeams);
            Assertions::assert('Resultado avança vencedor e BYE para a final publicada', (int) $finalNode > 0 && $actualFinalTeams === $expectedFinalTeams);

            $correctedWinner = (int) $scores[1]['equipes_id_equipe'];
            Transaction::begin($connection);
            $gateway->persistirPlacar($initialGameId, [
                ['id_equipe' => (int) $scores[0]['equipes_id_equipe'], 'gols' => 0],
                ['id_equipe' => $correctedWinner, 'gols' => 1],
            ]);
            $gateway->reconstruirChaveamento($modalityId, 4);
            Transaction::commit($connection);
            $correctedFinalTeams = array_map(
                static fn (array $team): int => (int) $team['equipes_id_equipe'],
                $connection->query('SELECT equipes_id_equipe FROM partidas WHERE jogos_id_jogo = ' . (int) $finalNode . ' ORDER BY id_partida')->fetch_all(MYSQLI_ASSOC),
            );
            sort($correctedFinalTeams);
            $expectedCorrectedFinalTeams = [$correctedWinner, $byeWinner];
            sort($expectedCorrectedFinalTeams);
            Assertions::assert('Correção de vencedor atualiza a final ainda não iniciada', $correctedFinalTeams === $expectedCorrectedFinalTeams);

            $connection->query("UPDATE jogos SET status_jogo = 'Iniciado' WHERE id_jogo = " . (int) $finalNode);
            $correctionRejectedAfterStart = false;
            Transaction::begin($connection);
            try {
                $gateway->persistirPlacar($initialGameId, [
                    ['id_equipe' => (int) $scores[0]['equipes_id_equipe'], 'gols' => 1],
                    ['id_equipe' => $correctedWinner, 'gols' => 0],
                ]);
                $gateway->reconstruirChaveamento($modalityId, 4);
                Transaction::commit($connection);
            } catch (\InvalidArgumentException $exception) {
                Transaction::rollback($connection);
                $correctionRejectedAfterStart = str_contains($exception->getMessage(), 'confronto seguinte entrou em operação');
            } catch (\Throwable $exception) {
                Transaction::rollback($connection);
                throw $exception;
            }
            $persistedSourceScores = $connection->query('SELECT equipes_id_equipe, resultado_partida FROM partidas WHERE jogos_id_jogo = ' . $initialGameId . ' ORDER BY id_partida')->fetch_all(MYSQLI_ASSOC);
            $sourceWinnerAfterRejectedCorrection = (int) ($persistedSourceScores[1]['resultado_partida'] ?? -1) > (int) ($persistedSourceScores[0]['resultado_partida'] ?? -1)
                ? (int) ($persistedSourceScores[1]['equipes_id_equipe'] ?? 0)
                : (int) ($persistedSourceScores[0]['equipes_id_equipe'] ?? 0);
            Assertions::assert('Confronto seguinte iniciado bloqueia correção e preserva o resultado anterior',
                $correctionRejectedAfterStart
                && $sourceWinnerAfterRejectedCorrection === $correctedWinner
                && (string) $connection->query('SELECT status_jogo FROM jogos WHERE id_jogo = ' . (int) $finalNode)->fetch_column() === 'Iniciado');

            $finalTag = (string) $connection->query("SELECT chave_tag FROM cronograma_nos WHERE id_interclasse = {$editionId} AND id_modalidade = {$modalityId} AND cronograma_versao = {$finalPublished['cronograma_versao']} AND fase_largura = 2 ORDER BY slot LIMIT 1")->fetch_column();
            $finalCommitmentStatement = $connection->prepare('SELECT data_compromisso, inicio_compromisso, id_local FROM cronograma_compromissos WHERE id_interclasse = ? AND id_modalidade = ? AND cronograma_versao = ? AND chave_tag = ? LIMIT 1');
            $finalVersion = (int) $finalPublished['cronograma_versao'];
            $finalCommitmentStatement->bind_param('iiis', $editionId, $modalityId, $finalVersion, $finalTag);
            $finalCommitmentStatement->execute();
            $finalSlot = $finalCommitmentStatement->get_result()->fetch_assoc();
            $finalCommitmentStatement->close();
            $finalGame = $connection->query('SELECT data_jogo, inicio_jogo, locais_id_local FROM jogos WHERE id_jogo = ' . (int) $finalNode)->fetch_assoc();
            Assertions::assert('Final usa data, início e local do compromisso publicado', $finalGame !== null && $finalSlot !== null && $finalGame['data_jogo'] === $finalSlot['data_compromisso'] && $finalGame['inicio_jogo'] === $finalSlot['inicio_compromisso'] && (int) $finalGame['locais_id_local'] === (int) $finalSlot['id_local']);
        } finally {
            if ($lateReservationId > 0) {
                $connection->query('DELETE FROM agenda_reservas WHERE id_reserva = ' . $lateReservationId);
            }
            if ($releaseBlockerGameId > 0) {
                $connection->query('DELETE FROM jogos WHERE id_jogo = ' . $releaseBlockerGameId);
            }
            $linkedGames = $connection->query('SELECT id_jogo FROM cronograma_nos WHERE id_jogo IS NOT NULL')->fetch_all(MYSQLI_NUM);
            foreach ($linkedGames as $linkedGame) {
                $linkedGameId = (int) $linkedGame[0];
                $connection->query('DELETE FROM partidas WHERE jogos_id_jogo = ' . $linkedGameId);
                $connection->query('DELETE FROM jogos WHERE id_jogo = ' . $linkedGameId);
            }
            $createdTeams = $connection->query('SELECT id_equipe FROM equipe_planejamentos')->fetch_all(MYSQLI_NUM);
            foreach ($createdTeams as $createdTeam) {
                $teamId = (int) $createdTeam[0];
                $connection->query('DELETE FROM equipes_has_usuarios WHERE equipes_id_equipe = ' . $teamId);
                $connection->query('DELETE FROM equipes WHERE id_equipe = ' . $teamId);
            }
            foreach ($originalStatuses as $statusModalityId => $status) {
                $statement = $connection->prepare('UPDATE modalidades SET status_modalidade = ? WHERE id_modalidade = ?');
                $statement->bind_param('si', $status, $statusModalityId);
                $statement->execute();
                $statement->close();
            }
            foreach ($originalClassStatuses as $statusClassId => $status) {
                $statement = $connection->prepare('UPDATE turmas SET status_turma = ? WHERE id_turma = ?');
                $statement->bind_param('si', $status, $statusClassId);
                $statement->execute();
                $statement->close();
            }
            $connection->query('DROP TABLE IF EXISTS cronograma_no_equipes');
            $connection->query('DROP TABLE IF EXISTS cronograma_nos');
            $connection->query('DROP TABLE IF EXISTS cronograma_compromissos');
            $connection->query('DROP TABLE IF EXISTS equipe_planejamentos');
            $connection->query('DROP TABLE IF EXISTS modalidade_planejamentos');
            $connection->query('DROP TABLE IF EXISTS interclasse_planejamentos');
            if ($createdModalityId > 0) {
                $connection->query('DELETE FROM modalidades WHERE id_modalidade = ' . $createdModalityId);
            }
            if ($createdIndividualModalityId > 0) {
                $connection->query('DELETE FROM pontuacoes_podio WHERE id_modalidade = ' . $createdIndividualModalityId);
                $connection->query('DELETE FROM modalidades WHERE id_modalidade = ' . $createdIndividualModalityId);
            }
            if ($reservationId > 0) {
                $connection->query('DELETE FROM agenda_reservas WHERE id_reserva = ' . $reservationId);
            }
            foreach ($createdStudentIds as $createdUserId) {
                $connection->query('DELETE FROM equipes_has_usuarios WHERE usuarios_id_usuario = ' . (int) $createdUserId);
                $connection->query('DELETE FROM usuarios WHERE id_usuario = ' . (int) $createdUserId);
            }
            $gameLinkVersion = '004_cronograma_no_jogo.sql';
            $statement = $connection->prepare('DELETE FROM sgi_migrations WHERE version IN (?, ?, ?, ?)');
            $nodesVersion = '002_cronograma_nos.sql';
            $contractVersion = '003_cronograma_final_contract.sql';
            $statement->bind_param('ssss', $version, $nodesVersion, $contractVersion, $gameLinkVersion);
            $statement->execute();
            $statement->close();
            $connection->close();
        }
    }
}
