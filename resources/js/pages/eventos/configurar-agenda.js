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
        const mm = (nomeJogo || '').match(/^(?:PL:\d+:(?:-?\d+:)?)?MM:(\d+):(\d+):([NB])$/);
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
        // Durante a operação offline, a fila/projeção do mesário é a fonte
        // atualizada: resultados podem ter criado semifinais/final locais
        // depois do snapshot HTTP preparado. Usar somente o cache GET faria
        // a agenda esquecer esses nós temporários até a reconexão.
        if (navigator.onLine === false && window.SGIDataLayer && typeof window.SGIDataLayer.read === 'function') {
            try {
                const locais = await window.SGIDataLayer.read('jogos');
                const idsPermitidos = new Set(ids.map((id) => String(id)));
                const jogosLocais = (Array.isArray(locais) ? locais : [])
                    .filter((j) => idsPermitidos.has(String(j.modalidades_id_modalidade || j.id_modalidade)))
                    .map((j) => ({ ...j, modalidades_id_modalidade: Number(j.modalidades_id_modalidade || j.id_modalidade) }));
                if (jogosLocais.length > 0) {
                    jogosCache = await enriquecerNomesEquipesLocais(jogosLocais);
                    return;
                }
            } catch (_) { /* segue para o snapshot/cache HTTP */ }
        }
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

        if (sel) sel.innerHTML = '<option value="">A definir</option>';

        if (locaisLista.length === 0) {
            if (sel) sel.innerHTML = '<option value="">Nenhum local disponível</option>';
            return;
        }

        locaisLista.forEach((loc) => {
            const optionHtml = `<option value="${loc.id_local}">${escapeHtml(loc.nome_local || 'Local')}</option>`;
            if (sel) sel.innerHTML += optionHtml;
        });
    }

    /* Helper para cálculo e ordenação dos jogos pelo chaveamento */
    function ordenarJogosChaveamento(jogos) {
        return jogos.sort((a, b) => {
            const mmA = (a.nome_jogo || '').match(/^(?:PL:\d+:(?:-?\d+:)?)?MM:(\d+):(\d+):([NB])$/);
            const mmB = (b.nome_jogo || '').match(/^(?:PL:\d+:(?:-?\d+:)?)?MM:(\d+):(\d+):([NB])$/);

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

        /* ── CRONOGRAMA PLANEJADO ANTES DAS INSCRIÇÕES ── */
        let cronogramaEstado = null;
        let cronogramaRascunho = null;
        let cronogramaEstadoConfiavel = false;
        let cronogramaEmProgresso = false;
        let cronogramaGeracao = 0;
        let cronogramaMontagem = 0;
        let equipesPreparadasSessao = false;
        const painelCronograma = document.getElementById('painelCronogramaPlanejado');
        if (painelCronograma && interclasseAtual?.id_interclasse) {
            const cronogramaId = Number(interclasseAtual.id_interclasse);
            const statusCronograma = document.getElementById('cronogramaPlanejadoStatus');
            const resumoCronograma = document.getElementById('cronogramaPlanejadoResumo');
            const preparar = document.getElementById('cronogramaPreparar');
            const gerar = document.getElementById('cronogramaGerar');
            const botaoPublicar = document.getElementById('cronogramaPublicar');
            const botaoAbrir = document.getElementById('cronogramaAbrir');
            const botaoFechar = document.getElementById('cronogramaFechar');
            const botaoLiberar = document.getElementById('cronogramaLiberar');
            const botaoRevisar = document.getElementById('cronogramaRevisar');
            const botaoAtualizar = document.getElementById('cronogramaAtualizar');
            const cronogramaPrevia = document.getElementById('cronogramaPrevia');
            const cronogramaPreviaStatus = document.getElementById('cronogramaPreviaStatus');
            const cronogramaPreviaCorpo = document.getElementById('cronogramaPreviaCorpo');
            const campoInscricaoInicio = document.getElementById('cronogramaInscricaoInicio');
            const campoInscricaoFim = document.getElementById('cronogramaInscricaoFim');
            const hoje = hojeISO();
            const campoInicio = document.getElementById('cronogramaDataInicio');
            const campoFim = document.getElementById('cronogramaDataFim');
            if (campoInicio && !campoInicio.value) campoInicio.value = hoje;
            if (campoFim && !campoFim.value) campoFim.value = hoje;
            pageScope.onDeactivate(() => {
                cronogramaMontagem++;
                cronogramaGeracao++;
                cronogramaEmProgresso = false;
                cronogramaEstadoConfiavel = false;
            });

            const camposGeracao = [
                campoInicio,
                campoFim,
                document.getElementById('cronogramaHoraInicio'),
                document.getElementById('cronogramaHoraFim'),
                document.getElementById('cronogramaDuracao'),
            ].filter(Boolean);
            const assinaturaGeracao = () => JSON.stringify(camposGeracao.map((campo) => campo.value));
            const valorDataHoraLocal = (value) => String(value || '').replace(' ', 'T').slice(0, 16);
            [campoInscricaoInicio, campoInscricaoFim].filter(Boolean).forEach((field) => {
                pageScope.listen(field, 'input', () => { field.dataset.userEdited = 'true'; });
            });
            const renderizarPrevia = () => {
                if (!cronogramaPrevia || !cronogramaPreviaStatus || !cronogramaPreviaCorpo || !cronogramaEstado) return;
                const draftIsCurrent = cronogramaRascunho
                    && cronogramaRascunho.cronograma_versao === Number(cronogramaEstado.cronograma_versao || 0)
                    && ['rascunho', 'revisao'].includes(String(cronogramaEstado.cronograma_status));
                const isPublished = cronogramaEstado.cronograma_status === 'publicado'
                    && Number(cronogramaEstado.versao_publicada || 0) === Number(cronogramaEstado.cronograma_versao || 0);
                const isSuspended = cronogramaEstado.cronograma_status === 'revisao';
                if (!draftIsCurrent && !isPublished && !isSuspended) {
                    cronogramaPrevia.classList.add('d-none');
                    return;
                }
                cronogramaPrevia.classList.remove('d-none');
                let commitments = [];
                if (draftIsCurrent) {
                    commitments = Array.isArray(cronogramaRascunho.compromissos) ? cronogramaRascunho.compromissos : [];
                    cronogramaPreviaStatus.textContent = `Rascunho da revisão ${Number(cronogramaRascunho.cronograma_versao)}. Esta prévia ainda não foi publicada.`;
                } else if (isPublished) {
                    commitments = Array.isArray(cronogramaEstado.compromissos) ? cronogramaEstado.compromissos : [];
                    cronogramaPreviaStatus.textContent = `Versão publicada ${Number(cronogramaEstado.versao_publicada)}.`;
                } else {
                    cronogramaPreviaStatus.textContent = 'A versão publicada está suspensa durante a revisão. Gere um rascunho novo para conferir os horários atualizados.';
                }
                cronogramaPreviaCorpo.replaceChildren();
                if (commitments.length === 0) {
                    const empty = document.createElement('p');
                    empty.className = 'small text-body-secondary mb-0';
                    empty.textContent = isSuspended && !draftIsCurrent ? 'A nova versão ainda não foi gerada.' : 'Esta versão não possui compromissos agendados.';
                    cronogramaPreviaCorpo.append(empty);
                    return;
                }
                const modalities = new Map((cronogramaEstado.modalidades || []).map((item) => [Number(item.id_modalidade), item.nome_modalidade]));
                const locals = new Map((locaisLista || []).map((item) => [Number(item.id_local), item.nome_local]));
                const labelDaEtapa = (tag) => {
                    const parts = String(tag || '').split(':');
                    if (parts[3] === 'IND') return 'Prova individual';
                    if (parts[3] !== 'MM') return 'Partida prevista';
                    const width = Number(parts[4] || 0);
                    const slot = Number(parts[5] || 0) + 1;
                    const names = { 2: 'Final', 4: 'Semifinal', 8: 'Quartas de final', 16: 'Oitavas de final' };
                    return `${names[width] || `Fase ${width}`} · partida ${slot}`;
                };
                const table = document.createElement('table');
                table.className = 'table table-sm table-striped align-middle mb-0';
                const head = document.createElement('thead');
                const headerRow = document.createElement('tr');
                ['Modalidade e etapa', 'Data e horário', 'Local'].forEach((label) => {
                    const cell = document.createElement('th');
                    cell.scope = 'col';
                    cell.textContent = label;
                    headerRow.append(cell);
                });
                head.append(headerRow);
                const body = document.createElement('tbody');
                commitments.forEach((item) => {
                    const row = document.createElement('tr');
                    const modality = document.createElement('td');
                    const modalityName = item.nome_modalidade || modalities.get(Number(item.id_modalidade)) || `Modalidade ${Number(item.id_modalidade || 0)}`;
                    const conditional = Number(item.condicional || 0) === 1 ? ' · possível conforme resultados' : '';
                    modality.textContent = `${modalityName} · ${labelDaEtapa(item.chave_tag)}${conditional}`;
                    const when = document.createElement('td');
                    const rawDate = String(item.data_compromisso || item.data || '');
                    const [year, month, day] = rawDate.split('-');
                    const date = year && month && day ? `${day}/${month}/${year}` : rawDate;
                    const start = String(item.inicio_compromisso || item.inicio || '').slice(0, 5);
                    const end = String(item.termino_compromisso || item.fim || '').slice(0, 5);
                    when.textContent = `${date} · ${start}–${end}`;
                    const local = document.createElement('td');
                    local.textContent = item.nome_local || locals.get(Number(item.id_local)) || `Local ${Number(item.id_local || 0)}`;
                    row.append(modality, when, local);
                    body.append(row);
                });
                table.append(head, body);
                cronogramaPreviaCorpo.append(table);
            };
            const operacaoLiberada = () => {
                const valor = cronogramaEstado?.operacao?.liberada ?? cronogramaEstado?.operacao_liberada;
                return valor === true || Number(valor || 0) > 0;
            };
            const invalidarRascunho = (mensagem = '') => {
                if (!cronogramaRascunho) return;
                cronogramaRascunho = null;
                cronogramaGeracao++;
                if (mensagem && resumoCronograma) resumoCronograma.textContent = mensagem;
                renderizarPrevia();
                atualizarAcoes();
            };
            const podeGerar = () => cronogramaEstadoConfiavel
                && cronogramaEstado
                && ['rascunho', 'revisao'].includes(String(cronogramaEstado.cronograma_status))
                && String(cronogramaEstado.inscricoes_status || 'fechadas') !== 'abertas'
                && !operacaoLiberada();
            const calcularProgressoCronograma = (rascunhoAtual) => {
                const publicado = Boolean(cronogramaEstado && cronogramaEstado.cronograma_status === 'publicado');
                const emRevisao = Boolean(cronogramaEstado && cronogramaEstado.cronograma_status === 'revisao');
                const liberado = operacaoLiberada();
                const inscricoesAbertas = cronogramaEstado?.inscricoes_status === 'abertas';
                const inscricoesEncerradas = cronogramaEstado?.inscricoes_status === 'encerradas';
                const versaoAtual = Number(cronogramaEstado?.cronograma_versao || 0);

                if (!cronogramaEstado || !cronogramaEstadoConfiavel) {
                    return { etapaAtiva: 1, concluidas: [], emRevisao: false, liberado: false };
                }
                if (liberado) {
                    return { etapaAtiva: 6, concluidas: [1, 2, 3, 4, 5, 6], emRevisao: false, liberado: true };
                }
                if (publicado) {
                    if (inscricoesEncerradas) {
                        return { etapaAtiva: 6, concluidas: [1, 2, 3, 4, 5], emRevisao: false, liberado: false };
                    }
                    if (inscricoesAbertas) {
                        return { etapaAtiva: 5, concluidas: [1, 2, 3, 4], emRevisao: false, liberado: false };
                    }
                    return { etapaAtiva: 4, concluidas: [1, 2, 3], emRevisao: false, liberado: false };
                }
                if (rascunhoAtual) {
                    return { etapaAtiva: 3, concluidas: [1, 2], emRevisao, liberado: false };
                }
                if (equipesPreparadasSessao || emRevisao || versaoAtual > 0 || Boolean(cronogramaRascunho)) {
                    return { etapaAtiva: 2, concluidas: [1], emRevisao, liberado: false };
                }
                return { etapaAtiva: 1, concluidas: [], emRevisao, liberado: false };
            };
            const atualizarStepperCronograma = (rascunhoAtual) => {
                const { etapaAtiva, concluidas, emRevisao, liberado } = calcularProgressoCronograma(rascunhoAtual);
                for (let step = 1; step <= 6; step++) {
                    const isCompleted = concluidas.includes(step);
                    const isActive = !isCompleted && etapaAtiva === step;
                    const isUpcoming = !isCompleted && !isActive;
                    const textoEstado = isCompleted
                        ? 'Concluída'
                        : (isActive ? (emRevisao ? 'Em revisão' : 'Etapa atual') : 'Aguardando');

                    const indicator = painelCronograma.querySelector(`[data-sgi-step-indicator="${step}"]`);
                    if (indicator) {
                        indicator.classList.toggle('sgi-stepper__item--completed', isCompleted);
                        indicator.classList.toggle('sgi-stepper__item--active', isActive);
                        indicator.classList.toggle('sgi-stepper__item--upcoming', isUpcoming);
                        if (isActive || (liberado && step === 6)) {
                            indicator.setAttribute('aria-current', 'step');
                        } else {
                            indicator.removeAttribute('aria-current');
                        }
                    }
                    const meta = painelCronograma.querySelector(`[data-sgi-step-meta="${step}"]`);
                    if (meta) {
                        meta.textContent = textoEstado;
                    }
                    const card = painelCronograma.querySelector(`[data-sgi-step-card="${step}"]`);
                    if (card) {
                        card.classList.toggle('sgi-step-card--completed', isCompleted);
                        card.classList.toggle('sgi-step-card--active', isActive);
                        card.classList.toggle('sgi-step-card--upcoming', isUpcoming);
                    }
                    const badge = painelCronograma.querySelector(`[data-sgi-card-badge="${step}"]`);
                    if (badge) {
                        badge.textContent = textoEstado;
                        badge.className = 'badge rounded-pill ' + (
                            isCompleted
                                ? 'bg-success-subtle text-success-emphasis'
                                : (isActive ? 'text-bg-primary' : 'text-bg-light border text-body-secondary')
                        );
                    }
                }
                if (preparar) preparar.className = `btn ${etapaAtiva === 1 && !concluidas.includes(1) ? 'btn-primary' : 'btn-outline-primary'} btn-sm w-100`;
                if (gerar) gerar.className = `btn ${etapaAtiva === 2 && !concluidas.includes(2) ? 'btn-primary' : 'btn-outline-primary'} btn-sm`;
                if (botaoPublicar) botaoPublicar.className = `btn ${etapaAtiva === 3 && !concluidas.includes(3) ? 'btn-success' : 'btn-outline-success'} btn-sm w-100`;
                if (botaoAbrir) botaoAbrir.className = `btn ${etapaAtiva === 4 && !concluidas.includes(4) ? 'btn-success' : 'btn-outline-success'} btn-sm`;
                if (botaoFechar) botaoFechar.className = `btn ${etapaAtiva === 5 && !concluidas.includes(5) ? 'btn-primary' : 'btn-outline-secondary'} btn-sm w-100`;
                if (botaoLiberar) botaoLiberar.className = `btn ${etapaAtiva === 6 && !concluidas.includes(6) ? 'btn-primary' : 'btn-outline-primary'} btn-sm w-100`;
            };
            const atualizarAcoes = () => {
                const indisponivel = cronogramaEmProgresso || !cronogramaEstadoConfiavel || !cronogramaEstado;
                const publicado = Boolean(cronogramaEstado && cronogramaEstado.cronograma_status === 'publicado');
                const liberado = operacaoLiberada();
                const inscricoesAbertas = cronogramaEstado?.inscricoes_status === 'abertas';
                const inscricoesFechadas = cronogramaEstado?.inscricoes_status === 'fechadas';
                const inscricoesEncerradas = cronogramaEstado?.inscricoes_status === 'encerradas';
                const rascunhoAtual = cronogramaRascunho
                    && cronogramaRascunho.cronograma_versao === Number(cronogramaEstado?.cronograma_versao || 0)
                    && cronogramaRascunho.assinatura === assinaturaGeracao()
                    && cronogramaRascunho.success === true
                    && cronogramaRascunho.pendencias.length === 0;

                if (preparar) preparar.disabled = indisponivel || !podeGerar();
                if (gerar) gerar.disabled = indisponivel || !podeGerar();
                if (botaoPublicar) botaoPublicar.disabled = indisponivel || !podeGerar() || !rascunhoAtual;
                if (botaoAbrir) botaoAbrir.disabled = indisponivel || !publicado || liberado || inscricoesAbertas;
                if (botaoFechar) botaoFechar.disabled = indisponivel || !publicado || liberado || (!inscricoesAbertas && !inscricoesFechadas);
                if (botaoLiberar) botaoLiberar.disabled = indisponivel || !publicado || liberado || !inscricoesEncerradas;
                if (botaoRevisar) botaoRevisar.disabled = indisponivel || !publicado || liberado;
                if (botaoAtualizar) botaoAtualizar.disabled = cronogramaEmProgresso;
                atualizarStepperCronograma(Boolean(rascunhoAtual));
            };
            const lerRespostaCronograma = async (response) => {
                const text = await response.text();
                let json;
                try { json = JSON.parse(text); } catch (_) {
                    throw new Error('O servidor retornou uma resposta inválida para o cronograma. Atualize o estado antes de continuar.');
                }
                if (!json || typeof json !== 'object' || Array.isArray(json)) {
                    throw new Error('O servidor retornou uma resposta inválida para o cronograma. Atualize o estado antes de continuar.');
                }
                return json;
            };

            const mostrarCronograma = (mensagem = '') => {
                if (!cronogramaEstado) { atualizarAcoes(); return; }
                const agenda = cronogramaEstado.cronograma_status || 'rascunho';
                const inscricoes = cronogramaEstado.inscricoes_status || 'fechadas';
                let inscricoesExibidas = inscricoes;
                if (inscricoes === 'abertas' && cronogramaEstado.inscricoes_status_efetivo === 'programadas') inscricoesExibidas = 'abertas · início programado';
                if (inscricoes === 'abertas' && cronogramaEstado.inscricoes_status_efetivo === 'expiradas') inscricoesExibidas = 'abertas · prazo expirado';
                if (inscricoes === 'abertas' && cronogramaEstado.inscricoes_status_efetivo === 'janela_invalida') inscricoesExibidas = 'abertas · período inválido';
                if (campoInscricaoInicio && campoInscricaoInicio.dataset.userEdited !== 'true') {
                    campoInscricaoInicio.value = valorDataHoraLocal(cronogramaEstado.inscricoes_abertura);
                }
                if (campoInscricaoFim && campoInscricaoFim.dataset.userEdited !== 'true') {
                    campoInscricaoFim.value = valorDataHoraLocal(cronogramaEstado.inscricoes_encerramento);
                }
                if (statusCronograma) {
                    statusCronograma.textContent = `${agenda} · inscrições ${inscricoesExibidas}`;
                    statusCronograma.className = `badge ${inscricoes === 'abertas' && inscricoesExibidas === inscricoes ? 'text-bg-success' : agenda === 'publicado' ? 'text-bg-primary' : 'text-bg-secondary'}`;
                }
                if (resumoCronograma) {
                    resumoCronograma.classList.remove('text-danger');
                    const modalidades = Array.isArray(cronogramaEstado.modalidades) ? cronogramaEstado.modalidades.length : 0;
                    const compromissos = Array.isArray(cronogramaEstado.compromissos) ? cronogramaEstado.compromissos.length : 0;
                    resumoCronograma.textContent = mensagem || `${modalidades} modalidade(s), ${compromissos} compromisso(s), revisão ${Number(cronogramaEstado.cronograma_versao || 0)}.`;
                }
                renderizarPrevia();
                atualizarAcoes();
            };
            const enviarCronograma = async (body) => {
                const response = await fetch(`${API}cronograma`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, id_interclasse: cronogramaId }) });
                const json = await lerRespostaCronograma(response);
                const geracaoComPendencias = body.acao === 'gerar_rascunho' && json.success === false && Array.isArray(json.pendencias);
                if (!response.ok || (json.success !== true && !geracaoComPendencias)) {
                    const pending = Array.isArray(json.pendencias) ? json.pendencias.map((item) => item.mensagem || item.motivo).filter(Boolean).join(' ') : '';
                    throw new Error([json.message, pending, `Operação recusada (HTTP ${response.status}).`].filter(Boolean).join(' '));
                }
                return json;
            };
            const atualizarCronograma = async () => {
                const montagem = cronogramaMontagem;
                try {
                    const response = await fetch(`${API}cronograma?id_interclasse=${encodeURIComponent(cronogramaId)}`);
                    const json = await lerRespostaCronograma(response);
                    const estadoValido = Number.isInteger(Number(json.cronograma_versao))
                        && ['rascunho', 'revisao', 'publicado'].includes(String(json.cronograma_status))
                        && ['fechadas', 'abertas', 'encerradas'].includes(String(json.inscricoes_status));
                    if (!response.ok || !estadoValido) throw new Error(json.message || `Não foi possível consultar o cronograma (HTTP ${response.status}).`);
                    if (!pageScope.active || montagem !== cronogramaMontagem || !painelCronograma.isConnected) return false;
                    cronogramaEstado = json;
                    cronogramaEstadoConfiavel = true;
                    if (cronogramaRascunho && (
                        cronogramaRascunho.cronograma_versao !== Number(json.cronograma_versao || 0)
                        || !['rascunho', 'revisao'].includes(String(json.cronograma_status))
                    )) invalidarRascunho('O estado do cronograma mudou. Gere um rascunho novo antes de publicar.');
                    mostrarCronograma();
                    return true;
                } catch (error) {
                    if (!pageScope.active || montagem !== cronogramaMontagem || !painelCronograma.isConnected) return false;
                    cronogramaEstadoConfiavel = false;
                    atualizarAcoes();
                    throw error;
                }
            };
            const tratarErroCronograma = (error) => {
                if (resumoCronograma) {
                    resumoCronograma.classList.add('text-danger');
                    resumoCronograma.textContent = error.message || 'Não foi possível processar o cronograma.';
                }
            };
            const executarMutacaoCronograma = async (request, mensagem, confirmado = () => {}) => {
                if (cronogramaEmProgresso || !cronogramaEstadoConfiavel) return;
                const montagem = pageScope;
                const geracaoMontagem = cronogramaMontagem;
                cronogramaEmProgresso = true;
                cronogramaEstadoConfiavel = false;
                atualizarAcoes();
                let operacaoConfirmada = false;
                try {
                    const result = await request();
                    operacaoConfirmada = true;
                    if (!montagem.active || geracaoMontagem !== cronogramaMontagem || !painelCronograma.isConnected) return;
                    confirmado(result);
                    await atualizarCronograma();
                    mostrarCronograma(typeof mensagem === 'function' ? mensagem(result) : mensagem);
                } catch (error) {
                    if (!montagem.active || geracaoMontagem !== cronogramaMontagem || !painelCronograma.isConnected) return;
                    let reconciliado = false;
                    if (!operacaoConfirmada) {
                        try { reconciliado = await atualizarCronograma(); } catch (_) {}
                    }
                    if (operacaoConfirmada) {
                        tratarErroCronograma(new Error('A operação foi concluída, mas não foi possível atualizar o estado. Consulte o cronograma para continuar.'));
                    } else if (reconciliado) {
                        tratarErroCronograma(error);
                    } else {
                        tratarErroCronograma(new Error('Não foi possível confirmar a operação nem consultar o estado. Tente atualizar antes de continuar.'));
                    }
                } finally {
                    if (montagem.active && geracaoMontagem === cronogramaMontagem && painelCronograma.isConnected) {
                        cronogramaEmProgresso = false;
                        atualizarAcoes();
                    }
                }
            };
            if (preparar) pageScope.listen(preparar, 'click', async () => {
                invalidarRascunho('As equipes foram atualizadas. Gere um rascunho novo antes de publicar.');
                await executarMutacaoCronograma(
                    () => enviarCronograma({ acao: 'preparar_equipes' }),
                    (result) => `${Number(result.equipes_criadas || 0)} equipe(s) criada(s); ${Number(result.equipes_existentes || 0)} já existente(s).`,
                    () => { equipesPreparadasSessao = true; },
                );
            });
            if (gerar) pageScope.listen(gerar, 'click', async () => {
                if (cronogramaEmProgresso || !cronogramaEstadoConfiavel || !podeGerar()) return;
                equipesPreparadasSessao = true;
                const geracao = ++cronogramaGeracao;
                const assinatura = assinaturaGeracao();
                cronogramaEmProgresso = true;
                atualizarAcoes();
                try {
                    const result = await enviarCronograma({
                        acao: 'gerar_rascunho',
                        data_inicio: campoInicio?.value,
                        data_fim: campoFim?.value,
                        hora_inicio: document.getElementById('cronogramaHoraInicio')?.value,
                        hora_fim: document.getElementById('cronogramaHoraFim')?.value,
                        duracao_min: Number(document.getElementById('cronogramaDuracao')?.value || 30)
                    });
                    if (!pageScope.active || !painelCronograma.isConnected) return;
                    if (geracao !== cronogramaGeracao || assinatura !== assinaturaGeracao()) {
                        tratarErroCronograma(new Error('Os parâmetros mudaram durante a geração. Gere o rascunho novamente.'));
                        return;
                    }
                    cronogramaRascunho = {
                        ...result,
                        pendencias: Array.isArray(result.pendencias) ? result.pendencias : [],
                        cronograma_versao: Number(result.cronograma_versao ?? cronogramaEstado.cronograma_versao ?? 0),
                        assinatura,
                    };
                    renderizarPrevia();
                    const pendencias = Array.isArray(result.pendencias) ? result.pendencias.length : 0;
                    if (resumoCronograma) {
                        const detalhes = cronogramaRascunho.pendencias.map((item) => item.mensagem || item.motivo).filter(Boolean).join(' ');
                        resumoCronograma.classList.toggle('text-danger', pendencias > 0);
                        resumoCronograma.textContent = `${Number(result.nos?.length || 0)} nó(s), ${Number(result.compromissos?.length || 0)} compromisso(s) gerado(s)${pendencias ? `; ${pendencias} pendência(s) bloqueiam a publicação. ${detalhes}` : '.'}`;
                    }
                } catch (error) {
                    if (pageScope.active && painelCronograma.isConnected) {
                        cronogramaRascunho = null;
                        renderizarPrevia();
                        tratarErroCronograma(error);
                    }
                } finally {
                    if (pageScope.active && painelCronograma.isConnected) {
                        cronogramaEmProgresso = false;
                        atualizarAcoes();
                    }
                }
            });
            if (botaoPublicar) pageScope.listen(botaoPublicar, 'click', async () => {
                const proposta = cronogramaRascunho;
                if (!proposta || proposta.assinatura !== assinaturaGeracao()) return;
                await executarMutacaoCronograma(
                    () => enviarCronograma({ acao: 'publicar', cronograma_versao: proposta.cronograma_versao, compromissos: proposta.compromissos, nos: proposta.nos }),
                    'Cronograma publicado. Defina a janela e abra as inscrições quando estiver pronto.',
                    () => invalidarRascunho(),
                );
            });
            if (botaoAbrir) pageScope.listen(botaoAbrir, 'click', async () => {
                if (!cronogramaEstado) return;
                await executarMutacaoCronograma(async () => {
                    const inicio = document.getElementById('cronogramaInscricaoInicio')?.value;
                    const fim = document.getElementById('cronogramaInscricaoFim')?.value;
                    return enviarCronograma({ acao: 'abrir_inscricoes', cronograma_versao: Number(cronogramaEstado.cronograma_versao || 0), inscricoes_abertura: inicio, inscricoes_encerramento: fim });
                }, 'Inscrições abertas na janela informada.', () => {
                    if (campoInscricaoInicio) campoInscricaoInicio.dataset.userEdited = 'false';
                    if (campoInscricaoFim) campoInscricaoFim.dataset.userEdited = 'false';
                });
            });
            if (botaoFechar) pageScope.listen(botaoFechar, 'click', async () => {
                if (!cronogramaEstado) return;
                await executarMutacaoCronograma(
                    () => enviarCronograma({ acao: 'encerrar_inscricoes', cronograma_versao: Number(cronogramaEstado.cronograma_versao || 0) }),
                    'Inscrições encerradas.',
                );
            });
            if (botaoLiberar) pageScope.listen(botaoLiberar, 'click', async () => {
                if (!cronogramaEstado) return;
                await executarMutacaoCronograma(async () => {
                    const liberacao = await enviarCronograma({ acao: 'liberar_operacao', cronograma_versao: Number(cronogramaEstado.cronograma_versao || 0) });
                    return liberacao;
                }, (liberacao) => liberacao.idempotente
                    ? 'A competição já estava liberada; os jogos mantêm a árvore e os horários publicados.'
                    : `Competição liberada após validar os elencos. ${Number(liberacao.jogos_criados || 0)} confronto(s) inicial(is) pronto(s).`,
                () => {
                    invalidarRascunho();
                });
            });
            if (botaoRevisar) pageScope.listen(botaoRevisar, 'click', async () => {
                if (!cronogramaEstado || cronogramaEstado.cronograma_status !== 'publicado') return;
                invalidarRascunho();
                await executarMutacaoCronograma(async () => {
                    const revisada = await enviarCronograma({ acao: 'revisar', cronograma_versao: Number(cronogramaEstado.cronograma_versao || 0) });
                    return revisada;
                }, (revisada) => `${Number(revisada.equipes_incompletas?.length || 0)} equipe(s) precisam de resolução antes da nova publicação.`);
            });
            camposGeracao.forEach((campo) => {
                const alterar = () => invalidarRascunho('Os parâmetros mudaram. Gere um rascunho novo antes de publicar.');
                pageScope.listen(campo, 'input', alterar);
                pageScope.listen(campo, 'change', alterar);
            });
            if (botaoAtualizar) pageScope.listen(botaoAtualizar, 'click', async () => {
                if (cronogramaEmProgresso) return;
                const geracaoMontagem = cronogramaMontagem;
                try {
                    cronogramaEmProgresso = true;
                    atualizarAcoes();
                    await atualizarCronograma();
                } catch (error) { tratarErroCronograma(error); }
                finally {
                    if (!pageScope.active || geracaoMontagem !== cronogramaMontagem || !painelCronograma.isConnected) return;
                    cronogramaEmProgresso = false;
                    atualizarAcoes();
                }
            });
            atualizarAcoes();
            atualizarCronograma().catch(tratarErroCronograma);
        }

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

    });
})();

return {};
});
