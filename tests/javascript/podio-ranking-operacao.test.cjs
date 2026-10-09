const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('a view de modalidades inclui o modal de gerenciamento de pódio', () => {
    const view = fs.readFileSync('resources/views/pages/competicoes/modalidades.php', 'utf8');
    assert.match(view, /id="modalGerenciarPodio"/);
    assert.match(view, /id="selectPodio1"/);
    assert.match(view, /id="selectPodio2"/);
    assert.match(view, /id="selectPodio3"/);
    assert.match(view, /id="btnSalvarPodio"/);
});

test('o script de modalidades registra e manipula o fluxo do pódio', () => {
    const script = fs.readFileSync('resources/js/pages/competicoes/modalidades.js', 'utf8');
    assert.match(script, /data-sgi-action="gerenciar-podio"/);
    assert.match(script, /\/podios\?id_interclasse=/);
    assert.match(script, /method:\s*'POST'/);
    assert.match(script, /\/podios/);
    assert.doesNotMatch(script, /\baxios\./);
});

test('a view de ranking inclui botão de reconciliar ranking para o administrador', () => {
    const view = fs.readFileSync('resources/views/pages/aluno/ranking.php', 'utf8');
    assert.match(view, /id="btnReconciliarRankingDesk"/);
    assert.match(view, /id="btnReconciliarRankingMob"/);
});

test('o script de ranking realiza a chamada de reconciliação para a API', () => {
    const script = fs.readFileSync('resources/js/pages/aluno/ranking.js', 'utf8');
    assert.match(script, /reconciliarRanking/);
    assert.match(script, /acao:\s*'reconciliar'/);
    assert.match(script, /\/ranking/);
});

test('o script de placar disponibiliza a ação de avanço por W.O. para jogo com equipe única', () => {
    const script = fs.readFileSync('resources/js/pages/competicoes/placar.js', 'utf8');
    assert.match(script, /finalizarAvancoUnico/);
    assert.match(script, /Avançar por W\.O\./);
});
