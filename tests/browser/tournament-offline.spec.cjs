const { test, expect, request: playwrightRequest } = require('./fixtures.cjs');
const { agendarBloco } = require('./agenda-helper.cjs');

async function jsonOrThrow(response, label) {
    if (!response.ok()) {
        throw new Error(`${label}: HTTP ${response.status()} ${await response.text()}`);
    }
    return response.json();
}

async function capturarTela(page, testInfo, nome) {
    const caminho = testInfo.outputPath(`${nome}.png`);
    await page.screenshot({ path: caminho, fullPage: true });
    await testInfo.attach(`${nome}.png`, { path: caminho, contentType: 'image/png' });
}

function nomeEquipeExibida(partida) {
    return [partida && partida.nome_equipe, partida && partida.nome_fantasia_turma,
        partida && partida.nome_fantasia, partida && partida.nome_turma]
        .map((valor) => String(valor || '').trim())
        .find(Boolean) || '';
}

function nomeEquipeAgenda(partida) {
    return [partida && partida.nome_equipe, partida && partida.nome_fantasia,
        partida && partida.nome_fantasia_turma, partida && partida.nome_turma]
        .map((valor) => String(valor || '').trim())
        .find(Boolean) || '';
}

async function validarDadosJogoOffline(page, esperado, opcoes = {}) {
    const jogo = esperado && esperado.jogo ? esperado.jogo : {};
    const partidasEsperadas = (esperado && Array.isArray(esperado.partidas)) ? esperado.partidas : [];
    const titulo = (await page.locator('#placar-titulo-jogo').innerText()).trim();
    const meta = (await page.locator('#placar-meta').innerText()).trim();
    const nomes = (await page.locator('.mc-team-name').allTextContents()).map((nome) => nome.trim()).filter(Boolean);

    expect(titulo).not.toBe('');
    expect(titulo).not.toBe('Placar');
    expect(meta).not.toBe('');
    if (jogo.nome_modalidade) expect(meta).toContain(String(jogo.nome_modalidade));
    if (jogo.nome_local) expect(meta).toContain(String(jogo.nome_local));
    if (jogo.data_jogo) expect(meta).toContain(String(jogo.data_jogo));
    if (jogo.inicio_jogo) expect(meta).toContain(String(jogo.inicio_jogo).slice(0, 5));

    expect(nomes).toHaveLength(2);
    const esperados = partidasEsperadas.map(nomeEquipeExibida).filter(Boolean);
    expect(esperados).toHaveLength(2);
    for (const nome of esperados) expect(nomes).toContain(nome);

    if (opcoes.placarInicial !== false) {
        const placares = (await page.locator('.score-number').allTextContents()).map((valor) => valor.trim());
        expect(placares).toEqual(['0', '0']);
    }
}

async function criarChaveFixture(request) {
    await jsonOrThrow(await request.post('api/v1/login', {
        data: { matricula: 'admin', senha: '123' }
    }), 'login administrativo do fixture');

    // Uma edição nova mantém o cenário isolado dos jogos existentes. O teste
    // completa a modalidade até oito equipes para exercitar quatro quartas,
    // duas semifinais e a final (sete jogos operados).
    const nomeEdicao = `E2E Torneio Offline ${Date.now()}`;
    const edicao = await jsonOrThrow(await request.post('api/v1/edicoes', {
        data: { nome_interclasse: nomeEdicao, ano_interclasse: new Date().toISOString().slice(0, 10) }
    }), 'criação da edição fixture');
    const idInterclasse = Number(edicao.id);
    if (!idInterclasse) throw new Error(`Edição fixture sem ID: ${JSON.stringify(edicao)}`);

    const modalidades = await jsonOrThrow(
        await request.get(`api/v1/modalidades?id_interclasse=${idInterclasse}`),
        'modalidades do fixture'
    );

    let modalidade = null;
    let equipes = [];
    for (const item of modalidades) {
        if (!String(item.nome_tipo_modalidade || '').toLowerCase().includes('mata')) continue;
        const lista = await jsonOrThrow(
            await request.get(`api/v1/equipes?id_modalidade=${Number(item.id_modalidade)}`),
            `equipes da modalidade ${item.id_modalidade}`
        );
        if (lista.length >= 4) {
            modalidade = item;
            equipes = lista.slice(0, 4);
            break;
        }
    }
    if (!modalidade || equipes.length < 4) {
        throw new Error('O fixture precisa de uma modalidade mata-mata com quatro equipes.');
    }

    const equipesBase = equipes.slice();
    while (equipes.length < 8) {
        const origem = equipesBase[(equipes.length - equipesBase.length) % equipesBase.length];
        const criada = await jsonOrThrow(await request.post('api/v1/equipes', {
            data: {
                acao: 'criar_equipe',
                modalidades_id_modalidade: Number(modalidade.id_modalidade),
                turmas_id_turma: Number(origem.turmas_id_turma),
                nome_equipe: `Equipe E2E ${equipes.length + 1} ${Date.now()}`,
                status_equipe: '1'
            }
        }), `criação da equipe ${equipes.length + 1}`);
        if (!criada.success || !Number(criada.id_equipe)) {
            throw new Error(`Equipe adicional não foi criada: ${JSON.stringify(criada)}`);
        }
        equipes.push({
            ...origem,
            id_equipe: Number(criada.id_equipe),
            nome_equipe: criada.nome_equipe
        });
    }
    equipes = equipes.slice(0, 8);
    await garantirAtletas(request, idInterclasse, Number(modalidade.id_modalidade), equipes);

    const jogos = [
        { tag: 'MM:8:0:N', a: equipes[0], b: equipes[1] },
        { tag: 'MM:8:1:N', a: equipes[2], b: equipes[3] },
        { tag: 'MM:8:2:N', a: equipes[4], b: equipes[5] },
        { tag: 'MM:8:3:N', a: equipes[6], b: equipes[7] }
    ];
    // Esta rota grava os jogos e suas partidas na mesma transação, exatamente
    // como o gerador de chaveamento da aplicação.
    await jsonOrThrow(await request.post('api/v1/sincronizacao/chaveamento', {
        data: {
            id_modalidade: Number(modalidade.id_modalidade),
            tipo_modalidade: 'mata_mata',
            jogos: jogos.map((jogo) => ({
                nome_jogo: jogo.tag,
                status_jogo: 'Agendado',
                partidas: [
                    { id_equipe: Number(jogo.a.id_equipe), resultado: 0 },
                    { id_equipe: Number(jogo.b.id_equipe), resultado: 0 }
                ]
            }))
        }
    }), 'criação do chaveamento fixture');

    let listaJogos = await jsonOrThrow(
        await request.get(`api/v1/jogos?id_modalidade=${Number(modalidade.id_modalidade)}`),
        'consulta dos jogos do fixture'
    );
    await agendarBloco(request, {
        idInterclasse,
        idModalidade: Number(modalidade.id_modalidade),
        jogos: listaJogos.filter((item) => String(item.nome_jogo).startsWith('MM:8:')),
        chaveTags: ['MM:4:0:N', 'MM:4:1:N', 'MM:2:0:N'],
        label: 'E2E-torneio-offline',
    });
    listaJogos = await jsonOrThrow(
        await request.get(`api/v1/jogos?id_modalidade=${Number(modalidade.id_modalidade)}`),
        'consulta dos jogos agendados do fixture'
    );
    const ids = {};
    const detalhes = {};
    for (const jogo of jogos) {
        const encontrado = listaJogos.find((item) => String(item.nome_jogo) === jogo.tag);
        const idJogo = Number(encontrado && encontrado.id_jogo);
        if (!idJogo) throw new Error(`A API não retornou o ID de ${jogo.tag}: ${JSON.stringify(encontrado)}`);
        ids[jogo.tag] = idJogo;
        const partidas = await jsonOrThrow(
            await request.get(`api/v1/partidas?id_jogo=${idJogo}`),
            `partidas da fixture ${jogo.tag}`
        );
        detalhes[jogo.tag] = {
            jogo: encontrado,
            partidas: partidas.map((partida) => {
                const equipe = equipes.find((item) =>
                    Number(item.id_equipe) === Number(partida.equipes_id_equipe)
                );
                return { ...partida, nome_equipe: partida.nome_equipe || equipe?.nome_equipe || '' };
            })
        };
    }

    return {
        idInterclasse,
        idModalidade: Number(modalidade.id_modalidade),
        equipes,
        ids,
        detalhes
    };
}

async function garantirAtletas(request, idInterclasse, idModalidade, equipes) {
    // L04 permits one team per student in a modality. The edition's original
    // teams can already contain students, so reserve those IDs before filling
    // the synthetic teams below; choosing the first active student repeatedly
    // made this fixture depend on INSERT IGNORE accepting invalid rosters.
    const equipesDaModalidade = await jsonOrThrow(
        await request.get(`api/v1/equipes?id_modalidade=${idModalidade}`),
        `equipes existentes da modalidade ${idModalidade}`,
    );
    const membrosPorEquipe = new Map();
    const usuariosVinculados = new Set();
    for (const item of equipesDaModalidade) {
        const membros = await jsonOrThrow(
            await request.get(`api/v1/equipes?id_equipe=${Number(item.id_equipe)}`),
            `membros da equipe ${item.id_equipe}`,
        );
        membrosPorEquipe.set(Number(item.id_equipe), membros);
        for (const membro of membros) {
            const idUsuario = Number(membro.id_usuario);
            if (idUsuario > 0) usuariosVinculados.add(idUsuario);
        }
    }

    for (let index = 0; index < equipes.length; index += 1) {
        const equipe = equipes[index];
        const membros = membrosPorEquipe.get(Number(equipe.id_equipe)) || [];
        if (membros.some((membro) => Number(membro.id_usuario) > 0)) continue;
        const alunos = await jsonOrThrow(
            await request.get(`api/v1/usuarios?acao=listar_competidores&id_turma=${Number(equipe.turmas_id_turma)}&id_interclasse=${idInterclasse}`),
            `alunos da equipe ${equipe.id_equipe}`,
        );
        let idUsuario = (alunos.competidores || []).find((aluno) =>
            String(aluno.status_usuario || '1') === '1'
            && !usuariosVinculados.has(Number(aluno.id_usuario))
        )?.id_usuario;
        if (!Number(idUsuario)) {
            const criado = await jsonOrThrow(await request.post('api/v1/usuarios?acao=criar_aluno', {
                data: {
                    nome_usuario: `Atleta E2E ${index + 1} ${Date.now()}`,
                    matricula_usuario: `E2E${Date.now()}${index}`,
                    data_nasc_usuario: '2010-01-01',
                    genero_usuario: 'MASC',
                    turmas_id_turma: Number(equipe.turmas_id_turma),
                },
            }), `criação do atleta ${equipe.id_equipe}`);
            idUsuario = criado.id_usuario || criado.id;
        }
        await jsonOrThrow(await request.post('api/v1/equipes', {
            data: { acao: 'adicionar_usuarios', id_equipe: Number(equipe.id_equipe), usuarios: [Number(idUsuario)] },
        }), `vínculo do atleta ${equipe.id_equipe}`);
        usuariosVinculados.add(Number(idUsuario));
    }
}

async function abrirJogo(page, idJogo, esperado, opcoes = {}) {
    await page.evaluate((id) => {
        if (!window.__SGI_SPA__ || typeof window.__SGI_SPA__.navegarPara !== 'function') {
            throw new Error('SPA do mesário não está disponível.');
        }
        window.__SGI_SPA__.navegarPara('jogos', { id_jogo: id, origem: 'agenda_edit' });
    }, idJogo);
    await expect.poll(() => {
        const atual = new URL(page.url());
        return atual.searchParams.get('id_jogo');
    }, { timeout: 20_000 }).toBe(String(idJogo));
    await expect(page.locator('#placar-grid')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#placar-titulo-jogo')).not.toHaveText('Placar', { timeout: 20_000 });
    if (esperado) await validarDadosJogoOffline(page, esperado, opcoes);
}

async function esperarJogoLocal(page, tag, predicate) {
    await expect.poll(async () => page.evaluate(async ({ tag: nome, predicate: regra }) => {
        const jogos = await window.SGIDataLayer.read('jogos');
        const jogo = jogos.find((item) => String(item.nome_jogo) === String(nome));
        if (!jogo) return false;
        if (regra === 'concluido') return /Concluido|Finalizado/.test(String(jogo.status_jogo));
        if (regra === 'final-formada') return Number(jogo.id_jogo) < 0 && jogo.status_jogo === 'Agendado' && Array.isArray(jogo.equipes) && jogo.equipes.length >= 2;
        if (regra === 'campeao') return Number(jogo.id_jogo) < 0 && /Concluido|Finalizado/.test(String(jogo.status_jogo));
        return true;
    }, { tag, predicate })).toBe(true);
}

async function obterJogoLocal(page, tag) {
    return page.evaluate(async (nome) => {
        const jogos = await window.SGIDataLayer.read('jogos');
        return jogos.find((item) => String(item.nome_jogo) === String(nome)) || null;
    }, tag);
}

async function esperarDetalheServidor(request, idModalidade, tag, equipes = []) {
    let jogo = null;
    await expect.poll(async () => {
        const lista = await jsonOrThrow(
            await request.get(`api/v1/jogos?id_modalidade=${idModalidade}`),
            `consulta online de ${tag}`
        );
        jogo = lista.find((item) => String(item.nome_jogo) === String(tag)) || null;
        return Boolean(jogo && Number(jogo.id_jogo));
    }, { timeout: 30_000 }).toBe(true);
    const partidas = await jsonOrThrow(
        await request.get(`api/v1/partidas?id_jogo=${Number(jogo.id_jogo)}`),
        `partidas online de ${tag}`
    );
    return {
        jogo,
        partidas: partidas.map((partida) => {
            const equipe = equipes.find((item) =>
                Number(item.id_equipe) === Number(partida.equipes_id_equipe)
            );
            return equipe ? { ...partida, nome_equipe: equipe.nome_equipe } : partida;
        })
    };
}

async function entrarComoMesario(page) {
    await page.goto('login', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#form_desktop')).toBeVisible();
    await page.locator('#form_desktop .ipt-matricula').fill('mesario');
    await page.locator('#form_desktop .ipt-senha').fill('123');
    await page.locator('#form_desktop button[type="submit"]').click();
    await page.waitForURL(/\/painel\?id=\d+/, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).not.toContainText('Download parcial');
}

async function validarConfrontoNaAgenda(page, idInterclasse, titulo, nomes) {
    await page.evaluate(({ id }) => {
        window.__SGI_SPA__.navegarPara('agenda', { id });
    }, { id: idInterclasse });
    await expect(page.locator('#lista-eventos')).toBeVisible({ timeout: 20_000 });
    const card = page.locator('#lista-eventos .ag-event-card').filter({
        has: page.getByRole('heading', { name: titulo, exact: true })
    }).first();
    await expect(card).toBeVisible();
    for (const nome of nomes) await expect(card).toContainText(nome);
    await expect(card.locator('.ag-event-card__teams')).toBeVisible();
    return card;
}

async function marcarPartida(page, pontos) {
    await expect(page.locator('#mc-status-badge')).toContainText('Agendado');
    await page.locator('button.mc-action-btn--start').click();
    await expect(page.locator('#mc-status-badge')).toContainText('Em andamento');

    for (let i = 0; i < pontos; i += 1) {
        await page.locator('.btn-score-plus').first().click();
        const modal = page.locator('#modalArtilheiro');
        await modal.waitFor({ state: 'visible', timeout: 5_000 });
        await expect.poll(() => modal.locator('#selectAlunoArtilheiro option').count()).toBeGreaterThan(1);
        await modal.locator('#selectAlunoArtilheiro').selectOption({ index: 1 });
        await modal.locator('#btnSalvarArtilheiro').click();
        await expect(modal).toBeHidden();
    }

    await page.locator('button.mc-action-btn--finish').click();
    const confirmacao = page.locator('.sgi-feedback-modal').filter({ hasText: 'O placar final será gravado no sistema.' });
    if (await confirmacao.count()) {
        await expect(confirmacao).toBeVisible();
        await confirmacao.getByRole('button', { name: 'Encerrar jogo' }).click();
    }
    await expect(page.locator('#mc-status-badge')).toContainText('Encerrado');
    if (await page.evaluate(() => !navigator.onLine)) {
        const feedback = page.getByRole('dialog');
        // A árvore pode abrir um feedback específico de promoção antes de
        // mencionar explicitamente o modo offline. Todos esses avisos são
        // consequências válidas da mesma finalização local.
        await expect(feedback).toContainText(/offline|Vencedor avançou|Vencedor aguardando|Campeão definido/i, { timeout: 10_000 });
        await feedback.getByRole('button', { name: 'Entendi' }).click();
    }
}

test.describe.serial('Mesário — torneio completo online e offline', () => {
    test('conclui online quatro quartas, duas semifinais e a final', async ({ page, request }, testInfo) => {
        test.setTimeout(300_000);
        const fixture = await criarChaveFixture(request);
        const pageErrors = [];
        const ariaWarnings = [];
        page.on('pageerror', (error) => pageErrors.push(error.message));
        page.on('console', (message) => {
            if (/Blocked aria-hidden/i.test(message.text())) ariaWarnings.push(message.text());
        });

        await entrarComoMesario(page);
        await expect(page.locator('#sgi-offline-ok')).toContainText('Pronto para uso offline', { timeout: 120_000 });
        await expect.poll(() => page.evaluate(() => window.__SGI_SPA__ && window.__SGI_SPA__.status()), { timeout: 120_000 })
            .toMatchObject({ pronto: true, preloading: false });
        await capturarTela(page, testInfo, '01-online-preparado');

        const quartas = ['MM:8:0:N', 'MM:8:1:N', 'MM:8:2:N', 'MM:8:3:N'];
        for (let i = 0; i < quartas.length; i += 1) {
            const tag = quartas[i];
            await abrirJogo(page, fixture.ids[tag], fixture.detalhes[tag]);
            await marcarPartida(page, (i % 2) + 1);
        }

        const semi1 = await esperarDetalheServidor(request, fixture.idModalidade, 'MM:4:0:N', fixture.equipes);
        const semi2 = await esperarDetalheServidor(request, fixture.idModalidade, 'MM:4:1:N', fixture.equipes);
        expect(semi1.partidas).toHaveLength(2);
        expect(semi2.partidas).toHaveLength(2);
        await abrirJogo(page, Number(semi1.jogo.id_jogo), semi1);
        await marcarPartida(page, 1);
        await abrirJogo(page, Number(semi2.jogo.id_jogo), semi2);
        await marcarPartida(page, 2);

        const final = await esperarDetalheServidor(request, fixture.idModalidade, 'MM:2:0:N', fixture.equipes);
        expect(final.partidas).toHaveLength(2);
        const campeaoOnlineEsperado = Number(final.partidas[0].equipes_id_equipe);
        await abrirJogo(page, Number(final.jogo.id_jogo), final);
        await marcarPartida(page, 3);
        await capturarTela(page, testInfo, '02-online-campeao');

        const arvore = await jsonOrThrow(
            await request.get(`api/v1/chaveamentos?id_modalidade=${fixture.idModalidade}`),
            'árvore final online'
        );
        const porTag = Object.fromEntries((arvore.jogos || []).map((jogo) => [jogo.nome_jogo, jogo]));
        for (const tag of [...quartas, 'MM:4:0:N', 'MM:4:1:N', 'MM:2:0:N']) {
            expect(porTag[tag]).toBeTruthy();
            expect(porTag[tag].status_jogo).toMatch(/Concluido|Finalizado/);
        }
        expect(porTag['MM:1:0:N']).toBeUndefined();
        expect(Number(porTag['MM:2:0:N'].equipe_vencedora_id)).toBe(campeaoOnlineEsperado);
        expect(pageErrors).toEqual([]);
        expect(ariaWarnings).toEqual([]);
    });

    test('joga sete partidas sem rede, mostra os times da final e sincroniza o campeão', async ({ page, context, request }, testInfo) => {
        test.setTimeout(360_000);
        const fixture = await criarChaveFixture(request);
        const dialogs = [];
        const pageErrors = [];
        const ariaWarnings = [];
        page.on('dialog', async (dialog) => {
            dialogs.push(dialog.message());
            await dialog.accept();
        });
        page.on('pageerror', (error) => pageErrors.push(error.message));
        page.on('console', (message) => {
            if (/Blocked aria-hidden/i.test(message.text())) ariaWarnings.push(message.text());
        });

        await entrarComoMesario(page);
        await expect(page.locator('#sgi-offline-ok')).toContainText('Pronto para uso offline', { timeout: 120_000 });
        await expect.poll(() => page.evaluate(() => window.__SGI_SPA__ && window.__SGI_SPA__.status()), { timeout: 120_000 })
            .toMatchObject({ pronto: true, preloading: false });
        await capturarTela(page, testInfo, '01-offline-preparado-online');

        await context.setOffline(true);
        await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
        await expect(page.locator('#sgi-offline-banner')).toContainText('SEM CONEXÃO');

        const quartas = ['MM:8:0:N', 'MM:8:1:N', 'MM:8:2:N', 'MM:8:3:N'];
        for (let i = 0; i < quartas.length; i += 1) {
            const tag = quartas[i];
            await abrirJogo(page, fixture.ids[tag], fixture.detalhes[tag]);
            await marcarPartida(page, (i % 2) + 1);
            await esperarJogoLocal(page, tag, 'concluido');
        }

        await esperarJogoLocal(page, 'MM:4:0:N', 'final-formada');
        await esperarJogoLocal(page, 'MM:4:1:N', 'final-formada');
        const semi1 = await obterJogoLocal(page, 'MM:4:0:N');
        const semi2 = await obterJogoLocal(page, 'MM:4:1:N');
        expect(Number(semi1.id_jogo)).toBeLessThan(0);
        expect(Number(semi2.id_jogo)).toBeLessThan(0);
        expect(semi1.data_jogo).toBeTruthy();
        expect(semi1.inicio_jogo).toBeTruthy();
        expect(Number(semi1.locais_id_local)).toBeGreaterThan(0);
        expect(semi2.data_jogo).toBe(semi1.data_jogo);

        await validarConfrontoNaAgenda(page, fixture.idInterclasse, 'Semifinal — Confronto 1', [
            fixture.equipes[0].nome_equipe,
            fixture.equipes[2].nome_equipe
        ]);
        await capturarTela(page, testInfo, '02-semifinais-com-times-offline');

        const semi1Esperada = {
            jogo: semi1,
            partidas: [fixture.detalhes['MM:8:0:N'].partidas[0], fixture.detalhes['MM:8:1:N'].partidas[0]]
        };
        const semi2Esperada = {
            jogo: semi2,
            partidas: [fixture.detalhes['MM:8:2:N'].partidas[0], fixture.detalhes['MM:8:3:N'].partidas[0]]
        };
        await abrirJogo(page, Number(semi1.id_jogo), semi1Esperada);
        await marcarPartida(page, 1);
        await abrirJogo(page, Number(semi2.id_jogo), semi2Esperada);
        await marcarPartida(page, 2);

        await esperarJogoLocal(page, 'MM:2:0:N', 'final-formada');
        const finalLocal = await obterJogoLocal(page, 'MM:2:0:N');
        expect(Number(finalLocal.id_jogo)).toBeLessThan(0);
        expect(finalLocal.equipes).toHaveLength(2);
        expect(finalLocal.data_jogo).toBeTruthy();
        expect(finalLocal.inicio_jogo).toBeTruthy();
        expect(Number(finalLocal.locais_id_local)).toBeGreaterThan(0);
        const finalistasEsperados = finalLocal.equipes.map((equipe) => Number(equipe.id_equipe));
        const nomesFinalistas = finalLocal.equipes.map(nomeEquipeAgenda).filter(Boolean);
        expect(nomesFinalistas).toHaveLength(2);
        expect(new Set(nomesFinalistas).size).toBe(2);
        for (const nome of nomesFinalistas) expect(String(finalLocal.equipes_nomes || '')).toContain(nome);

        await validarConfrontoNaAgenda(page, fixture.idInterclasse, 'Final — Confronto 1', [
            ...nomesFinalistas
        ]);
        await capturarTela(page, testInfo, '03-final-com-times-offline');

        const finalEsperada = {
            jogo: finalLocal,
            partidas: finalLocal.equipes.map((equipe) => ({
                equipes_id_equipe: equipe.id_equipe,
                nome_equipe: nomeEquipeAgenda(equipe)
            }))
        };
        await abrirJogo(page, Number(finalLocal.id_jogo), finalEsperada);
        await marcarPartida(page, 3);
        await esperarJogoLocal(page, 'MM:2:0:N', 'concluido');
        const campeaoLocal = await obterJogoLocal(page, 'MM:2:0:N');
        const campeaoOfflineEsperado = Number(
            campeaoLocal.equipes.slice().sort((a, b) => Number(b.gols || 0) - Number(a.gols || 0))[0].id_equipe
        );
        const finalIdLocal = Number(finalLocal.id_jogo);
        expect(await obterJogoLocal(page, 'MM:1:0:N')).toBeNull();

        // Uma leitura assíncrona de ocorrências não pode tocar no DOM depois
        // que a SPA desmontar a tela do placar.
        await page.evaluate((id) => {
            const fetchOriginal = window.fetch;
            window.__sgiTesteOcorrenciasResolver = null;
            window.fetch = function (input, init) {
                const url = String(input && input.url ? input.url : input);
                if (url.includes('ocorrencias?id_jogo=')) {
                    return new Promise((resolve) => {
                        window.__sgiTesteOcorrenciasResolver = () => resolve(new Response('[]', {
                            status: 200,
                            headers: { 'Content-Type': 'application/json' }
                        }));
                    });
                }
                return fetchOriginal.call(this, input, init);
            };
            window.carregarOcorrencias();
            window.__SGI_SPA__.navegarPara('agenda', { id });
            window.__sgiTesteOcorrenciasRestore = () => { window.fetch = fetchOriginal; };
        }, fixture.idInterclasse);
        await expect(page.locator('#lista-eventos')).toBeVisible({ timeout: 20_000 });
        await page.evaluate(() => {
            if (typeof window.__sgiTesteOcorrenciasResolver === 'function') {
                window.__sgiTesteOcorrenciasResolver();
            }
            if (typeof window.__sgiTesteOcorrenciasRestore === 'function') {
                window.__sgiTesteOcorrenciasRestore();
            }
            delete window.__sgiTesteOcorrenciasResolver;
            delete window.__sgiTesteOcorrenciasRestore;
        });

        // O placar final deve sobreviver à desmontagem/remontagem da tela
        // enquanto ainda estamos offline, sem depender do servidor.
        await page.evaluate((id) => {
            window.__SGI_SPA__.navegarPara('agenda', { id });
        }, fixture.idInterclasse);
        await expect(page.locator('#lista-eventos')).toBeVisible({ timeout: 20_000 });
        await abrirJogo(page, finalIdLocal, {
            jogo: finalLocal,
            partidas: finalLocal.equipes.map((equipe) => ({
                equipes_id_equipe: equipe.id_equipe,
                nome_equipe: nomeEquipeAgenda(equipe)
            }))
        }, { placarInicial: false });
        const placarFinalPersistido = (await page.locator('.score-number').allTextContents()).map((valor) => valor.trim());
        expect(placarFinalPersistido).toEqual(['3', '0']);

        const estadoFilaOffline = await page.evaluate(() => window.SGIOffline.getState());
        expect(estadoFilaOffline.online).toBe(false);
        expect(estadoFilaOffline.pending).toBeGreaterThanOrEqual(18);
        await capturarTela(page, testInfo, '04-sete-jogos-concluidos-offline');

        await context.setOffline(false);
        await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(true);
        await expect.poll(() => page.evaluate(() => window.SGIOffline.getState().pending), { timeout: 90_000 }).toBe(0);
        await expect(page.locator('#sgi-offline-banner')).toHaveClass(/sgi-hidden/);

        const arvore = await page.evaluate(async (idModalidade) => {
            const response = await fetch(`/api/v1/chaveamentos?id_modalidade=${idModalidade}`);
            return response.json();
        }, fixture.idModalidade);
        expect(arvore.success).toBe(true);
        const porTag = Object.fromEntries((arvore.jogos || []).map((jogo) => [jogo.nome_jogo, jogo]));
        for (const tag of [...quartas, 'MM:4:0:N', 'MM:4:1:N', 'MM:2:0:N']) {
            expect(porTag[tag]).toBeTruthy();
            expect(porTag[tag].status_jogo).toMatch(/Concluido|Finalizado/);
        }
        expect(Number(porTag['MM:8:0:N'].equipe_vencedora_id)).toBe(Number(fixture.detalhes['MM:8:0:N'].partidas[0].equipes_id_equipe));
        expect(Number(porTag['MM:8:1:N'].equipe_vencedora_id)).toBe(Number(fixture.detalhes['MM:8:1:N'].partidas[0].equipes_id_equipe));
        expect(Number(porTag['MM:8:2:N'].equipe_vencedora_id)).toBe(Number(fixture.detalhes['MM:8:2:N'].partidas[0].equipes_id_equipe));
        expect(Number(porTag['MM:8:3:N'].equipe_vencedora_id)).toBe(Number(fixture.detalhes['MM:8:3:N'].partidas[0].equipes_id_equipe));
        const vencedoresSemisServidor = [
            Number(porTag['MM:4:0:N'].equipe_vencedora_id),
            Number(porTag['MM:4:1:N'].equipe_vencedora_id)
        ];
        expect(new Set(vencedoresSemisServidor)).toEqual(new Set(finalistasEsperados));
        expect(Number(porTag['MM:2:0:N'].equipe_vencedora_id)).toBe(campeaoOfflineEsperado);
        expect(porTag['MM:1:0:N']).toBeUndefined();
        expect(dialogs).toEqual([]);
        expect(pageErrors).toEqual([]);
        expect(ariaWarnings).toEqual([]);

        await capturarTela(page, testInfo, '05-campeao-sincronizado');
    });
});
