const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('resources/js/offline/mesario-data.js', 'utf8');

test('rotas v1 preservam cadastros e projetam o encerramento com placar offline', async () => {
    const layer = await carregarDataLayer();
    for (const [recurso, campo] of [['turmas', 'id_turma'], ['modalidades', 'id_modalidade'], ['categorias', 'id_categoria'], ['locais', 'id_local'], ['equipes', 'id_equipe']]) {
        await layer.capture(`https://sgi.test/api/v1/${recurso}`, JSON.stringify([{ [campo]: 42, nome: recurso }]));
        const resposta = await layer.localGet(`https://sgi.test/api/v1/${recurso}`);
        assert.ok(resposta, recurso);
        assert.equal((await resposta.json())[0][campo], 42);
    }
    await layer.upsert('jogos', 7, { id_jogo: 7, status_jogo: 'Iniciado' });
    await layer.onQueued({ id: 1, method: 'POST', url: 'https://sgi.test/api/v1/resultados', body: JSON.stringify({
        id_jogo: 7, resultados: [{ id_equipe: 1, gols: 2 }, { id_equipe: 2, gols: 1 }],
    }) });
    assert.equal((await layer.read('jogos'))[0].status_jogo, 'Concluido');
    assert.deepEqual(Array.from(await layer.read('partidas'), p => p.resultado_partida), [2, 1]);
});

test('estado do cronograma offline conserva a revisão e sinaliza obsolescência ao reconectar', async () => {
    const layer = await carregarDataLayer();
    const url = 'https://sgi.test/api/v1/cronograma?id_interclasse=17';
    await layer.capture(url, JSON.stringify({ success: true, id_interclasse: 17, cronograma_versao: 4, versao_publicada: 4, operacao_liberada: 1 }));
    await layer.capture(url, JSON.stringify({ success: true, id_interclasse: 17, cronograma_versao: 5, versao_publicada: 5, operacao_liberada: 0 }));
    assert.equal((await layer.read('cronograma'))[0].cronograma_versao, 5);
    assert.equal(layer.__eventos.length, 1);
    assert.equal(layer.__eventos[0].detail.anterior, 4);
    assert.equal(layer.__eventos[0].detail.atual, 5);
    assert.equal(layer.__eventos[0].detail.id_interclasse, '17');
});

test('ponto offline incrementa a partida e a anulação preserva o histórico do atleta', async () => {
    const layer = await carregarDataLayer();
    await layer.capture('https://sgi.test/api/v1/pontos?acao=atletas&id_jogo=7&id_equipe=1', JSON.stringify({
        success: true,
        atletas: [{ id_usuario: 42, nome_usuario: 'Atleta offline', equipes_id_equipe: 1, id_turma: 3 }],
    }));
    await layer.upsert('partidas', 101, {
        id_partida: 101,
        jogos_id_jogo: 7,
        equipes_id_equipe: 1,
        resultado_partida: 0,
    });
    await layer.onQueued({
        id: 201,
        method: 'POST',
        url: 'https://sgi.test/api/v1/pontos',
        body: JSON.stringify({
            jogos_id_jogo: 7,
            id_partida: 101,
            equipes_id_equipe: 1,
            usuarios_id_usuario: 42,
            chave_jogada: 'offline-point-201',
        }),
    });
    let ponto = (await layer.read('pontos')).find((row) => row.id_ponto === 'temp_201');
    let partida = (await layer.read('partidas')).find((row) => row.id_partida === 101);
    assert.equal(ponto.status_artilheiro, 'ativo');
    assert.equal(ponto.usuarios_id_usuario, 42);
    assert.equal(partida.resultado_partida, 1);

    let artilharia = await (await layer.localGet('https://sgi.test/api/v1/artilheiros?id_jogo=7')).json();
    assert.equal(artilharia.length, 1);
    assert.equal(artilharia[0].id_usuario, 42);
    assert.equal(artilharia[0].nome_usuario, 'Atleta offline');
    assert.equal(artilharia[0].total_gols, 1);
    assert.equal(artilharia[0].total_acoes, 1);
    assert.equal(artilharia[0].total_anulados, 0);

    await layer.onQueued({
        id: 202,
        method: 'PUT',
        url: 'https://sgi.test/api/v1/pontos',
        body: JSON.stringify({ id_ponto: 'temp_201' }),
    });
    ponto = (await layer.read('pontos')).find((row) => row.id_ponto === 'temp_201');
    partida = (await layer.read('partidas')).find((row) => row.id_partida === 101);
    assert.equal(ponto.status_artilheiro, 'anulado');
    assert.equal(ponto.conta_no_placar, 0);
    assert.equal(partida.resultado_partida, 0);

    artilharia = await (await layer.localGet('https://sgi.test/api/v1/artilheiros?id_jogo=7')).json();
    assert.equal(artilharia.length, 1);
    assert.equal(artilharia[0].total_gols, 0);
    assert.equal(artilharia[0].total_acoes, 1);
    assert.equal(artilharia[0].total_anulados, 1);
});

test('cache offline mantém o mesmo atleta disponível em equipes diferentes', async () => {
    const layer = await carregarDataLayer();
    const equipe1 = 'https://sgi.test/api/v1/pontos?acao=atletas&id_jogo=7&id_equipe=1';
    const equipe2 = 'https://sgi.test/api/v1/pontos?acao=atletas&id_jogo=7&id_equipe=2';
    const atleta = { id_usuario: 42, nome_usuario: 'Atleta compartilhado' };

    await layer.capture(equipe1, JSON.stringify({
        success: true,
        atletas: [{ ...atleta, equipes_id_equipe: 1 }],
    }));
    await layer.capture(equipe2, JSON.stringify({
        success: true,
        atletas: [{ ...atleta, equipes_id_equipe: 2 }],
    }));

    assert.deepEqual((await (await layer.localGet(equipe1)).json()).atletas.map((row) => row.equipes_id_equipe), [1]);
    assert.deepEqual((await (await layer.localGet(equipe2)).json()).atletas.map((row) => row.equipes_id_equipe), [2]);
});

function criarIndexedDbFake() {
    const stores = new Map();
    const nomes = { contains: (nome) => stores.has(nome) };
    const banco = {
        objectStoreNames: nomes,
        createObjectStore(nome) {
            stores.set(nome, new Map());
            return {};
        },
        transaction(nome) {
            const dados = stores.get(nome);
            const tx = { oncomplete: null, onerror: null };
            const concluir = () => setTimeout(() => tx.oncomplete && tx.oncomplete(), 0);
            tx.objectStore = function () {
                    return {
                        put(valor) {
                            const request = {};
                            dados.set(valor.key, valor);
                            setTimeout(() => {
                                request.result = valor;
                                if (request.onsuccess) request.onsuccess();
                                concluir();
                            }, 0);
                            return request;
                        },
                        get(chave) {
                            const request = {};
                            setTimeout(() => {
                                request.result = dados.get(chave);
                                if (request.onsuccess) request.onsuccess();
                            }, 0);
                            return request;
                        },
                        getAll() {
                            const request = {};
                            setTimeout(() => {
                                request.result = [...dados.values()];
                                if (request.onsuccess) request.onsuccess();
                            }, 0);
                            return request;
                        },
                        delete(chave) {
                            const request = {};
                            dados.delete(chave);
                            setTimeout(() => {
                                if (request.onsuccess) request.onsuccess();
                                concluir();
                            }, 0);
                            return request;
                        },
                    };
                };
            return tx;
        },
    };
    return {
        open() {
            const request = {};
            setTimeout(() => {
                request.result = banco;
                if (request.onupgradeneeded) request.onupgradeneeded({ target: { result: banco } });
                if (request.onsuccess) request.onsuccess();
            }, 0);
            return request;
        },
    };
}

async function carregarDataLayer() {
    const eventos = [];
    const window = { SGI_CACHE_KEY: 't11-test', dispatchEvent: (event) => eventos.push(event) };
    const context = {
        window,
        CustomEvent: class CustomEvent { constructor(type, init) { this.type = type; this.detail = init.detail; } },
        indexedDB: criarIndexedDbFake(),
        URL,
        Response,
        location: { href: 'https://sgi.test/painel' },
        navigator: { onLine: true },
        fetch: () => Promise.reject(new Error('não usado neste teste')),
        Promise,
        setTimeout,
        clearTimeout,
        console,
    };
    vm.runInNewContext(source, context);
    await window.SGIDataLayer.upsert('ocorrencias', 10, {
        id_ocorrencia: 10,
        descricao_ocorrencia: '[JOGO:7][TURMA:3]Primeira',
        id_jogo: 7,
    });
    await window.SGIDataLayer.upsert('ocorrencias', 11, {
        id_ocorrencia: 11,
        descricao_ocorrencia: '[JOGO:7][TURMA:3]Segunda',
        id_jogo: 7,
        status_ocorrencia: '1',
    });
    await window.SGIDataLayer.upsert('ocorrencias', 12, {
        id_ocorrencia: 12,
        descricao_ocorrencia: '[JOGO:7][TURMA:3]Inativa',
        id_jogo: 7,
        status_ocorrencia: '0',
    });
    await window.SGIDataLayer.upsert('ocorrencias_turmas', 21, {
        id_ocorrencia_turma: 21,
        turmas_id_turma: 3,
        descricao_ocorrencia_turma: 'Turma certa',
    });
    window.SGIDataLayer.__eventos = eventos;
    return window.SGIDataLayer;
}

test('consulta de ocorrência versionada filtra por ID e não transforma ausência em lista inteira', async () => {
    const layer = await carregarDataLayer();
    const exata = await layer.localGet('https://sgi.test/api/v1/ocorrencias?id_ocorrencia=11');
    assert.deepEqual(await exata.json(), [{
        id_ocorrencia: 11,
        descricao_ocorrencia: '[JOGO:7][TURMA:3]Segunda',
        id_jogo: 7,
        status_ocorrencia: '1',
    }]);
    const ausente = await layer.localGet('https://sgi.test/api/v1/ocorrencias?id_ocorrencia=999');
    assert.deepEqual(await ausente.json(), []);
    const ativas = await layer.localGet('https://sgi.test/api/v1/ocorrencias?status_ocorrencia=1');
    assert.deepEqual((await ativas.json()).map((row) => row.id_ocorrencia), [11]);
    const turma = await layer.localGet('https://sgi.test/api/v1/ocorrencias-turmas?id_ocorrencia_turma=21');
    assert.deepEqual((await turma.json()).map((row) => row.id_ocorrencia_turma), [21]);
});

test('projeção PUT preserva referências e POST temporário preserva os aliases de turma e jogo', async () => {
    const layer = await carregarDataLayer();
    await layer.onQueued({
        id: 12,
        method: 'PUT',
        url: 'https://sgi.test/api/v1/ocorrencias',
        body: JSON.stringify({ id_ocorrencia: 11, descricao_ocorrencia: 'Segunda editada' }),
    });
    const editada = (await layer.read('ocorrencias')).find((row) => row.id_ocorrencia === 11);
    assert.equal(editada.descricao_ocorrencia, '[JOGO:7][TURMA:3]Segunda editada');
    assert.equal(editada._pendente, true);

    await layer.onQueued({
        id: 14,
        method: 'PUT',
        url: 'https://sgi.test/api/v1/ocorrencias',
        body: JSON.stringify({
            id_ocorrencia: 11,
            descricao_ocorrencia: '[JOGO:99][TURMA:88]Tentativa de trocar referências',
        }),
    });
    const referenciasPreservadas = (await layer.read('ocorrencias')).find((row) => row.id_ocorrencia === 11);
    assert.equal(referenciasPreservadas.descricao_ocorrencia, '[JOGO:7][TURMA:3]Tentativa de trocar referências');

    await layer.upsert('ocorrencias', 13, {
        id_ocorrencia: 13,
        descricao_ocorrencia: '[JOGO:-5][TURMA:3]Referência temporária antiga',
        id_jogo: -5,
    });
    await layer.onQueued({
        id: 15,
        method: 'PUT',
        url: 'https://sgi.test/api/v1/ocorrencias',
        body: JSON.stringify({ id_ocorrencia: 13, descricao_ocorrencia: 'Referência temporária editada' }),
    });
    const temporariaEditada = (await layer.read('ocorrencias')).find((row) => row.id_ocorrencia === 13);
    assert.equal(temporariaEditada.descricao_ocorrencia, '[JOGO:-5][TURMA:3]Referência temporária editada');

    await layer.onQueued({
        id: 13,
        method: 'POST',
        url: 'https://sgi.test/api/v1/ocorrencias',
        body: JSON.stringify({ id_jogo: -5, id_turma: 3, usuarios_id_usuario: 20, descricao_ocorrencia: 'Temporária' }),
    });
    const temporaria = (await layer.read('ocorrencias')).find((row) => row.id_ocorrencia === 'temp_13');
    assert.equal(temporaria.turmas_id_turma, 3);
    assert.equal(temporaria.jogos_id_jogo, -5);
    assert.equal(temporaria.id_usuario, 20);
});

test('projeção individual mantém participantes e pódio pendente na leitura offline', async () => {
    const layer = await carregarDataLayer();
    const participantsUrl = 'https://sgi.test/api/v1/chaveamentos?tipo_modalidade=individual&acao=participantes&id_modalidade=9';
    const rankingUrl = 'https://sgi.test/api/v1/chaveamentos?tipo_modalidade=individual&acao=ranking&id_modalidade=9';
    await layer.capture(participantsUrl, JSON.stringify({
        success: true,
        participantes: [
            { id_usuario: 11, nome_usuario: 'A', nome_turma: '3A' },
            { id_usuario: 12, nome_usuario: 'B', nome_turma: '3A' },
            { id_usuario: 13, nome_usuario: 'C', nome_turma: '3A' },
        ],
    }));
    await layer.onQueued({
        id: 90,
        method: 'POST',
        url: 'https://sgi.test/api/v1/chaveamentos',
        body: JSON.stringify({
            tipo_modalidade: 'individual',
            id_modalidade: 9,
            ranking: { primeiro: 11, segundo: 12, terceiro: 13 },
        }),
    });

    const resposta = await layer.localGet(rankingUrl);
    const dados = await resposta.json();
    assert.equal(dados.queued, true);
    assert.deepEqual(dados.ranking.map((row) => [row.posicao, row.id_usuario, row.nome_turma]), [
        [1, 11, '3A'], [2, 12, '3A'], [3, 13, '3A'],
    ]);

    await layer.onSynced({
        id: 90,
        method: 'POST',
        url: 'https://sgi.test/api/v1/chaveamentos',
        body: JSON.stringify({ tipo_modalidade: 'individual', id_modalidade: 9, ranking: { primeiro: 11, segundo: 12, terceiro: 13 } }),
    }, JSON.stringify({ success: true }));
    const confirmado = await (await layer.localGet(rankingUrl)).json();
    assert.deepEqual(confirmado.ranking.map((row) => row.id_usuario), [11, 12, 13]);
});

test('confirmação offline de A não confirma a retificação B da mesma prova', async () => {
    const layer = await carregarDataLayer();
    const rankingUrl = 'https://sgi.test/api/v1/chaveamentos?tipo_modalidade=individual&acao=ranking&id_modalidade=9';
    const base = {
        tipo_modalidade: 'individual',
        id_modalidade: 9,
        id_jogo: 44,
    };
    const a = { id: 101, method: 'POST', url: 'https://sgi.test/api/v1/chaveamentos', body: JSON.stringify({ ...base, ranking: { primeiro: 11, segundo: 12, terceiro: 13 } }) };
    const b = { id: 102, method: 'POST', url: 'https://sgi.test/api/v1/chaveamentos', body: JSON.stringify({ ...base, ranking: { primeiro: 12, segundo: 13, terceiro: 11 } }) };
    await layer.onQueued(a);
    await layer.onQueued(b);
    let dados = await (await layer.localGet(rankingUrl)).json();
    assert.equal(dados.queued, true);
    assert.deepEqual(dados.ranking.map((row) => row.id_usuario), [12, 13, 11]);

    await layer.onSynced(a, JSON.stringify({ success: true }));
    dados = await (await layer.localGet(rankingUrl)).json();
    assert.equal(dados.queued, true);
    assert.deepEqual(dados.ranking.map((row) => row.id_usuario), [12, 13, 11]);
});

test('capture com acao=listar_atletas armazena em atletas e não polui ocorrencias', async () => {
    const layer = await carregarDataLayer();
    const ocorrenciasAntes = await layer.read('ocorrencias');
    await layer.capture('https://sgi.test/api/v1/ocorrencias?acao=listar_atletas&id_jogo=7&id_turma=3', JSON.stringify({
        success: true,
        atletas: [
            { id_usuario: 51, nome_usuario: 'Aluno Um', id_turma: 3 },
            { id_usuario: 52, nome_usuario: 'Aluno Dois', id_turma: 3 },
        ],
    }));
    const ocorrenciasDepois = await layer.read('ocorrencias');
    assert.equal(ocorrenciasDepois.length, ocorrenciasAntes.length, 'store ocorrencias não deve receber atletas');

    const atletas = await layer.read('atletas');
    const cadastrados = atletas.filter((a) => Number(a.id_turma) === 3);
    assert.deepEqual(cadastrados.map((a) => a.id_usuario).sort(), [51, 52]);
});

test('localGet para acao=listar_atletas preserva atletas com ocorrencias pendentes e filtra vermelhos e suspensões', async () => {
    const layer = await carregarDataLayer();
    await layer.capture('https://sgi.test/api/v1/ocorrencias?acao=listar_atletas&id_jogo=7&id_turma=3', JSON.stringify({
        success: true,
        atletas: [
            { id_usuario: 51, nome_usuario: 'Aluno Amarelo', id_turma: 3 },
            { id_usuario: 52, nome_usuario: 'Aluno Vermelho', id_turma: 3 },
            { id_usuario: 53, nome_usuario: 'Aluno Limpo', id_turma: 3 },
            { id_usuario: 54, nome_usuario: 'Aluno Suspenso', id_turma: 3 },
        ],
    }));

    // Registra primeira ocorrência (Amarelo para Aluno 51)
    await layer.onQueued({
        id: 301,
        method: 'POST',
        url: 'https://sgi.test/api/v1/ocorrencias',
        body: JSON.stringify({
            id_jogo: 7,
            id_turma: 3,
            usuarios_id_usuario: 51,
            titulo_ocorrencia: 'Amarelo',
            descricao_ocorrencia: 'Cartão amarelo no jogo',
        }),
    });

    // Registra segunda ocorrência (Vermelho para Aluno 52 no jogo 7)
    await layer.onQueued({
        id: 302,
        method: 'POST',
        url: 'https://sgi.test/api/v1/ocorrencias',
        body: JSON.stringify({
            id_jogo: 7,
            id_turma: 3,
            usuarios_id_usuario: 52,
            titulo_ocorrencia: 'Vermelho',
            descricao_ocorrencia: '[JOGO:7] Expulsão direta',
        }),
    });

    // Registra suspensão para Aluno 54
    await layer.onQueued({
        id: 303,
        method: 'POST',
        url: 'https://sgi.test/api/v1/ocorrencias',
        body: JSON.stringify({
            id_jogo: 7,
            id_turma: 3,
            usuarios_id_usuario: 54,
            titulo_ocorrencia: 'Suspensao',
            descricao_ocorrencia: 'Suspenso pela comissão',
        }),
    });

    // Consulta de listar_atletas para a 2ª/3ª/4ª ocorrência
    const resp = await layer.localGet('https://sgi.test/api/v1/ocorrencias?acao=listar_atletas&id_jogo=7&id_turma=3');
    assert.ok(resp, 'resposta deve existir');
    const data = await resp.json();
    assert.equal(data.success, true);
    assert.ok(Array.isArray(data.atletas), 'atletas deve ser um array');

    // Aluno Amarelo (51) e Aluno Limpo (53) devem permanecer disponíveis
    // Aluno Vermelho (52) e Aluno Suspenso (54) devem ser filtrados
    const idsDisponiveis = data.atletas.map((a) => a.id_usuario);
    assert.ok(idsDisponiveis.includes(51), 'aluno com cartão amarelo deve continuar disponível para múltiplas ocorrências');
    assert.ok(idsDisponiveis.includes(53), 'aluno sem ocorrência deve continuar disponível');
    assert.ok(!idsDisponiveis.includes(52), 'aluno com cartão vermelho no mesmo jogo deve ser excluído');
    assert.ok(!idsDisponiveis.includes(54), 'aluno suspenso deve ser excluído');
});
