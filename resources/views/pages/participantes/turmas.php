<?php
$titulo = 'Turmas';
$tagTituloCompacto = 'h1';
$mostrarVoltar = true;
$urlVoltar = \App\Shared\Http\Url::to('painel');
$idVoltarMobile = 'btnVoltarCatMob';
include SGI_ROOT . '/resources/views/components/admin-head.php';
include SGI_ROOT . '/resources/views/components/admin-header.php';
$paginaAtiva = 'categorias';
?>

<!-- Toast -->
<div class="toast-container position-fixed top-0 end-0 p-3" id="sgiToastContainer" aria-live="polite" aria-atomic="true"></div>

<!-- Mobile -->
<main class="position-relative d-md-none mb-5" >
    <div class="p-3">
        <div class="d-flex align-items-center gap-2 mb-3">
            <div class="input-group flex-grow-1">
                <span class="input-group-text"><i class="bi bi-search" aria-hidden="true"></i></span>
                <label for="buscaTurmaMob" class="visually-hidden">Buscar turma</label>
                <input type="text" class="form-control" id="buscaTurmaMob" placeholder="Buscar turma..." oninput="filtrarTurmas()">
            </div>
        </div>
        <div id="listaTurmasMobile"></div>
    </div>

    <?php if ($nivelUsuario === 0): ?>
    <button class="btn btn-primary rounded-circle p-3 fs-2 d-flex align-items-center justify-content-center position-fixed shadow sgi-u-h-60px-w-60px-bottom-100px" data-bs-toggle="modal" data-bs-target="#exampleModal" aria-label="Criar turma">
        <i class="bi bi-plus-lg text-white" aria-hidden="true"></i>
    </button>
    <?php endif; ?>
</main>

<!-- Desktop -->
<main class="d-none d-md-flex flex-column main-desktop-layout">
    <?php
    $headerIdVoltar = 'btnVoltarCatDesk';
    $headerCorpoHtml = '<h1 class="h3 fw-bold text-body mb-0">Turmas</h1>';
    $headerAcoesHtml = '<div class="d-flex align-items-center gap-3 flex-wrap">
            <div class="input-group w-auto">
                <span class="input-group-text"><i class="bi bi-search" aria-hidden="true"></i></span>
                <label for="buscaTurmaDesk" class="visually-hidden">Buscar turma</label>
                <input type="text" class="form-control" id="buscaTurmaDesk" placeholder="Buscar turma..." oninput="filtrarTurmas()">
            </div>
            ' . ($nivelUsuario === 0 ? '<button class="btn btn-primary d-inline-flex align-items-center gap-2 fw-bold px-3 py-2 border-0 rounded-3" data-bs-toggle="modal" data-bs-target="#exampleModal">
                <i class="bi bi-plus-lg" aria-hidden="true"></i> Nova Turma
            </button>' : '') . '
        </div>';
    include SGI_ROOT . '/resources/views/components/page-header.php';
    unset($headerMostrarVoltar, $headerCorpoHtml, $headerAcoesHtml, $headerClasse, $headerUrlVoltar, $headerIdVoltar, $headerClassBotao, $headerHiddenBotao);
    ?>

    <div id="listaTurmasDesktop"></div>
</main>

<div class="modal fade" id="exampleModal" tabindex="-1" aria-labelledby="exampleModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
            <div class="modal-header border border-0">
                <h2 class="modal-title fs-5 text-danger" id="exampleModalLabel">Criar nova Turma</h2>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar janela Criar nova turma"></button>
            </div>
            <div class="modal-body">
                <form id="formNovaTurma">
                    <div class="mb-3">
                        <label for="nomeTurma" class="form-label">Nome da turma:</label>
                        <input type="text" class="form-control" id="nomeTurma" placeholder="Turma A" required>
                    </div>
                    <div class="mb-3">
                        <label for="nomeFantasia" class="form-label">Nome fantasia:</label>
                        <input type="text" class="form-control" id="nomeFantasia" placeholder="Ex: Lobos">
                    </div>
                    <div class="mb-3">
                        <label for="turnoTurma" class="form-label">Turno:</label>
                        <select class="form-select" id="turnoTurma">
                            <option value="">Selecione...</option>
                            <option value="Manhã">Manhã</option>
                            <option value="Tarde">Tarde</option>
                            <option value="Noite">Noite</option>
                        </select>
                    </div>
                    <div class="mb-3">
                        <label for="categoriaTurma" class="form-label">Categoria:</label>
                        <select class="form-select" id="categoriaTurma" required>
                            <option value="">Carregando...</option>
                        </select>
                    </div>
                    <div class="mb-3 d-flex align-items-center gap-2 flex-column">
                        <input type="file" id="arquivoUpload" class="d-none" accept=".pdf" onchange="mostrarNomeArquivo()">
                        <p class="small">Adicione aqui o PDF dos estudantes da turma criada</p>

                        <label for="arquivoUpload" class="btn btn-outline-primary">
                            <i class="bi bi-upload" aria-hidden="true"></i> Selecionar PDF dos estudantes
                        </label>

                        <span id="nomeArquivo" class="text-muted"></span>
                    </div>
                    <div class=" d-flex justify-content-center gap-4">
                        <button type="button" class="btn btn-outline-danger" data-bs-dismiss="modal">Cancelar</button>
                        <button type="submit" class="btn btn-primary">Criar</button>
                    </div>
                </form>
            </div>
            <div class="modal-footer border border-0"></div>
        </div>
    </div>
</div>

<div class="modal fade" id="modalEditarTurma" tabindex="-1" aria-labelledby="modalEditarTurmaTitulo" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
            <div class="modal-header border-0">
                <h5 class="modal-title text-danger fw-bold" id="modalEditarTurmaTitulo">Editar turma</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar janela Editar turma"></button>
            </div>
            <div class="modal-body">
                <form id="formEditarTurma">
                    <div class="mb-3">
                        <label for="editNomeTurma" class="form-label">Nome da turma:</label>
                        <input type="text" class="form-control" id="editNomeTurma" required>
                    </div>
                    <div class="mb-3">
                        <label for="editNomeFantasia" class="form-label">Nome fantasia:</label>
                        <input type="text" class="form-control" id="editNomeFantasia" placeholder="Ex: Lobos">
                    </div>
                    <div class="mb-3">
                        <label for="editTurnoTurma" class="form-label">Turno:</label>
                        <select class="form-select" id="editTurnoTurma">
                            <option value="">Selecione...</option>
                            <option value="Manhã">Manhã</option>
                            <option value="Tarde">Tarde</option>
                            <option value="Noite">Noite</option>
                        </select>
                    </div>
                    <div class="mb-3">
                        <label for="editCategoriaTurma" class="form-label">Categoria:</label>
                        <select class="form-select" id="editCategoriaTurma" required>
                            <option value="">Carregando...</option>
                        </select>
                    </div>
                    <div id="msgEditarTurma" class="mt-2"></div>
                    <div class="d-flex justify-content-center gap-4 mt-4">
                        <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button type="submit" class="btn btn-primary" id="btnSalvarEdicaoTurma">Salvar Alterações</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</div>

<!-- Modal de Exclusão -->
<div class="modal fade" id="modalExcluirTurma" tabindex="-1" aria-labelledby="modalExcluirTurmaTitulo" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-sm">
        <div class="modal-content rounded-4" >
            <div class="modal-body text-center py-4">
                <div class="rounded-circle bg-danger-subtle text-danger d-inline-flex align-items-center justify-content-center p-3 fs-3 mb-2">
                    <i class="bi bi-exclamation-triangle" aria-hidden="true"></i>
                </div>
                <h5 class="fw-bold mb-1" id="modalExcluirTurmaTitulo">Excluir turma</h5>
                <p class="text-muted small mb-3">
                    Tem certeza que deseja excluir <strong class="text-danger" id="excluirTurmaNome"></strong>?
                    <br>Esta ação não pode ser desfeita.
                </p>
                <div class="d-flex justify-content-center gap-3">
                    <button type="button" class="btn btn-outline-secondary px-4" data-bs-dismiss="modal">Cancelar</button>
                    <button type="button" class="btn btn-danger px-4" id="btnConfirmarExclusao">Sim, excluir</button>
                </div>
            </div>
        </div>
    </div>
</div>

<script type="application/json" data-sgi-config="participantes/turmas"><?= json_encode(['value2' => ($nivelUsuario)], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR) ?></script>
<script data-sgi-page src="<?= \App\Shared\Http\Assets::url('js/pages/participantes/turmas.js') ?>"></script>

<?php
include SGI_ROOT . '/resources/views/components/admin-nav.php';
require_once SGI_ROOT . '/resources/views/components/footer.php';
?>
