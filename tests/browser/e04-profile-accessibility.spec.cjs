const { test, expect, request: requestFactory } = require('./fixtures.cjs');

async function jsonOrThrow(response, label) {
    if (!response.ok()) {
        throw new Error(`${label}: HTTP ${response.status()} ${await response.text()}`);
    }
    return response.json();
}

async function login(page, matricula, senha) {
    await page.goto('login', { waitUntil: 'domcontentloaded' });
    await page.locator('#form_desktop .ipt-matricula').fill(matricula);
    await page.locator('#form_desktop .ipt-senha').fill(senha);
    await page.locator('#form_desktop button[type="submit"]').click();
}

async function prepararAluno(request) {
    await jsonOrThrow(await request.post('api/v1/login', {
        data: { matricula: 'admin', senha: '123' },
    }), 'login administrativo de preparação');

    const edicoes = await jsonOrThrow(
        await request.get('api/v1/edicoes?regulamento=true'),
        'consulta de edições para perfil',
    );
    const edicao = (Array.isArray(edicoes) ? edicoes : [])
        .find((item) => String(item.status_interclasse) === '1')
        || (Array.isArray(edicoes) ? edicoes[0] : null);
    if (!edicao) throw new Error('Nenhuma edição disponível para o teste de perfil.');

    const turmas = await jsonOrThrow(
        await request.get(`api/v1/turmas?id_interclasse=${Number(edicao.id_interclasse)}`),
        'consulta de turmas para perfil',
    );
    if (!Array.isArray(turmas) || turmas.length === 0) {
        throw new Error('Nenhuma turma disponível para o teste de perfil.');
    }

    const matricula = `84${Date.now().toString().slice(-7)}`;
    const created = await jsonOrThrow(await request.post('api/v1/usuarios?acao=criar_aluno', {
        data: {
            nome_usuario: 'Aluno Regressão E04 Perfil',
            matricula_usuario: matricula,
            genero_usuario: 'MASC',
            data_nasc_usuario: '2008-07-20',
            turmas_id_turma: Number(turmas[0].id_turma),
        },
    }), 'criação do aluno para perfil');
    if (created.status !== 'sucesso' || !created.senha_temporaria) {
        throw new Error(`Falha ao criar o aluno para perfil: ${JSON.stringify(created)}`);
    }

    return { matricula, senha: String(created.senha_temporaria) };
}

async function ensureStudentReady(page, student) {
    await login(page, student.matricula, student.senha);
    await page.waitForURL(/\/aluno\/trocar-senha/, { timeout: 15_000 });
    const newPassword = 'E04Aluno#2026';
    await page.locator('#novaSenhaPrimeiroAcesso').fill(newPassword);
    await page.locator('#confirmarSenhaPrimeiroAcesso').fill(newPassword);
    await page.locator('#btnSalvarSenhaPrimeiroAcesso').click();
    await page.waitForURL(/\/aluno\/termos/, { timeout: 15_000 });
    student.senha = newPassword;
    await page.locator('#btnAceitarTermos').click();
    await page.waitForURL(/\/aluno\/inicio/, { timeout: 15_000 });
}

async function assertProfilePasswordToggle(page) {
    const trigger = page.locator('button[data-bs-target="#modalAlterarSenha"]:visible').first();
    const modalShown = page.evaluate(() => new Promise((resolve) => {
        document.getElementById('modalAlterarSenha').addEventListener('shown.bs.modal', resolve, { once: true });
    }));
    await trigger.click();
    await modalShown;

    const modal = page.getByRole('dialog', { name: 'Alterar Senha' });
    await expect(modal).toBeVisible();
    const controls = modal.locator('.perfil-password-eye');
    await expect(controls).toHaveCount(3);
    for (const control of await controls.all()) {
        await expect(control).not.toHaveAttribute('tabindex', '-1');
        await expect(control).toHaveAttribute('aria-pressed', 'false');
        await expect(control).toHaveAccessibleName('Mostrar senha');
        await expect(control).toHaveAttribute('aria-controls', /editar(SenhaAtual|NovaSenha|ConfirmarSenha)/);
    }

    const control = controls.first();
    await control.focus();
    await expect(control).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(modal.locator('#editarSenhaAtual')).toHaveAttribute('type', 'text');
    await expect(control).toHaveAttribute('aria-pressed', 'true');
    await expect(control).toHaveAccessibleName('Ocultar senha');
    await expect(control).toBeFocused();
    await page.keyboard.press('Space');
    await expect(modal.locator('#editarSenhaAtual')).toHaveAttribute('type', 'password');
    await expect(control).toHaveAttribute('aria-pressed', 'false');
    await expect(control).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();
}

async function assertPhotoMenuLifecycle(page, profilePath, suffix, nextPath) {
    const navProfile = page.locator('nav .sgi-sidebar-link[aria-label="Perfil"]');
    const fallback = navProfile.locator('.nav-avatar-fallback');
    const navPhoto = navProfile.locator('img.nav-avatar-img');
    await expect(navProfile).toBeVisible();
    await expect(fallback).toBeVisible();
    await expect(navPhoto).toHaveCount(0);
    await expect(page.locator('main:visible')).toContainText(/JPG, PNG, GIF ou WebP; até 5 MB/);
    const profileImage = page.locator(`#fotoImg${suffix}`);
    await expect(profileImage).not.toHaveAttribute('onerror', /.+/);
    await assertMobileProfileAvatar(page, false);

    await page.locator('#fotoUploadInput').setInputFiles({
        name: 'arquivo-invalido.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('este conteúdo não é uma imagem'),
    });
    const saveButton = page.locator(`#btnSalvarFoto${suffix}`);
    await expect(saveButton).toBeVisible();
    const rejectedResponse = page.waitForResponse((response) =>
        response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/api/v1/foto'),
    );
    await saveButton.click();
    const rejectedUpload = await rejectedResponse;
    expect(rejectedUpload.status()).toBe(400);
    expect(rejectedUpload.request().headers()['x-sgi-csrf']).toBeTruthy();
    const rejectedBody = await rejectedUpload.json();
    expect(rejectedBody.success).toBe(false);
    expect(rejectedBody.mensagem).toMatch(/formato inválido|JPG|PNG|GIF|WebP/i);
    await expect.poll(() => profileImage.evaluate((image) => image.complete)).toBe(true);
    await expect(profileImage).toBeHidden();
    await expect(page.locator(`#fotoIcon${suffix}`)).toBeVisible();
    const uploadMessage = page.locator('#sgiToastContainer .toast').last();
    await expect(uploadMessage).toBeVisible();
    await expect(uploadMessage).toContainText(/formato inválido|JPG|PNG|GIF|WebP/i);
    await expect(saveButton).toBeEnabled();
    await expect(saveButton).toBeVisible();

    const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
    );
    await page.locator('#fotoUploadInput').setInputFiles({
        name: 'foto-perfil.png',
        mimeType: 'image/png',
        buffer: png,
    });
    await page.route('**/api/v1/foto', async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        return route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, arquivo: 'foto-falsa.png' }),
        });
    });
    const falseSuccessResponse = page.waitForResponse((response) =>
        response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/api/v1/foto'),
    );
    const noReloadAfterFalseSuccess = page.waitForEvent('load', { timeout: 1500 }).then(() => false).catch(() => true);
    const activeDocumentTimeAfterHttpError = await page.evaluate(() => performance.timeOrigin);
    await saveButton.click();
    const falseSuccess = await falseSuccessResponse;
    expect(falseSuccess.status()).toBe(500);
    await expect(page.locator('#sgiToastContainer .toast').last()).toContainText(/Resposta inválida ao enviar foto/i);
    expect(await noReloadAfterFalseSuccess).toBe(true);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(activeDocumentTimeAfterHttpError);
    await expect(saveButton).toBeEnabled();
    await page.unroute('**/api/v1/foto');

    await page.route('**/api/v1/foto', async (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Proxy error</title>' });
    });
    const invalidUploadResponse = page.waitForResponse((response) =>
        response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/api/v1/foto'),
    );
    const noReloadAfterInvalidResponse = page.waitForEvent('load', { timeout: 1500 }).then(() => false).catch(() => true);
    const activeDocumentTimeAfterInvalidResponse = await page.evaluate(() => performance.timeOrigin);
    await saveButton.click();
    const invalidUpload = await invalidUploadResponse;
    expect(invalidUpload.status()).toBe(200);
    await expect(page.locator('#sgiToastContainer .toast').last()).toContainText(/Resposta inválida ao enviar foto/i);
    expect(await noReloadAfterInvalidResponse).toBe(true);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(activeDocumentTimeAfterInvalidResponse);
    await expect(saveButton).toBeEnabled();
    await page.unroute('**/api/v1/foto');

    const acceptedResponse = page.waitForResponse((response) =>
        response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/api/v1/foto'),
    );
    const reloadAfterUpload = page.waitForEvent('load');
    await saveButton.click();
    const acceptedUpload = await acceptedResponse;
    expect(acceptedUpload.ok()).toBe(true);
    expect(acceptedUpload.request().headers()['x-sgi-csrf']).toBeTruthy();
    const acceptedBody = await acceptedUpload.json();
    expect(acceptedBody.success).toBe(true);
    expect(acceptedBody.arquivo).toBeTruthy();
    await reloadAfterUpload;

    await expect(navPhoto).toBeVisible();
    await expect.poll(() => navPhoto.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
    await expect(navPhoto).toHaveAttribute('src', /\/uploads\/fotosUsuarios\//);
    const photoUrl = new URL(await navPhoto.getAttribute('src'), page.url()).href;
    const authenticatedPhoto = await page.request.get(photoUrl);
    expect(authenticatedPhoto.status()).toBe(200);
    expect(authenticatedPhoto.headers()['cache-control']).toMatch(/private/i);
    expect(authenticatedPhoto.headers()['cache-control']).toMatch(/no-store/i);
    const anonymousRequest = await requestFactory.newContext();
    try {
        const anonymousPhoto = await anonymousRequest.get(photoUrl, { maxRedirects: 0 });
        expect(anonymousPhoto.status()).toBe(302);
        expect(anonymousPhoto.headers().location).toMatch(/\/login$/);
        expect(anonymousPhoto.headers()['cache-control']).toMatch(/no-store/i);
    } finally {
        await anonymousRequest.dispose();
    }
    await assertMobileProfileAvatar(page, true);

    await page.goto(nextPath, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('nav .sgi-sidebar-link[aria-label="Perfil"] img.nav-avatar-img')).toBeVisible();

    await page.goto(profilePath, { waitUntil: 'domcontentloaded' });
    const handlersAtImageRequest = [];
    const currentPhotoUrl = new URL(await profileImage.getAttribute('src'), page.url());
    currentPhotoUrl.searchParams.set('e04-handler-check', String(Date.now()));
    const photoRequestMatcher = (url) => {
        const requestUrl = new URL(url);
        return requestUrl.origin === currentPhotoUrl.origin && requestUrl.pathname === currentPhotoUrl.pathname;
    };
    await page.route(photoRequestMatcher, async (route) => {
        handlersAtImageRequest.push(await profileImage.evaluate((image) => ({
            onload: typeof image.onload,
            onerror: typeof image.onerror,
        })));
        return route.fulfill({ status: 404, body: 'not found' });
    });
    await profileImage.evaluate((image, source) => { image.src = source; }, currentPhotoUrl.toString());
    await expect.poll(() => handlersAtImageRequest.length).toBeGreaterThan(0);
    expect(handlersAtImageRequest).toContainEqual({ onload: 'function', onerror: 'function' });
    await expect.poll(() => profileImage.evaluate((image) => image.complete)).toBe(true);
    expect(await profileImage.evaluate((image) => image.naturalWidth)).toBe(0);
    await expect(profileImage).toBeHidden();
    await expect(page.locator(`#fotoIcon${suffix}`)).toBeVisible();
    await expect(profileImage).not.toHaveAttribute('onerror', /.+/);
    await page.unroute(photoRequestMatcher);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(() => profileImage.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);

    const removeButton = page.locator(`#btnExcluirFoto${suffix}`);
    await expect(removeButton).toBeEnabled();
    await removeButton.click();
    const confirmation = page.getByRole('dialog', { name: 'Remover foto de perfil?' });
    await expect(confirmation).toBeVisible();

    await page.route('**/api/v1/foto', async (route) => {
        if (route.request().method() !== 'DELETE') return route.continue();
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                success: true,
                offline: true,
                queued: true,
                mensagem: 'Salvo localmente. Sera sincronizado quando houver conexao.',
            }),
        });
    });
    const queuedResponse = page.waitForResponse((response) =>
        response.request().method() === 'DELETE' && new URL(response.url()).pathname.endsWith('/api/v1/foto'),
    );
    const noReload = page.waitForEvent('load', { timeout: 1500 }).then(() => false).catch(() => true);
    const activeDocumentTime = await page.evaluate(() => performance.timeOrigin);
    await confirmation.getByRole('button', { name: 'Remover foto' }).click();
    const queuedDelete = await queuedResponse;
    expect(queuedDelete.status()).toBe(200);
    expect(queuedDelete.request().headers()['x-sgi-csrf']).toBeTruthy();
    expect((await queuedDelete.json()).queued).toBe(true);
    await expect(page.locator('#sgiToastContainer .toast').last()).toContainText(/Remoção pendente/);
    expect(await noReload).toBe(true);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(activeDocumentTime);
    await expect(navPhoto).toBeVisible();
    await expect(removeButton).toBeEnabled();
    await page.unroute('**/api/v1/foto');

    await removeButton.click();
    const actualConfirmation = page.getByRole('dialog', { name: 'Remover foto de perfil?' });
    await expect(actualConfirmation).toBeVisible();
    const deleteResponse = page.waitForResponse((response) =>
        response.request().method() === 'DELETE' && new URL(response.url()).pathname.endsWith('/api/v1/foto'),
    );
    const reloadAfterRemoval = page.waitForEvent('load');
    await actualConfirmation.getByRole('button', { name: 'Remover foto' }).click();
    const removed = await deleteResponse;
    expect(removed.status()).toBe(200);
    expect(removed.request().headers()['x-sgi-csrf']).toBeTruthy();
    expect((await removed.json()).success).toBe(true);
    await reloadAfterRemoval;

    await expect(navProfile.locator('.nav-avatar-fallback')).toBeVisible();
    await expect(navProfile.locator('img.nav-avatar-img')).toHaveCount(0);
    await assertMobileProfileAvatar(page, false);
    await page.goto(nextPath, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('nav .sgi-sidebar-link[aria-label="Perfil"] .nav-avatar-fallback')).toBeVisible();
}

async function assertMobileProfileAvatar(page, hasPhoto) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Abrir menu' }).click();
    const mobileProfile = page.locator('#sgiMobileMenu .sgi-mobile-menu-link').filter({ hasText: 'Perfil' });
    if (hasPhoto) {
        const photo = mobileProfile.locator('img.nav-avatar-img-mobile');
        await expect(photo).toBeVisible();
        await expect.poll(() => photo.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
    } else {
        await expect(mobileProfile.locator('.nav-avatar-fallback-mobile')).toBeVisible();
        await expect(mobileProfile.locator('img.nav-avatar-img-mobile')).toHaveCount(0);
    }
    await page.getByRole('button', { name: 'Fechar menu' }).click();
    await expect(page.locator('#sgiMobileMenu')).toBeHidden();
    await page.setViewportSize({ width: 1440, height: 900 });
}

test.describe('E04 primeiro acesso e perfil do aluno', () => {
    let aluno;

    test.beforeEach(async ({ request }) => {
        aluno = await prepararAluno(request);
    });

    test('troca inicial de senha pode ser acionada por teclado', async ({ page }) => {
        await login(page, aluno.matricula, aluno.senha);
        await page.waitForURL(/\/aluno\/trocar-senha/, { timeout: 15_000 });

        const newPassword = page.locator('#novaSenhaPrimeiroAcesso');
        const confirmPassword = page.locator('#confirmarSenhaPrimeiroAcesso');
        await expect(newPassword).toHaveAttribute('minlength', '6');
        await expect(confirmPassword).toHaveAttribute('minlength', '6');
        await expect(newPassword).toHaveAttribute('autocomplete', 'new-password');
        const firstToggle = page.locator('.password-visibility-toggle').first();
        await expect(page.getByRole('button', { name: 'Mostrar senha', exact: true })).toHaveCount(2);
        await firstToggle.focus();
        await page.keyboard.press('Enter');
        await expect(newPassword).toHaveAttribute('type', 'text');
        await expect(firstToggle).toHaveAccessibleName('Ocultar senha');
        await expect(firstToggle).toHaveAttribute('aria-pressed', 'true');
        await expect(firstToggle).toBeFocused();
        await page.keyboard.press('Space');
        await expect(newPassword).toHaveAttribute('type', 'password');
        await expect(firstToggle).toHaveAttribute('aria-pressed', 'false');
        await expect(firstToggle).toBeFocused();
    });

    test('rota de foto mantém as barreiras de troca obrigatória e aceite dos termos', async ({ page }) => {
        await login(page, aluno.matricula, aluno.senha);
        await page.waitForURL(/\/aluno\/trocar-senha/, { timeout: 15_000 });
        const photoUrl = await page.evaluate(() => new URL(
            (window.SGI_BASE_PATH || '') + '/uploads/fotosUsuarios/foto-protegida-inexistente.png',
            window.location.href,
        ).href);

        const pendingPassword = await page.request.get(photoUrl, { maxRedirects: 0 });
        expect(pendingPassword.status()).toBe(302);
        expect(pendingPassword.headers().location).toMatch(/\/aluno\/trocar-senha$/);

        const newPassword = 'E04Aluno#2026';
        await page.locator('#novaSenhaPrimeiroAcesso').fill(newPassword);
        await page.locator('#confirmarSenhaPrimeiroAcesso').fill(newPassword);
        await page.locator('#btnSalvarSenhaPrimeiroAcesso').click();
        await page.waitForURL(/\/aluno\/termos/, { timeout: 15_000 });

        const pendingTerms = await page.request.get(photoUrl, { maxRedirects: 0 });
        expect(pendingTerms.status()).toBe(302);
        expect(pendingTerms.headers().location).toMatch(/\/aluno\/termos$/);
    });

    test('jornada de primeiro acesso segue para o aceite dos termos', async ({ page }) => {
        await ensureStudentReady(page, aluno);
        await expect(page).toHaveURL(/\/aluno\/inicio/);
    });

    test('perfil de aluno não rotula matrícula como e-mail nem afirma estado ou segurança estáticos', async ({ page }) => {
        await ensureStudentReady(page, aluno);
        await page.goto('aluno/perfil', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('main:visible')).toContainText(aluno.matricula);
        await expect(page.locator('main:visible')).toContainText('Estudante');
        await expect(page.getByText('E-mail', { exact: true })).toHaveCount(0);
        await expect(page.getByText('Online', { exact: true })).toHaveCount(0);
        await expect(page.getByText('Senha criptografada', { exact: true })).toHaveCount(0);
    });

    test('toggles de senha do perfil do aluno operam com Enter e Espaço', async ({ page }) => {
        await ensureStudentReady(page, aluno);
        await page.goto('aluno/perfil', { waitUntil: 'domcontentloaded' });
        await assertProfilePasswordToggle(page);
    });

    test('foto do aluno aparece no menu após upload, navegação e remoção', async ({ page }) => {
        await ensureStudentReady(page, aluno);
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto('aluno/perfil', { waitUntil: 'domcontentloaded' });
        await assertPhotoMenuLifecycle(page, 'aluno/perfil', 'Desk', 'aluno/inicio');
    });
});

test.describe('E04 perfil administrativo', () => {
    test('link de retorno preserva edição em subdiretório e na raiz', async ({ page }) => {
        await login(page, 'admin', '123');
        await expect(page).toHaveURL(/\/edicoes|\/painel/, { timeout: 15_000 });
        await page.goto('perfil?id=987654', { waitUntil: 'domcontentloaded' });
        const basePath = await page.evaluate(() => String(window.SGI_BASE_PATH || '').replace(/\/+$/, ''));
        await expect(page.locator('#perfilBackDesk')).toHaveAttribute('href', `${basePath}/painel?id=987654`);
        await expect(page.locator('#perfilBackMob')).toHaveAttribute('href', `${basePath}/painel?id=987654`);

        await page.addInitScript(() => {
            Object.defineProperty(window, 'SGI_BASE_PATH', { configurable: false, get: () => '' });
        });
        await page.reload({ waitUntil: 'domcontentloaded' });
        await expect(page.locator('#perfilBackDesk')).toHaveAttribute('href', '/painel?id=987654');
        await expect(page.locator('#perfilBackMob')).toHaveAttribute('href', '/painel?id=987654');
    });

    test('perfil administrativo não exibe e-mail, online ou segurança estática', async ({ page }) => {
        await login(page, 'admin', '123');
        await expect(page).toHaveURL(/\/edicoes|\/painel/, { timeout: 15_000 });
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto('perfil', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('main:visible')).toBeVisible();
        await expect(page.getByText('E-mail', { exact: true })).toHaveCount(0);
        await expect(page.getByText('Online', { exact: true })).toHaveCount(0);
        await expect(page.getByText('Senha criptografada', { exact: true })).toHaveCount(0);
    });

    test('toggles de senha do perfil administrativo operam com Enter e Espaço', async ({ page }) => {
        await login(page, 'admin', '123');
        await expect(page).toHaveURL(/\/edicoes|\/painel/, { timeout: 15_000 });
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto('perfil', { waitUntil: 'domcontentloaded' });
        await assertProfilePasswordToggle(page);
    });

    test('foto de perfil exige sessão e usa resposta privada no cache', async ({ page }) => {
        await login(page, 'admin', '123');
        await expect(page).toHaveURL(/\/edicoes|\/painel/, { timeout: 15_000 });
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto('perfil', { waitUntil: 'domcontentloaded' });
        await page.locator('#fotoUploadInput').setInputFiles({
            name: 'foto-privada.png',
            mimeType: 'image/png',
            buffer: Buffer.from(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
                'base64',
            ),
        });
        const uploadResponse = page.waitForResponse((response) =>
            response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/api/v1/foto'),
        );
        const reloadAfterUpload = page.waitForEvent('load');
        await page.locator('#btnSalvarFotoDesk').click();
        const upload = await uploadResponse;
        expect(upload.ok()).toBe(true);
        expect(upload.request().headers()['x-sgi-csrf']).toBeTruthy();
        const uploadBody = await upload.json();
        expect(uploadBody.success).toBe(true);
        expect(uploadBody.arquivo).toBeTruthy();
        await reloadAfterUpload;

        const profilePhoto = page.locator('#fotoImgDesk');
        await expect.poll(() => profilePhoto.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
        const photoUrl = new URL(await profilePhoto.getAttribute('src'), page.url()).href;
        const authenticatedPhoto = await page.request.get(photoUrl);
        const anonymousContext = await requestFactory.newContext();
        try {
            const anonymousPhoto = await anonymousContext.get(photoUrl, { maxRedirects: 0 });
            expect([anonymousPhoto.status(), authenticatedPhoto.status()]).toEqual([302, 200]);
            expect(anonymousPhoto.headers().location).toMatch(/\/login$/);
            expect(anonymousPhoto.headers()['cache-control']).toMatch(/no-store/i);
            expect(authenticatedPhoto.headers()['cache-control']).toMatch(/private/i);
            expect(authenticatedPhoto.headers()['cache-control']).toMatch(/no-store/i);
        } finally {
            await anonymousContext.dispose();
            await page.evaluate(async () => {
                await fetch((window.SGI_API_BASE || '/api/v1/').replace(/\/?$/, '/') + 'foto', { method: 'DELETE' });
            }).catch(() => {});
        }
    });

    test('foto administrativa aparece no menu após upload, navegação e remoção', async ({ page }) => {
        await login(page, 'admin', '123');
        await expect(page).toHaveURL(/\/edicoes|\/painel/, { timeout: 15_000 });
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto('perfil', { waitUntil: 'domcontentloaded' });
        await assertPhotoMenuLifecycle(page, 'perfil', 'Desk', 'edicoes');
    });

    test('remoção de foto do mesário offline persiste no IndexedDB e mantém a foto pendente', async ({ page, context }) => {
        test.setTimeout(180_000);
        await login(page, 'mesario', '123');
        await page.waitForURL(/\/painel\?id=\d+/, { timeout: 15_000 });
        await expect(page.locator('#sgi-offline-ok')).toBeVisible({ timeout: 120_000 });
        await expect(page.locator('#sgi-offline-ok')).toContainText('Pronto para uso offline');

        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto('perfil', { waitUntil: 'domcontentloaded' });
        await page.locator('#fotoUploadInput').setInputFiles({
            name: 'foto-mesario.png',
            mimeType: 'image/png',
            buffer: Buffer.from(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGawAAAABJRU5ErkJggg==',
                'base64',
            ),
        });
        const uploadResponse = page.waitForResponse((response) =>
            response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/api/v1/foto'),
        );
        const reloadAfterUpload = page.waitForEvent('load');
        await page.locator('#btnSalvarFotoDesk').click();
        const uploaded = await uploadResponse;
        expect(uploaded.ok()).toBe(true);
        expect(uploaded.request().headers()['x-sgi-csrf']).toBeTruthy();
        expect((await uploaded.json()).success).toBe(true);
        await reloadAfterUpload;

        const navPhoto = page.locator('nav .sgi-sidebar-link[aria-label="Perfil"] img.nav-avatar-img');
        await expect(navPhoto).toBeVisible();
        await expect.poll(() => navPhoto.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
        const removeButton = page.locator('#btnExcluirFotoDesk');
        await expect(removeButton).toBeEnabled();

        await page.route('**/api/v1/foto', async (route) => {
            if (route.request().method() !== 'DELETE') return route.continue();
            return route.fulfill({
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({
                    success: false,
                    offline: true,
                    queued: true,
                    mensagem: 'Falha temporária do servidor.',
                }),
            });
        });
        const rejectedDeleteResponse = page.waitForResponse((response) =>
            response.request().method() === 'DELETE' && new URL(response.url()).pathname.endsWith('/api/v1/foto'),
        );
        const noReloadAfterRejectedDelete = page.waitForEvent('load', { timeout: 1500 }).then(() => false).catch(() => true);
        const documentTimeBeforeRejectedDelete = await page.evaluate(() => performance.timeOrigin);
        await removeButton.click();
        const rejectedConfirmation = page.getByRole('dialog', { name: 'Remover foto de perfil?' });
        await expect(rejectedConfirmation).toBeVisible();
        await rejectedConfirmation.getByRole('button', { name: 'Remover foto' }).click();
        const rejectedDelete = await rejectedDeleteResponse;
        expect(rejectedDelete.status()).toBe(500);
        await expect(page.locator('#sgiToastContainer .toast').last()).toContainText('Falha temporária do servidor.');
        await expect(page.locator('#sgiToastContainer .toast').last()).not.toContainText(/Remoção pendente/);
        expect(await noReloadAfterRejectedDelete).toBe(true);
        expect(await page.evaluate(() => performance.timeOrigin)).toBe(documentTimeBeforeRejectedDelete);
        await expect(removeButton).toBeEnabled();
        await page.unroute('**/api/v1/foto');

        const activeDocumentTime = await page.evaluate(() => performance.timeOrigin);
        await context.setOffline(true);
        await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
        await expect(page.locator('#sgi-offline-banner')).toContainText('SEM CONEXÃO');

        await removeButton.click();
        const confirmation = page.getByRole('dialog', { name: 'Remover foto de perfil?' });
        await expect(confirmation).toBeVisible();
        await confirmation.getByRole('button', { name: 'Remover foto' }).click();
        await expect(page.locator('#sgiToastContainer .toast').last()).toContainText(/Remoção pendente/);

        const pendingDeletes = await page.evaluate(async () => (await window.SGIOffline.getPendingList())
            .filter((item) => item.method === 'DELETE' && new URL(item.url, location.href).pathname.endsWith('/api/v1/foto'))
            .map((item) => ({ method: item.method, url: item.url, headers: item.headers })));
        expect(pendingDeletes).toHaveLength(1);
        expect(pendingDeletes[0].method).toBe('DELETE');
        expect(pendingDeletes[0].headers).toBeTruthy();
        expect(Object.entries(pendingDeletes[0].headers)
            .some(([name, value]) => name.toLowerCase() === 'x-sgi-csrf' && Boolean(value))).toBe(true);
        expect(await page.evaluate(() => performance.timeOrigin)).toBe(activeDocumentTime);
        await expect(navPhoto).toBeVisible();
        await expect(removeButton).toBeEnabled();
    });
});
