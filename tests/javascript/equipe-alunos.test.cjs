const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('resources/js/pages/competicoes/equipe-alunos.js', 'utf8');

function loadPageActions() {
    let factory = null;
    const window = {
        SGIHtml: {
            escape: value => String(value == null ? '' : value)
                .replace(/[&<>"']/g, character => ({
                    '&': '&amp;',
                    '<': '&lt;',
                    '>': '&gt;',
                    '"': '&quot;',
                    "'": '&#39;',
                })[character]),
        },
        SGIPage: {
            mount: (_name, callback) => { factory = callback; },
        },
    };
    const document = { getElementById: () => null };
    vm.runInNewContext(source, { window, document, URLSearchParams });
    assert.equal(typeof factory, 'function');
    return factory({}, { listen: () => {} });
}

test('a tela de adicionar atletas renderiza nome e matrícula sem globals de outra página', () => {
    const page = loadPageActions();
    const card = page.cardAluno({
        id_usuario: 41,
        nome_usuario: '<img src=x onerror=alert(1)>',
        matricula_usuario: 'RM<&"41',
        genero_usuario: 'MASC',
        inscrito: 0,
    });

    assert.match(card, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(card, /RM&lt;&amp;&quot;41/);
    assert.doesNotMatch(card, /<img src=x/);
});

test('salvamento mantém estudantes selecionados fora do filtro atual', () => {
    const page = loadPageActions();
    const ids = page.idsSelecionadosParaSalvar(new Set(['11', '22', '33']), [
        { id_usuario: 22 },
    ]);

    assert.deepEqual(Array.from(ids), [11, 33]);
});

test('a nomenclatura de estudante fica na interface sem alterar o rótulo administrativo de usuários', () => {
    const adminView = fs.readFileSync('resources/views/pages/acesso/colaboradores.php', 'utf8');
    const teamView = fs.readFileSync('resources/views/pages/competicoes/equipe-alunos.php', 'utf8');

    assert.match(adminView, />Usuários</);
    assert.match(teamView, /Adicionar estudantes à equipe/);
    assert.match(teamView, /Carregando estudantes/);
    assert.doesNotMatch(teamView, /Adicionar alunos à equipe|Carregando alunos/);
    assert.match(source, /nome_usuario \|\| 'Estudante'/);
    assert.match(source, /Adicionar \$\{novosSelecionados\} \$\{novosSelecionados === 1 \? 'estudante' : 'estudantes'\}/);
});
