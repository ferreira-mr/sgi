const { test, expect } = require('./fixtures.cjs');

const fixtureEditionId = 98531;
const fixtureTeamId = 98532;
const fixtureGameId = 98533;
const fixturePlayerId = 98534;
const fixtureTeamName = 'Turma E03 Exemplo';

async function entrarComoAdmin(page) {
    await page.goto('login', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#form_desktop')).toBeVisible();
    await page.locator('#form_desktop .ipt-matricula').fill('admin');
    await page.locator('#form_desktop .ipt-senha').fill('123');
    await page.locator('#form_desktop button[type="submit"]').click();
    await page.waitForURL(/\/edicoes|\/painel/, { timeout: 15_000 });
}

async function mockPageData(page, { tempoRestante = 1000 } = {}) {
    await page.route('**/api/v1/**', async (route) => {
        const url = new URL(route.request().url());
        const apiPosition = url.pathname.indexOf('/api/v1/');
        if (apiPosition < 0) return route.continue();

        const resource = url.pathname.slice(apiPosition + '/api/v1/'.length);
        const acao = url.searchParams.get('acao');
        let body;

        if (resource === 'edicoes') {
            body = [{
                id_interclasse: fixtureEditionId,
                nome_interclasse: 'Interclasse de regressão E03',
                status_interclasse: '1',
            }];
        } else if (resource === 'turmas') {
            body = [{
                id_turma: fixtureTeamId,
                turmas_id_turma: fixtureTeamId,
                nome_turma: fixtureTeamName,
                nome_fantasia_turma: fixtureTeamName,
                nome_categoria: 'Categoria de teste',
            }];
        } else if (resource === 'ocorrencias-turmas' || resource === 'arrecadacao' || resource === 'artilheiros') {
            body = [];
        } else if (resource === 'jogos') {
            body = [{
                id_jogo: fixtureGameId,
                nome_jogo: 'Partida de teste E03',
                tipo_competicao: 'mata_mata',
                nome_tipo_modalidade: 'Mata-Mata',
                nome_modalidade: 'Futsal',
                data_jogo: '2026-09-13',
                status_jogo: 'Iniciado',
                duracao_jogo: 1200,
                tempo_restante_jogo: tempoRestante,
            }];
        } else if (resource === 'partidas') {
            body = [
                { id_partida: 98535, jogos_id_jogo: fixtureGameId, equipes_id_equipe: 98536, id_turma: fixtureTeamId, turmas_id_turma: fixtureTeamId, nome_equipe: 'Equipe E03 Azul', nome_turma: fixtureTeamName, resultado_partida: 1 },
                { id_partida: 98537, jogos_id_jogo: fixtureGameId, equipes_id_equipe: 98538, id_turma: fixtureTeamId + 1, turmas_id_turma: fixtureTeamId + 1, nome_equipe: 'Equipe E03 Vermelha', nome_turma: 'Turma E03 Adversária', resultado_partida: 0 },
            ];
        } else if (resource === 'pontos' && acao === 'atletas') {
            body = { success: true, atletas: [{ id_usuario: fixturePlayerId, nome_usuario: 'Atleta E03' }] };
        } else if (resource === 'pontos') {
            body = {
                success: true,
                pontos: [{
                    id_ponto: 98539,
                    jogos_id_jogo: fixtureGameId,
                    id_partida: 98535,
                    equipes_id_equipe: 98536,
                    usuarios_id_usuario: fixturePlayerId,
                    nome_usuario: 'Atleta E03',
                    num_gol: 1,
                    conta_no_placar: 1,
                    status_artilheiro: 'ativo',
                }],
            };
        } else if (resource === 'ocorrencias' && acao === 'listar_atletas') {
            body = { success: true, atletas: [{ id_usuario: fixturePlayerId, nome_usuario: 'Atleta E03' }] };
        } else if (resource === 'ocorrencias') {
            body = [];
        } else {
            return route.continue();
        }

        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(body),
        });
    });
}

async function abrirModal(botao, modal) {
    const shown = modal.evaluate((element) => new Promise((resolve) => {
        element.addEventListener('shown.bs.modal', resolve, { once: true });
    }));
    await botao.click();
    await shown;
    await expect(modal).toBeVisible();
}

async function fecharComEscape(page, modal, acionador) {
    const hidden = modal.evaluate((element) => new Promise((resolve) => {
        element.addEventListener('hidden.bs.modal', resolve, { once: true });
    }));
    await page.keyboard.press('Escape');
    await hidden;
    await expect(modal).toBeHidden();
    await expect(acionador).toBeFocused();
}

test('placar, ocorrências e arrecadação expõem rótulos, modais nomeados e retorno de foco', async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrarComoAdmin(page);
    await mockPageData(page);

    const ocorrenciasResponse = await page.goto(`ocorrencias?id=${fixtureEditionId}`, { waitUntil: 'domcontentloaded' });
    expect(ocorrenciasResponse).not.toBeNull();
    const ocorrenciasHtml = await ocorrenciasResponse.text();
    expect(ocorrenciasHtml.indexOf('js/pages/disciplina/ocorrencias.js')).toBeGreaterThan(-1);
    expect(ocorrenciasHtml.indexOf('js/pages/disciplina/ocorrencias.js')).toBeLessThan(ocorrenciasHtml.indexOf('vendor/bootstrap/js/bootstrap.bundle.min.js'));
    expect(ocorrenciasHtml.match(/vendor\/bootstrap\/js\/bootstrap\.bundle\.min\.js/g)).toHaveLength(1);

    const listaOcorrencias = page.locator('#listaOcorrenciasDesktop');
    const adicionarOcorrencia = listaOcorrencias.getByRole('button', { name: `Adicionar ocorrência para ${fixtureTeamName}` });
    await expect(adicionarOcorrencia).toBeVisible();
    const modalNovaOcorrencia = page.locator('#modalNovaOcorrencia');
    await abrirModal(adicionarOcorrencia, modalNovaOcorrencia);
    const dialogNovaOcorrencia = page.getByRole('dialog', { name: new RegExp(`Nova ocorrência.*${fixtureTeamName}`, 'i') });
    await expect(dialogNovaOcorrencia).toBeVisible();
    await expect(dialogNovaOcorrencia.getByLabel('Título')).toBeVisible();
    await expect(dialogNovaOcorrencia.getByLabel('Pontos a descontar')).toHaveAttribute('min', '0');
    await dialogNovaOcorrencia.getByLabel('Pontos a descontar').click();
    await expect(dialogNovaOcorrencia.getByLabel('Pontos a descontar')).toBeFocused();
    await fecharComEscape(page, modalNovaOcorrencia, adicionarOcorrencia);

    const historicoOcorrenciasButton = listaOcorrencias.getByRole('button', { name: `Ver histórico de ocorrências de ${fixtureTeamName}` });
    const modalHistoricoOcorrencias = page.locator('#modalHistoricoOcorrencias');
    await abrirModal(historicoOcorrenciasButton, modalHistoricoOcorrencias);
    await expect(page.getByRole('dialog', { name: new RegExp(`Histórico de ocorrências.*${fixtureTeamName}`, 'i') })).toBeVisible();
    await fecharComEscape(page, modalHistoricoOcorrencias, historicoOcorrenciasButton);

    const arrecadacaoResponse = await page.goto(`edicoes/arrecadacao?id=${fixtureEditionId}`, { waitUntil: 'domcontentloaded' });
    expect(arrecadacaoResponse).not.toBeNull();
    const arrecadacaoHtml = await arrecadacaoResponse.text();
    const modalMarkup = arrecadacaoHtml.indexOf('id="modalHistoricoArrecadacao"');
    const pageScript = arrecadacaoHtml.indexOf('js/pages/eventos/configurar-arrecadacao.js');
    const bootstrapScript = arrecadacaoHtml.indexOf('vendor/bootstrap/js/bootstrap.bundle.min.js');
    expect(modalMarkup).toBeGreaterThan(arrecadacaoHtml.lastIndexOf('</main>'));
    expect(pageScript).toBeGreaterThan(modalMarkup);
    expect(pageScript).toBeLessThan(bootstrapScript);
    expect(arrecadacaoHtml.match(/vendor\/bootstrap\/js\/bootstrap\.bundle\.min\.js/g)).toHaveLength(1);

    const inputArrecadacao = page.locator('#listaArrecadacaoDesktop').getByLabel(`Quantidade arrecadada em quilogramas para ${fixtureTeamName}`);
    await expect(inputArrecadacao).toBeVisible();
    await expect(inputArrecadacao).toHaveAttribute('step', '0.1');
    const historicoArrecadacaoButton = page.locator('#listaArrecadacaoDesktop').getByRole('button', { name: `Ver histórico de arrecadações de ${fixtureTeamName}` });
    const modalHistoricoArrecadacao = page.locator('#modalHistoricoArrecadacao');
    await abrirModal(historicoArrecadacaoButton, modalHistoricoArrecadacao);
    await expect(page.getByRole('dialog', { name: new RegExp(`Histórico de arrecadações.*${fixtureTeamName}`, 'i') })).toBeVisible();
    await fecharComEscape(page, modalHistoricoArrecadacao, historicoArrecadacaoButton);

    await page.goto(`jogos/placar?id_jogo=${fixtureGameId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#placar-conteudo')).toBeVisible();
    await expect(page.getByLabel('Duração do jogo')).toBeVisible();
    const adicionarOcorrenciaPlacar = page.getByRole('button', { name: 'Registrar nova ocorrência' });
    const modalOcorrenciaPlacar = page.locator('#modalOcorrencia');
    await abrirModal(adicionarOcorrenciaPlacar, modalOcorrenciaPlacar);
    const dialogOcorrenciaPlacar = page.getByRole('dialog', { name: 'Nova ocorrência' });
    const grupoTipoOcorrencia = dialogOcorrenciaPlacar.getByRole('group', { name: 'Tipo de ocorrência' });
    await grupoTipoOcorrencia.locator('label[for="tipoOcorrenciaAmarelo"]').click();
    await expect(grupoTipoOcorrencia.getByRole('radio', { name: 'Amarelo' })).toBeChecked();
    await expect(dialogOcorrenciaPlacar.getByLabel('Turma')).toBeVisible();
    await expect(dialogOcorrenciaPlacar.getByLabel('Estudante')).toBeDisabled();
    await expect(dialogOcorrenciaPlacar.getByLabel('Descrição')).toBeVisible();
    await fecharComEscape(page, modalOcorrenciaPlacar, adicionarOcorrenciaPlacar);

    const adicionarPonto = page.getByRole('button', { name: 'Registrar ponto para Equipe E03 Azul' });
    const anularPonto = page.getByRole('button', { name: 'Anular último ponto de Equipe E03 Azul' });
    const anularPontoSemRegistro = page.getByRole('button', { name: 'Anular último ponto de Equipe E03 Vermelha' });
    await expect(adicionarPonto).toBeEnabled();
    await expect(anularPonto).toBeEnabled();
    await expect(anularPontoSemRegistro).toBeDisabled();
    const modalArtilheiro = page.locator('#modalArtilheiro');
    await abrirModal(adicionarPonto, modalArtilheiro);
    const dialogArtilheiro = page.getByRole('dialog', { name: 'Registrar ponto' });
    await expect(dialogArtilheiro.getByLabel('Equipe')).toBeVisible();
    await expect(dialogArtilheiro.getByLabel('Estudante responsável pela jogada')).toHaveAttribute('aria-required', 'true');
    await fecharComEscape(page, modalArtilheiro, adicionarPonto);
});

test('E03 associa erro de tempo extra ao campo e valida o limite', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await entrarComoAdmin(page);
    await mockPageData(page, { tempoRestante: 0 });
    await page.goto(`jogos/placar?id_jogo=${fixtureGameId}`, { waitUntil: 'domcontentloaded' });

    const tempoExtra = page.getByLabel('Tempo extra, em minutos');
    await expect(tempoExtra).toBeVisible();
    const adicionar = page.locator('#mc-overtime-actions button');

    for (const valor of ['0', '31']) {
        await tempoExtra.fill(valor);
        await adicionar.click();
        await expect(tempoExtra).toHaveAttribute('aria-invalid', 'true');
        await expect(tempoExtra).toHaveAttribute('aria-describedby', 'mc-overtime-error');
        await expect(page.locator('#mc-overtime-error')).toBeVisible();
        await expect(page.locator('#mc-overtime-error')).toContainText('1 a 30 minutos');
        await expect(tempoExtra).toBeFocused();
    }
});
