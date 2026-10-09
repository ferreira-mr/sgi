<?php
$titulo = 'Turmas';
$tagTituloCompacto = 'h1';
$mostrarVoltar = true;
$urlVoltar = \App\Shared\Http\Url::to('edicoes/categorias');
$idVoltarMobile = 'btnVoltarTurmasMobile';
include SGI_ROOT . '/resources/views/components/admin-head.php';
include SGI_ROOT . '/resources/views/components/admin-header.php';
$paginaAtiva = 'categorias';
?>
<main class="d-md-none">
    <div class="px-3 mb-3">
        <div class="mb-3">
            <label for="categoriaTurmasMobile" class="form-label fw-semibold">Categoria</label>
            <select id="categoriaTurmasMobile" class="form-select" aria-describedby="instrucaoCategoriaTurmasMobile">
                <option value="">Selecione uma categoria</option>
            </select>
            <p id="instrucaoCategoriaTurmasMobile" class="small text-secondary mt-2 mb-0" role="status">
                Carregando categorias...
            </p>
        </div>

        <div class="mb-3">
            <label for="inputBuscaTurmaMobile" class="form-label fw-semibold">Buscar turma</label>
            <input type="search" id="inputBuscaTurmaMobile" class="form-control rounded-pill" placeholder="Nome da turma" autocomplete="off">
        </div>

        <button type="button" id="btnAdicionarTurmaMobile" class="btn btn-primary w-100 fw-bold" data-bs-toggle="modal" data-bs-target="#modalCriarTurma" disabled>
            Adicionar turma
        </button>
    </div>

    <div id="listaTurmasMobile" class="px-3">
        <p class="text-muted text-center">Carregando...</p>
    </div>
</main>

<main class="d-none d-md-block main-desktop-layout" id="viewTurmasGestaoDesk">
    <div class="container-fluid px-0">
        <?php
        $headerIdVoltar = 'btnVoltarTurmasDesk';
        $headerCorpoHtml = '<h1 class="h3 fw-bold text-body mb-0">Turmas</h1>';
        include SGI_ROOT . '/resources/views/components/page-header.php';
        unset($headerIdVoltar, $headerCorpoHtml);
        ?>
        <div class="row g-4 mx-0">
            <div class="col-md-4 px-0 px-md-2">
                <div class="bg-white rounded-4 shadow-sm overflow-hidden border-0">
                    <div class="p-3 d-flex align-items-center gap-2 bg-primary text-white" >
                        <h6 class="mb-0 fw-bold fs-5">Categorias</h6>
                    </div>

                    <div id="listaCategorias" class="list-group list-group-flush sgi-u-max-height-60vh-overflow-y-auto">
                        <p class="text-muted p-3 mb-0 text-center">Carregando categorias...</p>
                    </div>
                </div>
            </div>

            <div class="col-md-8 px-0 px-md-2 d-flex flex-column gap-3">

                <div class="bg-white rounded-3 shadow-sm p-2 d-flex align-items-center">
                    <i class="bi bi-search text-muted ms-3" aria-hidden="true"></i>
                    <label for="inputBuscaTurma" class="visually-hidden">Buscar turma</label>
                    <input type="text" id="inputBuscaTurma" class="form-control border-0 shadow-none bg-transparent" placeholder="Buscar turma">
                    <button type="button" id="btnAdicionarTurmaDesktop" class="btn fw-bold px-4 text-nowrap btn-outline-primary" data-bs-toggle="modal" data-bs-target="#modalCriarTurma" disabled>
                        Adicionar turma
                    </button>
                </div>

                <div id="listaTurmas" class="d-flex flex-column gap-3 pe-2 sgi-u-max-height-60vh-overflow-y-auto" >
                    <div class="text-center mt-5">
                        <p class="text-muted fs-5">Selecione uma categoria ao lado para ver as turmas.</p>
                    </div>
                </div>

            </div>
        </div>
    </div>

</main>

<div class="modal fade" id="modalCriarTurma" tabindex="-1" aria-labelledby="modalCriarTurmaTitulo" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 shadow-lg rounded-4 p-2">
            <div class="modal-header border-0 pb-0 position-relative justify-content-center">
                <h2 class="modal-title fw-bold text-center w-100 text-primary" id="modalCriarTurmaTitulo">
                    ADICIONAR TURMA
                </h2>
                <button type="button" class="btn-close position-absolute end-0 me-3" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <form id="formTurma">
                <div class="modal-body pt-3 pb-3">
                    <div class="mb-3">
                        <label for="inputNomeTurma" class="text-dark mb-1 fw-medium small">Nome da turma:</label>
                        <input type="text" class="form-control form-control-lg shadow-sm rounded-3 text-secondary small border" placeholder="Ex: 9º Ano A"  id="inputNomeTurma" required>
                    </div>
                    <div class="mb-3">
                        <label for="inputNomeFantasiaTurma" class="text-dark mb-1 fw-medium small">Nome fantasia:</label>
                        <input type="text" class="form-control form-control-lg shadow-sm rounded-3 text-secondary small border" placeholder="Ex: Turma dos Campeões"  id="inputNomeFantasiaTurma">
                    </div>
                    <div class="mb-3">
                        <label for="inputTurnoTurma" class="text-dark mb-1 fw-medium small">Turno:</label>
                        <select class="form-select form-select-lg shadow-sm rounded-3 text-secondary small border"  id="inputTurnoTurma">
                            <option value="">Selecione o turno</option>
                            <option value="Manhã">Manhã</option>
                            <option value="Tarde">Tarde</option>
                            <option value="Noite">Noite</option>
                        </select>
                    </div>
                </div>
                <div class="modal-footer border-0 pt-0 pb-3 justify-content-end gap-2 flex-wrap">
                    <div id="msgTurma" class="w-100 text-center small mb-2"></div>
                    <button type="button" class="btn bg-white fw-semibold rounded-3 px-4 py-2 btn-outline-primary" data-bs-dismiss="modal" >
                        Cancelar
                    </button>
                    <button type="submit" class="btn fw-semibold rounded-3 px-4 py-2 text-white btn-primary"  id="btnSalvarTurma">
                        Adicionar
                    </button>
                </div>
            </form>
        </div>
    </div>
</div>

<script type="application/json" data-sgi-config="eventos/configurar-turmas"><?= json_encode([], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR) ?></script>
<script data-sgi-page src="<?= \App\Shared\Http\Assets::url('js/pages/eventos/configurar-turmas.js') ?>"></script>

<?php
include SGI_ROOT . '/resources/views/components/admin-nav.php';
require_once SGI_ROOT . '/resources/views/components/footer.php';
?>
