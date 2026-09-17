window.SGIPage.mount("competicoes/modalidades", function (pageConfig, pageScope) {

    const nivelUsuario = pageConfig.value2;
    let idInterclasse = null;

    const esc = (value) => window.SGIHtml
        ? window.SGIHtml.escape(value)
        : String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));

    function botoesAdmin(modalidade) {
        if (nivelUsuario !== 0) return '';
        const id = encodeURIComponent(String(modalidade.id_modalidade));
        const interclasse = encodeURIComponent(String(idInterclasse));
        return '<div class="d-flex gap-1 ms-2">'
            + '<a class="btn btn-sm btn-outline-primary" href="/modalidades/detalhes?id=' + interclasse + '&id_modalidade=' + id + '" title="Editar" aria-label="Editar modalidade"><i class="bi bi-pencil"></i></a>'
            + '<button type="button" class="btn btn-sm btn-outline-danger" data-sgi-action="delete-modalidade" data-id-modalidade="' + esc(modalidade.id_modalidade) + '" title="Excluir" aria-label="Excluir modalidade"><i class="bi bi-trash"></i></button>'
            + '</div>';
    }

    async function carregarModalidades() {
        const divMobile = document.getElementById('listaModalidadesMobile');
        const divDesktop = document.getElementById('listaModalidadesDesktop');

        try {
            const response = await axios.get('/api/v1/modalidades?x=1');
            let modalidades = response.data.data || response.data;
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

                htmlMobile += '<h5 class="mt-4 mb-3 text-muted px-3">' + esc(categoria) + '</h5>';
                htmlMobile += mods.map((modalidade) =>
                    '<div class="bg-white d-flex align-items-center shadow py-3 px-4 mb-3 border border-1 rounded-3 w-100 mw-100" >'
                        + '<i class="bi bi-trophy fs-4" aria-hidden="true"></i>'
                        + '<div class="text-start px-3 w-100">'
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
        }
    }

    async function carregarTiposModalidades() {
        const selectTipo = document.getElementById('inputTipoModalidade');
        if (!selectTipo) return;

        try {
            const response = await axios.get('/api/v1/tipos-modalidade');
            const tipos = response.data;

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
            const response = await axios.get('/api/v1/categorias?id_interclasse=' + idInterclasse);
            const categorias = response.data;

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
            const res = await axios.put('/api/v1/modalidades', {
                id_modalidade: id,
                status_modalidade: '0'
            });
            if (res.data.success) {
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
            const res = await axios.post('/api/v1/modalidades', dados);

            if (res.data.success) {
                caixaMensagem.innerHTML = '<p class="text-success text-center fw-bold">Criada com sucesso!</p>';
                document.getElementById('formNovaModalidade').reset();
                carregarModalidades();
                setTimeout(() => {
                    bootstrap.Modal.getInstance(document.getElementById('modalCriarModalidade')).hide();
                    caixaMensagem.innerHTML = '';
                }, 1000);
            }
        } catch (error) {
            caixaMensagem.innerHTML = '<p class="text-danger text-center fw-bold">Erro ao salvar.</p>';
        } finally {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = 'Criar';
        }
    });

    function vincularEventosLista() {
        [document.getElementById('listaModalidadesMobile'), document.getElementById('listaModalidadesDesktop')]
            .forEach((container) => pageScope.listen(container, 'click', (event) => {
                const button = event.target.closest('[data-sgi-action="delete-modalidade"]');
                if (button) excluirModalidade(button.dataset.idModalidade);
            }));
    }

    window.SGIPage.ready( async () => {
        vincularEventosLista();
        idInterclasse = await window.SGIInterclasse.resolveId();
        if (!idInterclasse) {
            await SGI.alert({ titulo: 'Interclasse não encontrado', mensagem: 'Nenhum interclasse ativo foi encontrado.', tipo: 'warning' });
            window.location.href = '/edicoes';
            return;
        }
        const ic = await window.SGIInterclasse.getInterclasseById(idInterclasse);
        const nomeEl = document.getElementById('nomeInterclasseModalidades');
        if (nomeEl) nomeEl.innerText = ic?.nome_interclasse || 'Interclasse';
        const btnEl = document.getElementById('btnVoltarModalidades');
        if (btnEl) btnEl.href = `/painel?id=${idInterclasse}`;
        await Promise.all([
            carregarModalidades(),
            carregarTiposModalidades(),
            carregarCategoriasModalidades()
        ]);
    });

return {carregarModalidades, carregarTiposModalidades, carregarCategoriasModalidades, excluirModalidade};
});
