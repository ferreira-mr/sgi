window.SGIPage.mount("aluno/ranking", function (pageConfig, pageScope) {

    const IS_ADMIN = pageConfig.value2;
    const urlParams = new URLSearchParams(window.location.search);
    let idInterclasse = urlParams.get('id');

    let dadosAPI = [];
    let categoriasUnicas = [];
    let categoriaSelecionada = null;
    let carregandoRanking = false;
    let carregandoEdicoes = false;

    async function lerRespostaJson(response, descricao) {
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

    function limparMensagens() {
        [document.getElementById('msgMob'), document.getElementById('msgDesk')]
            .filter(Boolean)
            .forEach((elemento) => { elemento.innerHTML = ''; });
    }

    function tentarNovamente() {
        return idInterclasse ? carregarDados() : init();
    }

    async function init() {
        if (!idInterclasse) {
            if (carregandoEdicoes) return;
            carregandoEdicoes = true;
            try {
                const res = await fetch('/api/v1/edicoes?regulamento=true');
                const data = await lerRespostaJson(res, 'Consulta de edições');
                if (!res.ok || (data && data.success === false)) {
                    throw new Error(`Consulta de edições: HTTP ${res.status}`);
                }
                const lista = Array.isArray(data) ? data : [data];

                const encerrado = lista.find(i => String(i.status_interclasse) === '0');
                if (encerrado) {
                    idInterclasse = encerrado.id_interclasse;
                    const url = new URL(window.location);
                    url.searchParams.set('id', idInterclasse);
                    window.history.replaceState({}, '', url);
                }
            } catch (e) {
                console.error("Erro ao carregar interclasse ativo:", e);
                exibirMensagem("Não foi possível buscar o interclasse. Tente novamente.", "danger", true);
                return;
            } finally {
                carregandoEdicoes = false;
            }
        }

        if (!idInterclasse) {
            exibirMensagem("Nenhum interclasse encerrado possui ranking disponível.", "warning");
            return;
        }
        await carregarDados();
    }

    function bloquearAcessoRanking() {
        const mensagemOculta = `
            <div class="text-center py-5">
                <i class="bi bi-lock-fill text-warning display-1"></i>
                <h3 class="fw-bold mt-3">Ranking Oculto</h3>
                <p class="text-muted fs-6">O ranking será exibido após o encerramento e a publicação do Interclasse.</p>
            </div>
        `;
        const mob = document.getElementById('listaMob');
        const desk = document.getElementById('listaDesk');
        const filtros = [document.getElementById('filtrosMob'), document.getElementById('filtrosDesk')];
        const totais = [document.getElementById('totalTurmas'), document.getElementById('totalTurmasDesk')];
        if (mob) mob.innerHTML = mensagemOculta;
        if (desk) desk.innerHTML = mensagemOculta;
        dadosAPI = [];
        categoriasUnicas = [];
        categoriaSelecionada = null;
        filtros.forEach((element) => { if (element) element.innerHTML = ''; });
        totais.forEach((element) => { if (element) element.textContent = '0 Turmas'; });
        limparMensagens();
    }

    async function carregarDados() {
        if (carregandoRanking) return;
        carregandoRanking = true;
        const loading = '<div class="text-center py-5 text-body-secondary"><div class="spinner-border text-danger" role="status"><span class="visually-hidden">Carregando ranking...</span></div></div>';
        if (dadosAPI.length === 0) {
            document.getElementById('listaMob').innerHTML = loading;
            document.getElementById('listaDesk').innerHTML = loading;
        }
        limparMensagens();

        try {
            const response = await fetch(`/api/v1/ranking?id_interclasse=${idInterclasse}`);
            const data = await lerRespostaJson(response, 'Consulta do ranking');

            // A publicação pendente é um bloqueio intencional do contrato HTTP 403.
            if (response.status === 403 && data && data.bloqueado === true) {
                bloquearAcessoRanking();
                return;
            }

            if (!response.ok) {
                throw new Error(`Consulta do ranking: HTTP ${response.status}`);
            }
            if (data && data.success === false) {
                throw new Error('Consulta do ranking recusada.');
            }

            if (!Array.isArray(data)) {
                throw new Error('Consulta do ranking: formato inválido.');
            }

            if (data.length === 0) {
                dadosAPI = [];
                categoriasUnicas = [];
                categoriaSelecionada = null;
                renderizarFiltros();
                document.getElementById('listaMob').innerHTML = '';
                document.getElementById('listaDesk').innerHTML = '';
                document.getElementById('totalTurmas').innerText = '0 Turmas';
                const totalDesktop = document.getElementById('totalTurmasDesk');
                if (totalDesktop) totalDesktop.innerText = '0 Turmas';
                exibirMensagem("Nenhum dado encontrado para este interclasse.", "warning");
                return;
            }

            dadosAPI = data;
            ['nomeInterclasseMob', 'nomeInterclasseDesk'].forEach((id) => {
                const elemento = document.getElementById(id);
                if (elemento) elemento.textContent = data[0].nome_interclasse || '';
            });

            try {
                const catRes = await fetch(`/api/v1/categorias?id_interclasse=${idInterclasse}`);
                const catData = await lerRespostaJson(catRes, 'Consulta de categorias');
                if (!catRes.ok) {
                    throw new Error(`Consulta de categorias: HTTP ${catRes.status}`);
                }
                if (!Array.isArray(catData)) {
                    throw new Error('Consulta de categorias: formato inválido.');
                }
                categoriasUnicas = [...new Set(catData.map(c => c.nome_categoria).filter(Boolean))];
            } catch (error) {
                console.error('Erro ao carregar categorias do ranking:', error);
                categoriasUnicas = [...new Set(data.map(t => t.nome_categoria).filter(Boolean))];
                renderizarFiltros();
                if (categoriasUnicas.length > 0) {
                    filtrarCategoria(categoriasUnicas.includes(categoriaSelecionada) ? categoriaSelecionada : categoriasUnicas[0]);
                } else {
                    categoriaSelecionada = null;
                    document.getElementById('totalTurmas').innerText = `${data.length} Turmas`;
                    const totalDesktop = document.getElementById('totalTurmasDesk');
                    if (totalDesktop) totalDesktop.innerText = `${data.length} Turmas`;
                    renderizarRanking(data);
                }
                exibirMensagem('Os dados principais estão disponíveis, mas as categorias não puderam ser carregadas.', 'warning', true);
                return;
            }

            document.getElementById('totalTurmas').innerText = `${data.length} Turmas`;
            const ttd = document.getElementById('totalTurmasDesk');
            if (ttd) ttd.innerText = `${data.length} Turmas`;

            renderizarFiltros();
            const categoriaInicial = categoriasUnicas.includes(categoriaSelecionada)
                ? categoriaSelecionada
                : categoriasUnicas[0];
            if (categoriaInicial) {
                filtrarCategoria(categoriaInicial);
            } else {
                categoriaSelecionada = null;
                renderizarRanking(data);
            }
            limparMensagens();

        } catch (error) {
            console.error("Erro:", error);
            if (dadosAPI.length === 0) {
                document.getElementById('listaMob').innerHTML = '';
                document.getElementById('listaDesk').innerHTML = '';
            }
            exibirMensagem("Não foi possível carregar o ranking. Tente novamente.", "danger", true);
        } finally {
            carregandoRanking = false;
        }
    }

    function renderizarFiltros() {
        const fMob = document.getElementById('filtrosMob');
        const fDesk = document.getElementById('filtrosDesk');
        fMob.innerHTML = '';
        fDesk.innerHTML = '';

        categoriasUnicas.forEach(cat => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-sm btn-outline-primary rounded-pill btn-categoria';
            btn.setAttribute('aria-pressed', 'false');
            btn.textContent = cat;
            btn.dataset.categoria = cat;

            const btnM = btn.cloneNode(true);
            fMob.appendChild(btnM);
            const btnD = btn.cloneNode(true);
            fDesk.appendChild(btnD);
        });
    }

    function filtrarCategoria(categoria) {
        categoriaSelecionada = categoria || null;
        document.querySelectorAll('.btn-categoria').forEach(b => {
            const selected = b.textContent.trim() === categoria;
            b.classList.toggle('active', selected);
            b.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });

        const turmasFiltradas = categoria
            ? dadosAPI.filter(t => t.nome_categoria === categoria)
            : dadosAPI;
        document.getElementById('totalTurmas').innerText = `${turmasFiltradas.length} Turmas`;
        const ttd = document.getElementById('totalTurmasDesk');
        if (ttd) ttd.innerText = `${turmasFiltradas.length} Turmas`;
        renderizarRanking(turmasFiltradas);
    }

    function renderizarRanking(turmas) {
        const cMob = document.getElementById('listaMob');
        const cDesk = document.getElementById('listaDesk');
        cMob.innerHTML = '';
        cDesk.innerHTML = '';

        if (!turmas.length) {
            const empty = '<div class="text-center py-5 text-body-secondary"><i class="bi bi-inbox display-6 d-block mb-2"></i><p class="mb-0">Nenhuma turma nesta categoria.</p></div>';
            cMob.innerHTML = empty;
            cDesk.innerHTML = empty;
            return;
        }

        const maxPontos = Math.max(...turmas.map(t => t.pontuacao_bruta ?? t.pontuacao_sem_penalidade ?? t.pontuacao_turma)) || 1;
        let htmlRanking = '';

        turmas.forEach((t, index) => {
            const posicao = index + 1;
            const ptsBrutos = t.pontuacao_bruta ?? t.pontuacao_sem_penalidade ?? t.pontuacao_turma;
            const ptsLiquidos = t.pontuacao_liquida ?? t.pontuacao_turma;
            const perdeu = ptsBrutos - ptsLiquidos;
            const porcentagemSem = (ptsBrutos / maxPontos) * 100;
            const porcentagemCom = (ptsLiquidos / maxPontos) * 100;
            const isTop3 = posicao <= 3;
            const destaqueClasses = posicao === 1
                ? 'border-warning border-2 bg-warning-subtle'
                : posicao === 2
                    ? 'border-secondary border-2 bg-secondary-subtle'
                    : posicao === 3
                        ? 'border-danger-subtle border-2 bg-danger-subtle'
                        : 'border-light';
            const badgeClass = posicao === 1
                ? 'sgi-podium-badge--1'
                : posicao === 2
                    ? 'sgi-podium-badge--2'
                    : posicao === 3
                        ? 'sgi-podium-badge--3'
                        : 'sgi-podium-badge--default';
            const podiumPill = posicao === 1
                ? '<span class="badge bg-warning text-dark fw-bold text-uppercase px-2 py-1"><i class="bi bi-trophy-fill me-1" aria-hidden="true"></i>1º Lugar</span>'
                : posicao === 2
                    ? '<span class="badge bg-secondary-subtle text-secondary-emphasis fw-bold text-uppercase px-2 py-1"><i class="bi bi-award-fill me-1" aria-hidden="true"></i>2º Lugar</span>'
                    : posicao === 3
                        ? '<span class="badge bg-danger-subtle text-danger-emphasis fw-bold text-uppercase px-2 py-1"><i class="bi bi-award-fill me-1" aria-hidden="true"></i>3º Lugar</span>'
                        : '';

            const html = `
                <div class="mb-3" data-sgi-index="${index}">
                    <div class="card position-relative ${destaqueClasses} card-turma p-3 p-md-4">
                        <div class="d-flex align-items-center gap-3">
                            <div class="sgi-podium-badge ${badgeClass} flex-shrink-0" aria-label="${posicao}º lugar">${posicao}°</div>
                            <div class="flex-grow-1 sgi-u-min-width-0">
                                <div class="d-flex align-items-center gap-2 mb-1 flex-wrap">
                                    <span class="h5 fw-semibold mb-0 text-truncate">${esc(t.nome_turma)}</span>
                                    ${podiumPill}
                                </div>
                                <div class="small text-body-secondary"><i class="bi bi-mortarboard-fill me-1"></i>${esc(t.nome_fantasia_turma || t.turno_turma)}</div>
                            </div>
                            <div class="badge text-bg-primary fs-6 flex-shrink-0"><span>${ptsLiquidos}</span> <small>pts</small></div>
                        </div>

                        <div class="d-flex flex-column gap-2 mt-3">
                            <div>
                                <div class="d-flex justify-content-between align-items-center small text-body-secondary mb-1">
                                    <span><i class="bi bi-star me-1"></i>Pontuação bruta</span>
                                    <span class="fw-semibold">${ptsBrutos} pts</span>
                                </div>
                                <div class="progress" style="height: 8px" role="progressbar" aria-label="Pontuação bruta" aria-valuenow="${porcentagemSem}" aria-valuemin="0" aria-valuemax="100">
                                    <div class="progress-bar bg-secondary" style="width: ${porcentagemSem}%"></div>
                                </div>
                            </div>
                            <div>
                                <div class="d-flex justify-content-between align-items-center small text-body-secondary mb-1">
                                    <span class="text-danger fw-semibold"><i class="bi bi-flag-fill me-1"></i>Pontuação líquida</span>
                                    <span class="fw-bold">${ptsLiquidos} pts${perdeu > 0 ? ` <span class="text-danger">(-${perdeu})</span>` : ''}</span>
                                </div>
                                <div class="progress" style="height: 12px" role="progressbar" aria-label="Pontuação líquida" aria-valuenow="${porcentagemCom}" aria-valuemin="0" aria-valuemax="100">
                                    <div class="progress-bar bg-primary" style="width: ${porcentagemCom}%"></div>
                                </div>
                            </div>
                        </div>

                        <div class="mt-3 d-print-none">
                            <button type="button" class="btn btn-sm btn-outline-secondary w-100" data-sgi-action="history-ranking" data-id-turma="${esc(t.id_turma)}" data-nome-turma="${esc(t.nome_turma)}">
                                <i class="bi bi-clock-history"></i> Ver histórico de pontos
                            </button>
                        </div>
                    </div>
                </div>
            `;
            htmlRanking += html;
        });
        cMob.innerHTML = htmlRanking;
        cDesk.innerHTML = htmlRanking;
    }

    function exibirMensagem(texto, tipo, permitirNovaTentativa = false) {
        const botao = permitirNovaTentativa
            ? '<button type="button" class="btn btn-outline-danger btn-sm mt-2" data-sgi-action="retry-ranking">Tentar novamente</button>'
            : '';
        const alerta = `<div class="alert alert-${tipo} text-center" role="${tipo === 'danger' ? 'alert' : 'status'}" aria-live="${tipo === 'danger' ? 'assertive' : 'polite'}">${texto}${botao}</div>`;
        document.getElementById('msgMob').innerHTML = alerta;
        document.getElementById('msgDesk').innerHTML = alerta;
    }

    /* ==================== HISTÓRICO DE PONTOS (MODAL) ==================== */

    function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
    function jsEsc(s) { return String(s == null ? '' : s).replace(/'/g, "\\'").replace(/"/g, '&quot;'); }

    let historicoTrigger = null;
    const modalHistoricoElement = document.getElementById('modalHistoricoTurma');
    pageScope.listen(modalHistoricoElement, 'hidden.bs.modal', () => {
        if (historicoTrigger?.isConnected && !historicoTrigger.disabled && historicoTrigger.getClientRects().length) {
            historicoTrigger.focus();
        }
        historicoTrigger = null;
    });

    function vincularEventos() {
        const filtros = [document.getElementById('filtrosMob'), document.getElementById('filtrosDesk')];
        const listas = [document.getElementById('listaMob'), document.getElementById('listaDesk')];
        filtros.forEach((container) => pageScope.listen(container, 'click', (event) => {
            const button = event.target.closest('[data-sgi-action="filter-ranking"], .btn-categoria');
            if (button) filtrarCategoria(button.dataset.categoria);
        }));
        listas.forEach((container) => pageScope.listen(container, 'click', (event) => {
            const button = event.target.closest('[data-sgi-action="history-ranking"]');
            if (button) {
                historicoTrigger = button;
                abrirHistorico(button.dataset.idTurma, button.dataset.nomeTurma);
            }
        }));
        [document.getElementById('msgMob'), document.getElementById('msgDesk')].forEach((container) => {
            pageScope.listen(container, 'click', (event) => {
                if (event.target.closest('[data-sgi-action="retry-ranking"]')) tentarNovamente();
            });
        });
    }

    function fmtData(s) {
        if (!s) return '—';
        const d = new Date(String(s).includes('T') ? s : s.replace(' ', 'T'));
        if (isNaN(d)) return s;
        return d.toLocaleDateString('pt-BR');
    }
    function fmtDataHora(s) {
        if (!s) return '—';
        const d = new Date(String(s).includes('T') ? s : s.replace(' ', 'T'));
        if (isNaN(d)) return s;
        return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    const medalhas = { 1: '🥇', 2: '🥈', 3: '🥉' };

    function badgeColocacao(pos) {
        if (pos === null || pos === undefined) return '';
        const medalha = medalhas[pos] || '';
        return `<span class="badge text-bg-secondary">${medalha}${pos}º</span>`;
    }

    function secaoAbertura(icone, titulo, contagem) {
        return `
            <section class="px-3 pb-3">
                <h6 class="d-flex align-items-center gap-2 fw-bold text-body-secondary border-bottom pb-2 mb-3">
                    <i class="bi bi-${icone} text-primary"></i><span>${titulo}</span>
                    <span class="badge text-bg-light border text-body-secondary ms-auto">${contagem}</span>
                </h6>`;
    }

    function renderHistorico(d) {
        const t = d.turma;
        const bruto = t.pontuacao_bruta ?? t.pontuacao_turma;
        const liquido = t.pontuacao_liquida ?? (bruto - d.resumo.penalidades_pontos);
        const ajuste = d.resumo.ajuste_pontos ?? t.ajuste_pontuacao ?? 0;
        const soma = d.resumo.arrecadacao_pontos + d.resumo.esportes_pontos + ajuste - d.resumo.penalidades_pontos;
        const difere = soma !== liquido;

        let html = '';

        html += `
            <div class="bg-dark text-white d-flex align-items-center justify-content-between gap-3 flex-wrap p-4">
                <div>
                    <div class="h5 fw-bold mb-1">${esc(t.nome_turma)}</div>
                    <div class="small text-white-50">${esc(t.nome_fantasia_turma || '')} · ${esc(t.nome_categoria)} · ${esc(t.turno_turma || '')}</div>
                </div>
                <div class="text-end"><div class="h3 fw-bold text-warning mb-0">${liquido}</div><small class="text-white-50">pts líquidos</small><div class="small text-white-50 mt-1">Bruto registrado: ${bruto} pts</div></div>
            </div>
            <div class="row row-cols-1 row-cols-sm-3 g-2 p-3">
                <div class="col"><div class="card border-0 bg-success-subtle text-success-emphasis text-center p-2 h-100">
                    <i class="bi bi-box-seam"></i>
                    <span class="fw-semibold">+${d.arrecadacao.pontos} pts</span>
                    <span class="small text-uppercase">Arrecadação</span>
                </div></div>
                <div class="col"><div class="card border-0 bg-primary-subtle text-primary-emphasis text-center p-2 h-100">
                    <i class="bi bi-trophy"></i>
                    <span class="fw-semibold">+${d.esportes.pontos_total} pts</span>
                    <span class="small text-uppercase">Esportes</span>
                </div></div>
                ${ajuste !== 0 ? `<div class="col"><div class="card border-0 bg-warning-subtle text-warning-emphasis text-center p-2 h-100"><i class="bi bi-question-circle"></i><span class="fw-semibold">${ajuste > 0 ? '+' : ''}${ajuste} pts</span><span class="small text-uppercase">Ajuste sem origem detalhada</span></div></div>` : ''}
                <div class="col"><div class="card border-0 bg-danger-subtle text-danger-emphasis text-center p-2 h-100">
                    <i class="bi bi-flag"></i>
                    <span class="fw-semibold">-${d.penalidades.pontos_total} pts</span>
                    <span class="small text-uppercase">Penalidades</span>
                </div></div>
            </div>
            ${difere ? `<div class="alert alert-warning mx-3 mb-3 py-2 small"><i class="bi bi-info-circle me-1"></i>Soma das parcelas líquidas: ${soma} pts. O total líquido é ${liquido} pts (diferença de ${Math.abs(soma - liquido)} pts).</div>` : ''}
            ${d.ajuste?.pendente_origem ? `<div class="alert alert-warning mx-3 mb-3 py-2 small"><i class="bi bi-info-circle me-1"></i>${esc(d.ajuste.origem || 'Há saldo sem origem detalhada.')} (${ajuste} pts).</div>` : ''}
        `;

        /* Arrecadação */
        html += secaoAbertura('box-seam', 'Arrecadação', d.arrecadacao.registros.length);
        if (d.arrecadacao.registros.length) {
            html += '<div class="d-flex flex-column">';
            d.arrecadacao.registros.forEach(r => {
                html += `
                    <div class="d-flex align-items-center justify-content-between gap-3 py-2 border-bottom">
                        <div>
                            <div class="fw-semibold small">${r.quantidade} kg</div>
                            <div class="small text-body-secondary">${fmtDataHora(r.data)} · por ${esc(r.registrado_por)}</div>
                        </div>
                        <span class="fw-bold text-success flex-shrink-0">+${r.pontos}</span>
                    </div>`;
            });
            html += '</div>';
            html += `<div class="small text-body-secondary text-end mt-2">Total: <b>${d.arrecadacao.itens} kg</b> × ${d.interclasse.valor_item_arrecadacao} pts = <b>+${d.arrecadacao.pontos} pts</b></div>`;
        } else {
            html += '<div class="text-center text-body-secondary py-3 small">Nenhuma arrecadação registrada.</div>';
        }
        html += '</section>';

        /* Esportes */
        html += secaoAbertura('trophy', 'Esportes', d.esportes.modalidades.length);
        if (d.esportes.modalidades.length) {
            html += '<div class="d-flex flex-column gap-2">';
            d.esportes.modalidades.forEach(m => {
                html += `
                    <div class="card border bg-body-tertiary p-3">
                        <div class="d-flex align-items-center justify-content-between gap-2 flex-wrap">
                            <div class="d-flex align-items-center gap-2 flex-wrap small">
                                ${badgeColocacao(m.colocacao)}
                                <b>${esc(m.nome_modalidade)}</b>
                                <span class="text-body-secondary">${esc(m.tipo)} · ${esc(m.nome_categoria)}</span>
                            </div>
                            <span class="fw-bold text-success">+${m.pontos} pts</span>
                        </div>
                        ${m.alunos.length ? `<div class="d-flex flex-wrap gap-1 mt-2">${m.alunos.map(a => `<span class="badge text-bg-light border text-body-secondary">${esc(a.nome_usuario)}</span>`).join('')}</div>` : ''}
                        ${m.itens.length ? `<div class="d-flex flex-column mt-2 border rounded overflow-hidden">${m.itens.map(it => `
                            <div class="d-flex align-items-center justify-content-between gap-3 p-2 border-bottom">
                                <div>
                                    <div class="small fw-semibold">${esc(it.descricao)}</div>
                                    <div class="small text-body-secondary">${esc(it.detalhe)}</div>
                                </div>
                                <span class="fw-bold text-success flex-shrink-0">+${it.pontos}</span>
                            </div>`).join('')}</div>` : ''}
                    </div>`;
            });
            html += '</div>';
        } else {
            html += '<div class="text-center text-body-secondary py-3 small">Nenhuma pontuação esportiva até o momento.</div>';
        }
        html += '</section>';

        /* Penalidades */
        html += secaoAbertura('flag', 'Penalidades', d.penalidades.ocorrencias.length);
        if (d.penalidades.ocorrencias.length) {
            html += '<div class="d-flex flex-column">';
            d.penalidades.ocorrencias.forEach(o => {
                html += `
                    <div class="d-flex align-items-center justify-content-between gap-3 py-2 border-bottom">
                        <div>
                            <div class="small fw-semibold">${esc(o.titulo)}${o.aluno ? ` <span class="badge text-bg-light border text-body-secondary">${esc(o.aluno)}</span>` : ''}</div>
                            <div class="small text-body-secondary">${fmtData(o.data)}${o.descricao ? ' · ' + esc(o.descricao) : ''}</div>
                        </div>
                        <span class="fw-bold text-danger flex-shrink-0">-${o.pontos}</span>
                    </div>`;
            });
            html += '</div>';
            html += `<div class="small text-body-secondary text-end mt-2">Total descontado: <b>-${d.penalidades.pontos_total} pts</b></div>`;
        } else {
            html += '<div class="text-center text-body-secondary py-3 small">Nenhuma penalidade aplicada.</div>';
        }
        html += '</section>';

        document.getElementById('htrCorpo').innerHTML = html;
    }

    async function abrirHistorico(idTurma, nomeTurma) {
        document.getElementById('htrTitulo').innerText = `Histórico de Pontos`;
        document.getElementById('htrCorpo').innerHTML = '<div class="text-center py-5"><div class="spinner-border text-danger"></div></div>';

        const modalEl = document.getElementById('modalHistoricoTurma');
        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();

        try {
            const response = await fetch(`/api/v1/historico-turma?id_turma=${idTurma}&id_interclasse=${idInterclasse}`);
            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || 'Erro ao carregar histórico.');
            }

            document.getElementById('htrTitulo').innerText = `Histórico de Pontos`;
            renderHistorico(data);
        } catch (err) {
            document.getElementById('htrCorpo').innerHTML = `
                <div class="alert alert-danger m-3 shadow-sm border-0" role="alert">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    ${esc(err.message)}
                </div>`;
        }
    }

    window.SGIPage.ready(() => {
        vincularEventos();
        init();
    });

return {init, bloquearAcessoRanking, carregarDados, renderizarFiltros, filtrarCategoria, renderizarRanking, exibirMensagem, esc, jsEsc, fmtData, fmtDataHora, badgeColocacao, secaoAbertura, renderHistorico, abrirHistorico};
});
