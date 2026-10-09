<?php
declare(strict_types=1);

namespace SGITests\Integration;

use SGITests\Support\TestClient;
use SGITests\Support\Assertions;
use SGITests\Support\TestDatabase;
use mysqli;

class InscricaoModalidadesTest
{
    public static function run(int $idEdicao, array $equipes): void
    {
        echo "\n  \033[1;34m[Suite 10: Inscrição de Alunos em Modalidades e Regras de Limite]\033[0m\n";

        $admin = new TestClient();
        $admin->login('admin', '123');

        // Buscar uma turma da edição recém-criada. Alunos são registros por
        // edição; não mover o aluno legado 2879 de outra edição para este
        // cenário, pois isso mascararia a chave composta de matrícula.
        $resTurmas = $admin->get("api/v1/turmas?id_interclasse=$idEdicao");
        $turmas = $resTurmas['json'] ?? [];
        $idTurmaAluno = (int) ($turmas[0]['id_turma'] ?? 0);

        $matricula = '9' . date('ymdHis') . random_int(10, 99);
        $novoAluno = $admin->postJson('api/v1/usuarios?acao=criar_aluno', [
            'nome_usuario' => 'Aluno de Inscrição',
            'matricula_usuario' => $matricula,
            'data_nasc_usuario' => '2010-01-01',
            'genero_usuario' => 'MASC',
            'turmas_id_turma' => $idTurmaAluno,
        ]);
        Assertions::assertStatus('Aluno de teste vinculado à edição', $novoAluno, 200);
        $idAluno = (int) ($novoAluno['json']['id_usuario'] ?? $novoAluno['json']['id'] ?? 0);
        $senha = (string) ($novoAluno['json']['senha_temporaria'] ?? '');
        $aluno = new TestClient();
        $loginAluno = $aluno->login($matricula, $senha);
        Assertions::assertJsonSuccess('Aluno de teste autenticado para inscrição', $loginAluno);
        Assertions::assertJsonSuccess('Aluno conclui a troca obrigatória antes dos termos', $aluno->changeFirstLoginPassword('Inscricao#2026'));
        Assertions::assertJsonSuccess(
            'Aluno de teste aceita os termos antes da inscrição',
            $aluno->postJson('api/v1/termos', []),
        );

        self::verifyEligibilityOnServer($admin, $idEdicao, $idTurmaAluno);

        $resEqTurma = $admin->get("api/v1/equipes?id_interclasse=$idEdicao&id_turma=$idTurmaAluno");
        $eqsTurma = $resEqTurma['json'] ?? [];

        if (count($eqsTurma) < 4) {
            $eqsTurma = $equipes;
        }

        $idEq1 = (int) ($eqsTurma[0]['id_equipe'] ?? 0);
        $idEq2 = (int) ($eqsTurma[1]['id_equipe'] ?? 0);
        $idEq3 = (int) ($eqsTurma[2]['id_equipe'] ?? 0);
        $idEq4 = (int) ($eqsTurma[3]['id_equipe'] ?? 0);

        // 10.1 Rejeição de inscrição com mais de 3 modalidades
        $resExcesso = $aluno->postJson('api/v1/inscricoes', [
            'id_interclasse' => $idEdicao,
            'id_equipes' => [$idEq1, $idEq2, $idEq3, $idEq4]
        ]);
        Assertions::assert("Bloqueio de inscrição em mais de 3 modalidades", $resExcesso['code'] === 400 || ($resExcesso['json']['success'] ?? true) === false);

        // 10.2 Inscrição válida em até 3 modalidades
        $resInscricao = $aluno->postJson('api/v1/inscricoes', [
            'id_interclasse' => $idEdicao,
            'id_equipes' => [$idEq1, $idEq2]
        ]);
        Assertions::assertStatus("Inscrição válida retorna sucesso", $resInscricao, 200);
        Assertions::assert("Inscrição válida confirma sucesso no corpo", ($resInscricao['json']['success'] ?? false) === true);
        foreach ([$idEq1, $idEq2] as $idEquipe) {
            $membros = $admin->get('api/v1/equipes?id_equipe=' . $idEquipe);
            $encontrado = false;
            foreach (($membros['json'] ?? []) as $membro) {
                if ((int) ($membro['id_usuario'] ?? 0) === $idAluno) {
                    $encontrado = true;
                    break;
                }
            }
            Assertions::assert("Inscrição persistida na equipe {$idEquipe}", $encontrado);
        }

        // 10.3 Bloqueio de inscrição por usuário anônimo
        $anonimo = new TestClient();
        $resAnon = $anonimo->postJson('api/v1/inscricoes', [
            'id_interclasse' => $idEdicao,
            'id_equipes' => [$idEq1]
        ]);
        Assertions::assertStatus("Bloqueio de inscrição sem autenticação (HTTP 401)", $resAnon, 401);
    }

    private static function verifyEligibilityOnServer(TestClient $admin, int $editionId, int $classId): void
    {
        $database = TestDatabase::connect(getenv('SGI_TEST_DB_NAME') ?: 'sgi_test');
        $fixtureUserIds = [];
        $fixtureTeamIds = [];
        $fixtureModalityIds = [];
        $fixtureClassIds = [];
        $fixtureCategoryIds = [];
        $fixtureEditionIds = [];
        $trackTeam = static function (array $team) use (&$fixtureTeamIds, &$fixtureModalityIds): array {
            $fixtureTeamIds[] = $team['team'];
            $fixtureModalityIds[] = $team['modality'];

            return $team;
        };
        $categoryStatement = $database->prepare('SELECT categorias_id_categoria FROM turmas WHERE id_turma = ? LIMIT 1');
        $categoryStatement->bind_param('i', $classId);
        $categoryStatement->execute();
        $classCategoryId = (int) ($categoryStatement->get_result()->fetch_column() ?: 0);
        $categoryStatement->close();

        $otherCategoryStatement = $database->prepare(
            'SELECT id_categoria FROM categorias WHERE interclasses_id_interclasse = ? AND id_categoria <> ? ORDER BY id_categoria LIMIT 1',
        );
        $otherCategoryStatement->bind_param('ii', $editionId, $classCategoryId);
        $otherCategoryStatement->execute();
        $otherCategoryId = (int) ($otherCategoryStatement->get_result()->fetch_column() ?: 0);
        $otherCategoryStatement->close();
        if ($classCategoryId <= 0 || $otherCategoryId <= 0) {
            throw new \RuntimeException('A regressão de inscrição exige duas categorias de fixture na edição.');
        }

        $foreignEditionId = self::createInactiveEdition($database);
        $fixtureEditionIds[] = $foreignEditionId;
        $foreignCategoryId = self::createCategory($database, $foreignEditionId, 'Categoria externa');
        $fixtureCategoryIds[] = $foreignCategoryId;
        $maleTeam = $trackTeam(self::createFixtureTeam($database, $editionId, $classCategoryId, $classId, 'MASC', 'Inscrição MASC válida'));
        $femaleTeam = $trackTeam(self::createFixtureTeam($database, $editionId, $classCategoryId, $classId, 'FEM', 'Inscrição FEM incompatível'));
        $mixedTeam = $trackTeam(self::createFixtureTeam($database, $editionId, $classCategoryId, $classId, 'MISTO', 'Inscrição MISTO'));
        $wrongCategoryTeam = $trackTeam(self::createFixtureTeam($database, $editionId, $otherCategoryId, $classId, 'MASC', 'Categoria incompatível'));
        $foreignEditionTeam = $trackTeam(self::createFixtureTeam($database, $foreignEditionId, $foreignCategoryId, $classId, 'MASC', 'Edição incompatível'));
        $inactiveModalityTeam = $trackTeam(self::createFixtureTeam($database, $editionId, $classCategoryId, $classId, 'MASC', 'Modalidade inativa'));
        $capacityTeam = $trackTeam(self::createFixtureTeam($database, $editionId, $classCategoryId, $classId, 'MISTO', 'Capacidade da inscrição', 1, 1));
        $fourthTeam = $trackTeam(self::createFixtureTeam($database, $editionId, $classCategoryId, $classId, 'MASC', 'Quarta modalidade'));

        $otherClassId = self::createClass($database, $editionId, $classCategoryId);
        $fixtureClassIds[] = $otherClassId;
        $otherClassTeam = self::createTeamForExistingModality($database, $maleTeam['modality'], $otherClassId, 'Turma incompatível');
        $fixtureTeamIds[] = $otherClassTeam;
        $equivalentMaleTeam = self::createTeamForExistingModality($database, $maleTeam['modality'], $classId, 'Equipe equivalente da modalidade MASC');
        $fixtureTeamIds[] = $equivalentMaleTeam;

        $male = self::createStudent($admin, $classId, 'MASC');
        $fixtureUserIds[] = $male['id'];
        $maleClient = $male['client'];
        $genderBatch = $maleClient->postJson('api/v1/inscricoes', [
            'id_interclasse' => $editionId,
            'id_equipes' => [$femaleTeam['team'], $maleTeam['team']],
        ]);
        Assertions::assert(
            'POST direto rejeita o lote inteiro quando uma modalidade é inválida',
            ($genderBatch['code'] ?? 0) === 409
                && ($genderBatch['json']['success'] ?? true) === false
                && self::hasErrorContaining($genderBatch, 'gênero'),
            (string) ($genderBatch['body'] ?? ''),
        );
        Assertions::assert(
            'Modalidade FEM incompatível não gera vínculo para aluno MASC',
            !self::hasMembership($database, $femaleTeam['team'], $male['id']),
        );
        Assertions::assert(
            'Modalidade MASC compatível não é gravada pelo lote rejeitado',
            !self::hasMembership($database, $maleTeam['team'], $male['id']),
        );

        $validMale = $maleClient->postJson('api/v1/inscricoes', [
            'id_interclasse' => $editionId,
            'id_equipes' => [$maleTeam['team']],
        ]);
        Assertions::assert('Inscrição válida posterior ao lote rejeitado é aceita', ($validMale['code'] ?? 0) === 200 && ($validMale['json']['success'] ?? false) === true);

        $sameInscriptionRetry = $maleClient->postJson('api/v1/inscricoes', [
            'id_interclasse' => $editionId,
            'id_equipes' => [$maleTeam['team']],
        ]);
        Assertions::assert(
            'Retry da mesma inscrição responde sucesso sem nova inserção',
            ($sameInscriptionRetry['json']['success'] ?? false) === true
                && (int) ($sameInscriptionRetry['json']['insercoes'] ?? -1) === 0
                && (int) ($sameInscriptionRetry['json']['ja_existentes'] ?? 0) === 1,
            (string) ($sameInscriptionRetry['body'] ?? ''),
        );

        $duplicateAndEquivalentRetry = $maleClient->postJson('api/v1/inscricoes', [
            'id_interclasse' => $editionId,
            'id_equipes' => [$maleTeam['team'], $maleTeam['team'], $equivalentMaleTeam],
        ]);
        Assertions::assert(
            'IDs repetidos e equipes equivalentes contam uma modalidade existente só uma vez',
            ($duplicateAndEquivalentRetry['json']['success'] ?? false) === true
                && (int) ($duplicateAndEquivalentRetry['json']['insercoes'] ?? -1) === 0
                && (int) ($duplicateAndEquivalentRetry['json']['ja_existentes'] ?? 0) === 1,
            (string) ($duplicateAndEquivalentRetry['body'] ?? ''),
        );
        Assertions::assert(
            'Retries não duplicam vínculos em nenhuma equipe da mesma modalidade',
            self::membershipCount($database, $male['id'], $maleTeam['modality']) === 1,
        );

        $mixedExistingAndNew = $maleClient->postJson('api/v1/inscricoes', [
            'id_interclasse' => $editionId,
            'id_equipes' => [$maleTeam['team'], $mixedTeam['team']],
        ]);
        Assertions::assert(
            'Lote com modalidade existente e nova informa ambas as contagens',
            ($mixedExistingAndNew['json']['success'] ?? false) === true
                && (int) ($mixedExistingAndNew['json']['insercoes'] ?? 0) === 1
                && (int) ($mixedExistingAndNew['json']['ja_existentes'] ?? 0) === 1,
            (string) ($mixedExistingAndNew['body'] ?? ''),
        );

        $scopeBatch = $maleClient->postJson('api/v1/inscricoes', [
            'id_interclasse' => $editionId,
            'id_equipes' => [$wrongCategoryTeam['team'], $mixedTeam['team']],
        ]);
        Assertions::assert(
            'Erro de categoria rejeita o lote sem alterar modalidade já existente',
            ($scopeBatch['code'] ?? 0) === 409
                && ($scopeBatch['json']['success'] ?? true) === false
                && self::hasErrorContaining($scopeBatch, 'categoria'),
            (string) ($scopeBatch['body'] ?? ''),
        );
        Assertions::assert('Modalidade MISTO aceita aluno MASC', self::hasMembership($database, $mixedTeam['team'], $male['id']));
        Assertions::assert('Categoria incompatível não gera vínculo', !self::hasMembership($database, $wrongCategoryTeam['team'], $male['id']));

        $foreignEditionResult = $maleClient->postJson('api/v1/inscricoes', [
            'id_interclasse' => $editionId,
            'id_equipes' => [$foreignEditionTeam['team']],
        ]);
        Assertions::assert(
            'Equipe de modalidade de outra edição é recusada com erro de escopo',
            ($foreignEditionResult['json']['success'] ?? true) === false && self::hasErrorContaining($foreignEditionResult, 'interclasse'),
            (string) ($foreignEditionResult['body'] ?? ''),
        );
        Assertions::assert('Outra edição não gera vínculo', !self::hasMembership($database, $foreignEditionTeam['team'], $male['id']));

        $otherClassResult = $maleClient->postJson('api/v1/inscricoes', [
            'id_interclasse' => $editionId,
            'id_equipes' => [$otherClassTeam],
        ]);
        Assertions::assert(
            'Equipe de outra turma é recusada com erro de escopo',
            ($otherClassResult['json']['success'] ?? true) === false && self::hasErrorContaining($otherClassResult, 'turma'),
            (string) ($otherClassResult['body'] ?? ''),
        );
        Assertions::assert('Outra turma não gera vínculo', !self::hasMembership($database, $otherClassTeam, $male['id']));

        $female = self::createStudent($admin, $classId, 'FEM');
        $fixtureUserIds[] = $female['id'];
        $femaleClient = $female['client'];
        $csrfBlocked = $femaleClient->postJson(
            'api/v1/inscricoes',
            ['id_interclasse' => $editionId, 'id_equipes' => [$femaleTeam['team']]],
            ['X-SGI-CSRF' => 'token-invalido-de-regressao'],
        );
        Assertions::assertStatus('CSRF inválido continua bloqueando inscrição direta', $csrfBlocked, 403);
        Assertions::assert('CSRF inválido não cria vínculo', !self::hasMembership($database, $femaleTeam['team'], $female['id']));

        $termStatement = $database->prepare(
            "UPDATE usuarios_has_interclasses SET aceito_termo = 'não', status_termo = 'Inativo' WHERE usuarios_id_usuario = ? AND interclasses_id_interclasse = ?",
        );
        $termStatement->bind_param('ii', $female['id'], $editionId);
        $termStatement->execute();
        $termStatement->close();
        try {
            $missingTerms = $femaleClient->postJson('api/v1/inscricoes', [
                'id_interclasse' => $editionId,
                'id_equipes' => [$femaleTeam['team']],
            ]);
            Assertions::assertStatus('Aceite de termos revogado bloqueia POST direto de inscrição', $missingTerms, 403);
            Assertions::assert('Sem aceite, nenhuma inscrição é persistida', !self::hasMembership($database, $femaleTeam['team'], $female['id']));
        } finally {
            $restoreTerms = $database->prepare(
                "UPDATE usuarios_has_interclasses SET aceito_termo = 'sim', status_termo = 'Ativo' WHERE usuarios_id_usuario = ? AND interclasses_id_interclasse = ?",
            );
            $restoreTerms->bind_param('ii', $female['id'], $editionId);
            $restoreTerms->execute();
            $restoreTerms->close();
        }

        $femaleValid = $femaleClient->postJson('api/v1/inscricoes', [
            'id_interclasse' => $editionId,
            'id_equipes' => [$femaleTeam['team']],
        ]);
        Assertions::assert(
            'FEM pode se inscrever em modalidade FEM compatível',
            ($femaleValid['code'] ?? 0) === 200 && ($femaleValid['json']['success'] ?? false) === true,
            (string) ($femaleValid['body'] ?? ''),
        );

        $maleCapacity = $maleClient->postJson('api/v1/inscricoes', [
            'id_interclasse' => $editionId,
            'id_equipes' => [$capacityTeam['team']],
        ]);
        Assertions::assert('Última vaga disponível aceita o primeiro aluno', ($maleCapacity['json']['success'] ?? false) === true);
        $femaleCapacity = $femaleClient->postJson('api/v1/inscricoes', [
            'id_interclasse' => $editionId,
            'id_equipes' => [$capacityTeam['team']],
        ]);
        Assertions::assert(
            'Capacidade cheia recusa o aluno seguinte sem criar vínculo',
            ($femaleCapacity['json']['success'] ?? true) === false
                && self::hasErrorContaining($femaleCapacity, 'lotada')
                && !self::hasMembership($database, $capacityTeam['team'], $female['id']),
            (string) ($femaleCapacity['body'] ?? ''),
        );

        $fourthModality = $maleClient->postJson('api/v1/inscricoes', [
            'id_interclasse' => $editionId,
            'id_equipes' => [$fourthTeam['team']],
        ]);
        Assertions::assert(
            'Retry não permite ultrapassar o limite quando três modalidades já existem',
            ($fourthModality['json']['success'] ?? true) === false
                && self::hasErrorContaining($fourthModality, 'máximo de 3 modalidades')
                && !self::hasMembership($database, $fourthTeam['team'], $male['id']),
            (string) ($fourthModality['body'] ?? ''),
        );

        $excessMembership = $database->prepare('INSERT INTO equipes_has_usuarios (equipes_id_equipe, usuarios_id_usuario) VALUES (?, ?)');
        $excessMembership->bind_param('ii', $capacityTeam['team'], $female['id']);
        $excessMembership->execute();
        $excessMembership->close();
        $noSecondaryCapacity = $admin->postJson('api/v1/equipes', [
            'acao' => 'redistribuir',
            'modalidades_id_modalidade' => $capacityTeam['modality'],
            'turmas_id_turma' => $classId,
        ]);
        Assertions::assert(
            'Falta de capacidade secundária retorna recusa pública 4xx e não sucesso',
            ($noSecondaryCapacity['code'] ?? 0) === 400
                && ($noSecondaryCapacity['json']['success'] ?? true) === false
                && self::hasErrorContaining($noSecondaryCapacity, 'vagas disponíveis')
                && self::teamCount($database, $capacityTeam['modality'], $classId) === 1
                && self::hasMembership($database, $capacityTeam['team'], $male['id'])
                && self::hasMembership($database, $capacityTeam['team'], $female['id']),
            (string) ($noSecondaryCapacity['body'] ?? ''),
        );

        $inactiveTeamStatement = $database->prepare("UPDATE equipes SET status_equipe = '0' WHERE id_equipe = ?");
        $inactiveTeamStatement->bind_param('i', $inactiveModalityTeam['team']);
        $inactiveTeamStatement->execute();
        $inactiveTeamStatement->close();
        $inactiveTeam = $femaleClient->postJson('api/v1/inscricoes', [
            'id_interclasse' => $editionId,
            'id_equipes' => [$inactiveModalityTeam['team']],
        ]);
        Assertions::assert('Equipe inativa não é elegível para inscrição', ($inactiveTeam['json']['success'] ?? true) === false);
        Assertions::assert('Equipe inativa não gera vínculo', !self::hasMembership($database, $inactiveModalityTeam['team'], $female['id']));
        $restoreTeamStatement = $database->prepare("UPDATE equipes SET status_equipe = '1' WHERE id_equipe = ?");
        $restoreTeamStatement->bind_param('i', $inactiveModalityTeam['team']);
        $restoreTeamStatement->execute();
        $restoreTeamStatement->close();

        $inactiveModalityStatement = $database->prepare("UPDATE modalidades SET status_modalidade = '0' WHERE id_modalidade = ?");
        $inactiveModalityStatement->bind_param('i', $inactiveModalityTeam['modality']);
        $inactiveModalityStatement->execute();
        $inactiveModalityStatement->close();
        $inactiveModality = $femaleClient->postJson('api/v1/inscricoes', [
            'id_interclasse' => $editionId,
            'id_equipes' => [$inactiveModalityTeam['team']],
        ]);
        Assertions::assert('Modalidade inativa não é elegível para inscrição', ($inactiveModality['json']['success'] ?? true) === false);
        Assertions::assert('Modalidade inativa não gera vínculo', !self::hasMembership($database, $inactiveModalityTeam['team'], $female['id']));
        $restoreModalityStatement = $database->prepare("UPDATE modalidades SET status_modalidade = '1' WHERE id_modalidade = ?");
        $restoreModalityStatement->bind_param('i', $inactiveModalityTeam['modality']);
        $restoreModalityStatement->execute();
        $restoreModalityStatement->close();

        $inactive = self::createStudent($admin, $classId, 'MASC');
        $fixtureUserIds[] = $inactive['id'];
        $deactivateUser = $database->prepare("UPDATE usuarios SET status_usuario = '0' WHERE id_usuario = ?");
        $deactivateUser->bind_param('i', $inactive['id']);
        $deactivateUser->execute();
        $deactivateUser->close();
        $inactiveUserResult = $inactive['client']->postJson('api/v1/inscricoes', [
            'id_interclasse' => $editionId,
            'id_equipes' => [$mixedTeam['team']],
        ]);
        Assertions::assertStatus('Usuário inativo não consegue enviar inscrição', $inactiveUserResult, 401);
        $restoreUser = $database->prepare("UPDATE usuarios SET status_usuario = '1' WHERE id_usuario = ?");
        $restoreUser->bind_param('i', $inactive['id']);
        $restoreUser->execute();
        $restoreUser->close();

        $redistributionTeam = $trackTeam(self::createFixtureTeam(
            $database,
            $editionId,
            $classCategoryId,
            $classId,
            'MASC',
            'Falha SQL de redistribuição',
            1,
            2,
        ));
        $redistributionFirst = self::createStudent($admin, $classId, 'MASC');
        $redistributionSecond = self::createStudent($admin, $classId, 'MASC');
        $fixtureUserIds[] = $redistributionFirst['id'];
        $fixtureUserIds[] = $redistributionSecond['id'];
        foreach ([$redistributionFirst['id'], $redistributionSecond['id']] as $studentId) {
            $membership = $database->prepare('INSERT INTO equipes_has_usuarios (equipes_id_equipe, usuarios_id_usuario) VALUES (?, ?)');
            $membership->bind_param('ii', $redistributionTeam['team'], $studentId);
            $membership->execute();
            $membership->close();
        }

        $database->query(
            "CREATE TRIGGER sgi_n07_redistribution_failure BEFORE INSERT ON equipes_has_usuarios FOR EACH ROW
             SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'N07_REDIS_SQL_MARKER C:/synthetic/private/Redistribution.php:55 #0'",
        );
        try {
            $redistributionFailure = $admin->postJson('api/v1/equipes', [
                'acao' => 'redistribuir',
                'modalidades_id_modalidade' => $redistributionTeam['modality'],
                'turmas_id_turma' => $classId,
            ]);
            Assertions::assert(
                'SQL em redistribuição retorna 500 sem detalhe, caminho ou stack para a interface',
                ($redistributionFailure['code'] ?? 0) === 500
                    && ($redistributionFailure['json']['success'] ?? true) === false
                    && !str_contains((string) ($redistributionFailure['body'] ?? ''), 'N07_REDIS_SQL_MARKER')
                    && !str_contains((string) ($redistributionFailure['body'] ?? ''), 'synthetic/private')
                    && !str_contains((string) ($redistributionFailure['body'] ?? ''), '#0'),
                (string) ($redistributionFailure['body'] ?? ''),
            );
            Assertions::assert(
                'Falha na redistribuição reverte equipe secundária e mantém os alunos na equipe original',
                self::teamCount($database, $redistributionTeam['modality'], $classId) === 1
                    && self::hasMembership($database, $redistributionTeam['team'], $redistributionFirst['id'])
                    && self::hasMembership($database, $redistributionTeam['team'], $redistributionSecond['id']),
            );
        } finally {
            $database->query('DROP TRIGGER IF EXISTS sgi_n07_redistribution_failure');
        }

        self::cleanupEligibilityFixtures(
            $database,
            $fixtureUserIds,
            $fixtureTeamIds,
            $fixtureModalityIds,
            $fixtureClassIds,
            $fixtureCategoryIds,
            $fixtureEditionIds,
        );
        $database->close();
    }

    /** @return array{client:TestClient,id:int} */
    private static function createStudent(TestClient $admin, int $classId, string $gender): array
    {
        $registration = '8' . date('ymdHis') . random_int(1000000000, 9999999999);
        $created = $admin->postJson('api/v1/usuarios?acao=criar_aluno', [
            'nome_usuario' => 'Aluno Elegibilidade ' . $gender,
            'matricula_usuario' => $registration,
            'data_nasc_usuario' => '2010-01-01',
            'genero_usuario' => $gender,
            'turmas_id_turma' => $classId,
        ]);
        Assertions::assertStatus("Aluno {$gender} criado para regressão de elegibilidade", $created, 200);
        $id = (int) ($created['json']['id_usuario'] ?? $created['json']['id'] ?? 0);
        $student = new TestClient();
        $login = $student->login($registration, (string) ($created['json']['senha_temporaria'] ?? ''));
        Assertions::assertJsonSuccess("Aluno {$gender} autenticado para regressão", $login);
        Assertions::assertJsonSuccess("Aluno {$gender} conclui a troca obrigatória", $student->changeFirstLoginPassword('Elegivel#2026'));
        Assertions::assertJsonSuccess("Aluno {$gender} aceita termos para regressão", $student->postJson('api/v1/termos', []));

        return ['client' => $student, 'id' => $id];
    }

    /** @return array{modality:int,team:int} */
    private static function createFixtureTeam(
        mysqli $database,
        int $editionId,
        int $categoryId,
        int $classId,
        string $gender,
        string $name,
        int $maxStudents = 10,
        int $maxTeams = 2,
    ): array {
        $modalityName = $name . ' ' . random_int(1000, 9999);
        $modalityStatement = $database->prepare(
            "INSERT INTO modalidades (nome_modalidade, genero_modalidade, max_inscrito_modalidade, max_equipes, status_modalidade, tipos_modalidades_id_tipo_modalidade, categorias_id_categoria, interclasses_id_interclasse)
             VALUES (?, ?, ?, ?, '1', 1, ?, ?)",
        );
        $modalityStatement->bind_param('ssiiii', $modalityName, $gender, $maxStudents, $maxTeams, $categoryId, $editionId);
        $modalityStatement->execute();
        $modalityId = (int) $modalityStatement->insert_id;
        $modalityStatement->close();

        $teamId = self::createTeamForExistingModality($database, $modalityId, $classId, $name);

        return ['modality' => $modalityId, 'team' => $teamId];
    }

    private static function createTeamForExistingModality(mysqli $database, int $modalityId, int $classId, string $name): int
    {
        $teamStatement = $database->prepare(
            "INSERT INTO equipes (status_equipe, modalidades_id_modalidade, turmas_id_turma, nome_equipe) VALUES ('1', ?, ?, ?)",
        );
        $teamStatement->bind_param('iis', $modalityId, $classId, $name);
        $teamStatement->execute();
        $id = (int) $teamStatement->insert_id;
        $teamStatement->close();

        return $id;
    }

    private static function createClass(mysqli $database, int $editionId, int $categoryId): int
    {
        $name = 'Turma externa ' . random_int(1000, 9999);
        $statement = $database->prepare(
            "INSERT INTO turmas (interclasses_id_interclasse, nome_turma, turno_turma, nome_fantasia_turma, status_turma, categorias_id_categoria)
             VALUES (?, ?, 'manha', ?, '1', ?)",
        );
        $statement->bind_param('issi', $editionId, $name, $name, $categoryId);
        $statement->execute();
        $id = (int) $statement->insert_id;
        $statement->close();

        return $id;
    }

    private static function createInactiveEdition(mysqli $database): int
    {
        $name = 'Edição inscrição externa ' . random_int(1000, 9999);
        $statement = $database->prepare(
            "INSERT INTO interclasses (nome_interclasse, ano_interclasse, regulamento_interclasse, status_interclasse, ponto_1_lugar, ponto_2_lugar, ponto_3_lugar, valor_item_arrecadacao)
             VALUES (?, NOW(), 'fixture de inscrição', '0', 10, 7, 5, 2)",
        );
        $statement->bind_param('s', $name);
        $statement->execute();
        $id = (int) $statement->insert_id;
        $statement->close();

        return $id;
    }

    private static function createCategory(mysqli $database, int $editionId, string $name): int
    {
        $statement = $database->prepare("INSERT INTO categorias (nome_categoria, status_categoria, interclasses_id_interclasse) VALUES (?, '1', ?)");
        $statement->bind_param('si', $name, $editionId);
        $statement->execute();
        $id = (int) $statement->insert_id;
        $statement->close();

        return $id;
    }

    private static function hasMembership(mysqli $database, int $teamId, int $userId): bool
    {
        $statement = $database->prepare('SELECT 1 FROM equipes_has_usuarios WHERE equipes_id_equipe = ? AND usuarios_id_usuario = ? LIMIT 1');
        $statement->bind_param('ii', $teamId, $userId);
        $statement->execute();
        $exists = $statement->get_result()->fetch_column() !== false;
        $statement->close();

        return $exists;
    }

    private static function membershipCount(mysqli $database, int $userId, int $modalityId): int
    {
        $statement = $database->prepare(
            'SELECT COUNT(*) AS total
             FROM equipes_has_usuarios eu
             INNER JOIN equipes e ON e.id_equipe = eu.equipes_id_equipe
             WHERE eu.usuarios_id_usuario = ? AND e.modalidades_id_modalidade = ?',
        );
        $statement->bind_param('ii', $userId, $modalityId);
        $statement->execute();
        $count = (int) ($statement->get_result()->fetch_column() ?: 0);
        $statement->close();

        return $count;
    }

    private static function teamCount(mysqli $database, int $modalityId, int $classId): int
    {
        $statement = $database->prepare('SELECT COUNT(*) FROM equipes WHERE modalidades_id_modalidade = ? AND turmas_id_turma = ?');
        $statement->bind_param('ii', $modalityId, $classId);
        $statement->execute();
        $count = (int) ($statement->get_result()->fetch_column() ?: 0);
        $statement->close();

        return $count;
    }

    /** @param list<int> $userIds @param list<int> $teamIds @param list<int> $modalityIds @param list<int> $classIds @param list<int> $categoryIds @param list<int> $editionIds */
    private static function cleanupEligibilityFixtures(
        mysqli $database,
        array $userIds,
        array $teamIds,
        array $modalityIds,
        array $classIds,
        array $categoryIds,
        array $editionIds,
    ): void {
        foreach ($userIds as $id) {
            self::deleteFixtureRow($database, 'equipes_has_usuarios', 'usuarios_id_usuario', $id);
            self::deleteFixtureRow($database, 'usuarios_has_interclasses', 'usuarios_id_usuario', $id);
            self::deleteFixtureRow($database, 'usuarios', 'id_usuario', $id);
        }
        foreach ($teamIds as $id) {
            self::deleteFixtureRow($database, 'equipes_has_usuarios', 'equipes_id_equipe', $id);
            self::deleteFixtureRow($database, 'equipes', 'id_equipe', $id);
        }
        foreach ($modalityIds as $id) {
            self::deleteFixtureRow($database, 'modalidades', 'id_modalidade', $id);
        }
        foreach ($classIds as $id) {
            self::deleteFixtureRow($database, 'turmas', 'id_turma', $id);
        }
        foreach ($categoryIds as $id) {
            self::deleteFixtureRow($database, 'categorias', 'id_categoria', $id);
        }
        foreach ($editionIds as $id) {
            self::deleteFixtureRow($database, 'interclasses', 'id_interclasse', $id);
        }
    }

    private static function deleteFixtureRow(mysqli $database, string $table, string $column, int $id): void
    {
        $allowed = [
            'equipes_has_usuarios' => ['usuarios_id_usuario', 'equipes_id_equipe'],
            'usuarios_has_interclasses' => ['usuarios_id_usuario'],
            'usuarios' => ['id_usuario'],
            'equipes' => ['id_equipe'],
            'modalidades' => ['id_modalidade'],
            'turmas' => ['id_turma'],
            'categorias' => ['id_categoria'],
            'interclasses' => ['id_interclasse'],
        ];
        if (!isset($allowed[$table]) || !in_array($column, $allowed[$table], true)) {
            throw new \InvalidArgumentException('Destino de limpeza de fixture não permitido.');
        }

        $statement = $database->prepare("DELETE FROM {$table} WHERE {$column} = ?");
        $statement->bind_param('i', $id);
        $statement->execute();
        $statement->close();
    }

    /** @param array<string, mixed> $response */
    private static function hasErrorContaining(array $response, string $needle): bool
    {
        $message = (string) ($response['json']['message'] ?? '');
        if (str_contains(mb_strtolower($message), mb_strtolower($needle))) {
            return true;
        }
        foreach (($response['json']['erros'] ?? []) as $error) {
            if (is_string($error) && str_contains(mb_strtolower($error), mb_strtolower($needle))) {
                return true;
            }
        }

        return false;
    }
}
