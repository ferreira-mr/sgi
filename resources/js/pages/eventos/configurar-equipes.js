window.SGIPage.mount("eventos/configurar-equipes", function (pageConfig, pageScope) {

    const APP_BASE = String(window.SGI_BASE_PATH || '').replace(/\/+$/, '');
    const API = String(window.SGI_API_BASE || `${APP_BASE}/api/v1/`).replace(/\/?$/, '/');
    const params = new URLSearchParams(window.location.search);
    let idInterclasseEq = params.get('id');
    const idCategoriaUrl = params.get('id_categoria');
    const isAdmin = pageConfig.value2;

    let modalidadesCache = [];
    let turmasCache = [];
    const cardsAbertos = new Map();

    if (idInterclasseEq) {
        ['btnVoltarEquipesMobile', 'btnVoltarEquipesDesk'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.href = `${APP_BASE}/painel?id=${idInterclasseEq}`;
        });
    }

    function esc(s) {
        return window.SGIHtml.escape(s);
    }

    function infoEquipe(eq) {
        const excedeu = eq.excedeu_limite === true || eq.excedeu_limite === '1' || eq.excedeu_limite === 1;
        const total = Number(eq.total_alunos) || 0;
        const limite = Number(eq.limite_maximo) || 0;
        let contador = '';
        if (limite > 0) {
            const cor = excedeu ? 'text-danger' : 'text-success';
            contador = `<span class="small fw-semibold ${cor}"><i class="bi bi-people-fill me-1"></i>${total}/${limite}</span>`;
        }
        return { excedeu, contador };
    }

    function obterIdCategoriaFiltro() {
        const btn = document.querySelector('#filtroCategoria .active, #filtroCategoriaMobile .active');
        return btn?.dataset.id || '';
    }

    function ativarCategoria(btn) {
        if (!btn) return;
        const id = btn.dataset.id;
        ['filtroCategoria', 'filtroCategoriaMobile'].forEach(idContainer => {
            const c = document.getElementById(idContainer);
            if (!c) return;
            c.querySelectorAll('button').forEach(b => {
            const selected = b.dataset.id === id;
            b.classList.toggle('active', selected);
            b.setAttribute('aria-pressed', selected ? 'true' : 'false');
            });
        });
    }

    async function carregarCategorias() {
        if (!idInterclasseEq) return;
        try {
            const res = await fetch(`${API}categorias?id_interclasse=${encodeURIComponent(idInterclasseEq)}`);
            const cats = await res.json();
            const lista = Array.isArray(cats) ? cats : [];

            const btns = lista.map(c =>
                `<button type="button" class="btn btn-sm btn-outline-primary btn-filter-cat" data-id="${c.id_categoria}" aria-pressed="false">${esc(c.nome_categoria)}</button>`
            ).join('');

            const desk = document.getElementById('filtroCategoria');
            const mob = document.getElementById('filtroCategoriaMobile');
            if (desk) desk.innerHTML = btns;
            if (mob) mob.innerHTML = btns;

            const btnAlvo = document.querySelector(
                `#filtroCategoria [data-id="${idCategoriaUrl}"], #filtroCategoriaMobile [data-id="${idCategoriaUrl}"]`
            ) || document.querySelector('#filtroCategoria button, #filtroCategoriaMobile button');
            if (btnAlvo) ativarCategoria(btnAlvo);
        } catch (e) {
            console.error('Erro ao carregar categorias:', e);
        }
    }

    function montarCard(m, turmas, equipesPorTurma) {
        let htmlTurmas = '';

        if (!turmas.length) {
            htmlTurmas = '<p class="text-muted small mb-0">Nenhuma turma vinculada a esta modalidade.</p>';
        } else {
            htmlTurmas = turmas.map(t => {
                const idTurma = String(t.id_turma);
                const eqsTurma = equipesPorTurma[idTurma] || [];
                const qtd = eqsTurma.length;
                const temExcedida = eqsTurma.some(eq => infoEquipe(eq).excedeu);
                return `<div class="turma-equipe-item d-flex align-items-center justify-content-between gap-3 p-3 mb-2 border rounded-3 bg-body" data-turma-card data-mod="${m.id_modalidade}" data-turma="${idTurma}">
                        <div>
                            <div class="fw-semibold">${esc(t.nome_turma)}</div>
                            <div class="small text-secondary d-inline-flex align-items-center gap-1 fw-semibold"><i class="bi bi-people-fill"></i>${qtd} equipe${qtd === 1 ? '' : 's'}${temExcedida ? '<i class="fas fa-exclamation-triangle text-danger small" title="Esta turma possui equipe com estudantes acima do limite"></i>' : ''}</div>
                        </div>
                        <button type="button" class="btn btn-outline-primary btn-sm ver-equipes-btn" data-mod="${m.id_modalidade}" data-turma="${idTurma}" data-turma-nome="${esc(t.nome_turma)}" title="Ver equipes">
                            <i class="fas fa-users-cog"></i>
                        </button>
                    </div>`;
            }).join('');
        }

        return `<div class="col w-100">
        <article class="aluno-card card h-100 border-0 shadow-sm rounded-4 overflow-hidden" data-mod="${m.id_modalidade}" data-mod-cat="${m.categorias_id_categoria}" data-mod-nome="${esc(m.nome_modalidade)}">
            <div class="card-header border-0 bg-body-tertiary d-flex align-items-center justify-content-between gap-2 p-3">
                <span>${esc(m.nome_modalidade)}</span>
                <button type="button" class="btn btn-outline-secondary btn-sm aluno-voltar-btn voltar-btn" title="Voltar às turmas">
                    <i class="bi bi-arrow-left"></i>
                </button>
            </div>
            <div class="card-body p-3">
                <div class="aluno-card-view turmas-view active">${htmlTurmas}</div>
                <div class="aluno-card-view equipes-view">
                    <div class="aluno-equipes-content"></div>
                </div>
            </div>
        </article>
        </div>`;
    }

    function montarEquipesHtml(eqs, card) {
        if (!eqs.length) {
            return '<p class="text-muted small text-center py-3">Nenhuma equipe nesta turma.</p>';
        }
        const modId = card.dataset.mod;
        const modCat = card.dataset.modCat;
        const modNome = card.dataset.modNome;
        return eqs.map(eq => {
            const info = infoEquipe(eq);
            const qElenco = new URLSearchParams({
                id: idInterclasseEq,
                id_equipe: String(eq.id_equipe),
                id_turma: String(eq.turmas_id_turma),
                id_modalidade: String(modId),
                id_categoria: String(modCat),
                nome_turma: eq.nome_turma || '',
                nome_modalidade: modNome || ''
            });
            const hrefElenco = `${APP_BASE}/equipes/elenco?${qElenco.toString()}`;
            return `<div class="d-flex align-items-center justify-content-between gap-3 p-3 mb-2 border rounded-3 bg-body ${info.excedeu ? 'border-danger-subtle bg-danger-subtle text-danger-emphasis' : ''}">
                    <div>
                        <div class="aluno-equipe-nome">${esc(eq.nome_equipe || eq.nome_turma)}</div>
                        <div>${info.contador}</div>
                    </div>
                    <div class="d-flex gap-1">
                        <a class="btn btn-outline-primary btn-sm" href="${hrefElenco}" title="Ver elenco"><i class="bi bi-people-fill"></i></a>
                        ${isAdmin ? `<button type="button" class="btn btn-outline-danger btn-sm" data-sgi-action="delete-equipe" data-id-equipe="${eq.id_equipe}" data-nome-equipe="${esc(eq.nome_turma || 'Turma')}" title="Excluir equipe"><i class="bi bi-trash"></i></button>` : ''}
                    </div>
                </div>`;
        }).join('');
    }

    async function abrirEquipes(cardEl, modId, turmaId) {
        if (!cardEl) return;
        const turmasView = cardEl.querySelector('.turmas-view');
        const equipesView = cardEl.querySelector('.equipes-view');
        const content = cardEl.querySelector('.aluno-equipes-content');
        if (!equipesView || !content) return;

        cardsAbertos.set(String(modId), String(turmaId));
        cardEl.classList.add('equipes-aberta');
        if (turmasView) turmasView.classList.remove('active');
        equipesView.classList.add('active');

        content.innerHTML = '<p class="text-muted small text-center py-3"><i class="bi bi-hourglass-split me-1"></i>Carregando equipes…</p>';
        try {
        const rEq = await fetch(`${API}equipes?id_modalidade=${encodeURIComponent(modId)}&id_turma=${encodeURIComponent(turmaId)}&_t=${Date.now()}`);
            const equipes = await rEq.json();
            const arr = Array.isArray(equipes) ? equipes : [];
            content.innerHTML = montarEquipesHtml(arr, cardEl);
        } catch (e) {
            console.error(e);
            content.innerHTML = '<p class="text-danger small text-center py-3">Erro ao carregar as equipes.</p>';
        }
    }

    function voltarTurmas(cardEl) {
        if (!cardEl) return;
        const turmasView = cardEl.querySelector('.turmas-view');
        const equipesView = cardEl.querySelector('.equipes-view');
        if (turmasView) turmasView.classList.add('active');
        if (equipesView) equipesView.classList.remove('active');
        cardEl.classList.remove('equipes-aberta');
        cardsAbertos.delete(String(cardEl.dataset.mod));
    }

    function restaurarCardsAbertos(container) {
        if (!container) return;
        cardsAbertos.forEach((turmaId, modId) => {
            const cardEl = container.querySelector(`.aluno-card[data-mod="${modId}"]`);
            if (cardEl) abrirEquipes(cardEl, modId, turmaId);
        });
    }

    function handleCardClick(e) {
        const btnExcluir = e.target.closest('[data-sgi-action="delete-equipe"]');
        if (btnExcluir) {
            e.stopPropagation();
            window.excluirEquipe(btnExcluir.dataset.idEquipe, btnExcluir.dataset.nomeEquipe);
            return;
        }
        const btnEquipes = e.target.closest('.ver-equipes-btn');
        if (btnEquipes) {
            abrirEquipes(btnEquipes.closest('.aluno-card'), btnEquipes.dataset.mod, btnEquipes.dataset.turma);
            return;
        }
        const turmaCard = e.target.closest('[data-turma-card]');
        if (turmaCard) {
            abrirEquipes(turmaCard.closest('.aluno-card'), turmaCard.dataset.mod, turmaCard.dataset.turma);
            return;
        }
        const btnVoltar = e.target.closest('.voltar-btn');
        if (btnVoltar) {
            voltarTurmas(btnVoltar.closest('.aluno-card'));
        }
    }

    async function carregarEquipes() {
        const mob = document.getElementById('listaEquipesMobile');
        const desk = document.getElementById('listaEquipesDesktop');
        if (!idInterclasseEq) {
            mob.innerHTML = '<p class="text-muted text-center">Nenhuma edição selecionada.</p>';
            desk.innerHTML = '<div class="text-center py-5 text-body-secondary"><i class="bi bi-folder-x fs-1 d-block mb-3" aria-hidden="true"></i><h5 class="fw-semibold mb-2">Nenhuma edição</h5><p class="small mb-0">Selecione um interclasse para ver as equipes.</p></div>';
            return;
        }

        const dados = await window.SGIInterclasse.getInterclasseById(idInterclasseEq);
        if (dados?.nome_interclasse) {
            document.getElementById('nomeInterclasseEquipes').textContent = dados.nome_interclasse;
            ['nomeInterclasseEquipesMob', 'nomeInterclasseEquipesDesk'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = dados.nome_interclasse;
            });
            window.SGIInterclasse.updatePageTitle(dados.nome_interclasse);
        }

        mob.innerHTML = '<p class="text-muted text-center">Carregando…</p>';
        desk.innerHTML = '<div class="text-center py-5 text-body-secondary"><span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Carregando...</div>';

        const idCategoriaFiltro = obterIdCategoriaFiltro();

        try {
            if (isAdmin) {
                await fetch(`${API}equipes/gerar`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id_interclasse: parseInt(idInterclasseEq) })
                });
            }

            let urlTurmas = `${API}turmas?id_interclasse=${encodeURIComponent(idInterclasseEq)}`;
            if (idCategoriaFiltro) {
                urlTurmas += `&id_categoria=${encodeURIComponent(idCategoriaFiltro)}`;
            }
            const resTurmas = await fetch(urlTurmas);
            const turmasRaw = await resTurmas.json();
            const turmas = Array.isArray(turmasRaw) ? turmasRaw : [];

            let urlMod = `${API}modalidades?id_interclasse=${encodeURIComponent(idInterclasseEq)}`;
            if (idCategoriaFiltro) {
                urlMod += `&id_categoria=${encodeURIComponent(idCategoriaFiltro)}`;
            }
            const resMod = await fetch(urlMod);
            const modsRaw = await resMod.json();
            const mods = Array.isArray(modsRaw) ? modsRaw : [];

            if (!mods.length) {
                mob.innerHTML = '<p class="text-muted text-center w-100">Nenhuma modalidade encontrada para o filtro selecionado.</p>';
                desk.innerHTML = '<div class="text-center py-5 text-body-secondary"><i class="bi bi-folder-x fs-1 d-block mb-3" aria-hidden="true"></i><h5 class="fw-semibold mb-2">Nenhuma modalidade</h5><p class="small mb-0">Nenhuma modalidade encontrada para o filtro selecionado.</p></div>';
                return;
            }

            const porCategoria = {};
            mods.forEach(m => {
                const cat = m.nome_categoria || 'Categoria';
                if (!porCategoria[cat]) porCategoria[cat] = [];
                porCategoria[cat].push(m);
            });

            let htmlMob = '';
            let htmlDesk = '';

            for (const [, listaMod] of Object.entries(porCategoria)) {
                for (const m of listaMod) {
                    const rEq = await fetch(`${API}equipes?id_modalidade=${encodeURIComponent(m.id_modalidade)}&_t=${Date.now()}`);
                    const equipes = await rEq.json();
                    const arr = Array.isArray(equipes) ? equipes : [];

                    const equipesPorTurma = {};
                    arr.forEach(eq => {
                        const chave = String(eq.turmas_id_turma);
                        if (!equipesPorTurma[chave]) equipesPorTurma[chave] = [];
                        equipesPorTurma[chave].push(eq);
                    });

                    const turmasDaModalidade = turmas.filter(
                        t => String(t.categorias_id_categoria) === String(m.categorias_id_categoria)
                    );

                    const card = montarCard(m, turmasDaModalidade, equipesPorTurma);
                    htmlMob += card;
                    htmlDesk += card;
                }
            }

            mob.innerHTML = htmlMob;
            desk.innerHTML = htmlDesk ? `<div class="row row-cols-1 row-cols-lg-2 g-4">${htmlDesk}</div>` : '';

            restaurarCardsAbertos(mob);
            restaurarCardsAbertos(desk);
        } catch (e) {
            console.error(e);
            mob.innerHTML = '<p class="text-danger text-center">Erro ao carregar equipes.</p>';
            desk.innerHTML = '<p class="text-danger">Erro ao carregar equipes.</p>';
        }
    }

    function filtrarTurmasPorModalidade() {
        const selMod = document.getElementById('selectModalidadeEquipe');
        const selTurma = document.getElementById('selectTurmaEquipe');
        const idModalidade = selMod.value;

        if (!idModalidade) {
            selTurma.innerHTML = '<option value="" selected disabled>Selecione uma modalidade primeiro</option>';
            selTurma.disabled = true;
            return;
        }

        const mod = modalidadesCache.find(m => String(m.id_modalidade) === idModalidade);
        const idCategoria = mod ? String(mod.categorias_id_categoria) : null;

        const turmasFiltradas = idCategoria
            ? turmasCache.filter(t => String(t.categorias_id_categoria) === idCategoria)
            : turmasCache;

        selTurma.innerHTML = turmasFiltradas.length
            ? '<option value="" selected disabled>Selecione a turma</option>' + turmasFiltradas.map(t =>
                `<option value="${t.id_turma}">${esc(t.nome_turma)}</option>`
              ).join('')
            : '<option value="" selected disabled>Nenhuma turma nesta categoria</option>';
        selTurma.disabled = !turmasFiltradas.length;
    }

    async function carregarSelectsEquipe() {
        if (!idInterclasseEq) return;
        try {
            const [resMod, resTurmas] = await Promise.all([
                fetch(`${API}modalidades?id_interclasse=${encodeURIComponent(idInterclasseEq)}`),
                fetch(`${API}turmas?id_interclasse=${encodeURIComponent(idInterclasseEq)}`)
            ]);
            const modalidades = await resMod.json();
            const turmas = await resTurmas.json();

            modalidadesCache = Array.isArray(modalidades) ? modalidades.filter(
                m => String(m.interclasses_id_interclasse) === String(idInterclasseEq)
            ) : [];
            turmasCache = Array.isArray(turmas) ? turmas : [];

            const selMod = document.getElementById('selectModalidadeEquipe');
            selMod.innerHTML = modalidadesCache.length
                ? '<option value="" selected disabled>Selecione a modalidade</option>' + modalidadesCache.map(m => {
                    const cat = m.nome_categoria ? ` — ${esc(m.nome_categoria)}` : '';
                    return `<option value="${m.id_modalidade}">${esc(m.nome_modalidade)}${cat} (${esc(m.genero_modalidade)})</option>`;
                  }).join('')
                : '<option value="" selected disabled>Nenhuma modalidade encontrada</option>';
            selMod.disabled = !modalidadesCache.length;

            filtrarTurmasPorModalidade();
        } catch (e) {
            console.error('Erro ao carregar selects:', e);
        }
    }

    pageScope.listen(document.getElementById('formCriarEquipe'), 'submit', async function(e) {
        e.preventDefault();
        const idModalidade = document.getElementById('selectModalidadeEquipe').value;
        const idTurma = document.getElementById('selectTurmaEquipe').value;
        const msg = document.getElementById('msgCriarEquipe');
        const btn = document.getElementById('btnSalvarEquipe');

        if (!idModalidade || !idTurma) {
            msg.innerHTML = '<span class="text-danger">Selecione a modalidade e a turma.</span>';
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Criando…';
        msg.innerHTML = '';

        try {
                const resp = await fetch(`${API}equipes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    acao: 'criar_equipe',
                    modalidades_id_modalidade: Number(idModalidade),
                    turmas_id_turma: Number(idTurma),
                    status_equipe: '1'
                })
            });
            const data = await resp.json();
            if (data.success === false) throw new Error(data.message || 'Erro ao criar equipe.');

            bootstrap.Modal.getInstance(document.getElementById('modalCriarEquipe')).hide();
            this.reset();
            carregarEquipes();
        } catch (err) {
            msg.innerHTML = `<span class="text-danger">${esc(err.message)}</span>`;
        } finally {
            btn.disabled = false;
            btn.textContent = 'Criar equipe';
        }
    });

    pageScope.listen(document.getElementById('modalCriarEquipe'), 'show.bs.modal', carregarSelectsEquipe);
    pageScope.listen(document.getElementById('selectModalidadeEquipe'), 'change', filtrarTurmasPorModalidade);

    pageScope.listen(document.getElementById('filtroCategoria'), 'click', function(e) {
        const btn = e.target.closest('button');
        if (!btn) return;
        ativarCategoria(btn);
        carregarEquipes();
    });
    pageScope.listen(document.getElementById('filtroCategoriaMobile'), 'click', function(e) {
        const btn = e.target.closest('button');
        if (!btn) return;
        ativarCategoria(btn);
        carregarEquipes();
    });

    ['listaEquipesMobile', 'listaEquipesDesktop'].forEach(id => {
        const el = document.getElementById(id);
        if (el) pageScope.listen(el, 'click', handleCardClick);
    });

    window.excluirEquipe = async function(id, nome) {
        if (!await SGI.confirm({ titulo: 'Excluir equipe?', mensagem: `A equipe "${nome}" será excluída.`, textoConfirmar: 'Excluir equipe', destrutivo: true })) return;
        try {
                const resp = await fetch(`${API}equipes`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_equipe: id })
            });
            const data = await resp.json();
            if (data.success === false) throw new Error(data.message || 'Erro ao excluir.');
            carregarEquipes();
        } catch (err) {
            SGI.alert(err.message);
        }
    };

    pageScope.listen(window, 'pageshow', async () => {
        if (!isAdmin) {
            const btnMob = document.getElementById('btnCriarEquipeMob');
            const btnDesk = document.getElementById('btnCriarEquipeDesk');
            if (btnMob) btnMob.style.display = 'none';
            if (btnDesk) btnDesk.style.display = 'none';
        }
        if (!idInterclasseEq) {
            const resolved = await window.SGIInterclasse.resolveId();
            if (resolved) {
                idInterclasseEq = resolved;
                ['btnVoltarEquipesMobile', 'btnVoltarEquipesDesk'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.href = `${APP_BASE}/painel?id=${idInterclasseEq}`;
                });
            }
        }
        await carregarCategorias();
        carregarEquipes();
    });

return {esc, infoEquipe, obterIdCategoriaFiltro, ativarCategoria, carregarCategorias, montarCard, montarEquipesHtml, abrirEquipes, voltarTurmas, restaurarCardsAbertos, handleCardClick, carregarEquipes, filtrarTurmasPorModalidade, carregarSelectsEquipe};
});
