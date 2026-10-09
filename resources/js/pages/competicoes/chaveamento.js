window.SGIPage.mount("competicoes/chaveamento", function (pageConfig, pageScope) {

    const APP_BASE = String(window.SGI_BASE_PATH || '').replace(/\/+$/, '');
    const API_BASE = String(window.SGI_API_BASE || `${APP_BASE}/api/v1/`).replace(/\/?$/, '');
    const urlParams = new URLSearchParams(window.location.search);
    let idInterclasse = urlParams.get('id');
    let modalidadesCache = [];
    let jogosCache = [];
    const NIVEL_USUARIO = pageConfig.value3;
    function podeEditarJogo() {
        if (typeof pageConfig.podeEditar === 'boolean') return pageConfig.podeEditar;
        const nivel = Number(NIVEL_USUARIO);
        return nivel === 0 || nivel === 1;
    }

    function resolverTipoCompeticao(mod) {
        if (!mod) return null;
        if (mod.tipo_competicao === 'individual') return 'individual';
        if (mod.tipo_competicao === 'mata_mata') return 'mata_mata';
        const nome = String(mod.nome_tipo_modalidade || '').trim().toLowerCase();
        if (nome === 'individual' || nome === 'prova individual' || nome === 'individualizada') return 'individual';
        if (nome === 'mata-mata' || nome === 'mata mata' || nome === 'mata-mata (eliminatório)' || nome === 'mata-mata (eliminatória)' || nome === 'eliminatório' || nome === 'eliminatória' || nome === 'eliminatoria') return 'mata_mata';
        return null;
    }

    function modalidadeEhIndividual(mod) {
        return resolverTipoCompeticao(mod) === 'individual';
    }

    function jogoEhIndividual(jogo) {
        return modalidadeEhIndividual(jogo);
    }

    function jogoEhReal(jogo) {
        if (!jogo || Number(jogo.id_jogo) <= 0) return false;
        if (jogoEhIndividual(jogo)) return true;
        return String(jogo.equipes_nomes || '').split(' vs ').filter(Boolean).length >= 2;
    }

    function esc(s) {
        const d = document.createElement('div');
        d.textContent = s == null ? '' : String(s);
        return d.innerHTML;
    }

    /* ── Select customizado (KVS): busca + grupos por categoria ── */
    let kvs_grupos = [];
    let kvs_instanciaAtiva = null;
    let kvs_posicaoScrollAoAbrir = null;

    function kvs_triggerVisivel(trigger) {
        if (!trigger || !trigger.getClientRects().length) return false;
        const estilo = window.getComputedStyle(trigger);
        return estilo.display !== 'none' && estilo.visibility !== 'hidden';
    }

    function kvs_triggerParaFoco(root) {
        if (!root) return null;
        const trigger = root.querySelector('.kvs__trigger');
        const wrapPar = root.dataset.peerWrapId ? document.getElementById(root.dataset.peerWrapId) : null;
        const triggerPar = wrapPar?.querySelector('.kvs__trigger');
        const compacto = composicaoCompactaAtiva();
        const rootEhMobile = Boolean(root.closest('.d-md-none, .sgi-chaveamento-mobile'));
        if (!compacto && rootEhMobile && triggerPar) return triggerPar;
        if (compacto && !rootEhMobile && triggerPar) return triggerPar;
        if (kvs_triggerVisivel(trigger)) return trigger;
        return (triggerPar && kvs_triggerVisivel(triggerPar)) ? triggerPar : (triggerPar || trigger);
    }

    function kvs_fechar(root, devolverFoco = false) {
        if (!root) return;
        root.classList.remove('kvs--aberto');
        const trigger = root.querySelector('.kvs__trigger');
        const search = root.querySelector('.kvs__search');
        const panel = root.querySelector('.kvs__panel');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
        if (search) {
            search.setAttribute('aria-expanded', 'false');
            search.removeAttribute('aria-activedescendant');
        }
        if (panel) {
            panel.style.position = '';
            panel.style.left = '';
            panel.style.width = '';
            panel.style.maxHeight = '';
            panel.style.top = '';
            panel.style.bottom = '';
        }
        if (kvs_instanciaAtiva === root) {
            kvs_instanciaAtiva = null;
            kvs_posicaoScrollAoAbrir = null;
        }
        if (devolverFoco) {
            const alvoFoco = kvs_triggerParaFoco(root);
            if (alvoFoco) {
                try { alvoFoco.focus({ preventScroll: true }); } catch (_) { alvoFoco.focus(); }
                if (typeof window.requestAnimationFrame === 'function') {
                    window.requestAnimationFrame(() => {
                        if (document.activeElement !== alvoFoco) {
                            try { alvoFoco.focus({ preventScroll: true }); } catch (_) { alvoFoco.focus(); }
                        }
                    });
                }
            }
        }
    }

    let kvs_ultimoFocoWrap = null;

    pageScope.listen(document, 'focusin', (event) => {
        const wrap = event.target?.closest?.('.kvs');
        if (wrap) {
            kvs_ultimoFocoWrap = wrap;
        } else if (event.target && event.target !== document.body) {
            kvs_ultimoFocoWrap = null;
        }
    });

    function kvs_sincronizarFocoEntreComposicoes() {
        if (kvs_instanciaAtiva) {
            const wrapAtivo = kvs_instanciaAtiva;
            kvs_fechar(kvs_instanciaAtiva, false);
            kvs_ultimoFocoWrap = wrapAtivo;
        }
        const wrap = kvs_ultimoFocoWrap || document.activeElement?.closest?.('.kvs');
        if (!wrap) return;
        const alvo = kvs_triggerParaFoco(wrap);
        if (alvo && kvs_triggerVisivel(alvo) && document.activeElement !== alvo) {
            try { alvo.focus({ preventScroll: true }); } catch (_) { alvo.focus(); }
            kvs_ultimoFocoWrap = alvo.closest('.kvs');
            if (typeof window.requestAnimationFrame === 'function') {
                window.requestAnimationFrame(() => {
                    if (document.activeElement !== alvo) {
                        try { alvo.focus({ preventScroll: true }); } catch (_) { alvo.focus(); }
                        kvs_ultimoFocoWrap = alvo.closest('.kvs');
                    }
                });
            }
        }
    }

    pageScope.listen(window, 'resize', kvs_sincronizarFocoEntreComposicoes);
    if (typeof window.matchMedia === 'function') {
        const mq1200 = window.matchMedia('(min-width: 1200px)');
        if (typeof mq1200.addEventListener === 'function') {
            pageScope.listen(mq1200, 'change', kvs_sincronizarFocoEntreComposicoes);
        } else if (typeof mq1200.addListener === 'function') {
            mq1200.addListener(kvs_sincronizarFocoEntreComposicoes);
            pageScope.defer(() => mq1200.removeListener(kvs_sincronizarFocoEntreComposicoes));
        }
    }

    pageScope.listen(document, 'click', (event) => {
        // Clicks inside a KVS belong to that control. Explicit containment also
        // protects opening from other document listeners on the same click.
        if (kvs_instanciaAtiva && !kvs_instanciaAtiva.contains(event.target)) {
            kvs_fechar(kvs_instanciaAtiva);
        }
    });

    function kvs_normalizarBusca(texto) {
        return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
    }

    function kvs_montarGrupos() {
        const grupos = {};
        modalidadesCache.forEach(mod => {
            const chave = mod.nome_categoria || 'Outras';
            if (!grupos[chave]) grupos[chave] = [];
            grupos[chave].push({
                valor: String(mod.id_modalidade),
                nome: mod.nome_modalidade,
                tipo: resolverTipoCompeticao(mod) === null ? 'Tipo não configurado' : (modalidadeEhIndividual(mod) ? 'Individual' : 'Coletiva')
            });
        });
        kvs_grupos = Object.keys(grupos).map(chave => ({ nome: chave, opcoes: grupos[chave] }));
    }

    function kvs_sincronizar(select, label, placeholder, trigger, ariaLabel) {
        let opt = null;
        let grupoSelecionado = null;
        kvs_grupos.forEach(g => g.opcoes.forEach(o => {
            if (o.valor === String(select.value)) {
                opt = o;
                grupoSelecionado = g;
            }
        }));
        const nomeDuplicadoEmOutroGrupo = opt && kvs_grupos.some(g => g !== grupoSelecionado
            && g.opcoes.some(o => kvs_normalizarBusca(o.nome) === kvs_normalizarBusca(opt.nome)));
        const textoSelecionado = opt
            ? `${opt.nome}${nomeDuplicadoEmOutroGrupo ? ` — ${grupoSelecionado.nome}` : ''}`
            : placeholder;
        label.textContent = textoSelecionado;
        label.classList.toggle('kvs__trigger-label--preenchido', !!opt);
        trigger.setAttribute('aria-label', `${ariaLabel}: ${textoSelecionado}`);
    }

    function kvs_atualizarControle(wrapId, selectId, placeholder, ariaLabel) {
        const wrap = document.getElementById(wrapId);
        const select = document.getElementById(selectId);
        if (!wrap || !select) return;
        const trigger = wrap.querySelector('.kvs__trigger');
        const label = wrap.querySelector('.kvs__trigger-label');
        if (!trigger || !label) return;
        kvs_sincronizar(select, label, placeholder, trigger, ariaLabel);
        wrap.querySelectorAll('[role="option"]').forEach((option) => {
            option.setAttribute('aria-selected', String(option.dataset.value === select.value));
        });
    }

    function kvs_montar(opts) {
        const wrap = document.getElementById(opts.wrapId);
        const select = document.getElementById(opts.selectId);
        if (!wrap || !select) return;
        const idPrefix = `kvs-${opts.wrapId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
        const searchId = `${idPrefix}-search`;
        const listboxId = `${idPrefix}-listbox`;

        wrap.innerHTML = `
            <div class="kvs">
                <button type="button" class="kvs__trigger btn btn-outline-secondary w-100 d-flex align-items-center justify-content-between gap-2 text-start" aria-haspopup="listbox" aria-expanded="false" aria-controls="${listboxId}">
                    <span class="kvs__trigger-label">${esc(opts.placeholder)}</span>
                    <i class="bi bi-chevron-down kvs__chevron text-body-secondary" aria-hidden="true"></i>
                </button>
                <div class="kvs__panel bg-body border rounded-3 overflow-hidden">
                    <div class="kvs__search-box position-relative p-3 border-bottom">
                        <i class="bi bi-search kvs__search-icone position-absolute start-0 top-50 translate-middle-y ms-3 text-body-secondary pe-none" aria-hidden="true"></i>
                        <input id="${searchId}" type="text" class="kvs__search form-control ps-5" placeholder="Buscar modalidade..." aria-label="Buscar modalidade" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${listboxId}" autocomplete="off" spellcheck="false">
                    </div>
                    <div id="${listboxId}" class="kvs__groups overflow-auto px-2 pt-1 pb-2" role="listbox" aria-label="${esc(opts.listboxLabel || opts.ariaLabel)}"></div>
                    <div class="kvs__vazio p-3 text-center text-body-secondary small" role="status" hidden></div>
                </div>
            </div>`;

        const root = wrap.querySelector('.kvs');
        root.dataset.peerWrapId = opts.peerWrapId || '';
        const trigger = root.querySelector('.kvs__trigger');
        const label = root.querySelector('.kvs__trigger-label');
        const search = root.querySelector('.kvs__search');
        const groupsEl = root.querySelector('.kvs__groups');
        let indiceOpcaoAtiva = -1;

        function opcoesVisiveis() {
            return Array.from(groupsEl.querySelectorAll('[role="option"]'));
        }

        function definirOpcaoAtiva(indice) {
            const opcoes = opcoesVisiveis();
            if (!opcoes.length) {
                indiceOpcaoAtiva = -1;
                search.removeAttribute('aria-activedescendant');
                return;
            }
            indiceOpcaoAtiva = (indice + opcoes.length) % opcoes.length;
            opcoes.forEach((opcao, i) => opcao.classList.toggle('kvs__opcao--ativa', i === indiceOpcaoAtiva));
            search.setAttribute('aria-activedescendant', opcoes[indiceOpcaoAtiva].id);
            if (root.classList.contains('kvs--aberto')) {
                const areaOpcoes = groupsEl.getBoundingClientRect();
                const areaOpcao = opcoes[indiceOpcaoAtiva].getBoundingClientRect();
                if (areaOpcao.bottom > areaOpcoes.bottom) {
                    groupsEl.scrollTop += areaOpcao.bottom - areaOpcoes.bottom;
                } else if (areaOpcao.top < areaOpcoes.top) {
                    groupsEl.scrollTop -= areaOpcoes.top - areaOpcao.top;
                }
            }
        }

        function selecionarOpcao(opcao) {
            if (!opcao) return;
            select.value = opcao.dataset.value;
            if (opts.peerSelectId) {
                const selectPar = document.getElementById(opts.peerSelectId);
                if (selectPar) selectPar.value = select.value;
            }
            kvs_atualizarControle(opts.wrapId, opts.selectId, opts.placeholder, opts.ariaLabel);
            if (opts.peerWrapId && opts.peerSelectId) {
                kvs_atualizarControle(opts.peerWrapId, opts.peerSelectId, opts.placeholder, opts.ariaLabel);
            }
            kvs_fechar(root, true);
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }

        function renderizar(termo) {
            const t = kvs_normalizarBusca(termo);
            let html = '';

            if (opts.incluirTodas) {
                const showTudo = !t || kvs_normalizarBusca('Todas modalidades').includes(t);
                if (showTudo) {
                    const ativa = select.value === '';
                    html += `<div role="option" tabindex="-1" id="${idPrefix}-option-todas" aria-selected="${ativa}" class="kvs__opcao dropdown-item d-flex align-items-center justify-content-between gap-2 py-2 px-3${ativa ? ' kvs__opcao--ativa' : ''}" data-value="">
                        <span class="kvs__opcao-nome">Todas modalidades</span>
                        <span class="kvs__opcao-tipo badge rounded-pill bg-light text-body-secondary opacity-50" >Mostrar tudo</span>
                    </div>`;
                }
            }

            kvs_grupos.forEach(g => {
                const opcoes = g.opcoes.filter(o => !t || kvs_normalizarBusca(o.nome).includes(t) || kvs_normalizarBusca(g.nome).includes(t));
                if (!opcoes.length) return;
                html += `<div class="kvs__grupo mt-2" role="group" aria-label="${esc(g.nome)}">
                    <div class="kvs__grupo-titulo dropdown-header d-flex align-items-center gap-2 px-2 py-1 text-uppercase fw-bold" aria-hidden="true"><i class="bi bi-trophy-fill text-danger"></i>${esc(g.nome)}<span class="kvs__grupo-qtd badge rounded-pill text-bg-light text-body-secondary ms-auto">${opcoes.length}</span></div>`;
                opcoes.forEach(o => {
                    const ativa = String(select.value) === o.valor;
                    const tipoCls = o.tipo === 'Individual'
                        ? 'badge rounded-pill bg-primary-subtle text-primary-emphasis'
                        : 'badge rounded-pill bg-danger-subtle text-danger-emphasis';
                    html += `<div role="option" tabindex="-1" id="${idPrefix}-option-${esc(o.valor)}" aria-selected="${ativa}" class="kvs__opcao dropdown-item d-flex align-items-center justify-content-between gap-2 py-2 px-3${ativa ? ' kvs__opcao--ativa' : ''}" data-value="${esc(o.valor)}">
                        <span class="kvs__opcao-nome">${esc(o.nome)}</span>
                        <span class="kvs__opcao-tipo ${tipoCls}">${esc(o.tipo)}</span>
                    </div>`;
                });
                html += '</div>';
            });

            groupsEl.innerHTML = html;
            const mensagemVazia = root.querySelector('.kvs__vazio');
            mensagemVazia.textContent = html ? '' : 'Nenhuma modalidade encontrada.';
            mensagemVazia.hidden = !!html;
            const opcoes = opcoesVisiveis();
            const selecionada = opcoes.findIndex((opcao) => opcao.dataset.value === select.value);
            definirOpcaoAtiva(selecionada >= 0 ? selecionada : 0);
        }

        function posicionarPainel() {
            const panel = root.querySelector('.kvs__panel');
            const trig = trigger.getBoundingClientRect();
            const W = Math.max(trig.width, 240);
            let left = Math.max(8, trig.left);
            if (left + W > window.innerWidth - 8) left = Math.max(8, window.innerWidth - W - 8);

            const espacoBaixo = window.innerHeight - trig.bottom - 8;
            const espacoCima = trig.top - 8;
            const paraCima = espacoBaixo < 200 && espacoCima > espacoBaixo;
            const altH = Math.max(180, Math.min(380, paraCima ? espacoCima : espacoBaixo));

            panel.style.position = 'fixed';
            panel.style.left = left + 'px';
            panel.style.width = W + 'px';
            panel.style.maxHeight = altH + 'px';
            panel.style.top = (paraCima ? trig.top - altH - 6 : trig.bottom + 6) + 'px';
            panel.style.bottom = 'auto';
        }

        function abrir() {
            search.value = '';
            renderizar('');
            if (kvs_instanciaAtiva && kvs_instanciaAtiva !== root) kvs_fechar(kvs_instanciaAtiva);
            root.classList.add('kvs--aberto');
            trigger.setAttribute('aria-expanded', 'true');
            search.setAttribute('aria-expanded', 'true');
            definirOpcaoAtiva(indiceOpcaoAtiva);
            kvs_instanciaAtiva = root;
            kvs_posicaoScrollAoAbrir = { x: window.scrollX, y: window.scrollY };
            posicionarPainel();
            try { search.focus({ preventScroll: true }); } catch (e) { search.focus(); }
        }

        pageScope.listen(trigger, 'click', (e) => {
            e.stopPropagation();
            if (root.classList.contains('kvs--aberto')) kvs_fechar(root);
            else abrir();
        });

        pageScope.listen(root, 'click', (e) => e.stopPropagation());

        pageScope.listen(search, 'input', () => renderizar(search.value));
        pageScope.listen(search, 'keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                kvs_fechar(root, true);
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                definirOpcaoAtiva(indiceOpcaoAtiva + 1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                definirOpcaoAtiva(indiceOpcaoAtiva - 1);
            } else if (e.key === 'Home') {
                e.preventDefault();
                definirOpcaoAtiva(0);
            } else if (e.key === 'End') {
                e.preventDefault();
                definirOpcaoAtiva(opcoesVisiveis().length - 1);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                selecionarOpcao(opcoesVisiveis()[indiceOpcaoAtiva]);
            } else if (e.key === 'Tab') {
                // Leave sequential focus navigation to the browser. Closing first
                // removes the popup from that sequence in either Tab direction.
                kvs_fechar(root);
            }
            e.stopPropagation();
        });

        pageScope.listen(groupsEl, 'click', (e) => {
            const option = e.target.closest('[role="option"]');
            if (option) selecionarOpcao(option);
        });

        pageScope.listen(trigger, 'keydown', (e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                abrir();
                definirOpcaoAtiva(e.key === 'ArrowDown' ? 0 : opcoesVisiveis().length - 1);
            }
        });

        kvs_sincronizar(select, label, opts.placeholder, trigger, opts.ariaLabel);
    }

    function kvs_focus(idSelect) {
        const wrap = document.getElementById('kvs-wrap-' + idSelect);
        if (wrap) {
            const trigger = wrap.querySelector('.kvs__trigger');
            if (trigger) {
                trigger.click();
                return;
            }
        }
        const select = document.getElementById(idSelect);
        if (select) {
            try { select.focus({ preventScroll: true }); } catch (_) { select.focus(); }
            if (typeof select.showPicker === 'function') {
                try { select.showPicker(); } catch (_) { /* o seletor nativo segue disponível */ }
            }
        }
    }

    function usarSeletorNativo() {
        if (typeof window.matchMedia !== 'function') return false;
        return window.matchMedia('(pointer: coarse)').matches
            || window.matchMedia('(hover: none)').matches;
    }

    pageScope.listen(window, 'scroll', () => {
        if (!kvs_instanciaAtiva) return;
        if (kvs_posicaoScrollAoAbrir
            && window.scrollX === kvs_posicaoScrollAoAbrir.x
            && window.scrollY === kvs_posicaoScrollAoAbrir.y) return;
        const painel = kvs_instanciaAtiva.querySelector('.kvs__panel');
        const focoNoPopup = painel?.contains(document.activeElement) || false;
        kvs_fechar(kvs_instanciaAtiva, focoNoPopup);
    }, { passive: true });
    function composicaoCompactaAtiva() {
        return typeof window.matchMedia === 'function'
            ? window.matchMedia('(max-width: 1199.98px)').matches
            : window.innerWidth < 1200;
    }

    let frameRedesenhoConectores = null;

    function agendarRedesenhoConectores() {
        if (frameRedesenhoConectores !== null) return;
        const executar = () => {
            frameRedesenhoConectores = null;
            if (!pageScope.active) return;
            redesenharConectoresVisiveis();
        };
        if (typeof window.requestAnimationFrame === 'function') {
            frameRedesenhoConectores = window.requestAnimationFrame(executar);
        } else {
            frameRedesenhoConectores = window.setTimeout(executar, 0);
        }
    }

    function redesenharConectoresVisiveis() {
        const area = document.getElementById('bracketArea');
        const areaMob = document.getElementById('bracketAreaMob');
        if (area) _drawConnectors(area);
        if (areaMob) _drawConnectors(areaMob);
    }

    pageScope.onDeactivate(() => {
        if (frameRedesenhoConectores === null) return;
        if (typeof window.cancelAnimationFrame === 'function') {
            window.cancelAnimationFrame(frameRedesenhoConectores);
        } else {
            window.clearTimeout(frameRedesenhoConectores);
        }
        frameRedesenhoConectores = null;
    });

    pageScope.listen(window, 'resize', () => {
        if (kvs_instanciaAtiva) kvs_fechar(kvs_instanciaAtiva, true);
        else {
            const raizComFoco = document.activeElement?.closest?.('.kvs');
            if (raizComFoco && !kvs_triggerVisivel(raizComFoco.querySelector('.kvs__trigger'))) {
                const alvoFoco = kvs_triggerParaFoco(raizComFoco);
                if (alvoFoco) {
                    try { alvoFoco.focus({ preventScroll: true }); } catch (_) { alvoFoco.focus(); }
                    if (typeof window.requestAnimationFrame === 'function') {
                        window.requestAnimationFrame(() => {
                            if (document.activeElement !== alvoFoco) {
                                try { alvoFoco.focus({ preventScroll: true }); } catch (_) { alvoFoco.focus(); }
                            }
                        });
                    }
                }
            }
        }
        agendarRedesenhoConectores();
    });

    async function resolverInterclasse() {
        if (!idInterclasse) {
            const ativo = await window.SGIInterclasse.getActiveInterclasse();
            idInterclasse = ativo?.id_interclasse || null;
        }
        if (!idInterclasse) {
            await SGI.alert({ titulo: 'Interclasse não encontrado', mensagem: 'Nenhum interclasse ativo foi encontrado.', tipo: 'warning' });
            window.location.href = `${APP_BASE}/painel`;
            return null;
        }
        const dados = await window.SGIInterclasse.getInterclasseById(idInterclasse);
        ['nomeInterclasseChaveamento', 'nomeInterclasseChaveamentoMob'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerText = dados?.nome_interclasse || 'Interclasse';
        });
        ['btnVoltar', 'btnVoltarChaveamentoMob'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.href = `${APP_BASE}/painel?id=${idInterclasse}`;
        });
        return idInterclasse;
    }

    function _contarCampeoesConfirmados(modalidades, resultados) {
        const confirmados = new Set();
        (Array.isArray(modalidades) ? modalidades : []).forEach(modalidade => {
            const id = String(modalidade.id_modalidade || '');
            const resultado = typeof resultados?.get === 'function' ? resultados.get(id) : resultados?.[id];
            if (!id || !resultado || resultado.success !== true) return;

            if (modalidadeEhIndividual(modalidade)) {
                const jogo = resultado.jogo;
                const concluido = jogo && ['concluido', 'finalizado'].includes(String(jogo.status_jogo || '').toLowerCase());
                const primeiroLugar = Array.isArray(resultado.ranking)
                    && resultado.ranking.some(item => Number(item.posicao) === 1 && Number(item.id_usuario) > 0);
                if (concluido && primeiroLugar) confirmados.add(id);
                return;
            }

            const jogos = Array.isArray(resultado.jogos) ? resultado.jogos : [];
            const finalConfirmada = jogos.some(jogo => {
                if (Number(jogo.fase_nivel) !== 2
                    || !['concluido', 'finalizado'].includes(String(jogo.status_jogo || '').toLowerCase())
                    || Number(jogo.equipe_vencedora_id) <= 0
                    || !Array.isArray(jogo.equipes)) return false;
                return jogo.equipes.some(equipe => Number(equipe.id_equipe) === Number(jogo.equipe_vencedora_id));
            });
            if (finalConfirmada) confirmados.add(id);
        });
        return confirmados;
    }

    async function carregarCampeoesConfirmados() {
        const resultados = new Map();
        for (const modalidade of modalidadesCache) {
            const id = String(modalidade.id_modalidade || '');
            if (!id) continue;
            // O chaveamento já reconstruído no navegador é a fonte autoritativa
            // durante o offline. Não descarte o campeão local só porque a
            // consulta HTTP da modalidade falhou ou foi atendida pelo cache.
            if (_fonteDadosAtual !== 'remota'
                && String(_currentModalidade) === id
                && !modalidadeEhIndividual(modalidade)
                && Array.isArray(_lastBracketData)) {
                resultados.set(id, { success: true, jogos: _lastBracketData });
                continue;
            }
            try {
                const individual = modalidadeEhIndividual(modalidade);
                const consulta = individual
                    ? `${API_BASE}/chaveamentos?tipo_modalidade=individual&acao=ranking&id_modalidade=${encodeURIComponent(id)}`
                    : `${API_BASE}/chaveamentos?acao=arvore&id_modalidade=${encodeURIComponent(id)}`;
                const resposta = await fetch(consulta);
                if (!resposta.ok) continue;
                resultados.set(id, await resposta.json());
            } catch (erro) {
                console.warn('Não foi possível confirmar o campeão da modalidade:', id, erro);
            }
        }
        return _contarCampeoesConfirmados(modalidadesCache, resultados);
    }

    function atualizarStats(jogos, campeoesConfirmados = new Set()) {
        const total = modalidadesCache.length;
        const jogosReais = Array.isArray(jogos) ? jogos.filter(jogoEhReal) : [];
        const totalJogos = jogosReais.length;
        const concluidos = jogosReais.filter(j => ['concluido', 'finalizado'].includes(String(j.status_jogo || '').toLowerCase())).length;
        const pendentes = totalJogos - concluidos;
        const totalCampeoes = Number.isInteger(campeoesConfirmados?.size) ? campeoesConfirmados.size : 0;

        ['statModalidades', 'statModalidadesMob'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = total;
        });
        ['statJogos', 'statJogosMob'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = totalJogos;
        });
        ['statCampeoes', 'statCampeoesMob'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = totalCampeoes;
        });
        ['statPendentes', 'statPendentesMob'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = Math.max(0, pendentes);
        });
    }

    function atualizarTimeline(niveis) {
        const timeline = document.getElementById('faseTimeline');
        if (!niveis || niveis.length === 0) {
            timeline.classList.add('d-none');
            return;
        }

        const fases = niveis.map((n, i) => ({
            nivel: n,
            label: (computarLabelsFases(niveis)[n]) || formatFase(n)
        }));
        const nivelAtual = fases[0]?.nivel || 1;

        let html = '<div class="d-flex align-items-center flex-nowrap">';
        fases.forEach((f, i) => {
            const isUltimo = i === 0;
            let cls = 'badge rounded-pill px-3 py-2 text-uppercase';
            if (isUltimo) cls += ' text-bg-danger';
            else if (i > 0) cls += ' text-bg-success';
            else cls += ' text-bg-secondary';

            html += `<span class="${cls}">${f.label}</span>`;
            if (i < fases.length - 1) {
                html += '<span class="text-body-tertiary px-2 flex-shrink-0"><i class="bi bi-arrow-right"></i></span>';
            }
        });
        html += '</div>';
        timeline.innerHTML = html;
        timeline.classList.remove('d-none');
    }

    async function carregarModalidades() {
        try {
            const resp = await fetch(`${API_BASE}/modalidades?id_interclasse=${idInterclasse}`);
            const data = await resp.json();
            modalidadesCache = Array.isArray(data) ? data : [];
            const select = document.getElementById('selectModalidade');
            if (select) select.innerHTML = '<option value="">Selecione uma modalidade</option>';
            const selectJogos = document.getElementById('filtroModalidadeJogos');
            selectJogos.innerHTML = '<option value="">Todas modalidades</option>';

            const selectMob = document.getElementById('selectModalidadeMob');
            if (selectMob) selectMob.innerHTML = '<option value="">Selecione uma modalidade</option>';
            const selectJogosMob = document.getElementById('filtroModalidadeJogosMob');
            if (selectJogosMob) selectJogosMob.innerHTML = '<option value="">Todas modalidades</option>';

            modalidadesCache.forEach(mod => {
                const genero = mod.genero_modalidade ? ` (${mod.genero_modalidade})` : '';
                const categoria = mod.nome_categoria ? ` [${mod.nome_categoria}]` : '';
                const label = `${mod.nome_modalidade}${genero}${categoria}`;
                if (select) select.innerHTML += `<option value="${mod.id_modalidade}">${label}</option>`;
                selectJogos.innerHTML += `<option value="${mod.id_modalidade}">${label}</option>`;
                if (selectMob) selectMob.innerHTML += `<option value="${mod.id_modalidade}">${label}</option>`;
                if (selectJogosMob) selectJogosMob.innerHTML += `<option value="${mod.id_modalidade}">${label}</option>`;
            });

            kvs_montarGrupos();
            if (!usarSeletorNativo()) {
                kvs_montar({
                    wrapId: 'kvs-wrap-selectModalidade', selectId: 'selectModalidade',
                    peerWrapId: 'kvs-wrap-selectModalidadeMob', peerSelectId: 'selectModalidadeMob',
                    placeholder: 'Selecione uma modalidade', ariaLabel: 'Selecionar modalidade do chaveamento',
                    listboxLabel: 'Modalidades disponíveis', incluirTodas: false
                });
                kvs_montar({
                    wrapId: 'kvs-wrap-selectModalidadeMob', selectId: 'selectModalidadeMob',
                    peerWrapId: 'kvs-wrap-selectModalidade', peerSelectId: 'selectModalidade',
                    placeholder: 'Selecione uma modalidade', ariaLabel: 'Selecionar modalidade do chaveamento',
                    listboxLabel: 'Modalidades disponíveis', incluirTodas: false
                });
                kvs_montar({
                    wrapId: 'kvs-wrap-filtroModalidadeJogos', selectId: 'filtroModalidadeJogos',
                    peerWrapId: 'kvs-wrap-filtroModalidadeJogosMob', peerSelectId: 'filtroModalidadeJogosMob',
                    placeholder: 'Todas modalidades', ariaLabel: 'Filtrar jogos por modalidade',
                    listboxLabel: 'Modalidades para filtrar jogos', incluirTodas: true
                });
                kvs_montar({
                    wrapId: 'kvs-wrap-filtroModalidadeJogosMob', selectId: 'filtroModalidadeJogosMob',
                    peerWrapId: 'kvs-wrap-filtroModalidadeJogos', peerSelectId: 'filtroModalidadeJogos',
                    placeholder: 'Todas modalidades', ariaLabel: 'Filtrar jogos por modalidade',
                    listboxLabel: 'Modalidades para filtrar jogos', incluirTodas: true
                });
            }

            atualizarStats(jogosCache);
        } catch (e) {
            console.error("Erro ao carregar modalidades:", e);
        }
    }

    async function carregarCategorias() {
        const select = document.getElementById('filtroCategoriaJogos');
        const selectMob = document.getElementById('filtroCategoriaJogosMob');
        try {
            const resp = await fetch(`${API_BASE}/categorias?id_interclasse=${idInterclasse}`);
            const data = await resp.json();
            const categorias = Array.isArray(data) ? data : [];
            select.innerHTML = '<option value="">Todas categorias</option>';
            if (selectMob) selectMob.innerHTML = '<option value="">Todas categorias</option>';
            categorias.forEach(c => {
                select.innerHTML += `<option value="${c.id_categoria}">${c.nome_categoria}</option>`;
                if (selectMob) selectMob.innerHTML += `<option value="${c.id_categoria}">${c.nome_categoria}</option>`;
            });
            if (selectMob) selectMob.value = select.value;
        } catch (e) {
            console.error("Erro ao carregar categorias:", e);
        }
    }

    function formatarNomePartida(jogo) {
        const tag = jogo.nome_jogo || '';
        if (resolverTipoCompeticao(jogo) === null) {
            return 'Tipo não configurado';
        }
        if (jogoEhIndividual(jogo)) {
            const equipes = (jogo.equipes_nomes || '').trim();
            if (equipes) {
                return `Competição Individual: ${equipes}`;
            }
            return 'Competição Individual';
        }
        const mm = tag.match(/^(?:PL:\d+:(?:-?\d+:)?)?MM:(\d+):(\d+):([NB])$/);
        if (mm) {
            const largura = parseInt(mm[1], 10);
            const slot = parseInt(mm[2], 10);
            const kind = mm[3];
            const fases = {
                16: 'Oitavas de final',
                8: 'Quartas de final',
                4: 'Semifinal',
                2: 'Final',
                1: 'Campeão'
            };
            const fase = fases[largura] || 'Fase ' + largura;
            const confronto = slot + 1;
            const equipes = (jogo.equipes_nomes || '').trim();
            const sufixo = kind === 'B' ? ' (bye)' : '';
            if (equipes) {
                return `${fase} — confronto ${confronto}: ${equipes}${sufixo}`;
            }
            return `${fase} — confronto ${confronto}${sufixo}`;
        }
        const pos = tag.match(/^POS:(\d+):(\d+):([NB])$/);
        if (pos) {
            const posicao = parseInt(pos[1], 10);
            const nomesPos = {
                3: 'Disputa de 3º lugar',
                5: 'Disputa de 5º lugar'
            };
            return nomesPos[posicao] || `Disputa de ${posicao}º lugar`;
        }
        return tag || '---';
    }

    let _editIdJogo = null;
    let _editJogoData = null;
    let elementoRetornoFocoEdicao = null;
    const modalEdicaoJogo = document.getElementById('modalEditarJogo');
    if (modalEdicaoJogo) {
        pageScope.listen(modalEdicaoJogo, 'hidden.bs.modal', () => {
            const origem = elementoRetornoFocoEdicao;
            elementoRetornoFocoEdicao = null;
            if (origem?.isConnected && !origem.disabled && origem.getClientRects().length > 0) origem.focus();
        });
    }

    function _popularModalEdicao(jogo) {
        _editIdJogo = jogo.id_jogo;
        _editJogoData = jogo;

        document.getElementById('editIdJogo').value = jogo.id_jogo || '';
        document.getElementById('editNomePartida').textContent = formatarNomePartida(jogo);
        document.getElementById('editModalidadePartida').textContent = jogo.nome_modalidade || '';
        document.getElementById('editDataJogo').value = jogo.data_jogo || '';
        document.getElementById('editInicioJogo').value = jogo.inicio_jogo || '';
        document.getElementById('editTerminoJogo').value = jogo.termino_jogo || '';
        document.getElementById('editStatusJogo').value = jogo.status_jogo || 'Agendado';
        document.getElementById('msgEditarJogo').innerHTML = '';

        const teamsSection = document.getElementById('editTeamsSection');
        const teamsList = document.getElementById('editTeamsList');
        const winnerSection = document.getElementById('editWinnerSection');
        const winnerOptions = document.getElementById('editWinnerOptions');
        const eqs = jogo.equipes || [];

        if (eqs.length > 0 && !jogo.eh_bye) {
            teamsSection.classList.remove('d-none');
            let teamsHtml = '';
            eqs.forEach((eq, idx) => {
                const nome = eq.nome_equipe || eq.nome_fantasia || eq.nome_turma || `Equipe #${eq.id_equipe}`;
                const idCampoPlacar = `editScore_${esc(eq.id_equipe)}`;
                teamsHtml += `
                    <div class="team-row bg-body-tertiary border rounded-3 p-3 d-flex align-items-center gap-3 mb-2">
                        <div class="team-row__name flex-grow-1 fw-semibold text-body">${esc(nome)}</div>
                        <div class="team-row__score flex-shrink-0" style="width: 72px;">
                            <label class="visually-hidden" for="${idCampoPlacar}">Placar de ${esc(nome)}</label>
                            <input type="number" id="${idCampoPlacar}" min="0" class="form-control text-center fw-bold edit-score-input" data-equipe-id="${esc(eq.id_equipe)}" value="${esc(eq.gols ?? 0)}">
                        </div>
                    </div>`;
            });
            teamsList.innerHTML = teamsHtml;

            if (eqs.length === 2) {
                winnerSection.classList.remove('d-none');
                let winnerHtml = '';
                eqs.forEach(eq => {
                    const nome = eq.nome_equipe || eq.nome_fantasia || eq.nome_turma || `Equipe #${eq.id_equipe}`;
                    const checked = jogo.equipe_vencedora_id == eq.id_equipe ? 'checked' : '';
                    winnerHtml += `
                        <div class="winner-radio form-check d-flex align-items-center gap-2">
                            <input class="form-check-input mt-0" type="radio" name="editWinner" id="winner_${eq.id_equipe}" value="${eq.id_equipe}" ${checked}>
                            <label class="form-check-label small fw-semibold" for="winner_${esc(eq.id_equipe)}">${esc(nome)}</label>
                        </div>`;
                });
                winnerOptions.innerHTML = winnerHtml;
            } else {
                winnerSection.classList.add('d-none');
                winnerOptions.innerHTML = '';
            }
        } else {
            teamsSection.classList.add('d-none');
            teamsList.innerHTML = '';
            winnerSection.classList.add('d-none');
            winnerOptions.innerHTML = '';
        }
    }

    function editarJogo(btn) {
        if (!podeEditarJogo()) return;
        let jogo;
        try {
            jogo = JSON.parse(btn.dataset.jogo);
        } catch (e) {
            console.error('Erro ao parsear dados do jogo:', e);
            return;
        }

        _popularModalEdicao(jogo);
        elementoRetornoFocoEdicao = btn;

        var modalEl = document.getElementById('modalEditarJogo');
        var selectLocal = document.getElementById('editLocalJogo');
        selectLocal.innerHTML = '<option value="">Carregando...</option>';

        fetch(`${API_BASE}/locais?id_interclasse=${idInterclasse}&disponivel=1`)
            .then(function(r) {
                return r.json();
            })
            .then(function(data) {
                if (_editIdJogo !== jogo.id_jogo) return;
                const locais = data.success && Array.isArray(data.data) ? data.data : [];
                selectLocal.innerHTML = '<option value="">A definir</option>';
                locais.forEach(function(l) {
                    var sel = Number(l.id_local) === Number(jogo.locais_id_local) ? 'selected' : '';
                    selectLocal.innerHTML += '<option value="' + l.id_local + '" ' + sel + '>' + l.nome_local + '</option>';
                });
            })
            .catch(function() {
                if (_editIdJogo !== jogo.id_jogo) return;
                selectLocal.innerHTML = '<option value="">Erro ao carregar locais</option>';
            });

        var modal = bootstrap.Modal.getInstance(modalEl);
        if (!modal) modal = new bootstrap.Modal(modalEl);
        modal.show();
    }

    function editarJogoBracket(btn) {
        if (!podeEditarJogo()) return;
        /* Partidas geradas localmente (offline) recebem id negativo temporário:
           ainda não existem no servidor, então não podem ser editadas aqui.
           Elas serão materializadas pelo PHP durante a sincronização. */
        try {
            var dados = JSON.parse(btn.getAttribute('data-jogo'));
            if (dados && Number(dados.id_jogo) < 0) {
                SGI.alert('Esta partida foi gerada offline e será criada no servidor após a sincronização.');
                return;
            }
        } catch (e) { /* segue o fluxo normal */ }
        editarJogo(btn);
    }

    async function salvarEdicaoJogo(e) {
        if (e && e.preventDefault) e.preventDefault();
        if (!podeEditarJogo()) return false;
        var btn = document.getElementById('btnSalvarJogo');
        var msgEl = document.getElementById('msgEditarJogo');
        msgEl.innerHTML = '';

        var id_jogo = document.getElementById('editIdJogo').value;
        var data_jogo = document.getElementById('editDataJogo').value;
        var inicio_jogo = document.getElementById('editInicioJogo').value;
        var termino_jogo = document.getElementById('editTerminoJogo').value;
        var locais_id_local = document.getElementById('editLocalJogo').value;
        var status_jogo = document.getElementById('editStatusJogo').value;
        var statusAtual = _editJogoData && _editJogoData.status_jogo ? String(_editJogoData.status_jogo) : '';

        if (status_jogo === 'Concluido') {
            const scoreInputsCheck = document.querySelectorAll('.edit-score-input');
            if (scoreInputsCheck.length > 0) {
                const totalGols = Array.from(scoreInputsCheck).reduce((sum, inp) => sum + (Number(inp.value) || 0), 0);
                if (totalGols === 0) {
                    msgEl.innerHTML = '<span class="text-danger fw-bold">Não é possível finalizar um jogo com placar 0x0. Registre o placar correto.</span>';
                    return;
                }
            }
        }

        var payload = {
            id_jogo: Number(id_jogo),
            data_jogo: data_jogo || null,
            inicio_jogo: inicio_jogo || null,
            termino_jogo: termino_jogo || null,
            locais_id_local: locais_id_local ? Number(locais_id_local) : null,
        };
        if (status_jogo !== statusAtual) payload.status_jogo = status_jogo;

        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span> Salvando...';

        try {
                var resp = await fetch(`${API_BASE}/jogos`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            var data = await resp.json();

            if (data.success) {
                const scoreInputs = document.querySelectorAll('.edit-score-input');
                const hasScores = scoreInputs.length > 0;
                let scoresSaved = true;

                if (hasScores) {
                    const resultados = [];
                    scoreInputs.forEach(inp => {
                        resultados.push({
                            id_equipe: Number(inp.dataset.equipeId),
                            gols: Number(inp.value) || 0
                        });
                    });

                    const scoreResp = await fetch(`${API_BASE}/resultados`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            id_jogo: Number(id_jogo),
                            resultados: resultados
                        })
                    });
                    const scoreData = await scoreResp.json();
                    scoresSaved = scoreData.success;
                    if (!scoresSaved) {
                        msgEl.innerHTML = '<span class="text-warning fw-bold">Dados atualizados, mas erro ao salvar placar: ' + esc(scoreData.message || '') + '</span>';
                        setTimeout(function() {
                            var m = bootstrap.Modal.getInstance(document.getElementById('modalEditarJogo'));
                            if (m) m.hide();
                            const selectAtivo = document.getElementById('selectModalidade');
                            if (selectAtivo && selectAtivo.value) {
                                carregarArvore(selectAtivo.value);
                                carregarJogos();
                            }
                        }, 1500);
                        return;
                    }
                }

                msgEl.innerHTML = '<span class="text-success fw-bold">Jogo atualizado com sucesso!</span>';
                setTimeout(function() {
                    var m = bootstrap.Modal.getInstance(document.getElementById('modalEditarJogo'));
                    if (m) m.hide();
                    const selectAtivo = document.getElementById('selectModalidade');
                    if (selectAtivo && selectAtivo.value) {
                        carregarArvore(selectAtivo.value);
                        carregarJogos();
                    }
                }, 800);
            } else {
                msgEl.innerHTML = '<span class="text-danger fw-bold">' + esc(data.message || 'Erro ao atualizar jogo.') + '</span>';
            }
        } catch (err) {
            msgEl.innerHTML = '<span class="text-danger fw-bold">Erro de conexão.</span>';
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Salvar';
        }
    }

    function formatarDuracaoJogo(j) {
        if (!['concluido', 'finalizado'].includes(String(j?.status_jogo || '').toLowerCase())) return '—';
        const totalSec = Number(j?.duracao_jogo);
        if (!Number.isFinite(totalSec) || totalSec <= 0) return '—';
        const horas = Math.floor(totalSec / 3600);
        const minutos = Math.floor((totalSec % 3600) / 60);
        const segundos = Math.floor(totalSec % 60);
        const partes = [];
        if (horas > 0) partes.push(`${horas}h`);
        if (minutos > 0) partes.push(`${minutos}min`);
        if (segundos > 0) partes.push(`${segundos}s`);
        return partes.join(' ') || '—';
    }

    function formatarAcrescimosJogo(j) {
        if (j.status_jogo !== 'Concluido' && j.status_jogo !== 'Finalizado') return '---';
        const extraSec = parseInt(j.tempo_extra_jogo, 10);
        if (!extraSec || extraSec <= 0) return '---';
        const m = Math.floor(extraSec / 60);
        const s = extraSec % 60;
        if (m > 0) return '+' + m + 'min' + (s > 0 ? s + 's' : '');
        return '+' + s + 's';
    }

    function renderizarLinhaJogo(j, labelsLarguras = {}, compacto = false) {
        let dataJogo = '---';
        if (j.data_jogo) {
            try {
                dataJogo = new Date(j.data_jogo + (j.inicio_jogo ? 'T' + j.inicio_jogo : '')).toLocaleString('pt-BR');
            } catch (_) {
                dataJogo = j.data_jogo;
            }
        }
        var nomePartida = formatarNomePartida(j);
        var m = (j.nome_jogo || '').match(/^(?:PL:\d+:(?:-?\d+:)?)?MM:(\d+):/);
        if (m) {
            var largura = parseInt(m[1], 10);
            var labelCorreto = labelsLarguras[largura];
            if (labelCorreto) {
                var fases = {
                    16: 'Oitavas de final',
                    8: 'Quartas de final',
                    4: 'Semifinal',
                    2: 'Final',
                    1: 'Campeão'
                };
                var faseOriginal = fases[largura] || '';
                if (faseOriginal && faseOriginal !== labelCorreto) {
                    nomePartida = nomePartida.replace(faseOriginal, labelCorreto);
                }
            }
        }
        const statusLower = (j.status_jogo || '').toLowerCase();
        const statusLabel = j.status_jogo || '---';
        const tempoDecorrido = formatarDuracaoJogo(j);
        const acrescimos = formatarAcrescimosJogo(j);
        const destaque = j.artilheiro_nome || '---';
        const statusVariants = {
            agendado: 'warning',
            aguardando: 'info',
            andamento: 'primary',
            iniciado: 'primary',
            concluido: 'success',
            finalizado: 'success',
            cancelado: 'secondary'
        };
        const statusVariant = statusVariants[statusLower] || 'secondary';
        const prefixoCabecalho = compacto ? 'jogos-mob-th-' : 'jogos-th-';
        return `<tr>
            <td headers="${prefixoCabecalho}partida" class="td-partida fw-semibold text-body">${nomePartida}</td>
            <td headers="${prefixoCabecalho}modalidade" class="td-modalidade text-body-secondary fw-medium">${j.nome_modalidade || '---'}</td>
            <td headers="${prefixoCabecalho}data" class="td-data text-body-secondary text-nowrap">${dataJogo}</td>
            <td headers="${prefixoCabecalho}tempo">${tempoDecorrido}</td>
            <td headers="${prefixoCabecalho}acrescimos">${acrescimos}</td>
            <td headers="${prefixoCabecalho}destaque">${destaque}</td>
            <td headers="${prefixoCabecalho}status"><span class="badge rounded-pill text-bg-${statusVariant}">${statusLabel}</span></td>
            <td headers="${prefixoCabecalho}acoes">
                <div class="d-flex gap-2 justify-content-end">
                    <a href="${APP_BASE}/jogos/placar?id_jogo=${j.id_jogo}" class="btn btn-sm btn-outline-success d-inline-flex align-items-center justify-content-center" title="Acessar Jogo" aria-label="Acessar Jogo">
                        <i class="bi bi-play-fill"></i>
                    </a>
                    ${podeEditarJogo() ? `
                    <button class="btn btn-sm btn-outline-secondary d-inline-flex align-items-center justify-content-center" title="Editar Jogo" aria-label="Editar Jogo"
                        data-jogo='${JSON.stringify(j).replace(/'/g, "&#39;")}'
                        onclick="editarJogo(this)">
                        <i class="bi bi-pencil"></i>
                    </button>` : ''}
                </div>
            </td>
        </tr>`;
    }

    async function carregarJogos() {
        const tbody = document.getElementById('tbodyJogos');
        const tbodyMob = document.getElementById('tbodyJogosMob');
        try {
            const sufixoAtivo = composicaoCompactaAtiva() ? 'Mob' : '';
            const idModalidade = document.getElementById('filtroModalidadeJogos' + sufixoAtivo).value;
            const idCategoria = document.getElementById('filtroCategoriaJogos' + sufixoAtivo).value;

            let statsUrl = `${API_BASE}/jogos?visao=chaveamento&id_interclasse=${idInterclasse}`;
            const statsResp = await fetch(statsUrl);
            const statsData = await statsResp.json();
            const statsJogos = Array.isArray(statsData) ? statsData.filter(jogoEhReal) : [];
            const campeoesConfirmados = await carregarCampeoesConfirmados();
            atualizarStats(statsJogos, campeoesConfirmados);

            let url = `${API_BASE}/jogos?visao=chaveamento&id_interclasse=${idInterclasse}`;
            if (idModalidade) url += `&id_modalidade=${idModalidade}`;
            if (idCategoria) url += `&id_categoria=${idCategoria}`;

            const resp = await fetch(url);
            const data = await resp.json();
            let jogos = Array.isArray(data) ? data : [];

            jogos = jogos.filter(jogoEhReal);

            jogosCache = jogos;

            if (!jogos.length) {
                const msg = '<tr><td colspan="8" class="text-center text-muted py-4">Nenhum jogo encontrado.</td></tr>';
                tbody.innerHTML = msg;
                if (tbodyMob) tbodyMob.innerHTML = msg;
                return;
            }

            var larguras = [];
            var largurasSet = {};
            jogos.forEach(function(j) {
                var m = (j.nome_jogo || '').match(/^(?:PL:\d+:(?:-?\d+:)?)?MM:(\d+):/);
                if (m) {
                    var l = parseInt(m[1], 10);
                    if (l > 1 && !largurasSet[l]) {
                        largurasSet[l] = true;
                        larguras.push(l);
                    }
                }
            });
            larguras.sort(function(a, b) {
                return b - a;
            });
             var labelsLarguras = {};
            larguras.forEach(function(l) {
                labelsLarguras[l] = fasesLabel[l] || ('Fase ' + l);
            });

            tbody.innerHTML = jogos.map(j => renderizarLinhaJogo(j, labelsLarguras)).join('');
            if (tbodyMob) tbodyMob.innerHTML = jogos.map(j => renderizarLinhaJogo(j, labelsLarguras, true)).join('');
        } catch (e) {
            console.error("Erro ao carregar jogos:", e);
            const msg = '<tr><td colspan="8" class="text-center text-danger py-4">Erro ao carregar jogos.</td></tr>';
            tbody.innerHTML = msg;
            if (tbodyMob) tbodyMob.innerHTML = msg;
        }
    }

    const fasesLabel = {
        1: 'Campeão',
        2: 'Final',
        4: 'Semifinal',
        8: 'Quartas de final',
        16: 'Oitavas de final'
    };

    function formatFase(faseNivel) {
        return fasesLabel[faseNivel] || `Fase ${faseNivel}`;
    }

    function computarLabelsFases(niveis) {
        const labels = {};
        niveis.forEach(n => { labels[n] = formatFase(n); });
        return labels;
    }

    function formatFaseFromNome(nomeJogo) {
        const pos = (nomeJogo || '').match(/^POS:(\d+):/);
        if (pos) {
            const p = parseInt(pos[1], 10);
            const nomesPos = {
                3: 'Disputa de 3º lugar',
                5: 'Disputa de 5º lugar'
            };
            return nomesPos[p] || `Disputa de ${p}º lugar`;
        }
        return null;
    }

    /* ── Bracket Tree Renderer ── */
    let _lastBracketData = null;
    let _pollingTimer = null;
    let _currentModalidade = null;
    let _fonteDadosAtual = null;

    /* Selo visual quando a árvore foi calculada localmente (modo offline). */
    function _badgeFonteLocal() {
        return `<div class="alert alert-info mt-3 d-flex align-items-center gap-2" >
            <i class="bi bi-wifi-off"></i> Offline: árvore avançada localmente com os resultados deste dispositivo.
            Será sincronizada automaticamente quando a conexão voltar.
        </div>`;
    }

    function acoesBracketSempreVisiveis() {
        const ponteiroComHover = typeof window.matchMedia === 'function'
            && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        return composicaoCompactaAtiva() || !ponteiroComHover;
    }

    function _renderBracketMatch(jogo) {
        const eqs = jogo.equipes || [];
        const isBye = jogo.eh_bye;
        const isConcluido = jogo.status_jogo === 'Concluido' || jogo.status_jogo === 'Finalizado';
        const isIniciado = jogo.status_jogo === 'Iniciado' || jogo.status_jogo === 'Andamento';
        const isPosicao = jogo.eh_disputa_posicao;
        const vencId = jogo.equipe_vencedora_id;
        const jogoData = JSON.stringify(jogo).replace(/'/g, "&#39;").replace(/"/g, "&quot;");

        let cls = 'bkt-match card w-100 overflow-hidden position-relative mb-3';
        if (isConcluido) cls += ' bkt-match--concluido';
        if (isBye) cls += ' bkt-match--bye';
        if (isPosicao) cls += ' bkt-match--posicao';

        let teamsHtml = '';
        const teamBaseCls = 'bkt-team d-flex align-items-center gap-2 py-2 px-3';
        if (eqs.length === 0) {
            teamsHtml = `<div class="${teamBaseCls}"><span class="bkt-team__name text-body-tertiary fst-italic" >A definir</span><span class="bkt-team__score badge rounded-pill text-bg-light fs-6 fw-bold">-</span></div>
                         <div class="${teamBaseCls}"><span class="bkt-team__name text-body-tertiary fst-italic" >A definir</span><span class="bkt-team__score badge rounded-pill text-bg-light fs-6 fw-bold">-</span></div>`;
        } else {
            eqs.forEach(eq => {
                const nome = eq.nome_equipe || eq.nome_fantasia || eq.nome_turma || `Equipe #${eq.id_equipe}`;
                const isWinner = isConcluido && vencId && eq.id_equipe == vencId;
                const isLoser = isConcluido && vencId && eq.id_equipe != vencId && eqs.length > 1;
                let teamCls = teamBaseCls;
                if (isWinner) teamCls += ' bkt-team--winner bg-success-subtle';
                if (isLoser) teamCls += ' bkt-team--loser opacity-50';
                const nameCls = 'bkt-team__name flex-grow-1 text-truncate small fw-medium text-body' + (isWinner ? ' fw-bold text-success-emphasis' : '');
                const trophy = isWinner ? '<span class="bkt-team__trophy text-warning small ms-1" aria-hidden="true"><i class="bi bi-trophy-fill"></i></span>' : '';
                const winnerLabel = isWinner ? '<span class="bkt-team__winner-label badge rounded-pill text-bg-success small ms-1">Vencedor</span>' : '';
                const scoreCls = 'bkt-team__score badge rounded-pill text-bg-light fs-6 fw-bold' + (isWinner ? ' bg-success-subtle text-success-emphasis' : '');
                teamsHtml += `<div class="${teamCls}"><span class="${nameCls}">${nome}</span>${winnerLabel}${trophy}<span class="${scoreCls}">${eq.gols ?? 0}</span></div>`;
            });
        }

        let statusLabel = jogo.status_jogo || '---';
        let statusCls = 'bkt-match__status badge rounded-pill';
        if (isBye) {
            statusLabel = 'Bye';
            statusCls += ' text-bg-secondary';
        } else if (isConcluido) {
            statusCls += ' text-bg-success';
            statusLabel = 'Finalizado';
        } else if (isIniciado) {
            statusCls += ' text-bg-primary';
            statusLabel = 'Em andamento';
        } else if (jogo.status_jogo === 'Previsto') {
            statusCls += ' text-bg-info';
            statusLabel = 'Previsto';
        } else if (jogo.status_jogo === 'Aguardando') {
            statusCls += ' text-bg-warning';
            statusLabel = 'Aguardando participantes';
        } else {
            statusCls += ' text-bg-light border text-body-secondary';
        }

        const nomeModalidade = jogo.nome_modalidade || '';
        const nomeCategoria = jogo.nome_categoria || '';
        const dataJogo = jogo.data_jogo || '';
        const inicioJogo = jogo.inicio_jogo || '';
        const localJogo = jogo.nome_local || '';
        const faseLabel = isPosicao ? (formatFaseFromNome(jogo.nome_jogo) || 'Posição') : (jogo.nome_fase || '');

        let metaParts = [];
        if (faseLabel) metaParts.push(`<i class="bi bi-tag"></i><span>${faseLabel}</span>`);
        if (nomeModalidade) metaParts.push(`<span>${nomeModalidade}</span>`);
        metaParts.push(`<i class="bi bi-calendar3"></i><span>${dataJogo ? dataJogo + (inicioJogo ? ' ' + inicioJogo.substring(0,5) : '') : 'A definir'}</span>`);
        metaParts.push(`<i class="bi bi-geo-alt"></i><span>${localJogo || 'A definir'}</span>`);

        let actionsHtml = '';
        const actionVisibility = acoesBracketSempreVisiveis() ? ' opacity-100' : '';
        const podeEditar = podeEditarJogo();
        if (!jogo.virtual_planejado && !isBye && !isConcluido && jogo.id_jogo) {
            let botoes = '';
            const horarioObrigatorio = jogo.exige_horario_agendado !== false;
            const liberadoOffline = jogo._offline_liberado === true && eqs.length >= 2;
            if (jogo.status_jogo === 'Agendado' && (liberadoOffline || (jogo.data_jogo && jogo.locais_id_local && (!horarioObrigatorio || (jogo.inicio_jogo && jogo.termino_jogo))))) {
                botoes += `<a href="${APP_BASE}/jogos/placar?id_jogo=${jogo.id_jogo}" class="btn btn-sm btn-outline-success d-inline-flex align-items-center gap-1" title="Iniciar Jogo"><i class="bi bi-play-fill"></i>Iniciar</a>`;
            }
            if (podeEditar) {
                botoes += `<button class="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1" title="Editar Jogo" onclick="editarJogoBracket(this)" data-jogo='${jogoData}'><i class="bi bi-pencil"></i>Editar</button>`;
            }
            if (botoes) {
                actionsHtml += `<div class="bkt-match__actions d-flex gap-1 px-2 pb-2 justify-content-end${actionVisibility}">${botoes}</div>`;
            }
        }
        if (isConcluido && jogo.id_jogo) {
            let botoes = `<a href="${APP_BASE}/jogos/placar?id_jogo=${jogo.id_jogo}" class="btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-1" title="Ver resultado"><i class="bi bi-eye"></i>Ver resultado</a>`;
            if (podeEditar) {
                botoes += `<button class="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1" title="Editar Jogo" data-jogo='${JSON.stringify(jogo).replace(/'/g, "&#39;")}' onclick="editarJogoBracket(this)"><i class="bi bi-pencil"></i>Editar</button>`;
            }
            actionsHtml += `<div class="bkt-match__actions d-flex gap-1 px-2 pb-2 justify-content-end${actionVisibility}">${botoes}</div>`;
        }

        return `<div class="${cls}" data-jogo-id="${jogo.id_jogo || ''}">
            ${teamsHtml}
            <div class="bkt-match__meta d-flex align-items-center justify-content-between gap-2 px-3 py-2 bg-body-tertiary border-top">
                <div class="bkt-match__info d-flex align-items-center gap-1 flex-grow-1 overflow-hidden small text-body-secondary">${metaParts.join(' ')}</div>
                <span class="${statusCls}">${statusLabel}</span>
            </div>
            ${actionsHtml}
        </div>`;
    }

    function _detectarCampeao(jogos) {
        // O campeão é o vencedor da grande final (MM:2).
        const final = jogos.find(j => j.fase_nivel === 2 && (j.status_jogo === 'Concluido' || j.status_jogo === 'Finalizado'));
        if (!final || !final.equipes || !final.equipe_vencedora_id) return null;
        const winner = final.equipes.find(eq => eq.id_equipe == final.equipe_vencedora_id);
        if (!winner) return null;
        const nome = winner.nome_equipe || winner.nome_fantasia || winner.nome_turma || `Equipe #${winner.id_equipe}`;
        const mod = modalidadesCache.find(m => String(m.id_modalidade) == _currentModalidade);
        const modName = mod ? `${mod.nome_modalidade}${mod.genero_modalidade ? ' ('+mod.genero_modalidade+')' : ''}${mod.nome_categoria ? ' ['+mod.nome_categoria+']' : ''}` : '';
        return {
            nome,
            modalidade: modName
        };
    }

    function _renderModernBracket(jogos) {
        const mmGames = jogos.filter(j => !j.eh_disputa_posicao);
        const posGames = jogos.filter(j => j.eh_disputa_posicao);

        const rounds = {};
        mmGames.forEach(j => {
            const nivel = j.fase_nivel || 0;
            if (!rounds[nivel]) rounds[nivel] = [];
            rounds[nivel].push(j);
        });

        const niveis = Object.keys(rounds).map(Number).sort((a, b) => b - a);
        const labelsFases = computarLabelsFases(niveis);

        const campeao = _detectarCampeao(jogos);

        let html = '<div class="bracket-tree">';

        niveis.forEach((nivel, nivelIdx) => {
            const roundGames = rounds[nivel].sort((a, b) => (a.posicao_na_chave || 0) - (b.posicao_na_chave || 0));
            const matchCount = roundGames.length;

            html += '<div class="bracket-round-col">';
            html += `<div class="bracket-round-header badge rounded-pill bg-danger-subtle text-danger-emphasis border border-danger-subtle px-3 py-2 mb-4 text-uppercase">${labelsFases[nivel] || formatFase(nivel)}</div>`;

            roundGames.forEach((jogo, idx) => {
                html += _renderBracketMatch(jogo);
            });

            html += '</div>';

            if (nivelIdx < niveis.length - 1) {
                const nextNivel = niveis[nivelIdx + 1];
                const nextCount = rounds[nextNivel]?.length || 1;
                const connectorHeight = matchCount * 140;
                html += '<div class="bkt-connector"></div>';
            }
        });

        if (posGames.length > 0) {
            html += '<div class="bracket-round-col">';
            html += '<div class="bracket-round-header badge rounded-pill bg-danger-subtle text-danger-emphasis border border-danger-subtle px-3 py-2 mb-4 text-uppercase" >Disputas de Posição</div>';
            posGames.forEach(j => {
                html += _renderBracketMatch(j);
            });
            html += '</div>';
        }

        if (campeao) {
            html += '<div class="bkt-connector sgi-u-h-120px" ></div>';
            html += '<div class="bracket-champion-col">';
            html += '<div class="bracket-champion-card card border-warning border-2 bg-warning-subtle shadow-sm text-center p-4 w-100">';
            html += '<div class="bracket-champion-card__icon fs-1 mb-2" aria-hidden="true">🏆</div>';
            html += '<div class="bracket-champion-card__label small text-uppercase fw-bold text-warning-emphasis mb-2">Campeão</div>';
            html += `<div class="bracket-champion-card__name h5 fw-bold text-warning-emphasis lh-sm mb-0">${campeao.nome}</div>`;
            if (campeao.modalidade) html += `<div class="bracket-champion-card__mod small text-warning-emphasis mt-2">${campeao.modalidade}</div>`;
            html += '</div></div>';
        }

        html += '</div>';
        return html;
    }

    function _drawConnectors(container) {
        if (!container) return;
        const tree = container.querySelector('.bracket-tree');
        if (!tree || !container.isConnected || container.getClientRects().length === 0) return;
        /* A árvore compacta empilha as fases e oculta os conectores. Evite
           criar SVGs de dimensões zero; ao cruzar 1200px o listener de resize
           redesenha somente a raiz que ficou visível. */
        if (composicaoCompactaAtiva()) return;
        const cols = tree.querySelectorAll('.bracket-round-col');
        const connectors = tree.querySelectorAll('.bkt-connector');

        let prevMatches = [];
        cols.forEach((col, colIdx) => {
            if (colIdx === 0) {
                prevMatches = Array.from(col.querySelectorAll('.bkt-match'));
                return;
            }

            const currentMatches = Array.from(col.querySelectorAll('.bkt-match'));
            const connector = connectors[colIdx - 1];
            if (!connector || currentMatches.length === 0 || prevMatches.length === 0) {
                prevMatches = currentMatches;
                return;
            }

            const treeRect = tree.getBoundingClientRect();
            const connRect = connector.getBoundingClientRect();

            let svg = connector.querySelector('svg');
            if (!svg) {
                svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.setAttribute('width', '20');
                svg.style.position = 'absolute';
                svg.style.top = '0';
                svg.style.left = '0';
                svg.style.width = '100%';
                svg.style.height = '100%';
                svg.style.pointerEvents = 'none';
                connector.appendChild(svg);
            }

            const totalWidth = connector.offsetWidth;
            const totalHeight = connector.offsetHeight;
            svg.setAttribute('viewBox', `0 0 ${totalWidth} ${totalHeight}`);
            svg.innerHTML = '';

            const pairsPerParent = Math.max(1, Math.floor(prevMatches.length / currentMatches.length));

            currentMatches.forEach((match, mIdx) => {
                const matchRect = match.getBoundingClientRect();
                const matchY = matchRect.top - treeRect.top + matchRect.height / 2;

                const startIdx = mIdx * pairsPerParent;
                const endIdx = Math.min(startIdx + pairsPerParent, prevMatches.length);

                for (let i = startIdx; i < endIdx; i++) {
                    if (!prevMatches[i]) continue;
                    const prevRect = prevMatches[i].getBoundingClientRect();
                    const prevY = prevRect.top - treeRect.top + prevRect.height / 2;

                    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    const midX = totalWidth / 2;
                    const d = `M 0 ${prevY - connRect.top + treeRect.top - connRect.top} H ${midX} V ${matchY - connRect.top} H ${totalWidth}`;
                    path.setAttribute('d', d);
                    path.setAttribute('fill', 'none');
                    path.setAttribute('stroke', '#d1d5db');
                    path.setAttribute('stroke-width', '1.5');
                    path.setAttribute('stroke-linecap', 'round');
                    svg.appendChild(path);
                }
            });

            prevMatches = currentMatches;
        });
    }

    let _jogoIndividualCache = null;

    async function editarJogoIndividual(e) {
        if (e && e.preventDefault) e.preventDefault();
        if (!podeEditarJogo()) return;
        if (!_jogoIndividualCache) {
            SGI.alert('Nenhum jogo registrado para esta modalidade.');
            return;
        }
        const jogo = _jogoIndividualCache;
        _popularModalEdicao(jogo);
        elementoRetornoFocoEdicao = e?.currentTarget || document.activeElement;

        var modalEl = document.getElementById('modalEditarJogo');
        var selectLocal = document.getElementById('editLocalJogo');
        selectLocal.innerHTML = '<option value="">Carregando...</option>';

        fetch(`${API_BASE}/locais?id_interclasse=${idInterclasse}&disponivel=1`)
            .then(function(r) {
                return r.json();
            })
            .then(function(data) {
                if (_editIdJogo !== jogo.id_jogo) return;
                const locais = data.success && Array.isArray(data.data) ? data.data : [];
                selectLocal.innerHTML = '<option value="">A definir</option>';
                locais.forEach(function(l) {
                    var sel = Number(l.id_local) === Number(jogo.locais_id_local) ? 'selected' : '';
                    selectLocal.innerHTML += '<option value="' + l.id_local + '" ' + sel + '>' + l.nome_local + '</option>';
                });
            })
            .catch(function() {
                if (_editIdJogo !== jogo.id_jogo) return;
                selectLocal.innerHTML = '<option value="">Erro ao carregar locais</option>';
            });

        var modal = bootstrap.Modal.getInstance(modalEl);
        if (!modal) modal = new bootstrap.Modal(modalEl);
        modal.show();
    }

    async function carregarArvore(idModalidade) {
        const area = document.getElementById('bracketArea');
        const areaMob = document.getElementById('bracketAreaMob');
        const linkArvore = document.getElementById('linkVerArvore');
        const timeline = document.getElementById('faseTimeline');

        if (linkArvore) linkArvore.classList.add('d-none');
        timeline.classList.add('d-none');

        if (!idModalidade) {
            const emptyHtml = `
                <div class="card border-0 shadow-sm rounded-4 text-center p-5">
                    <div class="display-1 text-body-tertiary mb-4" >
                        <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect x="8" y="12" width="20" height="14" rx="3" stroke="#d1d5db" stroke-width="2" fill="#f9fafb"/>
                            <rect x="8" y="54" width="20" height="14" rx="3" stroke="#d1d5db" stroke-width="2" fill="#f9fafb"/>
                            <rect x="52" y="33" width="20" height="14" rx="3" stroke="#e30613" stroke-width="2" fill="#fef2f2"/>
                            <path d="M28 19 H40 V40 H52" stroke="#d1d5db" stroke-width="1.5" fill="none"/>
                            <path d="M28 61 H40 V40 H52" stroke="#d1d5db" stroke-width="1.5" fill="none"/>
                        </svg>
                    </div>
                    <div class="h4 fw-bold text-body mb-2" >Nenhum cronograma publicado</div>
                    <div class="small text-body-secondary mb-4" >Publique o cronograma da edição para disponibilizar a árvore da competição.</div>
                </div>`;
            area.innerHTML = emptyHtml;
            if (areaMob) areaMob.innerHTML = emptyHtml;
            return;
        }

        _currentModalidade = idModalidade;

        const mod = modalidadesCache.find(m => String(m.id_modalidade) === idModalidade);
        const tipoCompeticao = resolverTipoCompeticao(mod);
        if (!tipoCompeticao) {
            const erroTipo = '<div class="card border-0 shadow-sm rounded-4 text-center p-5"><div class="display-5 text-warning mb-3"><i class="bi bi-exclamation-triangle"></i></div><div class="h5 fw-bold text-body mb-2">Tipo de modalidade não configurado</div><div class="small text-body-secondary">Cadastre o tipo da modalidade antes de carregar o ranking.</div></div>';
            area.innerHTML = erroTipo;
            if (areaMob) areaMob.innerHTML = erroTipo;
            return;
        }
        const isIndividual = tipoCompeticao === 'individual';

        if (isIndividual) {
            const loadingHtml = `
                <div class="card border-0 shadow-sm rounded-4 text-center p-5">
                    <div class="spinner-border text-primary mb-3" role="status"><span class="visually-hidden">Carregando...</span></div>
                    <div class="small text-body-secondary">Carregando ranking individual...</div>
                </div>`;
            area.innerHTML = loadingHtml;
            if (areaMob) areaMob.innerHTML = loadingHtml;

            try {
                const resRank = await fetch(`${API_BASE}/chaveamentos?tipo_modalidade=individual&acao=ranking&id_modalidade=${idModalidade}`);
                const dadosRank = await resRank.json();
                const rankingAtual = (dadosRank.success && dadosRank.ranking) ? dadosRank.ranking : [];
                const jogoIndividual = dadosRank.jogo || null;

                let rankingDisplay = '';
                if (rankingAtual.length > 0) {
                    const posLabels = ['🥇 1º Lugar', '🥈 2º Lugar', '🥉 3º Lugar'];
                    const posBg = ['border-warning bg-warning-subtle', 'border-secondary bg-secondary-subtle', 'border-warning bg-warning-subtle'];
                    rankingDisplay = '<div class="row row-cols-1 row-cols-sm-3 g-3 mt-3" >';
                    rankingAtual.forEach((r, idx) => {
                        const nome = esc(r.nome_usuario || 'Desconhecido');
                        const turma = esc(r.nome_fantasia_turma || r.nome_turma || '');
                        rankingDisplay += `
                            <div class="col"><article class="card h-100 text-center p-4 shadow-sm border-2 ${posBg[idx] || 'border-light bg-body-tertiary'}">
                                <div class="fs-2 mb-2" aria-hidden="true">${idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}</div>
                                <div class="small text-uppercase fw-semibold text-body-secondary mb-1">${posLabels[idx] || (idx+1)+'º Lugar'}</div>
                                <div class="fw-bold text-body">${nome}</div>
                                <div class="small text-body-secondary mt-1" >${turma}</div>
                            </article></div>`;
                    });
                    rankingDisplay += '</div>';
                } else {
                    rankingDisplay = '<div class="text-center text-body-secondary border rounded-3 bg-body-tertiary p-4" ><div class="display-6 mb-2"><i class="bi bi-award"></i></div><div class="fw-semibold">Nenhum ranking registrado</div><div class="small mt-1">Registre os colocados (1º, 2º e 3º lugar) na página do jogo.</div></div>';
                }

                const individualHtml = `
                    <div class="card border-0 shadow-sm rounded-4 mb-4">
                        <div class="p-4 border-bottom d-flex justify-content-between align-items-center" >
                            <div class="h5 fw-bold text-body mb-0"><i class="bi bi-award-fill text-danger me-2"></i>Ranking Atual</div>
                            ${(jogoIndividual && podeEditarJogo()) ? `
                            <div class="dropdown">
                                <button class="btn btn-sm btn-outline-secondary" type="button" data-bs-toggle="dropdown" aria-expanded="false" title="Mais opções">
                                    <i class="bi bi-three-dots-vertical"></i>
                                </button>
                                <ul class="dropdown-menu dropdown-menu-end shadow-sm" >
                                    <li><a class="dropdown-item small d-flex align-items-center gap-2" href="#" onclick="editarJogoIndividual(event)" ><i class="bi bi-pencil"></i> Editar Jogo</a></li>
                                </ul>
                            </div>` : ''}
                        </div>
                        <div class="p-4">
                            ${rankingDisplay}
                        </div>
                    </div>
                    <div class="alert alert-info mt-3 d-flex align-items-center gap-2" >
                        <i class="bi bi-info-circle"></i> Os colocados (1º, 2º e 3º lugar) são registrados na página do jogo.
                    </div>`;

                _jogoIndividualCache = jogoIndividual;
                area.innerHTML = individualHtml;
                if (areaMob) areaMob.innerHTML = individualHtml;

            } catch (e) {
                console.error("Erro ao carregar ranking individual:", e);
                const errHtml = `<div class="card border-0 shadow-sm rounded-4 text-center p-5"><div class="display-5 text-warning mb-3"><i class="bi bi-exclamation-triangle"></i></div><div class="h5 fw-bold text-body mb-2">Erro</div><div class="small text-body-secondary">Erro ao carregar dados da modalidade individual.</div></div>`;
                area.innerHTML = errHtml;
                if (areaMob) areaMob.innerHTML = errHtml;
            }
            return;
        }

        const loadingHtml = `
            <div class="card border-0 shadow-sm rounded-4 text-center p-5">
                <div class="spinner-border text-primary mb-3" role="status"><span class="visually-hidden">Carregando...</span></div>
                <div class="small text-body-secondary">Carregando chaveamento...</div>
            </div>`;
        area.innerHTML = loadingHtml;
        if (areaMob) areaMob.innerHTML = loadingHtml;

        try {
            /* Camada híbrida: 1º tenta a API PHP; sem conexão, usa o snapshot
               do IndexedDB e processa o avanço da árvore no frontend com os
               resultados gravados no banco JS temporário. */
            const resultado = await SGIChaveamento.carregarArvore(idModalidade);
            const jogos = resultado.jogos || [];
            _fonteDadosAtual = resultado.fonte;
            _lastBracketData = jogos;

            if (jogos.length === 0) {
                const emptyHtml = `
                    <div class="card border-0 shadow-sm rounded-4 text-center p-5">
                        <div class="display-5 text-body-tertiary mb-3"><i class="bi bi-diagram-3"></i></div>
                        <div class="h5 fw-bold text-body mb-2">Nenhum cronograma publicado</div>
                        <div class="small text-body-secondary">Publique o cronograma da edição para disponibilizar a árvore da competição.</div>
                    </div>`;
                area.innerHTML = emptyHtml;
                if (areaMob) areaMob.innerHTML = emptyHtml;
                return;
            }

            const modernHtml = _renderModernBracket(jogos) + (_fonteDadosAtual !== 'remota' ? _badgeFonteLocal() : '');
            area.innerHTML = modernHtml;
            if (areaMob) areaMob.innerHTML = modernHtml;

            requestAnimationFrame(() => {
                _drawConnectors(area);
                _drawConnectors(areaMob);
            });

            const niveis = [...new Set(jogos.filter(j => !j.eh_disputa_posicao).map(j => j.fase_nivel))].sort((a, b) => b - a);
            atualizarTimeline(niveis);
            iniciarPolling();
            if (_fonteDadosAtual !== 'remota') {
                // Recalcula os indicadores depois que o motor local derivou os
                // vencedores; antes disso o resumo só conhece o snapshot inicial.
                await carregarJogos();
            }

        } catch (e) {
            console.error("Erro ao carregar árvore:", e);
            const errHtml = `<div class="card border-0 shadow-sm rounded-4 text-center p-5"><div class="display-5 text-warning mb-3"><i class="bi bi-exclamation-triangle"></i></div><div class="h5 fw-bold text-body mb-2">Erro de conexão</div><div class="small text-body-secondary">Não foi possível conectar ao servidor.</div></div>`;
            area.innerHTML = errHtml;
            if (areaMob) areaMob.innerHTML = errHtml;
        }
    }

    /* ── Polling for Real-time Updates ── */
    function iniciarPolling() {
        if (_pollingTimer) clearInterval(_pollingTimer);
        _pollingTimer = setInterval(async () => {
            if (!_currentModalidade) return;
            try {
                /* Mesma camada híbrida do carregamento inicial: online consulta
                   o PHP; offline recalcula a árvore a partir do banco JS local. */
                const resultado = await SGIChaveamento.carregarArvore(_currentModalidade);
                if (!pageScope.active) return;
                const jogos = resultado.jogos || [];
                if (!jogos.length) return;

                const oldStatuses = (_lastBracketData || []).map(j => `${j.id_jogo}:${j.status_jogo}`).join(',');
                const newStatuses = jogos.map(j => `${j.id_jogo}:${j.status_jogo}`).join(',');

                if (oldStatuses !== newStatuses || _fonteDadosAtual !== resultado.fonte) {
                    _fonteDadosAtual = resultado.fonte;
                    _lastBracketData = jogos;
                    const modernHtml = _renderModernBracket(jogos) + (_fonteDadosAtual !== 'remota' ? _badgeFonteLocal() : '');
                    const area = document.getElementById('bracketArea');
                    const areaMob = document.getElementById('bracketAreaMob');
                    if (area) area.innerHTML = modernHtml;
                    if (areaMob) areaMob.innerHTML = modernHtml;
                    requestAnimationFrame(() => {
                        _drawConnectors(area);
                        _drawConnectors(areaMob);
                    });
                    carregarJogos();
                }
            } catch (e) {
                /* silent */ }
        }, 8000);
    }

    /* Sincronização de volta ao PHP: quando a conexão retorna e a árvore exibida
       foi calculada localmente, envia os dados pendentes do banco JS temporário
       (a fila reproduz os POSTs originais e o servidor refaz o avanço). */
    if (window.SGIOffline && typeof window.SGIOffline.onStateChange === 'function') {
        window.SGIOffline.onStateChange(function (estado) {
            if (!estado.online) return;
            if (_fonteDadosAtual && _fonteDadosAtual !== 'remota') {
                SGIChaveamento.sincronizar().catch(function () { /* noop */ }).then(function () {
                    if (_currentModalidade) carregarArvore(_currentModalidade);
                });
            } else if (SGIOffline.hasPending()) {
                SGIChaveamento.sincronizar();
            }
        });
    }

    function pararPolling() {
        if (_pollingTimer) {
            clearInterval(_pollingTimer);
            _pollingTimer = null;
        }
    }

    const selectDesk = document.getElementById('selectModalidade');
    if (selectDesk) pageScope.listen(selectDesk, 'change', function() {
        const selectPar = document.getElementById('selectModalidadeMob');
        if (selectPar && selectPar.value !== this.value) selectPar.value = this.value;
        kvs_atualizarControle('kvs-wrap-selectModalidade', 'selectModalidade', 'Selecione uma modalidade', 'Selecionar modalidade do chaveamento');
        kvs_atualizarControle('kvs-wrap-selectModalidadeMob', 'selectModalidadeMob', 'Selecione uma modalidade', 'Selecionar modalidade do chaveamento');
        document.getElementById('msgChaveamento').innerHTML = '';
        document.getElementById('faseTimeline').classList.add('d-none');
        pararPolling();
        carregarArvore(this.value);
    });

    const selectMob = document.getElementById('selectModalidadeMob');
    if (selectMob) pageScope.listen(selectMob, 'change', function() {
        const selectPar = document.getElementById('selectModalidade');
        if (selectPar && selectPar.value !== this.value) selectPar.value = this.value;
        kvs_atualizarControle('kvs-wrap-selectModalidade', 'selectModalidade', 'Selecione uma modalidade', 'Selecionar modalidade do chaveamento');
        kvs_atualizarControle('kvs-wrap-selectModalidadeMob', 'selectModalidadeMob', 'Selecione uma modalidade', 'Selecionar modalidade do chaveamento');
        const msgMob = document.getElementById('msgChaveamentoMob');
        if (msgMob) msgMob.classList.add('d-none');
        pararPolling();
        carregarArvore(this.value);
    });

    function registrarFiltroPareado(idFonte, idPar, modalidade = false) {
        pageScope.listen(document.getElementById(idFonte), 'change', function() {
            const controlePar = document.getElementById(idPar);
            if (controlePar && controlePar.value !== this.value) controlePar.value = this.value;
            if (modalidade) {
                kvs_atualizarControle('kvs-wrap-filtroModalidadeJogos', 'filtroModalidadeJogos', 'Todas modalidades', 'Filtrar jogos por modalidade');
                kvs_atualizarControle('kvs-wrap-filtroModalidadeJogosMob', 'filtroModalidadeJogosMob', 'Todas modalidades', 'Filtrar jogos por modalidade');
            }
            carregarJogos();
        });
    }

    registrarFiltroPareado('filtroModalidadeJogos', 'filtroModalidadeJogosMob', true);
    registrarFiltroPareado('filtroModalidadeJogosMob', 'filtroModalidadeJogos', true);
    registrarFiltroPareado('filtroCategoriaJogos', 'filtroCategoriaJogosMob');
    registrarFiltroPareado('filtroCategoriaJogosMob', 'filtroCategoriaJogos');

    pageScope.listen(document.getElementById('inputBuscaJogo'), 'keyup', function() {
        var termo = this.value.toLowerCase().trim();
        var linhas = document.querySelectorAll('#tbodyJogos tr');
        linhas.forEach(function(tr) {
            if (termo === '') {
                tr.classList.remove('d-none');
                return;
            }
            var texto = tr.textContent.toLowerCase();
            if (texto.indexOf(termo) !== -1) {
                tr.classList.remove('d-none');
            } else {
                tr.classList.add('d-none');
            }
        });
    });

    pageScope.listen(document.getElementById('inputBuscaJogoMob'), 'keyup', function() {
        var termo = this.value.toLowerCase().trim();
        var linhas = document.querySelectorAll('#tbodyJogosMob tr');
        linhas.forEach(function(tr) {
            if (termo === '') {
                tr.classList.remove('d-none');
                return;
            }
            var texto = tr.textContent.toLowerCase();
            if (texto.indexOf(termo) !== -1) {
                tr.classList.remove('d-none');
            } else {
                tr.classList.add('d-none');
            }
        });
    });

    async function iniciarChaveamento() {
        const idOk = await resolverInterclasse();
        if (!idOk) return;
        await carregarModalidades();
        await carregarCategorias();
        await carregarJogos();
    }

    // A montagem pode ser usada por testes/consumidores que só precisam dos
    // formatadores; só inicializa a rede quando a tela está presente.
    if (document.getElementById('selectModalidade')) iniciarChaveamento();

    const formEditarJogo = document.getElementById('formEditarJogo');
    if (formEditarJogo) pageScope.listen(formEditarJogo, 'submit', salvarEdicaoJogo);

    pageScope.onDeactivate(pararPolling);
    window.SGIPage.ready(function () { if (_currentModalidade) iniciarPolling(); });
    pageScope.listen(window, 'beforeunload', pararPolling);

return {esc, podeEditarJogo, resolverTipoCompeticao, kvs_montarGrupos, kvs_sincronizar, kvs_montar, kvs_focus, resolverInterclasse, atualizarStats, _contarCampeoesConfirmados, atualizarTimeline, carregarModalidades, carregarCategorias, formatarNomePartida, _popularModalEdicao, editarJogo, editarJogoBracket, salvarEdicaoJogo, formatarDuracaoJogo, formatarAcrescimosJogo, renderizarLinhaJogo, carregarJogos, formatFase, computarLabelsFases, formatFaseFromNome, _badgeFonteLocal, _renderBracketMatch, _detectarCampeao, _renderModernBracket, _drawConnectors, editarJogoIndividual, carregarArvore, iniciarPolling, pararPolling, iniciarChaveamento};
});
