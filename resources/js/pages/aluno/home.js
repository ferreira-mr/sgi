window.SGIPage.mount("aluno/home", function (pageConfig, pageScope) {

const APP_BASE = String(window.SGI_BASE_PATH || '').replace(/\/+$/, '');
const API_BASE = String(window.SGI_API_BASE || `${APP_BASE}/api/v1/`).replace(/\/?$/, '/');

function escapeHTML(string) {
    return window.SGIHtml
        ? window.SGIHtml.escape(string)
        : String(string == null ? '' : string).replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}

let allInterclasses = [];

function renderCards(items) {
    const container = document.getElementById('listaInterclassesAluno');

    if (!items || items.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5 text-body-secondary">
                <i class="bi bi-folder-x fs-1 d-block mb-3" aria-hidden="true"></i>
                <h5 class="fw-semibold mb-2">Nenhum interclasse encontrado</h5>
                <p class="small mb-0">No momento não há competições disponíveis com os filtros selecionados.</p>
            </div>`;
        return;
    }

    container.innerHTML = `<div class="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-4">${
        items.map(item => {
            const nome = escapeHTML(item.nome_interclasse);
            const ano = item.ano_interclasse ? escapeHTML(String(item.ano_interclasse).split('-')[0]) : 'N/A';
            const isAtivo = String(item.status_interclasse) === '1';
            const statusLabel = isAtivo ? 'Em Andamento' : 'Encerrado';
            const statusClass = isAtivo ? 'active' : 'inactive';
            const iconClass = isAtivo ? 'active' : 'inactive';
            const idInterclasse = encodeURIComponent(String(item.id_interclasse));
            const href = isAtivo ? `${APP_BASE}/aluno/modalidades?id=${idInterclasse}` : `${APP_BASE}/aluno/ranking?id=${idInterclasse}`;
            const btnLabel = isAtivo ? 'Inscrever-se em modalidades <i class="bi bi-arrow-right"></i>' : 'Ver Ranking <i class="bi bi-bar-chart"></i>';

            return `
                <div class="col">
                <article class="aluno-card card h-100 p-4 shadow-sm position-relative overflow-hidden" data-status="${statusClass}">
                    <span class="card-accent position-absolute top-0 start-0 h-100 border-start border-4 border-${isAtivo ? 'success' : 'secondary'}" aria-hidden="true"></span>
                    <div class="d-flex align-items-start gap-3">
                        <div class="card-icon bg-${isAtivo ? 'primary' : 'secondary'}-subtle text-${isAtivo ? 'primary' : 'secondary'} rounded-3 p-3 fs-4 d-inline-flex align-items-center justify-content-center flex-shrink-0">
                            <i class="bi bi-trophy-fill"></i>
                        </div>
                        <div class="d-flex flex-column flex-grow-1 sgi-u-min-width-0">
                            <div class="card-title h5 fw-semibold mb-2">${nome}</div>
                            <div class="card-meta d-flex align-items-center gap-3 mb-3 small text-secondary">
                                <span><i class="bi bi-calendar3"></i>${ano}</span>
                                <span class="badge rounded-pill text-bg-${isAtivo ? 'success' : 'secondary'}">
                                    <i class="bi bi-circle-fill small" ></i>
                                    ${statusLabel}
                                </span>
                            </div>
                            <div class="d-flex align-items-center justify-content-between mt-auto">
                                <a href="${href}" class="btn btn-primary btn-sm d-inline-flex align-items-center gap-2">${btnLabel}</a>
                            </div>
                        </div>
                    </div>
                </article>
                </div>`;
        }).join('')
    }</div>`;
}

function filterAndRender() {
    const activeFilter = document.querySelector('.filter-pill.active')?.dataset?.filter || 'all';
    const searchTerm = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();

    let filtered = allInterclasses;

    if (activeFilter === 'active') {
        filtered = filtered.filter(item => String(item.status_interclasse) === '1');
    } else if (activeFilter === 'inactive') {
        filtered = filtered.filter(item => String(item.status_interclasse) !== '1');
    }

    if (searchTerm) {
        filtered = filtered.filter(item =>
            (item.nome_interclasse || '').toLowerCase().includes(searchTerm)
        );
    }

    renderCards(filtered);
}

async function carregarInterclassesAluno() {
    try {
        const res = await fetch(`${API_BASE}edicoes?regulamento=true`);
        if (!res.ok) throw new Error('Resposta do servidor não amigável.');
        const lista = await res.json();

        if (!Array.isArray(lista) || lista.length === 0) {
            allInterclasses = [];
            renderCards([]);
            return;
        }

        allInterclasses = lista.sort((a, b) => {
            if (a.ano_interclasse > b.ano_interclasse) return -1;
            if (a.ano_interclasse < b.ano_interclasse) return 1;
            return (b.id_interclasse || 0) - (a.id_interclasse || 0);
        });
        filterAndRender();
    } catch (error) {
        console.error('Erro ao buscar dados:', error);
        document.getElementById('listaInterclassesAluno').innerHTML = `
            <div class="alert alert-danger d-flex align-items-center gap-2" role="alert">
                <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
                <span><strong>Erro ao carregar.</strong> Não foi possível carregar as competições. Tente novamente mais tarde.</span>
            </div>`;
    }
}

async function carregarRegulamentoModal() {
    const btnPdf = document.getElementById('btnBaixarPdf');
    const btnAceitar = document.getElementById('btnAceitarTermo');

    try {
        const res = await fetch(`${API_BASE}edicoes?status_interclasse=1&regulamento=true`);
        const data = await res.json();
        const ativo = Array.isArray(data) ? data[0] : data;

        if (ativo && ativo.regulamento_interclasse && ativo.regulamento_interclasse.trim() !== '') {
            btnPdf.href = `${APP_BASE}/uploads/regulamentos/${encodeURIComponent(ativo.regulamento_interclasse)}`;
            btnPdf.classList.remove('disabled');
            pageScope.listen(btnPdf, 'click', () => {
                btnAceitar.disabled = false;
                btnAceitar.removeAttribute('title');
            });
        } else {
            btnPdf.textContent = 'Sem PDF anexado';
            btnPdf.classList.add('btn-secondary', 'disabled');
            btnPdf.classList.remove('btn-primary');
            btnAceitar.disabled = false;
            btnAceitar.removeAttribute('title');
        }
    } catch (e) {
        console.error("Erro ao carregar PDF do regulamento:", e);
        btnAceitar.disabled = false;
    }
}

async function initModalTermo() {
    const modalElement = document.getElementById('modalTermo');
    const modalTermo = new bootstrap.Modal(modalElement, { backdrop: 'static', keyboard: false });
    const btnAceitar = document.getElementById('btnAceitarTermo');
    const btnRecusar = document.getElementById('btnRecusarTermo');
    const avisoRecusa = document.getElementById('avisoRecusa');

    try {
        const checagem = await fetch(`${API_BASE}termos`, { method: 'GET' });
        if (checagem.status === 401) return;
        const resCheck = await checagem.json();
        if (resCheck.success && resCheck.termo_aceito === true) {
            return;
        }
    } catch (e) {
        console.error("Erro ao verificar status dos termos:", e);
    }

    await carregarRegulamentoModal();
    modalTermo.show();

    pageScope.listen(btnAceitar, 'click', async function() {
        btnAceitar.disabled = true;
        btnRecusar.disabled = true;
        btnAceitar.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status"></span>Salvando...';
        try {
                const res = await fetch(`${API_BASE}termos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            if (res.status === 401) { window.location.href = `${APP_BASE}/aluno/login`; return; }
            const data = await res.json();
            if (data.success) {
                avisoRecusa.classList.add('d-none');
                modalTermo.hide();
            } else {
                avisoRecusa.textContent = data.message || 'Erro ao salvar aceite. Tente novamente.';
                avisoRecusa.classList.remove('d-none');
            }
        } catch (error) {
            avisoRecusa.textContent = 'Erro de conexão. Verifique sua internet e tente novamente.';
            avisoRecusa.classList.remove('d-none');
        } finally {
            btnAceitar.disabled = false;
            btnRecusar.disabled = false;
            btnAceitar.textContent = 'Aceitar e Continuar';
        }
    });

    pageScope.listen(btnRecusar, 'click', function() {
        avisoRecusa.innerHTML = `
            <i class="bi bi-exclamation-triangle-fill me-1"></i>
            <strong>Acesso bloqueado:</strong> É necessário aceitar os termos de responsabilidade para participar e utilizar o painel.
        `;
        avisoRecusa.classList.remove('d-none');
    });
}

window.SGIPage.ready( function() {
    carregarInterclassesAluno();
    initModalTermo();

    pageScope.listen(document.getElementById('searchInput'), 'input', filterAndRender);

    document.querySelectorAll('.filter-pill').forEach(pill => {
        pageScope.listen(pill, 'click', function() {
            document.querySelectorAll('.filter-pill').forEach(p => {
                p.classList.remove('active');
                p.setAttribute('aria-pressed', 'false');
            });
            this.classList.add('active');
            this.setAttribute('aria-pressed', 'true');
            filterAndRender();
        });
    });
});

return {escapeHTML, renderCards, filterAndRender, carregarInterclassesAluno, carregarRegulamentoModal, initModalTermo};
});
