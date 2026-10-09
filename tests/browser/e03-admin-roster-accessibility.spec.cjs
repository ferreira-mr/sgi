const { test, expect } = require('./fixtures.cjs');

const fixture = {
    edition: {
        id_interclasse: 901,
        nome_interclasse: 'Interclasse de teste E03',
        ano_interclasse: '2026-01-01',
        status_interclasse: '1',
    },
    category: {
        id_categoria: 903,
        nome_categoria: 'Sub-15',
        interclasses_id_interclasse: 901,
    },
    modality: {
        id_modalidade: 905,
        nome_modalidade: 'Futsal',
        genero_modalidade: 'MISTO',
        categorias_id_categoria: 903,
        interclasses_id_interclasse: 901,
        nome_categoria: 'Sub-15',
    },
    class: {
        id_turma: 902,
        nome_turma: 'Turma E03',
        nome_fantasia_turma: 'Lobos',
        turno_turma: 'Manhã',
        categorias_id_categoria: 903,
        interclasses_id_interclasse: 901,
        nome_categoria: 'Sub-15',
    },
    collaborators: [{
        id_usuario: 9901,
        nome_usuario: 'Colaboradora de teste',
        matricula_usuario: 'E03-9901',
        nivel_usuario: '1',
        genero_usuario: 'FEM',
    }, {
        id_usuario: 9904,
        nome_usuario: 'Administrador protegido',
        matricula_usuario: 'E03-9904',
        nivel_usuario: '0',
        genero_usuario: 'MASC',
    }],
    students: [
        { id_usuario: 9902, nome_usuario: 'Ana Pereira', matricula_usuario: 'E03-9902', genero_usuario: 'FEM', inscrito: 1 },
        { id_usuario: 9903, nome_usuario: 'Bia Lima', matricula_usuario: 'E03-9903', genero_usuario: 'FEM', inscrito: 1 },
    ],
};

async function responderApi(page) {
    await page.route('**/api/v1/**', async (route) => {
        const url = new URL(route.request().url());
        const params = url.searchParams;
        const action = params.get('acao');
        let payload = [];

        if (url.pathname.endsWith('/edicoes')) {
            payload = [fixture.edition];
        } else if (url.pathname.endsWith('/categorias')) {
            payload = [fixture.category];
        } else if (url.pathname.endsWith('/modalidades')) {
            payload = [fixture.modality];
        } else if (url.pathname.endsWith('/turmas')) {
            payload = params.has('id_turma') ? [fixture.class] : [fixture.class];
        } else if (url.pathname.endsWith('/equipes')) {
            payload = params.get('id_equipe') === '904' ? [fixture.students[1]] : [];
        } else if (url.pathname.endsWith('/usuarios') && action === 'listar_colaboradores') {
            payload = { status: 'sucesso', colaboradores: fixture.collaborators };
        } else if (url.pathname.endsWith('/usuarios') && action === 'listar_competidores') {
            payload = { competidores: fixture.students };
        } else if (url.pathname.endsWith('/usuarios')) {
            payload = { status: 'sucesso', competidores: [] };
        } else {
            payload = { success: true };
        }

        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(payload),
        });
    });
}

async function entrarComoAdmin(page) {
    await page.goto('login', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#form_desktop')).toBeVisible();
    await page.locator('#form_desktop .ipt-matricula').fill('admin');
    await page.locator('#form_desktop .ipt-senha').fill('123');
    await page.locator('#form_desktop button[type="submit"]').click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).not.toHaveURL(/login(?:\?|$)/, { timeout: 15_000 });
    await responderApi(page);
}

async function abrirDialog(page, acionador, seletorModal, nome) {
    const modal = page.locator(seletorModal);
    const mostrado = modal.evaluate((element) => new Promise((resolve) => {
        element.addEventListener('shown.bs.modal', resolve, { once: true });
    }));
    await acionador.click();
    await mostrado;
    await expect(page.getByRole('dialog', { name: nome })).toBeVisible();
    return modal;
}

async function fecharComEscape(page, modal, { restaurarFoco = false, acionador = null } = {}) {
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
    if (restaurarFoco && acionador) await expect(acionador).toBeFocused();
}

test.describe('E03 — formulários, modais e controles de equipe', () => {
    test.beforeEach(async ({ page }) => entrarComoAdmin(page));

    test('colaboradores associa campos e agrupa os papéis sem mudar opções administrativas', async ({ page }) => {
        await page.goto('colaboradores?id=901', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#listaColaboradoresDesktop article')).toHaveCount(2);
        await expect(page.locator('main.d-none.d-md-block').getByLabel('Pesquisar colaboradores')).toBeVisible();

        const abrirAdicionar = page.locator('button[data-bs-target="#modalAdicionarColaborador"]:visible');
        const modalAdicionar = await abrirDialog(
            page,
            abrirAdicionar,
            '#modalAdicionarColaborador',
            'Adicionar colaborador',
        );

        await expect(modalAdicionar.getByLabel('Nome', { exact: true })).toHaveAttribute('id', 'novoNomeColaborador');
        await expect(modalAdicionar.getByLabel('Email / Matrícula', { exact: true })).toHaveAttribute('id', 'novoNifColaborador');
        await expect(modalAdicionar.getByLabel('Senha', { exact: true })).toHaveAttribute('id', 'novaSenhaColaborador');
        await expect(modalAdicionar.getByLabel('Gênero', { exact: true })).toHaveAttribute('id', 'novoGeneroColaborador');
        await expect(modalAdicionar.getByRole('button', { name: 'Fechar janela Adicionar colaborador' })).toBeVisible();

        const papéis = modalAdicionar.getByRole('group', { name: 'Tipo de usuário' });
        await expect(papéis.getByRole('radio', { name: 'Administrador' })).toBeVisible();
        await expect(papéis.getByRole('radio', { name: 'Mesário' })).toBeChecked();
        await expect(papéis.getByRole('radio', { name: 'Colaborador' })).toBeVisible();

        await fecharComEscape(page, modalAdicionar, { restaurarFoco: true, acionador: abrirAdicionar });

        await expect(page.locator('#listaColaboradoresDesktop button[data-editar="9901"]'))
            .toHaveAttribute('aria-label', 'Editar colaborador Colaboradora de teste');
        await expect(page.locator('#listaColaboradoresDesktop button[data-remover="9901"]'))
            .toHaveAttribute('aria-label', 'Excluir colaborador Colaboradora de teste');
        await expect(page.locator('#listaColaboradoresDesktop button[data-editar="9904"]')).toHaveCount(0);
        await expect(page.locator('#listaColaboradoresDesktop button[data-remover="9904"]'))
            .toHaveAttribute('aria-label', 'Excluir colaborador Administrador protegido');
        await page.locator('#listaColaboradoresDesktop button[data-editar="9901"]').click();
        const modalEditar = page.locator('#modalEditarColaborador');
        await expect(page.getByRole('dialog', { name: 'Editar colaborador' })).toBeVisible();
        await expect(modalEditar.getByLabel('Nome', { exact: true })).toHaveAttribute('id', 'editNomeColaborador');
        await expect(modalEditar.getByLabel('Matrícula / NIF', { exact: true })).toHaveAttribute('id', 'editNifColaborador');
        await expect(modalEditar.getByLabel(/Nova senha/)).toHaveAttribute('id', 'editSenhaColaborador');
        await expect(modalEditar.getByRole('button', { name: 'Fechar janela Editar colaborador' })).toBeVisible();
    });

    test('modal de equipe e caixa de seleção anunciam turma e aluno sem alterar vínculo', async ({ page }) => {
        await page.goto('edicoes/equipes?id=901', { waitUntil: 'domcontentloaded' });
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Equipes');
        await page.setViewportSize({ width: 390, height: 844 });
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Equipes');
        await page.setViewportSize({ width: 1440, height: 900 });
        const abrirCriacao = page.getByRole('button', { name: 'Criar equipe', exact: true });
        const modalEquipe = await abrirDialog(
            page,
            abrirCriacao,
            '#modalCriarEquipe',
            'Criar nova equipe',
        );
        await expect(page.locator('#selectModalidadeEquipe option')).toHaveCount(2);
        await expect(modalEquipe.getByLabel('Modalidade')).toBeVisible();
        await expect(modalEquipe.getByLabel('Turma')).toBeVisible();
        await expect(modalEquipe.getByRole('button', { name: 'Salvar equipe' })).toBeVisible();
        await expect(modalEquipe.getByRole('button', { name: 'Fechar janela Criar nova equipe' })).toBeVisible();
        await fecharComEscape(page, modalEquipe, { restaurarFoco: true, acionador: abrirCriacao });

        await page.goto('equipes/alunos?id=901&id_turma=902&id_equipe=904&id_categoria=903&id_modalidade=905', {
            waitUntil: 'domcontentloaded',
        });
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Adicionar estudantes à equipe');
        const novoAluno = page.getByRole('checkbox', { name: 'Adicionar Ana Pereira, matrícula E03-9902 à equipe' });
        const membroExistente = page.getByRole('checkbox', { name: 'Bia Lima, matrícula E03-9903, já vinculado à equipe' });
        await expect(novoAluno).toBeVisible();
        await expect(membroExistente).toBeDisabled();
        await expect(membroExistente).toBeChecked();
        await expect(page.getByRole('button', { name: /Salvar estudantes selecionados na equipe/ })).toBeVisible();

        await novoAluno.check();
        await expect(novoAluno).toBeChecked();
        await page.setViewportSize({ width: 390, height: 844 });
        await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Adicionar estudantes à equipe');
        const novoAlunoMobile = page.getByRole('checkbox', { name: 'Adicionar Ana Pereira, matrícula E03-9902 à equipe' });
        await expect(novoAlunoMobile).toBeChecked();
        await novoAlunoMobile.uncheck();
        await expect(novoAlunoMobile).not.toBeChecked();
        await page.setViewportSize({ width: 1440, height: 900 });
        await expect(page.getByRole('checkbox', { name: 'Adicionar Ana Pereira, matrícula E03-9902 à equipe' })).not.toBeChecked();
        await expect(membroExistente).toBeChecked();
    });

    test('turmas e alunos expõem rótulos, títulos de diálogo e fechamento por Escape', async ({ page }) => {
        await page.goto('turmas?id=901', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#listaTurmasDesktop article')).toHaveCount(1);

        const abrirNovaTurma = page.getByRole('button', { name: 'Nova Turma', exact: true });
        const modalNovaTurma = await abrirDialog(page, abrirNovaTurma, '#exampleModal', /Criar nova Turma/i);
        await expect(modalNovaTurma.getByLabel('Nome da turma:')).toBeVisible();
        await expect(modalNovaTurma.getByLabel('Nome fantasia:')).toBeVisible();
        await expect(modalNovaTurma.getByLabel('Turno:')).toBeVisible();
        await expect(modalNovaTurma.getByLabel('Categoria:')).toBeVisible();
        await expect(modalNovaTurma.locator('label[for="arquivoUpload"]')).toHaveText('Selecionar PDF dos estudantes');
        await fecharComEscape(page, modalNovaTurma, { restaurarFoco: true, acionador: abrirNovaTurma });
        await expect(page.locator('.modal-backdrop')).toHaveCount(0);

        await expect(page.getByRole('button', { name: 'Editar turma Turma E03', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Excluir turma Turma E03', exact: true })).toBeVisible();
        await page.locator('#listaTurmasDesktop button[onclick^="editarTurma"]:visible').click();
        const modalEditarTurma = page.locator('#modalEditarTurma');
        await expect(page.getByRole('dialog', { name: 'Editar turma' })).toBeVisible();
        await expect(modalEditarTurma.getByLabel('Nome da turma:')).toBeVisible();
        await expect(modalEditarTurma.getByLabel('Nome fantasia:')).toBeVisible();
        await expect(modalEditarTurma.getByLabel('Turno:')).toBeVisible();
        await expect(modalEditarTurma.getByLabel('Categoria:')).toBeVisible();
        await expect(modalEditarTurma.getByRole('button', { name: 'Fechar janela Editar turma' })).toBeVisible();
        await modalEditarTurma.getByRole('button', { name: 'Fechar janela Editar turma' }).click();
        await expect(modalEditarTurma).toBeHidden();
        await expect(page.locator('.modal-backdrop')).toHaveCount(0);
        await expect(page.locator('#modalExcluirTurma')).toHaveAttribute('aria-labelledby', 'modalExcluirTurmaTitulo');

        await page.goto('turmas/alunos?id=901&id_turma=902&id_categoria=903', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#tbodyAlunosTurmaDesk tr')).toHaveCount(2);
        await expect(page.locator('main.d-none.d-md-block').getByLabel('Buscar estudante por nome ou RM')).toBeVisible();
        await expect(page.locator('main.d-md-none').getByLabel('Buscar estudante por nome ou RM')).toHaveCount(1);
        for (const sufixo of ['Mob', 'Desk']) {
            await expect(page.locator(`label[for="pdfInput${sufixo}"]`)).toHaveText('Selecionar PDF com a lista de estudantes para esta turma');
        }

        const verAluno = page.locator('#tbodyAlunosTurmaDesk button[data-sgi-action="view-student"][data-id-usuario="9902"]');
        await expect(verAluno).toHaveAttribute('aria-label', 'Visualizar estudante');
        await expect(page.locator('#tbodyAlunosTurmaDesk button[data-sgi-action="edit-student"][data-id-usuario="9902"]'))
            .toHaveAttribute('aria-label', 'Editar estudante Ana Pereira');
        await expect(page.locator('#tbodyAlunosTurmaDesk button[data-sgi-action="delete-student"][data-id-usuario="9902"]'))
            .toHaveAttribute('aria-label', 'Excluir estudante Ana Pereira');
        await expect(page.locator('#tbodyAlunosTurmaDesk button[data-sgi-action="edit-student"][data-id-usuario="9903"]'))
            .toHaveAttribute('aria-label', 'Editar estudante Bia Lima');
        await expect(page.locator('#tbodyAlunosTurmaDesk button[data-sgi-action="delete-student"][data-id-usuario="9903"]'))
            .toHaveAttribute('aria-label', 'Excluir estudante Bia Lima');
        const modalDetalhes = page.locator('#modalVerAluno');
        const detalhesMostrados = modalDetalhes.evaluate((element) => new Promise((resolve) => {
            element.addEventListener('shown.bs.modal', resolve, { once: true });
        }));
        await verAluno.click();
        await detalhesMostrados;
        await expect(page.getByRole('dialog', { name: 'Detalhes do estudante' })).toBeVisible();
        await expect(modalDetalhes).toBeFocused();
        await fecharComEscape(page, modalDetalhes, { restaurarFoco: true, acionador: verAluno });
        await expect(page.locator('#modalConfirmarExcluir')).toHaveAttribute('aria-labelledby', 'modalConfirmarExcluirTitulo');
        await expect(page.locator('#modalResetarSenha')).toHaveAttribute('aria-labelledby', 'modalResetarSenhaTitulo');

        const abrirAluno = page.locator('main.d-none.d-md-block button[onclick="abrirModalAluno()"]:visible');
        const modalAluno = page.locator('#modalAluno');
        const alunoMostrado = modalAluno.evaluate((element) => new Promise((resolve) => {
            element.addEventListener('shown.bs.modal', resolve, { once: true });
        }));
        await abrirAluno.click();
        await alunoMostrado;
        await expect(page.getByRole('dialog', { name: 'Adicionar estudante' })).toBeVisible();
        await expect(modalAluno.getByLabel('Nome completo')).toBeVisible();
        await expect(modalAluno.getByLabel('RM')).toBeVisible();
        await expect(modalAluno.getByLabel('Gênero')).toBeVisible();
        await expect(modalAluno.getByLabel('Data de nascimento')).toBeVisible();
        await expect(modalAluno.getByRole('button', { name: 'Fechar janela Estudante' })).toBeVisible();
        await fecharComEscape(page, modalAluno);
    });
});
