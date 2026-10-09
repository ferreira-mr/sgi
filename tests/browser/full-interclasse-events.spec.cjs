const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('./fixtures.cjs');

test.use({ trace: 'off', screenshot: 'off' });

const STAFF_PASSWORD = 'InterclasseMes#2026';
const SCENARIO = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, '../../tests/fixtures/simulacao-interclasse/manifest.json'),
    'utf8',
));
let progressPath = '';

function progress(stage, data = {}) {
    if (!progressPath) return;
    fs.writeFileSync(progressPath, JSON.stringify({
        at: new Date().toISOString(),
        stage,
        data,
    }, null, 2) + '\n');
}

function artifacts() {
    const directory = path.join(process.env.SGI_TEST_RESULTS_DIR || '/app/test-results', 'simulacao-interclasse');
    const resolved = JSON.parse(fs.readFileSync(path.join(directory, 'manifest-resolved.json'), 'utf8'));
    const observed = JSON.parse(fs.readFileSync(path.join(directory, 'observed.json'), 'utf8'));
    const state = JSON.parse(fs.readFileSync(path.join(directory, 'simulation-state.json'), 'utf8'));
    if (observed.status !== 'prepared' || !state.edition_id || !resolved.run_id) {
        throw new Error('A integração não deixou a edição no estado preparado para a operação no navegador.');
    }
    return { directory, resolved, state };
}

function matriculaFor(runId, editionId, classIndex, studentIndex) {
    const date = runId.slice(2, 8);
    if (!/^\d{6}$/.test(date)) throw new Error('O run ID não contém a data UTC esperada.');
    return '9' + date + String(editionId % 10000).padStart(4, '0')
        + String(classIndex + 1).padStart(2, '0') + String(studentIndex).padStart(2, '0');
}

async function json(response, label) {
    if (!response.ok()) throw new Error(label + ': HTTP ' + response.status() + ' ' + await response.text());
    return response.json();
}

async function login(page, matricula, senha) {
    await page.goto('login', { waitUntil: 'domcontentloaded' });
    const form = page.locator('#form_desktop');
    await expect(form).toBeVisible();
    await form.locator('.ipt-matricula').fill(matricula);
    await form.locator('.ipt-senha').fill(senha);
    await form.locator('button[type="submit"]').click();
    await expect(page.getByRole('heading', { name: 'Painel do Mesário' })).toBeVisible({ timeout: 20_000 });
}

async function loginAdmin(page) {
    await page.goto('login', { waitUntil: 'domcontentloaded' });
    const form = page.locator('#form_desktop');
    await expect(form).toBeVisible();
    await form.locator('.ipt-matricula').fill('admin');
    await form.locator('.ipt-senha').fill('123');
    await form.locator('button[type="submit"]').click();
    await page.waitForURL(/\/edicoes(?:\?|$)/, { timeout: 20_000 });
}

async function prepareMesario(request, editionId, runId) {
    const date = runId.slice(2, 8);
    const matricula = '8' + date + String(editionId % 10000).padStart(4, '0')
        + String(Math.floor(Math.random() * 9000) + 1000);
    const created = await json(await request.post('api/v1/usuarios?acao=cadastrar_usuario', {
        data: {
            nome_usuario: 'Mesario Simulado ' + runId.slice(0, 8) + ' B',
            matricula_usuario: matricula,
            senha_usuario: STAFF_PASSWORD,
            data_nasc_usuario: '1990-01-01',
            genero_usuario: 'MASC',
        },
    }), 'criação do segundo mesário');
    const userId = Number(created.id_usuario || created.id);
    if (!userId) throw new Error('O segundo mesário não recebeu ID: ' + JSON.stringify(created));
    await json(await request.post('api/v1/usuarios?acao=atualizar_colaborador', {
        data: { id_usuario: userId, is_mesario_clicado: '1' },
    }), 'concessão do perfil de mesário');
    return { matricula, id: userId };
}

function modalityKey(entry, templates, categories) {
    const template = templates.find((item) => item.name === entry.nome_modalidade);
    const category = categories.get(Number(entry.categorias_id_categoria));
    return template && category ? category + '-' + template.alias : null;
}

function winnerFor(category, participants, teamsById) {
    const priority = category === 'I' ? ['6EF', '8EF', '7EF'] : ['9EF', '2EMA', '1EMA', '3EMA'];
    for (const alias of priority) {
        const found = participants.find((id) => teamsById.get(id)?.class === alias);
        if (found) return found;
    }
    throw new Error('Não foi possível eleger vencedor sintético na categoria ' + category + '.');
}

async function readMatch(request, game, teamsById) {
    const parts = await json(await request.get('api/v1/partidas?id_jogo=' + Number(game.id_jogo)), 'partidas de ' + game.nome_jogo);
    const participants = parts.map((item) => Number(item.equipes_id_equipe)).filter((id) => id > 0);
    if (participants.length !== 2 || participants.some((id) => !teamsById.has(id))) return null;
    return { game, parts, participants };
}

async function nextOpenMatch(request, modalityId, teamsById) {
    const games = await json(await request.get('api/v1/jogos?id_modalidade=' + Number(modalityId)), 'jogos disponíveis para operação visual');
    for (const game of games) {
        if (!['Agendado', 'Aguardando'].includes(String(game.status_jogo))) continue;
        if (!/MM:\d+:\d+:N$/.test(String(game.nome_jogo))) continue;
        const match = await readMatch(request, game, teamsById);
        if (match) return match;
    }
    return null;
}

async function openGame(page, gameId) {
    await page.evaluate((id) => {
        if (!window.__SGI_SPA__ || typeof window.__SGI_SPA__.navegarPara !== 'function') {
            throw new Error('A casca do mesário não ficou disponível.');
        }
        window.__SGI_SPA__.navegarPara('jogos', { id_jogo: id, origem: 'agenda_edit' });
    }, gameId);
    await expect.poll(() => new URL(page.url()).searchParams.get('id_jogo'), { timeout: 25_000 }).toBe(String(gameId));
    await expect(page.locator('#placar-grid')).toBeVisible({ timeout: 25_000 });
    await expect(page.locator('#placar-titulo-jogo')).not.toHaveText('Placar');
}

async function addPoint(page, sideIndex) {
    progress('abrir-modal-ponto', { sideIndex });
    await page.locator('.btn-score-plus[data-idx="' + sideIndex + '"]').click();
    const modal = page.locator('#modalArtilheiro');
    await modal.waitFor({ state: 'visible' });
    await expect.poll(() => modal.locator('#selectAlunoArtilheiro option').count(), { timeout: 10_000 }).toBeGreaterThan(1);
    const optionCount = await modal.locator('#selectAlunoArtilheiro option').count();
    const available = await modal.locator('#selectAlunoArtilheiro option').evaluateAll((options) =>
        options.filter((option) => option.value).length,
    );
    progress('modal-ponto-pronto', { sideIndex, optionCount, available });
    if (available === 0) throw new Error('O placar não carregou atleta elegível para o ponto.');
    await modal.locator('#selectAlunoArtilheiro').selectOption({ index: 1 });
    await modal.locator('#btnSalvarArtilheiro').click();
    progress('ponto-enviado', { sideIndex });
    await expect(modal).toBeHidden({ timeout: 10_000 });
    progress('ponto-confirmado-ui', { sideIndex });
}

async function finishGame(page, match, score, options = {}) {
    progress('abrir-jogo', { id: match.game.id_jogo, tag: match.game.nome_jogo });
    if (!options.alreadyOpened) await openGame(page, Number(match.game.id_jogo));
    await expect(page.locator('#mc-status-badge')).toContainText(/Agendado|Aguardando/);
    const durationSelect = page.locator('#select-duracao');
    if (await durationSelect.count()) await durationSelect.selectOption('20');
    await page.locator('button.mc-action-btn--start').click();
    progress('jogo-iniciado', { id: match.game.id_jogo });
    await expect(page.locator('#mc-status-badge')).toContainText(/Em andamento|Iniciado/);
    if (options.pauseResume) {
        const pauseButton = page.locator('#btn-pausar');
        await expect(pauseButton).toHaveText('Pausar');
        await pauseButton.click();
        await expect(page.locator('#mc-status-badge')).toContainText('Pausado');
        await expect(pauseButton).toHaveText('Retomar');
        await pauseButton.click();
        await expect(page.locator('#mc-status-badge')).toContainText(/Em andamento|Iniciado/);
        await expect(pauseButton).toHaveText('Pausar');
        options.pauseResumeCompleted = true;
        progress('cronometro-pausado-retomado', { id: match.game.id_jogo });
    }
    if (options.correctLoserIndex !== undefined) {
        // Registre e anule imediatamente o ponto equivocado antes dos demais;
        // assim, a correção não depende do estado acumulado em outras jogadas.
        const correctionSide = options.correctLoserIndex;
        const beforeCorrection = await page.evaluate((side) => ({
            score: Number(document.querySelectorAll('.score-number')[side]?.textContent || 0),
            timer: document.querySelector('#timer-placar')?.textContent?.trim() || '',
        }), correctionSide);
        expect(beforeCorrection.score).toBe(0);
        await addPoint(page, correctionSide);
        const correctionState = await page.evaluate((side) => ({
            status: document.querySelector('#mc-status-badge')?.textContent?.trim() || '',
            timer: document.querySelector('#timer-placar')?.textContent?.trim() || '',
            score: Number(document.querySelectorAll('.score-number')[side]?.textContent || 0),
            minusEnabled: !document.querySelector('.btn-score-minus[data-idx="' + side + '"]')?.disabled,
        }), correctionSide);
        progress('corrigir-ponto', { side: correctionSide, beforeCorrection, correctionState });
        fs.writeFileSync(path.join(path.dirname(progressPath), 'browser-correction-diagnostics.json'), JSON.stringify({
            game_id: Number(match.game.id_jogo), side: correctionSide, beforeCorrection, correctionState,
        }, null, 2) + '\n');
        expect(correctionState.score).toBe(1);
        expect(correctionState.minusEnabled).toBe(true);
        const minus = page.locator('.btn-score-minus[data-idx="' + correctionSide + '"]');
        await expect(minus).toBeEnabled();
        await minus.click();
        progress('corrigir-ponto-enviado', { side: correctionSide });
        await expect(page.locator('.score-number').nth(correctionSide)).toHaveText('0');
        progress('corrigir-ponto-concluido', { side: correctionSide });
    }
    for (let i = 0; i < match.parts.length; i += 1) {
        const pointsToAdd = score[i] - (i === options.correctLoserIndex ? 1 : 0);
        for (let point = 0; point < pointsToAdd; point += 1) await addPoint(page, i);
    }
    progress('encerrar-jogo', { id: match.game.id_jogo });
    await page.locator('button.mc-action-btn--finish').click();
    const confirmation = page.locator('.sgi-feedback-modal').filter({ hasText: 'O placar final será gravado no sistema.' });
    if (await confirmation.count()) {
        await expect(confirmation).toBeVisible();
        await confirmation.getByRole('button', { name: 'Encerrar jogo' }).click();
    }
    await expect(page.locator('#mc-status-badge')).toContainText('Encerrado', { timeout: 30_000 });
    progress('jogo-encerrado-ui', { id: match.game.id_jogo, offline: Boolean(options.offline) });
    if (options.offline) {
        const feedback = page.getByRole('dialog');
        await expect(feedback).toContainText(/offline|Vencedor avançou|Vencedor aguardando|Campeão definido/i, { timeout: 10_000 });
        await feedback.getByRole('button', { name: 'Entendi' }).click();
    }
    if (options.allowQueued) {
        await expect.poll(() => page.evaluate(() => window.SGIOffline.getState().pending), { timeout: 120_000 }).toBe(0);
    } else if (!options.offline) {
        await expect(page.locator('#mc-sync-status')).not.toContainText('aguardando', { timeout: 20_000 });
    }
}

async function operateIndividual(args) {
    const { request, page, alias, modality, podiumByCategory, state, category } = args;
    const games = await json(await request.get('api/v1/jogos?id_modalidade=' + Number(modality.id)), 'provas de ' + alias);
    const tag = 'IND:' + modality.id;
    const game = games.find((item) => String(item.nome_jogo) === tag);
    if (!game) throw new Error('A prova individual ' + alias + ' não foi materializada.');
    await openGame(page, Number(game.id_jogo));
    const start = page.locator('#btnIniciarProvaIndividual');
    if (await start.count()) {
        await start.click();
        await expect(page.locator('#btnSalvarIndRanking')).toBeEnabled();
    }
    const podium = podiumByCategory[category];
    const genderStudent = alias.endsWith('FEM') ? 17 : 1;
    const studentIds = {};
    for (const [place, classAlias] of Object.entries(podium)) {
        studentIds[place] = Number(state.students[classAlias][String(genderStudent)]);
        if (!studentIds[place]) throw new Error('Sem aluno do pódio ' + classAlias + ' para ' + alias + '.');
    }
    await page.locator('#indSelectPrimeiro').selectOption(String(studentIds['1']));
    await page.locator('#indSelectSegundo').selectOption(String(studentIds['2']));
    await page.locator('#indSelectTerceiro').selectOption(String(studentIds['3']));
    await page.locator('#btnSalvarIndRanking').click();
    await expect(page.locator('#msgIndRanking')).toContainText('Ranking salvo com sucesso', { timeout: 20_000 });
    return {
        modality: alias, game_id: Number(game.id_jogo),
        participants: Object.values(state.teams).filter((team) => team.modality === alias).length,
        podium_student_ids: studentIds, podium_classes: Object.values(podium),
    };
}

test('opera a edição preparada pelos dois portais de mesário, conclui jogos e registra os pódios', async ({ page, browser, request }) => {
    test.setTimeout(1_200_000);
    const { directory, resolved, state } = artifacts();
    progressPath = path.join(directory, 'browser-progress.json');
    progress('iniciando');
    const editionId = Number(state.edition_id);
    const runId = resolved.run_id;
    const templates = SCENARIO.modalities;
    await json(await request.post('api/v1/login', { data: { matricula: 'admin', senha: '123' } }), 'login do administrador para a concorrência');
    const classes = await json(await request.get('api/v1/turmas?id_interclasse=' + editionId), 'turmas da edição');
    const classAliasById = new Map(Object.entries(state.classes).map(([alias, row]) => [Number(row.id), alias]));
    const categoryRows = await json(await request.get('api/v1/categorias?id_interclasse=' + editionId), 'categorias da edição');
    const categoryName = new Map(categoryRows.map((item) => [Number(item.id_categoria), String(item.nome_categoria).replace('Categoria ', '')]));
    const modalitiesResponse = await json(await request.get('api/v1/modalidades?id_interclasse=' + editionId), 'modalidades da edição');
    const modalityByAlias = new Map();
    for (const item of modalitiesResponse) {
        const alias = modalityKey(item, templates, categoryName);
        if (alias) modalityByAlias.set(alias, { id: Number(item.id_modalidade), category: categoryName.get(Number(item.categorias_id_categoria)), alias });
    }

    const secondOperator = await prepareMesario(request, editionId, runId);
    progress('segundo-mesario-criado', { userId: secondOperator.id });
    const secondContext = await browser.newContext();
    const secondPage = await secondContext.newPage();
    page.setDefaultTimeout(15_000);
    secondPage.setDefaultTimeout(15_000);
    page.on('pageerror', (error) => progress('erro-javascript-a', { message: error.message }));
    secondPage.on('pageerror', (error) => progress('erro-javascript-b', { message: error.message }));
    let completed = false;
    try {
        await login(page, 'mesario', '123');
        await expect(page.locator('#sgi-offline-ok')).toContainText('Pronto para uso offline', { timeout: 120_000 });
        await expect.poll(() => page.evaluate(() => window.__SGI_SPA__ && window.__SGI_SPA__.status()), { timeout: 120_000 })
            .toMatchObject({ pronto: true, preloading: false });
        progress('mesario-a-preparado');
        await login(secondPage, secondOperator.matricula, STAFF_PASSWORD);
        await expect(secondPage.locator('#sgi-offline-ok')).toContainText('Pronto para uso offline', { timeout: 120_000 });
        await expect.poll(() => secondPage.evaluate(() => window.__SGI_SPA__ && window.__SGI_SPA__.status()), { timeout: 120_000 })
            .toMatchObject({ pronto: true, preloading: false });
        progress('mesario-b-preparado');

        const teamsById = new Map();
        for (const [alias, modality] of modalityByAlias) {
            const rows = await json(await request.get('api/v1/equipes?id_modalidade=' + modality.id), 'equipes de ' + alias);
            for (const team of rows) teamsById.set(Number(team.id_equipe), {
                class: classAliasById.get(Number(team.turmas_id_turma)),
                class_id: Number(team.turmas_id_turma),
                modality: alias,
            });
        }

        const matchRecords = [];
        const concurrentModality = modalityByAlias.get('II-FUTSAL');
        const initialGames = await json(await request.get('api/v1/jogos?id_modalidade=' + concurrentModality.id), 'semifinais para operação concorrente');
        const firstTwo = [];
        for (const game of initialGames) {
            if (!['Agendado', 'Aguardando'].includes(String(game.status_jogo))) continue;
            if (!/MM:4:\d+:N$/.test(String(game.nome_jogo))) continue;
            const match = await readMatch(request, game, teamsById);
            if (match) firstTwo.push(match);
            if (firstTwo.length === 2) break;
        }
        if (firstTwo.length !== 2) throw new Error('A modalidade escolhida para operação offline precisa apresentar as duas semifinais agendadas.');
        const offlinePlan = firstTwo[0];
        const offlinePlanSecond = firstTwo[1];
        const offlineFinalTag = String(offlinePlan.game.nome_jogo).replace(/MM:4:\d+:N$/, 'MM:2:0:N');
        if (offlineFinalTag === String(offlinePlan.game.nome_jogo)) {
            throw new Error('A tag da semifinal não permite identificar a final planejada.');
        }
        const parallelModality = modalityByAlias.get('I-FUTSAL');
        const parallelGames = await json(await request.get('api/v1/jogos?id_modalidade=' + parallelModality.id), 'jogo da segunda modalidade para o outro mesário');
        let onlinePlan = null;
        for (const game of parallelGames) {
            if (!['Agendado', 'Aguardando'].includes(String(game.status_jogo))) continue;
            onlinePlan = await readMatch(request, game, teamsById);
            if (onlinePlan) break;
        }
        if (!onlinePlan) throw new Error('A segunda modalidade não apresentou jogo disponível para o mesário B.');
        const scoreBase = SCENARIO.expected.event_scores_by_modality.FUTSAL.semifinal;
        const winnerA = winnerFor('II', offlinePlan.participants, teamsById);
        const winnerIndexA = offlinePlan.participants.indexOf(winnerA);
        const scoreA = winnerIndexA === 0 ? scoreBase.slice() : [scoreBase[1], scoreBase[0]];
        const winnerASecond = winnerFor('II', offlinePlanSecond.participants, teamsById);
        const winnerIndexASecond = offlinePlanSecond.participants.indexOf(winnerASecond);
        const scoreASecond = winnerIndexASecond === 0 ? scoreBase.slice() : [scoreBase[1], scoreBase[0]];
        const winnerB = winnerFor('I', onlinePlan.participants, teamsById);
        const winnerIndexB = onlinePlan.participants.indexOf(winnerB);
        const loserIndexB = 1 - winnerIndexB;
        const scoreB = winnerIndexB === 0 ? scoreBase.slice() : [scoreBase[1], scoreBase[0]];
        const lostPointResponse = {
            committedBeforeDrop: false,
            attempts: 0,
            mutationIds: [],
            shotKey: '',
            status: 0,
        };
        const lostResultResponse = {
            committedBeforeDrop: false,
            attempts: 0,
            mutationIds: [],
            status: 0,
        };
        const lostOccurrenceResponse = {
            committedBeforeDrop: false,
            attempts: 0,
            mutationIds: [],
            id: 0,
            status: 0,
        };
        await secondPage.route('**/api/v1/pontos', async (route) => {
            const request = route.request();
            let body;
            try { body = request.postDataJSON(); } catch (_) { body = null; }
            if (request.method() !== 'POST' || Number(body?.jogos_id_jogo) !== Number(onlinePlan.game.id_jogo)) {
                await route.continue();
                return;
            }

            const mutationId = await request.headerValue('x-sgi-mutation-id');
            if (!lostPointResponse.shotKey) {
                lostPointResponse.shotKey = String(body?.chave_jogada || '');
            }
            if (String(body?.chave_jogada || '') !== lostPointResponse.shotKey) {
                await route.continue();
                return;
            }

            lostPointResponse.attempts += 1;
            lostPointResponse.mutationIds.push(mutationId || '');
            if (!lostPointResponse.committedBeforeDrop) {
                const committed = await route.fetch();
                const payload = await committed.json();
                if (!committed.ok() || payload.success !== true) {
                    throw new Error('O ponto-alvo não foi confirmado pelo servidor antes da perda de resposta.');
                }
                lostPointResponse.committedBeforeDrop = true;
                lostPointResponse.status = committed.status();
                await route.abort('failed');
                progress('resposta-de-ponto-perdida-apos-commit', { gameId: onlinePlan.game.id_jogo, status: committed.status() });
                return;
            }
            await route.continue();
        });
        await secondPage.route('**/api/v1/resultados', async (route) => {
            const request = route.request();
            let body;
            try { body = request.postDataJSON(); } catch (_) { body = null; }
            if (request.method() !== 'POST' || Number(body?.id_jogo) !== Number(onlinePlan.game.id_jogo)) {
                await route.continue();
                return;
            }

            const mutationId = await request.headerValue('x-sgi-mutation-id');
            lostResultResponse.attempts += 1;
            lostResultResponse.mutationIds.push(mutationId || '');
            if (!lostResultResponse.committedBeforeDrop) {
                const committed = await route.fetch();
                const payload = await committed.json();
                if (!committed.ok() || payload.success !== true) {
                    throw new Error('O resultado-alvo não foi confirmado pelo servidor antes da perda de resposta.');
                }
                lostResultResponse.committedBeforeDrop = true;
                lostResultResponse.status = committed.status();
                await route.abort('failed');
                progress('resposta-de-resultado-perdida-apos-commit', { gameId: onlinePlan.game.id_jogo, status: committed.status() });
                return;
            }
            await route.continue();
        });
        await secondPage.route('**/api/v1/ocorrencias-turmas', async (route) => {
            const request = route.request();
            let body;
            try { body = request.postDataJSON(); } catch (_) { body = null; }
            if (request.method() !== 'POST'
                || String(body?.titulo_ocorrencia || '') !== 'Registro de contingência sintético') {
                await route.continue();
                return;
            }

            const mutationId = await request.headerValue('x-sgi-mutation-id');
            lostOccurrenceResponse.attempts += 1;
            lostOccurrenceResponse.mutationIds.push(mutationId || '');
            if (!lostOccurrenceResponse.committedBeforeDrop) {
                const committed = await route.fetch();
                const payload = await committed.json();
                if (!committed.ok() || payload.success !== true || Number(payload.id) <= 0) {
                    throw new Error('A ocorrência-alvo não foi confirmada pelo servidor antes da perda de resposta.');
                }
                lostOccurrenceResponse.committedBeforeDrop = true;
                lostOccurrenceResponse.id = Number(payload.id);
                lostOccurrenceResponse.status = committed.status();
                await route.abort('failed');
                progress('resposta-de-ocorrencia-perdida-apos-commit', { status: committed.status() });
                return;
            }
            await route.continue();
        });
        await page.context().setOffline(true);
        await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
        await expect(page.locator('#sgi-offline-banner')).toContainText('SEM CONEXÃO');
        await Promise.all([
            finishGame(page, offlinePlan, scoreA, { offline: true }),
            finishGame(secondPage, onlinePlan, scoreB, { correctLoserIndex: loserIndexB, allowQueued: true, pauseResume: true }),
        ]);
        progress('jogo-offline-local-concluido', { gameId: offlinePlan.game.id_jogo });
        progress('mesario-b-jogo-online-concluido', { gameId: onlinePlan.game.id_jogo });
        await finishGame(page, offlinePlanSecond, scoreASecond, { offline: true });
        await expect.poll(async () => page.evaluate(async (tag) => {
            const games = await window.SGIDataLayer.read('jogos');
            const game = games.find((item) => String(item.nome_jogo) === tag);
            return Boolean(game && Number(game.id_jogo) < 0 && game.status_jogo === 'Agendado'
                && Array.isArray(game.equipes) && game.equipes.length === 2);
        }, offlineFinalTag), { timeout: 20_000 }).toBe(true);
        const localFinal = await page.evaluate(async (tag) => {
            const games = await window.SGIDataLayer.read('jogos');
            return games.find((item) => String(item.nome_jogo) === tag) || null;
        }, offlineFinalTag);
        expect(localFinal).toBeTruthy();
        expect(Number(localFinal.id_jogo)).toBeLessThan(0);
        expect(localFinal.equipes).toHaveLength(2);
        const finalParticipants = localFinal.equipes.map((team) => Number(team.id_equipe));
        expect(new Set(finalParticipants).size).toBe(2);
        const winnerFinal = winnerFor('II', finalParticipants, teamsById);
        const finalScoreBase = SCENARIO.expected.event_scores_by_modality.FUTSAL.final;
        await openGame(page, Number(localFinal.id_jogo));
        const visibleFinalNames = (await page.locator('.mc-team-name').allTextContents()).map((name) => name.trim());
        expect(visibleFinalNames).toHaveLength(2);
        const visibleFinalParticipants = visibleFinalNames.map((visibleName) => {
            const team = localFinal.equipes.find((item) => String(
                item.nome_equipe || item.nome_fantasia || item.nome_fantasia_turma || item.nome_turma || '',
            ).trim() === visibleName);
            return team ? Number(team.id_equipe) : 0;
        });
        expect(visibleFinalParticipants.every((id) => id > 0)).toBe(true);
        expect(new Set(visibleFinalParticipants).size).toBe(2);
        const winnerFinalIndex = visibleFinalParticipants.indexOf(winnerFinal);
        expect(winnerFinalIndex).toBeGreaterThanOrEqual(0);
        const finalScore = winnerFinalIndex === 0 ? finalScoreBase.slice() : [finalScoreBase[1], finalScoreBase[0]];
        await finishGame(page, { game: localFinal, parts: localFinal.equipes }, finalScore, { offline: true, alreadyOpened: true });
        progress('chave-offline-local-concluida', { games: 3, finalTag: offlineFinalTag });
        matchRecords.push({
            modality: 'II-FUTSAL', game_id: Number(offlinePlan.game.id_jogo), tag: String(offlinePlan.game.nome_jogo),
            team_ids: offlinePlan.participants, participants: offlinePlan.participants.map((id) => teamsById.get(id).class),
            winner_id: winnerA, winner: teamsById.get(winnerA).class,
            score: scoreA, linked_points: scoreA[0] + scoreA[1], operated_offline: true,
        });
        matchRecords.push({
            modality: 'II-FUTSAL', game_id: Number(offlinePlanSecond.game.id_jogo), tag: String(offlinePlanSecond.game.nome_jogo),
            team_ids: offlinePlanSecond.participants, participants: offlinePlanSecond.participants.map((id) => teamsById.get(id).class),
            winner_id: winnerASecond, winner: teamsById.get(winnerASecond).class,
            score: scoreASecond, linked_points: scoreASecond[0] + scoreASecond[1], operated_offline: true,
        });

        const finalScoreB = scoreB.slice();
        finalScoreB[loserIndexB] -= 1;
        matchRecords.push({
            modality: 'I-FUTSAL', game_id: Number(onlinePlan.game.id_jogo), tag: String(onlinePlan.game.nome_jogo),
            team_ids: onlinePlan.participants, participants: onlinePlan.participants.map((id) => teamsById.get(id).class),
            winner_id: winnerB, winner: teamsById.get(winnerB).class,
            score: finalScoreB, linked_points: finalScoreB[0] + finalScoreB[1], point_corrected: true,
            operated_by_second_mesario: true,
        });

        const offlineQueue = await page.evaluate(() => window.SGIOffline.getState());
        expect(offlineQueue.online).toBe(false);
        expect(offlineQueue.pending).toBeGreaterThan(0);
        await page.context().setOffline(false);
        await expect.poll(() => page.evaluate(() => window.SGIOffline.getState().pending), { timeout: 120_000 }).toBe(0);
        await expect.poll(() => secondPage.evaluate(() => window.SGIOffline.getState().pending), { timeout: 120_000 }).toBe(0);
        const reconciledGames = await json(
            await request.get('api/v1/jogos?id_modalidade=' + Number(concurrentModality.id)),
            'jogos após sincronização da chave offline',
        );
        const reconciledFinal = reconciledGames.find((game) => String(game.nome_jogo) === offlineFinalTag);
        expect(reconciledFinal).toBeTruthy();
        expect(Number(reconciledFinal.id_jogo)).toBeGreaterThan(0);
        expect(reconciledFinal.status_jogo).toMatch(/Concluido|Finalizado/);
        const reconciledBracket = await json(
            await request.get('api/v1/chaveamentos?id_modalidade=' + Number(concurrentModality.id)),
            'árvore após sincronização da chave offline',
        );
        const bracketByTag = Object.fromEntries((reconciledBracket.jogos || []).map((game) => [String(game.nome_jogo), game]));
        const offlineBracketPlans = [offlinePlan, offlinePlanSecond];
        const offlineWinners = [winnerA, winnerASecond];
        for (let index = 0; index < offlineBracketPlans.length; index += 1) {
            const expectedGame = offlineBracketPlans[index];
            const persistedGame = bracketByTag[String(expectedGame.game.nome_jogo)];
            expect(persistedGame).toBeTruthy();
            expect(persistedGame.status_jogo).toMatch(/Concluido|Finalizado/);
            expect(Number(persistedGame.equipe_vencedora_id)).toBe(offlineWinners[index]);
        }
        const persistedFinal = bracketByTag[offlineFinalTag];
        expect(persistedFinal).toBeTruthy();
        expect(persistedFinal.status_jogo).toMatch(/Concluido|Finalizado/);
        expect(Number(persistedFinal.equipe_vencedora_id)).toBe(winnerFinal);
        const finalParts = await json(
            await request.get('api/v1/partidas?id_jogo=' + Number(reconciledFinal.id_jogo)),
            'participantes da final offline reconciliada',
        );
        expect(finalParts.map((part) => Number(part.equipes_id_equipe)).sort((a, b) => a - b))
            .toEqual(finalParticipants.slice().sort((a, b) => a - b));
        matchRecords.push({
            modality: 'II-FUTSAL', game_id: Number(reconciledFinal.id_jogo), tag: offlineFinalTag,
            team_ids: finalParticipants, participants: finalParticipants.map((id) => teamsById.get(id).class),
            winner_id: winnerFinal, winner: teamsById.get(winnerFinal).class,
            score: finalScore, linked_points: finalScore[0] + finalScore[1], operated_offline: true,
            temporary_id_reconciled: Number(localFinal.id_jogo),
        });
        await expect.poll(() => lostPointResponse.attempts, { timeout: 20_000 }).toBe(2);
        expect(lostPointResponse.committedBeforeDrop).toBe(true);
        expect(lostPointResponse.status).toBe(200);
        expect(lostPointResponse.mutationIds[0]).not.toBe('');
        expect(lostPointResponse.mutationIds[1]).toBe(lostPointResponse.mutationIds[0]);
        const persistedPoints = await json(
            await request.get('api/v1/pontos?id_jogo=' + Number(onlinePlan.game.id_jogo)),
            'pontos após o replay da resposta perdida',
        );
        const persistedTargetPoints = Array.isArray(persistedPoints.pontos)
            ? persistedPoints.pontos.filter((point) => String(point.chave_jogada) === lostPointResponse.shotKey)
            : [];
        expect(persistedTargetPoints).toHaveLength(1);
        await expect.poll(() => lostResultResponse.attempts, { timeout: 20_000 }).toBe(2);
        expect(lostResultResponse.committedBeforeDrop).toBe(true);
        expect(lostResultResponse.status).toBe(200);
        expect(lostResultResponse.mutationIds[0]).not.toBe('');
        expect(lostResultResponse.mutationIds[1]).toBe(lostResultResponse.mutationIds[0]);
        const persistedParallelGames = await json(
            await request.get('api/v1/jogos?id_modalidade=' + Number(parallelModality.id)),
            'jogo após o replay do resultado cuja resposta foi perdida',
        );
        const persistedParallelMatches = persistedParallelGames.filter((game) =>
            Number(game.id_jogo) === Number(onlinePlan.game.id_jogo)
            && String(game.nome_jogo) === String(onlinePlan.game.nome_jogo),
        );
        expect(persistedParallelMatches).toHaveLength(1);
        expect(persistedParallelMatches[0].status_jogo).toMatch(/Concluido|Finalizado/);
        const persistedParallelBracket = await json(
            await request.get('api/v1/chaveamentos?id_modalidade=' + Number(parallelModality.id)),
            'chave após o replay do resultado',
        );
        const persistedOnlineSemi = (persistedParallelBracket.jogos || []).find((game) =>
            String(game.nome_jogo) === String(onlinePlan.game.nome_jogo),
        );
        expect(persistedOnlineSemi).toBeTruthy();
        expect(Number(persistedOnlineSemi.equipe_vencedora_id)).toBe(winnerB);
        const occurrenceTeamId = teamsById.get(onlinePlan.participants[0]).class_id;
        const queuedOccurrence = await secondPage.evaluate(async ({ editionId: idEdicao, classId }) => {
            const apiBase = String(window.SGI_API_BASE || '/api/v1/').replace(/\/?$/, '/');
            const endpoint = new URL(apiBase + 'ocorrencias-turmas', window.location.origin).href;
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    turmas_id_turma: classId,
                    interclasses_id_interclasse: idEdicao,
                    titulo_ocorrencia: 'Registro de contingência sintético',
                    descricao_ocorrencia: 'Resposta descartada depois da confirmação do servidor.',
                    pontos_descontados: 0,
                    data_ocorrencia: new Date().toISOString().slice(0, 10),
                }),
            });
            const result = await response.json();
            if (!response.ok || result.success !== true || result.queued !== true) {
                throw new Error('A mutação de ocorrência não foi preservada para sincronização após perder a resposta.');
            }
            return result;
        }, { editionId, classId: occurrenceTeamId });
        expect(queuedOccurrence.queued).toBe(true);
        await expect.poll(() => secondPage.evaluate(() => window.SGIOffline.getState().pending), { timeout: 120_000 }).toBe(0);
        await expect.poll(() => lostOccurrenceResponse.attempts, { timeout: 20_000 }).toBe(2);
        expect(lostOccurrenceResponse.committedBeforeDrop).toBe(true);
        expect(lostOccurrenceResponse.status).toBe(201);
        expect(lostOccurrenceResponse.mutationIds[0]).not.toBe('');
        expect(lostOccurrenceResponse.mutationIds[1]).toBe(lostOccurrenceResponse.mutationIds[0]);
        const persistedOccurrences = await json(
            await request.get(`api/v1/ocorrencias-turmas?id_interclasse=${editionId}&id_turma=${occurrenceTeamId}`),
            'ocorrências após o replay da resposta perdida',
        );
        const persistedTargetOccurrences = persistedOccurrences.filter((occurrence) =>
            String(occurrence.titulo_ocorrencia) === 'Registro de contingência sintético',
        );
        expect(persistedTargetOccurrences).toHaveLength(1);
        expect(Number(persistedTargetOccurrences[0].id_ocorrencia_turma)).toBe(lostOccurrenceResponse.id);
        expect(Number(persistedTargetOccurrences[0].pontos_descontados)).toBe(0);
        await expect(page.locator('#sgi-offline-banner')).toHaveClass(/sgi-hidden/);
        expect(await secondPage.evaluate(() => navigator.onLine)).toBe(true);

        for (const [alias, modality] of modalityByAlias) {
            const templateAlias = alias.slice(alias.indexOf('-') + 1);
            const scoreProfile = SCENARIO.expected.event_scores_by_modality[templateAlias];
            if (!scoreProfile) continue;
            const expectedGames = modality.category === 'I' ? 2 : 3;
            let completedForModality = matchRecords.filter((record) => record.modality === alias).length;
            while (completedForModality < expectedGames) {
                let nextPlan = null;
                await expect.poll(async () => {
                    nextPlan = await nextOpenMatch(request, modality.id, teamsById);
                    return Boolean(nextPlan);
                }, { timeout: 30_000 }).toBe(true);
                const tag = String(nextPlan.game.nome_jogo);
                const scoreKind = /MM:2:\d+:N$/.test(tag) ? 'final' : 'semifinal';
                const baseScore = scoreProfile[scoreKind];
                if (!Array.isArray(baseScore) || baseScore.length !== 2) {
                    throw new Error('Não há placar de referência para ' + alias + ' — ' + scoreKind + '.');
                }
                const winner = winnerFor(modality.category, nextPlan.participants, teamsById);
                const winnerIndex = nextPlan.participants.indexOf(winner);
                const score = winnerIndex === 0 ? baseScore.slice() : [baseScore[1], baseScore[0]];
                progress('jogo-visual-planejado', { modality: alias, tag, count: completedForModality + 1, expected: expectedGames });
                await finishGame(page, nextPlan, score);
                await expect.poll(async () => {
                    const refreshed = await json(await request.get('api/v1/jogos?id_modalidade=' + modality.id), 'confirmar resultado visual');
                    const persisted = refreshed.find((item) => String(item.nome_jogo) === tag);
                    return Boolean(persisted && /Concluido|Finalizado/.test(String(persisted.status_jogo)));
                }, { timeout: 30_000 }).toBe(true);
                matchRecords.push({
                    modality: alias,
                    game_id: Number(nextPlan.game.id_jogo),
                    tag,
                    team_ids: nextPlan.participants,
                    participants: nextPlan.participants.map((id) => teamsById.get(id).class),
                    winner_id: winner,
                    winner: teamsById.get(winner).class,
                    score,
                    linked_points: score[0] + score[1],
                    operated_in_browser: true,
                });
                completedForModality += 1;
                progress('jogo-visual-confirmado', { modality: alias, tag, count: completedForModality, expected: expectedGames });
            }
        }
        expect(matchRecords).toHaveLength(15);
        expect(matchRecords.filter((match) => match.point_corrected)).toHaveLength(1);

        const raceRecords = [];
        for (const [alias, modality] of modalityByAlias) {
            if (!alias.includes('CORRIDA_')) continue;
            raceRecords.push(await operateIndividual({
                request, page: secondPage, alias, modality,
                podiumByCategory: SCENARIO.expected.podiums_by_category,
                state, category: modality.category,
            }));
        }
        expect(raceRecords).toHaveLength(4);

        const lostCreditResponse = {
            committedBeforeDrop: false,
            attempts: 0,
            mutationIds: [],
            persistedRowsAfterCommit: 0,
        };
        const creditContext = await browser.newContext();
        const creditPage = await creditContext.newPage();
        let creditIdsBefore = new Set();
        let creditRowsToRemove = [];
        try {
            await loginAdmin(creditPage);
            const classIdForCredit = teamsById.get(onlinePlan.participants[0]).class_id;
            const creditsBefore = await json(
                await request.get('api/v1/arrecadacao?id_interclasse=' + editionId),
                'histórico antes da resposta perdida do crédito',
            );
            creditIdsBefore = new Set(creditsBefore.map((row) => Number(row.id_historico)));
            await creditPage.goto(`edicoes/arrecadacao?id=${editionId}`, { waitUntil: 'domcontentloaded' });
            const quantityInput = creditPage.locator(`#listaArrecadacaoDesktop .arrec-input[data-id-turma="${classIdForCredit}"]`);
            const saveCredit = creditPage.locator(`#listaArrecadacaoDesktop [data-sgi-action="save-arrecadacao"][data-id-turma="${classIdForCredit}"]`);
            await expect(quantityInput).toBeVisible({ timeout: 20_000 });
            await quantityInput.fill('0.3');
            await creditPage.route('**/api/v1/arrecadacao', async (route) => {
                const request = route.request();
                if (request.method() !== 'POST') {
                    await route.continue();
                    return;
                }
                lostCreditResponse.attempts += 1;
                lostCreditResponse.mutationIds.push(await request.headerValue('x-sgi-mutation-id'));
                if (!lostCreditResponse.committedBeforeDrop) {
                    const committed = await route.fetch();
                    const body = await committed.json();
                    if (!committed.ok() || body.success !== true) {
                        throw new Error('O crédito-alvo não foi confirmado antes da perda de resposta.');
                    }
                    lostCreditResponse.committedBeforeDrop = true;
                    await route.abort('failed');
                    progress('resposta-de-credito-perdida-apos-commit', { status: committed.status() });
                    return;
                }
                await route.continue();
            });

            await saveCredit.click();
            const failedCreditFeedback = creditPage.getByRole('dialog');
            await expect(failedCreditFeedback).toContainText(/Não foi possível salvar a arrecadação/i);
            await failedCreditFeedback.getByRole('button', { name: 'Entendi' }).click();
            await expect(quantityInput).toHaveValue('0.3');
            const committedRows = await json(
                await request.get(`api/v1/arrecadacao?id_interclasse=${editionId}`),
                'histórico após confirmar crédito e descartar a resposta',
            );
            creditRowsToRemove = committedRows.filter((row) => !creditIdsBefore.has(Number(row.id_historico))
                && Number(row.id_turma) === classIdForCredit
                && Number(row.quantidade) === 0.3);
            expect(creditRowsToRemove).toHaveLength(1);
            lostCreditResponse.persistedRowsAfterCommit = creditRowsToRemove.length;
            expect(String(creditRowsToRemove[0].status_historico)).toBe('1');

            const replayResponsePromise = creditPage.waitForResponse((response) =>
                response.request().method() === 'POST' && response.url().includes('/api/v1/arrecadacao'),
            );
            await saveCredit.click();
            const replayResponse = await replayResponsePromise;
            expect(replayResponse.status()).toBe(200);
            expect((await replayResponse.json()).success).toBe(true);
            const successCreditFeedback = creditPage.getByRole('dialog');
            await expect(successCreditFeedback).toContainText(/Dados salvos com sucesso/i);
            await successCreditFeedback.getByRole('button', { name: 'Entendi' }).click();
            await expect(quantityInput).toHaveValue('0');
            expect(lostCreditResponse.attempts).toBe(2);
            expect(lostCreditResponse.mutationIds[0]).toMatch(/^arrecadacao-[a-z0-9-]{12,180}$/i);
            expect(lostCreditResponse.mutationIds[1]).toBe(lostCreditResponse.mutationIds[0]);

            const creditsAfterReplay = await json(
                await request.get(`api/v1/arrecadacao?id_interclasse=${editionId}`),
                'histórico após replay do crédito',
            );
            const replayedRows = creditsAfterReplay.filter((row) => !creditIdsBefore.has(Number(row.id_historico))
                && Number(row.id_turma) === classIdForCredit
                && Number(row.quantidade) === 0.3);
            expect(replayedRows).toHaveLength(1);
            expect(Number(replayedRows[0].id_historico)).toBe(Number(creditRowsToRemove[0].id_historico));
        } finally {
            const rowsToClean = creditRowsToRemove.length > 0
                ? creditRowsToRemove
                : await request.get(`api/v1/arrecadacao?id_interclasse=${editionId}`)
                    .then(async (response) => response.ok() ? response.json() : [])
                    .then((rows) => rows.filter((row) => !creditIdsBefore.has(Number(row.id_historico))
                        && Number(row.quantidade) === 0.3));
            for (const row of rowsToClean) {
                if (String(row.status_historico) === '0') continue;
                await request.delete('api/v1/arrecadacao', {
                    data: { id_historico: Number(row.id_historico), id_interclasse: editionId },
                }).catch(() => null);
            }
            await creditContext.close();
        }

        const results = {
            schema_version: 1, status: 'passed', edition_id: editionId,
            matches: matchRecords, individual_events: raceRecords,
            pause_resume_tested: true,
            offline_matches: 3, offline_bracket_games: 3, offline_synchronized: true,
            offline_bracket_server_closed: 3, offline_bracket_winners_consistent: true,
            offline_bracket_final_temporary_id_reconciled: Number(localFinal.id_jogo) < 0
                && Number(reconciledFinal.id_jogo) > 0,
            offline_bracket_tags: [String(offlinePlan.game.nome_jogo), String(offlinePlanSecond.game.nome_jogo), offlineFinalTag],
            parallel_operators: 2,
            lost_response_retried: true,
            lost_response_attempts: lostPointResponse.attempts,
            lost_response_committed_before_drop: lostPointResponse.committedBeforeDrop,
            lost_response_single_persisted_point: persistedTargetPoints.length === 1,
            lost_result_response_retried: lostResultResponse.attempts === 2,
            lost_result_attempts: lostResultResponse.attempts,
            lost_result_committed_before_drop: lostResultResponse.committedBeforeDrop,
            lost_result_same_mutation_identity: lostResultResponse.mutationIds[0] !== ''
                && lostResultResponse.mutationIds[1] === lostResultResponse.mutationIds[0],
            lost_result_single_closed_game: persistedParallelMatches.length === 1,
            lost_result_winner_consistent: Number(persistedOnlineSemi.equipe_vencedora_id) === winnerB,
            lost_occurrence_response_retried: lostOccurrenceResponse.attempts === 2,
            lost_occurrence_attempts: lostOccurrenceResponse.attempts,
            lost_occurrence_committed_before_drop: lostOccurrenceResponse.committedBeforeDrop,
            lost_occurrence_same_mutation_identity: lostOccurrenceResponse.mutationIds[0] !== ''
                && lostOccurrenceResponse.mutationIds[1] === lostOccurrenceResponse.mutationIds[0],
            lost_occurrence_single_persisted: persistedTargetOccurrences.length === 1,
            lost_credit_response_retried: lostCreditResponse.attempts === 2,
            lost_credit_attempts: lostCreditResponse.attempts,
            lost_credit_committed_before_drop: lostCreditResponse.committedBeforeDrop,
            lost_credit_same_mutation_identity: lostCreditResponse.mutationIds[0] !== ''
                && lostCreditResponse.mutationIds[1] === lostCreditResponse.mutationIds[0],
            lost_credit_single_persisted: lostCreditResponse.persistedRowsAfterCommit === 1,
            mesario_id: secondOperator.id,
        };
        fs.writeFileSync(path.join(directory, 'browser-results.json'), JSON.stringify(results, null, 2) + '\n');
        const checkpointsPath = path.join(directory, 'checkpoints.json');
        const checkpoints = JSON.parse(fs.readFileSync(checkpointsPath, 'utf8'));
        checkpoints.checkpoints.S08 = {
            status: 'passed',
            reason: 'As duas semifinais e a final foram concluídas offline na mesma edição; ID temporário, fila e vencedores convergiram. Ponto, resultado e ocorrência foram reenviados com a mesma identidade após perder a resposta e tiveram efeito único no servidor.',
            observed: {
                offline_matches: 3, offline_synchronized: true, offline_bracket_server_closed: 3,
                offline_bracket_winners_consistent: true,
                offline_bracket_final_temporary_id_reconciled: Number(localFinal.id_jogo) < 0 && Number(reconciledFinal.id_jogo) > 0,
                offline_bracket_tags: [String(offlinePlan.game.nome_jogo), String(offlinePlanSecond.game.nome_jogo), offlineFinalTag],
                parallel_operators: 2, same_edition: editionId, pending_mutations_after_sync: 0,
                lost_response_retried: true, lost_response_attempts: lostPointResponse.attempts,
                lost_response_single_persisted_point: true,
                lost_result_response_retried: lostResultResponse.attempts === 2,
                lost_result_attempts: lostResultResponse.attempts,
                lost_result_committed_before_drop: lostResultResponse.committedBeforeDrop,
                lost_result_same_mutation_identity: lostResultResponse.mutationIds[0] !== '' && lostResultResponse.mutationIds[1] === lostResultResponse.mutationIds[0],
                lost_result_single_closed_game: persistedParallelMatches.length === 1,
                lost_result_winner_consistent: Number(persistedOnlineSemi.equipe_vencedora_id) === winnerB,
                lost_occurrence_response_retried: lostOccurrenceResponse.attempts === 2,
                lost_occurrence_attempts: lostOccurrenceResponse.attempts,
                lost_occurrence_committed_before_drop: lostOccurrenceResponse.committedBeforeDrop,
                lost_occurrence_same_mutation_identity: lostOccurrenceResponse.mutationIds[0] !== '' && lostOccurrenceResponse.mutationIds[1] === lostOccurrenceResponse.mutationIds[0],
                lost_occurrence_single_persisted: persistedTargetOccurrences.length === 1,
            },
        };
        fs.writeFileSync(checkpointsPath, JSON.stringify(checkpoints, null, 2) + '\n');
        completed = true;
    } finally {
        await secondContext.close();
        if (!completed) {
            await request.post('api/v1/usuarios?acao=excluir_colaborador', { data: { id_usuario: secondOperator.id } }).catch(() => null);
        }
    }
});
