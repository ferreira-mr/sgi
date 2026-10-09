const { test, expect, request: requestFactory } = require('./fixtures.cjs');

async function jsonOrThrow(response, label) {
    if (!response.ok()) {
        throw new Error(`${label}: HTTP ${response.status()} ${await response.text()}`);
    }
    return response.json();
}

async function loginAdmin(page) {
    await page.goto('login', { waitUntil: 'domcontentloaded' });
    await page.locator('#form_desktop .ipt-matricula').fill('admin');
    await page.locator('#form_desktop .ipt-senha').fill('123');
    await page.locator('#form_desktop button[type="submit"]').click();
    await expect(page).not.toHaveURL(/\/login(?:\?|$)/, { timeout: 15_000 });
}

async function criarFixtures(request) {
    await jsonOrThrow(await request.post('api/v1/login', {
        data: { matricula: 'admin', senha: '123' },
    }), 'login administrativo para fixtures E05');

    const edicoes = await jsonOrThrow(
        await request.get('api/v1/edicoes?regulamento=true'),
        'consulta de edições para fixtures E05',
    );
    const edicao = (Array.isArray(edicoes) ? edicoes : [])
        .find((item) => String(item.status_interclasse) === '1')
        || (Array.isArray(edicoes) ? edicoes[0] : null);
    if (!edicao) throw new Error('Nenhuma edição disponível para os fixtures E05.');

    const turmas = await jsonOrThrow(
        await request.get(`api/v1/turmas?id_interclasse=${Number(edicao.id_interclasse)}`),
        'consulta de turmas para fixture E05',
    );
    const turma = Array.isArray(turmas) && turmas.length ? turmas[0] : null;
    if (!turma) throw new Error('Nenhuma turma disponível para os fixtures E05.');

    const matriculaAluno = `56${Date.now().toString().slice(-7)}`;
    const aluno = await jsonOrThrow(await request.post('api/v1/usuarios?acao=criar_aluno', {
        data: {
            nome_usuario: 'Aluno E05 Seleção Acessível',
            matricula_usuario: matriculaAluno,
            genero_usuario: 'MASC',
            data_nasc_usuario: '2008-07-20',
            turmas_id_turma: Number(turma.id_turma),
        },
    }), 'criação do aluno para seleção E05');
    if (aluno.status !== 'sucesso' || !aluno.senha_temporaria) {
        throw new Error(`Falha ao criar o aluno para seleção E05: ${JSON.stringify(aluno)}`);
    }

    // Staff registration follows the existing digits-only normalization rule.
    const matriculaColaborador = `58${Date.now().toString().slice(-8)}`;
    const colaborador = await jsonOrThrow(await request.post('api/v1/usuarios?acao=cadastrar_usuario', {
        data: {
            nome_usuario: 'Colaborador E05 senha preservada',
            matricula_usuario: matriculaColaborador,
            senha_usuario: 'E05SenhaOriginal#2026',
            data_nasc_usuario: '1990-01-01',
            genero_usuario: 'MASC',
        },
    }), 'criação do colaborador para senha E05');
    if (colaborador.status !== 'sucesso' || Number(colaborador.id_usuario) <= 0) {
        throw new Error(`Falha ao criar colaborador E05: ${JSON.stringify(colaborador)}`);
    }

    return {
        idInterclasse: Number(edicao.id_interclasse),
        idTurma: Number(turma.id_turma),
        idCategoria: Number(turma.categorias_id_categoria),
        aluno: {
            id: Number(aluno.id_usuario),
            matricula: matriculaAluno,
            password: String(aluno.senha_temporaria),
        },
        colaborador: {
            id: Number(colaborador.id_usuario),
            matricula: matriculaColaborador,
            password: 'E05SenhaOriginal#2026',
        },
    };
}

async function loginStudentAndAcceptTerms(page, student) {
    await page.goto('login', { waitUntil: 'domcontentloaded' });
    await page.locator('#form_desktop .ipt-matricula').fill(student.matricula);
    await page.locator('#form_desktop .ipt-senha').fill(student.password);
    await page.locator('#form_desktop button[type="submit"]').click();
    await page.waitForURL(/\/aluno\/trocar-senha/, { timeout: 15_000 });

    student.password = 'E05Aluno#2026';
    await page.locator('#novaSenhaPrimeiroAcesso').fill(student.password);
    await page.locator('#confirmarSenhaPrimeiroAcesso').fill(student.password);
    await page.locator('#btnSalvarSenhaPrimeiroAcesso').click();
    await page.waitForURL(/\/aluno\/termos/, { timeout: 15_000 });
    await page.locator('#btnAceitarTermos').click();
    await page.waitForURL(/\/aluno\/inicio/, { timeout: 15_000 });
}

async function escolherEquipePeloTeclado(page, card) {
    const modal = page.locator('#modalEquipes');
    const modalMostrado = modal.evaluate((element) => new Promise((resolve) => {
        element.addEventListener('shown.bs.modal', resolve, { once: true });
    }));
    await card.focus();
    await page.keyboard.press('Enter');
    await modalMostrado;

    const equipe = modal.locator('.equipe-pick-row').first();
    await expect(equipe).toBeVisible();
    await equipe.focus();
    await page.keyboard.press('Enter');
    await expect(modal).toBeHidden();
}

test.describe('E05 — seleção, vínculo de alunos e senhas de colaboradores', () => {
    let fixture;

    test.beforeAll(async ({ request }) => {
        fixture = await criarFixtures(request);
    });

    test.afterAll(async ({ request }) => {
        if (!fixture) return;
        await request.post('api/v1/login', { data: { matricula: 'admin', senha: '123' } });
        if (fixture.colaborador?.id) {
            await request.post('api/v1/usuarios?acao=excluir_colaborador', {
                data: { id_usuario: fixture.colaborador.id },
            });
        }
        if (fixture.aluno?.id) {
            await request.post('api/v1/usuarios?acao=excluir_aluno', {
                data: { id_usuario: fixture.aluno.id },
            });
        }
    });

    test('inscrições anunciam elegibilidade, equipe escolhida, lotação e limite de três por teclado', async ({ page }) => {
        await loginStudentAndAcceptTerms(page, fixture.aluno);

        const category = fixture.idCategoria;
        const modalities = [
            {
                id_modalidade: 9601,
                nome_modalidade: 'Futsal E05',
                nome_categoria: 'Sub-15 E05',
                genero_modalidade: 'MASC',
                categorias_id_categoria: category,
                status_modalidade: '1',
                max_inscrito_modalidade: '8',
                max_equipes: '2',
                qtd_inscritos_turma: '1',
            },
            {
                id_modalidade: 9602,
                nome_modalidade: 'Vôlei E05 poucas vagas',
                nome_categoria: 'Sub-15 E05',
                genero_modalidade: 'MASC',
                categorias_id_categoria: category,
                status_modalidade: '1',
                max_inscrito_modalidade: '4',
                max_equipes: '1',
                qtd_inscritos_turma: '3',
            },
            {
                id_modalidade: 9603,
                nome_modalidade: 'Basquete E05',
                nome_categoria: 'Sub-15 E05',
                genero_modalidade: 'MASC',
                categorias_id_categoria: category,
                status_modalidade: '1',
                max_inscrito_modalidade: '8',
                max_equipes: '2',
                qtd_inscritos_turma: '2',
            },
            {
                id_modalidade: 9604,
                nome_modalidade: 'Xadrez E05 limite',
                nome_categoria: 'Sub-15 E05',
                genero_modalidade: 'MASC',
                categorias_id_categoria: category,
                status_modalidade: '1',
                max_inscrito_modalidade: '8',
                max_equipes: '2',
                qtd_inscritos_turma: '0',
            },
            {
                id_modalidade: 9605,
                nome_modalidade: 'Handebol E05 lotado',
                nome_categoria: 'Sub-15 E05',
                genero_modalidade: 'MASC',
                categorias_id_categoria: category,
                status_modalidade: '1',
                max_inscrito_modalidade: '4',
                max_equipes: '1',
                qtd_inscritos_turma: '4',
            },
            {
                id_modalidade: 9606,
                nome_modalidade: 'Vôlei feminino E05 inelegível',
                nome_categoria: 'Sub-15 E05',
                genero_modalidade: 'FEM',
                categorias_id_categoria: category,
                status_modalidade: '1',
                max_inscrito_modalidade: '8',
                max_equipes: '2',
                qtd_inscritos_turma: '0',
            },
        ];

        await page.route((url) => url.pathname.endsWith('/api/v1/modalidades'), async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(modalities),
            });
        });
        await page.route((url) => url.pathname.endsWith('/api/v1/equipes'), async (route) => {
            const url = new URL(route.request().url());
            if (route.request().method() === 'GET' && url.searchParams.has('id_modalidade')) {
                const id = Number(url.searchParams.get('id_modalidade'));
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify([{
                        id_equipe: 9700 + id,
                        nome_equipe: `Equipe E05 ${id}`,
                    }]),
                });
                return;
            }
            await route.continue();
        });

        await page.goto(`aluno/modalidades?id=${fixture.idInterclasse}`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#modalidadesGrid .modalidade-card')).toHaveCount(5);
        await expect(page.locator('#modalidadesGrid')).not.toContainText('Vôlei feminino E05 inelegível');
        await expect(page.getByText(/categoria.*g[eê]nero|g[eê]nero.*categoria/i).first()).toBeVisible();

        const futsal = page.locator('.modalidade-card').filter({ hasText: 'Futsal E05' });
        const volei = page.locator('.modalidade-card').filter({ hasText: 'Vôlei E05 poucas vagas' });
        const basquete = page.locator('.modalidade-card').filter({ hasText: 'Basquete E05' });
        const quarta = page.locator('.modalidade-card').filter({ hasText: 'Xadrez E05 limite' });
        const lotada = page.locator('.modalidade-card').filter({ hasText: 'Handebol E05 lotado' });

        for (const card of [futsal, volei, basquete, quarta, lotada]) {
            await expect(card).toHaveAttribute('aria-pressed', 'false');
            await expect(card).toHaveAccessibleName(/Sub-15 E05/i);
        }
        await expect(volei).toContainText(/Poucas vagas/i);
        await expect(volei).toHaveAccessibleName(/Poucas vagas/i);
        await expect(volei).toContainText('Capacidade da turma: 4 vagas; 1 vaga restante.');
        await expect(volei).toHaveAccessibleDescription(/Capacidade da turma: 4 vagas/);
        await expect(lotada).toContainText('Lotado');
        await expect(lotada).toHaveAccessibleName(/Lotado/i);
        await expect(lotada).toContainText('Capacidade da turma: 4 vagas. Não há vagas restantes.');
        await expect(lotada).toBeDisabled();

        await escolherEquipePeloTeclado(page, futsal);
        await expect(futsal).toHaveAttribute('aria-pressed', 'true');
        await expect(futsal).toContainText('Equipe: Equipe E05 9601');
        await expect(futsal).toHaveAccessibleName(/Equipe: Equipe E05 9601/i);

        await escolherEquipePeloTeclado(page, volei);
        await expect(volei).toHaveAttribute('aria-pressed', 'true');
        await escolherEquipePeloTeclado(page, basquete);
        await expect(basquete).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('#progressCount')).toHaveText('3 de 3');

        await quarta.focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('#msgFeedback')).toContainText(/máximo|3 modalidades/i);
        await expect(quarta).toHaveAttribute('aria-pressed', 'false');
        await expect(page.locator('#progressCount')).toHaveText('3 de 3');
    });

    test('lista de equipe nomeia alunos, conta novos selecionados e mantém os existentes ao desmarcar', async ({ page }) => {
        const fixtureRoster = {
            team: {
                id_equipe: 9804,
                nome_equipe: 'Equipe E05',
                genero_modalidade: 'MISTO',
            },
            students: [
                { id_usuario: 9801, nome_usuario: 'Ana E05', matricula_usuario: 'E05-9801', genero_usuario: 'FEM', inscrito: 1 },
                { id_usuario: 9802, nome_usuario: 'Alexandre Albuquerque Fonseca de Alcântara', matricula_usuario: 'E05-9802', genero_usuario: 'MASC', inscrito: 1 },
                { id_usuario: 9803, nome_usuario: 'Bianca já vinculada E05', matricula_usuario: 'E05-9803', genero_usuario: 'FEM', inscrito: 1 },
            ],
        };
        let bodyEnviado = null;

        await loginAdmin(page);
        await page.route('**/api/v1/**', async (route) => {
            const url = new URL(route.request().url());
            const params = url.searchParams;
            const action = params.get('acao');
            let payload = [];

            if (url.pathname.endsWith('/edicoes')) {
                payload = [{ id_interclasse: 9810, nome_interclasse: 'Interclasse E05', status_interclasse: '1' }];
            } else if (url.pathname.endsWith('/categorias')) {
                payload = [{ id_categoria: 9811, nome_categoria: 'Sub-15 E05', interclasses_id_interclasse: 9810 }];
            } else if (url.pathname.endsWith('/modalidades')) {
                payload = [{ id_modalidade: 9812, nome_modalidade: 'Futsal E05', genero_modalidade: 'MISTO', categorias_id_categoria: 9811, interclasses_id_interclasse: 9810, nome_categoria: 'Sub-15 E05' }];
            } else if (url.pathname.endsWith('/turmas')) {
                payload = [{ id_turma: 9813, nome_turma: 'Turma E05', nome_fantasia_turma: 'Lobos E05', turno_turma: 'Manhã', categorias_id_categoria: 9811, interclasses_id_interclasse: 9810, nome_categoria: 'Sub-15 E05' }];
            } else if (url.pathname.endsWith('/equipes') && route.request().method() === 'POST') {
                bodyEnviado = route.request().postDataJSON();
                payload = { success: true };
            } else if (url.pathname.endsWith('/equipes')) {
                payload = params.get('id_equipe') === String(fixtureRoster.team.id_equipe)
                    ? [fixtureRoster.students[2]]
                    : [];
            } else if (url.pathname.endsWith('/usuarios') && action === 'listar_competidores') {
                payload = { competidores: fixtureRoster.students };
            } else if (url.pathname.endsWith('/usuarios')) {
                payload = { status: 'sucesso', competidores: [] };
            } else {
                payload = { success: true };
            }

            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
        });

        await page.goto('equipes/alunos?id=9810&id_turma=9813&id_equipe=9804&id_categoria=9811&id_modalidade=9812', {
            waitUntil: 'domcontentloaded',
        });

        const ana = page.getByRole('checkbox', { name: 'Adicionar Ana E05, matrícula E05-9801 à equipe' });
        const alexandre = page.getByRole('checkbox', { name: 'Adicionar Alexandre Albuquerque Fonseca de Alcântara, matrícula E05-9802 à equipe' });
        const membro = page.getByRole('checkbox', { name: 'Bianca já vinculada E05, matrícula E05-9803, já vinculado à equipe' });
        const addOne = page.getByRole('button', { name: /Adicionar 1 estudante/i });
        const addTwo = page.getByRole('button', { name: /Adicionar 2 estudantes/i });

        await expect(ana).toBeVisible();
        await expect(alexandre).toBeVisible();
        await expect(membro).toBeChecked();
        await expect(membro).toBeDisabled();

        await ana.focus();
        await page.keyboard.press('Space');
        await expect(ana).toBeChecked();
        await expect(addOne).toBeVisible();
        await alexandre.focus();
        await page.keyboard.press('Space');
        await expect(alexandre).toBeChecked();
        await expect(addTwo).toBeVisible();
        await page.keyboard.press('Space');
        await expect(alexandre).not.toBeChecked();
        await expect(addOne).toBeVisible();
        await expect(membro).toBeChecked();

        await addOne.click();
        await expect.poll(() => bodyEnviado).not.toBeNull();
        expect(bodyEnviado).toMatchObject({ acao: 'adicionar_usuarios', id_equipe: 9804, usuarios: [9801] });
        expect(bodyEnviado.usuarios).not.toContain(9803);
        await expect(membro).toBeChecked();
    });

    test('senha de colaborador é mascarada e edição vazia preserva a senha atual', async ({ page, baseURL }) => {
        await loginAdmin(page);
        await page.goto(`colaboradores?id=${fixture.idInterclasse}&modo=view`, { waitUntil: 'domcontentloaded' });

        const abrirAdicionar = page.locator('button[data-bs-target="#modalAdicionarColaborador"]:visible');
        await abrirAdicionar.click();
        const modalAdicionar = page.locator('#modalAdicionarColaborador');
        await expect(modalAdicionar).toBeVisible();

        const senhaNova = modalAdicionar.locator('#novaSenhaColaborador');
        const mostrarNova = modalAdicionar.getByRole('button', { name: 'Mostrar senha' });
        await expect(senhaNova).toHaveAttribute('type', 'password');
        await expect(senhaNova).toHaveAttribute('autocomplete', 'new-password');
        await expect(mostrarNova).toHaveAttribute('aria-pressed', 'false');
        await mostrarNova.focus();
        await page.keyboard.press('Enter');
        await expect(senhaNova).toHaveAttribute('type', 'text');
        const ocultarNova = modalAdicionar.getByRole('button', { name: 'Ocultar senha' });
        await expect(ocultarNova).toBeVisible();
        await expect(ocultarNova).toHaveAttribute('aria-pressed', 'true');
        await page.keyboard.press('Space');
        await expect(senhaNova).toHaveAttribute('type', 'password');
        await expect(mostrarNova).toHaveAttribute('aria-pressed', 'false');

        await modalAdicionar.getByRole('button', { name: 'Cancelar' }).click();
        await expect(modalAdicionar).toBeHidden();

        const editTrigger = page.locator(`#listaColaboradoresDesktop button[data-editar="${fixture.colaborador.id}"]`);
        await expect(editTrigger).toBeVisible({ timeout: 15_000 });
        await editTrigger.click();
        const modalEditar = page.locator('#modalEditarColaborador');
        await expect(modalEditar).toBeVisible();

        const senhaEdicao = modalEditar.locator('#editSenhaColaborador');
        const mostrarEdicao = modalEditar.getByRole('button', { name: 'Mostrar senha' });
        await expect(senhaEdicao).toHaveAttribute('type', 'password');
        await expect(senhaEdicao).toHaveAttribute('autocomplete', 'new-password');
        await expect(senhaEdicao).toHaveValue('');
        await expect(mostrarEdicao).toHaveAttribute('aria-pressed', 'false');
        await mostrarEdicao.click();
        await expect(senhaEdicao).toHaveAttribute('type', 'text');
        const ocultarEdicao = modalEditar.getByRole('button', { name: 'Ocultar senha' });
        await expect(ocultarEdicao).toHaveAttribute('aria-pressed', 'true');
        await ocultarEdicao.click();
        await expect(senhaEdicao).toHaveAttribute('type', 'password');
        await expect(mostrarEdicao).toHaveAttribute('aria-pressed', 'false');

        const matricula = modalEditar.locator('#editNifColaborador');
        await modalEditar.locator('#editNomeColaborador').fill('Colaborador E05 senha preservada (editado)');
        await matricula.fill(fixture.colaborador.matricula);
        await modalEditar.getByRole('button', { name: 'Salvar', exact: true }).click();
        await expect(modalEditar).toBeHidden({ timeout: 10_000 });

        const collaboratorApi = await requestFactory.newContext({ baseURL });
        try {
            const login = await collaboratorApi.post('api/v1/login', {
                data: {
                    matricula: fixture.colaborador.matricula,
                    senha: fixture.colaborador.password,
                },
            });
            const payload = await jsonOrThrow(login, 'login do colaborador após edição vazia da senha');
            expect(payload.status).toBe('sucesso');
        } finally {
            await collaboratorApi.dispose();
        }
    });
});
