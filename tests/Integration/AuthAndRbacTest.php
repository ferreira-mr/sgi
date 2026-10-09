<?php
declare(strict_types=1);

namespace SGITests\Integration;

use SGITests\Support\TestClient;
use SGITests\Support\Assertions;

class AuthAndRbacTest
{
    public static function run(): void
    {
        echo "\n  \033[1;34m[Suite 1: Autenticação, RBAC e Perfis de Acesso]\033[0m\n";

        $client = new TestClient();

        // 1.1 Login com credenciais válidas - Admin
        $res = $client->login('admin', '123');
        Assertions::assertStatus("Login do Administrador (HTTP 200)", $res, 200);
        Assertions::assertJsonSuccess("Retorno de sucesso no login do Admin", $res);
        Assertions::assert("Redirecionamento de Admin para edicoes", str_contains((string)($res['json']['redirect'] ?? ''), 'edicoes'));

        // 1.2 Login Colaborador
        $clientColab = new TestClient();
        $resColab = $clientColab->login('colab', '123');
        Assertions::assertJsonSuccess("Login do Colaborador (nível 1)", $resColab);

        // 1.3 Login Mesário
        $clientMes = new TestClient();
        $resMes = $clientMes->login('mesario', '123');
        Assertions::assertJsonSuccess("Login do Mesário (nível 2)", $resMes);

        // Regression: a mesário may operate the event, but must not open
        // configuration/user-management pages by typing their URLs.
        foreach (['colaboradores', 'edicoes/modalidades', 'edicoes/pontuacao', 'edicoes/equipes', 'turmas/alunos'] as $staffPage) {
            $page = $clientMes->get($staffPage);
            Assertions::assert(
                "Mesário bloqueado na página administrativa {$staffPage}",
                $page['code'] === 200
                && !str_contains((string) $page['body'], 'Colaboradores')
                && !str_contains((string) $page['body'], 'Gerenciar alunos'),
            );
        }
        Assertions::assertStatus(
            'Mesário não pode listar colaboradores pela API',
            $clientMes->get('api/v1/usuarios?acao=listar_colaboradores'),
            403,
        );

        // 1.4 Login Aluno
        $clientAluno = new TestClient();
        $resAluno = $clientAluno->login('2879', '123');
        Assertions::assertJsonSuccess("Login do Aluno/Competidor (nível 3)", $resAluno);
        Assertions::assert("Redirecionamento de Aluno pendente para os termos", str_contains((string)($resAluno['json']['redirect'] ?? ''), 'aluno/termos'));

        // 1.5 Rejeição de Senha Incorreta
        $clientAnon = new TestClient();
        $resInvalido = $clientAnon->login('admin', 'senha_totalmente_errada');
        Assertions::assertStatus("Bloqueio de senha incorreta (HTTP 401)", $resInvalido, 401);

        // 1.6 Rejeição de Matrícula Inexistente
        $resInexistente = $clientAnon->login('usuario_fantasma_9999', '123');
        Assertions::assertStatus("Bloqueio de matrícula inexistente (HTTP 401)", $resInexistente, 401);

        $legacyValidation = $clientAnon->postJson('api/v1/usuarios?acao=validar_inscricao', [
            'matricula_usuario' => '2879',
            'data_nasc_usuario' => '2010-01-01',
        ]);
        Assertions::assertStatus('Validação cadastral não cria sessão', $legacyValidation, 410);

        // 1.7 Bloqueio de Acesso a Área Staff sem Login
        $resSemSessao = $clientAnon->get('painel');
        Assertions::assert("Redirecionamento/Bloqueio de rota staff sem sessão", $resSemSessao['code'] === 200 || $resSemSessao['code'] === 302);
        // O conteúdo não pode carregar o dashboard administrativo para anônimos
        Assertions::assert("Não expõe conteúdo de admin sem autenticação", !str_contains((string)$resSemSessao['body'], 'Total de Jogos'));

        $usuariosAnonimo = $clientAnon->get('api/v1/usuarios?acao=listar_colaboradores');
        Assertions::assertStatus('Bloqueio de consulta administrativa de usuários sem sessão', $usuariosAnonimo, 401);

        $csrfInvalido = $client->postJson('api/v1/senha', [
            'nova_senha' => 'senhaSegura123',
            'confirmar_senha' => 'senhaSegura123',
        ], ['X-SGI-CSRF' => 'token-invalido']);
        Assertions::assertStatus('Bloqueio de mutação com token CSRF inválido', $csrfInvalido, 403);

        // Nenhuma leitura da API deve expor dados sem uma sessão autenticada.
        $leiturasProtegidas = [
            'api/v1/arrecadacao',
            'api/v1/artilheiros',
            'api/v1/categorias',
            'api/v1/equipes',
            'api/v1/edicoes',
            'api/v1/jogos',
            'api/v1/locais',
            'api/v1/modalidades',
            'api/v1/ocorrencias',
            'api/v1/ocorrencias-turmas',
            'api/v1/partidas',
            'api/v1/ranking',
            'api/v1/tipos-modalidade',
            'api/v1/turmas',
        ];
        foreach ($leiturasProtegidas as $endpoint) {
            Assertions::assertStatus("Bloqueio de leitura sem sessão: {$endpoint}", $clientAnon->get($endpoint), 401);
        }

        $syncAnonimo = $clientAnon->postJson('api/v1/sincronizacao/chaveamento', [
            'id_modalidade' => 1,
            'tipo_modalidade' => 'mata_mata',
            'jogos' => [],
        ]);
        Assertions::assertStatus('Bloqueio de sincronização de chaveamento sem sessão', $syncAnonimo, 401);

        // 1.9 Troca de Senha - Validação de mínimo de 6 dígitos
        $resTrocaCurta = $client->postJson('api/v1/senha', [
            'nova_senha' => '123',
            'confirmar_senha' => '123'
        ]);
        Assertions::assert("Rejeição de troca para senha com menos de 6 caracteres", ($resTrocaCurta['json']['success'] ?? false) === false);

        // 1.10 Troca de Senha - Divergência na confirmação
        $resTrocaDiv = $client->postJson('api/v1/senha', [
            'nova_senha' => 'senhaSegura123',
            'confirmar_senha' => 'senhaDiferente456'
        ]);
        Assertions::assert("Rejeição quando as senhas não coincidem", ($resTrocaDiv['json']['success'] ?? false) === false);

        // 1.11 Logout
        $resLogoutGet = $client->get('api/v1/logout');
        Assertions::assertStatus('Logout por GET não altera a sessão', $resLogoutGet, 405);
        $resLogout = $client->postJson('api/v1/logout', []);
        Assertions::assert("Execução de logout limpo", $resLogout['code'] === 200 || $resLogout['code'] === 302);

        $resLogoutAluno = $clientAluno->request('api/v1/logout', 'POST', '', [], false);
        $sessaoAlunoDepoisLogout = $clientAluno->get('api/v1/session');
        Assertions::assert(
            'Logout do aluno encaminha ao login próprio e destrói a sessão',
            ($resLogoutAluno['code'] ?? 0) === 302
            && str_ends_with((string) ($resLogoutAluno['headers']['Location'] ?? ''), '/login')
            && in_array(($sessaoAlunoDepoisLogout['code'] ?? 0), [401, 403], true),
            json_encode(['logout' => $resLogoutAluno['code'] ?? 0, 'sessao' => $sessaoAlunoDepoisLogout['code'] ?? 0], JSON_UNESCAPED_UNICODE),
        );
    }
}
