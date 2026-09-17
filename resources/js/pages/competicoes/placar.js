window.SGIPage.mount("competicoes/placar", function (pageConfig, pageScope) {

    // A SPA pode remontar esta tela várias vezes. Descarte a instância
    // anterior antes de registrar novos timers/listeners.
    if (typeof window.__SGI_TELA_CLEANUP__ === 'function') {
        try { window.__SGI_TELA_CLEANUP__(); } catch (_) {}
        window.__SGI_TELA_CLEANUP__ = null;
    }

    var params = new URLSearchParams(window.location.search);
    var idJogo = params.get('id_jogo') ? parseInt(params.get('id_jogo'), 10) : null;

    function obterIdJogoAtual() {
        var p = new URLSearchParams(window.location.search);
        var val = p.get('id_jogo');
        if (val != null && val !== '') {
            var parsed = parseInt(val, 10);
            if (!isNaN(parsed)) return parsed;
        }
        return (typeof idJogo !== 'undefined' && idJogo != null) ? idJogo : null;
    }

    function paginaOrigem() {
        try {
            const ref = new URL(document.referrer);
            return ref.pathname.split('/').pop() || '';
        } catch (_) {
            return '';
        }
    }

    function definirLinkVoltar() {
        const origem = params.get('origem');
        const refPagina = paginaOrigem();
        const refURL = (refPagina && document.referrer) ? document.referrer : null;
        let href = '/edicoes/agenda';

        if (origem === 'ranking' || refPagina === 'ranking') {
            href = refURL || '/ranking';
        } else if (origem === 'agenda' || refPagina === 'agenda') {
            href = refURL || '/edicoes/agenda';
        } else if (origem === 'agenda_edit' || refPagina === 'edicoes/agenda') {
            href = refURL || './edicoes/agenda';
        }

        const btn = document.getElementById('btnVoltarPlacar');
        if (btn) btn.href = href;
        const seta = document.querySelector('section.position-relative > a.bi-arrow-left');
        if (seta) seta.href = href;
    }

    var API = (window.SGI_API_BASE || '/api/v1/').replace(/\/?$/, '/');

    let estadoJogo = null;
    let partidasLista = [];
    let pontosLista = [];
    let timerId = null;
    let tempoRestante = 0;
    let duracaoJogo = 20 * 60;
    let pausado = false;
    let saveChains = {};
    let tempoEsgotado = false;
    let equipesCache = {};
    let ehIndividual = false;
    let tipoCompeticaoAtual = null;
    let indParticipantes = [];
    let indRankingAtual = [];
    let indParticipantesErro = false;
    let indRankingErro = false;
    let indDadosErro = false;
    var __sgiPlacarCiclo = 0;
    var relogioOffsetMs = 0;
    var Cronometro = window.SGICronometro;
    var __sgiStatusAnnounceTimer = null;
    var __sgiSyncStatusGeneration = 0;

    function anunciarStatusPlacar(mensagem) {
        var announcer = document.getElementById('placar-status-announcer');
        if (!announcer) return;
        if (__sgiStatusAnnounceTimer) clearTimeout(__sgiStatusAnnounceTimer);
        __sgiStatusAnnounceTimer = null;
        var texto = String(mensagem || '');
        if (announcer.textContent !== texto) {
            announcer.textContent = texto;
            return;
        }
        announcer.textContent = '';
        __sgiStatusAnnounceTimer = setTimeout(function () {
            __sgiStatusAnnounceTimer = null;
            if (announcer.isConnected) announcer.textContent = texto;
        }, 25);
    }

    function definirStatusSincronizacao(mensagem) {
        var status = document.getElementById('mc-sync-status');
        if (!status) return;
        var proximo = String(mensagem || '');
        if (status.textContent === proximo) return;
        status.textContent = proximo;
        status.hidden = !proximo;
    }

    function resolverTipoCompeticao(jogo) {
        if (!jogo) return null;
        if (jogo.tipo_competicao === 'individual') return 'individual';
        if (jogo.tipo_competicao === 'mata_mata') return 'mata_mata';
        var nomeTipo = String(jogo.nome_tipo_modalidade || '').trim().toLowerCase();
        if (nomeTipo === 'individual' || nomeTipo === 'prova individual' || nomeTipo === 'individualizada') return 'individual';
        if (nomeTipo === 'mata-mata' || nomeTipo === 'mata mata' || nomeTipo === 'mata-mata (eliminatório)' || nomeTipo === 'mata-mata (eliminatória)' || nomeTipo === 'eliminatório' || nomeTipo === 'eliminatória' || nomeTipo === 'eliminatoria') return 'mata_mata';
        return null;
    }

    function jogoEhIndividual(jogo) {
        return resolverTipoCompeticao(jogo) === 'individual';
    }

    var __sgiPlacarClickHandler = null;
    var __sgiPlacarCleanup = function() {
        // Invalida todas as leituras assíncronas da montagem que está saindo.
        // Uma resposta antiga nunca poderá pintar a próxima tela.
        __sgiPlacarCiclo++;
        pararTimer();
        if (window.__SGI_PLACAR_SYNC_UNSUB__) {
            try { window.__SGI_PLACAR_SYNC_UNSUB__(); } catch (_) {}
            window.__SGI_PLACAR_SYNC_UNSUB__ = null;
        }
        __sgiSyncStatusGeneration++;
        if (__sgiStatusAnnounceTimer) {
            clearTimeout(__sgiStatusAnnounceTimer);
            __sgiStatusAnnounceTimer = null;
        }
        if (__sgiPlacarClickHandler) {
            document.removeEventListener('click', __sgiPlacarClickHandler);
            __sgiPlacarClickHandler = null;
        }
    };
    window.__SGI_TELA_CLEANUP__ = __sgiPlacarCleanup;

    function formatNomeJogo(nomeJogo) {
        const mm = (nomeJogo || '').match(/^MM:(\d+):(\d+):([NB])$/);
        if (mm) {
            const largura = parseInt(mm[1], 10);
            const slot = parseInt(mm[2], 10);
            const kind = mm[3];
            const fases = { 16: 'Oitavas de final', 8: 'Quartas de final', 4: 'Semifinal', 2: 'Final', 1: 'Campeão' };
            const fase = fases[largura] || 'Fase';
            if (largura === 1) return fase;
            return fase + ' — Confronto ' + (slot + 1) + (kind === 'B' ? ' (bye)' : '');
        }
        return nomeJogo || 'Jogo';
    }

    function nomeEquipe(p) {
        if (!p) return 'Equipe';
        // Duas equipes diferentes podem pertencer à mesma turma. O placar
        // precisa identificá-las pelo nome da equipe; a turma é apenas fallback.
        if (p.nome_equipe && String(p.nome_equipe).trim()) return p.nome_equipe;
        if (p.nome_fantasia_turma && String(p.nome_fantasia_turma).trim()) return p.nome_fantasia_turma;
        if (p.nome_turma && String(p.nome_turma).trim()) return p.nome_turma;
        return 'Equipe ' + (p.equipes_id_equipe || '');
    }

    async function enriquecerPartidasComTurmas() {
        var DL = window.SGIDataLayer;
        if (!DL || typeof DL.read !== 'function') return;
        try {
            var turmas = await DL.read('turmas').catch(function() { return []; });
            var equipes = await DL.read('equipes').catch(function() { return []; });
            var mapTurma = {};
            (Array.isArray(turmas) ? turmas : []).forEach(function(t) { if (t && t.id_turma) mapTurma[t.id_turma] = t; });
            var mapEquipe = {};
            (Array.isArray(equipes) ? equipes : []).forEach(function(e) { if (e && e.id_equipe) mapEquipe[e.id_equipe] = e; });

            (partidasLista || []).forEach(function(p) {
                var eq = mapEquipe[p.equipes_id_equipe];
                if (eq) {
                    if (!p.id_turma) p.id_turma = eq.turmas_id_turma || eq.id_turma;
                    if (!p.nome_equipe) p.nome_equipe = eq.nome_equipe;
                }
                var idT = p.id_turma || p.turmas_id_turma || (eq && (eq.turmas_id_turma || eq.id_turma));
                if (idT && mapTurma[idT]) {
                    var t = mapTurma[idT];
                    p.id_turma = idT;
                    if (!p.nome_turma) p.nome_turma = t.nome_turma;
                    if (!p.nome_fantasia_turma) p.nome_fantasia_turma = t.nome_fantasia_turma || t.nome_turma;
                }
            });

            if (!ehIndividual && Array.isArray(partidasLista) && partidasLista.length > 2) {
                var vistasEq = {};
                var filtradas = [];
                for (var i = partidasLista.length - 1; i >= 0; i--) {
                    var item = partidasLista[i];
                    var idEq = String(item.equipes_id_equipe || '');
                    if (idEq && !vistasEq[idEq]) {
                        vistasEq[idEq] = true;
                        filtradas.unshift(item);
                        if (filtradas.length === 2) break;
                    }
                }
                if (filtradas.length > 0) partidasLista = filtradas;
            }
        } catch (_) {}
    }

    function esc(s) {
        var d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    function escAttr(s) {
        return esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    async function fetchJson(url, opts) {
        var r = await fetch(url, opts);
        var t = await r.text();
        var j;
        try { j = t ? JSON.parse(t) : {}; } catch (e) { j = {}; }
        if (!r.ok) throw new Error(j.message || 'Erro HTTP ' + r.status);
        return j;
    }

    function ajustarOffsetResposta(resposta) {
        var servidorMs = resposta && resposta.cronometro && Number(resposta.cronometro.servidor_epoch_ms);
        if (Number.isFinite(servidorMs) && servidorMs > 0) relogioOffsetMs = servidorMs - Date.now();
        return Number.isFinite(servidorMs) && servidorMs > 0 ? servidorMs : agoraServidorMs();
    }

    function normalizarJogoRecebido(jogo) {
        if (!jogo || typeof jogo !== 'object') return;
        var servidorMs = Number(jogo.servidor_epoch_ms);
        if (Number.isFinite(servidorMs) && servidorMs > 0) relogioOffsetMs = servidorMs - Date.now();
        if (jogo.tempo_restante_calculado != null) jogo.tempo_restante_jogo = jogo.tempo_restante_calculado;
        if (jogo.status_jogo === 'Iniciado' && jogo.tempo_restante_jogo != null && jogo.cronometro_referencia_epoch_ms == null) {
            jogo.cronometro_referencia_epoch_ms = Number.isFinite(servidorMs) && servidorMs > 0 ? servidorMs : agoraServidorMs();
        }
        if (jogo.status_jogo !== 'Iniciado') jogo.cronometro_referencia_epoch_ms = null;
    }

    function agoraServidorMs() {
        return Date.now() + relogioOffsetMs;
    }

    function estadoCronometroAtual() {
        var jogo = estadoJogo || {};
        var referencia = jogo.cronometro_referencia_epoch_ms;
        if (referencia == null && jogo.status_jogo === 'Iniciado' && jogo.servidor_epoch_ms != null) {
            referencia = Number(jogo.servidor_epoch_ms);
        }
        var saldo = jogo.tempo_restante_jogo;
        if (saldo == null && jogo.tempo_restante_calculado != null) saldo = jogo.tempo_restante_calculado;
        if (saldo == null) saldo = tempoRestante;
        return {
            status_jogo: jogo.status_jogo || 'Agendado',
            duracao_jogo: parseInt(jogo.duracao_jogo, 10) || duracaoJogo,
            tempo_extra_jogo: parseInt(jogo.tempo_extra_jogo, 10) || 0,
            tempo_restante_jogo: Math.max(0, parseInt(saldo, 10) || 0),
            data_inicio_real: referencia == null || !Number.isFinite(Number(referencia))
                ? null
                : Math.floor(Number(referencia) / 1000),
        };
    }

    function saldoCronometroAgora() {
        if (!Cronometro || !estadoJogo) return Math.max(0, tempoRestante);
        try {
            return Cronometro.saldoAtual(estadoCronometroAtual(), Math.floor(agoraServidorMs() / 1000));
        } catch (_) {
            return Math.max(0, tempoRestante);
        }
    }

    function blocoCronometro(status, saldo, referenciaMs) {
        return {
            versao: 2,
            saldo_segundos: Math.max(0, parseInt(saldo, 10) || 0),
            referencia_epoch_ms: Math.max(0, parseInt(referenciaMs, 10) || 0),
        };
    }

    function aplicarEstadoCronometro(next, servidorMs) {
        estadoJogo = Object.assign({}, estadoJogo || {}, next);
        tempoRestante = Math.max(0, next.tempo_restante_jogo == null ? 0 : Number(next.tempo_restante_jogo));
        duracaoJogo = Number(next.duracao_jogo) > 0 ? Number(next.duracao_jogo) : duracaoJogo;
        estadoJogo.tempo_restante_calculado = tempoRestante;
        estadoJogo.servidor_epoch_ms = servidorMs;
        estadoJogo.cronometro_referencia_epoch_ms = next.data_inicio_real == null ? null : Number(next.data_inicio_real) * 1000;
    }

    function atualizarTempoDoRelogio() {
        if (!estadoJogo || estadoJogo.status_jogo !== 'Iniciado') return;
        tempoRestante = saldoCronometroAgora();
        atualizarDisplayTimer();
        if (tempoRestante <= 0) bloquearPontuacao();
    }

    function pararTimer() {
        if (timerId) {
            clearInterval(timerId);
            timerId = null;
        }
    }

    function atualizarDisplayTimer() {
        var el = document.getElementById('timer-placar');
        if (!el) return;
        var m = String(Math.floor(Math.max(0, tempoRestante) / 60)).padStart(2, '0');
        var s = String(Math.max(0, tempoRestante) % 60).padStart(2, '0');
        el.textContent = m + ':' + s;
        var expirado = tempoRestante <= 0 && tempoEsgotado;
        el.classList.toggle('timer-expired', expirado);
        el.classList.toggle('text-danger', expirado);
        el.classList.toggle('text-body', !expirado && !el.classList.contains('mc-timer-time--idle'));
        el.classList.toggle('text-body-tertiary', !expirado && el.classList.contains('mc-timer-time--idle'));
        var statTimer = document.getElementById('mc-duration-stat');
        if (statTimer) statTimer.textContent = m + ':' + s;
    }

    function tocarAlertaSonoro() {
        try {
            var ctx = new (window.AudioContext || window.webkitAudioContext)();
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 880;
            osc.type = 'sine';
            gain.gain.setValueAtTime(0.4, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.2);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 1.2);
        } catch (e) {}
    }

    function bloquearPontuacao() {
        if (tempoEsgotado) return;
        tempoEsgotado = true;
        pararTimer();
        atualizarDisplayTimer();
        tocarAlertaSonoro();
        atualizarBloqueioPontuacao(true);
        anunciarStatusPlacar('Tempo esgotado. Pontuação bloqueada.');
        document.querySelectorAll('.btn-score-plus, .btn-score-minus').forEach(function(b) {
            b.disabled = true;
        });

        // Mostrar botões de tempo extra se o jogo não estiver encerrado
        var st = estadoJogo.status_jogo;
        if (st === 'Iniciado' || st === 'Pausado') {
            mostrarBotoesTempoExtra();
        }
    }

    function atualizarBloqueioPontuacao(bloqueado) {
        var grid = document.getElementById('placar-grid');
        if (!grid) return;
        grid.classList.toggle('score-blocked', !!bloqueado);
        var aviso = grid.querySelector('#mc-score-blocked-message');
        if (bloqueado && !aviso) {
            aviso = document.createElement('div');
            aviso.id = 'mc-score-blocked-message';
            aviso.className = 'mc-score-blocked-message';
            aviso.setAttribute('aria-hidden', 'true');
            aviso.textContent = 'Tempo esgotado';
            grid.appendChild(aviso);
        } else if (!bloqueado && aviso) {
            aviso.remove();
        }
    }

    function mostrarBotoesTempoExtra() {
        var acoes = document.getElementById('placar-acoes');
        if (!acoes) return;
        if (document.getElementById('mc-overtime-actions')) return;

        var container = document.createElement('div');
        container.id = 'mc-overtime-actions';
        container.className = 'd-flex align-items-center gap-2 flex-wrap mt-3';

        var label = document.createElement('span');
        label.className = 'fw-bold text-danger';
        label.innerHTML = '<i class="bi bi-stopwatch me-1"></i>Tempo esgotado — Acréscimos:';
        container.appendChild(label);

        var inputGroup = document.createElement('div');
        inputGroup.className = 'd-flex align-items-center gap-2';

        var input = document.createElement('input');
        input.type = 'number';
        input.id = 'mc-overtime-input';
        input.min = '1';
        input.max = '30';
        input.placeholder = 'min';
        input.className = 'form-control form-control-sm text-center w-auto';
        var inputLabel = document.createElement('label');
        inputLabel.className = 'visually-hidden';
        inputLabel.htmlFor = input.id;
        inputLabel.textContent = 'Tempo extra, em minutos';
        inputGroup.appendChild(inputLabel);
        pageScope.listen(input, 'keydown', function(e) {
            if (e.key === 'Enter') { btn.click(); }
        });
        inputGroup.appendChild(input);

        var minLabel = document.createElement('span');
        minLabel.className = 'small text-body-secondary';
        minLabel.textContent = 'min';
        inputGroup.appendChild(minLabel);

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mc-action-btn mc-action-btn--start btn btn-primary btn-sm d-inline-flex align-items-center gap-2';
        btn.innerHTML = '<i class="bi bi-plus-circle me-1"></i>Adicionar';
        pageScope.listen(btn, 'click', function() {
            var val = input.valueAsNumber;
            if (!Number.isInteger(val) || val < 1 || val > 30) {
                input.classList.add('is-invalid');
                input.setAttribute('aria-invalid', 'true');
                input.setAttribute('aria-describedby', overtimeError.id);
                overtimeError.classList.remove('d-none');
                input.focus();
                return;
            }
            input.classList.remove('is-invalid');
            input.removeAttribute('aria-invalid');
            input.removeAttribute('aria-describedby');
            overtimeError.classList.add('d-none');
            adicionarTempoExtra(val * 60);
        });
        inputGroup.appendChild(btn);

        container.appendChild(inputGroup);
        var overtimeError = document.createElement('small');
        overtimeError.id = 'mc-overtime-error';
        overtimeError.className = 'text-danger small d-none';
        overtimeError.textContent = 'Informe um tempo extra de 1 a 30 minutos.';
        container.appendChild(overtimeError);
        acoes.appendChild(container);
        input.focus();
    }

    async function adicionarTempoExtra(segundos) {
        var agoraMs = agoraServidorMs();
        var estado = estadoCronometroAtual();
        var novoTotal = estado.tempo_extra_jogo + segundos;
        try {
            var next = Cronometro.transicionar(estado, 'acrescentar', Math.floor(agoraMs / 1000), {
                tempo_extra_jogo: novoTotal,
            });
            var response = await fetchJson(API + 'jogos', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id_jogo: idJogo,
                    status_jogo: next.status_jogo,
                    tempo_extra_jogo: novoTotal,
                    tempo_restante_jogo: next.tempo_restante_jogo,
                    cronometro: blocoCronometro(next.status_jogo, next.tempo_restante_jogo, agoraMs),
                })
            });
            aplicarEstadoCronometro(next, ajustarOffsetResposta(response));
            tempoEsgotado = false;

            // Remover bloqueio visual
            atualizarBloqueioPontuacao(false);
            document.querySelectorAll('.btn-score-plus, .btn-score-minus').forEach(function(b) {
                b.disabled = false;
            });

            // Remover botões de overtime
            var ov = document.getElementById('mc-overtime-actions');
            if (ov) ov.remove();

            // Reiniciar timer
            await persistirJogoLocal();
            renderTudo();
            iniciarTimerDisplay();
        } catch (e) {
            SGI.alert('Erro ao adicionar tempo extra: ' + (e.message || 'Erro de conexão'));
        }
    }

    function iniciarTimerDisplay() {
        var el = document.getElementById('timer-placar');
        if (!el) return;
        pararTimer();

        if (tempoRestante <= 0 && estadoJogo.status_jogo === 'Agendado') {
            tempoRestante = duracaoJogo;
        }

        if (estadoJogo.status_jogo === 'Iniciado') tempoRestante = saldoCronometroAgora();

        if (tempoRestante <= 0) {
            var st = estadoJogo.status_jogo;
            if (st === 'Iniciado' || st === 'Pausado') {
                tempoEsgotado = false;
                bloquearPontuacao();
            } else {
                tempoEsgotado = true;
                atualizarDisplayTimer();
            }
            return;
        }

        tempoEsgotado = false;
        pausado = estadoJogo.status_jogo === 'Pausado';
        atualizarDisplayTimer();
        var btnPause = document.getElementById('btn-pausar');
        if (btnPause) btnPause.textContent = pausado ? 'Retomar' : 'Pausar';
        if (!pausado) {
            timerId = setInterval(atualizarTempoDoRelogio, 1000);
        }
    }

    async function togglePause() {
        if (!estadoJogo || !Cronometro) return;
        var target = estadoJogo.status_jogo === 'Pausado' ? 'Iniciado' : 'Pausado';
        var agoraMs = agoraServidorMs();
        var estado = estadoCronometroAtual();
        var next = Cronometro.aplicarSnapshot(
            estado,
            blocoCronometro(target, saldoCronometroAgora(), agoraMs),
            target,
            Math.floor(agoraMs / 1000),
        );
        try {
            var response = await fetchJson(API + 'jogos', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id_jogo: idJogo,
                    status_jogo: target,
                    tempo_restante_jogo: next.tempo_restante_jogo,
                    tempo_extra_jogo: next.tempo_extra_jogo,
                    cronometro: blocoCronometro(target, next.tempo_restante_jogo, agoraMs),
                })
            });
            aplicarEstadoCronometro(next, ajustarOffsetResposta(response));
            pausado = target === 'Pausado';
            await persistirJogoLocal();
            renderTudo();
            iniciarTimerDisplay();
            anunciarStatusPlacar(target === 'Pausado'
                ? (response && response.offline ? 'Cronômetro pausado neste dispositivo, aguardando envio ao servidor.' : 'Cronômetro pausado.')
                : (response && response.offline ? 'Cronômetro retomado neste dispositivo, aguardando envio ao servidor.' : 'Cronômetro retomado.'));
        } catch (e) {
            SGI.alert('Erro ao ' + (target === 'Pausado' ? 'pausar' : 'retomar') + ': ' + (e.message || 'Erro de conexão'));
        }
    }

    function mudarDuracao(segundos) {
        var st = estadoJogo.status_jogo;
        var diff = segundos - duracaoJogo;
        duracaoJogo = segundos;
        if (st === 'Iniciado' || st === 'Pausado') {
            tempoRestante = Math.max(1, tempoRestante + diff);
        } else {
            tempoRestante = segundos;
        }
        tempoEsgotado = false;
        atualizarDisplayTimer();
    }

    function agendarSalvarPartida(idPartida, gols) {
        var chave = String(idPartida);
        var partidaCapturada = (partidasLista || []).find(function(p) {
            return String(p.id_partida) === chave;
        });
        var jogoCapturado = estadoJogo ? Object.assign({}, estadoJogo) : null;
        var placarCapturado = Math.max(0, parseInt(gols, 10) || 0);
        var anterior = saveChains[chave] || Promise.resolve();
        var atual = anterior.catch(function() {}).then(function() {
            return salvarPartida(idPartida, placarCapturado, {
                jogo: jogoCapturado,
                partida: partidaCapturada ? Object.assign({}, partidaCapturada) : null,
            });
        });
        saveChains[chave] = atual;
        atual.then(function() {
            if (saveChains[chave] === atual) delete saveChains[chave];
        }, function(error) {
            if (saveChains[chave] === atual) delete saveChains[chave];
            SGI.alert('Erro ao salvar o placar: ' + ((error && error.message) || 'não foi possível gravar a alteração local.'));
        });
        return atual;
    }

    async function salvarPartida(idPartida, gols, capturado) {
        if (!idPartida || isNaN(Number(idPartida)) || Number(idPartida) <= 0 || String(idPartida).indexOf('mm_local_') === 0 || (estadoJogo && Number(estadoJogo.id_jogo) < 0)) {
            // Partida offline ou derivada local: grava APENAS no banco local IndexedDB
            if (window.SGIDataLayer && window.SGIDataLayer.upsert) {
                var rowPartida = capturado && capturado.partida
                    ? capturado.partida
                    : (partidasLista || []).find(function(p) { return String(p.id_partida) === String(idPartida); });
                if (!rowPartida) return;
                rowPartida.resultado_partida = gols;
                await window.SGIDataLayer.upsert('partidas', idPartida, rowPartida);
            }
            return;
        }
        if (!(window.SGIOffline && typeof window.SGIOffline.queueMutation === 'function')) {
            throw new Error('A fila offline do Mesário não está disponível.');
        }
        var urlAbsoluta;
        try { urlAbsoluta = new URL(API + 'partidas', location.href).href; }
        catch (_) { urlAbsoluta = API + 'partidas'; }
        var item = await window.SGIOffline.queueMutation(
            'PUT',
            urlAbsoluta,
            JSON.stringify({ id_partida: idPartida, resultado_partida: gols }),
            { 'Content-Type': 'application/json' }
        );
        if (item && item.projectionError) {
            throw new Error(item.projectionError);
        }
        if (typeof window.SGIOffline.sync === 'function' && window.SGIOffline.isOnline()) {
            await window.SGIOffline.sync();
        }
    }

    function aguardarGravacoesPartidas() {
        return Promise.all(Object.keys(saveChains).map(function(chave) {
            return saveChains[chave];
        }));
    }

    /* Espelha o estado do jogo (Iniciado/Pausado/duração) na store local de
       jogos. Sem isto, iniciar o jogo online nunca atualizava o banco JS e,
       recarregando o placar offline sem mutações pendentes, o snapshot por URL
       mostrava 'Agendado' e o botão de finalizar sumia. */
    function persistirJogoLocal() {
        if (!(window.SGIDataLayer && window.SGIDataLayer.upsert)) return Promise.resolve();
        var DL = window.SGIDataLayer;
        return Promise.resolve(DL.read ? DL.read('jogos') : []).then(function (rows) {
            var old = (rows || []).filter(function (row) { return String(row.id_jogo) === String(idJogo); })[0];
            return DL.upsert('jogos', idJogo, Object.assign({}, old || {}, estadoJogo, {
                _pendente: !!(old && old._pendente === true),
            }));
        });
    }

    function jogoEncerrado() {
        var st = estadoJogo ? estadoJogo.status_jogo : '';
        return st === 'Concluido' || st === 'Finalizado';
    }

    async function iniciarJogoServidor() {
        if (!idJogo) idJogo = obterIdJogoAtual();
        var selDur = document.getElementById('select-duracao');
        if (selDur && selDur.value) {
            var valM = parseInt(selDur.value, 10);
            if (!isNaN(valM) && valM > 0) duracaoJogo = valM * 60;
        }
        if (!duracaoJogo || isNaN(duracaoJogo)) duracaoJogo = 20 * 60;
        var agoraMs = agoraServidorMs();
        var estado = estadoCronometroAtual();
        estado.status_jogo = 'Agendado';
        estado.duracao_jogo = duracaoJogo;
        var next = Cronometro.transicionar(estado, 'retomar', Math.floor(agoraMs / 1000));
        var response = await fetchJson(API + 'jogos', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id_jogo: idJogo,
                status_jogo: 'Iniciado',
                duracao_jogo: duracaoJogo,
                tempo_restante_jogo: next.tempo_restante_jogo,
                tempo_extra_jogo: next.tempo_extra_jogo,
                cronometro: blocoCronometro('Iniciado', next.tempo_restante_jogo, agoraMs),
            })
        });
        aplicarEstadoCronometro(next, ajustarOffsetResposta(response));
        await persistirJogoLocal();
        renderTudo();
        anunciarStatusPlacar(response && response.offline
            ? 'Partida iniciada neste dispositivo, aguardando envio ao servidor.'
            : 'Partida iniciada.');
        iniciarTimerDisplay();
    }

    async function finalizarJogo() {
        if (!await SGI.confirm({ titulo: 'Encerrar jogo?', mensagem: 'O placar final será gravado no sistema.', textoConfirmar: 'Encerrar jogo' })) return;
        var resultados = partidasLista.map(function(p) {
            return {
                id_equipe: parseInt(p.equipes_id_equipe, 10),
                gols: Math.max(0, parseInt(p.resultado_partida, 10) || 0)
            };
        });
        if (resultados.length >= 2 && resultados[0].gols === resultados[1].gols) {
            SGI.alert('O jogo não pode terminar empatado! Registre o placar correto antes de finalizar.');
            return;
        }

        /* Híbrido: offline grava no banco temporário JS e libera a UI na hora;
           online envia à API PHP normalmente. */
        var offline = !navigator.onLine || (window.SGIOffline && typeof window.SGIOffline.isOnline === 'function' && !window.SGIOffline.isOnline());
        if (offline) {
            await finalizarLocalmente(resultados);
            return;
        }

        try {
            var payloadFin = {
                id_jogo: idJogo,
                nome_jogo: (estadoJogo && estadoJogo.nome_jogo) || null,
                id_modalidade: (estadoJogo && (estadoJogo.modalidades_id_modalidade || estadoJogo.id_modalidade)) || null,
                resultados: resultados
            };
            var res = await fetch(API + 'resultados', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payloadFin)
            });
            var js = await res.json();
            if (!res.ok || js.success === false) throw new Error(js.message || 'Falha ao finalizar');

            /* Soft-offline: o wrapper do offline-core enfileirou a requisição
               e devolveu sucesso local (offline:true). Aplica a finalização na
               UI SEM recarregar do servidor — o snapshot por URL estaria
               desatualizado e faria a tela "voltar" para Iniciado a cada
               clique, além de duplicar o POST na fila de sincronização. */
            if (js.offline === true) {
                aplicarFinalizacaoUI(resultados);
                if (window.SGIChaveamento && typeof window.SGIChaveamento.promoverVencedorLocal === 'function') {
                    window.SGIChaveamento.promoverVencedorLocal(idJogo).catch(function() {});
                }
                return;
            }
            estadoJogo.status_jogo = 'Concluido';
            pararTimer();
            await carregarDados();
            anunciarStatusPlacar('Resultado confirmado pelo servidor.');
        } catch (e) {
            SGI.alert(e.message || 'Erro ao finalizar.');
        }
    }

    /* ── Finalização OFFLINE ─────────────────────────────────────────────
       1) Aplica o término imediatamente na memória (status 'Concluido' +
          placar) e re-renderiza a tela, sem esperar servidor.
       2) Enfileira a MESMA requisição original (POST resultados)
          na mutation queue do offline-core. O hook SGIDataLayer.onQueued
          projeta o placar e o novo status no IndexedDB local, e quando a
          conexão voltar a fila reenvia tudo ao PHP, que refaz as validações
          e avança o chaveamento nativamente.
       3) Dispara o Bracket Engine local (SGIChaveamento.promoverVencedorLocal),
          que promove o vencedor na árvore do banco JS: cria/libera a próxima
          partida ou marca "aguardando adversário", recursivamente até o
          campeão — sem nenhuma chamada ao PHP. */
    /* Aplica o término do jogo na interface (placar final + status Concluido
       + timer parado), sem enfileirar nem consultar o servidor. Usada pelos
       caminhos offline e soft-offline. */
    function aplicarFinalizacaoUI(resultados) {
        resultados.forEach(function(r) {
            var p = partidasLista.filter(function(x) {
                return parseInt(x.equipes_id_equipe, 10) === r.id_equipe;
            })[0];
            if (p) p.resultado_partida = String(r.gols);
        });
        estadoJogo.status_jogo = 'Concluido';
        pararTimer();
        renderTudo();
        anunciarStatusPlacar('Resultado salvo neste dispositivo, aguardando envio ao servidor.');
        if (window.SGIOffline && typeof window.SGIOffline.getPendingList === 'function') {
            var ciclo = __sgiPlacarCiclo;
            window.SGIOffline.getPendingList().then(function (items) {
                if (placarContinuaAtivo(ciclo)) {
                    atualizarStatusResultadoPendente(window.SGIOffline.getState(), filaDaPartida(items));
                }
            }).catch(function () {});
        }
    }

    async function finalizarLocalmente(resultados) {
        // --- Lock contra finalização duplicada (multi-abas / duplo-clique) ---
        var lockKey = 'sgi_finalizando_' + idJogo;
        var agora = Date.now();
        function liberarLock() { try { localStorage.removeItem(lockKey); } catch (e) {} }
        try {
            var lockData = localStorage.getItem(lockKey);
            if (lockData) {
                var lock = JSON.parse(lockData);
                if (agora - lock.ts < 60000) {
                    SGI.alert('Este jogo está sendo finalizado. Aguarde um momento.');
                    return;
                }
            }
        } catch (e) { /* localStorage indisponível, ignora lock */ }
        try { localStorage.setItem(lockKey, JSON.stringify({ ts: agora })); } catch (e) {}

        var totalGols = resultados.reduce(function(s, r) { return s + r.gols; }, 0);
        if (totalGols === 0) {
            liberarLock();
            SGI.alert('Não é possível finalizar um jogo com placar 0x0. Registre o placar correto.');
            return;
        }

        // A interface só pode anunciar "Encerrado" depois que a projeção no
        // IndexedDB terminou. Assim, voltar imediatamente para a agenda nunca
        // reabre a versão antiga Agendado/Iniciado do mesmo jogo.
        if (!(window.SGIOffline && typeof window.SGIOffline.queueMutation === 'function')) {
            liberarLock();
            SGI.alert('Sem conexão com o servidor. Tente novamente quando estiver online.');
            return;
        }

        // Aguarde as intenções de placar capturadas antes da finalização. A
        // desmontagem da SPA não pode deixar uma gravação anterior sobrescrever
        // o resultado final que será enviado agora.
        try {
            await aguardarGravacoesPartidas();
        } catch (e) {
            liberarLock();
            SGI.alert('Não foi possível salvar o placar antes de finalizar: ' + ((e && e.message) || 'tente novamente.'));
            return;
        }
        if (window.SGIDataLayer && typeof window.SGIDataLayer.upsert === 'function') {
            await Promise.all(resultados.map(function(r) {
                var partida = (partidasLista || []).find(function(p) {
                    return parseInt(p.equipes_id_equipe, 10) === Number(r.id_equipe);
                });
                if (!partida || partida.id_partida == null) return Promise.resolve();
                partida.resultado_partida = Number(r.gols) || 0;
                return window.SGIDataLayer.upsert('partidas', partida.id_partida,
                    Object.assign({}, partida, { resultado_partida: partida.resultado_partida, _pendente: true }));
            }));
        }
        var urlAbsoluta;
        try { urlAbsoluta = new URL(API + 'resultados', location.href).href; }
        catch (_) { urlAbsoluta = API + 'resultados'; }

        var payloadLocal = {
            id_jogo: idJogo,
            nome_jogo: (estadoJogo && estadoJogo.nome_jogo) || null,
            id_modalidade: (estadoJogo && (estadoJogo.modalidades_id_modalidade || estadoJogo.id_modalidade)) || null,
            _contexto_offline: estadoJogo ? {
                id_jogo: idJogo,
                nome_jogo: estadoJogo.nome_jogo || null,
                data_jogo: estadoJogo.data_jogo || null,
                inicio_jogo: estadoJogo.inicio_jogo || null,
                termino_jogo: estadoJogo.termino_jogo || estadoJogo.terminno_jogo || null,
                modalidades_id_modalidade: estadoJogo.modalidades_id_modalidade || estadoJogo.id_modalidade || null,
                id_interclasse: estadoJogo.id_interclasse || estadoJogo.interclasses_id_interclasse || null,
                locais_id_local: estadoJogo.locais_id_local || null,
                nome_modalidade: estadoJogo.nome_modalidade || null,
                nome_categoria: estadoJogo.nome_categoria || null,
                nome_local: estadoJogo.nome_local || null,
                equipes_nomes: estadoJogo.equipes_nomes || null,
                tipos_modalidades_id_tipo_modalidade: estadoJogo.tipos_modalidades_id_tipo_modalidade || null
            } : null,
            resultados: resultados,
            // Jogos derivados não podem enviar pontos separados antes de o
            // servidor materializar o jogo. O ledger local completo viaja
            // junto da finalização, incluindo eventos já anulados.
            pontos: Number(idJogo) < 0 ? pontosLista.map(function (ponto) {
                return {
                    id_equipe: Number(ponto.equipes_id_equipe),
                    usuarios_id_usuario: Number(ponto.usuarios_id_usuario),
                    chave_jogada: ponto.chave_jogada,
                    status_artilheiro: ponto.status_artilheiro || 'ativo',
                    conta_no_placar: ponto.conta_no_placar == null ? 1 : Number(ponto.conta_no_placar)
                };
            }) : []
        };

        try {
            await window.SGIOffline.queueMutation(
                'POST',
                urlAbsoluta,
                JSON.stringify(payloadLocal),
                { 'Content-Type': 'application/json' }
            );

            // A mutação e sua projeção já estão persistidas. Agora é seguro
            // liberar a navegação e renderizar o estado final.
            aplicarFinalizacaoUI(resultados);
            liberarLock();

            // Avanço imediato da árvore no banco JS temporário.
            if (window.SGIChaveamento && typeof window.SGIChaveamento.promoverVencedorLocal === 'function') {
                try {
                    var r = await window.SGIChaveamento.promoverVencedorLocal(idJogo);
                    if (!r || !r.promoveu) {
                        SGI.alert('Jogo encerrado offline! Resultado salvo neste dispositivo e será enviado ao servidor quando a conexão voltar.');
                    } else if (r.encerrado) {
                        SGI.alert('Campeão definido offline: a final foi concluída neste dispositivo. Tudo será sincronizado com o servidor.');
                    } else if (r.pai.formada) {
                        SGI.alert('Vencedor avançou! Nova partida liberada: ' + r.pai.nome_display + '.');
                    } else {
                        SGI.alert('Vencedor aguardando adversário em: ' + r.pai.nome_display + '.');
                    }
                } catch (_) {
                    SGI.alert('Jogo encerrado offline! (Não foi possível calcular a próxima fase agora.)');
                }
                return;
            }
            SGI.alert('Jogo encerrado offline! O resultado foi salvo neste dispositivo e será enviado ao servidor automaticamente quando a conexão voltar.');
        } catch (_) {
            liberarLock();
            SGI.alert('Não foi possível registrar o resultado no armazenamento local. O jogo permanece em andamento para evitar perda de dados.');
        }
    }

    /* Carrega do banco JS temporário uma partida derivada offline (id < 0),
       tornando-a jogável no placar sem qualquer contato com o servidor. */
    function placarContinuaAtivo(ciclo) {
        var grid = document.getElementById('placar-grid');
        return ciclo === __sgiPlacarCiclo && !!(grid && grid.isConnected);
    }

    async function carregarJogoLocalTemporario(ciclo) {
        var DL = window.SGIDataLayer;
        if (!DL || typeof DL.read !== 'function') return false;
        try {
            var jogos = await DL.read('jogos');
            if (!placarContinuaAtivo(ciclo)) return false;
            var row = jogos.filter(function(j) { return Number(j.id_jogo) === idJogo; })[0];
            if (!row) return false;

            estadoJogo = Object.assign({}, row);
            normalizarJogoRecebido(estadoJogo);
            if (!estadoJogo.nome_modalidade) estadoJogo.nome_modalidade = '';

            var modalidades = await DL.read('modalidades').catch(function() { return []; });
            if (!placarContinuaAtivo(ciclo)) return false;
            if (Array.isArray(modalidades) && estadoJogo.modalidades_id_modalidade) {
                var mod = modalidades.find(function(m) { return Number(m.id_modalidade) === Number(estadoJogo.modalidades_id_modalidade); });
                if (mod) {
                    if (!estadoJogo.nome_modalidade) estadoJogo.nome_modalidade = mod.nome_modalidade;
                    if (!estadoJogo.tipos_modalidades_id_tipo_modalidade) estadoJogo.tipos_modalidades_id_tipo_modalidade = mod.tipos_modalidades_id_tipo_modalidade;
                    if (!estadoJogo.nome_tipo_modalidade) estadoJogo.nome_tipo_modalidade = mod.nome_tipo_modalidade;
                    if (!estadoJogo.tipo_competicao) estadoJogo.tipo_competicao = mod.tipo_competicao;
                }
            }
            tipoCompeticaoAtual = resolverTipoCompeticao(estadoJogo);
            if (!tipoCompeticaoAtual) throw new Error('O tipo da modalidade não está configurado.');
            ehIndividual = tipoCompeticaoAtual === 'individual';
            var locais = await DL.read('locais').catch(function() { return []; });
            if (!placarContinuaAtivo(ciclo)) return false;
            if (Array.isArray(locais)) {
                if (estadoJogo.locais_id_local) {
                    var loc = locais.find(function(l) { return Number(l.id_local) === Number(estadoJogo.locais_id_local); });
                    if (loc && !estadoJogo.nome_local) estadoJogo.nome_local = loc.nome_local;
                }
            }

            var todasPartidas = await DL.read('partidas');
            if (!placarContinuaAtivo(ciclo)) return false;
            partidasLista = todasPartidas.filter(function(p) {
                return String(p.jogos_id_jogo) === String(idJogo);
            });
            pontosLista = await DL.read('pontos').catch(function() { return []; });
            pontosLista = (pontosLista || []).filter(function(p) { return String(p.jogos_id_jogo) === String(idJogo); });

            if ((!partidasLista || partidasLista.length === 0) && Array.isArray(row.equipes) && row.equipes.length > 0) {
                partidasLista = row.equipes.map(function(eq, idx) {
                    return {
                        id_partida: eq.id_partida || ('mm_local_' + row.id_jogo + '_' + (eq.id_equipe || idx)),
                        jogos_id_jogo: row.id_jogo,
                        equipes_id_equipe: eq.id_equipe,
                        resultado_partida: eq.gols || 0,
                        id_turma: eq.id_turma || null,
                        nome_turma: eq.nome_turma || '',
                        nome_fantasia_turma: eq.nome_fantasia || eq.nome_fantasia_turma || eq.nome_equipe || '',
                        nome_equipe: eq.nome_equipe || ''
                    };
                });
            }

            ehIndividual = jogoEhIndividual(estadoJogo);
            await enriquecerPartidasComTurmas();
            if (!placarContinuaAtivo(ciclo)) return false;
            duracaoJogo = parseInt(estadoJogo.duracao_jogo, 10) || (20 * 60);
            tempoRestante = estadoJogo.tempo_restante_jogo != null
                ? Math.max(0, parseInt(estadoJogo.tempo_restante_jogo, 10) || 0)
                : duracaoJogo;

            document.getElementById('placar-loading').classList.add('d-none');
            document.getElementById('placar-conteudo').classList.remove('d-none');
            renderTudo();
            if (!ehIndividual) iniciarArtilheiro(ciclo);
            return true;
        } catch (e) {
            return false;
        }
    }

    function renderTudo() {
        pararTimer();
        tempoEsgotado = false;

        var meta = document.getElementById('placar-meta');
        var acoes = document.getElementById('placar-acoes');
        var grid = document.getElementById('placar-grid');
        var titulo = document.getElementById('placar-titulo-jogo');
        var statusEl = document.getElementById('mc-status-badge');
        if (!meta || !acoes || !grid || !titulo) return;

        titulo.textContent = ehIndividual
            ? ((estadoJogo && estadoJogo.nome_modalidade) || 'Prova individual')
            : (formatNomeJogo(estadoJogo ? estadoJogo.nome_jogo : '') || 'Placar');
        meta.textContent = [
            estadoJogo ? estadoJogo.nome_modalidade : '',
            estadoJogo ? estadoJogo.nome_local : '',
            estadoJogo ? estadoJogo.data_jogo : '',
            (estadoJogo && estadoJogo.inicio_jogo) ? String(estadoJogo.inicio_jogo).slice(0, 5) : ''
        ].filter(Boolean).join('  ·  ');

        var st = estadoJogo.status_jogo;
        if (statusEl) {
            var badgeClass = 'text-bg-warning';
            var badgeLabel = 'Agendado';
            if (st === 'Iniciado') { badgeClass = 'text-bg-success'; badgeLabel = 'Em andamento'; }
            else if (st === 'Pausado') { badgeClass = 'text-bg-info'; badgeLabel = 'Pausado'; }
            else if (st === 'Concluido' || st === 'Finalizado') { badgeClass = 'text-bg-secondary'; badgeLabel = 'Encerrado'; }
            statusEl.innerHTML = '<span class="badge rounded-pill ' + badgeClass + '">' + badgeLabel + '</span>';
        }

        acoes.innerHTML = '';
        grid.innerHTML = '';
        grid.classList.remove('score-blocked');

        if (ehIndividual) {
            renderIndividual();
            return;
        }

        var emAndamento = st === 'Iniciado' || st === 'Pausado';
        var encerrado = st === 'Concluido' || st === 'Finalizado';

        var fab = document.getElementById('btnNovaOcorrencia');
        if (fab) fab.style.display = encerrado ? 'none' : '';

        if (st === 'Agendado') {
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'mc-action-btn mc-action-btn--start btn btn-primary d-inline-flex align-items-center gap-2';
            b.innerHTML = '<i class="bi bi-play-fill"></i> Iniciar jogo';
            pageScope.listen(b, 'click', function() {
                iniciarJogoServidor().catch(function(e) { SGI.alert(e.message); });
            });
            acoes.appendChild(b);
        }

        if (emAndamento && partidasLista.length >= 2) {
            var b2 = document.createElement('button');
            b2.type = 'button';
            b2.className = 'mc-action-btn mc-action-btn--finish btn btn-outline-danger d-inline-flex align-items-center gap-2';
            b2.innerHTML = '<i class="bi bi-stop-fill"></i> Finalizar jogo';
            pageScope.listen(b2, 'click', function() { finalizarJogo(); });
            acoes.appendChild(b2);
        }


        if (partidasLista.length === 0) {
            grid.innerHTML = '<div class="text-center py-5 text-body-secondary"><i class="bi bi-inbox fs-2 d-block mb-2 text-body-tertiary"></i>Não há equipes vinculadas a este jogo. Cadastre as partidas no sistema.</div>';
            return;
        }

        var podeTimer = emAndamento || st === 'Agendado';
        var readonly = encerrado || st === 'Agendado' || tempoEsgotado;

        var html = '<div class="mc-scoreboard-main">';

        // Timer
        if (podeTimer) {
            var selOpts = [5,10,15,20,25,30,40,45].map(function(v) {
                return '<option value="' + v + '"' + (duracaoJogo === v*60 ? ' selected' : '') + '>' + v + ' min</option>';
            }).join('');

            html += '<div class="mc-timer-panel text-center w-100 border-bottom pb-4 mb-4">';
            html += '<div class="mc-timer-time fw-bolder text-body lh-1" id="timer-placar">' +
                String(Math.floor(duracaoJogo / 60)).padStart(2, '0') + ':' +
                String(duracaoJogo % 60).padStart(2, '0') + '</div>';
            html += '<div class="d-flex align-items-center justify-content-center gap-3 mt-3">';
            html += '<label class="visually-hidden" for="select-duracao">Duração do jogo</label>';
            html += '<select id="select-duracao" class="mc-duration-select form-select form-select-sm w-auto"' + (emAndamento ? ' disabled' : '') + '>' + selOpts + '</select>';
            if (emAndamento) {
                html += '<button type="button" class="mc-pause-btn btn btn-outline-secondary btn-sm" id="btn-pausar">' + (pausado ? 'Retomar' : 'Pausar') + '</button>';
            }
            html += '</div></div>';
        } else {
            html += '<div class="mc-timer-panel text-center w-100 border-bottom pb-4 mb-4"><div class="mc-timer-time mc-timer-time--idle fw-bolder text-body-tertiary lh-1" id="timer-placar">--:--</div></div>';
        }

        // Teams
        html += '<div class="mc-teams-row row w-100 align-items-center justify-content-center g-4">';

        partidasLista.forEach(function(p, idx) {
            var gols = Math.max(0, parseInt(p.resultado_partida, 10) || 0);
            var nomeEquipeAtual = nomeEquipe(p);
            var nomeEquipeSeguro = escAttr(nomeEquipeAtual);
            var possuiPontoAtivo = pontosLista.some(function (ponto) {
                return String(ponto.equipes_id_equipe) === String(p.equipes_id_equipe)
                    && String(ponto.status_artilheiro || 'ativo') === 'ativo'
                    && Number(ponto.conta_no_placar == null ? 1 : ponto.conta_no_placar) === 1;
            });
            var btnMinus = readonly || !possuiPontoAtivo
                ? '<button type="button" class="btn btn-outline-secondary btn-score btn-score-minus rounded-4 d-inline-flex align-items-center justify-content-center lh-1 flex-shrink-0" aria-label="Anular último ponto de ' + nomeEquipeSeguro + '" disabled><i class="bi bi-dash-lg" aria-hidden="true"></i></button>'
                : '<button type="button" class="btn btn-outline-secondary btn-score btn-score-minus rounded-4 d-inline-flex align-items-center justify-content-center lh-1 flex-shrink-0" aria-label="Anular último ponto de ' + nomeEquipeSeguro + '" data-idx="' + idx + '"><i class="bi bi-dash-lg" aria-hidden="true"></i></button>';
            var btnPlus = readonly
                ? '<button type="button" class="btn btn-primary btn-score btn-score-plus rounded-4 d-inline-flex align-items-center justify-content-center lh-1 flex-shrink-0" aria-label="Registrar ponto para ' + nomeEquipeSeguro + '" disabled><i class="bi bi-plus-lg" aria-hidden="true"></i></button>'
                : '<button type="button" class="btn btn-primary btn-score btn-score-plus rounded-4 d-inline-flex align-items-center justify-content-center lh-1 flex-shrink-0" aria-label="Registrar ponto para ' + nomeEquipeSeguro + '" data-idx="' + idx + '"><i class="bi bi-plus-lg" aria-hidden="true"></i></button>';

            html += '<div class="col-12 col-md-5 text-center" data-partida-idx="' + idx + '">';
            html += '<h3 class="mc-team-name h5 fw-bold text-body mb-3 text-truncate">' + esc(nomeEquipeAtual) + '</h3>';
            html += '<div class="mc-score-row d-flex flex-nowrap align-items-center justify-content-center gap-3">';
            html += btnMinus;
            html += '<span class="mc-score score-number fw-bolder text-body lh-1 text-center text-nowrap" data-gols="' + idx + '">' + String(gols) + '</span>';
            html += btnPlus;
            html += '</div></div>';

            if (idx === 0 && partidasLista.length === 2) {
                html += '<div class="mc-vs col-12 col-md-auto d-flex align-items-center justify-content-center px-2"><span class="fw-bold text-body-tertiary fs-5">VS</span></div>';
            }
        });

        html += '</div></div>';

        grid.innerHTML = html;

        // Bind events
        document.querySelectorAll('.btn-score-minus').forEach(function(btn) {
            pageScope.listen(btn, 'click', function() {
                if (!tempoEsgotado) anularUltimoPonto(parseInt(btn.getAttribute('data-idx'), 10));
            });
        });
        document.querySelectorAll('.btn-score-plus').forEach(function(btn) {
            pageScope.listen(btn, 'click', function() {
                if (!tempoEsgotado) {
                    var partida = partidasLista[parseInt(btn.getAttribute('data-idx'), 10)];
                    if (partida) abrirModalArtilheiro(partida.equipes_id_equipe);
                }
            });
        });

        var selDuracao = document.getElementById('select-duracao');
        if (selDuracao) {
            pageScope.listen(selDuracao, 'change', function() {
                mudarDuracao(parseInt(selDuracao.value, 10) * 60);
            });
        }

        var btnPause = document.getElementById('btn-pausar');
        if (btnPause) {
            pageScope.listen(btnPause, 'click', function() { togglePause(); });
        }

        if (emAndamento) {
            iniciarTimerDisplay();
        }

        var durStat = document.getElementById('mc-duration-stat');
        if (durStat) durStat.textContent = Math.floor(duracaoJogo / 60) + ' min';
    }

    function ajustarGols(idx, delta) {
        var p = partidasLista[idx];
        var st = estadoJogo.status_jogo;
        if (!p || (st !== 'Iniciado' && st !== 'Pausado') || tempoEsgotado) return;
        if (delta > 0) abrirModalArtilheiro(p.equipes_id_equipe);
        else anularUltimoPonto(idx);
    }

    function ehFutsal() {
        // O cache offline de instalações antigas pode não conter o tipo
        // numérico, embora ainda preserve o nome da modalidade.
        var tipo = parseInt(estadoJogo.tipos_modalidades_id_tipo_modalidade, 10);
        if (tipo === 1) return true;
        return /futsal/i.test(String(estadoJogo.nome_modalidade || ''));
    }

    async function carregarIndDados() {
        var idModalidade = estadoJogo ? estadoJogo.modalidades_id_modalidade : null;
        if (!idModalidade) {
            indParticipantes = [];
            indRankingAtual = [];
            indParticipantesErro = false;
            indRankingErro = false;
            indDadosErro = false;
            return true;
        }
        var participantesOk = true;
        var rankingOk = true;
        try {
            var resPart = await fetch(API + 'chaveamentos?tipo_modalidade=individual&acao=participantes&id_modalidade=' + idModalidade);
            var dadosPart = await resPart.json();
            if (!resPart.ok || dadosPart.success === false) throw new Error('Não foi possível carregar os participantes.');
            indParticipantes = (dadosPart.success && Array.isArray(dadosPart.participantes)) ? dadosPart.participantes : [];
        } catch (e) {
            participantesOk = false;
        }
        try {
            var resRank = await fetch(API + 'chaveamentos?tipo_modalidade=individual&acao=ranking&id_modalidade=' + idModalidade);
            var dadosRank = await resRank.json();
            if (!resRank.ok || dadosRank.success === false) throw new Error('Não foi possível carregar o ranking.');
            indRankingAtual = (dadosRank.success && Array.isArray(dadosRank.ranking))
                ? dadosRank.ranking.map(function(ranking) {
                    return Object.assign({}, ranking, { posicao: Number(ranking.posicao) });
                })
                : [];
        } catch (e) {
            rankingOk = false;
        }
        indParticipantesErro = !participantesOk;
        indRankingErro = !rankingOk;
        indDadosErro = !participantesOk || !rankingOk;
        return participantesOk && rankingOk;
    }

    function atualizarSelectsIndividual() {
        var selects = ['indSelectPrimeiro', 'indSelectSegundo', 'indSelectTerceiro'].map(function(id) {
            return document.getElementById(id);
        }).filter(Boolean);
        var escolhidos = selects.map(function(select) { return select.value; });
        selects.forEach(function(select, index) {
            Array.prototype.forEach.call(select.options, function(option) {
                if (!option.value) {
                    option.disabled = false;
                    return;
                }
                option.disabled = escolhidos.some(function(valor, outroIndex) {
                    return outroIndex !== index && valor !== '' && valor === option.value;
                });
            });
        });
    }

    function renderIndividual() {
        var grid = document.getElementById('placar-grid');
        var acoes = document.getElementById('placar-acoes');
        var statusIndividualAtual = estadoJogo && estadoJogo.status_jogo;
        if (acoes && statusIndividualAtual === 'Agendado') {
            var iniciar = document.createElement('button');
            iniciar.type = 'button';
            iniciar.className = 'mc-action-btn mc-action-btn--start btn btn-primary d-inline-flex align-items-center gap-2';
            iniciar.id = 'btnIniciarProvaIndividual';
            iniciar.innerHTML = '<i class="bi bi-play-fill"></i> Iniciar prova';
            pageScope.listen(iniciar, 'click', function() {
                iniciar.disabled = true;
                iniciarJogoServidor().catch(function(e) {
                    iniciar.disabled = false;
                    SGI.alert(e.message || 'Não foi possível iniciar a prova.');
                });
            });
            acoes.appendChild(iniciar);
        }

        var gruposTurma = {};
        indParticipantes.forEach(function(p) {
            var turma = p.nome_fantasia_turma || p.nome_turma || 'Sem turma';
            if (!gruposTurma[turma]) gruposTurma[turma] = [];
            gruposTurma[turma].push(p);
        });
        var partOpts = '<option value="">Selecione...</option>' + Object.keys(gruposTurma).sort().map(function(turma) {
            return '<optgroup label="' + esc(turma) + '">' +
                gruposTurma[turma].sort(function(a, b) {
                    return (a.nome_usuario || '').localeCompare(b.nome_usuario || '');
                }).map(function(p) {
                    return '<option value="' + p.id_usuario + '">' + esc(p.nome_usuario) + '</option>';
                }).join('') +
                '</optgroup>';
        }).join('');

        var primeiroAtual = indRankingAtual.find(function(r) { return r.posicao === 1; });
        var segundoAtual = indRankingAtual.find(function(r) { return r.posicao === 2; });
        var terceiroAtual = indRankingAtual.find(function(r) { return r.posicao === 3; });

        var podiumHtml = '';
        var rankingOrdenado = indRankingAtual.slice().sort(function(a, b) {
            return Number(a.posicao || 0) - Number(b.posicao || 0);
        });
        if (rankingOrdenado.length > 0) {
            var posLabels = { 1: '1º Lugar', 2: '2º Lugar', 3: '3º Lugar' };
            var posIcons = { 1: '🥇', 2: '🥈', 3: '🥉' };
            var posCard = { 1: 'border-warning bg-warning-subtle', 2: 'border-secondary bg-secondary-subtle', 3: 'border-danger-subtle bg-danger-subtle' };
            podiumHtml = '<div class="row row-cols-1 row-cols-sm-3 g-3 mt-3">';
            rankingOrdenado.forEach(function(r) {
                var posicao = Number(r.posicao);
                podiumHtml += '<div class="col"><article class="card h-100 border-2 ' + (posCard[posicao] || 'border-light bg-body-tertiary') + ' text-center p-3 shadow-sm">' +
                    '<div class="fs-3" aria-hidden="true">' + (posIcons[posicao] || '') + '</div>' +
                    '<div class="fw-bold mt-1">' + (posLabels[posicao] || (posicao + 'º Lugar')) + '</div>' +
                    '<div class="fw-semibold mt-1">' + esc(r.nome_usuario || 'Desconhecido') + '</div>' +
                    '<div class="small text-secondary mt-1">' + esc(r.nome_turma || r.nome_fantasia_turma || '') + '</div>' +
                '</article></div>';
            });
            podiumHtml += '</div>';
        } else {
            podiumHtml = '<div class="text-center py-4 text-muted small" ><i class="bi bi-award d-block mb-2 fs-2 text-body-tertiary" ></i>Nenhum resultado registrado ainda.</div>';
        }

        var statusIndividual = estadoJogo && estadoJogo.status_jogo;
        var individualOperavel = ['Iniciado', 'Pausado', 'Concluido', 'Finalizado'].indexOf(statusIndividual) !== -1;
        var individualBloqueado = indParticipantes.length < 3 || !individualOperavel || indDadosErro;
        var estadoParticipantes = indParticipantesErro
            ? '<div class="small text-danger mb-2" role="alert">Não foi possível atualizar os participantes. Tente recarregar.</div>'
            : (indParticipantes.length === 0
                ? '<div class="small text-muted mb-2">Não há participantes vinculados a esta modalidade.</div>'
                : (indParticipantes.length < 3
                    ? '<div class="small text-warning mb-2">São necessários pelo menos três atletas inscritos para homologar o pódio.</div>'
                    : (!individualOperavel
                        ? '<div class="small text-warning mb-2">Inicie o jogo pela agenda antes de registrar o ranking.</div>'
                        : '')));

        var avisoRanking = indRankingErro
            ? '<div class="small text-warning mb-2" role="status">Não foi possível atualizar o ranking atual. Tente recarregar antes de salvar.</div>'
            : '';
        grid.innerHTML =
            '<div class="w-100">' +
                '<div class="d-flex align-items-center gap-2 fw-bold text-body">' +
                    '<i class="bi bi-trophy-fill text-warning"></i> Registrar Resultado Individual' +
                '</div>' +
                estadoParticipantes +
                '<div class="mc-individual-ranking-row row g-3 mt-1">' +
                    '<div class="col-md-4">' +
                        '<label class="form-label fw-semibold small text-secondary" for="indSelectPrimeiro">🥇 1º Lugar</label>' +
                        '<select class="form-select small" id="indSelectPrimeiro" aria-label="1º lugar"' + (individualBloqueado ? ' disabled' : '') + '>' + partOpts + '</select>' +
                    '</div>' +
                    '<div class="col-md-4">' +
                        '<label class="form-label fw-semibold small text-secondary" for="indSelectSegundo">🥈 2º Lugar</label>' +
                        '<select class="form-select small" id="indSelectSegundo" aria-label="2º lugar"' + (individualBloqueado ? ' disabled' : '') + '>' + partOpts + '</select>' +
                    '</div>' +
                    '<div class="col-md-4">' +
                        '<label class="form-label fw-semibold small text-secondary" for="indSelectTerceiro">🥉 3º Lugar</label>' +
                        '<select class="form-select small" id="indSelectTerceiro" aria-label="3º lugar"' + (individualBloqueado ? ' disabled' : '') + '>' + partOpts + '</select>' +
                    '</div>' +
                '</div>' +
                '<div class="d-flex align-items-center gap-3 mt-3">' +
                    '<button type="button" class="mc-action-btn mc-action-btn--start btn btn-primary d-inline-flex align-items-center gap-2" id="btnSalvarIndRanking"' + (individualBloqueado ? ' disabled' : '') + '><i class="bi bi-check-lg"></i> Salvar Ranking</button>' +
                    '<span id="msgIndRanking" class="small" role="status" aria-live="polite"></span>' +
                '</div>' +
                '<div class="mt-4">' +
                    '<div class="fw-bold small text-body"><i class="bi bi-award-fill me-1"></i>Ranking Atual</div>' +
                    avisoRanking +
                    podiumHtml +
                '</div>' +
            '</div>';

        if (primeiroAtual) document.getElementById('indSelectPrimeiro').value = primeiroAtual.id_usuario;
        if (segundoAtual) document.getElementById('indSelectSegundo').value = segundoAtual.id_usuario;
        if (terceiroAtual) document.getElementById('indSelectTerceiro').value = terceiroAtual.id_usuario;
        atualizarSelectsIndividual();
        ['indSelectPrimeiro', 'indSelectSegundo', 'indSelectTerceiro'].forEach(function(id) {
            pageScope.listen(document.getElementById(id), 'change', atualizarSelectsIndividual);
        });

        pageScope.listen(document.getElementById('btnSalvarIndRanking'), 'click', function() {
            salvarIndRanking();
        });
    }

    async function salvarIndRanking() {
        if (!estadoJogo || ['Iniciado', 'Pausado', 'Concluido', 'Finalizado'].indexOf(estadoJogo.status_jogo) === -1) {
            var bloqueio = document.getElementById('msgIndRanking');
            if (bloqueio) bloqueio.innerHTML = '<span class="text-warning fw-bold">Inicie o jogo antes de registrar o ranking.</span>';
            return;
        }
        var primeiro = parseInt(document.getElementById('indSelectPrimeiro').value, 10);
        var segundo = parseInt(document.getElementById('indSelectSegundo').value, 10);
        var terceiro = parseInt(document.getElementById('indSelectTerceiro').value, 10);
        var msg = document.getElementById('msgIndRanking');
        var btn = document.getElementById('btnSalvarIndRanking');

        if (!primeiro || !segundo || !terceiro) {
            msg.innerHTML = '<span class="text-danger fw-bold">Selecione 1º, 2º e 3º lugar.</span>';
            return;
        }
        if (primeiro === segundo || primeiro === terceiro || segundo === terceiro) {
            msg.innerHTML = '<span class="text-danger fw-bold">Os participantes devem ser diferentes.</span>';
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Salvando...';
        msg.innerHTML = '';
        var cicloSalvar = __sgiPlacarCiclo;

        try {
            var resp = await fetch(API + 'chaveamentos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tipo_modalidade: 'individual',
                    id_modalidade: parseInt(estadoJogo.modalidades_id_modalidade, 10),
                    id_jogo: parseInt(estadoJogo.id_jogo, 10),
                    ranking: { primeiro: primeiro, segundo: segundo, terceiro: terceiro }
                })
            });
            var data = await resp.json();
            if (!resp.ok || !data.success) throw new Error(data.message || 'Erro ao salvar.');
            var pendente = Boolean(data.offline || data.queued);
            if (!pendente) {
                var idConfirmado = Number(data.id_jogo || (data.detalhes && data.detalhes.id_jogo) || 0);
                if (idConfirmado !== Number(estadoJogo.id_jogo)) {
                    throw new Error('O servidor não confirmou o mesmo jogo da prova.');
                }
            }
            estadoJogo.status_jogo = 'Concluido';
            if (!placarContinuaAtivo(cicloSalvar)) return;
            var cacheAtualizado = true;
            if (window.SGIDataLayer && window.SGIDataLayer.upsert) {
                try {
                    await window.SGIDataLayer.upsert('jogos', estadoJogo.id_jogo, Object.assign({}, estadoJogo, { _pendente: pendente }));
                } catch (_) {
                    cacheAtualizado = false;
                }
            }
            if (!placarContinuaAtivo(cicloSalvar)) return;
            var leituraAtualizada = await carregarIndDados();
            if (!placarContinuaAtivo(cicloSalvar)) return;
            renderTudo();
            var mensagem = document.getElementById('msgIndRanking');
            if (mensagem) mensagem.innerHTML = pendente
                ? '<span class="text-warning fw-bold">Ranking salvo neste dispositivo; aguardando sincronização.</span>'
                : (!cacheAtualizado || !leituraAtualizada
                    ? '<span class="text-warning fw-bold">Resultado salvo; não foi possível atualizar a visualização. Tente recarregar.</span>'
                    : '<span class="text-success fw-bold">Ranking salvo com sucesso!</span>');
        } catch (e) {
            msg.innerHTML = '<span class="text-danger fw-bold">' + esc(e.message) + '</span>';
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-check-lg"></i> Salvar Ranking';
        }
    }

    async function carregarDados(ciclo) {
        if (ciclo == null) ciclo = ++__sgiPlacarCiclo;
        pararTimer();
        idJogo = obterIdJogoAtual();
        var err = document.getElementById('placar-erro');
        var load = document.getElementById('placar-loading');
        var cont = document.getElementById('placar-conteudo');
        if (!err || !load || !cont || !placarContinuaAtivo(ciclo)) return;
        err.classList.add('d-none');
        load.classList.remove('d-none');
        cont.classList.add('d-none');

        if (!idJogo) {
            load.classList.add('d-none');
            err.textContent = 'Informe o jogo na URL (?id_jogo=…).';
            err.classList.remove('d-none');
            return;
        }

        /* ID temporário: partidas geradas OFFLINE pelo motor de chaveamento
           recebem id negativo provisório. Elas EXISTEM no banco JS temporário
           e podem ser jogadas normalmente — carregamos direto das tabelas
           locais. Só não há dados auxiliares (ocorrências/artilheiro). */
        if (idJogo < 0) {
            var carregou = await carregarJogoLocalTemporario(ciclo);
            if (!placarContinuaAtivo(ciclo)) return;
            if (!carregou) {
                load.classList.add('d-none');
                err.textContent = 'Esta partida foi gerada offline, mas ainda não está disponível neste dispositivo. Sincronize para receber o jogo definitivo.';
                err.classList.remove('d-none');
            }
            return;
        }

        try {
            var lista = await fetchJson(API + 'jogos?id_jogo=' + idJogo);
            if (!placarContinuaAtivo(ciclo)) return;
            if (!Array.isArray(lista) || lista.length === 0) throw new Error('Jogo não encontrado.');
            estadoJogo = lista[0];
            normalizarJogoRecebido(estadoJogo);
            if (!estadoJogo.nome_modalidade) estadoJogo.nome_modalidade = '';
            tipoCompeticaoAtual = resolverTipoCompeticao(estadoJogo);
            if (!tipoCompeticaoAtual) throw new Error('O tipo da modalidade não está configurado.');
            ehIndividual = tipoCompeticaoAtual === 'individual';
            if (estadoJogo.status_jogo === 'Concluido' || estadoJogo.status_jogo === 'Finalizado') {
                tempoEsgotado = true;
            }

            if (ehIndividual) {
                partidasLista = [];
                pontosLista = [];
                await carregarIndDados();
                if (!placarContinuaAtivo(ciclo)) return;
                precarregarDadosOffline();
                load.classList.add('d-none');
                cont.classList.remove('d-none');
                renderTudo();
                iniciarOcorrencias(ciclo);
                acompanharSincronizacaoPlacar();
                return;
            }

            partidasLista = await fetchJson(API + 'partidas?id_jogo=' + idJogo);
            if (!placarContinuaAtivo(ciclo)) return;
            if (!Array.isArray(partidasLista)) partidasLista = [];
            try {
                var pontosResposta = await fetchJson(API + 'pontos?id_jogo=' + idJogo);
                pontosLista = pontosResposta && Array.isArray(pontosResposta.pontos) ? pontosResposta.pontos : [];
            } catch (_) {
                pontosLista = [];
            }
            ehIndividual = jogoEhIndividual(estadoJogo);
            await enriquecerPartidasComTurmas();
            if (!placarContinuaAtivo(ciclo)) return;
            precarregarDadosOffline();

            // Restaurar duração do jogo do servidor
            if (estadoJogo.duracao_jogo) {
                var d = parseInt(estadoJogo.duracao_jogo, 10);
                if (!isNaN(d) && d > 0) duracaoJogo = d;
            }

            var tempoRestanteInformado = false;
            if (estadoJogo.tempo_restante_calculado != null) {
                var v = parseInt(estadoJogo.tempo_restante_calculado, 10);
                if (!isNaN(v) && v > 0) {
                    tempoRestante = v;
                    tempoRestanteInformado = true;
                } else if (v <= 0 && (estadoJogo.status_jogo === 'Iniciado' || estadoJogo.status_jogo === 'Pausado')) {
                    tempoRestante = 0;
                    tempoEsgotado = true;
                    tempoRestanteInformado = true;
                }
            } else if (estadoJogo.tempo_restante_jogo != null) {
                var v2 = parseInt(estadoJogo.tempo_restante_jogo, 10);
                if (!isNaN(v2) && v2 > 0) {
                    tempoRestante = v2;
                    tempoRestanteInformado = true;
                }
            }
            // Um jogo iniciado offline pela agenda pode ter sido projetado no
            // IndexedDB apenas com o novo status (bases antigas do cache). Sem
            // um tempo informado pelo servidor, ele ainda deve começar com a
            // duração padrão, e não aparecer imediatamente como esgotado.
            if (!tempoRestanteInformado &&
                (estadoJogo.status_jogo === 'Iniciado' || estadoJogo.status_jogo === 'Pausado') &&
                !estadoJogo.data_inicio_real) {
                tempoRestante = duracaoJogo;
                tempoEsgotado = false;
            }

            load.classList.add('d-none');
            cont.classList.remove('d-none');
            renderTudo();

            if (!ehIndividual) {
                iniciarArtilheiro(ciclo);
            }
            iniciarOcorrencias(ciclo);
            acompanharSincronizacaoPlacar();
        } catch (e) {
            if (!placarContinuaAtivo(ciclo)) return;
            var okLocal = await carregarJogoLocalTemporario(ciclo);
            if (!placarContinuaAtivo(ciclo)) return;
            if (!okLocal) {
                load.classList.add('d-none');
                err.textContent = e.message || 'Erro ao carregar.';
                err.classList.remove('d-none');
            }
        }
    }

    function iniciarOcorrencias(ciclo) {
        var section = document.getElementById('ocorrencias-section');
        if (!section || !section.isConnected) return;
        section.classList.remove('d-none');
        carregarOcorrencias(ciclo);
        carregarTurmasOcorrencia();
    }

    // Pré-carrega os dados que o mesário precisa OFFLINE: lista de atletas por
    // turma (usada no modal "quem fez o ponto" e no de ocorrências), artilharia
    // e ocorrências do dia. Enquanto online, cada GET é guardado no IndexedDB
    // pelo offline-core.js, ficando disponível quando a conexão cair.
    function precarregarDadosOffline() {
        if (!navigator.onLine) return;
        var urls = [];
        var vistas = {};
        partidasLista.forEach(function (p) {
            var idTurma = parseInt(p.id_turma, 10);
            var idEquipe = parseInt(p.equipes_id_equipe, 10);
            if (idTurma && !vistas[idTurma]) {
                vistas[idTurma] = true;
                urls.push(API + 'ocorrencias?acao=listar_atletas&id_jogo=' + idJogo + '&id_turma=' + idTurma);
            }
            if (idEquipe) urls.push(API + 'pontos?acao=atletas&id_jogo=' + idJogo + '&id_equipe=' + idEquipe);
        });
        urls.push(API + 'artilheiros?id_jogo=' + idJogo);
        urls.push(API + 'pontos?id_jogo=' + idJogo);
        urls.push(API + 'ocorrencias?id_jogo=' + idJogo + '&data=' + (estadoJogo.data_jogo || ''));
        urls.forEach(function (u) {
            fetch(u).then(function (r) { return r.text(); }).catch(function () { /* offline pre-cache é best-effort */ });
        });
    }

    function carregarTurmasOcorrencia() {
        var select = document.getElementById('filtroTurmaOcorrencia');
        if (!select || !select.isConnected) return;
        select.innerHTML = '<option value="">Selecione a turma</option>';
        var vistas = {};
        partidasLista.forEach(function(p) {
            var idTurma = parseInt(p.id_turma, 10);
            if (!idTurma) return;
            var nome = esc(nomeEquipe(p));
            if (!vistas[idTurma]) {
                vistas[idTurma] = true;
                select.innerHTML += '<option value="' + idTurma + '">' + nome + '</option>';
            }
        });
    }

    async function carregarAlunosOcorrencia(ciclo) {
        var cicloLocal = ciclo == null ? __sgiPlacarCiclo : ciclo;
        var select = document.getElementById('selectAlunoOcorrencia');
        if (!select || !select.isConnected || !placarContinuaAtivo(cicloLocal)) return;
        var idTurma = document.getElementById('filtroTurmaOcorrencia').value;
        if (!idTurma) {
            select.value = '';
            select.disabled = true;
            select.innerHTML = '<option value="">Selecione uma turma primeiro</option>';
            return;
        }
        select.disabled = true;
        select.innerHTML = '<option value="">Carregando...</option>';
        try {
            var data = await fetchJson(API + 'ocorrencias?acao=listar_atletas&id_jogo=' + idJogo + '&id_turma=' + idTurma);
            if (!placarContinuaAtivo(cicloLocal) || !select.isConnected || document.getElementById('selectAlunoOcorrencia') !== select) return;
            var alunos = data.success && Array.isArray(data.atletas) ? data.atletas : [];
            select.innerHTML = '<option value="">Selecione o(a) aluno(a)</option>';
            alunos.forEach(function(a) {
                select.innerHTML += '<option value="' + a.id_usuario + '">' + esc(a.nome_usuario) + '</option>';
            });
            select.disabled = false;
        } catch (e) {
            if (placarContinuaAtivo(cicloLocal) && select && select.isConnected) {
                select.innerHTML = '<option value="">Erro ao carregar alunos</option>';
                select.disabled = false;
            }
        }
    }

    function limparDescricaoOcorrencia(desc) {
        return (desc || '').replace(/\[JOGO:\d+\]/g, '').replace(/\[TURMA:\d+\]/g, '').trim();
    }

    async function carregarOcorrencias(ciclo) {
        var cicloLocal = ciclo == null ? __sgiPlacarCiclo : ciclo;
        var container = document.getElementById('lista-ocorrencias');
        if (!container || !container.isConnected || !placarContinuaAtivo(cicloLocal)) return;
        try {
            var data = await fetchJson(API + 'ocorrencias?id_jogo=' + idJogo + '&data=' + (estadoJogo.data_jogo || ''));
            if (!placarContinuaAtivo(cicloLocal) || !container.isConnected || document.getElementById('lista-ocorrencias') !== container) return;
            var lista = Array.isArray(data) ? data : [];
            var countEl = document.getElementById('mc-occ-count');
            if (countEl) countEl.textContent = lista.length;
            if (!lista.length) {
                container.innerHTML = '<div class="text-center py-5 text-body-secondary"><i class="bi bi-clock-history fs-2 d-block mb-2 text-body-tertiary"></i><p class="mb-0">Nenhuma ocorrência registrada.</p></div>';
                return;
            }
            container.innerHTML = lista.map(function(o, i) {
                var tipo = (o.titulo_ocorrencia || '').toLowerCase();
                var isAmarelo = tipo === 'amarelo';
                var isVermelho = tipo.indexOf('vermelho') !== -1;
                var isSuspensao = tipo.indexOf('suspensao') !== -1 || tipo.indexOf('suspensão') !== -1;

                var cls = isAmarelo ? 'amarelo' : (isVermelho ? 'vermelho' : 'suspensao');
                var icon = isAmarelo ? 'bi-square-fill' : (isVermelho ? 'bi-x-octagon-fill' : 'bi-pause-circle-fill');
                var label = isAmarelo ? 'Cartão Amarelo' : (isVermelho ? 'Cartão Vermelho' : 'Suspensão');
                var iconTone = isAmarelo ? 'bg-warning text-dark' : (isVermelho ? 'bg-danger text-white' : 'bg-primary-subtle text-primary-emphasis');
                var dotTone = isAmarelo ? 'bg-warning' : (isVermelho ? 'bg-danger' : 'bg-primary');

                var pts = parseInt(o.penalidade, 10);
                var ptsHtml = pts > 0 ? '<span class="badge text-bg-danger">-' + pts + ' pts</span>' : '';
                var isLast = i === lista.length - 1;

                var acoesHtml = '';
                if (!jogoEncerrado()) {
                    acoesHtml = '<div class="tl-event-actions d-flex gap-1 mt-2">' +
                        '<button type="button" class="btn btn-sm btn-light border text-primary px-2 py-1" data-sgi-action="edit-occurrence" data-id-ocorrencia="' + esc(o.id_ocorrencia) + '" title="Editar" aria-label="Editar ocorrência"><i class="bi bi-pencil-square" aria-hidden="true"></i></button>' +
                        '<button type="button" class="btn btn-sm btn-light border text-danger px-2 py-1" data-sgi-action="delete-occurrence" data-id-ocorrencia="' + esc(o.id_ocorrencia) + '" title="Excluir" aria-label="Excluir ocorrência"><i class="bi bi-trash3" aria-hidden="true"></i></button>' +
                        '</div>';
                }

                return '<div class="tl-event tl-event--' + cls + ' d-flex gap-3 pb-4 position-relative' + (isLast ? ' tl-event--last pb-0' : '') + '">' +
                    '<div class="tl-event-track d-flex flex-column align-items-center flex-shrink-0">' +
                        '<div class="tl-event-dot rounded-circle flex-shrink-0 ' + dotTone + '"></div>' +
                        '<div class="tl-event-line bg-secondary-subtle' + (isLast ? ' d-none' : '') + '"></div>' +
                    '</div>' +
                    '<div class="card flex-grow-1 overflow-hidden">' +
                        '<div class="card-body p-3">' +
                        '<div class="tl-event-top d-flex align-items-center gap-2 mb-2 flex-wrap">' +
                            '<span class="tl-event-icon rounded-2 d-inline-flex align-items-center justify-content-center p-2 fs-6 flex-shrink-0 ' + iconTone + '"><i class="bi ' + icon + '"></i></span>' +
                            '<span class="tl-event-label fw-bold text-body small">' + label + '</span>' +
                            ptsHtml +
                        '</div>' +
                        '<div class="tl-event-player fw-semibold text-body-secondary small mb-1">' + esc(o.nome_usuario) + '</div>' +
                        '<div class="tl-event-desc small text-body-secondary lh-sm">' + esc(limparDescricaoOcorrencia(o.descricao_ocorrencia)) + '</div>' +
                        acoesHtml +
                        '</div>' +
                    '</div>' +
                '</div>';
            }).join('');
        } catch (e) {
            if (placarContinuaAtivo(cicloLocal) && container && container.isConnected) {
                container.innerHTML = '<div class="alert alert-danger mb-0" role="alert"><i class="bi bi-exclamation-circle me-2"></i>Erro ao carregar ocorrências.</div>';
            }
        }
    }

    var _editandoOcorrenciaId = null;
    var _ocorrenciaModalHideTimer = null;

    function cancelarFechamentoOcorrenciaPendente() {
        if (_ocorrenciaModalHideTimer !== null) {
            clearTimeout(_ocorrenciaModalHideTimer);
            _ocorrenciaModalHideTimer = null;
        }
    }

    function abrirModalOcorrencia() {
        if (jogoEncerrado()) {
            SGI.alert('O jogo já foi encerrado. Não é possível registrar ocorrências.');
            return;
        }
        cancelarFechamentoOcorrenciaPendente();
        _editandoOcorrenciaId = null;
        document.getElementById('formOcorrencia').reset();
        document.getElementById('msgOcorrencia').innerHTML = '';
        document.querySelectorAll('.ocorrencia-tipo-option').forEach(function(el) {
            el.classList.remove('active');
        });
        var selAluno = document.getElementById('selectAlunoOcorrencia');
        selAluno.disabled = true;
        selAluno.innerHTML = '<option value="">Selecione uma turma primeiro</option>';
        document.getElementById('btnSalvarOcorrencia').disabled = false;
        document.getElementById('btnSalvarOcorrencia').innerHTML = '<i class="bi bi-check-lg me-1"></i>Registrar';
        var modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('modalOcorrencia'));
        modal.show();
    }

    async function editarOcorrencia(id) {
        if (jogoEncerrado()) {
            SGI.alert('O jogo já foi encerrado. Não é possível editar ocorrências.');
            return;
        }
        cancelarFechamentoOcorrenciaPendente();
        var idSolicitado = String(id);
        _editandoOcorrenciaId = idSolicitado;
        document.getElementById('formOcorrencia').reset();
        document.getElementById('msgOcorrencia').innerHTML = '';
        document.querySelectorAll('.ocorrencia-tipo-option').forEach(function(el) {
            el.classList.remove('active');
        });
        var selAluno = document.getElementById('selectAlunoOcorrencia');
        selAluno.disabled = true;
        selAluno.innerHTML = '<option value="">Carregando...</option>';
        document.getElementById('btnSalvarOcorrencia').disabled = false;
        document.getElementById('btnSalvarOcorrencia').innerHTML = '<i class="bi bi-check-lg me-1"></i>Atualizar';

        try {
            var lista = await fetchJson(API + 'ocorrencias?id_ocorrencia=' + encodeURIComponent(idSolicitado));
            var o = Array.isArray(lista) ? lista.find(function (item) {
                return item && String(item.id_ocorrencia) === idSolicitado;
            }) : null;
            if (!o) throw new Error('Ocorrência não disponível neste dispositivo.');
            document.querySelectorAll('.ocorrencia-tipo-option').forEach(function(el) {
                if (el.getAttribute('data-tipo') === o.titulo_ocorrencia) {
                    el.classList.add('active');
                    var radio = el.htmlFor ? document.getElementById(el.htmlFor) : el.querySelector('input[type="radio"]');
                    if (radio) radio.checked = true;
                }
            });
            document.getElementById('descricaoOcorrencia').value = limparDescricaoOcorrencia(o.descricao_ocorrencia);
            document.getElementById('penalidadeOcorrencia').value = o.penalidade || 0;
            var idTurma = o.turmas_id_turma || 0;
            if (idTurma) {
                document.getElementById('filtroTurmaOcorrencia').value = idTurma;
                try {
                    await carregarAlunosOcorrencia();
                } catch (e) {}
                var sel = document.getElementById('selectAlunoOcorrencia');
                sel.value = o.id_usuario;
                if (sel.value !== String(o.id_usuario)) {
                    var opt = document.createElement('option');
                    opt.value = o.id_usuario;
                    opt.textContent = esc(o.nome_usuario);
                    sel.appendChild(opt);
                    sel.value = o.id_usuario;
                }
            }
            var modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('modalOcorrencia'));
            modal.show();
        } catch (e) {
            _editandoOcorrenciaId = null;
            document.getElementById('btnSalvarOcorrencia').innerHTML = '<i class="bi bi-check-lg me-1"></i>Registrar';
            SGI.alert(e && e.message ? e.message : 'Ocorrência não disponível neste dispositivo.');
        }
    }

    async function excluirOcorrencia(id) {
        if (jogoEncerrado()) {
            SGI.alert('O jogo já foi encerrado. Não é possível excluir ocorrências.');
            return;
        }
        if (!await SGI.confirm({ titulo: 'Excluir ocorrência?', mensagem: 'Esta ação não pode ser desfeita.', textoConfirmar: 'Excluir ocorrência', destrutivo: true })) return;
        try {
            await fetchJson(API + 'ocorrencias', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_ocorrencia: id, status_ocorrencia: '0' })
            });
            carregarOcorrencias();
        } catch (e) {
            SGI.alert('Erro ao excluir ocorrência.');
        }
    }

    async function salvarOcorrencia(e) {
        e.preventDefault();
        if (jogoEncerrado()) {
            SGI.alert('O jogo já foi encerrado. Não é possível salvar ocorrências.');
            return;
        }
        var btn = document.getElementById('btnSalvarOcorrencia');
        var msg = document.getElementById('msgOcorrencia');
        msg.innerHTML = '';

        var editando = _editandoOcorrenciaId;

        var tipoEl = document.querySelector('input[name="tipo_ocorrencia"]:checked');
        if (!tipoEl) {
            msg.innerHTML = '<span class="text-danger">Selecione o tipo de ocorrência.</span>';
            return;
        }
        var tipo = tipoEl.value;

        var idTurma = document.getElementById('filtroTurmaOcorrencia').value;
        if (!idTurma) {
            msg.innerHTML = '<span class="text-danger">Selecione a turma.</span>';
            return;
        }

        var idAluno = document.getElementById('selectAlunoOcorrencia').value;
        if (!idAluno) {
            msg.innerHTML = '<span class="text-danger">Selecione o(a) aluno(a).</span>';
            return;
        }
        var descricao = document.getElementById('descricaoOcorrencia').value.trim();
        if (!descricao) {
            msg.innerHTML = '<span class="text-danger">Informe a descrição.</span>';
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Salvando...';

        var isUpdate = !!editando;
        var payload = {
            titulo_ocorrencia: tipo,
            descricao_ocorrencia: descricao,
            data_ocorrencia: estadoJogo.data_jogo || new Date().toISOString().slice(0, 10),
            usuarios_id_usuario: parseInt(idAluno, 10),
            penalidade: parseInt(document.getElementById('penalidadeOcorrencia').value, 10)
        };

        if (isUpdate) {
            payload.id_ocorrencia = editando;
        } else {
            payload.id_jogo = idJogo;
            payload.id_turma = parseInt(idTurma, 10);
            // Necessário para que uma ocorrência de jogo criado localmente
            // seja vinculada ao confronto definitivo durante a sincronização.
            payload.nome_jogo = (estadoJogo && estadoJogo.nome_jogo) || null;
            payload.id_modalidade = (estadoJogo && (estadoJogo.modalidades_id_modalidade || estadoJogo.id_modalidade)) || null;
        }

        try {
            var resp = await fetch(API + 'ocorrencias', {
                method: isUpdate ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            var result = await resp.json();
            if (result.success) {
                var ocorrenciaPendente = result.offline === true;
                var textoOcorrencia = 'Ocorrência ' + (isUpdate ? 'atualizada' : 'registrada') +
                    (ocorrenciaPendente ? ', salva neste dispositivo e aguardando envio ao servidor.' : ', confirmada pelo servidor.');
                msg.innerHTML = '<span class="text-success">' + esc(textoOcorrencia) + '</span>';
                anunciarStatusPlacar(textoOcorrencia);
                if (!isUpdate && result.evento === 'segundo_amarelo') {
                    var selAluno = document.getElementById('selectAlunoOcorrencia');
                    var nomeAluno = selAluno.options[selAluno.selectedIndex] ? selAluno.options[selAluno.selectedIndex].text : '';
                    carregarAlunosOcorrencia();
                    mostrarAlertaSegundoAmarelo(nomeAluno);
                } else if (!isUpdate && (tipo === 'Vermelho' || tipo === 'Suspensao')) {
                    carregarAlunosOcorrencia();
                }
                cancelarFechamentoOcorrenciaPendente();
                _ocorrenciaModalHideTimer = setTimeout(function() {
                    var m = bootstrap.Modal.getInstance(document.getElementById('modalOcorrencia'));
                    if (m) m.hide();
                    _editandoOcorrenciaId = null;
                    _ocorrenciaModalHideTimer = null;
                    carregarOcorrencias();
                }, 600);
            } else {
                msg.innerHTML = '<span class="text-danger">' + esc(result.message || 'Erro ao salvar.') + '</span>';
                btn.disabled = false;
                btn.innerHTML = isUpdate ? '<i class="bi bi-check-lg me-1"></i>Atualizar' : '<i class="bi bi-check-lg me-1"></i>Registrar';
            }
        } catch (err) {
            msg.innerHTML = '<span class="text-danger">Erro de conexão.</span>';
            anunciarStatusPlacar('Não foi possível salvar a ocorrência. A alteração continua disponível para revisão.');
            btn.disabled = false;
            btn.innerHTML = isUpdate ? '<i class="bi bi-check-lg me-1"></i>Atualizar' : '<i class="bi bi-check-lg me-1"></i>Registrar';
        }
    }

    function iniciarArtilheiro(ciclo) {
        var section = document.getElementById('artilheiro-section');
        if (!section || !section.isConnected) return;
        section.classList.remove('d-none');
        carregarEquipesArtilheiro();
        carregarArtilheiros(ciclo);
    }

    function filaDaPartida(items) {
        return (items || []).filter(function (item) {
            var url;
            try { url = new URL(item.url, window.location.href); }
            catch (_) { return false; }
            var path = url.pathname.replace(/\/+$/, '').toLowerCase();
            if (!/\/api\/v1\/(resultados|pontos|ocorrencias)$/.test(path)) return false;
            var payload;
            try { payload = JSON.parse(item.body || '{}'); }
            catch (_) { return false; }
            var id = path.endsWith('/pontos') ? payload.jogos_id_jogo : payload.id_jogo;
            return id != null && String(id) === String(idJogo);
        });
    }

    function atualizarStatusResultadoPendente(snapshot, fila) {
        fila = Array.isArray(fila) ? fila : [];
        var resultado = fila.filter(function (item) {
            var url;
            try { url = new URL(item.url, window.location.href); }
            catch (_) { return false; }
            return /\/api\/v1\/resultados\/?$/i.test(url.pathname);
        })[0];
        if (!resultado) {
            definirStatusSincronizacao('');
            return;
        }
        if (resultado.needsReview) {
            definirStatusSincronizacao('Resultado aguarda revisão antes do envio.');
        } else if (snapshot && snapshot.session === 'expirada') {
            definirStatusSincronizacao('Resultado salvo neste dispositivo; a sessão expirou antes do envio.');
        } else {
            definirStatusSincronizacao('Resultado salvo neste dispositivo; aguardando envio ao servidor.');
        }
    }

    function atualizarStatusPlacarDaFila() {
        if (!window.SGIOffline || typeof window.SGIOffline.getPendingList !== 'function') return;
        var ciclo = __sgiPlacarCiclo;
        window.SGIOffline.getPendingList().then(function (items) {
            if (placarContinuaAtivo(ciclo)) {
                atualizarStatusResultadoPendente(window.SGIOffline.getState(), filaDaPartida(items));
            }
        }).catch(function () {});
    }

    // A fila de transporte é a mutation_queue do offline-core. O estado do
    // jogo continua no badge acima e só um POST resultados deste jogo aparece
    // como resultado pendente; mutações de outras partidas não o contaminam.
    function acompanharSincronizacaoPlacar() {
        if (!window.SGIOffline || typeof window.SGIOffline.onStateChange !== 'function' ||
            typeof window.SGIOffline.getPendingList !== 'function') return;
        if (window.__SGI_PLACAR_SYNC_UNSUB__) {
            try { window.__SGI_PLACAR_SYNC_UNSUB__(); } catch (_) {}
        }
        var ciclo = __sgiPlacarCiclo;
        var mutacoesAnteriores = null;
        var resultadosAnteriores = null;
        function atualizar(snapshot) {
            var consulta = ++__sgiSyncStatusGeneration;
            window.SGIOffline.getPendingList().then(function (items) {
                if (consulta !== __sgiSyncStatusGeneration || !placarContinuaAtivo(ciclo)) return;
                var fila = filaDaPartida(items);
                var ids = fila.map(function (item) { return String(item.id); }).sort();
                atualizarStatusResultadoPendente(snapshot || window.SGIOffline.getState(), fila);
                var resultadoIds = fila.filter(function (item) {
                    var url;
                    try { url = new URL(item.url, window.location.href); }
                    catch (_) { return false; }
                    return /\/api\/v1\/resultados\/?$/i.test(url.pathname);
                }).map(function (item) { return String(item.id); }).sort();
                if (resultadosAnteriores && resultadosAnteriores.length > 0 && resultadoIds.length === 0 && snapshot && snapshot.online) {
                    anunciarStatusPlacar('Resultado confirmado pelo servidor.');
                }
                resultadosAnteriores = resultadoIds;
                if (mutacoesAnteriores && mutacoesAnteriores.length > 0 && ids.length === 0 && snapshot && snapshot.online) {
                    carregarArtilheiros();
                    carregarOcorrencias();
                }
                mutacoesAnteriores = ids;
            }).catch(function () {});
        }
        window.__SGI_PLACAR_SYNC_UNSUB__ = window.SGIOffline.onStateChange(atualizar);
        atualizar(window.SGIOffline.getState());
    }

    async function carregarArtilheiros(ciclo) {
        var cicloLocal = ciclo == null ? __sgiPlacarCiclo : ciclo;
        var cards = document.getElementById('artilheiro-cards');
        if (!cards || !cards.isConnected || !placarContinuaAtivo(cicloLocal)) return;
        try {
            var data = await fetchJson(API + 'artilheiros?id_jogo=' + idJogo);
            if (!placarContinuaAtivo(cicloLocal) || !cards.isConnected || document.getElementById('artilheiro-cards') !== cards) return;
            if (!Array.isArray(data) || data.length === 0) {
                cards.innerHTML = '<div class="col-12 text-center py-4 text-body-secondary"><i class="bi bi-trophy fs-2 d-block mb-2 text-body-tertiary"></i><p class="mb-0">Nenhuma ação registrada ainda.</p></div>';
                return;
            }
            var html = '';
            data.forEach(function(a) {
                var nome = esc(a.nome_usuario || 'Desconhecido');
                var turma = esc(a.nome_fantasia_turma || a.nome_turma || '');
                var gols = parseInt(a.total_gols, 10) || 0;
                var acoes = parseInt(a.total_acoes, 10) || 0;
                var anulados = parseInt(a.total_anulados, 10) || 0;
                var icon = gols >= 3 ? 'bi-star-fill text-warning' : gols >= 2 ? 'bi-fire text-danger' : gols > 0 ? 'bi-circle-fill text-success' : 'bi-dash-circle text-secondary';
                var resumo = acoes + ' ação' + (acoes !== 1 ? 'ões' : '');
                if (anulados > 0) resumo += ' · ' + anulados + ' anulada' + (anulados !== 1 ? 's' : '');
                html += '<div class="col"><article class="card h-100 border-0 shadow-sm p-3">' +
                    '<div class="d-flex align-items-center gap-3">' +
                    '<span class="fs-4 flex-shrink-0"><i class="bi ' + icon + '"></i></span>' +
                    '<div class="flex-grow-1 overflow-hidden">' +
                    '<div class="fw-bold text-truncate">' + nome + '</div>' +
                    '<div class="small text-body-secondary text-truncate">' + turma + ' · ' + esc(resumo) + '</div>' +
                    '</div>' +
                    '<span class="badge rounded-pill text-bg-light border text-body-secondary text-nowrap">' + gols + ' gol' + (gols > 1 ? 's' : '') + '</span>' +
                    '</div></article></div>';
            });
            cards.innerHTML = html;
        } catch (e) {
            if (placarContinuaAtivo(cicloLocal) && cards && cards.isConnected) {
                cards.innerHTML = '<div class="col-12"><div class="alert alert-danger mb-0" role="alert"><i class="bi bi-exclamation-circle me-2"></i>Erro ao carregar artilharia.</div></div>';
            }
        }
    }

    async function carregarEquipesArtilheiro() {
        var select = document.getElementById('selectEquipeArtilheiro');
        if (!select || !select.isConnected) return;
        select.innerHTML = '<option value="">Selecione a equipe</option>';
        partidasLista.forEach(function(p) {
            select.innerHTML += '<option value="' + p.equipes_id_equipe + '">' + esc(nomeEquipe(p)) + '</option>';
        });
    }

    async function carregarAlunosArtilheiro(ciclo) {
        var cicloLocal = ciclo == null ? __sgiPlacarCiclo : ciclo;
        var select = document.getElementById('selectAlunoArtilheiro');
        if (!select || !select.isConnected || !placarContinuaAtivo(cicloLocal)) return;
        var idEquipe = document.getElementById('selectEquipeArtilheiro').value;
        if (!idEquipe) {
            select.innerHTML = '<option value="">Selecione uma equipe primeiro</option>';
            return;
        }
        select.innerHTML = '<option value="">Carregando...</option>';
        try {
            var p = partidasLista.find(function(p) { return p.equipes_id_equipe == idEquipe; });
            if (!p) throw new Error('Equipe não encontrada');
            var data;
            if (Number(idJogo) < 0 && window.SGIDataLayer && typeof window.SGIDataLayer.read === 'function') {
                var locais = await window.SGIDataLayer.read('atletas');
                data = {
                    success: true,
                    atletas: (locais || []).filter(function (a) {
                        return String(a.equipes_id_equipe || '') === String(idEquipe)
                            && Number(a.id_usuario || 0) > 0;
                    })
                };
            } else {
                data = await fetchJson(API + 'pontos?acao=atletas&id_jogo=' + idJogo + '&id_equipe=' + idEquipe);
            }
            if (!placarContinuaAtivo(cicloLocal) || !select.isConnected || document.getElementById('selectAlunoArtilheiro') !== select) return;
            var alunos = data.success && Array.isArray(data.atletas) ? data.atletas : [];
            select.innerHTML = '<option value="">Selecione o(a) jogador(a)</option>';
            alunos.forEach(function(a) {
                select.innerHTML += '<option value="' + a.id_usuario + '">' + esc(a.nome_usuario) + '</option>';
            });
            if (!alunos.length) {
                select.innerHTML = '<option value="">Nenhum jogador disponível</option>';
            }
        } catch (e) {
            if (placarContinuaAtivo(cicloLocal) && select && select.isConnected) {
                select.innerHTML = '<option value="">Erro ao carregar jogadores</option>';
            }
        }
    }

    var _artilheiroEquipeAtual = null;

    function abrirModalArtilheiro(idEquipe) {
        if (jogoEncerrado()) {
            SGI.alert('O jogo já foi encerrado. Não é possível registrar artilharia.');
            return;
        }
        _artilheiroEquipeAtual = idEquipe;
        document.getElementById('formArtilheiro').reset();
        document.getElementById('msgArtilheiro').innerHTML = '';

        var selectEquipe = document.getElementById('selectEquipeArtilheiro');
        selectEquipe.value = idEquipe;
        carregarAlunosArtilheiro();

        var modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('modalArtilheiro'));
        modal.show();
    }

    async function salvarPonto(e) {
        e.preventDefault();
        if (jogoEncerrado()) {
            SGI.alert('O jogo já foi encerrado. Não é possível registrar ponto.');
            return;
        }
        var btn = document.getElementById('btnSalvarArtilheiro');
        var msg = document.getElementById('msgArtilheiro');
        msg.innerHTML = '';

        var idAluno = document.getElementById('selectAlunoArtilheiro').value;
        if (!idAluno) {
            msg.innerHTML = '<span class="text-danger">Selecione o aluno responsável pela jogada para confirmar o ponto.</span>';
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Salvando...';

        try {
            var idEquipe = parseInt(document.getElementById('selectEquipeArtilheiro').value, 10);
            var partida = partidasLista.filter(function (p) { return Number(p.equipes_id_equipe) === idEquipe; })[0];
            if (!partida) throw new Error('Selecione uma equipe válida.');
            var alunoSelect = document.getElementById('selectAlunoArtilheiro');
            var chave = 'ponto-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
            var pontoLocal = {
                id_ponto: 'local-' + chave,
                jogos_id_jogo: idJogo,
                id_partida: partida.id_partida,
                partidas_id_partida: partida.id_partida,
                equipes_id_equipe: idEquipe,
                usuarios_id_usuario: parseInt(idAluno, 10),
                chave_jogada: chave,
                num_gol: 1,
                conta_no_placar: 1,
                status_artilheiro: 'ativo',
                nome_usuario: alunoSelect.selectedOptions[0] ? alunoSelect.selectedOptions[0].text : ''
            };
            var result;
            if (Number(idJogo) < 0) {
                result = { success: true, offline: true };
            } else {
                var resp = await fetch(API + 'pontos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        usuarios_id_usuario: parseInt(idAluno, 10),
                        jogos_id_jogo: idJogo,
                        id_partida: partida.id_partida,
                        equipes_id_equipe: idEquipe,
                        chave_jogada: chave
                    })
                });
                result = await resp.json();
            }
            if (result.success) {
                var pontoPendente = result.offline === true || Number(idJogo) < 0;
                pontoLocal = Object.assign({}, pontoLocal, result.ponto || {}, {
                    id_ponto: result.id_ponto || (result.mutation_id ? 'temp_' + result.mutation_id : pontoLocal.id_ponto),
                    _pendente: result.offline === true
                });
                pontosLista.push(pontoLocal);
                partida.resultado_partida = result.placar == null
                    ? Math.max(0, parseInt(partida.resultado_partida, 10) || 0) + 1
                    : Number(result.placar);
                if (Number(idJogo) < 0 && window.SGIDataLayer && typeof window.SGIDataLayer.upsert === 'function') {
                    await Promise.all([
                        window.SGIDataLayer.upsert('pontos', chave, pontoLocal),
                        window.SGIDataLayer.upsert('partidas', partida.id_partida, partida)
                    ]);
                }
                var textoPonto = pontoPendente
                    ? 'Ponto salvo neste dispositivo, aguardando envio ao servidor.'
                    : 'Ponto registrado e confirmado pelo servidor com o atleta responsável.';
                msg.innerHTML = '<span class="text-success">' + esc(textoPonto) + '</span>';
                anunciarStatusPlacar(textoPonto);
                if (pontoPendente) atualizarStatusPlacarDaFila();
                renderTudo();
                carregarArtilheiros();
                setTimeout(function() {
                    btn.disabled = false;
                    btn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Registrar ponto';
                    var m = bootstrap.Modal.getInstance(document.getElementById('modalArtilheiro'));
                    if (m) m.hide();
                }, 600);
            } else {
                msg.innerHTML = '<span class="text-danger">' + esc(result.message || 'Erro ao registrar.') + '</span>';
                anunciarStatusPlacar('O ponto não foi confirmado pelo servidor. ' + (result.message || 'Revise os dados e tente novamente.'));
                btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Registrar ponto';
            }
        } catch (err) {
            msg.innerHTML = '<span class="text-danger">Erro de conexão.</span>';
            anunciarStatusPlacar('Não foi possível registrar o ponto. O placar não foi confirmado.');
            btn.disabled = false;
                btn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Registrar ponto';
        }
    }

    async function anularUltimoPonto(idx) {
        if (jogoEncerrado()) return;
        var partida = partidasLista[idx];
        if (!partida) return;
        var pontos = pontosLista.filter(function (ponto) {
            return String(ponto.equipes_id_equipe) === String(partida.equipes_id_equipe)
                && String(ponto.status_artilheiro || 'ativo') === 'ativo'
                && Number(ponto.conta_no_placar == null ? 1 : ponto.conta_no_placar) === 1;
        });
        var ponto = pontos[pontos.length - 1];
        if (!ponto) {
            SGI.alert('Não há ponto vinculado a um atleta para anular.');
            return;
        }
        try {
            if (Number(idJogo) < 0) {
                ponto.status_artilheiro = 'anulado';
                ponto.conta_no_placar = 0;
                partida.resultado_partida = Math.max(0, (parseInt(partida.resultado_partida, 10) || 0) - 1);
                if (window.SGIDataLayer && typeof window.SGIDataLayer.upsert === 'function') {
                    await Promise.all([
                        window.SGIDataLayer.upsert('pontos', ponto.chave_jogada || ponto.id_ponto, ponto),
                        window.SGIDataLayer.upsert('partidas', partida.id_partida, partida)
                    ]);
                }
            } else {
                var resp = await fetch(API + 'pontos', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id_ponto: ponto.id_ponto })
                });
                var resposta = await resp.json();
                if (!resp.ok || resposta.success === false) throw new Error(resposta.message || 'Não foi possível anular o ponto.');
                ponto = Object.assign({}, ponto, resposta.ponto || {}, { status_artilheiro: 'anulado', conta_no_placar: 0 });
                pontosLista[pontosLista.indexOf(pontos[pontos.length - 1])] = ponto;
                partida.resultado_partida = resposta.placar == null
                    ? Math.max(0, (parseInt(partida.resultado_partida, 10) || 0) - 1)
                    : Number(resposta.placar);
            }
            renderTudo();
            carregarArtilheiros();
        } catch (error) {
            SGI.alert(error.message || 'Não foi possível anular o ponto.');
        }
    }

    // Compatibilidade para módulos legados que ainda chamam o nome antigo.
    var salvarArtilheiro = salvarPonto;

    function mostrarAlertaSegundoAmarelo(nomeAluno) {
        var container = document.getElementById('alerta-segundo-amarelo');
        if (!container) return;
        var nome = nomeAluno || 'Jogador(a)';
        container.innerHTML =
            '<div class="alert d-flex align-items-center gap-3 py-3 px-4 mb-0 rounded-3 shadow-sm border-start border-4 border-danger bg-danger-subtle text-danger-emphasis" role="alert" >' +
                '<span class="p-2 rounded-circle bg-danger text-white d-inline-flex align-items-center justify-content-center flex-shrink-0 fw-bold">V</span>' +
                '<div class="flex-grow-1">' +
                    '<strong class="d-block mb-1 small" >SEGUNDO CARTÃO AMARELO</strong>' +
                    '<span class="small">' + esc(nome) + ' recebeu o segundo amarelo e foi expulso(a) da partida (Cartão Vermelho automático).</span>' +
                '</div>' +
                '<button type="button" class="btn-close small" data-bs-dismiss="alert" aria-label="Fechar" ></button>' +
            '</div>';
        setTimeout(function() {
            var alert = container.querySelector('.alert');
            if (alert) {
                alert.style.transition = 'opacity 0.3s, transform 0.3s';
                alert.style.opacity = '0';
                alert.style.transform = 'translateY(-8px)';
                setTimeout(function() { if (alert.parentNode) alert.remove(); }, 350);
            }
        }, 8000);
    }

    function prepararFechamentoAcessivelModais() {
        ['modalArtilheiro', 'modalOcorrencia'].forEach(function(idModal) {
            var modal = document.getElementById(idModal);
            if (!modal || modal.dataset.sgiFocoSeguro === '1') return;
            modal.dataset.sgiFocoSeguro = '1';
            window.SGIPage.prepareModal(modal);
            var acionadorModal = null;
            pageScope.listen(modal, 'show.bs.modal', function() {
                acionadorModal = document.activeElement;
            });
            pageScope.listen(modal, 'hide.bs.modal', function() {
                var foco = document.activeElement;
                if (foco && modal.contains(foco) && typeof foco.blur === 'function') {
                    foco.blur();
                }
            });
            pageScope.listen(modal, 'hidden.bs.modal', function() {
                var foco = acionadorModal;
                acionadorModal = null;
                if (foco && foco.isConnected && typeof foco.focus === 'function') foco.focus();
            });
            pageScope.onDeactivate(function() {
                delete modal.dataset.sgiFocoSeguro;
                acionadorModal = null;
            });
        });
    }

    function ativarTelaPlacar() {
        prepararFechamentoAcessivelModais();

        // A tela pode voltar de uma montagem já existente. Nesse caso o
        // script não é reinjetado; reanexar o listener e registrar a limpeza
        // aqui evita que a segunda saída deixe timers/callbacks ativos.
        if (!__sgiPlacarClickHandler) {
            __sgiPlacarClickHandler = function(e) {
                var action = e.target.closest('[data-sgi-action]');
                if (action && action.dataset.sgiAction === 'edit-occurrence') {
                    editarOcorrencia(action.dataset.idOcorrencia);
                    return;
                }
                if (action && action.dataset.sgiAction === 'delete-occurrence') {
                    excluirOcorrencia(action.dataset.idOcorrencia);
                    return;
                }
                var opt = e.target.closest('.ocorrencia-tipo-option');
                if (opt) {
                    document.querySelectorAll('.ocorrencia-tipo-option').forEach(function(el) {
                        el.classList.remove('active');
                    });
                    opt.classList.add('active');
                    var radio = opt.htmlFor ? document.getElementById(opt.htmlFor) : opt.querySelector('input[type="radio"]');
                    if (radio) radio.checked = true;
                }
            };
            pageScope.listen(document, 'click', __sgiPlacarClickHandler);
        }
        pageScope.listen(document, 'change', function(e) {
            var radio = e.target;
            if (!radio || !radio.matches('input[name="tipo_ocorrencia"]')) return;
            document.querySelectorAll('.ocorrencia-tipo-option').forEach(function(label) {
                label.classList.toggle('active', label.htmlFor === radio.id);
            });
        });
        window.__SGI_TELA_CLEANUP__ = __sgiPlacarCleanup;
        var ciclo = ++__sgiPlacarCiclo;
        carregarDados(ciclo);
    }

    window.SGIPage.ready( ativarTelaPlacar);

return {obterIdJogoAtual, paginaOrigem, definirLinkVoltar, formatNomeJogo, resolverTipoCompeticao, jogoEhIndividual, nomeEquipe, enriquecerPartidasComTurmas, esc, fetchJson, pararTimer, atualizarDisplayTimer, tocarAlertaSonoro, bloquearPontuacao, mostrarBotoesTempoExtra, adicionarTempoExtra, iniciarTimerDisplay, togglePause, mudarDuracao, agendarSalvarPartida, salvarPartida, persistirJogoLocal, jogoEncerrado, iniciarJogoServidor, finalizarJogo, aplicarFinalizacaoUI, finalizarLocalmente, placarContinuaAtivo, carregarJogoLocalTemporario, renderTudo, ajustarGols, ehFutsal, carregarIndDados, renderIndividual, salvarIndRanking, carregarDados, iniciarOcorrencias, precarregarDadosOffline, carregarTurmasOcorrencia, carregarAlunosOcorrencia, limparDescricaoOcorrencia, carregarOcorrencias, abrirModalOcorrencia, editarOcorrencia, excluirOcorrencia, salvarOcorrencia, iniciarArtilheiro, acompanharSincronizacaoPlacar, carregarArtilheiros, carregarEquipesArtilheiro, carregarAlunosArtilheiro, abrirModalArtilheiro, salvarPonto, salvarArtilheiro, anularUltimoPonto, mostrarAlertaSegundoAmarelo, prepararFechamentoAcessivelModais, ativarTelaPlacar};
});
