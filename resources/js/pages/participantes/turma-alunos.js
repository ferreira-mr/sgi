window.SGIPage.mount("participantes/turma-alunos", function (pageConfig, pageScope) {

    const APP_BASE = String(window.SGI_BASE_PATH || '').replace(/\/+$/, '');
    const API = String(window.SGI_API_BASE || `${APP_BASE}/api/v1/`).replace(/\/?$/, '/');
    const caminhoApp = (path, parametros) => `${APP_BASE}/${String(path).replace(/^\/+/, '')}${parametros ? `?${parametros.toString()}` : ''}`;
    const params = new URLSearchParams(window.location.search);
    const idInterclasse = Number(params.get('id') || 0);
    const idCategoria = Number(params.get('id_categoria') || 0);
    const idTurma = Number(params.get('id_turma') || 0);
    const podeGerenciar = pageConfig.value2;
    const podeExcluir   = pageConfig.value3;
    const podeResetarSenha = pageConfig.value4;

    const POR_PAGINA = 10;
    let alunosTodos = [];
    let alunosMap = {};
    let paginaAtual = 1;
    let carregandoAlunos = false;
    let alunosCarregados = false;
    let erroAlunos = '';
    let gatilhoModalDetalhesAluno = null;
    const modalDetalhesAluno = document.getElementById('modalVerAluno');

    pageScope.listen(modalDetalhesAluno, 'hidden.bs.modal', () => {
        if (gatilhoModalDetalhesAluno?.isConnected
            && !gatilhoModalDetalhesAluno.disabled
            && gatilhoModalDetalhesAluno.getClientRects().length) {
            gatilhoModalDetalhesAluno.focus();
        }
        gatilhoModalDetalhesAluno = null;
    });

    function esc(s) {
        const d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function escAttr(s) {
        return esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function normalizar(s) {
        return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    function generoLabel(g) {
        if (g === 'FEM') return 'Feminino';
        if (g === 'MASC') return 'Masculino';
        return 'Não informado';
    }

    function formatarData(s) {
        if (!s) return '—';
        const partes = String(s).split('-');
        return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : s;
    }

    function setNomeTurma(nome) {
        ['nomeTurmaDesk', 'nomeTurmaMob'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = nome;
        });
    }

    function setVoltar() {
        const q = new URLSearchParams();
        if (idInterclasse) q.set('id', idInterclasse);
        if (idCategoria) q.set('id_categoria', idCategoria);
        const href = caminhoApp(idCategoria ? 'turmas' : 'edicoes/turmas', q);
        ['btnVoltarTurmaAlunosMob', 'btnVoltarTurmaAlunosDesk'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.href = href;
        });
    }

    async function carregarNomeInterclasseTurmaAlunos() {
        if (!idInterclasse) return;
        try {
            const dados = await window.SGIInterclasse.getInterclasseById(idInterclasse);
            const nome = dados?.nome_interclasse || 'Interclasse';
            ['nomeInterclasseTurmaAlunosMob', 'nomeInterclasseTurmaAlunosDesk'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerText = nome;
            });
        } catch (e) {}
    }

    async function carregarAlunos() {
        if (carregandoAlunos) return;
        carregandoAlunos = true;
        erroAlunos = '';
        renderizarAlunos();
        await carregarNomeInterclasseTurmaAlunos();
        setVoltar();
        if (!idTurma || isNaN(idTurma) || !idInterclasse || isNaN(idInterclasse)) {
            erroAlunos = 'Não foi possível abrir a lista desta turma. Confira os dados da página e tente novamente.';
            carregandoAlunos = false;
            renderizarAlunos();
            return;
        }
        let nomeTurma = '';
        try {
            const rT = await fetch(`${API}turmas?id_turma=${encodeURIComponent(idTurma)}&id_interclasse=${encodeURIComponent(idInterclasse)}`);
            const textTurmas = await rT.text();
            let turmas = null;
            try { turmas = JSON.parse(textTurmas || 'null'); } catch (_) { turmas = null; }
            const t = Array.isArray(turmas) ? turmas[0] : null;
            nomeTurma = t?.nome_turma || 'Turma';
        } catch (_) {
        }
        setNomeTurma(nomeTurma);

        try {
            const r = await fetch(`${API}usuarios?acao=listar_competidores&id_turma=${encodeURIComponent(idTurma)}&id_interclasse=${encodeURIComponent(idInterclasse)}`);
            if (!r.ok) throw new Error('Não foi possível carregar os estudantes desta turma.');
            let data;
            try {
                data = await r.json();
            } catch (_) {
                throw new Error('Não foi possível carregar os estudantes desta turma.');
            }
            if (data && typeof data === 'object' && data.success === false) {
                throw new Error('Não foi possível carregar os estudantes desta turma.');
            }
            const lista = Array.isArray(data) ? data
                : (Array.isArray(data?.competidores) ? data.competidores
                    : (Array.isArray(data?.usuarios) ? data.usuarios : null));
            if (!lista || !lista.every(aluno =>
                aluno && typeof aluno === 'object' && !Array.isArray(aluno) && aluno.id_usuario != null
            )) throw new Error('Não foi possível carregar os estudantes desta turma.');

            alunosTodos = lista;
            alunosMap = {};
            alunosTodos.forEach(a => { alunosMap[a.id_usuario] = a; });
            alunosCarregados = true;
            paginaAtual = 1;
        } catch (e) {
            console.error(e);
            erroAlunos = e.message || 'Não foi possível carregar os estudantes desta turma.';
        } finally {
            carregandoAlunos = false;
            renderizarAlunos();
        }
    }

    function aplicarFiltro() {
        paginaAtual = 1;
        renderizarAlunos();
    }

    function renderizarAlunos() {
        const termo = normalizar(
            document.getElementById('buscaAlunoDesk')?.value
            || document.getElementById('buscaAlunoMob')?.value
            || ''
        );
        const filtrados = termo
            ? alunosTodos.filter(a => normalizar((a.nome_usuario || '') + ' ' + (a.matricula_usuario || '')).includes(termo))
            : alunosTodos;

        const total = filtrados.length;
        const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
        if (paginaAtual > totalPaginas) paginaAtual = totalPaginas;

        const ini = (paginaAtual - 1) * POR_PAGINA;
        const pagina = filtrados.slice(ini, ini + POR_PAGINA);

        const mob = document.getElementById('listaAlunosTurmaMob');
        const desk = document.getElementById('tbodyAlunosTurmaDesk');

        const erroMob = `<div class="alert alert-danger d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3 mb-3" role="alert">
            <span>${esc(erroAlunos || 'Não foi possível carregar os estudantes desta turma.')}</span>
            <button type="button" class="btn btn-outline-danger align-self-start align-self-sm-center" data-sgi-action="retry-roster">Tentar novamente</button>
        </div>`;
        const erroDesk = `<tr><td colspan="4"><div class="alert alert-danger d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3 mb-0" role="alert">
            <span>${esc(erroAlunos || 'Não foi possível carregar os estudantes desta turma.')}</span>
            <button type="button" class="btn btn-outline-danger align-self-start align-self-sm-center" data-sgi-action="retry-roster">Tentar novamente</button>
        </div></td></tr>`;
        const atualizandoMob = carregandoAlunos ? '<div class="small text-body-secondary" role="status">Atualizando a lista…</div>' : '';
        const atualizandoDesk = carregandoAlunos ? '<tr><td colspan="4" class="small text-body-secondary" role="status">Atualizando a lista…</td></tr>' : '';

        if (!alunosCarregados && carregandoAlunos) {
            const carregando = '<div class="text-center py-5 text-body-secondary" role="status"><span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Carregando estudantes…</div>';
            mob.innerHTML = carregando;
            desk.innerHTML = `<tr><td colspan="4">${carregando}</td></tr>`;
            return;
        }
        if (!alunosCarregados && erroAlunos) {
            mob.innerHTML = erroMob;
            desk.innerHTML = erroDesk;
            return;
        }

        if (!total) {
            const vazio = termo
                ? '<i class="bi bi-search"></i><p><strong>Nenhum resultado para sua busca.</strong></p><p class="small text-muted">Limpe a busca para ver todos os estudantes.</p><button type="button" class="btn btn-outline-primary btn-sm" data-sgi-action="clear-roster-search">Limpar busca</button>'
                : '<i class="bi bi-people"></i><p><strong>Nenhum estudante cadastrado nesta turma.</strong></p><p class="small text-muted">Clique em "Adicionar estudante" ou importe um PDF para começar.</p>';
            mob.innerHTML = `${erroAlunos ? erroMob : ''}${atualizandoMob}<div class="text-center py-5 text-body-secondary">${vazio}</div>`;
            desk.innerHTML = `${erroAlunos ? erroDesk : ''}${atualizandoDesk}<tr><td colspan="4"><div class="text-center py-5 text-body-secondary">${vazio}</div></td></tr>`;
        } else {
            const acoesMob = (u) => `
                <div class="d-flex gap-1">
                    <button type="button" class="btn btn-sm btn-light border text-primary px-2 py-1" data-bs-toggle="tooltip" title="Visualizar" aria-label="Visualizar estudante" data-sgi-action="view-student" data-id-usuario="${esc(u.id_usuario)}">
                        <i class="bi bi-eye"></i>
                    </button>
                    ${podeGerenciar ? `
                    <button type="button" class="btn btn-sm btn-light border text-secondary px-2 py-1" data-bs-toggle="tooltip" title="Editar" aria-label="Editar estudante ${escAttr(u.nome_usuario)}" data-sgi-action="edit-student" data-id-usuario="${esc(u.id_usuario)}">
                        <i class="bi bi-pencil"></i>
                    </button>` : ''}
                    ${podeExcluir ? `
                    <button type="button" class="btn btn-sm btn-light border text-danger px-2 py-1" data-bs-toggle="tooltip" title="Excluir" aria-label="Excluir estudante ${escAttr(u.nome_usuario)}" data-sgi-action="delete-student" data-id-usuario="${esc(u.id_usuario)}">
                        <i class="bi bi-trash"></i>
                    </button>` : ''}
                    ${podeResetarSenha ? `
                    <button type="button" class="btn btn-sm btn-light border text-warning-emphasis px-2 py-1" data-bs-toggle="tooltip" title="Resetar senha" aria-label="Resetar senha do estudante" data-sgi-action="reset-student-password" data-id-usuario="${esc(u.id_usuario)}">
                        <i class="bi bi-key-fill"></i>
                    </button>` : ''}
                </div>`;

            mob.innerHTML = `${erroAlunos ? erroMob : ''}${atualizandoMob}` + pagina.map((u) => `
                <div class="card border shadow-sm p-3 d-flex flex-row align-items-center gap-3${Number(u.inscrito || 0) === 0 ? ' border-danger bg-danger-subtle' : ''}">
                    <div class="rounded-circle bg-danger-subtle text-danger-emphasis fw-semibold fs-5 d-flex align-items-center justify-content-center flex-shrink-0 p-2">${esc((u.nome_usuario || 'A').charAt(0)).toUpperCase()}</div>
                    <div class="flex-grow-1 overflow-hidden">
                        <div class="fw-semibold text-body text-truncate">${esc(u.nome_usuario)}${Number(u.inscrito || 0) === 0 ? '<span class="badge rounded-pill text-bg-danger ms-2">Sem inscrição</span>' : ''}</div>
                        <div class="small text-body-secondary">${esc(u.matricula_usuario || '—')} · ${esc(generoLabel(u.genero_usuario))}</div>
                    </div>
                    ${acoesMob(u)}
                </div>`).join('');

            const acoesDesk = (u) => `
                <div class="d-flex gap-1 justify-content-center">
                    <button type="button" class="btn btn-sm btn-light border text-primary px-2 py-1" data-bs-toggle="tooltip" title="Visualizar" aria-label="Visualizar estudante" data-sgi-action="view-student" data-id-usuario="${esc(u.id_usuario)}">
                        <i class="bi bi-eye"></i>
                    </button>
                    ${podeGerenciar ? `
                    <button type="button" class="btn btn-sm btn-light border text-secondary px-2 py-1" data-bs-toggle="tooltip" title="Editar" aria-label="Editar estudante ${escAttr(u.nome_usuario)}" data-sgi-action="edit-student" data-id-usuario="${esc(u.id_usuario)}">
                        <i class="bi bi-pencil"></i>
                    </button>` : ''}
                    ${podeExcluir ? `
                    <button type="button" class="btn btn-sm btn-light border text-danger px-2 py-1" data-bs-toggle="tooltip" title="Excluir" aria-label="Excluir estudante ${escAttr(u.nome_usuario)}" data-sgi-action="delete-student" data-id-usuario="${esc(u.id_usuario)}">
                        <i class="bi bi-trash"></i>
                    </button>` : ''}
                    ${podeResetarSenha ? `
                    <button type="button" class="btn btn-sm btn-light border text-warning-emphasis px-2 py-1" data-bs-toggle="tooltip" title="Resetar senha" aria-label="Resetar senha do estudante" data-sgi-action="reset-student-password" data-id-usuario="${esc(u.id_usuario)}">
                        <i class="bi bi-key-fill"></i>
                    </button>` : ''}
                </div>`;

            desk.innerHTML = `${erroAlunos ? erroDesk : ''}${atualizandoDesk}` + pagina.map((u) => `
                <tr class="${Number(u.inscrito || 0) === 0 ? 'table-danger' : ''}">
                    <td class="fw-semibold text-body">
                        <span class="rounded-circle bg-danger-subtle text-danger-emphasis fw-semibold d-inline-flex align-items-center justify-content-center p-1 me-2">${esc((u.nome_usuario || 'A').charAt(0)).toUpperCase()}</span>${esc(u.nome_usuario)}${Number(u.inscrito || 0) === 0 ? '<span class="badge rounded-pill text-bg-danger ms-2">Sem inscrição</span>' : ''}
                    </td>
                    <td>${esc(u.matricula_usuario)}</td>
                    <td>
                        <span class="badge rounded-pill text-bg-light border ${u.genero_usuario === 'FEM' ? 'bg-danger-subtle text-danger-emphasis' : ''}">
                            <i class="bi ${u.genero_usuario === 'FEM' ? 'bi-gender-female' : 'bi-gender-male'}"></i>
                            ${esc(generoLabel(u.genero_usuario))}
                        </span>
                    </td>
                    <td class="text-center">${acoesDesk(u)}</td>
                </tr>`).join('');
        }

        const rotulo = total
            ? `Mostrando ${ini + 1}–${Math.min(ini + POR_PAGINA, total)} de ${total} estudante${total !== 1 ? 's' : ''}`
            : 'Nenhum estudante encontrado';
        document.getElementById('taInfoPaginaDesk').textContent = rotulo;
        document.getElementById('taInfoPaginaMob').textContent = rotulo;
        document.getElementById('contadorAlunosDesk').textContent = `${total} estudante${total !== 1 ? 's' : ''}`;
        document.getElementById('taTableCount').textContent = `${total} estudante${total !== 1 ? 's' : ''}`;

        construirPaginacao('paginacaoDesk', total, totalPaginas);
        construirPaginacao('paginacaoMob', total, totalPaginas);

        if (window.bootstrap && bootstrap.Tooltip) {
            document.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(el => {
                if (bootstrap.Tooltip.getInstance(el)) bootstrap.Tooltip.getInstance(el).dispose();
                new bootstrap.Tooltip(el, { placement: 'top' });
            });
        }
    }

    function construirPaginacao(containerId, total, totalPaginas) {
        const cont = document.getElementById(containerId);
        if (!cont) return;
        cont.innerHTML = '';
        if (totalPaginas <= 1) return;

        const nova = (label, pagina, desabilitado, ativo) => {
            const li = document.createElement('li');
            li.className = 'page-item' + (ativo ? ' active' : '') + (desabilitado ? ' disabled' : '');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'page-link';
            btn.innerHTML = label;
            if (!desabilitado && !ativo) {
                pageScope.listen(btn, 'click', () => {
                    paginaAtual = pagina;
                    renderizarAlunos();
                });
            }
            li.appendChild(btn);
            cont.appendChild(li);
        };

        nova('&laquo;', 1, paginaAtual === 1, false);

        let inicio = Math.max(1, paginaAtual - 2);
        let fim = Math.min(totalPaginas, inicio + 4);
        inicio = Math.max(1, fim - 4);

        if (inicio > 1) {
            nova('1', 1, false, false);
            if (inicio > 2) nova('…', 1, true, false);
        }
        for (let p = inicio; p <= fim; p++) nova(String(p), p, false, p === paginaAtual);
        if (fim < totalPaginas) {
            if (fim < totalPaginas - 1) nova('…', totalPaginas, true, false);
            nova(String(totalPaginas), totalPaginas, false, false);
        }

        nova('&raquo;', totalPaginas, paginaAtual === totalPaginas, false);
    }

    function abrirModalAlunoId(id) {
        abrirModalAluno(alunosMap[id] || null);
    }

    function verAlunoId(id) {
        const aluno = alunosMap[id];
        if (!aluno) return;
        verAluno(aluno);
    }

    function verAluno(aluno) {
        document.getElementById('verInicial').textContent = (aluno.nome_usuario || 'A').charAt(0).toUpperCase();
        document.getElementById('verNome').textContent = aluno.nome_usuario || '—';
        document.getElementById('verRm').textContent = aluno.matricula_usuario || '—';
        const g = document.getElementById('verGenero');
        g.innerHTML = `<i class="bi ${aluno.genero_usuario === 'FEM' ? 'bi-gender-female' : 'bi-gender-male'}"></i> ${esc(generoLabel(aluno.genero_usuario))}`;
        document.getElementById('verDataNasc').textContent = formatarData(aluno.data_nasc_usuario);
        gatilhoModalDetalhesAluno = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        bootstrap.Modal.getOrCreateInstance(modalDetalhesAluno).show();
    }

    function abrirModalAluno(aluno) {
        const modal = new bootstrap.Modal(document.getElementById('modalAluno'));
        document.getElementById('alunoId').value = aluno ? aluno.id_usuario : '';
        document.getElementById('alunoNome').value = aluno ? aluno.nome_usuario : '';
        document.getElementById('alunoRm').value = aluno ? aluno.matricula_usuario : '';
        document.getElementById('alunoGenero').value = aluno ? (aluno.genero_usuario || 'MASC') : 'MASC';
        document.getElementById('alunoDataNasc').value = aluno && aluno.data_nasc_usuario ? aluno.data_nasc_usuario : '';
        document.getElementById('modalAlunoTitulo').textContent = aluno ? 'Editar estudante' : 'Adicionar estudante';
        document.getElementById('msgAluno').innerHTML = '';
        modal.show();
    }

    async function salvarAluno(e) {
        e.preventDefault();
        const id = document.getElementById('alunoId').value;
        const nome = document.getElementById('alunoNome').value.trim();
        const rm = document.getElementById('alunoRm').value.trim();
        const genero = document.getElementById('alunoGenero').value;
        const dataNasc = document.getElementById('alunoDataNasc').value;
        const msgEl = document.getElementById('msgAluno');
        const btn = document.getElementById('btnSalvarAluno');

        if (!nome || !rm || !dataNasc) {
            msgEl.innerHTML = '<span class="text-danger">Preencha todos os campos.</span>';
            return;
        }

        const fd = new FormData();
        fd.append('acao', id ? 'editar_aluno' : 'criar_aluno');
        if (id) fd.append('id_usuario', id);
        fd.append('nome_usuario', nome);
        fd.append('matricula_usuario', rm);
        fd.append('genero_usuario', genero);
        fd.append('data_nasc_usuario', dataNasc);
        fd.append('turmas_id_turma', idTurma);
        fd.append('interclasses_id_interclasse', idInterclasse);

        try {
            btn.disabled = true;
            const r = await fetch(`${API}usuarios`, { method: 'POST', body: fd, credentials: 'include' });
            const js = await r.json();
            if (js.status === 'sucesso') {
                bootstrap.Modal.getInstance(document.getElementById('modalAluno')).hide();
                if (js.senha_temporaria) {
                    SGI.alert({ mensagem: `${js.mensagem || 'Estudante cadastrado.'}\nSenha temporária: ${js.senha_temporaria}`, tipo: 'success', restoreModal: false });
                }
                carregarAlunos();
            } else {
                msgEl.innerHTML = `<span class="text-danger">${esc(js.mensagem || 'Erro ao salvar.')}</span>`;
            }
        } catch (err) {
            msgEl.innerHTML = `<span class="text-danger">Falha de conexão.</span>`;
        } finally {
            btn.disabled = false;
        }
    }

    let idAlunoExcluir = 0;
    function confirmarExcluir(id) {
        const aluno = alunosMap[id];
        idAlunoExcluir = id;
        document.getElementById('nomeAlunoExcluir').textContent = aluno ? aluno.nome_usuario : '';
        new bootstrap.Modal(document.getElementById('modalConfirmarExcluir')).show();
    }

    async function executarExcluir() {
        const btn = document.getElementById('btnConfirmarExcluir');
        try {
            btn.disabled = true;
            const fd = new FormData();
            fd.append('acao', 'excluir_aluno');
            fd.append('id_usuario', idAlunoExcluir);
            const r = await fetch(`${API}usuarios`, { method: 'POST', body: fd, credentials: 'include' });
            const js = await r.json();
            bootstrap.Modal.getInstance(document.getElementById('modalConfirmarExcluir')).hide();
            if (js.status === 'sucesso') {
                carregarAlunos();
            } else {
                SGI.alert({ mensagem: js.mensagem || 'Erro ao excluir.', restoreModal: false });
            }
        } catch (_) {
            SGI.alert({ mensagem: 'Falha de conexão.', tipo: 'error', restoreModal: false });
        } finally {
            btn.disabled = false;
        }
    }

    let idAlunoResetar = 0;
    function resetarSenha(id) {
        const aluno = alunosMap[id];
        idAlunoResetar = id;
        document.getElementById('nomeAlunoResetar').textContent = aluno ? aluno.nome_usuario : '';
        new bootstrap.Modal(document.getElementById('modalResetarSenha')).show();
    }

    async function executarResetar() {
        const btn = document.getElementById('btnConfirmarResetar');
        try {
            btn.disabled = true;
            const fd = new FormData();
            fd.append('acao', 'resetar_senha_aluno');
            fd.append('id_usuario', idAlunoResetar);
            const r = await fetch(`${API}usuarios`, { method: 'POST', body: fd, credentials: 'include' });
            const js = await r.json();
            bootstrap.Modal.getInstance(document.getElementById('modalResetarSenha')).hide();
            if (js.status === 'sucesso') {
                const temporaryPassword = js.senha_temporaria ? `\nSenha temporária: ${js.senha_temporaria}` : '';
                SGI.alert({ mensagem: `${js.mensagem || 'Senha temporária gerada.'}${temporaryPassword}`, tipo: 'success', restoreModal: false });
                carregarAlunos();
            } else {
                SGI.alert({ mensagem: js.mensagem || 'Erro ao resetar a senha.', restoreModal: false });
            }
        } catch (_) {
            SGI.alert({ mensagem: 'Falha de conexão.', tipo: 'error', restoreModal: false });
        } finally {
            btn.disabled = false;
        }
    }

    /* ── Upload de PDF com progresso ── */
    function setBtnLoading(btn, carregando) {
        if (!btn) return;
        if (carregando) {
            btn.disabled = true;
            btn.dataset.original = btn.innerHTML;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Importando…';
        } else {
            btn.disabled = false;
            if (btn.dataset.original) btn.innerHTML = btn.dataset.original;
        }
    }

    function progressoHelper(containerId, barId, textoId) {
        const cont = document.getElementById(containerId);
        const bar = document.getElementById(barId);
        const txt = document.getElementById(textoId);
        if (!cont || !bar || !txt) return null;
        const progressbar = bar.parentElement;
        const setIndeterminado = (texto) => {
            progressbar.removeAttribute('aria-valuenow');
            progressbar.removeAttribute('aria-valuetext');
            bar.style.width = '100%';
            bar.classList.add('progress-bar-striped', 'progress-bar-animated');
            txt.textContent = texto;
        };
        return {
            start() {
                cont.classList.remove('d-none');
                progressbar.setAttribute('aria-valuemin', '0');
                progressbar.setAttribute('aria-valuemax', '100');
                setIndeterminado('Processando');
            },
            progress(p) {
                const percentual = Math.max(0, Math.min(100, Math.round(p)));
                bar.classList.remove('progress-bar-striped', 'progress-bar-animated');
                progressbar.setAttribute('aria-valuemin', '0');
                progressbar.setAttribute('aria-valuemax', '100');
                progressbar.setAttribute('aria-valuenow', String(percentual));
                progressbar.setAttribute('aria-valuetext', `Enviando arquivo: ${percentual}%`);
                bar.style.width = `${percentual}%`;
                txt.textContent = `Enviando… ${percentual}%`;
            },
            done() {
                setIndeterminado('Processando');
            },
            complete() {
                progressbar.setAttribute('aria-valuemin', '0');
                progressbar.setAttribute('aria-valuemax', '100');
                progressbar.setAttribute('aria-valuenow', '100');
                progressbar.setAttribute('aria-valuetext', 'Importação concluída');
                bar.classList.remove('progress-bar-striped', 'progress-bar-animated');
                bar.style.width = '100%';
                txt.textContent = 'Importação concluída.';
            },
            reset() {
                progressbar.removeAttribute('aria-valuenow');
                progressbar.removeAttribute('aria-valuetext');
                bar.classList.remove('progress-bar-striped', 'progress-bar-animated');
                bar.style.width = '0%';
                txt.textContent = 'A importação não foi confirmada.';
            }
        };
    }

    function enviarPdf(form, msgEl, btn, fallbackEl, cfg) {
        msgEl.textContent = '';
        msgEl.setAttribute('role', 'status');
        if (fallbackEl) fallbackEl.classList.add('d-none');

        const fd = new FormData(form);
        const fileInput = form.querySelector('input[type="file"]');
        if (fileInput && fileInput.files && fileInput.files[0]) {
            fd.append('pdf_arquivo', fileInput.files[0]);
        }
        fd.append('id_interclasse', idInterclasse || '');
        fd.append('id_categoria', idCategoria || '');
        fd.append('id_turma', idTurma || '');

        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${API}importacoes/turma-pdf`);
        xhr.withCredentials = true;

        pageScope.listen(xhr.upload, 'progress', (e) => {
            if (e.lengthComputable && cfg) cfg.progress(Math.round((e.loaded / e.total) * 100));
        });

        xhr.upload.onload = () => {
            if (cfg) cfg.done();
        };

        xhr.onload = () => {
            let js = null;
            try { js = JSON.parse(xhr.responseText); } catch (_) { js = null; }
            const objetoValido = js && typeof js === 'object' && !Array.isArray(js);
            const sucessoConfirmado = xhr.status >= 200 && xhr.status < 300 && objetoValido && js.success === true;

            if (sucessoConfirmado) {
                if (cfg) cfg.complete();
                msgEl.setAttribute('role', 'status');
                msgEl.classList.remove('text-danger');
                msgEl.classList.add('text-success');
                msgEl.textContent = js.message || 'Importação concluída.';
                setBtnLoading(btn, false);
                if (fileInput) {
                    fileInput.value = '';
                    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
                if (btn) {
                    btn.disabled = false;
                    btn.removeAttribute('aria-disabled');
                }
                carregarAlunos();
            } else {
                if (cfg) cfg.reset();
                const mensagem = objetoValido && typeof js.message === 'string' && js.message.trim()
                    ? js.message
                    : 'Resposta inválida do servidor. A importação não foi confirmada; tente novamente.';
                msgEl.setAttribute('role', 'alert');
                msgEl.classList.remove('text-success');
                msgEl.classList.add('text-danger');
                msgEl.textContent = mensagem;
                if (fallbackEl && objetoValido && js.fallback_converter === true) fallbackEl.classList.remove('d-none');
                setBtnLoading(btn, false);
            }
        };

        xhr.onerror = () => {
            if (cfg) cfg.reset();
            msgEl.setAttribute('role', 'alert');
            msgEl.classList.remove('text-success');
            msgEl.classList.add('text-danger');
            msgEl.textContent = 'Falha de conexão. A importação não foi confirmada; tente novamente.';
            setBtnLoading(btn, false);
        };

        setBtnLoading(btn, true);
        if (cfg) cfg.start();
        if (btn) btn.removeAttribute('aria-disabled');
        xhr.send(fd);
    }

    /* ── Drag and Drop ── */
    function configurarDropzone(dropzoneId, inputId, nomeId) {
        const dropzone = document.getElementById(dropzoneId);
        const input = document.getElementById(inputId);
        const nome = document.getElementById(nomeId);
        if (!dropzone || !input || !nome) return;

        pageScope.listen(input, 'change', () => {
            if (input.files && input.files[0]) {
                nome.textContent = `Arquivo selecionado: ${input.files[0].name}`;
                nome.classList.remove('d-none');
                dropzone.classList.add('border-success', 'bg-success-subtle');
            } else {
                nome.textContent = '';
                nome.classList.add('d-none');
                dropzone.classList.remove('border-success', 'bg-success-subtle');
            }
        });

        ['dragenter', 'dragover'].forEach(ev =>
            pageScope.listen(dropzone, ev, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.add('border-danger', 'bg-danger-subtle');
            })
        );
        ['dragleave', 'drop'].forEach(ev =>
            pageScope.listen(dropzone, ev, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.remove('border-danger', 'bg-danger-subtle');
            })
        );
        pageScope.listen(dropzone, 'drop', (e) => {
            const arquivos = e.dataTransfer ? e.dataTransfer.files : null;
            if (arquivos && arquivos.length) {
                try {
                    const dt = new DataTransfer();
                    Array.from(arquivos).forEach(f => dt.items.add(f));
                    input.files = dt.files;
                } catch (_) {
                    input.value = '';
                }
                input.dispatchEvent(new Event('change'));
            }
        });
    }

    function vincularAcoesAlunos() {
        const acoes = {
            'view-student': verAlunoId,
            'edit-student': abrirModalAlunoId,
            'delete-student': confirmarExcluir,
            'reset-student-password': resetarSenha,
        };
        const handler = (event) => {
            const button = event.target.closest('[data-sgi-action]');
            if (button?.dataset.sgiAction === 'clear-roster-search') {
                document.getElementById('buscaAlunoDesk').value = '';
                document.getElementById('buscaAlunoMob').value = '';
                paginaAtual = 1;
                aplicarFiltro();
                const busca = [document.getElementById('buscaAlunoDesk'), document.getElementById('buscaAlunoMob')]
                    .find(el => el && el.getClientRects().length);
                busca?.focus({ preventScroll: true });
                return;
            }
            if (button?.dataset.sgiAction === 'retry-roster') {
                event.preventDefault();
                tentarNovamenteAlunos();
                return;
            }
            const action = button && acoes[button.dataset.sgiAction];
            if (action) action(button.dataset.idUsuario);
        };
        pageScope.listen(document.getElementById('listaAlunosTurmaMob'), 'click', handler);
        pageScope.listen(document.getElementById('tbodyAlunosTurmaDesk'), 'click', handler);
    }

    async function tentarNovamenteAlunos() {
        if (carregandoAlunos) return;
        await carregarAlunos();
        const retry = [
            document.querySelector('#tbodyAlunosTurmaDesk [data-sgi-action="retry-roster"]'),
            document.querySelector('#listaAlunosTurmaMob [data-sgi-action="retry-roster"]'),
        ].find(el => el && el.getClientRects().length);
        if (retry) {
            retry.focus({ preventScroll: true });
            return;
        }
        const busca = [document.getElementById('buscaAlunoDesk'), document.getElementById('buscaAlunoMob')]
            .find(el => el && el.getClientRects().length);
        busca?.focus({ preventScroll: true });
    }

    window.SGIPage.ready( () => {
        vincularAcoesAlunos();
        carregarAlunos();

        pageScope.listen(document.getElementById('formAluno'), 'submit', salvarAluno);
        pageScope.listen(document.getElementById('btnConfirmarExcluir'), 'click', executarExcluir);
        pageScope.listen(document.getElementById('btnConfirmarResetar'), 'click', executarResetar);

        const buscaDesk = document.getElementById('buscaAlunoDesk');
        const buscaMob = document.getElementById('buscaAlunoMob');
        if (buscaDesk && buscaMob) {
            pageScope.listen(buscaDesk, 'input', () => { buscaMob.value = buscaDesk.value; aplicarFiltro(); });
            pageScope.listen(buscaMob, 'input', () => { buscaDesk.value = buscaMob.value; aplicarFiltro(); });
        }

        const colapsoMob = document.getElementById('blocoPdfMob');
        const colapsoDesk = document.getElementById('blocoPdfDesk');
        const botaoMob = document.getElementById('botaoPdfMob');
        const botaoDesk = document.getElementById('botaoPdfDesk');
        const atualizarChevron = (botao, aberto) => {
            const chevron = botao?.querySelector('[data-pdf-chevron]');
            if (!chevron) return;
            chevron.classList.toggle('bi-chevron-down', !aberto);
            chevron.classList.toggle('bi-chevron-up', aberto);
        };
        if (colapsoMob && botaoMob) {
            pageScope.listen(colapsoMob, 'show.bs.collapse', () => atualizarChevron(botaoMob, true));
            pageScope.listen(colapsoMob, 'hide.bs.collapse', () => atualizarChevron(botaoMob, false));
        }
        if (colapsoDesk && botaoDesk) {
            pageScope.listen(colapsoDesk, 'show.bs.collapse', () => atualizarChevron(botaoDesk, true));
            pageScope.listen(colapsoDesk, 'hide.bs.collapse', () => atualizarChevron(botaoDesk, false));
        }

        configurarDropzone('dropzoneMob', 'pdfInputMob', 'pdfNomeMob');
        configurarDropzone('dropzoneDesk', 'pdfInputDesk', 'pdfNomeDesk');

        const fMob = document.getElementById('formPdfTurmaMob');
        const fDesk = document.getElementById('formPdfTurmaDesk');
        const cfgMob = progressoHelper('progressMob', 'progressBarMob', 'progressTextoMob');
        const cfgDesk = progressoHelper('progressDesk', 'progressBarDesk', 'progressTextoDesk');

        if (fMob) {
            pageScope.listen(fMob, 'submit', (e) => {
                e.preventDefault();
                enviarPdf(fMob, document.getElementById('msgPdfMob'), fMob.querySelector('button[type="submit"]'), document.getElementById('fallbackMob'), cfgMob);
            });
        }
        if (fDesk) {
            pageScope.listen(fDesk, 'submit', (e) => {
                e.preventDefault();
                enviarPdf(fDesk, document.getElementById('msgPdfDesk'), fDesk.querySelector('button[type="submit"]'), document.getElementById('fallbackDesk'), cfgDesk);
            });
        }
    });

return {esc, normalizar, generoLabel, formatarData, setNomeTurma, setVoltar, carregarNomeInterclasseTurmaAlunos, carregarAlunos, aplicarFiltro, renderizarAlunos, construirPaginacao, abrirModalAlunoId, verAlunoId, verAluno, abrirModalAluno, salvarAluno, confirmarExcluir, executarExcluir, resetarSenha, executarResetar, setBtnLoading, progressoHelper, enviarPdf, configurarDropzone};
});
