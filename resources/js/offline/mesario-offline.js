/* ============================================================
   SGI MESARIO OFFLINE — SPA + Preload para o mesario

   Transforma a dashboard do mesario numa casca fixa e baixa,
   enquanto houver conexao, as telas e os dados que ele precisa
   para operar 100% offline (sem Service Worker).

   Dependencias (carregadas antes, no cabeçalho compartilhado):
     - offline-core.js      (cache GET por URL + fila de mutacoes)
     - offline-form.js       (forms com data-sgi-offline)

   Esse arquivo so age quando:
     - window.SGI_SESSION_NIVEL === 2 (mesario); e
     - existe #conteudo-principal (dashboard-casca).
   ============================================================ */
(function () {
    'use strict';
    if (window.__SGI_MESARIO_SPA__) return;
    window.__SGI_MESARIO_SPA__ = true;

    // Namespace opaco por usuário. O ID persistente não é usado diretamente
    // como chave de cache e a fila continua acessível após novo login.
    var SESSION = (typeof window !== 'undefined' && window.SGI_CACHE_KEY)
        ? String(window.SGI_CACHE_KEY) : 'anon';
    var USER_ID = (typeof window !== 'undefined' && window.SGI_SESSION_ID)
        ? String(window.SGI_SESSION_ID) : '';
    var DB_NAME = 'sgi_pages';
    var DB_VERSION = 1;
    // O timeout evita que uma requisição presa deixe a preparação offline
    // bloqueada para sempre. A espera para retomar é maior que a janela de
    // "soft offline" do offline-core (15s), para a próxima tentativa voltar
    // a consultar a rede de verdade.
    var PRELOAD_TIMEOUT_MS = 15000;
    var PRELOAD_RETRY_DELAY_MS = 16000;
    var PRELOAD_MAX_AUTO_RETRIES = 3;
    var PRONTO_STORAGE_KEY = 'sgi_pronto_v2_' + SESSION;

    var ARQ_TELA = {
        'perfil': 'perfil',
        'edicoes/agenda': 'agenda',
        'chaveamento': 'chaveamento',
        'ocorrencias': 'ocorrencias',
        'jogos': 'jogoslista',
        'jogos/placar': 'jogos',
        'painel': 'dashboard'
    };

    var TELA_TITULO = {
        perfil: 'Meu perfil',
        agenda: 'Agenda',
        chaveamento: 'Chaveamentos',
        ocorrencias: 'Ocorrências',
        jogoslista: 'Jogos',
        jogos: 'Placar',
        dashboard: 'Dashboard'
    };

    function tituloDocumento(titulo, fallback) {
        var nome = String(titulo || '').trim().replace(/\s*\|\s*SGI$/i, '').trim();
        if (!nome || nome === 'SGI') nome = String(fallback || 'SGI').trim();
        return nome && nome !== 'SGI' ? nome + ' | SGI' : 'SGI';
    }

    var state = {
        nivel: -1,
        temCasca: false,
        dashHtml: '',
        pronto: false,
        preloading: false,
        montadas: {},
        registros: {},
        pendentesInit: [],
        montando: null,
        retryTimer: null,
        retryAttempts: 0,
        retryPendente: false,
        ultimaFalha: null,
        cronogramaObsoleto: false
    };

    /* ============================ Util ============================ */

    function runSafe(fn) {
        try { fn(); } catch (e) {
            if (window.console) console.error('[SGI Mesario SPA]', e);
        }
    }

    function apiBase() {
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
    }

    function resolverAbs(urlRel) {
        try {
            var base = window.SGI_BASE_PATH ? '/' + String(window.SGI_BASE_PATH).replace(/^\/+|\/+$/g, '') : '';
            var caminho = String(urlRel || '').replace(/^\/+/, '');
            return new URL(base + '/' + caminho, window.location.origin).href;
        }
        catch (e) { return urlRel; }
    }

    function resolverPath(urlRel) {
        var base = window.SGI_BASE_PATH ? '/' + String(window.SGI_BASE_PATH).replace(/^\/+|\/+$/g, '') : '';
        return base + '/' + String(urlRel || '').replace(/^\/+/, '');
    }

    function criarErroPreload(tipo, mensagem, causa) {
        var erro = new Error(mensagem || 'Falha ao preparar dados para uso offline.');
        erro.sgiPreloadTipo = tipo || 'desconhecido';
        erro.causa = causa || null;
        return erro;
    }

    function tipoErroPreload(erro) {
        if (erro && erro.sgiPreloadTipo) return erro.sgiPreloadTipo;
        if (navigator.onLine === false) return 'rede';
        var nome = String((erro && erro.name) || '').toLowerCase();
        var mensagem = String((erro && erro.message) || '').toLowerCase();
        if (nome === 'aborterror' || mensagem.indexOf('timeout') > -1) return 'timeout';
        if (mensagem.indexOf('dados não disponíveis offline') > -1 ||
            mensagem.indexOf('dados nao disponiveis offline') > -1 ||
            mensagem.indexOf('failed to fetch') > -1 ||
            mensagem.indexOf('network') > -1 ||
            mensagem.indexOf('load failed') > -1) return 'rede';
        return 'desconhecido';
    }

    function validarRespostaPreload(resposta, url) {
        if (resposta && resposta.ok) return resposta;
        var status = resposta ? Number(resposta.status || 0) : 0;
        var destino = url ? ' (' + url + ')' : '';
        if (status === 401 || status === 403) {
            throw criarErroPreload('sessao', 'Sua sessão não permite concluir o download' + destino + '.');
        }
        if (status >= 500) {
            throw criarErroPreload('servidor', 'O servidor respondeu com erro ' + status + destino + '.');
        }
        throw criarErroPreload('http', 'A resposta HTTP ' + (status || 'desconhecida') + destino + ' não pôde ser usada.');
    }

    function buscarComTimeout(url) {
        var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var opcoes = controller ? { signal: controller.signal } : {};
        return new Promise(function (resolve, reject) {
            var concluido = false;
            var timeout = setTimeout(function () {
                if (concluido) return;
                concluido = true;
                try { if (controller) controller.abort(); } catch (e) {}
                reject(criarErroPreload('timeout', 'A solicitação demorou mais que o esperado (' + PRELOAD_TIMEOUT_MS / 1000 + ' s).'));
            }, PRELOAD_TIMEOUT_MS);

            fetch(url, opcoes).then(function (resposta) {
                if (concluido) return;
                concluido = true;
                clearTimeout(timeout);
                resolve(resposta);
            }).catch(function (erro) {
                if (concluido) return;
                concluido = true;
                clearTimeout(timeout);
                reject(criarErroPreload(tipoErroPreload(erro), (erro && erro.message) || 'Falha de rede ao baixar dados.', erro));
            });
        });
    }

    function requisitarTexto(url) {
        return buscarComTimeout(url).then(function (resposta) {
            return validarRespostaPreload(resposta, url).text();
        }).then(function (texto) {
            if (isLoginHtml(texto)) {
                throw criarErroPreload('sessao', 'A solicitação foi redirecionada para a tela de login.');
            }
            return texto;
        });
    }

    function fetchJson(url) {
        return requisitarTexto(url).then(function (texto) {
            if (!texto) return {};
            var dados;
            try {
                dados = JSON.parse(texto);
            } catch (e) {
                throw criarErroPreload('resposta', 'O servidor devolveu uma resposta inválida para ' + url + '.', e);
            }
            if (dados && dados.success === false) {
                throw criarErroPreload('servidor', dados.message || dados.mensagem || 'O servidor recusou a solicitação.');
            }
            return dados;
        });
    }

    function obterIdAtivo() {
        var p = new URLSearchParams(window.location.search);
        var id = p.get('id');
        if (id) return Promise.resolve(String(id));

        if (window.SGI_SESSION_INTERCLASSE_ATIVO) {
            return Promise.resolve(String(window.SGI_SESSION_INTERCLASSE_ATIVO));
        }

        if (window.SGIInterclasse && typeof window.SGIInterclasse.getActiveInterclasse === 'function') {
            return window.SGIInterclasse.getActiveInterclasse().then(function (a) {
                return (a && a.id_interclasse) ? String(a.id_interclasse) : null;
            }).catch(function () { return null; });
        }
        return Promise.resolve(null);
    }

    function chaveTela(tela, params) {
        params = params || {};
        if (tela === 'jogos') return 'jogos:' + (params.id_jogo || '');
        if (tela === 'ocorrencias') return 'ocorrencias:' + (params.id || '');
        if (tela === 'chaveamento') return 'chaveamento:' + (params.id || '');
        if (tela === 'jogoslista') return 'jogoslista:' + (params.id || '');
        if (tela === 'perfil') return 'perfil:' + (params.id || '');
        if (tela === 'agenda') return 'agenda:' + (params.id || '');
        return 'dashboard';
    }

    function construirUrl(tela, params) {
        params = params || {};
        switch (tela) {
            case 'agenda':
                return 'edicoes/agenda' + (params.id ? '?id=' + params.id : '');
            case 'chaveamento':
                return 'chaveamento' + (params.id ? '?id=' + params.id : '');
            case 'ocorrencias':
                return 'ocorrencias' + (params.id ? '?id=' + params.id : '');
            case 'jogoslista':
                return 'jogos' + (params.id ? '?id=' + params.id : '');
            case 'perfil':
                return 'perfil' + (params.id ? '?id=' + params.id : '');
            case 'jogos':
                return 'jogos/placar?id_jogo=' + params.id_jogo +
                    (params.origem ? '&origem=' + encodeURIComponent(params.origem) : '');
            default:
                return 'painel' + (params.id ? '?id=' + params.id : '');
        }
    }

    function mapearTela(pathWithQuery) {
        var qIndex = pathWithQuery.indexOf('?');
        var path = qIndex > -1 ? pathWithQuery.slice(0, qIndex) : pathWithQuery;
        var segmentos = path.replace(/^\/+/, '').split('/');
        var ultimo = segmentos[segmentos.length - 1] || '';
        var penultimo = segmentos.length > 1 ? segmentos[segmentos.length - 2] + '/' + ultimo : ultimo;
        var nome = ARQ_TELA[penultimo] ? penultimo : ultimo;
        var tela = ARQ_TELA[nome];
        if (!tela) return null;
        var params = {};
        if (qIndex > -1) {
            var up = new URLSearchParams(pathWithQuery.slice(qIndex + 1));
            if (up.has('id')) params.id = up.get('id');
            if (up.has('id_jogo')) params.id_jogo = up.get('id_jogo');
            if (up.has('origem')) params.origem = up.get('origem');
        }
        return { tela: tela, params: params };
    }

    /* ====================== IndexedDB (sgi_pages) ====================== */

    var dbPromise = null;

    function openDB() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise(function (resolve, reject) {
            try {
                var req = indexedDB.open(DB_NAME, DB_VERSION);
                req.onupgradeneeded = function (e) {
                    var d = e.target.result;
                    if (!d.objectStoreNames.contains('paginas')) {
                        d.createObjectStore('paginas', { keyPath: 'key' });
                    }
                };
                req.onsuccess = function () { resolve(req.result); };
                req.onerror = function () { reject(req.error); };
                req.onblocked = function () {};
            } catch (err) { reject(err); }
        });
        return dbPromise;
    }

    function idbGet(chave) {
        var key = SESSION + '|' + chave;
        return openDB().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction('paginas', 'readonly');
                var r = tx.objectStore('paginas').get(key);
                r.onsuccess = function () { resolve(r.result || null); };
                r.onerror = function () { reject(r.error); };
            });
        });
    }

    function idbPut(chave, rec) {
        rec.key = SESSION + '|' + chave;
        return openDB().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction('paginas', 'readwrite');
                tx.objectStore('paginas').put(rec);
                tx.oncomplete = resolve;
                tx.onerror = function () { reject(tx.error); };
            });
        });
    }

    function idbRemove(chave) {
        var key = SESSION + '|' + chave;
        return openDB().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction('paginas', 'readwrite');
                tx.objectStore('paginas').delete(key);
                tx.oncomplete = resolve;
                tx.onerror = function () { reject(tx.error); };
            });
        });
    }

    function isLoginHtml(html) {
        if (!html || typeof html !== 'string') return false;
        var h = html.toLowerCase();
        return h.indexOf('ipt-matricula') > -1 ||
            h.indexOf('form_mobile') > -1 ||
            h.indexOf('form_desktop') > -1 ||
            h.indexOf('api/v1/login') > -1 ||
            h.indexOf('acesso ao sistema') > -1 ||
            h.indexOf('painel de acesso') > -1 ||
            h.indexOf('sgi - login') > -1 ||
            (h.indexOf('name="matricula"') > -1 && h.indexOf('name="senha"') > -1);
    }

    function purgarPaginasInvalidas() {
        return openDB().then(function (db) {
            return new Promise(function (resolve) {
                var tx = db.transaction('paginas', 'readwrite');
                var store = tx.objectStore('paginas');
                var req = store.getAll();
                req.onsuccess = function () {
                    var rows = req.result || [];
                    rows.forEach(function (r) {
                        if (r && isLoginHtml(r.html)) {
                            store.delete(r.key);
                        }
                    });
                };
                tx.oncomplete = resolve;
                tx.onerror = resolve;
            });
        }).catch(function () {});
    }

    // Quando a conexão cai antes de a edição ativa ser resolvida, ainda é
    // possível abrir a última cópia já baixada daquela tela para a sessão.
    function idbFindTela(tela, params) {
        params = params || {};
        var edicaoEsperada = params.id ? String(params.id) : '';
        return openDB().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx = db.transaction('paginas', 'readonly');
                var r = tx.objectStore('paginas').getAll();
                r.onsuccess = function () {
                    var prefixo = SESSION + '|';
                    var itens = (r.result || []).filter(function (item) {
                        if (!item || item.key.indexOf(prefixo) !== 0 || item.tela !== tela || isLoginHtml(item.html)) return false;
                        if (!edicaoEsperada) return true;
                        if (item.interclasseId != null) return String(item.interclasseId) === edicaoEsperada;
                        try {
                            var url = new URL(item.url || '', window.location.href);
                            return String(url.searchParams.get('id') || '') === edicaoEsperada;
                        } catch (e) { return false; }
                    }).sort(function (a, b) { return (b.savedAt || 0) - (a.savedAt || 0); });
                    resolve(itens[0] || null);
                };
                r.onerror = function () { reject(r.error); };
            });
        });
    }

    /* ==================== Captura / download das telas ==================== */

    function extrairScreen(html) {
        if (isLoginHtml(html)) {
            throw new Error('Página de login capturada indevidamente.');
        }
        var doc = new DOMParser().parseFromString(html, 'text/html');
        if (doc.querySelector('.ipt-matricula, #form_mobile, #form_desktop, form[action*="login"]')) {
            throw new Error('Página de login capturada indevidamente.');
        }
        var partes = [];
        var css = '';
        var pageScripts = [];

        doc.querySelectorAll('style').forEach(function (st) {
            css += '\n' + st.textContent;
        });

        doc.querySelectorAll('main').forEach(function (m) {
            partes.push(m.outerHTML);
        });

        doc.querySelectorAll('script').forEach(function (s) {
            if (s.hasAttribute('data-sgi-config')) {
                partes.push(s.outerHTML);
                return;
            }
            if (s.hasAttribute('data-sgi-page')) {
                pageScripts.push(s.getAttribute('src'));
                return;
            }
            if (s.src) return;
            var t = s.textContent || '';
            if (!t.trim()) return;
            if (t.indexOf('SGI_SESSION_ID') > -1) return;
            if (t.indexOf('__SGI_OFFLINE_CORE__') > -1) return;
            if (t.indexOf('__SGI_OFFLINE_FORM__') > -1) return;
        });

        // Periféricos fora do <main>: FAB e modais (ex.: jogos). Copiamos
        // somente a raiz de cada periférico: os campos internos de um modal
        // também podem ter "modal" no id e, se forem copiados isoladamente,
        // escapam do overlay e aparecem no rodapé da tela.
        var vistos = {};
        var seletorPerifericos = '[data-bs-toggle="modal"],[data-bs-target],[id*="modal" i],[class*="fab"]';
        doc.body.querySelectorAll(seletorPerifericos).forEach(function (el) {
            // A navegação compacta já pertence à casca inicial. Não a copie
            // para cada tela, pois isso criaria dois gatilhos/offcanvas após
            // uma troca de rota na SPA.
            if (el.matches('.sgi-mobile-menu-trigger, .sgi-mobile-menu') || el.closest('.sgi-mobile-menu')) return;
            if (el.closest('main')) return;
            if (el.parentElement && el.parentElement.closest(seletorPerifericos)) return;
            var tag = el.tagName;
            if (tag === 'NAV' || tag === 'FOOTER' || tag === 'SCRIPT' || tag === 'STYLE') return;
            var id = el.id || el.className || '';
            if (vistos[id]) return;
            vistos[id] = true;
            partes.push(el.outerHTML);
        });

        return {
            html: partes.join('\n'),
            css: css,
            pageScripts: pageScripts,
            titulo: doc.title || 'SGI'
        };
    }

    function baixarTela(tela, params) {
        var url = construirUrl(tela, params || {});
        var abs = resolverAbs(url);
        return requisitarTexto(abs).then(function (html) {
            var rec;
            try {
                rec = extrairScreen(html);
            } catch (erro) {
                if (isLoginHtml(html)) {
                    throw criarErroPreload('sessao', 'A tela ' + (TELA_TITULO[tela] || tela) + ' foi redirecionada para o login.', erro);
                }
                throw criarErroPreload('resposta', 'Não foi possível preparar a tela ' + (TELA_TITULO[tela] || tela) + ' para uso offline.', erro);
            }
            rec.url = url;
            rec.tela = tela;
            if (params && params.id != null) rec.interclasseId = String(params.id);
            rec.titulo = tituloDocumento(rec.titulo, TELA_TITULO[tela]);
            rec.savedAt = Date.now();
            var key = chaveTela(tela, params);
            // Store source together with its HTML/config so reopening offline
            // never combines one deployment's markup with another's code.
            return Promise.all(rec.pageScripts.map(function (src) {
                var asset = new URL(src, abs);
                if (asset.origin !== window.location.origin) throw new Error('Script de página externo.');
                return requisitarTexto(asset.href);
            })).then(function (sources) {
                rec.pageSources = sources;
                rec.schemaVersion = 2;
                return idbPut(key, rec).then(function () { return rec; });
            });
        });
    }

    function obterRegistro(tela, params) {
        var key = chaveTela(tela, params);
        return idbGet(key).then(function (rec) {
            if (rec && isLoginHtml(rec.html)) {
                return idbRemove(key).then(function () { return null; });
            }
            // A navegação do mesário não depende de recarregar o documento:
            // quando há conexão, atualiza a tela e seus dados no servidor
            // antes de reutilizar a cópia preparada para offline. Se a rede
            // falhar, a cópia anterior continua disponível sem interromper a
            // operação em andamento.
            if (rec) {
                if (navigator.onLine !== false) {
                    return baixarTela(tela, params).catch(function () { return rec; });
                }
                return rec;
            }
            function alternativaOuErro() {
                return idbFindTela(tela, params).then(function (alternativa) {
                    if (alternativa && isLoginHtml(alternativa.html)) {
                        return null;
                    }
                    if (alternativa) {
                        // Partidas criadas pelo motor de chaveamento offline
                        // usam IDs negativos e não possuem uma página própria
                        // no cache de telas. Reaproveitamos o shell de jogos
                        // já baixado, mas preservamos a URL solicitada para
                        // que jogos leia o ID temporário e carregue o jogo
                        // diretamente do SGIDataLayer (em vez de reabrir o
                        // último jogo positivo armazenado).
                        if (tela === 'jogos' && params && Number(params.id_jogo) < 0) {
                            alternativa = Object.assign({}, alternativa, {
                                url: construirUrl(tela, params)
                            });
                        }
                        return alternativa;
                    }
                    throw new Error('sem cache offline');
                });
            }
            // navigator.onLine pode continuar true quando o servidor local
            // está indisponível; nesse caso tenta rede e depois o cache.
            if (navigator.onLine !== false) return baixarTela(tela, params).catch(alternativaOuErro);
            return alternativaOuErro().then(function (alternativa) {
                if (alternativa) return alternativa;
                throw new Error('sem cache offline');
            });
        });
    }

    /* ============================ Navegacao SPA ============================ */

    function pushEstado(tela, key, url) {
        try {
            history.pushState({ sgi: { tela: tela, key: key } }, '', resolverPath(url));
        } catch (e) {
            try { history.pushState({ sgi: { tela: tela, key: key } }, ''); } catch (e2) {}
        }
    }

    function aplicarCss(css) {
        var el = document.getElementById('sgi-screen-css');
        if (!el) {
            el = document.createElement('style');
            el.id = 'sgi-screen-css';
            document.head.appendChild(el);
        }
        el.textContent = css || '';
    }

    function executarScripts(scriptConjunto) {
        if (!scriptConjunto) return;
        var code = String(scriptConjunto).trim();
        if (!code) return;
        try {
            var s = document.createElement('script');
            s.textContent = code;
            document.body.appendChild(s);
            if (s.parentNode) s.parentNode.removeChild(s);
        } catch (e) {
            if (window.console) console.error('[SGI Mesario SPA] script da tela', e);
        }
    }

    function registrarInit(fn) {
        if (typeof fn !== 'function') return;
        if (state.montando) {
            state.pendentesInit.push(fn);
        } else {
            runSafe(fn);
        }
    }

    // Cada tela pode registrar uma limpeza própria. Ela é chamada antes da
    // substituição do DOM para impedir que timers e callbacks assíncronos
    // tentem atualizar elementos de uma tela já desmontada.
    function desmontarTelaAtual(proximaRaiz) {
        var conteudo = document.getElementById('conteudo-principal');
        var atual = conteudo && conteudo.firstElementChild;
        if (!atual || atual === proximaRaiz) return;
        var cleanup = window.__SGI_TELA_CLEANUP__;
        if (typeof cleanup === 'function') {
            try { cleanup(); } catch (e) {
                if (window.console) console.warn('[SGI SPA] limpeza da tela', e);
            }
        }
        window.__SGI_TELA_CLEANUP__ = null;
        if (window.SGIPage) window.SGIPage.deactivate();
    }

    function navegarPara(tela, params) {
        params = params || {};
        var precisaId = (tela === 'ocorrencias' || tela === 'jogoslista' || tela === 'agenda' || tela === 'chaveamento');
        if (precisaId && !params.id) {
            return obterIdAtivo().then(function (id) {
                if (id) params.id = id;
                navegarParaFinal(tela, params);
            });
        }
        navegarParaFinal(tela, params);
    }

    function navegarParaFinal(tela, params) {
        var conteudo = document.getElementById('conteudo-principal');
        if (!conteudo) return;
        var key = chaveTela(tela, params);

        if (state.montadas[key]) {
            if (tela !== 'dashboard' && navigator.onLine !== false) {
                obterRegistro(tela, params).then(function (rec) {
                    montarTela(key, rec, tela, params);
                }).catch(function () {
                    ativarMontagem(key, tela, params);
                });
            } else {
                ativarMontagem(key, tela, params);
            }
            return;
        }

        if (tela === 'dashboard') {
            var raiz = document.createElement('div');
            raiz.setAttribute('data-sgi-screen', 'dashboard');
            raiz.innerHTML = state.dashHtml;
            state.montadas['dashboard'] = { root: raiz, inits: [], css: '' };
            state.registros['dashboard'] = {
                tela: 'dashboard',
                url: construirUrl('dashboard', params),
                titulo: tituloDocumento(document.title, TELA_TITULO.dashboard)
            };
            ativarMontagem('dashboard', 'dashboard', params);
            return;
        }

        obterRegistro(tela, params).then(function (rec) {
            montarTela(key, rec, tela, params);
        }).catch(function (e) {
            if (window.console) console.error('[SGI Mesario SPA] navegar', e);
            conteudo.innerHTML = '<div style="max-width:640px;margin:60px auto;text-align:center;padding:2rem;background:#fff;' +
                'border:1px solid #fecaca;border-radius:16px;color:#991b1b;">' +
                '<i class="bi bi-wifi-off fs-1 d-block mb-3"></i>' +
                '<strong style="font-size:1.05rem;">Esta tela não está disponível offline. ' +
                'Conecte-se à internet e atualize a página.</strong></div>';
        });
    }

    function montarTela(key, rec, tela, params) {
        var conteudo = document.getElementById('conteudo-principal');
        if (!conteudo) return;

        var raiz = document.createElement('div');
        raiz.setAttribute('data-sgi-screen', key);
        raiz.innerHTML = rec.html;

        desmontarTelaAtual(raiz);
        conteudo.replaceChildren(raiz);

        state.registros[key] = {
            tela: tela,
            url: rec.url || construirUrl(tela, params),
            titulo: tituloDocumento(rec.titulo, TELA_TITULO[tela])
        };

        // Os scripts das telas usam window.location.search na declaração
        // inicial (especialmente o chaveamento, que lê ?id=). A URL precisa
        // estar correta antes de executá-los, não somente depois de montar a
        // tela na casca SPA.
        pushEstado(tela, key, rec.url || construirUrl(tela, params));

        if (rec.css) aplicarCss(rec.css);

        state.montando = key;
        state.pendentesInit = [];
        (rec.pageSources || []).forEach(function (source) { executarScripts(source); });
        var inits = state.pendentesInit.slice();
        state.pendentesInit = [];
        state.montando = null;

        state.montadas[key] = { root: raiz, inits: inits, css: rec.css || '' };
        ativarMontagem(key, tela, params, true);
    }

    /* O cabeçalho da casca pertence somente à dashboard. As telas filhas,
       como Agenda, possuem cabeçalho e retorno próprios; assim a SPA não
       exibe dois títulos ou dois botões de voltar. Os destinos são links
       reais para o painel e a intercepção converte a navegação em troca de
       tela sem recarregar a página. */
    function atualizarVoltarMesario(tela) {
        var esconder = tela === 'dashboard';
        ['sgiBtnVoltarMesario', 'sgiBtnVoltarMesarioDesk'].forEach(function (id) {
            var el = document.getElementById(id);
            if (!el) return;
            el.hidden = esconder;
            if (esconder) {
                el.setAttribute('aria-hidden', 'true');
            } else {
                el.removeAttribute('aria-hidden');
            }
        });

        document.querySelectorAll('.sgi-mesario-topbar').forEach(function (topbar) {
            var mostrar = tela === 'dashboard';
            topbar.classList.toggle('sgi-mesario-topbar--oculta', !mostrar);
            topbar.hidden = !mostrar;
            if (mostrar) {
                topbar.removeAttribute('aria-hidden');
            } else {
                topbar.setAttribute('aria-hidden', 'true');
            }
        });
    }

    function ativarMontagem(key, tela, params, historicoJaAtualizado) {
        var m = state.montadas[key];
        var conteudo = document.getElementById('conteudo-principal');
        if (!m || !conteudo) return;
        desmontarTelaAtual(m.root);
        conteudo.replaceChildren(m.root);

        // Cada página baixada possui seu próprio bloco <style>. Sem restaurar
        // esse bloco ao voltar para uma montagem já existente, o CSS da última
        // página aberta substitui o da atual e a tela fica sem formatação.
        aplicarCss(m.css || '');

        var rec = state.registros[key] || {};
        tela = tela || rec.tela || 'dashboard';
        var url;
        if (params && (params.id_jogo != null || params.id != null || params.origem != null)) {
            url = construirUrl(tela, params);
        } else {
            url = rec.url || construirUrl(tela, {});
        }
        if (!historicoJaAtualizado) pushEstado(tela, key, url);
        document.title = tituloDocumento(rec.titulo, TELA_TITULO[tela]);

        if (m.inits) m.inits.forEach(function (fn) { runSafe(fn); });
        if (window.SGIPage) {
            window.SGIPage.updateContentTarget(document);
            window.SGIPage.focusPageHeading(m.root);
        }
        atualizarVoltarMesario(tela);
    }

    /* ==================== Interceptacao de links e popstate ==================== */

    function registrarInterceptacao() {
        document.addEventListener('click', function (e) {
            if (state.nivel !== 2) return;
            if (e.defaultPrevented || e.button !== 0) return;
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
            if (!a) return;
            if (a.target && a.target !== '_self') return;
            var href = a.getAttribute('href');
            if (!href || href.charAt(0) === '#') return;
            var abs;
            try { abs = new URL(a.href); } catch (err) { return; }
            if (abs.origin !== window.location.origin) return;
            var map = mapearTela(abs.pathname + abs.search);
            if (!map) return;
            e.preventDefault();
            navegarPara(map.tela, map.params);
        });

        window.addEventListener('popstate', function (e) {
            var s = e.state && e.state.sgi;
            if (s && s.tela && state.montadas[s.key]) {
                ativarMontagem(s.key, s.tela, null);
                return;
            }
            var m = mapearTela(window.location.pathname + window.location.search);
            if (m) {
                navegarPara(m.tela, m.params);
            } else {
                window.location.reload();
            }
        });
    }

    /* ==================== Preload de telas + dados ==================== */

    function dataUrls(id) {
        var b = apiBase();
        return [
            b + 'edicoes?regulamento=true',
            b + 'edicoes?id=' + id + '&regulamento=true',
            // A agenda consulta todas as modalidades e depois cada modalidade.
            b + 'modalidades',
            b + 'modalidades?id_interclasse=' + id,
            b + 'locais?id_interclasse=' + id + '&disponivel=1',
            b + 'locais?id_interclasse=' + id,
            b + 'categorias?id_interclasse=' + id,
            b + 'turmas?id_interclasse=' + id,
            b + 'equipes',
            b + 'equipes?id_interclasse=' + id,
            // A preparação offline precisa carregar a revisão publicada e o
            // estado de liberação para detectar uma revisão do evento ao
            // reconectar, sem descartar a fila de resultados.
            b + 'cronograma?id_interclasse=' + id,
            b + 'agenda-blocos?id_interclasse=' + id,
            b + 'jogos?id_interclasse=' + id,
            b + 'jogos?x=1&id_interclasse=' + id
        ];
    }

    function dadosPorJogo(j) {
        var b = apiBase();
        var urls = [
            b + 'jogos?id_jogo=' + j.id_jogo,
            b + 'partidas?id_jogo=' + j.id_jogo,
            b + 'artilheiros?id_jogo=' + j.id_jogo,
            b + 'pontos?id_jogo=' + j.id_jogo,
            b + 'ocorrencias?id_jogo=' + j.id_jogo + '&data=' + encodeURIComponent(j.data_jogo || '')
        ];
        return fetchJson(b + 'jogos?id_jogo=' + j.id_jogo).then(function (lista) {
            var jogo = (Array.isArray(lista) && lista[0]) || j;
            var nomeTipo = String(jogo.nome_tipo_modalidade || '').trim().toLowerCase();
            var ehIndividual = jogo.tipo_competicao === 'individual' ||
                (!jogo.tipo_competicao && (nomeTipo === 'individual' || nomeTipo === 'prova individual')) ||
                (!jogo.tipo_competicao && !nomeTipo && parseInt(jogo.tipos_modalidades_id_tipo_modalidade, 10) === 2);
            var idMod = jogo.modalidades_id_modalidade;
            if (ehIndividual && idMod) {
                urls.push(b + 'chaveamentos?tipo_modalidade=individual&acao=participantes&id_modalidade=' + idMod);
                urls.push(b + 'chaveamentos?tipo_modalidade=individual&acao=ranking&id_modalidade=' + idMod);
            }
            // Algumas ações do placar (como editar uma ocorrência) consultam
            // um registro individual. Baixamos também essas URLs exatas, pois
            // o cache offline é indexado pela URL completa da requisição.
            return Promise.all([
                fetchJson(b + 'partidas?id_jogo=' + j.id_jogo).catch(function () { return []; }),
                fetchJson(b + 'ocorrencias?id_jogo=' + j.id_jogo + '&data=' + encodeURIComponent(jogo.data_jogo || j.data_jogo || '')).catch(function () { return []; })
            ]).then(function (resultados) {
                var partidas = resultados[0];
                var ocorrencias = resultados[1];
                var vistas = {};
                (Array.isArray(partidas) ? partidas : []).forEach(function (p) {
                    var t = parseInt(p.id_turma, 10);
                    var equipeId = parseInt(p.equipes_id_equipe, 10);
                    if (t && !vistas[t]) {
                        vistas[t] = true;
                        urls.push(b + 'ocorrencias?acao=listar_atletas&id_jogo=' + j.id_jogo + '&id_turma=' + t);
                    }
                    // A mesma turma pode ter mais de uma equipe na modalidade.
                    // O seletor de pontos precisa do elenco da equipe exata, não
                    // do primeiro registro encontrado para aquela turma.
                    if (equipeId) {
                        urls.push(b + 'pontos?acao=atletas&id_jogo=' + j.id_jogo + '&id_equipe=' + equipeId);
                    }
                });
                (Array.isArray(ocorrencias) ? ocorrencias : []).forEach(function (o) {
                    if (o && o.id_ocorrencia) {
                        urls.push(b + 'ocorrencias?id_ocorrencia=' + o.id_ocorrencia);
                    }
                });
                return urls;
            });
        }).catch(function () { return urls; });
    }

    function aquecer(url) {
        if (!url || url.indexOf('undefined') > -1 || url.indexOf('null') > -1) {
            return Promise.resolve('');
        }
        return requisitarTexto(url).then(function (texto) {
            // APIs do SGI usam { success: false } para erros de domínio mesmo
            // com HTTP 200. Não considerar isso como cache pronto evita um
            // "Download parcial" sem explicação após uma resposta inválida.
            try {
                var dados = JSON.parse(texto);
                if (dados && !Array.isArray(dados) && dados.success === false) {
                    throw criarErroPreload('servidor', dados.message || dados.mensagem || 'O servidor recusou a solicitação.');
                }
            } catch (erro) {
                if (erro && erro.sgiPreloadTipo) throw erro;
            }
            // O interceptor HTTP também captura as respostas, mas o preload
            // precisa garantir explicitamente o preenchimento das stores
            // estruturadas. Isso é essencial para o elenco de cada equipe,
            // inclusive quando a mesma matrícula aparece em equipes distintas.
            if (window.SGIDataLayer && typeof window.SGIDataLayer.capture === 'function') {
                return Promise.resolve(window.SGIDataLayer.capture(url, texto)).catch(function () {}).then(function () {
                    return texto;
                });
            }
            return texto;
        });
    }

    function limparRetentativaPreload() {
        if (state.retryTimer) {
            clearTimeout(state.retryTimer);
            state.retryTimer = null;
        }
        state.retryPendente = false;
    }

    function agendarRetentativaPreload() {
        if (state.retryPendente || state.retryAttempts >= PRELOAD_MAX_AUTO_RETRIES || navigator.onLine === false) {
            return false;
        }
        state.retryAttempts++;
        state.retryPendente = true;
        state.retryTimer = setTimeout(function () {
            state.retryTimer = null;
            state.retryPendente = false;
            preload(true);
        }, PRELOAD_RETRY_DELAY_MS);
        return true;
    }

    function preload(automatico) {
        if (window.SGIOffline && typeof window.SGIOffline.checkAccess === 'function') {
            return window.SGIOffline.checkAccess(true).then(function (ok) {
                if (!ok) {
                    var estado = window.SGIOffline.getState ? window.SGIOffline.getState() : {};
                    aviso(estado.session === 'expirada'
                        ? 'A sessão expirou. Entre novamente para preparar ou atualizar o offline.'
                        : 'Servidor local indisponível. Conecte-se à rede local para preparar ou atualizar o offline.');
                    return false;
                }
                return iniciarPreload(automatico);
            });
        }
        return iniciarPreload(automatico);
    }

    function iniciarPreload(automatico) {
        if (state.nivel !== 2 || !state.temCasca) return;
        if (state.preloading) return;
        if (!automatico) {
            limparRetentativaPreload();
            state.retryAttempts = 0;
        }
        if (navigator.onLine === false) {
            aviso('Conecte-se à internet para preparar os dados de uso offline.');
            return;
        }

        state.preloading = true;
        ocultarBadge();
        mostrarProgresso(0, 'Iniciando download para uso offline...');

        var jobs = [];
        var contagem = { total: 0, feito: 0, falhas: 0, interrompido: false, primeiraFalha: null };
        var semInterclasse = false;
        // Perfil não depende da edição. As demais telas são adicionadas abaixo
        // já com o id correto, para a chave local ser a mesma da navegação.
        var telasBase = ['perfil'];
        telasBase.forEach(function (t) {
            jobs.push(function () { return baixarTela(t, {}); });
        });
        // A foto é carregada pelo perfil via API depois que a tela é montada.
        // Incluí-la aqui mantém o perfil completo já na primeira abertura
        // offline, sem depender de uma visita anterior à página.
        if (USER_ID) {
            jobs.push(function () {
                return aquecer(apiBase() + 'foto?user_id=' + encodeURIComponent(USER_ID));
            });
        }

        obterIdAtivo().then(function (id) {
            if (!id) {
                semInterclasse = true;
                return null;
            }
            ['agenda', 'chaveamento', 'ocorrencias', 'jogoslista'].forEach(function (tela) {
                jobs.push(function () { return baixarTela(tela, { id: id }); });
            });
            dataUrls(id).forEach(function (u) {
                jobs.push(function () { return aquecer(u); });
            });
            return Promise.all([
                fetchJson(apiBase() + 'jogos?id_interclasse=' + id),
                fetchJson(apiBase() + 'modalidades'),
                fetchJson(apiBase() + 'turmas?id_interclasse=' + id),
                fetchJson(apiBase() + 'categorias?id_interclasse=' + id)
            ]).then(function (resultados) {
                var jogos = resultados[0];
                var modalidades = Array.isArray(resultados[1]) ? resultados[1] : [];
                var turmas = Array.isArray(resultados[2]) ? resultados[2] : [];
                var categorias = Array.isArray(resultados[3]) ? resultados[3] : [];
                var lista = Array.isArray(jogos) ? jogos : [];
                modalidades.filter(function (m) {
                    return String(m.interclasses_id_interclasse) === String(id);
                }).forEach(function (m) {
                    var idModalidade = encodeURIComponent(m.id_modalidade);
                    jobs.push(function () {
                        return aquecer(apiBase() + 'jogos?id_modalidade=' + idModalidade);
                    });
                    // A árvore de chaveamento consulta esta rota para cada
                    // modalidade, inclusive nas modalidades coletivas.
                    jobs.push(function () {
                        return aquecer(apiBase() + 'chaveamentos?id_modalidade=' + idModalidade);
                    });
                    jobs.push(function () {
                        return aquecer(apiBase() + 'agenda-blocos?id_interclasse=' + id + '&id_modalidade=' + idModalidade);
                    });
                    // Modalidades individuais consultam ranking e participantes
                    // mesmo antes de existir um jogo na agenda.
                    if (m.tipo_competicao === 'individual' ||
                        (!m.tipo_competicao && String(m.nome_tipo_modalidade || '').trim().toLowerCase() === 'individual') ||
                        (!m.tipo_competicao && !m.nome_tipo_modalidade && parseInt(m.id_tipo_modalidade, 10) === 2)) {
                        jobs.push(function () {
                            return aquecer(apiBase() + 'chaveamentos?tipo_modalidade=individual&acao=participantes&id_modalidade=' + idModalidade);
                        });
                        jobs.push(function () {
                            return aquecer(apiBase() + 'chaveamentos?tipo_modalidade=individual&acao=ranking&id_modalidade=' + idModalidade);
                        });
                    }
                });
                categorias.forEach(function (categoria) {
                    if (!categoria.id_categoria) return;
                    jobs.push(function () {
                        return aquecer(apiBase() + 'jogos?id_interclasse=' + id +
                            '&id_categoria=' + encodeURIComponent(categoria.id_categoria));
                    });
                });
                turmas.forEach(function (turma) {
                    if (!turma.id_turma) return;
                    var tId = encodeURIComponent(turma.id_turma);
                    jobs.push(function () {
                        return aquecer(apiBase() + 'ocorrencias-turmas?id_interclasse=' + id + '&id_turma=' + tId);
                    });
                    jobs.push(function () {
                        return aquecer(apiBase() + 'ocorrencias?acao=listar_atletas&id_jogo=0&id_turma=' + tId);
                    });
                    jobs.push(function () {
                        return aquecer(apiBase() + 'equipes?id_turma=' + tId);
                    });
                });
                lista.forEach(function (j) {
                    jobs.push(function () { return baixarTela('jogos', { id_jogo: j.id_jogo }); });
                });
                var chain = Promise.resolve();
                lista.forEach(function (j) {
                    chain = chain.then(function () { return dadosPorJogo(j); }).then(function (urls) {
                        urls.forEach(function (u) { jobs.push(function () { return aquecer(u); }); });
                    }).catch(function () {});
                });
                return chain;
            }).catch(function (e) {
                contagem.falhas++;
                contagem.primeiraFalha = contagem.primeiraFalha || e;
                if (window.console) console.warn('[SGI Mesario SPA] lista de jogos', e);
                return null;
            });
        }).then(function () {
            if (semInterclasse) {
                terminarPreload(false, 'Nenhum interclasse ativo para baixar agora.');
                return null;
            }
            contagem.total = jobs.length;
            var falhasConsecutivas = 0;
            return jobs.reduce(function (p, job) {
                return p.then(function () {
                    if (falhasConsecutivas >= 3 || navigator.onLine === false) {
                        contagem.interrompido = true;
                        return Promise.resolve();
                    }
                    return Promise.resolve(job()).then(function () {
                        falhasConsecutivas = 0;
                    }).catch(function (e) {
                        contagem.falhas++;
                        contagem.primeiraFalha = contagem.primeiraFalha || e;
                        falhasConsecutivas++;
                        if (tipoErroPreload(e) === 'sessao') falhasConsecutivas = 3;
                        if (window.console) console.warn('[SGI Mesario SPA] preload', e);
                    }).then(function () {
                        contagem.feito++;
                        var pct = Math.round((contagem.feito / contagem.total) * 100);
                        mostrarProgresso(pct, 'Baixando dados para uso offline... ' + pct + '%');
                    });
                });
            }, Promise.resolve());
        }).then(function () {
            if (semInterclasse) return;
            if (contagem.falhas === 0 && !contagem.interrompido) {
                state.retryAttempts = 0;
                state.ultimaFalha = null;
                terminarPreload(true);
                return;
            }

            var erro = contagem.primeiraFalha || criarErroPreload('rede', 'O download foi interrompido.');
            var tipo = tipoErroPreload(erro);
            state.ultimaFalha = erro;
            if (tipo !== 'sessao' && agendarRetentativaPreload()) {
                terminarPreload(false, 'Alguns dados não puderam ser atualizados. Nova tentativa automática em instantes.');
                return;
            }
            if (tipo === 'sessao') {
                terminarPreload(false, 'Sua sessão precisa ser atualizada antes de concluir o download. Recarregue a página e entre novamente se necessário.');
                return;
            }
            terminarPreload(false);
        }).catch(function (e) {
            if (window.console) console.error('[SGI Mesario SPA] preload', e);
            state.ultimaFalha = e;
            if (tipoErroPreload(e) !== 'sessao' && agendarRetentativaPreload()) {
                terminarPreload(false, 'Não foi possível concluir a preparação agora. Nova tentativa automática em instantes.');
            } else {
                terminarPreload(false);
            }
        });
    }

    function terminarPreload(ok, mensagem) {
        state.preloading = false;
        ocultarProgresso();
        if (ok) {
            state.pronto = true;
            state.cronogramaObsoleto = false;
            marcarPronto();
            mostrarBadge();
            aviso('Tudo pronto! Páginas e dados sincronizados. Você já pode usar offline. 🟢');
        } else {
            if (mensagem) {
                aviso(mensagem);
                return;
            }
            obterIdAtivo().then(function (id) { return idbFindTela('agenda', id ? { id: id } : {}); }).then(function (rec) {
                if (rec) {
                    state.pronto = false;
                    marcarPronto();
                    aviso('Download parcial. Conecte-se para completar.');
                } else {
                    aviso('Não foi possível baixar as telas agora. Verifique a conexão.');
                }
            });
        }
    }

    function marcarPronto() {
        try {
            if (state.pronto) localStorage.setItem(PRONTO_STORAGE_KEY, '1');
            else localStorage.removeItem(PRONTO_STORAGE_KEY);
        } catch (e) {}
    }

    function verificarPronto() {
        var flag = false;
        try { flag = localStorage.getItem(PRONTO_STORAGE_KEY) === '1'; } catch (e) {}
        var obrigatorias = ['agenda', 'chaveamento', 'ocorrencias', 'jogoslista'];
        return obterIdAtivo().then(function (id) {
            if (!id) {
                state.pronto = false;
                marcarPronto();
                return false;
            }
            return Promise.all(obrigatorias.map(function (tela) {
                return idbFindTela(tela, { id: id }).then(function (rec) {
                    // Caches antigos sem fontes de script podem exibir HTML, mas
                    // não conseguem reativar a tela com segurança após a queda.
                    return !!(rec && rec.schemaVersion >= 2 && Array.isArray(rec.pageSources) &&
                        String(rec.interclasseId || id) === String(id));
                });
            })).then(function (resultado) {
            var completo = resultado.every(function (valor) { return valor; });
            state.pronto = completo && flag;
            if (state.pronto) mostrarBadge();
            return state.pronto;
            });
        }).catch(function () {
            state.pronto = false;
            return false;
        });
    }

    /* ============================ Interface ============================ */

    var PROGRESSO_ID = 'sgi-progresso';
    var BADGE_ID = 'sgi-offline-ok';
    var removerObservadorEstadoOffline = null;

    var CSS_UI = '' +
        '#' + PROGRESSO_ID + '{position:fixed;top:58px;left:50%;transform:translateX(-50%);z-index:3000;' +
        'width:min(92vw,440px);background:#fff;border:1px solid #e5e7eb;border-radius:14px;' +
        'box-shadow:0 10px 30px rgba(0,0,0,.15);padding:12px 14px;display:none;}' +
        '#' + PROGRESSO_ID + ' .sp-label{font-size:.8rem;font-weight:600;color:#111827;}' +
        '#' + PROGRESSO_ID + ' .sp-bar{height:8px;background:#e5e7eb;border-radius:999px;margin-top:8px;overflow:hidden;}' +
        '#' + PROGRESSO_ID + ' .sp-bar>div{height:100%;width:0%;background:linear-gradient(90deg,#16a34a,#22c55e);' +
        'border-radius:999px;transition:width .25s;}' +
        '#' + BADGE_ID + '{position:fixed;top:58px;right:14px;z-index:3000;background:#ecfdf5;color:#065f46;' +
        'border:1px solid #a7f3d0;border-radius:50%;width:38px;height:38px;padding:0;' +
        'box-shadow:0 4px 12px rgba(6,95,70,.18);cursor:pointer;display:none;align-items:center;justify-content:center;' +
        'font-size:1.2rem;transition:transform .15s ease,box-shadow .15s ease;}' +
        '#' + BADGE_ID + ':hover{transform:scale(1.06);box-shadow:0 6px 16px rgba(6,95,70,.25);}' +
        '#sgi-aviso{position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:3100;background:#111827;' +
        'color:#fff;border-radius:999px;padding:10px 16px;font-size:.82rem;box-shadow:0 8px 24px rgba(0,0,0,.3);' +
        'opacity:0;transition:opacity .25s;pointer-events:none;white-space:nowrap;max-width:92vw;overflow:hidden;' +
        'text-overflow:ellipsis;font-family:inherit;}';

    function criarUi() {
        var st = document.getElementById('sgi-spa-estilos');
        if (!st) {
            st = document.createElement('style');
            st.id = 'sgi-spa-estilos';
            st.textContent = CSS_UI;
            document.head.appendChild(st);
        }
        if (!document.getElementById(PROGRESSO_ID)) {
            var p = document.createElement('div');
            p.id = PROGRESSO_ID;
            p.innerHTML = '<div class="sp-label">Baixando dados para uso offline...</div>' +
                '<div class="sp-bar"><div></div></div>';
            document.body.appendChild(p);
        }
        if (!document.getElementById(BADGE_ID)) {
            var b = document.createElement('div');
            b.id = BADGE_ID;
            b.title = 'Pronto para uso offline nesta aba preparada (clique para sincronizar)';
            b.setAttribute('role', 'status');
            b.setAttribute('aria-label', 'Pronto para uso offline nesta aba preparada');
            b.setAttribute('aria-live', 'polite');
            b.setAttribute('aria-atomic', 'true');
            b.innerHTML = '<i class="bi bi-cloud-check-fill" aria-hidden="true"></i>' +
                '<span class="visually-hidden">Pronto para uso offline nesta aba preparada</span>';
            b.addEventListener('click', function () {
                if (state.preloading) return;
                preload();
            });
            document.body.appendChild(b);
        }
        if (!document.getElementById('sgi-aviso')) {
            var a = document.createElement('div');
            a.id = 'sgi-aviso';
            document.body.appendChild(a);
        }
    }

    function mostrarProgresso(pct, label) {
        var p = document.getElementById(PROGRESSO_ID);
        if (!p) return;
        p.style.display = 'block';
        var lab = p.querySelector('.sp-label');
        var bar = p.querySelector('.sp-bar > div');
        if (lab) lab.textContent = label || '';
        if (bar) bar.style.width = Math.max(2, Math.min(100, pct || 0)) + '%';
    }

    function ocultarProgresso() {
        var p = document.getElementById(PROGRESSO_ID);
        if (p) p.style.display = 'none';
    }

    function mostrarBadge() {
        var b = document.getElementById(BADGE_ID);
        // Uma atualização pode estar em andamento enquanto o cache anterior
        // ainda marca a sessão como pronta. Nesse intervalo, não exibir o
        // selo verde evita induzir o mesário a desligar a rede antes de todas
        // as telas e partidas terminarem de ser baixadas.
        var banner = document.getElementById('sgi-offline-banner');
        var bannerVisivel = banner && !banner.classList.contains('d-none') && !banner.classList.contains('sgi-hidden');
        if (b) { b.style.display = state.preloading || bannerVisivel || state.cronogramaObsoleto ? 'none' : 'inline-flex'; }
    }

    function observarEstadoBanner() {
        if (removerObservadorEstadoOffline || !window.SGIOffline ||
            typeof window.SGIOffline.onStateChange !== 'function') return;
        removerObservadorEstadoOffline = window.SGIOffline.onStateChange(function () {
            mostrarBadge();
        });
        mostrarBadge();
    }

    function ocultarBadge() {
        var b = document.getElementById(BADGE_ID);
        if (b) b.style.display = 'none';
    }

    var avisoTimer = null;
    function aviso(msg) {
        var el = document.getElementById('sgi-aviso');
        if (!el) return;
        el.textContent = msg;
        el.style.opacity = '1';
        if (avisoTimer) clearTimeout(avisoTimer);
        avisoTimer = setTimeout(function () { el.style.opacity = '0'; }, 4200);
    }

    /* ============================ Inicializacao ============================ */

    function init() {
        state.nivel = parseInt(window.SGI_SESSION_NIVEL, 10);
        if (state.nivel !== 2) return;

        var conteudo = document.getElementById('conteudo-principal');
        if (conteudo) {
            state.temCasca = true;
            state.dashHtml = conteudo.innerHTML;
        }

        criarUi();
        window.addEventListener('sgi:cronograma-revisado', function () {
            state.cronogramaObsoleto = true;
            ocultarBadge();
            aviso('O cronograma foi revisado. Atualize a preparação antes de continuar; a fila de resultados foi preservada.');
        });
        observarEstadoBanner();
        registrarInterceptacao();
        atualizarVoltarMesario('dashboard');

        if (!state.temCasca) return;

        // URL inicial da casca, para o botão "voltar" retornar à dashboard
        obterIdAtivo().then(function (id) {
            var url = construirUrl('dashboard', { id: id });
            try {
                history.replaceState({ sgi: { tela: 'dashboard', key: 'dashboard' } }, '', url);
            } catch (e) {}
        });

        purgarPaginasInvalidas().then(function () {
            verificarPronto().then(function () {
                preload();
            });
        });
    }

    window.__SGI_SPA__ = {
        registrarInit: registrarInit,
        navegarPara: navegarPara,
        preload: preload,
        status: function () {
            return {
                nivel: state.nivel,
                temCasca: state.temCasca,
                pronto: state.pronto,
                preloading: state.preloading,
                servidor: window.SGIOffline && typeof window.SGIOffline.getState === 'function'
                    ? window.SGIOffline.getState().server : 'desconhecido'
            };
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
