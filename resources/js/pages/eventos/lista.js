window.SGIPage.mount("eventos/lista", function (pageConfig, pageScope) {


function escaparHTML(string) {
    return window.SGIHtml
        ? window.SGIHtml.escape(string)
        : String(string == null ? '' : string).replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}



const API_BASE = String(window.SGI_API_BASE || `${window.SGI_BASE_PATH || ''}/api/v1/`).replace(/\/?$/, '/');
const BASE_PATH = String(window.SGI_BASE_PATH || '').replace(/\/$/, '');
const urlPainel = (id) => `${BASE_PATH}/painel?id=${encodeURIComponent(String(id))}`;
const estadoInterclasses = { lista: [] };
let edicoesCarregadas = false;
let carregandoEdicoes = false;

function anoInterclasse(item) {
    return item.ano_interclasse ? item.ano_interclasse.split('-')[0] : "N/A";
}

function statusAtivo(item) {
    return String(item.status_interclasse) === '1';
}



async function atualizarStatusInterclasse(idInterclasse, ativo) {
    const body = new FormData();
    body.append('status_interclasse', ativo ? '1' : '0');
    const response = await fetch(`${API_BASE}edicoes?id=${encodeURIComponent(String(idInterclasse))}`, { method: 'POST', body });
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch { throw new Error('Erro no servidor ao atualizar status.'); }
    if (!response.ok || !data.success) throw new Error(data.message || 'Não foi possível atualizar o status.');
    await window.SGIInterclasse.refreshNavigation();
    return data;
}

async function ativarComExclusividade(idParaAtivar) {
    await atualizarStatusInterclasse(idParaAtivar, true);
}

function cardClassStatus(ativo) {
    return ativo ? '' : 'opacity-75';
}


function mostrarFalhaEdicoes(conservarDados) {
    const listarMobile = document.getElementById('caixaListar');
    const listarDesktop = document.getElementById('listaDesktop');
    const erro = '<div class="text-center py-4" role="alert"><p class="text-danger mb-3">Não foi possível carregar as edições.</p><button type="button" class="btn btn-outline-primary" data-retry-lista-edicoes>Tentar novamente</button></div>';
    if (conservarDados) {
        [listarMobile, listarDesktop].forEach((container) => {
            if (!container) return;
            container.querySelector('[data-feedback-edicoes]')?.remove();
            container.insertAdjacentHTML('afterbegin', `<div class="mb-3" data-feedback-edicoes>${erro}</div>`);
        });
        return;
    }
    if (listarMobile) listarMobile.innerHTML = erro;
    if (listarDesktop) listarDesktop.innerHTML = erro;
}

function mostrarCarregamentoEdicoes() {
    const carregar = '<div class="text-center text-body-secondary py-5" role="status"><span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Carregando edições...</div>';
    ['caixaListar', 'listaDesktop'].forEach((id) => {
        const container = document.getElementById(id);
        if (container) {
            container.innerHTML = carregar;
            container.setAttribute('aria-busy', 'true');
        }
    });
}

async function listarInterclasses() {
    if (carregandoEdicoes) return;
    const listarMobile = document.getElementById('caixaListar');
    const listarDesktop = document.getElementById('listaDesktop');
    const conteinerComFoco = [listarMobile, listarDesktop].find((container) => container?.contains(document.activeElement));
    carregandoEdicoes = true;
    if (!edicoesCarregadas) mostrarCarregamentoEdicoes();
    [listarMobile, listarDesktop].forEach((container) => container?.setAttribute('aria-busy', 'true'));

    try {
        const res = await fetch(`${API_BASE}edicoes?regulamento=true`);
        const data = await res.json();
        if (!res.ok || !Array.isArray(data)) throw new Error('Resposta inválida ao carregar edições.');

        edicoesCarregadas = true;
        if (pageConfig.value1) estadoInterclasses.lista = [...data];
        if (data.length === 0) {
            const msgVazia = '<p class="text-center text-body-secondary mt-5" role="status" tabindex="-1">Nenhum interclasse cadastrado.</p>';
            listarMobile.innerHTML = msgVazia;
            listarDesktop.innerHTML = msgVazia;
            if (conteinerComFoco) conteinerComFoco.querySelector('[role="status"]')?.focus({ preventScroll: true });
            return;
        }

        const listaOrdenada = [...data].sort((a, b) => Number(b.id_interclasse) - Number(a.id_interclasse));
        if (pageConfig.value1) estadoInterclasses.lista = listaOrdenada;

        if (pageConfig.value3) {
            // Colaborador e Mesário: mostram apenas o ativo.
            const ativo = listaOrdenada.find(item => String(item.status_interclasse) === '1');
            if (!ativo) {
                const msg = '<p class="text-center text-body-secondary mt-5" role="status" tabindex="-1">Nenhum interclasse ativo no momento.</p>';
                listarMobile.innerHTML = msg;
                listarDesktop.innerHTML = msg;
                if (conteinerComFoco) conteinerComFoco.querySelector('[role="status"]')?.focus({ preventScroll: true });
                return;
            }
            var items = [ativo];
        } else {
            var items = listaOrdenada;
        }

        let htmlMobile = '';
        let htmlDesktop = '';

        items.forEach((item) => {
            const anoStr = item.ano_interclasse ? item.ano_interclasse.split('-')[0] : "N/A";
            const ativo = String(item.status_interclasse) === '1';
            const statusBadge = ativo
                ? '<span class="bg-danger rounded-3 text-white px-3 py-1 small">Ativo</span>'
                : '<span class="bg-secondary rounded-3 text-white px-3 py-1 small">Inativo</span>';
            const classeCard = pageConfig.value0
                ? (ativo ? '' : 'opacity-75')
                : (pageConfig.value2 ? cardClassStatus(ativo) : '');
            const nome = escaparHTML(item.nome_interclasse);
            const id = escaparHTML(item.id_interclasse);
            const ano = escaparHTML(anoStr);

            htmlMobile += `
                <a href="${escaparHTML(urlPainel(item.id_interclasse))}" class="text-decoration-none text-dark">
                    <div class="m-auto shadow d-flex justify-content-between align-content-center px-3 py-3 rounded-3 my-3 border border-1 ${classeCard} w-100">
                        <div>
                            <h2 class="m-0 fs-4">${nome}</h2>
                            <p class="text-secondary m-0">${ano}</p>
                            ${pageConfig.value2 ? `
                            <label class="form-check form-switch mt-2 mb-0">
                              <input class="form-check-input status-switch" type="checkbox" data-id="${id}" ${ativo ? 'checked' : ''}>
                              <span class="small text-muted">Interclasse ativo</span>
                            </label>
                            ` : ``}
                            ${pageConfig.value4 ? '<span class="badge bg-danger mt-2">Ativo</span>' : ''}
                        </div>
                        <img src="${(window.SGI_ASSET_BASE || `${BASE_PATH}/assets`) + '/images/arrow-right.svg'}" alt="">
                    </div>
                </a>
            `;

            htmlDesktop += `
                <div class="row bg-white shadow rounded-3 py-3 fs-5 mt-3 align-items-center px-2 border border-1 ${classeCard} sgi-u-cursor-pointer"
                     role="link" tabindex="0" data-sgi-action="open-interclasse" data-id-interclasse="${id}">
                    <div class="col-4 fw-semibold text-dark text-truncate">${nome}</div>
                    <div class="col-4 text-center text-secondary">${ano}</div>
                    <div class="col-4 text-center">
                        ${statusBadge}
                        ${pageConfig.value2 ? `
                        <div class="form-check form-switch d-flex justify-content-center mt-2">
                            <input class="form-check-input status-switch" type="checkbox" data-id="${id}" ${ativo ? 'checked' : ''}>
                        </div>
                        ` : ``}
                    </div>
                </div>
            `;
        });

        listarMobile.innerHTML = htmlMobile;
        listarDesktop.innerHTML = htmlDesktop;
        if (conteinerComFoco) {
            conteinerComFoco.querySelector('[data-sgi-action="open-interclasse"], a[href]')?.focus({ preventScroll: true });
        }
        if (pageConfig.value2) registrarEventosStatus();
    } catch (error) {
        console.error(error);
        mostrarFalhaEdicoes(edicoesCarregadas);
        if (conteinerComFoco) conteinerComFoco.querySelector('[data-retry-lista-edicoes]')?.focus({ preventScroll: true });
    } finally {
        carregandoEdicoes = false;
        [listarMobile, listarDesktop].forEach((container) => container?.setAttribute('aria-busy', 'false'));
    }
}

function registrarTentativasEdicoes() {
    ['caixaListar', 'listaDesktop'].forEach((id) => {
        const container = document.getElementById(id);
        pageScope.listen(container, 'click', (event) => {
            const retryLista = event.target.closest('[data-retry-lista-edicoes]');
            if (retryLista) {
                event.preventDefault();
                listarInterclasses();
                return;
            }
        });
    });
}


function registrarEventosStatus() {
    document.querySelectorAll('.status-switch').forEach((input) => {
        pageScope.listen(input, 'click', (event) => event.stopPropagation());
        pageScope.listen(input, 'change', async (event) => {
            const id = event.target.getAttribute('data-id');
            const checked = event.target.checked;
            event.target.disabled = true;
            try {
                if (checked) {
                    await ativarComExclusividade(id);
                } else {
                    await atualizarStatusInterclasse(id, false);
                }
                await listarInterclasses();
            } catch (error) {
                SGI.alert(error.message || 'Erro ao atualizar status do interclasse.');
                await listarInterclasses();
            } finally {
                event.target.disabled = false;
            }
        });
    });
}

function registrarEventosNavegacao() {
    const container = document.getElementById('listaDesktop');
    const navegar = (event) => {
        if (event.target.closest('.status-switch')) return;
        if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
        if (event.type === 'keydown') event.preventDefault();
        const card = event.target.closest('[data-sgi-action="open-interclasse"]');
        if (card) window.location.href = urlPainel(card.dataset.idInterclasse);
    };
    pageScope.listen(container, 'click', navegar);
    pageScope.listen(container, 'keydown', navegar);
}

if (pageConfig.value2) {
pageScope.listen(document.getElementById('formulario'), 'submit', async (event) => {
    event.preventDefault();
    const nome = document.getElementById('nomeNovaEdicao').value;
    const ano = document.getElementById('anoNovaEdicao').value;
    const dataAtual = new Date();
    const mes = String(dataAtual.getMonth() + 1).padStart(2, '0');
    const dia = String(dataAtual.getDate()).padStart(2, '0');
    const dataFormatada = `${ano}-${mes}-${dia}`;

    const novoInterclasse = { nome_interclasse: nome.trim(), ano_interclasse: dataFormatada };

    try {
        document.getElementById('btnCriar').disabled = true;
        document.getElementById('btnCriar').innerText = "Criando...";

        const res = await fetch(`${API_BASE}edicoes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(novoInterclasse)
        });
        const data = await res.json();

        if (res.ok && data && data.success) {
            document.getElementById('caixaMensagem').innerHTML = '<p class="text-success text-center mt-3 mb-0 fw-bold">Criado com sucesso!</p>';
            const idCriado = data.id;
            await window.SGIInterclasse.refreshNavigation();
            document.getElementById('formulario').reset();
            listarInterclasses();
            setTimeout(() => {
                window.location.href = urlPainel(idCriado);
            }, 800);
        } else {
            throw new Error(data ? data.message : "Erro interno no servidor ao salvar.");
        }
    } catch (error) {
        const msgErro = error.response?.data?.message || error.message || "Erro desconhecido";
        document.getElementById('caixaMensagem').innerHTML = `<p class="text-danger text-center mt-3 mb-0 fw-bold">Erro: ${escaparHTML(msgErro)}</p>`;
    } finally {
        document.getElementById('btnCriar').disabled = false;
        document.getElementById('btnCriar').innerText = "Criar";
    }
});
}

if (pageConfig.value0) {
async function redirecionarParaInterclasseAtivo() {
    const conteinerComFoco = ['caixaListar', 'listaDesktop']
        .map((id) => document.getElementById(id))
        .find((container) => container?.contains(document.activeElement));
    const semAtivo = () => {
        const msg = '<p class="text-center text-body-secondary mt-5" role="status" tabindex="-1">Nenhuma edição de interclasse está ativa no momento.</p>';
        document.getElementById('caixaListar').innerHTML = msg;
        document.getElementById('listaDesktop').innerHTML = msg;
        if (conteinerComFoco) conteinerComFoco.querySelector('[role="status"]')?.focus({ preventScroll: true });
    };
    try {
        const res = await fetch(`${API_BASE}edicoes?regulamento=true`);
        const lista = await res.json();
        if (!res.ok || !Array.isArray(lista)) throw new Error('Resposta inválida ao consultar a edição ativa.');
        const ativos = lista.filter(item => String(item.status_interclasse) === '1');
        if (ativos.length > 0) {
            const ativo = ativos.sort((a, b) => Number(b.id_interclasse) - Number(a.id_interclasse))[0];
            window.location.replace(urlPainel(ativo.id_interclasse));
            return;
        }
    } catch (e) {
        console.error('Erro ao redirecionar:', e);
        // Offline: usa o id ativo gravado na sessão no login, se houver.
        const idSessao = window.SGI_SESSION_INTERCLASSE_ATIVO;
        if (idSessao) {
            window.location.replace(urlPainel(idSessao));
            return;
        }
        const erro = '<div class="text-center text-danger py-4" role="alert"><p class="mb-3">Não foi possível verificar a edição ativa.</p><button type="button" class="btn btn-outline-primary" data-retry-active-edition>Tentar novamente</button></div>';
        document.getElementById('caixaListar').innerHTML = erro;
        document.getElementById('listaDesktop').innerHTML = erro;
        if (conteinerComFoco) conteinerComFoco.querySelector('[data-retry-active-edition]')?.focus({ preventScroll: true });
        return;
    }
    semAtivo();
}

['caixaListar', 'listaDesktop'].forEach((id) => {
    pageScope.listen(document.getElementById(id), 'click', (event) => {
        if (!event.target.closest('[data-retry-active-edition]')) return;
        event.preventDefault();
        redirecionarParaInterclasseAtivo();
    });
});

window.SGIPage.ready( redirecionarParaInterclasseAtivo);
} else {
window.SGIPage.ready(() => {
    registrarTentativasEdicoes();
    registrarEventosNavegacao();
    listarInterclasses();
});
}

return {escaparHTML, anoInterclasse, statusAtivo, atualizarStatusInterclasse, ativarComExclusividade, cardClassStatus, listarInterclasses, registrarEventosStatus};
});
