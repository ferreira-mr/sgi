const { test, expect } = require('./fixtures.cjs');

async function jsonOrThrow(response, label) {
    if (!response.ok()) {
        throw new Error(`${label}: HTTP ${response.status()} ${await response.text()}`);
    }
    const payload = await response.json();
    if (payload && payload.success === false) {
        throw new Error(`${label}: ${payload.message || payload.mensagem || 'resposta recusada'}`);
    }
    return payload;
}

async function obterContexto(request, { criarCompetidor = true } = {}) {
    await jsonOrThrow(await request.post('api/v1/login', {
        data: { matricula: 'admin', senha: '123' }
    }), 'login de preparação do frontend');

    const edicoes = await jsonOrThrow(
        await request.get('api/v1/edicoes?regulamento=true'),
        'edições do frontend'
    );
    const listaEdicoes = Array.isArray(edicoes) ? edicoes : [];
    let edicao = listaEdicoes.find((item) => String(item.status_interclasse) === '1') || listaEdicoes[0];
    if (!edicao) throw new Error('Nenhuma edição disponível para a regressão visual.');

    let idInterclasse = Number(edicao.id_interclasse);
    let [categorias, modalidades, turmas, equipes, jogos] = await Promise.all([
        jsonOrThrow(await request.get(`api/v1/categorias?id_interclasse=${idInterclasse}`), 'categorias do frontend'),
        jsonOrThrow(await request.get(`api/v1/modalidades?id_interclasse=${idInterclasse}`), 'modalidades do frontend'),
        jsonOrThrow(await request.get(`api/v1/turmas?id_interclasse=${idInterclasse}`), 'turmas do frontend'),
        jsonOrThrow(await request.get(`api/v1/equipes?id_interclasse=${idInterclasse}`), 'equipes do frontend'),
        jsonOrThrow(await request.get(`api/v1/jogos?id_interclasse=${idInterclasse}`), 'jogos do frontend')
    ]);

    let listaJogos = Array.isArray(jogos) ? jogos : [];
    if (!listaJogos.some((j) => Number(j.id_jogo) > 0)) {
        for (const outra of listaEdicoes) {
            if (Number(outra.id_interclasse) === idInterclasse) continue;
            const fallbackJogos = await jsonOrThrow(await request.get(`api/v1/jogos?id_interclasse=${outra.id_interclasse}`), 'jogos de fallback');
            if (Array.isArray(fallbackJogos) && fallbackJogos.some((j) => Number(j.id_jogo) > 0)) {
                edicao = outra;
                idInterclasse = Number(outra.id_interclasse);
                await request.post(`api/v1/edicoes?id=${idInterclasse}`, {
                    data: { status_interclasse: '1' }
                });
                [categorias, modalidades, turmas, equipes, jogos] = await Promise.all([
                    jsonOrThrow(await request.get(`api/v1/categorias?id_interclasse=${idInterclasse}`), 'categorias do frontend'),
                    jsonOrThrow(await request.get(`api/v1/modalidades?id_interclasse=${idInterclasse}`), 'modalidades do frontend'),
                    jsonOrThrow(await request.get(`api/v1/turmas?id_interclasse=${idInterclasse}`), 'turmas do frontend'),
                    jsonOrThrow(await request.get(`api/v1/equipes?id_interclasse=${idInterclasse}`), 'equipes do frontend'),
                    Promise.resolve(fallbackJogos)
                ]);
                listaJogos = fallbackJogos;
                break;
            }
        }
    }

    const listaModalidades = Array.isArray(modalidades) ? modalidades : [];
    const listaTurmas = Array.isArray(turmas) ? turmas : [];
    const listaEquipes = Array.isArray(equipes) ? equipes : [];
    const modalidade = listaModalidades.find((item) => Number(item.id_modalidade) > 0) || {};
    const equipe = listaEquipes.find((item) => Number(item.id_equipe) > 0 && Number(item.turmas_id_turma || item.id_turma) > 0) || {};
    const turma = listaTurmas.find((item) => Number(item.id_turma) > 0) || {};
    const jogo = listaJogos.find((item) => Number(item.id_jogo) > 0) || {};
    const idTurma = Number(equipe.turmas_id_turma || equipe.id_turma || turma.id_turma || 0);

    // Quando solicitado, cria um competidor efêmero para que a suíte não dependa
    // do estado de um RM importado por uma execução anterior ou desativado.
    const matriculaAluno = `98${Date.now().toString().slice(-7)}`;
    let senhaAluno = '';
    let idAluno = 0;
    if (criarCompetidor && idTurma > 0) {
        const aluno = await jsonOrThrow(await request.post('api/v1/usuarios?acao=criar_aluno', {
            data: {
                nome_usuario: 'Aluno Frontend E2E',
                matricula_usuario: matriculaAluno,
                genero_usuario: 'MASC',
                data_nasc_usuario: '2010-01-01',
                turmas_id_turma: idTurma
            }
        }), 'competidor efêmero do frontend');
        if (aluno.status !== 'sucesso') throw new Error(`Não foi possível criar o competidor visual: ${JSON.stringify(aluno)}`);
        idAluno = Number(aluno.id_usuario || 0);
        senhaAluno = String(aluno.senha_temporaria || '');
        if (senhaAluno === '') throw new Error('A API não retornou a senha temporária do competidor visual.');
    }

    return {
        idInterclasse,
        idCategoria: Number((equipe.categorias_id_categoria || modalidade.categorias_id_categoria || listaTurmas[0]?.categorias_id_categoria || categorias[0]?.id_categoria) || 0),
        idModalidade: Number(equipe.modalidades_id_modalidade || modalidade.id_modalidade || 0),
        idTurma,
        idEquipe: Number(equipe.id_equipe || 0),
        idJogo: Number(jogo.id_jogo || 0),
        idAluno,
        matriculaAluno,
        senhaAluno,
        categorias: Array.isArray(categorias) ? categorias : [],
        modalidades: listaModalidades,
        turmas: listaTurmas,
        equipes: listaEquipes,
        jogos: listaJogos
    };
}

async function entrar(page, matricula, senha = '123') {
    await page.goto('login', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#form_desktop')).toBeVisible();
    await page.locator('#form_desktop .ipt-matricula').fill(String(matricula));
    await page.locator('#form_desktop .ipt-senha').fill(String(senha));
    await page.locator('#form_desktop button[type="submit"]').click();
    await page.waitForLoadState('domcontentloaded');
    await expect(page).not.toHaveURL(/login(?:\?|$)/, { timeout: 15_000 });
}

async function validarTela(page, testInfo, nome, caminho, seletores = ['main']) {
    await page.goto(caminho, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).not.toContainText(/Fatal error|Parse error|Warning:|Call to undefined/i);
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});

    await expect.poll(async () => {
        for (const seletor of seletores) {
            const visivel = await page.locator(seletor).evaluateAll((elementos) => elementos.some((el) => {
                const estilo = window.getComputedStyle(el);
                const caixa = el.getBoundingClientRect();
                return estilo.display !== 'none' && estilo.visibility !== 'hidden' && caixa.width > 0 && caixa.height > 0;
            })).catch(() => false);
            if (visivel) return true;
        }
        return false;
    }, { timeout: 15_000 }).toBe(true);

    await page.waitForTimeout(350);
    await capturarTela(page, testInfo, nome);
}

async function validarTelaMesario(page, testInfo, nome, callback, seletores = ['main']) {
    await page.evaluate(callback);
    await expect.poll(async () => {
        for (const seletor of seletores) {
            const visivel = await page.locator(seletor).evaluateAll((elementos) => elementos.some((el) => {
                const estilo = window.getComputedStyle(el);
                const caixa = el.getBoundingClientRect();
                return estilo.display !== 'none' && estilo.visibility !== 'hidden' && caixa.width > 0 && caixa.height > 0;
            })).catch(() => false);
            if (visivel) return true;
        }
        return false;
    }, { timeout: 20_000 }).toBe(true);
    await page.waitForTimeout(350);
    await capturarTela(page, testInfo, nome);
}

function ouvirErros(page) {
    const erros = [];
    page.on('pageerror', (error) => erros.push(error.message));
    return erros;
}

async function capturarTela(page, testInfo, nome) {
    const caminho = testInfo.outputPath('screens', `${nome}.png`);
    await page.screenshot({ path: caminho, fullPage: true });
    await testInfo.attach(`${nome}.png`, { path: caminho, contentType: 'image/png' });
}

test.describe('Frontend — regressão visual por perfil', () => {
    test('tela pública de login em desktop e mobile', async ({ page }, testInfo) => {
        const erros = ouvirErros(page);
        await page.goto('login', { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#form_desktop')).toBeVisible();
        await expect(page.locator('#form_desktop .ipt-matricula')).toBeVisible();
        await capturarTela(page, testInfo, '01-login-desktop');

        await page.setViewportSize({ width: 390, height: 844 });
        await expect(page.locator('#form_mobile')).toBeVisible();
        await capturarTela(page, testInfo, '02-login-mobile');
        expect(erros).toEqual([]);
    });

    test('adicionar atletas funciona em página nova, com busca e seleção sincronizada', async ({ page, request }) => {
        const erros = ouvirErros(page);
        const ctx = await obterContexto(request, { criarCompetidor: false });
        const dadosModalidade = await jsonOrThrow(await request.get(
            `api/v1/modalidades?id_modalidade=${ctx.idModalidade}`,
        ), 'modalidade da regressão L12');
        const modalidadesEncontradas = Array.isArray(dadosModalidade) ? dadosModalidade : [dadosModalidade];
        const modalidade = modalidadesEncontradas.find((item) => Number(item.id_modalidade) === ctx.idModalidade);
        const genero = String(modalidade?.genero_modalidade || 'MISTO') === 'FEM' ? 'FEM' : 'MASC';
        const sufixo = Date.now().toString().slice(-7);
        const matriculas = [`96${sufixo}`, `97${sufixo}`];
        const alunosCriados = [];

        try {
            const atletasCriados = [];
            for (const [indice, matricula] of matriculas.entries()) {
                const aluno = await jsonOrThrow(await request.post('api/v1/usuarios?acao=criar_aluno', {
                    data: {
                        nome_usuario: `L12 atleta ${indice + 1}`,
                        matricula_usuario: matricula,
                        genero_usuario: genero,
                        data_nasc_usuario: '2010-02-03',
                        turmas_id_turma: ctx.idTurma,
                    },
                }), `atleta ${indice + 1} da regressão L12`);
                const idUsuario = Number(aluno.id_usuario || 0);
                if (idUsuario > 0) alunosCriados.push(idUsuario);
                expect(aluno.status).toBe('sucesso');
                expect(idUsuario).toBeGreaterThan(0);
                atletasCriados.push(aluno);
            }
            const [primeiro, segundo] = atletasCriados;

            const lista = await jsonOrThrow(await request.get(
                `api/v1/usuarios?acao=listar_competidores&id_turma=${ctx.idTurma}&genero=${genero}`,
            ), 'consulta dos atletas L12');
            const competidores = Array.isArray(lista.competidores) ? lista.competidores : [];
            const primeiroDaLista = competidores.find((item) => item.matricula_usuario === matriculas[0]);
            const segundoDaLista = competidores.find((item) => item.matricula_usuario === matriculas[1]);
            expect(primeiroDaLista?.id_usuario).toBe(Number(primeiro.id_usuario));
            expect(segundoDaLista?.id_usuario).toBe(Number(segundo.id_usuario));

            await entrar(page, 'admin');
            await page.goto(
                `equipes/alunos?id=${ctx.idInterclasse}&id_turma=${ctx.idTurma}&id_equipe=${ctx.idEquipe}&id_categoria=${ctx.idCategoria}&id_modalidade=${ctx.idModalidade}`,
                { waitUntil: 'domcontentloaded' },
            );
            const desktopList = page.locator('#listaAlunosDesktop');
            const mobileList = page.locator('#listaAlunosMobile');
            await expect(desktopList).toContainText(matriculas[0]);
            await expect(desktopList).toContainText(matriculas[1]);
            await expect(desktopList).not.toContainText('Erro ao carregar estudantes.');
            await expect(desktopList.locator('img, svg[onload]')).toHaveCount(0);

            await page.locator('#buscaAlunosDesktop').fill(matriculas[0]);
            await expect(desktopList.locator('label')).toHaveCount(1);
            const firstDesktopCheck = desktopList.locator('label').filter({ hasText: matriculas[0] }).locator('input');
            await firstDesktopCheck.check();
            const firstMobileCheck = mobileList.locator('label').filter({ hasText: matriculas[0] }).locator('input');
            await expect(firstMobileCheck).toBeChecked();

            await page.setViewportSize({ width: 390, height: 844 });
            await page.locator('#buscaAlunosMobile').fill(matriculas[1]);
            await expect(mobileList.locator('label')).toHaveCount(1);
            const secondMobileCheck = mobileList.locator('label').filter({ hasText: matriculas[1] }).locator('input');
            await secondMobileCheck.check();
            const secondDesktopCheck = desktopList.locator('label').filter({ hasText: matriculas[1] }).locator('input');
            await expect(secondDesktopCheck).toBeChecked();

            await secondMobileCheck.uncheck();
            await expect(secondDesktopCheck).not.toBeChecked();
            await secondMobileCheck.check();
            await page.setViewportSize({ width: 1280, height: 900 });
            await secondDesktopCheck.uncheck();
            await expect(secondMobileCheck).not.toBeChecked();

            await page.locator('#buscaAlunosDesktop').fill(matriculas[0]);
            await expect(desktopList.locator('label')).toHaveCount(1);
            await expect(firstDesktopCheck).toBeChecked();

            const saveResponse = page.waitForResponse((response) =>
                response.url().includes('/api/v1/equipes') && response.request().method() === 'POST',
            );
            const saveRequest = page.waitForRequest((request) =>
                request.url().includes('/api/v1/equipes') && request.method() === 'POST',
            );
            await page.locator('#btnSalvarAlunosDesktop').click();
            const saved = await saveResponse;
            const submitted = await saveRequest;
            expect(saved.status()).toBe(200);
            expect(JSON.parse(submitted.postData() || '{}').usuarios).toEqual([Number(primeiro.id_usuario)]);
            await expect(page.locator('#btnSalvarAlunosDesktop')).toBeDisabled();
            await expect(page.locator('#btnSalvarAlunosDesktop')).toHaveAccessibleName(/Adicionar 0 estudantes/);
            await expect(page.locator('#buscaAlunosDesktop')).toHaveValue(matriculas[0]);
            await expect(desktopList.locator('label')).toHaveCount(1);
            await expect(desktopList).toContainText(matriculas[0]);
            await expect(desktopList).not.toContainText(matriculas[1]);

            const roster = await jsonOrThrow(await request.get(`api/v1/equipes?id_equipe=${ctx.idEquipe}`), 'equipe após adição L12');
            const rosterIds = roster.map((item) => Number(item.id_usuario));
            expect(rosterIds).toContain(Number(primeiro.id_usuario));
            expect(rosterIds).not.toContain(Number(segundo.id_usuario));
            expect(erros).toEqual([]);
        } finally {
            const errosLimpeza = [];
            for (const idUsuario of alunosCriados) {
                try {
                    await jsonOrThrow(await request.post('api/v1/equipes', {
                        data: { acao: 'remover_aluno', id_equipe: ctx.idEquipe, id_usuario: idUsuario },
                    }), 'limpeza do vínculo criado pela regressão L12');
                } catch (error) {
                    errosLimpeza.push(error);
                }
                try {
                    await jsonOrThrow(await request.post('api/v1/usuarios?acao=excluir_aluno', {
                        data: { id_usuario: idUsuario },
                    }), 'desativação do aluno criado pela regressão L12');
                } catch (error) {
                    errosLimpeza.push(error);
                }
            }
            if (errosLimpeza.length > 0) throw new Error(`Falha na limpeza L12: ${errosLimpeza.map((error) => error.message).join('; ')}`);
        }
    });

    test('todas as telas administrativas com dados reais da edição ativa', async ({ page, request }, testInfo) => {
        const erros = ouvirErros(page);
        const ctx = await obterContexto(request);
        await entrar(page, 'admin');

        const base = '';
        const id = ctx.idInterclasse;
        const idCat = ctx.idCategoria;
        const idMod = ctx.idModalidade;
        const idTurma = ctx.idTurma;
        const idEquipe = ctx.idEquipe;
        const idJogo = ctx.idJogo;
        const telas = [
            ['03-admin-home', `${base}edicoes`, ['#listaDesktop']],
            ['04-admin-dashboard', `${base}painel?id=${id}`, ['#conteudo-principal']],
            ['05-admin-resumo', `${base}edicoes/resumo?id=${id}&modo=view`, ['#resumoModalidadesDesktop']],
            ['06-admin-categorias', `${base}categorias?id=${id}`, ['#listaCategoriasDesktop']],
            ['07-admin-edicao-categorias', `${base}edicoes/categorias?id=${id}&modo=view`, ['#listaCategoriasDesktop']],
            ['08-admin-modalidades', `${base}modalidades?id=${id}`, ['#listaModalidadesDesktop']],
            ['09-admin-edicao-modalidades', `${base}edicoes/modalidades?id=${id}&modo=view`, ['#listaModalidadesDesktop']],
            ['10-admin-modalidade-detalhes', `${base}modalidades/detalhes?id=${id}&id_modalidade=${idMod}`, ['#resumoModalidadeDesktop']],
            ['11-admin-pontuacao', `${base}edicoes/pontuacao?id=${id}&modo=view`, ['#btnSalvarPontuacao']],
            ['12-admin-locais', `${base}edicoes/locais?id=${id}`, ['#listaLocaisDesktop']],
            ['13-admin-agenda', `${base}edicoes/agenda?id=${id}&modo=view`, ['#lista-eventos']],
            ['14-admin-arrecadacao', `${base}edicoes/arrecadacao?id=${id}`, ['#listaArrecadacaoDesktop']],
            ['15-admin-turmas', `${base}turmas?id=${id}`, ['#listaTurmasDesktop']],
            ['16-admin-edicao-turmas', `${base}edicoes/turmas?id=${id}`, ['#listaTurmas']],
            ['17-admin-turma-alunos', `${base}turmas/alunos?id=${id}&id_turma=${idTurma}&id_categoria=${idCat}`, ['#tbodyAlunosTurmaDesk']],
            ['18-admin-equipes', `${base}edicoes/equipes?id=${id}`, ['#listaEquipesDesktop']],
            ['19-admin-elenco', `${base}equipes/elenco?id=${id}&id_turma=${idTurma}&id_equipe=${idEquipe}&id_categoria=${idCat}&id_modalidade=${idMod}`, ['#tbodyElencoDesk']],
            ['20-admin-equipe-alunos', `${base}equipes/alunos?id=${id}&id_turma=${idTurma}&id_equipe=${idEquipe}&id_categoria=${idCat}&id_modalidade=${idMod}`, ['#listaAlunosDesktop']],
            ['21-admin-colaboradores', `${base}colaboradores?id=${id}&modo=view`, ['#listaColaboradoresDesktop']],
            ['22-admin-ocorrencias', `${base}ocorrencias?id=${id}`, ['#listaOcorrenciasDesktop']],
            ['23-admin-ranking', `${base}ranking?id=${id}`, ['#listaDesk']],
            ['24-admin-chaveamento', `${base}chaveamento?id=${id}`, ['#bracketArea', '#tbodyJogos']],
            ['25-admin-jogos-lista', `${base}jogos?id=${id}`, ['#listaJogos']],
            ['26-admin-placar', `${base}jogos/placar?id_jogo=${idJogo}`, ['#placar-grid']]
        ];

        for (const [nome, caminho, seletores] of telas) {
            if (caminho.includes('id_modalidade=0') || caminho.includes('id_turma=0') || caminho.includes('id_equipe=0') || caminho.includes('id_jogo=0')) {
                throw new Error(`Contexto incompleto para a tela ${nome}: ${caminho}`);
            }
            await validarTela(page, testInfo, nome, caminho, seletores);
            if (nome === '04-admin-dashboard') {
                await expect(page.locator('#avisoFinalizacaoInterclasse')).toBeHidden();
            }
        }

        await page.goto(`${base}edicoes/modalidades?id=${id}&modo=view`, { waitUntil: 'domcontentloaded' });
        const destaquesResponsePromise = page.waitForResponse((response) => {
            const url = response.url();
            return url.includes('/api/v1/artilheiros')
                && url.includes('acao=destaques_modalidades');
        });
        await page.locator('button[data-bs-target="#modalDestaques"]').click();
        const destaquesResponse = await destaquesResponsePromise;
        expect(destaquesResponse.status()).toBe(200);
        const destaquesPayload = await destaquesResponse.json();
        expect(destaquesPayload.success).toBe(true);
        await expect(page.locator('#modalDestaques')).toBeVisible();
        await expect(page.locator('#corpoDestaques')).not.toContainText('Erro ao carregar os destaques.');
        await capturarTela(page, testInfo, '27-admin-modalidades-destaques');
        expect(erros).toEqual([]);
    });

    test('telas do colaborador e permissões de navegação', async ({ page, request }, testInfo) => {
        const erros = ouvirErros(page);
        const ctx = await obterContexto(request);
        await entrar(page, 'colab');
        const base = '';
        const id = ctx.idInterclasse;
        const telas = [
            ['27-colab-home', `${base}edicoes`, ['#listaDesktop']],
            ['28-colab-dashboard', `${base}painel?id=${id}`, ['#conteudo-principal']],
            ['29-colab-modalidades', `${base}modalidades?id=${id}`, ['#listaModalidadesDesktop']],
            // Pontuação, locais e equipes são configurações administrativas;
            // o colaborador opera agenda/resultados, mas não altera o cadastro.
            ['30-colab-agenda', `${base}edicoes/agenda?id=${id}&modo=view`, ['#lista-eventos']],
            ['31-colab-arrecadacao', `${base}edicoes/arrecadacao?id=${id}`, ['#listaArrecadacaoDesktop']],
            ['32-colab-ocorrencias', `${base}ocorrencias?id=${id}`, ['#listaOcorrenciasDesktop']],
            ['33-colab-categorias', `${base}categorias?id=${id}`, ['#listaCategoriasDesktop']],
            ['34-colab-turmas', `${base}turmas?id=${id}`, ['#listaTurmasDesktop']],
            ['35-colab-ranking', `${base}ranking?id=${id}`, ['#listaDesk']],
            ['36-colab-chaveamento', `${base}chaveamento?id=${id}`, ['#bracketArea', '#tbodyJogos']],
            ['37-colab-perfil', `${base}perfil`, ['#perfilNomeInfo']]
        ];
        for (const [nome, caminho, seletores] of telas) {
            await validarTela(page, testInfo, nome, caminho, seletores);
        }

        // O colaborador não deve receber os controles exclusivos de admin.
        await page.goto(`${base}edicoes/modalidades?id=${id}&modo=view`, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('button[data-bs-target="#exampleModal"]:visible')).toHaveCount(0);
        await capturarTela(page, testInfo, '41-colab-modalidades-restritas');
        expect(erros).toEqual([]);
    });

    test('telas do mesário no shell SPA e cache pronto', async ({ page, request }, testInfo) => {
        const erros = ouvirErros(page);
        const ctx = await obterContexto(request);
        await entrar(page, 'mesario');
        await page.waitForURL(/painel\?id=\d+/, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('#sgi-offline-ok')).toContainText('Pronto para uso offline', { timeout: 120_000 });
        await expect.poll(() => page.evaluate(() => window.__SGI_SPA__ && window.__SGI_SPA__.status()), { timeout: 120_000 })
            .toMatchObject({ pronto: true, preloading: false });

        await capturarTela(page, testInfo, '42-mesario-dashboard');
        const id = ctx.idInterclasse;
        await validarTelaMesario(page, testInfo, '43-mesario-agenda', (interclasse) => {
            window.__SGI_SPA__.navegarPara('agenda', { id: interclasse });
        }, ['#lista-eventos', '#calendario-grade']);
        await validarTelaMesario(page, testInfo, '44-mesario-chaveamento', (interclasse) => {
            window.__SGI_SPA__.navegarPara('chaveamento', { id: interclasse });
        }, ['#bracketArea', '#tbodyJogos']);
        await validarTelaMesario(page, testInfo, '45-mesario-ocorrencias', (interclasse) => {
            window.__SGI_SPA__.navegarPara('ocorrencias', { id: interclasse });
        }, ['#listaOcorrenciasDesktop', '#listaOcorrenciasMobile']);
        await validarTelaMesario(page, testInfo, '46-mesario-jogos', (interclasse) => {
            window.__SGI_SPA__.navegarPara('jogoslista', { id: interclasse });
        }, ['#listaJogos']);
        await validarTelaMesario(page, testInfo, '47-mesario-perfil', () => {
            window.__SGI_SPA__.navegarPara('perfil', {});
        }, ['#perfilNomeInfo']);
        expect(erros).toEqual([]);
    });

    test('portal do aluno em todas as telas', async ({ page, request }, testInfo) => {
        const erros = ouvirErros(page);
        const ctx = await obterContexto(request);
        await entrar(page, ctx.matriculaAluno, ctx.senhaAluno);
        const base = 'aluno/';
        const id = ctx.idInterclasse;
        const telas = [
            ['48-aluno-home', `${base}inicio`, ['main', '.aluno-home']],
            ['49-aluno-modalidades', `${base}modalidades?id=${id}`, ['main', '#listaModalidades', '.aluno-page']],
            ['50-aluno-jogos', `${base}jogos`, ['main', '#listaJogos', '.aluno-page']],
            ['51-aluno-ranking', `${base}ranking?id=${id}`, ['main', '#listaDesk', '#listaMob', '.aluno-page']],
            ['52-aluno-termos', `${base}termos`, ['main', '#termosContainer', '.aluno-page']],
            ['53-aluno-perfil', `${base}perfil`, ['main', '#perfilNome', '.aluno-page']]
        ];
        for (const [nome, caminho, seletores] of telas) {
            await validarTela(page, testInfo, nome, caminho, seletores);
        }
        expect(erros).toEqual([]);
    });

    test('layout responsivo das telas críticas', async ({ page, request }, testInfo) => {
        const erros = ouvirErros(page);
        const ctx = await obterContexto(request);
        await entrar(page, 'admin');
        await page.setViewportSize({ width: 390, height: 844 });
        const id = ctx.idInterclasse;
        const telas = [
            ['54-mobile-dashboard', `painel?id=${id}`, ['#conteudo-principal']],
            ['55-mobile-agenda', `edicoes/agenda?id=${id}&modo=view`, ['#lista-eventos-mobile', '#calendario-grade-mobile']],
            ['56-mobile-modalidades', `edicoes/modalidades?id=${id}&modo=view`, ['#listaModalidadesDesktop']],
            ['57-mobile-turmas', `turmas?id=${id}`, ['#listaTurmasMobile']],
            ['58-mobile-ranking', `ranking?id=${id}`, ['main']]
        ];
        for (const [nome, caminho, seletores] of telas) {
            await validarTela(page, testInfo, nome, caminho, seletores);
        }
        expect(erros).toEqual([]);
    });

    test('E01 corrige a navegação contextual do aluno; E02 elimina overflow administrativo', async ({ page, request }, testInfo) => {
        const erros = ouvirErros(page);
        const ctx = await obterContexto(request);
        const medidas = { aluno: [], administrador: [] };

        await page.goto('login', { waitUntil: 'domcontentloaded' });
        await page.locator('#form_desktop .ipt-matricula').fill(ctx.matriculaAluno);
        await page.locator('#form_desktop .ipt-senha').fill(ctx.senhaAluno);
        await page.locator('#form_desktop button[type="submit"]').click();
        await page.waitForURL(/\/aluno\/trocar-senha/, { timeout: 15_000 });
        const senhaPessoal = 'Auditoria#2026';
        await page.locator('#novaSenhaPrimeiroAcesso').fill(senhaPessoal);
        await page.locator('#confirmarSenhaPrimeiroAcesso').fill(senhaPessoal);
        await page.locator('#btnSalvarSenhaPrimeiroAcesso').click();
        await page.waitForURL(/\/aluno\/termos/, { timeout: 15_000 });
        await page.locator('#btnAceitarTermos').click();
        await page.waitForURL(/\/aluno\/inicio/, { timeout: 15_000 });
        await page.setViewportSize({ width: 1440, height: 900 });
        for (const [tela, caminho] of [
            ['perfil', 'aluno/perfil'],
            ['inscricoes', `aluno/modalidades?id=${ctx.idInterclasse}`]
        ]) {
            await page.goto(caminho, { waitUntil: 'domcontentloaded' });
            const nav = page.locator('nav.sidebar-nav:visible');
            await expect(nav).toHaveAttribute('aria-label', 'Navegação principal');
            const nomeAtivo = tela === 'perfil' ? 'Perfil' : 'Inscrições';
            const linkAtivo = nav.getByRole('link', { name: nomeAtivo });
            await expect(linkAtivo).toBeVisible();
            await expect(linkAtivo).toHaveAttribute('aria-current', 'page');
            await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
            const linkInscricoes = nav.getByRole('link', { name: 'Inscrições' });
            const urlInscricoes = new URL(await linkInscricoes.getAttribute('href'), page.url());
            expect(urlInscricoes.searchParams.get('id')).toBe(String(ctx.idInterclasse));
            await expect(page).toHaveTitle(tela === 'perfil' ? 'Perfil | SGI' : 'Inscrições | SGI');
            const registro = await page.evaluate(() => {
                const nav = document.querySelector('.sidebar-nav');
                const main = [...document.querySelectorAll('main')].find((element) => {
                    const style = getComputedStyle(element);
                    return style.display !== 'none' && style.visibility !== 'hidden';
                });
                if (!nav || !main) return null;
                const navRect = nav.getBoundingClientRect();
                const mainRect = main.getBoundingClientRect();
                return {
                    sidebarBackground: getComputedStyle(nav).backgroundColor,
                    sidebarLeft: navRect.left,
                    sidebarRight: navRect.right,
                    mainLeft: mainRect.left,
                    mainWidth: mainRect.width,
                    hiddenLabels: [...nav.querySelectorAll('.sgi-sidebar-label')].every((label) => {
                        const style = getComputedStyle(label);
                        return style.display === 'none' || style.visibility === 'hidden' || label.getBoundingClientRect().width === 0;
                    }),
                    visibleIconCount: nav.querySelectorAll('.sgi-sidebar-link > .bi, .sgi-sidebar-link > .nav-avatar-img, .sgi-sidebar-link > .nav-avatar-fallback').length,
                    minimumLinkContrast: Math.min(...[...nav.querySelectorAll('a[href]')].map((link) => {
                        const linkStyle = getComputedStyle(link);
                        const colorChannels = (value) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
                        const luminance = (channels) => channels.map((channel) => {
                            const linear = channel / 255;
                            return linear <= 0.04045 ? linear / 12.92 : ((linear + 0.055) / 1.055) ** 2.4;
                        }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
                        const foreground = colorChannels(linkStyle.color);
                        const ownBackground = linkStyle.backgroundColor;
                        const background = colorChannels(ownBackground.startsWith('rgba') && Number(ownBackground.match(/[\d.]+/g)?.[3] || 0) === 0
                            ? getComputedStyle(nav).backgroundColor
                            : ownBackground);
                        const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
                        return (lighter + 0.05) / (darker + 0.05);
                    })),
                };
            });
            expect(registro, `elementos de geometria ausentes em ${tela}`).not.toBeNull();
            medidas.aluno.push({ tela, largura: 1440, ...registro });
            expect(registro.sidebarBackground).not.toBe('rgba(0, 0, 0, 0)');
            expect(registro.mainLeft).toBeGreaterThanOrEqual(registro.sidebarRight - 1);
            expect(registro.hiddenLabels).toBe(true);
            expect(registro.visibleIconCount).toBeGreaterThan(0);
            expect(registro.minimumLinkContrast).toBeGreaterThanOrEqual(4.5);
            await testInfo.attach(`e01-aluno-${tela}-1440.png`, {
                body: await page.screenshot({ fullPage: true }),
                contentType: 'image/png',
            });
            if (tela === 'perfil') {
                const skipLink = page.getByRole('link', { name: 'Ir para o conteúdo' });
                await page.keyboard.press('Tab');
                await expect(skipLink).toBeVisible();
                await expect(skipLink).toBeFocused();
                await page.keyboard.press('Enter');
                await expect(page.locator('#sgi-main-content:visible')).toBeFocused();
            }
        }

        await page.setViewportSize({ width: 390, height: 844 });
        await expect.poll(() => page.evaluate(() => {
            const main = [...document.querySelectorAll('main')].find((element) => {
                const style = getComputedStyle(element);
                return style.display !== 'none' && style.visibility !== 'hidden';
            });
            return main ? main.getBoundingClientRect().left : null;
        })).toBe(0);
        await page.locator('.sgi-mobile-menu-trigger:visible').click();
        const mobileNav = page.locator('.sgi-mobile-menu nav[aria-label="Navegação principal"]');
        await expect(mobileNav.getByRole('link', { name: 'Inscrições' })).toHaveAttribute('aria-current', 'page');
        await expect(mobileNav.locator('a[aria-current="page"]')).toHaveCount(1);
        await expect(mobileNav.getByRole('link', { name: 'Inscrições' })).toHaveAttribute('href', new RegExp(`[?&]id=${ctx.idInterclasse}(?:&|$)`));
        await page.locator('.sgi-mobile-menu .btn-close').click();
        await expect(page.locator('.sgi-mobile-menu')).toBeHidden();
        await page.goto('aluno/perfil', { waitUntil: 'domcontentloaded' });
        await page.locator('.sgi-mobile-menu-trigger:visible').click();
        const mobileProfileNav = page.locator('.sgi-mobile-menu nav[aria-label="Navegação principal"]');
        await expect(mobileProfileNav.getByRole('link', { name: 'Perfil' })).toHaveAttribute('aria-current', 'page');
        await expect(mobileProfileNav.locator('a[aria-current="page"]')).toHaveCount(1);

        await mobileProfileNav.getByRole('link', { name: 'Sair' }).click();
        const confirmLogout = page.getByRole('dialog', { name: 'Sair do SGI?' });
        await expect(confirmLogout).toContainText(/Sua sessão será encerrada/i);
        await confirmLogout.getByRole('button', { name: 'Sair' }).click();
        await page.waitForURL(/login/, { timeout: 15_000 });
        await page.setViewportSize({ width: 1440, height: 900 });
        await entrar(page, 'admin');
        const rotas = [
            ['dashboard', (id) => `painel?id=${id}`],
            ['modalidades', (id) => `edicoes/modalidades?id=${id}&modo=view`],
            ['colaboradores', (id) => `colaboradores?id=${id}&modo=view`],
        ];
        for (const largura of [320, 390, 640, 1024, 1440]) {
            await page.setViewportSize({ width: largura, height: largura < 500 ? 844 : 900 });
            for (const [tela, criarRota] of rotas) {
                await page.goto(criarRota(ctx.idInterclasse), { waitUntil: 'domcontentloaded' });
                await expect(page.locator('main:visible').first()).toBeVisible();
                const tituloEsperado = tela === 'dashboard' ? 'Dashboard' : (tela === 'modalidades' ? 'Modalidade' : 'Colaboradores');
                await expect(page).toHaveTitle(new RegExp(`${tituloEsperado}.*\\| SGI$`));
                const registro = await page.evaluate(() => ({
                    viewport: window.innerWidth,
                    document: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
                    mainLeft: [...document.querySelectorAll('main')].find((element) => {
                        const style = getComputedStyle(element);
                        return style.display !== 'none' && style.visibility !== 'hidden';
                    })?.getBoundingClientRect().left ?? null,
                }));
                medidas.administrador.push({ tela, largura, ...registro });
                if (largura === 1024 && tela === 'modalidades') {
                    const linkVoltar = page.locator('section.sgi-u-h-120px > a.sgi-u-top-20px-left-20px-z-10, #btnVoltarModalidades').first();
                    await expect(linkVoltar).toBeAttached();
                    const destino = new URL(await linkVoltar.getAttribute('href'), page.url());
                    expect(destino.pathname).toMatch(/\/painel$/);
                    expect(destino.searchParams.get('id')).toBe(String(ctx.idInterclasse));
                }
                expect(registro.document, `${tela} não deve ultrapassar ${largura}px`).toBeLessThanOrEqual(largura + 1);
                if (largura === 320 || largura === 390) {
                    await testInfo.attach(`e02-admin-sem-overflow-${tela}-${largura}.png`, {
                        body: await page.screenshot({ fullPage: true }),
                        contentType: 'image/png',
                    });
                }
            }
        }

        await testInfo.attach('e01-e02-ui-ux-geometria.json', {
            body: Buffer.from(JSON.stringify(medidas, null, 2), 'utf8'),
            contentType: 'application/json',
        });
        expect(erros).toEqual([]);
    });

    test('E02 caracteriza retrato estreito e alcance das ações no fim do fluxo', async ({ page, request }, testInfo) => {
        const ctx = await obterContexto(request, { criarCompetidor: false });
        await entrar(page, 'admin');
        const registros = { responsividade: [], acoesFixas: [] };
        const respostasResumo = [];
        page.on('response', (response) => {
            try {
                const url = new URL(response.url());
                if (/\/api\/v1\/(?:modalidades|categorias|turmas)$/.test(url.pathname)) {
                    respostasResumo.push({ path: url.pathname, status: response.status() });
                }
            } catch (_) { }
        });

        for (const largura of [320, 390, 640]) {
            const altura = largura === 640 ? 360 : (largura === 320 ? 568 : 844);
            await page.setViewportSize({ width: largura, height: altura });
            for (const [tela, rota] of [
                ['dashboard', `painel?id=${ctx.idInterclasse}`],
                ['configurar-modalidades', `edicoes/modalidades?id=${ctx.idInterclasse}&modo=create`],
                ['colaboradores', `colaboradores?id=${ctx.idInterclasse}&modo=view`],
            ]) {
                await page.goto(rota, { waitUntil: 'domcontentloaded' });
                await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
                await expect(page.locator('main:visible').first()).toBeVisible();
                if (tela === 'colaboradores') {
                    await page.locator('#statColabMob').evaluate((element) => { element.textContent = '1234'; });
                }
                const registro = await page.evaluate((nomeTela) => {
                    const main = [...document.querySelectorAll('main')].find((element) => {
                        const style = getComputedStyle(element);
                        return style.display !== 'none' && style.visibility !== 'hidden';
                    });
                    const cards = nomeTela === 'dashboard'
                        ? [...document.querySelectorAll('.main-dashboard-layout .row > .col-12.col-md-6')]
                        : nomeTela === 'colaboradores'
                            ? [...document.querySelectorAll('#statsMobile > .col')]
                            : [];
                    const toolbar = nomeTela === 'configurar-modalidades'
                        ? document.querySelector('.sgi-config-modalities-actions')
                        : null;
                    const mobileTitle = document.querySelector('.sgi-mobile-header-title');
                    const menuTrigger = document.querySelector('.sgi-mobile-menu-trigger');
                    const rect = (element) => {
                        if (!element) return null;
                        const box = element.getBoundingClientRect();
                        return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
                    };
                    const titleBox = rect(mobileTitle);
                    const menuBox = rect(menuTrigger);
                    const visible = (element) => {
                        const style = getComputedStyle(element);
                        const rect = element.getBoundingClientRect();
                        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
                    };
                    const overflowing = [...document.querySelectorAll('body *')]
                        .filter(visible)
                        .map((element) => ({
                            tag: element.tagName.toLowerCase(),
                            id: element.id,
                            className: typeof element.className === 'string' ? element.className : '',
                            text: (element.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 70),
                            left: Math.round(element.getBoundingClientRect().left),
                            right: Math.round(element.getBoundingClientRect().right),
                            width: Math.round(element.getBoundingClientRect().width),
                            scrollWidth: element.scrollWidth,
                        }))
                        .filter((element) => element.right > window.innerWidth + 1 || element.left < -1 || element.scrollWidth > element.width + 1)
                        .slice(0, 20);
                    const rects = cards.filter(visible).map((element) => {
                        const rect = element.getBoundingClientRect();
                        return { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height), text: (element.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 50) };
                    });
                    const label = document.querySelector('#statColabMob + .text-uppercase');
                    const colaboradoresCard = label?.closest('.card');
                    return {
                        viewport: { width: window.innerWidth, height: window.innerHeight },
                        documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
                        mainWidth: main ? Math.round(main.getBoundingClientRect().width) : null,
                        mobileTitle: titleBox,
                        mobileTitleIntersectsMenu: Boolean(titleBox && menuBox
                            && titleBox.left < menuBox.right && titleBox.right > menuBox.left
                            && titleBox.top < menuBox.bottom && titleBox.bottom > menuBox.top),
                        cards: rects,
                        collaboratorsLabel: label ? {
                            text: label.innerText,
                            width: Math.round(label.getBoundingClientRect().width),
                            scrollWidth: label.scrollWidth,
                        } : null,
                        collaboratorsValue: document.querySelector('#statColabMob')?.innerText || null,
                        collaboratorsCard: colaboradoresCard ? {
                            width: Math.round(colaboradoresCard.getBoundingClientRect().width),
                            scrollWidth: colaboradoresCard.scrollWidth,
                        } : null,
                        toolbar: toolbar ? {
                            left: Math.round(toolbar.getBoundingClientRect().left),
                            right: Math.round(toolbar.getBoundingClientRect().right),
                            buttons: [...toolbar.querySelectorAll('button,a')].filter(visible).map((element) => {
                                const rect = element.getBoundingClientRect();
                                return { left: Math.round(rect.left), right: Math.round(rect.right), top: Math.round(rect.top), bottom: Math.round(rect.bottom) };
                            }),
                        } : null,
                        overflowing,
                    };
                }, tela);
                registros.responsividade.push({ tela, ...registro });
                await testInfo.attach(`e02-retrato-${tela}-${largura}.png`, {
                    body: await page.screenshot({ fullPage: true }),
                    contentType: 'image/png',
                });
                expect.soft(registro.documentWidth, `${tela} não deve ultrapassar ${largura}px`).toBeLessThanOrEqual(largura + 1);
                if (tela === 'dashboard' && largura < 576) {
                    expect.soft(registro.cards.length).toBeGreaterThan(1);
                    expect.soft(registro.cards.every((card, index, all) => index === 0 || Math.abs(card.left - all[0].left) < 2)).toBe(true);
                }
                if (tela === 'dashboard' && largura === 640) {
                    expect.soft(registro.cards.length).toBeGreaterThan(1);
                    expect.soft(new Set(registro.cards.map((card) => card.left)).size).toBeGreaterThan(1);
                }
                if (tela === 'colaboradores') {
                    expect.soft(registro.collaboratorsLabel?.text).toMatch(/Colaboradores/i);
                    expect.soft(registro.collaboratorsValue).toBe('1234');
                    expect.soft(registro.collaboratorsLabel?.scrollWidth).toBeLessThanOrEqual(registro.collaboratorsLabel?.width + 1);
                    expect.soft(registro.collaboratorsCard?.scrollWidth).toBeLessThanOrEqual(registro.collaboratorsCard?.width + 1);
                }
                if (registro.mobileTitle) {
                    expect.soft(registro.mobileTitleIntersectsMenu, `${tela} não deve sobrepor o título ao menu compacto`).toBe(false);
                }
                if (tela === 'configurar-modalidades') {
                    expect.soft(registro.toolbar?.left).toBeGreaterThanOrEqual(0);
                    expect.soft(registro.toolbar?.right).toBeLessThanOrEqual(largura);
                    for (const button of registro.toolbar?.buttons || []) {
                        expect.soft(button.left).toBeGreaterThanOrEqual(0);
                        expect.soft(button.right).toBeLessThanOrEqual(largura);
                    }
                }
            }
        }

        for (const largura of [320, 390]) {
            const altura = largura === 320 ? 568 : 844;
            await page.setViewportSize({ width: largura, height: altura });
            for (const [tela, rota, lista, seletorAcoes] of [
                ['categorias', `categorias?id=${ctx.idInterclasse}`, '#listaCategoriasMobile', '#acoesCategoriaMobile'],
                ['configurar-categorias', `edicoes/categorias?id=${ctx.idInterclasse}&modo=create`, '#listaCategoriasMobile', '#acoesCategoriaMobile'],
                ['resumo', `edicoes/resumo?id=${ctx.idInterclasse}&modo=create`, '.sgi-resumo-card', '#acoesResumoMobile'],
                ['modalidades-competicao', `modalidades?id=${ctx.idInterclasse}`, '#listaModalidadesMobile', '#acoesModalidadesMobile'],
            ]) {
                if (tela === 'resumo') respostasResumo.length = 0;
                await page.goto(rota, { waitUntil: 'domcontentloaded' });
                await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
                await expect(page.locator('main:visible').first()).toBeVisible();
                if (tela === 'resumo') {
                    const basePath = await page.evaluate(() => String(window.SGI_BASE_PATH || '').replace(/\/+$/, ''));
                    await expect.poll(() => page.locator('#resumoTurmasMobile').innerText()).not.toContain('(Carregando...)');
                    for (const endpoint of ['modalidades', 'categorias', 'turmas']) {
                        const esperado = `${basePath}/api/v1/${endpoint}`;
                        expect(respostasResumo.some((resposta) => resposta.path === esperado && resposta.status === 200),
                            `resumo deve consultar ${esperado} e receber HTTP 200`).toBe(true);
                    }
                }
                const acoes = page.locator(seletorAcoes);
                await expect(acoes).toBeVisible();
                const linhas = tela === 'resumo'
                    ? page.locator('main:visible .sgi-resumo-card')
                    : tela === 'modalidades-competicao'
                        ? page.locator(`${lista} > div.bg-white`)
                        : page.locator(lista).locator('.categoria-item');
                await expect(linhas.first()).toBeVisible();
                if (tela !== 'resumo' && tela !== 'modalidades-competicao') {
                    await linhas.first().click();
                    await expect(page.locator('#btnEditarCategoriaMobile')).toBeVisible();
                    await expect(page.locator('#btnExcluirCategoriaMobile')).toBeVisible();
                }
                const ultimaLinha = linhas.last();
                const controleUltimaLinha = tela === 'modalidades-competicao'
                    ? ultimaLinha.locator('button').last()
                    : ultimaLinha;
                await controleUltimaLinha.focus();
                await expect(controleUltimaLinha).toBeFocused();
                const geometriaDoFoco = await page.evaluate((seletor) => {
                    const target = document.activeElement;
                    const actions = document.querySelector(seletor);
                    const targetRect = target.getBoundingClientRect();
                    const actionRect = actions.getBoundingClientRect();
                    const menuRect = document.querySelector('.sgi-mobile-menu-trigger').getBoundingClientRect();
                    const intersects = targetRect.left < actionRect.right && targetRect.right > actionRect.left
                        && targetRect.top < actionRect.bottom && targetRect.bottom > actionRect.top;
                    const intersectsMenu = targetRect.left < menuRect.right && targetRect.right > menuRect.left
                        && targetRect.top < menuRect.bottom && targetRect.bottom > menuRect.top;
                    return { intersects, intersectsMenu, targetTop: Math.round(targetRect.top), targetBottom: Math.round(targetRect.bottom) };
                }, seletorAcoes);
                expect(geometriaDoFoco.intersects, `${tela} não deve encobrir o último registro focado`).toBe(false);
                expect(geometriaDoFoco.intersectsMenu, `${tela} não deve encobrir o último registro focado com o menu`).toBe(false);
                await page.keyboard.press('Tab');
                const firstAction = acoes.locator('a:visible, button:visible').first();
                await expect(firstAction).toBeFocused();
                if (tela === 'modalidades-competicao') {
                    const modal = page.locator('#modalCriarModalidade');
                    const shown = modal.evaluate((element) => new Promise((resolve) => {
                        element.addEventListener('shown.bs.modal', resolve, { once: true });
                    }));
                    await page.keyboard.press('Enter');
                    await shown;
                    await expect(modal).toBeVisible();
                    const closeButton = modal.locator('.btn-close');
                    await closeButton.focus();
                    await expect(closeButton).toBeFocused();
                    await page.keyboard.press('Escape');
                    await expect(modal).toBeHidden();
                    await expect(firstAction).toBeFocused();
                }
                const registro = await page.evaluate(({ nomeTela, seletorLista, seletorAcoes: seletor }) => {
                    const main = [...document.querySelectorAll('main')].find((element) => {
                        const style = getComputedStyle(element);
                        return style.display !== 'none' && style.visibility !== 'hidden';
                    });
                    const actions = main?.querySelector(seletor);
                    const list = nomeTela === 'resumo' ? main : (seletorLista ? document.querySelector(seletorLista) : null);
                    const box = (element) => {
                        if (!element) return null;
                        const rect = element.getBoundingClientRect();
                        return { left: Math.round(rect.left), top: Math.round(rect.top), right: Math.round(rect.right), bottom: Math.round(rect.bottom), width: Math.round(rect.width), height: Math.round(rect.height) };
                    };
                    const actionRect = actions?.getBoundingClientRect();
                    const itemSelector = nomeTela === 'resumo'
                        ? '.sgi-resumo-card'
                        : nomeTela === 'modalidades-competicao'
                            ? ':scope > div.bg-white'
                            : '.categoria-item';
                    const contentItems = list ? [...list.querySelectorAll(itemSelector)].filter((element) => {
                        const style = getComputedStyle(element);
                        const rect = element.getBoundingClientRect();
                        return style.display !== 'none' && rect.width > 0 && rect.height > 0;
                    }) : [];
                    const overlaps = actionRect ? contentItems.filter((element) => {
                        const rect = element.getBoundingClientRect();
                        return rect.left < actionRect.right && rect.right > actionRect.left && rect.top < actionRect.bottom && rect.bottom > actionRect.top;
                    }).map((element) => ({ text: (element.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 80), rect: box(element) })) : [];
                    const trigger = document.querySelector('.sgi-mobile-menu-trigger');
                    const heading = main?.querySelector('h1, h2');
                    return {
                        viewport: { width: window.innerWidth, height: window.innerHeight },
                        tela: nomeTela,
                        scrollHeight: document.documentElement.scrollHeight,
                        actionPosition: actions ? getComputedStyle(actions).position : null,
                        actionRect: box(actions),
                        actionNames: actions ? [...actions.querySelectorAll('a,button')].filter((element) => {
                            const style = getComputedStyle(element);
                            return style.display !== 'none' && style.visibility !== 'hidden';
                        }).map((element) => element.innerText.trim()) : [],
                        contentCount: contentItems.length,
                        contentIntersectionsAtTop: overlaps,
                        headingRect: box(heading),
                        menuTriggerRect: box(trigger),
                        contentWidth: main ? Math.round(main.getBoundingClientRect().width) : null,
                        documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
                    };
                }, { nomeTela: tela, seletorLista: lista, seletorAcoes });
                registros.acoesFixas.push(registro);
                expect(registro.actionPosition, `${tela} deve manter as ações no fluxo do conteúdo`).toBe('static');
                expect(registro.actionRect.left, `${tela} deve manter as ações na largura visível`).toBeGreaterThanOrEqual(0);
                expect(registro.actionRect.right, `${tela} deve manter as ações na largura visível`).toBeLessThanOrEqual(largura);
                expect(registro.documentWidth, `${tela} não deve ultrapassar ${largura}px`).toBeLessThanOrEqual(largura + 1);
                expect(registro.contentCount, `${tela} precisa medir os registros visíveis`).toBeGreaterThan(0);
                await testInfo.attach(`e02-acoes-${tela}-${largura}.png`, {
                    body: await page.screenshot({ fullPage: true }),
                    contentType: 'image/png',
                });
            }
        }

        await page.setViewportSize({ width: 1440, height: 900 });
        for (const [tela, rota, lista, seletorAcoes, seletorItem] of [
            ['configurar-categorias-desktop', `edicoes/categorias?id=${ctx.idInterclasse}&modo=create`, '#listaCategoriasDesktop', '#acoesCategoriaDesktop', '.categoria-item a[href]'],
            ['resumo-desktop', `edicoes/resumo?id=${ctx.idInterclasse}&modo=create`, 'main:visible', '#acoesResumoDesktop', '.sgi-resumo-card'],
            ['modalidades-competicao-desktop', `modalidades?id=${ctx.idInterclasse}`, '#listaModalidadesDesktop', '#acoesModalidadesDesktop', '.row > .col-12'],
        ]) {
            await page.goto(rota, { waitUntil: 'domcontentloaded' });
            await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
            const acoes = page.locator(seletorAcoes);
            await expect(acoes).toBeVisible();
            const ultimaLinha = page.locator(lista).locator(seletorItem).last();
            const controleUltimaLinha = tela.startsWith('modalidades-competicao')
                ? ultimaLinha.locator('button').last()
                : ultimaLinha;
            await controleUltimaLinha.focus();
            await expect(controleUltimaLinha).toBeFocused();
            await page.keyboard.press('Tab');
            const primeiroControle = acoes.locator(tela.includes('resumo') ? 'a' : 'button:visible').first();
            await expect(primeiroControle).toBeFocused();
            const registro = await acoes.evaluate((actions) => {
                const rect = actions.getBoundingClientRect();
                return {
                    position: getComputedStyle(actions).position,
                    left: Math.round(rect.left),
                    right: Math.round(rect.right),
                    documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
                };
            });
            expect(registro.position, `${tela} deve manter as ações no fluxo do conteúdo`).toBe('static');
            expect(registro.left).toBeGreaterThanOrEqual(0);
            expect(registro.right).toBeLessThanOrEqual(1441);
            expect(registro.documentWidth).toBeLessThanOrEqual(1441);

            if (tela.startsWith('modalidades-competicao')) {
                expect(registro.position, `${tela} deve manter as ações no fluxo do conteúdo`).toBe('static');
                const modal = page.locator('#modalCriarModalidade');
                const shown = modal.evaluate((element) => new Promise((resolve) => {
                    element.addEventListener('shown.bs.modal', resolve, { once: true });
                }));
                await page.keyboard.press('Enter');
                await shown;
                await expect(modal).toBeVisible();
                const closeButton = modal.locator('.btn-close');
                await closeButton.focus();
                await expect(closeButton).toBeFocused();
                await page.keyboard.press('Escape');
                await expect(modal).toBeHidden();
                await expect(primeiroControle).toBeFocused();
            }

            if (tela === 'resumo-desktop') {
                const links = await page.evaluate(() => ({
                    basePath: String(window.SGI_BASE_PATH || '').replace(/\/+$/, ''),
                    modalities: document.getElementById('linkEditarModalidadesMobile')?.getAttribute('href'),
                    classes: document.getElementById('linkEditarCategoriasMobile')?.getAttribute('href'),
                    action: document.getElementById('btnAcaoFinalizacaoResumoDesktop')?.getAttribute('href'),
                }));
                const basePath = links.basePath;
                for (const [nome, href, fragment] of [
                    ['modalidades', links.modalities, '/edicoes/modalidades'],
                    ['categorias', links.classes, '/edicoes/categorias'],
                    ['painel', links.action, '/painel'],
                ]) {
                    expect(new URL(href, page.url()).pathname, `URL ${nome} deve respeitar o prefixo da aplicação`).toBe(`${basePath}${fragment}`);
                }
            }
        }

        await testInfo.attach('e02-diagnostico-baseline.json', {
            body: Buffer.from(JSON.stringify(registros, null, 2), 'utf8'),
            contentType: 'application/json',
        });
        const geometria = registros.responsividade.map(({ tela, viewport, documentWidth, cards, collaboratorsLabel }) => ({
            tela,
            width: viewport.width,
            documentWidth,
            cards: cards.map(({ left, width }) => ({ left, width })),
            collaboratorsLabel,
        }));
        console.log('E02_GEOMETRIA', JSON.stringify(geometria));
        console.log('E02_ACOES_FIXAS', JSON.stringify(registros.acoesFixas));
    });

    test('E02 mantém o menu compacto fora de títulos longos e do conteúdo focado', async ({ page, request }, testInfo) => {
        const ctx = await obterContexto(request);
        if (ctx.idAluno < 1 || !ctx.senhaAluno) throw new Error('A fixture não criou o aluno necessário para a geometria do menu.');

        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto('login', { waitUntil: 'domcontentloaded' });
        await page.locator('#form_desktop .ipt-matricula').fill(ctx.matriculaAluno);
        await page.locator('#form_desktop .ipt-senha').fill(ctx.senhaAluno);
        await page.locator('#form_desktop button[type="submit"]').click();
        await page.waitForURL(/\/aluno\/trocar-senha/, { timeout: 15_000 });
        const senhaPessoal = 'MenuCompacto#2026';
        await page.locator('#novaSenhaPrimeiroAcesso').fill(senhaPessoal);
        await page.locator('#confirmarSenhaPrimeiroAcesso').fill(senhaPessoal);
        await page.locator('#btnSalvarSenhaPrimeiroAcesso').click();
        await page.waitForURL(/\/aluno\/termos/, { timeout: 15_000 });
        await page.locator('#btnAceitarTermos').click();
        await page.waitForURL(/\/aluno\/inicio/, { timeout: 15_000 });

        const geometria = [];
        for (const width of [320, 390]) {
            await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
            await page.evaluate(() => {
                const heading = document.querySelector('.sgi-aluno-home-hero h1');
                if (heading) heading.textContent = 'Olá, Maria Fernanda de Almeida Ferreira Nascimento!';
            });
            const record = await page.evaluate(() => {
                const heading = document.querySelector('.sgi-aluno-home-hero h1').getBoundingClientRect();
                const trigger = document.querySelector('.sgi-mobile-menu-trigger').getBoundingClientRect();
                const intersects = heading.left < trigger.right && heading.right > trigger.left
                    && heading.top < trigger.bottom && heading.bottom > trigger.top;
                return {
                    heading: { left: Math.round(heading.left), top: Math.round(heading.top), right: Math.round(heading.right), bottom: Math.round(heading.bottom) },
                    trigger: { left: Math.round(trigger.left), top: Math.round(trigger.top), right: Math.round(trigger.right), bottom: Math.round(trigger.bottom) },
                    intersects,
                    documentWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
                };
            });
            geometria.push({ width, ...record });
            expect(record.intersects, `saudação longa em ${width}px não deve ficar sob o menu`).toBe(false);
            expect(record.documentWidth, `home do aluno em ${width}px não deve transbordar`).toBeLessThanOrEqual(width + 1);
            await testInfo.attach(`e02-menu-aluno-${width}.png`, {
                body: await page.screenshot({ fullPage: true }),
                contentType: 'image/png',
            });
        }

        await page.evaluate(() => {
            const banner = document.createElement('div');
            banner.id = 'e02-offline-banner-fixture';
            banner.className = 'sgi-offline-banner';
            banner.style.height = '42px';
            banner.style.background = '#b02a37';
            document.documentElement.style.setProperty('--sgi-offline-banner-height', '42px');
            document.body.classList.add('sgi-offline-active');
            document.body.append(banner);
        });
        const offlineGeometry = await page.evaluate(() => {
            const heading = document.querySelector('.sgi-aluno-home-hero h1').getBoundingClientRect();
            const trigger = document.querySelector('.sgi-mobile-menu-trigger').getBoundingClientRect();
            const banner = document.querySelector('#e02-offline-banner-fixture').getBoundingClientRect();
            return {
                triggerTop: Math.round(trigger.top),
                bannerBottom: Math.round(banner.bottom),
                headingBottom: Math.round(heading.bottom),
                titleClear: heading.bottom <= trigger.top || heading.top >= trigger.bottom
                    || heading.right <= trigger.left || heading.left >= trigger.right,
            };
        });
        expect(offlineGeometry.triggerTop).toBeGreaterThanOrEqual(offlineGeometry.bannerBottom + 8);
        expect(offlineGeometry.titleClear).toBe(true);
        geometria.push({ offline: offlineGeometry });
        await testInfo.attach('e02-menu-aluno-offline.json', {
            body: Buffer.from(JSON.stringify(geometria, null, 2), 'utf8'),
            contentType: 'application/json',
        });
    });
});
