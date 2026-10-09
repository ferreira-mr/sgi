    <?php
    $titulo = 'Equipes';
    $mostrarVoltar = true;
    $urlVoltar = \App\Shared\Http\Url::to('painel');
    $idVoltarMobile = 'btnVoltarEquipesMobile';
    include SGI_ROOT . '/resources/views/components/admin-head.php';
    include SGI_ROOT . '/resources/views/components/admin-header.php';
    $nivelUsuario = (int)($_SESSION['nivel'] ?? -1);
    $isAdmin = $nivelUsuario === 0;
    $paginaAtiva = 'dashboard';
    ?>

    <main class="d-md-none p-3 pb-5" >
        <div id="filtroCategoriaMobile" class="d-flex flex-nowrap overflow-auto gap-2 pb-2 mb-3"></div>

        <?php if ($isAdmin): ?>
        <button id="btnCriarEquipeMob" class="btn btn-primary w-100 fw-semibold mb-3" data-bs-toggle="modal" data-bs-target="#modalCriarEquipe" aria-label="Criar equipe">
            <i class="bi bi-plus-lg" aria-hidden="true"></i>
        </button>
        <?php endif; ?>
        <div id="listaEquipesMobile" class="d-flex flex-column gap-3"></div>
    </main>

    <main class="d-none d-md-block main-desktop-layout">
        <div class="container-fluid py-4 px-4 text-body">
            <?php
            $headerIdVoltar = 'btnVoltarEquipesDesk';
            $titulo = 'Equipes';
            $subtitulo = 'Gerencie as equipes participantes do interclasse';
            $headerAcoesHtml = $isAdmin
                ? '<button id="btnCriarEquipeDesk" class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#modalCriarEquipe" aria-label="Criar equipe">
                    <i class="bi bi-plus-lg" aria-hidden="true"></i>
                </button>'
                : '';
            $headerClasse = 'pb-3 border-bottom border-2';
            include SGI_ROOT . '/resources/views/components/page-header.php';
            unset($headerIdVoltar, $subtitulo, $headerAcoesHtml, $headerClasse);
            ?>
            <span id="nomeInterclasseEquipes" class="visually-hidden"></span>

            <div id="filtroCategoria" class="d-flex flex-wrap gap-2 mb-4"></div>

            <div id="listaEquipesDesktop">
                <div class="text-center py-4 text-body-secondary">Carregando...</div>
            </div>
        </div>
    </main>

    <div class="modal fade" id="modalCriarEquipe" tabindex="-1" aria-labelledby="modalCriarEquipeTitulo" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content border-0 shadow-lg rounded-4" >
                <div class="modal-header border-0 pt-3 px-4" >
                    <h5 class="modal-title text-primary fw-semibold" id="modalCriarEquipeTitulo"><i class="bi bi-plus-circle me-2" aria-hidden="true"></i>Criar nova equipe</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar janela Criar nova equipe"></button>
                </div>
                <div class="modal-body pt-3 px-4 pb-4" >
                    <form id="formCriarEquipe">
                        <label for="selectModalidadeEquipe" class="form-label small text-muted fw-semibold">Modalidade</label>
                        <select id="selectModalidadeEquipe" class="form-select mb-3 rounded-3"  required>
                            <option value="" selected disabled>Carregando modalidades...</option>
                        </select>
                        <label for="selectTurmaEquipe" class="form-label small text-muted fw-semibold">Turma</label>
                        <select id="selectTurmaEquipe" class="form-select mb-3 rounded-3"  required>
                            <option value="" selected disabled>Carregando turmas...</option>
                        </select>
                        <div id="msgCriarEquipe" class="text-center mb-2 small"></div>
                        <div class="d-flex justify-content-end gap-2 pt-2">
                            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
                            <button type="submit" class="btn btn-primary" id="btnSalvarEquipe" aria-label="Salvar equipe"><i class="bi bi-check-lg" aria-hidden="true"></i></button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    </div>

    <script type="application/json" data-sgi-config="eventos/configurar-equipes"><?= json_encode(['value2' => (bool) $isAdmin], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR) ?></script>
    <script data-sgi-page src="<?= \App\Shared\Http\Assets::url('js/pages/eventos/configurar-equipes.js') ?>"></script>

    <?php
    include SGI_ROOT . '/resources/views/components/admin-nav.php';
    require_once SGI_ROOT . '/resources/views/components/footer.php';
    ?>
