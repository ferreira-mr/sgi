<?php

declare(strict_types=1);

namespace SGITests\Integration;

use SGITests\Support\Assertions;
use SGITests\Support\AuditFixtures;
use SGITests\Support\TestClient;
use SGITests\Support\TestDatabase;

final class MesarioResourceScopeTest
{
    public static function run(): void
    {
        echo "\n  \033[1;34m[Suite 0.1: Escopo de recurso do mesário]\033[0m\n";

        $database = getenv('SGI_TEST_DB_NAME') ?: 'sgi_test';
        $connection = TestDatabase::connect($database);
        $previousActiveId = AuditFixtures::activeEditionId($connection);
        $fixture = AuditFixtures::createAuthorizationFixture($connection);
        $editionA = $fixture['by_edition']['A'];
        $editionB = $fixture['by_edition']['B'];
        $editionAId = (int) $editionA['interclasse_id'];
        $editionBId = (int) $editionB['interclasse_id'];
        $occurrenceUserA = (int) $editionA['atleta_ids'][0];
        $occurrenceGameA = (int) $editionA['jogo_ids'][0];
        $occurrenceClassA = (int) $editionA['turma_ids'][0];
        $userId = (int) $editionB['atleta_ids'][0];
        $gameId = (int) $editionB['jogo_ids'][0];
        $partidaIdB = (int) $editionB['partida_ids'][0];
        $teamIdB = (int) $editionB['equipe_ids'][0];

        $activateAthlete = $connection->prepare("UPDATE usuarios SET status_usuario = '1' WHERE id_usuario = ?");
        $activateAthlete->bind_param('i', $userId);
        $activateAthlete->execute();
        $activateAthlete->close();
        $startGame = $connection->prepare("UPDATE jogos SET status_jogo = 'Iniciado' WHERE id_jogo = ?");
        $startGame->bind_param('i', $gameId);
        $startGame->execute();
        $startGame->close();

        $seedKey = 'scope-fixture-' . bin2hex(random_bytes(8));
        $seedPoint = $connection->prepare(
            "INSERT INTO artilheiros (usuarios_id_usuario, jogos_id_jogo, partidas_id_partida,
                equipes_id_equipe, num_gol, conta_no_placar, status_artilheiro, chave_jogada)
             VALUES (?, ?, ?, ?, 1, 1, 'ativo', ?)",
        );
        $seedPoint->bind_param('iiiis', $userId, $gameId, $partidaIdB, $teamIdB, $seedKey);
        $seedPoint->execute();
        $pointIdB = (int) $seedPoint->insert_id;
        $seedPoint->close();
        $scorePoint = $connection->prepare('UPDATE partidas SET resultado_partida = 1 WHERE id_partida = ?');
        $scorePoint->bind_param('i', $partidaIdB);
        $scorePoint->execute();
        $scorePoint->close();

        $before = self::countGoals($connection, $userId, $gameId);

        try {
            $mesario = new TestClient();
            $mesario->login('mesario', '123');

            $historyGameId = (int) $editionA['jogo_ids'][0];
            $completeHistoryGame = $connection->prepare("UPDATE jogos SET status_jogo = 'Concluido' WHERE id_jogo = ?");
            $completeHistoryGame->bind_param('i', $historyGameId);
            $completeHistoryGame->execute();
            $completeHistoryGame->close();
            $defaultOperationalGames = $mesario->get('api/v1/jogos?id_interclasse=' . $editionBId);
            $attemptedOperationalOverride = $mesario->get('api/v1/jogos?operacional=0&id_interclasse=' . $editionBId);
            $competitionGames = $mesario->get('api/v1/jogos?visao=chaveamento&id_interclasse=' . $editionBId);
            $invalidGamesView = $mesario->get('api/v1/jogos?visao=qualquer');
            $competitionGamesPayload = is_array($competitionGames['json'] ?? null) ? $competitionGames['json'] : [];
            $competitionGameIds = array_map(
                static fn (array $game): int => (int) ($game['id_jogo'] ?? 0),
                $competitionGamesPayload,
            );
            $competitionEditionIds = array_values(array_unique(array_map(
                static fn (array $game): int => (int) ($game['id_interclasse'] ?? 0),
                $competitionGamesPayload,
            )));
            $admin = new TestClient();
            $admin->login('admin', '123');
            $adminHistoryGames = $admin->get('api/v1/jogos?visao=chaveamento&id_interclasse=' . $editionAId);
            $studentClient = new TestClient();
            $studentClient->login('2879', '123');
            $studentCompetitionGames = $studentClient->get('api/v1/jogos?visao=chaveamento');
            $restoreHistoryGame = $connection->prepare("UPDATE jogos SET status_jogo = 'Agendado' WHERE id_jogo = ?");
            $restoreHistoryGame->bind_param('i', $historyGameId);
            $restoreHistoryGame->execute();
            $restoreHistoryGame->close();
            Assertions::assert(
                'Histórico do mesário ignora o filtro operacional, mas fixa a edição ativa no servidor',
                $competitionGames['code'] === 200
                && in_array($historyGameId, $competitionGameIds, true)
                && !in_array((int) $editionB['jogo_ids'][0], $competitionGameIds, true)
                && $competitionEditionIds === [$editionAId]
                && ($defaultOperationalGames['code'] ?? 0) === 200
                && !in_array($historyGameId, array_map(
                    static fn (array $game): int => (int) ($game['id_jogo'] ?? 0),
                    is_array($defaultOperationalGames['json'] ?? null) ? $defaultOperationalGames['json'] : [],
                ), true)
                && !in_array($historyGameId, array_map(
                    static fn (array $game): int => (int) ($game['id_jogo'] ?? 0),
                    is_array($attemptedOperationalOverride['json'] ?? null) ? $attemptedOperationalOverride['json'] : [],
                ), true),
                json_encode(['history' => $competitionGames, 'operational' => $defaultOperationalGames, 'override' => $attemptedOperationalOverride], JSON_UNESCAPED_UNICODE),
            );
            Assertions::assert(
                'Visão não documentada de jogos é rejeitada',
                ($invalidGamesView['code'] ?? 0) === 400
                && ($invalidGamesView['json']['success'] ?? true) === false,
            );
            Assertions::assert(
                'Administrador mantém consulta do histórico explicitamente selecionada',
                ($adminHistoryGames['code'] ?? 0) === 200
                && in_array($historyGameId, array_map(
                    static fn (array $game): int => (int) ($game['id_jogo'] ?? 0),
                    is_array($adminHistoryGames['json'] ?? null) ? $adminHistoryGames['json'] : [],
                ), true),
            );
            Assertions::assert(
                'Aluno não pode pedir a visão histórica do chaveamento',
                $studentCompetitionGames['code'] === 403
                && ($studentCompetitionGames['json']['success'] ?? true) === false,
            );

            $beforeBMatch = self::partida($connection, $partidaIdB);
            $pointsB = $mesario->get('api/v1/pontos?id_jogo=' . $gameId);
            $athletesByGameB = $mesario->get('api/v1/pontos?acao=atletas&id_jogo=' . $gameId . '&id_equipe=' . $teamIdB);
            $athletesByTeamB = $mesario->get('api/v1/pontos?acao=atletas&id_equipe=' . $teamIdB);
            $createPointB = $mesario->postJson('api/v1/pontos', [
                'jogos_id_jogo' => $gameId,
                'id_partida' => $partidaIdB,
                'equipes_id_equipe' => $teamIdB,
                'usuarios_id_usuario' => $userId,
                'chave_jogada' => 'scope-point-' . bin2hex(random_bytes(8)),
            ]);
            $cancelPointB = $mesario->putJson('api/v1/pontos', ['id_ponto' => $pointIdB]);
            $afterBMatch = self::partida($connection, $partidaIdB);

            Assertions::assert(
                'Mesário não consulta pontos da edição B quando A está ativa',
                $pointsB['code'] === 403 && ($pointsB['json']['success'] ?? true) === false,
            );
            Assertions::assert(
                'Mesário não consulta atletas de B por jogo nem por equipe',
                $athletesByGameB['code'] === 403
                && ($athletesByGameB['json']['success'] ?? true) === false
                && $athletesByTeamB['code'] === 403
                && ($athletesByTeamB['json']['success'] ?? true) === false,
            );
            Assertions::assert(
                'Mesário não registra nem anula pontos da edição B',
                $createPointB['code'] === 403
                && ($createPointB['json']['success'] ?? true) === false
                && $cancelPointB['code'] === 403
                && ($cancelPointB['json']['success'] ?? true) === false
                && self::countGoals($connection, $userId, $gameId) === $before
                && $afterBMatch === $beforeBMatch
                && self::pointStatus($connection, $pointIdB) === 'ativo',
            );

            $admin = new TestClient();
            $admin->login('admin', '123');
            $adminPointsB = $admin->get('api/v1/pontos?id_jogo=' . $gameId);
            $collaborator = new TestClient();
            $collaborator->login('colab', '123');
            $collaboratorPointsB = $collaborator->get('api/v1/pontos?id_jogo=' . $gameId);
            Assertions::assert(
                'Administrador e colaborador mantêm acesso à consulta de pontos de outra edição',
                $adminPointsB['code'] === 200
                && ($adminPointsB['json']['success'] ?? false) === true
                && $collaboratorPointsB['code'] === 200
                && ($collaboratorPointsB['json']['success'] ?? false) === true,
            );

            $gameAForMismatch = (int) $fixture['by_edition']['A']['jogo_ids'][0];
            $mismatchedPoints = $mesario->get('api/v1/pontos?id_jogo=' . $gameAForMismatch . '&id_equipe=' . $teamIdB);
            $mismatchedAthletes = $mesario->get('api/v1/pontos?acao=atletas&id_jogo=' . $gameAForMismatch . '&id_equipe=' . $teamIdB);
            Assertions::assert(
                'Combinações de jogo e equipe de edições diferentes são rejeitadas',
                $mismatchedPoints['code'] === 422
                && $mismatchedAthletes['code'] === 422,
            );

            $missingGame = max($fixture['ids']['jogos']) + 100000;
            $missingPoints = $mesario->get('api/v1/pontos?id_jogo=' . $missingGame);
            Assertions::assert(
                'Jogo inexistente tem resposta distinta do recurso proibido',
                $missingPoints['code'] === 404
                && ($missingPoints['json']['success'] ?? true) === false,
            );

            $disableEdition = $connection->prepare("UPDATE interclasses SET status_interclasse = '0' WHERE id_interclasse = ?");
            $disableEdition->bind_param('i', $editionAId);
            $disableEdition->execute();
            $disableEdition->close();
            $noActiveEdition = $mesario->get('api/v1/pontos?id_jogo=' . $gameId);
            $restoreEdition = $connection->prepare("UPDATE interclasses SET status_interclasse = '1' WHERE id_interclasse = ?");
            $restoreEdition->bind_param('i', $editionAId);
            $restoreEdition->execute();
            $restoreEdition->close();
            Assertions::assert(
                'Mesário sem edição ativa continua sem consultar pontos',
                $noActiveEdition['code'] === 403 && ($noActiveEdition['json']['success'] ?? true) === false,
            );

            $student = new TestClient();
            $student->login('2879', '123');
            $studentPointsB = $student->get('api/v1/pontos?id_jogo=' . $gameId);
            Assertions::assert(
                'Aluno continua sem acesso ao endpoint administrativo de pontos',
                $studentPointsB['code'] === 403 && ($studentPointsB['json']['success'] ?? true) === false,
            );

            $response = $mesario->postJson('api/v1/artilheiros', [
                'usuarios_id_usuario' => $userId,
                'jogos_id_jogo' => $gameId,
                'num_gol' => 1,
            ]);

            Assertions::assert(
                'Mesário não grava artilharia da edição B quando A está ativa',
                $response['code'] === 403
                && ($response['json']['success'] ?? true) === false
                && self::countGoals($connection, $userId, $gameId) === $before,
            );

            $beforeOccurrences = self::countOccurrences($connection, $userId);
            $occurrence = $mesario->postJson('api/v1/ocorrencias', [
                'titulo_ocorrencia' => 'Amarelo',
                'descricao_ocorrencia' => 'Fixture fora da edição ativa',
                'data_ocorrencia' => '2026-09-07',
                'usuarios_id_usuario' => $userId,
                'id_jogo' => $gameId,
                'id_turma' => (int) $editionB['turma_ids'][0],
                'penalidade' => 0,
            ]);
            Assertions::assert(
                'Mesário não grava ocorrência da edição B quando A está ativa',
                $occurrence['code'] === 403
                && ($occurrence['json']['success'] ?? true) === false
                && self::countOccurrences($connection, $userId) === $beforeOccurrences,
            );

            $classB = (int) $editionB['turma_ids'][0];
            $gameB = (int) $editionB['jogo_ids'][0];
            $beforeOccurrenceA = self::countOccurrences($connection, $occurrenceUserA);
            $forgedPost = $mesario->postJson('api/v1/ocorrencias', [
                'titulo_ocorrencia' => 'Auditoria L09 POST',
                'descricao_ocorrencia' => "[JOGO:{$gameB}][TURMA:{$classB}] Marcadores não autorizados",
                'data_ocorrencia' => '2026-09-07',
                'usuarios_id_usuario' => $occurrenceUserA,
                'penalidade' => 0,
            ]);
            Assertions::assert(
                'POST rejeita referências textuais de outra edição sem criar ocorrência',
                $forgedPost['code'] === 403
                && self::countOccurrences($connection, $occurrenceUserA) === $beforeOccurrenceA,
                json_encode($forgedPost, JSON_UNESCAPED_UNICODE),
            );

            $countBeforeConflict = self::countOccurrences($connection, $occurrenceUserA);
            $conflictingPost = $mesario->postJson('api/v1/ocorrencias', [
                'titulo_ocorrencia' => 'Auditoria L09 conflito',
                'descricao_ocorrencia' => "[JOGO:{$gameB}][TURMA:{$classB}] Referências divergentes",
                'data_ocorrencia' => '2026-09-07',
                'usuarios_id_usuario' => $occurrenceUserA,
                'id_jogo' => $occurrenceGameA,
                'id_turma' => $occurrenceClassA,
                'penalidade' => 0,
            ]);
            Assertions::assert(
                'POST rejeita marcadores divergentes dos campos estruturados',
                $conflictingPost['code'] === 422
                && self::countOccurrences($connection, $occurrenceUserA) === $countBeforeConflict,
                json_encode($conflictingPost, JSON_UNESCAPED_UNICODE),
            );

            $countBeforeEmbeddedMarker = self::countOccurrences($connection, $occurrenceUserA);
            $embeddedMarkerPost = $mesario->postJson('api/v1/ocorrencias', [
                'titulo_ocorrencia' => 'Auditoria L09 marcador no texto',
                'descricao_ocorrencia' => "Texto livre [JOGO:{$gameB}] com marcador embutido",
                'data_ocorrencia' => '2026-09-07',
                'usuarios_id_usuario' => $occurrenceUserA,
                'id_jogo' => $occurrenceGameA,
                'id_turma' => $occurrenceClassA,
                'penalidade' => 0,
            ]);
            Assertions::assert(
                'POST rejeita marcadores duplicados ou no meio do texto',
                $embeddedMarkerPost['code'] === 422
                && self::countOccurrences($connection, $occurrenceUserA) === $countBeforeEmbeddedMarker,
                json_encode($embeddedMarkerPost, JSON_UNESCAPED_UNICODE),
            );

            $legacyPayload = [
                'titulo_ocorrencia' => 'Auditoria L09 legado',
                'descricao_ocorrencia' => "[JOGO:{$occurrenceGameA}][TURMA:{$occurrenceClassA}]Prefixo legado válido",
                'data_ocorrencia' => '2026-09-07',
                'usuarios_id_usuario' => $occurrenceUserA,
                'penalidade' => 0,
            ];
            $legacyMutationId = 'l09-legacy-' . bin2hex(random_bytes(8));
            $legacyPost = $mesario->postJson('api/v1/ocorrencias', $legacyPayload, [
                'X-SGI-Mutation-Id' => $legacyMutationId,
            ]);
            $legacyReplay = $mesario->postJson('api/v1/ocorrencias', $legacyPayload, [
                'X-SGI-Mutation-Id' => $legacyMutationId,
            ]);
            $legacyId = (int) ($legacyPost['json']['id'] ?? 0);
            Assertions::assert(
                'POST preserva prefixo legado somente depois de autorizar suas referências',
                $legacyPost['code'] === 201
                && $legacyId > 0
                && self::occurrenceDescription($connection, $legacyId)
                    === "[JOGO:{$occurrenceGameA}][TURMA:{$occurrenceClassA}]Prefixo legado válido"
                && $legacyReplay['code'] === 201
                && ($legacyReplay['json']['id'] ?? null) === $legacyId
                && self::countOccurrences($connection, $occurrenceUserA) === $countBeforeEmbeddedMarker + 1,
                json_encode(['post' => $legacyPost, 'replay' => $legacyReplay], JSON_UNESCAPED_UNICODE),
            );

            $occurrencesInA = $mesario->get('api/v1/ocorrencias?id_jogo=' . $occurrenceGameA);
            $occurrencesInB = $mesario->get('api/v1/ocorrencias?id_jogo=' . $gameB);
            Assertions::assert(
                'Listagem por jogo mantém a ocorrência somente no jogo autorizado',
                self::containsOccurrence($occurrencesInA, $legacyId)
                && !self::containsOccurrence($occurrencesInB, $legacyId),
                json_encode(['A' => $occurrencesInA, 'B' => $occurrencesInB], JSON_UNESCAPED_UNICODE),
            );

            $classOnlyPost = $mesario->postJson('api/v1/ocorrencias', [
                'titulo_ocorrencia' => 'Auditoria L09 sem jogo',
                'descricao_ocorrencia' => 'Referência estruturada somente à turma',
                'data_ocorrencia' => '2026-09-07',
                'usuarios_id_usuario' => $occurrenceUserA,
                'id_turma' => $occurrenceClassA,
                'penalidade' => 0,
            ]);
            $classOnlyId = (int) ($classOnlyPost['json']['id'] ?? 0);
            Assertions::assert(
                'POST sem jogo persiste a referência de turma estruturada',
                $classOnlyPost['code'] === 201
                && $classOnlyId > 0
                && self::occurrenceDescription($connection, $classOnlyId)
                    === "[TURMA:{$occurrenceClassA}]Referência estruturada somente à turma",
                json_encode($classOnlyPost, JSON_UNESCAPED_UNICODE),
            );

            $occurrenceA = $mesario->postJson('api/v1/ocorrencias', [
                'titulo_ocorrencia' => 'Auditoria L09 edição',
                'descricao_ocorrencia' => 'Descrição original autorizada',
                'data_ocorrencia' => '2026-09-07',
                'usuarios_id_usuario' => $occurrenceUserA,
                'id_jogo' => $occurrenceGameA,
                'id_turma' => $occurrenceClassA,
                'penalidade' => 0,
            ]);
            $occurrenceAId = (int) ($occurrenceA['json']['id'] ?? 0);
            $originalDescription = "[JOGO:{$occurrenceGameA}][TURMA:{$occurrenceClassA}]Descrição original autorizada";
            $forgedPut = $mesario->putJson('api/v1/ocorrencias', [
                'id_ocorrencia' => $occurrenceAId,
                'descricao_ocorrencia' => "[JOGO:{$gameB}][TURMA:{$classB}] Troca não autorizada",
            ]);
            Assertions::assert(
                'PUT rejeita referências textuais de outra edição e preserva as originais',
                $occurrenceA['code'] === 201
                && $occurrenceAId > 0
                && $forgedPut['code'] === 422
                && self::occurrenceDescription($connection, $occurrenceAId) === $originalDescription,
                json_encode(['create' => $occurrenceA, 'update' => $forgedPut], JSON_UNESCAPED_UNICODE),
            );

            $cleanPut = $mesario->putJson('api/v1/ocorrencias', [
                'id_ocorrencia' => $occurrenceAId,
                'descricao_ocorrencia' => 'Descrição editada sem metadados',
            ]);
            Assertions::assert(
                'PUT sem prefixo mantém as referências autorizadas do registro',
                $cleanPut['code'] === 200
                && self::occurrenceDescription($connection, $occurrenceAId)
                    === "[JOGO:{$occurrenceGameA}][TURMA:{$occurrenceClassA}]Descrição editada sem metadados",
                json_encode($cleanPut, JSON_UNESCAPED_UNICODE),
            );

            self::runAutomaticRedRegression(
                $connection,
                $admin,
                $mesario,
                $editionAId,
                $occurrenceUserA,
                $occurrenceGameA,
                $occurrenceClassA,
                (int) $editionA['atleta_ids'][1],
                (int) $editionA['turma_ids'][1],
            );

            $partidaId = (int) $editionB['partida_ids'][0];
            $gameA = (int) $fixture['by_edition']['A']['jogo_ids'][0];
            $teamB = (int) $editionB['equipe_ids'][0];
            $beforePartida = self::partida($connection, $partidaId);
            $partidaResponse = $mesario->putJson('api/v1/partidas', [
                'id_partida' => $partidaId,
                'jogos_id_jogo' => $gameA,
                'equipes_id_equipe' => $teamB,
                'resultado_partida' => 7,
            ]);
            $afterPartida = self::partida($connection, $partidaId);
            Assertions::assert(
                'Partida B rejeita jogo de A pela edição persistida sem reassociação',
                $partidaResponse['code'] === 403
                && ($partidaResponse['json']['success'] ?? true) === false
                && $afterPartida === $beforePartida,
            );

            $partidaA = (int) $fixture['by_edition']['A']['partida_ids'][0];
            $teamA2 = (int) $fixture['by_edition']['A']['equipe_ids'][1];
            $beforePartidaA = self::partida($connection, $partidaA);
            $discordant = $mesario->putJson('api/v1/partidas', [
                'id_partida' => $partidaA,
                'jogos_id_jogo' => $gameA,
                'equipes_id_equipe' => $teamA2,
                'resultado_partida' => 8,
            ]);
            Assertions::assert(
                'Partida de A rejeita equipe discordante sem reassociação',
                $discordant['code'] === 422
                && ($discordant['json']['success'] ?? true) === false
                && self::partida($connection, $partidaA) === $beforePartidaA,
            );

            $missing = $mesario->putJson('api/v1/partidas', [
                'id_partida' => max($fixture['ids']['partidas']) + 100000,
                'resultado_partida' => 2,
            ]);
            Assertions::assert(
                'Alteração direta de partida inexistente é rejeitada pelo contrato do placar',
                $missing['code'] === 422 && ($missing['json']['success'] ?? true) === false,
            );

            $inferred = $mesario->putJson('api/v1/partidas', [
                'id_partida' => $partidaA,
                'resultado_partida' => 2,
            ]);
            $afterInferred = self::partida($connection, $partidaA);
            Assertions::assert(
                'PUT de partida não altera o placar sem uma jogada vinculada',
                $inferred['code'] === 422
                && ($inferred['json']['success'] ?? true) === false
                && $afterInferred['jogos_id_jogo'] === $gameA
                && $afterInferred['equipes_id_equipe'] === (int) $fixture['by_edition']['A']['equipe_ids'][0]
                && $afterInferred['resultado_partida'] === 0,
            );

            $schedule = $connection->prepare("UPDATE jogos SET termino_jogo = '09:00:00' WHERE id_jogo = ?");
            $schedule->bind_param('i', $gameA);
            $schedule->execute();
            $schedule->close();
            $blockedScheduleEdit = $mesario->putJson('api/v1/jogos', [
                'id_jogo' => $gameA,
                'data_jogo' => '2026-09-25',
                'inicio_jogo' => '14:00',
                'termino_jogo' => '15:00',
                'locais_id_local' => 1,
            ]);
            Assertions::assert(
                'Mesário é proibido de alterar dados cadastrais de agendamento do jogo',
                $blockedScheduleEdit['code'] === 403
                && ($blockedScheduleEdit['json']['success'] ?? true) === false
                && str_contains((string) ($blockedScheduleEdit['json']['message'] ?? ''), 'Mesários'),
                json_encode($blockedScheduleEdit, JSON_UNESCAPED_UNICODE),
            );

            $started = $mesario->putJson('api/v1/jogos', [
                'id_jogo' => $gameA,
                'status_jogo' => 'Iniciado',
                'duracao_jogo' => 1200,
                'tempo_restante_jogo' => 1200,
            ]);
            $point = $mesario->postJson('api/v1/pontos', [
                'jogos_id_jogo' => $gameA,
                'id_partida' => $partidaA,
                'equipes_id_equipe' => (int) $fixture['by_edition']['A']['equipe_ids'][0],
                'usuarios_id_usuario' => (int) $fixture['by_edition']['A']['atleta_ids'][0],
                'chave_jogada' => 'mesario-scope-point-' . bin2hex(random_bytes(5)),
            ]);
            $finalized = $mesario->postJson('api/v1/resultados', [
                'id_jogo' => $gameA,
                'id_modalidade' => (int) $fixture['by_edition']['A']['modalidade_id'],
                'resultados' => [
                    ['id_equipe' => (int) $fixture['by_edition']['A']['equipe_ids'][0], 'gols' => 1],
                    ['id_equipe' => $teamA2, 'gols' => 0],
                ],
            ]);
            $scores = self::scores($connection, $gameA);
            Assertions::assert(
                'Ponto vinculado permite finalizar a partida pelo resultado completo',
                ($started['json']['success'] ?? false) === true
                && ($point['json']['success'] ?? false) === true
                && $finalized['code'] === 200
                && ($finalized['json']['success'] ?? false) === true
                && $scores === [
                    (int) $fixture['by_edition']['A']['equipe_ids'][0] => 1,
                    $teamA2 => 0,
                ]
                && self::gameStatus($connection, $gameA) === 'Concluido',
                json_encode([
                    'started' => $started,
                    'point' => $point,
                    'finalized' => $finalized,
                    'scores' => $scores,
                ], JSON_UNESCAPED_UNICODE),
            );
        } finally {
            $fixtureUserIds = array_map('intval', array_merge($editionA['atleta_ids'], $editionB['atleta_ids']));
            self::deleteOccurrences($connection, $fixtureUserIds);
            $connection->close();
            AuditFixtures::restoreAndRemove(
                TestDatabase::connect($database),
                $fixture,
                $previousActiveId,
            );
        }
    }

    private static function runAutomaticRedRegression(
        \mysqli $connection,
        TestClient $admin,
        TestClient $mesario,
        int $editionId,
        int $userId,
        int $gameId,
        int $classId,
        int $legacyUserId,
        int $legacyClassId,
    ): void {
        $date = date('Y-m-d');
        $legacy = $mesario->postJson('api/v1/ocorrencias', [
            'titulo_ocorrencia' => 'Vermelho',
            'descricao_ocorrencia' => "[JOGO:{$gameId}][TURMA:{$legacyClassId}]Segundo cartão amarelo — expulso automático",
            'data_ocorrencia' => $date,
            'usuarios_id_usuario' => $legacyUserId,
            'id_jogo' => $gameId,
            'id_turma' => $legacyClassId,
            'penalidade' => 1,
        ]);
        $legacyId = (int) ($legacy['json']['id'] ?? 0);
        $legacyBefore = $legacyId > 0 ? self::occurrenceSnapshot($connection, $legacyId) : null;
        $rankingBefore = self::rankingScore($admin, $editionId, $classId);

        $first = $mesario->postJson('api/v1/ocorrencias', [
            'titulo_ocorrencia' => 'Amarelo',
            'descricao_ocorrencia' => 'L10 primeiro amarelo',
            'data_ocorrencia' => $date,
            'usuarios_id_usuario' => $userId,
            'id_jogo' => $gameId,
            'id_turma' => $classId,
            'penalidade' => 0,
        ], ['X-SGI-Mutation-Id' => 'l10-yellow-first-' . bin2hex(random_bytes(6))]);
        $secondPayload = [
            'titulo_ocorrencia' => 'Amarelo',
            'descricao_ocorrencia' => 'L10 segundo amarelo',
            'data_ocorrencia' => $date,
            'usuarios_id_usuario' => $userId,
            'id_jogo' => $gameId,
            'id_turma' => $classId,
            'penalidade' => 0,
        ];
        $secondKey = 'l10-yellow-second-' . bin2hex(random_bytes(6));
        $second = $mesario->postJson('api/v1/ocorrencias', $secondPayload, ['X-SGI-Mutation-Id' => $secondKey]);
        $secondId = (int) ($second['json']['id'] ?? 0);
        $retrySecond = $mesario->postJson('api/v1/ocorrencias', $secondPayload, ['X-SGI-Mutation-Id' => $secondKey]);
        $autoAfterSecond = self::automaticRedRows($connection, $userId, $gameId);
        Assertions::assert(
            'Dois amarelos criam exatamente um vermelho automático',
            $legacy['code'] === 201
            && $first['code'] === 201
            && $second['code'] === 201
            && ($second['json']['evento'] ?? null) === 'segundo_amarelo'
            && count(array_filter($autoAfterSecond, static fn (array $row): bool => $row['status_ocorrencia'] === '1')) === 1,
            json_encode(['first' => $first, 'second' => $second, 'auto' => $autoAfterSecond], JSON_UNESCAPED_UNICODE),
        );
        Assertions::assert(
            'O vermelho automático aponta para o segundo amarelo estruturado',
            count($autoAfterSecond) === 1
            && (int) ($autoAfterSecond[0]['ocorrencia_amarela_origem_id'] ?? 0) === $secondId,
            json_encode($autoAfterSecond, JSON_UNESCAPED_UNICODE),
        );
        Assertions::assert(
            'Retry do segundo amarelo preserva a mesma ocorrência e não duplica cartão',
            $secondId > 0
            && $retrySecond['code'] === 201
            && (int) ($retrySecond['json']['id'] ?? 0) === $secondId
            && self::countActiveYellows($connection, $userId, $gameId) === 2
            && count(self::automaticRedRows($connection, $userId, $gameId)) === 1,
            json_encode($retrySecond, JSON_UNESCAPED_UNICODE),
        );

        $athletesAfterSecond = $mesario->get("api/v1/ocorrencias?acao=listar_atletas&id_jogo={$gameId}&id_turma={$classId}");
        $redId = (int) ($autoAfterSecond[0]['id_ocorrencia'] ?? 0);
        Assertions::assert(
            'Vermelho automático remove atleta apto e desconta um ponto no ranking',
            $redId > 0
            && !self::athleteListed($athletesAfterSecond, $userId)
            && self::rankingScore($admin, $editionId, $classId) === $rankingBefore - 1,
            json_encode(['athletes' => $athletesAfterSecond, 'ranking' => self::rankingScore($admin, $editionId, $classId)], JSON_UNESCAPED_UNICODE),
        );
        $redBeforeDirectEdit = self::occurrenceSnapshot($connection, $redId);
        $directAutoRedEdit = $mesario->putJson('api/v1/ocorrencias', [
            'id_ocorrencia' => $redId,
            'status_ocorrencia' => '0',
        ], ['X-SGI-Mutation-Id' => 'l10-direct-red-edit-' . bin2hex(random_bytes(6))]);
        Assertions::assert(
            'A API rejeita edição direta do vermelho derivado sem alterar a ocorrência',
            $directAutoRedEdit['code'] === 409
            && self::occurrenceSnapshot($connection, $redId) === $redBeforeDirectEdit
            && self::automaticRedRows($connection, $userId, $gameId) === $autoAfterSecond,
            json_encode(['response' => $directAutoRedEdit, 'red' => self::occurrenceSnapshot($connection, $redId)], JSON_UNESCAPED_UNICODE),
        );

        $deactivateSecond = $mesario->putJson('api/v1/ocorrencias', [
            'id_ocorrencia' => $secondId,
            'status_ocorrencia' => '0',
        ], ['X-SGI-Mutation-Id' => 'l10-deactivate-' . bin2hex(random_bytes(6))]);
        $athletesAfterCorrection = $mesario->get("api/v1/ocorrencias?acao=listar_atletas&id_jogo={$gameId}&id_turma={$classId}");
        $autoAfterCorrection = self::occurrenceSnapshot($connection, $redId);
        Assertions::assert(
            'Corrigir o segundo amarelo retira somente o efeito automático',
            $deactivateSecond['code'] === 200
            && ($autoAfterCorrection['status_ocorrencia'] ?? null) === '0'
            && self::athleteListed($athletesAfterCorrection, $userId)
            && self::rankingScore($admin, $editionId, $classId) === $rankingBefore,
            json_encode(['update' => $deactivateSecond, 'auto' => $autoAfterCorrection, 'athletes' => $athletesAfterCorrection], JSON_UNESCAPED_UNICODE),
        );

        $manual = $mesario->postJson('api/v1/ocorrencias', [
            'titulo_ocorrencia' => 'Vermelho',
            'descricao_ocorrencia' => 'L10 cartão vermelho manual',
            'data_ocorrencia' => $date,
            'usuarios_id_usuario' => $userId,
            'id_jogo' => $gameId,
            'id_turma' => $classId,
            'penalidade' => 1,
        ], ['X-SGI-Mutation-Id' => 'l10-manual-red-' . bin2hex(random_bytes(6))]);
        $manualId = (int) ($manual['json']['id'] ?? 0);
        $manualBeforeReactivation = $manualId > 0 ? self::occurrenceSnapshot($connection, $manualId) : null;
        $reactivateSecond = $mesario->putJson('api/v1/ocorrencias', [
            'id_ocorrencia' => $secondId,
            'status_ocorrencia' => '1',
        ], ['X-SGI-Mutation-Id' => 'l10-reactivate-' . bin2hex(random_bytes(6))]);
        $autoAfterReactivation = self::automaticRedRows($connection, $userId, $gameId);
        $manualAfterReactivation = $manualId > 0 ? self::occurrenceSnapshot($connection, $manualId) : null;
        Assertions::assert(
            'Reativar amarelo reativa o mesmo derivado e preserva o vermelho manual',
            $manual['code'] === 201
            && $manualId > 0
            && $reactivateSecond['code'] === 200
            && count($autoAfterReactivation) === 1
            && (int) ($autoAfterReactivation[0]['id_ocorrencia'] ?? 0) === $redId
            && ($autoAfterReactivation[0]['status_ocorrencia'] ?? null) === '1'
            && (int) ($autoAfterReactivation[0]['ocorrencia_amarela_origem_id'] ?? 0) === $secondId
            && $manualBeforeReactivation !== null
            && $manualAfterReactivation === $manualBeforeReactivation,
            json_encode(['auto' => $autoAfterReactivation, 'manual' => $manualAfterReactivation], JSON_UNESCAPED_UNICODE),
        );

        $thirdPayload = [
            'titulo_ocorrencia' => 'Amarelo',
            'descricao_ocorrencia' => 'L10 terceiro amarelo',
            'data_ocorrencia' => $date,
            'usuarios_id_usuario' => $userId,
            'id_jogo' => $gameId,
            'id_turma' => $classId,
            'penalidade' => 0,
        ];
        $thirdKey = 'l10-yellow-third-' . bin2hex(random_bytes(6));
        $third = $mesario->postJson('api/v1/ocorrencias', $thirdPayload, ['X-SGI-Mutation-Id' => $thirdKey]);
        $retryThird = $mesario->postJson('api/v1/ocorrencias', $thirdPayload, ['X-SGI-Mutation-Id' => $thirdKey]);
        $autoAfterThird = self::automaticRedRows($connection, $userId, $gameId);
        Assertions::assert(
            'Terceiro amarelo e retry mantêm um único vermelho automático ativo',
            $third['code'] === 201
            && (int) ($retryThird['json']['id'] ?? 0) === (int) ($third['json']['id'] ?? 0)
            && self::countActiveYellows($connection, $userId, $gameId) === 3
            && count(array_filter($autoAfterThird, static fn (array $row): bool => $row['status_ocorrencia'] === '1')) === 1
            && ($manualAfterReactivation['status_ocorrencia'] ?? null) === '1',
            json_encode(['third' => $third, 'retry' => $retryThird, 'auto' => $autoAfterThird], JSON_UNESCAPED_UNICODE),
        );
        Assertions::assert(
            'Cartão legado sem relação estruturada permanece inalterado',
            $legacyId > 0
            && $legacyBefore !== null
            && self::occurrenceSnapshot($connection, $legacyId) === $legacyBefore,
            json_encode(['before' => $legacyBefore, 'after' => $legacyId > 0 ? self::occurrenceSnapshot($connection, $legacyId) : null], JSON_UNESCAPED_UNICODE),
        );
        self::deleteOccurrences($connection, [$userId, $legacyUserId]);
    }

    private static function countGoals(\mysqli $connection, int $userId, int $gameId): int
    {
        $statement = $connection->prepare(
            'SELECT COUNT(*) FROM artilheiros WHERE usuarios_id_usuario = ? AND jogos_id_jogo = ?',
        );
        $statement->bind_param('ii', $userId, $gameId);
        $statement->execute();
        $count = (int) $statement->get_result()->fetch_column();
        $statement->close();
        return $count;
    }

    private static function countOccurrences(\mysqli $connection, int $userId): int
    {
        $statement = $connection->prepare('SELECT COUNT(*) FROM ocorrencias WHERE usuarios_id_usuario = ?');
        $statement->bind_param('i', $userId);
        $statement->execute();
        $count = (int) $statement->get_result()->fetch_column();
        $statement->close();
        return $count;
    }

    /** @return list<array{id_ocorrencia:int,status_ocorrencia:string,penalidade:int,descricao_ocorrencia:string,ocorrencia_amarela_origem_id:int}> */
    private static function automaticRedRows(\mysqli $connection, int $userId, int $gameId): array
    {
        $statement = $connection->prepare(
            'SELECT o.id_ocorrencia, o.status_ocorrencia, o.penalidade, o.descricao_ocorrencia,
                    a.ocorrencia_amarela_origem_id
             FROM ocorrencias_vermelhos_automaticos a
             INNER JOIN ocorrencias o ON o.id_ocorrencia = a.ocorrencia_vermelha_id
             WHERE a.usuarios_id_usuario = ? AND a.jogos_id_jogo = ?
             ORDER BY o.id_ocorrencia',
        );
        $statement->bind_param('ii', $userId, $gameId);
        $statement->execute();
        $rows = $statement->get_result()->fetch_all(MYSQLI_ASSOC);
        $statement->close();
        return array_map(static fn (array $row): array => [
            'id_ocorrencia' => (int) $row['id_ocorrencia'],
            'status_ocorrencia' => (string) $row['status_ocorrencia'],
            'penalidade' => (int) $row['penalidade'],
            'descricao_ocorrencia' => (string) $row['descricao_ocorrencia'],
            'ocorrencia_amarela_origem_id' => (int) $row['ocorrencia_amarela_origem_id'],
        ], $rows);
    }

    private static function countActiveYellows(\mysqli $connection, int $userId, int $gameId): int
    {
        $statement = $connection->prepare(
            "SELECT COUNT(*) FROM ocorrencias
             WHERE usuarios_id_usuario = ? AND titulo_ocorrencia = 'Amarelo'
               AND status_ocorrencia = '1' AND descricao_ocorrencia LIKE ?",
        );
        $gameMarker = '%[JOGO:' . $gameId . ']%';
        $statement->bind_param('is', $userId, $gameMarker);
        $statement->execute();
        $count = (int) $statement->get_result()->fetch_column();
        $statement->close();
        return $count;
    }

    /** @param array<string, mixed> $response */
    private static function athleteListed(array $response, int $userId): bool
    {
        foreach (($response['json']['atletas'] ?? []) as $athlete) {
            if ((int) ($athlete['id_usuario'] ?? 0) === $userId) {
                return true;
            }
        }
        return false;
    }

    private static function rankingScore(TestClient $admin, int $editionId, int $classId): int
    {
        $response = $admin->get("api/v1/ranking?id_interclasse={$editionId}&id_turma={$classId}");
        foreach (($response['json'] ?? []) as $row) {
            if ((int) ($row['id_turma'] ?? 0) === $classId) {
                return (int) ($row['pontuacao_liquida'] ?? PHP_INT_MIN);
            }
        }
        return PHP_INT_MIN;
    }

    /** @return array{id_ocorrencia:int,titulo_ocorrencia:string,descricao_ocorrencia:string,status_ocorrencia:string,penalidade:int}|null */
    private static function occurrenceSnapshot(\mysqli $connection, int $occurrenceId): ?array
    {
        $statement = $connection->prepare(
            'SELECT id_ocorrencia, titulo_ocorrencia, descricao_ocorrencia, status_ocorrencia, penalidade FROM ocorrencias WHERE id_ocorrencia = ? LIMIT 1',
        );
        $statement->bind_param('i', $occurrenceId);
        $statement->execute();
        $row = $statement->get_result()->fetch_assoc() ?: null;
        $statement->close();
        if ($row === null) {
            return null;
        }
        return [
            'id_ocorrencia' => (int) $row['id_ocorrencia'],
            'titulo_ocorrencia' => (string) $row['titulo_ocorrencia'],
            'descricao_ocorrencia' => (string) $row['descricao_ocorrencia'],
            'status_ocorrencia' => (string) $row['status_ocorrencia'],
            'penalidade' => (int) $row['penalidade'],
        ];
    }

    private static function occurrenceDescription(\mysqli $connection, int $occurrenceId): ?string
    {
        $statement = $connection->prepare('SELECT descricao_ocorrencia FROM ocorrencias WHERE id_ocorrencia = ? LIMIT 1');
        $statement->bind_param('i', $occurrenceId);
        $statement->execute();
        $value = $statement->get_result()->fetch_column();
        $statement->close();
        return $value === null || $value === false ? null : (string) $value;
    }

    /** @param array<string, mixed> $response */
    private static function containsOccurrence(array $response, int $occurrenceId): bool
    {
        foreach (($response['json'] ?? []) as $row) {
            if ((int) ($row['id_ocorrencia'] ?? 0) === $occurrenceId) {
                return true;
            }
        }
        return false;
    }

    /** @param list<int> $userIds */
    private static function deleteOccurrences(\mysqli $connection, array $userIds): void
    {
        if ($userIds === []) {
            return;
        }
        $placeholders = implode(',', array_fill(0, count($userIds), '?'));
        $links = $connection->prepare("DELETE FROM ocorrencias_vermelhos_automaticos WHERE usuarios_id_usuario IN ({$placeholders})");
        $types = str_repeat('i', count($userIds));
        $userIds = array_map('intval', $userIds);
        $links->bind_param($types, ...$userIds);
        $links->execute();
        $links->close();
        $statement = $connection->prepare("DELETE FROM ocorrencias WHERE usuarios_id_usuario IN ({$placeholders})");
        $statement->bind_param($types, ...$userIds);
        $statement->execute();
        $statement->close();
    }

    private static function pointStatus(\mysqli $connection, int $pointId): string
    {
        $statement = $connection->prepare('SELECT status_artilheiro FROM artilheiros WHERE id_artilheiro = ? LIMIT 1');
        $statement->bind_param('i', $pointId);
        $statement->execute();
        $status = (string) ($statement->get_result()->fetch_column() ?: '');
        $statement->close();
        return $status;
    }

    /** @return array{jogos_id_jogo:int,equipes_id_equipe:int,resultado_partida:int} */
    private static function partida(\mysqli $connection, int $partidaId): array
    {
        $statement = $connection->prepare(
            'SELECT jogos_id_jogo, equipes_id_equipe, resultado_partida FROM partidas WHERE id_partida = ? LIMIT 1',
        );
        $statement->bind_param('i', $partidaId);
        $statement->execute();
        $row = $statement->get_result()->fetch_assoc() ?: [];
        $statement->close();
        return [
            'jogos_id_jogo' => (int) ($row['jogos_id_jogo'] ?? 0),
            'equipes_id_equipe' => (int) ($row['equipes_id_equipe'] ?? 0),
            'resultado_partida' => (int) ($row['resultado_partida'] ?? 0),
        ];
    }

    /** @return array<int, int> */
    private static function scores(\mysqli $connection, int $gameId): array
    {
        $statement = $connection->prepare(
            'SELECT equipes_id_equipe, resultado_partida FROM partidas WHERE jogos_id_jogo = ? ORDER BY id_partida',
        );
        $statement->bind_param('i', $gameId);
        $statement->execute();
        $rows = $statement->get_result()->fetch_all(MYSQLI_ASSOC);
        $statement->close();
        $scores = [];
        foreach ($rows as $row) {
            $scores[(int) $row['equipes_id_equipe']] = (int) $row['resultado_partida'];
        }
        return $scores;
    }

    private static function gameStatus(\mysqli $connection, int $gameId): string
    {
        $statement = $connection->prepare('SELECT status_jogo FROM jogos WHERE id_jogo = ? LIMIT 1');
        $statement->bind_param('i', $gameId);
        $statement->execute();
        $status = (string) ($statement->get_result()->fetch_column() ?: '');
        $statement->close();
        return $status;
    }
}
