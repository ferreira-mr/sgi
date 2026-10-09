async function jsonOrThrow(response, label) {
    if (!response.ok()) {
        throw new Error(`${label}: HTTP ${response.status()} ${await response.text()}`);
    }
    return response.json();
}

function dataHoraUtc(offsetMinutes) {
    const value = new Date(Date.now() + offsetMinutes * 60_000);
    return value.toISOString().slice(0, 16);
}

function dataAtualDoFixture() {
    const value = new Date();
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function operacaoLiberada(state) {
    const value = state?.operacao?.liberada ?? state?.operacao_liberada;
    return value === true || Number(value || 0) > 0;
}

/**
 * The browser fixture uses the same published/reviewed contract as the UI.
 * Existing suites may leave the active edition in review, so the next fixture
 * must close that cycle through the canonical cronograma API before enrolling.
 */
async function garantirCronogramaPublicado(request, idInterclasse) {
    let state = await jsonOrThrow(
        await request.get(`api/v1/cronograma?id_interclasse=${idInterclasse}`),
        'estado do cronograma do fixture',
    );

    if (String(state.cronograma_status) !== 'publicado') {
        const locais = await jsonOrThrow(
            await request.get(`api/v1/locais?id_interclasse=${idInterclasse}&disponivel=1`),
            'locais do cronograma do fixture',
        );
        let idLocal = Number((Array.isArray(locais) ? locais[0] : null)?.id_local || 0);
        if (!idLocal) {
            const criado = await jsonOrThrow(
                await request.post('api/v1/locais', {
                    data: {
                        nome_local: `Fixture cronograma ${Date.now().toString(36)}`,
                        disponivel_local: '1',
                        carga_local: 0,
                        interclasses_id_interclasse: Number(idInterclasse),
                    },
                }),
                'criação do local do cronograma do fixture',
            );
            idLocal = Number(criado.id_local || 0);
        }
        if (!idLocal) throw new Error('O fixture não encontrou local disponível para o cronograma.');

        const modalidades = await jsonOrThrow(
            await request.get(`api/v1/modalidades?id_interclasse=${idInterclasse}`),
            'modalidades do cronograma do fixture',
        );
        for (const modalidade of (Array.isArray(modalidades) ? modalidades : [])) {
            if (String(modalidade.status_modalidade) !== '1') continue;
            await jsonOrThrow(
                await request.put('api/v1/modalidades', {
                    data: {
                        id_modalidade: Number(modalidade.id_modalidade),
                        equipes_planejadas: Math.max(1, Number(modalidade.equipes_planejadas || modalidade.max_equipes || 2)),
                        min_inscritos_equipe: Math.max(1, Number(modalidade.min_inscritos_equipe || 1)),
                        max_inscritos_equipe: Math.max(1, Number(modalidade.max_inscritos_equipe || 10)),
                        formato_participacao: String(modalidade.formato_participacao || 'equipe'),
                        duracao_prevista_min: Math.max(1, Number(modalidade.duracao_prevista_min || 5)),
                        descanso_min: Math.max(0, Number(modalidade.descanso_min || 0)),
                    },
                }),
                `planejamento da modalidade ${modalidade.id_modalidade} do fixture`,
            );
        }

        await jsonOrThrow(
            await request.post('api/v1/cronograma', {
                data: { acao: 'preparar_equipes', id_interclasse: idInterclasse },
            }),
            'preparação das equipes do cronograma do fixture',
        );
        const dataFixture = dataAtualDoFixture();
        const draft = await jsonOrThrow(
            await request.post('api/v1/cronograma', {
                data: {
                    acao: 'gerar_rascunho',
                    id_interclasse: idInterclasse,
                    data_inicio: dataFixture,
                    data_fim: dataFixture,
                    hora_inicio: '00:00',
                    hora_fim: '23:59',
                    duracao_min: 5,
                    intervalo_min: 0,
                    id_locais: [idLocal],
                },
            }),
            'geração do cronograma do fixture',
        );
        try {
            await jsonOrThrow(
                await request.post('api/v1/cronograma', {
                    data: {
                        acao: 'publicar',
                        id_interclasse: idInterclasse,
                        cronograma_versao: Number(draft.cronograma_versao || 0),
                        nos: draft.nos,
                        compromissos: draft.compromissos,
                    },
                }),
                'publicação do cronograma do fixture',
            );
        } catch (error) {
            // A edição ativa pode ter inscrições de outro cenário. O contrato
            // final recusa republicá-la para preservar essas inscrições; um
            // fixture de navegador deve então usar uma edição descartável nova.
            if (!String(error.message || error).includes('conflita inscrições existentes')) throw error;
            const criada = await jsonOrThrow(
                await request.post('api/v1/edicoes', {
                    data: {
                        nome_interclasse: `Fixture cronograma ${Date.now()}`,
                        ano_interclasse: `${dataFixture} 00:00:00`,
                    },
                }),
                'criação da edição isolada do fixture',
            );
            const novoId = Number(criada.id_interclasse || criada.id || 0);
            if (!novoId) throw new Error('A API não retornou a edição isolada do fixture.');
            return garantirCronogramaPublicado(request, novoId);
        }
        state = await jsonOrThrow(
            await request.get(`api/v1/cronograma?id_interclasse=${idInterclasse}`),
            'revisão publicada do cronograma do fixture',
        );
    }

    if (!operacaoLiberada(state) && String(state.inscricoes_status) !== 'abertas') {
        await jsonOrThrow(
            await request.post('api/v1/cronograma', {
                data: {
                    acao: 'abrir_inscricoes',
                    id_interclasse: idInterclasse,
                    cronograma_versao: Number(state.cronograma_versao || 0),
                    inscricoes_abertura: dataHoraUtc(-5),
                    inscricoes_encerramento: dataHoraUtc(24 * 60),
                },
            }),
            'abertura das inscrições do cronograma do fixture',
        );
        state = await jsonOrThrow(
            await request.get(`api/v1/cronograma?id_interclasse=${idInterclasse}`),
            'estado atualizado do cronograma do fixture',
        );
    }

    return state;
}

async function garantirOperacaoLiberada(request, idInterclasse) {
    let state = await jsonOrThrow(
        await request.get(`api/v1/cronograma?id_interclasse=${idInterclasse}`),
        'estado do cronograma antes da liberação do fixture',
    );
    if (String(state.cronograma_status) !== 'publicado') {
        state = await garantirCronogramaPublicado(request, idInterclasse);
    }
    if (operacaoLiberada(state)) return state;

    const modalidades = await jsonOrThrow(
        await request.get(`api/v1/modalidades?id_interclasse=${idInterclasse}`),
        'modalidades para completar elencos do fixture',
    );
    const equipes = await jsonOrThrow(
        await request.get(`api/v1/equipes?id_interclasse=${idInterclasse}`),
        'equipes para completar elencos do fixture',
    );
    const modalidadesAtivas = new Map((Array.isArray(modalidades) ? modalidades : [])
        .filter((item) => String(item.status_modalidade) === '1')
        .map((item) => [String(item.id_modalidade), item]));
    let alunoIndex = 0;
    for (const equipe of Array.isArray(equipes) ? equipes : []) {
        if (String(equipe.status_equipe) !== '1') continue;
        const modalidade = modalidadesAtivas.get(String(equipe.modalidades_id_modalidade));
        if (!modalidade) continue;
        const minimo = Math.max(1, Number(modalidade.min_inscritos_equipe || 1));
        const membros = await jsonOrThrow(
            await request.get(`api/v1/equipes?id_equipe=${Number(equipe.id_equipe)}`),
            `membros da equipe ${equipe.id_equipe} do fixture`,
        );
        let quantidade = Array.isArray(membros) ? membros.length : 0;
        while (quantidade < minimo) {
            alunoIndex += 1;
            const genero = String(modalidade.genero_modalidade || '').toUpperCase() === 'FEM' ? 'FEM' : 'MASC';
            const matricula = `PL${Date.now()}${alunoIndex}`;
            const criado = await jsonOrThrow(
                await request.post('api/v1/usuarios?acao=criar_aluno', {
                    data: {
                        nome_usuario: `Atleta fixture planejado ${alunoIndex}`,
                        matricula_usuario: matricula,
                        genero_usuario: genero,
                        data_nasc_usuario: '2010-01-01',
                        turmas_id_turma: Number(equipe.turmas_id_turma),
                    },
                }),
                `criação do atleta para equipe ${equipe.id_equipe}`,
            );
            const idUsuario = Number(criado.id_usuario || criado.id || 0);
            if (!idUsuario) throw new Error(`A API não retornou o ID do atleta da equipe ${equipe.id_equipe}.`);
            await jsonOrThrow(
                await request.post('api/v1/equipes', {
                    data: { acao: 'adicionar_usuarios', id_equipe: Number(equipe.id_equipe), usuarios: [idUsuario] },
                }),
                `vínculo do atleta à equipe ${equipe.id_equipe}`,
            );
            quantidade += 1;
        }
    }

    if (String(state.inscricoes_status) !== 'encerradas') {
        state = await jsonOrThrow(
            await request.post('api/v1/cronograma', {
                data: {
                    acao: 'encerrar_inscricoes',
                    id_interclasse: idInterclasse,
                    cronograma_versao: Number(state.cronograma_versao || 0),
                },
            }),
            'encerramento das inscrições do fixture',
        );
    }
    const released = await jsonOrThrow(
        await request.post('api/v1/cronograma', {
            data: {
                acao: 'liberar_operacao',
                id_interclasse: idInterclasse,
                cronograma_versao: Number(state.cronograma_versao || 0),
            },
        }),
        'liberação da operação do fixture',
    );
    return released;
}

async function buscarJogoPlanejado(request, idModalidade, idEquipe = null) {
    const jogos = await jsonOrThrow(
        await request.get(`api/v1/jogos?id_modalidade=${Number(idModalidade)}`),
        `jogos planejados da modalidade ${idModalidade}`,
    );
    for (const jogo of Array.isArray(jogos) ? jogos : []) {
        if (!String(jogo.nome_jogo || '').startsWith('PL:')
            || String(jogo.status_jogo) !== 'Agendado'
            || !jogo.data_jogo
            || !jogo.locais_id_local) continue;
        const partidas = await jsonOrThrow(
            await request.get(`api/v1/partidas?id_jogo=${Number(jogo.id_jogo)}`),
            `participantes do jogo planejado ${jogo.id_jogo}`,
        );
        if (!Array.isArray(partidas) || partidas.length !== 2) continue;
        if (idEquipe !== null && !partidas.some((partida) => Number(partida.equipes_id_equipe) === Number(idEquipe))) continue;
        return { jogo, partidas };
    }
    throw new Error(`Não foi encontrado jogo inicial liberado para a modalidade ${idModalidade}.`);
}

async function buscarPrimeiroJogoPlanejado(request, modalidades) {
    let ultimoErro = null;
    for (const modalidade of modalidades) {
        try {
            return await buscarJogoPlanejado(request, Number(modalidade.id_modalidade));
        } catch (error) {
            ultimoErro = error;
        }
    }
    throw ultimoErro || new Error('Não há modalidade com jogo planejado liberado.');
}

module.exports = {
    buscarJogoPlanejado,
    buscarPrimeiroJogoPlanejado,
    garantirCronogramaPublicado,
    garantirOperacaoLiberada,
    operacaoLiberada,
};
