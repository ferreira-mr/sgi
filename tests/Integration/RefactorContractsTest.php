<?php

declare(strict_types=1);

namespace SGITests\Integration;

use SGITests\Support\Assertions;
use SGITests\Support\TestClient;

final class RefactorContractsTest
{
    public static function run(): void
    {
        echo "\n  [Contratos de segurança e arquitetura modular]\n";
        $admin = new TestClient();
        Assertions::assertJsonSuccess('Preparação dos contratos HTTP', $admin->login('admin', '123'));

        $activeEditions = $admin->get('api/v1/edicoes?status_interclasse=1&regulamento=true');
        $activeEdition = array_values(array_filter(
            is_array($activeEditions['json'] ?? null) ? $activeEditions['json'] : [],
            static fn (array $edition): bool => (string) ($edition['status_interclasse'] ?? '') === '1',
        ))[0] ?? [];
        $editionId = (int) ($activeEdition['id_interclasse'] ?? 0);
        Assertions::assert('Fixture HTTP fornece edição ativa para o contrato do cronograma', $editionId > 0);
        if ($editionId > 0) {
            Assertions::assertStatus('Administrador autorizado alcança o controlador de mutação do cronograma',
                $admin->postJson('api/v1/cronograma', ['acao' => 'acao_invalida', 'id_interclasse' => $editionId]), 422);
        }

        $withoutToken = $admin->postJson('api/v1/senha', [
            'nova_senha' => 'curta',
            'confirmar_senha' => 'curta',
        ], ['X-SGI-CSRF' => '']);
        Assertions::assertStatus('Token CSRF ausente é rejeitado também em teste', $withoutToken, 403);
        if ($editionId > 0) {
            $cronogramaWithoutToken = $admin->postJson('api/v1/cronograma', [
                'acao' => 'preparar_equipes',
                'id_interclasse' => $editionId,
            ], ['X-SGI-CSRF' => '']);
            Assertions::assertStatus('Mutação do cronograma exige token CSRF válido', $cronogramaWithoutToken, 403);

            $mesario = new TestClient();
            Assertions::assertJsonSuccess('Mesário autentica para validar a barreira do cronograma', $mesario->login('mesario', '123'));
            $mesarioMutation = $mesario->postJson('api/v1/cronograma', [
                'acao' => 'preparar_equipes',
                'id_interclasse' => $editionId,
            ]);
            Assertions::assertStatus('Mesário não pode alterar o cronograma', $mesarioMutation, 403);
        }

        $foreignOrigin = $admin->postJson('api/v1/senha', [], ['Origin' => 'https://other.invalid']);
        Assertions::assertStatus('Origem externa é rejeitada', $foreignOrigin, 403);

        $anonymous = new TestClient();
        Assertions::assertStatus('Consulta de sessão anônima é rejeitada', $anonymous->get('api/v1/session'), 401);
        $session = $admin->get('api/v1/session');
        Assertions::assert('Consulta de sessão informa usuário autenticado', ($session['json']['success'] ?? false) && ($session['json']['usuario']['nivel'] ?? -1) === 0);
        Assertions::assertStatus(
            'Upload antigo não possui rota',
            $anonymous->postForm('upload_turma_pdf.php', []),
            404,
        );
        foreach (['componentes/head.php', 'views/src/componentes/footer.php', 'resources/views/pages/competicoes/placar.php'] as $path) {
            Assertions::assertStatus('Template não é uma rota pública: ' . $path, $anonymous->get($path), 404);
        }

        foreach (['tipos-modalidade', 'categorias', 'locais', 'modalidades', 'ranking', 'turmas', 'arrecadacao', 'ocorrencias', 'ocorrencias-turmas', 'equipes'] as $resource) {
            $new = $admin->get('api/v1/' . $resource);
            Assertions::assertStatus('Rota canônica responde: ' . $resource, $new, in_array($resource, ['arrecadacao'], true) ? 400 : 200);
        }
    }
}
