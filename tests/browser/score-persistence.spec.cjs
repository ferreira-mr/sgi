const { test, expect } = require('./fixtures.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { agendarBloco } = require('./agenda-helper.cjs');

fs.mkdirSync(path.resolve(__dirname, '..', '..', 'test-results', 'sessions'), { recursive: true });

async function jsonOrThrow(response, label) {
    if (!response.ok()) throw new Error(`${label}: HTTP ${response.status()} ${await response.text()}`);
    return response.json();
}

async function criarJogoFixture(request) {
    const base = process.env.SGI_BASE_URL || 'http://localhost/SGI/';
    const api = (value) => new URL(value, base).href;
    await jsonOrThrow(await request.post(api('api/v1/login'), {
        data: { matricula: 'admin', senha: '123' },
    }), 'login administrativo');

    const edicoes = await jsonOrThrow(
        await request.get(api('api/v1/edicoes?regulamento=true')),
        'edições',
    );
    const edicao = edicoes.find((item) => String(item.status_interclasse) === '1');
    if (!edicao) throw new Error('Nenhuma edição ativa disponível para o teste de placar.');

    const idInterclasse = Number(edicao.id_interclasse);
    const [equipes, modalidades] = await Promise.all([
        request.get(api(`api/v1/equipes?id_interclasse=${idInterclasse}`)).then((response) => jsonOrThrow(response, 'equipes')),
        request.get(api(`api/v1/modalidades?id_interclasse=${idInterclasse}`)).then((response) => jsonOrThrow(response, 'modalidades')),
    ]);
    const modalidade = modalidades.find((item) =>
        String(item.nome_tipo_modalidade || '').toLowerCase().includes('mata') &&
        String(item.nome_modalidade || '').toLowerCase().includes('futsal')
    );
    if (!modalidade) throw new Error('Nenhuma modalidade de futsal mata-mata disponível.');
    const disponiveis = equipes.filter((item) => String(item.modalidades_id_modalidade) === String(modalidade.id_modalidade));
    if (disponiveis.length < 2) throw new Error('O fixture precisa de duas equipes.');
    await garantirAtletas(request, idInterclasse, disponiveis.slice(0, 2));

    const nomeJogo = `T10 Score ${Date.now()}`;
    await jsonOrThrow(await request.post(api('api/v1/sincronizacao/chaveamento'), {
        data: {
            id_modalidade: Number(modalidade.id_modalidade),
            tipo_modalidade: 'mata_mata',
            jogos: [{
                nome_jogo: nomeJogo,
                status_jogo: 'Agendado',
                partidas: [
                    { id_equipe: Number(disponiveis[0].id_equipe), resultado: 0 },
                    { id_equipe: Number(disponiveis[1].id_equipe), resultado: 0 },
                ],
            }],
        },
    }), 'criação do jogo');

    const jogos = await jsonOrThrow(
        await request.get(api(`api/v1/jogos?id_modalidade=${Number(modalidade.id_modalidade)}`)),
        'consulta do jogo',
    );
    const jogo = jogos.find((item) => String(item.nome_jogo) === nomeJogo);
    if (!jogo) throw new Error('A API não retornou o jogo criado.');
    const partidas = await jsonOrThrow(
        await request.get(api(`api/v1/partidas?id_jogo=${Number(jogo.id_jogo)}`)),
        'consulta das partidas',
    );
    await agendarBloco(request, {
        idInterclasse,
        idModalidade: Number(modalidade.id_modalidade),
        jogos: [{ id_jogo: Number(jogo.id_jogo) }],
        label: 'T10-score',
    });
    return {
        idInterclasse,
        idJogo: Number(jogo.id_jogo),
        idsPartidas: partidas.map((item) => String(item.id_partida)),
    };
}

function apiPath(value) {
    const base = process.env.SGI_BASE_URL || 'http://localhost/SGI/';
    return new URL(value, base).href;
}

async function garantirAtletas(request, idInterclasse, equipes) {
    for (let index = 0; index < equipes.length; index += 1) {
        const equipe = equipes[index];
        const membros = await jsonOrThrow(
            await request.get(apiPath(`api/v1/equipes?id_equipe=${Number(equipe.id_equipe)}`)),
            `membros da equipe ${equipe.id_equipe}`,
        );
        if (membros.some((membro) => Number(membro.id_usuario) > 0)) continue;
        const alunos = await jsonOrThrow(
            await request.get(apiPath(`api/v1/usuarios?acao=listar_competidores&id_turma=${Number(equipe.turmas_id_turma)}&id_interclasse=${idInterclasse}`)),
            `alunos da equipe ${equipe.id_equipe}`,
        );
        let idUsuario = (alunos.competidores || []).find((aluno) => String(aluno.status_usuario || '1') === '1')?.id_usuario;
        if (!Number(idUsuario)) {
            const criado = await jsonOrThrow(await request.post(apiPath('api/v1/usuarios?acao=criar_aluno'), {
                data: {
                    nome_usuario: `Atleta T10 ${index + 1} ${Date.now()}`,
                    matricula_usuario: `T10${Date.now()}${index}`,
                    data_nasc_usuario: '2010-01-01',
                    genero_usuario: 'MASC',
                    turmas_id_turma: Number(equipe.turmas_id_turma),
                },
            }), `criação do atleta ${equipe.id_equipe}`);
            idUsuario = criado.id_usuario || criado.id;
        }
        await jsonOrThrow(await request.post(apiPath('api/v1/equipes'), {
            data: { acao: 'adicionar_usuarios', id_equipe: Number(equipe.id_equipe), usuarios: [Number(idUsuario)] },
        }), `vínculo do atleta ${equipe.id_equipe}`);
    }
}

async function navegar(page, tela, params) {
    await page.evaluate(({ tela, params }) => {
        window.__SGI_SPA__.navegarPara(tela, params);
    }, { tela, params });
}

async function lerFilaPontos(page, idJogo) {
    return page.evaluate(async (gameId) => {
        const fila = await window.SGIDataLayer.read('fila_sincronizacao');
        return fila.filter((item) => {
            if (!item || !String(item.url || '').includes('/api/v1/pontos')) return false;
            try {
                const body = typeof item.body === 'string' ? JSON.parse(item.body) : item.body;
                return String(body.jogos_id_jogo ?? body.id_jogo) === String(gameId)
                    || String(body.id_ponto || '').startsWith('temp_');
            } catch (_) {
                return false;
            }
        }).sort((a, b) => Number(a.id) - Number(b.id));
    }, idJogo);
}

async function lerPlacarLocal(page, idJogo) {
    return page.evaluate(async (id) => {
        const partidas = await window.SGIDataLayer.read('partidas');
        return partidas
            .filter((item) => String(item.jogos_id_jogo ?? item.id_jogo) === String(id))
            .sort((a, b) => Number(a.id_partida) - Number(b.id_partida))
            .map((item) => Number(item.resultado_partida));
    }, idJogo);
}

async function clicarPlacar(page, seletor) {
    await page.locator(seletor).first().click();
    const artilheiro = page.locator('#modalArtilheiro');
    await artilheiro.waitFor({ state: 'visible', timeout: 5_000 });
    const aluno = artilheiro.locator('#selectAlunoArtilheiro');
    await expect.poll(() => aluno.locator('option').count()).toBeGreaterThan(1);
    await aluno.selectOption({ index: 1 });
    await artilheiro.locator('#btnSalvarArtilheiro').click();
    await expect(artilheiro).toBeHidden();
}

test.describe('Mesário — persistência imediata do placar', () => {
    test('sobrevive à desmontagem imediata, preserva a ordem e sincroniza o valor final', async ({ page, context, request }) => {
        test.setTimeout(180_000);
        const fixture = await criarJogoFixture(request);

        await page.goto('login', { waitUntil: 'domcontentloaded' });
        await page.locator('#form_desktop .ipt-matricula').fill('mesario');
        await page.locator('#form_desktop .ipt-senha').fill('123');
        await page.locator('#form_desktop button[type="submit"]').click();
        await page.waitForURL(/\/painel\?id=\d+/, { waitUntil: 'domcontentloaded' });
        await navegar(page, 'jogos', { id_jogo: fixture.idJogo, origem: 'agenda_edit' });
        await expect(page.locator('#placar-conteudo')).toBeVisible();
        await page.getByRole('button', { name: /Iniciar jogo/i }).click();
        await expect(page.locator('#mc-status-badge')).toContainText('Em andamento');

        // O cenário que reproduzia a perda do primeiro gol desmonta a tela
        // imediatamente após a ação, sem esperar qualquer janela de atraso.
        await clicarPlacar(page, '.btn-score-plus');
        await navegar(page, 'agenda', { id: fixture.idInterclasse });
        await expect(page.locator('#lista-eventos')).toBeVisible();
        await navegar(page, 'jogos', { id_jogo: fixture.idJogo, origem: 'agenda_edit' });
        await expect(page.locator('#placar-conteudo')).toBeVisible();
        await expect(page.locator('.score-number').first()).toHaveText('1');
        const artilheiro = page.locator('#modalArtilheiro');
        if (await artilheiro.isVisible()) {
            await artilheiro.locator('.btn-close').click();
            await expect(artilheiro).toBeHidden();
        }

        await context.setOffline(true);
        await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
        await clicarPlacar(page, '.btn-score-plus');
        await clicarPlacar(page, '.btn-score-plus');
        // A anulação não abre o seletor: ela remove o último ponto ativo,
        // mantendo o registro histórico do atleta.
        await page.locator('.btn-score-minus').first().click();
        await expect(page.locator('.score-number').first()).toHaveText('2');
        await navegar(page, 'agenda', { id: fixture.idInterclasse });
        await expect(page.locator('#lista-eventos')).toBeVisible();
        await expect.poll(() => page.evaluate(() => window.SGIOffline.getState().pending)).toBeGreaterThanOrEqual(3);

        const fila = await lerFilaPontos(page, fixture.idJogo);
        const corpos = fila.map((item) => typeof item.body === 'string' ? JSON.parse(item.body) : item.body);
        expect(fila.slice(-3).map((item) => item.method)).toEqual(['POST', 'POST', 'PUT']);
        expect(corpos.slice(-3).every((item) => Number(item.usuarios_id_usuario) > 0 || String(item.id_ponto || '').startsWith('temp_'))).toBe(true);

        await navegar(page, 'jogos', { id_jogo: fixture.idJogo, origem: 'agenda_edit' });
        await expect(page.locator('#placar-conteudo')).toBeVisible();
        await expect(page.locator('.score-number').first()).toHaveText('2');
        expect((await lerPlacarLocal(page, fixture.idJogo))[0]).toBe(2);

        await context.setOffline(false);
        await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(true);
        await expect.poll(() => page.evaluate(() => window.SGIOffline.getState().pending), { timeout: 45_000 }).toBe(0);

        const servidor = await page.evaluate(async (id) => {
            const response = await fetch(`/api/v1/partidas?id_jogo=${id}`);
            return response.json();
        }, fixture.idJogo);
        const resultados = servidor.map((item) => Number(item.resultado_partida));
        expect(resultados[0]).toBe(2);

        await page.evaluate(() => {
            window.__SGI_FETCH_ORIGINAL__ = window.fetch;
            window.fetch = function (input, init) {
                const method = String((init && init.method) || 'GET').toUpperCase();
                const url = String(input && input.url ? input.url : input);
                if (method === 'POST' && url.includes('/api/v1/pontos')) {
                    return Promise.reject(new Error('Falha de rede simulada'));
                }
                return window.__SGI_FETCH_ORIGINAL__.call(this, input, init);
            };
        });
        await page.locator('.btn-score-plus').first().click();
        const artilheiroFinal = page.locator('#modalArtilheiro');
        await expect(artilheiroFinal).toBeVisible();
        await expect.poll(() => artilheiroFinal.locator('#selectAlunoArtilheiro option').count()).toBeGreaterThan(1);
        await artilheiroFinal.locator('#selectAlunoArtilheiro').selectOption({ index: 1 });
        await artilheiroFinal.locator('#btnSalvarArtilheiro').click();
        await expect(artilheiroFinal.locator('#msgArtilheiro')).toContainText('Erro de conexão');
        await expect(artilheiroFinal).toBeVisible();
        await page.evaluate(() => {
            window.fetch = window.__SGI_FETCH_ORIGINAL__;
            delete window.__SGI_FETCH_ORIGINAL__;
        });
    });
});
