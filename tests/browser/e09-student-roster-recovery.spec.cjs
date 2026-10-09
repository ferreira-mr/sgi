const { test, expect } = require('./fixtures.cjs');

const jogoFixture = {
    id_jogo: 96006,
    nome_jogo: 'Partida de teste E09',
    status_jogo: 'Agendado',
    nome_modalidade: 'Futsal E09',
    modalidades_id_modalidade: 96005,
    categorias_id_categoria: 96003,
    nome_categoria: 'Sub-15 E09',
    data_jogo: '2026-09-15',
    inicio_jogo: '10:00:00',
    termino_jogo: '11:00:00',
    nome_local: 'Quadra E09',
};

const linhasJogo = [
    {
        ...jogoFixture,
        equipes_id_equipe: 96001,
        nome_fantasia_turma: 'Lobos E09',
        nome_turma: 'Turma Azul E09',
        resultado_partida: 0,
    },
    {
        ...jogoFixture,
        equipes_id_equipe: 96002,
        nome_fantasia_turma: 'Tigres E09',
        nome_turma: 'Turma Verde E09',
        resultado_partida: 0,
    },
];

const edicaoAdmin = {
    id_interclasse: 901,
    nome_interclasse: 'Interclasse de teste E09',
    ano_interclasse: '2026-01-01',
    status_interclasse: '1',
};

const turmaAdmin = {
    id_turma: 902,
    nome_turma: 'Turma E09',
    nome_fantasia_turma: 'Lobos',
    turno_turma: 'Manhã',
    categorias_id_categoria: 903,
    interclasses_id_interclasse: 901,
    nome_categoria: 'Sub-15',
};

async function jsonOrThrow(response, label) {
    if (!response.ok()) {
        throw new Error(`${label}: HTTP ${response.status()} ${await response.text()}`);
    }
    const payload = await response.json();
    if (payload && payload.success === false) {
        throw new Error(`${label}: ${payload.message || 'resposta recusada'}`);
    }
    return payload;
}

async function prepararAluno(request) {
    await jsonOrThrow(await request.post('api/v1/login', {
        data: { matricula: 'admin', senha: '123' },
    }), 'login administrativo para fixture E09');

    const edicoes = await jsonOrThrow(
        await request.get('api/v1/edicoes?regulamento=true'),
        'consulta de edições E09',
    );
    const edicao = (Array.isArray(edicoes) ? edicoes : [])
        .find((item) => String(item.status_interclasse) === '1');
    if (!edicao) throw new Error('A fixture E09 precisa de uma edição ativa.');

    const turmas = await jsonOrThrow(
        await request.get(`api/v1/turmas?id_interclasse=${Number(edicao.id_interclasse)}`),
        'consulta de turmas E09',
    );
    const turma = Array.isArray(turmas) ? turmas.find((item) => Number(item.id_turma) > 0) : null;
    if (!turma) throw new Error('A fixture E09 precisa de uma turma ativa.');

    const matricula = `57${Date.now().toString().slice(-7)}`;
    const aluno = await jsonOrThrow(await request.post('api/v1/usuarios?acao=criar_aluno', {
        data: {
            nome_usuario: 'Aluno E09 Recuperação',
            matricula_usuario: matricula,
            genero_usuario: 'MASC',
            data_nasc_usuario: '2008-07-20',
            turmas_id_turma: Number(turma.id_turma),
        },
    }), 'criação do aluno E09');
    if (aluno.status !== 'sucesso' || !aluno.senha_temporaria) {
        throw new Error(`A API não preparou o aluno E09: ${JSON.stringify(aluno)}`);
    }

    return {
        idInterclasse: Number(edicao.id_interclasse),
        matricula,
        senhaTemporaria: String(aluno.senha_temporaria),
        senhaNova: 'AlunoE09#2026',
    };
}

async function entrarAluno(page, fixture) {
    await page.goto('login', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#form_desktop')).toBeVisible();
    await page.locator('#form_desktop .ipt-matricula').fill(fixture.matricula);
    await page.locator('#form_desktop .ipt-senha').fill(fixture.senhaTemporaria);
    await page.locator('#form_desktop button[type="submit"]').click();
    await page.waitForURL(/\/aluno\/trocar-senha/, { timeout: 15_000 });

    await page.locator('#novaSenhaPrimeiroAcesso').fill(fixture.senhaNova);
    await page.locator('#confirmarSenhaPrimeiroAcesso').fill(fixture.senhaNova);
    await page.locator('#btnSalvarSenhaPrimeiroAcesso').click();
    await page.waitForURL(/\/aluno\/termos/, { timeout: 15_000 });
    await page.locator('#btnAceitarTermos').click();
    await page.waitForURL(/\/aluno\/inicio/, { timeout: 15_000 });
}

async function instalarDadosDoJogo(page, idInterclasse, membroHandler, healthHandler = null) {
    await page.route('**/api/v1/**', async (route) => {
        const url = new URL(route.request().url());
        const params = url.searchParams;

        if (url.pathname.endsWith('/edicoes') && params.get('regulamento') === 'true') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([{
                    id_interclasse: idInterclasse,
                    nome_interclasse: 'Edição E09 de teste',
                    ano_interclasse: '2026-01-01',
                    status_interclasse: '1',
                }]),
            });
            return;
        }

        if (url.pathname.endsWith('/partidas')) {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(linhasJogo),
            });
            return;
        }

        if (url.pathname.endsWith('/artilheiros')) {
            await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
            return;
        }

        if (url.pathname.endsWith('/health')) {
            if (healthHandler) healthHandler();
            await route.continue();
            return;
        }

        if (url.pathname.endsWith('/equipes') && params.get('id_equipe') === '96001') {
            await membroHandler(route);
            return;
        }

        if (url.pathname.endsWith('/equipes') && params.get('id_equipe') === '96002') {
            await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
            return;
        }

        await route.continue();
    });
}

async function abrirDetalhesEEquipe(page, idInterclasse) {
    await page.goto(`aluno/jogos?id=${idInterclasse}`, { waitUntil: 'domcontentloaded' });
    const cartao = page.locator(`article[data-jogo-id="${jogoFixture.id_jogo}"]`);
    await expect(cartao).toBeVisible();
    await cartao.getByRole('button', { name: 'Ver detalhes do jogo' }).click();
    await expect(page.getByRole('dialog', { name: 'Resumo da Partida' })).toBeVisible();

    const botaoEquipe = page.locator('#accordionEquipes .accordion-button').filter({ hasText: 'Lobos E09' });
    const painel = page.locator('#equipe-96001');
    await expect(botaoEquipe).toBeVisible();
    await botaoEquipe.click();
    await expect(painel).toBeVisible();
    await expect(page.locator('#equipe-96001.collapse.show:not(.collapsing)')).toHaveCount(1);
    return { botaoEquipe, painel, corpo: painel.locator('.accordion-body') };
}

async function entrarComoAdmin(page) {
    await page.goto('login', { waitUntil: 'domcontentloaded' });
    await page.locator('#form_desktop .ipt-matricula').fill('admin');
    await page.locator('#form_desktop .ipt-senha').fill('123');
    await page.locator('#form_desktop button[type="submit"]').click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).not.toHaveURL(/login(?:\?|$)/, { timeout: 15_000 });
}

function respostaJson(route, payload, status = 200) {
    return route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(payload),
    });
}

async function instalarApiTurma(page, buscarCompetidores) {
    await page.route('**/api/v1/**', async (route) => {
        const url = new URL(route.request().url());
        const params = url.searchParams;

        if (url.pathname.endsWith('/edicoes')) {
            await respostaJson(route, [edicaoAdmin]);
        } else if (url.pathname.endsWith('/turmas')) {
            await respostaJson(route, [turmaAdmin]);
        } else if (url.pathname.endsWith('/usuarios') && params.get('acao') === 'listar_competidores') {
            await buscarCompetidores(route);
        } else if (url.pathname.endsWith('/equipes')) {
            await respostaJson(route, []);
        } else {
            await respostaJson(route, { success: true });
        }
    });
}

async function abrirListaDaTurma(page) {
    await page.goto('turmas/alunos?id=901&id_turma=902&id_categoria=903', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#tbodyAlunosTurmaDesk')).toBeVisible();
}

test.describe('E09 — recuperação de listas e estados vazios', () => {
    test('aluno/jogos apresenta erro quando integrantes falha com HTTP 503 e corpo vazio', async ({ page, request }) => {
        const fixture = await prepararAluno(request);
        await entrarAluno(page, fixture);

        let requisicoesMembros = 0;
        await instalarDadosDoJogo(page, fixture.idInterclasse, async (route) => {
            requisicoesMembros += 1;
            await route.fulfill({ status: 503, contentType: 'application/json', body: '[]' });
        });

        const { corpo } = await abrirDetalhesEEquipe(page, fixture.idInterclasse);
        await expect(corpo).toContainText(/erro ao carregar integrantes|não foi possível carregar integrantes/i, { timeout: 5_000 });
        await expect(corpo).not.toContainText('Nenhum integrante vinculado a esta equipe.');
        expect(requisicoesMembros).toBe(1);
    });

    test('aluno/jogos tenta carregar integrantes outra vez ao reabrir o acordeão após falha', async ({ page, request }) => {
        const fixture = await prepararAluno(request);
        await entrarAluno(page, fixture);

        let requisicoesMembros = 0;
        let verificacoesServidor = 0;
        await instalarDadosDoJogo(page, fixture.idInterclasse, async (route) => {
            requisicoesMembros += 1;
            if (requisicoesMembros === 1) {
                await route.abort('failed');
                return;
            }
            await respostaJson(route, [{ id_usuario: 96011, nome_usuario: 'Atleta recuperado E09' }]);
        }, () => { verificacoesServidor += 1; });

        const { botaoEquipe, painel, corpo } = await abrirDetalhesEEquipe(page, fixture.idInterclasse);
        await expect(corpo).toContainText(/erro ao carregar integrantes|não foi possível carregar integrantes/i, { timeout: 5_000 });

        await botaoEquipe.click();
        await expect(page.locator('#equipe-96001.collapse:not(.show):not(.collapsing)')).toHaveCount(1);
        const verificacoesAntesDaRetentativa = verificacoesServidor;
        await botaoEquipe.click();
        await expect.poll(() => verificacoesServidor).toBeGreaterThan(verificacoesAntesDaRetentativa);
        await expect(page.locator('#equipe-96001.collapse.show:not(.collapsing)')).toHaveCount(1);
        await expect(corpo).toContainText('Atleta recuperado E09', { timeout: 5_000 });
        await expect.poll(() => requisicoesMembros).toBe(2);
    });

    test('turma-alunos diferencia erro de consulta, oferece retry e mantém a busca após recuperar', async ({ page }) => {
        await entrarComoAdmin(page);
        let requisicoesAlunos = 0;
        await instalarApiTurma(page, async (route) => {
            requisicoesAlunos += 1;
            if (requisicoesAlunos === 1) {
                await route.fulfill({ status: 500, contentType: 'text/html', body: '<html>Falha temporária</html>' });
                return;
            }
            await respostaJson(route, { competidores: [
                { id_usuario: 9902, nome_usuario: 'Ana E09', matricula_usuario: 'E09-9902', genero_usuario: 'FEM' },
            ] });
        });

        await abrirListaDaTurma(page);
        const tabela = page.locator('#tbodyAlunosTurmaDesk');
        await expect(tabela).toContainText(/erro ao carregar|não foi possível carregar/i, { timeout: 5_000 });
        await expect(tabela).not.toContainText('Nenhum estudante cadastrado nesta turma.');

        const busca = page.locator('#buscaAlunoDesk');
        await busca.fill('Ana');
        const tentarNovamente = page.getByRole('button', { name: /tentar novamente/i });
        await expect(tentarNovamente).toBeVisible({ timeout: 5_000 });
        await tentarNovamente.click();

        await expect(tabela).toContainText('Ana E09');
        await expect(busca).toHaveValue('Ana');
        expect(requisicoesAlunos).toBe(2);
    });

    test('turma-alunos mantém estado vazio válido distinto de busca sem resultados', async ({ page }) => {
        await entrarComoAdmin(page);
        await instalarApiTurma(page, (route) => respostaJson(route, { competidores: [] }));
        await abrirListaDaTurma(page);

        const tabela = page.locator('#tbodyAlunosTurmaDesk');
        await expect(tabela).toContainText('Nenhum estudante cadastrado nesta turma.');
        await page.locator('#buscaAlunoDesk').fill('aluna ausente');
        await expect(tabela).toContainText(/nenhum resultado para sua busca/i);
        await expect(tabela).not.toContainText('Nenhum estudante cadastrado nesta turma.');
        await page.locator('#buscaAlunoDesk').fill('');
        await expect(tabela).toContainText('Nenhum estudante cadastrado nesta turma.');
    });

    test('equipe-alunos não apresenta falha HTTP ao consultar competidores como equipe vazia', async ({ page }) => {
        await entrarComoAdmin(page);
        await page.route('**/api/v1/**', async (route) => {
            const url = new URL(route.request().url());
            const params = url.searchParams;

            if (url.pathname.endsWith('/edicoes')) {
                await respostaJson(route, [edicaoAdmin]);
            } else if (url.pathname.endsWith('/modalidades')) {
                await respostaJson(route, [{ id_modalidade: 905, genero_modalidade: 'MISTO' }]);
            } else if (url.pathname.endsWith('/equipes')) {
                await respostaJson(route, [{ id_usuario: 9903, nome_usuario: 'Bia E09', matricula_usuario: 'E09-9903' }]);
            } else if (url.pathname.endsWith('/usuarios') && params.get('acao') === 'listar_competidores') {
                await route.fulfill({ status: 503, contentType: 'application/json', body: '[]' });
            } else {
                await respostaJson(route, { success: true });
            }
        });

        await page.goto('equipes/alunos?id=901&id_turma=902&id_equipe=904&id_categoria=903&id_modalidade=905', {
            waitUntil: 'domcontentloaded',
        });

        const lista = page.locator('#listaAlunosDesktop');
        await expect(lista).toContainText(/erro ao carregar|não foi possível carregar/i, { timeout: 5_000 });
        await expect(lista).not.toContainText('Nenhum estudante disponível');
    });
});
