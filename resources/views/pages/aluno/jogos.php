<?php
$titulo = 'Tabela de Jogos';
$mostrarVoltar = true;
$mostrarSino = true;
$urlVoltar = \App\Shared\Http\Url::to('aluno/inicio');

include SGI_ROOT . '/resources/views/components/aluno-head.php';
include SGI_ROOT . '/resources/views/components/aluno-header.php';
?>



<main class="jogos-layout py-4 px-3 px-lg-4">

    <header class="d-none d-md-flex align-items-center gap-3 mb-4">
        <?php
        $sgiUrlVoltar = $urlVoltar;
        $sgiIdVoltar = 'btnVoltarJogosAlunoDesk';
        $sgiClassVoltar = 'd-none d-md-inline-flex';
        include SGI_ROOT . '/resources/views/components/back-button.php';
        unset($sgiUrlVoltar, $sgiIdVoltar, $sgiClassVoltar);
        ?>
        <span class="bg-primary text-white rounded-3 p-3 fs-3 d-inline-flex shadow"><i class="bi bi-calendar-event"></i></span>
        <div>
            <h1 class="h3 fw-bold mb-1">Cronograma de Jogos</h1>
            <p class="text-body-secondary mb-0">Acompanhe as datas, horários e resultados das partidas.</p>
        </div>
    </header>

    <!-- Filtros -->
    <div class="d-flex flex-wrap align-items-center gap-2 mb-4">
        <div class="btn-group flex-shrink-0" role="group" aria-label="Filtrar jogos">
            <button type="button" class="btn btn-sm btn-outline-primary filtro-btn active" data-filter="all" aria-pressed="true">Todos</button>
            <button type="button" class="btn btn-sm btn-outline-primary filtro-btn" data-filter="agendado" aria-pressed="false">Próximos Jogos</button>
            <button type="button" class="btn btn-sm btn-outline-primary filtro-btn" data-filter="finalizado" aria-pressed="false">Resultados</button>
        </div>

        <div class="d-flex align-items-center gap-2">
            <span class="small text-uppercase fw-semibold text-body-secondary text-nowrap">Modalidade</span>
            <select id="filtroModalidade" class="form-select form-select-sm" aria-label="Filtrar por modalidade">
                <option value="all">Todas</option>
            </select>
        </div>

        <div class="d-flex align-items-center gap-2">
            <span class="small text-uppercase fw-semibold text-body-secondary text-nowrap">Categoria</span>
            <select id="filtroCategoria" class="form-select form-select-sm" aria-label="Filtrar por categoria">
                <option value="all">Todas</option>
            </select>
        </div>
    </div>

    <!-- Container dos Jogos -->
    <div id="listaJogos" class="row row-cols-1 row-cols-xl-2 g-3">
        <div class="col-12 text-center text-body-secondary py-5">
            <div class="spinner-border spinner-border-sm text-danger mb-2" role="status"></div>
            Carregando tabela de jogos...
        </div>
    </div>

</main>

<!-- Modal de Detalhes da Modalidade -->
<div class="modal fade" id="modalModalidade" tabindex="-1" aria-labelledby="modalModalidadeTitle" aria-hidden="true">
    <div class="modal-dialog modal-dialog-scrollable modal-lg">
        <div class="modal-content border-0 shadow rounded-4 overflow-hidden">
            <div class="modal-header bg-primary text-white border-0">
                <h5 class="modal-title" id="modalModalidadeTitle"><i class="bi bi-trophy-fill me-2"></i>Detalhes da Modalidade</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <div class="modal-body" id="modalModalidadeCorpo">
                <div class="text-center text-muted py-4">
                    <div class="spinner-border spinner-border-sm text-danger me-2" role="status"></div>
                    Carregando detalhes...
                </div>
            </div>
        </div>
    </div>
</div>

<?php
$paginaAtiva = 'jogos';
include SGI_ROOT . '/resources/views/components/aluno-nav.php';
?>

<script type="application/json" data-sgi-config="aluno/jogos"><?= json_encode(['value2' => ((string) ($categoria_usuario > 0 ? (string) $categoria_usuario : 'all'))], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR) ?></script>
<script data-sgi-page src="<?= \App\Shared\Http\Assets::url('js/pages/aluno/jogos.js') ?>"></script>
<?php include SGI_ROOT . '/resources/views/components/footer.php'; ?>
