const { test, expect } = require('./fixtures.cjs');
const { agendarBloco } = require('./agenda-helper.cjs');

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost/SGI';

async function jsonOrThrow(response, label) {
    if (!response.ok()) {
        throw new Error(`${label}: HTTP ${response.status()} ${await response.text()}`);
    }
    return response.json();
}

async function criarChaveFixture(request) {
    await jsonOrThrow(await request.post('api/v1/login', {
        data: { matricula: 'admin', senha: '123' }
    }), 'login administrativo do fixture');

    const nomeEdicao = `E2E Bracket Inspection ${Date.now()}`;
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
                nome_equipe: `Time Bracket ${equipes.length + 1}`,
                status_equipe: '1'
            }
        }), `criação da equipe ${equipes.length + 1}`);
        equipes.push({
            ...origem,
            id_equipe: Number(criada.id_equipe),
            nome_equipe: criada.nome_equipe
        });
    }
    equipes = equipes.slice(0, 8);

    const jogos = [
        { tag: 'MM:8:0:N', a: equipes[0], b: equipes[1] },
        { tag: 'MM:8:1:N', a: equipes[2], b: equipes[3] },
        { tag: 'MM:8:2:N', a: equipes[4], b: equipes[5] },
        { tag: 'MM:8:3:N', a: equipes[6], b: equipes[7] }
    ];

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

    const listaJogos = await jsonOrThrow(
        await request.get(`api/v1/jogos?id_modalidade=${Number(modalidade.id_modalidade)}`),
        'consulta dos jogos do fixture'
    );
    await agendarBloco(request, {
        idInterclasse,
        idModalidade: Number(modalidade.id_modalidade),
        jogos: listaJogos.filter((item) => String(item.nome_jogo).startsWith('MM:8:')),
        chaveTags: ['MM:4:0:N', 'MM:4:1:N', 'MM:2:0:N'],
        label: 'E2E-bracket-offline',
    });

    return {
        idInterclasse,
        nomeEdicao,
        modalidade,
        equipes,
        jogos: listaJogos
    };
}

test.describe('Torneio Offline e Inspeção da Árvore de Chaveamento', () => {
    let fixture;

    test.beforeAll(async ({ request }) => {
        fixture = await criarChaveFixture(request);
    });

    test('simula torneio de 7 partidas 100% offline, inspeciona chaveamento, cards e card do campeão', async ({ page, context }) => {
        test.setTimeout(180000);

        // 1. Login como Mesário
        await page.goto('login', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#form_desktop')).toBeVisible();
        await page.locator('#form_desktop .ipt-matricula').fill('mesario');
        await page.locator('#form_desktop .ipt-senha').fill('123');
        await page.locator('#form_desktop button[type="submit"]').click();
        await page.waitForURL(/\/painel\?id=\d+/, { waitUntil: 'domcontentloaded' });

        // 2. Aguarda pré-carregamento do SPA
        await expect(page.locator('#sgi-offline-ok')).toContainText('Pronto para uso offline', { timeout: 60_000 });
        await expect.poll(() => page.evaluate(() => window.__SGI_SPA__ && window.__SGI_SPA__.status()), { timeout: 60_000 })
            .toMatchObject({ pronto: true, preloading: false });

        // 3. Desconecta da rede (100% offline)
        await context.setOffline(true);

        const idModalidade = Number(fixture.modalidade.id_modalidade);

        // 4. Executa as 4 partidas de quartas de final offline
        const jogosIniciais = fixture.jogos.filter(j => j.nome_jogo.startsWith('MM:8:'));
        expect(jogosIniciais.length).toBe(4);

        const placaresQF = [
            { id: jogosIniciais[0].id_jogo, eq1Gols: 1, eq2Gols: 0 },
            { id: jogosIniciais[1].id_jogo, eq1Gols: 2, eq2Gols: 0 },
            { id: jogosIniciais[2].id_jogo, eq1Gols: 1, eq2Gols: 0 },
            { id: jogosIniciais[3].id_jogo, eq1Gols: 2, eq2Gols: 0 }
        ];

        for (const qf of placaresQF) {
            await page.evaluate(async ({ idJogo, eq1Gols, eq2Gols }) => {
                const partidasResp = await fetch(`/api/v1/partidas?id_jogo=${idJogo}`);
                const partidas = await partidasResp.json();
                const resultados = [
                    { id_equipe: partidas[0].equipes_id_equipe, gols: eq1Gols },
                    { id_equipe: partidas[1].equipes_id_equipe, gols: eq2Gols }
                ];
                await fetch('/api/v1/resultados', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id_jogo: idJogo, resultados })
                });
                if (window.SGIChaveamento && window.SGIChaveamento.promoverVencedorLocal) {
                    await window.SGIChaveamento.promoverVencedorLocal(idJogo);
                }
            }, { idJogo: qf.id, eq1Gols: qf.eq1Gols, eq2Gols: qf.eq2Gols });
        }

        // 5. Executa as 2 semifinais offline dinamicamente por tag
        const semi1 = await page.evaluate(async () => {
            const jogos = await window.SGIDataLayer.read('jogos');
            return jogos.find(j => j.nome_jogo === 'MM:4:0:N');
        });
        const semi2 = await page.evaluate(async () => {
            const jogos = await window.SGIDataLayer.read('jogos');
            return jogos.find(j => j.nome_jogo === 'MM:4:1:N');
        });

        expect(semi1).toBeTruthy();
        expect(semi2).toBeTruthy();

        const placaresSF = [
            { idJogo: Number(semi1.id_jogo), eq1Gols: 1, eq2Gols: 0 },
            { idJogo: Number(semi2.id_jogo), eq1Gols: 2, eq2Gols: 0 }
        ];

        for (const sf of placaresSF) {
            await page.evaluate(async ({ idJogo, eq1Gols, eq2Gols }) => {
                const partidasResp = await fetch(`/api/v1/partidas?id_jogo=${idJogo}`);
                const partidas = await partidasResp.json();
                const resultados = [
                    { id_equipe: partidas[0].equipes_id_equipe, gols: eq1Gols },
                    { id_equipe: partidas[1].equipes_id_equipe, gols: eq2Gols }
                ];
                await fetch('/api/v1/resultados', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id_jogo: idJogo, resultados })
                });
                if (window.SGIChaveamento && window.SGIChaveamento.promoverVencedorLocal) {
                    await window.SGIChaveamento.promoverVencedorLocal(idJogo);
                }
            }, { idJogo: sf.idJogo, eq1Gols: sf.eq1Gols, eq2Gols: sf.eq2Gols });
        }

        // 6. Executa a Grande Final offline dinamicamente
        const finalJogo = await page.evaluate(async () => {
            const jogos = await window.SGIDataLayer.read('jogos');
            return jogos.find(j => j.nome_jogo === 'MM:2:0:N');
        });
        expect(finalJogo).toBeTruthy();
        const idFinal = Number(finalJogo.id_jogo);

        await page.evaluate(async ({ idJogo }) => {
            const partidasResp = await fetch(`/api/v1/partidas?id_jogo=${idJogo}`);
            const partidas = await partidasResp.json();
            const resultados = [
                { id_equipe: partidas[0].equipes_id_equipe, gols: 3 },
                { id_equipe: partidas[1].equipes_id_equipe, gols: 0 }
            ];
            await fetch('/api/v1/resultados', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_jogo: idJogo, resultados })
            });
            if (window.SGIChaveamento && window.SGIChaveamento.promoverVencedorLocal) {
                await window.SGIChaveamento.promoverVencedorLocal(idJogo);
            }
        }, { idJogo: idFinal });

        // 7. Avalia o estado retornado pelo SGIChaveamento.carregarArvore
        const resultadoArvore = await page.evaluate(async (idMod) => {
            const res = await window.SGIChaveamento.carregarArvore(idMod);
            return {
                sucesso: !!res,
                totalJogos: res?.jogos?.length || 0,
                jogos: res?.jogos || [],
                fonte: res?.fonte
            };
        }, idModalidade);

        expect(resultadoArvore.sucesso).toBe(true);
        expect(resultadoArvore.fonte).toBe('local');
        // 4 QF + 2 SF + 1 Final; o 3º lugar é derivado sem jogo físico.
        expect(resultadoArvore.totalJogos).toBe(7);
        expect(resultadoArvore.jogos.some((jogo) => jogo.nome_jogo === 'POS:3:0:N')).toBe(false);

        // 8. Navega para a tela de chaveamento via SPA
        await page.evaluate((idInter) => {
            window.__SGI_SPA__.navegarPara('chaveamento', { id: idInter });
        }, fixture.idInterclasse);

        await expect(page.locator('#bracketArea')).toBeAttached({ timeout: 10_000 });
        await expect(page.locator('#selectModalidade')).toBeAttached({ timeout: 10_000 });

        // 9. Inspeciona o DOM da tela chaveamento
        const domInfo = await page.evaluate(() => {
            return {
                temBracketArea: !!document.getElementById('bracketArea'),
                temBracketAreaMob: !!document.getElementById('bracketAreaMob'),
                temSelectModalidade: !!document.getElementById('selectModalidade'),
                temSelectModalidadeMob: !!document.getElementById('selectModalidadeMob'),
                temSecaoJogos: !!document.getElementById('secaoJogos'),
                statJogos: document.getElementById('statJogos')?.innerText?.trim() || null,
                statCampeoes: document.getElementById('statCampeoes')?.innerText?.trim() || null,
                statPendentes: document.getElementById('statPendentes')?.innerText?.trim() || null
            };
        });

        // Agora, com as correções aplicadas, Mesário (nível 2) e Aluno (nível 3)
        // têm acesso ao contêiner da árvore e ao seletor de modalidade nativamente:
        expect(domInfo.temBracketArea).toBe(true);
        expect(domInfo.temSelectModalidade).toBe(true);

        // 10. Carrega a árvore da modalidade diretamente na tela do Mesário
        await page.evaluate(async (idMod) => {
            if (typeof carregarArvore === 'function') {
                await carregarArvore(String(idMod));
            }
        }, idModalidade);

        await page.waitForSelector('#bracketArea .bracket-champion-card', { timeout: 10000 });

        // Valida que o card do campeão agora aparece nativamente na tela do Mesário!
        const campeaoLoc = page.locator('#bracketArea .bracket-champion-card');
        await expect(campeaoLoc).toBeVisible();
        await expect(campeaoLoc.locator('.bracket-champion-card__label')).toHaveText(/campeão/i);
        await expect(campeaoLoc.locator('.bracket-champion-card__name')).not.toBeEmpty();

        // Valida que todos os 7 cards de partidas (.bkt-match) estão renderizados na árvore
        const matchCards = page.locator('#bracketArea .bkt-match');
        await expect(matchCards).toHaveCount(7);

        for (let i = 0; i < 7; i++) {
            const card = matchCards.nth(i);
            await expect(card.locator('.bkt-team')).toHaveCount(2);
            await expect(card.locator('.bkt-match__status')).toHaveText(/FINALIZADO|AGENDADO/i);
        }

        // Valida a correção da métrica de campeões definidos (exatamente 1 modalidade com campeão definido)
        const statCampeoesAtual = await page.locator('#statCampeoes').innerText();
        expect(statCampeoesAtual.trim()).toBe('1');
    });
});
