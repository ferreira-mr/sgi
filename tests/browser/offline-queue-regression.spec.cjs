const { test, expect } = require('@playwright/test');
const path = require('node:path');

// Exercita o IndexedDB real sem depender de fixtures ou alterar o banco SQL.
test.beforeEach(async ({ page }) => {
    await page.route('https://offline.sgi.test/**', route => route.fulfill({
        contentType: 'text/html', body: '<html><body></body></html>',
    }));
    await page.goto('https://offline.sgi.test/');
    await page.evaluate(() => {
        window.SGI_CACHE_KEY = 'queue-audit';
        window.SGI_SESSION_ID = '7';
    });
    await page.addScriptTag({ path: path.resolve(__dirname, '../../resources/js/offline/offline-core.js') });
    await page.route('**/api/v1/health', route => route.fulfill({
        json: { success: true, status: 'ok', service: 'sgi' },
    }));
    await page.route('**/api/v1/session', route => route.fulfill({
        json: { success: true, usuario: { id: 7, nivel: 2 } },
    }));
    await page.evaluate(() => window.SGIOffline.getPendingList());
});

test('troca de senha não entra na fila nem é importada ou reenviada como mutação offline', async ({ page }) => {
    const enviados = [];
    await page.route('**/api/v1/senha', route => {
        enviados.push(route.request().postData());
        return route.fulfill({ status: 403, json: { success: false, message: 'Conecte-se para continuar.' } });
    });

    const resultado = await page.evaluate(async () => {
        window.SGI_BASE_PATH = '/sgi';
        const endpoint = `${location.origin}/sgi/api/v1/senha`;
        const segredo = 'Senha-que-nao-pode-ser-enfileirada';
        const headers = { 'Content-Type': 'application/json' };
        let directQueueRejected = false;
        let importRejected = false;

        try {
            await SGIOffline.queueMutation('POST', endpoint, JSON.stringify({ nova_senha: segredo }), headers);
        } catch (error) {
            directQueueRejected = /não pode ser armazenada offline/i.test(error.message);
        }

        try {
            await SGIOffline.importPending(JSON.stringify({
                schemaVersion: 1,
                items: [{
                    method: 'POST',
                    url: endpoint,
                    body: JSON.stringify({ nova_senha: segredo }),
                    headers: { 'X-SGI-Mutation-Id': 'queue-audit-import' },
                }],
            }));
        } catch (error) {
            importRejected = /não podem conter troca de senha/i.test(error.message);
        }

        const countBeforeRequest = (await SGIOffline.getPendingList()).length;
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
        let fetchStatus = 0;
        try {
            // O Fetch API aceita URL como objeto, além de string e Request.
            const response = await fetch(new URL(endpoint), {
                method: 'POST',
                headers,
                body: JSON.stringify({ nova_senha: segredo }),
            });
            fetchStatus = response.status;
        } finally {
            Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
        }

        // Simule uma linha gravada por um cliente antigo. O carregamento/sync
        // deve descartá-la antes de enviar ou expor o corpo no export.
        const database = await new Promise((resolve, reject) => {
            const opening = indexedDB.open('sgi_offline');
            opening.onsuccess = () => resolve(opening.result);
            opening.onerror = () => reject(opening.error);
        });
        await new Promise((resolve, reject) => {
            const transaction = database.transaction('mutation_queue', 'readwrite');
            transaction.objectStore('mutation_queue').add({
                method: 'POST',
                url: endpoint,
                body: JSON.stringify({ nova_senha: 'segredo-legado' }),
                headers: {},
                session: 'queue-audit',
            });
            transaction.oncomplete = resolve;
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
        database.close();

        const sync = await SGIOffline.syncNow();
        const pending = await SGIOffline.getPendingList();
        const exported = await SGIOffline.exportPending();
        return { directQueueRejected, importRejected, countBeforeRequest, fetchStatus, sync, pending, exported };
    });

    expect(resultado.directQueueRejected).toBe(true);
    expect(resultado.importRejected).toBe(true);
    expect(resultado.countBeforeRequest).toBe(0);
    expect(resultado.fetchStatus).toBe(403);
    expect(resultado.sync.synced).toBe(0);
    expect(resultado.pending).toEqual([]);
    expect(resultado.exported.items).toEqual([]);
    expect(enviados).toEqual([JSON.stringify({ nova_senha: 'Senha-que-nao-pode-ser-enfileirada' })]);
});

test('alteração nova respeita a fila ainda pendente após reconexão', async ({ page }) => {
    const enviados = [];
    await page.route('**/api/v1/partidas', route => {
        enviados.push(route.request().postDataJSON().resultado_partida);
        return route.fulfill({ json: { success: true } });
    });
    await page.evaluate(async () => {
        const url = '/api/v1/partidas';
        const headers = { 'Content-Type': 'application/json' };
        await SGIOffline.queueMutation('PUT', url, JSON.stringify({ id_partida: 1, resultado_partida: 1 }), headers);
        await fetch(url, { method: 'PUT', headers, body: JSON.stringify({ id_partida: 1, resultado_partida: 2 }) });
        await SGIOffline.syncNow();
    });
    expect(enviados).toEqual([1, 2]);
});

test('Request com corpo é preservado na fila offline e no reenvio', async ({ page }) => {
    const enviados = [];
    await page.route('**/api/v1/partidas', route => {
        enviados.push({
            body: route.request().postData(),
            mutationId: route.request().headers()['x-sgi-mutation-id'],
        });
        return route.fulfill({ json: { success: true } });
    });

    const resultado = await page.evaluate(async () => {
        const body = JSON.stringify({ id_partida: 12, resultado_partida: 4 });
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
        try {
            await fetch(new Request('/api/v1/partidas', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body,
            }));
            const fila = await SGIOffline.getPendingList();
            Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
            await SGIOffline.syncNow();
            return {
                body,
                queuedBody: fila[0] && fila[0].body,
                mutationId: fila[0] && fila[0].headers['X-SGI-Mutation-Id'],
                remaining: await SGIOffline.getPendingList(),
            };
        } finally {
            Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
        }
    });

    expect(resultado.queuedBody).toBe(resultado.body);
    expect(resultado.remaining).toEqual([]);
    expect(enviados).toEqual([{
        body: resultado.body,
        mutationId: resultado.mutationId,
    }]);
});

test('Request sem corpo e init.body explícito mantêm a semântica da fila', async ({ page }) => {
    const enviados = [];
    await page.route('**/api/v1/partidas', route => {
        enviados.push(route.request().postData());
        return route.fulfill({ json: { success: true } });
    });

    const resultado = await page.evaluate(async () => {
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
        try {
            await fetch(new Request('/api/v1/partidas', { method: 'POST' }));
            await fetch(new Request('/api/v1/partidas', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_partida: 13, resultado_partida: 1 }),
            }), {
                body: JSON.stringify({ id_partida: 13, resultado_partida: 5 }),
            });
            await fetch(new Request('/api/v1/partidas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_partida: 13, resultado_partida: 6 }),
            }), { body: null });
            await fetch(new Request('/api/v1/partidas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_partida: 13, resultado_partida: 7 }),
            }), { body: undefined });
            const fila = await SGIOffline.getPendingList();
            Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
            await SGIOffline.syncNow();
            return { bodies: fila.map((item) => item.body), remaining: await SGIOffline.getPendingList() };
        } finally {
            Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
        }
    });

    expect(resultado.bodies).toEqual([
        null,
        JSON.stringify({ id_partida: 13, resultado_partida: 5 }),
        JSON.stringify({ id_partida: 13, resultado_partida: 6 }),
        JSON.stringify({ id_partida: 13, resultado_partida: 7 }),
    ]);
    expect(resultado.remaining).toEqual([]);
    expect(enviados).toEqual(resultado.bodies);
});

test('Request com corpo online chega intacto ao transporte original', async ({ page }) => {
    const enviados = [];
    await page.route('**/api/v1/partidas', route => {
        enviados.push(route.request().postData());
        return route.fulfill({ json: { success: true } });
    });

    const resultado = await page.evaluate(async () => {
        const body = JSON.stringify({ id_partida: 14, resultado_partida: 2 });
        const request = new Request('/api/v1/partidas', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body,
        });
        const response = await fetch(request);
        return { ok: response.ok, pending: await SGIOffline.getPendingList() };
    });

    expect(resultado.ok).toBe(true);
    expect(resultado.pending).toEqual([]);
    expect(enviados).toEqual([JSON.stringify({ id_partida: 14, resultado_partida: 2 })]);
});

test('Request com jogo temporário é enfileirado com o ID negativo preservado', async ({ page }) => {
    const enviados = [];
    await page.route('**/api/v1/resultados', route => {
        enviados.push(route.request().postDataJSON());
        return route.fulfill({ json: { success: true } });
    });

    const resultado = await page.evaluate(async () => {
        const body = '{"id_jogo": -101, "id_modalidade": 1}';
        const resposta = await fetch(new Request('/api/v1/resultados', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
        }));
        const fila = await SGIOffline.getPendingList();
        return { status: resposta.status, body, fila };
    });

    expect(resultado.status).toBe(200);
    expect(resultado.fila).toHaveLength(1);
    expect(resultado.fila[0].body).toBe(resultado.body);
    expect(resultado.fila[0].needsReview).toBe(false);
    expect(enviados).toEqual([]);
});

test('falha QuotaExceededError na projeção mantém fila e retoma projeção antes do envio', async ({ page }) => {
    let enviouAposRetomada = false;
    await page.addScriptTag({ path: path.resolve(__dirname, '../../resources/js/offline/mesario-data.js') });
    await page.route('**/api/v1/partidas', async route => {
        enviouAposRetomada = await page.evaluate(() => window.__sgiProjectionResumed === true);
        return route.fulfill({ json: { success: true } });
    });

    const resultado = await page.evaluate(async () => {
        const originalPut = IDBObjectStore.prototype.put;
        let falhasQuota = 0;
        window.__sgiProjectionResumed = false;
        IDBObjectStore.prototype.put = function (...args) {
            if (this.transaction.db.name === 'sgi_mesario_dados' && this.name === 'partidas') {
                if (falhasQuota === 0) {
                    falhasQuota += 1;
                    throw new DOMException('Quota de teste excedida.', 'QuotaExceededError');
                }
                const transacao = this.transaction;
                transacao.addEventListener('complete', () => { window.__sgiProjectionResumed = true; });
            }
            return originalPut.apply(this, args);
        };

        let antes;
        let sync;
        let restantes;
        try {
            await SGIOffline.queueMutation('PUT', '/api/v1/partidas', JSON.stringify({
                id_partida: 81,
                resultado_partida: 3,
            }), { 'Content-Type': 'application/json' });
            const fila = await SGIOffline.getPendingList();
            antes = {
                falhasQuota,
                body: fila[0] && fila[0].body,
                id: fila[0] && fila[0].id,
                projectionPending: fila[0] && fila[0].projectionPending,
                projectionError: fila[0] && fila[0].projectionError,
            };
            sync = await SGIOffline.syncNow();
            restantes = await SGIOffline.getPendingList();
        } finally {
            IDBObjectStore.prototype.put = originalPut;
        }
        return {
            antes,
            retomada: window.__sgiProjectionResumed,
            restantes,
            sync,
        };
    });

    expect(resultado.antes.falhasQuota).toBe(1);
    expect(resultado.antes.id).toBeGreaterThan(0);
    expect(resultado.antes.body).toBe(JSON.stringify({ id_partida: 81, resultado_partida: 3 }));
    expect(resultado.antes.projectionPending).toBe(true);
    expect(resultado.antes.projectionError).toContain('Quota de teste excedida.');
    expect(enviouAposRetomada).toBe(true);
    expect(resultado.retomada).toBe(true);
    expect(resultado.restantes).toEqual([]);
});

test('troca de sessão antes de syncNow mantém fila sem enviar POST', async ({ page }) => {
    let posts = 0;
    let consultasSessao = 0;
    let idOperador = 7;
    await page.route('**/api/v1/session', route => {
        consultasSessao += 1;
        return route.fulfill({ json: { success: true, usuario: { id: idOperador, nivel: 2 } } });
    });
    await page.route('**/api/v1/partidas', route => {
        posts += 1;
        return route.fulfill({ json: { success: true } });
    });

    const preparado = await page.evaluate(async () => {
        const acesso = await SGIOffline.checkAccess(true);
        await SGIOffline.queueMutation('PUT', '/api/v1/partidas', JSON.stringify({
            id_partida: 82,
            resultado_partida: 4,
        }), { 'Content-Type': 'application/json' });
        return { acesso, fila: await SGIOffline.getPendingList() };
    });
    expect(preparado.acesso).toBe(true);
    expect(preparado.fila).toHaveLength(1);

    idOperador = 8;
    const resultado = await page.evaluate(async () => {
        const sync = await SGIOffline.syncNow();
        return { sync, fila: await SGIOffline.getPendingList() };
    });

    expect(consultasSessao).toBeGreaterThan(1);
    expect(posts).toBe(0);
    expect(resultado.sync.blocked).toBe(true);
    expect(resultado.fila).toHaveLength(1);
    expect(resultado.fila[0].body).toBe(JSON.stringify({ id_partida: 82, resultado_partida: 4 }));
    expect(resultado.fila[0].needsReview).toBe(false);
});

test('sessão expirada encaminha para login sem perder a fila', async ({ page }) => {
    await page.route('**/api/v1/session', route => route.fulfill({
        status: 401,
        json: { success: false, message: 'Sessão expirada' },
    }));

    const resultado = await page.evaluate(async () => {
        await SGIOffline.queueMutation('PUT', '/api/v1/partidas', JSON.stringify({
            id_partida: 83,
            resultado_partida: 2,
        }), { 'Content-Type': 'application/json' });
        await SGIOffline.checkAccess(true);
        const botao = document.querySelector('.sgi-offline-banner-btn');
        const antes = {
            texto: botao && botao.textContent,
            disabled: botao && botao.disabled,
            fila: await SGIOffline.getPendingList(),
        };
        botao.click();
        return {
            antes,
            retorno: JSON.parse(window.sessionStorage.getItem('sgi-offline-reauth-v1')),
        };
    });

    expect(resultado.antes.texto).toBe('Atualizar acesso');
    expect(resultado.antes.disabled).toBe(false);
    expect(resultado.antes.fila).toHaveLength(1);
    expect(resultado.retorno).toMatchObject({ userId: '7', path: '/' });
    await page.waitForURL('**/login');
});

test('403 de gate do primeiro acesso não é tratado como sessão expirada', async ({ page }) => {
    await page.route('**/api/v1/session', route => route.fulfill({
        status: 403,
        json: {
            success: false,
            message: 'Aceite os termos de responsabilidade para continuar.',
            redirect: '/aluno/termos',
        },
    }));

    const resultado = await page.evaluate(async () => {
        const ok = await SGIOffline.checkAccess(true);
        const banner = document.querySelector('#sgi-offline-banner');
        const state = SGIOffline.getState();

        return {
            ok,
            session: state.session,
            server: state.server,
            bannerVisible: Boolean(banner && !banner.classList.contains('d-none') && !banner.classList.contains('sgi-hidden')),
            bannerText: banner ? banner.textContent : '',
        };
    });

    expect(resultado.ok).toBe(false);
    expect(resultado.session).toBe('bloqueada');
    expect(resultado.server).toBe('acessivel');
    expect(resultado.bannerVisible).toBe(false);
    expect(resultado.bannerText).not.toContain('SESSÃO EXPIRADA');
});

for (const body of ['<html>Servidor em manutenção</html>', '', '{"success":', '{}', '{"status":"erro","mensagem":"Dados inválidos"}']) {
    test(`resposta sem confirmação JSON conserva a mutação: ${JSON.stringify(body)}`, async ({ page }) => {
        await page.route('**/api/v1/resultados', route => route.fulfill({ status: 200, body }));
        const resultado = await page.evaluate(async () => {
            await SGIOffline.queueMutation('POST', '/api/v1/resultados', '{"id_jogo":1}', {});
            await SGIOffline.syncNow();
            return SGIOffline.getPendingList();
        });
        expect(resultado).toHaveLength(1);
        expect(resultado[0].needsReview).toBe(true);
    });
}

test('falha de rede mantém a mutação e o retry reutiliza a mesma identidade', async ({ page }) => {
    const tentativas = [];
    await page.route('**/api/v1/partidas', async route => {
        const requisicao = route.request();
        const headers = requisicao.headers();
        tentativas.push({
            body: requisicao.postData(),
            mutationId: headers['x-sgi-mutation-id'],
        });
        if (tentativas.length === 1) {
            await route.abort('failed');
            return;
        }
        await route.fulfill({ json: { success: true } });
    });

    const falha = await page.evaluate(async () => {
        await SGIOffline.queueMutation('PUT', '/api/v1/partidas', JSON.stringify({
            id_partida: 84,
            resultado_partida: 3,
        }), { 'Content-Type': 'application/json' });
        const sync = await SGIOffline.syncNow();
        return { sync, fila: await SGIOffline.getPendingList() };
    });

    expect(falha.sync.failed).toBe(1);
    expect(falha.fila).toHaveLength(1);
    expect(falha.fila[0].tries).toBe(1);
    expect(falha.fila[0].needsReview).toBe(false);
    expect(falha.fila[0].retryable).toBe(true);

    const retry = await page.evaluate(() => SGIOffline.syncNow());
    expect(retry.synced).toBe(1);
    expect(await page.evaluate(() => SGIOffline.getPendingList())).toEqual([]);
    expect(tentativas).toHaveLength(2);
    expect(tentativas[0].body).toBe(JSON.stringify({ id_partida: 84, resultado_partida: 3 }));
    expect(tentativas[1]).toEqual(tentativas[0]);
});

test('confirmação no formato status sucesso continua compatível', async ({ page }) => {
    await page.route('**/api/v1/usuarios', route => route.fulfill({ json: { status: 'sucesso' } }));
    const fila = await page.evaluate(async () => {
        await SGIOffline.queueMutation('PUT', '/api/v1/usuarios', '{"id_usuario":1}', {});
        await SGIOffline.syncNow();
        return SGIOffline.getPendingList();
    });
    expect(fila).toEqual([]);
});

test('edição de ocorrência temporária resolve o ID nas rotas v1', async ({ page }) => {
    const enviados = [];
    await page.route('**/api/v1/ocorrencias', route => {
        enviados.push(route.request().postDataJSON());
        return route.fulfill({ json: { success: true, id: 321 } });
    });
    await page.evaluate(async () => {
        const url = '/api/v1/ocorrencias';
        const item = await SGIOffline.queueMutation('POST', url, '{"descricao_ocorrencia":"original"}', {});
        await SGIOffline.queueMutation('PUT', url, JSON.stringify({ id_ocorrencia: 'temp_' + item.id, descricao_ocorrencia: 'editada' }), {});
        await SGIOffline.syncNow();
    });
    expect(enviados).toHaveLength(2);
    expect(enviados[1].id_ocorrencia).toBe(321);
});

test('jogos temporários intercalados enviam resultado antes de seus pontos vinculados', async ({ page }) => {
    const enviados = [];
    await page.route('**/api/v1/*', route => {
        const requisicao = route.request();
        const url = new URL(requisicao.url());
        if (requisicao.method() === 'GET' && url.pathname.endsWith('/health')) {
            return route.fulfill({ json: { success: true, status: 'ok', service: 'sgi' } });
        }
        if (requisicao.method() === 'GET' && url.pathname.endsWith('/session')) {
            return route.fulfill({ json: { success: true, usuario: { id: 7, nivel: 2 } } });
        }
        const dados = requisicao.postDataJSON() || {};
        enviados.push(`${url.pathname.split('/').pop()}:${dados.id_jogo || dados.jogos_id_jogo}`);
        return route.fulfill({ json: { success: true } });
    });
    await page.evaluate(async () => {
        for (const id of [-1, -2]) {
            await SGIOffline.queueMutation('POST', '/api/v1/pontos', JSON.stringify({
                jogos_id_jogo: id,
                id_modalidade: 1,
                id_equipe: 10,
                usuarios_id_usuario: 20,
                chave_jogada: 'offline-queue-point-' + Math.abs(id),
            }), {});
        }
        for (const id of [-1, -2]) {
            await SGIOffline.queueMutation('POST', '/api/v1/resultados', JSON.stringify({ id_jogo: id, id_modalidade: 1 }), {});
        }
        await SGIOffline.syncNow();
    });
    for (const id of [-1, -2]) {
        expect(enviados.indexOf(`resultados:${id}`)).toBeLessThan(enviados.indexOf(`pontos:${id}`));
    }
});

test('aborto da transação local não anuncia salvamento nem projeta dados', async ({ page }) => {
    const resultado = await page.evaluate(async () => {
        let projecoes = 0;
        window.SGIDataLayer = { onQueued: () => { projecoes += 1; } };
        const add = IDBObjectStore.prototype.add;
        IDBObjectStore.prototype.add = function (...args) {
            const req = add.apply(this, args);
            if (this.name === 'mutation_queue') req.addEventListener('success', () => this.transaction.abort());
            return req;
        };
        let rejeitada = false;
        try { await SGIOffline.queueMutation('PUT', '/api/v1/partidas', '{"id_partida":1}', {}); }
        catch (_) { rejeitada = true; }
        return { rejeitada, projecoes, fila: await SGIOffline.getPendingList() };
    });
    expect(resultado).toEqual({ rejeitada: true, projecoes: 0, fila: [] });
});

test('chaveamento aplica resultado pendente enviado pela rota v1', async ({ page }) => {
    await page.route('**/api/v1/chaveamentos?*', route => route.fulfill({ json: { success: true, jogos: [{
        id_jogo: 7, nome_jogo: 'MM:2:0:N', status_jogo: 'Iniciado',
        equipes: [{ id_equipe: 1, gols: 0 }, { id_equipe: 2, gols: 0 }],
    }] } }));
    await page.addScriptTag({ path: path.resolve(__dirname, '../../resources/js/offline/chaveamento-engine.js') });
    const jogo = await page.evaluate(async () => {
        await SGIOffline.queueMutation('POST', '/api/v1/resultados', JSON.stringify({
            id_jogo: 7, resultados: [{ id_equipe: 1, gols: 2 }, { id_equipe: 2, gols: 1 }],
        }), {});
        const arvore = await SGIChaveamento.carregarArvore(1);
        return arvore.jogos.find(j => j.id_jogo === 7);
    });
    expect(jogo.status_jogo).toBe('Concluido');
    expect(jogo.equipe_vencedora_id).toBe(1);
});

test('distingue servidor SGI acessível de navegador conectado', async ({ page }) => {
    let disponivel = true;
    await page.route('**/api/v1/health', route => {
        if (!disponivel) return route.fulfill({ status: 200, contentType: 'text/html', body: '<html>login</html>' });
        return route.fulfill({ json: { success: true, status: 'ok', service: 'sgi' } });
    });
    expect(await page.evaluate(() => SGIOffline.checkServer(true))).toBe(true);
    expect(await page.evaluate(() => SGIOffline.getState().server)).toBe('acessivel');
    disponivel = false;
    expect(await page.evaluate(() => SGIOffline.checkServer(true))).toBe(false);
    expect(await page.evaluate(() => SGIOffline.getState().server)).toBe('indisponivel');
});

test('separa servidor acessível de sessão expirada', async ({ page }) => {
    let sessaoValida = true;
    await page.route('**/api/v1/health', route => route.fulfill({
        json: { success: true, status: 'ok', service: 'sgi' },
    }));
    await page.route('**/api/v1/session', route => sessaoValida
        ? route.fulfill({ json: { success: true, usuario: { id: 7, nivel: 2 } } })
        : route.fulfill({ status: 401, json: { success: false, message: 'Sessão expirada' } }));
    expect(await page.evaluate(() => SGIOffline.checkAccess(true))).toBe(true);
    expect(await page.evaluate(() => SGIOffline.getState().session)).toBe('valida');
    sessaoValida = false;
    expect(await page.evaluate(() => SGIOffline.checkAccess(true))).toBe(false);
    expect(await page.evaluate(() => SGIOffline.getState().server)).toBe('sessao');
});

test('falha de GET entra em soft-offline e exibe o estado no banner', async ({ page }) => {
    await page.route('**/api/consulta-offline', route => route.abort());
    const estado = await page.evaluate(async () => {
        try { await fetch('/api/consulta-offline'); } catch (_) {}
        return {
            softOffline: SGIOffline.getState().softOffline,
            bannerOculto: document.getElementById('sgi-offline-banner').classList.contains('sgi-hidden'),
        };
    });
    expect(estado.softOffline).toBe(true);
    expect(estado.bannerOculto).toBe(false);
});

test('duas abas do mesmo operador não sincronizam a fila simultaneamente', async ({ page, context }) => {
    const enviados = [];
    const responder = async route => {
        enviados.push(route.request().postDataJSON().resultado_partida);
        await new Promise(resolve => setTimeout(resolve, 120));
        await route.fulfill({ json: { success: true } });
    };
    await page.route('**/api/v1/partidas', responder);
    const segundaAba = await context.newPage();
    await segundaAba.route('https://offline.sgi.test/**', route => route.fulfill({
        contentType: 'text/html', body: '<html><body></body></html>',
    }));
    await segundaAba.goto('https://offline.sgi.test/');
    await segundaAba.evaluate(() => {
        window.SGI_CACHE_KEY = 'queue-audit';
        window.SGI_SESSION_ID = '7';
    });
    await segundaAba.addScriptTag({ path: path.resolve(__dirname, '../../resources/js/offline/offline-core.js') });
    await segundaAba.route('**/api/v1/health', route => route.fulfill({
        json: { success: true, status: 'ok', service: 'sgi' },
    }));
    await segundaAba.route('**/api/v1/session', route => route.fulfill({
        json: { success: true, usuario: { id: 7, nivel: 2 } },
    }));
    await segundaAba.route('**/api/v1/partidas', responder);
    await page.evaluate(() => SGIOffline.queueMutation('PUT', '/api/v1/partidas', JSON.stringify({ id_partida: 9, resultado_partida: 3 }), {}));
    const resultados = await Promise.all([
        page.evaluate(() => SGIOffline.syncNow()),
        segundaAba.evaluate(() => SGIOffline.syncNow()),
    ]);
    expect(enviados).toEqual([3]);
    expect(resultados.some((item) => item.busy === true)).toBe(true);
});

test('exportação de pendências remove identificador local e credencial CSRF', async ({ page }) => {
    const exportado = await page.evaluate(async () => {
        await SGIOffline.queueMutation('POST', '/api/v1/resultados', '{"id_jogo":11}', {
            'Content-Type': 'application/json',
            'X-SGI-CSRF': 'segredo-de-teste',
        });
        return SGIOffline.exportPending();
    });
    expect(exportado.schemaVersion).toBe(1);
    expect(exportado.items).toHaveLength(1);
    expect(exportado.items[0].id).toBeUndefined();
    expect(exportado.items[0].session).toBeUndefined();
    expect(exportado.items[0].headers['X-SGI-CSRF']).toBeUndefined();
    expect(exportado.items[0].headers['X-SGI-Mutation-Id']).toMatch(/^queue-audit-/);
});

test('importação de pendências é idempotente e rejeita outra sessão', async ({ page }) => {
    const resultado = await page.evaluate(async () => {
        const item = await SGIOffline.queueMutation('POST', '/api/v1/resultados', '{"id_jogo":12}', {});
        const payload = await SGIOffline.exportPending();
        const importado = await SGIOffline.importPending(JSON.stringify(payload));
        let rejeitado = false;
        try {
            await SGIOffline.importPending(JSON.stringify({
                schemaVersion: 1,
                items: [{ ...payload.items[0], headers: { 'X-SGI-Mutation-Id': 'outro-operador-abc' } }],
            }));
        } catch (_) { rejeitado = true; }
        return { importado, rejeitado, fila: await SGIOffline.getPendingList(), id: item.id };
    });
    expect(resultado.importado.imported).toBe(0);
    expect(resultado.rejeitado).toBe(true);
    expect(resultado.fila).toHaveLength(1);
    expect(resultado.fila[0].id).toBe(resultado.id);
});
