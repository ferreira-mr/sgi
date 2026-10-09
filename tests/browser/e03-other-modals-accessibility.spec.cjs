const { test, expect } = require('./fixtures.cjs');

async function entrarComoAdmin(page) {
    await page.goto('login', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#form_desktop')).toBeVisible();
    await page.locator('#form_desktop .ipt-matricula').fill('admin');
    await page.locator('#form_desktop .ipt-senha').fill('123');
    await page.locator('#form_desktop button[type="submit"]').click();
    await page.waitForURL(/\/edicoes/, { timeout: 15_000 });
}

async function idEdicao(page) {
    const edicoes = await page.evaluate(async () => {
        const resposta = await fetch('/api/v1/edicoes?regulamento=true');
        if (!resposta.ok) throw new Error(`Consulta de edições: HTTP ${resposta.status}`);
        return resposta.json();
    });
    const edicao = (Array.isArray(edicoes) ? edicoes : []).find((item) => String(item.status_interclasse) === '1')
        || (Array.isArray(edicoes) ? edicoes[0] : null);
    if (!edicao) throw new Error('O fixture não contém uma edição para abrir o formulário.');
    return Number(edicao.id_interclasse);
}

function aguardarEventoModal(modal, nomeEvento) {
    return modal.evaluate((element, evento) => new Promise((resolve) => {
        element.addEventListener(evento, resolve, { once: true });
    }), nomeEvento);
}

test('E03 associa a nova categoria ao rótulo visível no modal', async ({ page }) => {
    await entrarComoAdmin(page);
    const edicao = await idEdicao(page);
    await page.goto(`categorias?id=${edicao}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: 'Categorias' })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('heading', { level: 1, name: 'Categorias' })).toBeVisible();
    await page.screenshot({ path: 'test-results/ui-ux-audit-20260913/E03-categorias-mobile.png', fullPage: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: 'test-results/ui-ux-audit-20260913/E03-categorias-desktop.png', fullPage: true });

    const abrir = page.locator('button[data-bs-target="#modalCriarCategoria"]:visible').first();
    const elementoModalCriacao = page.locator('#modalCriarCategoria');
    const categoriaCriacaoMostrada = aguardarEventoModal(elementoModalCriacao, 'shown.bs.modal');
    await abrir.click();
    await categoriaCriacaoMostrada;
    const modal = page.getByRole('dialog', { name: 'Criar nova Categoria' });
    await expect(modal).toBeVisible();
    await page.screenshot({ path: 'test-results/ui-ux-audit-20260913/E03-modal-categoria.png', fullPage: true });
    const campo = modal.getByRole('textbox', { name: 'Nome da categoria' });
    await expect(campo).toBeVisible();
    await modal.getByText('Nome da categoria', { exact: true }).click();
    await expect(campo).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
    await expect(abrir).toBeFocused();

    const categoriaSelecionavel = page.locator('.categoria-item:visible').first();
    await expect(categoriaSelecionavel).toBeVisible();
    await categoriaSelecionavel.click();
    const abrirEdicaoCategoria = page.locator('#btnEditarCategoriaDesktop:visible');
    await expect(abrirEdicaoCategoria).toBeVisible();
    const elementoModalEdicao = page.locator('#modalEditarCategoria');
    const categoriaEdicaoMostrada = aguardarEventoModal(elementoModalEdicao, 'shown.bs.modal');
    await abrirEdicaoCategoria.click();
    await categoriaEdicaoMostrada;
    const modalEdicao = page.getByRole('dialog', { name: 'Editar Categoria' });
    await expect(modalEdicao).toBeVisible();
    const nomeEdicao = modalEdicao.getByRole('textbox', { name: 'Nome da categoria' });
    await expect(nomeEdicao).toBeVisible();
    await modalEdicao.getByText('Nome da categoria', { exact: true }).click();
    await expect(nomeEdicao).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(modalEdicao).toBeHidden();
    await expect(abrirEdicaoCategoria).toBeFocused();

    await page.goto(`edicoes/categorias?id=${edicao}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: 'Categorias' })).toBeVisible();
    const abrirConfiguracao = page.locator('button[data-bs-target="#modalCriarCategoria"]:visible').first();
    const categoriaConfiguracaoMostrada = aguardarEventoModal(elementoModalCriacao, 'shown.bs.modal');
    await abrirConfiguracao.click();
    await categoriaConfiguracaoMostrada;
    const modalConfiguracao = page.getByRole('dialog', { name: 'Criar nova Categoria' });
    await expect(modalConfiguracao.getByLabel('Nome da categoria')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(modalConfiguracao).toBeHidden();

    const categoriaConfigSelecionavel = page.locator('.categoria-item:visible').first();
    await expect(categoriaConfigSelecionavel).toBeVisible();
    await categoriaConfigSelecionavel.click();
    const abrirEdicaoConfig = page.locator('#btnEditarCategoriaDesktop:visible');
    await expect(abrirEdicaoConfig).toBeVisible();
    const categoriaEdicaoConfigMostrada = aguardarEventoModal(elementoModalEdicao, 'shown.bs.modal');
    await abrirEdicaoConfig.click();
    await categoriaEdicaoConfigMostrada;
    const modalEdicaoConfig = page.getByRole('dialog', { name: 'Editar Categoria' });
    await expect(modalEdicaoConfig).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(modalEdicaoConfig).toBeHidden();
    await expect(abrirEdicaoConfig).toBeFocused();

    await page.evaluate(() => bootstrap.Modal.getOrCreateInstance(document.getElementById('criarTurma')).show());
    const criarTurma = page.getByRole('dialog', { name: 'Criar nova Turma' });
    await expect(criarTurma).toBeVisible();
    await expect(criarTurma.getByLabel('Nome da turma:')).toBeVisible();
    await expect(criarTurma.getByLabel('Selecionar PDF dos estudantes')).toHaveAttribute('aria-describedby', 'descricaoArquivoUpload');
});

test('E03 nomeia a edição de modalidade e os campos do jogo', async ({ page }) => {
    await entrarComoAdmin(page);
    const edicao = await idEdicao(page);

    await page.goto(`modalidades/detalhes?id_modalidade=999999&id=${edicao}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: 'Detalhes da modalidade' })).toBeVisible();
    await page.evaluate(() => bootstrap.Modal.getOrCreateInstance(
        document.getElementById('modalEditarModalidade'),
    ).show());
    const modalidade = page.getByRole('dialog', { name: 'Editar Modalidade' });
    await expect(modalidade).toBeVisible();
    await page.screenshot({ path: 'test-results/ui-ux-audit-20260913/E03-modal-modalidade.png', fullPage: true });
    await expect(modalidade.getByLabel('Nome da modalidade')).toBeVisible();
    await expect(modalidade.getByLabel('Gênero')).toBeVisible();
    await expect(modalidade.getByLabel('Máximo de inscritos')).toBeVisible();
    await expect(modalidade.getByLabel('Máximo de equipes por turma')).toBeVisible();
    await expect(modalidade.getByLabel('Tipo de modalidade')).toBeVisible();
    await expect(modalidade.getByLabel('Categoria')).toBeVisible();

    await page.goto(`chaveamento?id=${edicao}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: 'Chaveamento' })).toBeVisible();
    await page.evaluate(() => bootstrap.Modal.getOrCreateInstance(
        document.getElementById('modalEditarJogo'),
    ).show());
    const jogo = page.getByRole('dialog', { name: 'Editar Jogo' });
    await expect(jogo).toBeVisible();
    await page.screenshot({ path: 'test-results/ui-ux-audit-20260913/E03-modal-jogo.png', fullPage: true });
    for (const nome of ['Data', 'Início', 'Término', 'Local', 'Status']) {
        await expect(jogo.getByLabel(nome)).toBeVisible();
    }

    await page.goto('perfil', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => bootstrap.Modal.getOrCreateInstance(document.getElementById('modalEditarPerfil')).show());
    await expect(page.getByRole('dialog', { name: 'Editar Perfil' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Editar Perfil' }).getByLabel('Nome')).toBeVisible();
    await page.evaluate(() => bootstrap.Modal.getOrCreateInstance(document.getElementById('modalAlterarSenha')).show());
    await expect(page.getByRole('dialog', { name: 'Alterar Senha' })).toBeVisible();
});

test('E03 rankings têm título de página e diálogos nomeados sem IDs repetidos', async ({ page }) => {
    await entrarComoAdmin(page);
    const edicao = await idEdicao(page);

    await page.goto(`ranking?id=${edicao}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: 'Ranking de Turmas' })).toBeVisible();
    await page.evaluate(() => bootstrap.Modal.getOrCreateInstance(
        document.getElementById('modalHistoricoTurma'),
    ).show());
    await expect(page.getByRole('dialog', { name: 'Histórico de Pontos' })).toBeVisible();
    await page.screenshot({ path: 'test-results/ui-ux-audit-20260913/E03-ranking-desktop.png', fullPage: true });
    expect(await page.locator('[id]').evaluateAll((elements) => {
        const ids = elements.filter((element) => element.getClientRects().length > 0).map((element) => element.id);
        return ids.length === new Set(ids).size;
    })).toBe(true);
});

test('E03 nomeia os formulários de edição e de locais', async ({ page }) => {
    await entrarComoAdmin(page);

    await page.goto('edicoes', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: 'Edições' })).toBeVisible();
    const abrirEdicao = page.locator('button[data-bs-target="#exampleModal"]:visible').first();
    const elementoNovaEdicao = page.locator('#exampleModal');
    const edicaoMostrada = aguardarEventoModal(elementoNovaEdicao, 'shown.bs.modal');
    await abrirEdicao.click();
    await edicaoMostrada;
    const novaEdicao = page.getByRole('dialog', { name: 'Criar nova Edição' });
    await expect(novaEdicao.getByLabel('Nome da edição')).toBeVisible();
    await expect(novaEdicao.getByLabel('Ano')).toBeVisible();
    await expect(novaEdicao.getByRole('button', { name: 'Fechar' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(novaEdicao).toBeHidden();
    await expect(abrirEdicao).toBeFocused();

    const edicao = await idEdicao(page);
    await page.goto(`edicoes/locais?id=${edicao}`, { waitUntil: 'domcontentloaded' });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('heading', { level: 1, name: 'Locais e Regulamento do Interclasse' })).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByRole('heading', { level: 1, name: 'Locais e Regulamento do Interclasse' })).toBeVisible();
    const abrirNovoLocal = page.locator('button[data-bs-target="#modalNovoLocal"]');
    const elementoNovoLocal = page.locator('#modalNovoLocal');
    const localMostrado = aguardarEventoModal(elementoNovoLocal, 'shown.bs.modal');
    await abrirNovoLocal.click();
    await localMostrado;
    const novoLocal = page.getByRole('dialog', { name: 'Novo local' });
    await expect(novoLocal.getByLabel('Nome do local')).toBeVisible();
    await expect(novoLocal.getByLabel('Disponível para uso')).toBeVisible();
    await expect(novoLocal.getByLabel('Capacidade (opcional)')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(novoLocal).toBeHidden();

    await page.evaluate(() => bootstrap.Modal.getOrCreateInstance(document.getElementById('modalEditarLocal')).show());
    const editarLocal = page.getByRole('dialog', { name: 'Atualizar Local' });
    await expect(editarLocal.getByLabel('Nome do Local')).toBeVisible();
    await expect(editarLocal.getByLabel('Disponível para uso')).toBeVisible();
    await expect(editarLocal.getByRole('button', { name: 'Fechar' })).toBeVisible();
});
