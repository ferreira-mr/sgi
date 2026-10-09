<?php

declare(strict_types=1);

namespace SGITests\Integration;

use SGITests\Support\TestClient;
use SGITests\Support\Assertions;

final class MataMataEdgeCasesTest
{
    /** @param list<int> $equipesIds */
    public static function run(int $idEdicao, int $idTurma, int $idJogo, int $idModalidade, array $equipesIds): void
    {
        echo "\n  [Casos limites do chaveamento e reconstrução]\n";
        $admin = new TestClient();
        $admin->login('admin', '123');
        $mesario = new TestClient();
        $mesario->login('mesario', '123');
        $classes = $admin->get("api/v1/turmas?id_interclasse=$idEdicao");
        $category = 0;
        foreach ($classes['json'] ?? [] as $class) {
            if ((int) $class['id_turma'] === $idTurma) {
                $category = (int) $class['categorias_id_categoria'];
            }
        }
        $created = $admin->postJson('api/v1/modalidades', [
            'nome_modalidade' => 'Vôlei três equipes',
            'genero_modalidade' => 'MISTO',
            'max_inscrito_modalidade' => 10,
            'max_equipes' => 3,
            'tipos_modalidades_id_tipo_modalidade' => 1,
            'categorias_id_categoria' => $category,
            'interclasses_id_interclasse' => $idEdicao,
        ]);
        Assertions::assertJsonSuccess('Preparação de modalidade real para três equipes', $created);
        $modality = (int) ($created['json']['id_modalidade'] ?? 0);
        if ($modality <= 0) {
            throw new \RuntimeException('Não foi possível preparar o teste de chaveamento ímpar.');
        }
        $students = $admin->get("api/v1/usuarios?acao=listar_competidores&id_turma=$idTurma&id_interclasse=$idEdicao");
        $roster = array_slice($students['json']['competidores'] ?? [], -3);
        Assertions::assert('Três competidores disponíveis para o chaveamento ímpar', count($roster) === 3);
        if (count($roster) !== 3) {
            throw new \RuntimeException('Elenco insuficiente para o teste.');
        }
        foreach ($roster as $index => $student) {
            $team = $admin->postJson('api/v1/equipes', [
                'acao' => 'criar_equipe', 'modalidades_id_modalidade' => $modality,
                'turmas_id_turma' => $idTurma, 'nome_equipe' => 'Equipe ímpar ' . ($index + 1),
            ]);
            Assertions::assertJsonSuccess('Criação da equipe ímpar ' . ($index + 1), $team);
            $linked = $admin->postJson('api/v1/equipes', [
                'acao' => 'adicionar_usuarios', 'id_equipe' => (int) ($team['json']['id_equipe'] ?? 0),
                'usuarios' => [(int) $student['id_usuario']],
            ]);
            Assertions::assertJsonSuccess('Elenco da equipe ímpar ' . ($index + 1), $linked);
        }
        $generation = $admin->postJson('api/v1/chaveamentos', ['id_modalidade' => $modality]);
        Assertions::assertStatus('API antiga de geração exige o calendário canônico', $generation, 409);
        Assertions::assert('API antiga retorna código estável para a geração removida', ($generation['json']['code'] ?? null) === 'CHAVEAMENTO_DEVE_VIR_DO_CRONOGRAMA');
        $old = $admin->get("api/v1/chaveamentos?id_modalidade=$modality");
        $new = $admin->get("api/v1/chaveamentos?id_modalidade=$modality");
        Assertions::assert('Pedido antigo não grava jogos e a consulta permanece estável', ($old['json']['jogos'] ?? null) === [] && $new['json'] === $old['json']);
        Assertions::assertStatus('Mesário não pode recriar chaveamento coletivo', $mesario->postJson('api/v1/chaveamentos', ['id_modalidade' => $modality]), 403);
        $history = $admin->get("api/v1/chaveamentos?id_modalidade=$modality&acao=historico");
        $classification = $admin->get("api/v1/chaveamentos?id_modalidade=$modality&acao=classificacao");
        $expected = $history['json'];
        unset($expected['confrontos']);
        Assertions::assert('Classificação preserva histórico sem expor confrontos', is_array($expected) && $classification['json'] === $expected);

        $corrected = $mesario->postJson('api/v1/resultados', [
            'id_jogo' => $idJogo, 'nome_jogo' => 'MM:4:0:N', 'id_modalidade' => $idModalidade,
            'resultados' => [['id_equipe' => $equipesIds[0], 'gols' => 4], ['id_equipe' => $equipesIds[1], 'gols' => 2]],
        ]);
        Assertions::assertStatus('Retificação direta não altera placar estrito já encerrado', $corrected, 422);
        $scores = $admin->get("api/v1/partidas?id_jogo=$idJogo");
        $actual = [];
        foreach ($scores['json'] ?? [] as $score) {
            $actual[(int) $score['equipes_id_equipe']] = (int) $score['resultado_partida'];
        }
        Assertions::assert('Placar encerrado permanece consistente com as jogadas vinculadas', ($actual[$equipesIds[0]] ?? null) === 3 && ($actual[$equipesIds[1]] ?? null) === 1);
    }
}
