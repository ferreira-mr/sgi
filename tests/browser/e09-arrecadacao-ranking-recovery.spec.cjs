const { test, expect } = require('./fixtures.cjs');

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

async function entrarComoAdmin(page) {
    await page.goto('login', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#form_desktop')).toBeVisible();
    await page.locator('#form_desktop .ipt-matricula').fill('admin');
    await page.locator('#form_desktop .ipt-senha').fill('123');
    await page.locator('#form_desktop button[type="submit"]').click();
    await page.waitForURL(/\/edicoes/, { timeout: 15_000 });
}

async function obterEdicaoAtiva(request) {
    await jsonOrThrow(await request.post('api/v1/login', {
        data: { matricula: 'admin', senha: '123' },
    }), 'login administrativo de preparação E09');

    const edicoes = await jsonOrThrow(
        await request.get('api/v1/edicoes?regulamento=true'),
        'consulta de edições E09',
    );
    const edicao = (Array.isArray(edicoes) ? edicoes : [])
        .find((item) => String(item.status_interclasse) === '1');
    if (!edicao) throw new Error('O fixture não contém uma edição ativa para E09.');

    const idInterclasse = Number(edicao.id_interclasse);
    const turmas = await jsonOrThrow(
        await request.get(`api/v1/turmas?id_interclasse=${idInterclasse}`),
        'consulta de turmas E09',
    );
    const turma = Array.isArray(turmas) ? turmas.find((item) => Number(item.id_turma) > 0) : null;
    if (!turma) throw new Error('O fixture não contém uma turma para E09.');

    return { idInterclasse, turma };
}

async function criarAlunoParaRanking(request) {
    const { idInterclasse, turma } = await obterEdicaoAtiva(request);
    const matricula = `59${Date.now().toString().slice(-7)}`;
    const aluno = await jsonOrThrow(await request.post('api/v1/usuarios?acao=criar_aluno', {
        data: {
            nome_usuario: 'Aluno E09 Ranking',
            matricula_usuario: matricula,
            genero_usuario: 'MASC',
            data_nasc_usuario: '2008-07-20',
            turmas_id_turma: Number(turma.id_turma),
        },
    }), 'criação do aluno de ranking E09');

    if (aluno.status !== 'sucesso' || !aluno.senha_temporaria) {
        throw new Error(`A API não criou um aluno de primeiro acesso para E09: ${JSON.stringify(aluno)}`);
    }

    return {
        idInterclasse,
        matricula,
        senhaTemporaria: String(aluno.senha_temporaria),
        senhaNova: 'AlunoE09#2026',
    };
}

async function entrarAlunoEAceitarTermos(page, fixture) {
    await page.goto('login', { waitUntil: 'domcontentloaded' });
    await page.locator('#form_desktop .ipt-matricula').fill(fixture.matricula);
    await page.locator('#form_desktop .ipt-senha').fill(fixture.senhaTemporaria);
    await page.locator('#form_desktop button[type="submit"]').click();

    await page.waitForURL(/\/aluno\/trocar-senha/, { timeout: 15_000 });
    await page.locator('#novaSenhaPrimeiroAcesso').fill(fixture.senhaNova);
    await page.locator('#confirmarSenhaPrimeiroAcesso').fill(fixture.senhaNova);
    await page.locator('#btnSalvarSenhaPrimeiroAcesso').click();

    await page.waitForURL(/\/aluno\/termos/, { timeout: 15_000 });
    await expect(page.locator('main')).toContainText('Termo de Responsabilidade');
    await page.locator('#btnAceitarTermos').click();
    await page.waitForURL(/\/aluno\/inicio/, { timeout: 15_000 });
}

test('E09 histórico de arrecadação diferencia erro de lista vazia e permite tentar novamente', async ({ page, request }) => {
    const { idInterclasse, turma } = await obterEdicaoAtiva(request);
    const idTurma = Number(turma.id_turma);
    let consultasAoHistorico = 0;

    await entrarComoAdmin(page);
    await page.route('**/api/v1/arrecadacao**', async (route) => {
        const requisicao = route.request();
        const url = new URL(requisicao.url());
        if (requisicao.method() !== 'GET' || !url.pathname.endsWith('/api/v1/arrecadacao')) {
            await route.continue();
            return;
        }

        consultasAoHistorico += 1;
        if (consultasAoHistorico === 1) {
            await route.fulfill({
                status: 503,
                contentType: 'application/json',
                body: JSON.stringify({ success: false, message: 'Serviço temporariamente indisponível.' }),
            });
            return;
        }

        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });

    await page.goto(`edicoes/arrecadacao?id=${idInterclasse}`, { waitUntil: 'domcontentloaded' });
    const botaoHistorico = page.locator(`#listaArrecadacaoDesktop [data-sgi-action="history-arrecadacao"][data-id-turma="${idTurma}"]`);
    await expect(botaoHistorico).toBeVisible({ timeout: 15_000 });
    await botaoHistorico.click();

    const dialog = page.getByRole('dialog', { name: /Histórico de arrecadações/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: /Tentar novamente/i })).toBeVisible();
    await expect(dialog).not.toContainText(/Nenhum registro de arrecadação encontrado/i);

    await dialog.getByRole('button', { name: /Tentar novamente/i }).click();
    await expect(dialog).toContainText(/Nenhum registro de arrecadação encontrado para esta turma/i);
    await expect.poll(() => consultasAoHistorico).toBe(2);
});

test('E09 falha ao salvar arrecadação preserva kg e libera os dois botões responsivos', async ({ page, request }) => {
    const { idInterclasse, turma } = await obterEdicaoAtiva(request);
    const idTurma = Number(turma.id_turma);
    let payloadEnviado = null;

    await entrarComoAdmin(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route('**/api/v1/arrecadacao**', async (route) => {
        const requisicao = route.request();
        const url = new URL(requisicao.url());
        if (requisicao.method() === 'POST' && url.pathname.endsWith('/api/v1/arrecadacao')) {
            payloadEnviado = requisicao.postDataJSON();
            await route.fulfill({
                status: 503,
                contentType: 'application/json',
                body: JSON.stringify({ success: false, message: 'Não foi possível processar a arrecadação.' }),
            });
            return;
        }
        await route.continue();
    });

    await page.goto(`edicoes/arrecadacao?id=${idInterclasse}`, { waitUntil: 'domcontentloaded' });
    const seletorInput = `.arrec-input[data-id-turma="${idTurma}"]`;
    const inputMobile = page.locator(`#listaArrecadacaoMobile ${seletorInput}`);
    const inputDesktop = page.locator(`#listaArrecadacaoDesktop ${seletorInput}`);
    await expect(inputMobile).toBeVisible({ timeout: 15_000 });
    await inputMobile.fill('17.5');

    await page.locator(`#listaArrecadacaoMobile [data-sgi-action="save-arrecadacao"][data-id-turma="${idTurma}"]`).click();
    const feedback = page.getByRole('dialog');
    await expect(feedback).toBeVisible();
    await expect(feedback).toContainText(/Não foi possível salvar a arrecadação/i);
    await feedback.getByRole('button', { name: 'Entendi' }).click();

    expect(payloadEnviado.arrecadacoes[0]).toEqual({ id_turma: idTurma, quantidade: 17.5 });
    await expect(inputMobile).toHaveValue('17.5');
    await expect(inputDesktop).toHaveValue('17.5');
    await expect(page.locator(`#listaArrecadacaoMobile [data-sgi-action="save-arrecadacao"][data-id-turma="${idTurma}"]`)).toBeEnabled();
    await expect(page.locator(`#listaArrecadacaoDesktop [data-sgi-action="save-arrecadacao"][data-id-turma="${idTurma}"]`)).toBeEnabled();
});

test('E09 ranking mantém dados principais confirmados se a consulta de categorias falha e os recupera ao tentar novamente', async ({ page, request }) => {
    const { idInterclasse } = await obterEdicaoAtiva(request);
    let consultasDeRanking = 0;
    let consultasDeCategoria = 0;
    const linhaRanking = {
        id_turma: 99001,
        nome_turma: 'Turma E09 Confirmada',
        nome_fantasia_turma: 'Fênix E09',
        turno_turma: 'Manhã',
        pontuacao_sem_penalidade: 71,
        pontuacao_bruta: 71,
        pontuacao_arrecadacao: 0,
        pontuacao_esportes: 0,
        ajuste_pontuacao: 0,
        pontuacao_turma: 71,
        pontuacao_liquida: 71,
        nome_interclasse: 'Interclasse E09',
        status_interclasse: '1',
        nome_categoria: 'Categoria E09',
    };

    await entrarComoAdmin(page);
    await page.route('**/api/v1/ranking**', async (route) => {
        const url = new URL(route.request().url());
        if (route.request().method() === 'GET' && url.pathname.endsWith('/api/v1/ranking')) {
            consultasDeRanking += 1;
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([linhaRanking]) });
            return;
        }
        await route.continue();
    });
    await page.route('**/api/v1/categorias**', async (route) => {
        const url = new URL(route.request().url());
        if (route.request().method() !== 'GET' || !url.pathname.endsWith('/api/v1/categorias')) {
            await route.continue();
            return;
        }

        consultasDeCategoria += 1;
        if (consultasDeCategoria === 1) {
            await route.fulfill({
                status: 503,
                contentType: 'application/json',
                body: JSON.stringify({ success: false, message: 'Consulta de categorias indisponível.' }),
            });
            return;
        }
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([{ id_categoria: 99002, nome_categoria: 'Categoria E09' }]),
        });
    });

    await page.goto(`ranking?id=${idInterclasse}`, { waitUntil: 'domcontentloaded' });
    const lista = page.locator('#listaDesk');
    await expect(lista.locator('.card-turma')).toContainText('Turma E09 Confirmada');
    await expect(lista.locator('.card-turma')).toContainText('71');
    await expect(page.locator('#msgDesk')).toContainText(/categorias.*indisponível|dados principais.*disponíveis/i);

    await page.getByRole('button', { name: /Tentar novamente/i }).click();
    await expect(page.locator('#msgDesk')).not.toContainText(/categorias.*indisponível/i);
    await expect(lista.locator('.card-turma')).toContainText('Turma E09 Confirmada');
    await expect(page.locator('#totalTurmasDesk')).toContainText('1 Turmas');
    await expect.poll(() => consultasDeRanking).toBe(2);
    await expect.poll(() => consultasDeCategoria).toBe(2);
});

test.describe('E09 estado de ranking do aluno', () => {
    let aluno = null;

    test.beforeAll(async ({ request }) => {
        aluno = await criarAlunoParaRanking(request);
    });

    test('403 de ranking não publicado fica distinto de falha do servidor e oferece nova tentativa', async ({ page }) => {
        await entrarAlunoEAceitarTermos(page, aluno);

        const caminhoRanking = `aluno/ranking?id=${aluno.idInterclasse}`;
        const respostaBloqueioPromise = page.waitForResponse((response) => {
            const url = new URL(response.url());
            return response.request().method() === 'GET'
                && url.pathname.endsWith('/api/v1/ranking')
                && url.searchParams.get('id_interclasse') === String(aluno.idInterclasse);
        });
        await page.goto(caminhoRanking, { waitUntil: 'domcontentloaded' });
        const respostaBloqueio = await respostaBloqueioPromise;
        expect(respostaBloqueio.status()).toBe(403);
        expect((await respostaBloqueio.json()).bloqueado).toBe(true);
        await expect(page.locator('#listaDesk')).toContainText('Ranking Oculto');
        await expect(page.locator('#msgDesk')).not.toContainText(/erro ao conectar|indisponível/i);

        await page.route('**/api/v1/ranking**', async (route) => {
            const url = new URL(route.request().url());
            if (route.request().method() === 'GET' && url.pathname.endsWith('/api/v1/ranking')) {
                await route.fulfill({
                    status: 503,
                    contentType: 'application/json',
                    body: JSON.stringify({ success: false, message: 'Não foi possível processar o ranking.' }),
                });
                return;
            }
            await route.continue();
        });

        const respostaFalhaPromise = page.waitForResponse((response) => {
            const url = new URL(response.url());
            return response.request().method() === 'GET'
                && url.pathname.endsWith('/api/v1/ranking')
                && url.searchParams.get('id_interclasse') === String(aluno.idInterclasse);
        });
        await page.reload({ waitUntil: 'domcontentloaded' });
        const respostaFalha = await respostaFalhaPromise;
        expect(respostaFalha.status()).toBe(503);
        await expect(page.locator('#listaDesk')).not.toContainText('Ranking Oculto');
        await expect(page.locator('#msgDesk')).toContainText(/Não foi possível carregar|servidor.*indisponível/i);
        await expect(page.getByRole('button', { name: /Tentar novamente/i })).toBeVisible();
    });
});
