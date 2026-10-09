<?php
$titulo = 'Chaveamento';
$mostrarVoltar = true;
$urlVoltar = \App\Shared\Http\Url::to('painel');
$idVoltarMobile = 'btnVoltarChaveamentoMob';

include SGI_ROOT . '/resources/views/components/admin-head.php';
include SGI_ROOT . '/resources/views/components/admin-header.php';
$paginaAtiva = 'chaveamento';
$nivelUsuario = (int)($_SESSION['nivel'] ?? -1);
$isNivel3 = $nivelUsuario === 3;
$isNivel2 = $nivelUsuario === 2;
$podeEditar = !$isNivel2 && !$isNivel3;
?>

<main class="d-md-none sgi-chaveamento-mobile sgi-u-min-width-0 p-4 bg-body-tertiary min-vh-100" >
    <div class="row row-cols-2 g-3 mb-4" >
        <div class="col">
            <div class="card border-0 shadow-sm h-100 p-3 d-flex flex-row align-items-center gap-3">
                <div class="rounded-3 bg-danger-subtle text-danger p-2 fs-5 d-inline-flex flex-shrink-0"><i class="bi bi-trophy"></i></div>
                <div class="flex-grow-1">
                    <div class="fs-4 fw-bold lh-1" id="statModalidadesMob">0</div>
                    <div class="small text-body-secondary text-uppercase">Modalidades</div>
                </div>
            </div>
        </div>
        <div class="col">
            <div class="card border-0 shadow-sm h-100 p-3 d-flex flex-row align-items-center gap-3">
                <div class="rounded-3 bg-primary-subtle text-primary p-2 fs-5 d-inline-flex flex-shrink-0"><i class="fa-solid fa-volleyball"></i></div>
                <div class="flex-grow-1">
                    <div class="fs-4 fw-bold lh-1" id="statJogosMob">0</div>
                    <div class="small text-body-secondary text-uppercase">Jogos</div>
                </div>
            </div>
        </div>
        <div class="col">
            <div class="card border-0 shadow-sm h-100 p-3 d-flex flex-row align-items-center gap-3">
                <div class="rounded-3 bg-warning-subtle text-warning-emphasis p-2 fs-5 d-inline-flex flex-shrink-0"><i class="bi bi-award"></i></div>
                <div class="flex-grow-1">
                    <div class="fs-4 fw-bold lh-1" id="statCampeoesMob">0</div>
                    <div class="small text-body-secondary text-uppercase">Campeões</div>
                </div>
            </div>
        </div>
        <div class="col">
            <div class="card border-0 shadow-sm h-100 p-3 d-flex flex-row align-items-center gap-3">
                <div class="rounded-3 bg-info-subtle text-info-emphasis p-2 fs-5 d-inline-flex flex-shrink-0"><i class="bi bi-hourglass-split"></i></div>
                <div class="flex-grow-1">
                    <div class="fs-4 fw-bold lh-1" id="statPendentesMob">0</div>
                    <div class="small text-body-secondary text-uppercase">Pendentes</div>
                </div>
            </div>
        </div>
    </div>

    <div class="card border-0 shadow-sm rounded-4 p-4 mb-4">
        <div class="mb-3">
            <div class="h5 fw-bold text-body mb-1"><i class="bi bi-diagram-3 me-2 text-primary" ></i>Chaveamento da competição</div>
            <div class="small text-body-secondary">A árvore e os horários vêm do cronograma publicado da edição.</div>
        </div>
        <div class="d-flex flex-column gap-2">
            <div id="kvs-wrap-selectModalidadeMob" class="kvs-wrap w-100 sgi-u-min-width-0" ></div>
            <select class="form-select d-none" id="selectModalidadeMob">
                <option value="">Selecione uma modalidade</option>
            </select>
        </div>
        <div id="msgChaveamentoMob" class="alert d-none" ></div>
    </div>

    <div id="bracketAreaMob" class="card border-0 shadow-sm rounded-4 text-center sgi-u-min-width-0 p-5">
        <div class="display-5 text-body-tertiary mb-3"><i class="bi bi-diagram-3"></i></div>
        <div class="h5 fw-bold text-body mb-2">Nenhum chaveamento disponível</div>
        <div class="small text-body-secondary">Selecione uma modalidade para consultar a árvore criada pelo cronograma publicado.</div>
    </div>

    <div id="secaoJogosMob" class="mt-4 sgi-u-min-width-0">
        <div class="card border-0 shadow-sm rounded-4 overflow-hidden">
            <div class="p-4 pb-0">
                <div class="h5 fw-bold text-body mb-1">Jogos Realizados</div>
                <div class="small text-body-secondary">Histórico de partidas concluídas.</div>
            </div>
            <div class="d-flex flex-column gap-2 p-4" >
                <div id="kvs-wrap-filtroModalidadeJogosMob" class="kvs-wrap w-100 sgi-u-min-width-0" ></div>
                 <select class="form-select form-select-sm d-none w-100" id="filtroModalidadeJogosMob" >
                    <option value="">Todas modalidades</option>
                </select>
                 <select class="form-select form-select-sm w-100" id="filtroCategoriaJogosMob" aria-label="Filtrar jogos por categoria">
                    <option value="">Todas categorias</option>
                </select>
                 <input type="text" class="form-control form-control-sm w-100" placeholder="Buscar partida..." id="inputBuscaJogoMob" aria-label="Buscar partida">
            </div>
            <div class="table-responsive">
                <table class="table table-hover align-middle" aria-label="Histórico de jogos">
                    <thead>
                        <tr>
                            <th id="jogos-mob-th-partida" scope="col">Partida</th>
                            <th id="jogos-mob-th-modalidade" scope="col">Modalidade</th>
                            <th id="jogos-mob-th-data" scope="col">Data</th>
                            <th id="jogos-mob-th-tempo" scope="col">Duração do jogo</th>
                            <th id="jogos-mob-th-acrescimos" scope="col">Acréscimos</th>
                            <th id="jogos-mob-th-destaque" scope="col">Artilheiro/Destaque</th>
                            <th id="jogos-mob-th-status" scope="col">Status</th>
                            <th id="jogos-mob-th-acoes" scope="col" class="text-end">Ações</th>
                        </tr>
                    </thead>
                    <tbody id="tbodyJogosMob">
                        <tr>
                            <td colspan="8" class="text-center text-muted py-4">Carregando jogos...</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</main>

<main class="d-none d-md-block main-desktop-layout sgi-chaveamento-desktop bg-body-tertiary min-vh-100">

    <div class="container-fluid mw-100" >

        <?php
        $headerIdVoltar = 'btnVoltar';
        $headerCorpoHtml = '<h1 class="h2 fw-bold text-body mb-0">Chaveamento</h1>';
        $headerAcoesHtml = '';
        include SGI_ROOT . '/resources/views/components/page-header.php';
        unset($headerMostrarVoltar, $headerCorpoHtml, $headerAcoesHtml, $headerClasse, $headerUrlVoltar, $headerIdVoltar, $headerClassBotao, $headerHiddenBotao);
        ?>

        <div class="row row-cols-2 row-cols-xl-4 g-3 mb-4">
            <div class="col">
                <div class="card border-0 shadow-sm h-100 p-3 d-flex flex-row align-items-center gap-3">
                    <div class="rounded-3 bg-danger-subtle text-danger p-2 fs-5 d-inline-flex flex-shrink-0"><i class="bi bi-trophy"></i></div>
                    <div class="flex-grow-1">
                        <div class="fs-4 fw-bold lh-1" id="statModalidades">0</div>
                        <div class="small text-body-secondary text-uppercase">Modalidades</div>
                    </div>
                </div>
            </div>
            <div class="col">
                <div class="card border-0 shadow-sm h-100 p-3 d-flex flex-row align-items-center gap-3">
                    <div class="rounded-3 bg-primary-subtle text-primary p-2 fs-5 d-inline-flex flex-shrink-0"><i class="fa-solid fa-volleyball"></i></div>
                    <div class="flex-grow-1">
                        <div class="fs-4 fw-bold lh-1" id="statJogos">0</div>
                        <div class="small text-body-secondary text-uppercase">Jogos</div>
                    </div>
                </div>
            </div>
            <div class="col">
                <div class="card border-0 shadow-sm h-100 p-3 d-flex flex-row align-items-center gap-3">
                    <div class="rounded-3 bg-warning-subtle text-warning-emphasis p-2 fs-5 d-inline-flex flex-shrink-0"><i class="bi bi-award"></i></div>
                    <div class="flex-grow-1">
                        <div class="fs-4 fw-bold lh-1" id="statCampeoes">0</div>
                        <div class="small text-body-secondary text-uppercase">Campeões definidos</div>
                    </div>
                </div>
            </div>
            <div class="col">
                <div class="card border-0 shadow-sm h-100 p-3 d-flex flex-row align-items-center gap-3">
                    <div class="rounded-3 bg-info-subtle text-info-emphasis p-2 fs-5 d-inline-flex flex-shrink-0"><i class="bi bi-hourglass-split"></i></div>
                    <div class="flex-grow-1">
                        <div class="fs-4 fw-bold lh-1" id="statPendentes">0</div>
                        <div class="small text-body-secondary text-uppercase">Jogos pendentes</div>
                    </div>
                </div>
            </div>
        </div>

        <div class="card border-0 shadow-sm rounded-4 p-4 mb-4">
            <div class="mb-3">
                <div class="h5 fw-bold text-body mb-1"><i class="bi bi-diagram-3 me-2 text-primary" ></i>Chaveamento da competição</div>
                <div class="small text-body-secondary">A árvore e os horários vêm do cronograma publicado da edição.</div>
            </div>
            <div class="d-flex flex-column flex-lg-row gap-2 align-items-stretch">
                <div id="kvs-wrap-selectModalidade" class="kvs-wrap"></div>
                <select class="form-select d-none" id="selectModalidade">
                    <option value="">Selecione uma modalidade</option>
                </select>
            </div>
            <div id="msgChaveamento"></div>
            <div id="linkVerArvore" class="d-none mt-2" >
                <a href="#" id="btnVerArvore" class="btn btn-outline-secondary d-inline-flex align-items-center gap-2">
                    <i class="bi bi-diagram-3-fill"></i> Ver árvore do chaveamento
                </a>
            </div>
        </div>

        <div id="faseTimeline" class="card border-0 shadow-sm d-none p-3 mb-4 overflow-auto"></div>

        <div id="bracketArea">
            <div class="card border-0 shadow-sm rounded-4 text-center p-5">
                <div class="display-5 text-body-tertiary mb-3"><i class="bi bi-diagram-3"></i></div>
                <div class="h5 fw-bold text-body mb-2">Nenhum chaveamento disponível</div>
                <div class="small text-body-secondary mb-4">Selecione uma modalidade para consultar a árvore criada pelo cronograma publicado.</div>
            </div>
        </div>

        <div id="secaoJogos" class="mt-4">
            <div class="card border-0 shadow-sm rounded-4 overflow-hidden">
                <div class="p-4 pb-0">
                    <div class="h5 fw-bold text-body mb-1">Jogos Realizados</div>
                    <div class="small text-body-secondary">Histórico de partidas concluídas.</div>
                </div>
                <div class="d-flex gap-2 p-4 align-items-center flex-wrap">
                    <input type="text" class="form-control form-control-sm flex-grow-1" placeholder="Buscar partida..." id="inputBuscaJogo" aria-label="Buscar partida">
                    <div id="kvs-wrap-filtroModalidadeJogos" class="kvs-wrap"></div>
                    <select class="form-select form-select-sm d-none" id="filtroModalidadeJogos">
                        <option value="">Todas modalidades</option>
                    </select>
                    <select class="form-select form-select-sm" id="filtroCategoriaJogos" aria-label="Filtrar jogos por categoria">
                        <option value="">Todas categorias</option>
                    </select>
                </div>
                <div class="table-responsive">
                    <table class="table table-hover align-middle" aria-label="Histórico de jogos">
                        <thead>
                            <tr>
                                <th id="jogos-th-partida" scope="col">Partida</th>
                                <th id="jogos-th-modalidade" scope="col">Modalidade</th>
                                <th id="jogos-th-data" scope="col">Data</th>
                                <th id="jogos-th-tempo" scope="col">Duração do jogo</th>
                                <th id="jogos-th-acrescimos" scope="col">Acréscimos</th>
                                <th id="jogos-th-destaque" scope="col">Artilheiro/Destaque</th>
                                <th id="jogos-th-status" scope="col">Status</th>
                                <th id="jogos-th-acoes" scope="col" class="text-end">Ações</th>
                            </tr>
                        </thead>
                        <tbody id="tbodyJogos">
                            <tr>
                                <td colspan="8" class="text-center text-muted py-4">
                                    Carregando jogos...
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

    </div>
</main>

<div class="modal fade" id="modalEditarJogo" tabindex="-1" aria-labelledby="tituloModalEditarJogo" aria-hidden="true">
    <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable modal-fullscreen-xl-down">
        <div class="modal-content">
            <div class="modal-header border-0 px-4 pt-4">
                <h5 class="modal-title fw-bold text-body d-flex align-items-center gap-2" id="tituloModalEditarJogo"><i class="bi bi-pencil-square text-danger" aria-hidden="true"></i> Editar Jogo</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <form id="formEditarJogo">
                <div class="modal-body px-4">
                    <input type="hidden" id="editIdJogo">
                    <div class="bg-body-tertiary border rounded-3 p-3 mb-4" id="editResumoPartida">
                        <div class="small text-body-secondary text-uppercase fw-semibold mb-1">Partida</div>
                        <div class="fw-bold text-body" id="editNomePartida">---</div>
                        <div class="small text-body-secondary mt-1" id="editModalidadePartida"></div>
                    </div>
                    <div id="editConcluidoBanner" class="alert alert-warning d-flex align-items-center gap-2 d-none" >
                        <i class="bi bi-exclamation-triangle-fill"></i>
                        <span>Este jogo já foi <strong>finalizado</strong>. Alterar o resultado pode afetar o chaveamento.</span>
                    </div>
                    <div class="row g-4">
                        <div class="col-md-6">
                            <div id="editTeamsSection" class="d-none">
                                <h6 class="form-label">Equipes e placar</h6>
                                <div id="editTeamsList"></div>
                                <fieldset id="editWinnerSection" class="mt-3 d-none">
                                    <legend class="form-label mb-2">Vencedor</legend>
                                    <div id="editWinnerOptions" class="d-grid gap-2"></div>
                                </fieldset>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="mb-3">
                                <label for="editDataJogo" class="form-label">Data</label>
                                <input type="date" class="form-control" id="editDataJogo" required>
                            </div>
                            <div class="row g-3 mb-3">
                                <div class="col-6">
                                    <label for="editInicioJogo" class="form-label">Início</label>
                                    <input type="time" class="form-control" id="editInicioJogo">
                                </div>
                                <div class="col-6">
                                    <label for="editTerminoJogo" class="form-label">Término</label>
                                    <input type="time" class="form-control" id="editTerminoJogo">
                                </div>
                            </div>
                            <div class="mb-3">
                                <label for="editLocalJogo" class="form-label">Local</label>
                                <select class="form-select" id="editLocalJogo">
                                    <option value="">Selecione um local</option>
                                </select>
                            </div>
                            <div class="mb-3">
                                <label for="editStatusJogo" class="form-label">Status</label>
                                <select class="form-select" id="editStatusJogo">
                                    <option value="Aguardando">Aguardando</option>
                                    <option value="Agendado">Agendado</option>
                                    <option value="Iniciado">Em Andamento</option>
                                    <option value="Concluido">Concluído</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    <div id="msgEditarJogo" class="small"></div>
                </div>
                <div class="modal-footer border-0 px-4 pb-4">
                    <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
                    <button type="submit" class="btn btn-primary" id="btnSalvarJogo">
                        <i class="bi bi-check-lg me-1"></i>Salvar
                    </button>
                </div>
            </form>
        </div>
    </div>
</div>

<script type="application/json" data-sgi-config="competicoes/chaveamento"><?= json_encode(['value3' => ($nivelUsuario), 'podeEditar' => ($podeEditar)], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR) ?></script>
<script data-sgi-page src="<?= \App\Shared\Http\Assets::url('js/pages/competicoes/chaveamento.js') ?>"></script>

<?php
include SGI_ROOT . '/resources/views/components/admin-nav.php';
require_once SGI_ROOT . '/resources/views/components/footer.php';
?>
