const { test, expect } = require('./fixtures.cjs');

async function entrarComoAdmin(page) {
    await page.goto('login', { waitUntil: 'domcontentloaded' });
    await page.locator('#form_desktop .ipt-matricula').fill('admin');
    await page.locator('#form_desktop .ipt-senha').fill('123');
    await page.locator('#form_desktop button[type="submit"]').click();
    await page.waitForURL(/\/edicoes(?:\?|$)/, { timeout: 20_000 });
    return page.evaluate(async () => {
        const response = await fetch('/api/v1/edicoes?regulamento=true');
        if (!response.ok) throw new Error(`Consulta da edição ativa: HTTP ${response.status}`);
        const editions = await response.json();
        const edition = (Array.isArray(editions) ? editions : [])
            .find((item) => String(item.status_interclasse) === '1');
        if (!edition) throw new Error('O fixture autenticado não contém edição ativa.');
        return Number(edition.id_interclasse);
    });
}

async function instalarRotasDoPainel(page, state, { failures = [], invalidGenerations = [], httpFailures = [], networkFailures = [], generationGate = null } = {}) {
    const posts = [];
    let generations = 0;
    let failNextStateRead = false;
    await page.route('**/api/v1/modalidades*', (route) => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([{
            id_modalidade: 91001,
            interclasses_id_interclasse: state.id_interclasse,
            nome_modalidade: 'Futsal planejado fixture',
            nome_categoria: 'Sub-15',
            nome_tipo_modalidade: 'Mata-Mata',
            tipo_competicao: 'mata_mata',
        }]),
    }));
    await page.route('**/api/v1/locais*', (route) => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: [{ id_local: 91001, nome_local: 'Quadra fixture', disponivel_local: '1', status_local: '1' }] }),
    }));
    await page.route('**/api/v1/jogos*', (route) => route.fulfill({ contentType: 'application/json', body: '[]' }));
    await page.route('**/api/v1/cronograma*', async (route) => {
        if (route.request().method() === 'GET') {
            if (failNextStateRead) {
                failNextStateRead = false;
                await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'estado temporariamente indisponível' }) });
                return;
            }
            await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, ...state }) });
            return;
        }

        const body = route.request().postDataJSON();
        posts.push(body);
        let result = { success: true };
        if (body.acao === 'gerar_rascunho') {
            generations++;
            if (invalidGenerations.includes(generations)) {
                await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Proxy error</title>' });
                return;
            }
            if (httpFailures.includes(generations)) {
                await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Falha interna simulada.' }) });
                return;
            }
            if (networkFailures.includes(generations)) {
                await route.abort('timedout');
                return;
            }
            if (failures.includes(generations)) {
                result = {
                    success: false,
                    cronograma_versao: state.cronograma_versao,
                    nos: [],
                    compromissos: [],
                    pendencias: [{ tipo: 'janela', mensagem: 'A janela e os locais não comportam todos os compromissos.' }],
                };
            } else {
                if (generationGate) {
                    generationGate.reached();
                    await generationGate.resume;
                }
                result = {
                    success: true,
                    cronograma_versao: state.cronograma_versao,
                    nos: [{ id_modalidade: 91001, chave_tag: `PL:91001:1:MM:2:0:N`, tipo_no: 'normal', equipe_ids: [1, 2] }],
                    compromissos: [{ id_modalidade: 91001, id_equipe: 1, chave_tag: 'PL:91001:1:MM:2:0:N', id_local: 91001 }],
                    pendencias: [],
                };
            }
        } else if (body.acao === 'publicar') {
            expect(body.cronograma_versao).toBe(state.cronograma_versao);
            state.cronograma_status = 'publicado';
            state.cronograma_versao++;
            state.versao_publicada = state.cronograma_versao;
            state.inscricoes_status = 'fechadas';
            if (state.failAfterPublish) {
                state.failAfterPublish = false;
                failNextStateRead = true;
            }
        } else if (body.acao === 'revisar') {
            state.cronograma_status = 'revisao';
            state.inscricoes_status = 'fechadas';
            state.cronograma_versao++;
            result.equipes_incompletas = [];
        } else if (body.acao === 'abrir_inscricoes') {
            state.inscricoes_status = 'abertas';
        } else if (body.acao === 'encerrar_inscricoes') {
            state.inscricoes_status = 'encerradas';
        }
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify(result) });
    });
    return posts;
}

test('o mesmo painel permite vários ciclos de abrir, revisar, gerar e republicar', async ({ page }) => {
    const idInterclasse = await entrarComoAdmin(page);
    const state = {
        id_interclasse: idInterclasse,
        cronograma_status: 'publicado',
        inscricoes_status: 'abertas',
        cronograma_versao: 3,
        versao_publicada: 3,
        operacao_liberada: '0',
        modalidades: [{ id_modalidade: 91001, equipes_planejadas: 3 }],
        compromissos: [{ id_modalidade: 91001, chave_tag: 'PL:91001:1:MM:2:0:N' }],
        nos: [{ id_modalidade: 91001, chave_tag: 'PL:91001:1:MM:2:0:N', tipo_no: 'normal' }],
    };
    const posts = await instalarRotasDoPainel(page, state);
    await page.goto(`edicoes/agenda?id=${idInterclasse}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#painelCronogramaPlanejado')).toBeVisible({ timeout: 20_000 });

    await expect(page.locator('[data-sgi-step-indicator="5"]')).toHaveAttribute('aria-current', 'step');
    await expect(page.locator('[data-sgi-step-card="5"]')).toHaveClass(/sgi-step-card--active/);

    for (let cycle = 0; cycle < 3; cycle++) {
        if (cycle > 0) {
            await expect(page.locator('[data-sgi-step-indicator="4"]')).toHaveAttribute('aria-current', 'step');
            await expect(page.locator('#cronogramaAbrir')).toBeEnabled();
            await page.locator('#cronogramaAbrir').click();
            await expect(page.locator('[data-sgi-step-indicator="5"]')).toHaveAttribute('aria-current', 'step');
            await expect(page.locator('#cronogramaFechar')).toBeEnabled();
            await page.locator('#cronogramaFechar').click();
            await expect(page.locator('[data-sgi-step-indicator="6"]')).toHaveAttribute('aria-current', 'step');
        }
        await expect(page.locator('#cronogramaRevisar')).toBeEnabled();
        await page.locator('#cronogramaRevisar').click();
        await expect(page.locator('#cronogramaPlanejadoStatus')).toContainText('revisao');
        await expect(page.locator('[data-sgi-step-indicator="2"]')).toHaveAttribute('aria-current', 'step');
        await expect(page.locator('[data-sgi-step-meta="2"]')).toHaveText('Em revisão');
        await expect(page.locator('#cronogramaGerar')).toBeEnabled();
        await page.locator('#cronogramaGerar').click();
        await expect(page.locator('[data-sgi-step-indicator="3"]')).toHaveAttribute('aria-current', 'step');
        await expect(page.locator('[data-sgi-step-card="3"]')).toHaveClass(/sgi-step-card--active/);
        await expect(page.locator('#cronogramaPublicar')).toBeEnabled();
        await page.locator('#cronogramaPublicar').click();
        await expect(page.locator('#cronogramaPlanejadoStatus')).toContainText('publicado');
        await expect(page.locator('[data-sgi-step-indicator="4"]')).toHaveAttribute('aria-current', 'step');
    }

    expect(posts.map((item) => item.acao)).toEqual([
        'revisar', 'gerar_rascunho', 'publicar',
        'abrir_inscricoes', 'encerrar_inscricoes', 'revisar', 'gerar_rascunho', 'publicar',
        'abrir_inscricoes', 'encerrar_inscricoes', 'revisar', 'gerar_rascunho', 'publicar',
    ]);
});

test('pendências e alterações invalidam a proposta e a publicação sobrevive a uma falha de consulta', async ({ page }) => {
    const idInterclasse = await entrarComoAdmin(page);
    const state = {
        id_interclasse: idInterclasse,
        cronograma_status: 'rascunho',
        inscricoes_status: 'fechadas',
        cronograma_versao: 0,
        versao_publicada: null,
        operacao_liberada: '0',
        failAfterPublish: true,
        modalidades: [{ id_modalidade: 91001, equipes_planejadas: 3 }],
        compromissos: [],
        nos: [],
    };
    const posts = await instalarRotasDoPainel(page, state, {
        failures: [1],
        invalidGenerations: [2],
        httpFailures: [3],
        networkFailures: [4],
    });
    await page.goto(`edicoes/agenda?id=${idInterclasse}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#cronogramaGerar')).toBeEnabled({ timeout: 20_000 });

    await page.locator('#cronogramaGerar').click();
    await expect(page.locator('#cronogramaPlanejadoResumo')).toContainText('A janela e os locais não comportam todos os compromissos.');
    await expect(page.locator('#cronogramaPublicar')).toBeDisabled();

    await page.locator('#cronogramaGerar').click();
    await expect(page.locator('#cronogramaPlanejadoResumo')).toContainText('resposta inválida para o cronograma');
    await expect(page.locator('#cronogramaPublicar')).toBeDisabled();

    await page.locator('#cronogramaGerar').click();
    await expect(page.locator('#cronogramaPlanejadoResumo')).toContainText('HTTP 500');
    await expect(page.locator('#cronogramaPublicar')).toBeDisabled();

    await page.locator('#cronogramaGerar').click();
    await expect(page.locator('#cronogramaPlanejadoResumo')).toHaveClass(/text-danger/);
    await expect(page.locator('#cronogramaPublicar')).toBeDisabled();

    await page.locator('#cronogramaGerar').click();
    await expect(page.locator('#cronogramaPublicar')).toBeEnabled();
    await page.locator('#cronogramaHoraInicio').fill('15:00');
    await expect(page.locator('#cronogramaPublicar')).toBeDisabled();

    await page.locator('#cronogramaGerar').click();
    await expect(page.locator('#cronogramaPublicar')).toBeEnabled();
    await page.locator('#cronogramaPreparar').click();
    await expect(page.locator('#cronogramaPreparar')).toBeEnabled();
    await expect(page.locator('#cronogramaPublicar')).toBeDisabled();
    await page.locator('#cronogramaGerar').click();
    await expect(page.locator('#cronogramaPublicar')).toBeEnabled();
    await page.locator('#cronogramaPublicar').click();
    await expect(page.locator('#cronogramaPlanejadoResumo')).toContainText('operação foi concluída');
    await expect(page.locator('#cronogramaPublicar')).toBeDisabled();
    await page.locator('#cronogramaAtualizar').click();
    await expect(page.locator('#cronogramaPlanejadoStatus')).toContainText('publicado');
    await expect(page.locator('#cronogramaRevisar')).toBeEnabled();

    const publish = posts.find((item) => item.acao === 'publicar');
    expect(publish.cronograma_versao).toBe(0);
    expect(publish.nos).toHaveLength(1);
    expect(posts.filter((item) => item.acao === 'publicar')).toHaveLength(1);
});

test('uma resposta de geração atrasada não restaura uma proposta após os parâmetros mudarem', async ({ page }) => {
    const idInterclasse = await entrarComoAdmin(page);
    let releaseGeneration;
    let notifyGenerationReached;
    const generationGate = {
        reached: () => notifyGenerationReached(),
        resume: new Promise((resolve) => { releaseGeneration = resolve; }),
    };
    const generationReached = new Promise((resolve) => { notifyGenerationReached = resolve; });
    const state = {
        id_interclasse: idInterclasse,
        cronograma_status: 'rascunho',
        inscricoes_status: 'fechadas',
        cronograma_versao: 0,
        versao_publicada: null,
        operacao_liberada: '0',
        modalidades: [{ id_modalidade: 91001, equipes_planejadas: 3 }],
        compromissos: [],
        nos: [],
    };
    const posts = await instalarRotasDoPainel(page, state, { generationGate });
    await page.goto(`edicoes/agenda?id=${idInterclasse}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#cronogramaGerar')).toBeEnabled({ timeout: 20_000 });

    await page.locator('#cronogramaGerar').click();
    await generationReached;
    await page.locator('#cronogramaGerar').dispatchEvent('click');
    expect(posts.filter((item) => item.acao === 'gerar_rascunho')).toHaveLength(1);
    await page.locator('#cronogramaHoraInicio').fill('09:00');
    releaseGeneration();

    await expect(page.locator('#cronogramaPlanejadoResumo')).toContainText('Os parâmetros mudaram durante a geração. Gere o rascunho novamente.');
    await expect(page.locator('#cronogramaPublicar')).toBeDisabled();
    await page.locator('#cronogramaGerar').click();
    await expect(page.locator('#cronogramaPublicar')).toBeEnabled();
    expect(posts.filter((item) => item.acao === 'publicar')).toHaveLength(0);
    expect(posts.filter((item) => item.acao === 'gerar_rascunho')).toHaveLength(2);
});

test('uma resposta de geração atrasada não altera a página depois da desativação', async ({ page }) => {
    const idInterclasse = await entrarComoAdmin(page);
    let releaseGeneration;
    let notifyGenerationReached;
    const generationGate = {
        reached: () => notifyGenerationReached(),
        resume: new Promise((resolve) => { releaseGeneration = resolve; }),
    };
    const generationReached = new Promise((resolve) => { notifyGenerationReached = resolve; });
    const state = {
        id_interclasse: idInterclasse,
        cronograma_status: 'rascunho',
        inscricoes_status: 'fechadas',
        cronograma_versao: 0,
        versao_publicada: null,
        operacao_liberada: '0',
        modalidades: [{ id_modalidade: 91001, equipes_planejadas: 3 }],
        compromissos: [],
        nos: [],
    };
    const posts = await instalarRotasDoPainel(page, state, { generationGate });
    await page.goto(`edicoes/agenda?id=${idInterclasse}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#cronogramaGerar')).toBeEnabled({ timeout: 20_000 });
    const resumoAntes = await page.locator('#cronogramaPlanejadoResumo').textContent();

    await page.locator('#cronogramaGerar').click();
    await generationReached;
    const response = page.waitForResponse((item) =>
        item.url().includes('/api/v1/cronograma') && item.request().method() === 'POST',
    );
    await page.evaluate(() => window.SGIPage.deactivate());
    releaseGeneration();
    await response;

    await expect(page.locator('#cronogramaPlanejadoResumo')).toHaveText(resumoAntes);
    await expect(page.locator('#cronogramaPublicar')).toBeDisabled();
    expect(posts.filter((item) => item.acao === 'gerar_rascunho')).toHaveLength(1);
});
