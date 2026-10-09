window.SGIPage.mount("competicoes/elenco-equipe", function (pageConfig, pageScope) {

const APP_BASE = String(window.SGI_BASE_PATH || "").replace(new RegExp("/+$"), "");
const API = String(window.SGI_API_BASE || `${window.SGI_BASE_PATH || ''}/api/v1/`).replace(/\/?$/, '/');
const isAdmin = pageConfig.value1;
const params = new URLSearchParams(window.location.search);
const idInterclasse = params.get('id');
const idEquipe = params.get('id_equipe');
const idTurma = params.get('id_turma');
const idCategoria = params.get('id_categoria');
const idModalidade = params.get('id_modalidade');
const nomeTurma = params.get('nome_turma') || '';
const nomeModalidade = params.get('nome_modalidade') || '';

function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
}

function montarVoltar() {
    const q = new URLSearchParams();
    if (idInterclasse) q.set('id', idInterclasse);
    if (idCategoria) q.set('id_categoria', idCategoria);
    const hrefEq = `${String(window.SGI_BASE_PATH || '').replace(/\/+$/, '')}/edicoes/equipes?${q.toString()}`;
    ['btnVoltarElencoMob', 'btnVoltarElencoDesk'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.href = hrefEq;
    });
}

async function carregarNomeInterclasse() {
    if (!idInterclasse) return;
    try {
        const dados = await window.SGIInterclasse.getInterclasseById(idInterclasse);
        const nome = dados?.nome_interclasse || 'Interclasse';
        ['nomeInterclasseElencoMob', 'nomeInterclasseElencoDesk'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerText = nome;
        });
    } catch (e) {}
}

function montarGerenciar() {
    const q = new URLSearchParams();
    if (idInterclasse) q.set('id', idInterclasse);
    if (idTurma) q.set('id_turma', idTurma);
    if (idEquipe) q.set('id_equipe', idEquipe);
    if (idCategoria) q.set('id_categoria', idCategoria);
    if (idModalidade) q.set('id_modalidade', idModalidade);
    if (nomeTurma) q.set('nome_turma', nomeTurma);
    if (nomeModalidade) q.set('nome_modalidade', nomeModalidade);
    const href = `${APP_BASE}/equipes/alunos?${q.toString()}`;
    const a = document.getElementById('linkGerenciarMob');
    const b = document.getElementById('linkGerenciarDesk');
    if (a) a.href = href;
    if (b) b.href = href;
}

async function carregarAlertaLimite() {
    const mob = document.getElementById('alertaLimiteMob');
    const desk = document.getElementById('alertaLimiteDesk');
    const ocultar = () => {
        if (mob) { mob.innerHTML = ''; mob.classList.add('d-none'); }
        if (desk) { desk.innerHTML = ''; desk.classList.add('d-none'); }
    };

    if (!idEquipe || !idTurma || !idModalidade) {
        ocultar();
        return;
    }

    try {
        const r = await fetch(`${API}equipes?id_turma=${encodeURIComponent(idTurma)}&id_modalidade=${encodeURIComponent(idModalidade)}&_t=${Date.now()}`);
        const lista = await r.json();
        const arr = Array.isArray(lista) ? lista : [];
        const eq = arr.find(e => String(e.id_equipe) === String(idEquipe));
        const excedeu = eq && (eq.excedeu_limite === true || eq.excedeu_limite === '1' || eq.excedeu_limite === 1);

        if (!eq || !excedeu) {
            ocultar();
            return;
        }

        const total = Number(eq.total_alunos) || 0;
        const limite = Number(eq.limite_maximo) || 0;

        let msg = `<i class="bi bi-exclamation-triangle-fill"></i>`;
        msg += `<span class="flex-grow-1"><strong>Limite excedido:</strong> esta equipe possui <strong>${total}</strong> inscritos e o limite da modalidade é <strong>${limite}</strong>.</span>`;
        if (isAdmin) {
            msg += '<button type="button" class="btn btn-primary btn-sm flex-shrink-0" data-sgi-action="redistribute-roster"><i class="bi bi-shuffle"></i> Enviar estudantes para as outras equipes</button>';
        }

        if (mob) { mob.innerHTML = msg; mob.classList.remove('d-none'); }
        if (desk) { desk.innerHTML = msg; desk.classList.remove('d-none'); }
    } catch (e) {
        ocultar();
    }
}

async function redistribuirElenco() {
    if (!await SGI.confirm({ titulo: 'Redistribuir estudantes?', mensagem: 'Os estudantes excedentes serão enviados para outras equipes desta turma.', textoConfirmar: 'Redistribuir' })) return;
    try {
        const resp = await fetch(`${API}equipes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                acao: 'redistribuir',
                modalidades_id_modalidade: Number(idModalidade),
                turmas_id_turma: Number(idTurma)
            })
        });
        const data = await resp.json();
        if (data.success === false) throw new Error(data.message || 'Falha ao redistribuir.');
        SGI.alert(data.message || 'Redistribuição concluída.');
        carregar();
    } catch (err) {
        SGI.alert(err.message || 'Erro de conexão ao redistribuir.');
    }
}

async function carregar() {
    await carregarNomeInterclasse();
    montarVoltar();
    montarGerenciar();
    carregarAlertaLimite();
    const mob = document.getElementById('listaElencoMob');
    const tbody = document.getElementById('tbodyElencoDesk');

    if (!idEquipe) {
        mob.innerHTML = '<p class="text-muted">Parâmetro id_equipe ausente.</p>';
        tbody.innerHTML = '';
        return;
    }

    try {
        const r = await fetch(`${API}equipes?id_equipe=${encodeURIComponent(idEquipe)}&_t=${Date.now()}`);
        const lista = await r.json();
        const arr = Array.isArray(lista) ? lista : [];

        if (arr.length === 0) {
            const msg = '<div class="text-center py-5 text-body-secondary"><i class="bi bi-people fs-1 d-block mb-3" aria-hidden="true"></i><h5 class="fw-semibold mb-2">Elenco vazio</h5><p class="small mb-0">Nenhum estudante vinculado a esta equipe ainda.</p></div>';
            mob.innerHTML = msg;
            tbody.innerHTML = `<tr><td colspan="${isAdmin ? 3 : 2}" class="text-muted px-3 py-4">Nenhum estudante vinculado a esta equipe ainda.</td></tr>`;
            return;
        }

        mob.innerHTML = arr.map(u => `
            <div class="d-flex align-items-center justify-content-between gap-3 border rounded-3 p-3 bg-body mb-2">
                <div>
                    <div class="fw-medium">${esc(u.nome_usuario)}</div>
                    <div class="text-muted small">${esc(u.matricula_usuario)}</div>
                </div>
                ${isAdmin ? `
                    <button type="button" data-sgi-action="remove-roster-student" data-id-usuario="${esc(u.id_usuario)}" data-id-equipe="${esc(idEquipe)}" class="btn btn-outline-danger btn-sm px-3 py-1 small" aria-label="Remover estudante da equipe">
                        <i class="bi bi-trash"></i>
                    </button>
                ` : ''}
            </div>
        `).join('');

        tbody.innerHTML = arr.map(u => `
            <tr>
                <td>${esc(u.nome_usuario)}</td>
                <td>${esc(u.matricula_usuario)}</td>
                ${isAdmin ? `
                    <td class="text-end">
                        <button type="button" data-sgi-action="remove-roster-student" data-id-usuario="${esc(u.id_usuario)}" data-id-equipe="${esc(idEquipe)}" class="btn btn-outline-danger btn-sm px-3 py-1 small" aria-label="Remover estudante da equipe">
                            <i class="bi bi-trash"></i>
                        </button>
                    </td>
                ` : ''}
            </tr>
        `).join('');

    } catch (e) {
        console.error(e);
        mob.innerHTML = '<p class="text-danger">Erro ao carregar elenco.</p>';
        tbody.innerHTML = `<tr><td colspan="${isAdmin ? 3 : 2}" class="text-danger px-3">Erro ao carregar.</td></tr>`;
    }
}

async function removerAluno(idUsuario, idEquipe) {
    if (!await SGI.confirm({ titulo: 'Remover estudante da equipe?', mensagem: 'O vínculo do estudante com esta equipe será removido.', textoConfirmar: 'Remover estudante', destrutivo: true })) return;

    try {
        const response = await fetch(`${API}equipes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                acao: 'remover_aluno',
                id_usuario: idUsuario,
                id_equipe: idEquipe
            })
        });
        const res = await response.json();
        if (res.success) {
            carregar();
        } else {
            SGI.alert(res.message || 'Erro ao remover estudante.');
        }
    } catch (e) {
        console.error('Erro de requisição:', e);
        SGI.alert('Erro de conexão ao tentar remover o estudante.');
    }
}

function vincularEventos() {
    [document.getElementById('alertaLimiteMob'), document.getElementById('alertaLimiteDesk')]
        .forEach((container) => pageScope.listen(container, 'click', (event) => {
            const button = event.target.closest('[data-sgi-action="redistribute-roster"]');
            if (button) redistribuirElenco();
        }));
    [document.getElementById('listaElencoMob'), document.getElementById('tbodyElencoDesk')]
        .forEach((container) => pageScope.listen(container, 'click', (event) => {
            const button = event.target.closest('[data-sgi-action="remove-roster-student"]');
            if (button) removerAluno(button.dataset.idUsuario, button.dataset.idEquipe);
        }));
}

vincularEventos();
pageScope.listen(window, 'pageshow', carregar);

return {esc, montarVoltar, carregarNomeInterclasse, montarGerenciar, carregarAlertaLimite, redistribuirElenco, carregar, removerAluno};
});
