const { test, expect } = require('./fixtures.cjs');
const {
    buscarPrimeiroJogoPlanejado,
    garantirCronogramaPublicado,
    garantirOperacaoLiberada,
} = require('./cronograma-fixture-helper.cjs');

const COMPACT_VIEWPORTS = [
    { width: 640, height: 360 },
    { width: 800, height: 360 },
    { width: 915, height: 412 },
];

async function assertNoDocumentOverflow(page) {
    const metrics = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
}

async function entrarMesario(page) {
    await page.goto('login', { waitUntil: 'domcontentloaded' });
    const mobileForm = page.locator('#form_mobile');
    const form = (await mobileForm.isVisible()) ? mobileForm : page.locator('#form_desktop');
    await form.locator('.ipt-matricula').fill('mesario');
    await form.locator('.ipt-senha').fill('123');
    await form.locator('button[type="submit"]').click();
    await page.waitForURL(/painel\?id=\d+/, { waitUntil: 'domcontentloaded' });
}

test.describe('Responsividade homologada — celular Xiaomi horizontal e desktop Full HD', () => {
    test('alterna entre as duas composições somente no limite de 1200px', async ({ page }) => {
        for (const viewport of COMPACT_VIEWPORTS) {
            await page.setViewportSize(viewport);
            await page.goto('login', { waitUntil: 'domcontentloaded' });
            await expect(page.locator('#form_mobile')).toBeVisible();
            await expect(page.locator('.login-mobile-layout')).toHaveCSS('display', 'flex');
            await expect(page.locator('#form_desktop')).toBeHidden();
            const formBox = await page.locator('#form_mobile').boundingBox();
            expect(formBox).not.toBeNull();
            expect(formBox.y).toBeLessThan(viewport.height);
            expect(formBox.y + formBox.height).toBeLessThanOrEqual(viewport.height + 1);
            await assertNoDocumentOverflow(page);
        }

        await page.setViewportSize({ width: 1200, height: 900 });
        await page.goto('login', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#form_desktop')).toBeVisible();
        await expect(page.locator('#form_mobile')).toBeHidden();
        await assertNoDocumentOverflow(page);

        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.goto('login', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#form_desktop')).toBeVisible();
        await assertNoDocumentOverflow(page);
    });

    test('mantém o shell do mesário operável em paisagem estreita e não duplica a montagem', async ({ page, request }) => {
        test.setTimeout(120_000);
        await page.setViewportSize({ width: 640, height: 360 });
        await entrarMesario(page);

        await expect(page.locator('#conteudo-principal')).toBeVisible();
        const menuTrigger = page.locator('.sgi-mobile-menu-trigger');
        const mobileMenu = page.locator('#sgiMobileMenu');
        await expect(menuTrigger).toBeVisible();
        const triggerRect = await menuTrigger.boundingBox();
        expect(triggerRect.width).toBeGreaterThanOrEqual(48);
        expect(triggerRect.height).toBeGreaterThanOrEqual(48);
        await expect(page.locator('.sidebar-nav')).toBeHidden();
        await menuTrigger.click();
        await expect(mobileMenu).toBeVisible();
        await expect(mobileMenu.locator('.sgi-mobile-menu-link')).toHaveCount(6);
        const menuLinkHeights = await mobileMenu.locator('.sgi-mobile-menu-link').evaluateAll((links) => links.map((link) => link.getBoundingClientRect().height));
        for (const height of menuLinkHeights) expect(height).toBeGreaterThanOrEqual(48);
        await expect(mobileMenu).toContainText(/Agenda|Dashboard|Sair/);
        await mobileMenu.locator('[data-bs-dismiss="offcanvas"]').click();
        await expect(mobileMenu).toBeHidden();
        await assertNoDocumentOverflow(page);

        const url = new URL(page.url());
        const idInterclasse = url.searchParams.get('id');
        const login = await request.post('api/v1/login', { data: { matricula: 'admin', senha: '123' } });
        if (!login.ok()) throw new Error(`login de preparação: HTTP ${login.status()}`);
        await garantirCronogramaPublicado(request, Number(idInterclasse));
        await garantirOperacaoLiberada(request, Number(idInterclasse));
        const modalidades = await (await request.get(`api/v1/modalidades?id_interclasse=${idInterclasse}`)).json();
        const modalidadesColetivas = (Array.isArray(modalidades) ? modalidades : []).filter((item) =>
            String(item.status_modalidade) === '1'
            && String(item.nome_tipo_modalidade || '').toLowerCase().includes('mata')
        );
        if (modalidadesColetivas.length === 0) throw new Error('fixture responsivo sem modalidade coletiva');
        const { jogo } = await buscarPrimeiroJogoPlanejado(request, modalidadesColetivas);

        await page.evaluate((idJogo) => {
            window.__SGI_SPA__.navegarPara('jogos', { id_jogo: idJogo, origem: 'agenda_edit' });
        }, Number(jogo.id_jogo));
        await expect(page.locator('#placar-conteudo')).toBeVisible({ timeout: 20_000 });
        await expect(page.locator('#placar-grid')).toBeVisible();

        const placar = page.locator('#placar-grid');
        await expect(placar.locator('.mc-scoreboard-main')).toBeVisible();
        await expect(placar.locator('[data-partida-idx]')).toHaveCount(2);
        await expect(placar.locator('#timer-placar')).toBeVisible();

        const controlMetrics = await placar.locator('.btn-score').evaluateAll((buttons) => buttons.map((button) => {
            const rect = button.getBoundingClientRect();
            return { width: rect.width, height: rect.height };
        }));
        expect(controlMetrics.length).toBeGreaterThanOrEqual(4);
        for (const metric of controlMetrics) {
            expect(metric.width).toBeGreaterThanOrEqual(48);
            expect(metric.height).toBeGreaterThanOrEqual(48);
        }
        await assertNoDocumentOverflow(page);

        // A troca de viewport no mesmo ciclo não pode desmontar a partida nem
        // alterar a quantidade de equipes/controlos renderizados.
        await page.setViewportSize({ width: 1920, height: 1080 });
        await expect(placar.locator('.mc-scoreboard-main')).toBeVisible();
        await expect(placar.locator('[data-partida-idx]')).toHaveCount(2);
        await expect(page.locator('.sgi-mobile-menu-trigger')).toBeHidden();
        await expect(page.locator('.sgi-mobile-menu-trigger')).toHaveCSS('display', 'none');
        await expect(page.locator('.sidebar-nav')).toBeVisible();
        await assertNoDocumentOverflow(page);
        await page.setViewportSize({ width: 640, height: 360 });
        await expect(page.locator('.sgi-mobile-menu-trigger')).toBeVisible();
        await expect(page.locator('.sidebar-nav')).toBeHidden();

        // Reabrir a mesma rota não pode criar duas árvores de placar nem
        // multiplicar o botão de cada equipe.
        await page.evaluate((idJogo) => {
            window.__SGI_SPA__.navegarPara('jogos', { id_jogo: idJogo, origem: 'agenda_edit' });
        }, Number(jogo.id_jogo));
        await expect(placar.locator('[data-partida-idx]')).toHaveCount(2);
        await expect(page.locator('.btn-score')).toHaveCount(controlMetrics.length);
    });

    test('mantém agenda e chaveamento legíveis no modo compacto', async ({ page }) => {
        test.setTimeout(120_000);
        await page.setViewportSize({ width: 640, height: 360 });
        await entrarMesario(page);

        const idInterclasse = new URL(page.url()).searchParams.get('id');
        const telas = [
            {
                path: `edicoes/agenda?id=${idInterclasse}`,
                mobile: '.sgi-agenda-mobile',
                desktop: '.sgi-agenda-desktop',
            },
            {
                path: `chaveamento?id=${idInterclasse}`,
                mobile: '.sgi-chaveamento-mobile',
                desktop: '.sgi-chaveamento-desktop',
            },
        ];

        for (const tela of telas) {
            await page.goto(tela.path, { waitUntil: 'domcontentloaded' });
            await expect(page.locator(tela.mobile)).toBeVisible({ timeout: 20_000 });
            await expect(page.locator(tela.desktop)).toBeHidden();
            await assertNoDocumentOverflow(page);
        }

        const chaveamento = page.locator('.sgi-chaveamento-mobile');
        await expect(chaveamento.locator('#bracketAreaMob')).toBeVisible();
        const filtros = page.locator('#secaoJogosMob #filtroCategoriaJogosMob, #secaoJogosMob #inputBuscaJogoMob');
        for (const height of await filtros.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))) {
            expect(height).toBeGreaterThanOrEqual(48);
        }

        await page.goto(`edicoes/agenda?id=${idInterclasse}`, { waitUntil: 'domcontentloaded' });
        const agendaMobile = page.locator('.sgi-agenda-mobile');
        await expect(agendaMobile).toBeVisible({ timeout: 20_000 });
        for (const selector of ['#agenda-busca-mobile', '#agenda-select-mod-mobile', '#agenda-select-status-mobile']) {
            const box = await agendaMobile.locator(selector).boundingBox();
            expect(box.height).toBeGreaterThanOrEqual(48);
        }
        for (const height of await agendaMobile.locator('.bg-dark .btn').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))) {
            expect(height).toBeGreaterThanOrEqual(48);
        }
        await assertNoDocumentOverflow(page);

        await page.setViewportSize({ width: 1920, height: 1080 });
        await expect(page.locator('.sgi-agenda-desktop')).toBeVisible();
        await expect(page.locator('.sgi-agenda-mobile')).toBeHidden();
        await assertNoDocumentOverflow(page);
    });

    test('mantém Dashboard, lista de jogos e perfil na mesma composição compacta', async ({ page }) => {
        test.setTimeout(120_000);
        await page.setViewportSize({ width: 640, height: 360 });
        await entrarMesario(page);
        const idInterclasse = new URL(page.url()).searchParams.get('id');

        const dashboard = page.locator('#conteudo-principal .main-dashboard-layout');
        await expect(dashboard).toBeVisible();
        await expect(dashboard.locator('#linkAgenda i.bi-calendar3')).toHaveAttribute('aria-hidden', 'true');
        const dashboardCards = dashboard.locator('.row > [class*="col-"] .card');
        expect(await dashboardCards.count()).toBeGreaterThanOrEqual(2);
        for (const width of await dashboardCards.evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().width))) {
            expect(width).toBeLessThanOrEqual(320);
        }
        await assertNoDocumentOverflow(page);

        await page.goto(`jogos?id=${idInterclasse}`, { waitUntil: 'domcontentloaded' });
        const jogos = page.locator('.sgi-jogos-lista');
        await expect(jogos).toBeVisible({ timeout: 20_000 });
        const jogoCards = jogos.locator('#listaJogos > .col-12 .card');
        if (await jogoCards.count()) {
            const cardWidths = await jogoCards.evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().width));
            for (const width of cardWidths) expect(width).toBeLessThanOrEqual(320);
        }
        await assertNoDocumentOverflow(page);

        await page.goto(`perfil?id=${idInterclasse}`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('.sgi-perfil-mobile')).toBeVisible({ timeout: 20_000 });
        await expect(page.locator('.sgi-perfil-desktop')).toBeHidden();
        await assertNoDocumentOverflow(page);
    });
});
