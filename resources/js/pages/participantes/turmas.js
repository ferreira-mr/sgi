window.SGIPage.mount("participantes/turmas", function (pageConfig, pageScope) {

    const APP_BASE = String(window.SGI_BASE_PATH || '').replace(/\/+$/, '');
    const API_BASE = String(window.SGI_API_BASE || `${APP_BASE}/api/v1/`).replace(/\/?$/, '');
    let turmasData = [];
    let editTurmaId = null;
    let carregandoTurmas = false;
    let erroCarregamentoTurmas = false;
    const NIVEL_USUARIO = pageConfig.value2;

    const urlParams = new URLSearchParams(window.location.search);
    const idInterclasse = urlParams.get('id');

    /* ── TOAST ── */
    function mostrarToast(mensagem, tipo) {
        window.SGI.showToast(mensagem, tipo);
    }

    /* ── HELPERS ── */
    async function resolverInterclasse() {
        if (idInterclasse) {
            const dados = await window.SGIInterclasse.getInterclasseById(idInterclasse);
            if (dados) return dados;
        }
        return window.SGIInterclasse.getActiveInterclasse();
    }

    function esc(s) {
        const d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function escAttr(s) {
        return esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function mostrarNomeArquivo() {
        const input = document.getElementById('arquivoUpload');
        const span = document.getElementById('nomeArquivo');
        span.textContent = input.files?.length ? input.files[0].name : 'Nenhum arquivo selecionado';
    }

    /* ── SKELETON ── */
    function renderizarSkeleton() {
        const html = Array.from({ length: 6 }, () => `
            <div class="col">
                <div class="card h-100 p-3 placeholder-glow" aria-hidden="true">
                    <div class="d-flex gap-3 mb-3">
                        <span class="placeholder rounded-3 flex-shrink-0 py-4 px-4"></span>
                        <span class="placeholder col-7 align-self-start mt-2"></span>
                    </div>
                    <span class="placeholder col-4 rounded-pill mb-2"></span>
                    <span class="placeholder col-12"></span>
                </div>
            </div>
        `).join('');
        document.getElementById('listaTurmasMobile').innerHTML = `<div class="row g-3">${html}</div>`;
        document.getElementById('listaTurmasDesktop').innerHTML = `<div class="row row-cols-1 row-cols-md-2 row-cols-xl-4 g-4">${html}</div>`;
    }

    /* ── EMPTY STATE ── */
    function renderizarEmptyState(mensagem, botao) {
        const html = `
            <div class="col-12">
                <div class="text-center py-5 text-body-secondary" role="status" tabindex="-1">
                    <i class="bi bi-people fs-1 d-block mb-3 text-body-tertiary"></i>
                    <h3 class="h5 fw-semibold text-body">${mensagem || 'Nenhuma turma encontrada'}</h3>
                    <p class="mb-3">${botao || 'Nenhuma turma cadastrada neste interclasse ainda.'}</p>
                ${NIVEL_USUARIO === 0 ? '<button class="btn btn-primary px-4" data-bs-toggle="modal" data-bs-target="#exampleModal"><i class="bi bi-plus-lg me-1"></i>Criar Turma</button>' : ''}
                </div>
            </div>`;
        document.getElementById('listaTurmasMobile').innerHTML = html;
        document.getElementById('listaTurmasDesktop').innerHTML = html;
    }

    function renderizarErroTurmas() {
        const html = `
            <div class="col-12">
                <div class="alert alert-danger d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3 mb-0" role="alert" aria-live="assertive">
                    <span><i class="bi bi-exclamation-triangle me-2" aria-hidden="true"></i>Não foi possível carregar as turmas. Tente novamente.</span>
                    <button type="button" class="btn btn-outline-danger align-self-start align-self-sm-center" data-sgi-action="retry-turmas">Tentar novamente</button>
                </div>
            </div>`;
        document.getElementById('listaTurmasMobile').innerHTML = html;
        document.getElementById('listaTurmasDesktop').innerHTML = html;
    }

    /* ── RENDER CARD ── */
    function renderizarCard(turma, interclasse) {
        const avatarLetra = esc((turma.nome_turma || '').charAt(0).toUpperCase());
        const turno = esc(turma.turno_turma || '');

        const adminBtns = NIVEL_USUARIO === 0 ? `
            <div class="d-flex gap-1">
                <button class="btn btn-outline-secondary btn-sm" title="Editar" aria-label="Editar turma ${escAttr(turma.nome_turma)}" onclick='editarTurma(${turma.id_turma})'>
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-outline-danger btn-sm" title="Excluir" aria-label="Excluir turma ${escAttr(turma.nome_turma)}" onclick="abrirModalExcluir(${Number(turma.id_turma) || 0})">
                    <i class="bi bi-trash"></i>
                </button>
            </div>` : '';

        return `
            <div class="col">
                <article class="card h-100 border-0 shadow-sm p-3">
                    <div class="d-flex align-items-start gap-3 mb-3">
                        <div class="rounded-3 bg-primary text-white d-flex align-items-center justify-content-center flex-shrink-0 p-3 fs-5 fw-bold">${avatarLetra}</div>
                        <div class="flex-grow-1 sgi-u-min-width-0">
                            <h3 class="h6 fw-bold mb-1 text-truncate">${esc(turma.nome_turma)}</h3>
                            ${turma.nome_fantasia_turma ? `<p class="small text-body-secondary mb-0 text-truncate">${esc(turma.nome_fantasia_turma)}</p>` : ''}
                        </div>
                    </div>
                    <div class="d-flex flex-wrap gap-2 mb-3">
                        ${turno ? `<span class="badge rounded-pill text-bg-light text-body-secondary"><i class="bi bi-clock me-1"></i>${turno}</span>` : ''}
                        <span class="badge rounded-pill text-bg-light text-body-secondary"><i class="bi bi-bookmark me-1"></i>${esc(turma.nome_categoria || 'Categoria')}</span>
                        <span class="badge rounded-pill text-bg-light text-body-secondary"><i class="bi bi-people me-1"></i>${turma.qtd_alunos || 0}</span>
                    </div>
                    <div class="d-flex align-items-center justify-content-between gap-2 mt-auto pt-3 border-top">
                        ${adminBtns}
                        <a href="${APP_BASE}/turmas/alunos?id=${interclasse.id_interclasse}&id_turma=${turma.id_turma}&id_categoria=${turma.categorias_id_categoria}" class="btn btn-primary btn-sm ms-auto d-inline-flex align-items-center gap-1">
                            Ver detalhes <i class="bi bi-arrow-right"></i>
                        </a>
                    </div>
                </article>
            </div>`;
    }

    /* ── RENDER BY CATEGORY ── */
    function renderizarTurmas(turmas, interclasse) {
        if (!turmas.length) {
            renderizarEmptyState();
            return;
        }

        const grupos = {};
        turmas.forEach(t => {
            const chave = t.nome_categoria || 'Sem categoria';
            if (!grupos[chave]) grupos[chave] = [];
            grupos[chave].push(t);
        });

        let html = '';
        Object.entries(grupos).forEach(([catNome, lista]) => {
            const cardsHtml = lista.map(t => renderizarCard(t, interclasse)).join('');
            html += `
                <div class="mb-5">
                    <div class="d-flex align-items-center gap-2 mb-3 pb-2 border-bottom">
                        <h2 class="h5 fw-bold mb-0">${esc(catNome)}</h2>
                        <span class="badge rounded-pill text-bg-light text-body-secondary">${lista.length} turma${lista.length !== 1 ? 's' : ''}</span>
                    </div>
                    <div class="row row-cols-1 row-cols-md-2 row-cols-xl-4 g-4">
                        ${cardsHtml}
                    </div>
                </div>`;
        });

        document.getElementById('listaTurmasMobile').innerHTML = html;
        document.getElementById('listaTurmasDesktop').innerHTML = html;
    }

    /* ── FILTER ── */
    function filtrarTurmas() {
        if (carregandoTurmas || erroCarregamentoTurmas) return;
        const termo = (document.getElementById('buscaTurmaDesk').value || document.getElementById('buscaTurmaMob').value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const interclasse = window._interclasseCache;

        if (!termo) {
            renderizarTurmas(turmasData, interclasse);
            return;
        }

        const filtradas = turmasData.filter(t =>
            (t.nome_turma || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(termo) ||
            (t.nome_fantasia_turma || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(termo) ||
            (t.nome_categoria || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(termo)
        );

        if (!filtradas.length) {
            renderizarEmptyState(`Nenhum resultado para "${document.getElementById('buscaTurmaDesk').value || document.getElementById('buscaTurmaMob').value}"`, 'Tente buscar por nome, fantasia ou categoria.');
            return;
        }
        renderizarTurmas(filtradas, interclasse);
    }

    /* ── SYNC SEARCH ── */
    window.SGIPage.ready( () => {
        const desk = document.getElementById('buscaTurmaDesk');
        const mob = document.getElementById('buscaTurmaMob');
        pageScope.listen(desk, 'input', () => { mob.value = desk.value; filtrarTurmas(); });
        pageScope.listen(mob, 'input', () => { desk.value = mob.value; filtrarTurmas(); });

        const tentarNovamente = async (event) => {
            const botao = event.target.closest('[data-sgi-action="retry-turmas"]');
            if (!botao) return;
            event.preventDefault();
            if (carregandoTurmas) return;

            const lista = botao.closest('#listaTurmasMobile')
                || botao.closest('#listaTurmasDesktop');
            await carregarTurmasAtivas();

            const destino = lista?.querySelector('[data-sgi-action="retry-turmas"]')
                || lista?.querySelector('a[href]')
                || lista?.querySelector('[role="status"]');
            destino?.focus({ preventScroll: true });
        };
        pageScope.listen(document.getElementById('listaTurmasMobile'), 'click', tentarNovamente);
        pageScope.listen(document.getElementById('listaTurmasDesktop'), 'click', tentarNovamente);
    });

    /* ── MAIN LOAD ── */
    async function carregarTurmasAtivas() {
        if (carregandoTurmas) return;
        carregandoTurmas = true;
        const listas = [document.getElementById('listaTurmasMobile'), document.getElementById('listaTurmasDesktop')];
        listas.forEach((lista) => lista?.setAttribute('aria-busy', 'true'));
        renderizarSkeleton();

        try {
            const interclasse = await resolverInterclasse();
            if (!interclasse) {
                erroCarregamentoTurmas = false;
                renderizarEmptyState('Nenhum interclasse ativo.', 'Selecione um interclasse para ver as turmas.');
                return;
            }

            window._interclasseCache = interclasse;

            ['nomeInterclasseCategoria', 'nomeInterclasseCatMob'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerText = interclasse.nome_interclasse;
            });
            ['btnVoltarCatDesk', 'btnVoltarCatMob'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.href = `${APP_BASE}/painel?id=${interclasse.id_interclasse}`;
            });
            window.SGIInterclasse.updatePageTitle(interclasse.nome_interclasse);

                const turmasRes = await fetch(`${API_BASE}/turmas?id_interclasse=${interclasse.id_interclasse}`);
            if (!turmasRes.ok) {
                throw new Error(`HTTP ${turmasRes.status}`);
            }

            let listaFinal;
            try {
                listaFinal = await turmasRes.json();
            } catch (_) {
                throw new Error('Resposta inválida ao carregar as turmas.');
            }
            if (!Array.isArray(listaFinal) || !listaFinal.every((turma) =>
                turma && typeof turma === 'object' && !Array.isArray(turma) && turma.id_turma != null
            )) {
                throw new Error('Resposta inválida ao carregar as turmas.');
            }

            turmasData = listaFinal;
            erroCarregamentoTurmas = false;
            carregandoTurmas = false;

            if (!turmasData.length) {
                filtrarTurmas();
                return;
            }

            filtrarTurmas();
        } catch (error) {
            console.error(error);
            erroCarregamentoTurmas = true;
            renderizarErroTurmas();
        } finally {
            carregandoTurmas = false;
            listas.forEach((lista) => lista?.setAttribute('aria-busy', 'false'));
        }
    }

    /* ── CATEGORIAS MODAL ── */
    function preencherSelectCategorias(sel, categorias, selectedId) {
        sel.replaceChildren(new Option('Selecione...', ''));
        (categorias || []).forEach(cat => {
            const option = new Option(String(cat.nome_categoria || ''), String(cat.id_categoria || ''));
            if (selectedId != null && String(cat.id_categoria) === String(selectedId)) {
                option.selected = true;
            }
            sel.appendChild(option);
        });
    }

    async function carregarCategoriasModal() {
        try {
            const interclasse = await resolverInterclasse();
            if (!interclasse) return;

                const res = await fetch(`${API_BASE}/categorias?id_interclasse=${interclasse.id_interclasse}`);
            const categorias = await res.json();
            const sel = document.getElementById('categoriaTurma');
            preencherSelectCategorias(sel, categorias);
        } catch (error) {
            console.error('Erro ao carregar categorias:', error);
        }
    }

    pageScope.listen(document.getElementById('exampleModal'), 'show.bs.modal', () => {
        carregarCategoriasModal();
    });

    pageScope.listen(document.getElementById('formNovaTurma'), 'submit', async (e) => {
        e.preventDefault();
        try {
            const interclasse = await resolverInterclasse();
            if (!interclasse) {
                mostrarToast('Nenhum interclasse disponível.', 'error');
                return;
            }

            const body = {
                interclasses_id_interclasse: interclasse.id_interclasse,
                categorias_id_categoria: document.getElementById('categoriaTurma').value,
                nome_turma: document.getElementById('nomeTurma').value.trim(),
                nome_fantasia_turma: document.getElementById('nomeFantasia').value.trim() || null,
                turno_turma: document.getElementById('turnoTurma').value || null,
                status_turma: '1'
            };

            if (!body.categorias_id_categoria) {
                mostrarToast('Selecione uma categoria.', 'error');
                return;
            }

                const res = await fetch(`${API_BASE}/turmas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const data = await res.json();
            if (!data.success) throw new Error(data.message || 'Erro ao criar turma.');

            const pdf = document.getElementById('arquivoUpload').files?.[0];
            if (pdf) {
                const formData = new FormData();
                formData.append('pdf_arquivo', pdf);
                formData.append('nome_turma', body.nome_turma);
                formData.append('id_interclasse', String(interclasse.id_interclasse));
                formData.append('id_categoria', String(body.categorias_id_categoria));
                formData.append('id_turma', String(data.id_turma));
                const up = await fetch(`${API_BASE}/importacoes/turma-pdf`, {
                    method: 'POST',
                    body: formData
                });
                const upJson = await up.json().catch(() => ({}));
                if (!up.ok || upJson.success === false) {
                    mostrarToast('Turma criada, mas falha ao processar PDF.', 'info');
                } else {
                    mostrarToast('Turma criada e PDF processado com sucesso!', 'success');
                }
            } else {
                mostrarToast('Turma criada com sucesso!', 'success');
            }

            bootstrap.Modal.getInstance(document.getElementById('exampleModal')).hide();
            document.getElementById('formNovaTurma').reset();
            document.getElementById('nomeArquivo').textContent = '';
            carregarTurmasAtivas();
        } catch (error) {
            mostrarToast(error.message, 'error');
        }
    });

    /* ── CATEGORIAS EDIÇÃO ── */
    async function carregarCategoriasEdicao(selectedId) {
        try {
            const interclasse = await resolverInterclasse();
            if (!interclasse) return;
                const res = await fetch(`${API_BASE}/categorias?id_interclasse=${interclasse.id_interclasse}`);
            const cats = await res.json();
            const sel = document.getElementById('editCategoriaTurma');
            preencherSelectCategorias(sel, cats, selectedId);
        } catch (e) {
            console.error('Erro ao carregar categorias:', e);
        }
    }

    window.editarTurma = async function(idTurma) {
        const turma = turmasData.find(t => t.id_turma == idTurma);
        if (!turma) return;

        editTurmaId = turma.id_turma;
        document.getElementById('editNomeTurma').value = turma.nome_turma || '';
        document.getElementById('editNomeFantasia').value = turma.nome_fantasia_turma || '';
        document.getElementById('editTurnoTurma').value = turma.turno_turma || '';
        document.getElementById('msgEditarTurma').innerHTML = '';

        await carregarCategoriasEdicao(turma.categorias_id_categoria);

        const modal = new bootstrap.Modal(document.getElementById('modalEditarTurma'));
        modal.show();
    };

    pageScope.listen(document.getElementById('formEditarTurma'), 'submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btnSalvarEdicaoTurma');
        const msg = document.getElementById('msgEditarTurma');

        const nome = document.getElementById('editNomeTurma').value.trim();
        if (!nome) {
            msg.innerHTML = '<p class="text-danger text-center fw-bold mb-0">O nome não pode estar vazio.</p>';
            return;
        }

        const interclasse = await resolverInterclasse();
        if (!interclasse) {
            msg.innerHTML = '<p class="text-danger text-center fw-bold mb-0">Nenhum interclasse disponível.</p>';
            return;
        }

        const body = {
            id_turma: editTurmaId,
            nome_turma: nome,
            nome_fantasia_turma: document.getElementById('editNomeFantasia').value.trim() || null,
            turno_turma: document.getElementById('editTurnoTurma').value || null,
            categorias_id_categoria: parseInt(document.getElementById('editCategoriaTurma').value)
        };

        if (!body.categorias_id_categoria) {
            msg.innerHTML = '<p class="text-danger text-center fw-bold mb-0">Selecione uma categoria.</p>';
            return;
        }

        try {
            btn.disabled = true;
            btn.innerHTML = 'Salvando...';

                const resp = await fetch(`${API_BASE}/turmas`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await resp.json();

            if (data.success === false) throw new Error(data.message || 'Erro ao atualizar.');

            msg.innerHTML = '<p class="text-success text-center fw-bold mb-0">Salvo com sucesso!</p>';
            setTimeout(() => {
                bootstrap.Modal.getInstance(document.getElementById('modalEditarTurma')).hide();
                carregarTurmasAtivas();
            }, 800);
        } catch (err) {
            msg.innerHTML = `<p class="text-danger text-center fw-bold mb-0">${esc(err.message)}</p>`;
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Salvar Alterações';
        }
    });

    /* ── EXCLUSÃO COM MODAL ── */
    let excluirIdPendente = null;

    window.abrirModalExcluir = function(idTurma) {
        const turma = turmasData.find(item => Number(item.id_turma) === Number(idTurma));
        const nomeTurma = turma ? turma.nome_turma : '';
        excluirIdPendente = idTurma;
        document.getElementById('excluirTurmaNome').textContent = nomeTurma;
        const modal = new bootstrap.Modal(document.getElementById('modalExcluirTurma'));
        modal.show();
    };

    pageScope.listen(document.getElementById('btnConfirmarExclusao'), 'click', async () => {
        if (!excluirIdPendente) return;

        const btn = document.getElementById('btnConfirmarExclusao');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Excluindo...';

        try {
                const res = await fetch(`${API_BASE}/turmas?id_turma=${excluirIdPendente}`, { method: 'DELETE' });
            const texto = await res.text();
            let data = null;
            try { data = JSON.parse(texto); } catch (_) {}

            if (!res.ok || !data || data.success === false) {
                throw new Error(data?.message || 'Não é possível excluir esta turma pois existem registros vinculados a ela.');
            }

            bootstrap.Modal.getInstance(document.getElementById('modalExcluirTurma')).hide();
            mostrarToast('Turma excluída com sucesso!', 'success');
            excluirIdPendente = null;
            await carregarTurmasAtivas();
        } catch (error) {
            mostrarToast(error.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Sim, excluir';
        }
    });

    pageScope.listen(document.getElementById('modalExcluirTurma'), 'hidden.bs.modal', () => {
        excluirIdPendente = null;
    });

    ['buscaTurmaMob', 'buscaTurmaDesk'].forEach((id) => {
        const input = document.getElementById(id);
        if (input) pageScope.listen(input, 'input', filtrarTurmas);
    });
    const arquivoUpload = document.getElementById('arquivoUpload');
    if (arquivoUpload) pageScope.listen(arquivoUpload, 'change', mostrarNomeArquivo);

    /* ── INIT ── */
    window.SGIPage.ready( carregarTurmasAtivas);

return {mostrarToast, resolverInterclasse, esc, mostrarNomeArquivo, renderizarSkeleton, renderizarEmptyState, renderizarCard, renderizarTurmas, filtrarTurmas, carregarTurmasAtivas, carregarCategoriasModal, carregarCategoriasEdicao};
});
