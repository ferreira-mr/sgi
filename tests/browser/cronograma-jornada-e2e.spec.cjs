const { test, expect } = require('./fixtures.cjs');

const BASE_URL = process.env.SGI_BASE_URL || 'http://localhost/SGI/';

async function jsonOrThrow(response, label) {
    if (!response.ok()) throw new Error(`${label}: HTTP ${response.status()} ${await response.text()}`);
    return response.json();
}

function isoDateAfterDays(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function criarCenario(request, fixture) {
    await jsonOrThrow(await request.post('api/v1/login', {
        data: { matricula: 'admin', senha: '123' },
    }), 'login administrativo de preparação');

    const edicoes = await jsonOrThrow(await request.get('api/v1/edicoes?regulamento=true'), 'consulta da edição anterior');
    const anterior = (Array.isArray(edicoes) ? edicoes : []).find((item) => String(item.status_interclasse) === '1');
    fixture.idInterclasseAnterior = Number(anterior?.id_interclasse || 0);
    const criada = await jsonOrThrow(await request.post('api/v1/edicoes', {
        data: {
            nome_interclasse: `Jornada cronograma E2E ${Date.now()}`,
            ano_interclasse: `${isoDateAfterDays(30)} 00:00:00`,
        },
    }), 'criação da edição E2E');
    const idInterclasse = Number(criada.id_interclasse || criada.id || 0);
    if (!idInterclasse) throw new Error('A API não retornou a edição E2E.');
    fixture.idInterclasse = idInterclasse;
    await jsonOrThrow(await request.post(`api/v1/edicoes?id=${idInterclasse}`, {
        data: { status_interclasse: '1' },
    }), 'ativação da edição E2E para o mesário');

    const [categorias, turmas, modalidades, locais] = await Promise.all([
        request.get(`api/v1/categorias?id_interclasse=${idInterclasse}`).then((response) => jsonOrThrow(response, 'categorias da edição E2E')),
        request.get(`api/v1/turmas?id_interclasse=${idInterclasse}`).then((response) => jsonOrThrow(response, 'turmas da edição E2E')),
        request.get(`api/v1/modalidades?id_interclasse=${idInterclasse}`).then((response) => jsonOrThrow(response, 'modalidades da edição E2E')),
        request.get(`api/v1/locais?id_interclasse=${idInterclasse}&disponivel=1`).then((response) => jsonOrThrow(response, 'locais da edição E2E')),
    ]);
    const categoria = Array.isArray(categorias) ? categorias[0] : null;
    const turma = (Array.isArray(turmas) ? turmas : []).find((item) => Number(item.categorias_id_categoria) === Number(categoria?.id_categoria));
    const modalidade = (Array.isArray(modalidades) ? modalidades : []).find((item) =>
        Number(item.categorias_id_categoria) === Number(categoria?.id_categoria)
        && String(item.genero_modalidade || '').toUpperCase() === 'MASC'
        && String(item.nome_tipo_modalidade || '').toLowerCase().includes('mata'),
    );
    if (!categoria || !turma || !modalidade) throw new Error('A edição E2E precisa de turma e modalidade coletiva mata-mata MASC.');

    fixture.idModalidade = Number(modalidade.id_modalidade);
    fixture.nomeModalidade = String(modalidade.nome_modalidade);
    fixture.idTurma = Number(turma.id_turma);

    for (const item of Array.isArray(modalidades) ? modalidades : []) {
        const id = Number(item.id_modalidade);
        const ativa = id === Number(modalidade.id_modalidade);
        await jsonOrThrow(await request.put('api/v1/modalidades', {
            data: ativa
                ? {
                    id_modalidade: id,
                    interclasses_id_interclasse: idInterclasse,
                    status_modalidade: '1',
                    equipes_planejadas: 6,
                    min_inscritos_equipe: 1,
                    max_inscritos_equipe: 4,
                    formato_participacao: 'equipe',
                    duracao_prevista_min: 5,
                    descanso_min: 0,
                }
                : { id_modalidade: id, status_modalidade: '0' },
        }), `configuração da modalidade ${id}`);
    }

    const equipesDaModalidade = await jsonOrThrow(
        await request.get(`api/v1/equipes?id_modalidade=${Number(modalidade.id_modalidade)}`),
        'equipes iniciais da modalidade E2E',
    );
    for (const equipe of Array.isArray(equipesDaModalidade) ? equipesDaModalidade : []) {
        if (Number(equipe.turmas_id_turma) !== Number(turma.id_turma)
            && String(equipe.status_equipe) === '1') {
            await jsonOrThrow(await request.put('api/v1/equipes', {
                data: { id_equipe: Number(equipe.id_equipe), status_equipe: '0' },
            }), `inativação da equipe extra ${equipe.id_equipe} no fixture`);
        }
    }

    for (const item of Array.isArray(turmas) ? turmas : []) {
        if (Number(item.categorias_id_categoria) === Number(categoria.id_categoria)
            && Number(item.id_turma) !== Number(turma.id_turma)) {
            await jsonOrThrow(await request.put('api/v1/turmas', {
                data: { id_turma: Number(item.id_turma), status_turma: '0' },
            }), `inativação da turma extra ${item.id_turma} no fixture`);
        }
    }

    let local = (Array.isArray(locais) ? locais : []).find((item) => String(item.status_local) === '1');
    if (!local) {
        local = await jsonOrThrow(await request.post('api/v1/locais', {
            data: {
                nome_local: `Quadra cronograma E2E ${Date.now()}`,
                disponivel_local: '1',
                carga_local: 0,
                interclasses_id_interclasse: idInterclasse,
            },
        }), 'criação do local E2E');
    }
    if (!Number(local.id_local)) throw new Error('A API não retornou um local disponível para a edição E2E.');

    const alunos = [];
    for (let index = 1; index <= 6; index += 1) {
        const matricula = `58${Date.now().toString().slice(-10)}${index}`;
        const aluno = await jsonOrThrow(await request.post('api/v1/usuarios?acao=criar_aluno', {
            data: {
                nome_usuario: `Aluno cronograma E2E ${index}`,
                matricula_usuario: matricula,
                genero_usuario: 'MASC',
                data_nasc_usuario: '2008-07-20',
                turmas_id_turma: Number(turma.id_turma),
            },
        }), `criação do aluno E2E ${index}`);
        if (aluno.status !== 'sucesso' || !aluno.senha_temporaria) {
            throw new Error(`Não foi possível criar o aluno E2E ${index}: ${JSON.stringify(aluno)}`);
        }
        alunos.push({ matricula, senhaInicial: String(aluno.senha_temporaria) });
    }

    fixture.idModalidade = Number(modalidade.id_modalidade);
    fixture.idTurma = Number(turma.id_turma);
    fixture.alunos = alunos;
    fixture.dataJogo = isoDateAfterDays(0);
}

async function esperarJogoPlanejadoLocal(page, tag, estado) {
    await expect.poll(async () => page.evaluate(async ({ nome, alvo }) => {
        const jogos = await window.SGIDataLayer.read('jogos');
        const jogo = jogos.find((item) => String(item.nome_jogo) === nome);
        if (!jogo) return false;
        if (alvo === 'concluido') return /Concluido|Finalizado/.test(String(jogo.status_jogo));
        if (alvo === 'final') {
            return Number(jogo.id_jogo) < 0
                && jogo.status_jogo === 'Agendado'
                && Array.isArray(jogo.equipes)
                && jogo.equipes.length === 2;
        }
        return false;
    }, { nome: tag, alvo: estado })).toBe(true);
}

async function jogarPartidaOfflinePelaAgenda(page, fixture, titulo) {
    await page.evaluate((id) => window.__SGI_SPA__.navegarPara('agenda', { id }), fixture.idInterclasse);
    await expect(page.locator('#lista-eventos')).toBeVisible({ timeout: 20_000 });
    const card = page.locator('#lista-eventos .ag-event-card').filter({
        has: page.getByRole('heading', { name: titulo, exact: true }),
    }).first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.locator('.iniciar-jogo-btn').click();
    const placarLink = card.locator('a[href*="jogos/placar"]');
    await expect(placarLink).toBeVisible({ timeout: 10_000 });
    await placarLink.click();
    await expect(page.locator('#placar-conteudo')).toBeVisible();

    await page.locator('.btn-score-plus').first().click();
    const artilheiro = page.locator('#modalArtilheiro');
    await expect(artilheiro).toBeVisible();
    await expect.poll(() => artilheiro.locator('#selectAlunoArtilheiro option').count()).toBeGreaterThan(1);
    await artilheiro.locator('#selectAlunoArtilheiro').selectOption({ index: 1 });
    await artilheiro.locator('#btnSalvarArtilheiro').click();
    await expect(artilheiro).toBeHidden();
    await expect(page.locator('.score-number').first()).toHaveText('1');

    await page.locator('button.mc-action-btn--finish').click();
    const confirmacao = page.locator('.sgi-feedback-modal').filter({ hasText: 'O placar final será gravado no sistema.' });
    await expect(confirmacao).toBeVisible();
    await confirmacao.getByRole('button', { name: 'Encerrar jogo' }).click();
    await expect(page.locator('#mc-status-badge')).toContainText('Encerrado');
    await expect.poll(() => page.evaluate(() => window.SGIOffline.getState().pending)).toBeGreaterThan(0);

    const feedback = page.getByRole('dialog').getByRole('button', { name: 'Entendi' });
    await expect(feedback).toBeVisible({ timeout: 10_000 });
    await expect(feedback).toBeEnabled();
    await feedback.click();
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 10_000 });
}

function slotsPublicados(state) {
    return (Array.isArray(state.compromissos) ? state.compromissos : [])
        .map((item) => [
            Number(item.id_modalidade),
            String(item.chave_tag),
            String(item.data_compromisso),
            String(item.inicio_compromisso),
            String(item.termino_compromisso),
            Number(item.id_local),
        ])
        .sort((first, second) => first[1].localeCompare(second[1]));
}

function duracaoJogoLabel(segundos) {
    const totalSec = Number(segundos);
    if (!Number.isFinite(totalSec) || totalSec <= 0) return '—';
    const horas = Math.floor(totalSec / 3600);
    const minutos = Math.floor((totalSec % 3600) / 60);
    const restantes = Math.floor(totalSec % 60);
    const partes = [];
    if (horas > 0) partes.push(`${horas}h`);
    if (minutos > 0) partes.push(`${minutos}min`);
    if (restantes > 0) partes.push(`${restantes}s`);
    return partes.join(' ') || '—';
}

async function abrirEFecharInscricoes(page) {
    await page.locator('#cronogramaInscricaoInicio').fill('2020-01-01T00:00');
    await page.locator('#cronogramaInscricaoFim').fill('2035-12-31T23:59');
    await page.locator('#cronogramaAbrir').click();
    await expect(page.locator('#cronogramaPlanejadoStatus')).toContainText('inscrições abertas', { timeout: 15_000 });
    await page.locator('#cronogramaFechar').click();
    await expect(page.locator('#cronogramaPlanejadoStatus')).toContainText('inscrições encerradas', { timeout: 15_000 });
}

async function entrarComo(page, matricula, senha) {
    await page.goto('login', { waitUntil: 'domcontentloaded' });
    await page.locator('#form_desktop .ipt-matricula').fill(matricula);
    await page.locator('#form_desktop .ipt-senha').fill(senha);
    await page.locator('#form_desktop button[type="submit"]').click();
}

async function selecionarModalidadeNoChaveamento(page, nomeModalidade) {
    const seletor = await page.locator('.sgi-chaveamento-desktop').isVisible()
        ? page.locator('#kvs-wrap-selectModalidade')
        : page.locator('#kvs-wrap-selectModalidadeMob');
    await seletor.locator('.kvs__trigger').click();
    await expect(seletor.locator('.kvs__panel')).toBeVisible();
    await seletor.getByRole('combobox', { name: 'Buscar modalidade' }).fill(nomeModalidade);
    const opcao = seletor.locator('.kvs__opcao').filter({ hasText: nomeModalidade });
    await expect(opcao).toHaveCount(1);
    await opcao.click();
}

async function validarResumoChaveamento(page, duracoesEsperadas, totalJogos = 5) {
    await expect(page.locator('#statJogos')).toHaveText(String(totalJogos), { timeout: 20_000 });
    await expect(page.locator('#statCampeoes')).toHaveText('1');
    await expect(page.locator('#statPendentes')).toHaveText('0');
    await expect(page.locator('#tbodyJogos tr')).toHaveCount(totalJogos);
    await expect(page.locator('#tbodyJogos')).not.toContainText(/NaN|Infinity/);
    await expect(page.locator('#jogos-th-tempo')).toHaveText('Duração do jogo');
    await expect(page.locator('#jogos-mob-th-tempo')).toHaveText('Duração do jogo');
    await expect(page.locator('#tbodyJogos td[headers="jogos-th-tempo"]')).toHaveText(duracoesEsperadas);
}

async function capturarDatasHistorico(page) {
    return (await page.locator('#tbodyJogos td[headers="jogos-th-data"]').allTextContents())
        .map((data) => data.trim())
        .sort();
}

async function datasDoPayload(page, jogos) {
    return page.evaluate((lista) => lista.map((jogo) => {
        if (!jogo.data_jogo) return '---';
        return new Date(jogo.data_jogo + (jogo.inicio_jogo ? `T${jogo.inicio_jogo}` : ''))
            .toLocaleString('pt-BR');
    }).sort(), jogos);
}

async function primeiroAcesso(page, aluno, senhaNova) {
    await entrarComo(page, aluno.matricula, aluno.senhaInicial);
    await page.waitForURL(/\/aluno\/trocar-senha/, { timeout: 20_000 });
    await page.locator('#novaSenhaPrimeiroAcesso').fill(senhaNova);
    await page.locator('#confirmarSenhaPrimeiroAcesso').fill(senhaNova);
    await page.locator('#btnSalvarSenhaPrimeiroAcesso').click();
    await page.waitForURL(/\/aluno\/termos/, { timeout: 20_000 });
    await page.locator('#btnAceitarTermos').click();
    await page.waitForURL(/\/aluno\/inicio/, { timeout: 20_000 });
}

async function inscreverPelaInterface(browser, fixture, aluno, equipeIndex) {
    const context = await browser.newContext({ baseURL: BASE_URL });
    try {
        const page = await context.newPage();
        await primeiroAcesso(page, aluno, 'CronogramaE2E#2026');
        await page.goto(`aluno/modalidades?id=${fixture.idInterclasse}`, { waitUntil: 'domcontentloaded' });
        const card = page.locator('.modalidade-card:not(.lotado)').first();
        await expect(card).toBeVisible({ timeout: 20_000 });
        const modal = page.locator('#modalEquipes');
        const modalShown = modal.evaluate((element) => new Promise((resolve) => {
            element.addEventListener('shown.bs.modal', resolve, { once: true });
        }));
        await card.click();
        await expect(modal).toBeVisible();
        await modalShown;
        const rows = modal.locator('.equipe-pick-row');
        await expect(rows).toHaveCount(6);
        await rows.nth(equipeIndex).click();
        await expect(modal).toBeHidden();
        await expect(page.locator('#agendaInscricaoPreview')).toBeVisible();
        await expect(page.locator('#agendaInscricaoPreview')).toContainText(fixture.dataJogo.split('-').reverse().join('/'));

        const registrationRequest = page.waitForRequest((request) =>
            request.url().includes('/api/v1/inscricoes') && request.method() === 'POST',
        );
        await page.locator('#btnSalvar').click();
        const teamId = Number((await registrationRequest).postDataJSON()?.id_equipes?.[0] || 0);
        await expect(page.locator('#msgFeedback')).toContainText(/sucesso|salvo/i, { timeout: 15_000 });
        await page.waitForURL(/\/aluno\/inicio/, { timeout: 20_000 });
        if (!teamId) throw new Error('A inscrição pela interface não enviou a equipe selecionada.');
        return teamId;
    } finally {
        await context.close();
    }
}

test.describe.serial('Fluxo único de cronograma — jornada E2E', () => {
    let fixture = null;

    test.afterEach(async ({ request }) => {
        if (!Number(fixture?.idInterclasseAnterior)) return;
        await jsonOrThrow(await request.post(`api/v1/edicoes?id=${fixture.idInterclasseAnterior}`, {
            data: { status_interclasse: '1' },
        }), 'restauração da edição ativa anterior à jornada E2E');
    });

    test('equipes vazias → calendário publicado → inscrição → semifinais e final offline sincronizadas', async ({ browser, page, request }, testInfo) => {
        test.setTimeout(360_000);
        fixture = {};
        await criarCenario(request, fixture);

        await entrarComo(page, 'admin', '123');
        await page.waitForURL(/\/edicoes(?:\?|$)/, { timeout: 20_000 });
        await page.goto(`edicoes/agenda?id=${fixture.idInterclasse}`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#painelCronogramaPlanejado')).toBeVisible({ timeout: 20_000 });

        await expect(page.locator('#cronogramaPlanejadoStatus')).toContainText('rascunho');
        await page.locator('#cronogramaPreparar').click();
        await expect(page.locator('#cronogramaPlanejadoResumo')).toContainText(/equipe\(s\) criada\(s\); \d+ já existente\(s\)\./, { timeout: 15_000 });
        const equipesDisponiveis = await jsonOrThrow(
            await request.get(`api/v1/equipes?id_modalidade=${fixture.idModalidade}`),
            'equipes preparadas antes da publicação',
        );
        const equipesPreparadas = (Array.isArray(equipesDisponiveis) ? equipesDisponiveis : []).filter((equipe) =>
            Number(equipe.turmas_id_turma) === fixture.idTurma && String(equipe.status_equipe) === '1',
        );
        expect(equipesPreparadas).toHaveLength(6);
        fixture.equipes = equipesPreparadas;
        for (const equipe of equipesPreparadas) {
            const membros = await jsonOrThrow(
                await request.get(`api/v1/equipes?id_equipe=${Number(equipe.id_equipe)}`),
                `membros da equipe ${equipe.id_equipe} antes da publicação`,
            );
            expect(membros).toHaveLength(0);
        }

        await page.locator('#cronogramaDataInicio').fill(fixture.dataJogo);
        await page.locator('#cronogramaDataFim').fill(fixture.dataJogo);
        await page.locator('#cronogramaHoraInicio').fill('08:00');
        await page.locator('#cronogramaHoraFim').fill('09:05');
        await page.locator('#cronogramaDuracao').fill('5');
        await page.locator('#cronogramaGerar').click();
        await expect(page.locator('#cronogramaPublicar')).toBeEnabled({ timeout: 15_000 });
        await expect(page.locator('#cronogramaPlanejadoResumo')).toContainText('nó(s)');
        await page.locator('#cronogramaPublicar').click();
        await expect(page.locator('#cronogramaPlanejadoStatus')).toContainText('publicado', { timeout: 15_000 });

        const primeiraPublicacao = await jsonOrThrow(
            await request.get(`api/v1/cronograma?id_interclasse=${fixture.idInterclasse}`),
            'consulta da primeira publicação',
        );
        const slotsPrimeiraPublicacao = slotsPublicados(primeiraPublicacao);
        expect(slotsPrimeiraPublicacao).toHaveLength(5);

        await abrirEFecharInscricoes(page);
        await page.locator('#cronogramaRevisar').click();
        await expect(page.locator('#cronogramaPlanejadoStatus')).toContainText('revisao', { timeout: 15_000 });
        await page.locator('#cronogramaGerar').click();
        await expect(page.locator('#cronogramaPublicar')).toBeEnabled({ timeout: 15_000 });
        await page.locator('#cronogramaPublicar').click();
        await expect(page.locator('#cronogramaPlanejadoStatus')).toContainText('publicado', { timeout: 15_000 });

        const segundaPublicacao = await jsonOrThrow(
            await request.get(`api/v1/cronograma?id_interclasse=${fixture.idInterclasse}`),
            'consulta da segunda publicação',
        );
        expect(slotsPublicados(segundaPublicacao)).toEqual(slotsPrimeiraPublicacao);

        await abrirEFecharInscricoes(page);
        await page.locator('#cronogramaRevisar').click();
        await expect(page.locator('#cronogramaPlanejadoStatus')).toContainText('revisao', { timeout: 15_000 });
        await page.locator('#cronogramaGerar').click();
        await expect(page.locator('#cronogramaPublicar')).toBeEnabled({ timeout: 15_000 });
        await page.locator('#cronogramaPublicar').click();
        await expect(page.locator('#cronogramaPlanejadoStatus')).toContainText('publicado', { timeout: 15_000 });
        const terceiraPublicacao = await jsonOrThrow(
            await request.get(`api/v1/cronograma?id_interclasse=${fixture.idInterclasse}`),
            'consulta da terceira publicação',
        );
        expect(slotsPublicados(terceiraPublicacao)).toEqual(slotsPrimeiraPublicacao);

        await page.locator('#cronogramaInscricaoInicio').fill('2020-01-01T00:00');
        await page.locator('#cronogramaInscricaoFim').fill('2035-12-31T23:59');
        await page.locator('#cronogramaAbrir').click();
        await expect(page.locator('#cronogramaPlanejadoStatus')).toContainText('inscrições abertas', { timeout: 15_000 });

        const inscricoes = [];
        for (let index = 0; index < fixture.alunos.length; index += 1) {
            inscricoes.push(await inscreverPelaInterface(browser, fixture, fixture.alunos[index], index));
        }
        expect(new Set(inscricoes).size).toBe(6);

        await page.locator('#cronogramaFechar').click();
        await expect(page.locator('#cronogramaPlanejadoStatus')).toContainText('inscrições encerradas', { timeout: 15_000 });
        await page.locator('#cronogramaLiberar').click();
        await expect(page.locator('#cronogramaPlanejadoResumo')).toContainText('Competição liberada', { timeout: 20_000 });

        const jogos = await jsonOrThrow(await request.get(`api/v1/jogos?id_modalidade=${fixture.idModalidade}`), 'consulta do jogo materializado');
        const larguraInicial = 8;
        const prefixoPlanejado = `PL:${fixture.idModalidade}:${fixture.idTurma}:MM:${larguraInicial}:`;
        const jogosIniciais = (Array.isArray(jogos) ? jogos : []).filter((item) =>
            String(item.nome_jogo || '').startsWith(prefixoPlanejado) && String(item.status_jogo) === 'Agendado',
        );
        expect(jogosIniciais).toHaveLength(3);
        const tagsIniciais = jogosIniciais.map((item) => String(item.nome_jogo)).sort();
        const tagSemifinal = `PL:${fixture.idModalidade}:${fixture.idTurma}:MM:4:0:N`;
        const tagFinal = `PL:${fixture.idModalidade}:${fixture.idTurma}:MM:2:0:N`;
        const tagsConfrontos = [ ...tagsIniciais, tagSemifinal, tagFinal ];
        fixture.idsJogosIniciais = jogosIniciais.map((item) => Number(item.id_jogo));
        fixture.vencedoresEsperados = [];
        for (const jogoInicial of jogosIniciais) {
            const partidas = await jsonOrThrow(
                await request.get(`api/v1/partidas?id_jogo=${Number(jogoInicial.id_jogo)}`),
                `participantes de ${jogoInicial.nome_jogo}`,
            );
            expect(partidas).toHaveLength(2);
            fixture.vencedoresEsperados.push(Number(partidas[0].equipes_id_equipe));
        }

        const mesarioContext = await browser.newContext({ baseURL: BASE_URL });
        try {
            const mesarioPage = await mesarioContext.newPage();
            await entrarComo(mesarioPage, 'mesario', '123');
            await mesarioPage.waitForURL(/\/painel\?id=\d+/, { timeout: 20_000 });
            await expect.poll(() => mesarioPage.evaluate(() => {
                const estado = window.__SGI_SPA__?.status?.();
                return Boolean(estado?.pronto) && !Boolean(estado?.preloading);
            }), { timeout: 90_000 }).toBe(true);
            await expect(mesarioPage.locator('#sgi-offline-ok')).toHaveAttribute('aria-label', 'Pronto para uso offline nesta aba preparada');

            await mesarioPage.locator('#linkAgenda:visible').first().click();
            await expect(mesarioPage.locator('#lista-eventos')).toBeVisible();
            await mesarioContext.setOffline(true);
            await expect.poll(() => mesarioPage.evaluate(() => navigator.onLine)).toBe(false);
            for (let index = 0; index < tagsIniciais.length; index += 1) {
                await jogarPartidaOfflinePelaAgenda(mesarioPage, fixture, `Quartas de final — Confronto ${index + 1}`);
                await esperarJogoPlanejadoLocal(mesarioPage, tagsIniciais[index], 'concluido');
                await expect.poll(async () => mesarioPage.evaluate(async (prefixo) => {
                    const jogosLocais = await window.SGIDataLayer.read('jogos');
                    return jogosLocais.filter((item) => String(item.nome_jogo).startsWith(prefixo))
                        .filter((item) => /Concluido|Finalizado/.test(String(item.status_jogo))).length;
                }, prefixoPlanejado)).toBe(index + 1);
            }

            await esperarJogoPlanejadoLocal(mesarioPage, tagSemifinal, 'final');
            await jogarPartidaOfflinePelaAgenda(mesarioPage, fixture, 'Semifinal — Confronto 1');
            await esperarJogoPlanejadoLocal(mesarioPage, tagSemifinal, 'concluido');
            await esperarJogoPlanejadoLocal(mesarioPage, tagFinal, 'final');
            const finalLocal = await mesarioPage.evaluate(async (tag) => {
                const jogosLocais = await window.SGIDataLayer.read('jogos');
                return jogosLocais.find((item) => String(item.nome_jogo) === tag) || null;
            }, tagFinal);
            expect(finalLocal.data_jogo).toBeTruthy();
            expect(finalLocal.inicio_jogo).toBeTruthy();
            expect(Number(finalLocal.locais_id_local)).toBeGreaterThan(0);
            const nomesFinalistas = finalLocal.equipes.map((equipe) => String(equipe.nome_equipe || '').trim());
            expect(nomesFinalistas).toHaveLength(2);
            expect(new Set(nomesFinalistas).size).toBe(2);
            expect(finalLocal.equipes.map((equipe) => Number(equipe.id_equipe)).sort((a, b) => a - b))
                .toEqual([fixture.vencedoresEsperados[0], fixture.vencedoresEsperados[2]].sort((a, b) => a - b));

            await jogarPartidaOfflinePelaAgenda(mesarioPage, fixture, 'Final — Confronto 1');
            await esperarJogoPlanejadoLocal(mesarioPage, tagFinal, 'concluido');
            const jogoFinalLocal = await mesarioPage.evaluate(async (tag) => {
                const jogosLocais = await window.SGIDataLayer.read('jogos');
                return jogosLocais.find((item) => String(item.nome_jogo) === tag) || null;
            }, tagFinal);
            const idFinalTemporario = Number(jogoFinalLocal.id_jogo);
            expect(idFinalTemporario).toBeLessThan(0);
            const campeaoOfflineEsperado = Number(
                jogoFinalLocal.equipes.slice().sort((a, b) => Number(b.gols || 0) - Number(a.gols || 0))[0].id_equipe,
            );

            await mesarioContext.setOffline(false);
            await expect.poll(() => mesarioPage.evaluate(() => window.SGIOffline.getState().pending), { timeout: 45_000 }).toBe(0);
            const jogosReconciliados = await jsonOrThrow(
                await request.get(`api/v1/jogos?id_modalidade=${fixture.idModalidade}`),
                'jogos PL depois da reconciliação offline',
            );
            const jogosPlanejados = (Array.isArray(jogosReconciliados) ? jogosReconciliados : []).filter((item) =>
                tagsConfrontos.includes(String(item.nome_jogo || '')),
            );
            expect(jogosPlanejados).toHaveLength(5);
            const porTag = Object.fromEntries(jogosPlanejados.map((item) => [item.nome_jogo, item]));
            for (const tag of tagsConfrontos) {
                expect(porTag[tag]).toBeTruthy();
                expect(porTag[tag].status_jogo).toBe('Concluido');
                expect(porTag[tag].data_jogo).toBe(fixture.dataJogo);
                expect(porTag[tag].inicio_jogo).toBeTruthy();
            }
            expect(Number(porTag[tagFinal].id_jogo)).toBeGreaterThan(0);
            expect(Number(porTag[tagFinal].id_jogo)).not.toBe(idFinalTemporario);
            const duracoesEsperadas = jogosPlanejados.map((jogo) => duracaoJogoLabel(jogo.duracao_jogo));
            const arvoreReconciliada = await jsonOrThrow(
                await request.get(`api/v1/chaveamentos?id_modalidade=${fixture.idModalidade}`),
                'árvore planejada depois da reconciliação offline',
            );
            const jogoFinalNaArvore = (arvoreReconciliada.jogos || []).find((item) => item.nome_jogo === tagFinal);
            expect(jogoFinalNaArvore).toBeTruthy();
            expect(Number(jogoFinalNaArvore.equipe_vencedora_id)).toBe(campeaoOfflineEsperado);

            await mesarioPage.goto(`chaveamento?id=${fixture.idInterclasse}`, { waitUntil: 'domcontentloaded' });
            await selecionarModalidadeNoChaveamento(mesarioPage, fixture.nomeModalidade);
            const areaChaveamento = await mesarioPage.locator('.sgi-chaveamento-desktop').isVisible()
                ? mesarioPage.locator('#bracketArea')
                : mesarioPage.locator('#bracketAreaMob');
            await expect(areaChaveamento.locator('.bracket-champion-card')).toBeVisible({ timeout: 20_000 });
            await expect(areaChaveamento.locator('.bracket-champion-card__name')).not.toBeEmpty();
            await validarResumoChaveamento(mesarioPage, duracoesEsperadas, 5);
            const nomesChaveamentoMesario = await areaChaveamento.locator('.bkt-team__name').allTextContents();
            expect(nomesChaveamentoMesario.filter((nome) => /^Equipe #\d+$/.test(nome.trim()))).toEqual([]);
            const datasHistoricoMesario = await capturarDatasHistorico(mesarioPage);
            expect(datasHistoricoMesario).toHaveLength(5);
            expect(datasHistoricoMesario.every((data) => data.includes(fixture.dataJogo.split('-').reverse().join('/')))).toBe(true);
            expect(datasHistoricoMesario).toEqual(await datasDoPayload(mesarioPage, jogosPlanejados));
            await mesarioPage.screenshot({ path: testInfo.outputPath('chaveamento-mesario-historico.png'), fullPage: true });

            await page.goto(`chaveamento?id=${fixture.idInterclasse}`, { waitUntil: 'domcontentloaded' });
            await selecionarModalidadeNoChaveamento(page, fixture.nomeModalidade);
            await expect(page.locator('#bracketArea .bracket-champion-card')).toBeVisible({ timeout: 20_000 });
            await validarResumoChaveamento(page, duracoesEsperadas, 5);
            const nomesChaveamentoAdmin = await page.locator('#bracketArea .bkt-team__name').allTextContents();
            expect(nomesChaveamentoAdmin.filter((nome) => /^Equipe #\d+$/.test(nome.trim()))).toEqual([]);
            expect(await capturarDatasHistorico(page)).toEqual(datasHistoricoMesario);
            expect(await capturarDatasHistorico(page)).toEqual(await datasDoPayload(page, jogosPlanejados));
            await page.screenshot({ path: testInfo.outputPath('chaveamento-admin-historico.png'), fullPage: true });
        } finally {
            await mesarioContext.close();
        }
    });

    test.afterAll(async ({ request }) => {
        if (!fixture?.idInterclasse) return;
        await request.post('api/v1/login', { data: { matricula: 'admin', senha: '123' } });
        if (fixture.idInterclasseAnterior) {
            await request.post(`api/v1/edicoes?id=${fixture.idInterclasseAnterior}`, { data: { status_interclasse: '1' } });
        }
        await request.post(`api/v1/edicoes?id=${fixture.idInterclasse}`, { data: { status_interclasse: '0' } });
    });
});
