window.SGIPage.mount("aluno/modalidade", function (pageConfig, pageScope) {

    const APP_BASE = String(window.SGI_BASE_PATH || '').replace(/\/+$/, '');
    const API_BASE = String(window.SGI_API_BASE || `${APP_BASE}/api/v1/`).replace(/\/?$/, '/');

    function apiUrl(endpoint, query = {}) {
        const url = new URL(String(endpoint).replace(/^\/+/, ''), new URL(API_BASE, window.location.href));
        Object.entries(query).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
        });
        return url.toString();
    }

    async function lerJson(response, descricao) {
        if (!response.ok) {
            throw new Error(`${descricao}: HTTP ${response.status}`);
        }

        const contentType = response.headers.get('content-type') || '';
        if (!/application\/json|\+json/i.test(contentType)) {
            throw new Error(`${descricao}: resposta não é JSON.`);
        }

        let dados;
        try {
            dados = await response.json();
        } catch (_) {
            throw new Error(`${descricao}: resposta JSON inválida.`);
        }
        if (dados && dados.success === false) {
            throw new Error(`${descricao}: consulta recusada.`);
        }
        return dados;
    }

    const urlParams = new URLSearchParams(window.location.search);
    
    // CORREÇÃO: Transformado de "const" para "let" para permitir a reatribuição da variável depois
    let idInterclasse = urlParams.get('id'); 
    
    const generoUsuario = pageConfig.value2;
    const categoriaUsuario = pageConfig.value3;
    const idTurmaUsuario = pageConfig.value4;
    const modalidadesInscritas = pageConfig.value5;
    const cronogramaVersao = pageConfig.value7;
    const versaoPublicada = pageConfig.value8;
    const estaInscrito = modalidadesInscritas.length > 0;
    let modalidadesData = [];
    let carregandoDados = false;
    let inscricoesRenderizadas = false;
    const agendaCache = new Map();

    function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }

    function mostrarFeedbackInscricao(message, feedback, error = false) {
        if (!feedback) return;
        feedback.className = `small ${error ? 'text-danger' : 'text-success'} text-center mb-0 mt-2`;
        if (error && String(message || '').toLowerCase().includes('cronograma foi alterado')) {
            feedback.innerHTML = `${esc(message)} <button type="button" class="btn btn-link btn-sm p-0 align-baseline" data-sgi-action="refresh-registration-agenda">Atualizar a agenda e conferir novamente</button>`;
            return;
        }
        feedback.textContent = message;
    }

    // Mapa de ícones por modalidade (visual)
    function iconeModalidade(nome) {
        const n = (nome || '').toLowerCase();
        if (n.includes('futebol')) return 'bi-dribbble';
        if (n.includes('volei')) return 'bi-people-fill';
        if (n.includes('queimada')) return 'bi-bullseye';
        if (n.includes('basquet')) return 'bi-basket-fill';
        if (n.includes('handebol') || n.includes('handball')) return 'bi-person-arms-up';
        if (n.includes('corrida')) return 'bi-lightning-charge-fill';
        if (n.includes('atletis')) return 'bi-lightning-charge-fill';
        if (n.includes('xadrez')) return 'bi-puzzle-fill';
        if (n.includes('nata')) return 'bi-droplet-fill';
        if (n.includes('judo') || n.includes('judô') || n.includes('luta')) return 'bi-shield-fill';
        return 'bi-trophy-fill';
    }

    async function carregarDados() {
        if (carregandoDados) return;
        carregandoDados = true;

        try {
            if (estaInscrito && !inscricoesRenderizadas) {
                renderizarInscricoes();
                inscricoesRenderizadas = true;
            }

            if (!idInterclasse) {
                const respostaEdicoes = await fetch(apiUrl('edicoes', { regulamento: 'true' }));
                const listaInter = await lerJson(respostaEdicoes, 'Consulta de edições');
                if (!Array.isArray(listaInter)) {
                    throw new Error('Consulta de edições: formato inválido.');
                }
                const ativos = listaInter.filter(i => String(i.status_interclasse) === '1');
                if (ativos.length === 0) {
                    mostrarSemEdicaoAtiva();
                    return;
                }
                idInterclasse = String(ativos[0].id_interclasse);
                const url = new URL(window.location);
                url.searchParams.set('id', idInterclasse);
                window.history.replaceState({}, '', url);
            }

            const resInter = await fetch(apiUrl('edicoes', { regulamento: 'true' }));
            const listaInter = await lerJson(resInter, 'Consulta de edições');
            if (!Array.isArray(listaInter)) {
                throw new Error('Consulta de edições: formato inválido.');
            }
            const dadosInter = listaInter.find(i => String(i.id_interclasse) === String(idInterclasse));
            if (dadosInter) {
                const msg = estaInscrito ? ' — Suas inscrições' : ' — Selecione até 3 modalidades';
            }

            const res = await fetch(apiUrl('modalidades', {
                id_interclasse: idInterclasse,
                id_turma: idTurmaUsuario > 0 ? idTurmaUsuario : undefined,
            }));
            const lista = await lerJson(res, 'Consulta de modalidades');
            if (!Array.isArray(lista)) {
                throw new Error('Consulta de modalidades: formato inválido.');
            }
            modalidadesData = lista.filter(m => String(m.status_modalidade) === '1');

            if (!estaInscrito) {
                document.getElementById('inscricoesAtuais').innerHTML = '';
                const secao = document.getElementById('secaoInscricoes');
                if (secao) secao.classList.add('d-none');
            }
            renderizarSelecao(capturarSelecaoAtual());

        } catch (e) {
            console.error(e);
            mostrarErroCarregamento();
        } finally {
            carregandoDados = false;
        }
    }

    function mensagemErroCarregamento() {
        return `
            <div class="col-12 js-erro-modalidades" role="alert" aria-live="assertive">
                <div class="alert alert-danger mb-0">
                    <p class="mb-2">Não foi possível carregar as modalidades. Suas inscrições confirmadas e escolhas atuais foram preservadas.</p>
                    <button type="button" class="btn btn-outline-danger btn-sm" data-sgi-action="retry-modalidades">
                        Tentar novamente
                    </button>
                </div>
            </div>`;
    }

    function mostrarErroCarregamento() {
        const grid = document.getElementById('modalidadesGrid');
        grid.querySelectorAll('.js-erro-modalidades').forEach((elemento) => elemento.remove());
        if (grid.querySelector('.modalidade-card')) {
            grid.insertAdjacentHTML('afterbegin', mensagemErroCarregamento());
        } else {
            grid.innerHTML = mensagemErroCarregamento();
        }
    }

    function mostrarSemEdicaoAtiva() {
        const grid = document.getElementById('modalidadesGrid');
        grid.innerHTML = '<div class="col-12 text-center text-body-secondary py-5" role="status">Não há uma edição ativa para inscrições no momento.</div>';
        document.getElementById('acoesInscricao').classList.add('d-none');
    }

    function capturarSelecaoAtual() {
        const selecao = new Map();
        document.querySelectorAll('.modalidade-card.selected').forEach((card) => {
            selecao.set(String(card.dataset.id), {
                equipe: card.dataset.equipe || '',
                equipeNome: card.dataset.equipeNome || '',
            });
        });
        return selecao;
    }

    function atualizarContador() {
        const inscritos = new Set(modalidadesInscritas.map(m => String(m.id_modalidade))).size;
        const selecionados = document.querySelectorAll('.modalidade-card.selected').length;
        const total = inscritos + selecionados;
        const restantes = Math.max(0, 3 - inscritos);
        document.getElementById('contador').textContent = `Você pode escolher até ${restantes} modalidade(s) (${total}/3)`;
    }

    // Atualiza o painel visual de progresso (contador grande, barra e botão)
    function atualizarProgresso() {
        const inscritos = new Set(modalidadesInscritas.map(m => String(m.id_modalidade))).size;
        const selecionados = document.querySelectorAll('.modalidade-card.selected').length;
        const total = Math.min(3, inscritos + selecionados);

        const numEl = document.getElementById('counterNum');
        if (numEl) numEl.textContent = total;

        const badge = document.getElementById('limiteBadge');
        const statusDefault = document.getElementById('statusDefault');
        if (badge && statusDefault) {
            const atingiu = total >= 3;
            badge.classList.toggle('d-none', !atingiu);
            statusDefault.classList.toggle('d-none', atingiu);
        }

        const countEl = document.getElementById('progressCount');
        if (countEl) countEl.textContent = `${total} de 3`;
        const progress = document.querySelector('#acoesInscricao .progress');
        const progressBar = document.getElementById('progressBar');
        if (progress) progress.setAttribute('aria-valuenow', String(total));
        if (progressBar) progressBar.style.width = `${(total / 3) * 100}%`;

        const btn = document.getElementById('btnSalvar');
        if (btn && btn.innerHTML.indexOf('Salvando') === -1) {
            btn.disabled = selecionados === 0;
        }
    }

    // Observa as mudanças de seleção dos cards para manter o progresso em dia
    function inicializarProgresso() {
        atualizarProgresso();
        const grid = document.getElementById('modalidadesGrid');
        if (!grid) return;
        new MutationObserver(() => atualizarProgresso())
            .observe(grid, { attributes: true, childList: true, subtree: true, attributeFilter: ['class'] });
    }

    // Define o status de vagas de uma modalidade com base na capacidade da turma do aluno.
    // Capacidade por turma = max_inscrito_modalidade x max_equipes (ilimitado se algum for ilimitado).
    function statusVagas(mod) {
        const maxInscrito = parseInt(mod.max_inscrito_modalidade) || 0;
        const maxEquipes = mod.max_equipes ? parseInt(mod.max_equipes) || 0 : 0;
        const capacidade = (maxInscrito > 0 && maxEquipes > 0) ? maxInscrito * maxEquipes : 0;
        if (capacidade <= 0) {
            return {
                state: '',
                badge: '',
                icon: '',
                label: '',
                detail: 'Não há limite de vagas por turma configurado para esta modalidade.',
            };
        }
        const inscritos = parseInt(mod.qtd_inscritos_turma) || 0;
        const restantes = capacidade - inscritos;
        if (restantes <= 0) {
            return {
                state: 'lotado',
                badge: 'text-bg-danger',
                icon: 'bi-x-circle-fill',
                label: 'Lotado',
                detail: `Capacidade da turma: ${capacidade} vagas. Não há vagas restantes.`,
            };
        }
        if (restantes <= 2) {
            return {
                state: 'limited',
                badge: 'text-bg-warning',
                icon: 'bi-exclamation-triangle-fill',
                label: `Poucas vagas: ${restantes} ${restantes === 1 ? 'vaga restante' : 'vagas restantes'}`,
                detail: `Capacidade da turma: ${capacidade} vagas; ${restantes} ${restantes === 1 ? 'vaga restante' : 'vagas restantes'}.`,
            };
        }
        return {
            state: '',
            badge: 'text-bg-success',
            icon: 'bi-check-circle-fill',
            label: `${restantes} vagas restantes`,
            detail: `Capacidade da turma: ${capacidade} vagas; ${restantes} vagas restantes.`,
        };
    }

    function rotuloGeneroModalidade(genero) {
        const labels = { MASC: 'Masculino', FEM: 'Feminino', MISTO: 'Misto', MISTA: 'Misto' };
        return labels[String(genero || '').toUpperCase()] || 'Gênero não informado';
    }

    function atualizarEstadoCard(card, selecionado) {
        card.classList.toggle('selected', selecionado);
        card.setAttribute('aria-pressed', selecionado ? 'true' : 'false');
        card.classList.toggle('border-primary', selecionado);
        card.classList.toggle('bg-primary-subtle', selecionado);
        card.classList.toggle('shadow', selecionado);
        const chip = card.querySelector('.card-equipe');
        if (chip) chip.classList.toggle('d-none', !selecionado);
        const check = card.querySelector('.card-check');
        if (check) check.classList.toggle('d-none', !selecionado);
    }

    function renderizarSelecao(selecaoPreservada = new Map()) {
        const grid = document.getElementById('modalidadesGrid');
        const acoes = document.getElementById('acoesInscricao');
        grid.innerHTML = '';

        const inscritosIds = new Set(modalidadesInscritas.map(m => String(m.id_modalidade)));
        const qtdInscritos = inscritosIds.size;

        if (qtdInscritos >= 3) {
            acoes.classList.add('d-none');
            grid.innerHTML = '<div class="col-12 w-100" ><div class="d-flex flex-column align-items-center justify-content-center text-center text-success py-5" ><i class="bi bi-check-circle-fill fs-1 mb-2"></i><span>Você já está inscrito em 3 modalidades. Limite atingido.</span></div></div>';
            return;
        }

        const filtradas = modalidadesData.filter(mod =>
            (mod.genero_modalidade === 'MISTO' || mod.genero_modalidade === generoUsuario) &&
            parseInt(mod.categorias_id_categoria) === categoriaUsuario
        );

        const disponiveis = filtradas.filter(mod => !inscritosIds.has(String(mod.id_modalidade)));

        atualizarContador();

        if (disponiveis.length === 0) {
            acoes.classList.add('d-none');
            grid.innerHTML = '<div class="col-12 w-100" ><div class="d-flex flex-column align-items-center justify-content-center text-center text-muted py-5" ><i class="bi bi-inbox fs-1 mb-2"></i><span>Nenhuma modalidade disponível para sua categoria no momento.</span></div></div>';
            return;
        }

        acoes.classList.remove('d-none');

        disponiveis.forEach(mod => {
            const col = document.createElement('div');
            col.className = 'col';
            const vagas = statusVagas(mod);
            const lotado = vagas.state === 'lotado';
            const idVagas = `vagas-modalidade-${esc(mod.id_modalidade)}`;
            col.innerHTML = `
                <div class="modalidade-card card border shadow-sm position-relative h-100 p-4 text-center d-flex flex-column align-items-center gap-2 sgi-u-cursor-pointer${lotado ? ' lotado opacity-50' : ''}" role="button" tabindex="0" aria-pressed="false" aria-disabled="${lotado ? 'true' : 'false'}" aria-describedby="${idVagas}" data-sgi-action="open-equipe" data-id="${esc(mod.id_modalidade)}" data-nome="${esc(mod.nome_modalidade)}">
                    <span class="card-check position-absolute top-0 end-0 translate-middle badge rounded-circle text-bg-primary d-none"><i class="bi bi-check-lg" aria-hidden="true"></i><span class="visually-hidden">Selecionada</span></span>
                    ${vagas.label ? `<span class="badge ${vagas.badge} position-absolute top-0 start-0 translate-middle-y ms-2"><i class="bi ${vagas.icon} me-1" aria-hidden="true"></i>${esc(vagas.label)}</span>` : ''}
                    <div class="card-icon-wrap bg-primary-subtle text-primary rounded-3 p-3 fs-3 d-inline-flex"><i class="bi ${iconeModalidade(mod.nome_modalidade)}" aria-hidden="true"></i></div>
                    <div class="card-info d-flex flex-column align-items-center gap-1">
                        <span class="card-nome fw-semibold">${esc(mod.nome_modalidade)}</span>
                        <span class="card-categoria badge text-bg-light border text-body-secondary text-uppercase">${esc(mod.nome_categoria || 'Categoria')}</span>
                        <span class="card-genero small text-body-secondary">${esc(rotuloGeneroModalidade(mod.genero_modalidade))}</span>
                        <span class="card-equipe badge bg-primary-subtle text-primary d-none"></span>
                    </div>
                    <span class="small text-body-secondary" id="${idVagas}">${esc(vagas.detail)}${lotado ? ' Modalidade indisponível para inscrição.' : ''}</span>
                </div>
            `;
            grid.appendChild(col);

            const escolha = selecaoPreservada.get(String(mod.id_modalidade));
            const card = col.querySelector('.modalidade-card');
            if (escolha && !lotado && escolha.equipe) {
                atualizarEstadoCard(card, true);
                card.dataset.equipe = escolha.equipe;
                card.dataset.equipeNome = escolha.equipeNome;
                const chip = card.querySelector('.card-equipe');
                if (chip) chip.textContent = `Equipe: ${escolha.equipeNome}`;
            }
        });
        void atualizarAgendaSelecao();
    }

    function renderizarInscricoes() {
        const container = document.getElementById('inscricoesAtuais');
        container.innerHTML = '';

        if (modalidadesInscritas.length === 0) {
            document.getElementById('secaoInscricoes').classList.add('d-none');
            return;
        }

        document.getElementById('secaoInscricoes').classList.remove('d-none');
        const badge = document.getElementById('badgeInscricoes');
        if (badge) badge.textContent = `${modalidadesInscritas.length}/3`;

        const wrapper = document.createElement('div');
        wrapper.className = 'row row-cols-1 row-cols-md-3 g-3';

        const equipesParaCarregar = [];

        modalidadesInscritas.forEach(mod => {
            const col = document.createElement('div');
            col.className = 'col';
            col.innerHTML = `
                <div class="card border-0 border-start border-4 border-success shadow-sm p-3 h-100" data-equipe="${mod.id_equipe}">
                    <div class="d-flex align-items-center gap-2 mb-2">
                        <i class="bi bi-trophy fs-4 text-success"></i>
                        <div>
                            <strong class="d-block">${esc(mod.nome_modalidade)}</strong>
                            <small class="text-muted">${esc(mod.nome_categoria)}</small>
                        </div>
                        <span class="badge bg-success-subtle text-success ms-auto rounded-pill">Inscrito</span>
                    </div>
                    <div class="membros-equipe mt-2" id="membros-${mod.id_equipe}">
                        <div class="text-center text-muted small py-2">
                            <div class="spinner-border spinner-border-sm me-1" role="status"></div>
                            Carregando equipe...
                        </div>
                    </div>
                    <div class="agenda-equipe mt-3" id="agenda-inscricao-${mod.id_equipe}">
                        <div class="small text-body-secondary"><span class="spinner-border spinner-border-sm me-1" role="status"></span>Carregando agenda...</div>
                    </div>
                    <div class="text-center mt-2">
                        <button type="button" class="btn btn-outline-danger btn-sm d-inline-flex align-items-center gap-1"
                            data-modalidade-id="${mod.id_modalidade}"
                            data-modalidade-nome="${esc(mod.nome_modalidade)}"
                            data-equipe-id="${mod.id_equipe}"
                            data-sgi-action="details-modalidade">
                            <i class="bi bi-calendar-event me-1"></i> Ver detalhes
                        </button>
                    </div>
                </div>
            `;
            wrapper.appendChild(col);
            equipesParaCarregar.push(mod.id_equipe);
        });

        container.appendChild(wrapper);

        equipesParaCarregar.forEach(idEquipe => carregarMembros(idEquipe));
        carregarAgendaEquipes(equipesParaCarregar).then((agenda) => {
            modalidadesInscritas.forEach((mod) => {
                const agendaContainer = document.getElementById(`agenda-inscricao-${mod.id_equipe}`);
                if (!agendaContainer) return;
                agendaContainer.innerHTML = equipeAgendaHtml(agendaPorEquipe(agenda, mod.id_equipe), true);
            });
        }).catch(() => {
            modalidadesInscritas.forEach((mod) => {
                const agendaContainer = document.getElementById(`agenda-inscricao-${mod.id_equipe}`);
                if (agendaContainer) agendaContainer.innerHTML = '<div class="small text-danger">Não foi possível carregar a agenda prevista.</div>';
            });
        });
    }

    function formatarData(dataStr) {
        if (!dataStr) return 'A definir';
        const d = new Date(dataStr + 'T00:00:00');
        if (isNaN(d.getTime())) return dataStr;
        return d.toLocaleDateString('pt-BR');
    }

    function formatarHorario(inicio, termino) {
        const horaInicio = inicio ? String(inicio).substring(0, 5) : '--:--';
        const horaTermino = termino ? String(termino).substring(0, 5) : '';
        return horaTermino ? `${horaInicio} - ${horaTermino}` : horaInicio;
    }

    async function carregarAgendaEquipes(idsEquipes) {
        const ids = Array.from(new Set((Array.isArray(idsEquipes) ? idsEquipes : [idsEquipes])
            .map(Number)
            .filter(id => id > 0)))
            .sort((a, b) => a - b);
        if (ids.length === 0) return { publicado: false, compromissos: [], avancos: [], equipes: [] };

        const cacheKey = `${idInterclasse}:${ids.join(',')}`;
        if (agendaCache.has(cacheKey)) return agendaCache.get(cacheKey);

        const request = fetch(apiUrl('cronograma', {
            acao: 'agenda_aluno',
            id_interclasse: idInterclasse,
            id_equipes: ids.join(','),
        }))
            .then(response => lerJson(response, 'Consulta da agenda'))
            .then(data => ({
                publicado: data.publicado === true,
                compromissos: Array.isArray(data.compromissos) ? data.compromissos : [],
                avancos: Array.isArray(data.avancos) ? data.avancos : [],
                equipes: Array.isArray(data.equipes) ? data.equipes : [],
                versaoPublicada: data.versao_publicada ?? null,
            }));
        agendaCache.set(cacheKey, request);
        return request;
    }

    function agendaPorEquipe(agenda, idEquipe) {
        const id = Number(idEquipe);
        return {
            publicado: agenda.publicado,
            compromissos: agenda.compromissos.filter(item => Number(item.id_equipe) === id),
            avancos: agenda.avancos.filter(item => Number(item.id_equipe) === id),
        };
    }

    function agendaVaziaHtml(publicado) {
        if (!publicado) {
            return '<div class="small text-body-secondary"><i class="bi bi-calendar-x me-1"></i>A agenda ainda não foi publicada.</div>';
        }
        return '<div class="small text-body-secondary"><i class="bi bi-calendar-x me-1"></i>Nenhum horário previsto para esta equipe.</div>';
    }

    function compromissoAgendaHtml(item, compacto = false) {
        const adversario = item.condicional ? 'A definir após a fase anterior' : (item.oponente || 'A definir');
        return `
            <div class="${compacto ? 'small ' : ''}py-2 border-bottom">
                <div class="d-flex justify-content-between align-items-start gap-2">
                    <span class="fw-semibold"><i class="bi bi-calendar-event me-1 text-primary"></i>${esc(formatarData(item.data_compromisso))} · ${esc(formatarHorario(item.inicio_compromisso, item.termino_compromisso))}</span>
                    ${item.condicional ? '<span class="badge rounded-pill text-bg-warning">Se avançar</span>' : ''}
                </div>
                <div class="text-body-secondary mt-1">
                    <i class="bi bi-diagram-3 me-1"></i>${esc(item.fase || 'Fase prevista')}
                    <span class="mx-1">·</span><i class="bi bi-geo-alt me-1"></i>${esc(item.nome_local || 'A definir')}
                </div>
                <div class="text-body-secondary mt-1"><i class="bi bi-shield me-1"></i>Adversário: ${esc(adversario)}</div>
            </div>`;
    }

    function equipeAgendaHtml(agenda, compacto = false) {
        if (!agenda || (!agenda.compromissos.length && !agenda.avancos.length)) return agendaVaziaHtml(agenda?.publicado === true);
        const compromissos = agenda.compromissos.map(item => compromissoAgendaHtml(item, compacto)).join('');
        const avancos = agenda.avancos.map(item => `
            <div class="${compacto ? 'small ' : ''}py-2 border-bottom text-body-secondary">
                <i class="bi bi-fast-forward-circle me-1 text-success"></i><strong>${esc(item.fase || 'Próxima fase')}:</strong> ${esc(item.mensagem)}
            </div>`).join('');
        return `${compromissos}${avancos}`;
    }

    async function atualizarAgendaSelecao() {
        const section = document.getElementById('agendaInscricaoPreview');
        const corpo = document.getElementById('agendaInscricaoPreviewCorpo');
        if (!section || !corpo) return;
        const ids = Array.from(document.querySelectorAll('.modalidade-card.selected'))
            .map(card => Number(card.dataset.equipe || 0))
            .filter(id => id > 0);
        if (ids.length === 0) {
            section.classList.add('d-none');
            corpo.innerHTML = '';
            return;
        }
        section.classList.remove('d-none');
        corpo.innerHTML = '<div class="text-body-secondary small"><span class="spinner-border spinner-border-sm me-1" role="status"></span>Consultando os horários previstos...</div>';
        try {
            const agenda = await carregarAgendaEquipes(ids);
            const porEquipe = new Map();
            agenda.equipes.forEach(equipe => porEquipe.set(Number(equipe.id_equipe), equipe));
            corpo.innerHTML = ids.map(id => {
                const equipe = porEquipe.get(id);
                const equipeNome = equipe?.nome_equipe || `Equipe ${id}`;
                return `<div class="card border-0 bg-body-tertiary mb-2"><div class="card-body p-3"><div class="fw-semibold mb-1"><i class="bi bi-people-fill me-1 text-primary"></i>${esc(equipeNome)}</div>${equipeAgendaHtml(agendaPorEquipe(agenda, id), false)}</div></div>`;
            }).join('');
        } catch (error) {
            console.error('Erro ao carregar agenda da seleção:', error);
            corpo.innerHTML = '<div class="alert alert-warning mb-0 small">A agenda não pôde ser consultada agora. Você ainda pode selecionar a equipe e tentar novamente antes de salvar.</div>';
        }
    }

    async function verDetalhesModalidade(btn) {
        const idModalidade = btn.dataset.modalidadeId;
        const nomeModalidade = btn.dataset.modalidadeNome;
        const idEquipe = Number(btn.dataset.equipeId || 0);
        const corpo = document.getElementById('modalDetalhesCorpo');

        document.getElementById('modalDetalhesTitle').textContent = nomeModalidade || 'Detalhes';
        corpo.innerHTML = '<div class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm me-2" role="status"></div>Carregando agenda...</div>';

        const modal = new bootstrap.Modal(document.getElementById('modalDetalhes'));
        modal.show();

        try {
            const [agenda, jogosResponse] = await Promise.all([
                carregarAgendaEquipes(idEquipe > 0 ? [idEquipe] : []),
                fetch(apiUrl('jogos', { id_modalidade: idModalidade, id_interclasse: idInterclasse })),
            ]);
            const lista = await lerJson(jogosResponse, 'Consulta de jogos');
            if (!Array.isArray(lista)) {
                throw new Error('Consulta de jogos: formato inválido.');
            }

            const agendaEquipe = agendaPorEquipe(agenda, idEquipe);
            const jogosHtml = lista.map(j => {
                const status = j.status_jogo || 'Agendado';
                const ehFinalizado = String(status).toLowerCase() === 'concluido';
                const badgeCls = ehFinalizado ? 'text-bg-success' : 'text-bg-warning';
                const badgeTxt = ehFinalizado ? 'Finalizado' : (String(status).toLowerCase() === 'iniciado' ? 'Em andamento' : 'Agendado');

                const hora = j.inicio_jogo ? String(j.inicio_jogo).substring(0, 5) : '--:--';
                const horaFim = j.termino_jogo ? String(j.termino_jogo).substring(0, 5) : '';
                const local = j.nome_local || 'A definir';
                const confronto = j.equipes_nomes || 'A definir';

                return `
                    <div class="py-3 border-bottom">
                        <div class="d-flex justify-content-between align-items-center mb-1">
                            <span class="fw-semibold"><i class="bi bi-calendar-event me-2 text-primary"></i>${formatarData(j.data_jogo)}</span>
                            <span class="badge rounded-pill ${badgeCls}">${badgeTxt}</span>
                        </div>
                        <div class="small text-body-secondary">
                            <i class="bi bi-clock me-1"></i>${hora}${horaFim ? ' - ' + horaFim : ''}
                            <span class="mx-2">|</span>
                            <i class="bi bi-geo-alt me-1"></i>${esc(local)}
                        </div>
                        <div class="small text-body-secondary mt-1">
                            <i class="bi bi-shield me-1"></i>${esc(confronto)}
                        </div>
                    </div>
                `;
            }).join('');
            const planejadaHtml = `<div class="mb-3"><h6 class="fw-bold"><i class="bi bi-calendar2-week me-1 text-primary"></i>Agenda prevista</h6>${equipeAgendaHtml(agendaEquipe, false)}</div>`;
            const jogosSecao = lista.length > 0
                ? `<hr><h6 class="fw-bold"><i class="bi bi-check2-circle me-1 text-success"></i>Jogos já materializados</h6>${jogosHtml}`
                : '<hr><div class="small text-body-secondary"><i class="bi bi-info-circle me-1"></i>Os horários acima são o cronograma previsto; os jogos operacionais ainda não foram materializados.</div>';
            corpo.innerHTML = planejadaHtml + jogosSecao;

        } catch (e) {
            console.error('Erro ao carregar agenda/jogos:', e);
            corpo.innerHTML = '<div class="text-center text-danger py-4"><i class="bi bi-exclamation-triangle fs-1 d-block mb-2"></i>Erro ao carregar a agenda. Tente novamente.</div>';
        }
    }

    async function carregarMembros(idEquipe) {
        const container = document.getElementById('membros-' + idEquipe);
        try {
            const res = await fetch(apiUrl('equipes', { id_equipe: idEquipe }));
            const membros = await lerJson(res, 'Consulta da equipe');
            if (!Array.isArray(membros)) {
                throw new Error('Consulta da equipe: formato inválido.');
            }

            container.innerHTML = '<div class="fw-semibold small text-body-secondary mb-1"><i class="bi bi-people-fill me-1"></i>Sua equipe:</div>';

            if (membros.length === 0) {
                container.innerHTML += '<div class="text-body-secondary small">Nenhum colega na equipe ainda.</div>';
                return;
            }

            const userId = pageConfig.value6;
            membros.forEach(m => {
                const ehVoce = String(m.id_usuario) === String(userId);
                const div = document.createElement('div');
                div.className = 'd-flex align-items-center gap-2 py-1';
                const img = document.createElement('img');
                img.className = 'rounded-circle d-none object-fit-cover';
                img.width = 26; img.height = 26;
                img.alt = '';
                img.onload = function() { img.classList.remove('d-none'); icon.classList.add('d-none'); };
                img.onerror = function() { img.classList.add('d-none'); icon.classList.remove('d-none'); };
                const icon = document.createElement('i');
                icon.className = 'bi bi-person-circle text-secondary';
                div.appendChild(img);
                div.appendChild(icon);
                const span = document.createElement('span');
                span.className = ehVoce ? 'fw-semibold text-success' : '';
                span.textContent = String(m.nome_usuario || '') + (ehVoce ? ' (Você)' : '');
                div.appendChild(span);
                container.appendChild(div);
                fetch(apiUrl('foto', { user_id: m.id_usuario }))
                    .then(r => r.json())
                    .then(d => { if (d.foto_usuario) img.src = APP_BASE + '/uploads/fotosUsuarios/' + encodeURIComponent(d.foto_usuario); })
                    .catch(function() {});
            });
        } catch (e) {
            console.error('Erro ao carregar membros:', e);
            container.innerHTML = '<div class="text-danger small">Erro ao carregar equipe.</div>';
        }
    }

    async function abrirEquipesModalidade(card) {
        const idModalidade = card.dataset.id;
        const nomeModalidade = card.dataset.nome;

        if (card.classList.contains('lotado')) {
            document.getElementById('msgFeedback').textContent = 'Modalidade lotada. Não é possível se inscrever.';
            card.classList.add('border-danger');
            setTimeout(() => card.classList.remove('border-danger'), 500);
            setTimeout(() => document.getElementById('msgFeedback').textContent = '', 2500);
            return;
        }

        if (card.classList.contains('selected')) {
            atualizarEstadoCard(card, false);
            delete card.dataset.equipe;
            delete card.dataset.equipeNome;
            const chip = card.querySelector('.card-equipe');
            if (chip) chip.textContent = '';
            atualizarContador();
            void atualizarAgendaSelecao();
            return;
        }

        const selecionados = document.querySelectorAll('.modalidade-card.selected').length;
        const inscritos = new Set(modalidadesInscritas.map(m => String(m.id_modalidade))).size;

        if (selecionados + inscritos >= 3) {
            document.getElementById('msgFeedback').textContent = 'Você já selecionou o número máximo de modalidades.';
            card.classList.add('border-danger');
            setTimeout(() => card.classList.remove('border-danger'), 500);
            setTimeout(() => document.getElementById('msgFeedback').textContent = '', 2500);
            return;
        }

        const chip = card.querySelector('.card-equipe');
        if (chip) chip.textContent = 'Carregando...';

        try {
            const res = await fetch(apiUrl('equipes', { id_modalidade: idModalidade, id_turma: idTurmaUsuario }));
            const equipes = await lerJson(res, 'Consulta de equipes');
            if (!Array.isArray(equipes)) {
                throw new Error('Consulta de equipes: formato inválido.');
            }

            if (chip) chip.textContent = '';

            if (equipes.length === 0) {
                document.getElementById('msgFeedback').textContent = 'Nenhuma equipe disponível para esta modalidade.';
                setTimeout(() => document.getElementById('msgFeedback').textContent = '', 2500);
                return;
            }

            document.getElementById('modalEquipesTitle').textContent = `Escolha a equipe`;
            document.getElementById('modalEquipesSubtitulo').textContent = nomeModalidade;

            let agenda = { publicado: false, compromissos: [], avancos: [], equipes: [] };
            try {
                agenda = await carregarAgendaEquipes(equipes.map(e => e.id_equipe));
            } catch (error) {
                console.error('Erro ao carregar prévia da agenda:', error);
            }

            const corpo = document.getElementById('modalEquipesCorpo');
            corpo.innerHTML = equipes.map(e => {
                const equipeAgenda = agendaPorEquipe(agenda, e.id_equipe);
                return `
                    <div class="equipe-pick-row p-3 mb-2 border rounded-3 bg-body sgi-u-cursor-pointer" role="button" tabindex="0" data-sgi-action="select-equipe" data-modalidade-id="${esc(idModalidade)}" data-equipe="${esc(e.id_equipe)}" data-equipe-nome="${esc(e.nome_equipe)}">
                        <div class="d-flex align-items-center gap-3">
                            <div class="bg-primary-subtle text-primary rounded-circle p-2 d-inline-flex"><i class="bi bi-people-fill"></i></div>
                            <div class="flex-grow-1">
                                <div class="fw-semibold">${esc(e.nome_equipe)}</div>
                                <div class="small text-body-secondary">Equipe da turma</div>
                            </div>
                            <div class="d-none bg-primary text-white rounded-circle p-1"><i class="bi bi-check-lg"></i></div>
                        </div>
                        <div class="mt-2 ps-5">${equipeAgendaHtml(equipeAgenda, true)}</div>
                    </div>
                `;
            }).join('');
            
            const modal = new bootstrap.Modal(document.getElementById('modalEquipes'));
            modal.show();

        } catch (e) {
            console.error(e);
            if (chip) chip.textContent = 'Erro ao carregar';
        }
    }

    function selecionarEquipe(row, idModalidade) {
        const equipe = row.dataset.equipe;
        const equipeNome = row.dataset.equipeNome;

        document.querySelectorAll('.modalidade-card').forEach(card => {
            if (String(card.dataset.id) === String(idModalidade)) {
                atualizarEstadoCard(card, true);
                card.dataset.equipe = equipe;
                card.dataset.equipeNome = equipeNome;
                const chip = card.querySelector('.card-equipe');
                if (chip) chip.textContent = 'Equipe: ' + equipeNome;
            }
        });

        bootstrap.Modal.getInstance(document.getElementById('modalEquipes'))?.hide();
        atualizarContador();
        void atualizarAgendaSelecao();
    }

    function removerEquipeSelecionada(idModalidade) {
        document.querySelectorAll('.modalidade-card').forEach(card => {
            if (String(card.dataset.id) === String(idModalidade)) {
                atualizarEstadoCard(card, false);
                delete card.dataset.equipe;
                delete card.dataset.equipeNome;
                const chip = card.querySelector('.card-equipe');
                if (chip) chip.textContent = '';
            }
        });

        bootstrap.Modal.getInstance(document.getElementById('modalEquipes'))?.hide();
        atualizarContador();
        void atualizarAgendaSelecao();
    }

    async function salvarEscolhas() {
        const selecionados = document.querySelectorAll('.modalidade-card.selected');
        if (selecionados.length === 0) {
            document.getElementById('msgFeedback').textContent = 'Por favor, escolha pelo menos 1 modalidade.';
            setTimeout(() => document.getElementById('msgFeedback').textContent = '', 2000);
            return;
        }

        const lotados = Array.from(selecionados).filter(c => c.classList.contains('lotado'));
        if (lotados.length > 0) {
            document.getElementById('msgFeedback').textContent = 'Uma ou mais modalidades selecionadas ficaram lotadas. Remova-as e tente novamente.';
            lotados.forEach(c => {
                atualizarEstadoCard(c, false);
                delete c.dataset.equipe;
                delete c.dataset.equipeNome;
                const chip = c.querySelector('.card-equipe');
                if (chip) chip.textContent = '';
            });
            atualizarContador();
            setTimeout(() => document.getElementById('msgFeedback').textContent = '', 3000);
            return;
        }

        const btn = document.getElementById('btnSalvar');
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span> Salvando...';

        const ids = [];
        selecionados.forEach(card => {
            const equipe = parseInt(card.dataset.equipe || 0);
            if (equipe > 0) ids.push(equipe);
        });

        if (ids.length === 0) {
            document.getElementById('msgFeedback').textContent = 'Escolha uma equipe para cada modalidade selecionada.';
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-check-lg"></i> Salvar';
            return;
        }

        try {
            const res = await fetch(apiUrl('inscricoes'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id_interclasse: parseInt(idInterclasse),
                    id_equipes: ids,
                    cronograma_versao: cronogramaVersao === null || cronogramaVersao === undefined ? undefined : Number(cronogramaVersao),
                    versao_publicada: versaoPublicada === null || versaoPublicada === undefined ? undefined : Number(versaoPublicada)
                })
            });
            const result = await res.json();
            if (result.success) {
                mostrarFeedbackInscricao(result.message, document.getElementById('msgFeedback'));
                setTimeout(() => window.location.href = APP_BASE + '/aluno/inicio', 1500);
            } else {
                mostrarFeedbackInscricao(result.message, document.getElementById('msgFeedback'), true);
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-check-lg"></i> Salvar';
            }
        } catch (e) {
            console.error(e);
            mostrarFeedbackInscricao('Erro de conexão. Tente novamente.', document.getElementById('msgFeedback'), true);
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-check-lg"></i> Salvar';
        }
    }

    function vincularEventos() {
        const grid = document.getElementById('modalidadesGrid');
        const inscricoes = document.getElementById('inscricoesAtuais');
        const equipes = document.getElementById('modalEquipesCorpo');
        const feedback = document.getElementById('msgFeedback');
        const btnSalvar = document.getElementById('btnSalvar');

        if (btnSalvar) pageScope.listen(btnSalvar, 'click', salvarEscolhas);
        if (feedback) pageScope.listen(feedback, 'click', (event) => {
            if (event.target.closest('[data-sgi-action="refresh-registration-agenda"]')) window.location.reload();
        });

        const ativar = (event) => {
            if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
            if (event.type === 'keydown') event.preventDefault();
            if (event.target.closest('[data-sgi-action="retry-modalidades"]')) {
                carregarDados();
                return;
            }
            const card = event.target.closest('[data-sgi-action="open-equipe"]');
            if (card) abrirEquipesModalidade(card);
        };
        pageScope.listen(grid, 'click', ativar);
        pageScope.listen(grid, 'keydown', ativar);

        pageScope.listen(inscricoes, 'click', (event) => {
            const button = event.target.closest('[data-sgi-action="details-modalidade"]');
            if (button) verDetalhesModalidade(button);
        });

        const selecionar = (event) => {
            if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
            if (event.type === 'keydown') event.preventDefault();
            const row = event.target.closest('[data-sgi-action="select-equipe"]');
            if (row) selecionarEquipe(row, row.dataset.modalidadeId);
        };
        pageScope.listen(equipes, 'click', selecionar);
        pageScope.listen(equipes, 'keydown', selecionar);
    }

    window.SGIPage.ready(() => {
        vincularEventos();
        carregarDados();
    });
    window.SGIPage.ready( inicializarProgresso);

return {esc, iconeModalidade, apiUrl, carregarDados, atualizarContador, atualizarProgresso, inicializarProgresso, statusVagas, renderizarSelecao, renderizarInscricoes, formatarData, formatarHorario, carregarAgendaEquipes, atualizarAgendaSelecao, verDetalhesModalidade, carregarMembros, abrirEquipesModalidade, selecionarEquipe, removerEquipeSelecionada, salvarEscolhas};
});
