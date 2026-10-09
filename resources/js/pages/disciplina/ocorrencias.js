window.SGIPage.mount("disciplina/ocorrencias", function (pageConfig, pageScope) {

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

    const params = new URLSearchParams(window.location.search);
    let idInterclasse = params.get('id');
    let todasTurmas = [];
    let todasCategorias = [];
    let historicoRegistros = [];
    let modalTurmaId = null;
    let historicoTurmaId = null;

    async function resolverInterclasse() {
        if (!idInterclasse) {
            const ativo = await window.SGIInterclasse.getActiveInterclasse();
            idInterclasse = ativo?.id_interclasse || null;
        }
        if (!idInterclasse) {
            await SGI.alert({ titulo: 'Interclasse não encontrado', mensagem: 'Nenhum interclasse ativo foi encontrado.', tipo: 'warning' });
            window.location.href = `${APP_BASE}/painel`;
            return;
        }
        const dados = await window.SGIInterclasse.getInterclasseById(idInterclasse);
        ['nomeInterclasseOcr', 'nomeInterclasseOcrMob'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerText = dados?.nome_interclasse || 'Interclasse';
        });
        ['btnVoltarOcr', 'btnVoltarOcrMob'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.href = `${APP_BASE}/painel?id=${idInterclasse}`;
        });
    }

    async function carregarDados() {
        await resolverInterclasse();

        if (!idInterclasse) return;

        const resTurmas = await fetch(`${API_BASE}/turmas?id_interclasse=${idInterclasse}`);
        if (!resTurmas.ok) {
            SGI.alert('Erro ao carregar turmas.');
            return;
        }
        todasTurmas = await resTurmas.json();

        carregarLista();
    }

    function turmasFiltradas() {
        return todasTurmas;
    }

    function carregarLista() {
        function renderCard(turma) {
            const nomeTurma = turma.nome_fantasia_turma || turma.nome_turma;
            const nomeTurmaSeguro = escAttr(nomeTurma);
            return `
                <div class="col"><article class="card h-100 border-0 shadow-sm sgi-turma-card p-3">
                    <div class="sgi-turma-card-header">
                        <div class="bg-danger-subtle text-danger rounded-circle p-2 fs-5 d-flex align-items-center justify-content-center flex-shrink-0"><i class="bi bi-people-fill" aria-hidden="true"></i></div>
                        <div class="sgi-turma-card-title">
                            <h2 class="h6 mb-1 fw-semibold">${esc(nomeTurma)}</h2>
                            <span class="badge text-bg-light">${esc(turma.nome_categoria || 'Geral')}</span>
                        </div>
                    </div>
                    <div class="sgi-turma-card-actions">
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-sgi-action="history-ocorrencia" data-id-turma="${turma.id_turma}" data-nome-turma="${nomeTurmaSeguro}" title="Ver histórico" aria-label="Ver histórico de ocorrências de ${nomeTurmaSeguro}">
                            <i class="bi bi-clock-history" aria-hidden="true"></i>
                        </button>
                        <button type="button" class="btn btn-outline-danger btn-sm" data-sgi-action="add-ocorrencia" data-id-turma="${turma.id_turma}" data-nome-turma="${nomeTurmaSeguro}" title="Adicionar ocorrência" aria-label="Adicionar ocorrência para ${nomeTurmaSeguro}">
                            <i class="bi bi-plus-lg" aria-hidden="true"></i>
                        </button>
                    </div>
                </article></div>`;
        }

        const listaDesk = document.getElementById('listaOcorrenciasDesktop');
        const listaMob = document.getElementById('listaOcorrenciasMobile');
        const turmas = turmasFiltradas();

        if (turmas.length === 0) {
            const msg = '<div class="col-12 text-center text-body-secondary py-5"><i class="bi bi-inbox fs-2 d-block mb-2 text-body-tertiary"></i>Nenhuma turma encontrada.</div>';
            listaDesk.innerHTML = msg;
            listaMob.innerHTML = msg;
        } else {
            listaDesk.innerHTML = turmas.map(renderCard).join('');
            listaMob.innerHTML = turmas.map(renderCard).join('');
            vincularEventosLista();
        }
    }

    function vincularEventosLista() {
        document.querySelectorAll('[data-sgi-action="history-ocorrencia"]').forEach((button) => {
            pageScope.listen(button, 'click', () => abrirHistoricoTurma(button.dataset.idTurma, button.dataset.nomeTurma, button));
        });
        document.querySelectorAll('[data-sgi-action="add-ocorrencia"]').forEach((button) => {
            pageScope.listen(button, 'click', () => abrirModalOcorrencia(button.dataset.idTurma, button.dataset.nomeTurma, button));
        });
    }

    function mostrarModalComRetornoDeFoco(modalElement, acionador) {
        modalElement.addEventListener('hidden.bs.modal', () => {
            if (acionador && acionador.isConnected) acionador.focus();
        }, { once: true });
        bootstrap.Modal.getOrCreateInstance(modalElement).show();
    }

    function abrirModalOcorrencia(idTurma, nomeTurma, acionador) {
        modalTurmaId = idTurma;
        document.getElementById('modalTurmaNome').innerText = nomeTurma;
        document.getElementById('ocrTituloModal').value = '';
        document.getElementById('ocrPontosModal').value = '';
        document.getElementById('msgOcrModal').innerHTML = '';

        mostrarModalComRetornoDeFoco(document.getElementById('modalNovaOcorrencia'), acionador);
    }

    async function salvarOcorrenciaModal() {
        const titulo = document.getElementById('ocrTituloModal').value.trim();
        const pontosEl = document.getElementById('ocrPontosModal');
        const pontosInformados = parseInt(pontosEl.value, 10);
        const pontos = Number.isNaN(pontosInformados) ? 0 : Math.abs(pontosInformados);
        const data = new Date().toISOString().split('T')[0];
        const msgEl = document.getElementById('msgOcrModal');
        const btnEl = document.getElementById('btnSalvarOcrModal');

        if (!titulo || !modalTurmaId) {
            msgEl.innerHTML = '<span class="text-danger fw-bold">Preencha o título.</span>';
            return;
        }

        // Keep the field consistent with the server contract even when a
        // browser accepts a manually typed negative number despite min="0".
        if (pontosInformados < 0) {
            pontosEl.value = String(pontos);
        }

        btnEl.disabled = true;
        const originalText = btnEl.innerHTML;
        btnEl.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Salvando...';

        try {
            const resp = await fetch(`${API_BASE}/ocorrencias-turmas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    turmas_id_turma: Number(modalTurmaId),
                    interclasses_id_interclasse: Number(idInterclasse),
                    titulo_ocorrencia: titulo,
                    pontos_descontados: pontos,
                    data_ocorrencia: data
                })
            });
            const result = await resp.json();

            if (result.success) {
                msgEl.innerHTML = '<span class="text-success fw-bold">Ocorrência registrada!</span>';
                setTimeout(() => {
                    const modal = bootstrap.Modal.getInstance(document.getElementById('modalNovaOcorrencia'));
                    if (modal) modal.hide();
                    msgEl.innerHTML = '';
                }, 1000);
            } else {
                msgEl.innerHTML = '<span class="text-danger fw-bold">' + esc(result.message || 'Erro ao salvar.') + '</span>';
            }
        } catch (e) {
            msgEl.innerHTML = '<span class="text-danger fw-bold">Erro de conexão.</span>';
        } finally {
            btnEl.disabled = false;
            btnEl.innerHTML = originalText;
        }
    }

    function abrirHistoricoTurma(idTurma, nomeTurma, acionador) {
        historicoTurmaId = idTurma;
        document.getElementById('modalHistoricoTurmaNome').innerText = nomeTurma;
        mostrarModalComRetornoDeFoco(document.getElementById('modalHistoricoOcorrencias'), acionador);
        carregarHistorico(idTurma);
    }

    async function carregarHistorico(idTurma) {
        const conteudo = document.getElementById('historicoConteudo');
        conteudo.innerHTML = '<div class="spinner-border text-danger" role="status"></div>';

        try {
            if (!idInterclasse) return;
            const res = await fetch(`${API_BASE}/ocorrencias-turmas?id_interclasse=${idInterclasse}&id_turma=${idTurma}`);
            historicoRegistros = await res.json();

            if (!Array.isArray(historicoRegistros) || historicoRegistros.length === 0) {
                conteudo.innerHTML = '<p class="text-muted py-3">Nenhuma ocorrência registrada para esta turma.</p>';
                return;
            }

            let html = '<div class="table-responsive"><table class="table table-hover align-middle">';
            html += '<thead><tr class="table-light"><th>Data</th><th>Título</th><th>Descrição</th><th class="text-center">Pontos</th><th class="text-center">Ação</th></tr></thead><tbody>';

            historicoRegistros.forEach(r => {
                html += '<tr>';
                html += '<td class="small text-muted">' + esc(r.data_ocorrencia) + '</td>';
                html += '<td>' + esc(r.titulo_ocorrencia) + '</td>';
                html += '<td class="small text-muted">' + esc(r.descricao_ocorrencia || '-') + '</td>';
                html += '<td class="text-center"><span class="badge text-bg-danger">-' + r.pontos_descontados + ' pts</span></td>';
                html += '<td class="text-center">';
                html += '<button type="button" class="btn btn-outline-danger btn-sm" title="Remover" aria-label="Remover ocorrência ' + escAttr(r.titulo_ocorrencia || '') + '" data-sgi-action="remove-ocorrencia" data-id-ocorrencia="' + esc(r.id_ocorrencia_turma) + '"><i class="bi bi-trash" aria-hidden="true"></i></button>';
                html += '</td></tr>';
            });

            html += '</tbody></table></div>';
            conteudo.innerHTML = html;
            conteudo.querySelectorAll('[data-sgi-action="remove-ocorrencia"]').forEach((button) => {
                pageScope.listen(button, 'click', () => removerOcorrencia(button.dataset.idOcorrencia));
            });
        } catch (e) {
            conteudo.innerHTML = '<p class="text-danger">Erro ao carregar histórico.</p>';
        }
    }

    async function removerOcorrencia(id) {
        if (!await SGI.confirm({ titulo: 'Remover ocorrência?', mensagem: 'Esta ação não pode ser desfeita.', textoConfirmar: 'Remover ocorrência', destrutivo: true })) return;

        try {
            const res = await fetch(`${API_BASE}/ocorrencias-turmas`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_ocorrencia_turma: id })
            });
            const result = await res.json();
            if (result.success) {
                SGI.alert('Ocorrência removida!');
                carregarHistorico(historicoTurmaId);
            } else {
                SGI.alert('Erro: ' + result.message);
            }
        } catch (e) {
            SGI.alert('Erro de conexão.');
        }
    }

    const btnSalvarOcrModal = document.getElementById('btnSalvarOcrModal');
    if (btnSalvarOcrModal) pageScope.listen(btnSalvarOcrModal, 'click', salvarOcorrenciaModal);

    window.SGIPage.ready( carregarDados);

return {esc, resolverInterclasse, carregarDados, turmasFiltradas, carregarLista, abrirModalOcorrencia, salvarOcorrenciaModal, abrirHistoricoTurma, carregarHistorico, removerOcorrencia};
});
