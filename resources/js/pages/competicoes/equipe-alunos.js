window.SGIPage.mount("competicoes/equipe-alunos", function (pageConfig, pageScope) {

    const APP_BASE = String(window.SGI_BASE_PATH || '').replace(/\/+$/, '');
    const API_BASE = String(window.SGI_API_BASE || `${APP_BASE}/api/v1/`).replace(/\/?$/, '');
let alunos = [];
let alunosNaEquipe = [];
let alunosSelecionados = new Set();
let generoDaModalidade = 'MISTO';
let _idEquipe = null;
let salvando = false;
let carregando = false;
let rosterCarregado = false;
let erroCarregamento = '';

function mostrarToast(tipo, texto) {
    window.SGI.showToast(texto, tipo === 'sucesso' ? 'success' : 'error');
}

function cardAluno(aluno) {
    const idAluno = String(aluno.id_usuario || '');
    const nomeAluno = String(aluno.nome_usuario || 'Estudante');
    const matriculaAluno = String(aluno.matricula_usuario || '');
    const estaNaEquipe = alunosNaEquipe.some(a => String(a.id_usuario) === idAluno);
    const selecionado = estaNaEquipe || alunosSelecionados.has(idAluno);
    const semInscricao = Number(aluno.inscrito || 0) === 0;
    const badge = semInscricao ? '<span class="badge text-bg-primary ms-2">Sem inscrição</span>' : '';
    const badgeEquipe = estaNaEquipe ? '<span class="badge text-bg-secondary ms-2">Já na equipe</span>' : '';
    const nomeControle = estaNaEquipe
        ? `${nomeAluno}${matriculaAluno ? `, matrícula ${matriculaAluno}` : ''}, já vinculado à equipe`
        : `Adicionar ${nomeAluno}${matriculaAluno ? `, matrícula ${matriculaAluno}` : ''} à equipe`;
    return `
        <label class="col d-flex align-items-center justify-content-between gap-3 border rounded-3 p-3 bg-body ${semInscricao ? 'border-2 border-primary bg-primary-subtle' : ''}">
            <div class="sgi-u-min-width-0">
                <strong>${window.SGIHtml.escape(nomeAluno)}</strong>${badge}${badgeEquipe}
                <div class="text-muted small">${window.SGIHtml.escape(matriculaAluno)} (${window.SGIHtml.escape(aluno.genero_usuario || 'Não informado')})</div>
            </div>
            <input class="form-check-input aluno-check" type="checkbox" value="${window.SGIHtml.escape(idAluno)}" ${selecionado ? 'checked' : ''} ${estaNaEquipe ? 'disabled' : ''} aria-label="${window.SGIHtml.escape(nomeControle)}">
        </label>
    `;
}

function avisoCarregamento(mensagem, acao = '') {
    return `<div class="col-12"><div class="alert alert-danger d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3 mb-0" role="alert">
        <span>${window.SGIHtml.escape(mensagem)}</span>
        ${acao ? `<button type="button" class="btn btn-outline-danger align-self-start align-self-sm-center" data-sgi-action="retry-roster">Tentar novamente</button>` : ''}
    </div></div>`;
}

function renderizar(lista) {
    const mobile = document.getElementById('listaAlunosMobile');
    const desktop = document.getElementById('listaAlunosDesktop');

    let msg = '';
        if (carregando && !rosterCarregado) {
            msg = '<div class="col-12 text-center py-5 text-body-secondary" role="status"><span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Carregando estudantes…</div>';
        } else if (erroCarregamento && !rosterCarregado) {
            msg = avisoCarregamento(erroCarregamento, true);
        } else {
            if (erroCarregamento) msg += avisoCarregamento(erroCarregamento, true);
            if (carregando) msg += '<div class="col-12 small text-body-secondary" role="status">Atualizando a lista de estudantes…</div>';
        if (!lista.length && alunos.length > 0) {
            msg += '<div class="col-12"><div class="text-center py-5 text-body-secondary"><i class="bi bi-search fs-1 d-block mb-3" aria-hidden="true"></i><h5 class="fw-semibold mb-2">Nenhum estudante corresponde à busca.</h5><button type="button" class="btn btn-outline-primary btn-sm" data-sgi-action="clear-roster-search">Limpar busca</button></div></div>';
        } else if (!lista.length) {
            msg += '<div class="col-12"><div class="text-center py-5 text-body-secondary"><i class="bi bi-people fs-1 d-block mb-3" aria-hidden="true"></i><h5 class="fw-semibold mb-2">Nenhum estudante disponível</h5><p class="small mb-0">Nenhum estudante foi encontrado para esta turma com o gênero compatível com a modalidade.</p></div></div>';
        } else {
            msg += lista.map(cardAluno).join('');
        }
    }

    mobile.innerHTML = msg;
    desktop.innerHTML = msg;
    atualizarAcoesSelecao();
}

function atualizarAcoesSelecao() {
    const membros = new Set(alunosNaEquipe.map(aluno => String(aluno.id_usuario)));
    const novosSelecionados = [...alunosSelecionados]
        .filter(id => !membros.has(String(id))).length;
    const nomeContagem = `Adicionar ${novosSelecionados} ${novosSelecionados === 1 ? 'estudante' : 'estudantes'}`;
    let feedback;
    if (salvando) {
        feedback = 'Adicionando estudantes à equipe.';
    } else if (novosSelecionados === 0) {
        feedback = 'Nenhum estudante novo selecionado.';
    } else {
        feedback = `${novosSelecionados} ${novosSelecionados === 1 ? 'estudante novo selecionado' : 'estudantes novos selecionados'} para adicionar.`;
    }

    [
        ['btnSalvarAlunosDesktop', 'feedbackSelecaoEquipeDesktop'],
        ['btnSalvarAlunosMobile', 'feedbackSelecaoEquipeMobile'],
    ].forEach(([buttonId, statusId]) => {
        const button = document.getElementById(buttonId);
        const status = document.getElementById(statusId);
        if (button) {
            const count = button.querySelector('[data-selection-count]');
            if (count) count.textContent = salvando ? 'Adicionando…' : nomeContagem;
            button.setAttribute('aria-label', salvando
                ? 'Adicionando estudantes à equipe'
                : `Salvar estudantes selecionados na equipe — ${nomeContagem}`);
            button.setAttribute('aria-busy', salvando ? 'true' : 'false');
            button.disabled = salvando || novosSelecionados === 0;
        }
        if (status) status.textContent = feedback;
    });
}

function filtrar(termo) {
    const t = termo.trim().toLowerCase();
    const filtrados = alunos.filter(aluno =>
        String(aluno.nome_usuario || '').toLowerCase().includes(t) ||
        String(aluno.matricula_usuario || '').toLowerCase().includes(t)
    );
    renderizar(filtrados);
}

function sincronizarSelecao(event) {
    const checkbox = event.target;
    if (!checkbox?.classList?.contains('aluno-check')) return;

    const idAluno = String(checkbox.value);
    if (alunosNaEquipe.some(aluno => String(aluno.id_usuario) === idAluno)) {
        checkbox.checked = true;
        return;
    }
    if (checkbox.checked) alunosSelecionados.add(idAluno);
    else alunosSelecionados.delete(idAluno);

    document.querySelectorAll('.aluno-check').forEach(outro => {
        if (String(outro.value) === idAluno) outro.checked = checkbox.checked;
    });
    atualizarAcoesSelecao();
}

function sincronizarBusca(event) {
    const valor = event.target.value;
    ['buscaAlunosDesktop', 'buscaAlunosMobile'].forEach(id => {
        const campo = document.getElementById(id);
        if (campo && campo !== event.target) campo.value = valor;
    });
    filtrar(valor);
}

function tratarAcaoLista(event) {
    const acao = event.target.closest('[data-sgi-action]');
    if (acao?.dataset.sgiAction === 'retry-roster') {
        tentarNovamente(event);
        return;
    }
    if (acao?.dataset.sgiAction === 'clear-roster-search') {
        ['buscaAlunosDesktop', 'buscaAlunosMobile'].forEach(id => {
            const campo = document.getElementById(id);
            if (campo) campo.value = '';
        });
        filtrar('');
        const busca = [document.getElementById('buscaAlunosDesktop'), document.getElementById('buscaAlunosMobile')]
            .find(el => el && el.getClientRects().length);
        busca?.focus({preventScroll: true});
    }
}

async function lerJsonEstrito(response, mensagem) {
    if (!response.ok) throw new Error(mensagem);
    let data;
    try {
        data = await response.json();
    } catch (_) {
        throw new Error(mensagem);
    }
    if (data && typeof data === 'object' && data.success === false) {
        throw new Error(mensagem);
    }
    return data;
}

function extrairCompetidores(data) {
    if (Array.isArray(data)) return data;
    if (!data || typeof data !== 'object') throw new Error('Não foi possível carregar os estudantes da turma.');
    const lista = Array.isArray(data.competidores) ? data.competidores
        : (Array.isArray(data.usuarios) ? data.usuarios : null);
    if (!lista || !lista.every(aluno =>
        aluno && typeof aluno === 'object' && !Array.isArray(aluno) && aluno.id_usuario != null
        )) throw new Error('Não foi possível carregar os estudantes da turma.');
    return lista;
}

async function carregar() {
    if (carregando) return;
    const selecaoAnterior = new Set(alunosSelecionados);
    carregando = true;
    erroCarregamento = '';
    if (rosterCarregado) {
        const termoBuscaAtualizado = document.getElementById('buscaAlunosDesktop')?.value
            ?? document.getElementById('buscaAlunosMobile')?.value
            ?? '';
        filtrar(termoBuscaAtualizado);
    } else {
        renderizar([]);
    }

    const params = new URLSearchParams(window.location.search);
    const idInterclasse = params.get('id');

    if (idInterclasse) {
        window.SGIInterclasse.getInterclasseById(idInterclasse).then(dados => {
            const nome = dados?.nome_interclasse || 'Interclasse';
            ['nomeInterclasseEquipeAlunosMob', 'nomeInterclasseEquipeAlunosDesk'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerText = nome;
            });
        }).catch(() => {});
    }
    const idTurma = params.get('id_turma');
    _idEquipe = params.get('id_equipe');
    const idCategoria = params.get('id_categoria');
    const idModalidade = params.get('id_modalidade');
    const nomeTurma = params.get('nome_turma') || '';
    const nomeModalidade = params.get('nome_modalidade') || '';
    [['nomeModalidadeEquipeAlunos', nomeModalidade], ['nomeModalidadeEquipeAlunosMob', nomeModalidade]].forEach(([id, nome]) => {
        const el = document.getElementById(id);
        if (!el || !nome) return;
        el.textContent = `Modalidade: ${nome}`;
        el.classList.remove('d-none');
    });

    const qVoltar = new URLSearchParams();
    if (idInterclasse) qVoltar.set('id', idInterclasse);
    if (idTurma) qVoltar.set('id_turma', idTurma);
    if (_idEquipe) qVoltar.set('id_equipe', _idEquipe);
    if (idCategoria) qVoltar.set('id_categoria', idCategoria);
    if (idModalidade) qVoltar.set('id_modalidade', idModalidade);
    if (nomeTurma) qVoltar.set('nome_turma', nomeTurma);
    if (nomeModalidade) qVoltar.set('nome_modalidade', nomeModalidade);
    const voltar = `${APP_BASE}/equipes/elenco?${qVoltar.toString()}`;
    document.getElementById('btnVoltarEquipesDesktop').href = voltar;
    const vm = document.getElementById('btnVoltarEquipesMobile');
    if (vm) vm.href = voltar;

    try {
        const ts = Date.now();

        if (idModalidade) {
            const resMod = await fetch(`${API_BASE}/modalidades?id_modalidade=${idModalidade}&_t=${ts}`);
            const dadosMod = await lerJsonEstrito(resMod, 'Não foi possível carregar os dados da modalidade.');
            if (Array.isArray(dadosMod) && dadosMod.length > 0) {
                generoDaModalidade = dadosMod[0].genero_modalidade || 'MISTO';
            } else if (dadosMod && dadosMod.genero_modalidade) {
                generoDaModalidade = dadosMod.genero_modalidade;
            } else {
                generoDaModalidade = 'MISTO';
            }
        } else if (idCategoria) {
            const resMod = await fetch(`${API_BASE}/modalidades?id_categoria=${idCategoria}&_t=${ts}`);
            const dadosMod = await lerJsonEstrito(resMod, 'Não foi possível carregar os dados da modalidade.');
            if (Array.isArray(dadosMod) && dadosMod.length > 0) {
                generoDaModalidade = dadosMod[0].genero_modalidade || 'MISTO';
            }
        }

        const resEquipe = await fetch(`${API_BASE}/equipes?id_equipe=${_idEquipe}&_t=${ts}`);
        const rawEq = await lerJsonEstrito(resEquipe, 'Não foi possível carregar os integrantes da equipe.');
        if (!Array.isArray(rawEq) || !rawEq.every(aluno =>
            aluno && typeof aluno === 'object' && !Array.isArray(aluno) && aluno.id_usuario != null
        )) throw new Error('Não foi possível carregar os integrantes da equipe.');
        alunosNaEquipe = rawEq;
        alunosSelecionados = new Set([
            ...alunosNaEquipe.map(aluno => String(aluno.id_usuario)),
            ...selecaoAnterior,
        ]);

        const generoParam = (generoDaModalidade === 'MISTO' || generoDaModalidade === 'MISTA') ? '' : `&genero=${generoDaModalidade}`;
        const res = await fetch(`${API_BASE}/usuarios?acao=listar_competidores&id_turma=${idTurma}${generoParam}&_t=${ts}`);
        const data = await lerJsonEstrito(res, 'Não foi possível carregar os estudantes da turma.');
        alunos = extrairCompetidores(data);
        const idsDisponiveis = new Set(alunos.map(aluno => String(aluno.id_usuario)));
        alunosSelecionados = new Set([
            ...alunosNaEquipe.map(aluno => String(aluno.id_usuario)),
            ...[...selecaoAnterior].filter(id => idsDisponiveis.has(String(id))),
        ]);
        rosterCarregado = true;
        erroCarregamento = '';

        const termoBusca = document.getElementById('buscaAlunosDesktop')?.value
            ?? document.getElementById('buscaAlunosMobile')?.value
            ?? '';
        filtrar(termoBusca);
    } catch (error) {
        console.error("Erro ao carregar dados:", error);
        erroCarregamento = error.message || 'Não foi possível carregar os estudantes da turma.';
    } finally {
        carregando = false;
        if (rosterCarregado) {
            const termoBusca = document.getElementById('buscaAlunosDesktop')?.value
                ?? document.getElementById('buscaAlunosMobile')?.value
                ?? '';
            filtrar(termoBusca);
        } else {
            renderizar([]);
        }
    }
}

async function tentarNovamente(event) {
    const botao = event.target.closest('[data-sgi-action="retry-roster"]');
    if (!botao) return;
    event.preventDefault();
    if (carregando) return;
    await carregar();
    const retry = [
        document.querySelector('#listaAlunosDesktop [data-sgi-action="retry-roster"]'),
        document.querySelector('#listaAlunosMobile [data-sgi-action="retry-roster"]'),
    ].find(el => el && el.getClientRects().length);
    if (retry) retry.focus({preventScroll: true});
    else {
        const busca = [document.getElementById('buscaAlunosDesktop'), document.getElementById('buscaAlunosMobile')]
            .find(el => el && el.getClientRects().length);
        busca?.focus({preventScroll: true});
    }
}

function idsSelecionadosParaSalvar(selecionados, membrosDaEquipe) {
    const membros = new Set(membrosDaEquipe.map(aluno => String(aluno.id_usuario)));
    return [...selecionados]
        .map(Number)
        .filter(Boolean)
        .filter(id => !membros.has(String(id)));
}

async function salvar() {
    const ids = idsSelecionadosParaSalvar(alunosSelecionados, alunosNaEquipe);

    if (!ids.length) {
        mostrarToast('erro', 'Selecione pelo menos um novo estudante para adicionar.');
        return;
    }

    salvando = true;
    atualizarAcoesSelecao();

    try {
        const response = await fetch(`${API_BASE}/equipes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                acao: 'adicionar_usuarios',
                id_equipe: Number(_idEquipe),
                usuarios: ids
            })
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || 'Falha ao salvar.');
        mostrarToast('sucesso', 'Alterações salvas com sucesso.');
        await carregar();
    } catch (error) {
        mostrarToast('erro', error.message);
    } finally {
        salvando = false;
        atualizarAcoesSelecao();
    }
}

pageScope.listen(document.getElementById('btnSalvarAlunosDesktop'), 'click', salvar);
pageScope.listen(document.getElementById('btnSalvarAlunosMobile'), 'click', salvar);
pageScope.listen(document.getElementById('listaAlunosDesktop'), 'change', sincronizarSelecao);
pageScope.listen(document.getElementById('listaAlunosMobile'), 'change', sincronizarSelecao);
pageScope.listen(document.getElementById('listaAlunosDesktop'), 'click', tratarAcaoLista);
pageScope.listen(document.getElementById('listaAlunosMobile'), 'click', tratarAcaoLista);
pageScope.listen(document.getElementById('buscaAlunosDesktop'), 'input', sincronizarBusca);
pageScope.listen(document.getElementById('buscaAlunosMobile'), 'input', sincronizarBusca);

pageScope.listen(window, 'pageshow', carregar);

return {mostrarToast, cardAluno, renderizar, atualizarAcoesSelecao, filtrar, carregar, salvar, idsSelecionadosParaSalvar};
});
