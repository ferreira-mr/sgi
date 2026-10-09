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

    const matricula = `61${Date.now().toString().slice(-7)}`;
    const aluno = await jsonOrThrow(await request.post('api/v1/usuarios?acao=criar_aluno', {
        data: {
            nome_usuario: 'Aluno E09 Recuperação de Inscrição',
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
        idCategoria: Number(turma.categorias_id_categoria),
        idUsuario: Number(aluno.id_usuario),
        matricula,
        senha: String(aluno.senha_temporaria),
        primeiroAcesso: true,
    };
}

async function entrarComoAluno(page, fixture) {
    await page.goto('login', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#form_desktop')).toBeVisible();
    await page.locator('#form_desktop .ipt-matricula').fill(fixture.matricula);
    await page.locator('#form_desktop .ipt-senha').fill(fixture.senha);
    await page.locator('#form_desktop button[type="submit"]').click();

    if (fixture.primeiroAcesso) {
        await page.waitForURL(/\/aluno\/trocar-senha/, { timeout: 15_000 });
        fixture.senha = 'AlunoE09#2026';
        await page.locator('#novaSenhaPrimeiroAcesso').fill(fixture.senha);
        await page.locator('#confirmarSenhaPrimeiroAcesso').fill(fixture.senha);
        await page.locator('#btnSalvarSenhaPrimeiroAcesso').click();
        await page.waitForURL(/\/aluno\/termos/, { timeout: 15_000 });
        await page.locator('#btnAceitarTermos').click();
        fixture.primeiroAcesso = false;
    }

    await page.waitForURL(/\/aluno\/inicio/, { timeout: 15_000 });
}

function edicaoAtiva(idInterclasse) {
    return {
        id_interclasse: idInterclasse,
        nome_interclasse: 'Edição E09 de recuperação',
        status_interclasse: '1',
    };
}

function listaModalidades(idCategoria) {
    return [
        {
            id_modalidade: 96901,
            nome_modalidade: 'Futsal E09 recuperação',
            nome_categoria: 'Categoria E09',
            genero_modalidade: 'MASC',
            categorias_id_categoria: idCategoria,
            status_modalidade: '1',
            max_inscrito_modalidade: '8',
            max_equipes: '2',
            qtd_inscritos_turma: '0',
        },
    ];
}

async function abrirInscricao(page, fixture) {
    await page.goto(`aluno/modalidades?id=${fixture.idInterclasse}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#modalidadesGrid')).toBeVisible();
}

function corresponderEndpoint(sufixo) {
    return (url) => new URL(url).pathname.endsWith(`/api/v1/${sufixo}`);
}

test.describe.serial('E09 — recuperação da inscrição em modalidades', () => {
    let fixture;

    test.beforeAll(async ({ request }) => {
        fixture = await prepararAluno(request);
    });

    test.afterAll(async ({ request }) => {
        if (!fixture) return;
        await request.post('api/v1/login', { data: { matricula: 'admin', senha: '123' } });
        await request.post('api/v1/usuarios?acao=excluir_aluno', {
            data: { id_usuario: fixture.idUsuario },
        });
    });

    test('HTTP 503 em edições mostra erro localizado e retry recupera a lista', async ({ page }) => {
        let consultas = 0;
        let caminhoEdicoes = null;
        let recuperacaoPermitida = false;
        await page.route(corresponderEndpoint('edicoes'), async (route) => {
            consultas += 1;
            caminhoEdicoes = new URL(route.request().url()).pathname;
            if (!recuperacaoPermitida) {
                await route.fulfill({
                    status: 503,
                    contentType: 'application/json',
                    body: JSON.stringify({ success: false, message: 'Falha temporária.' }),
                });
                return;
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([edicaoAtiva(fixture.idInterclasse)]),
            });
        });

        // Intercepte antes do login: a tela inicial do aluno consulta a mesma
        // URL e o offline-core poderia guardar um 200 antes do cenário de falha.
        await entrarComoAluno(page, fixture);
        await page.route(corresponderEndpoint('modalidades'), async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(listaModalidades(fixture.idCategoria)),
            });
        });

        await abrirInscricao(page, fixture);
        const grid = page.locator('#modalidadesGrid');
        await expect(grid).toContainText(/não foi possível carregar as modalidades/i);
        await expect(grid).not.toContainText('Nenhuma modalidade disponível');
        const retry = grid.getByRole('button', { name: /tentar novamente/i });
        await expect(retry).toBeVisible();
        const consultasAntesRetry = consultas;
        recuperacaoPermitida = true;
        await retry.click();

        await expect(grid.locator('.modalidade-card')).toContainText('Futsal E09 recuperação');
        await expect.poll(() => consultas).toBeGreaterThan(consultasAntesRetry);
        const apiBasePath = await page.evaluate(() => new URL(window.SGI_API_BASE, window.location.href).pathname);
        expect(caminhoEdicoes).toBe(`${apiBasePath}edicoes`);
    });

    test('HTML 200 em modalidades é erro; uma lista JSON vazia após retry é um estado vazio', async ({ page }) => {
        await entrarComoAluno(page, fixture);
        let consultas = 0;
        await page.route(corresponderEndpoint('edicoes'), async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([edicaoAtiva(fixture.idInterclasse)]),
            });
        });
        await page.route(corresponderEndpoint('modalidades'), async (route) => {
            consultas += 1;
            if (consultas === 1) {
                await route.fulfill({ status: 200, contentType: 'text/html', body: '<html>proxy indisponível</html>' });
                return;
            }
            await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        });

        await abrirInscricao(page, fixture);
        const grid = page.locator('#modalidadesGrid');
        await expect(grid).toContainText(/não foi possível carregar as modalidades/i);
        await grid.getByRole('button', { name: /tentar novamente/i }).click();
        await expect(grid).toContainText('Nenhuma modalidade disponível para sua categoria no momento.');
        await expect(grid).not.toContainText(/erro|tentar novamente/i);
        await expect.poll(() => consultas).toBe(2);
    });

    test('JSON inválido na lista de modalidades oferece retry sem apresentar vazio', async ({ page }) => {
        await entrarComoAluno(page, fixture);
        let consultas = 0;
        await page.route(corresponderEndpoint('edicoes'), async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([edicaoAtiva(fixture.idInterclasse)]),
            });
        });
        await page.route(corresponderEndpoint('modalidades'), async (route) => {
            consultas += 1;
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: consultas === 1 ? '{' : JSON.stringify(listaModalidades(fixture.idCategoria)),
            });
        });

        await abrirInscricao(page, fixture);
        const grid = page.locator('#modalidadesGrid');
        await expect(grid).toContainText(/não foi possível carregar as modalidades/i);
        await expect(grid).not.toContainText('Nenhuma modalidade disponível');
        await grid.getByRole('button', { name: /tentar novamente/i }).click();
        await expect(grid.locator('.modalidade-card')).toContainText('Futsal E09 recuperação');
        await expect.poll(() => consultas).toBe(2);
    });

    test('falha transitória de atualização mantém seleção de equipe e retry preserva a escolha', async ({ page }) => {
        await entrarComoAluno(page, fixture);
        let consultas = 0;
        let caminhoInscricoes = null;
        await page.route(corresponderEndpoint('edicoes'), async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([edicaoAtiva(fixture.idInterclasse)]),
            });
        });
        await page.route(corresponderEndpoint('modalidades'), async (route) => {
            consultas += 1;
            if (consultas === 2) {
                await route.fulfill({
                    // O offline-core usa a resposta GET em cache quando a rede
                    // retorna 5xx. Use uma recusa de protocolo para testar a
                    // preservação da escolha sem apagar o cache da aplicação.
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ success: false, message: 'Falha temporária.' }),
                });
                return;
            }
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(listaModalidades(fixture.idCategoria)),
            });
        });
        await page.route(corresponderEndpoint('equipes'), async (route) => {
            const params = new URL(route.request().url()).searchParams;
            if (params.has('id_modalidade')) {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([{ id_equipe: 96911, nome_equipe: 'Equipe E09 confirmada' }]),
                });
                return;
            }
            await route.continue();
        });
        await page.route(corresponderEndpoint('inscricoes'), async (route) => {
            caminhoInscricoes = new URL(route.request().url()).pathname;
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, message: 'Inscrição salva.' }),
            });
        });

        await abrirInscricao(page, fixture);
        const card = page.locator('#modalidadesGrid .modalidade-card').filter({ hasText: 'Futsal E09 recuperação' });
        await card.click();
        const dialog = page.getByRole('dialog', { name: /escolha a equipe/i });
        await expect(dialog).toBeVisible();
        await dialog.locator('.equipe-pick-row').filter({ hasText: 'Equipe E09 confirmada' }).click();
        await expect(card).toHaveAttribute('aria-pressed', 'true');
        await expect(card).toContainText('Equipe: Equipe E09 confirmada');

        await page.evaluate(() => window.carregarDados());
        const grid = page.locator('#modalidadesGrid');
        await expect(grid).toContainText(/não foi possível carregar as modalidades/i);
        await expect(card).toHaveAttribute('aria-pressed', 'true');
        await expect(card).toContainText('Equipe: Equipe E09 confirmada');
        await grid.getByRole('button', { name: /tentar novamente/i }).click();
        await expect(grid.locator('.js-erro-modalidades')).toBeHidden();
        const restoredCard = page.locator('#modalidadesGrid .modalidade-card').filter({ hasText: 'Futsal E09 recuperação' });
        await expect(restoredCard).toHaveAttribute('aria-pressed', 'true');
        await expect(restoredCard).toContainText('Equipe: Equipe E09 confirmada');
        await expect.poll(() => consultas).toBe(3);

        const apiBasePath = await page.evaluate(() => new URL(window.SGI_API_BASE, window.location.href).pathname);
        await expect(page.locator('#btnSalvar')).toBeEnabled();
        await page.locator('#btnSalvar').click();
        await expect(page.locator('#msgFeedback')).toContainText('Inscrição salva.');
        const appBasePath = await page.evaluate(() => String(window.SGI_BASE_PATH || '').replace(/\/+$/, ''));
        await page.waitForURL((url) => url.pathname === `${appBasePath}/aluno/inicio`, { timeout: 10_000 });
        expect(caminhoInscricoes).toBe(`${apiBasePath}inscricoes`);
    });
});
