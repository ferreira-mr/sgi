const { test, expect } = require('./fixtures.cjs');

async function jsonOrThrow(response, label) {
    if (!response.ok()) {
        throw new Error(`${label}: HTTP ${response.status()} ${await response.text()}`);
    }
    return response.json();
}

function dataHoraUtc(offsetMinutes) {
    const value = new Date(Date.now() + offsetMinutes * 60_000);
    return value.toISOString().slice(0, 16);
}

async function prepararEdicaoPublicada(request) {
    const edicoes = await jsonOrThrow(await request.get('api/v1/edicoes?regulamento=true'), 'consulta edições');
    const anterior = (Array.isArray(edicoes) ? edicoes : []).find((item) => String(item.status_interclasse) === '1');
    const criada = await jsonOrThrow(await request.post('api/v1/edicoes', {
        data: {
            nome_interclasse: `Portal cronograma ${Date.now()}`,
            ano_interclasse: '2030-01-01 00:00:00',
        },
    }), 'criação da edição do portal');
    const idInterclasse = Number(criada.id_interclasse || criada.id);
    if (!idInterclasse) throw new Error(`A API não retornou a edição do portal: ${JSON.stringify(criada)}`);

    const [categorias, turmas, modalidades, locais] = await Promise.all([
        jsonOrThrow(await request.get(`api/v1/categorias?id_interclasse=${idInterclasse}`), 'categorias do portal'),
        jsonOrThrow(await request.get(`api/v1/turmas?id_interclasse=${idInterclasse}`), 'turmas do portal'),
        jsonOrThrow(await request.get(`api/v1/modalidades?id_interclasse=${idInterclasse}`), 'modalidades do portal'),
        jsonOrThrow(await request.get(`api/v1/locais?id_interclasse=${idInterclasse}&disponivel=1`), 'locais do portal'),
    ]);
    const categoria = Array.isArray(categorias) ? categorias[0] : null;
    const turma = Array.isArray(turmas)
        ? turmas.find((item) => Number(item.categorias_id_categoria) === Number(categoria?.id_categoria)) || turmas[0]
        : null;
    const ativas = (Array.isArray(modalidades) ? modalidades : []).filter((item) => Number(item.categorias_id_categoria) === Number(categoria?.id_categoria));
    const masculina = ativas.find((item) => String(item.genero_modalidade).toUpperCase() === 'MASC');
    const feminina = ativas.find((item) => String(item.genero_modalidade).toUpperCase() === 'FEM');
    if (!categoria || !turma || !masculina || !feminina) throw new Error('A edição do portal não possui modalidades MASC/FEM na primeira categoria.');
    const escolhidas = new Set([Number(masculina.id_modalidade), Number(feminina.id_modalidade)]);
    for (const modalidade of (Array.isArray(modalidades) ? modalidades : [])) {
        const id = Number(modalidade.id_modalidade);
        const manter = escolhidas.has(id);
        const response = await request.put('api/v1/modalidades', {
            data: manter
                ? {
                    id_modalidade: id,
                    interclasses_id_interclasse: idInterclasse,
                    status_modalidade: '1',
                    equipes_planejadas: 2,
                    min_inscritos_equipe: 1,
                    max_inscritos_equipe: 10,
                    formato_participacao: 'equipe',
                    duracao_prevista_min: 5,
                    descanso_min: 0,
                }
                : { id_modalidade: id, status_modalidade: '0' },
        });
        await jsonOrThrow(response, `configuração da modalidade ${id}`);
    }
    await jsonOrThrow(await request.post('api/v1/cronograma', {
        data: { acao: 'preparar_equipes', id_interclasse: idInterclasse },
    }), 'preparação das equipes do portal');
    const inicio = '2030-01-01';
    const draft = await jsonOrThrow(await request.post('api/v1/cronograma', {
        data: {
            acao: 'gerar_rascunho',
            id_interclasse: idInterclasse,
            data_inicio: inicio,
            data_fim: inicio,
            hora_inicio: '00:00',
            hora_fim: '23:59',
            duracao_min: 5,
            intervalo_min: 0,
            id_locais: [Number((Array.isArray(locais) ? locais[0] : null)?.id_local)],
        },
    }), 'geração do cronograma do portal');
    const estado = await jsonOrThrow(await request.get(`api/v1/cronograma?id_interclasse=${idInterclasse}`), 'estado do cronograma do portal');
    await jsonOrThrow(await request.post('api/v1/cronograma', {
        data: {
            acao: 'publicar',
            id_interclasse: idInterclasse,
            cronograma_versao: Number(estado.cronograma_versao || 0),
            nos: draft.nos,
            compromissos: draft.compromissos,
        },
    }), 'publicação do cronograma do portal');
    const publicado = await jsonOrThrow(await request.get(`api/v1/cronograma?id_interclasse=${idInterclasse}`), 'revisão publicada do portal');
    await jsonOrThrow(await request.post('api/v1/cronograma', {
        data: {
            acao: 'abrir_inscricoes',
            id_interclasse: idInterclasse,
            cronograma_versao: Number(publicado.cronograma_versao || 0),
            inscricoes_abertura: dataHoraUtc(-5),
            inscricoes_encerramento: dataHoraUtc(24 * 60),
        },
    }), 'abertura das inscrições do portal');
    await jsonOrThrow(await request.post(`api/v1/edicoes?id=${idInterclasse}`, {
        data: { status_interclasse: '1' },
    }), 'ativação da edição do portal');
    return { idInterclasse, idTurma: Number(turma.id_turma), anterior: Number(anterior?.id_interclasse || 0) };
}

async function prepararAlunoFixture(request) {
    await jsonOrThrow(await request.post('api/v1/login', {
        data: { matricula: 'admin', senha: '123' }
    }), 'login administrativo de preparação');
    const cronograma = await prepararEdicaoPublicada(request);
    const idInterclasse = cronograma.idInterclasse;
    const idTurma = cronograma.idTurma;

    const matricula = `55${Date.now().toString().slice(-7)}`;
    const novoAluno = await jsonOrThrow(await request.post('api/v1/usuarios?acao=criar_aluno', {
        data: {
            nome_usuario: 'Aluno E2E Portal',
            matricula_usuario: matricula,
            genero_usuario: 'MASC',
            data_nasc_usuario: '2008-07-20',
            turmas_id_turma: idTurma
        }
    }), 'criação de aluno fixture');

    if (novoAluno.status !== 'sucesso') {
        throw new Error(`Falha ao criar aluno: ${JSON.stringify(novoAluno)}`);
    }

    return {
        idInterclasse,
        idTurma,
        idInterclasseAnterior: cronograma.anterior,
        matricula,
        senhaOriginal: String(novoAluno.senha_temporaria || '')
    };
}

test.describe.serial('Portal do Aluno — Jornada Interativa e Regras de Negócio', () => {
    let fixture = null;

    test.beforeAll(async ({ request }) => {
        fixture = await prepararAlunoFixture(request);
    });

    test.afterAll(async ({ request }) => {
        if (!fixture) return;
        await request.post('api/v1/login', { data: { matricula: 'admin', senha: '123' } });
        if (fixture.idInterclasseAnterior) {
            await request.post(`api/v1/edicoes?id=${fixture.idInterclasseAnterior}`, { data: { status_interclasse: '1' } });
        }
        await request.post(`api/v1/edicoes?id=${fixture.idInterclasse}`, { data: { status_interclasse: '0' } });
    });

    test('login do aluno e leitura dos termos de responsabilidade', async ({ page }) => {
        await page.goto('login', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#form_desktop')).toBeVisible();

        await page.locator('#form_desktop .ipt-matricula').fill(fixture.matricula);
        await page.locator('#form_desktop .ipt-senha').fill(fixture.senhaOriginal);
        await page.locator('#form_desktop button[type="submit"]').click();

        await page.waitForURL(/\/aluno\/trocar-senha/, { timeout: 15_000 });
        await expect(page.locator('#sgi-offline-banner')).toHaveCount(0);
        await expect(page.locator('#formPrimeiroAcesso')).toBeVisible();

        // A senha inicial só libera a tela de troca: nem uma URL direta deve
        // abrir uma página do portal antes da mudança persistida.
        await page.goto('aluno/jogos', { waitUntil: 'domcontentloaded' });
        await expect(page).toHaveURL(/\/aluno\/trocar-senha/);
        await expect(page.locator('#formPrimeiroAcesso')).toBeVisible();
        await expect(page.locator('body')).not.toContainText('Cronograma de Jogos');

        fixture.senhaOriginal = 'PortalAluno#2026';
        await page.context().setOffline(true);
        await page.locator('#novaSenhaPrimeiroAcesso').fill(fixture.senhaOriginal);
        await page.locator('#confirmarSenhaPrimeiroAcesso').fill(fixture.senhaOriginal);
        await page.locator('#btnSalvarSenhaPrimeiroAcesso').click();
        await expect(page.locator('#msgPrimeiroAcesso')).toContainText('Conecte-se à internet para salvar sua senha.');
        await expect(page).toHaveURL(/\/aluno\/trocar-senha/);
        const offlineMutations = await page.evaluate(async () => new Promise((resolve, reject) => {
            const opening = indexedDB.open('sgi_offline');
            opening.onerror = () => reject(opening.error || new Error('Não foi possível abrir o banco offline.'));
            opening.onsuccess = () => {
                const database = opening.result;
                if (!database.objectStoreNames.contains('mutation_queue')) {
                    database.close();
                    resolve([]);
                    return;
                }
                const transaction = database.transaction('mutation_queue', 'readonly');
                const request = transaction.objectStore('mutation_queue').getAll();
                request.onerror = () => reject(request.error || new Error('Não foi possível consultar a fila offline.'));
                request.onsuccess = () => {
                    const entries = request.result || [];
                    database.close();
                    resolve(entries);
                };
            };
        }));
        expect(offlineMutations.some((entry) =>
            String(entry.url || '').includes('/api/v1/senha')
            || JSON.stringify(entry).includes(fixture.senhaOriginal),
        )).toBe(false);
        await page.context().setOffline(false);
        await expect(page.locator('#btnSalvarSenhaPrimeiroAcesso')).toBeEnabled();
        await page.locator('#btnSalvarSenhaPrimeiroAcesso').click();
        await page.waitForURL(/\/aluno\/termos/, { timeout: 15_000 });
        await expect(page.locator('#sgi-offline-banner')).toHaveCount(0);
        await expect(page.locator('main')).toBeVisible();

        // Validar presença do Termo de Responsabilidade e suas cláusulas fundamentais
        await expect(page.locator('main')).toContainText('Termo de Responsabilidade');
        await expect(page.locator('main')).toContainText('Conduta:');
        await expect(page.locator('main')).toContainText('Regras:');
        await expect(page.locator('main')).toContainText('Saúde:');

        // O acesso direto por URL e a API permanecem bloqueados antes do aceite.
        for (const paginaProtegida of [
            'aluno/inicio',
            'aluno/modalidades',
            'aluno/jogos',
            'aluno/perfil',
            'aluno/ranking',
        ]) {
            await page.goto(paginaProtegida, { waitUntil: 'domcontentloaded' });
            await expect(page).toHaveURL(/\/aluno\/termos/);
            await expect(page.locator('body')).not.toContainText('Cronograma de Jogos');
        }

        await expect(page.locator('nav a[aria-label="Termos"], nav a[title="Termos"]')).not.toHaveCount(0);
        for (const seletorProtegido of [
            'nav a[aria-label="Início"], nav a[title="Início"]',
            'nav a[aria-label="Jogos"], nav a[title="Jogos"]',
            'nav a[aria-label="Perfil"], nav a[title="Perfil"]',
        ]) {
            await expect(page.locator(seletorProtegido)).toHaveCount(0);
        }

        const jogosSemAceite = await page.evaluate(async () => {
            const response = await fetch('/api/v1/jogos');
            return response.status;
        });
        expect(jogosSemAceite).toBe(403);

        const inscricaoSemAceite = await page.evaluate(async () => {
            const response = await fetch('/api/v1/inscricoes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-SGI-CSRF': window.SGI_CSRF_TOKEN || '',
                },
                body: JSON.stringify({ id_interclasse: 1, id_equipes: [] }),
            });
            return response.status;
        });
        expect(inscricaoSemAceite).toBe(403);

        await page.goto('aluno/termos', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#sgi-offline-banner')).toHaveCount(0);
        const btnAceitar = page.locator('#btnAceitarTermos');
        await expect(btnAceitar).toBeVisible({ timeout: 15_000 });
        await btnAceitar.click();
        await page.waitForURL(/\/aluno\/inicio/, { timeout: 15_000 });
        await page.evaluate(() => bootstrap.Modal.getOrCreateInstance(document.getElementById('modalTermo')).show());
        await expect(page.getByRole('dialog', {
            name: 'Termo de Responsabilidade e Regulamento',
        })).toBeVisible();
        await page.evaluate(() => bootstrap.Modal.getInstance(document.getElementById('modalTermo')).hide());
    });

    test('inscrição em modalidades, escolha de equipe e validação de regras', async ({ page, baseURL }) => {
        // Login com o aluno
        await page.goto('login', { waitUntil: 'domcontentloaded' });
        await page.locator('#form_desktop .ipt-matricula').fill(fixture.matricula);
        await page.locator('#form_desktop .ipt-senha').fill(fixture.senhaOriginal);
        await page.locator('#form_desktop button[type="submit"]').click();
        await page.waitForURL(/\/aluno\/inicio/, { timeout: 15_000 });

        // Ir para a tela de inscrição de modalidades
        await page.goto(`aluno/modalidades?id=${fixture.idInterclasse}`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#modalidadesGrid')).toBeVisible({ timeout: 15_000 });

        const cards = page.locator('.modalidade-card:not(.lotado)');
        await expect(cards.first()).toBeVisible({ timeout: 15_000 });

        // Clica no primeiro card disponível para abrir o modal de equipes
        const modalEquipes = page.locator('#modalEquipes');
        const modalEquipesShown = modalEquipes.evaluate((element) => new Promise((resolve) => {
            element.addEventListener('shown.bs.modal', resolve, { once: true });
        }));
        await cards.first().click();

        await expect(modalEquipes).toBeVisible({ timeout: 10_000 });
        await modalEquipesShown;

        const linhaEquipe = modalEquipes.locator('.equipe-pick-row').first();
        await expect(linhaEquipe).toBeVisible({ timeout: 10_000 });
        await expect(linhaEquipe).toContainText('01/01/2030');
        await linhaEquipe.click();
        await expect(modalEquipes).toBeHidden({ timeout: 10_000 });

        // Confirmar que o card recebeu a classe de selecionado
        await expect(page.locator('.modalidade-card.selected')).toHaveCount(1);
        await expect(page.locator('#agendaInscricaoPreview')).toBeVisible({ timeout: 10_000 });
        await expect(page.locator('#agendaInscricaoPreview')).toContainText('01/01/2030');

        const inelegivel = await page.evaluate(async ({ idInterclasse, idTurma }) => {
            const config = JSON.parse(document.querySelector('[data-sgi-config="aluno/modalidade"]')?.textContent || '{}');
            const turmasResponse = await fetch(`/api/v1/turmas?id_interclasse=${idInterclasse}`);
            const turmas = await turmasResponse.json();
            const turma = Array.isArray(turmas)
                ? turmas.find((item) => Number(item.id_turma) === Number(idTurma))
                : null;
            if (!turma) return { setupError: 'Fixture não encontrou a turma do aluno.' };

            const modalidadesResponse = await fetch(`/api/v1/modalidades?id_interclasse=${idInterclasse}`);
            const modalidades = await modalidadesResponse.json();
            const modalidadeFeminina = Array.isArray(modalidades)
                ? modalidades.find((item) =>
                    String(item.genero_modalidade).toUpperCase() === 'FEM'
                    && Number(item.categorias_id_categoria) === Number(turma.categorias_id_categoria),
                )
                : null;
            if (!modalidadeFeminina) return { setupError: 'Fixture não possui modalidade FEM na categoria do aluno.' };

            const equipesResponse = await fetch(
                `/api/v1/equipes?id_modalidade=${modalidadeFeminina.id_modalidade}&id_turma=${idTurma}`,
            );
            const equipes = await equipesResponse.json();
            const equipe = Array.isArray(equipes) ? equipes.find((item) => Number(item.id_equipe) > 0) : null;
            if (!equipe) return { setupError: 'Fixture não possui equipe FEM na turma do aluno.' };

            const response = await fetch('/api/v1/inscricoes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id_interclasse: idInterclasse,
                    id_equipes: [Number(equipe.id_equipe)],
                    cronograma_versao: config.value7 == null ? undefined : Number(config.value7),
                    versao_publicada: config.value8 == null ? undefined : Number(config.value8),
                }),
            });
            return { status: response.status, body: await response.json() };
        }, { idInterclasse: fixture.idInterclasse, idTurma: fixture.idTurma });
        expect(inelegivel.setupError).toBeUndefined();
        expect(inelegivel.status).toBe(409);
        expect(inelegivel.body.success).toBe(false);
        expect(inelegivel.body.message).toMatch(/gênero/i);

        // Salva a escolha
        const btnSalvar = page.locator('#btnSalvar');
        await expect(btnSalvar).toBeEnabled({ timeout: 10_000 });
        const requisicaoInicial = page.waitForRequest((request) =>
            request.url().includes('/api/v1/inscricoes') && request.method() === 'POST',
        );
        await btnSalvar.click();
        const corpoInicial = (await requisicaoInicial).postDataJSON();

        // Confirma feedback de salvamento
        await expect(page.locator('#msgFeedback')).toContainText(/sucesso|salvo/i, { timeout: 10_000 });

        const retry = await page.evaluate(async (payload) => {
            const response = await fetch('/api/v1/inscricoes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            return { status: response.status, body: await response.json() };
        }, corpoInicial);
        expect(retry.status).toBe(200);
        expect(retry.body.success).toBe(true);
        expect(retry.body.insercoes).toBe(0);
        expect(retry.body.ja_existentes).toBe(1);

        const inicioEsperado = new URL('aluno/inicio', baseURL).pathname;
        await page.waitForURL((url) => url.pathname === inicioEsperado, { timeout: 10_000 });
    });

    test('navegação e consulta da agenda e do ranking publicado pelo aluno', async ({ page, request }) => {
        // Login com o aluno
        await page.goto('login', { waitUntil: 'domcontentloaded' });
        await page.locator('#form_desktop .ipt-matricula').fill(fixture.matricula);
        await page.locator('#form_desktop .ipt-senha').fill(fixture.senhaOriginal);
        await page.locator('#form_desktop button[type="submit"]').click();
        await page.waitForURL(/\/aluno\/inicio/, { timeout: 15_000 });

        await expect(page.locator('nav a[aria-label="Rankings publicados"], nav a[title="Rankings publicados"]')).toHaveCount(0);
        const edicaoAtiva = page.locator('.aluno-card[data-status="active"]');
        await expect(edicaoAtiva.locator('a.btn').first()).toHaveAttribute('href', new RegExp(`[?&]id=${fixture.idInterclasse}(?:&|$)`));
        await expect(edicaoAtiva.locator('a.btn').first()).toContainText('Inscrever-se em modalidades');

        // 1. Tela de Jogos
        await page.goto(`aluno/jogos?id=${fixture.idInterclasse}`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('body')).not.toContainText(/Fatal error|Warning:/i);

        // 2. Tela de Ranking
        await page.goto(`aluno/ranking?id=${fixture.idInterclasse}`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('main:visible')).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('main:visible')).toContainText('Ranking Oculto', { timeout: 15_000 });
        await expect(page.locator('body')).not.toContainText(/Fatal error|Warning:/i);

        // Publica uma edição sintética sem jogos e verifica o ranking pela
        // sessão real do aluno depois de manter encerrada a edição original.
        await jsonOrThrow(await request.post('api/v1/login', {
            data: { matricula: 'admin', senha: '123' }
        }), 'login administrativo para publicar ranking');
        const criada = await jsonOrThrow(await request.post('api/v1/edicoes', {
            data: {
                nome_interclasse: `E2E Ranking ${Date.now()}`,
                ano_interclasse: '2026-01-01 00:00:00',
            }
        }), 'criação de edição sintética para ranking');
        const idEdicaoPublicada = Number(criada.id);
        expect(idEdicaoPublicada).toBeGreaterThan(0);

        try {
            const encerrada = await jsonOrThrow(await request.post(`api/v1/edicoes?id=${idEdicaoPublicada}`, {
                data: { status_interclasse: '0' }
            }), 'encerramento da edição sintética');
            expect(encerrada.success).toBe(true);

            const reativadaOriginal = await jsonOrThrow(await request.post(`api/v1/edicoes?id=${fixture.idInterclasse}`, {
                data: { status_interclasse: '1' }
            }), 'restauração da edição original');
            expect(reativadaOriginal.success).toBe(true);

            const publicada = await jsonOrThrow(await request.post(
                `api/v1/edicoes?acao=publicar_ranking&id=${idEdicaoPublicada}`,
                { data: {} },
            ), 'publicação do ranking sintético');
            expect(publicada.success).toBe(true);
        } finally {
            const encerramentoFinal = await request.post(`api/v1/edicoes?id=${idEdicaoPublicada}`, {
                data: { status_interclasse: '0' }
            });
            expect(encerramentoFinal.ok()).toBeTruthy();
            const restauracaoFinal = await request.post(`api/v1/edicoes?id=${fixture.idInterclasse}`, {
                data: { status_interclasse: '1' }
            });
            expect(restauracaoFinal.ok()).toBeTruthy();
        }

        await page.goto(`aluno/ranking?id=${idEdicaoPublicada}`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#totalTurmasDesk')).not.toHaveText('0 Turmas', { timeout: 15_000 });
        await expect(page.locator('#listaDesk .card-turma').first()).toBeVisible();
        await expect(page.locator('main:visible')).not.toContainText('Ranking Oculto');
    });

    test('gestão de perfil, validação de senha e alteração com reautenticação', async ({ page }) => {
        // Login com o aluno
        await page.goto('login', { waitUntil: 'domcontentloaded' });
        await page.locator('#form_desktop .ipt-matricula').fill(fixture.matricula);
        await page.locator('#form_desktop .ipt-senha').fill(fixture.senhaOriginal);
        await page.locator('#form_desktop button[type="submit"]').click();
        await page.waitForURL(/\/aluno\/inicio/, { timeout: 15_000 });

        // Acessar perfil
        await page.goto('aluno/perfil', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#perfilNomeDesk, #perfilNomeInfo').first()).toBeVisible({ timeout: 15_000 });

        const btnEditarPerfil = page.locator('button[data-bs-target="#modalEditarPerfil"]:visible').first();
        const modalPerfil = page.getByRole('dialog', { name: 'Editar Perfil' });
        const modalPerfilMostrado = modalPerfil.evaluate((element) => new Promise((resolve) => {
            element.addEventListener('shown.bs.modal', resolve, { once: true });
        }));
        await btnEditarPerfil.click();
        await modalPerfilMostrado;
        await expect(modalPerfil).toBeVisible();
        await expect(modalPerfil.getByLabel('Nome')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(modalPerfil).toBeHidden();
        await expect(btnEditarPerfil).toBeFocused();

        // Abrir modal de alteração de senha
        const btnAlterarSenha = page.locator('button[data-bs-target="#modalAlterarSenha"]:visible');
        await expect(btnAlterarSenha).toBeVisible({ timeout: 10_000 });
        await btnAlterarSenha.click();

        const modalSenha = page.locator('#modalAlterarSenha');
        await expect(modalSenha).toBeVisible({ timeout: 10_000 });
        await expect(page.getByRole('dialog', { name: 'Alterar Senha' })).toBeVisible();

        // 1. Testar senha atual incorreta
        await page.locator('#editarSenhaAtual').fill('senha_errada_xyz');
        await page.locator('#editarNovaSenha').fill('novaSenha123');
        await page.locator('#editarConfirmarSenha').fill('novaSenha123');
        await page.locator('#btnSalvarSenha').click();

        await expect(page.locator('#msgAlterarSenha')).toContainText(/Senha atual incorreta|incorreta/i, { timeout: 10_000 });

        // 2. Testar senhas que não coincidem
        await page.locator('#editarSenhaAtual').fill(fixture.senhaOriginal);
        await page.locator('#editarNovaSenha').fill('novaSenha123');
        await page.locator('#editarConfirmarSenha').fill('outraSenhaDiferente');
        await page.locator('#btnSalvarSenha').click();

        await expect(page.locator('#msgAlterarSenha')).toContainText(/não coincidem/i, { timeout: 10_000 });

        // 3. Alterar com dados corretos
        const novaSenhaCorreta = 'novaSenha123';
        await page.locator('#editarConfirmarSenha').fill(novaSenhaCorreta);
        await page.locator('#btnSalvarSenha').click();

        // Modal deve fechar após sucesso
        await expect(modalSenha).toBeHidden({ timeout: 15_000 });

        // 4. Logout e reautenticação com a nova senha
        const linkLogout = page.locator('a[href*="api/v1/logout"]:visible');
        await expect(linkLogout).toBeVisible({ timeout: 10_000 });
        await linkLogout.click();
        await expect(page.getByRole('dialog')).toContainText(/Sair do SGI/i);
        const redirectToLogin = page.waitForURL(/login/, { timeout: 15_000 });
        await page.getByRole('dialog').getByRole('button', { name: 'Sair' }).click();
        await redirectToLogin;

        // Tentativa com senha antiga deve falhar
        await page.locator('#form_desktop .ipt-matricula').fill(fixture.matricula);
        await page.locator('#form_desktop .ipt-senha').fill(fixture.senhaOriginal);
        await page.locator('#form_desktop button[type="submit"]').click();
        await expect(page.locator('#msg_erro_desktop')).toBeVisible({ timeout: 10_000 });

        // Login com nova senha deve suceder
        await page.locator('#form_desktop .ipt-senha').fill(novaSenhaCorreta);
        await page.locator('#form_desktop button[type="submit"]').click();
        await page.waitForURL(/\/aluno\/inicio/, { timeout: 15_000 });
        await expect(page).toHaveURL(/\/aluno\/inicio/);
    });

});
