<?php
$titulo = 'Ocorrências';
$mostrarVoltar = true;
$urlVoltar = \App\Shared\Http\Url::to('painel');
$idVoltarMobile = 'btnVoltarOcrMob';
include SGI_ROOT . '/resources/views/components/admin-head.php';
include SGI_ROOT . '/resources/views/components/admin-header.php';
$paginaAtiva = 'ocorrencias';
$nivelUsuario = (int)($_SESSION['nivel'] ?? -1);
$isAdmin = $nivelUsuario === 0;
?>

<main class="d-md-none sgi-ocorrencias-mobile sgi-u-min-width-0 pt-5 pb-5">
    <div class="px-3">
        <div class="row row-cols-1 g-3 sgi-u-min-width-0" id="listaOcorrenciasMobile">
            <div class="col text-center text-body-secondary py-5"><div class="spinner-border spinner-border-sm me-2" role="status"></div>Carregando...</div>
        </div>
    </div>
</main>

<main class="d-none d-md-block main-desktop-layout sgi-ocorrencias-desktop pb-5">
    <div class="container-fluid px-4">
        <?php
        $headerIdVoltar = 'btnVoltarOcr';
        $headerCorpoHtml = '<h1 class="h3 fw-bold mb-1">Ocorrências</h1>
        <p class="text-body-secondary mb-0">Registre ocorrências e descontos de pontos por turma.</p>';
        include SGI_ROOT . '/resources/views/components/page-header.php';
        unset($headerMostrarVoltar, $headerCorpoHtml, $headerAcoesHtml, $headerClasse, $headerUrlVoltar, $headerIdVoltar, $headerClassBotao, $headerHiddenBotao);
        ?>

        <div class="row row-cols-1 row-cols-lg-2 g-3" id="listaOcorrenciasDesktop">
            <div class="col text-center text-body-secondary py-5"><div class="spinner-border spinner-border-sm me-2" role="status"></div>Carregando...</div>
        </div>
    </div>
</main>

<!-- Modal Nova Ocorrência -->
<div class="modal fade" id="modalNovaOcorrencia" tabindex="-1" aria-labelledby="modalNovaOcorrenciaLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-fullscreen-xl-down">
        <div class="modal-content border-0 shadow">
            <div class="modal-header border-0">
                <h2 class="modal-title fs-5 fw-bold" id="modalNovaOcorrenciaLabel"><i class="bi bi-exclamation-triangle text-warning me-2" aria-hidden="true"></i>Nova ocorrência — <span id="modalTurmaNome"></span></h2>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar ocorrência"></button>
            </div>
            <div class="modal-body pt-0">
                <div class="mb-3">
                    <label class="form-label fw-semibold small text-secondary" for="ocrTituloModal">Título</label>
                    <input type="text" class="form-control rounded-3" id="ocrTituloModal" placeholder="Ex: Conduta antidesportiva">
                </div>
                <div class="mb-3">
                    <label class="form-label fw-semibold small text-secondary" for="ocrPontosModal">Pontos a descontar</label>
                    <input type="number" min="0" step="1" class="form-control rounded-3" id="ocrPontosModal" placeholder="0">
                </div>
                <div id="msgOcrModal" class="mt-3 small" ></div>
            </div>
            <div class="modal-footer border-0 px-4 pb-3">
                <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
                <button type="button" class="btn btn-primary" id="btnSalvarOcrModal" >
                    <i class="bi bi-check-lg me-1"></i>Registrar
                </button>
            </div>
        </div>
    </div>
</div>

<!-- Modal Histórico -->
<div class="modal fade" id="modalHistoricoOcorrencias" tabindex="-1" aria-labelledby="modalHistoricoOcorrenciasLabel" aria-hidden="true">
    <div class="modal-dialog modal-lg modal-dialog-scrollable modal-fullscreen-xl-down">
        <div class="modal-content border-0 shadow">
            <div class="modal-header border-0">
                <h2 class="modal-title fs-5 fw-bold" id="modalHistoricoOcorrenciasLabel"><i class="bi bi-clock-history me-2" aria-hidden="true"></i>Histórico de ocorrências — <span id="modalHistoricoTurmaNome"></span></h2>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar histórico de ocorrências"></button>
            </div>
            <div class="modal-body pt-0">
                <div id="historicoConteudo" class="text-center text-muted py-4">
                    <div class="spinner-border text-danger" role="status"><span class="visually-hidden">Carregando histórico de ocorrências...</span></div>
                </div>
            </div>
        </div>
    </div>
</div>

<?php include SGI_ROOT . '/resources/views/components/admin-nav.php'; ?>

<script type="application/json" data-sgi-config="disciplina/ocorrencias"><?= json_encode([], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR) ?></script>
<script data-sgi-page src="<?= \App\Shared\Http\Assets::url('js/pages/disciplina/ocorrencias.js') ?>"></script>

<?php require_once SGI_ROOT . '/resources/views/components/footer.php'; ?>
