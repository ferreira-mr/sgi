<?php
$titulo = 'Placar';
$mostrarVoltar = true;
$mostrarVoltarHeader = false;
$compacteCabecalho = true;
$urlVoltar = \App\Shared\Http\Url::to('painel');

include SGI_ROOT . '/resources/views/components/admin-head.php';
include SGI_ROOT . '/resources/views/components/admin-header.php';
$paginaAtiva = 'dashboard';
?>

<main class="main-desktop-layout sgi-placar">
    <div class="container-xxl py-4 px-3 px-md-4">

        <?php
        $headerClasse = 'sgi-placar-header';
        $headerClasseTitulo = 'd-md-block';
        $headerUrlVoltar = \App\Shared\Http\Url::to('edicoes/agenda');
        $headerIdVoltar = 'btnVoltarPlacar';
        $headerCorpoHtml = '<h1 id="placar-titulo-jogo" class="h3 fw-bold lh-sm mb-0">Placar</h1>
        <span id="placar-meta" class="small text-body-secondary"></span>';
        $headerAcoesHtml = '<div class="d-flex flex-column align-items-end gap-1 text-end">
                <div id="mc-status-badge"></div>
                <span id="mc-sync-status" class="small fw-semibold text-warning-emphasis" role="status" aria-live="polite" aria-atomic="true" hidden></span>
            </div>';
        include SGI_ROOT . '/resources/views/components/page-header.php';
        unset($headerMostrarVoltar, $headerCorpoHtml, $headerAcoesHtml, $headerClasse, $headerClasseTitulo, $headerUrlVoltar, $headerIdVoltar, $headerClassBotao, $headerHiddenBotao);
        ?>

        <div id="placar-erro" class="alert alert-danger d-none mb-3" role="alert"></div>
        <div id="placar-status-announcer" class="visually-hidden" role="status" aria-live="polite" aria-atomic="true"></div>
        <div id="placar-loading" class="text-center py-5 text-body-secondary">
            <span class="spinner-border spinner-border-sm text-primary me-2" aria-hidden="true"></span>Carregando partida...
        </div>

        <div id="placar-conteudo" class="d-none d-grid gap-3">

            <div id="placar-acoes" class="d-flex flex-wrap gap-3 align-items-center"></div>

            <div id="placar-grid" class="card border-0 shadow-sm rounded-4 p-4 d-flex flex-column align-items-center position-relative overflow-hidden"></div>

            <div class="d-flex justify-content-center gap-2 mt-3 flex-wrap">
                <div class="badge rounded-pill text-bg-light border text-body-secondary d-inline-flex align-items-center gap-1">
                    <i class="bi bi-clock-history" aria-hidden="true"></i>
                    <span id="mc-occ-count">0</span>
                    <span class="fw-normal">ocorrências</span>
                </div>
                <div class="badge rounded-pill text-bg-light border text-body-secondary d-inline-flex align-items-center gap-1">
                    <i class="bi bi-stopwatch" aria-hidden="true"></i>
                    <span id="mc-duration-stat">--</span>
                    <span class="fw-normal">duração</span>
                </div>
            </div>

            <div id="artilheiro-section" class="d-none">
                <div class="d-flex align-items-center justify-content-between mb-3 mt-5">
                    <h2 class="h5 fw-bold d-flex align-items-center gap-2 mb-0"><i class="bi bi-trophy-fill text-primary" aria-hidden="true"></i> Artilharia / Destaques</h2>
                </div>
                <div class="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-3" id="artilheiro-cards"></div>
            </div>

            <div id="ocorrencias-section" class="d-none">
                <div class="d-flex align-items-center justify-content-between mb-3 mt-5">
                    <h2 class="h5 fw-bold d-flex align-items-center gap-2 mb-0"><i class="bi bi-clock-history text-primary" aria-hidden="true"></i> Timeline da Partida</h2>
                </div>
                <div id="lista-ocorrencias" class="mc-timeline ps-3 ps-md-4">
                    <div class="text-center py-5 text-body-secondary"><i class="bi bi-clock-history fs-2 d-block mb-2 text-body-tertiary" aria-hidden="true"></i><p class="mb-0">Nenhuma ocorrência registrada.</p></div>
                </div>
            </div>
        </div>

        <div id="alerta-segundo-amarelo"></div>
    </div>
</main>

<button type="button" class="mc-fab sgi-placar-fab btn btn-primary rounded-circle shadow position-fixed bottom-0 end-0 mb-5 me-4 d-inline-flex align-items-center justify-content-center z-3" id="btnNovaOcorrencia" onclick="abrirModalOcorrencia()" title="Nova ocorrência" aria-label="Registrar nova ocorrência">
    <i class="bi bi-plus-lg fs-5" aria-hidden="true"></i>
</button>

<!-- Modal Ocorrência -->
<div class="modal fade" id="modalOcorrencia" tabindex="-1" aria-labelledby="modalOcorrenciaLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title fs-5" id="modalOcorrenciaLabel">Nova ocorrência</h2>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar ocorrência"></button>
            </div>
            <form id="formOcorrencia" onsubmit="return salvarOcorrencia(event)">
                <div class="modal-body">
                    <div class="mb-3">
                        <fieldset class="border-0 p-0 m-0">
                            <legend class="form-label mb-2">Tipo de ocorrência</legend>
                            <div class="row row-cols-1 row-cols-sm-3 g-2">
                                <div class="col">
                                    <input type="radio" name="tipo_ocorrencia" value="Amarelo" class="btn-check" id="tipoOcorrenciaAmarelo" autocomplete="off">
                                    <label for="tipoOcorrenciaAmarelo" class="btn btn-outline-warning ocorrencia-tipo-option d-flex align-items-center justify-content-center gap-1 w-100" data-tipo="Amarelo">
                                        <i class="bi bi-square-fill text-warning small" aria-hidden="true"></i>Amarelo
                                    </label>
                                </div>
                                <div class="col">
                                    <input type="radio" name="tipo_ocorrencia" value="Vermelho" class="btn-check" id="tipoOcorrenciaVermelho" autocomplete="off">
                                    <label for="tipoOcorrenciaVermelho" class="btn btn-outline-danger ocorrencia-tipo-option d-flex align-items-center justify-content-center gap-1 w-100" data-tipo="Vermelho">
                                        <i class="bi bi-x-octagon-fill small" aria-hidden="true"></i>Vermelho
                                    </label>
                                </div>
                                <div class="col">
                                    <input type="radio" name="tipo_ocorrencia" value="Suspensao" class="btn-check" id="tipoOcorrenciaSuspensao" autocomplete="off">
                                    <label for="tipoOcorrenciaSuspensao" class="btn btn-outline-secondary ocorrencia-tipo-option d-flex align-items-center justify-content-center gap-1 w-100" data-tipo="Suspensao">
                                        <i class="bi bi-pause-circle-fill small" aria-hidden="true"></i>Suspensão
                                    </label>
                                </div>
                            </div>
                        </fieldset>
                    </div>
                    <div class="mb-3">
                        <label class="form-label" for="filtroTurmaOcorrencia">Turma</label>
                        <select class="form-select" id="filtroTurmaOcorrencia" onchange="carregarAlunosOcorrencia()">
                            <option value="">Selecione a turma</option>
                        </select>
                    </div>
                    <div class="mb-3">
                        <label class="form-label" for="selectAlunoOcorrencia">Estudante</label>
                        <select class="form-select" id="selectAlunoOcorrencia" required disabled>
                            <option value="">Selecione uma turma primeiro</option>
                        </select>
                    </div>
                    <div class="mb-3">
                        <label class="form-label" for="penalidadeOcorrencia">Penalidade em pontos</label>
                        <select class="form-select" id="penalidadeOcorrencia">
                            <option value="0">Sem penalidade</option>
                            <?php for($i=1;$i<=30;$i++): ?>
                            <option value="<?= $i ?>"><?= $i ?></option>
                            <?php endfor; ?>
                        </select>
                    </div>
                    <div class="mb-2">
                        <label class="form-label" for="descricaoOcorrencia">Descrição</label>
                        <textarea class="form-control" id="descricaoOcorrencia" rows="2" required placeholder="Motivo da ocorrência..."></textarea>
                    </div>
                    <div id="msgOcorrencia" class="small" role="status" aria-live="polite" aria-atomic="true"></div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-sm btn-outline-secondary rounded-pill" data-bs-dismiss="modal">Cancelar</button>
                    <button type="submit" class="btn btn-sm btn-primary rounded-pill px-4 fw-bold" id="btnSalvarOcorrencia">
                        <i class="bi bi-check-lg me-1" aria-hidden="true"></i>Registrar
                    </button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- Modal Artilheiro -->
<div class="modal fade" id="modalArtilheiro" tabindex="-1" aria-labelledby="modalArtilheiroLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title fs-5" id="modalArtilheiroLabel"><i class="bi bi-trophy-fill me-1 text-warning" aria-hidden="true"></i>Registrar ponto</h2>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar registro de ponto"></button>
            </div>
            <form id="formArtilheiro" onsubmit="return salvarPonto(event)">
                <div class="modal-body">
                    <div class="mb-3">
                        <label class="form-label" for="selectEquipeArtilheiro">Equipe</label>
                        <select class="form-select" id="selectEquipeArtilheiro" onchange="carregarAlunosArtilheiro()">
                            <option value="">Selecione a equipe</option>
                        </select>
                    </div>
                    <div class="mb-2">
                        <label class="form-label" for="selectAlunoArtilheiro">Estudante responsável pela jogada</label>
                        <select class="form-select" id="selectAlunoArtilheiro" aria-required="true">
                            <option value="">Selecione uma equipe primeiro</option>
                        </select>
                    </div>
                    <div id="msgArtilheiro" class="small" role="status" aria-live="polite" aria-atomic="true"></div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-sm btn-outline-secondary rounded-pill" data-bs-dismiss="modal">Cancelar</button>
                    <button type="submit" class="btn btn-sm btn-success rounded-pill px-3 fw-bold" id="btnSalvarArtilheiro">
                        <i class="bi bi-check-lg me-1" aria-hidden="true"></i>Registrar ponto
                    </button>
                </div>
            </form>
        </div>
    </div>
</div>

<script type="application/json" data-sgi-config="competicoes/placar"><?= json_encode([], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR) ?></script>
<script data-sgi-page src="<?= \App\Shared\Http\Assets::url('js/pages/competicoes/placar.js') ?>"></script>

<?php
include SGI_ROOT . '/resources/views/components/admin-nav.php';
require_once SGI_ROOT . '/resources/views/components/footer.php';
?>
