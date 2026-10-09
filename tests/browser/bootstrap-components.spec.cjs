const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const assetUrl = (file) => new URL(`assets/${file}`, process.env.SGI_BASE_URL || 'http://localhost/SGI/').toString();

for (const width of [390, 1440]) {
    test('native button and switch states survive context CSS at ' + width, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
        await page.setContent('<button type="button" class="btn btn-primary" id="theme-button">Ação</button><input type="checkbox" class="form-check-input status-switch" aria-label="Edição ativa">');
        await page.addStyleTag({ url: assetUrl('css/bootstrap-theme.css') });
        const action = page.locator('#theme-button');
        const toggle = page.getByRole('checkbox');
        const style = locator => locator.evaluate(el => {
            const s = getComputedStyle(el);
            return { color: s.color, background: s.backgroundColor, border: s.borderColor, shadow: s.boxShadow, opacity: s.opacity };
        });
        const reference = {};
        reference.normal = await style(action);
        await action.hover(); reference.hover = await style(action);
        await action.evaluate(el => el.disabled = true); reference.disabled = await style(action);
        await toggle.check(); await toggle.focus(); reference.checked = await style(toggle);
        for (const file of ['shared', 'admin']) await page.addStyleTag({ url: assetUrl(`css/${file}.css`) });
        await expect.poll(() => style(toggle)).toEqual(reference.checked);
        await expect.poll(() => style(action)).toEqual(reference.disabled);
        await action.evaluate(el => el.disabled = false);
        await action.hover();
        await expect.poll(() => style(action)).toEqual(reference.hover);
        await page.mouse.move(width - 1, 899);
        await expect.poll(() => style(action)).toEqual(reference.normal);
        await toggle.uncheck(); await expect(toggle).not.toBeChecked();
        await expect(action).toBeEnabled();
    });
}

test('feedback uses the Bootstrap Toast API and escapes message text', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.setContent('<div class="toast-container position-fixed top-0 end-0 p-3" id="sgiToastContainer"></div>');
    await page.addStyleTag({ url: assetUrl('css/bootstrap-theme.css') });
    await page.addScriptTag({ url: assetUrl('vendor/bootstrap/js/bootstrap.bundle.min.js') });
    await page.addScriptTag({ url: assetUrl('js/shared/bootstrap-feedback.js') });

    await page.evaluate(() => window.SGI.showToast('<b>mensagem</b>', 'error', { delay: 50 }));
    const toast = page.locator('#sgiToastContainer .toast');
    await expect(toast).toHaveClass(/text-bg-danger/);
    await expect(toast).toContainText('<b>mensagem</b>');
    await expect(toast.locator('b')).toHaveCount(0);
    await expect(toast).toBeVisible();
    await expect(toast).toHaveCount(0, { timeout: 1000 });
});

test('feedback dialogs are modal, accessible, queued and safe', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.setContent('<button id="origin">Abrir</button>');
    await page.addStyleTag({ url: assetUrl('css/bootstrap-theme.css') });
    await page.addStyleTag({ url: assetUrl('css/shared.css') });
    await page.addScriptTag({ url: assetUrl('vendor/bootstrap/js/bootstrap.bundle.min.js') });
    await page.addScriptTag({ url: assetUrl('js/shared/bootstrap-feedback.js') });

    await page.evaluate(() => {
        window.__sgiFirstDialog = window.SGI.alert({
            titulo: 'Mensagem segura',
            mensagem: '<script>alert(1)</script>\nlinha 2',
            tipo: 'error'
        });
    });
    const modal = page.locator('.sgi-feedback-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toHaveAttribute('role', 'dialog');
    await expect(modal).toContainText('<script>alert(1)</script>');
    await expect(modal.locator('script')).toHaveCount(0);
    await expect(modal.locator('.sgi-feedback-modal__message')).toHaveCSS('white-space', 'pre-wrap');
    await modal.getByRole('button', { name: 'Entendi' }).click();
    await page.evaluate(() => window.__sgiFirstDialog);
    await expect(modal).toHaveCount(0);

    await page.evaluate(() => {
        window.__sgiConfirmation = window.SGI.confirm({
            titulo: 'Excluir registro?',
            mensagem: 'A ação não pode ser desfeita.',
            textoConfirmar: 'Excluir',
            destrutivo: true
        });
    });
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog').getByRole('button', { name: 'Excluir' })).toHaveClass(/btn-danger/);
    await page.getByRole('dialog').getByRole('button', { name: 'Cancelar' }).click();
    expect(await page.evaluate(() => window.__sgiConfirmation)).toBeFalsy();

    await page.evaluate(() => {
        document.body.insertAdjacentHTML('beforeend', `
            <div class="modal fade" id="sourceModal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog"><div class="modal-content">
                    <div class="modal-body"><input id="sourceField" value="valor preservado"></div>
                </div></div>
            </div>
        `);
        const source = document.getElementById('sourceModal');
        const sourceInstance = bootstrap.Modal.getOrCreateInstance(source);
        source.addEventListener('shown.bs.modal', () => {
            document.getElementById('sourceField').focus();
            window.__sgiSourceFeedback = window.SGI.alert('A mensagem veio do formulário.');
        }, { once: true });
        sourceInstance.show();
    });
    await expect(page.locator('#sourceModal')).toBeVisible();
    await expect(page.getByRole('dialog').filter({ hasText: 'A mensagem veio do formulário.' })).toBeVisible();
    await expect(page.locator('#sourceModal')).toBeHidden();
    await page.getByRole('dialog').getByRole('button', { name: 'Entendi' }).click();
    await page.evaluate(() => window.__sgiSourceFeedback);
    await expect(page.locator('#sourceModal')).toBeVisible();
    await expect(page.locator('#sourceField')).toHaveValue('valor preservado');
    await expect(page.locator('#sourceField')).toBeFocused();
    await page.evaluate(() => bootstrap.Modal.getInstance(document.getElementById('sourceModal')).hide());
    await expect(page.locator('#sourceModal')).toBeHidden();

    await page.evaluate(() => {
        window.__sgiQueuedOne = window.SGI.alert('primeira');
        window.__sgiQueuedTwo = window.SGI.alert('segunda');
    });
    await expect(page.getByRole('dialog')).toContainText('primeira');
    await page.getByRole('dialog').getByRole('button', { name: 'Entendi' }).click();
    await page.evaluate(() => window.__sgiQueuedOne);
    await expect(page.getByRole('dialog')).toContainText('segunda');
    await page.getByRole('dialog').getByRole('button', { name: 'Entendi' }).click();
    await page.evaluate(() => window.__sgiQueuedTwo);
    await expect(page.getByRole('dialog')).toHaveCount(0);
});
