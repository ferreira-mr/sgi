const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('promoção offline preserva os nomes online da Categoria 1', async () => {
    const source = fs.readFileSync('resources/js/offline/chaveamento-engine.js', 'utf8');
    const stores = {
        jogos: [
            { id_jogo: 101, nome_jogo: 'MM:4:0:N', modalidades_id_modalidade: 9, id_interclasse: 1, status_jogo: 'Concluido' },
            { id_jogo: 102, nome_jogo: 'MM:4:1:N', modalidades_id_modalidade: 9, id_interclasse: 1, status_jogo: 'Concluido' },
        ],
        partidas: [
            { id_partida: 1, jogos_id_jogo: 101, equipes_id_equipe: 11, resultado_partida: 2 },
            { id_partida: 2, jogos_id_jogo: 101, equipes_id_equipe: 12, resultado_partida: 0 },
            { id_partida: 3, jogos_id_jogo: 102, equipes_id_equipe: 13, resultado_partida: 3 },
            { id_partida: 4, jogos_id_jogo: 102, equipes_id_equipe: 14, resultado_partida: 1 },
        ],
        equipes: [
            { id_equipe: 11, turmas_id_turma: 21, nome_equipe: 'Vôlei A' },
            { id_equipe: 12, turmas_id_turma: 22, nome_equipe: 'Vôlei B' },
            { id_equipe: 13, turmas_id_turma: 23, nome_equipe: 'Vôlei C' },
            { id_equipe: 14, turmas_id_turma: 24, nome_equipe: 'Vôlei D' },
        ],
        turmas: [
            { id_turma: 21, nome_turma: '3º Ano A' },
            { id_turma: 22, nome_turma: '3º Ano B' },
            { id_turma: 23, nome_turma: '1º Ano A' },
            { id_turma: 24, nome_turma: '1º Ano B' },
        ],
        modalidades: [{ id_modalidade: 9, interclasses_id_interclasse: 1, nome_modalidade: 'Vôlei' }],
        locais: [],
    };
    const snapshot = {
        success: true,
        jogos: [
            {
                ...stores.jogos[0],
                categorias_id_categoria: 1,
                equipes: [
                    { id_equipe: 11, nome_equipe: 'Nome online A' },
                    { id_equipe: 12, nome_equipe: 'Nome online B' },
                ],
            },
            {
                ...stores.jogos[1],
                categorias_id_categoria: 1,
                equipes: [
                    { id_equipe: 13, nome_equipe: 'Nome online C' },
                    { id_equipe: 14, nome_equipe: 'Nome online D' },
                ],
            },
            { id_jogo: 201, nome_jogo: 'MM:2:0:N', modalidades_id_modalidade: 9, id_interclasse: 1, status_jogo: 'Agendado', equipes: [] },
        ],
    };
    const dataLayer = {
        read: async (store) => stores[store] || [],
        upsert: async (store, id, row) => {
            const key = store === 'partidas' ? 'id_partida' : 'id_jogo';
            const rows = stores[store];
            const index = rows.findIndex((item) => String(item[key]) === String(id));
            if (index >= 0) rows[index] = row;
            else rows.push(row);
        },
    };
    const window = {
        location: { href: 'https://sgi.test/chaveamento?id=1' },
        SGIDataLayer: dataLayer,
        SGIOffline: {
            getCached: async () => ({ text: JSON.stringify(snapshot) }),
            getPendingList: async () => [],
        },
        addEventListener: () => {},
    };
    const document = { getElementsByTagName: () => [] };

    vm.runInNewContext(source, {
        window,
        document,
        URL,
        fetch: async () => ({ ok: false, json: async () => ({}) }),
        navigator: { onLine: false },
        Promise,
        JSON,
        Number,
        String,
        Object,
        Array,
        Math,
        console,
    });

    const result = await window.SGIChaveamento.promoverVencedorLocal(101);
    const final = stores.jogos.find((jogo) => jogo.id_jogo === 201);
    const finalPartidas = stores.partidas.filter((partida) => partida.jogos_id_jogo === 201);

    assert.equal(result.promoveu, true);
    assert.equal(final._offline_liberado, true);
    assert.equal(final.exige_horario_agendado, false);
    assert.deepEqual(final.equipes_nomes.split(' vs ').sort(), ['Nome online A', 'Nome online C']);
    assert.deepEqual(finalPartidas.map((partida) => partida.nome_equipe).sort(), ['Nome online A', 'Nome online C']);
});
