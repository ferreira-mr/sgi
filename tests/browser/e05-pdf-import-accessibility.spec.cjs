const { test, expect } = require('./fixtures.cjs');

const fixture = {
    edition: {
        id_interclasse: 901,
        nome_interclasse: 'Interclasse de teste E05',
        ano_interclasse: '2026-01-01',
        status_interclasse: '1',
    },
    category: {
        id_categoria: 903,
        nome_categoria: 'Sub-15',
        interclasses_id_interclasse: 901,
    },
    class: {
        id_turma: 902,
        nome_turma: 'Turma E05',
        nome_fantasia_turma: 'Lobos',
        turno_turma: 'Manhã',
        categorias_id_categoria: 903,
        interclasses_id_interclasse: 901,
        nome_categoria: 'Sub-15',
    },
    students: [
        { id_usuario: 9902, nome_usuario: 'Ana Pereira', matricula_usuario: 'E05-9902', genero_usuario: 'FEM', inscrito: 1 },
        { id_usuario: 9903, nome_usuario: 'Bia Lima', matricula_usuario: 'E05-9903', genero_usuario: 'FEM', inscrito: 1 },
    ],
};

const samplePdf = {
    name: 'lista de alunos.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n% E05 browser fixture\n'),
};

async function loginAsAdmin(page) {
    await page.goto('login', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#form_desktop')).toBeVisible();
    await page.locator('#form_desktop .ipt-matricula').fill('admin');
    await page.locator('#form_desktop .ipt-senha').fill('123');
    await page.locator('#form_desktop button[type="submit"]').click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).not.toHaveURL(/login(?:\?|$)/, { timeout: 15_000 });
}

function installApiFixtures(page, { upload } = {}) {
    const counts = { classCreates: 0, uploads: 0, uploadedClassIds: [], rosterRequests: 0 };
    page.route('**/api/v1/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());

        if (url.pathname.endsWith('/importacoes/turma-pdf')) {
            counts.uploads += 1;
            const body = request.postData() || '';
            const idTurma = body.match(/name="id_turma"\r?\n\r?\n([^\r\n]+)/)?.[1];
            if (idTurma) counts.uploadedClassIds.push(idTurma);
            if (upload) return upload(route, counts);
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, message: 'Importação concluída: 0 registros inseridos.' }),
            });
        }

        if (url.pathname.endsWith('/turmas') && request.method() === 'POST') {
            counts.classCreates += 1;
            return route.fulfill({
                status: 201,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, id_turma: fixture.class.id_turma, message: 'Turma criada.' }),
            });
        }

        let payload = { success: true };
        if (url.pathname.endsWith('/edicoes')) payload = [fixture.edition];
        else if (url.pathname.endsWith('/categorias')) payload = [fixture.category];
        else if (url.pathname.endsWith('/turmas')) payload = [fixture.class];
        else if (url.pathname.endsWith('/usuarios') && url.searchParams.get('acao') === 'listar_competidores') {
            counts.rosterRequests += 1;
            payload = { competidores: fixture.students };
        } else if (url.pathname.endsWith('/usuarios')) payload = { status: 'sucesso', competidores: [] };
        else if (url.pathname.endsWith('/modalidades') || url.pathname.endsWith('/jogos')
            || url.pathname.endsWith('/partidas') || url.pathname.endsWith('/equipes')) payload = [];

        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(payload),
        });
    });
    return counts;
}

async function choosePdfFromKeyboard(page, inputSelector, namePattern = /selecionar.*pdf/i) {
    const input = page.locator(inputSelector);
    await expect(input).toHaveCount(1);
    await expect(input).toHaveAttribute('accept', /pdf/i);
    await expect(input).toBeEnabled();

    let chooserEvent;
    if (await input.isVisible()) {
        await expect(input).toHaveAccessibleName(/pdf/i);
        await input.focus();
        await expect(input).toBeFocused();
        chooserEvent = page.waitForEvent('filechooser');
        await page.keyboard.press('Enter');
    } else {
        const trigger = page.getByRole('button', { name: namePattern }).first();
        await expect(trigger).toBeVisible();
        await expect(trigger).toHaveAccessibleName(/pdf/i);
        await trigger.focus();
        await expect(trigger).toBeFocused();
        chooserEvent = page.waitForEvent('filechooser');
        await page.keyboard.press('Enter');
    }

    const chooser = await chooserEvent;
    await chooser.setFiles(samplePdf);
}

async function openPdfFormOnTurmaAlunos(page, viewport = { width: 1440, height: 900 }) {
    await page.setViewportSize(viewport);
    await page.goto('turmas/alunos?id=901&id_turma=902&id_categoria=903', { waitUntil: 'domcontentloaded' });
    if (viewport.width < 768) {
        await page.locator('#botaoPdfMob').click();
        await expect(page.locator('#blocoPdfMob')).toHaveClass(/\bshow\b/);
        await expect(page.locator('#formPdfTurmaMob')).toBeVisible();
        return { input: '#pdfInputMob', filename: '#pdfNomeMob', form: '#formPdfTurmaMob', message: '#msgPdfMob', progress: '#progressMob', bar: '#progressBarMob', text: '#progressTextoMob', submit: '#formPdfTurmaMob button[type="submit"]', search: '#buscaAlunoMob' };
    }
    await page.locator('#botaoPdfDesk').click();
    await expect(page.locator('#blocoPdfDesk')).toHaveClass(/\bshow\b/);
    await expect(page.locator('#formPdfTurmaDesk')).toBeVisible();
    return { input: '#pdfInputDesk', filename: '#pdfNomeDesk', form: '#formPdfTurmaDesk', message: '#msgPdfDesk', progress: '#progressDesk', bar: '#progressBarDesk', text: '#progressTextoDesk', submit: '#formPdfTurmaDesk button[type="submit"]', search: '#buscaAlunoDesk' };
}

async function openCreateClassDialog(page) {
    await page.goto('edicoes/categorias?id=901&modo=create', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#listaCategoriasDesktop')).toContainText('Sub-15');
    const category = page.getByRole('button', { name: 'Selecionar categoria: Sub-15' });
    await expect(category).toBeVisible();
    await category.click();
    await expect(category).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#btnAdicionarTurmaDesktop').click();
    await expect(page.getByRole('dialog', { name: /Criar nova Turma/i })).toBeVisible();
}

test.describe('E05 — importação PDF acessível e recuperável', () => {
    test('seleção de PDF por teclado mostra o arquivo e a próxima ação em retrato e desktop', async ({ page }) => {
        await loginAsAdmin(page);
        installApiFixtures(page);

        const mobile = await openPdfFormOnTurmaAlunos(page, { width: 390, height: 844 });
        await choosePdfFromKeyboard(page, mobile.input);
        await expect(page.locator(mobile.filename)).toContainText(samplePdf.name);
        await expect(page.locator(mobile.submit)).toBeVisible();
        await expect(page.locator(mobile.submit)).toBeEnabled();
        await expect(page.locator(mobile.form)).toContainText(/PDF/i);

        const desktop = await openPdfFormOnTurmaAlunos(page, { width: 1440, height: 900 });
        await choosePdfFromKeyboard(page, desktop.input);
        await expect(page.locator(desktop.filename)).toContainText(samplePdf.name);
        await expect(page.locator(desktop.submit)).toBeVisible();
        await expect(page.locator(desktop.submit)).toBeEnabled();
    });

    test('criação de turma com PDF pode ser retomada sem duplicar a turma', async ({ page }) => {
        await loginAsAdmin(page);
        let createAttempts = 0;
        const uploadedClassIds = [];
        const counts = installApiFixtures(page, {
            upload: async (route, state) => {
                const body = route.request().postData() || '';
                const classId = body.match(/name="id_turma"\r?\n\r?\n([^\r\n]+)/)?.[1];
                if (classId) uploadedClassIds.push(classId);
                if (state.uploads === 1) {
                    return route.fulfill({
                        status: 200,
                        contentType: 'application/json',
                        body: JSON.stringify({
                            success: false,
                            message: 'Não foi possível extrair alunos do PDF. Tente um PDF com texto selecionável.',
                            fallback_converter: true,
                        }),
                    });
                }
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ success: true, message: 'Importação concluída: 0 registros inseridos.' }),
                });
            },
        });
        page.on('request', (request) => {
            if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/turmas')) createAttempts += 1;
        });

        await openCreateClassDialog(page);
        await page.locator('#inputNomeTurma').fill('8º Ano E05');
        await page.locator('#arquivoUpload').setInputFiles(samplePdf);
        await expect(page.locator('#nomeArquivo')).toContainText(samplePdf.name);

        const submit = page.locator('#formNovaTurmaCategoria button[type="submit"]');
        await submit.click();
        await expect(page.locator('#msgNovaTurmaCategoria')).toContainText('PDF com texto selecionável');
        await expect(page.locator('#msgNovaTurmaCategoria')).not.toContainText('Turma criada com sucesso');
        await expect(page.locator('#inputNomeTurma')).toHaveValue('8º Ano E05');
        await expect(page.locator('#nomeArquivo')).toContainText(samplePdf.name);
        await expect(submit).toBeEnabled();
        await expect(submit).toHaveAccessibleName(/tentar importar.*novamente/i);

        await submit.click();
        await expect.poll(() => counts.uploads).toBe(2);
        await expect.poll(() => createAttempts).toBe(1);
        await expect.poll(async () => {
            if (/turmas\/alunos\?.*id_turma=902/.test(page.url())) return 'navigated';
            return page.locator('#msgNovaTurmaCategoria').textContent().catch(() => '');
        }).toMatch(/navigated|Importação concluída/i);
        expect(uploadedClassIds).toEqual(['902', '902']);
        expect(counts.classCreates).toBe(1);
    });

    test('upload na turma rejeita respostas falsas, mantém detalhes/contexto e aceita resposta JSON explícita', async ({ page }) => {
        await loginAsAdmin(page);
        const cases = [
            {
                status: 200,
                contentType: 'text/html',
                body: '<!doctype html><html><body>Proxy login page</body></html>',
                expected: /resposta inválida|falha.*import|não foi possível/i,
                forbidden: /Importação concluída|Proxy login page|<!doctype/i,
            },
            {
                status: 200,
                contentType: 'application/json',
                body: '{ invalid json',
                expected: /resposta inválida|falha.*import|não foi possível/i,
                forbidden: /Importação concluída/i,
            },
            {
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: false, message: 'Falha simulada: o PDF não contém texto selecionável.', fallback_converter: true }),
                expected: /Falha simulada: o PDF não contém texto selecionável/i,
                forbidden: /Importação concluída/i,
            },
            {
                status: 500,
                contentType: 'application/json',
                body: JSON.stringify({ success: false, message: 'Falha simulada no serviço de importação.' }),
                expected: /Falha simulada no serviço de importação/i,
                forbidden: /Importação concluída/i,
            },
            {
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true, message: 'Importação concluída: 0 registros inseridos.' }),
                expected: /Importação concluída: 0 registros inseridos/i,
                forbidden: /Processando alunos/i,
            },
        ];
        let responseIndex = 0;
        const counts = installApiFixtures(page, {
            upload: async (route) => {
                const response = cases[responseIndex++];
                return route.fulfill(response);
            },
        });

        const form = await openPdfFormOnTurmaAlunos(page, { width: 1440, height: 900 });
        await page.locator(form.input).setInputFiles(samplePdf);
        await page.locator(form.search).fill('Ana');
        await expect(page.locator(form.filename)).toContainText(samplePdf.name);
        await expect(page.locator(form.submit)).toBeEnabled();
        await expect(page.locator('#tbodyAlunosTurmaDesk')).toContainText('Ana Pereira');

        for (let index = 0; index < cases.length; index += 1) {
            const response = page.waitForResponse((candidate) =>
                candidate.url().includes('/api/v1/importacoes/turma-pdf') && candidate.request().method() === 'POST',
                { timeout: 15000 }
            );
            await page.locator(form.submit).click();
            await response;
            await expect.poll(() => counts.uploads, { message: `request ${index + 1} was not handled` }).toBe(index + 1);
            await expect(page.locator(form.message)).toContainText(cases[index].expected);
            await expect(page.locator(form.message)).not.toContainText(cases[index].forbidden);

            if (index < cases.length - 1) {
                await expect(page.locator(form.input)).toBeEnabled();
                await expect(page.locator(form.filename)).toContainText(samplePdf.name);
                await expect(page.locator(form.search)).toHaveValue('Ana');
                await expect(page).toHaveURL(/turmas\/alunos\?id=901&id_turma=902&id_categoria=903/);
                await expect(page.locator('#tbodyAlunosTurmaDesk')).toContainText('Ana Pereira');
            }
        }

        expect(counts.uploads).toBe(cases.length);
        expect(counts.classCreates).toBe(0);
        await expect.poll(() => counts.rosterRequests).toBe(2);
        await expect(page.locator(form.search)).toHaveValue('Ana');
        await expect(page.locator(form.input)).toHaveValue('');
        await expect(page.locator(form.submit)).toBeEnabled();
        await expect(page).toHaveURL(/turmas\/alunos\?id=901&id_turma=902&id_categoria=903/);
    });

    test('importação confirmada atualiza alunos sem perder busca e libera o próximo arquivo', async ({ page }) => {
        await loginAsAdmin(page);
        const counts = installApiFixtures(page);
        const form = await openPdfFormOnTurmaAlunos(page, { width: 1440, height: 900 });
        await page.locator(form.input).setInputFiles(samplePdf);
        await expect(page.locator('#tbodyAlunosTurmaDesk')).toContainText('Ana Pereira');

        await page.locator(form.submit).click();
        await expect(page.locator(form.message)).toContainText('Importação concluída');
        await expect.poll(() => counts.rosterRequests).toBe(2);
        await expect(page.locator(form.input)).toHaveValue('');
        await expect(page.locator(form.submit)).toBeEnabled();
        await expect(page).toHaveURL(/turmas\/alunos\?id=901&id_turma=902&id_categoria=903/);
        await page.locator(form.search).fill('Ana');
        await expect(page.locator('#tbodyAlunosTurmaDesk')).toContainText('Ana Pereira');
    });

    test('barra anuncia processamento sem percentual e atualiza valores ARIA quando o total é conhecido', async ({ page }) => {
        await loginAsAdmin(page);
        let releaseUpload;
        let signalUpload;
        const uploadStarted = new Promise((resolve) => { signalUpload = resolve; });
        const counts = installApiFixtures(page, {
            upload: async (route) => {
                const hold = new Promise((resolve) => { releaseUpload = resolve; });
                signalUpload();
                await hold;
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({ success: true, message: 'Importação concluída: 0 registros inseridos.' }),
                });
            },
        });
        await page.addInitScript(() => {
            const nativeSend = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.send = function (...args) {
                window.__sgiE05UploadXhr = this;
                return nativeSend.apply(this, args);
            };
        });

        const form = await openPdfFormOnTurmaAlunos(page, { width: 1440, height: 900 });
        await page.locator(form.input).setInputFiles(samplePdf);
        await page.locator(form.submit).click();
        await uploadStarted;

        const progress = page.locator(`${form.progress} [role="progressbar"]`);
        await expect(progress).toBeVisible();
        await page.evaluate(() => {
            window.__sgiE05UploadXhr.upload.dispatchEvent(new ProgressEvent('progress', { lengthComputable: false }));
        });
        await expect(progress).not.toHaveAttribute('aria-valuenow', /.+/);
        await expect(page.locator(form.text)).toContainText(/processando/i);

        await page.evaluate(() => {
            window.__sgiE05UploadXhr.upload.dispatchEvent(new ProgressEvent('progress', {
                lengthComputable: true,
                loaded: 42,
                total: 100,
            }));
        });
        await expect(progress).toHaveAttribute('aria-valuemin', '0');
        await expect(progress).toHaveAttribute('aria-valuemax', '100');
        await expect(progress).toHaveAttribute('aria-valuenow', '42');
        await expect(page.locator(form.text)).toContainText('42%');

        releaseUpload();
        await expect(page.locator(form.message)).toContainText('Importação concluída');
        await expect(page.locator(form.text)).not.toContainText('Processando alunos');
        expect(counts.uploads).toBe(1);
    });
});
