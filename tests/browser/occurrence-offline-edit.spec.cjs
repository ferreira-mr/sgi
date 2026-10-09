const { test, expect } = require('./fixtures.cjs');
const {
    buscarPrimeiroJogoPlanejado,
    garantirCronogramaPublicado,
    garantirOperacaoLiberada,
} = require('./cronograma-fixture-helper.cjs');

async function jsonOrThrow(response, label) {
    if (!response.ok()) throw new Error(`${label}: HTTP ${response.status()} ${await response.text()}`);
    return response.json();
}

async function criarFixture(request) {
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
    if (!edicao) throw new Error('Nenhuma edição ativa disponível.');
    let idInterclasse = Number(edicao.id_interclasse);
    const cronograma = await garantirCronogramaPublicado(request, idInterclasse);
    idInterclasse = Number(cronograma.id_interclasse || idInterclasse);
    const [equipes, modalidades] = await Promise.all([
        request.get(api(`api/v1/equipes?id_interclasse=${idInterclasse}`)).then((response) => jsonOrThrow(response, 'equipes')),
        request.get(api(`api/v1/modalidades?id_interclasse=${idInterclasse}`)).then((response) => jsonOrThrow(response, 'modalidades')),
    ]);
    await garantirOperacaoLiberada(request, idInterclasse);
    const modalidadesColetivas = modalidades.filter((item) =>
        String(item.status_modalidade) === '1' &&
        String(item.nome_tipo_modalidade || '').toLowerCase().includes('mata')
    );
    if (modalidadesColetivas.length === 0) throw new Error('Nenhuma modalidade mata-mata disponível.');
    const planejado = await buscarPrimeiroJogoPlanejado(request, modalidadesColetivas);
    const modalidade = modalidades.find((item) =>
        Number(item.id_modalidade) === Number(planejado.jogo.modalidades_id_modalidade)
    );
    const equipesDaModalidade = equipes.filter((item) =>
        String(item.modalidades_id_modalidade) === String(modalidade?.id_modalidade)
    );
    if (equipesDaModalidade.length < 2) throw new Error('O fixture precisa de duas equipes.');
    const jogoAgendado = planejado.jogo;
    const idJogo = Number(jogoAgendado.id_jogo);
    const equipeDoJogo = equipesDaModalidade.find((item) =>
        Number(item.id_equipe) === Number(planejado.partidas[0].equipes_id_equipe)
    );
    if (!equipeDoJogo) throw new Error('O jogo planejado possui equipe fora da modalidade do fixture.');
    const turma = Number(equipeDoJogo.turmas_id_turma);
    const atletas = await jsonOrThrow(
        await request.get(api(`api/v1/ocorrencias?acao=listar_atletas&id_jogo=${idJogo}&id_turma=${turma}`)),
        'atletas do jogo',
    );
    const atleta = atletas.atletas && atletas.atletas[0];
    if (!atleta) throw new Error(`O fixture não encontrou um atleta para o jogo planejado: ${JSON.stringify(atletas)}`);
    const dataOcorrencia = String(jogoAgendado.data_jogo);
    const criarOcorrencia = (descricao, data) => request.post(api('api/v1/ocorrencias'), {
        data: {
            titulo_ocorrencia: 'Amarelo',
            descricao_ocorrencia: descricao,
            data_ocorrencia: data,
            usuarios_id_usuario: Number(atleta.id_usuario),
            id_jogo: idJogo,
            id_turma: turma,
            penalidade: 2,
        },
    }).then((response) => jsonOrThrow(response, `criação da ocorrência ${descricao}`));
    const primeira = await criarOcorrencia('T11 ocorrência que não deve abrir', dataOcorrencia);
    const segunda = await criarOcorrencia('T11 ocorrência alvo da edição', dataOcorrencia);
    return {
        idJogo,
        idTurma: turma,
        idAtleta: Number(atleta.id_usuario),
        dataOcorrencia,
        idOcorrenciaAlvo: Number(segunda.id),
        primeiraId: Number(primeira.id),
    };
}

test.describe('Mesário — edição da ocorrência correta offline', () => {
test('busca por ID, abre a segunda ocorrência e edita a mesma ocorrência offline', async ({ page, context, request }) => {
        test.setTimeout(180_000);
        const fixture = await criarFixture(request);

        await page.goto('login', { waitUntil: 'domcontentloaded' });
        await page.locator('#form_desktop .ipt-matricula').fill('mesario');
        await page.locator('#form_desktop .ipt-senha').fill('123');
        await page.locator('#form_desktop button[type="submit"]').click();
        await page.waitForURL(/\/painel\?id=\d+/, { waitUntil: 'domcontentloaded' });
        await page.evaluate(({ id }) => window.__SGI_SPA__.navegarPara('jogos', { id_jogo: id, origem: 'agenda_edit' }), { id: fixture.idJogo });
        await expect(page.locator('#placar-conteudo')).toBeVisible();
        await page.getByRole('button', { name: /Iniciar jogo/i }).click();
        await expect(page.locator('#mc-status-badge')).toContainText('Em andamento');
        await expect(page.locator('#lista-ocorrencias')).toContainText('T11 ocorrência alvo da edição');

        await context.setOffline(true);
        await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
        await page.evaluate((id) => window.editarOcorrencia(id), fixture.idOcorrenciaAlvo);
        await expect(page.locator('#modalOcorrencia')).toBeVisible();
        await expect(page.locator('#descricaoOcorrencia')).toHaveValue('T11 ocorrência alvo da edição');

        await page.locator('#descricaoOcorrencia').fill('T11 ocorrência alvo editada offline');
        await page.locator('#btnSalvarOcorrencia').click();
        await expect(page.locator('#msgOcorrencia')).toContainText('atualizada');
        await expect.poll(async () => page.evaluate((id) => window.SGIDataLayer.read('ocorrencias').then((rows) => {
            const row = rows.find((item) => String(item.id_ocorrencia) === String(id));
            return row ? row.descricao_ocorrencia : '';
        }), fixture.idOcorrenciaAlvo)).toContain('T11 ocorrência alvo editada offline');

        await context.setOffline(false);
        await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(true);
        await expect.poll(() => page.evaluate(() => window.SGIOffline.getState()), { timeout: 30_000 })
            .toMatchObject({ pending: 0 });

        const servidor = await page.evaluate(async ({ alvo, primeira }) => {
            const ler = async (id) => {
                const resposta = await fetch('/api/v1/ocorrencias?id_ocorrencia=' + encodeURIComponent(id));
                if (!resposta.ok) throw new Error(`consulta final: HTTP ${resposta.status}`);
                return resposta.json();
            };
            return { alvo: await ler(alvo), primeira: await ler(primeira) };
        }, { alvo: fixture.idOcorrenciaAlvo, primeira: fixture.primeiraId });
        expect(servidor.alvo).toHaveLength(1);
        expect(servidor.alvo[0].descricao_ocorrencia).toContain('T11 ocorrência alvo editada offline');
        expect(servidor.primeira).toHaveLength(1);
        expect(servidor.primeira[0].descricao_ocorrencia).toContain('T11 ocorrência que não deve abrir');

        await context.setOffline(true);
        await page.evaluate(async (dados) => {
            await fetch('/api/v1/ocorrencias', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    titulo_ocorrencia: 'Amarelo',
                    descricao_ocorrencia: 'T11 ocorrência temporária criada offline',
                    data_ocorrencia: dados.dataOcorrencia,
                    usuarios_id_usuario: dados.idAtleta,
                    id_jogo: dados.idJogo,
                    id_turma: dados.idTurma,
                    penalidade: 2,
                }),
            });
        }, fixture);
        await expect.poll(() => page.evaluate(() => window.SGIDataLayer.read('ocorrencias').then((rows) => {
            const row = rows.find((item) => /T11 ocorrência temporária criada offline/.test(item.descricao_ocorrencia || ''));
            return row ? row.id_ocorrencia : null;
        }))).toMatch(/temp_/);
        const temporaria = await page.evaluate(() => window.SGIDataLayer.read('ocorrencias').then((rows) => {
            const row = rows.find((item) => /T11 ocorrência temporária criada offline/.test(item.descricao_ocorrencia || ''));
            return row && row.id_ocorrencia;
        }));
        await page.evaluate((id) => window.editarOcorrencia(id), temporaria);
        await expect(page.locator('#modalOcorrencia')).toBeVisible();
        await page.locator('#descricaoOcorrencia').fill('T11 ocorrência temporária editada antes da sincronização');
        await page.locator('#btnSalvarOcorrencia').click();
        await expect(page.locator('#msgOcorrencia')).toContainText('atualizada');
        const fila = await page.evaluate(() => window.SGIOffline.getPendingList().then((items) => items.map((item) => ({
            method: item.method,
            body: item.body,
            dependsOn: item.dependsOn || null,
        }))));
        expect(fila.filter((item) => item.method === 'POST').length).toBeGreaterThan(0);
        const edicaoTemporaria = fila.find((item) => item.method === 'PUT' && item.dependsOn);
        expect(edicaoTemporaria).toBeTruthy();
        expect(JSON.parse(edicaoTemporaria.body).id_ocorrencia).toBe(temporaria);
        expect(edicaoTemporaria.dependsOn.tempId).toBe(temporaria);

        await context.setOffline(false);
        await expect.poll(() => page.evaluate(() => window.SGIOffline.getState()), { timeout: 30_000 })
            .toMatchObject({ pending: 0 });
        const temporariasServidor = await page.evaluate(async (id) => {
            const resposta = await fetch('/api/v1/ocorrencias?id_jogo=' + encodeURIComponent(id));
            return resposta.json();
        }, fixture.idJogo);
        const criadas = temporariasServidor.filter((item) => /T11 ocorrência temporária editada antes da sincronização/.test(item.descricao_ocorrencia || ''));
        expect(criadas).toHaveLength(1);

        const inativacao = await page.evaluate(async (id) => {
            const resposta = await fetch('/api/v1/ocorrencias', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_ocorrencia: id, status_ocorrencia: '0' }),
            });
            return { status: resposta.status, body: await resposta.json() };
        }, fixture.primeiraId);
        expect(inativacao.status).toBe(200);
        expect(inativacao.body.success).toBe(true);
        const filtrosStatus = await page.evaluate(async (id) => {
            const ler = async (status) => {
                const resposta = await fetch('/api/v1/ocorrencias?id_ocorrencia=' + encodeURIComponent(id) + '&status_ocorrencia=' + status);
                return resposta.json();
            };
            return { ativa: await ler('1'), inativa: await ler('0') };
        }, fixture.primeiraId);
        expect(filtrosStatus.ativa).toHaveLength(0);
        expect(filtrosStatus.inativa).toHaveLength(1);
    });
});
