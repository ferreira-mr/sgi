const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const root = process.cwd();
const read = (relative) => fs.readFileSync(`${root}/${relative}`, 'utf8');

test('o utilitário HTML escapa texto para contextos de markup', () => {
    const window = {};
    vm.runInNewContext(read('resources/js/shared/html-utils.js'), { window });

    assert.equal(
        window.SGIHtml.escape(`<script title="x">A&B's</script>`),
        '&lt;script title=&quot;x&quot;&gt;A&amp;B&#39;s&lt;/script&gt;',
    );
    assert.equal(window.SGIHtml.escape(null), '');
    assert.equal(window.SGIHtml.escape(0), '0');
});

test('todas as cascas HTML carregam o contrato compartilhado de escape', () => {
    for (const file of [
        'resources/views/components/admin-head.php',
        'resources/views/components/aluno-head.php',
        'resources/views/pages/acesso/login.php',
    ]) {
        assert.match(read(file), /js\/shared\/html-utils\.js/, file);
    }
});

test('mensagens vindas de APIs são escapadas antes de entrar em innerHTML', () => {
    const contracts = [
        ['resources/js/pages/aluno/perfil.js', /esc\(data\.message \|\| 'Erro ao salvar\.'/],
        ['resources/js/pages/acesso/perfil.js', /esc\(data\.message \|\| 'Erro ao salvar\.'/],
        ['resources/js/pages/acesso/colaboradores.js', /esc\(error\.message\)/],
        ['resources/js/pages/competicoes/modalidade-detalhes.js', /esc\(error\.message\)/],
        ['resources/js/pages/competicoes/placar.js', /esc\(result\.message \|\| 'Erro ao salvar\.'/],
        ['resources/js/pages/eventos/categorias.js', /esc\(err\.message\)/],
        ['resources/js/pages/eventos/configurar-categorias.js', /esc\(err\.message\)/],
        ['resources/js/pages/participantes/turmas.js', /esc\(err\.message\)/],
        ['resources/js/pages/eventos/lista.js', /escaparHTML\(msgErro\)/],
    ];

    for (const [file, pattern] of contracts) assert.match(read(file), pattern, file);
});

test('mensagens da troca obrigatória de senha são renderizadas como texto', () => {
    const source = read('resources/js/pages/aluno/trocar-senha.js');
    assert.match(source, /message\.textContent = text/);
    assert.doesNotMatch(source, /message\.innerHTML/);
});

test('ações com dados de usuário não são serializadas em handlers inline', () => {
    for (const file of [
        'resources/js/pages/eventos/configurar-locais.js',
        'resources/js/pages/eventos/configurar-arrecadacao.js',
        'resources/js/pages/disciplina/ocorrencias.js',
        'resources/js/pages/eventos/configurar-equipes.js',
        'resources/js/pages/resultados/ranking.js',
        'resources/js/pages/aluno/ranking.js',
        'resources/js/pages/competicoes/modalidade-detalhes.js',
        'resources/js/pages/competicoes/modalidades.js',
        'resources/js/pages/aluno/modalidade.js',
        'resources/js/pages/competicoes/elenco-equipe.js',
        'resources/js/pages/competicoes/placar.js',
        'resources/js/pages/participantes/turma-alunos.js',
        'resources/js/pages/eventos/lista.js',
    ]) {
        assert.doesNotMatch(read(file), /onclick\s*=/i, file);
    }
});

test('rankings escapam nomes e delegam ações após a renderização', () => {
    for (const file of [
        'resources/js/pages/resultados/ranking.js',
        'resources/js/pages/aluno/ranking.js',
    ]) {
        const source = read(file);
        assert.match(source, /esc\(t\.nome_turma\)/, file);
        assert.match(source, /data-sgi-action="history-ranking"/, file);
        assert.match(source, /data-id-turma=/, file);
        assert.doesNotMatch(source, /innerHTML\s*\+=/, file);
    }
});

test('selects de modalidades são preenchidos sem concatenar resposta da API', () => {
    for (const file of [
        'resources/js/pages/competicoes/modalidades.js',
        'resources/js/pages/competicoes/modalidade-detalhes.js',
    ]) {
        const source = read(file);
        assert.match(source, /new Option\(/, file);
        assert.match(source, /replaceChildren\(/, file);
        assert.doesNotMatch(source, /select(?:Tipo|Cat|)\.innerHTML\s*\+=/, file);
    }
});

test('ações renderizadas usam atributos de dados e controles acessíveis', () => {
    const alunoModalidade = read('resources/js/pages/aluno/modalidade.js');
    assert.match(alunoModalidade, /data-sgi-action="open-equipe"/);
    assert.match(alunoModalidade, /role="button" tabindex="0"/);
    assert.match(alunoModalidade, /data-sgi-action="select-equipe"/);

    const elenco = read('resources/js/pages/competicoes/elenco-equipe.js');
    assert.match(elenco, /data-sgi-action="remove-roster-student"/);
    assert.match(elenco, /data-sgi-action="redistribute-roster"/);

    const alunos = read('resources/js/pages/participantes/turma-alunos.js');
    assert.match(alunos, /data-sgi-action="view-student"/);
    assert.match(alunos, /data-sgi-action="reset-student-password"/);
});

test('login mantém rótulos, nomes de campos e região de erro acessível', () => {
    const source = read('resources/views/pages/acesso/login.php');

    for (const id of ['matricula_mobile', 'senha_mobile', 'matricula_desktop', 'senha_desktop']) {
        assert.match(source, new RegExp(`id="${id}"`), id);
        assert.match(source, new RegExp(`for="${id}"`), id);
    }
    assert.match(source, /name="matricula"/);
    assert.match(source, /name="senha"/);
    assert.match(source, /id="msg_erro_mobile"[^>]*aria-live="polite"/);
    assert.match(source, /id="msg_erro_desktop"[^>]*aria-live="polite"/);
});

test('selects dinâmicos usam a API de opções, sem concatenar HTML de API', () => {
    const source = read('resources/js/pages/eventos/configurar-modalidades.js');

    assert.doesNotMatch(source, /selectTipo\.innerHTML\s*\+=/);
    assert.doesNotMatch(source, /selectCat\.innerHTML\s*\+=/);
    assert.match(source, /new Option\(String\(tipo\.nome_tipo_modalidade/);
    assert.match(source, /new Option\(String\(cat\.nome_categoria/);
});
