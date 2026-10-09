const { test, expect, request: playwrightRequest } = require('./fixtures.cjs');

async function jsonOrThrow(response, label) {
    if (!response.ok()) {
        throw new Error(`${label}: HTTP ${response.status()} ${await response.text()}`);
    }
    return response.json();
}

test.describe('Autenticação, RBAC e Segurança de Rotas', () => {

    test('rejeição de credenciais inválidas com feedback visual adequado em desktop e mobile', async ({ page }) => {
        await page.goto('login', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#form_desktop')).toBeVisible();

        // 1. Senha incorreta no desktop
        await page.locator('#form_desktop .ipt-matricula').fill('admin');
        await page.locator('#form_desktop .ipt-senha').fill('senha_errada_999');
        await page.locator('#form_desktop button[type="submit"]').click();

        await expect(page.locator('#msg_erro_desktop')).toBeVisible();
        await expect(page.locator('#msg_erro_desktop')).toContainText(/Matrícula ou Senha incorretos|incorretos/i);
        await expect(page).toHaveURL(/login(?:\?|$)/);

        // 2. Matrícula inexistente no desktop
        await page.locator('#form_desktop .ipt-matricula').fill('usuario_que_nao_existe_xyz');
        await page.locator('#form_desktop .ipt-senha').fill('123');
        await page.locator('#form_desktop button[type="submit"]').click();

        await expect(page.locator('#msg_erro_desktop')).toBeVisible();
        await expect(page.locator('#msg_erro_desktop')).toContainText(/Matrícula ou Senha incorretos|incorretos/i);

        // 3. Senha incorreta no formulário mobile
        await page.setViewportSize({ width: 390, height: 844 });
        await expect(page.locator('#form_mobile')).toBeVisible();

        await page.locator('#form_mobile .ipt-matricula').fill('admin');
        await page.locator('#form_mobile .ipt-senha').fill('senha_errada_mobile');
        await page.locator('#form_mobile button[type="submit"]').click();

        await expect(page.locator('#msg_erro_mobile')).toBeVisible();
        await expect(page.locator('#msg_erro_mobile')).toContainText(/Matrícula ou Senha incorretos|incorretos/i);
        await expect(page).toHaveURL(/login(?:\?|$)/);
    });

    test('proteção de rotas restritas para acessos anônimos', async ({ browser }) => {
        // Novo contexto sem cookies/sessão
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
            // Tenta acessar home administrativa sem login
            await page.goto('edicoes', { waitUntil: 'domcontentloaded' });
            await expect(page).toHaveURL(/login/);

            // Tenta acessar dashboard administrativa sem login
            await page.goto('painel?id=1', { waitUntil: 'domcontentloaded' });
            await expect(page).toHaveURL(/login/);

            // Tenta acessar ranking staff sem login
            await page.goto('ranking?id=1', { waitUntil: 'domcontentloaded' });
            await expect(page).toHaveURL(/login/);

            // Tenta acessar portal do aluno sem login
            await page.goto('aluno/inicio', { waitUntil: 'domcontentloaded' });
            await expect(page).toHaveURL(/login/);
        } finally {
            await context.close();
        }
    });

    test('mesário não pode abrir diretamente o gerenciamento de alunos da turma', async ({ page }) => {
        await page.goto('login', { waitUntil: 'domcontentloaded' });
        await page.locator('#form_desktop .ipt-matricula').fill('mesario');
        await page.locator('#form_desktop .ipt-senha').fill('123');
        await page.locator('#form_desktop button[type="submit"]').click();

        await page.waitForURL(/\/painel/, { timeout: 15_000 });
        for (const path of [
            'turmas/alunos?id=1&id_turma=1&id_categoria=1',
            'colaboradores',
            'edicoes/modalidades?id=1',
            'edicoes/pontuacao?id=1',
            'edicoes/equipes?id=1',
        ]) {
            await page.goto(path, { waitUntil: 'domcontentloaded' });
            await expect(page).toHaveURL(/\/painel(?:\?|$)/);
            await expect(page.locator('body')).not.toContainText('Estudantes da turma');
        }
    });

    test('aluno autenticado não pode acessar rotas da administração (RBAC)', async ({ page, request }) => {
        // Obter uma turma para vincular o aluno
        const adminLogin = await request.post('api/v1/login', {
            data: { matricula: 'admin', senha: '123' }
        });
        await jsonOrThrow(adminLogin, 'login de admin');

        const edicoesRes = await request.get('api/v1/edicoes?regulamento=true');
        const edicoes = await jsonOrThrow(edicoesRes, 'consulta edições');
        const edicaoAtiva = (Array.isArray(edicoes) ? edicoes : [])
            .find((item) => String(item.status_interclasse) === '1');
        if (!edicaoAtiva) throw new Error('Nenhuma edição ativa para o fixture RBAC.');
        const turmasRes = await request.get(`api/v1/turmas?id_interclasse=${Number(edicaoAtiva.id_interclasse)}`);
        const turmas = await jsonOrThrow(turmasRes, 'consulta turmas');
        const turma = Array.isArray(turmas) && turmas.length > 0 ? turmas[0] : null;
        const idTurma = turma ? Number(turma.id_turma) : 1;

        // Cria competidor efêmero
        const matriculaAluno = `88${Date.now().toString().slice(-7)}`;
        const aluno = await jsonOrThrow(await request.post('api/v1/usuarios?acao=criar_aluno', {
            data: {
                nome_usuario: 'Aluno RBAC Test',
                matricula_usuario: matriculaAluno,
                genero_usuario: 'MASC',
                data_nasc_usuario: '2009-05-15',
                turmas_id_turma: idTurma
            }
        }), 'criação do aluno');
        const senhaAluno = String(aluno.senha_temporaria || '');
        if (senhaAluno !== 'sesi-senai') throw new Error('A API não retornou a senha inicial compartilhada do aluno RBAC.');

        // Loga como aluno
        await page.goto('login', { waitUntil: 'domcontentloaded' });
        await page.locator('#form_desktop .ipt-matricula').fill(matriculaAluno);
        await page.locator('#form_desktop .ipt-senha').fill(senhaAluno);
        await page.locator('#form_desktop button[type="submit"]').click();

        await page.waitForURL(/\/aluno\/trocar-senha/, { timeout: 15_000 });
        await expect(page.locator('#formPrimeiroAcesso')).toBeVisible();
        await page.locator('#novaSenhaPrimeiroAcesso').fill('AlunoRbac#2026');
        await page.locator('#confirmarSenhaPrimeiroAcesso').fill('AlunoRbac#2026');
        await page.locator('#btnSalvarSenhaPrimeiroAcesso').click();
        await page.waitForURL(/\/aluno\/termos/, { timeout: 15_000 });
        await expect(page).toHaveURL(/\/aluno\/termos/);

        // Aluno tenta navegar para tela staff
        await page.goto('edicoes', { waitUntil: 'domcontentloaded' });
        // Deve ser bloqueado ou redirecionado para o portal de aluno / login
        await expect(page).not.toHaveURL(/edicoes$/);

        await page.goto('painel?id=1', { waitUntil: 'domcontentloaded' });
        await expect(page).not.toHaveURL(/painel/);
    });

    test('logout encerra sessão com segurança e impede reentrada pelo histórico', async ({ page }) => {
        // 1. Login como admin
        await page.goto('login', { waitUntil: 'domcontentloaded' });
        await page.locator('#form_desktop .ipt-matricula').fill('admin');
        await page.locator('#form_desktop .ipt-senha').fill('123');
        await page.locator('#form_desktop button[type="submit"]').click();

        await page.waitForURL(/\/edicoes/, { timeout: 15_000 });
        await expect(page.locator('#listaDesktop')).toBeVisible({ timeout: 15_000 });

        // 2. Acionar logout no menu de navegação visível
        const logoutLink = page.locator('a[href*="api/v1/logout"]:visible');
        await expect(logoutLink).toBeVisible();
        await logoutLink.click();
        await expect(page.getByRole('dialog')).toContainText(/Sair do SGI/i);
        await page.getByRole('dialog').getByRole('button', { name: 'Sair' }).click();

        // 3. Confirmar que redirecionou para tela de login
        await page.waitForURL(/login/, { timeout: 15_000 });
        await expect(page.locator('#form_desktop')).toBeVisible();

        // 4. Tentar acessar página interna diretamente após logout
        await page.goto('edicoes', { waitUntil: 'domcontentloaded' });
        await expect(page).toHaveURL(/login/);
    });

});
