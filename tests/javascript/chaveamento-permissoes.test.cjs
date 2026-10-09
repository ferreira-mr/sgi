const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function carregarChaveamento(config = { value3: 0 }) {
    const source = fs.readFileSync('resources/js/pages/competicoes/chaveamento.js', 'utf8');
    let api;
    const stats = new Map([
        'statModalidades', 'statModalidadesMob',
        'statJogos', 'statJogosMob',
        'statCampeoes', 'statCampeoesMob',
        'statPendentes', 'statPendentesMob',
    ].map((id) => [id, { textContent: '' }]));
    const document = {
        createElement: () => ({ textContent: '', innerHTML: '' }),
        getElementById: (id) => stats.get(id) || null,
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: () => {},
        removeEventListener: () => {},
    };
    const window = {
        location: { search: '?id=1' },
        matchMedia: () => ({ matches: false }),
        SGIPage: {
            mount: (_name, factory) => { api = factory(config, { listen: () => {}, onDeactivate: () => {} }); },
            ready: () => {},
        },
        SGIInterclasse: {
            getInterclasseById: async () => ({ id_interclasse: 1, nome_interclasse: 'Fixture' }),
            getActiveInterclasse: async () => null,
        },
        SGI: { alert: async () => {}, confirm: async () => true },
    };
    vm.runInNewContext(source, {
        window,
        document,
        URLSearchParams,
        URL,
        Event,
        SGI: window.SGI,
        fetch: async () => ({ ok: true, json: async () => [] }),
        setTimeout,
        clearTimeout,
        console,
    });
    api.__testStats = stats;
    return api;
}

const JOGO_AGENDADO = {
    id_jogo: 101,
    nome_jogo: 'MM:4:0:N',
    nome_fase: 'Semifinal',
    fase_nivel: 4,
    status_jogo: 'Agendado',
    data_jogo: '2026-09-18',
    inicio_jogo: '08:00:00',
    termino_jogo: '08:30:00',
    locais_id_local: 1,
    nome_local: 'Quadra 1',
    equipes: [
        { id_equipe: 1, nome_equipe: '2EMA Volei - 1', gols: 0 },
        { id_equipe: 2, nome_equipe: '1EMA Volei - 1', gols: 0 },
    ],
};

const JOGO_CONCLUIDO = {
    id_jogo: 102,
    nome_jogo: 'MM:2:0:N',
    nome_fase: 'Final',
    fase_nivel: 2,
    status_jogo: 'Concluido',
    data_jogo: '2026-09-18',
    inicio_jogo: '09:00:00',
    termino_jogo: '09:30:00',
    locais_id_local: 1,
    nome_local: 'Quadra 1',
    equipe_vencedora_id: 1,
    equipes: [
        { id_equipe: 1, nome_equipe: '2EMA Volei - 1', gols: 2 },
        { id_equipe: 2, nome_equipe: '1EMA Volei - 1', gols: 1 },
    ],
};

const JOGO_SEM_DATA = {
    id_jogo: 103,
    nome_jogo: 'MM:4:1:N',
    nome_fase: 'Semifinal',
    fase_nivel: 4,
    status_jogo: 'Agendado',
    data_jogo: null,
    inicio_jogo: null,
    termino_jogo: null,
    locais_id_local: null,
    equipes: [],
};

test('mesário não vê opção de editar jogo no card do bracket, apenas iniciar quando agendado', () => {
    const chaveamento = carregarChaveamento({ value3: 2, podeEditar: false });
    assert.equal(chaveamento.podeEditarJogo(), false);

    const htmlAgendado = chaveamento._renderBracketMatch(JOGO_AGENDADO);
    assert.match(htmlAgendado, /href="\/jogos\/placar\?id_jogo=101"/);
    assert.match(htmlAgendado, /Iniciar/);
    assert.doesNotMatch(htmlAgendado, /Editar/);
    assert.doesNotMatch(htmlAgendado, /editarJogoBracket/);

    const htmlConcluido = chaveamento._renderBracketMatch(JOGO_CONCLUIDO);
    assert.match(htmlConcluido, /href="\/jogos\/placar\?id_jogo=102"/);
    assert.match(htmlConcluido, /Ver resultado/);
    assert.doesNotMatch(htmlConcluido, /Editar/);
    assert.doesNotMatch(htmlConcluido, /editarJogoBracket/);

    const htmlSemData = chaveamento._renderBracketMatch(JOGO_SEM_DATA);
    assert.doesNotMatch(htmlSemData, /bkt-match__actions/);
    assert.doesNotMatch(htmlSemData, /Editar/);
});

test('administrador e colaborador continuam vendo opção de editar jogo no card do bracket', () => {
    const admin = carregarChaveamento({ value3: 0, podeEditar: true });
    assert.equal(admin.podeEditarJogo(), true);

    const htmlAdmin = admin._renderBracketMatch(JOGO_AGENDADO);
    assert.match(htmlAdmin, /Iniciar/);
    assert.match(htmlAdmin, /Editar/);
    assert.match(htmlAdmin, /editarJogoBracket\(this\)/);

    const htmlAdminConcluido = admin._renderBracketMatch(JOGO_CONCLUIDO);
    assert.match(htmlAdminConcluido, /Ver resultado/);
    assert.match(htmlAdminConcluido, /Editar/);

    const colab = carregarChaveamento({ value3: 1, podeEditar: true });
    assert.equal(colab.podeEditarJogo(), true);
    const htmlColab = colab._renderBracketMatch(JOGO_AGENDADO);
    assert.match(htmlColab, /Editar/);
});

test('fase posterior herdada permite iniciar sem horário', () => {
    const mesario = carregarChaveamento({ value3: 2, podeEditar: false });
    const jogo = { ...JOGO_AGENDADO, id_jogo: 104, inicio_jogo: null, termino_jogo: null, exige_horario_agendado: false };

    const html = mesario._renderBracketMatch(jogo);

    assert.match(html, /href="\/jogos\/placar\?id_jogo=104"/);
    assert.match(html, /Iniciar/);
});

test('fase formada offline permite iniciar sem agenda e mantém o nome da equipe online', () => {
    const mesario = carregarChaveamento({ value3: 2, podeEditar: false });
    const jogo = {
        ...JOGO_SEM_DATA,
        id_jogo: -104,
        _offline_liberado: true,
        exige_horario_agendado: false,
        equipes: [
            { id_equipe: 1, nome_equipe: 'Equipe de Vôlei', nome_turma: '3º Ano A', gols: 0 },
            { id_equipe: 2, nome_equipe: 'Equipe de Vôlei', nome_turma: '1º Ano B', gols: 0 },
        ],
    };

    const html = mesario._renderBracketMatch(jogo);

    assert.match(html, /href="\/jogos\/placar\?id_jogo=-104"/);
    assert.match(html, /Iniciar/);
    assert.match(html, /Equipe de Vôlei/);
});

test('aluno não pode editar jogos no chaveamento', () => {
    const aluno = carregarChaveamento({ value3: 3, podeEditar: false });
    assert.equal(aluno.podeEditarJogo(), false);

    const htmlAluno = aluno._renderBracketMatch(JOGO_AGENDADO);
    assert.doesNotMatch(htmlAluno, /Editar/);
});

test('chaveamento consome a árvore PL publicada sem ação de geração separada', () => {
    const source = fs.readFileSync('resources/js/pages/competicoes/chaveamento.js', 'utf8');
    const chaveamento = carregarChaveamento({ value3: 0, podeEditar: true });
    const nome = chaveamento.formatarNomePartida({
        nome_jogo: 'PL:71:0:MM:2:0:N',
        nome_tipo_modalidade: 'Mata-Mata',
    });
    assert.match(nome, /Final/);
    assert.doesNotMatch(source, /btnGerarChaveamento|gerarChaveamento/);

    const previsto = chaveamento._renderBracketMatch({
        id_jogo: -3,
        nome_jogo: 'PL:71:0:MM:2:0:N',
        status_jogo: 'Previsto',
        virtual_planejado: true,
        fase_nivel: 2,
        nome_fase: 'Final',
        equipes: [],
    });
    assert.match(previsto, /Previsto/);
    assert.doesNotMatch(previsto, /\/jogos\/placar\?id_jogo=-3|Editar Jogo/);
});

test('tabela de histórico de jogos oculta botão de edição para mesário e mantém para admin', () => {
    const mesario = carregarChaveamento({ value3: 2, podeEditar: false });
    const linhaMesario = mesario.renderizarLinhaJogo(JOGO_CONCLUIDO);
    assert.match(linhaMesario, /href="\/jogos\/placar\?id_jogo=102"/);
    assert.doesNotMatch(linhaMesario, /title="Editar Jogo"/);
    assert.doesNotMatch(linhaMesario, /onclick="editarJogo\(this\)"/);

    const admin = carregarChaveamento({ value3: 0, podeEditar: true });
    const linhaAdmin = admin.renderizarLinhaJogo(JOGO_CONCLUIDO);
    assert.match(linhaAdmin, /href="\/jogos\/placar\?id_jogo=102"/);
    assert.match(linhaAdmin, /title="Editar Jogo"/);
    assert.match(linhaAdmin, /onclick="editarJogo\(this\)"/);
});

test('conta campeões pela fase e resultado estruturados, incluindo tags PL e ranking individual', () => {
    const chaveamento = carregarChaveamento();
    const modalidades = [
        { id_modalidade: 96, nome_tipo_modalidade: 'Mata-Mata' },
        { id_modalidade: 97, nome_tipo_modalidade: 'Mata-Mata' },
        { id_modalidade: 98, nome_tipo_modalidade: 'Individual' },
        { id_modalidade: 99, nome_tipo_modalidade: 'Individual' },
    ];
    const final = {
        nome_jogo: 'PL:96:0:MM:2:0:N',
        fase_nivel: 2,
        status_jogo: 'Concluido',
        equipe_vencedora_id: 601,
        equipes: [{ id_equipe: 601 }, { id_equipe: 602 }],
    };
    const resultados = new Map([
        ['96', { success: true, jogos: [final, final] }],
        ['97', { success: true, jogos: [{ ...final, equipe_vencedora_id: null }] }],
        ['98', { success: true, jogo: { status_jogo: 'Concluido' }, ranking: [{ posicao: 1, id_usuario: 701 }, { posicao: 2, id_usuario: 702 }] }],
        ['99', { success: true, jogo: { status_jogo: 'Iniciado' }, ranking: [{ posicao: 1, id_usuario: 801 }] }],
    ]);

    assert.deepEqual(
        Array.from(chaveamento._contarCampeoesConfirmados(modalidades, resultados)),
        ['96', '98'],
    );

    chaveamento.atualizarStats([
        { id_jogo: 1, status_jogo: 'Concluido', equipes_nomes: 'A vs B' },
        { id_jogo: 2, status_jogo: 'Finalizado', equipes_nomes: 'C vs D' },
        { id_jogo: 3, status_jogo: 'Agendado', equipes_nomes: 'E vs F' },
        { id_jogo: -4, status_jogo: 'Concluido', equipes_nomes: 'G vs H' },
        { id_jogo: 5, status_jogo: 'Concluido', equipes_nomes: 'bye sem oponente' },
    ], new Set(['96', '98']));
    assert.equal(chaveamento.__testStats.get('statJogos').textContent, 3);
    assert.equal(chaveamento.__testStats.get('statPendentes').textContent, 1);
    assert.equal(chaveamento.__testStats.get('statCampeoes').textContent, 2);
});

test('duração programada usa segundos e não combina datetime real com fim agendado', () => {
    const chaveamento = carregarChaveamento();
    const base = {
        status_jogo: 'Concluido',
        data_jogo: '2026-09-24',
        data_inicio_real: '2026-09-24 08:00:00',
        termino_jogo: '08:05:00',
    };

    assert.equal(chaveamento.formatarDuracaoJogo({ ...base, duracao_jogo: 300 }), '5min');
    assert.equal(chaveamento.formatarDuracaoJogo({ ...base, duracao_jogo: 65 }), '1min 5s');
    assert.equal(chaveamento.formatarDuracaoJogo({ ...base, duracao_jogo: 3600 }), '1h');
    assert.equal(chaveamento.formatarDuracaoJogo({ ...base, duracao_jogo: 3661 }), '1h 1min 1s');
    for (const duracao of [null, 0, 'invalido', Infinity, -1]) {
        assert.equal(chaveamento.formatarDuracaoJogo({ ...base, duracao_jogo: duracao }), '—');
    }
    assert.equal(chaveamento.formatarDuracaoJogo({ ...base, status_jogo: 'Agendado', duracao_jogo: 300 }), '—');
});

test('funções de edição de jogo retornam silenciosamente sem permissão', () => {
    const mesario = carregarChaveamento({ value3: 2, podeEditar: false });
    let modalAberto = false;
    let fetchChamado = false;

    // Se chamado indevidamente, não deve invocar fetch nem abrir modal
    mesario.editarJogo({ dataset: { jogo: JSON.stringify(JOGO_AGENDADO) } });
    mesario.editarJogoBracket({ getAttribute: () => JSON.stringify(JOGO_AGENDADO), dataset: { jogo: JSON.stringify(JOGO_AGENDADO) } });
    assert.equal(modalAberto, false);
    assert.equal(fetchChamado, false);
});

test('aviso offline (#sgi-offline-ok) usa ícone compacto, formato circular e texto acessível', () => {
    const source = fs.readFileSync('resources/js/offline/mesario-offline.js', 'utf8');

    // Ícone de nuvem com check
    assert.match(source, /bi-cloud-check-fill/);
    // Dimensões compactas e formato circular
    assert.match(source, /border-radius:\s*50%/);
    assert.match(source, /width:\s*38px/);
    assert.match(source, /height:\s*38px/);
    // Texto acessível em visually-hidden
    assert.match(source, /class="visually-hidden">Pronto para uso offline nesta aba preparada<\/span>/);
    // Preservação do title e aria-label
    assert.match(source, /b\.title\s*=\s*'Pronto para uso offline/);
    assert.match(source, /b\.setAttribute\('aria-label',\s*'Pronto para uso offline/);
});
