<?php
declare(strict_types=1);

namespace SGITests\Integration;

use SGITests\Support\TestClient;
use SGITests\Support\Assertions;
use SGITests\Support\TestDatabase;

class AlunosPortalTest
{
    public static function run(): void
    {
        echo "\n  \033[1;34m[Suite 8: Portal do Aluno, Termos e Inscrições]\033[0m\n";

        // O login autentica o aluno, mas não libera o portal antes do aceite.
        $semAceite = new TestClient();
        $loginSemAceite = $semAceite->login('2879', '123');
        Assertions::assert(
            'Aluno sem aceite é enviado diretamente para os termos',
            str_contains((string) ($loginSemAceite['json']['redirect'] ?? ''), 'aluno/termos'),
        );
        foreach (['aluno/inicio', 'aluno/modalidades', 'aluno/jogos', 'aluno/perfil', 'aluno/ranking'] as $pagina) {
            $bloqueio = $semAceite->get($pagina);
            Assertions::assert(
                "URL de aluno sem aceite não renderiza a tela protegida [$pagina]",
                str_contains((string) ($bloqueio['body'] ?? ''), 'Termos e Regulamento')
                    && !str_contains((string) ($bloqueio['body'] ?? ''), 'Cronograma de Jogos'),
            );
        }
        Assertions::assertStatus(
            'Aluno sem aceite não consulta jogos pela API',
            $semAceite->get('api/v1/jogos'),
            403,
        );
        Assertions::assertStatus(
            'Aluno sem aceite não realiza inscrição pela API',
            $semAceite->postJson('api/v1/inscricoes', ['id_interclasse' => 1, 'equipes' => []]),
            403,
        );
        Assertions::assertStatus(
            'Aluno sem aceite consegue consultar somente o regulamento necessário',
            $semAceite->get('api/v1/edicoes?status_interclasse=1&regulamento=true'),
            200,
        );
        $statusSemAceite = $semAceite->get('api/v1/termos');
        Assertions::assertStatus('Aluno sem aceite consegue consultar o próprio status dos termos', $statusSemAceite, 200);
        Assertions::assert('Status inicial dos termos informa aceite pendente', ($statusSemAceite['json']['termo_aceito'] ?? true) === false);

        // A exceção de regulamento deve ser estreita: qualquer filtro que
        // peça uma edição específica volta a exigir o aceite.
        foreach ([
            'api/v1/edicoes?regulamento=true',
            'api/v1/edicoes?status_interclasse=1&regulamento=true&id=1',
            'api/v1/edicoes?status_interclasse=1&regulamento=true&id_interclasse=1',
        ] as $consultaEdicao) {
            $bloqueioEdicao = $semAceite->get($consultaEdicao);
            Assertions::assert(
                "Consulta de edição fora do regulamento público é bloqueada [$consultaEdicao]",
                ($bloqueioEdicao['code'] ?? 0) === 403
                    && ($bloqueioEdicao['json']['success'] ?? true) === false
                    && ($bloqueioEdicao['json']['message'] ?? '') === 'Aceite os termos de responsabilidade para continuar.',
            );
        }

        // A guarda fica antes dos controladores: nenhum endpoint protegido
        // deve vazar dados ou permitir operação enquanto o aceite faltar.
        $apisProtegidas = [
            'api/v1/arrecadacao',
            'api/v1/artilheiros',
            'api/v1/categorias',
            'api/v1/chaveamentos',
            'api/v1/classificacao',
            'api/v1/equipes',
            'api/v1/foto',
            'api/v1/historico-turma',
            'api/v1/locais',
            'api/v1/modalidades',
            'api/v1/ocorrencias',
            'api/v1/ocorrencias-turmas',
            'api/v1/partidas',
            'api/v1/ranking',
            'api/v1/session',
            'api/v1/senha',
            'api/v1/tipos-modalidade',
            'api/v1/turmas',
            'api/v1/usuarios',
        ];
        foreach ($apisProtegidas as $endpoint) {
            $bloqueioApi = $semAceite->get($endpoint);
            Assertions::assert(
                "API protegida exige aceite [$endpoint]",
                ($bloqueioApi['code'] ?? 0) === 403
                    && ($bloqueioApi['json']['success'] ?? true) === false
                    && ($bloqueioApi['json']['message'] ?? '') === 'Aceite os termos de responsabilidade para continuar.'
                    && str_contains((string) ($bloqueioApi['json']['redirect'] ?? ''), 'aluno/termos'),
            );
        }

        $termosPage = $semAceite->get('aluno/termos');
        Assertions::assert(
            'Aluno sem aceite vê somente o fluxo de termos no menu',
            str_contains((string) ($termosPage['body'] ?? ''), 'btnAceitarTermos')
                && !str_contains((string) ($termosPage['body'] ?? ''), 'aluno/inicio')
                && !str_contains((string) ($termosPage['body'] ?? ''), 'aluno/modalidades')
                && !str_contains((string) ($termosPage['body'] ?? ''), 'aluno/jogos'),
        );

        $aluno = new TestClient();
        $aluno->login('2879', '123');

        // 8.1 Aceitar termos de participação
        $resAceite = $aluno->postJson('api/v1/termos', []);
        Assertions::assert("Aceite digital de termos de participação esportiva", ($resAceite['json']['success'] ?? false) === true);
        Assertions::assertStatus(
            'Aluno com termos aceitos não pode alterar o cronograma',
            $aluno->postJson('api/v1/cronograma', ['acao' => 'preparar_equipes', 'id_interclasse' => 1]),
            403,
        );
        $cronogramaOutraEdicao = $aluno->get('api/v1/cronograma?id_interclasse=999999');
        Assertions::assertStatus('Aluno não consulta cronograma de outra edição', $cronogramaOutraEdicao, 403);

        $resAceiteRepetido = $aluno->postJson('api/v1/termos', []);
        Assertions::assertJsonSuccess('Reenvio do aceite permanece idempotente', $resAceiteRepetido);
        Assertions::assert(
            'Reenvio do aceite informa que os termos já estavam aceitos',
            str_contains((string) ($resAceiteRepetido['json']['message'] ?? ''), 'já aceitou'),
        );

        $loginDepoisDoAceite = new TestClient();
        $resLoginAceito = $loginDepoisDoAceite->login('2879', '123');
        Assertions::assert(
            'Novo login de aluno aceito abre diretamente o portal',
            str_contains((string) ($resLoginAceito['json']['redirect'] ?? ''), 'aluno/inicio'),
        );

        // 8.2 Consultar status do termo
        $resStatusTermo = $aluno->get('api/v1/termos');
        Assertions::assertStatus("Consulta de termos (HTTP 200)", $resStatusTermo, 200);
        Assertions::assert("Termo marcado como aceito (termo_aceito: true)", ($resStatusTermo['json']['termo_aceito'] ?? false) === true);

        // 8.3 Acessar páginas do portal do aluno
        $paginas = ['inicio', 'modalidades', 'jogos', 'termos', 'perfil'];
        foreach ($paginas as $p) {
            $resPage = $aluno->get("aluno/$p");
            Assertions::assertStatus("Renderização da tela de aluno [$p]", $resPage, 200);
        }

        // Uma sessão que já estava aberta não pode conservar acesso se o
        // aceite for revogado diretamente no banco por um procedimento
        // administrativo. O Kernel deve consultar o estado atual a cada
        // requisição protegida e voltar a liberar após a restauração.
        $database = TestDatabase::connect(getenv('SGI_TEST_DB_NAME') ?: 'sgi_test');
        $userStatement = $database->prepare(
            'SELECT id_usuario, interclasses_id_interclasse FROM usuarios WHERE matricula_usuario = ? LIMIT 1',
        );
        $matriculaAluno = '2879';
        $userStatement->bind_param('s', $matriculaAluno);
        $userStatement->execute();
        $alunoBanco = $userStatement->get_result()->fetch_assoc() ?: null;
        $userStatement->close();
        $idUsuarioBanco = (int) ($alunoBanco['id_usuario'] ?? 0);
        $idEdicaoBanco = (int) ($alunoBanco['interclasses_id_interclasse'] ?? 0);
        self::assertEquipeGetIsReadOnly($aluno, $database, $idEdicaoBanco);

        $aceiteStatement = $database->prepare(
            'SELECT aceito_termo, status_termo
             FROM usuarios_has_interclasses
             WHERE usuarios_id_usuario = ? AND interclasses_id_interclasse = ? LIMIT 1',
        );
        $aceiteStatement->bind_param('ii', $idUsuarioBanco, $idEdicaoBanco);
        $aceiteStatement->execute();
        $aceiteOriginal = $aceiteStatement->get_result()->fetch_assoc() ?: null;
        $aceiteStatement->close();
        Assertions::assert(
            'Aceite do aluno de regressão está persistido na edição vinculada',
            $idUsuarioBanco > 0 && $idEdicaoBanco > 0 && is_array($aceiteOriginal),
        );

        if (is_array($aceiteOriginal)) {
            $revogar = $database->prepare(
                "UPDATE usuarios_has_interclasses
                 SET aceito_termo = 'nao', status_termo = 'Inativo'
                 WHERE usuarios_id_usuario = ? AND interclasses_id_interclasse = ?",
            );
            $revogar->bind_param('ii', $idUsuarioBanco, $idEdicaoBanco);
            $revogar->execute();
            $revogar->close();

            try {
                $statusRevogado = $aluno->get('api/v1/termos');
                Assertions::assert(
                    'Sessão antiga reconhece a revogação do aceite',
                    ($statusRevogado['code'] ?? 0) === 200 && ($statusRevogado['json']['termo_aceito'] ?? true) === false,
                );

                $jogosRevogados = $aluno->get('api/v1/jogos');
                Assertions::assertStatus('Sessão antiga perde acesso à API após revogação', $jogosRevogados, 403);

                $paginaRevogada = $aluno->get('aluno/jogos');
                Assertions::assert(
                    'Sessão antiga volta para os termos após revogação',
                    str_contains((string) ($paginaRevogada['body'] ?? ''), 'Termos e Regulamento')
                        && !str_contains((string) ($paginaRevogada['body'] ?? ''), 'Cronograma de Jogos'),
                );
            } finally {
                $restaurar = $database->prepare(
                    'UPDATE usuarios_has_interclasses
                     SET aceito_termo = ?, status_termo = ?
                     WHERE usuarios_id_usuario = ? AND interclasses_id_interclasse = ?',
                );
                $aceito = (string) ($aceiteOriginal['aceito_termo'] ?? 'sim');
                $status = (string) ($aceiteOriginal['status_termo'] ?? 'Ativo');
                $restaurar->bind_param('ssii', $aceito, $status, $idUsuarioBanco, $idEdicaoBanco);
                $restaurar->execute();
                $restaurar->close();
            }

            $jogosRestaurados = $aluno->get('api/v1/jogos');
            Assertions::assertStatus('Sessão volta a acessar jogos após restauração do aceite', $jogosRestaurados, 200);
        }
        $database->close();

        // 8.3 Ranking do aluno exige encerramento e publicação explícita.
        $edicoes = $aluno->get('api/v1/edicoes?regulamento=true');
        $edicaoAtiva = null;
        foreach (($edicoes['json'] ?? []) as $edicao) {
            if ((string) ($edicao['status_interclasse'] ?? '') === '1') {
                $edicaoAtiva = $edicao;
                break;
            }
        }
        Assertions::assert('Existe edição ativa para validar o ranking do aluno', is_array($edicaoAtiva));

        if (is_array($edicaoAtiva)) {
            $idEdicao = (int) ($edicaoAtiva['id_interclasse'] ?? 0);
            $bloqueado = $aluno->get("api/v1/ranking?id_interclasse=$idEdicao");
            Assertions::assertStatus('Aluno não consulta ranking de edição ativa', $bloqueado, 403);
            Assertions::assert('API informa ranking bloqueado para edição ativa', ($bloqueado['json']['bloqueado'] ?? false) === true);

            $admin = new TestClient();
            $admin->login('admin', '123');
            $publicationConnection = TestDatabase::connect(getenv('SGI_TEST_DB_NAME') ?: 'sgi_test');
            $readPublication = $publicationConnection->prepare('SELECT ranking_publicado_em FROM interclasses WHERE id_interclasse = ? LIMIT 1');
            $readPublication->bind_param('i', $idEdicao);
            $readPublication->execute();
            $originalPublication = $readPublication->get_result()->fetch_column();
            $readPublication->close();
            $unpublish = $publicationConnection->prepare('UPDATE interclasses SET ranking_publicado_em = NULL WHERE id_interclasse = ?');
            $unpublish->bind_param('i', $idEdicao);
            $unpublish->execute();
            $unpublish->close();

            try {
                $fechada = $admin->postJson("api/v1/edicoes?id=$idEdicao", ['status_interclasse' => '0']);
                Assertions::assertJsonSuccess('Encerramento da edição para validar ranking', $fechada);
                $unpublishedRanking = $aluno->get("api/v1/ranking?id_interclasse=$idEdicao");
                Assertions::assert(
                    'Aluno não consulta ranking encerrado que ainda não foi publicado',
                    $unpublishedRanking['code'] === 403
                    && ($unpublishedRanking['json']['success'] ?? true) === false
                    && !str_contains((string) $unpublishedRanking['body'], 'nome_turma'),
                );
            } finally {
                $reativada = $admin->postJson("api/v1/edicoes?id=$idEdicao", ['status_interclasse' => '1']);
                Assertions::assertJsonSuccess('Restauração da edição ativa após teste do ranking', $reativada);
                $restorePublication = $publicationConnection->prepare('UPDATE interclasses SET ranking_publicado_em = ? WHERE id_interclasse = ?');
                $restorePublication->bind_param('si', $originalPublication, $idEdicao);
                $restorePublication->execute();
                $restorePublication->close();
                $publicationConnection->close();
            }
        }
    }

    private static function assertEquipeGetIsReadOnly(TestClient $aluno, \mysqli $database, int $idEdicao): void
    {
        $scopeStatement = $database->prepare(
            "SELECT m.categorias_id_categoria, m.tipos_modalidades_id_tipo_modalidade,
                    m.genero_modalidade, t.id_turma
             FROM modalidades m
             INNER JOIN turmas t ON t.categorias_id_categoria = m.categorias_id_categoria
             INNER JOIN categorias c ON c.id_categoria = m.categorias_id_categoria
             WHERE m.interclasses_id_interclasse = ? AND t.interclasses_id_interclasse = ?
               AND m.status_modalidade = '1' AND t.status_turma = '1' AND c.status_categoria = '1'
             ORDER BY m.id_modalidade, t.id_turma LIMIT 1",
        );
        $scopeStatement->bind_param('ii', $idEdicao, $idEdicao);
        $scopeStatement->execute();
        $scope = $scopeStatement->get_result()->fetch_assoc() ?: null;
        $scopeStatement->close();

        Assertions::assert('Existe modalidade e turma ativa para a regressão de GET de equipes', is_array($scope));
        if ($scope === null) {
            return;
        }

        $admin = new TestClient();
        $admin->login('admin', '123');
        $name = 'L03 leitura ' . bin2hex(random_bytes(6));
        $created = $admin->postJson('api/v1/modalidades', [
            'nome_modalidade' => $name,
            'genero_modalidade' => (string) $scope['genero_modalidade'],
            'max_inscrito_modalidade' => 10,
            'max_equipes' => 2,
            'tipos_modalidades_id_tipo_modalidade' => (int) $scope['tipos_modalidades_id_tipo_modalidade'],
            'categorias_id_categoria' => (int) $scope['categorias_id_categoria'],
            'interclasses_id_interclasse' => $idEdicao,
        ]);
        Assertions::assertStatus('Modalidade vazia sintética criada para testar GET sem escrita', $created, 201);
        $modalityId = (int) ($created['json']['id_modalidade'] ?? 0);
        Assertions::assert('Modalidade da regressão criada com ID', $modalityId > 0);
        if ($modalityId <= 0) {
            return;
        }

        $classId = (int) $scope['id_turma'];
        try {
            $studentResponse = $aluno->get("api/v1/equipes?id_modalidade=$modalityId&id_turma=$classId");
            Assertions::assertStatus('GET do aluno de equipe continua disponível após aceite', $studentResponse, 200);
            Assertions::assert('Primeiro GET do aluno não cria equipe na modalidade vazia', self::countTeamsForModality($database, $modalityId) === 0);

            $studentRepeat = $aluno->get("api/v1/equipes?id_modalidade=$modalityId&id_turma=$classId");
            Assertions::assertStatus('GET repetido do aluno continua disponível', $studentRepeat, 200);
            Assertions::assert('GET repetido do aluno mantém a modalidade sem equipes', self::countTeamsForModality($database, $modalityId) === 0);

            $adminResponse = $admin->get("api/v1/equipes?id_modalidade=$modalityId&id_turma=$classId");
            Assertions::assertStatus('GET administrativo de equipe continua disponível', $adminResponse, 200);
            Assertions::assert('GET administrativo não cria equipe', self::countTeamsForModality($database, $modalityId) === 0);
        } finally {
            $deleteTeams = $database->prepare('DELETE FROM equipes WHERE modalidades_id_modalidade = ?');
            $deleteTeams->bind_param('i', $modalityId);
            $deleteTeams->execute();
            $deleteTeams->close();
            $deleteModality = $database->prepare('DELETE FROM modalidades WHERE id_modalidade = ?');
            $deleteModality->bind_param('i', $modalityId);
            $deleteModality->execute();
            $deleteModality->close();
        }
    }

    private static function countTeamsForModality(\mysqli $database, int $modalityId): int
    {
        $statement = $database->prepare('SELECT COUNT(*) FROM equipes WHERE modalidades_id_modalidade = ?');
        $statement->bind_param('i', $modalityId);
        $statement->execute();
        $count = (int) $statement->get_result()->fetch_column();
        $statement->close();
        return $count;
    }
}
