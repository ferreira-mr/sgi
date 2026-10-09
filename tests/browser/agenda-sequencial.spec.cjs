const { test, expect } = require('./fixtures.cjs');

async function entrarComoAdmin(page) {
    await page.goto('login', { waitUntil: 'domcontentloaded' });
    const form = page.locator('#form_desktop');
    await form.locator('.ipt-matricula').fill('admin');
    await form.locator('.ipt-senha').fill('123');
    await form.locator('button[type="submit"]').click();
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

test('a tela oferece apenas o fluxo canônico de cronograma', async ({ page }) => {
    const idInterclasse = await entrarComoAdmin(page);
    const chamadasAntigas = [];
    await page.route('**/api/v1/modalidades*', (route) => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify([]),
    }));
    await page.route('**/api/v1/locais*', (route) => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: [] }),
    }));
    await page.route('**/api/v1/jogos*', (route) => route.fulfill({ contentType: 'application/json', body: '[]' }));
    await page.route('**/api/v1/agenda-blocos', async (route) => {
        chamadasAntigas.push(route.request().method());
        await route.fulfill({ contentType: 'application/json', body: '{}' });
    });
    await page.route('**/api/v1/cronograma*', (route) => route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
            success: true,
            cronograma_status: 'rascunho',
            inscricoes_status: 'fechadas',
            cronograma_versao: 0,
            modalidades: [],
            compromissos: [],
            operacao_liberada: 0,
        }),
    }));

    await page.goto(`edicoes/agenda?id=${idInterclasse}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#painelCronogramaPlanejado')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#cronogramaGerar')).toBeEnabled();
    await expect(page.locator('.btn-trigger-datas-auto')).toHaveCount(0);
    await expect(page.locator('#modalDatasAutomaticas')).toHaveCount(0);
    await expect(page.locator('#cronogramaAtualizar')).toBeVisible();
    expect(chamadasAntigas).toEqual([]);
});
