window.SGIPage.mount("eventos/configurar-arrecadacao", function (pageConfig, pageScope) {

    const APP_BASE = String(window.SGI_BASE_PATH || '').replace(/\/+$/, '');
    const API_BASE = String(window.SGI_API_BASE || `${APP_BASE}/api/v1/`).replace(/\/?$/, '');
    function esc(s) {
        var d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function escAttr(s) {
        return esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    const storagePrefix = 'sgi_items_';
    const mutationStoragePrefix = 'sgi_arrecadacao_mutation_';
    const paramsArrecadacao = new URLSearchParams(window.location.search);
    const idInterclasseArrecadacao = paramsArrecadacao.get('id');
    const isAdminPage = pageConfig.value2;

    let todasAsTurmas = [];
    let idInterclasseResolvida = null;
    let carregandoTurmas = false;

    function getQuantidadePendente(turma) {
        const local = localStorage.getItem(`${storagePrefix}${turma.id_turma}`);
        return local !== null ? Number(local) : 0;
    }

    function salvarLocal(idTurma, valor) {
        localStorage.setItem(`${storagePrefix}${idTurma}`, String(valor));
    }

    function mutationStorageKey(idTurma, idInterclasse) {
        return `${mutationStoragePrefix}${Number(window.SGI_SESSION_ID || 0)}_${Number(idInterclasse)}_${Number(idTurma)}`;
    }

    function mutationIdPara(payload) {
        const idTurma = Number(payload.arrecadacoes[0].id_turma);
        const key = mutationStorageKey(idTurma, payload.id_interclasse);
        const fingerprint = JSON.stringify(payload);
        try {
            const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
            if (saved && saved.fingerprint === fingerprint && typeof saved.id === 'string' && saved.id !== '') {
                return saved.id;
            }
        } catch (_) {}

        const randomId = window.crypto && typeof window.crypto.randomUUID === 'function'
            ? window.crypto.randomUUID()
            : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
        const id = `arrecadacao-${randomId}`;
        try {
            sessionStorage.setItem(key, JSON.stringify({ fingerprint, id }));
        } catch (_) {}
        return id;
    }

    function limparMutationId(idTurma, idInterclasse) {
        try {
            sessionStorage.removeItem(mutationStorageKey(idTurma, idInterclasse));
        } catch (_) {}
    }

    async function lerRespostaJson(response, descricao) {
        if (!response.ok) {
            throw new Error(`${descricao}: HTTP ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || '';
        if (!/application\/json|\+json/i.test(contentType)) {
            throw new Error(`${descricao}: resposta não é JSON.`);
        }

        try {
            return await response.json();
        } catch (_) {
            throw new Error(`${descricao}: resposta JSON inválida.`);
        }
    }

    function mensagemErroTurmas() {
        return `
            <div class="alert alert-danger col-12 mb-0 js-arrecadacao-erro" role="alert" aria-live="assertive">
                <p class="mb-2">Não foi possível carregar as turmas da edição.</p>
                <button type="button" class="btn btn-outline-danger btn-sm" data-sgi-action="retry-arrecadacao-turmas">
                    Tentar novamente
                </button>
            </div>`;
    }

    function renderCard(turma, variante) {
        const nomeTurma = turma.nome_fantasia_turma || turma.nome_turma;
        const nome = esc(nomeTurma);
        const nomeAttr = escAttr(nomeTurma);
        const inputId = `arrecadacao-${Number(turma.id_turma)}-${variante}`;
        return `
            <div class="col"><article class="card h-100 border-0 shadow-sm sgi-turma-card p-3">
                <div class="sgi-turma-card-header">
                    <div class="bg-danger-subtle text-danger rounded-circle p-2 fs-5 d-flex align-items-center justify-content-center flex-shrink-0"><i class="bi bi-people-fill" aria-hidden="true"></i></div>
                    <div class="sgi-turma-card-title">
                        <h2 class="h6 mb-1 fw-semibold">${nome}</h2>
                        <span class="badge text-bg-light">${esc(turma.nome_categoria || 'Geral')}</span>
                    </div>
                </div>
                <div class="sgi-turma-card-actions">
                    <div class="input-group input-group-sm w-auto">
                        <label class="visually-hidden" for="${inputId}">Quantidade arrecadada em quilogramas para ${nome}</label>
                        <input type="number" id="${inputId}" step="0.1" min="0" class="form-control text-center fw-semibold arrec-input"
                            data-id-turma="${turma.id_turma}"
                            value="${getQuantidadePendente(turma)}" placeholder="0">
                        <span class="input-group-text">Kg</span>
                    </div>
                    <button type="button" class="btn btn-outline-secondary btn-sm" data-sgi-action="history-arrecadacao" data-id-turma="${turma.id_turma}" data-nome-turma="${nomeAttr}" title="Ver histórico" aria-label="Ver histórico de arrecadações de ${nomeAttr}">
                        <i class="bi bi-clock-history" aria-hidden="true"></i>
                    </button>
                    <button type="button" class="btn btn-outline-success btn-sm" data-sgi-action="save-arrecadacao" data-id-turma="${turma.id_turma}" title="Salvar" aria-label="Salvar arrecadação de ${nomeAttr}">
                        <i class="bi bi-check-lg" aria-hidden="true"></i>
                    </button>
                </div>
            </article></div>
        `;
    }

    function renderizarTelas() {
        const listaMobile = document.getElementById('listaArrecadacaoMobile');
        const listaDesktop = document.getElementById('listaArrecadacaoDesktop');

        if (todasAsTurmas.length === 0) {
            const msg = '<div class="col-12 text-center text-body-secondary py-5"><i class="bi bi-inbox fs-2 d-block mb-2 text-body-tertiary"></i>Nenhuma turma encontrada.</div>';
            listaMobile.innerHTML = msg;
            listaDesktop.innerHTML = msg;
            return;
        }

        listaMobile.innerHTML = todasAsTurmas.map((turma) => renderCard(turma, 'mobile')).join('');
        listaDesktop.innerHTML = todasAsTurmas.map((turma) => renderCard(turma, 'desktop')).join('');

        vincularEventosInputs();
        vincularEventosAcoes();
    }

    function mostrarErroTurmas() {
        const mensagem = mensagemErroTurmas();
        [document.getElementById('listaArrecadacaoMobile'), document.getElementById('listaArrecadacaoDesktop')]
            .filter(Boolean)
            .forEach((lista) => {
                lista.querySelectorAll('.js-arrecadacao-erro').forEach((erro) => erro.remove());
                if (todasAsTurmas.length > 0) {
                    lista.insertAdjacentHTML('afterbegin', mensagem);
                } else {
                    lista.innerHTML = mensagem;
                }
            });
    }

    function getInputVisivel(idTurma) {
        const inputs = document.querySelectorAll(`.arrec-input[data-id-turma="${idTurma}"]`);
        for (const input of inputs) {
            if (input.offsetParent !== null) return input;
        }
        return inputs[0] || null;
    }

    function getQuantidadeAtual(idTurma) {
        const input = getInputVisivel(idTurma);
        if (input && input.value !== '') {
            return Number(input.value);
        }
        return getQuantidadePendente({ id_turma: idTurma });
    }

    function vincularEventosInputs() {
        document.querySelectorAll('.arrec-input').forEach(input => {
            pageScope.listen(input, 'input', (e) => {
                const idTurma = e.target.dataset.idTurma;
                const valor = e.target.value;
                salvarLocal(idTurma, valor);
                document.querySelectorAll(`.arrec-input[data-id-turma="${idTurma}"]`).forEach(inp => {
                    if (inp !== e.target) inp.value = valor;
                });
            });
        });
    }

    function vincularEventosAcoes() {
        document.querySelectorAll('[data-sgi-action="history-arrecadacao"]').forEach((button) => {
            pageScope.listen(button, 'click', () => abrirHistoricoTurma(button.dataset.idTurma, button.dataset.nomeTurma, button));
        });
        document.querySelectorAll('[data-sgi-action="save-arrecadacao"]').forEach((button) => {
            pageScope.listen(button, 'click', () => salvarTurma(button.dataset.idTurma));
        });
    }

    [document.getElementById('listaArrecadacaoMobile'), document.getElementById('listaArrecadacaoDesktop')]
        .filter(Boolean)
        .forEach((lista) => pageScope.listen(lista, 'click', (event) => {
            if (event.target.closest('[data-sgi-action="retry-arrecadacao-turmas"]')) {
                carregarDados();
            }
        }));

    pageScope.listen(window, 'beforeunload', () => {
        const pendentes = todasAsTurmas.some(t => getQuantidadePendente(t) > 0);
        if (pendentes) {
            const payload = {
                id_interclasse: idInterclasseResolvida || idInterclasseArrecadacao,
                arrecadacoes: todasAsTurmas.map(t => ({
                    id_turma: t.id_turma,
                    quantidade: getQuantidadePendente(t)
                })).filter((item) => item.quantidade > 0)
            };
            const body = JSON.stringify(payload);
            try {
                fetch(`${API_BASE}/arrecadacao`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body,
                    keepalive: true
                }).catch(() => {});
            } catch (_) {
                if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
                    navigator.sendBeacon(`${API_BASE}/arrecadacao`, new Blob([body], { type: 'application/json' }));
                }
            }
        }
    });

    async function carregarDados() {
        if (carregandoTurmas) return;
        carregandoTurmas = true;
        try {
            const ativo = idInterclasseArrecadacao
                ? await window.SGIInterclasse.getInterclasseById(idInterclasseArrecadacao)
                : await window.SGIInterclasse.getActiveInterclasse();

            if (!ativo) {
                throw new Error('Nenhuma edição selecionada.');
            }

            idInterclasseResolvida = ativo.id_interclasse;

            const nomeDesk = document.getElementById('nomeInterclasseArrecadacao');
            if (nomeDesk) nomeDesk.innerText = ativo.nome_interclasse;
            const nomeMob = document.getElementById('nomeInterclasseArrecadacaoMob');
            if (nomeMob) nomeMob.innerText = ativo.nome_interclasse;
            const vDesk = document.getElementById('btnVoltarArrecadacao');
            if (vDesk) {
                vDesk.href = `${APP_BASE}/painel?id=${idInterclasseArrecadacao || ativo.id_interclasse}`;
            }
            const vMob = document.getElementById('btnVoltarArrecadacaoMob');
            if (vMob) {
                vMob.href = `${APP_BASE}/painel?id=${idInterclasseArrecadacao || ativo.id_interclasse}`;
            }

            const res = await fetch(`${API_BASE}/turmas?id_interclasse=${ativo.id_interclasse}`);
            const turmas = await lerRespostaJson(res, 'Consulta de turmas');
            if (!Array.isArray(turmas)) {
                throw new Error('Consulta de turmas: formato inválido.');
            }

            todasAsTurmas = turmas;
            renderizarTelas();
        } catch (error) {
            console.error("Erro ao carregar dados:", error);
            mostrarErroTurmas();
        } finally {
            carregandoTurmas = false;
        }
    }

    async function salvarTurma(idTurma) {
        const input = getInputVisivel(idTurma);
        const quantidade = getQuantidadeAtual(idTurma);

        if (!quantidade || quantidade <= 0) {
            SGI.alert('Informe a quantidade em kg a adicionar.');
            return;
        }

        if (input) salvarLocal(idTurma, input.value);

        const botoes = document.querySelectorAll(`[data-sgi-action="save-arrecadacao"][data-id-turma="${idTurma}"]`);
        botoes.forEach(btn => {
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
        });

        const payload = {
            id_interclasse: idInterclasseResolvida || idInterclasseArrecadacao,
            arrecadacoes: [{ id_turma: Number(idTurma), quantidade }]
        };
        const mutationId = mutationIdPara(payload);

        try {
            const response = await fetch(`${API_BASE}/arrecadacao`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-SGI-Mutation-Id': mutationId
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Erro de rede: ${response.status}`);
            }

            const result = await lerRespostaJson(response, 'Salvamento da arrecadação');

            if (result && result.success === true) {
                limparMutationId(idTurma, payload.id_interclasse);
                localStorage.removeItem(`${storagePrefix}${idTurma}`);
                document.querySelectorAll(`.arrec-input[data-id-turma="${idTurma}"]`).forEach(inp => {
                    inp.value = '0';
                });
                SGI.alert('Dados salvos com sucesso!');
            } else {
                throw new Error('O servidor não confirmou o salvamento.');
            }
        } catch (error) {
            SGI.alert('Não foi possível salvar a arrecadação. A quantidade informada continua preenchida para nova tentativa.');
            console.error('Falha no salvamento:', error);
        } finally {
            botoes.forEach(btn => {
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-check-lg"></i>';
            });
        }
    }

    let historicoRegistros = [];
    let filtroHistoricoAtual = 'adicionados';
    let historicoTurmaId = null;
    let historicoEstado = 'idle';

    function abrirHistoricoTurma(idTurma, nomeTurma, acionador) {
        historicoTurmaId = idTurma;
        document.getElementById('modalHistoricoTurmaNome').innerText = nomeTurma;
        const modalElement = document.getElementById('modalHistoricoArrecadacao');
        modalElement.addEventListener('hidden.bs.modal', () => {
            if (acionador && acionador.isConnected) acionador.focus();
        }, { once: true });
        bootstrap.Modal.getOrCreateInstance(modalElement).show();
        carregarHistorico(idTurma);
    }

    async function carregarHistorico(idTurma) {
        const conteudo = document.getElementById('historicoConteudo');
        conteudo.innerHTML = '<div class="spinner-border text-danger" role="status"><span class="visually-hidden">A carregar...</span></div>';
        historicoEstado = 'loading';

        if (pageConfig.value0) {
            filtroHistoricoAtual = 'adicionados';
            atualizarFiltrosHistorico(filtroHistoricoAtual);
        }

        const idInterclasse = idInterclasseResolvida || idInterclasseArrecadacao;
        if (!idInterclasse) {
            historicoEstado = 'error';
            conteudo.innerHTML = '<p class="text-muted">Nenhuma interclasse selecionada.</p>';
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/arrecadacao?id_interclasse=${idInterclasse}`);
            const registros = await lerRespostaJson(res, 'Histórico de arrecadação');
            if (!Array.isArray(registros)) {
                throw new Error('Histórico de arrecadação: formato inválido.');
            }

            historicoRegistros = registros.filter(r => Number(r.id_turma) === Number(idTurma));
            historicoEstado = 'loaded';

            if (historicoRegistros.length === 0) {
                conteudo.innerHTML = '<p class="text-muted py-3">Nenhum registro de arrecadação encontrado para esta turma.</p>';
                return;
            }

            renderizarHistoricoFiltrado();

        } catch (error) {
            console.error("Erro ao carregar histórico:", error);
            historicoEstado = 'error';
            conteudo.innerHTML = `
                <div class="alert alert-danger text-start mb-0" role="alert" aria-live="assertive">
                    <p class="mb-2">Não foi possível carregar o histórico de arrecadações.</p>
                    <button type="button" class="btn btn-outline-danger btn-sm" data-sgi-action="retry-arrecadacao-historico">
                        Tentar novamente
                    </button>
                </div>`;
        }
    }

    function filtrarHistorico(filtro) {
        filtroHistoricoAtual = filtro;

        if (pageConfig.value0) {
            atualizarFiltrosHistorico(filtro);
        }

        if (historicoEstado === 'loaded') renderizarHistoricoFiltrado();
    }

    pageScope.listen(document.getElementById('historicoConteudo'), 'click', (event) => {
        if (event.target.closest('[data-sgi-action="retry-arrecadacao-historico"]') && historicoTurmaId) {
            carregarHistorico(historicoTurmaId);
        }
    });

    function atualizarFiltrosHistorico(filtro) {
        const botoes = [
            [document.getElementById('btnFiltroAdicionados'), filtro === 'adicionados'],
            [document.getElementById('btnFiltroExcluidos'), filtro === 'excluidos'],
        ];
        botoes.forEach(([botao, ativo]) => {
            if (!botao) return;
            botao.classList.toggle('btn-primary', ativo);
            botao.classList.toggle('btn-outline-secondary', !ativo);
            botao.classList.toggle('active', ativo);
            botao.setAttribute('aria-pressed', String(ativo));
        });
    }

    function renderizarHistoricoFiltrado() {
        const conteudo = document.getElementById('historicoConteudo');
        const lista = historicoRegistros.filter(r => {
            if (isAdminPage) {
                return filtroHistoricoAtual === 'adicionados' ? r.status_historico === '1' : r.status_historico === '0';
            }
            return r.status_historico === '1';
        });

        if (lista.length === 0) {
            const msg = isAdminPage && filtroHistoricoAtual === 'excluidos'
                ? '<p class="text-muted py-3">Nenhum registro excluído encontrado.</p>'
                : '<p class="text-muted py-3">Nenhum registro adicionado encontrado.</p>';
            conteudo.innerHTML = msg;
            return;
        }

        let html = '<div class="table-responsive"><table class="table table-hover align-middle">';
        html += '<thead><tr class="table-light"><th>Data</th><th class="text-center">Kg</th><th class="text-center">Pts</th>';

        if (isAdminPage && filtroHistoricoAtual === 'adicionados') {
            html += '<th class="text-center">Ação</th>';
        } else if (isAdminPage && filtroHistoricoAtual === 'excluidos') {
            html += '<th class="text-center">Estado</th>';
        }

        html += '</tr></thead><tbody>';

        lista.forEach(r => {
            const data = new Date(r.data_registro);
            const dataFmt = data.toLocaleDateString('pt-BR') + ' ' + data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

            html += '<tr>';

            if (isAdminPage && filtroHistoricoAtual === 'excluidos') {
                html += '<td class="small text-muted">' + esc(dataFmt) + '</td>';
                html += '<td class="text-center text-muted">' + r.quantidade + '</td>';
                html += '<td class="text-center fw-bold text-danger">-' + r.pontos_adicionados + '</td>';
                html += '<td class="text-center"><span class="badge bg-secondary">Removido</span></td>';
            } else {
                html += '<td class="small">' + esc(dataFmt) + '</td>';
                html += '<td class="text-center">' + r.quantidade + '</td>';
                html += '<td class="text-center fw-bold text-success">+' + r.pontos_adicionados + '</td>';
                if (isAdminPage) {
                    html += '<td class="text-center">';
                    html += '<button type="button" class="btn btn-outline-danger btn-sm" title="Remover e reverter pontos" aria-label="Remover registro de arrecadação e reverter pontos" data-sgi-action="delete-historico" data-id-historico="' + esc(r.id_historico) + '">';
                    html += '<i class="bi bi-trash" aria-hidden="true"></i>';
                    html += '</button>';
                    html += '</td>';
                }
            }

            html += '</tr>';
        });

        html += '</tbody></table></div>';
        conteudo.innerHTML = html;
        conteudo.querySelectorAll('[data-sgi-action="delete-historico"]').forEach((button) => {
            pageScope.listen(button, 'click', () => deletarHistorico(button.dataset.idHistorico));
        });
    }

    async function deletarHistorico(idHistorico) {
        if (!await SGI.confirm({ titulo: 'Remover registro?', mensagem: 'Os pontos serão subtraídos automaticamente do ranking.', textoConfirmar: 'Remover registro', destrutivo: true })) {
            return;
        }

        const idInterclasse = idInterclasseResolvida || idInterclasseArrecadacao;

        try {
            const res = await fetch(`${API_BASE}/arrecadacao`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_historico: idHistorico, id_interclasse: idInterclasse })
            });

            const result = await res.json();

            if (result.success) {
                SGI.alert('Registro removido e pontos revertidos com sucesso!');
                carregarHistorico(historicoTurmaId);
            } else {
                SGI.alert('Erro: ' + result.message);
            }
        } catch (error) {
            console.error("Erro ao deletar:", error);
            SGI.alert('Erro de comunicação ao tentar remover o registro.');
        }
    }

    window.SGIPage.ready( carregarDados);

    window.SGIPage.ready(() => {
        document.querySelectorAll('[data-filtro-historico]').forEach((button) => {
            pageScope.listen(button, 'click', () => filtrarHistorico(button.dataset.filtroHistorico));
        });
    });

return {esc, getQuantidadePendente, salvarLocal, renderCard, renderizarTelas, getInputVisivel, getQuantidadeAtual, vincularEventosInputs, carregarDados, salvarTurma, abrirHistoricoTurma, carregarHistorico, filtrarHistorico, renderizarHistoricoFiltrado, deletarHistorico};
});
