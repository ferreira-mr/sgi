<?php
$titulo = 'Estudantes da turma';
$mostrarVoltar = true;
$urlVoltar = \App\Shared\Http\Url::to('painel');
$idVoltarMobile = 'btnVoltarTurmaAlunosMob';
include SGI_ROOT . '/resources/views/components/admin-head.php';
include SGI_ROOT . '/resources/views/components/admin-header.php';
$paginaAtiva = 'turmas';
$podeGerenciar = $nivelUsuario === 0;
$podeExcluir   = in_array($nivelUsuario, [0], true);
$podeResetarSenha = in_array($nivelUsuario, [0], true);
?>



<!-- main mobile -->
<main class="d-md-none bg-body-tertiary min-vh-100 p-3 pt-5 pb-5" >
    <div class="mb-3 mt-3">
        <p class="small text-body-secondary mb-0"><i class="bi bi-people-fill text-primary me-1" aria-hidden="true"></i><span id="nomeTurmaMob">…</span></p>
    </div>

    <div class="d-flex flex-wrap align-items-center gap-3 mb-4">
        <?php if ($podeGerenciar): ?>
        <button type="button" class="btn btn-outline-danger d-inline-flex align-items-center gap-2" data-sgi-action="open-add-student">
            <i class="bi bi-plus-lg" aria-hidden="true"></i> Adicionar estudante
        </button>
        <?php endif; ?>
        <div class="input-group flex-grow-1">
            <span class="input-group-text"><i class="bi bi-search" aria-hidden="true"></i></span>
            <label for="buscaAlunoMob" class="visually-hidden">Buscar estudante por nome ou RM</label>
            <input type="text" class="form-control" id="buscaAlunoMob" placeholder="Buscar estudante por nome ou RM..." autocomplete="off">
        </div>
    </div>

    <?php if ($nivelUsuario === 0): ?>
    <div class="card border shadow-sm overflow-hidden mb-4">
        <button class="btn w-100 d-flex align-items-center justify-content-between gap-3 p-3 text-start" id="botaoPdfMob" type="button" data-bs-toggle="collapse" data-bs-target="#blocoPdfMob" aria-expanded="false" aria-controls="blocoPdfMob">
            <span class="d-flex align-items-center gap-2 fw-semibold"><i class="bi bi-file-earmark-pdf-fill text-danger" aria-hidden="true"></i> Importar estudantes via PDF</span>
            <span class="d-flex align-items-center gap-2">
                <span class="badge rounded-pill bg-danger-subtle text-danger-emphasis">Administrador</span>
                <i class="bi bi-chevron-down" data-pdf-chevron aria-hidden="true"></i>
            </span>
        </button>
        <div id="blocoPdfMob" class="collapse">
            <div class="card-body p-3 pt-0">
                <p class="alert alert-warning d-flex align-items-start gap-2 small mb-3">
                    <i class="bi bi-info-circle-fill" aria-hidden="true"></i>
                    <span>O PDF deve conter <strong>texto selecionável</strong> (não imagem). Se for imagem, converta antes de importar.</span>
                </p>
                <form id="formPdfTurmaMob" enctype="multipart/form-data">
                    <div class="border rounded-3 p-4 text-center bg-body-tertiary" id="dropzoneMob" data-pdf-dropzone>
                        <i class="bi bi-cloud-arrow-up fs-1 text-danger" aria-hidden="true"></i>
                        <p class="small text-body-secondary mb-3 mt-2">Selecione um arquivo PDF ou arraste-o para esta área.</p>
                        <label for="pdfInputMob" class="form-label fw-semibold d-block text-start">Selecionar PDF com a lista de estudantes para esta turma</label>
                        <input type="file" class="form-control text-start" name="pdf" id="pdfInputMob" accept="application/pdf" aria-describedby="descricaoPdfMob pdfNomeMob" required>
                        <span class="small text-body-secondary mt-2 d-block" id="descricaoPdfMob">Formato aceito: PDF de até 10 MB. O arquivo deve conter texto selecionável.</span>
                        <span class="d-none small fw-semibold text-success mt-2" id="pdfNomeMob" role="status" aria-live="polite" aria-atomic="true"></span>
                    </div>
                    <div class="d-none mt-3" id="progressMob">
                        <div class="progress" role="progressbar" aria-label="Progresso do upload" aria-valuemin="0" aria-valuemax="100">
                            <div class="progress-bar" id="progressBarMob"></div>
                        </div>
                        <span class="small text-body-secondary mt-1 d-block" id="progressTextoMob">Enviando…</span>
                    </div>
                    <div id="msgPdfMob" class="small mt-2 text-center" role="status" aria-live="polite" aria-atomic="true"></div>
                    <div id="fallbackMob" class="d-none mt-2 text-center">
                        <p class="small text-muted mb-2">O PDF parece ser uma imagem. Converta para PDF selecionável:</p>
                        <a href="https://www.ilovepdf.com/pt/ocr-pdf" target="_blank" rel="noopener" class="btn btn-outline-danger btn-sm rounded-3">
                            <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i> Converter PDF (iLovePDF)
                        </a>
                    </div>
                    <div class="d-grid mt-3">
                        <button type="submit" class="btn btn-primary d-inline-flex align-items-center gap-2">
                            <i class="bi bi-file-earmark-arrow-up" aria-hidden="true"></i> Importar PDF
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>
    <?php endif; ?>

    <div id="listaAlunosTurmaMob" class="d-flex flex-column gap-2"></div>

    <div class="d-flex align-items-center justify-content-between flex-wrap gap-3 pt-3">
        <span id="taInfoPaginaMob"></span>
        <nav aria-label="Paginação">
            <ul class="pagination pagination-sm mb-0" id="paginacaoMob"></ul>
        </nav>
    </div>
</main>

<!-- main desktop -->
<main class="d-none d-md-block main-desktop-layout">
    <div class="container-fluid px-0">

        <?php
        $headerIdVoltar = 'btnVoltarTurmaAlunosDesk';
        $headerCorpoHtml = '<h1 class="h3 fw-bold text-body mb-1">Estudantes da turma: <span id="nomeTurmaDesk">…</span></h1>
            <p class="small text-body-secondary mb-0"><i class="bi bi-people-fill text-primary me-1" aria-hidden="true"></i> Gerencie os estudantes vinculados a esta turma</p>';
        include SGI_ROOT . '/resources/views/components/page-header.php';
        unset($headerMostrarVoltar, $headerCorpoHtml, $headerAcoesHtml, $headerClasse, $headerUrlVoltar, $headerIdVoltar, $headerClassBotao, $headerHiddenBotao);
        ?>

        <div class="d-flex flex-wrap align-items-center gap-3 mb-4">
            <?php if ($podeGerenciar): ?>
            <button type="button" class="btn btn-outline-danger d-inline-flex align-items-center gap-2" data-sgi-action="open-add-student">
            <i class="bi bi-plus-lg" aria-hidden="true"></i> Adicionar estudante
            </button>
            <?php endif; ?>
            <div class="input-group flex-grow-1">
                <span class="input-group-text"><i class="bi bi-search" aria-hidden="true"></i></span>
                <label for="buscaAlunoDesk" class="visually-hidden">Buscar estudante por nome ou RM</label>
                <input type="text" class="form-control" id="buscaAlunoDesk" placeholder="Buscar estudante por nome ou RM..." autocomplete="off">
            </div>
            <span class="badge rounded-pill text-bg-light border text-body-secondary" id="contadorAlunosDesk"></span>
        </div>

        <?php if ($nivelUsuario === 0): ?>
        <div class="card border shadow-sm overflow-hidden mb-4">
            <button class="btn w-100 d-flex align-items-center justify-content-between gap-3 p-3 text-start" id="botaoPdfDesk" type="button" data-bs-toggle="collapse" data-bs-target="#blocoPdfDesk" aria-expanded="false" aria-controls="blocoPdfDesk">
                <span class="d-flex align-items-center gap-2 fw-semibold"><i class="bi bi-file-earmark-pdf-fill text-danger" aria-hidden="true"></i> Importar estudantes via PDF</span>
                <span class="d-flex align-items-center gap-2">
                    <span class="badge rounded-pill bg-danger-subtle text-danger-emphasis">Administrador</span>
                    <i class="bi bi-chevron-down" data-pdf-chevron aria-hidden="true"></i>
                </span>
            </button>
            <div id="blocoPdfDesk" class="collapse">
                <div class="card-body p-3 pt-0">
                    <p class="alert alert-warning d-flex align-items-start gap-2 small mb-3">
                        <i class="bi bi-info-circle-fill" aria-hidden="true"></i>
                        <span>O PDF deve conter <strong>texto selecionável</strong> (não imagem). Os estudantes serão vinculados automaticamente a esta turma.</span>
                    </p>
                    <form id="formPdfTurmaDesk" enctype="multipart/form-data">
                        <div class="border rounded-3 p-4 text-center bg-body-tertiary" id="dropzoneDesk" data-pdf-dropzone>
                            <i class="bi bi-cloud-arrow-up fs-1 text-danger" aria-hidden="true"></i>
                            <p class="small text-body-secondary mb-3 mt-2">Selecione um arquivo PDF ou arraste-o para esta área.</p>
                            <label for="pdfInputDesk" class="form-label fw-semibold d-block text-start">Selecionar PDF com a lista de estudantes para esta turma</label>
                            <input type="file" class="form-control text-start" name="pdf" id="pdfInputDesk" accept="application/pdf" aria-describedby="descricaoPdfDesk pdfNomeDesk" required>
                            <span class="small text-body-secondary mt-2 d-block" id="descricaoPdfDesk">Formato aceito: PDF de até 10 MB. O arquivo deve conter texto selecionável.</span>
                            <span class="d-none small fw-semibold text-success mt-2" id="pdfNomeDesk" role="status" aria-live="polite" aria-atomic="true"></span>
                        </div>
                        <div class="d-none mt-3" id="progressDesk">
                            <div class="progress" role="progressbar" aria-label="Progresso do upload" aria-valuemin="0" aria-valuemax="100">
                                <div class="progress-bar" id="progressBarDesk"></div>
                            </div>
                            <span class="small text-body-secondary mt-1 d-block" id="progressTextoDesk">Enviando…</span>
                        </div>
                        <div id="msgPdfDesk" class="small mt-2 text-center" role="status" aria-live="polite" aria-atomic="true"></div>
                        <div id="fallbackDesk" class="d-none mt-2 text-center">
                            <p class="small text-muted mb-2">O PDF parece ser uma imagem. Converta para PDF selecionável:</p>
                            <a href="https://www.ilovepdf.com/pt/ocr-pdf" target="_blank" rel="noopener" class="btn btn-outline-danger btn-sm rounded-3">
                                <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i> Converter PDF (iLovePDF)
                            </a>
                        </div>
                        <div class="d-flex justify-content-end mt-3">
                            <button type="submit" class="btn btn-primary d-inline-flex align-items-center gap-2">
                                <i class="bi bi-file-earmark-arrow-up" aria-hidden="true"></i> Importar PDF
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
        <?php endif; ?>

        <div class="card border shadow-sm overflow-hidden mt-4">
            <div class="card-header d-flex align-items-center justify-content-between gap-3">
                <span class="fw-semibold"><i class="bi bi-people-fill text-primary me-1" aria-hidden="true"></i> Estudantes cadastrados</span>
                <span class="badge rounded-pill text-bg-light border text-body-secondary" id="taTableCount"></span>
            </div>
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0">
                    <thead>
                        <tr>
                            <th>Nome</th>
                            <th>RM</th>
                            <th>Gênero</th>
                            <th class="text-center">Ações</th>
                        </tr>
                    </thead>
                    <tbody id="tbodyAlunosTurmaDesk"></tbody>
                </table>
            </div>
            <div class="d-flex align-items-center justify-content-between flex-wrap gap-3 p-3 border-top small text-body-secondary">
                <span id="taInfoPaginaDesk"></span>
                <nav aria-label="Paginação">
                    <ul class="pagination pagination-sm mb-0" id="paginacaoDesk"></ul>
                </nav>
            </div>
        </div>

    </div>
</main>

<!-- Modal visualizar estudante -->
<div class="modal fade" id="modalVerAluno" tabindex="-1" aria-labelledby="modalVerAlunoTitulo" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content rounded-4">
            <div class="modal-header border-0 pb-0">
                <h6 class="modal-title" id="modalVerAlunoTitulo">Detalhes do estudante</h6>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar janela Detalhes do estudante"></button>
            </div>
            <div class="modal-body">
                <div class="rounded-circle bg-danger-subtle text-danger-emphasis fw-bold fs-3 d-flex align-items-center justify-content-center mx-auto mb-3 p-3" id="verInicial">—</div>
                <h5 class="text-center mb-1" id="verNome">—</h5>
                <div class="text-center mb-3"><span class="badge rounded-pill text-bg-light border" id="verGenero">—</span></div>
                <div class="d-flex align-items-center justify-content-between gap-3 py-2 border-top"><span class="small text-body-secondary">RM</span><strong id="verRm">—</strong></div>
                <div class="d-flex align-items-center justify-content-between gap-3 py-2 border-top"><span class="small text-body-secondary">Data de nascimento</span><strong id="verDataNasc">—</strong></div>
            </div>
            <div class="modal-footer justify-content-center border-0 pt-0">
                <button type="button" class="btn btn-outline-secondary btn-sm rounded-3 px-4" data-bs-dismiss="modal">Fechar</button>
            </div>
        </div>
    </div>
</div>

<!-- Modal criar/editar estudante -->
<div class="modal fade" id="modalAluno" tabindex="-1" aria-labelledby="modalAlunoTitulo" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content rounded-4">
            <div class="modal-header">
                <h6 class="modal-title" id="modalAlunoTitulo">Adicionar estudante</h6>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar janela Estudante"></button>
            </div>
            <form id="formAluno" novalidate>
                <div class="modal-body">
                    <input type="hidden" id="alunoId" value="">
                    <div class="mb-3">
                        <label for="alunoNome" class="form-label small">Nome completo</label>
                        <input type="text" class="form-control rounded-3" id="alunoNome" required maxlength="45">
                    </div>
                    <div class="row g-2 mb-3">
                        <div class="col-md-6">
                            <label for="alunoRm" class="form-label small">RM</label>
                            <input type="text" class="form-control rounded-3" id="alunoRm" required maxlength="45">
                        </div>
                        <div class="col-md-6">
                            <label for="alunoGenero" class="form-label small">Gênero</label>
                            <select class="form-select rounded-3" id="alunoGenero">
                                <option value="MASC">Masculino</option>
                                <option value="FEM">Feminino</option>
                            </select>
                        </div>
                    </div>
                    <div class="mb-3">
                        <label for="alunoDataNasc" class="form-label small">Data de nascimento</label>
                        <input type="date" class="form-control rounded-3" id="alunoDataNasc" required>
                    </div>
                    <div id="msgAluno" class="small text-center"></div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary btn-sm rounded-3" data-bs-dismiss="modal">Cancelar</button>
                    <button type="submit" class="btn btn-primary btn-sm rounded-3" id="btnSalvarAluno">Salvar</button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- Modal confirmar exclusão -->
<div class="modal fade" id="modalConfirmarExcluir" tabindex="-1" aria-labelledby="modalConfirmarExcluirTitulo" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-sm">
        <div class="modal-content rounded-4">
            <div class="modal-body text-center py-4">
                <i class="bi bi-exclamation-triangle text-danger fs-1" aria-hidden="true"></i>
                <h5 class="mt-3 mb-1 fw-medium" id="modalConfirmarExcluirTitulo">Remover estudante?</h5>
                <p class="text-muted small" id="nomeAlunoExcluir"></p>
            </div>
            <div class="modal-footer justify-content-center border-0 pt-0">
                <button type="button" class="btn btn-secondary btn-sm rounded-3" data-bs-dismiss="modal">Cancelar</button>
                <button type="button" class="btn btn-danger btn-sm rounded-3" id="btnConfirmarExcluir">Excluir</button>
            </div>
        </div>
    </div>
</div>

<!-- Modal confirmar reset de senha -->
<div class="modal fade" id="modalResetarSenha" tabindex="-1" aria-labelledby="modalResetarSenhaTitulo" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-sm">
        <div class="modal-content rounded-4">
            <div class="modal-body text-center py-4">
                <i class="bi bi-key-fill text-warning fs-1" aria-hidden="true"></i>
                <h5 class="mt-3 mb-1 fw-medium" id="modalResetarSenhaTitulo">Resetar senha do estudante?</h5>
                <p class="text-muted small mb-1" id="nomeAlunoResetar"></p>
                <p class="text-muted small">A senha será redefinida para <strong>sesi-senai</strong>, e a troca será obrigatória no próximo acesso.</p>
            </div>
            <div class="modal-footer justify-content-center border-0 pt-0">
                <button type="button" class="btn btn-secondary btn-sm rounded-3" data-bs-dismiss="modal">Cancelar</button>
                <button type="button" class="btn btn-warning btn-sm rounded-3" id="btnConfirmarResetar">Resetar</button>
            </div>
        </div>
    </div>
</div>

<script type="application/json" data-sgi-config="participantes/turma-alunos"><?= json_encode(['value2' => (bool) $podeGerenciar, 'value3' => (bool) $podeExcluir, 'value4' => (bool) $podeResetarSenha], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR) ?></script>
<script data-sgi-page src="<?= \App\Shared\Http\Assets::url('js/pages/participantes/turma-alunos.js') ?>"></script>

<?php
include SGI_ROOT . '/resources/views/components/admin-nav.php';
require_once SGI_ROOT . '/resources/views/components/footer.php';
