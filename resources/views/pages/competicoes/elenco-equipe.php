<?php
$titulo = 'Elenco da equipe';
$mostrarVoltar = true;
$urlVoltar = \App\Shared\Http\Url::to('edicoes/equipes');
$idVoltarMobile = 'btnVoltarElencoMob';
include SGI_ROOT . '/resources/views/components/admin-head.php';
include SGI_ROOT . '/resources/views/components/admin-header.php';
$nivelUsuario = (int)($_SESSION['nivel'] ?? -1);
$isAdmin = $nivelUsuario === 0;
$paginaAtiva = 'dashboard';
?>

<main class="d-md-none p-3 pb-5" >
    <p id="nomeModalidadeElencoMob" class="small fw-semibold text-body-secondary mb-2 d-none"></p>
    <div id="alertaLimiteMob" class="alert alert-danger d-none d-flex flex-wrap align-items-center gap-2 small"></div>
    <div id="listaElencoMob" class="d-flex flex-column gap-2"></div>
    <?php if ($isAdmin): ?>
    <a class="btn btn-outline-primary w-100 mt-4" id="linkGerenciarMob" href="#" aria-label="Gerenciar elenco">
        <i class="bi bi-person-plus" aria-hidden="true"></i>
    </a>
    <?php endif; ?>
</main>

<main class="d-none d-md-block main-desktop-layout">
    <div class="container-fluid py-4 px-4 text-body">
        <?php
        $contextoEquipe = array_filter([
            trim((string) ($_GET['nome_modalidade'] ?? '')),
            trim((string) ($_GET['nome_turma'] ?? '')),
        ], static fn (string $valor): bool => $valor !== '');
        $subtituloEquipe = implode(' <span aria-hidden="true">•</span> ', array_map(
            static fn (string $valor): string => htmlspecialchars($valor, ENT_QUOTES, 'UTF-8'),
            $contextoEquipe,
        ));
        $headerIdVoltar = 'btnVoltarElencoDesk';
        $headerClasse = 'd-flex align-items-start gap-3 mb-4';
        $headerClasseTitulo = 'd-block flex-grow-1';
        $headerCorpoHtml = '<div><h1 class="h4 mb-1 fw-bold">Elenco da equipe</h1>'
            . ($subtituloEquipe !== '' ? '<p class="mb-0 small text-body-secondary">' . $subtituloEquipe . '</p>' : '')
            . '<p id="nomeModalidadeElencoDesk" class="small fw-semibold text-body-secondary mb-0 mt-1 d-none"></p></div>';
        $headerAcoesHtml = $isAdmin ? '<div class="ms-auto">
                <a class="btn btn-outline-primary" id="linkGerenciarDesk" href="#" aria-label="Gerenciar elenco">
                    <i class="bi bi-person-plus" aria-hidden="true"></i>
                </a>
            </div>' : '';
        include SGI_ROOT . '/resources/views/components/page-header.php';
        unset($headerMostrarVoltar, $headerCorpoHtml, $headerAcoesHtml, $headerClasse, $headerClasseTitulo, $headerUrlVoltar, $headerIdVoltar, $headerClassBotao, $headerHiddenBotao, $contextoEquipe, $subtituloEquipe);
        ?>

        <div class="card border-0 shadow-sm rounded-4 overflow-hidden">
            <div id="alertaLimiteDesk" class="alert alert-danger d-none d-flex flex-wrap align-items-center gap-2 small mx-3 mt-3 mb-0"></div>
            <div class="table-responsive">
                <table class="table table-hover align-middle mb-0">
                    <thead>
                        <tr>
                            <th scope="col">Nome</th>
                            <th scope="col">RM / Matrícula</th>
                            <?php if ($isAdmin): ?>
                            <th scope="col" class="text-end">Ações</th>
                            <?php endif; ?>
                        </tr>
                    </thead>
                    <tbody id="tbodyElencoDesk"></tbody>
                </table>
            </div>
        </div>
    </div>
</main>

<script type="application/json" data-sgi-config="competicoes/elenco-equipe"><?= json_encode(['value1' => ($isAdmin)], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR) ?></script>
<script data-sgi-page src="<?= \App\Shared\Http\Assets::url('js/pages/competicoes/elenco-equipe.js') ?>"></script>

<?php
include SGI_ROOT . '/resources/views/components/admin-nav.php';
require_once SGI_ROOT . '/resources/views/components/footer.php';
?>
