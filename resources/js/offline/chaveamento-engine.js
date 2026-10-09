/* ==========================================================================
   SGI — Motor de Chaveamento Híbrido (Online/Offline)
   --------------------------------------------------------------------------
   Ordem de verificação ao carregar/avançar a árvore:
     1) Tenta a API PHP (chaveamentos). Sendo online, o próprio fetch
        encapsulado (offline-core.js) já persiste o snapshot no IndexedDB.
     2) Sem conexão (ou erro/servidor indisponível): o fetch serve o snapshot
        do IndexedDB; se não houver resposta, lê o cache explicitamente.
     3) Aplica os resultados gravados localmente (fila de mutações pendentes
        do banco JS temporário) e processa o avanço da árvore NO FRONTEND:
        promove vencedores e cria as partidas das fases seguintes até definir
        o campeão; o terceiro lugar é derivado, sem partida adicional.
     4) Quando a conexão volta, os dados locais são sincronizados com o PHP
        (a fila original é reenviada e o servidor refaz o avanço nativamente).

   Espelha em JavaScript a lógica do motor de mata-mata do servidor:
   tags publicadas "PL:{modalidade}:{turma}:MM:{largura}:{slot}:{N|B}",
   legadas "MM:{largura}:{slot}:{N|B}" e posições "POS:...".
   ========================================================================== */
(function () {
    'use strict';

    /* ---------------------- Utilidades de tag (espelho PHP) ---------------------- */

    function mmTag(larguraFase, slot, kind) {
        return 'MM:' + larguraFase + ':' + slot + ':' + kind;
    }

    function tagDaFase(jogo, larguraFase, slot, kind) {
        var identidade = mmParse(jogo && jogo.nome_jogo);
        if (identidade && identidade.planejado) {
            var prefixo = identidade.formatoLegado
                ? 'PL:' + identidade.modalidade + ':MM:'
                : 'PL:' + identidade.modalidade + ':' + identidade.turma + ':MM:';
            return prefixo + larguraFase + ':' + slot + ':' + kind;
        }
        return mmTag(larguraFase, slot, kind);
    }

    function mmParse(nomeJogo) {
        if (!nomeJogo || typeof nomeJogo !== 'string') return null;
        var m = nomeJogo.match(/^(?:PL:(\d+):(?:(-?\d+):)?)?MM:(\d+):(\d+):([NB])$/);
        if (m) return {
            largura: parseInt(m[3], 10),
            slot: parseInt(m[4], 10),
            kind: m[5],
            planejado: m[1] !== undefined,
            modalidade: m[1] !== undefined ? parseInt(m[1], 10) : null,
            turma: m[2] !== undefined ? parseInt(m[2], 10) : null,
            formatoLegado: m[1] !== undefined && m[2] === undefined
        };
        var p = nomeJogo.match(/^POS:(\d+):(\d+):([NB])$/);
        if (p) return { largura: 0, slot: parseInt(p[2], 10), kind: p[3], posicao: parseInt(p[1], 10) };
        return null;
    }

    function proximaLargura(largura) { return Math.max(1, Math.floor(largura / 2)); }
    function slotPai(slot) { return Math.floor(slot / 2); }
    function slotIrmao(slot) { return (slot % 2 === 0) ? slot + 1 : slot - 1; }
    function jogoEncerrado(status) {
        return status === 'Concluido' || status === 'Finalizado';
    }

    var NOMES_FASE = { 16: 'Oitavas de final', 8: 'Quartas de final', 4: 'Semifinal', 2: 'Final', 1: 'Campeão' };
    var NOMES_POSICAO = { 3: 'Disputa de 3º lugar', 5: 'Disputa de 5º lugar' };

    function nomeFase(largura) { return NOMES_FASE[largura] || ('Fase ' + largura); }
    function nomeFasePosicao(posicao) { return NOMES_POSICAO[posicao] || ('Disputa de ' + posicao + 'º lugar'); }

    /* Vencedor por maior gols; empate → menor id_equipe (idêntico ao PHP). */
    function vencedorDeEquipes(equipes) {
        if (!equipes || equipes.length === 0) return null;
        if (equipes.length === 1) return Number(equipes[0].id_equipe);
        var ordenadas = equipes.slice().sort(function (a, b) {
            var ga = Number(a.gols) || 0, gb = Number(b.gols) || 0;
            if (ga !== gb) return gb - ga;
            return Number(a.id_equipe) - Number(b.id_equipe);
        });
        return Number(ordenadas[0].id_equipe);
    }

    function perdedorDeEquipes(equipes) {
        if (!equipes || equipes.length < 2) return null;
        var ordenadas = equipes.slice().sort(function (a, b) {
            var ga = Number(a.gols) || 0, gb = Number(b.gols) || 0;
            if (ga !== gb) return gb - ga;
            return Number(a.id_equipe) - Number(b.id_equipe);
        });
        return Number(ordenadas[1].id_equipe);
    }

    /* O placar e os IDs locais podem avançar a árvore, mas o snapshot online
       continua sendo a fonte dos nomes exibidos. */
    function projetarEquipeLocal(partida, referencia) {
        partida = partida || {};
        referencia = referencia || {};
        return {
            id_partida: partida.id_partida != null ? partida.id_partida : null,
            id_equipe: Number(partida.equipes_id_equipe),
            gols: Number(partida.resultado_partida) || 0,
            id_turma: partida.id_turma != null ? Number(partida.id_turma) : (referencia.id_turma || null),
            nome_turma: referencia.nome_turma || partida.nome_turma || '',
            nome_fantasia: referencia.nome_fantasia || referencia.nome_fantasia_turma ||
                partida.nome_fantasia_turma || partida.nome_fantasia || '',
            nome_equipe: referencia.nome_equipe || partida.nome_equipe || ''
        };
    }

    /* ------------------------------ Estado interno ------------------------------ */

    // Último resultado entregue pela camada híbrida (para gatilhos de sync).
    var _ultimo = { fonte: null, idModalidade: null, jogos: [] };

    function apiBase() {
        try {
            var base = window.SGI_BASE_PATH ? '/' + String(window.SGI_BASE_PATH).replace(/^\/+|\/+$/g, '') : '';
            if (!base) {
                var scripts = document.getElementsByTagName('script');
                for (var i = 0; i < scripts.length; i++) {
                    var src = scripts[i].src || '';
                    var marker = '/assets/';
                    var pos = src.indexOf(marker);
                    if (pos > -1) { base = new URL(src, window.location.href).pathname.split(marker)[0]; break; }
                }
            }
            return base + '/api/v1/';
        } catch (e) {
            return '/api/v1/';
        }
    }

    function urlAbsoluta(url) {
        try { return new URL(url, window.location.href).href; } catch (e) { return url; }
    }

    function agendaRows(data) {
        if (Array.isArray(data)) return data;
        if (data && Array.isArray(data.data)) return data.data;
        if (data && Array.isArray(data.reservas)) return data.reservas;
        return [];
    }

    function lerCacheLista(urlRel) {
        var chave = urlAbsoluta(urlRel);
        if (!window.SGIOffline || typeof window.SGIOffline.getCached !== 'function') {
            return Promise.resolve([]);
        }
        return Promise.resolve(window.SGIOffline.getCached(chave)).then(function (rec) {
            if (!rec || !rec.text) return [];
            try { return agendaRows(JSON.parse(rec.text)); } catch (e) { return []; }
        }).catch(function () { return []; });
    }

    function edicaoConhecida(jogos) {
        var ativa = Number(window.SGI_SESSION_INTERCLASSE_ATIVO || 0);
        if (ativa > 0) return ativa;
        for (var i = 0; i < (jogos || []).length; i++) {
            var jogo = jogos[i] || {};
            var id = Number(jogo.id_interclasse || jogo.interclasses_id_interclasse || 0);
            if (id > 0) return id;
        }
        return 0;
    }

    function carregarReservasAgenda(idModalidade, jogos) {
        var edition = edicaoConhecida(jogos);
        if (edition <= 0 || Number(idModalidade) <= 0) return Promise.resolve([]);
        var url = apiBase() + 'agenda-blocos?id_interclasse=' + encodeURIComponent(edition) +
            '&id_modalidade=' + encodeURIComponent(idModalidade);
        var reservasBlocos = fetch(url, { headers: { 'Accept': 'application/json' } }).then(function (resp) {
            if (!resp.ok) throw new Error('Falha ao consultar reservas da agenda.');
            return resp.json();
        }).then(agendaRows).catch(function () { return lerCacheLista(url); });
        var reservasPublicadas = Promise.resolve(window.SGIDataLayer && typeof window.SGIDataLayer.read === 'function'
            ? window.SGIDataLayer.read('cronograma').catch(function () { return []; })
            : []).then(function (rows) {
            var snapshot = Array.isArray(rows) ? rows[0] : rows;
            if (!snapshot || snapshot.cronograma_status !== 'publicado' || !Array.isArray(snapshot.compromissos)) return [];
            var version = Number(snapshot.versao_publicada || (snapshot.operacao && snapshot.operacao.versao_publicada) || 0);
            if (version <= 0) return [];
            return snapshot.compromissos.filter(function (item) {
                return Number(item.id_modalidade) === Number(idModalidade);
            }).map(function (item) {
                return {
                    id_reserva: item.id_compromisso,
                    id_modalidade: item.id_modalidade,
                    chave_tag: item.chave_tag,
                    chave_versao: '1',
                    data_reserva: item.data_compromisso,
                    inicio_reserva: item.inicio_compromisso,
                    termino_reserva: item.termino_compromisso,
                    id_local: item.id_local,
                    condicional: item.condicional
                };
            });
        });
        return Promise.all([reservasPublicadas, reservasBlocos]).then(function (sets) {
            return (sets[0] || []).concat(sets[1] || []);
        });
    }

    function reservaAgendaDoJogo(jogo, reservas, defaultModality) {
        var idModalidade = Number(jogo && (jogo.modalidades_id_modalidade || jogo.id_modalidade) || defaultModality || 0);
        var tag = String(jogo && (jogo.chave_tag || jogo.nome_jogo) || '');
        return (reservas || []).filter(function (reserva) {
            return Number(reserva.id_modalidade) === idModalidade &&
                String(reserva.chave_tag || '') === tag &&
                String(reserva.chave_versao || '1') === String(jogo.chave_versao || '1');
        })[0] || null;
    }

    function aplicarReservaAgendaNoJogo(jogo, reserva, locaisStore) {
        if (!jogo || !reserva || !reserva.data_reserva || !reserva.inicio_reserva ||
            !reserva.termino_reserva || Number(reserva.id_local) <= 0) return false;
        jogo.data_jogo = String(reserva.data_reserva).slice(0, 10);
        jogo.inicio_jogo = String(reserva.inicio_reserva);
        jogo.termino_jogo = String(reserva.termino_reserva);
        jogo.locais_id_local = Number(reserva.id_local);
        var local = (locaisStore || []).filter(function (item) {
            return Number(item && item.id_local) === Number(reserva.id_local);
        })[0];
        jogo.nome_local = reserva.nome_local || (local && local.nome_local) || jogo.nome_local || null;
        var duration = Number(reserva.duracao_segundos || 0);
        if (duration <= 0) {
            var inicio = String(reserva.inicio_reserva).split(':');
            var termino = String(reserva.termino_reserva).split(':');
            var inicioSeg = Number(inicio[0]) * 3600 + Number(inicio[1] || 0) * 60 + Number(inicio[2] || 0);
            var terminoSeg = Number(termino[0]) * 3600 + Number(termino[1] || 0) * 60 + Number(termino[2] || 0);
            duration = terminoSeg - inicioSeg;
        }
        if (duration > 0) {
            jogo.duracao_jogo = duration;
            if (jogo.tempo_restante_jogo == null || jogo._local) jogo.tempo_restante_jogo = duration;
        }
        jogo._agenda_reserva_id = Number(reserva.id_reserva || 0) || null;
        return true;
    }

    function aplicarReservasAgenda(jogos, reservas, locaisStore, defaultModality) {
        var alterou = false;
        (jogos || []).forEach(function (jogo) {
            var reserva = reservaAgendaDoJogo(jogo, reservas, defaultModality);
            if (reserva) alterou = aplicarReservaAgendaNoJogo(jogo, reserva, locaisStore) || alterou;
        });
        return alterou;
    }

    /* --------------------- Leitura dos dados pendentes locais ---------------------
       Os resultados lançados offline ficam na mutation_queue (IndexedDB
       sgi_offline), na forma das requisições originais:
         - POST resultados  → { id_jogo, resultados:[{id_equipe,gols}] }
         - PUT  jogos             → { id_jogo, status_jogo, data_jogo, ... }
       Reproduzi-los sobre o snapshot é o que faz a árvore avançar offline. */

    function coletarPendencias() {
        if (!window.SGIOffline || typeof window.SGIOffline.getPendingList !== 'function') {
            return Promise.resolve([]);
        }
        return Promise.resolve(window.SGIOffline.getPendingList()).then(function (lista) {
            var ops = [];
            (lista || []).forEach(function (item) {
                var url = item.url || '';
                var corpo = item.body;
                var dados = null;
                try {
                    dados = (typeof corpo === 'string') ? JSON.parse(corpo) : corpo;
                } catch (e) { dados = null; }
                if (!dados) return;

                if (/\/api\/v1\/resultados\/?(?:\?|$)/.test(url)) {
                    ops.push({ tipo: 'resultado', quando: item.createdAt || 0, dados: dados });
                } else if (/\/api\/v1\/partidas\/?(?:\?|$)/.test(url) && String(item.method || '').toUpperCase() === 'POST') {
                    ops.push({ tipo: 'partida_resultado', quando: item.createdAt || 0, dados: dados });
                } else if (/\/api\/v1\/jogos\/?(?:\?|$)/.test(url) && String(item.method || '').toUpperCase() === 'PUT') {
                    ops.push({ tipo: 'jogo_update', quando: item.createdAt || 0, dados: dados });
                } else if (/\/api\/v1\/chaveamentos\/?(?:\?|$)/.test(url) && String(item.method || '').toUpperCase() === 'POST' && dados.tipo_modalidade === 'individual') {
                    ops.push({ tipo: 'ind_ranking', quando: item.createdAt || 0, dados: dados });
                }
            });
            ops.sort(function (a, b) { return a.quando - b.quando; });
            return ops;
        }).catch(function () { return []; });
    }

    /* Aplica as operações pendentes sobre o array de jogos (em memória).
       Retorna true se algo foi alterado. Validações espelham resultados:
       sem placar 0x0 e sem empate ao concluir um jogo. */
    function aplicarPendencias(jogos, ops, mapaPorId) {
        var alterou = false;
        (ops || []).forEach(function (op) {
            if (op.tipo === 'resultado') {
                var jogo = mapaPorId[op.dados.id_jogo];
                if (!jogo) return;
                var resultados = op.dados.resultados || [];
                resultados.forEach(function (r) {
                    var eq = (jogo.equipes || []).filter(function (e) {
                        return Number(e.id_equipe) === Number(r.id_equipe);
                    })[0];
                    if (eq && (Number(eq.gols) || 0) !== (Number(r.gols) || 0)) {
                        eq.gols = Number(r.gols) || 0;
                        alterou = true;
                    }
                });

                if (!jogoEncerrado(jogo.status_jogo)) {
                    var total = (jogo.equipes || []).reduce(function (s, e) { return s + (Number(e.gols) || 0); }, 0);
                    var empate = (jogo.equipes || []).length >= 2 &&
                        (Number(jogo.equipes[0].gols) || 0) === (Number(jogo.equipes[1].gols) || 0);
                    if (total > 0 && !empate) {
                        jogo.status_jogo = 'Concluido';
                        alterou = true;
                    }
                } else {
                    alterou = true; // placar de jogo já concluído pode ter mudado o vencedor
                }
            } else if (op.tipo === 'partida_resultado') {
                var idPart = op.dados.id_partida;
                var golsNovos = Number(op.dados.resultado_final) || 0;
                var jogoAlvo = null;
                for (var k in mapaPorId) {
                    var candidato = mapaPorId[k];
                    if ((candidato.equipes || []).some(function (e) {
                        return String(e.id_partida) === String(idPart);
                    })) {
                        jogoAlvo = candidato;
                        break;
                    }
                }
                if (!jogoAlvo) return;
                (jogoAlvo.equipes || []).forEach(function (e) {
                    if (String(e.id_partida) === String(idPart)) {
                        if ((Number(e.gols) || 0) !== golsNovos) {
                            e.gols = golsNovos;
                            alterou = true;
                        }
                    }
                });
                if (!jogoEncerrado(jogoAlvo.status_jogo)) {
                    var totalPR = (jogoAlvo.equipes || []).reduce(function (s, e) { return s + (Number(e.gols) || 0); }, 0);
                    var empatePR = (jogoAlvo.equipes || []).length >= 2 &&
                        (Number(jogoAlvo.equipes[0].gols) || 0) === (Number(jogoAlvo.equipes[1].gols) || 0);
                    if (totalPR > 0 && !empatePR) {
                        jogoAlvo.status_jogo = 'Concluido';
                        alterou = true;
                    }
                } else {
                    alterou = true;
                }
            } else if (op.tipo === 'jogo_update') {
                var j2 = mapaPorId[op.dados.id_jogo];
                if (!j2) return;
                ['status_jogo', 'data_jogo', 'inicio_jogo', 'termino_jogo', 'locais_id_local'].forEach(function (k) {
                    if (op.dados[k] !== undefined && j2[k] !== op.dados[k]) {
                        j2[k] = op.dados[k];
                        alterou = true;
                    }
                });
            } else if (op.tipo === 'ind_ranking') {
                var tagInd = 'IND:' + op.dados.id_modalidade;
                for (var kId in mapaPorId) {
                    var ji = mapaPorId[kId];
                    if (ji.nome_jogo === tagInd && !jogoEncerrado(ji.status_jogo)) {
                        ji.status_jogo = 'Concluido';
                        alterou = true;
                        break;
                    }
                }
            }
        });
        return alterou;
    }

    /* ------------------------ Motor de avanço local (JS) ------------------------
       Espelho de sgi_chaveamento_processar_avanco(): para cada jogo MM
       concluído, garante o vencedor no jogo-pai da fase seguinte (criando-o
       se necessário) e autoconclui pais com bye implícito. A final (MM:2) é
       o último jogo operacional: seu vencedor é o campeão e o terceiro lugar
       é derivado do perdedor da semifinal do campeão, sem partida solo. */

    function criarMotorAvanco(jogos, dirEquipes, contadorInicial, reservasAgenda, locaisStore) {
        var mapaTag = {};
        var mapaId = {};
        /* Ids temporários negativos. Opcionalmente semeado abaixo do menor id
           já existente para que EXECUÇÕES DIFERENTES do motor (uma por jogo
           finalizado offline) nunca gerem colisão com linhas persistidas
           anteriormente no banco JS temporário. */
        var contadorLocal = (typeof contadorInicial === 'number') ? contadorInicial : 0;
        var criouJogo = false;
        var primeiroJogo = jogos[0] || {};

        var defaultModId = primeiroJogo.modalidades_id_modalidade || primeiroJogo.id_modalidade || null;
        var defaultInterclasseId = primeiroJogo.id_interclasse || primeiroJogo.interclasses_id_interclasse || null;
        var defaultModNome = primeiroJogo.nome_modalidade || '';
        var defaultModTipo = primeiroJogo.tipos_modalidades_id_tipo_modalidade || 1;
        var defaultDuracao = primeiroJogo.duracao_jogo || 1200;

        jogos.forEach(function (j) {
            if (mmParse(j.nome_jogo)) mapaTag[j.nome_jogo] = j;
            mapaId[Number(j.id_jogo)] = j;
        });

        function nomeEquipeResumo(equipe) {
            return String((equipe && (equipe.nome_equipe || equipe.nome_fantasia ||
                equipe.nome_fantasia_turma || equipe.nome_turma)) || '').trim();
        }

        function atualizarResumoEquipes(jogo) {
            var nomes = (jogo.equipes || []).map(nomeEquipeResumo).filter(Boolean);
            jogo.equipes_nomes = nomes.join(' vs ');
        }

        function garantirEquipe(jogo, idEquipe, teamMeta) {
            var existe = (jogo.equipes || []).some(function (e) {
                return Number(e.id_equipe) === Number(idEquipe);
            });
            if (existe) return false;
            var info = dirEquipes[Number(idEquipe)] || {};
            var meta = teamMeta || {};
            jogo.equipes = jogo.equipes || [];
            jogo.equipes.push({
                id_partida: null,
                id_equipe: Number(idEquipe),
                id_turma: meta.id_turma || info.id_turma || info.turmas_id_turma || null,
                nome_turma: meta.nome_turma || info.nome_turma || '',
                nome_fantasia: meta.nome_fantasia || meta.nome_fantasia_turma || info.nome_fantasia || info.nome_fantasia_turma || meta.nome_equipe || info.nome_equipe || '',
                nome_equipe: meta.nome_equipe || info.nome_equipe || '',
                gols: 0,
                _local: true
            });
            atualizarResumoEquipes(jogo);
            return true;
        }

        function garantirJogoPorTag(tag, metaRef, jogoOrigem) {
            if (mapaTag[tag]) return mapaTag[tag];
            contadorLocal -= 1;
            var pai = {
                id_jogo: contadorLocal,                 // id temporário negativo (só existe localmente)
                nome_jogo: tag,
                status_jogo: 'Agendado',
                data_jogo: jogoOrigem && jogoOrigem.data_jogo ? jogoOrigem.data_jogo : null,
                inicio_jogo: null,
                termino_jogo: null,
                modalidades_id_modalidade: defaultModId,
                id_interclasse: defaultInterclasseId,
                interclasses_id_interclasse: defaultInterclasseId,
                nome_modalidade: defaultModNome,
                tipos_modalidades_id_tipo_modalidade: defaultModTipo,
                locais_id_local: jogoOrigem && jogoOrigem.locais_id_local ? jogoOrigem.locais_id_local : null,
                nome_local: jogoOrigem && jogoOrigem.nome_local ? jogoOrigem.nome_local : null,
                exige_horario_agendado: false,
                duracao_jogo: defaultDuracao,
                tempo_restante_jogo: defaultDuracao,
                tempo_extra_jogo: 0,
                equipes: [],
                _local: true,
                _meta_ref: metaRef || null
            };
            jogos.push(pai);
            mapaTag[tag] = pai;
            mapaId[pai.id_jogo] = pai;
            aplicarReservaAgendaNoJogo(pai, reservaAgendaDoJogo(pai, reservasAgenda, defaultModId), locaisStore);
            criouJogo = true;
            return pai;
        }

        /* Filhos existentes do pai todos encerrados? (filho inexistente = vaga vazia) */
        function filhosResolvidos(jogoPai, larguraPai, slotPaiArg) {
            var larguraFilho = larguraPai * 2;
            if (larguraFilho < 2) return true;
            for (var cs = 2 * slotPaiArg; cs <= 2 * slotPaiArg + 1; cs++) {
                var filho = mapaTag[tagDaFase(jogoPai, larguraFilho, cs, 'N')] || mapaTag[tagDaFase(jogoPai, larguraFilho, cs, 'B')];
                if (filho && !jogoEncerrado(filho.status_jogo)) return false;
            }
            return true;
        }

        function ramoTemEquipesAbaixo(largura, slot) {
            return jogos.some(function (candidato) {
                var meta = mmParse(candidato.nome_jogo);
                if (!meta || meta.largura <= largura || meta.largura % largura !== 0 ||
                    Math.floor(meta.slot / (meta.largura / largura)) !== slot) return false;
                return (candidato.equipes || []).length > 0;
            });
        }

        function byePendenteSemIrmao(largura) {
            return jogos.find(function (candidato) {
                var metaBye = mmParse(candidato.nome_jogo);
                if (!metaBye || metaBye.largura !== largura || metaBye.kind !== 'B' ||
                    !jogoEncerrado(candidato.status_jogo)) return false;
                var irmao = mapaTag[mmTag(largura, slotIrmao(metaBye.slot), 'N')] ||
                    mapaTag[mmTag(largura, slotIrmao(metaBye.slot), 'B')];
                if (irmao) return false;
                var pai = mapaTag[mmTag(proximaLargura(largura), slotPai(metaBye.slot), 'N')];
                return !pai || (pai.equipes || []).length < 2;
            });
        }

        function equipeJaAvancouPorByePendente(larguraPai, tagPaiEsperada, equipeId) {
            return jogos.some(function (candidato) {
                var meta = mmParse(candidato.nome_jogo);
                return meta && meta.largura === larguraPai && meta.kind === 'N' &&
                    candidato.nome_jogo !== tagPaiEsperada && (candidato.equipes || []).some(function (equipe) {
                        return Number(equipe.id_equipe) === Number(equipeId);
                    });
            });
        }

        /* Pai com um único competidor e ambos os lados resolvidos → conclui (bye implícito). */
        function tentarAutoConcluir(pai) {
            var meta = mmParse(pai.nome_jogo);
            if (!meta || jogoEncerrado(pai.status_jogo)) return false;
            if (meta.largura === 2) return false;
            if ((pai.equipes || []).length !== 1) return false;
            if (!filhosResolvidos(pai, meta.largura, meta.slot)) return false;
            pai.status_jogo = 'Concluido';
            return true;
        }

        function processarJogo(jogo, fila) {
            var meta = mmParse(jogo.nome_jogo);
            if (!meta || meta.largura <= 1 || !jogoEncerrado(jogo.status_jogo)) return;

            var w1 = (meta.kind === 'B')
                ? ((jogo.equipes && jogo.equipes[0]) ? Number(jogo.equipes[0].id_equipe) : null)
                : vencedorDeEquipes(jogo.equipes);
            if (w1 === null) return;

            var w1Obj = (jogo.equipes || []).find(function(e) { return Number(e.id_equipe) === Number(w1); });

            // A grande final encerra o chaveamento. O campeão é derivado da
            // própria final; criar uma partida solo não gera ação do
            // usuário e fazia a agenda oscilar entre offline/online.
            if (meta.largura === 2) {
                return;
            }

            var tagIrmaoA = tagDaFase(jogo, meta.largura, slotIrmao(meta.slot), 'N');
            var tagIrmaoB = tagDaFase(jogo, meta.largura, slotIrmao(meta.slot), 'B');
            var irmao = mapaTag[tagIrmaoA] || mapaTag[tagIrmaoB];

            // Bye criado no último slot não possui irmão. Ele aguarda o
            // primeiro vencedor desta fase e forma com ele a próxima partida.
            if (meta.kind === 'N') {
                var byePendente = byePendenteSemIrmao(meta.largura);
                if (byePendente) {
                    var metaBye = mmParse(byePendente.nome_jogo);
                    var equipeBye = byePendente.equipes && byePendente.equipes[0];
                    var vencedorBye = equipeBye ? Number(equipeBye.id_equipe) : null;
                    if (metaBye && vencedorBye !== null) {
                        var tagPaiBye = mmTag(proximaLargura(meta.largura), slotPai(metaBye.slot), 'N');
                        var paiBye = garantirJogoPorTag(tagPaiBye, { largura: proximaLargura(meta.largura), slot: slotPai(metaBye.slot) }, jogo);
                        if ((paiBye.equipes || []).length < 2 && jogoEncerrado(paiBye.status_jogo)) paiBye.status_jogo = 'Agendado';
                        garantirEquipe(paiBye, vencedorBye, equipeBye);
                        garantirEquipe(paiBye, w1, w1Obj);
                        return;
                    }
                }
                var tagPaiAtual = mmTag(proximaLargura(meta.largura), slotPai(meta.slot), 'N');
                if (equipeJaAvancouPorByePendente(proximaLargura(meta.largura), tagPaiAtual, w1)) {
                    // Reexecuções do motor não podem reutilizar a vencedora
                    // que já está aguardando no confronto do bye inicial.
                    return;
                }
            }

            var irmaoJaAvancouPorBye = false;
            if (irmao && jogoEncerrado(irmao.status_jogo)) {
                var metaIrmaoExistente = mmParse(irmao.nome_jogo) || { kind: 'N' };
                var vencedorIrmaoExistente = (metaIrmaoExistente.kind === 'B')
                    ? ((irmao.equipes && irmao.equipes[0]) ? Number(irmao.equipes[0].id_equipe) : null)
                    : vencedorDeEquipes(irmao.equipes);
                var tagPaiEsperada = mmTag(proximaLargura(meta.largura), slotPai(meta.slot), 'N');
                if (vencedorIrmaoExistente !== null && equipeJaAvancouPorByePendente(proximaLargura(meta.largura), tagPaiEsperada, vencedorIrmaoExistente)) {
                    irmao = null;
                    irmaoJaAvancouPorBye = true;
                }
            }

            if (irmao && !jogoEncerrado(irmao.status_jogo)) return;
            // Um slot sem jogo só é vazio se não houver participantes ainda
            // avançando em rodadas inferiores. Aguarde esse ramo para não
            // criar uma final prematura com apenas uma equipe.
            if (!irmao && ramoTemEquipesAbaixo(meta.largura, slotIrmao(meta.slot))) return;

            var tagPai = tagDaFase(jogo, proximaLargura(meta.largura), slotPai(meta.slot), 'N');
            var pai = garantirJogoPorTag(tagPai, { largura: proximaLargura(meta.largura), slot: slotPai(meta.slot) }, jogo);
            // Esta é uma projeção exclusivamente local: depois que os dois
            // vencedores chegam ao confronto, o mesário pode iniciá-lo sem
            // depender de uma reserva de agenda que só poderia ser validada
            // pelo servidor. A sobreposição é removida ao sincronizar.
            pai._offline_liberado = true;
            pai.exige_horario_agendado = false;
            if (irmaoJaAvancouPorBye && (pai.equipes || []).length > 1) {
                jogos.forEach(function (posterior) {
                    var metaPosterior = mmParse(posterior.nome_jogo);
                    if (metaPosterior && metaPosterior.largura < proximaLargura(meta.largura)) {
                        posterior.equipes = [];
                        posterior.status_jogo = 'Agendado';
                    }
                });
                pai.equipes = (pai.equipes || []).filter(function (equipe) {
                    return Number(equipe.id_equipe) === Number(w1);
                });
                pai.status_jogo = 'Agendado';
            }
            garantirEquipe(pai, w1, w1Obj);

            if (!irmao) {
                if (tentarAutoConcluir(pai)) fila.push(pai);
            } else {
                var metaIrmao = mmParse(irmao.nome_jogo) || { kind: 'N' };
                var w2 = (metaIrmao.kind === 'B')
                    ? ((irmao.equipes && irmao.equipes[0]) ? Number(irmao.equipes[0].id_equipe) : null)
                    : vencedorDeEquipes(irmao.equipes);
                var w2Obj = (irmao.equipes || []).find(function(e) { return Number(e.id_equipe) === Number(w2); });
                if (w2 !== null) {
                    /* Um pai já encerrado é uma partida disputada, não um
                       contêiner para ser reconstruído a cada passagem pelos
                       filhos. Rezerar suas equipes aqui apagava o placar
                       lançado offline (os gols voltavam a 0x0) quando o
                       motor era reexecutado ao reabrir a tela. A reconstrução
                       explícita de uma fase usa `reconstruirAPartirDe` e
                       continua podendo limpar esse pai quando necessário. */
                    if (!jogoEncerrado(pai.status_jogo)) pai.equipes = [];
                    garantirEquipe(pai, w1, w1Obj);
                    garantirEquipe(pai, w2, w2Obj);
                    if (pai.equipes.length >= 2 && !jogoEncerrado(pai.status_jogo)) {
                        pai.status_jogo = 'Agendado';
                    }
                }
            }

        }

        return {
            processarConcluidos: function () {
                var fila = jogos.filter(function (j) {
                    var meta = mmParse(j.nome_jogo);
                    return meta && meta.largura > 1 && jogoEncerrado(j.status_jogo);
                }).slice();
                var guarda = 0;
                while (fila.length && guarda++ < 500) {
                    processarJogo(fila.shift(), fila);
                }
                return criouJogo;
            },
            reconstruirAPartirDe: function (larguraInicial) {
                // Espelho de sgi_chaveamento_rebuild_from_round(): zera as fases
                // posteriores (largura menor) e remove disputas de posição.
                for (var i = jogos.length - 1; i >= 0; i--) {
                    var meta = mmParse(jogos[i].nome_jogo);
                    if (!meta) continue;
                    if (meta.posicao !== undefined) {
                        delete mapaTag[jogos[i].nome_jogo];
                        jogos.splice(i, 1);
                        continue;
                    }
                    if (meta.largura > 0 && meta.largura < larguraInicial) {
                        jogos[i].equipes = [];
                        jogos[i].status_jogo = 'Agendado';
                    }
                }
                this.processarConcluidos();
            },
            mapaTag: mapaTag,
            mapaId: mapaId,
            houveCriacao: function () { return criouJogo; }
        };
    }

    /* Recalcula os campos derivados de exibição no mesmo formato produzido
       por sgi_mm_montar_json_arvore(), para _renderModernBracket funcionar
       sem alterações com dados remotos ou locais. */
    function recalcularDerivados(jogos) {
        var mapaTag = {};
        jogos.forEach(function (j) {
            if (mmParse(j.nome_jogo)) mapaTag[j.nome_jogo] = j;
        });

        jogos.forEach(function (jogo) {
            var meta = mmParse(jogo.nome_jogo);
            var faseNivel = meta ? meta.largura : null;
            var slot = meta ? meta.slot : null;
            var ehBye = !!meta && (meta.kind === 'B' ||
                ((jogo.equipes || []).length === 1 && jogoEncerrado(jogo.status_jogo)));
            var ehDisputaPosicao = !!meta && meta.posicao !== undefined;

            var proximoId = null;
            if (faseNivel !== null && faseNivel > 1 && slot !== null) {
                var pai = mapaTag[tagDaFase(jogo, proximaLargura(faseNivel), slotPai(slot), 'N')];
                proximoId = pai ? pai.id_jogo : null;
            }

            var venc = null;
            if (meta && jogoEncerrado(jogo.status_jogo)) {
                venc = (ehBye)
                    ? ((jogo.equipes && jogo.equipes[0]) ? Number(jogo.equipes[0].id_equipe) : null)
                    : vencedorDeEquipes(jogo.equipes);
            }

            var posicaoNaChave = slot !== null ? slot + 1 : null;
            var nomeFaseTxt = faseNivel ? nomeFase(faseNivel) : null;
            if (ehDisputaPosicao) nomeFaseTxt = nomeFasePosicao(meta.posicao);

            jogo.fase_nivel = faseNivel;
            jogo.posicao_na_chave = posicaoNaChave;
            jogo.eh_bye = ehBye;
            jogo.eh_disputa_posicao = ehDisputaPosicao;
            jogo.nome_fase = nomeFaseTxt;
            jogo.nome_jogo_display = (nomeFaseTxt && posicaoNaChave)
                ? nomeFaseTxt + ' — confronto ' + posicaoNaChave + (ehBye ? ' (bye)' : '')
                : jogo.nome_jogo;
            jogo.equipe_vencedora_id = venc;
            jogo.proximo_jogo_id = proximoId;
            jogo.vaga_garantida = ehBye || (venc !== null && proximoId !== null) || (venc !== null && faseNivel === 1);
        });

        // Mesma ordenação do PHP: fase_nivel DESC, posicao_na_chave ASC.
        jogos.sort(function (a, b) {
            var fa = Number(a.fase_nivel) || 0, fb = Number(b.fase_nivel) || 0;
            if (fa !== fb) return fb - fa;
            return (Number(a.posicao_na_chave) || 0) - (Number(b.posicao_na_chave) || 0);
        });
        return jogos;
    }

    /* Pipeline local: pendências → rebuild se vencedor mudou → avanço → derivados. */
    function processarLocalmente(jogosBase, reservasAgenda, locaisStore) {
        var jogos = JSON.parse(JSON.stringify(jogosBase)); // não mutar o snapshot original
        var mapaPorId = {};
        jogos.forEach(function (j) { mapaPorId[Number(j.id_jogo)] = j; });

        // Diretório de equipes conhecidas (nomes para promoção entre fases).
        var dirEquipes = {};
        jogos.forEach(function (j) {
            (j.equipes || []).forEach(function (e) {
                if (e.id_equipe != null) dirEquipes[Number(e.id_equipe)] = e;
            });
        });

        var vencedoresAntes = {};
        jogos.forEach(function (j) {
            var meta = mmParse(j.nome_jogo);
            if (meta && jogoEncerrado(j.status_jogo)) {
                vencedoresAntes[Number(j.id_jogo)] = meta.kind === 'B'
                    ? ((j.equipes && j.equipes[0]) ? Number(j.equipes[0].id_equipe) : null)
                    : vencedorDeEquipes(j.equipes);
            }
        });

        return coletarPendencias().then(function (ops) {
            if (!ops.length) {
                return { jogos: jogos, alterado: false };
            }

            var alterou = aplicarPendencias(jogos, ops, mapaPorId);

            // Placar de jogo concluído alterado e vencedor diferente → rebuild retroativo.
            var precisaRebuildLargura = Infinity;
            jogos.forEach(function (j) {
                var meta = mmParse(j.nome_jogo);
                if (!meta || meta.largura <= 1 || !jogoEncerrado(j.status_jogo)) return;
                var antes = vencedoresAntes[Number(j.id_jogo)];
                var agora = meta.kind === 'B'
                    ? ((j.equipes && j.equipes[0]) ? Number(j.equipes[0].id_equipe) : null)
                    : vencedorDeEquipes(j.equipes);
                if (antes != null && agora != null && antes !== agora && meta.largura < precisaRebuildLargura) {
                    precisaRebuildLargura = meta.largura;
                }
            });

            var menorId = 0;
            jogos.forEach(function (b) {
                var n = Number(b.id_jogo);
                if (!isNaN(n) && n < menorId) menorId = n;
            });

            var motor = criarMotorAvanco(jogos, dirEquipes, menorId - 1, reservasAgenda, locaisStore);
            if (precisaRebuildLargura !== Infinity) {
                motor.reconstruirAPartirDe(precisaRebuildLargura);
            } else {
                motor.processarConcluidos();
            }

            return { jogos: recalcularDerivados(jogos), alterado: alterou || motor.houveCriacao() };
        });
    }

    /* ------------------------- Camada de busca híbrida -------------------------
       1º: servidor PHP (fetch normal — online grava snapshot automaticamente).
       2º: cache IndexedDB (o fetch encapsulado já serve o snapshot offline;
           aqui tratamos também falhas totais lendo o cache explicitamente).
       Em qualquer origem, aplica pendências locais e avança a árvore no front. */

    function buscarArvore(idModalidade) {
        idModalidade = Number(idModalidade) || 0;
        var urlRel = apiBase() + 'chaveamentos?id_modalidade=' + idModalidade;

        return fetch(urlRel, { headers: { 'Accept': 'application/json' } })
            .then(function (resp) { return resp.json(); })
            .catch(function () { return null; })
            .then(function (data) {
                if (!data || !data.success) {
                    // Fallback explícito ao banco temporário JS (IndexedDB).
                    return lerCacheSnapshot(urlRel).then(function (snap) {
                        if (!snap) throw new Error('Sem dados remotos e sem cache local.');
                        return finalizar(snap.jogos || [], 'cache');
                    });
                }
                var fonteRede = navigator.onLine ? 'remota' : 'cache';
                return finalizar(data.jogos || [], fonteRede);
            });

        function finalizar(jogosBase, fonteOrigem) {
            /* Partidas derivadas criadas OFFLINE (ids negativos, _local)
               existem apenas nas tabelas do banco JS temporário — mescla-as
               com a base para que a árvore renderize a fase seguinte e o
               usuário consiga jogá-la (o placar lê direto das tabelas). */
            var DL = window.SGIDataLayer;
            var promessaLocais = (DL && typeof DL.read === 'function')
                ? Promise.all([DL.read('jogos'), DL.read('partidas'), DL.read('locais').catch(function () { return []; })])
                : Promise.resolve([[], [], []]);
            var promessaReservas = carregarReservasAgenda(idModalidade, jogosBase);

            return Promise.all([promessaLocais, promessaReservas]).then(function (dadosCompletos) {
                var dados = dadosCompletos[0] || [[], [], []];
                var reservasAgenda = dadosCompletos[1] || [];
                var jogosLocais = dados[0] || [];
                var partidasLocais = dados[1] || [];
                var locaisStore = dados[2] || [];
                aplicarReservasAgenda(jogosBase, reservasAgenda, locaisStore, idModalidade);


                jogosLocais.forEach(function (local) {
                    if (!mmParse(local.nome_jogo)) return;
                    if (idModalidade && local.modalidades_id_modalidade != null &&
                        Number(local.modalidades_id_modalidade) !== idModalidade) return;
                    var existente = jogosBase.filter(function (b) {
                        return b.nome_jogo === local.nome_jogo;
                    })[0];

                    // Quando o servidor ainda só conhece o jogo positivo, a
                    // linha negativa local é a fonte de verdade da partida
                    // derivada. Sem esta substituição a árvore voltava a
                    // apontar para o snapshot Agendado e escondia o placar
                    // recém-lançado ao reabrir a tela offline.
                    if (existente && Number(local.id_jogo) < 0) {
                        var cloneLocal = JSON.parse(JSON.stringify(local));
                        var partidasLocaisDoJogo = partidasLocais.filter(function (p) {
                            return String(p.jogos_id_jogo) === String(local.id_jogo);
                        });
                        if (partidasLocaisDoJogo.length) {
                            cloneLocal.equipes = partidasLocaisDoJogo.map(function (p) {
                                var referencia = (existente.equipes || []).filter(function (e) {
                                    return Number(e.id_equipe) === Number(p.equipes_id_equipe);
                                })[0];
                                return projetarEquipeLocal(p, referencia);
                            });
                        }
                        jogosBase[jogosBase.indexOf(existente)] = cloneLocal;
                        return;
                    }
                    if (existente) {
                        existente.status_jogo = local.status_jogo || existente.status_jogo;
                        if (local._offline_liberado === true) {
                            existente._offline_liberado = true;
                            existente.exige_horario_agendado = false;
                        }
                        var psExistente = partidasLocais.filter(function (p) {
                            return String(p.jogos_id_jogo) === String(local.id_jogo);
                        });
                        if (psExistente.length) {
                            existente.equipes = psExistente.map(function (p) {
                                var referencia = (existente.equipes || []).filter(function (e) {
                                    return Number(e.id_equipe) === Number(p.equipes_id_equipe);
                                })[0];
                                return projetarEquipeLocal(p, referencia);
                            });
                        }
                        return;
                    }
                    if (!existente) {
                        var clone = JSON.parse(JSON.stringify(local));
                        // Reanexa equipes/gols vindos das partidas locais
                        var ps = partidasLocais.filter(function (p) {
                            return String(p.jogos_id_jogo) === String(local.id_jogo);
                        });
                        if (ps.length) {
                            clone.equipes = ps.map(function (p) { return projetarEquipeLocal(p); });
                        }
                        jogosBase.push(clone);
                    }
                });

                if (!jogosBase.length) {
                    _ultimo = { fonte: fonteOrigem, idModalidade: idModalidade, jogos: [] };
                    return { jogos: [], fonte: fonteOrigem, idModalidade: idModalidade };
                }
                return processarLocalmente(jogosBase, reservasAgenda, locaisStore).then(function (res) {
                    var fonte = res.alterado ? 'local' : fonteOrigem;
                    _ultimo = { fonte: fonte, idModalidade: idModalidade, jogos: res.jogos };
                    return { jogos: res.jogos, fonte: fonte, idModalidade: idModalidade };
                });
            });
        }
    }

    function lerCacheSnapshot(urlRel) {
        var chave = urlAbsoluta(urlRel);
        if (!window.SGIOffline || typeof window.SGIOffline.getCached !== 'function') {
            return Promise.resolve(null);
        }
        return Promise.resolve(window.SGIOffline.getCached(chave)).then(function (rec) {
            if (!rec || !rec.text) return null;
            try {
                var dados = JSON.parse(rec.text);
                return (dados && dados.success) ? dados : null;
            } catch (e) { return null; }
        }).catch(function () { return null; });
    }

    /* --------------------------- Sincronização (volta) ---------------------------
       A fila de mutações contém exatamente os POSTs/PUTs originais feitos
       offline. Reenviá-los reproduz no PHP os mesmos disparos de avanço do
       modo online (resultados → sgi_chaveamento_processar_avanco),
       garantindo a reconstrução fiel da árvore no servidor. */

    function sincronizacaoConfirmada(resposta) {
        return !!resposta && Number(resposta.pending || 0) === 0 &&
            Number(resposta.failed || 0) === 0 && Number(resposta.needsReview || 0) === 0;
    }

    function sincronizar() {
        if (!window.SGIOffline || typeof window.SGIOffline.syncNow !== 'function') {
            // Sem a fila não há confirmação de que o PHP materializou os
            // confrontos temporários. Mantê-los é mais seguro que apagá-los.
            return Promise.resolve({ pending: 1, failed: 1, needsReview: 0 });
        }
        return window.SGIOffline.syncNow().then(function (res) {
            if (!sincronizacaoConfirmada(res)) return res;
            return purgarDerivadosLocais().then(function () { return res; });
        });
    }

    /* ================= PROMOÇÃO DE FASE LOCAL (Bracket Engine) =================
       Executada logo APÓS uma finalização offline gravar o resultado no banco
       temporário JS. Sem nenhuma dependência do PHP:

         1) Recupera o jogo finalizado nas tabelas locais (store "jogos") e as
            partidas/gols correspondentes (store "partidas").
         2) Identifica o vencedor (maior gols; empate → menor id_equipe).
         3) Monta o estado completo da árvore localmente: snapshot capturado
            enquanto online (chaveamentos?id_modalidade=X) SOBREPOSTO às
            linhas locais — assim decisões offline anteriores são respeitadas.
         4) Roda o motor de avanço (criarMotorAvanco) que percorre os jogos
            concluídos RECURSIVAMENTE: insere o vencedor na chave-pai
            (MM:largura/2:floor(slot/2):N), cria o pai se não existir,
            autoconclui chaves com bye implícito. A grande final (MM:2) é terminal:
            o campeão é derivado dela e não há um jogo solo adicional.
         5) PERSISTE no banco JS cada partida derivada que ainda não existia
            (id temporário negativo estável + partidas "mm_local_…", status
            'Agendado') para que a próxima fase possa ser jogada offline.
         6) Devolve à tela o resultado: adversário já definido (partida
            formada/liberada) ou aguardando (TBD). */

    function promoverVencedorLocal(idJogoAlvo) {
        var DL = window.SGIDataLayer;
        if (!DL || typeof DL.read !== 'function' || typeof DL.upsert !== 'function') {
            return Promise.resolve({ promoveu: false, motivo: 'sem_camada_local' });
        }
        idJogoAlvo = Number(idJogoAlvo);

        return Promise.all([
            DL.read('jogos'),
            DL.read('partidas'),
            coletarPendencias(),
            DL.read('equipes').catch(function () { return []; }),
            DL.read('turmas').catch(function () { return []; }),
            DL.read('modalidades').catch(function () { return []; }),
            DL.read('locais').catch(function () { return []; })
        ]).then(function (dados) {
            var jogosLocais = dados[0] || [];
            var partidasLocais = dados[1] || [];
            var ops = dados[2] || [];
            var equipesStore = dados[3] || [];
            var turmasStore = dados[4] || [];
            var modalidadesStore = dados[5] || [];
            var locaisStore = dados[6] || [];

            var mapTurmas = {};
            (Array.isArray(turmasStore) ? turmasStore : []).forEach(function (t) {
                if (t && t.id_turma) mapTurmas[t.id_turma] = t;
            });
            var dirEquipes = {};
            (Array.isArray(equipesStore) ? equipesStore : []).forEach(function (eq) {
                if (eq && eq.id_equipe) {
                    var idT = eq.turmas_id_turma || eq.id_turma;
                    var tObj = idT ? mapTurmas[idT] : null;
                    dirEquipes[Number(eq.id_equipe)] = {
                        id_equipe: Number(eq.id_equipe),
                        id_turma: idT || null,
                        nome_turma: (tObj && tObj.nome_turma) || '',
                        nome_fantasia: (tObj && (tObj.nome_fantasia_turma || tObj.nome_turma)) || eq.nome_equipe || '',
                        nome_equipe: eq.nome_equipe || ''
                    };
                }
            });

            /* 1) O jogo recém-finalizado */
            var alvo = jogosLocais.filter(function (j) { return Number(j.id_jogo) === idJogoAlvo; })[0];
            if (!alvo) return { promoveu: false, motivo: 'jogo_ausente' };
            var metaAlvo = mmParse(alvo.nome_jogo);
            if (!metaAlvo || metaAlvo.largura <= 1) {
                return { promoveu: false, motivo: 'nao_mata_mata' };
            }
            var idModalidade = Number(alvo.modalidades_id_modalidade || alvo.id_modalidade || 0);
            var modalidadeCadastro = modalidadesStore.filter(function (m) {
                return Number(m && m.id_modalidade) === idModalidade;
            })[0];
            if (!alvo.id_interclasse && modalidadeCadastro) {
                alvo.id_interclasse = modalidadeCadastro.interclasses_id_interclasse;
            }

            var urlArvore = apiBase() + 'chaveamentos?id_modalidade=' + idModalidade;
            return Promise.all([
                lerCacheSnapshot(urlArvore),
                carregarReservasAgenda(idModalidade, jogosLocais.concat([alvo]))
            ]).then(function (fontes) {
                var snap = fontes[0];
                var reservasAgenda = fontes[1] || [];
                /* 3) Base = snapshot remoto clonado + sobreposição local */
                var base = snap && Array.isArray(snap.jogos) ? JSON.parse(JSON.stringify(snap.jogos)) : [];

                // 3a) Linhas locais refletem finalizações/promoções anteriores
                //     feitas offline (inclusive partidas derivadas, ids < 0).
                jogosLocais.forEach(function (local) {
                    if (!mmParse(local.nome_jogo)) return;
                    if (idModalidade && local.modalidades_id_modalidade != null &&
                        Number(local.modalidades_id_modalidade) !== idModalidade) return;
                    var existente = base.filter(function (b) { return b.nome_jogo === local.nome_jogo; })[0];
                    if (!existente) {
                        base.push(JSON.parse(JSON.stringify(local)));
                        return;
                    }
                    // Um derivado local negativo é a versão operacional mais
                    // recente do confronto. Substituir o ID positivo do
                    // snapshot evita que a finalização/placar seja aplicada
                    // ao jogo remoto antigo e permite reabrir o mesmo jogo
                    // offline com suas partidas textuais mm_local_*.
                    if (Number(local.id_jogo) < 0) {
                        var indiceLocal = base.indexOf(existente);
                        base[indiceLocal] = Object.assign({}, existente, JSON.parse(JSON.stringify(local)), {
                            id_jogo: local.id_jogo
                        });
                        return;
                    }
                    existente.status_jogo = local.status_jogo || existente.status_jogo;
                    if (local.modalidades_id_modalidade != null) {
                        existente.modalidades_id_modalidade = local.modalidades_id_modalidade;
                    }
                });
                aplicarReservasAgenda(base, reservasAgenda, locaisStore, idModalidade);

                // 3b) Gols/equipes sempre vêm das partidas locais (fonte mais fresca)
                base.forEach(function (b) {
                    var ps = partidasLocais.filter(function (p) {
                        return String(p.jogos_id_jogo) === String(b.id_jogo);
                    });
                    if (!ps.length) return;
                    b.equipes = ps.map(function (p) {
                        var idEq = Number(p.equipes_id_equipe);
                        var referencia = (b.equipes || []).filter(function (e) {
                            return Number(e.id_equipe) === idEq;
                        })[0] || dirEquipes[idEq] || {};
                        return projetarEquipeLocal(p, referencia);
                    });
                });

                /* 4a) Pendências da fila (inclui a finalização que acabou de ocorrer) */
                var mapaPorId = {};
                base.forEach(function (b) { mapaPorId[Number(b.id_jogo)] = b; });
                aplicarPendencias(base, ops, mapaPorId);

                /* 4b) Motor de avanço recursivo (pai → bye implícito → campeão) */
                base.forEach(function (b) {
                    (b.equipes || []).forEach(function (e) {
                        if (e && e.id_equipe != null) {
                            var idEq = Number(e.id_equipe);
                            dirEquipes[idEq] = Object.assign({}, dirEquipes[idEq] || {}, e);
                        }
                    });
                });

                /* Menor id já ocupado (snapshot + linhas locais persistidas):
                   o motor criará novos ids temporários ABAIXO dele. */
                var menorId = 0;
                base.concat(jogosLocais).forEach(function (b) {
                    var n = Number(b.id_jogo);
                    if (!isNaN(n) && n < menorId) menorId = n;
                });

                var motor = criarMotorAvanco(base, dirEquipes, menorId - 1, reservasAgenda, locaisStore);
                motor.processarConcluidos();
                recalcularDerivados(base);

                /* A final é terminal e não gera uma partida adicional. */
                var ehFinal = metaAlvo.largura === 2;
                var pai = null;
                if (!ehFinal) {
                    var tagPai = tagDaFase(alvo, proximaLargura(metaAlvo.largura), slotPai(metaAlvo.slot), 'N');
                    pai = base.filter(function (b) { return b.nome_jogo === tagPai; })[0];
                    if (!pai) return { promoveu: false, motivo: 'pai_indisponivel' };
                }

                /* 5) Persistência no banco JS temporário */
                var escritas = [];
                base.forEach(function (b) {
                    var linhaLocal = jogosLocais.filter(function (j) {
                        return Number(j.id_jogo) === Number(b.id_jogo);
                    })[0];

                    if (Number(b.id_jogo) < 0 || b._offline_liberado === true) {
                        // Partida derivada offline: SEMPRE garante o jogo e TODAS as suas equipes em 'partidas'
                        var rowJogo = JSON.parse(JSON.stringify(b));
                        rowJogo._local = true;
                        rowJogo._pendente = true;
                        rowJogo._offline_liberado = true;
                        rowJogo.exige_horario_agendado = false;
                        // A agenda renderiza o confronto pelo resumo textual,
                        // enquanto o placar usa as linhas de `partidas`.
                        // Persistir ambos mantém as duas telas coerentes.
                        rowJogo.equipes_nomes = (b.equipes || []).map(function (eq) {
                            var info = dirEquipes[Number(eq.id_equipe)] || {};
                            return String(eq.nome_equipe || info.nome_equipe ||
                                eq.nome_fantasia || eq.nome_fantasia_turma ||
                                info.nome_fantasia || eq.nome_turma || info.nome_turma || '').trim();
                        }).filter(Boolean).join(' vs ');
                        if (!rowJogo.modalidades_id_modalidade && idModalidade) {
                            rowJogo.modalidades_id_modalidade = idModalidade;
                        }
                        if (Array.isArray(modalidadesStore) && rowJogo.modalidades_id_modalidade) {
                            var mObj = modalidadesStore.find(function (m) {
                                return Number(m.id_modalidade) === Number(rowJogo.modalidades_id_modalidade);
                            });
                            if (mObj) {
                                if (!rowJogo.nome_modalidade) rowJogo.nome_modalidade = mObj.nome_modalidade;
                                if (!rowJogo.tipos_modalidades_id_tipo_modalidade) rowJogo.tipos_modalidades_id_tipo_modalidade = mObj.tipos_modalidades_id_tipo_modalidade;
                                if (!rowJogo.nome_tipo_modalidade) rowJogo.nome_tipo_modalidade = mObj.nome_tipo_modalidade;
                            }
                        }
                        // O confronto foi gerado pelo motor de mata-mata, mas
                        // o snapshot local pode não trazer a descrição do tipo.
                        // Preserve a semântica explicitamente para que a agenda
                        // não trate a partida derivada como tipo desconhecido.
                        if (!rowJogo.tipo_competicao) rowJogo.tipo_competicao = 'mata_mata';
                        if (!rowJogo.nome_tipo_modalidade) rowJogo.nome_tipo_modalidade = 'Mata-Mata';
                        escritas.push(DL.upsert('jogos', b.id_jogo, rowJogo));

                        (b.equipes || []).forEach(function (eq, i) {
                            var idPartida = 'mm_local_' + b.id_jogo + '_' + (eq.id_equipe || i);
                            var info = dirEquipes[Number(eq.id_equipe)] || {};
                            escritas.push(DL.upsert('partidas', idPartida, {
                                id_partida: idPartida,
                                jogos_id_jogo: b.id_jogo,
                                equipes_id_equipe: Number(eq.id_equipe),
                                resultado_partida: eq.gols || 0,
                                id_turma: eq.id_turma || info.id_turma || null,
                                nome_turma: eq.nome_turma || info.nome_turma || '',
                                nome_fantasia_turma: eq.nome_fantasia || eq.nome_fantasia_turma || info.nome_fantasia || eq.nome_equipe || info.nome_equipe || '',
                                nome_equipe: eq.nome_equipe || info.nome_equipe || '',
                                _local: true,
                                _pendente: true
                            }));
                        });
                    } else if (linhaLocal && linhaLocal.status_jogo !== b.status_jogo &&
                               jogoEncerrado(b.status_jogo)) {
                        // Autoconclusão local (bye implícito / campeão) sobre
                        // jogo já conhecido: apenas atualiza o status.
                        escritas.push(DL.upsert('jogos', b.id_jogo,
                            Object.assign({}, linhaLocal, { status_jogo: b.status_jogo, _pendente: true })));
                    }
                });

                return Promise.all(escritas).then(function () {
                    var jogoAlvoAtualizado = base.filter(function (b) { return Number(b.id_jogo) === idJogoAlvo; })[0];
                    var vencedorFinal = vencedorDeEquipes(jogoAlvoAtualizado ? jogoAlvoAtualizado.equipes : []);
                    if (ehFinal) {
                        return {
                            promoveu: true,
                            encerrado: true,
                            campeao: vencedorFinal,
                            vencedor: vencedorFinal,
                            pai: null
                        };
                    }
                    var displayPai = pai.eh_disputa_posicao
                        ? pai.nome_fase
                        : ((pai.nome_fase || 'Próxima fase') + ' — confronto ' + (pai.posicao_na_chave || (slotPai(metaAlvo.slot) + 1)));
                    return {
                        promoveu: true,
                        vencedor: vencedorFinal,
                        pai: {
                            id_jogo: pai.id_jogo,
                            nome_jogo: pai.nome_jogo,
                            nome_display: displayPai,
                            status_jogo: pai.status_jogo,
                            formada: (pai.equipes || []).length >= 2
                        }
                    };
                });
            });
        });
    }

    /* Após sincronizar, o servidor reconstrói a árvore com IDs definitivos.
       As partidas derivadas locais (_local ou id_jogo < 0) então viram lixo — remove-as para
       evitar duplicidade nas leituras locais e expurga os arquivos temporários de sgi_pages. */
    function purgarDerivadosLocais() {
        var DL = window.SGIDataLayer;
        var pLimpeza = Promise.resolve();
        if (DL && typeof DL.read === 'function' && typeof DL.removeRecord === 'function') {
            pLimpeza = Promise.all(['jogos', 'partidas'].map(function (store) {
                return DL.read(store).then(function (rows) {
                    return Promise.all((rows || []).filter(function (r) {
                        return r && (r._local || Number(r.id_jogo) < 0 || String(r.id_partida || '').indexOf('mm_local_') === 0);
                    }).map(function (r) {
                        var id = (store === 'partidas') ? r.id_partida : r.id_jogo;
                        return DL.removeRecord(store, id);
                    }));
                });
            }));
        }

        return pLimpeza.then(function () {
            if (window.indexedDB) {
                return new Promise(function (resolve) {
                    try {
                        var req = indexedDB.open('sgi_pages', 1);
                        req.onsuccess = function (e) {
                            var db = e.target.result;
                            if (!db.objectStoreNames.contains('paginas')) return resolve();
                            var tx = db.transaction('paginas', 'readwrite');
                            var store = tx.objectStore('paginas');
                            var rAll = store.getAll();
                            rAll.onsuccess = function () {
                                var chaveCache = (typeof window !== 'undefined' && window.SGI_CACHE_KEY)
                                    ? String(window.SGI_CACHE_KEY) + '|'
                                    : '';
                                (rAll.result || []).forEach(function (row) {
                                    if (chaveCache && row && row.key && row.key.indexOf(chaveCache) === 0 &&
                                        (row.key.indexOf('jogos:-') > -1 || row.key.indexOf('id_jogo=-') > -1)) {
                                        store.delete(row.key);
                                    }
                                });
                            };
                            tx.oncomplete = resolve;
                            tx.onerror = resolve;
                        };
                        req.onerror = resolve;
                    } catch (err) { resolve(); }
                });
            }
        }).catch(function () { /* noop */ });
    }

    /* Volta de conexão: envia a fila ao PHP e limpa os derivados locais. */
    if (typeof window.addEventListener === 'function') {
        window.addEventListener('online', function () {
            sincronizar();
        });
    }

    window.SGIChaveamento = {
        carregarArvore: buscarArvore,
        sincronizar: sincronizar,
        promoverVencedorLocal: promoverVencedorLocal,
        purgarDerivadosLocais: purgarDerivadosLocais,
        ultimoResultado: function () { return _ultimo; }
    };
})();
