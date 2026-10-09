<?php
$titulo = 'Modalidades';
$tagTituloCompacto = 'h1';
$mostrarVoltar = true;
$urlVoltar = \App\Shared\Http\Url::to('painel');
$nivelUsuario = (int)($_SESSION['nivel'] ?? -1);
include SGI_ROOT . '/resources/views/components/admin-head.php';
include SGI_ROOT . '/resources/views/components/admin-header.php';
$paginaAtiva = 'modalidades';
?>

<main class="position-relative d-md-none mb-5" >
    <section id="listaModalidadesMobile" class="d-flex flex-column align-items-center w-100 mt-4">
        <p class="text-muted small">(Carregando modalidades...)</p>
    </section>

    <section id="acoesModalidadesMobile" class="d-flex justify-content-end mt-4 mb-5">
        <button type="button" class="btn btn-primary rounded-circle d-flex align-items-center justify-content-center shadow p-3" data-bs-toggle="modal" data-bs-target="#modalCriarModalidade" aria-label="Adicionar modalidade">
            <i class="bi bi-plus-lg text-white fs-4" aria-hidden="true"></i>
        </button>
    </section>
</main>

<main class="d-none d-md-block main-desktop-layout">
    <?php
    $headerIdVoltar = 'btnVoltarModalidades';
    $headerCorpoHtml = '<h1 class="h3 fw-bold text-body mb-0">Modalidades</h1>';
    include SGI_ROOT . '/resources/views/components/page-header.php';
    unset($headerMostrarVoltar, $headerCorpoHtml, $headerAcoesHtml, $headerClasse, $headerUrlVoltar, $headerIdVoltar, $headerClassBotao, $headerHiddenBotao);
    ?>
    <div class="rounded-3">

        <div class="row g-4" id="listaModalidadesDesktop">
            <p class="text-muted">(Carregando modalidades...)</p>
        </div>
    </div>

    <div id="acoesModalidadesDesktop" class="d-flex flex-wrap justify-content-end align-items-center gap-3 py-3 mt-4" >
        <span class="text-muted small fw-medium">Não tem a modalidade que você quer?</span>

            <button type="button" class="btn bg-white fw-bold px-4 py-2 d-flex align-items-center justify-content-center gap-2 shadow-sm btn-outline-primary" data-bs-toggle="modal" data-bs-target="#modalCriarModalidade">
            <i class="bi bi-plus-circle" aria-hidden="true"></i> Adicionar
        </button>
    </div>
</main>

<div class="modal fade" id="modalCriarModalidade" tabindex="-1" aria-labelledby="modalCriarModalidadeLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
            <div class="modal-header border-0">
                <h2 class="modal-title fs-5 text-danger" id="modalCriarModalidadeLabel">Criar nova Modalidade</h2>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <div class="modal-body">
                <form id="formNovaModalidade">
                    <div class="mb-3">
                        <label for="inputNomeModalidade" class="form-label fw-medium">Nome da Modalidade:</label>
                        <input type="text" class="form-control" id="inputNomeModalidade" placeholder="Ex: Futsal" required>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-medium" for="inputGeneroModalidade">Gênero:</label>
                        <select class="form-select" id="inputGeneroModalidade" required>
                            <option value="" disabled selected>Selecione...</option>
                            <option value="MASC">Masculino (M)</option>
                            <option value="FEM">Feminino (F)</option>
                            <option value="MISTO">Misto</option>
                        </select>
                    </div>
                    <?php if ($nivelUsuario === 0): ?>
                    <div class="mb-3">
                        <label class="form-label fw-medium" for="inputMaxInscritos">Máx. de Inscritos (Opcional):</label>
                        <input type="number" class="form-control" placeholder="Ex: 12" id="inputMaxInscritos" min="0">
                    </div>
                    <?php endif; ?>
                    <div class="mb-3">
                        <label class="form-label fw-medium" for="inputTipoModalidade">Tipo de Modalidade:</label>
                        <select class="form-select" id="inputTipoModalidade" required>
                            <option value="" disabled selected>Carregando tipos...</option>
                        </select>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-medium" for="inputCategoriaModalidade">Categoria:</label>
                        <select class="form-select" id="inputCategoriaModalidade" required>
                            <option value="" disabled selected>Carregando categorias...</option>
                        </select>
                    </div>
                    <div id="caixaMensagemModalidade" class="mt-3"></div>
                    <div class="d-flex justify-content-center gap-4 mt-4">
                        <button type="button" class="btn btn-outline-danger" data-bs-dismiss="modal">Cancelar</button>
                        <button type="submit" class="btn btn-primary" id="btnSalvarModalidade">Criar</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</div>

<div class="modal fade" id="modalGerenciarPodio" tabindex="-1" aria-labelledby="modalGerenciarPodioLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 shadow rounded-4">
            <div class="modal-header border-0 pb-0">
                <h2 class="modal-title fs-5 fw-bold text-dark" id="modalGerenciarPodioLabel">
                    <i class="bi bi-award-fill text-warning me-2"></i>Pódio da Modalidade
                </h2>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <div class="modal-body">
                <p class="text-muted small mb-3" id="podioNomeModalidade">Selecione as equipes vencedoras para registrar o pódio e aplicar as pontuações às turmas correspondentes.</p>
                <form id="formGerenciarPodio">
                    <div class="mb-3">
                        <label for="selectPodio1" class="form-label fw-bold">🥇 1º Lugar (Campeão)</label>
                        <select class="form-select" id="selectPodio1">
                            <option value="">Selecione a equipe vencedora...</option>
                        </select>
                    </div>
                    <div class="mb-3">
                        <label for="selectPodio2" class="form-label fw-bold">🥈 2º Lugar (Vice-campeão)</label>
                        <select class="form-select" id="selectPodio2">
                            <option value="">Selecione a equipe vice-campeã...</option>
                        </select>
                    </div>
                    <div class="mb-3">
                        <label for="selectPodio3" class="form-label fw-bold">🥉 3º Lugar (3º colocado)</label>
                        <select class="form-select" id="selectPodio3">
                            <option value="">Selecione o 3º colocado...</option>
                        </select>
                    </div>
                    <div class="d-flex justify-content-end gap-2 mt-4">
                        <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>
                        <button type="submit" class="btn btn-primary fw-bold" id="btnSalvarPodio">Salvar Pódio</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</div>

<script type="application/json" data-sgi-config="competicoes/modalidades"><?= json_encode(['value2' => ($nivelUsuario)], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR) ?></script>
<script data-sgi-page src="<?= \App\Shared\Http\Assets::url('js/pages/competicoes/modalidades.js') ?>"></script>

<?php
include SGI_ROOT . '/resources/views/components/admin-nav.php';
require_once SGI_ROOT . '/resources/views/components/footer.php';
?>
