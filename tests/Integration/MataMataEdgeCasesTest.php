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
            'nome_modalidade' => 'Vôlei cinco equipes',
            'genero_modalidade' => 'MISTO',
            'max_inscrito_modalidade' => 10,
            'max_equipes' => 5,
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
        $roster = array_slice($students['json']['competidores'] ?? [], -5);
        Assertions::assert('Cinco competidores disponíveis para o chaveamento ímpar', count($roster) === 5);
        if (count($roster) !== 5) {
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
        $generated = $admin->postJson('api/v1/chaveamentos', ['id_modalidade' => $modality]);
        Assertions::assertJsonSuccess('Geração de chaveamento com três equipes e elenco', $generated);
        Assertions::assert('Chaveamento de cinco equipes registra um bye inicial', (int) ($generated['json']['bye_inicial'] ?? 0) === 1);
        $old = $admin->get("api/v1/chaveamentos?id_modalidade=$modality");
        $new = $admin->get("api/v1/chaveamentos?id_modalidade=$modality");
        Assertions::assert('Árvore versionada preserva jogos e avanços da URL antiga', is_array($old['json']['jogos'] ?? null) && $new['json'] === $old['json']);
        $firstRound = array_values(array_filter($old['json']['jogos'] ?? [], static fn (array $game): bool => str_starts_with((string) ($game['nome_jogo'] ?? ''), 'MM:8:')));
        $byeCount = count(array_filter($firstRound, static fn (array $game): bool => ($game['eh_bye'] ?? false) === true));
        $matchCount = count(array_filter($firstRound, static fn (array $game): bool => count($game['equipes'] ?? []) === 2));
        Assertions::assert('Cinco equipes geram dois confrontos e um bye na primeira fase', count($firstRound) === 3 && $matchCount === 2 && $byeCount === 1);
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
