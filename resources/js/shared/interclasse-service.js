(function (window, document) {
    'use strict';

    window.SGIInterclasse = (function () {
        const basePath = window.SGI_BASE_PATH || '';
        const apiBase = (window.SGI_API_BASE || (basePath + '/api/v1/')).replace(/\/?$/, '/');
        const to = (path) => basePath + '/' + String(path).replace(/^\//, '');

        const obterTituloBasePagina = () => {
            const metaTituloPagina = document.querySelector('meta[name="sgi-page-title"]');
            const tituloPagina = String(metaTituloPagina?.getAttribute('content') || '').trim();
            return tituloPagina || 'SGI';
        };

        const endpoints = {
            home: to('aluno/inicio'),
            dashboard: to('painel'),
            categorias: to('ocorrencias'),
            turmas: to('turmas'),
            equipes: to('edicoes/equipes'),
            modalidades: to('edicoes/modalidades'),
            pontuacoes: to('edicoes/pontuacao'),
            locais: to('edicoes/locais'),
            arrecadacoes: to('edicoes/arrecadacao'),
            colaboradores: to('colaboradores'),
            agenda: to('edicoes/agenda'),
            chaveamentos: to('chaveamento'),
            ranking: to('ranking')
        };

        let cache = null;

        const sortByMostRecent = (lista) => {
            return [...lista].sort((a, b) => {
                const idA = Number(a.id_interclasse) || 0;
                const idB = Number(b.id_interclasse) || 0;
                if (idB !== idA) return idB - idA;
                const da = new Date(a.ano_interclasse || '1900-01-01').getTime();
                const db = new Date(b.ano_interclasse || '1900-01-01').getTime();
                return db - da;
            });
        };

        const toYear = (dataStr) => {
            if (!dataStr) return '';
            return String(dataStr).split('-')[0] || '';
        };

        const getInterclasses = async () => {
            if (cache) return cache;
            const response = await fetch(apiBase + 'edicoes?regulamento=true');
            if (!response.ok) throw new Error('Falha ao carregar interclasses');
            const data = await response.json();
            cache = Array.isArray(data) ? sortByMostRecent(data) : [];
            return cache;
        };

        const getActiveInterclasse = async () => {
            const lista = await getInterclasses();
            const ativos = lista.filter((item) => String(item.status_interclasse) === '1');
            if (ativos.length > 1) {
                console.warn('Mais de um interclasse ativo encontrado. Será usado o mais recente.');
            }
            return ativos[0] || null;
        };

        const getInterclasseById = async (id) => {
            const lista = await getInterclasses();
            return lista.find((item) => String(item.id_interclasse) === String(id)) || null;
        };

        const buildLinkTo = (key, idInterclasse) => {
            const base = endpoints[key] || endpoints.home;
            if (!idInterclasse) return base;
            const separador = base.includes('?') ? '&' : '?';
            return base + separador + 'id=' + idInterclasse;
        };

        const updatePageTitle = (nomeInterclasse) => {
            const tituloPagina = obterTituloBasePagina();
            const nomeEdicao = String(nomeInterclasse || '').trim();
            if (tituloPagina === 'SGI') {
                document.title = nomeEdicao ? nomeEdicao + ' | SGI' : 'SGI';
                return;
            }
            document.title = nomeEdicao && nomeEdicao !== tituloPagina
                ? tituloPagina + ' — ' + nomeEdicao + ' | SGI'
                : tituloPagina + ' | SGI';
        };

        const resolveId = async () => {
            const params = new URLSearchParams(window.location.search);
            let id = params.get('id');
            if (!id) {
                const ativo = await getActiveInterclasse();
                id = ativo?.id_interclasse || null;
                if (id) {
                    window.history.replaceState(null, '', '?id=' + id);
                }
            }
            if (id) {
                const dados = await getInterclasseById(id);
                if (dados) updatePageTitle(dados.nome_interclasse);
            }
            return id;
        };

        const registrarPaginaNavegacao = () => {
            try {
                const atual = window.location.pathname + window.location.search;
                const stack = JSON.parse(sessionStorage.getItem('sgi_nav_stack') || '[]');
                if (stack[stack.length - 1] !== atual) {
                    stack.push(atual);
                    sessionStorage.setItem('sgi_nav_stack', JSON.stringify(stack.slice(-30)));
                }
            } catch (_) { }
        };

        const navigateBack = (fallbackPath) => {
            try {
                const stack = JSON.parse(sessionStorage.getItem('sgi_nav_stack') || '[]');
                stack.pop();
                const anterior = stack.pop();
                sessionStorage.setItem('sgi_nav_stack', JSON.stringify(stack));
                if (anterior) {
                    window.location.href = anterior;
                    return;
                }
            } catch (_) { }
            window.location.href = fallbackPath || to('aluno/inicio');
        };

        const invalidateCache = () => { cache = null; };

        const refreshNavigation = async () => {
            invalidateCache();
        };

        return {
            endpoints,
            toYear,
            getInterclasses,
            getActiveInterclasse,
            getInterclasseById,
            buildLinkTo,
            updatePageTitle,
            resolveId,
            registrarPaginaNavegacao,
            navigateBack,
            invalidateCache,
            refreshNavigation
        };
    })();

    if (typeof window.esc !== 'function') {
        window.esc = function (s) {
            if (window.SGIHtml && typeof window.SGIHtml.escape === 'function') {
                return window.SGIHtml.escape(s);
            }
            const d = document.createElement('div');
            d.textContent = s == null ? '' : String(s);
            return d.innerHTML;
        };
    }

    document.addEventListener('DOMContentLoaded', () => {
        if (window.SGIInterclasse && typeof window.SGIInterclasse.registrarPaginaNavegacao === 'function') {
            window.SGIInterclasse.registrarPaginaNavegacao();
        }
    });
})(window, document);
