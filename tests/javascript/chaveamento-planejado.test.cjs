const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { operacaoLiberada } = require('../browser/cronograma-fixture-helper.cjs');

test('fixture do cronograma lê o campo canônico de operação liberada', () => {
    assert.equal(operacaoLiberada({ operacao_liberada: '1' }), true);
    assert.equal(operacaoLiberada({ operacao: { liberada: true } }), true);
    assert.equal(operacaoLiberada({ operacao_liberada: '0', operacao: { liberada: false } }), false);
});

test('motor offline preserva tags PL e usa o compromisso publicado ao formar a próxima fase', async () => {
    const source = fs.readFileSync('resources/js/offline/chaveamento-engine.js', 'utf8');
    const modalityId = 71;
    const finalTag = `PL:${modalityId}:0:MM:2:0:N`;
    const plannedTree = [
        {
            id_jogo: 81,
            nome_jogo: `PL:${modalityId}:0:MM:4:0:N`,
            status_jogo: 'Concluido',
            modalidades_id_modalidade: modalityId,
            id_interclasse: 9,
            equipes: [
                { id_equipe: 11, nome_equipe: 'Equipe A', gols: 2 },
                { id_equipe: 12, nome_equipe: 'Equipe B', gols: 1 },
            ],
        },
        {
            id_jogo: -32,
            nome_jogo: `PL:${modalityId}:0:MM:4:1:B`,
            status_jogo: 'Concluido',
            eh_bye: true,
            modalidades_id_modalidade: modalityId,
            id_interclasse: 9,
            equipes: [{ id_equipe: 13, nome_equipe: 'Equipe C', gols: 0 }],
        },
        {
            id_jogo: -34,
            nome_jogo: finalTag,
            status_jogo: 'Aguardando',
            virtual_planejado: true,
            modalidades_id_modalidade: modalityId,
            id_interclasse: 9,
            equipes: [],
        },
    ];
    const cronograma = {
        cronograma_status: 'publicado',
        versao_publicada: 4,
        compromissos: [{
            id_compromisso: 402,
            id_modalidade: modalityId,
            chave_tag: finalTag,
            data_compromisso: '2030-10-03',
            inicio_compromisso: '10:20:00',
            termino_compromisso: '10:40:00',
            id_local: 5,
        }],
    };
    const window = {
        location: { href: 'http://sgi.test/' },
        SGIDataLayer: {
            read: async (store) => store === 'cronograma' ? cronograma : [],
        },
        SGIOffline: {
            getPendingList: async () => [{
                id: 'result-root',
                url: '/api/v1/resultados',
                method: 'POST',
                createdAt: 1,
                body: JSON.stringify({
                    id_jogo: 81,
                    resultados: [{ id_equipe: 11, gols: 2 }, { id_equipe: 12, gols: 1 }],
                }),
            }],
        },
        SGI_SESSION_INTERCLASSE_ATIVO: 9,
        addEventListener: () => {},
    };
    const document = { getElementsByTagName: () => [] };
    const context = {
        window,
        document,
        navigator: { onLine: true },
        URL,
        fetch: async (url) => url.includes('chaveamentos')
            ? { json: async () => ({ success: true, jogos: plannedTree }) }
            : { ok: true, json: async () => [] },
        indexedDB: null,
        console,
    };
    vm.runInNewContext(source, context);

    const result = await window.SGIChaveamento.carregarArvore(modalityId);
    const final = result.jogos.find((game) => game.nome_jogo === finalTag);

    assert.ok(final, 'a final deve manter a identidade PL do calendário');
    assert.equal(JSON.stringify(final.equipes.map((team) => Number(team.id_equipe)).sort()), JSON.stringify([11, 13]));
    assert.equal(final.data_jogo, '2030-10-03');
    assert.equal(final.inicio_jogo, '10:20:00');
    assert.equal(Number(final.locais_id_local), 5);
    assert.equal(final.modalidades_id_modalidade, modalityId);
});

test('reconciliação de placares locais preserva nomes das equipes presentes na árvore remota', async () => {
    const source = fs.readFileSync('resources/js/offline/chaveamento-engine.js', 'utf8');
    const modalityId = 71;
    const tag = `PL:${modalityId}:9:MM:8:0:N`;
    const remoteGame = {
        id_jogo: 81,
        nome_jogo: tag,
        status_jogo: 'Concluido',
        modalidades_id_modalidade: modalityId,
        equipes: [
            { id_equipe: 11, nome_equipe: 'Equipe A', nome_fantasia: 'Turma A', gols: 2 },
            { id_equipe: 12, nome_equipe: 'Equipe B', nome_fantasia: 'Turma B', gols: 1 },
        ],
    };
    const stores = {
        jogos: [{ id_jogo: 81, nome_jogo: tag, status_jogo: 'Concluido', modalidades_id_modalidade: modalityId }],
        partidas: [
            { id_partida: 811, jogos_id_jogo: 81, equipes_id_equipe: 11, resultado_partida: 2 },
            { id_partida: 812, jogos_id_jogo: 81, equipes_id_equipe: 12, resultado_partida: 1 },
        ],
        locais: [],
        cronograma: [],
    };
    const window = {
        location: { href: 'http://sgi.test/' },
        SGIDataLayer: { read: async (store) => stores[store] || [] },
        SGIOffline: { getPendingList: async () => [] },
        SGI_SESSION_INTERCLASSE_ATIVO: 9,
        addEventListener: () => {},
    };
    const context = {
        window,
        document: { getElementsByTagName: () => [] },
        navigator: { onLine: true },
        URL,
        fetch: async (url) => url.includes('chaveamentos')
            ? { json: async () => ({ success: true, jogos: [remoteGame] }) }
            : { ok: true, json: async () => [] },
        indexedDB: null,
        console,
    };
    vm.runInNewContext(source, context);

    const result = await window.SGIChaveamento.carregarArvore(modalityId);
    const game = result.jogos.find((item) => item.nome_jogo === tag);

    assert.equal(
        JSON.stringify(Array.from(game.equipes, (team) => [team.nome_equipe, team.nome_fantasia])),
        JSON.stringify([['Equipe A', 'Turma A'], ['Equipe B', 'Turma B']]),
    );
});

test('motor offline libera o status da fase futura planejada quando define os dois finalistas', async () => {
    const source = fs.readFileSync('resources/js/offline/chaveamento-engine.js', 'utf8');
    const modalityId = 71;
    const classId = 9;
    const interclasseId = 8;
    const semifinals = [
        { id_jogo: 81, slot: 0, winner: 11, loser: 12, goals: [2, 0] },
        { id_jogo: 82, slot: 1, winner: 13, loser: 14, goals: [1, 0] },
    ];
    const finalTag = `PL:${modalityId}:${classId}:MM:2:0:N`;
    const semiRows = semifinals.map(({ id_jogo, slot }) => ({
        id_jogo,
        nome_jogo: `PL:${modalityId}:${classId}:MM:4:${slot}:N`,
        status_jogo: 'Concluido',
        modalidades_id_modalidade: modalityId,
        id_interclasse: interclasseId,
    }));
    const games = [
        ...semiRows,
        {
            id_jogo: -16,
            nome_jogo: finalTag,
            status_jogo: 'Aguardando',
            virtual_planejado: true,
            modalidades_id_modalidade: modalityId,
            id_interclasse: interclasseId,
            data_jogo: '2030-10-03',
            inicio_jogo: '10:20:00',
            termino_jogo: '10:40:00',
            locais_id_local: 5,
            equipes: [],
        },
    ];
    const matches = semifinals.flatMap(({ id_jogo, winner, loser, goals }) => [
        { id_partida: `${id_jogo}-a`, jogos_id_jogo: id_jogo, equipes_id_equipe: winner, resultado_partida: goals[0] },
        { id_partida: `${id_jogo}-b`, jogos_id_jogo: id_jogo, equipes_id_equipe: loser, resultado_partida: goals[1] },
    ]);
    const teams = [11, 12, 13, 14].map((id_equipe) => ({ id_equipe, nome_equipe: `Equipe ${id_equipe}` }));
    const plannedSnapshot = JSON.parse(JSON.stringify(games));
    const cronograma = {
        cronograma_status: 'publicado',
        versao_publicada: 4,
        compromissos: [{
            id_compromisso: 402,
            id_modalidade: modalityId,
            chave_tag: finalTag,
            data_compromisso: '2030-10-03',
            inicio_compromisso: '10:20:00',
            termino_compromisso: '10:40:00',
            id_local: 5,
        }],
    };
    const stores = { jogos: games, partidas: matches, equipes: teams, turmas: [], modalidades: [], locais: [], cronograma };
    const window = {
        location: { href: 'http://sgi.test/' },
        SGI_SESSION_INTERCLASSE_ATIVO: interclasseId,
        SGIDataLayer: {
            read: async (store) => stores[store] || [],
            upsert: async (store, id, value) => {
                const rows = stores[store] || (stores[store] = []);
                const index = rows.findIndex((row) => String(store === 'partidas' ? row.id_partida : row.id_jogo) === String(id));
                if (index >= 0) rows[index] = value;
                else rows.push(value);
            },
        },
        SGIOffline: { getPendingList: async () => [] },
        addEventListener: () => {},
    };
    const context = {
        window,
        document: { getElementsByTagName: () => [] },
        navigator: { onLine: false },
        URL,
        fetch: async (url) => url.includes('chaveamentos')
            ? { json: async () => ({ success: true, jogos: plannedSnapshot }) }
            : { ok: true, json: async () => [] },
        indexedDB: null,
        console,
    };
    vm.runInNewContext(source, context);

    const result = await window.SGIChaveamento.promoverVencedorLocal(82);
    const final = games.find((game) => game.nome_jogo === finalTag);

    assert.equal(result.promoveu, true);
    assert.ok(final, 'a final planejada deve ser persistida na projeção offline');
    assert.equal(final.status_jogo, 'Agendado');
    assert.deepEqual(Array.from(final.equipes, (team) => Number(team.id_equipe)).sort((a, b) => a - b), [11, 13]);
    assert.equal(final.data_jogo, '2030-10-03');
    assert.equal(final.inicio_jogo, '10:20:00');
    assert.equal(Number(final.locais_id_local), 5);
});
