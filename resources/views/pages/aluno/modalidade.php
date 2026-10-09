<?php
$titulo = 'Inscrições';
$mostrarVoltar = true;
$mostrarSino = true;
$urlVoltar = \App\Shared\Http\Url::to('aluno/inicio');
include SGI_ROOT . '/resources/views/components/aluno-head.php';
include SGI_ROOT . '/resources/views/components/aluno-header.php';
?>



<main class="main-desktop-layout modalidade-layout py-4 px-3 px-lg-4">

    <header class="d-none d-md-block mb-4">
        <div class="d-flex align-items-center gap-3">
            <?php
            $sgiUrlVoltar = $urlVoltar;
            $sgiIdVoltar = 'btnVoltarModalidadeAlunoDesk';
            $sgiClassVoltar = 'd-none d-md-inline-flex';
            include SGI_ROOT . '/resources/views/components/back-button.php';
            unset($sgiUrlVoltar, $sgiIdVoltar, $sgiClassVoltar);
            ?>
            <span class="bg-primary text-white rounded-3 p-3 fs-3 d-inline-flex shadow"><i class="bi bi-trophy-fill"></i></span>
            <div>
                <h1 class="h3 fw-bold mb-1">Escolha suas modalidades</h1>
                <p class="text-body-secondary mb-0">Selecione até 3 modalidades para participar do Interclasse.</p>
            </div>
        </div>
    </header>

    <section class="mb-4 d-none" id="secaoInscricoes">
        <div class="d-flex align-items-center gap-3 mb-3">
            <span class="bg-primary-subtle text-primary rounded-3 p-2 d-inline-flex fs-5"><i class="bi bi-person-check-fill"></i></span>
            <div class="flex-grow-1">
                <h2 class="h5 fw-bold mb-1">Suas inscrições</h2>
                <p class="small text-body-secondary mb-0">Modalidades em que você já está confirmado.</p>
            </div>
            <span class="badge rounded-pill text-bg-primary" id="badgeInscricoes">0/3</span>
        </div>
        <div id="inscricoesAtuais"></div>
    </section>

    <section class="mb-4 d-none" id="agendaInscricaoPreview" aria-live="polite">
        <div class="d-flex align-items-center gap-3 mb-3">
            <span class="bg-primary-subtle text-primary rounded-3 p-2 d-inline-flex fs-5"><i class="bi bi-calendar2-week-fill"></i></span>
            <div>
                <h2 class="h5 fw-bold mb-1">Agenda das modalidades selecionadas</h2>
                <p class="small text-body-secondary mb-0">Confira os dias e horários previstos antes de salvar sua inscrição.</p>
            </div>
        </div>
        <div id="agendaInscricaoPreviewCorpo"></div>
    </section>

    <section class="mb-4" id="secaoDisponiveis">
        <div class="d-flex align-items-center gap-3 mb-3">
            <span class="bg-primary-subtle text-primary rounded-3 p-2 d-inline-flex fs-5"><i class="bi bi-grid-1x2-fill"></i></span>
            <div class="flex-grow-1">
                <h2 class="h5 fw-bold mb-1">Disponíveis para escolha</h2>
                <p class="small text-body-secondary mb-0">Selecione até 3 modalidades para participar.</p>
            </div>
        </div>
        <p class="small text-body-secondary mb-3" id="inscricaoElegibilidade">
            A lista mostra somente modalidades compatíveis com a categoria e o gênero informados no seu cadastro. Confira as vagas restantes antes de escolher.
        </p>
        <div class="row row-cols-1 row-cols-sm-2 row-cols-lg-3 g-3" id="modalidadesGrid">
            <div class="col-12 text-center py-5">
                <div class="spinner-border spinner-border-sm me-2" role="status"></div>
                Carregando modalidades...
            </div>
        </div>
    </section>

    <div id="acoesInscricao" class="d-none position-sticky bottom-0 z-3 bg-body border-top py-3 mt-4">
        <div class="card border-0 shadow-sm p-3">
            <div class="row align-items-center g-3">
                <div class="col-auto">
                    <span class="small text-uppercase fw-semibold text-body-secondary d-block">Modalidades escolhidas</span>
                    <div class="h2 fw-bold text-primary mb-1"><span id="counterNum">0</span><span class="fs-5 text-body-secondary"> / 3</span></div>
                    <span id="statusDefault" class="badge rounded-pill text-bg-secondary">Em andamento</span>
                    <span id="limiteBadge" class="badge rounded-pill text-bg-success d-none"><i class="bi bi-check-circle-fill"></i> Limite atingido</span>
                </div>
                <div class="col">
                    <div class="d-flex justify-content-between align-items-center small text-body-secondary mb-2">
                        <span>Modalidades selecionadas</span>
                        <span id="progressCount" class="fw-semibold">0 de 3</span>
                    </div>
                    <div class="progress" role="progressbar" aria-label="Modalidades selecionadas" aria-valuemin="0" aria-valuemax="3" aria-valuenow="0">
                        <div id="progressBar" class="progress-bar"></div>
                    </div>
                </div>
                <div class="col-auto">
                    <button type="button" class="btn btn-primary px-4 py-2" id="btnSalvar" disabled>
                        <i class="bi bi-check-lg"></i> Salvar
                    </button>
                </div>
            </div>
        </div>

        <p class="small text-secondary text-center mb-0 mt-2" id="msgFeedback" role="status" aria-live="polite" aria-atomic="true"></p>

        <p id="contador" class="visually-hidden"></p>
    </div>

</main>

<div class="modal fade" id="modalDetalhes" tabindex="-1" aria-labelledby="modalDetalhesTitle" aria-hidden="true">
    <div class="modal-dialog modal-dialog-scrollable">
        <div class="modal-content border-0 shadow rounded-4">
            <div class="modal-header">
                <h5 class="modal-title fw-bold" id="modalDetalhesTitle">Detalhes</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <div class="modal-body" id="modalDetalhesCorpo"></div>
        </div>
    </div>
</div>

<div class="modal fade" id="modalEquipes" tabindex="-1" aria-labelledby="modalEquipesTitle" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content border-0 shadow rounded-4">
            <div class="modal-header">
                <div>
                    <h5 class="modal-title fw-bold" id="modalEquipesTitle">Escolha a equipe</h5>
                    <small class="text-muted" id="modalEquipesSubtitulo"></small>
                </div>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <div class="modal-body" id="modalEquipesCorpo">
                <div class="text-center text-muted py-4">
                    <div class="spinner-border spinner-border-sm me-2" role="status"></div>
                    Carregando equipes...
                </div>
            </div>
        </div>
    </div>
</div>

<?php
$paginaAtiva = 'inscricao';
include SGI_ROOT . '/resources/views/components/aluno-nav.php';
?>

<script type="application/json" data-sgi-config="aluno/modalidade"><?= json_encode(['value2' => ((string) ($genero_usuario)), 'value3' => ($categoria_usuario), 'value4' => ((int)($turma_usuario ?? 0)), 'value5' => ($modalidades_inscritas), 'value6' => ($id_usuario), 'value7' => ($cronograma_versao ?? null), 'value8' => ($versao_publicada ?? null)], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR) ?></script>
<script data-sgi-page src="<?= \App\Shared\Http\Assets::url('js/pages/aluno/modalidade.js') ?>"></script>
<?php include SGI_ROOT . '/resources/views/components/footer.php'; ?>
