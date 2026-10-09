window.SGIPage.mount("eventos/categorias", function (pageConfig, pageScope) {

    const esc = (value) => window.SGIHtml
        ? window.SGIHtml.escape(value)
        : String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));

    const urlParams = new URLSearchParams(window.location.search);
    let idInterclasse = urlParams.get('id');
    const APP_BASE = String(window.SGI_BASE_PATH || '').replace(/\/+$/, '');
    const API_BASE = String(window.SGI_API_BASE || `${APP_BASE}/api/v1/`).replace(/\/?$/, '/');
    const caminhoApp = (path, parametros) => `${APP_BASE}/${String(path).replace(/^\/+/, '')}${parametros ? `?${parametros.toString()}` : ''}`;
    const isAdmin = pageConfig.value1;
    const isColaborador = pageConfig.value2;
    const isMesario = pageConfig.value0;
    let categoriaSelecionada = null;
    let categoriasData = [];
    let editCategoriaId = null;
    let turmaCriadaPendente = null;
    let criacaoTurmaEmAndamento = false;

    function atualizarEstadoSelecaoCategoria() {
        document.querySelectorAll('[data-category-select]').forEach((controle) => {
            const selecionada = Number(controle.dataset.id) === Number(categoriaSelecionada);
            controle.setAttribute('aria-pressed', String(selecionada));
            const card = controle.closest('.categoria-item') || controle;
            card.classList.toggle('border-primary', selecionada);
            card.classList.toggle('border-2', selecionada);
            card.classList.toggle('shadow', selecionada);
        });
    }

    function selecionarCategoria(idCategoria) {
        if (turmaCriadaPendente && Number(idCategoria) !== turmaCriadaPendente.categoriaId) return;
        categoriaSelecionada = categoriaSelecionada === Number(idCategoria) ? null : Number(idCategoria);
        atualizarEstadoSelecaoCategoria();
        atualizarAcoesCategoria();
    }

    function atualizarAcoesCategoria() {
        if (!isAdmin) return;

        ['btnAdicionarTurmaMobile', 'btnAdicionarTurmaDesktop', 'btnEditarCategoriaMobile', 'btnEditarCategoriaDesktop',
         'btnExcluirCategoriaMobile', 'btnExcluirCategoriaDesktop'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.toggle('d-none', !categoriaSelecionada);
        });

        const parametros = new URLSearchParams();
        if (idInterclasse) parametros.set('id', idInterclasse);
        if (categoriaSelecionada) parametros.set('id_categoria', String(categoriaSelecionada));
        parametros.set('modo', 'create');
        const continuarHref = caminhoApp('edicoes/modalidades', parametros);
        ['btnContinuarMobile', 'btnContinuarDesktop'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.href = continuarHref;
        });

        ['btnVoltarCatMobile', 'btnVoltarCatDesk'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.href = caminhoApp('painel', new URLSearchParams({ id: String(idInterclasse) }));
        });
    }

    // -- resolução do interclasse --
    if (!idInterclasse) {
        window.SGIInterclasse.getActiveInterclasse().then(ativo => {
            if (ativo) {
                window.location.href = caminhoApp('edicoes/categorias', new URLSearchParams({ id: String(ativo.id_interclasse) }));
                return;
            }
            document.getElementById('listaCategoriasMobile').innerHTML = '<p class="text-muted mt-4 text-center w-100">Nenhum interclasse ativo.</p>';
            document.getElementById('listaCategoriasDesktop').innerHTML = '<p class="text-muted mt-4 text-center w-100">Nenhum interclasse ativo.</p>';
        });
    } else {
        window.SGIInterclasse.getInterclasseById(idInterclasse).then((dados) => {
            if (dados?.nome_interclasse) {
                ['nomeInterclasseCategoria', 'nomeInterclasseCatMob'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.innerText = dados.nome_interclasse;
                });
                window.SGIInterclasse.updatePageTitle(dados.nome_interclasse);
            }
        }).catch(console.error);

        ['btnVoltarCatMobile', 'btnVoltarCatDesk'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.href = caminhoApp('painel', new URLSearchParams({ id: String(idInterclasse) }));
        });

        if (isAdmin) atualizarAcoesCategoria();
    }

    async function carregarCategorias() {
        const divMobile = document.getElementById('listaCategoriasMobile');
        const divDesktop = document.getElementById('listaCategoriasDesktop');

        try {
            const respostas = await Promise.allSettled([
                fetch(`${API_BASE}categorias?id_interclasse=${encodeURIComponent(idInterclasse)}`).then(r => r.json()),
                fetch(`${API_BASE}turmas?id_interclasse=${encodeURIComponent(idInterclasse)}`).then(r => r.json()),
                fetch(`${API_BASE}equipes`).then(r => r.json()),
                fetch(`${API_BASE}modalidades?id_interclasse=${encodeURIComponent(idInterclasse)}`).then(r => r.json()),
                fetch(`${API_BASE}jogos?id_interclasse=${encodeURIComponent(idInterclasse)}`).then(r => r.json()),
                fetch(`${API_BASE}partidas`).then(r => r.json()),
            ]);

            const extrair = (res, padrao) => (res.status === 'fulfilled' && Array.isArray(res.value)) ? res.value : padrao;

            const categorias = extrair(respostas[0], []);
            categoriasData = categorias;
            const listaTurmas = extrair(respostas[1], []);
            const listaEquipes = extrair(respostas[2], []);
            const listaModalidades = extrair(respostas[3], []);
            const listaJogos = extrair(respostas[4], []);
            const listaPartidas = extrair(respostas[5], []);

            const turmaParaCategoria = {};
            listaTurmas.forEach(t => { turmaParaCategoria[t.id_turma] = Number(t.categorias_id_categoria); });

            const modalidadeParaCategoria = {};
            listaModalidades.forEach(m => { modalidadeParaCategoria[m.id_modalidade] = Number(m.categorias_id_categoria); });

            const jogoParaModalidade = {};
            listaJogos.forEach(j => { jogoParaModalidade[j.id_jogo] = Number(j.modalidades_id_modalidade); });

            const qtdEquipes = {};
            listaEquipes.forEach(e => {
                const catId = turmaParaCategoria[e.turmas_id_turma];
                if (catId) qtdEquipes[catId] = (qtdEquipes[catId] || 0) + 1;
            });

            const qtdPartidas = {};
            listaPartidas.forEach(p => {
                const modId = jogoParaModalidade[p.id_jogo];
                if (modId) {
                    const catId = modalidadeParaCategoria[modId];
                    if (catId) qtdPartidas[catId] = (qtdPartidas[catId] || 0) + 1;
                }
            });

            divMobile.innerHTML = '';
            divDesktop.innerHTML = '';

            if (!categorias.length) {
                const msgVazia = '<p class="text-muted mt-4 text-center w-100">Nenhuma categoria cadastrada ainda.</p>';
                divMobile.innerHTML = msgVazia;
                divDesktop.innerHTML = msgVazia;
                return;
            }

            const linkTarget = isAdmin ? 'edicoes/turmas' : 'turmas';

            categorias.forEach((categoria) => {
                const cId = Number(categoria.id_categoria);
                const eq = qtdEquipes[cId] || 0;
                const pt = qtdPartidas[cId] || 0;

                if (isAdmin) {
                    divMobile.innerHTML += `
                        <button type="button" class="categoria-item bg-white d-flex m-auto justify-content-between align-items-center shadow-sm py-3 px-4 mb-3 border border-1 rounded-3 w-100" data-category-select data-id="${cId}" aria-pressed="false" aria-label="Selecionar categoria: ${esc(categoria.nome_categoria)}">
                            <i class="bi bi-trophy fs-3" aria-hidden="true"></i>
                            <span class="m-0 fs-5 text-truncate px-3 w-100 text-start">${esc(categoria.nome_categoria)}</span>
                            <picture><img src="${(window.SGI_ASSET_BASE || '/assets') + '/images/arrow-right.svg'}" alt=""></picture>
                        </button>
                    `;
                } else {
                    divMobile.innerHTML += `
                        <a href="${caminhoApp('turmas', new URLSearchParams({ id: String(idInterclasse), id_categoria: String(cId) }))}" class="categoria-item text-decoration-none text-dark bg-white d-flex m-auto justify-content-between align-items-center shadow-sm py-3 px-4 mb-3 border border-1 rounded-3 w-100" >
                            <i class="bi bi-trophy fs-3" aria-hidden="true"></i>
                            <h2 class="m-0 fs-5 text-truncate px-3 w-100 text-start">${esc(categoria.nome_categoria)}</h2>
                            <picture><img src="${(window.SGI_ASSET_BASE || '/assets') + '/images/arrow-right.svg'}" alt=""></picture>
                        </a>
                    `;
                }

                const btnLabel = isAdmin ? 'VER DETALHES' : (isMesario ? 'VER MAIS' : 'VER DETALHES');

                divDesktop.innerHTML += `
                    <div class="col-12 col-md-6 col-lg-5 col-xl-4">
                        <div class="categoria-item card border-0 shadow-sm h-100 p-4 rounded-3"  data-id="${cId}">
                            <div class="card-body p-0 d-flex flex-column">
                                <h3 class="fw-bold text-dark mb-4 pb-2 text-truncate" title="${esc(categoria.nome_categoria)}">${esc(categoria.nome_categoria)}</h3>
                                <div class="d-flex gap-3 mb-4">
                                    <div class="rounded-3 p-2 px-3 flex-fill border border-light-subtle shadow-sm bg-light-subtle" >
                                        <div class="text-dark fw-medium mb-1 small" >EQUIPES</div>
                                        <div class="fs-5 text-dark">${eq}</div>
                                    </div>
                                    <div class="rounded-3 p-2 px-3 flex-fill border border-light-subtle shadow-sm bg-light-subtle" >
                                        <div class="text-dark fw-medium mb-1 small" >PARTIDAS</div>
                                        <div class="fs-5 text-dark">${pt}</div>
                                    </div>
                                </div>
                                ${isAdmin ? `<button type="button" class="btn btn-outline-primary w-100 fw-semibold mt-auto mb-2" data-category-select data-id="${cId}" aria-pressed="false" aria-label="Selecionar categoria: ${esc(categoria.nome_categoria)}">Selecionar categoria</button>` : ''}
                                <a class="btn btn-primary w-100 fw-semibold text-uppercase border-0 " href="${caminhoApp(linkTarget, new URLSearchParams({ id: String(idInterclasse), id_categoria: String(cId) }))}">
                                    ${btnLabel} · ${esc(categoria.nome_categoria)} <i class="bi bi-arrow-right" aria-hidden="true"></i>
                                </a>
                            </div>
                        </div>
                    </div>
                `;
            });

            if (isAdmin) {
                document.querySelectorAll('[data-category-select]').forEach((controle) => {
                    pageScope.listen(controle, 'click', () => selecionarCategoria(controle.dataset.id));
                });
                document.querySelectorAll('#listaCategoriasDesktop .categoria-item[data-id]').forEach((card) => {
                    pageScope.listen(card, 'click', (ev) => {
                        if (ev.target.closest('a[href], button')) return;
                        selecionarCategoria(card.dataset.id);
                    });
                });
                categoriaSelecionada = null;
                atualizarEstadoSelecaoCategoria();
                atualizarAcoesCategoria();
            }
        } catch (error) {
            console.error("Erro ao carregar categorias:", error);
            divMobile.innerHTML = '<p class="text-danger mt-4 text-center">Erro ao carregar categorias.</p>';
            divDesktop.innerHTML = '<p class="text-danger mt-4">Erro ao carregar categorias.</p>';
        }
    }

    // -- Admin: editar categoria --
    if (isAdmin) {
    let modalEditarCategoriaTrigger = null;
    const modalEditarCategoriaElement = document.getElementById('modalEditarCategoria');
    pageScope.listen(modalEditarCategoriaElement, 'hidden.bs.modal', () => {
        if (modalEditarCategoriaTrigger?.isConnected && !modalEditarCategoriaTrigger.disabled && modalEditarCategoriaTrigger.getClientRects().length) {
            modalEditarCategoriaTrigger.focus();
        }
        modalEditarCategoriaTrigger = null;
    });

    window.abrirModalEditarCategoria = function(event) {
        if (!categoriaSelecionada) return;
        const cat = categoriasData.find(c => c.id_categoria == categoriaSelecionada);
        if (!cat) return;

        modalEditarCategoriaTrigger = event?.currentTarget instanceof HTMLElement ? event.currentTarget : document.activeElement;

            editCategoriaId = cat.id_categoria;
            document.getElementById('editNomeCategoria').value = cat.nome_categoria || '';
            document.getElementById('msgEditarCategoria').innerHTML = '';

        const modal = new bootstrap.Modal(modalEditarCategoriaElement);
            modal.show();
        };

        pageScope.listen(document.getElementById('formEditarCategoria'), 'submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btnSalvarEdicaoCategoria');
            const msg = document.getElementById('msgEditarCategoria');

            const nome = document.getElementById('editNomeCategoria').value.trim();
            if (!nome) {
                msg.innerHTML = '<p class="text-danger text-center fw-bold mb-0">O nome não pode estar vazio.</p>';
                return;
            }

            try {
                btn.disabled = true;
                btn.innerHTML = 'Salvando...';

                const resp = await fetch(`${API_BASE}categorias`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id_categoria: editCategoriaId, nome_categoria: nome })
                });
                const data = await resp.json();

                if (data.success === false) throw new Error(data.message || 'Erro ao atualizar.');

                msg.innerHTML = '<p class="text-success text-center fw-bold mb-0">Salvo com sucesso!</p>';
                setTimeout(() => {
                    bootstrap.Modal.getInstance(document.getElementById('modalEditarCategoria')).hide();
                    carregarCategorias();
                }, 800);
            } catch (err) {
                msg.innerHTML = `<p class="text-danger text-center fw-bold mb-0">${esc(err.message)}</p>`;
            } finally {
                btn.disabled = false;
                btn.innerHTML = 'Salvar';
            }
        });

        // -- Admin: excluir categoria --
        window.excluirCategoria = async function() {
            if (!categoriaSelecionada) return;
            if (!await SGI.confirm({ titulo: 'Excluir categoria?', mensagem: 'Esta ação não pode ser desfeita.', textoConfirmar: 'Excluir categoria', destrutivo: true })) return;

            const btn = document.getElementById('btnExcluirCategoriaDesktop');
            const btnMob = document.getElementById('btnExcluirCategoriaMobile');
            const desabilitar = (d) => { if (btn) btn.disabled = d; if (btnMob) btnMob.disabled = d; };

            try {
                desabilitar(true);
                const resp = await fetch(`${API_BASE}categorias`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id_categoria: categoriaSelecionada })
                });
                const data = await resp.json();
                if (data.success === false) throw new Error(data.message || 'Erro ao excluir.');
                carregarCategorias();
            } catch (err) {
                SGI.alert(err.message);
            } finally {
                desabilitar(false);
            }
        };

        ['btnEditarCategoriaMobile', 'btnEditarCategoriaDesktop'].forEach((id) => {
            const btnEdit = document.getElementById(id);
            if (btnEdit) pageScope.listen(btnEdit, 'click', (ev) => window.abrirModalEditarCategoria(ev));
        });
        ['btnExcluirCategoriaMobile', 'btnExcluirCategoriaDesktop'].forEach((id) => {
            const btnDel = document.getElementById(id);
            if (btnDel) pageScope.listen(btnDel, 'click', () => window.excluirCategoria());
        });

        // -- Admin: upload e criação com retomada segura --
        const formNovaTurma = document.getElementById('formNovaTurmaCategoria');
        const campoArquivoTurma = document.getElementById('arquivoUpload');
        const nomeArquivoTurma = document.getElementById('nomeArquivo');
        const progressoTurma = document.getElementById('progressoPdfCategoria');
        const barraProgressoTurma = document.getElementById('barraPdfCategoria');
        const textoProgressoTurma = document.getElementById('textoProgressoPdfCategoria');
        const fallbackPdfTurma = document.getElementById('fallbackPdfCategoria');

        function mostrarMensagemTurma(elemento, mensagem, tipo = 'error') {
            elemento.textContent = mensagem;
            elemento.setAttribute('role', tipo === 'error' ? 'alert' : 'status');
            elemento.classList.toggle('text-danger', tipo === 'error');
            elemento.classList.toggle('text-success', tipo === 'success');
        }

        function atualizarProgressoTurma(estado) {
            if (!progressoTurma || !barraProgressoTurma || !textoProgressoTurma) return;
            const progressbar = barraProgressoTurma.parentElement;
            progressoTurma.classList.remove('d-none');
            if (estado === 'iniciando') {
                progressbar.removeAttribute('aria-valuenow');
                progressbar.removeAttribute('aria-valuetext');
                barraProgressoTurma.style.width = '100%';
                barraProgressoTurma.classList.add('progress-bar-striped', 'progress-bar-animated');
                textoProgressoTurma.textContent = 'Processando';
            } else if (estado === 'concluido') {
                progressbar.setAttribute('aria-valuemin', '0');
                progressbar.setAttribute('aria-valuemax', '100');
                progressbar.setAttribute('aria-valuenow', '100');
                progressbar.setAttribute('aria-valuetext', 'Importação concluída');
                barraProgressoTurma.style.width = '100%';
                barraProgressoTurma.classList.remove('progress-bar-animated');
                textoProgressoTurma.textContent = 'Importação concluída.';
            } else {
                progressbar.removeAttribute('aria-valuenow');
                progressbar.removeAttribute('aria-valuetext');
                barraProgressoTurma.style.width = '0%';
                barraProgressoTurma.classList.remove('progress-bar-animated');
                textoProgressoTurma.textContent = 'A importação não foi confirmada. Você pode tentar novamente.';
            }
        }

        async function enviarPdf(form, idManual, categoriaManual) {
            if (!form || !campoArquivoTurma?.files?.[0]) {
                throw new Error('Selecione um PDF antes de enviar.');
            }
            const fd = new FormData(form);
            fd.append('pdf_arquivo', campoArquivoTurma.files[0]);
            fd.append('id_interclasse', String(idInterclasse));
            fd.append('id_categoria', String(categoriaManual));
            fd.append('id_turma', String(idManual));

            const response = await fetch(`${API_BASE}importacoes/turma-pdf`, { method: 'POST', body: fd, credentials: 'include' });
            const json = await response.json().catch(() => null);
            const objetoValido = json && typeof json === 'object' && !Array.isArray(json);
            if (!response.ok || !objetoValido || json.success !== true) {
                const mensagem = objetoValido && typeof json.message === 'string' && json.message.trim()
                    ? json.message
                    : (objetoValido ? `A importação não foi confirmada (HTTP ${response.status}).` : 'Resposta inválida do servidor. A importação não foi confirmada; tente novamente.');
                const erro = new Error(mensagem);
                erro.fallbackConverter = objetoValido && json.fallback_converter === true;
                throw erro;
            }
            return { ...json, id_turma: idManual };
        }

        function atualizarNomeArquivoTurma() {
            const arquivo = campoArquivoTurma?.files?.[0];
            nomeArquivoTurma.textContent = arquivo ? `Arquivo selecionado: ${arquivo.name}` : '';
            nomeArquivoTurma.classList.toggle('d-none', !arquivo);
        }

        pageScope.listen(campoArquivoTurma, 'change', atualizarNomeArquivoTurma);
        pageScope.listen(formNovaTurma, 'submit', async (event) => {
            event.preventDefault();
            if (criacaoTurmaEmAndamento) return;

            const btn = document.getElementById('btnCriarTurmaCategoria');
            const msg = document.getElementById('msgNovaTurmaCategoria');
            const arquivo = campoArquivoTurma.files?.[0];
            const nomeTurma = document.getElementById('inputNomeTurma').value.trim();
            const nomeFantasia = document.getElementById('inputNomeFantasiaTurma').value.trim();
            const turno = document.getElementById('inputTurnoTurma').value;

            if (!turmaCriadaPendente && !categoriaSelecionada) {
                mostrarMensagemTurma(msg, 'Selecione uma categoria antes de criar a turma.');
                return;
            }
            if (turmaCriadaPendente && !arquivo) {
                mostrarMensagemTurma(msg, 'A turma já foi criada. Selecione o PDF para tentar concluir a importação.');
                return;
            }

            criacaoTurmaEmAndamento = true;
            btn.disabled = true;
            btn.setAttribute('aria-busy', 'true');
            msg.textContent = '';
            msg.setAttribute('role', 'status');
            fallbackPdfTurma.classList.add('d-none');
            const categoriaId = turmaCriadaPendente?.categoriaId ?? Number(categoriaSelecionada);
            let turmaId = turmaCriadaPendente?.id ?? null;

            try {
                if (!turmaCriadaPendente) {
                    btn.textContent = 'Criando turma…';
                    const payloadTurma = {
                        interclasses_id_interclasse: Number(idInterclasse),
                        categorias_id_categoria: categoriaId,
                        nome_turma: nomeTurma,
                        nome_fantasia_turma: nomeFantasia,
                        turno_turma: turno,
                        status_turma: '1',
                    };
                    const respostaTurma = await fetch(`${API_BASE}turmas`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payloadTurma),
                    });
                    const turmaCriada = await respostaTurma.json().catch(() => null);
                    if (!respostaTurma.ok || !turmaCriada || turmaCriada.success !== true) {
                        throw new Error(turmaCriada?.message || `A turma não foi criada (HTTP ${respostaTurma.status}).`);
                    }
                    turmaId = Number(turmaCriada.id_turma);
                    if (!Number.isInteger(turmaId) || turmaId <= 0) {
                        throw new Error('A resposta não confirmou o identificador da turma.');
                    }
                    if (arquivo) turmaCriadaPendente = { id: turmaId, categoriaId, nome: nomeTurma };
                    else concluirCriacaoTurma(turmaCriada, turmaId, categoriaId, msg);
                }

                if (turmaCriadaPendente) {
                    btn.textContent = 'Enviando PDF…';
                    atualizarProgressoTurma('iniciando');
                    const resultado = await enviarPdf(formNovaTurma, turmaCriadaPendente.id, turmaCriadaPendente.categoriaId);
                    turmaCriadaPendente = null;
                    atualizarProgressoTurma('concluido');
                    concluirCriacaoTurma(resultado, turmaId, categoriaId, msg);
                }
            } catch (error) {
                if (turmaCriadaPendente) {
                    atualizarProgressoTurma('erro');
                    btn.textContent = 'Tentar importar PDF novamente';
                }
                mostrarMensagemTurma(msg, error.message || 'Não foi possível concluir a operação. Tente novamente.');
                if (error.fallbackConverter) fallbackPdfTurma.classList.remove('d-none');
            } finally {
                criacaoTurmaEmAndamento = false;
                btn.disabled = false;
                btn.removeAttribute('aria-busy');
                if (!turmaCriadaPendente) btn.textContent = 'Criar e enviar';
            }
        });

        function concluirCriacaoTurma(resultado, turmaId, categoriaId, msg) {
            const avisos = Array.isArray(resultado.avisos) && resultado.avisos.length
                ? ` Avisos: ${resultado.avisos.map((aviso) => String(aviso)).join(' ')}`
                : '';
            mostrarMensagemTurma(msg, `${resultado.message || 'Turma criada com sucesso.'}${avisos}`, 'success');
            setTimeout(() => {
                bootstrap.Modal.getOrCreateInstance(document.getElementById('criarTurma')).hide();
                const parametros = new URLSearchParams({ id: String(idInterclasse), id_categoria: String(categoriaId), id_turma: String(turmaId) });
                window.location.href = caminhoApp('turmas/alunos', parametros);
            }, 900);
        }

        window.enviarPdf = enviarPdf;
        window.mostrarNomeArquivo = atualizarNomeArquivoTurma;
    }

    // -- Criar nova categoria (admin & colaborador) --
    if (isAdmin || isColaborador) {
        pageScope.listen(document.getElementById('formNovaCategoria'), 'submit', async (e) => {
            e.preventDefault();

            let id = idInterclasse;
            if (!id) {
                id = await window.SGIInterclasse.resolveId();
            }
            if (!id) {
                SGI.alert("Nenhum interclasse ativo disponível.");
                return;
            }
            idInterclasse = id;

            const inputNome = document.getElementById('inputNomeCategoriaNova');
            const btnSalvar = document.getElementById('btnSalvarCategoria');
            const dados = {
                interclasses_id_interclasse: parseInt(id),
                nome_categoria: inputNome.value.trim(),
                status_categoria: 1
            };

            btnSalvar.disabled = true;
            btnSalvar.innerHTML = "Salvando...";

            try {
                const response = await fetch(`${API_BASE}categorias`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(dados)
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    inputNome.value = "";
                    const modalEl = document.getElementById('modalCriarCategoria');
                    const modalObj = bootstrap.Modal.getOrCreateInstance(modalEl);
                    modalObj.hide();
                    carregarCategorias();
                } else {
                    SGI.alert("Erro: " + (result.message || "Não foi possível criar a categoria."));
                }
            } catch (error) {
                console.error("Erro ao criar categoria:", error);
                SGI.alert("Erro de conexão com o servidor ao criar categoria.");
            } finally {
                btnSalvar.disabled = false;
                btnSalvar.innerHTML = "Criar";
            }
        });
    }

    if (idInterclasse) {
        window.SGIPage.ready( carregarCategorias);
    }

return {selecionarCategoria, atualizarAcoesCategoria, carregarCategorias};
});
