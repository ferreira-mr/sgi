window.SGIPage.mount("competicoes/modalidades", function (pageConfig, pageScope) {

    const APP_BASE = String(window.SGI_BASE_PATH || '').replace(/\/+$/, '');
    const API_BASE = String(window.SGI_API_BASE || `${APP_BASE}/api/v1/`).replace(/\/?$/, '');
    const nivelUsuario = pageConfig.value2;
    let idInterclasse = null;

    const esc = (value) => window.SGIHtml
        ? window.SGIHtml.escape(value)
        : String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));

    function botoesAdmin(modalidade) {
        if (nivelUsuario !== 0) return '';
        const id = encodeURIComponent(String(modalidade.id_modalidade));
        const interclasse = encodeURIComponent(String(idInterclasse));
        return '<div class="d-flex gap-1 ms-2 flex-shrink-0">'
            + '<button type="button" class="btn btn-sm btn-outline-warning" data-sgi-action="gerenciar-podio" data-id-modalidade="' + esc(modalidade.id_modalidade) + '" data-nome-modalidade="' + esc(modalidade.nome_modalidade) + '" title="Pódio da modalidade" aria-label="Gerenciar pódio"><i class="bi bi-award"></i></button>'
            + '<a class="btn btn-sm btn-outline-primary" href="' + APP_BASE + '/modalidades/detalhes?id=' + interclasse + '&id_modalidade=' + id + '" title="Editar" aria-label="Editar modalidade"><i class="bi bi-pencil"></i></a>'
            + '<button type="button" class="btn btn-sm btn-outline-danger" data-sgi-action="delete-modalidade" data-id-modalidade="' + esc(modalidade.id_modalidade) + '" title="Excluir" aria-label="Excluir modalidade"><i class="bi bi-trash"></i></button>'
            + '</div>';
    }

    async function carregarModalidades() {
        const divMobile = document.getElementById('listaModalidadesMobile');
        const divDesktop = document.getElementById('listaModalidadesDesktop');

        try {
            const res = await fetch(`${API_BASE}/modalidades?x=1`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const raw = await res.json();
            let modalidades = raw.data || raw;
            if (!Array.isArray(modalidades)) modalidades = [];
            modalidades = modalidades.filter((item) => String(item.interclasses_id_interclasse) === String(idInterclasse));

            if (divMobile) divMobile.innerHTML = '';
            if (divDesktop) divDesktop.innerHTML = '';

            if (!Array.isArray(modalidades) || modalidades.length === 0) {
                const msgVazia = '<div class="card border-0 bg-light-subtle rounded-4 p-5 text-center my-4 w-100">' + '<div class="mx-auto mb-3 text-secondary opacity-50"><i class="bi bi-trophy display-4"></i></div>' + '<h3 class="h6 fw-semibold text-secondary mb-1">Nenhuma modalidade encontrada</h3>' + '<p class="text-body-secondary small mb-0">Cadastre modalidades para esta edição para organizar os jogos.</p>' + '</div>';
                if (divMobile) divMobile.innerHTML = msgVazia;
                if (divDesktop) divDesktop.innerHTML = msgVazia;
                return;
            }

            const modalidadesPorCategoria = {};
            modalidades.forEach((modalidade) => {
                const categoria = modalidade.nome_categoria || 'Sem Categoria';
                if (!modalidadesPorCategoria[categoria]) {
                    modalidadesPorCategoria[categoria] = [];
                }
                modalidadesPorCategoria[categoria].push(modalidade);
            });

            let htmlMobile = '';
            let htmlDesktop = '';
            Object.keys(modalidadesPorCategoria).forEach((categoria) => {
                const mods = modalidadesPorCategoria[categoria];

                htmlMobile += '<h5 class="mt-4 mb-3 text-muted px-3 w-100">' + esc(categoria) + '</h5>';
                htmlMobile += mods.map((modalidade) =>
                    '<div class="bg-white d-flex align-items-center shadow-sm py-3 px-3 mb-3 border border-1 rounded-3 w-100">'
                        + '<i class="bi bi-trophy fs-4 flex-shrink-0" aria-hidden="true"></i>'
                        + '<div class="text-start px-2 flex-grow-1 sgi-u-min-width-0">'
                            + '<h2 class="m-0 fs-5 text-truncate">' + esc(modalidade.nome_modalidade) + '</h2>'
                        + '</div>'
                        + botoesAdmin(modalidade)
                    + '</div>'
                ).join('');

                htmlDesktop += '<h4 class="mt-4 mb-3 text-muted">' + esc(categoria) + '</h4><div class="row g-4">';
                htmlDesktop += mods.map((modalidade) =>
                    '<div class="col-12 col-md-6 col-lg-4">'
                        + '<div class="card border border-light-subtle shadow-sm h-100 py-4 px-4 d-flex flex-row align-items-center rounded-3" >'
                            + '<div class="d-flex align-items-center gap-3 flex-grow-1">'
                                + '<i class="bi bi-trophy fs-4 text-dark" aria-hidden="true"></i>'
                                + '<div>'
                                    + '<h5 class="m-0 fw-bold fs-6">' + esc(modalidade.nome_modalidade) + '</h5>'
                                + '</div>'
                            + '</div>'
                            + botoesAdmin(modalidade)
                        + '</div>'
                    + '</div>'
                ).join('');
                htmlDesktop += '</div>';
            });

            if (divMobile) divMobile.innerHTML = htmlMobile;
            if (divDesktop) divDesktop.innerHTML = htmlDesktop;
        } catch (error) {
            console.error('Erro ao carregar lista:', error);
            const msgErro = '<div class="alert alert-danger my-3" role="alert">Não foi possível carregar as modalidades.</div>';
            if (divMobile) divMobile.innerHTML = msgErro;
            if (divDesktop) divDesktop.innerHTML = msgErro;
            if (window.SGI && typeof window.SGI.showToast === 'function') {
                window.SGI.showToast('Não foi possível carregar as modalidades.', 'danger');
            }
        }
    }

    async function carregarTiposModalidades() {
        const selectTipo = document.getElementById('inputTipoModalidade');
        if (!selectTipo) return;

        try {
            const res = await fetch(`${API_BASE}/tipos-modalidade`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const tipos = await res.json();

            const placeholder = new Option('Selecione um tipo...', '');
            placeholder.disabled = true;
            placeholder.selected = true;
            selectTipo.replaceChildren(placeholder);
            tipos.forEach(tipo => {
                selectTipo.add(new Option(String(tipo.nome_tipo_modalidade || ''), String(tipo.id_tipo_modalidade)));
            });
        } catch (error) {
            console.error('Erro ao carregar tipos:', error);
            selectTipo.replaceChildren(new Option('Erro ao carregar', ''));
            selectTipo.options[0].disabled = true;
            selectTipo.options[0].selected = true;
        }
    }

    async function carregarCategoriasModalidades() {
        const selectCat = document.getElementById('inputCategoriaModalidade');
        if (!selectCat) return;

        try {
            const res = await fetch(`${API_BASE}/categorias?id_interclasse=${idInterclasse}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const categorias = await res.json();

            const placeholder = new Option('Selecione uma categoria...', '');
            placeholder.disabled = true;
            placeholder.selected = true;
            selectCat.replaceChildren(placeholder);
            categorias.forEach((cat) => {
                selectCat.add(new Option(String(cat.nome_categoria || ''), String(cat.id_categoria)));
            });
        } catch (error) {
            console.error('Erro ao carregar categorias:', error);
            selectCat.replaceChildren(new Option('Erro ao carregar', ''));
            selectCat.options[0].disabled = true;
            selectCat.options[0].selected = true;
        }
    }

    async function excluirModalidade(id) {
        if (!await SGI.confirm({ titulo: 'Excluir modalidade?', mensagem: 'Esta ação não pode ser desfeita.', textoConfirmar: 'Excluir modalidade', destrutivo: true })) return;

        try {
            const res = await fetch(`${API_BASE}/modalidades`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id_modalidade: id,
                    status_modalidade: '0'
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                carregarModalidades();
            } else {
                SGI.alert('Erro ao excluir modalidade.');
            }
        } catch (error) {
            SGI.alert('Erro ao excluir modalidade.');
            console.error(error);
        }
    }

    pageScope.listen(document.getElementById('formNovaModalidade'), 'submit', async (e) => {
        e.preventDefault();
        const btnSalvar = document.getElementById('btnSalvarModalidade');
        const caixaMensagem = document.getElementById('caixaMensagemModalidade');

        const dados = {
            interclasses_id_interclasse: parseInt(idInterclasse),
            nome_modalidade: document.getElementById('inputNomeModalidade').value.trim(),
            genero_modalidade: document.getElementById('inputGeneroModalidade').value,
            tipos_modalidades_id_tipo_modalidade: document.getElementById('inputTipoModalidade').value,
            categorias_id_categoria: document.getElementById('inputCategoriaModalidade').value
        };

        const maxInscritos = document.getElementById('inputMaxInscritos');
        if (maxInscritos) {
            dados.max_inscrito_modalidade = parseInt(maxInscritos.value) || 0;
        }

        try {
            btnSalvar.disabled = true;
            btnSalvar.innerHTML = 'Salvando...';
            const res = await fetch(`${API_BASE}/modalidades`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dados)
            });
            const data = await res.json();

            if (res.ok && data.success) {
                caixaMensagem.innerHTML = '<p class="text-success text-center fw-bold">Criada com sucesso!</p>';
                document.getElementById('formNovaModalidade').reset();
                carregarModalidades();
                setTimeout(() => {
                    bootstrap.Modal.getInstance(document.getElementById('modalCriarModalidade')).hide();
                    caixaMensagem.innerHTML = '';
                }, 1000);
            } else {
                throw new Error(data?.message || 'Erro ao salvar.');
            }
        } catch (error) {
            caixaMensagem.innerHTML = '<p class="text-danger text-center fw-bold">Erro ao salvar.</p>';
        } finally {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = 'Criar';
        }
    });

    let modalidadePodioAtual = null;

    async function abrirModalPodio(idModalidade, nomeModalidade) {
        modalidadePodioAtual = idModalidade;
        const modalEl = document.getElementById('modalGerenciarPodio');
        if (!modalEl) return;

        const subtitulo = document.getElementById('podioNomeModalidade');
        if (subtitulo) subtitulo.textContent = 'Modalidade: ' + (nomeModalidade || '');

        const selects = [
            document.getElementById('selectPodio1'),
            document.getElementById('selectPodio2'),
            document.getElementById('selectPodio3')
        ];
        selects.forEach(function (s) {
            if (s) {
                s.innerHTML = '<option value="">Carregando equipes...</option>';
                s.disabled = true;
            }
        });

        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();

        try {
            const [resEquipes, resPodio] = await Promise.all([
                fetch(API_BASE + '/equipes?id_modalidade=' + encodeURIComponent(idModalidade)).then(r => r.json()),
                fetch(API_BASE + '/podios?id_interclasse=' + encodeURIComponent(idInterclasse) + '&id_modalidade=' + encodeURIComponent(idModalidade)).then(r => r.json())
            ]);

            const equipes = Array.isArray(resEquipes.data) ? resEquipes.data : (Array.isArray(resEquipes) ? resEquipes : []);
            const podio = (resPodio && resPodio.podio) || [];

            selects.forEach(function (select, idx) {
                if (!select) return;
                select.innerHTML = '';
                const optVazia = document.createElement('option');
                optVazia.value = '';
                optVazia.textContent = 'Nenhuma equipe selecionada';
                select.appendChild(optVazia);

                equipes.forEach(function (eq) {
                    const opt = document.createElement('option');
                    opt.value = String(eq.id_equipe);
                    opt.textContent = eq.nome_equipe + (eq.nome_turma ? ' (' + eq.nome_turma + ')' : '');
                    select.appendChild(opt);
                });

                select.disabled = false;

                const posNum = idx + 1;
                const posAtual = podio.find(function (p) { return Number(p.posicao) === posNum; });
                if (posAtual && posAtual.id_equipe) {
                    select.value = String(posAtual.id_equipe);
                }
            });
        } catch (err) {
            console.error('Erro ao carregar dados do pódio:', err);
            SGI.alert('Erro ao carregar equipes da modalidade.');
        }
    }

    const formPodio = document.getElementById('formGerenciarPodio');
    if (formPodio) {
        pageScope.listen(formPodio, 'submit', async function (e) {
            e.preventDefault();
            if (!modalidadePodioAtual) return;
            const btnSalvar = document.getElementById('btnSalvarPodio');
            const s1 = document.getElementById('selectPodio1') ? document.getElementById('selectPodio1').value : '';
            const s2 = document.getElementById('selectPodio2') ? document.getElementById('selectPodio2').value : '';
            const s3 = document.getElementById('selectPodio3') ? document.getElementById('selectPodio3').value : '';

            const podioData = [];
            if (s1) podioData.push({ posicao: 1, id_equipe: parseInt(s1, 10) });
            if (s2) podioData.push({ posicao: 2, id_equipe: parseInt(s2, 10) });
            if (s3) podioData.push({ posicao: 3, id_equipe: parseInt(s3, 10) });

            if (podioData.length === 0) {
                SGI.alert('Selecione pelo menos uma equipe para o pódio.');
                return;
            }

            try {
                if (btnSalvar) { btnSalvar.disabled = true; btnSalvar.textContent = 'Salvando...'; }
                const response = await fetch(API_BASE + '/podios', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id_interclasse: parseInt(idInterclasse, 10),
                        id_modalidade: parseInt(modalidadePodioAtual, 10),
                        podio: podioData
                    })
                });
                const res = await response.json();

                if (response.ok && res && res.success) {
                    SGI.alert(res.message || 'Pódio salvo com sucesso!');
                    const modalEl = document.getElementById('modalGerenciarPodio');
                    if (modalEl) {
                        const inst = bootstrap.Modal.getInstance(modalEl);
                        if (inst) inst.hide();
                    }
                } else {
                    throw new Error((res && res.message) || 'Falha ao salvar pódio.');
                }
            } catch (err) {
                const msg = err.message || 'Erro ao salvar pódio.';
                SGI.alert(msg);
            } finally {
                if (btnSalvar) { btnSalvar.disabled = false; btnSalvar.textContent = 'Salvar Pódio'; }
            }
        });
    }

    function vincularEventosLista() {
        [document.getElementById('listaModalidadesMobile'), document.getElementById('listaModalidadesDesktop')]
            .forEach(function (container) {
                pageScope.listen(container, 'click', function (event) {
                    const delButton = event.target.closest('[data-sgi-action="delete-modalidade"]');
                    if (delButton) {
                        excluirModalidade(delButton.dataset.idModalidade);
                        return;
                    }
                    const podioButton = event.target.closest('[data-sgi-action="gerenciar-podio"]');
                    if (podioButton) {
                        abrirModalPodio(podioButton.dataset.idModalidade, podioButton.dataset.nomeModalidade);
                    }
                });
            });
    }

    window.SGIPage.ready( async () => {
        vincularEventosLista();
        idInterclasse = await window.SGIInterclasse.resolveId();
        if (!idInterclasse) {
            await SGI.alert({ titulo: 'Interclasse não encontrado', mensagem: 'Nenhum interclasse ativo foi encontrado.', tipo: 'warning' });
            window.location.href = `${APP_BASE}/edicoes`;
            return;
        }
        const ic = await window.SGIInterclasse.getInterclasseById(idInterclasse);
        const nomeEl = document.getElementById('nomeInterclasseModalidades');
        if (nomeEl) nomeEl.innerText = ic?.nome_interclasse || 'Interclasse';
        const btnEl = document.getElementById('btnVoltarModalidades');
        const hrefVoltarModalidades = `${APP_BASE}/painel?id=${idInterclasse}`;
        if (btnEl) btnEl.href = hrefVoltarModalidades;
        const btnElMobile = document.getElementById('sgiBtnVoltar');
        if (btnElMobile) btnElMobile.href = hrefVoltarModalidades;
        await Promise.all([
            carregarModalidades(),
            carregarTiposModalidades(),
            carregarCategoriasModalidades()
        ]);
    });

return {carregarModalidades, carregarTiposModalidades, carregarCategoriasModalidades, excluirModalidade, abrirModalPodio};
});
