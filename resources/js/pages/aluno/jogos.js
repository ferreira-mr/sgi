window.SGIPage.mount("aluno/jogos", function (pageConfig, pageScope) {

    const APP_BASE = window.SGI_BASE_PATH || '';

    let todosOsJogos = [];
    let filtroStatus = 'all';
    let filtroModalidade = 'all';
    let filtroCategoria = pageConfig.value2;
    let anoInterclasse = new Date().getFullYear();
    let idInterclasse = null;
    let invocadorDetalhesJogo = null;
    let carregandoJogos = false;
    let jogosCarregados = false;

    // Função de segurança para escapar HTML
    function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }

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

    // Abrevia o nome da turma para uma etiqueta curta (ex: "3º Ano Médio" -> "3º MED")
    function abreviarTurma(nomeTurma, nomeFantasia) {
        const base = nomeFantasia || nomeTurma || '';
        const s = String(base).toLowerCase();
        if (s.includes('fundamental')) return String(base).trim();
        const m = String(base).match(/(\d)(º|o|°)\.?\s*(ano\s*)?(médio|medio|méd|ef|ensino\s*fundamental|ensino\s*médio)/i);
        if (m) {
            const grau = m[1];
            const tipo = /méd|medio/.test(m[4]) ? 'MED' : 'EF';
            return `${grau}º ${tipo}`;
        }
        return base;
    }

    // Formata data ISO (YYYY-MM-DD) para dd/mm/aaaa
    function formatarData(dataStr) {
        if (!dataStr) return '—';
        const partes = String(dataStr).split('-');
        if (partes.length !== 3) return dataStr;
        return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }

    // Formata horário (HH:MM:SS) para HH:MM
    function formatarHora(horaStr) {
        if (!horaStr) return '—';
        return String(horaStr).substring(0, 5);
    }

    // Função para traduzir os códigos "MM:4:0:B" / "POS:3:0:N" para nomes reais
    function traduzirNomeJogo(codigo) {
        if (!codigo || typeof codigo !== 'string') return 'Partida';

        if (codigo.startsWith('POS:')) {
            const partes = codigo.split(':');
            const posicao = partes[1] || '3';
            return `Disputa de ${posicao}º lugar`;
        }

        // Se não for um código automático do Mata-Mata, exibe como está no banco
        if (!codigo.startsWith('MM:')) return codigo;

        const partes = codigo.split(':');
        const fase = partes[1];
        const indexJogo = parseInt(partes[2] || '0') + 1;

        let nomeFase = 'Eliminatórias';

        if (fase === '16') nomeFase = 'Oitavas de Final';
        else if (fase === '8') nomeFase = 'Quartas de Final';
        else if (fase === '4') nomeFase = 'Semifinal';
        else if (fase === '2') nomeFase = 'Final';

        return `${nomeFase} (Jogo ${indexJogo})`;
    }

    // Mapa de badge de status (EM ANDAMENTO / AGUARDANDO / FINALIZADO)
    function badgeStatus(status) {
        const s = String(status || '').toLowerCase();
        if (s === 'iniciado') {
            return {
                classe: 'text-bg-primary',
                texto: 'Em Andamento',
                dot: true
            };
        }
        if (s === 'concluido' || s === 'finalizado') {
            return {
                classe: 'text-bg-success',
                texto: 'Finalizado',
                dot: false
            };
        }
        return {
            classe: 'text-bg-secondary',
            texto: s === 'pausado' ? 'Pausado' : 'Aguardando',
            dot: false
        };
    }

    async function inicializarJogos() {
        const container = document.getElementById('listaJogos');
        if (!container || carregandoJogos) return;
        carregandoJogos = true;
        if (!jogosCarregados) {
            container.innerHTML = '<div class="col-12 text-center text-body-secondary py-5" role="status"><span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Carregando jogos…</div>';
        }

        try {
            // 1. Descobrir o Interclasse Ativo
            const resInter = await fetch('/api/v1/edicoes?regulamento=true');
            if (!resInter.ok) throw new Error('Não foi possível carregar as edições.');
            const dataInter = await resInter.json();
            if (!Array.isArray(dataInter) || !dataInter.every(edicao =>
                edicao && typeof edicao === 'object' && !Array.isArray(edicao)
                && edicao.id_interclasse != null && edicao.status_interclasse != null
            )) {
                throw new Error('Não foi possível carregar as edições.');
            }
            const listaInter = dataInter;
            const ativo = listaInter.find(i => String(i.status_interclasse) === '1');

            if (!ativo) {
                todosOsJogos = [];
                jogosCarregados = true;
                container.innerHTML = '<div class="col-12 text-center text-body-secondary py-5"><i class="bi bi-calendar-x display-5 d-block mb-2"></i>Nenhuma competição ativa no momento.</div>';
                return;
            }

            idInterclasse = ativo.id_interclasse;
            if (ativo.ano_interclasse) {
                const anoMatch = String(ativo.ano_interclasse).match(/^\d{4}/);
                if (anoMatch) anoInterclasse = parseInt(anoMatch[0], 10);
            }

            // 2. Buscar as partidas da API (agora com data, horário, local e modalidade)
            const resJogos = await fetch(`/api/v1/partidas?id_interclasse=${idInterclasse}`);

            if (!resJogos.ok) throw new Error('Não foi possível carregar os jogos.');

            const rawData = await resJogos.json();
            if (!Array.isArray(rawData) || !rawData.every(row =>
                row && typeof row === 'object' && !Array.isArray(row) && row.id_jogo != null
            )) {
                throw new Error('Não foi possível carregar os jogos.');
            }

            // 3. AGRUPAR OS DADOS: A API retorna uma linha por time, então agrupamos pelo "id_jogo"
            const jogosAgrupados = {};

            rawData.forEach(row => {
                if (!jogosAgrupados[row.id_jogo]) {
                    jogosAgrupados[row.id_jogo] = {
                        id_jogo: row.id_jogo,
                        nome_jogo: traduzirNomeJogo(row.nome_jogo),
                        nome_jogo_raw: row.nome_jogo,
                        status_jogo: row.status_jogo,
                        nome_modalidade: row.nome_modalidade,
                        id_modalidade: row.modalidades_id_modalidade,
                        id_categoria: row.categorias_id_categoria,
                        nome_categoria: row.nome_categoria,
                        data_jogo: row.data_jogo,
                        inicio_jogo: row.inicio_jogo,
                        termino_jogo: row.termino_jogo,
                        nome_local: row.nome_local,
                        equipes: []
                    };
                }
                jogosAgrupados[row.id_jogo].equipes.push({
                    nome: row.nome_fantasia_turma || row.nome_turma || 'Time Desconhecido',
                    tag: abreviarTurma(row.nome_turma, row.nome_fantasia_turma),
                    placar: row.resultado_partida
                });
            });

            todosOsJogos = Object.values(jogosAgrupados);
            jogosCarregados = true;

            if (todosOsJogos.length === 0) {
                container.innerHTML = '<div class="col-12 text-center text-body-secondary py-5"><i class="bi bi-inbox display-5 d-block mb-2"></i>Nenhum jogo agendado ainda.</div>';
                return;
            }

            // Preencher os dropdowns de modalidade e categoria
            preencherFiltroModalidades();
            preencherFiltroCategorias();

            renderizarJogos();

        } catch (error) {
            console.error("Erro ao carregar jogos:", error);
            const erro = document.createElement('div');
            erro.className = 'col-12';
            erro.dataset.sgiState = 'games-error';
            erro.innerHTML = `<div class="alert alert-danger d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3" role="alert">
                <span><i class="bi bi-exclamation-triangle me-2" aria-hidden="true"></i>Não foi possível carregar os jogos. Tente novamente.</span>
                <button type="button" class="btn btn-outline-danger align-self-start align-self-sm-center" data-sgi-action="retry-games">Tentar novamente</button>
            </div>`;
            if (jogosCarregados) {
                container.querySelector('[data-sgi-state="games-error"]')?.remove();
                container.prepend(erro);
            } else {
                container.replaceChildren(erro);
            }
        } finally {
            carregandoJogos = false;
        }
    }

    function preencherFiltroModalidades() {
        const select = document.getElementById('filtroModalidade');
        const modalidades = [];
        const vistos = new Set();

        todosOsJogos.forEach(j => {
            const chave = String(j.id_modalidade);
            if (!vistos.has(chave)) {
                vistos.add(chave);
                modalidades.push({ id: j.id_modalidade, nome: j.nome_modalidade });
            }
        });

        select.innerHTML = '<option value="all">Todas</option>' +
            modalidades.map(m => `<option value="${esc(m.id)}">${esc(m.nome)}</option>`).join('');
        if (Array.from(select.options).some(option => String(option.value) === String(filtroModalidade))) {
            select.value = String(filtroModalidade);
        } else {
            filtroModalidade = 'all';
            select.value = 'all';
        }
    }

    function preencherFiltroCategorias() {
        const select = document.getElementById('filtroCategoria');
        const categorias = [];
        const vistos = new Set();

        todosOsJogos.forEach(j => {
            const chave = String(j.id_categoria);
            if (!vistos.has(chave)) {
                vistos.add(chave);
                categorias.push({ id: j.id_categoria, nome: j.nome_categoria });
            }
        });

        select.innerHTML = '<option value="all">Todas</option>' +
            categorias.map(c => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join('');

        if (filtroCategoria !== 'all' && vistos.has(String(filtroCategoria))) {
            select.value = String(filtroCategoria);
        } else {
            filtroCategoria = 'all';
            select.value = 'all';
        }
    }

    function renderizarJogos() {
        const container = document.getElementById('listaJogos');

        let jogosFiltrados = todosOsJogos.slice();

        if (filtroStatus === 'agendado') {
            jogosFiltrados = jogosFiltrados.filter(j => String(j.status_jogo).toLowerCase() !== 'concluido');
        } else if (filtroStatus === 'finalizado') {
            jogosFiltrados = jogosFiltrados.filter(j => String(j.status_jogo).toLowerCase() === 'concluido');
        }

        if (filtroModalidade !== 'all') {
            jogosFiltrados = jogosFiltrados.filter(j => String(j.id_modalidade) === String(filtroModalidade));
        }

        if (filtroCategoria !== 'all') {
            jogosFiltrados = jogosFiltrados.filter(j => String(j.id_categoria) === String(filtroCategoria));
        }

        if (jogosFiltrados.length === 0) {
            container.innerHTML = '<div class="col-12 text-center text-body-secondary py-5"><i class="bi bi-search display-5 d-block mb-2"></i>Nenhum jogo encontrado para este filtro.</div>';
            return;
        }

        container.innerHTML = jogosFiltrados.map(jogo => {
            const status = badgeStatus(jogo.status_jogo);
            const isFinalizado = String(jogo.status_jogo).toLowerCase() === 'concluido';

            const eqA = jogo.equipes[0] || { nome: 'A Definir', tag: '??', placar: '-' };
            const eqB = jogo.equipes[1] || { nome: 'A Definir', tag: '??', placar: '-' };

            const placarA = isFinalizado ? (eqA.placar ?? '0') : '-';
            const placarB = isFinalizado ? (eqB.placar ?? '0') : '-';

            const metaInfo = `
                <span class="d-inline-flex align-items-center gap-1"><i class="bi bi-calendar3 text-primary"></i>${formatarData(jogo.data_jogo)}</span>
                <span class="d-inline-flex align-items-center gap-1"><i class="bi bi-clock text-primary"></i>${formatarHora(jogo.inicio_jogo)}${jogo.termino_jogo ? '–' + formatarHora(jogo.termino_jogo) : ''}</span>
                <span class="d-inline-flex align-items-center gap-1"><i class="bi bi-geo-alt text-primary"></i>${esc(jogo.nome_local || 'Quadra')}</span>
            `;

            const dot = status.dot ? '<i class="bi bi-circle-fill me-1" aria-hidden="true"></i>' : '';
            const showTagA = eqA.tag && eqA.tag.trim().toLowerCase() !== (eqA.nome || '').trim().toLowerCase();
            const showTagB = eqB.tag && eqB.tag.trim().toLowerCase() !== (eqB.nome || '').trim().toLowerCase();
            const scoreDisplay = isFinalizado
                ? `<div class="d-flex align-items-center justify-content-center gap-2 bg-body-tertiary border rounded-3 px-3 py-2 fs-4 fw-bold flex-shrink-0 text-nowrap"><span class="text-primary">${esc(placarA)}</span><span class="text-body-secondary small">:</span><span class="text-primary">${esc(placarB)}</span></div>`
                : `<div class="d-flex align-items-center justify-content-center bg-body-tertiary border rounded-3 px-3 py-2 flex-shrink-0"><span class="sgi-vs-badge">VS</span></div>`;

            return `
                <div class="col">
                <article class="card h-100 border-0 shadow-sm p-3 p-lg-4" data-jogo-id="${esc(jogo.id_jogo)}">
                    <div class="d-flex justify-content-between align-items-start gap-3">
                        <div class="d-flex flex-wrap gap-3 small text-body-secondary">${metaInfo}</div>
                        <span class="badge rounded-pill ${status.classe}">${dot}${esc(status.texto)}</span>
                    </div>

                    <div class="d-flex flex-wrap align-items-center gap-2 mt-3">
                        <span class="badge text-bg-primary d-inline-flex align-items-center gap-1">
                            <i class="bi ${iconeModalidade(jogo.nome_modalidade)}"></i>${esc(jogo.nome_modalidade)}
                        </span>
                        <span class="badge text-bg-light border text-body-secondary"><i class="bi bi-diagram-3 me-1"></i>${esc(jogo.nome_jogo)}</span>
                    </div>

                    <div class="d-flex align-items-center justify-content-between gap-2 mt-3">
                        <div class="d-flex flex-column align-items-center flex-grow-1 text-center gap-1">
                            ${showTagA ? `<span class="badge text-bg-primary text-uppercase">${esc(eqA.tag)}</span>` : ''}
                            <span class="fw-semibold text-truncate w-100">${esc(eqA.nome)}</span>
                        </div>

                        ${scoreDisplay}

                        <div class="d-flex flex-column align-items-center flex-grow-1 text-center gap-1">
                            ${showTagB ? `<span class="badge text-bg-primary text-uppercase">${esc(eqB.tag)}</span>` : ''}
                            <span class="fw-semibold text-truncate w-100">${esc(eqB.nome)}</span>
                        </div>
                    </div>

                    <div class="d-flex justify-content-end mt-3">
                        <button type="button" class="btn btn-outline-primary d-inline-flex align-items-center sgi-jogos-detalhes-action"
                            data-sgi-action="view-game" data-jogo-id="${esc(jogo.id_jogo)}">
                            <i class="bi bi-eye me-1" aria-hidden="true"></i>Ver detalhes do jogo
                        </button>
                    </div>
                </article>
                </div>
            `;
        }).join('');
    }

    // ============================ MODAL DE DETALHES ============================

    async function abrirDetalhesJogo(btn) {
        const idJogo = btn.dataset.jogoId;
        const jogo = todosOsJogos.find(j => String(j.id_jogo) === String(idJogo));
        const corpo = document.getElementById('modalModalidadeCorpo');

        document.getElementById('modalModalidadeTitle').innerHTML =
            '<i class="bi bi-trophy-fill me-2"></i>Resumo da Partida';

        corpo.innerHTML = `
            <div class="text-center text-body-secondary py-4">
                <div class="spinner-border spinner-border-sm text-danger me-2" role="status"></div>
                Carregando detalhes...
            </div>`;

        if (btn.dataset.sgiAction !== 'retry-game-details') invocadorDetalhesJogo = btn;
        const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('modalModalidade'));
        modal.show();

        if (!jogo) {
            corpo.innerHTML = `
                <div class="text-center text-body-secondary py-4">
                    <i class="bi bi-exclamation-triangle display-6 d-block mb-2 text-danger"></i>
                    Partida não encontrada.
                </div>`;
            return;
        }

        try {
            const [resPartidas, resDestaques] = await Promise.all([
                fetch(`/api/v1/partidas?id_jogo=${idJogo}`),
                fetch(`/api/v1/artilheiros?id_jogo=${idJogo}&ano=${anoInterclasse}`)
            ]);

            if (!resPartidas.ok) throw new Error('Não foi possível carregar os detalhes da partida.');

            const partidas = await resPartidas.json();
            let destaques = [];
            let destaquesBloqueados = false;
            if (resDestaques.status === 403) {
                const restricao = await resDestaques.json();
                destaquesBloqueados = restricao?.success === false
                    && typeof restricao.message === 'string'
                    && /artilharia.*liberada após a premiação/i.test(restricao.message);
                if (!destaquesBloqueados) throw new Error('Não foi possível carregar os detalhes da partida.');
            } else {
                if (!resDestaques.ok) throw new Error('Não foi possível carregar os detalhes da partida.');
                destaques = await resDestaques.json();
            }
            if (!Array.isArray(partidas) || !partidas.every(row => row && typeof row === 'object' && !Array.isArray(row))
                || !Array.isArray(destaques) || !destaques.every(row => row && typeof row === 'object' && !Array.isArray(row))) {
                throw new Error('Não foi possível carregar os detalhes da partida.');
            }

            corpo.innerHTML = montarHTMLResumoJogo(jogo, partidas, destaques, destaquesBloqueados);
        } catch (e) {
            console.error('Erro ao carregar resumo da partida:', e);
            corpo.innerHTML = `
                <div class="text-center text-body-secondary py-4" role="alert">
                    <i class="bi bi-exclamation-triangle display-6 d-block mb-2 text-danger"></i>
                    Não foi possível carregar o resumo da partida.
                    <button type="button" class="btn btn-outline-primary d-block mx-auto mt-3" data-sgi-action="retry-game-details" data-jogo-id="${esc(idJogo)}">Tentar novamente</button>
                </div>`;
        }
    }

    function montarHTMLResumoJogo(jogo, partidas, destaques, destaquesBloqueados = false) {
        const status = badgeStatus(jogo.status_jogo);
        const isFinalizado = String(jogo.status_jogo).toLowerCase() === 'concluido';

        const eqA = jogo.equipes[0] || { nome: 'A Definir', tag: '??', placar: '-' };
        const eqB = jogo.equipes[1] || { nome: 'A Definir', tag: '??', placar: '-' };

        const placarA = isFinalizado ? (eqA.placar ?? '0') : '-';
        const placarB = isFinalizado ? (eqB.placar ?? '0') : '-';
        const dot = status.dot ? '<i class="bi bi-circle-fill me-1" aria-hidden="true"></i>' : '';

        let html = '';

        // ===== CONFRONTO =====
        html += '<section class="mb-4">';
        html += '<h6 class="d-flex align-items-center gap-2 text-uppercase small fw-bold text-body-secondary mb-3"><i class="bi bi-shield-fill text-primary"></i>Partida</h6>';
        html += `
            <div class="d-flex align-items-center justify-content-between gap-2 mb-3">
                <div class="d-flex flex-column align-items-center flex-grow-1 text-center gap-1">
                    <span class="badge text-bg-primary text-uppercase">${esc(eqA.tag)}</span>
                    <span class="fw-semibold text-truncate w-100">${esc(eqA.nome)}</span>
                </div>
                <div class="d-flex align-items-baseline justify-content-center gap-2 bg-body-tertiary border rounded-3 px-3 py-2 fs-3 fw-bold flex-shrink-0">
                    <span class="${isFinalizado ? 'text-primary' : 'text-body-tertiary'}">${esc(placarA)}</span>
                    <span class="small text-body-secondary">x</span>
                    <span class="${isFinalizado ? 'text-primary' : 'text-body-tertiary'}">${esc(placarB)}</span>
                </div>
                <div class="d-flex flex-column align-items-center flex-grow-1 text-center gap-1">
                    <span class="badge text-bg-primary text-uppercase">${esc(eqB.tag)}</span>
                    <span class="fw-semibold text-truncate w-100">${esc(eqB.nome)}</span>
                </div>
            </div>
            <div class="text-center">
                <span class="badge rounded-pill ${status.classe}">${dot}${esc(status.texto)}</span>
            </div>
        `;
        html += '</div>';

        // ===== DESTAQUE DA PARTIDA =====
        html += '<section class="mb-4">';
        html += '<h6 class="d-flex align-items-center gap-2 text-uppercase small fw-bold text-body-secondary mb-3"><i class="bi bi-lightning-charge-fill text-primary"></i>Destaque da Partida</h6>';

        const artilheiros = Array.isArray(destaques) ? destaques : [];
        const artilheiroTop = artilheiros[0];
        if (destaquesBloqueados) {
            html += '<div class="text-center text-body-secondary py-3"><i class="bi bi-lock d-block mb-1" aria-hidden="true"></i>Artilharia liberada após a premiação.</div>';
        } else if (artilheiroTop) {
            const temFotoReal = artilheiroTop.foto_usuario && !/^default\.(jpg|jpeg|png|gif|webp)$/i.test(artilheiroTop.foto_usuario);
            const foto = temFotoReal ? `${APP_BASE}/uploads/fotosUsuarios/${encodeURIComponent(artilheiroTop.foto_usuario)}` : '';
            html += `
                <div class="d-flex align-items-center gap-3 p-3 border rounded-3 bg-body">
                    ${foto
                        ? `<img class="rounded-circle object-fit-cover flex-shrink-0" style="width: 44px; height: 44px;" src="${foto}" alt="${esc(artilheiroTop.nome_usuario)}" onerror="this.classList.add('d-none');this.nextElementSibling.classList.remove('d-none');">`
                        : ''}
                    <span class="bg-primary-subtle text-primary rounded-circle p-2 d-inline-flex ${foto ? 'd-none' : ''}"><i class="bi bi-award-fill"></i></span>
                    <div class="flex-grow-1">
                        <div class="fw-semibold">${esc(artilheiroTop.nome_usuario)} <i class="bi bi-star-fill text-warning"></i></div>
                        <div class="small text-body-secondary">${esc(artilheiroTop.nome_fantasia_turma || artilheiroTop.nome_turma || '')}</div>
                    </div>
                    <div class="fw-bold text-primary text-end">${esc(artilheiroTop.total_gols)}<small class="d-block text-body-secondary">gols</small></div>
                </div>`;
        } else {
            html += '<div class="text-center text-body-secondary py-3"><i class="bi bi-person-dash d-block mb-1"></i>Ainda não há destaque registrado para esta partida.</div>';
        }
        html += '</div>';

        // ===== EQUIPES DA PARTIDA =====
        html += '<section class="mb-4">';
        html += '<h6 class="d-flex align-items-center gap-2 text-uppercase small fw-bold text-body-secondary mb-3"><i class="bi bi-people-fill text-primary"></i>Equipes da Partida</h6>';

        const equipesMap = {};
        (Array.isArray(partidas) ? partidas : []).forEach(row => {
            if (!row.equipes_id_equipe) return;
            if (!equipesMap[row.equipes_id_equipe]) {
                equipesMap[row.equipes_id_equipe] = {
                    id_equipe: row.equipes_id_equipe,
                    nome: row.nome_fantasia_turma || row.nome_turma || 'Equipe',
                    tag: abreviarTurma(row.nome_turma, row.nome_fantasia_turma)
                };
            }
        });
        const equipesLista = Object.values(equipesMap);

        if (equipesLista.length > 0) {
            html += '<div class="accordion" id="accordionEquipes">';
            html += equipesLista.map(e => `
                <div class="accordion-item">
                    <h2 class="accordion-header">
                        <button class="accordion-button collapsed" type="button"
                            data-bs-toggle="collapse"
                            data-bs-target="#equipe-${e.id_equipe}"
                            aria-expanded="false"
                            aria-controls="equipe-${e.id_equipe}">
                            <span class="badge text-bg-primary me-2">${esc(e.tag)}</span>
                            <span class="flex-grow-1 text-start">${esc(e.nome)}</span>
                        </button>
                    </h2>
                    <div id="equipe-${e.id_equipe}" class="accordion-collapse collapse"
                        data-bs-parent="#accordionEquipes">
                        <div class="accordion-body">
                            <div class="text-body-secondary small py-2">
                                <span class="spinner-border spinner-border-sm me-1" role="status"></span>
                                Carregando integrantes...
                            </div>
                        </div>
                    </div>
                </div>
            `).join('');
            html += '</div>';
        } else {
            html += '<div class="text-center text-body-secondary py-3"><i class="bi bi-people d-block mb-1"></i>Nenhuma equipe vinculada a esta partida.</div>';
        }
        html += '</div>';

        // ===== INFORMAÇÕES DA PARTIDA =====
        html += '<section class="mb-4">';
        html += '<h6 class="d-flex align-items-center gap-2 text-uppercase small fw-bold text-body-secondary mb-3"><i class="bi bi-info-circle-fill text-primary"></i>Informações</h6>';

        const itens = [
            { icone: 'bi-calendar3', rotulo: 'Data', valor: formatarData(jogo.data_jogo) },
            { icone: 'bi-clock', rotulo: 'Horário', valor: formatarHora(jogo.inicio_jogo) + (jogo.termino_jogo ? ' às ' + formatarHora(jogo.termino_jogo) : '') },
            { icone: 'bi-geo-alt', rotulo: 'Local', valor: jogo.nome_local || 'A definir' },
            { icone: 'bi-trophy', rotulo: 'Modalidade', valor: jogo.nome_modalidade || '—' },
            { icone: 'bi-tags', rotulo: 'Categoria', valor: jogo.nome_categoria || '—' },
            { icone: 'bi-diagram-3', rotulo: 'Fase', valor: jogo.nome_jogo || '—' }
        ];

        html += itens.map(item => `
            <div class="d-flex align-items-center gap-2 py-2 border-bottom">
                <i class="bi ${item.icone} text-primary"></i>
                <span class="text-body-secondary small">${esc(item.rotulo)}:</span>
                <span class="fw-semibold">${esc(item.valor)}</span>
            </div>
        `).join('');
        html += '</div>';

        return html;
    }

    // Agrupa jogos do chaveamento por fase e calcula progresso
    function agruparFases(jogos) {
        const mapa = {};
        jogos.forEach(j => {
            const nome = j.nome_fase || 'Fase';
            if (!mapa[nome]) {
                mapa[nome] = { nome: nome, total: 0, concluidos: 0 };
            }
            mapa[nome].total++;
            const s = String(j.status_jogo || '').toLowerCase();
            if (s === 'concluido' || s === 'finalizado') mapa[nome].concluidos++;
        });

        const fases = Object.values(mapa);
        fases.sort((a, b) => (b.total - a.total));

        fases.forEach(f => { f.pendentes = f.total - f.concluidos; });
        return fases;
    }

    async function carregarMembrosEquipe(item, corpo) {
        if (corpo.dataset.carregado || corpo.dataset.carregando) return;
        const retentativa = corpo.dataset.falhaCarregamento === '1';
        let mensagemErro = 'Não foi possível carregar integrantes.';
        corpo.dataset.carregando = '1';
        corpo.innerHTML = `<div class="text-body-secondary small py-2" role="status">
            <span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>Carregando integrantes…
        </div>`;

        const target = item.querySelector('.accordion-button').getAttribute('data-bs-target');
        const idEquipe = target.replace('#equipe-', '');

        try {
            if (retentativa) {
                const offline = window.SGIOffline;
                const servidorDisponivel = offline && typeof offline.checkServer === 'function'
                    ? await offline.checkServer(true)
                    : false;
                if (!servidorDisponivel) {
                    mensagemErro = 'Servidor indisponível. Verifique a conexão e tente novamente.';
                    throw new Error(mensagemErro);
                }
            }

            const res = await fetch(`/api/v1/equipes?id_equipe=${idEquipe}`);
            const membros = await res.json();
            if (!res.ok || !Array.isArray(membros) || !membros.every(membro =>
                membro && typeof membro === 'object' && !Array.isArray(membro) && membro.id_usuario != null
            )) {
                throw new Error('Não foi possível carregar integrantes.');
            }
            corpo.dataset.carregado = '1';
            delete corpo.dataset.falhaCarregamento;

            if (membros.length === 0) {
                corpo.innerHTML = '<div class="text-body-secondary small py-1">Nenhum integrante vinculado a esta equipe.</div>';
                return;
            }

            corpo.innerHTML = membros.map(m => `
                <div class="d-flex align-items-center gap-2 py-2">
                    <i class="bi bi-person-circle fs-5 text-body-secondary"></i>
                    <span>${esc(m.nome_usuario)}</span>
                </div>
            `).join('');
        } catch (e) {
            console.error('Erro ao carregar integrantes:', e);
            delete corpo.dataset.carregado;
            corpo.dataset.falhaCarregamento = '1';
            corpo.innerHTML = `<div class="text-danger small py-2" role="alert">
                <p class="mb-2">${esc(mensagemErro)}</p>
                <button type="button" class="btn btn-sm btn-outline-danger" data-sgi-action="retry-team-members">Tentar novamente</button>
            </div>`;
        } finally {
            delete corpo.dataset.carregando;
        }
    }

    // A ação é um botão nativo, então Enter e Espaço disparam click. A lista é
    // renderizada novamente ao filtrar; a delegação mantém um único listener.
    const listaJogos = document.getElementById('listaJogos');
    pageScope.listen(listaJogos, 'click', (event) => {
        const retry = event.target.closest('[data-sgi-action="retry-games"]');
        if (retry) {
            inicializarJogos().then(() => {
                const proximoRetry = listaJogos.querySelector('[data-sgi-action="retry-games"]');
                const alvoFoco = proximoRetry || document.getElementById('filtroModalidade');
                alvoFoco?.focus({ preventScroll: true });
            });
            return;
        }
        const botao = event.target.closest('[data-sgi-action="view-game"]');
        if (!botao || !listaJogos.contains(botao)) return;
        abrirDetalhesJogo(botao);
    });

    const modalDetalhes = document.getElementById('modalModalidade');
    pageScope.listen(modalDetalhes, 'show.bs.collapse', (event) => {
        const painel = event.target;
        if (!(painel instanceof HTMLElement) || !painel.matches('#accordionEquipes .accordion-collapse')) return;
        const item = painel.closest('.accordion-item');
        const corpo = item?.querySelector('.accordion-body');
        if (item && corpo && !corpo.dataset.carregado && !corpo.dataset.carregando) {
            carregarMembrosEquipe(item, corpo);
        }
    });
    pageScope.listen(modalDetalhes, 'click', async (event) => {
        const acao = event.target.closest('[data-sgi-action]');
        if (acao?.dataset.sgiAction === 'retry-team-members') {
            const item = acao.closest('.accordion-item');
            const corpo = item?.querySelector('.accordion-body');
            if (item && corpo) {
                await carregarMembrosEquipe(item, corpo);
                const novoRetry = corpo.querySelector('[data-sgi-action="retry-team-members"]');
                const alvoFoco = novoRetry || item.querySelector('.accordion-button');
                alvoFoco?.focus({ preventScroll: true });
            }
        } else if (acao?.dataset.sgiAction === 'retry-game-details') {
            abrirDetalhesJogo(acao);
        }
    });

    pageScope.listen(document.getElementById('modalModalidade'), 'hidden.bs.modal', () => {
        const botao = invocadorDetalhesJogo;
        invocadorDetalhesJogo = null;
        if (!botao || !botao.isConnected) return;
        try {
            botao.focus({ preventScroll: true });
        } catch (_) {
            botao.focus();
        }
    });

    // Filtro de status
    document.querySelectorAll('.filtro-btn').forEach(btn => {
        pageScope.listen(btn, 'click', () => {
            document.querySelectorAll('.filtro-btn').forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-pressed', 'false');
            });
            btn.classList.add('active');
            btn.setAttribute('aria-pressed', 'true');
            filtroStatus = btn.dataset.filter;
            renderizarJogos();
        });
    });

    // Filtro de modalidade
    pageScope.listen(document.getElementById('filtroModalidade'), 'change', (e) => {
        filtroModalidade = e.target.value;
        renderizarJogos();
    });

    // Filtro de categoria
    pageScope.listen(document.getElementById('filtroCategoria'), 'change', (e) => {
        filtroCategoria = e.target.value;
        renderizarJogos();
    });

    window.SGIPage.ready( inicializarJogos);

    return {esc, iconeModalidade, abreviarTurma, formatarData, formatarHora, traduzirNomeJogo, badgeStatus, inicializarJogos, preencherFiltroModalidades, preencherFiltroCategorias, renderizarJogos, abrirDetalhesJogo, montarHTMLResumoJogo, agruparFases, carregarMembrosEquipe};
});
