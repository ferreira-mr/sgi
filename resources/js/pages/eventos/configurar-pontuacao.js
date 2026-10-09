window.SGIPage.mount("eventos/configurar-pontuacao", function (pageConfig, pageScope) {
    const APP_BASE = String(window.SGI_BASE_PATH || '').replace(/\/+$/, '');
    const API_BASE = String(window.SGI_API_BASE || `${APP_BASE}/api/v1/`).replace(/\/?$/, '/');
    const urlParams = new URLSearchParams(window.location.search);
    let idInterclasse = urlParams.get('id');
    const modo = urlParams.get('modo') === 'create' ? 'create' : 'view';
    const PADRAO = { 'pontos-1': 10, 'pontos-2': 7, 'pontos-3': 5, 'pontos-arr': 2 };
    let VALORES_INICIAIS = {};
    let salvamentoEmAndamento = false;
    let destinoPendente = null;
    let modalDirtyExibido = false;

    const modalDirty = document.getElementById('modalPontuacaoDirty');

    function appUrl(path, parametros = {}) {
        const query = new URLSearchParams();
        Object.entries(parametros).forEach(([chave, valor]) => {
            if (valor !== null && valor !== undefined && String(valor) !== '') query.set(chave, String(valor));
        });
        const base = `${APP_BASE}/${String(path).replace(/^\/+/, '')}`;
        return query.size ? `${base}?${query.toString()}` : base;
    }

    function habilitarControles(habilitado) {
        document.querySelectorAll('.ptc-step-input, .ptc-step-btn, #btnRestaurarPadrao, #btnSalvarPontuacao')
            .forEach((element) => { element.disabled = !habilitado; });
    }

    function getPontos(id) {
        const el = document.getElementById(id);
        const v = parseInt(el ? el.value : '', 10);
        return Number.isNaN(v) ? 0 : v;
    }

    function setPontos(id, value) {
        const el = document.getElementById(id);
        if (!el) return;
        const numero = parseInt(value, 10);
        el.value = Number.isNaN(numero) ? PADRAO[id] : numero;
    }

    function temMudancas() {
        return Object.keys(VALORES_INICIAIS).some((id) => getPontos(id) !== VALORES_INICIAIS[id]);
    }

    window.alterarPontos = function (id, delta) {
        const el = document.getElementById(id);
        if (!el) return;
        el.value = Math.max(0, getPontos(id) + delta);
        marcarMudancas();
    };

    window.validarPontos = function (id) {
        const el = document.getElementById(id);
        if (!el) return;
        let value = parseInt(el.value, 10);
        if (Number.isNaN(value) || value < 0) value = 0;
        el.value = value;
        marcarMudancas();
    };

    window.restaurarPadrao = async function () {
        if (!await window.SGI.confirm({ titulo: 'Restaurar valores padrão?', mensagem: '1º: 10, 2º: 7, 3º: 5, multiplicador: 2.', textoConfirmar: 'Restaurar' })) return;
        Object.entries(PADRAO).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) el.value = value;
        });
        marcarMudancas();
    };

    function marcarMudancas() {
        const pill = document.getElementById('ptcUnsaved');
        if (pill) pill.classList.toggle('d-none', !temMudancas());
    }

    async function resolverInterclasse() {
        habilitarControles(false);
        if (!idInterclasse) {
            const ativo = await window.SGIInterclasse.getActiveInterclasse();
            idInterclasse = ativo?.id_interclasse || null;
        }
        if (!idInterclasse) {
            await window.SGI.alert({ titulo: 'Edição não encontrada', mensagem: 'Nenhuma edição foi selecionada ou está ativa.', tipo: 'warning' });
            window.location.href = appUrl('edicoes');
            return null;
        }
        const dados = await window.SGIInterclasse.getInterclasseById(idInterclasse);
        if (!dados) {
            await window.SGI.alert({ titulo: 'Edição não encontrada', mensagem: 'A edição selecionada não está disponível.', tipo: 'warning' });
            window.location.href = appUrl('edicoes');
            return null;
        }

        const nomePontuacaoEl = document.getElementById('nomeInterclassePontuacao');
        if (nomePontuacaoEl) nomePontuacaoEl.textContent = dados.nome_interclasse || 'Interclasse';
        document.getElementById('ptcEditionName').textContent = dados.nome_interclasse || 'esta edição';
        document.getElementById('ptcEditionYear').textContent = `Ano ${window.SGIInterclasse.toYear(dados.ano_interclasse) || 'não informado'}`;
        const status = document.getElementById('ptcEditionStatus');
        const ativa = String(dados.status_interclasse) === '1';
        status.textContent = ativa ? 'Ativa' : 'Inativa';
        status.className = ativa ? 'badge text-bg-success' : 'badge text-bg-secondary';
        window.SGIInterclasse.updatePageTitle(dados.nome_interclasse);

        const paramsEdicao = { id: idInterclasse, modo };
        const btnBack = document.getElementById('btnVoltarPontuacao');
        const btnBackMobile = document.getElementById('sgiBtnVoltar');
        if (btnBack || btnBackMobile) {
            const caminhoRetorno = modo === 'view' ? 'painel' : 'edicoes/modalidades';
            const href = appUrl(caminhoRetorno, paramsEdicao);
            if (btnBack) btnBack.href = href;
            if (btnBackMobile) btnBackMobile.href = href;
        }

        setPontos('pontos-1', dados.ponto_1_lugar);
        setPontos('pontos-2', dados.ponto_2_lugar);
        setPontos('pontos-3', dados.ponto_3_lugar);
        setPontos('pontos-arr', dados.valor_item_arrecadacao);
        VALORES_INICIAIS = {
            'pontos-1': getPontos('pontos-1'),
            'pontos-2': getPontos('pontos-2'),
            'pontos-3': getPontos('pontos-3'),
            'pontos-arr': getPontos('pontos-arr'),
        };
        marcarMudancas();
        habilitarControles(true);
        return idInterclasse;
    }

    async function salvarPontuacao() {
        const btn = document.getElementById('btnSalvarPontuacao');
        if (salvamentoEmAndamento || !btn || !idInterclasse) return false;
        salvamentoEmAndamento = true;
        const pontos = {
            'pontos-1': getPontos('pontos-1'),
            'pontos-2': getPontos('pontos-2'),
            'pontos-3': getPontos('pontos-3'),
            'pontos-arr': getPontos('pontos-arr'),
        };

        try {
            btn.disabled = true;
            btn.setAttribute('aria-busy', 'true');
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span> Salvando…';
            habilitarControles(false);

            const formData = new FormData();
            formData.append('ponto_1_lugar', pontos['pontos-1']);
            formData.append('ponto_2_lugar', pontos['pontos-2']);
            formData.append('ponto_3_lugar', pontos['pontos-3']);
            formData.append('valor_item_arrecadacao', pontos['pontos-arr']);
            const response = await fetch(`${API_BASE}edicoes?id=${encodeURIComponent(idInterclasse)}`, {
                method: 'POST',
                body: formData,
            });
            const data = await response.json().catch(() => null);
            if (!response.ok || !data || typeof data !== 'object' || Array.isArray(data) || data.success !== true) {
                const mensagem = data && typeof data.message === 'string' && data.message.trim()
                    ? data.message
                    : `A resposta do servidor não confirmou o salvamento (HTTP ${response.status}).`;
                throw new Error(mensagem);
            }

            VALORES_INICIAIS = pontos;
            marcarMudancas();
            if (window.SGI?.showToast) window.SGI.showToast('Pontuação salva.', 'success');
            return true;
        } catch (error) {
            await window.SGI.alert({
                titulo: 'Não foi possível salvar a pontuação',
                mensagem: error?.message || 'Os valores preenchidos foram mantidos. Tente novamente.',
                tipo: 'error',
            });
            return false;
        } finally {
            salvamentoEmAndamento = false;
            habilitarControles(true);
            btn.disabled = false;
            btn.removeAttribute('aria-busy');
            btn.innerHTML = '<i class="bi bi-check-lg me-1" aria-hidden="true"></i> Salvar';
        }
    }

    window.salvarPontuacao = salvarPontuacao;

    function aguardarFechamentoModal() {
        if (!modalDirty) return Promise.resolve();
        return new Promise((resolve) => modalDirty.addEventListener('hidden.bs.modal', resolve, { once: true }));
    }

    function aguardarExibicaoModal() {
        if (!modalDirty || modalDirtyExibido) return Promise.resolve();
        return new Promise((resolve) => modalDirty.addEventListener('shown.bs.modal', resolve, { once: true }));
    }

    async function fecharModalENavegar(destino) {
        const destinoFinal = destino || destinoPendente;
        if (!destinoFinal) return;
        // Bootstrap ignores hide() while the opening transition is in progress.
        // Wait for shown so an immediate “Discard and continue” click cannot
        // strand the user on the unsaved form.
        await aguardarExibicaoModal();
        const fechado = aguardarFechamentoModal();
        window.bootstrap.Modal.getOrCreateInstance(modalDirty).hide();
        await fechado;
        window.location.href = destinoFinal;
    }

    async function descartarENavegar() {
        const destino = destinoPendente;
        destinoPendente = null;
        await fecharModalENavegar(destino);
    }

    async function cancelarNavegacao(event) {
        event.preventDefault();
        event.stopPropagation();
        destinoPendente = null;
        await aguardarExibicaoModal();
        const fechado = aguardarFechamentoModal();
        window.bootstrap.Modal.getOrCreateInstance(modalDirty).hide();
        await fechado;
    }

    async function salvarENavegar() {
        const button = document.getElementById('btnSalvarEContinuarPontuacao');
        const destino = destinoPendente;
        if (!destino || !button) return;
        button.disabled = true;
        const salvo = await salvarPontuacao();
        button.disabled = false;
        if (salvo) {
            destinoPendente = null;
            await fecharModalENavegar(destino);
        }
    }

    function solicitarNavegacao(anchor, event) {
        if (!temMudancas()) return;
        event.preventDefault();
        destinoPendente = anchor.href;
        window.bootstrap.Modal.getOrCreateInstance(modalDirty).show();
    }

    window.SGIPage.ready(() => {
        document.querySelectorAll('.ptc-stepper').forEach((stepper) => {
            const input = stepper.querySelector('.ptc-step-input');
            const menos = stepper.querySelector('.ptc-step-btn--minus');
            const mais = stepper.querySelector('.ptc-step-btn--plus');
            if (menos) pageScope.listen(menos, 'click', () => window.alterarPontos(input.id, -1));
            if (mais) pageScope.listen(mais, 'click', () => window.alterarPontos(input.id, 1));
            pageScope.listen(input, 'input', marcarMudancas);
            pageScope.listen(input, 'change', () => window.validarPontos(input.id));
        });

        const btnRestaurar = document.getElementById('btnRestaurarPadrao');
        if (btnRestaurar) pageScope.listen(btnRestaurar, 'click', () => window.restaurarPadrao());

        const btnSalvar = document.getElementById('btnSalvarPontuacao');
        if (btnSalvar) pageScope.listen(btnSalvar, 'click', (event) => {
            event.preventDefault();
            void salvarPontuacao();
        });

        ['btnVoltarPontuacao', 'btnContinuarPontuacao'].forEach((id) => {
            const anchor = document.getElementById(id);
            if (anchor) pageScope.listen(anchor, 'click', (event) => solicitarNavegacao(anchor, event));
        });

        const cancelar = document.getElementById('btnCancelarPontuacaoNavegacao');
        const descartar = document.getElementById('btnDescartarPontuacaoNavegacao');
        const salvarESair = document.getElementById('btnSalvarEContinuarPontuacao');
        if (descartar) pageScope.listen(descartar, 'click', () => { void descartarENavegar(); });
        if (salvarESair) pageScope.listen(salvarESair, 'click', () => { void salvarENavegar(); });
        if (cancelar) pageScope.listen(cancelar, 'click', cancelarNavegacao);
        if (modalDirty) {
            pageScope.listen(modalDirty, 'shown.bs.modal', () => { modalDirtyExibido = true; });
            pageScope.listen(modalDirty, 'hidden.bs.modal', () => {
                modalDirtyExibido = false;
                destinoPendente = null;
            });
        }
    });

    window.SGIPage.ready(async () => {
        const idOk = await resolverInterclasse();
        if (!idOk) return;

        const btnContinuar = document.getElementById('btnContinuarPontuacao');
        if (btnContinuar) {
            btnContinuar.href = appUrl('edicoes/resumo', { id: idInterclasse, modo });
            btnContinuar.classList.toggle('d-none', modo !== 'create');
        }
    });

    return { getPontos, setPontos, marcarMudancas, temMudancas, resolverInterclasse, salvarPontuacao };
});
