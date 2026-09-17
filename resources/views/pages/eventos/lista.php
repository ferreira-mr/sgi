<?php
$titulo = 'Edições';
$tagTituloCompacto = 'h1';
$mostrarVoltar = false;
$nivelUsuario = (int)($_SESSION['nivel'] ?? -1);
include SGI_ROOT . '/resources/views/components/admin-head.php';
include SGI_ROOT . '/resources/views/components/admin-header.php';
$paginaAtiva = 'home';
$isAdmin = $nivelUsuario === 0;
$isColaborador = $nivelUsuario === 1;
$isMesario = $nivelUsuario === 2;
?>



<!-- main mobile -->
<main class="d-md-none <?= $isMesario ? '' : 'home-main--with-footer' ?>">
    <?php if ($isAdmin): ?>
    <button class="mx-4 btn btn-primary d-flex gap-2 mt-3 align-items-center" data-bs-toggle="modal" data-bs-target="#exampleModal">
        <i class="bi bi-plus-circle" aria-hidden="true"></i>Criar Nova Edição
    </button>
    <?php endif; ?>
    <?php if ($isColaborador): ?>
    <div class="p-3">
    </div>
    <?php endif; ?>
    <div id="caixaListar" class="pb-5 mb-2 mt-2">
        <p class="text-center text-muted mt-3"><?= $isMesario ? 'Redirecionando...' : 'Carregando...' ?></p>
    </div>
</main>

<!-- main desktop -->
<main class="d-none d-md-flex main-desktop-layout">
    <section class="mt-4">

        <h1 class="fw-bold mb-4">Edições</h1>

        <?php if ($isAdmin): ?>
        <button class="btn btn-outline-danger d-flex gap-2 mt-2 mb-4 align-items-center" data-bs-toggle="modal" data-bs-target="#exampleModal">
            <i class="bi bi-plus-circle" aria-hidden="true"></i>Criar Nova Edição
        </button>
        <?php endif; ?>

        <div>
            <div class="row mt-4 bg-light border border-1 rounded-3 text-secondary py-3 fs-6 fw-semibold text-uppercase px-2 shadow-sm">
                <div class="col-4">Edição interclasse</div>
                <div class="col-4 text-center">Ano</div>
                <div class="col-4 text-center">Status</div>
            </div>

            <div class="mt-2" id="listaDesktop">
                 <p class="text-center text-muted mt-5"><?= $isMesario ? 'Redirecionando...' : 'Carregando...' ?></p>
            </div>
        </div>

    </section>
</main>

<?php if ($isAdmin): ?>
<div class="modal fade" id="exampleModal" tabindex="-1" aria-labelledby="exampleModalLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
            <div class="modal-header border border-0">
                <h2 class="modal-title fs-5 text-danger" id="exampleModalLabel">Criar nova Edição</h2>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <div class="modal-body">
                <h2 class="fs-6">Insira o nome da sua nova edição:</h2>
                <form id="formulario">
                    <div>
                        <label for="nomeNovaEdicao" class="form-label">Nome da edição</label>
                        <input type="text" class="form-control" placeholder="Ex: interclasse 2026" id="nomeNovaEdicao" required>
                    </div>
                    <div class="mt-4">
                        <label for="anoNovaEdicao" class="form-label fs-6">Ano</label>
                        <input type="number" class="form-control" placeholder="Ex: 2026" id="anoNovaEdicao" value="2026" required>
                    </div>
                    <div id="caixaMensagem"></div>
                    <div class="d-flex justify-content-center gap-2 mt-5 pt-5">
                        <button type="button" class="btn btn-outline-danger" data-bs-dismiss="modal">Cancelar</button>
                        <button type="submit" class="btn btn-primary" id="btnCriar">Criar</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</div>
<?php endif; ?>

<script type="application/json" data-sgi-config="eventos/lista"><?= json_encode(['value0' => ($isMesario), 'value1' => (!$isMesario), 'value2' => ($isAdmin), 'value3' => ($isColaborador || $isMesario), 'value4' => (!$isAdmin && !$isMesario)], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR) ?></script>
<script data-sgi-page src="<?= \App\Shared\Http\Assets::url('js/pages/eventos/lista.js') ?>"></script>



<?php
include SGI_ROOT . '/resources/views/components/admin-nav.php';
require_once SGI_ROOT . '/resources/views/components/footer.php';
?>
