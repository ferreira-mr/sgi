const { test, expect } = require('./fixtures.cjs');

async function entrarComoAdmin(page) {
    await page.goto('login', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#form_desktop')).toBeVisible();
    await page.locator('#form_desktop .ipt-matricula').fill('admin');
    await page.locator('#form_desktop .ipt-senha').fill('123');
    await page.locator('#form_desktop button[type="submit"]').click();
    await page.waitForURL(/\/(?:edicoes|painel)(?:\?|$)/, { timeout: 15_000 });
}

async function obterIdEdicao(page) {
    const edicoes = await page.evaluate(async () => {
        const resposta = await fetch(window.SGI_API_BASE + 'edicoes?regulamento=true');
        if (!resposta.ok) throw new Error(`Falha ao consultar edições: HTTP ${resposta.status}`);
        return resposta.json();
    });
    const lista = Array.isArray(edicoes) ? edicoes : [];
    const edicao = lista.find((item) => String(item.status_interclasse) === '1') || lista[0];
    if (!edicao) throw new Error('A regressão de acessibilidade precisa de uma edição de teste disponível.');
    return Number(edicao.id_interclasse);
}

async function esperarModalAberto(botao, modal) {
    const transicao = modal.evaluate((elemento) => new Promise((resolve) => {
        elemento.addEventListener('shown.bs.modal', resolve, { once: true });
    }));
    await botao.click();
    await transicao;
}

async function esperarModalFechado(modal) {
    await modal.locator('.modal-header .btn-close').click();
    await expect(modal).toBeHidden();
}

async function verificarControleRotulado(escopo, id, nome) {
    const controle = escopo.locator(`#${id}`);
    const rotulo = escopo.locator(`label[for="${id}"]`);
    await expect(controle).toHaveAccessibleName(nome);
    await expect(rotulo).toHaveCount(1);
    await expect.poll(() => rotulo.evaluate((elemento) => elemento.control?.id || null)).toBe(id);
}

test.describe('E03 — nomes acessíveis em pontuação, agenda e modalidades', () => {
    test.beforeEach(async ({ page }) => entrarComoAdmin(page));

    test('pontuação, filtros da agenda e modais de agendamento têm nomes associados', async ({ page }) => {
        const idEdicao = await obterIdEdicao(page);
        await page.goto(`edicoes/pontuacao?id=${idEdicao}&modo=view`, { waitUntil: 'domcontentloaded' });

        await verificarControleRotulado(page, 'pontos-1', 'Pontos do 1º lugar');
        await verificarControleRotulado(page, 'pontos-2', 'Pontos do 2º lugar');
        await verificarControleRotulado(page, 'pontos-3', 'Pontos do 3º lugar');
        await verificarControleRotulado(page, 'pontos-arr', 'Multiplicador por kg');

        await page.goto(`edicoes/agenda?id=${idEdicao}`, { waitUntil: 'domcontentloaded' });
        await page.setViewportSize({ width: 390, height: 844 });
        for (const selector of ['#btn-prev-mobile i.bi-chevron-left', '#btn-next-mobile i.bi-chevron-right']) {
            await expect(page.locator(selector)).toHaveAttribute('aria-hidden', 'true');
        }
        for (const [id, nome] of [
            ['select-mes', 'Mês da agenda'],
            ['select-ano', 'Ano da agenda'],
            ['agenda-busca-mobile', 'Buscar time ou modalidade'],
            ['agenda-select-mod-mobile', 'Filtrar por modalidade'],
            ['agenda-select-status-mobile', 'Filtrar por status'],
        ]) {
            await verificarControleRotulado(page, id, nome);
        }

        await page.setViewportSize({ width: 1440, height: 900 });
        for (const [id, nome] of [
            ['agenda-busca', 'Buscar time ou modalidade'],
            ['agenda-select-mod', 'Filtrar por modalidade'],
            ['agenda-select-status', 'Filtrar por status'],
        ]) {
            await verificarControleRotulado(page, id, nome);
        }

        const modalAutomatico = page.locator('#modalDatasAutomaticas');
        const abrirAutomatico = page.locator('.btn-trigger-datas-auto:visible').first();
        await esperarModalAberto(abrirAutomatico, modalAutomatico);
        const dialogoAutomatico = page.getByRole('dialog', { name: 'Agendamento automático' });
        await expect(dialogoAutomatico).toBeVisible();
        await dialogoAutomatico.locator('#seq-proximo-dia').evaluate((elemento) => elemento.classList.remove('d-none'));
        for (const [id, nome] of [
            ['auto-modalidade', 'Modalidade'],
            ['seq-data', 'Primeiro dia'],
            ['seq-inicio', 'Horário do primeiro jogo'],
            ['seq-fim', 'Limite para terminar os jogos'],
            ['seq-local', 'Local'],
            ['seq-duracao', 'Duração média de cada jogo (minutos)'],
            ['seq-proxima-data', 'Próximo dia'],
            ['seq-proxima-inicio', 'Horário inicial'],
            ['seq-proxima-fim', 'Limite'],
        ]) {
            await verificarControleRotulado(dialogoAutomatico, id, nome);
        }
        await page.keyboard.press('Escape');
        await expect(modalAutomatico).toBeHidden();

        await page.evaluate(() => bootstrap.Modal.getOrCreateInstance(
            document.getElementById('modalEditarJogoAgenda')
        ).show());
        const dialogoEdicao = page.getByRole('dialog', { name: 'Ajustar data, horário e local' });
        await expect(dialogoEdicao).toBeVisible();
        for (const [id, nome] of [
            ['edit-jogo-data', 'Data do jogo'],
            ['edit-jogo-inicio', 'Início'],
            ['edit-jogo-fim', 'Término'],
            ['edit-jogo-local', 'Local'],
        ]) {
            await verificarControleRotulado(dialogoEdicao, id, nome);
        }
        await esperarModalFechado(page.locator('#modalEditarJogoAgenda'));
    });

    test('formulários modais de criação nomeiam campos e diálogos', async ({ page }) => {
        const idEdicao = await obterIdEdicao(page);
        await page.goto(`edicoes/modalidades?id=${idEdicao}&modo=view`, { waitUntil: 'domcontentloaded' });

        const botaoNovaModalidade = page.getByRole('button', { name: /Nova Modalidade/ });
        const modalConfiguracao = page.locator('#exampleModal');
        await esperarModalAberto(botaoNovaModalidade, modalConfiguracao);
        const dialogoConfiguracao = page.getByRole('dialog', { name: 'Criar nova Modalidade' });
        await expect(dialogoConfiguracao).toBeVisible();
        for (const [id, nome] of [
            ['inputNomeModalidade', 'Nome da Modalidade:'],
            ['inputGeneroModalidade', 'Gênero:'],
            ['inputMaxInscritos', 'Máx. de Inscritos (Opcional):'],
            ['inputMaxEquipes', 'Máx. de Equipes por Turma (Opcional):'],
            ['inputTipoModalidade', 'Tipo de Modalidade:'],
            ['inputCategoriaModalidade', 'Categoria:'],
        ]) {
            await verificarControleRotulado(dialogoConfiguracao, id, nome);
        }
        await esperarModalFechado(modalConfiguracao);

        const botaoDestaques = page.getByRole('button', { name: /Estudantes em destaque/ });
        const modalDestaques = page.locator('#modalDestaques');
        await esperarModalAberto(botaoDestaques, modalDestaques);
        await expect(page.getByRole('dialog', { name: 'Estudantes em destaque' })).toBeVisible();
        await esperarModalFechado(modalDestaques);

        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(`modalidades?id=${idEdicao}`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#acoesModalidadesMobile i.bi-plus-lg')).toHaveAttribute('aria-hidden', 'true');
        const gatilhoMobile = page.getByRole('button', { name: 'Adicionar modalidade' });
        const modalCompeticao = page.locator('#modalCriarModalidade');
        await esperarModalAberto(gatilhoMobile, modalCompeticao);
        const dialogoCompeticao = page.getByRole('dialog', { name: 'Criar nova Modalidade' });
        await expect(dialogoCompeticao).toBeVisible();
        for (const [id, nome] of [
            ['inputNomeModalidade', 'Nome da Modalidade:'],
            ['inputGeneroModalidade', 'Gênero:'],
            ['inputMaxInscritos', 'Máx. de Inscritos (Opcional):'],
            ['inputTipoModalidade', 'Tipo de Modalidade:'],
            ['inputCategoriaModalidade', 'Categoria:'],
        ]) {
            await verificarControleRotulado(dialogoCompeticao, id, nome);
        }
        await page.keyboard.press('Escape');
        await expect(modalCompeticao).toBeHidden();
    });
});
