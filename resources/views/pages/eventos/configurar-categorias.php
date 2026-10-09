<?php
$titulo = 'Categorias';
$tagTituloCompacto = 'h1';
$modoPagina = $_GET['modo'] ?? 'view';
$mostrarVoltar = $modoPagina === 'view';
$urlVoltar = \App\Shared\Http\Url::to('painel');
$idVoltarMobile = 'btnVoltarCatMobile';
include SGI_ROOT . '/resources/views/components/admin-head.php';
include SGI_ROOT . '/resources/views/components/admin-header.php';
$paginaAtiva = 'dashboard';
?>



<!-- main mobile -->
<main class="position-relative d-md-none mb-5" >
    <div id="listaCategoriasMobile" class="d-flex flex-column align-items-center w-100">
        <p class="text-muted small mt-3">(Carregando categorias...)</p>
    </div>

    <section id="acoesCategoriaMobile" class="d-grid gap-2 mt-4 mb-5 sgi-categoria-actions" >
        <button type="button" id="btnAdicionarTurmaMobile" class="btn btn-outline-primary d-none" data-bs-toggle="modal" data-bs-target="#criarTurma">Adicionar turma</button>
        <button type="button" id="btnEditarCategoriaMobile" class="btn btn-outline-primary d-none" onclick="abrirModalEditarCategoria(event)">Editar</button>
        <button type="button" id="btnExcluirCategoriaMobile" class="btn btn-danger d-none" onclick="excluirCategoria()">Excluir</button>
        <button data-bs-toggle="modal" data-bs-target="#modalCriarCategoria" class="btn btn-outline-danger">Adicionar Categoria</button>
        <a href="#" id="btnContinuarMobile" class="btn btn-primary">Continuar</a>
    </section>
</main>

<!-- main desktop -->
<main class="d-none d-md-block main-desktop-layout sgi-categorias-desktop">
    <div class="container-fluid px-0 position-relative">
        <?php
        $headerIdVoltar = 'btnVoltarCatDesk';
        $headerCorpoHtml = '<h1 class="h2 fw-bold text-body mb-0">Categorias</h1>';
        include SGI_ROOT . '/resources/views/components/page-header.php';
        unset($headerIdVoltar, $headerCorpoHtml);
        ?>

        <div class="row g-4" id="listaCategoriasDesktop">
            <p class="text-muted">(Carregando categorias...)</p>
        </div>

        <div id="acoesCategoriaDesktop" class="d-flex flex-wrap justify-content-end gap-3 mt-4 mb-5 sgi-categoria-actions" >
            <button type="button" id="btnAdicionarTurmaDesktop" class="btn btn-outline-primary d-none" data-bs-toggle="modal" data-bs-target="#criarTurma">Adicionar turma</button>
            <button type="button" id="btnEditarCategoriaDesktop" class="btn btn-outline-primary fw-semibold rounded-3 px-4 py-2 d-flex align-items-center justify-content-center gap-2 shadow-lg d-none" onclick="abrirModalEditarCategoria(event)">
                <i class="bi bi-pencil-square" aria-hidden="true"></i> Editar
            </button>

            <button type="button" id="btnExcluirCategoriaDesktop" class="btn btn-danger fw-semibold rounded-3 px-4 py-2 d-flex align-items-center justify-content-center gap-2 shadow-lg d-none" onclick="excluirCategoria()">
                <i class="bi bi-trash" aria-hidden="true"></i> Excluir
            </button>

            <button type="button" class="btn bg-white fw-semibold rounded-3 px-4 py-2 d-flex align-items-center justify-content-center gap-2 shadow-lg btn-outline-primary"  data-bs-toggle="modal" data-bs-target="#modalCriarCategoria">
                <i class="bi bi-plus-circle" aria-hidden="true"></i> Adicionar
            </button>

            <a href="#" id="btnContinuarDesktop" class="btn fw-semibold rounded-3 px-5 py-2 text-white text-decoration-none shadow-lg d-flex align-items-center justify-content-center btn-primary" >
                Continuar
            </a>
        </div>
    </div>
</main>

<!-- modal de adicionar nova turma -->
<div class="modal fade" id="criarTurma" tabindex="-1" aria-labelledby="tituloCriarTurmaCategoria" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
            <div class="modal-header border border-0">
                <h2 class="modal-title fs-5 text-danger" id="tituloCriarTurmaCategoria">Criar nova Turma</h2>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <div class="modal-body">
                <form id="formNovaTurmaCategoria">
                    <div class="mb-3">
                        <label for="inputNomeTurma" class="form-label">Nome da turma:</label>
                        <input type="text" class="form-control" id="inputNomeTurma" placeholder="Ex: 1º Médio A" required>
                    </div>
                    <div class="mb-3">
                        <label for="inputNomeFantasiaTurma" class="form-label">Nome fantasia:</label>
                        <input type="text" class="form-control" id="inputNomeFantasiaTurma" placeholder="Ex: Turma dos Campeões">
                    </div>
                    <div class="mb-3">
                        <label for="inputTurnoTurma" class="form-label">Turno:</label>
                        <select class="form-select" id="inputTurnoTurma">
                            <option value="">Selecione o turno</option>
                            <option value="Manhã">Manhã</option>
                            <option value="Tarde">Tarde</option>
                            <option value="Noite">Noite</option>
                        </select>
                    </div>
                    <div class="mb-3">
                        <label for="arquivoUpload" class="form-label fw-semibold">Selecionar PDF dos estudantes</label>
                        <input type="file" id="arquivoUpload" class="form-control" accept=".pdf,application/pdf" aria-describedby="descricaoArquivoUpload">
                        <p id="descricaoArquivoUpload" class="text-body-secondary small mt-2 mb-0">Formato aceito: PDF de até 10 MB. O arquivo deve conter texto selecionável.</p>
                        <span id="nomeArquivo" class="d-none small text-success mt-2" role="status" aria-live="polite" aria-atomic="true"></span>
                    </div>
                    <div id="progressoPdfCategoria" class="d-none mt-3" aria-live="polite">
                        <div class="progress" role="progressbar" aria-label="Progresso da importação do PDF" aria-valuemin="0" aria-valuemax="100">
                            <div class="progress-bar progress-bar-striped progress-bar-animated" id="barraPdfCategoria"></div>
                        </div>
                        <span id="textoProgressoPdfCategoria" class="small text-body-secondary mt-1 d-block">Processando</span>
                    </div>
                    <div id="fallbackPdfCategoria" class="d-none mt-2 text-center">
                        <p class="small text-muted mb-2">O PDF pode ser uma imagem. Converta-o para PDF com texto selecionável:</p>
                        <a href="https://www.ilovepdf.com/pt/ocr-pdf" target="_blank" rel="noopener" class="btn btn-outline-danger btn-sm rounded-3">Converter PDF (iLovePDF)</a>
                    </div>
                    <div id="msgNovaTurmaCategoria" class="text-center mb-2" role="status" aria-live="polite" aria-atomic="true"></div>
                    <div class="d-flex justify-content-center gap-4 mt-4">
                        <button type="button" class="btn btn-outline-danger" data-bs-dismiss="modal">Cancelar</button>
                        <button type="submit" class="btn btn-primary" id="btnCriarTurmaCategoria">Criar e enviar</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</div>

<!-- modal de criar nova categoria -->
<div class="modal fade" id="modalCriarCategoria" tabindex="-1" aria-labelledby="modalNovaCategoriaLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
            <div class="modal-header border border-0">
                <h2 class="modal-title fs-5 text-danger" id="modalNovaCategoriaLabel">Criar nova Categoria</h2>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <div class="modal-body">
                <label for="inputNomeCategoriaNova" class="form-label">Nome da categoria</label>
                <form id="formNovaCategoria">
                    <div>
                        <input type="text" class="form-control" placeholder="Ex: Ensino Médio" id="inputNomeCategoriaNova" required>
                    </div>
                    <div class="d-flex justify-content-center gap-3 pt-5">
                        <button type="button" class="btn btn-outline-danger" data-bs-dismiss="modal">Cancelar</button>
                        <button type="submit" class="btn btn-primary" id="btnSalvarCategoria">Criar</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</div>

<div class="modal fade" id="modalEditarCategoria" tabindex="-1" aria-labelledby="tituloEditarCategoria" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
            <div class="modal-header border-0">
                <h5 class="modal-title text-danger fw-bold" id="tituloEditarCategoria">Editar Categoria</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <div class="modal-body">
                <form id="formEditarCategoria">
                    <label for="editNomeCategoria" class="form-label">Nome da categoria</label>
                    <input type="text" class="form-control" id="editNomeCategoria" required>
                    <div id="msgEditarCategoria" class="mt-2"></div>
                    <div class="d-flex justify-content-center gap-3 pt-4">
                        <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button type="submit" class="btn btn-primary" id="btnSalvarEdicaoCategoria">Salvar</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</div>

<script type="application/json" data-sgi-config="eventos/configurar-categorias"><?= json_encode([], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR) ?></script>
<script data-sgi-page src="<?= \App\Shared\Http\Assets::url('js/pages/eventos/configurar-categorias.js') ?>"></script>

<?php
include SGI_ROOT . '/resources/views/components/admin-nav.php';
require_once SGI_ROOT . '/resources/views/components/footer.php';
?>
