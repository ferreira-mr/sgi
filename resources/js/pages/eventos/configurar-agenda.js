window.SGIPage.mount("eventos/configurar-agenda", function (pageConfig, pageScope) {

(function () {
    // A tela de agenda pode continuar aguardando respostas enquanto a SPA
    // troca o conteúdo principal. Invalide a montagem anterior e permita que
    // as rotinas de renderização reconheçam que seus nós já não existem.
    if (typeof window.__SGI_TELA_CLEANUP__ === 'function') {
        try { window.__SGI_TELA_CLEANUP__(); } catch (_) {}
    }
    window.__SGI_TELA_CLEANUP__ = function () {};
    const APP_BASE = String(window.SGI_BASE_PATH || '').replace(/\/+$/, '');
    const API = String(window.SGI_API_BASE || `${APP_BASE}/api/v1/`).replace(/\/?$/, '/');
    const NIVEL_USUARIO = pageConfig.value2;
    let dataNavegacao = new Date();
    const params = new URLSearchParams(window.location.search);
    const idInterclasseAgenda = params.get('id');

    let interclasseAtual = null;
    let jogosCache = [];
    let modalidadesLista = [];
    let locaisLista = [];
    let jogoEmEdicao = null;
    let filtroData = null;
    let filtroStatus = '';
    let buscaAtual = '';
    let anuncioResultadoTimer = null;

    pageScope.onDeactivate(() => {
        if (anuncioResultadoTimer !== null) {
            window.clearTimeout(anuncioResultadoTimer);
            anuncioResultadoTimer = null;
        }
    });

    function resolverTipoCompeticao(jogo) {
        if (!jogo) return null;
        if (jogo.tipo_competicao === 'individual') return 'individual';
        if (jogo.tipo_competicao === 'mata_mata') return 'mata_mata';
        const nomeTipo = String(jogo.nome_tipo_modalidade || '').trim().toLowerCase();
        if (nomeTipo === 'individual' || nomeTipo === 'prova individual' || nomeTipo === 'individualizada') return 'individual';
        if (nomeTipo === 'mata-mata' || nomeTipo === 'mata mata' || nomeTipo === 'mata-mata (eliminatório)' || nomeTipo === 'mata-mata (eliminatória)' || nomeTipo === 'eliminatório' || nomeTipo === 'eliminatória' || nomeTipo === 'eliminatoria') return 'mata_mata';
        return null;
    }

    function jogoEhIndividual(jogo) {
        return resolverTipoCompeticao(jogo) === 'individual';
    }

    function formatNomeJogo(nomeJogo, jogo = null) {
        if (jogo && resolverTipoCompeticao(jogo) === null) {
            return 'Tipo não configurado';
        }
        if (jogoEhIndividual(jogo)) {
            return 'Competição Individual';
        }
        const mm = (nomeJogo || '').match(/^MM:(\d+):(\d+):([NB])$/);
        if (mm) {
            const largura = parseInt(mm[1], 10);
            const slot = parseInt(mm[2], 10);
            const kind = mm[3];
            const fases = { 16: 'Oitavas de final', 8: 'Quartas de final', 4: 'Semifinal', 2: 'Final', 1: 'Campeão' };
            const fase = fases[largura] || 'Fase';
            if (largura === 1) return fase;
            return `${fase} — Confronto ${slot + 1}${kind === 'B' ? ' (bye)' : ''}`;
        }
        return nomeJogo || 'Jogo';
    }

    function ymd(d) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function hojeISO() {
        return ymd(new Date());
    }

    function formatarHora(t) {
        if (!t) return '';
        const s = String(t);
        return s.length >= 5 ? s.slice(0, 5) : s;
    }

    function escapeHtml(s) {
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    function labelStatus(status) {
        const map = {
            Agendado: 'Agendado',
            Iniciado: 'Em andamento',
            Pausado: 'Pausado',
            Concluido: 'Concluído',
            Finalizado: 'Concluído'
        };
        return map[status] || status || '—';
    }

    function podeIniciar(j) {
        if (!j || j.status_jogo !== 'Agendado') return false;
        const horarioObrigatorio = j.exige_horario_agendado !== false;
        if (!j.data_jogo || !j.locais_id_local || (horarioObrigatorio && (!j.inicio_jogo || !j.termino_jogo))) return false;
        const hj = hojeISO();
        return j.data_jogo <= hj;
    }

    function modalidadeSelecionadaId() {
        const el = document.getElementById('agenda-select-mod');
        const v = el && el.value ? el.value : '';
        const elM = document.getElementById('agenda-select-mod-mobile');
        const vM = elM && elM.value ? elM.value : '';
        return v || vM || '';
    }

    function syncSelectModalidade(fromDesk) {
        const desk = document.getElementById('agenda-select-mod');
        const mob = document.getElementById('agenda-select-mod-mobile');
        if (!desk || !mob) return;
        if (fromDesk) mob.value = desk.value;
        else desk.value = mob.value;
    }

    function syncSelectStatus(fromDesk) {
        const desk = document.getElementById('agenda-select-status');
        const mob = document.getElementById('agenda-select-status-mobile');
        if (!desk || !mob) return;
        if (fromDesk) mob.value = desk.value;
        else desk.value = mob.value;
    }

    function setBusca(v) {
        buscaAtual = v;
        const d = document.getElementById('agenda-busca');
        const m = document.getElementById('agenda-busca-mobile');
        if (d && d.value !== v) d.value = v;
        if (m && m.value !== v) m.value = v;
    }

    async function getInterclasseParaAgenda() {
        if (idInterclasseAgenda) {
            const item = await window.SGIInterclasse.getInterclasseById(idInterclasseAgenda);
            if (item) return item;
        }
        return window.SGIInterclasse.getActiveInterclasse();
    }

    function nomeEquipeLocal(item, mapaEquipes, mapaTurmas) {
        const equipe = mapaEquipes.get(String(item.id_equipe ?? item.equipes_id_equipe)) || {};
        const idTurma = item.id_turma ?? item.turmas_id_turma ?? equipe.turmas_id_turma;
        const turma = mapaTurmas.get(String(idTurma)) || {};
        return String(item.nome_equipe || equipe.nome_equipe || item.nome_fantasia ||
            item.nome_fantasia_turma || turma.nome_fantasia_turma ||
            item.nome_turma || turma.nome_turma || '').trim();
    }

    async function enriquecerNomesEquipesLocais(jogos) {
        if (!window.SGIDataLayer || typeof window.SGIDataLayer.read !== 'function') return jogos;
        try {
            const [partidas, equipes, turmas] = await Promise.all([
                window.SGIDataLayer.read('partidas'),
                window.SGIDataLayer.read('equipes'),
                window.SGIDataLayer.read('turmas')
            ]);
            const mapaEquipes = new Map((equipes || []).map((item) => [String(item.id_equipe), item]));
            const mapaTurmas = new Map((turmas || []).map((item) => [String(item.id_turma), item]));
            return jogos.map((jogo) => {
                if (String(jogo.equipes_nomes || '').trim()) return jogo;
                let fontes = Array.isArray(jogo.equipes) ? jogo.equipes : [];
                if (!fontes.length) {
                    fontes = (partidas || []).filter((item) =>
                        String(item.jogos_id_jogo) === String(jogo.id_jogo)
                    );
                }
                const nomes = fontes.map((item) => nomeEquipeLocal(item, mapaEquipes, mapaTurmas)).filter(Boolean);
                return nomes.length ? { ...jogo, equipes_nomes: nomes.join(' vs ') } : jogo;
            });
        } catch (_) {
            return jogos;
        }
    }

    async function carregarJogosDoInterclasse() {
        jogosCache = [];
        if (!interclasseAtual) return;
        const resMod = await fetch(`${API}modalidades`);
        if (!resMod.ok) throw new Error('Falha ao carregar modalidades');
        const todasMods = await resMod.json();
        modalidadesLista = (Array.isArray(todasMods) ? todasMods : []).filter(
            (m) => String(m.interclasses_id_interclasse) === String(interclasseAtual.id_interclasse)
        );
        const ids = [...new Set(modalidadesLista.map((m) => m.id_modalidade).filter(Boolean))];
        if (ids.length === 0) return;
        const batches = await Promise.all(
            ids.map((id) =>
                fetch(`${API}jogos?id_modalidade=${encodeURIComponent(id)}`).then(async (r) => {
                    const arr = await r.json();
                    return (Array.isArray(arr) ? arr : []).map((j) => ({
                        ...j,
                        modalidades_id_modalidade: Number(id)
                    }));
                })
            )
        );
        const map = new Map();
        batches.flat().forEach((j) => {
            if (j && j.id_jogo != null) map.set(String(j.id_jogo), j);
        });
        jogosCache = await enriquecerNomesEquipesLocais(Array.from(map.values()));
    }

    function jogosDoMesVisivel() {
        const y = dataNavegacao.getFullYear();
        const m = dataNavegacao.getMonth();
        const modF = modalidadeSelecionadaId();
        const stF = filtroStatus;
        const q = buscaAtual.toLowerCase();
        return jogosCache
            .filter((j) => {
                if (!j.data_jogo) return false;
                if (filtroData && j.data_jogo !== filtroData) return false;
                const [jy, jm] = j.data_jogo.split('-').map(Number);
                if (jy !== y || jm - 1 !== m) return false;
                if (modF && String(j.modalidades_id_modalidade) !== String(modF)) return false;
                if (stF === 'andamento' && j.status_jogo !== 'Iniciado' && j.status_jogo !== 'Pausado') return false;
                if (stF === 'Concluido' && j.status_jogo !== 'Concluido' && j.status_jogo !== 'Finalizado') return false;
                if (stF && stF !== 'andamento' && stF !== 'Concluido' && j.status_jogo !== stF) return false;
                if (q) {
                    const alvo = `${j.nome_modalidade || ''} ${j.nome_categoria || ''} ${j.nome_local || ''} ${j.equipes_nomes || ''} ${formatNomeJogo(j.nome_jogo, j)}`.toLowerCase();
                    if (!alvo.includes(q)) return false;
                }
                return true;
            })
            .sort((a, b) => {
                const da = `${a.data_jogo} ${a.inicio_jogo || ''}`;
                const db = `${b.data_jogo} ${b.inicio_jogo || ''}`;
                return da.localeCompare(db);
            });
    }

    function quantidadeJogosNoDia(dataStr) {
        const modF = modalidadeSelecionadaId();
        return jogosCache.filter((j) => j.data_jogo === dataStr &&
            (!modF || String(j.modalidades_id_modalidade) === String(modF))).length;
    }

    function formatarDataLonga(dataStr) {
        return new Date(`${dataStr}T12:00:00`).toLocaleDateString('pt-BR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }

    function formatarQuantidadeJogos(quantidade) {
        return `${quantidade} ${quantidade === 1 ? 'jogo' : 'jogos'}`;
    }

    function montarDiaCalendario(ano, mesZeroBased, dia, hojeReal) {
        const data = new Date(ano, mesZeroBased, dia, 12);
        const dataStr = ymd(data);
        const isHoje = dataStr === ymd(hojeReal);
        const quantidade = quantidadeJogosNoDia(dataStr);
        const isSelecionado = filtroData === dataStr;
        const classes = [
            'ag-cal-day',
            'col',
            'd-flex',
            'align-items-center',
            'justify-content-center',
            isHoje ? 'ag-cal-day--today' : '',
            quantidade > 0 ? 'ag-cal-day--has-game' : '',
            isSelecionado ? 'ag-cal-day--selected' : ''
        ].filter(Boolean).join(' ');
        const partesRotulo = [formatarDataLonga(dataStr)];
        if (isHoje) partesRotulo.push('Hoje');
        partesRotulo.push(formatarQuantidadeJogos(quantidade));

        return `<button type="button" class="${classes}" data-date="${dataStr}"
            aria-label="${escapeHtml(partesRotulo.join(', '))}"
            aria-pressed="${isSelecionado ? 'true' : 'false'}"${isHoje ? ' aria-current="date"' : ''}>${dia}</button>`;
    }

    function montarCardJogo(j) {
        const dataObj = new Date(j.data_jogo + 'T12:00:00');
        const diaNum = dataObj.toLocaleDateString('pt-BR', { day: '2-digit' });
        const mesCurto = dataObj.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
        const diaSem = dataObj.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
        const hi = formatarHora(j.inicio_jogo);
        const hf = formatarHora(j.termino_jogo || j.terminno_jogo);
        const horario = hi && hf ? `${hi} – ${hf}` : hi || 'Horário a definir';
        const placarHref = `${APP_BASE}/jogos/placar?id_jogo=${encodeURIComponent(j.id_jogo)}&origem=agenda_edit`;
        const statusClass = (j.status_jogo || '').toLowerCase().replace('ã','a').replace('õ','o');
        const statusMap = { agendado: 'agendado', iniciado: 'andamento', pausado: 'pausado', concluido: 'concluido', finalizado: 'concluido' };
        const cardClass = statusMap[statusClass] || 'agendado';
        const statusBadgeMap = { agendado: 'secondary', andamento: 'warning', pausado: 'warning', concluido: 'success' };
        const statusBadge = statusBadgeMap[cardClass] || 'secondary';
        const statusTxt = labelStatus(j.status_jogo);
        const podeAjustar = NIVEL_USUARIO <= 1;

        const modalidadeTxt = [j.nome_modalidade, j.nome_categoria].filter(Boolean).join(' – ');
        const localTxt = j.nome_local ? `<i class="bi bi-geo-alt text-danger"></i> ${escapeHtml(j.nome_local)}` : '';
        const equipes = j.equipes_nomes ? String(j.equipes_nomes).split(' vs ') : [];
        const teamsHtml = equipes.length >= 2
            ? `<div class="ag-event-card__teams bg-body-tertiary rounded p-2 d-flex align-items-center gap-2 flex-wrap mt-2 small fw-semibold text-body"><span>${escapeHtml(equipes[0])}</span><span class="ag-vs small fw-bold text-danger">VS</span><span>${escapeHtml(equipes[1])}</span></div>`
            : (equipes.length === 1
                ? `<div class="ag-event-card__teams bg-body-tertiary rounded p-2 d-flex align-items-center gap-2 flex-wrap mt-2 small fw-semibold text-body"><i class="bi bi-person-fill text-body-secondary"></i> ${escapeHtml(equipes[0])}</div>`
                : '');

        const iniciarBtn = podeIniciar(j)
            ? `<button type="button" class="btn btn-primary iniciar-jogo-btn" data-id-jogo="${j.id_jogo}"><i class="bi bi-play-fill"></i> Iniciar jogo</button>`
            : '';
        const placarBtn =
            j.status_jogo === 'Iniciado' || j.status_jogo === 'Pausado'
                ? `<a class="btn btn-dark" href="${placarHref}"><i class="bi bi-clock-history"></i> Placar</a>`
                : '';
        const verBtn =
            j.status_jogo === 'Concluido' || j.status_jogo === 'Finalizado'
                ? `<a class="btn btn-primary" href="${placarHref}"><i class="bi bi-trophy"></i> Ver resultado</a>`
                : '';
        const ajusteBtn =
            podeAjustar && j.status_jogo === 'Agendado'
                ? `<button type="button" class="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1 ms-auto btn-ajuste-jogo" data-id-jogo="${j.id_jogo}" title="Ajustar data e local" aria-label="Ajustar data e local"><i class="bi bi-pencil"></i><span class="visually-hidden">Ajustar data e local</span></button>`
                : '';

        return `
            <div class="ag-event-card ag-event-card--${cardClass} card border-0 shadow-sm p-3 position-relative overflow-hidden">
                <div class="d-flex align-items-start justify-content-between gap-2 mb-2">
                    <div class="d-flex gap-2 flex-wrap">
                        <span class="badge text-bg-light border text-body-secondary d-inline-flex align-items-center gap-1 small"><i class="bi bi-calendar3 text-danger"></i> ${diaSem}, ${diaNum}/${mesCurto}</span>
                        <span class="badge text-bg-light border text-body-secondary d-inline-flex align-items-center gap-1 small"><i class="bi bi-clock text-danger"></i> ${horario}</span>
                    </div>
                    <span class="badge rounded-pill text-bg-${statusBadge} text-nowrap ag-status-chip">${escapeHtml(statusTxt)}</span>
                </div>
                <h3 class="h6 fw-bold text-body mb-0">${escapeHtml(formatNomeJogo(j.nome_jogo, j))}</h3>
                <p class="small text-body-secondary d-flex align-items-center gap-1 flex-wrap mt-1 mb-0">
                    ${modalidadeTxt ? '<i class="bi bi-trophy-fill text-danger"></i> ' + escapeHtml(modalidadeTxt) : ''}
                    ${localTxt ? `<span class="text-body-tertiary">•</span> ${localTxt}` : ''}
                </p>
                ${teamsHtml}
                <div class="d-flex align-items-center gap-2 mt-3 flex-wrap">
                    ${iniciarBtn}${placarBtn}${verBtn}${ajusteBtn}
                </div>
            </div>`;
    }

    function jogosPendentes() {
        const modF = modalidadeSelecionadaId();
        const q = buscaAtual.toLowerCase();
        return jogosCache.filter((j) => {
            if (j.status_jogo !== 'Agendado' || /:B$/.test(String(j.nome_jogo || ''))) return false;
            if (j.data_jogo && j.inicio_jogo && j.termino_jogo && j.locais_id_local) return false;
            if (modF && String(j.modalidades_id_modalidade) !== String(modF)) return false;
            if (q && !(`${j.nome_modalidade || ''} ${j.nome_categoria || ''} ${j.equipes_nomes || ''} ${formatNomeJogo(j.nome_jogo, j)}`.toLowerCase().includes(q))) return false;
            return true;
        });
    }

    function montarCardPendente(j) {
        const modalidadeTxt = [j.nome_modalidade, j.nome_categoria].filter(Boolean).join(' – ');
        const equipes = j.equipes_nomes ? String(j.equipes_nomes).split(' vs ') : [];
        const equipesTxt = equipes.length ? escapeHtml(equipes.join(' VS ')) : 'Classificados ainda não definidos';
        return `<div class="ag-event-card ag-event-card--agendado card border-0 shadow-sm p-3 position-relative overflow-hidden">
            <div class="d-flex align-items-start justify-content-between gap-2 mb-2"><span class="badge text-bg-light border text-body-secondary d-inline-flex align-items-center gap-1 small"><i class="bi bi-calendar-x text-danger"></i> Data: A definir</span><span class="badge rounded-pill text-bg-warning">Pendente</span></div>
            <h3 class="h6 fw-bold text-body mb-0">${escapeHtml(formatNomeJogo(j.nome_jogo, j))}</h3>
            <p class="small text-body-secondary mt-1 mb-0">${modalidadeTxt ? escapeHtml(modalidadeTxt) + ' • ' : ''}${equipesTxt}</p>
            <p class="small text-muted mb-2">Horário: ${j.inicio_jogo ? formatarHora(j.inicio_jogo) : 'A definir'} · Local: ${j.nome_local || 'A definir'}</p>
            ${NIVEL_USUARIO <= 1 ? `<button type="button" class="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1 align-self-start btn-ajuste-jogo" data-id-jogo="${j.id_jogo}" title="Agendar jogo" aria-label="Agendar jogo"><i class="bi bi-pencil"></i> Definir agenda</button>` : ''}
        </div>`;
    }

    function renderListaEventos() {
        const containerDesk = document.getElementById('lista-eventos');
        const containerMob = document.getElementById('lista-eventos-mobile');
        const pendingDesk = document.getElementById('lista-pendentes');
        const pendingMob = document.getElementById('lista-pendentes-mobile');
        if (!containerDesk || !containerMob || !containerDesk.isConnected || !containerMob.isConnected) return;
        const lista = jogosDoMesVisivel();
        const pendentes = jogosPendentes();
        const badge = document.getElementById('agenda-count-badge');

        containerDesk.innerHTML = '';
        containerMob.innerHTML = '';
        if (pendingDesk) pendingDesk.innerHTML = pendentes.map(montarCardPendente).join('') || '<div class="small text-muted">Nenhum jogo pendente.</div>';
        if (pendingMob) pendingMob.innerHTML = pendentes.map(montarCardPendente).join('') || '<div class="small text-muted">Nenhum jogo pendente.</div>';

        if (!interclasseAtual) {
            const msg = '<div class="text-center text-body-secondary py-5"><i class="bi bi-calendar-x display-5 d-block mb-3 text-body-tertiary"></i><p class="mb-0 small">Nenhum interclasse selecionado ou ativo.</p></div>';
            containerDesk.innerHTML = msg;
            containerMob.innerHTML = msg;
            if (badge) badge.classList.add('d-none');
            return;
        }

        document.querySelectorAll('#lista-pendentes .btn-ajuste-jogo, #lista-pendentes-mobile .btn-ajuste-jogo').forEach((btn) => {
            pageScope.listen(btn, 'click', () => {
                const id = Number(btn.getAttribute('data-id-jogo'));
                const j = jogosCache.find((x) => Number(x.id_jogo) === id);
                if (!j) return;
                jogoEmEdicao = j;
                document.getElementById('edit-jogo-titulo').textContent = formatNomeJogo(j.nome_jogo, j) || 'Jogo';
                document.getElementById('edit-jogo-data').value = j.data_jogo || '';
                document.getElementById('edit-jogo-data').min = hojeISO();
                document.getElementById('edit-jogo-inicio').value = formatarHora(j.inicio_jogo);
                document.getElementById('edit-jogo-fim').value = formatarHora(j.termino_jogo || j.terminno_jogo);
                const sel = document.getElementById('edit-jogo-local');
                sel.value = j.locais_id_local ? String(j.locais_id_local) : '';
                new bootstrap.Modal(document.getElementById('modalEditarJogoAgenda')).show();
            });
        });

        if (lista.length === 0) {
            const msg = filtroData
                ? '<div class="text-center text-body-secondary py-5"><i class="bi bi-calendar-x display-5 d-block mb-3 text-body-tertiary"></i><p class="mb-0 small">Nenhum jogo nesta data.</p></div>'
                : '<div class="text-center text-body-secondary py-5"><i class="bi bi-calendar-x display-5 d-block mb-3 text-body-tertiary"></i><p class="mb-0 small">Nenhum jogo neste mês.</p></div>';
            containerDesk.innerHTML = msg;
            containerMob.innerHTML = msg;
            const mostrarTodos = document.getElementById('container-mostrar-todos');
            const mostrarTodosMobile = document.getElementById('container-mostrar-todos-mobile');
            if (mostrarTodos) mostrarTodos.classList.toggle('d-none', !filtroData);
            if (mostrarTodosMobile) mostrarTodosMobile.classList.toggle('d-none', !filtroData);
            if (badge) badge.classList.add('d-none');
            return;
        }

        if (badge) {
            const txt = document.getElementById('agenda-count-text');
            if (txt) txt.textContent = lista.length + (lista.length === 1 ? ' jogo' : ' jogos');
            badge.classList.remove('d-none');
        }

        lista.forEach((j) => {
            const html = montarCardJogo(j);
            containerDesk.innerHTML += html;
            containerMob.innerHTML += html;
        });

        document.querySelectorAll('.iniciar-jogo-btn').forEach((btn) => {
            pageScope.listen(btn, 'click', async (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                const id = btn.getAttribute('data-id-jogo');
                try {
                    const jogoAtual = jogosCache.find((item) => String(item.id_jogo) === String(id));
                    const duracao = Number(jogoAtual && jogoAtual.duracao_jogo) > 0
                        ? Number(jogoAtual.duracao_jogo)
                        : 20 * 60;
                    const restante = Number(jogoAtual && (jogoAtual.tempo_restante_jogo ?? jogoAtual.tempo_restante_calculado)) > 0
                        ? Number(jogoAtual.tempo_restante_jogo ?? jogoAtual.tempo_restante_calculado)
                        : duracao;
                    const r = await fetch(`${API}jogos`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id_jogo: Number(id),
                            // Contexto usado somente pela projeção IndexedDB.
                            // Fica aninhado para não tentar alterar no MySQL os
                            // campos que o perfil mesário não pode editar.
                            _contexto_offline: jogoAtual ? {
                                id_jogo: Number(id),
                                nome_jogo: jogoAtual.nome_jogo || null,
                                data_jogo: jogoAtual.data_jogo || null,
                                inicio_jogo: jogoAtual.inicio_jogo || null,
                                termino_jogo: jogoAtual.termino_jogo || jogoAtual.terminno_jogo || null,
                                modalidades_id_modalidade: jogoAtual.modalidades_id_modalidade || null,
                                id_interclasse: jogoAtual.id_interclasse || jogoAtual.interclasses_id_interclasse || null,
                                locais_id_local: jogoAtual.locais_id_local || null,
                                nome_modalidade: jogoAtual.nome_modalidade || null,
                                nome_categoria: jogoAtual.nome_categoria || null,
                                nome_local: jogoAtual.nome_local || null,
                                equipes_nomes: jogoAtual.equipes_nomes || null,
                                tipo_competicao: jogoAtual.tipo_competicao || null,
                                nome_tipo_modalidade: jogoAtual.nome_tipo_modalidade || null,
                                tipos_modalidades_id_tipo_modalidade: jogoAtual.tipos_modalidades_id_tipo_modalidade || null
                            } : null,
                            status_jogo: 'Iniciado',
                            duracao_jogo: duracao,
                            tempo_restante_jogo: restante,
                            tempo_extra_jogo: Number(jogoAtual && jogoAtual.tempo_extra_jogo) || 0
                        })
                    });
                    const js = await r.json();
                    if (!r.ok || js.success === false) throw new Error(js.message || 'Falha ao iniciar');
                    if (js.offline && js.queued) {
                        if (jogoAtual) {
                            jogoAtual.status_jogo = 'Iniciado';
                            jogoAtual.duracao_jogo = duracao;
                            jogoAtual.tempo_restante_jogo = restante;
                            jogoAtual.tempo_restante_calculado = restante;
                            jogoAtual.tempo_extra_jogo = Number(jogoAtual.tempo_extra_jogo) || 0;
                            jogoAtual._pendente = true;
                        }
                        atualizarTelas();
                        return;
                    }
                    await carregarJogosDoInterclasse();
                    atualizarTelas();
                } catch (e) {
                    SGI.alert(e.message || 'Erro ao iniciar o jogo.');
                }
            });
        });

        const mostrarTodosInicial = document.getElementById('container-mostrar-todos');
        const mostrarTodosMobileInicial = document.getElementById('container-mostrar-todos-mobile');
        if (mostrarTodosInicial) mostrarTodosInicial.classList.toggle('d-none', !filtroData);
        if (mostrarTodosMobileInicial) mostrarTodosMobileInicial.classList.toggle('d-none', !filtroData);

        document.querySelectorAll('.btn-ajuste-jogo').forEach((btn) => {
            pageScope.listen(btn, 'click', () => {
                const id = Number(btn.getAttribute('data-id-jogo'), 10);
                const j = jogosCache.find((x) => Number(x.id_jogo) === id);
                if (!j) return;
                jogoEmEdicao = j;
                document.getElementById('edit-jogo-titulo').textContent = formatNomeJogo(j.nome_jogo, j) || 'Jogo';
                document.getElementById('edit-jogo-data').value = j.data_jogo || '';
                document.getElementById('edit-jogo-data').min = hojeISO();
                document.getElementById('edit-jogo-inicio').value = formatarHora(j.inicio_jogo);
                document.getElementById('edit-jogo-fim').value = formatarHora(j.termino_jogo || j.terminno_jogo);
                const sel = document.getElementById('edit-jogo-local');
                sel.value = locaisLista.some(l => String(l.id_local) === String(j.locais_id_local))
                    ? String(j.locais_id_local)
                    : '';
                const modal = new bootstrap.Modal(document.getElementById('modalEditarJogoAgenda'));
                modal.show();
            });
        });
    }

    function anunciarResultadoAgenda() {
        let mensagem;
        if (!interclasseAtual) {
            mensagem = 'Nenhum interclasse selecionado ou ativo.';
        } else {
            const jogos = jogosDoMesVisivel();
            const contexto = filtroData
                ? formatarDataLonga(filtroData)
                : new Date(dataNavegacao.getFullYear(), dataNavegacao.getMonth(), 1)
                    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
            const filtros = [];
            const modalidadeId = modalidadeSelecionadaId();
            const modalidade = modalidadesLista.find((item) => String(item.id_modalidade) === String(modalidadeId));
            if (modalidade) {
                const nomeModalidade = [modalidade.nome_modalidade, modalidade.nome_categoria].filter(Boolean).join(' – ');
                if (nomeModalidade) filtros.push(`Modalidade: ${nomeModalidade}`);
            }
            if (filtroStatus) {
                const nomesStatus = { andamento: 'Em andamento', Concluido: 'Concluídos', Agendado: 'Agendados' };
                filtros.push(`Status: ${nomesStatus[filtroStatus] || filtroStatus}`);
            }
            if (buscaAtual) filtros.push(`Busca: ${buscaAtual}`);
            const complementoFiltros = filtros.length > 0 ? ` Filtros: ${filtros.join('; ')}.` : '';
            mensagem = (jogos.length === 0
                ? `Nenhum jogo em ${contexto}.`
                : `${formatarQuantidadeJogos(jogos.length)} em ${contexto}.`) + complementoFiltros;
        }

        ['agenda-result-status', 'agenda-result-status-mobile'].forEach((id) => {
            const status = document.getElementById(id);
            if (status && status.isConnected && status.textContent !== mensagem) {
                status.textContent = mensagem;
            }
        });
    }

    function focarDiaCalendario(dataStr, gradeId) {
        const grade = document.getElementById(gradeId);
        if (!grade || !grade.isConnected) return;
        const alvo = grade.querySelector(`button[data-date="${dataStr}"]`);
        if (alvo) alvo.focus({ preventScroll: true });
    }

    function atualizarTelas({ adiarAnuncio = false } = {}) {
        const ativo = document.activeElement;
        const diaFocado = ativo && ativo.matches('button[data-date]') ? ativo.dataset.date : null;
        const gradeFocada = diaFocado ? ativo.closest('.ag-cal-grid')?.id : null;
        gerarCalendarioVisual();
        gerarCalendarioMobile();
        atualizarSelects();
        renderListaEventos();
        if (anuncioResultadoTimer !== null) {
            window.clearTimeout(anuncioResultadoTimer);
            anuncioResultadoTimer = null;
        }
        if (adiarAnuncio) {
            anuncioResultadoTimer = window.setTimeout(() => {
                anuncioResultadoTimer = null;
                anunciarResultadoAgenda();
            }, 300);
        } else {
            anunciarResultadoAgenda();
        }
        if (diaFocado && gradeFocada) focarDiaCalendario(diaFocado, gradeFocada);
    }

    function inicializarAnos() {
        const selectAno = document.getElementById('select-ano');
        if (!selectAno || !selectAno.isConnected) return;
        const anoAtual = new Date().getFullYear();
        selectAno.innerHTML = '';
        for (let i = anoAtual - 2; i <= anoAtual + 3; i++) {
            selectAno.innerHTML += `<option value="${i}">${i}</option>`;
        }
    }

    function atualizarSelects() {
        const selectMes = document.getElementById('select-mes');
        const selectAno = document.getElementById('select-ano');
        if (selectMes && selectMes.isConnected) selectMes.value = dataNavegacao.getMonth();
        if (selectAno && selectAno.isConnected) selectAno.value = dataNavegacao.getFullYear();
    }

    function gerarCalendarioVisual() {
        const mesNavegacao = dataNavegacao.getMonth();
        const anoNavegacao = dataNavegacao.getFullYear();
        const hojeReal = new Date();
        const nomesMeses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        const tituloMes = document.getElementById('calendario-mes');
        const grade = document.getElementById('calendario-grade');
        if (!tituloMes || !grade || !tituloMes.isConnected || !grade.isConnected) return;
        tituloMes.innerText = nomesMeses[mesNavegacao] + ' ' + anoNavegacao;
        grade.innerHTML = '';
        const primeiroDiaMes = new Date(anoNavegacao, mesNavegacao, 1).getDay();
        const diasNoMes = new Date(anoNavegacao, mesNavegacao + 1, 0).getDate();
        for (let i = 0; i < primeiroDiaMes; i++) {
            grade.innerHTML += `<div class="ag-cal-day ag-cal-day--empty"></div>`;
        }
        for (let dia = 1; dia <= diasNoMes; dia++) {
            grade.innerHTML += montarDiaCalendario(anoNavegacao, mesNavegacao, dia, hojeReal);
        }
    }

    function gerarCalendarioMobile() {
        const mesNavegacao = dataNavegacao.getMonth();
        const anoNavegacao = dataNavegacao.getFullYear();
        const hojeReal = new Date();
        const grade = document.getElementById('calendario-grade-mobile');
        if (!grade || !grade.isConnected) return;
        grade.innerHTML = '';
        const primeiroDiaMes = new Date(anoNavegacao, mesNavegacao, 1).getDay();
        const diasNoMes = new Date(anoNavegacao, mesNavegacao + 1, 0).getDate();
        for (let i = 0; i < primeiroDiaMes; i++) {
            grade.innerHTML += `<div class="ag-cal-day ag-cal-day--empty"></div>`;
        }
        for (let dia = 1; dia <= diasNoMes; dia++) {
            grade.innerHTML += montarDiaCalendario(anoNavegacao, mesNavegacao, dia, hojeReal);
        }
    }

    function preencherSelectModalidades() {
        const desk = document.getElementById('agenda-select-mod');
        const mob = document.getElementById('agenda-select-mod-mobile');
        const autoSel = document.getElementById('auto-modalidade');

        if (desk && mob) {
            const cur = desk.value;
            desk.innerHTML = '';
            mob.innerHTML = '';
            const o0 = document.createElement('option');
            o0.value = '';
            o0.textContent = 'Todas as modalidades';
            desk.appendChild(o0);
            const o0m = document.createElement('option');
            o0m.value = '';
            o0m.textContent = 'Todas';
            mob.appendChild(o0m);

            modalidadesLista.forEach((m) => {
                const t = `${m.nome_modalidade || ''} (${m.nome_categoria || ''})`;
                const o1 = document.createElement('option');
                o1.value = String(m.id_modalidade);
                o1.textContent = t;
                desk.appendChild(o1);
                const o2 = document.createElement('option');
                o2.value = String(m.id_modalidade);
                o2.textContent = t;
                mob.appendChild(o2);
            });
            if (cur && [...desk.options].some((op) => op.value === cur)) {
                desk.value = cur;
                mob.value = cur;
            }
        }

        if (autoSel) {
            autoSel.innerHTML = '';
            const modalidadesSequenciais = modalidadesLista.filter((m) => resolverTipoCompeticao(m) === 'mata_mata');
            if (modalidadesSequenciais.length === 0) {
                const vazio = document.createElement('option');
                vazio.value = '';
                vazio.textContent = 'Nenhuma modalidade Mata-Mata disponível';
                vazio.disabled = true;
                vazio.selected = true;
                autoSel.appendChild(vazio);
            }
            modalidadesSequenciais.forEach((m) => {
                const t = `${m.nome_modalidade || ''} (${m.nome_categoria || ''})`;
                const opt = document.createElement('option');
                opt.value = String(m.id_modalidade);
                opt.textContent = t;
                autoSel.appendChild(opt);
            });
        }
    }

    async function carregarLocais() {
        if (!interclasseAtual || !interclasseAtual.id_interclasse) return;

        const res = await fetch(`${API}locais?id_interclasse=${encodeURIComponent(interclasseAtual.id_interclasse)}`);
        const data = await res.json();
        
        let todosLocais = data && Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
        
        locaisLista = todosLocais.filter((loc) =>
            String(loc.disponivel_local) === '1' && String(loc.status_local) === '1'
        );

        const sel = document.getElementById('edit-jogo-local');
        const autoLoc = document.getElementById('auto-local');
        const seqLoc = document.getElementById('seq-local');

        if (sel) sel.innerHTML = '<option value="">A definir</option>';
        if (autoLoc) autoLoc.innerHTML = '';
        if (seqLoc) seqLoc.innerHTML = '';

        if (locaisLista.length === 0) {
            if (sel) sel.innerHTML = '<option value="">Nenhum local disponível</option>';
            if (autoLoc) autoLoc.innerHTML = '<option value="">Nenhum local disponível</option>';
            if (seqLoc) seqLoc.innerHTML = '<option value="">Nenhum local disponível</option>';
            return;
        }

        locaisLista.forEach((loc) => {
            const optionHtml = `<option value="${loc.id_local}">${escapeHtml(loc.nome_local || 'Local')}</option>`;
            if (sel) sel.innerHTML += optionHtml;
            if (autoLoc) autoLoc.innerHTML += optionHtml;
            if (seqLoc) seqLoc.innerHTML += optionHtml;
        });
    }

    /* Helper para cálculo e ordenação dos jogos pelo chaveamento */
    function ordenarJogosChaveamento(jogos) {
        return jogos.sort((a, b) => {
            const mmA = (a.nome_jogo || '').match(/^MM:(\d+):(\d+):([NB])$/);
            const mmB = (b.nome_jogo || '').match(/^MM:(\d+):(\d+):([NB])$/);

            if (mmA && mmB) {
                const largA = parseInt(mmA[1], 10);
                const largB = parseInt(mmB[1], 10);
                const slotA = parseInt(mmA[2], 10);
                const slotB = parseInt(mmB[2], 10);

                if (largA !== largB) return largB - largA; // Maior largura primeiro (ex: 16 -> 8 -> 4 -> 2)
                return slotA - slotB;
            }
            return (a.id_jogo || 0) - (b.id_jogo || 0);
        });
    }

    window.SGIPage.ready( async function () {
        try {
            interclasseAtual = await getInterclasseParaAgenda();
            if (interclasseAtual) {
                const nomeInterclasse = document.getElementById('nomeInterclasseAgenda');
                const btnVoltar = document.getElementById('btnVoltarAgendaDesk');
                const btnVoltarMobile = document.getElementById('sgiBtnVoltar');
                if (nomeInterclasse && nomeInterclasse.isConnected) {
                    nomeInterclasse.innerText = interclasseAtual.nome_interclasse;
                }
                if (btnVoltar && btnVoltar.isConnected) {
                    btnVoltar.href = `${APP_BASE}/painel?id=${interclasseAtual.id_interclasse}`;
                }
                if (btnVoltarMobile && btnVoltarMobile.isConnected) {
                    btnVoltarMobile.href = `${APP_BASE}/painel?id=${interclasseAtual.id_interclasse}`;
                }
            }
        } catch (e) {
            console.error(e);
        }

        inicializarAnos();
        
        try {
            await carregarLocais();
            await carregarJogosDoInterclasse();
            preencherSelectModalidades();
        } catch (e) {
            console.error(e);
        }
        
        atualizarTelas();

        function navegarMes(delta) {
            dataNavegacao.setMonth(dataNavegacao.getMonth() + delta);
            filtroData = null;
            atualizarTelas();
        }

        const el1 = document.getElementById('btn-prev');
        if (el1) pageScope.listen(el1, 'click', () => navegarMes(-1));
        const el2 = document.getElementById('btn-next');
        if (el2) pageScope.listen(el2, 'click', () => navegarMes(1));
        const el3 = document.getElementById('btn-prev-mobile');
        if (el3) pageScope.listen(el3, 'click', () => navegarMes(-1));
        const el4 = document.getElementById('btn-next-mobile');
        if (el4) pageScope.listen(el4, 'click', () => navegarMes(1));
        const el5 = document.getElementById('select-mes');
        if (el5) pageScope.listen(el5, 'change', (e) => {
            dataNavegacao.setMonth(parseInt(e.target.value, 10));
            filtroData = null;
            atualizarTelas();
        });
        const el6 = document.getElementById('select-ano');
        if (el6) pageScope.listen(el6, 'change', (e) => {
            dataNavegacao.setFullYear(parseInt(e.target.value, 10));
            filtroData = null;
            atualizarTelas();
        });

        function aplicarFiltroData(dataStr) {
            filtroData = filtroData === dataStr ? null : dataStr;
            atualizarTelas();
        }

        const gradeDesk = document.getElementById('calendario-grade');
        if (gradeDesk) pageScope.listen(gradeDesk, 'click', (e) => {
            const target = e.target.closest('[data-date]');
            if (target) aplicarFiltroData(target.dataset.date);
        });
        const gradeMob = document.getElementById('calendario-grade-mobile');
        if (gradeMob) pageScope.listen(gradeMob, 'click', (e) => {
            const target = e.target.closest('[data-date]');
            if (target) aplicarFiltroData(target.dataset.date);
        });

        const limparFiltro = (event) => {
            if (filtroData) {
                const dataParaFocar = filtroData;
                const gradeId = event.currentTarget.id === 'btn-mostrar-todos-mobile'
                    ? 'calendario-grade-mobile'
                    : 'calendario-grade';
                filtroData = null;
                atualizarTelas();
                focarDiaCalendario(dataParaFocar, gradeId);
            }
        };
        const el7 = document.getElementById('btn-mostrar-todos');
        if (el7) pageScope.listen(el7, 'click', limparFiltro);
        const el8 = document.getElementById('btn-mostrar-todos-mobile');
        if (el8) pageScope.listen(el8, 'click', limparFiltro);

        const elMod = document.getElementById('agenda-select-mod');
        if (elMod) pageScope.listen(elMod, 'change', () => {
            syncSelectModalidade(true);
            filtroData = null;
            atualizarTelas();
        });
        const elModMob = document.getElementById('agenda-select-mod-mobile');
        if (elModMob) pageScope.listen(elModMob, 'change', () => {
            syncSelectModalidade(false);
            filtroData = null;
            atualizarTelas();
        });

        const elStatus = document.getElementById('agenda-select-status');
        if (elStatus) pageScope.listen(elStatus, 'change', () => {
            syncSelectStatus(true);
            filtroStatus = elStatus.value;
            filtroData = null;
            atualizarTelas();
        });
        const elStatusMob = document.getElementById('agenda-select-status-mobile');
        if (elStatusMob) pageScope.listen(elStatusMob, 'change', () => {
            syncSelectStatus(false);
            filtroStatus = elStatusMob.value;
            filtroData = null;
            atualizarTelas();
        });

        const elBusca = document.getElementById('agenda-busca');
        if (elBusca) pageScope.listen(elBusca, 'input', (e) => {
            setBusca(e.target.value.trim());
            filtroData = null;
            atualizarTelas({ adiarAnuncio: true });
        });
        const elBuscaMob = document.getElementById('agenda-busca-mobile');
        if (elBuscaMob) pageScope.listen(elBuscaMob, 'input', (e) => {
            setBusca(e.target.value.trim());
            filtroData = null;
            atualizarTelas({ adiarAnuncio: true });
        });

        /* ── SALVAR EDIÇÃO INDIVIDUAL ── */
        const elSalvar = document.getElementById('edit-jogo-salvar');
        if (elSalvar) pageScope.listen(elSalvar, 'click', async () => {
            if (!jogoEmEdicao) return;
            const data = document.getElementById('edit-jogo-data').value;
            if (data && data < hojeISO()) {
                SGI.alert('Não é permitido agendar um jogo para uma data passada.');
                return;
            }
            const ini = document.getElementById('edit-jogo-inicio').value;
            const fim = document.getElementById('edit-jogo-fim').value;
            const idLocal = parseInt(document.getElementById('edit-jogo-local').value, 10);
            const body = {
                id_jogo: Number(jogoEmEdicao.id_jogo, 10),
                data_jogo: data,
                inicio_jogo: ini ? (ini.length === 5 ? `${ini}:00` : ini) : null,
                termino_jogo: fim ? (fim.length === 5 ? `${fim}:00` : fim) : null,
                locais_id_local: Number.isInteger(idLocal) && idLocal > 0 ? idLocal : null
            };
            try {
                const r = await fetch(`${API}jogos`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const js = await r.json();
                if (!r.ok || js.success === false) throw new Error(js.message || 'Erro ao salvar');
                bootstrap.Modal.getInstance(document.getElementById('modalEditarJogoAgenda')).hide();
                await carregarJogosDoInterclasse();
                atualizarTelas();
            } catch (e) {
                SGI.alert(e.message || 'Erro ao salvar.');
            }
        });

        /* ── AGENDAMENTO AUTOMÁTICO EM SESSÕES ── */
        let agendaSequencialAtual = null;
        let diasSequenciaisAdicionados = [];

        function dataLocalISO(date) {
            return ymd(date);
        }

        function dataSessaoInicial() {
            const hoje = new Date();
            const distancia = (1 - hoje.getDay() + 7) % 7; // segunda-feira
            hoje.setDate(hoje.getDate() + distancia);
            return dataLocalISO(hoje);
        }

        function valorDiasSequenciais() {
            const inicio = document.getElementById('seq-inicio').value;
            const fim = document.getElementById('seq-fim').value || '11:30';
            const local = Number(document.getElementById('seq-local').value);
            return [{
                data: document.getElementById('seq-data').value,
                inicio,
                fim,
                local
            }, ...diasSequenciaisAdicionados];
        }

        function payloadSequencial(acao) {
            return {
                acao,
                id_interclasse: Number(interclasseAtual && interclasseAtual.id_interclasse),
                id_modalidade: Number(document.getElementById('auto-modalidade').value),
                todos_jogos: true,
                reprogramar: Boolean(document.getElementById('seq-reprogramar').checked),
                dias: valorDiasSequenciais(),
                opcoes: {
                    duracao_min: Number(document.getElementById('seq-duracao').value),
                    intervalo_troca_min: 10
                }
            };
        }

        async function lerRespostaJson(response) {
            const text = await response.text();
            if (!text) return {};
            try {
                const parsed = JSON.parse(text);
                return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
            } catch (_) {
                return {};
            }
        }

        function invalidarPreviaSequencial() {
            if (!agendaSequencialAtual) return;
            agendaSequencialAtual = null;
            if (btnSeqConfirmar) btnSeqConfirmar.disabled = true;
            const area = document.getElementById('seq-previa');
            if (area) {
                area.classList.remove('text-danger');
                area.textContent = 'Os dados foram alterados. Clique em “Calcular prévia” novamente.';
            }
        }

        function atualizarProximoDia(bloco) {
            const painel = document.getElementById('seq-proximo-dia');
            const campoData = document.getElementById('seq-proxima-data');
            const campoInicio = document.getElementById('seq-proxima-inicio');
            const campoFim = document.getElementById('seq-proxima-fim');
            if (!painel || !campoData || !campoInicio || !campoFim) return;
            const proximo = bloco.proximo_dia_sugerido || null;
            const pendente = Array.isArray(bloco.pendencias) && bloco.pendencias.length > 0;
            painel.classList.toggle('d-none', !pendente || !proximo);
            if (pendente && proximo) {
                campoData.value = proximo;
                campoData.min = hojeISO();
                campoInicio.value = bloco.proximo_inicio_sugerido || '08:00:00';
                campoFim.value = bloco.proximo_termino_sugerido || '11:30';
            }
        }

        function renderPreviaSequencial(bloco) {
            const area = document.getElementById('seq-previa');
            if (!area) return;
            const linhas = (bloco.proposta || []).map((item) => `<div>${escapeHtml(formatNomeJogo(item.chave_tag))}: ${item.data_jogo} ${formatarHora(item.inicio_jogo)}–${formatarHora(item.termino_jogo)} · ${escapeHtml(String(item.locais_id_local))}</div>`).join('');
            const pendencias = (bloco.pendencias || []).map((item) => `<div class="text-danger">${escapeHtml(formatNomeJogo(item.chave_tag))}: ${escapeHtml(item.motivo)}</div>`).join('');
            const resumo = bloco.resumo || {};
            area.innerHTML = `<strong>${Number(resumo.encaixados || 0)} jogo(s) programado(s)</strong>${linhas}${pendencias ? `<hr><strong class="text-danger">Pendências</strong>${pendencias}` : '<div class="text-success mt-1">Todos os jogos da chave possuem horário.</div>'}`;
            atualizarProximoDia(bloco);
        }

        function preencherModalSequencial() {
            diasSequenciaisAdicionados = [];
            agendaSequencialAtual = null;
            const data = document.getElementById('seq-data');
            if (data) { data.min = hojeISO(); data.value = dataSessaoInicial(); }
            const fim = document.getElementById('seq-fim');
            if (fim) fim.value = '11:30';
            const inicio = document.getElementById('seq-inicio');
            if (inicio) inicio.value = '08:00';
            const local = document.getElementById('seq-local');
            if (local && local.options.length > 0) local.value = local.options[0].value;
            const reprogramar = document.getElementById('seq-reprogramar');
            if (reprogramar) reprogramar.checked = false;
            const area = document.getElementById('seq-previa');
            if (area) {
                area.classList.remove('text-danger');
                area.textContent = 'Preencha os dados e clique em “Calcular prévia”.';
            }
            const painel = document.getElementById('seq-proximo-dia');
            if (painel) painel.classList.add('d-none');
            const confirmar = document.getElementById('seq-salvar-btn');
            if (confirmar) confirmar.disabled = true;
        }

        document.querySelectorAll('.btn-trigger-datas-auto').forEach((btn) => {
            pageScope.listen(btn, 'click', () => {
                preencherModalSequencial();
                const modalMod = document.getElementById('auto-modalidade');
                const selModGlobal = modalidadeSelecionadaId();
                if (modalMod && selModGlobal) modalMod.value = selModGlobal;
                const modal = new bootstrap.Modal(document.getElementById('modalDatasAutomaticas'));
                modal.show();
            });
        });

        const btnSeqSimular = document.getElementById('seq-simular-btn');
        const btnSeqConfirmar = document.getElementById('seq-salvar-btn');
        ['auto-modalidade', 'seq-data', 'seq-inicio', 'seq-fim', 'seq-local', 'seq-duracao', 'seq-reprogramar',
            'seq-proxima-data', 'seq-proxima-inicio', 'seq-proxima-fim'].forEach((id) => {
            const field = document.getElementById(id);
            if (!field) return;
            pageScope.listen(field, 'input', invalidarPreviaSequencial);
            pageScope.listen(field, 'change', invalidarPreviaSequencial);
        });
        if (btnSeqSimular) pageScope.listen(btnSeqSimular, 'click', async () => {
            if (btnSeqSimular.disabled) return;
            btnSeqSimular.disabled = true;
            btnSeqSimular.setAttribute('aria-busy', 'true');
            try {
                const payload = payloadSequencial('simular_sequencial');
                if (!payload.id_modalidade) throw new Error('Selecione uma modalidade.');
                if (!payload.dias[0].data || !payload.dias[0].inicio || !payload.dias[0].fim || !payload.dias[0].local) throw new Error('Informe a data, o horário e o local do primeiro jogo.');
                if (!Number.isInteger(payload.opcoes.duracao_min) || payload.opcoes.duracao_min <= 0) throw new Error('Informe uma duração válida para os jogos.');
                const response = await fetch(`${API}agenda-blocos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                const json = await lerRespostaJson(response);
                if (!response.ok || json.success === false) throw new Error(json.message || `Não foi possível calcular a prévia (HTTP ${response.status}).`);
                agendaSequencialAtual = { ...payload, revisao: json.revisao };
                const area = document.getElementById('seq-previa');
                if (area) area.classList.remove('text-danger');
                renderPreviaSequencial(json);
                if (btnSeqConfirmar) btnSeqConfirmar.disabled = (json.pendencias || []).length > 0;
            } catch (error) {
                const area = document.getElementById('seq-previa');
                agendaSequencialAtual = null;
                if (area) {
                    area.classList.add('text-danger');
                    area.textContent = error.message || 'Erro na prévia.';
                }
                if (btnSeqConfirmar) btnSeqConfirmar.disabled = true;
            } finally {
                btnSeqSimular.disabled = false;
                btnSeqSimular.removeAttribute('aria-busy');
            }
        });

        const btnAdicionarDia = document.getElementById('seq-adicionar-dia');
        if (btnAdicionarDia) pageScope.listen(btnAdicionarDia, 'click', async () => {
            const data = document.getElementById('seq-proxima-data').value;
            const inicio = document.getElementById('seq-proxima-inicio').value;
            const fim = document.getElementById('seq-proxima-fim').value || '11:30';
            const local = Number(document.getElementById('seq-local').value);
            if (!data || !inicio || !local) { SGI.alert('Informe a data, o horário e o local da próxima sessão.'); return; }
            diasSequenciaisAdicionados.push({ data, inicio, fim, local });
            document.getElementById('seq-proximo-dia').classList.add('d-none');
            if (btnSeqSimular) btnSeqSimular.click();
        });

        if (btnSeqConfirmar) pageScope.listen(btnSeqConfirmar, 'click', async () => {
            if (!agendaSequencialAtual) return;
            btnSeqConfirmar.disabled = true;
            try {
                const payload = { ...agendaSequencialAtual, acao: 'confirmar_sequencial', idempotencia: `agenda-sequencial-${Date.now()}-${Math.random().toString(16).slice(2)}` };
                const response = await fetch(`${API}agenda-blocos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                const json = await lerRespostaJson(response);
                if (!response.ok || json.success === false) throw new Error(json.message || `Não foi possível confirmar a agenda (HTTP ${response.status}).`);
                bootstrap.Modal.getInstance(document.getElementById('modalDatasAutomaticas')).hide();
                agendaSequencialAtual = null;
                await carregarJogosDoInterclasse();
                atualizarTelas();
                SGI.alert(`${json.programados || 0} jogo(s) programado(s) com sucesso.`);
            } catch (error) {
                SGI.alert(error.message || 'Não foi possível confirmar a agenda.');
                btnSeqConfirmar.disabled = false;
            }
        });

    });
})();

return {};
});
