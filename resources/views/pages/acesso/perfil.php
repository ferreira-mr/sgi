<?php
$titulo = 'Perfil';
$mostrarVoltar = true;
$urlVoltar = \App\Shared\Http\Url::to('painel');
$idVoltarMobile = 'perfilBackMob';

$nivelUsuario = (int) ($usuarioPerfil['nivel_usuario'] ?? $_SESSION['nivel'] ?? 0);
$labelNiveis = [
    0 => ['label' => 'Administrador', 'icon' => 'bi-shield-fill-check', 'color' => '#E30613'],
    1 => ['label' => 'Colaborador',   'icon' => 'bi-person-badge-fill', 'color' => '#0d6efd'],
    2 => ['label' => 'Mesário',       'icon' => 'bi-person-check-fill', 'color' => '#6f42c1'],
    3 => ['label' => 'Estudante',     'icon' => 'bi-person-fill',       'color' => '#198754'],
];
$nivelInfo = $labelNiveis[$nivelUsuario] ?? ['label' => 'Desconhecido', 'icon' => 'bi-question-circle', 'color' => '#6c757d'];
$nivelBadgeClass = [0 => 'text-bg-danger', 1 => 'text-bg-primary', 2 => 'text-bg-secondary', 3 => 'text-bg-success'][$nivelUsuario] ?? 'text-bg-secondary';
include SGI_ROOT . '/resources/views/components/admin-head.php';
include SGI_ROOT . '/resources/views/components/admin-header.php';
$paginaAtiva = 'perfil';
?>


<!-- ===================== MOBILE ===================== -->
<main class="d-md-none sgi-perfil-mobile sgi-u-min-width-0 p-3 pt-5 pb-5">
    <h5 class="fw-bold mb-4">Configurações da Conta</h5>

    <div class="card border-0 shadow-sm rounded-4 mb-3">
        <div class="card-body text-center py-4">
            <div class="perfil-avatar-ring position-relative flex-shrink-0 mx-auto p-1 rounded-circle bg-primary shadow" id="fotoCircleMob">
                <div class="position-relative w-100 h-100 rounded-circle overflow-hidden d-flex align-items-center justify-content-center bg-body-secondary">
                    <img id="fotoImgMob" class="w-100 h-100 object-fit-cover d-none" alt="Foto do perfil">
                    <i class="bi bi-person-fill fs-1 text-secondary d-none" id="fotoIconMob"></i>
                    <div class="placeholder-glow position-absolute top-0 start-0 w-100 h-100 rounded-circle z-1" id="fotoSkeletonMob" aria-hidden="true">
                        <span class="placeholder rounded-circle w-100 h-100"></span>
                    </div>
                </div>
                <button type="button" class="btn btn-primary rounded-circle border border-2 border-white shadow position-absolute bottom-0 end-0 z-3 d-inline-flex align-items-center justify-content-center p-2" id="btnCameraMob" title="Alterar foto" aria-label="Alterar foto do perfil">
                    <i class="bi bi-camera-fill fs-6" aria-hidden="true"></i>
                </button>
            </div>
            <h5 class="fw-bold mt-3 mb-1" id="perfilNomeMob"><?= htmlspecialchars($usuarioPerfil['nome_usuario'] ?? '', ENT_QUOTES) ?></h5>
            <span class="badge rounded-pill <?= $nivelBadgeClass ?>">
                <i class="<?= $nivelInfo['icon'] ?>"></i> <?= $nivelInfo['label'] ?>
            </span>
            <div class="d-flex justify-content-center gap-2 mt-3">
                <button type="button" class="btn btn-sm btn-primary rounded-pill d-none px-3" id="btnSalvarFotoMob"><i class="bi bi-check-lg me-1"></i>Salvar</button>
                <button type="button" class="btn btn-sm btn-outline-danger rounded-pill perfil-btn-excluir" id="btnExcluirFotoMob" disabled><i class="bi bi-trash me-1"></i>Remover</button>
            </div>
            <p class="small text-body-secondary mt-2 mb-0">JPG, PNG, GIF ou WebP; até 5 MB.</p>
        </div>
    </div>

    <div class="card border-0 shadow-sm rounded-4 mb-3">
        <div class="card-body">
            <h6 class="d-flex align-items-center gap-2 border-bottom pb-3 mb-3 text-uppercase small fw-bold text-body-secondary"><i class="bi bi-person-vcard"></i>Informações Pessoais</h6>
            <div class="row align-items-baseline g-2 py-2 border-bottom"><span class="col-4 d-flex align-items-center gap-2 text-uppercase small fw-semibold text-body-secondary"><i class="bi bi-person-badge"></i> Matrícula</span><span class="col d-flex align-items-center flex-wrap gap-1" id="perfilMatriculaMob"><?= htmlspecialchars($usuarioPerfil['matricula_usuario'] ?? '', ENT_QUOTES) ?></span></div>
            <div class="row align-items-baseline g-2 py-2 border-bottom"><span class="col-4 d-flex align-items-center gap-2 text-uppercase small fw-semibold text-body-secondary"><i class="bi bi-briefcase"></i> Cargo</span><span class="col d-flex align-items-center flex-wrap gap-1"><?= $nivelInfo['label'] ?></span></div>
        </div>
    </div>

    <div class="card border-0 shadow-sm rounded-4 mb-3">
        <div class="card-body">
            <h6 class="d-flex align-items-center gap-2 border-bottom pb-3 mb-3 text-uppercase small fw-bold text-body-secondary"><i class="bi bi-shield-lock"></i>Segurança e Acesso</h6>
            <div class="row align-items-baseline g-2 py-2 border-bottom"><span class="col-4 d-flex align-items-center gap-2 text-uppercase small fw-semibold text-body-secondary"><i class="bi bi-lock"></i> Senha</span><span class="col d-flex align-items-center flex-wrap gap-1"><span class="font-monospace text-body-secondary">&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;</span></span></div>
            <div class="row align-items-baseline g-2 py-2 border-bottom"><span class="col-4 d-flex align-items-center gap-2 text-uppercase small fw-semibold text-body-secondary"><i class="bi bi-shield-check"></i> Nível</span><span class="col d-flex align-items-center flex-wrap gap-1"><span class="badge rounded-pill <?= $nivelBadgeClass ?>"><i class="<?= $nivelInfo['icon'] ?>"></i> <?= $nivelInfo['label'] ?></span></span></div>
            <div class="row align-items-baseline g-2 py-2"><span class="col-4 d-flex align-items-center gap-2 text-uppercase small fw-semibold text-body-secondary"><i class="bi bi-key"></i> Alterar</span><span class="col d-flex align-items-center flex-wrap gap-1"><button class="btn btn-link btn-sm text-decoration-none p-0 text-danger fw-semibold" data-bs-toggle="modal" data-bs-target="#modalAlterarSenha">Alterar senha</button></span></div>
        </div>
    </div>

    <button type="button" class="btn btn-primary w-100 rounded-pill py-2 fw-semibold" data-bs-toggle="modal" data-bs-target="#modalEditarPerfil">
        <i class="bi bi-pencil-square me-2"></i>Editar perfil
    </button>
</main>


<!-- ===================== DESKTOP ===================== -->
<main class="main-desktop-layout sgi-perfil-desktop d-none d-md-block p-4 p-lg-5">
    <div class="container-fluid px-0">
        <?php
        $headerIdVoltar = 'perfilBackDesk';
        $headerCorpoHtml = '<h1 class="fs-4 fw-bold mb-0"><i class="bi bi-person-circle me-2 text-primary"></i>Meu Perfil</h1>
        <p class="small text-body-secondary mb-0">Gerencie suas informações, segurança e acompanhe sua participação</p>';
        include SGI_ROOT . '/resources/views/components/page-header.php';
        unset($headerMostrarVoltar, $headerCorpoHtml, $headerAcoesHtml, $headerClasse, $headerUrlVoltar, $headerIdVoltar, $headerClassBotao, $headerHiddenBotao);
        ?>

        <!-- Grid: 30% + 70% -->
        <div class="row g-4 align-items-start">
            <!-- === COLUNA ESQUERDA: Identidade Visual === -->
            <aside class="col-12 col-lg-3">
                <div class="card border-0 shadow-sm rounded-4 position-sticky top-0">
                    <div class="card-body text-center py-5 px-4 d-flex flex-column align-items-center">
                        <div class="perfil-avatar-ring position-relative flex-shrink-0 mx-auto p-1 rounded-circle bg-primary shadow" id="fotoCircleDesk">
                            <div class="position-relative w-100 h-100 rounded-circle overflow-hidden d-flex align-items-center justify-content-center bg-body-secondary">
                            <img id="fotoImgDesk" class="w-100 h-100 object-fit-cover d-none" alt="Foto do perfil">
                            <i class="bi bi-person-fill fs-1 text-secondary d-none" id="fotoIconDesk"></i>
                                <div class="placeholder-glow position-absolute top-0 start-0 w-100 h-100 rounded-circle z-1" id="fotoSkeletonDesk" aria-hidden="true">
                                    <span class="placeholder rounded-circle w-100 h-100"></span>
                                </div>
                            </div>
                            <button type="button" class="btn btn-primary rounded-circle border border-2 border-white shadow position-absolute bottom-0 end-0 z-3 d-inline-flex align-items-center justify-content-center p-2" id="btnCameraDesk" title="Alterar foto" aria-label="Alterar foto do perfil">
                                <i class="bi bi-camera-fill fs-6" aria-hidden="true"></i>
                            </button>
                        </div>

                        <h5 class="fw-bold mt-3 mb-1" id="perfilNomeDesk"><?= htmlspecialchars($usuarioPerfil['nome_usuario'] ?? '', ENT_QUOTES) ?></h5>
                        <span class="badge rounded-pill <?= $nivelBadgeClass ?>">
                            <i class="<?= $nivelInfo['icon'] ?>"></i> <?= $nivelInfo['label'] ?>
                        </span>

                        <div class="d-flex justify-content-center gap-2 mt-4">
                            <button type="button" class="btn btn-sm btn-primary rounded-pill d-none px-3" id="btnSalvarFotoDesk"><i class="bi bi-check-lg me-1"></i>Salvar</button>
                            <button type="button" class="btn btn-sm btn-outline-danger rounded-pill perfil-btn-excluir" id="btnExcluirFotoDesk" disabled><i class="bi bi-trash me-1"></i>Remover</button>
                        </div>
                        <p class="small text-body-secondary mt-2 mb-0">JPG, PNG, GIF ou WebP; até 5 MB.</p>
                    </div>
                </div>
            </aside>

            <!-- === COLUNA DIREITA: Cards Funcionais === -->
            <div class="col-12 col-lg-9 d-flex flex-column gap-3">

                <!-- Card 1: Informações Pessoais -->
                <div class="card border-0 shadow-sm rounded-4">
                    <div class="card-body p-4">
                        <h6 class="d-flex align-items-center gap-2 border-bottom pb-3 mb-3 text-uppercase small fw-bold text-body-secondary"><i class="bi bi-person-vcard"></i>Informações Pessoais</h6>
                        <div class="row row-cols-1 row-cols-lg-2 g-3">
                            <div class="border-bottom pb-2">
                                <span class="d-flex align-items-center gap-2 small fw-semibold text-uppercase text-body-secondary mb-1"><i class="bi bi-person"></i> Nome Completo</span>
                                <span class="d-flex align-items-center flex-wrap gap-1" id="perfilNomeInfo"><?= htmlspecialchars($usuarioPerfil['nome_usuario'] ?? '', ENT_QUOTES) ?></span>
                            </div>
                            <div class="border-bottom pb-2">
                                <span class="d-flex align-items-center gap-2 small fw-semibold text-uppercase text-body-secondary mb-1"><i class="bi bi-briefcase"></i> Cargo / Função</span>
                                <span class="d-flex align-items-center flex-wrap gap-1"><?= $nivelInfo['label'] ?></span>
                            </div>
                            <div class="border-bottom pb-2">
                                <span class="d-flex align-items-center gap-2 small fw-semibold text-uppercase text-body-secondary mb-1"><i class="bi bi-person-badge"></i> Matrícula</span>
                                <span class="d-flex align-items-center flex-wrap gap-1" id="perfilMatriculaDesk"><?= htmlspecialchars($usuarioPerfil['matricula_usuario'] ?? '', ENT_QUOTES) ?></span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Card 2: Segurança e Acesso -->
                <div class="card border-0 shadow-sm rounded-4">
                    <div class="card-body p-4">
                        <h6 class="d-flex align-items-center gap-2 border-bottom pb-3 mb-3 text-uppercase small fw-bold text-body-secondary"><i class="bi bi-shield-lock"></i>Segurança e Acesso</h6>
                        <div class="d-flex flex-column gap-3">
                            <div class="border-bottom pb-2">
                                <span class="d-flex align-items-center gap-2 small fw-semibold text-uppercase text-body-secondary mb-1"><i class="bi bi-lock"></i> Senha</span>
                                <span class="d-flex align-items-center flex-wrap gap-1">
                                    <span class="font-monospace text-body-secondary">&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;</span>
                                    <button class="btn btn-link btn-sm text-decoration-none p-0 ms-2 text-danger fw-semibold" data-bs-toggle="modal" data-bs-target="#modalAlterarSenha">Alterar senha</button>
                                </span>
                            </div>
                            <div class="border-bottom pb-2">
                                <span class="d-flex align-items-center gap-2 small fw-semibold text-uppercase text-body-secondary mb-1"><i class="bi bi-shield-check"></i> Nível de Acesso</span>
                                <span class="d-flex align-items-center flex-wrap gap-1">
                                    <span class="badge rounded-pill <?= $nivelBadgeClass ?>">
                                        <i class="<?= $nivelInfo['icon'] ?>"></i> <?= $nivelInfo['label'] ?>
                                    </span>
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Barra de ações -->
                <div class="d-flex justify-content-end">
                    <button type="button" class="btn btn-primary d-inline-flex align-items-center gap-2 px-4" data-bs-toggle="modal" data-bs-target="#modalEditarPerfil">
                        <i class="bi bi-pencil-square me-2"></i>Editar perfil
                    </button>
                </div>
            </div>
        </div>
    </div>
</main>

<div class="modal fade" id="modalEditarPerfil" tabindex="-1" aria-labelledby="tituloEditarPerfil" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-sm">
        <div class="modal-content rounded-4 border-0 shadow">
            <div class="modal-header border-0 pt-4 px-4 pb-0">
                <h5 class="modal-title fw-bold fs-6" id="tituloEditarPerfil"><i class="bi bi-pencil-square text-danger me-2" aria-hidden="true"></i>Editar Perfil</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <form id="formEditarPerfil">
                <div class="modal-body px-4">
                    <div class="mb-3">
                        <label for="editarNome" class="form-label small text-muted fw-semibold"><i class="bi bi-person me-1"></i>Nome</label>
                        <input type="text" name="nome_usuario" class="form-control rounded-3" id="editarNome" required>
                    </div>
                    <div id="msgEditarPerfil" class="small text-center mt-2"></div>
                </div>
                <div class="modal-footer border-0 pb-4 px-4 pt-0">
                    <button type="button" class="btn btn-outline-secondary rounded-3" data-bs-dismiss="modal">Cancelar</button>
                    <button type="submit" class="btn btn-primary rounded-3 px-4" id="btnSalvarPerfil"><i class="bi bi-check-lg me-1"></i>Salvar</button>
                </div>
            </form>
        </div>
    </div>
</div>

<div class="modal fade" id="modalAlterarSenha" tabindex="-1" aria-labelledby="tituloAlterarSenha" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-sm">
        <div class="modal-content rounded-4 border-0 shadow">
            <div class="modal-header border-0 pt-4 px-4 pb-0">
                <h5 class="modal-title fw-bold fs-6" id="tituloAlterarSenha"><i class="bi bi-shield-lock text-danger me-2" aria-hidden="true"></i>Alterar Senha</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <form id="formAlterarSenha">
                <div class="modal-body px-4">
                    <div class="mb-3">
                        <label for="editarSenhaAtual" class="form-label small text-muted fw-semibold">Senha Atual</label>
                        <div class="input-group">
                            <input type="password" name="senha_atual" class="form-control rounded-start-3" id="editarSenhaAtual" required autocomplete="current-password">
                            <button type="button" class="perfil-password-eye btn btn-outline-secondary" data-target="editarSenhaAtual" aria-controls="editarSenhaAtual" aria-label="Mostrar senha" aria-pressed="false"><i class="bi bi-eye-slash" aria-hidden="true"></i></button>
                        </div>
                    </div>
                    <div class="mb-3">
                        <label for="editarNovaSenha" class="form-label small text-muted fw-semibold">Nova Senha</label>
                        <div class="input-group">
                            <input type="password" name="nova_senha" class="form-control rounded-start-3" id="editarNovaSenha" required minlength="6" autocomplete="new-password">
                            <button type="button" class="perfil-password-eye btn btn-outline-secondary" data-target="editarNovaSenha" aria-controls="editarNovaSenha" aria-label="Mostrar senha" aria-pressed="false"><i class="bi bi-eye-slash" aria-hidden="true"></i></button>
                        </div>
                    </div>
                    <div class="mb-3">
                        <label for="editarConfirmarSenha" class="form-label small text-muted fw-semibold">Confirmar Nova Senha</label>
                        <div class="input-group">
                            <input type="password" name="confirmar_senha" class="form-control rounded-start-3" id="editarConfirmarSenha" required autocomplete="new-password">
                            <button type="button" class="perfil-password-eye btn btn-outline-secondary" data-target="editarConfirmarSenha" aria-controls="editarConfirmarSenha" aria-label="Mostrar senha" aria-pressed="false"><i class="bi bi-eye-slash" aria-hidden="true"></i></button>
                        </div>
                    </div>
                    <div id="msgAlterarSenha" class="small text-center mt-2"></div>
                </div>
                <div class="modal-footer border-0 pb-4 px-4 pt-0">
                    <button type="button" class="btn btn-outline-secondary rounded-3" data-bs-dismiss="modal">Cancelar</button>
                    <button type="submit" class="btn btn-primary rounded-3 px-4" id="btnSalvarSenha"><i class="bi bi-check-lg me-1"></i>Salvar</button>
                </div>
            </form>
        </div>
    </div>
</div>

<input type="file" id="fotoUploadInput" accept="image/jpeg,image/png,image/gif,image/webp" class="d-none">

<script type="application/json" data-sgi-config="acesso/perfil"><?= json_encode(['value2' => ($usuarioPerfil['nome_usuario'] ?? ''), 'value3' => ($usuarioPerfil['matricula_usuario'] ?? ''), 'value4' => ($sessionId ?? 0), 'value5' => ((int)($nivelUsuario ?? 0))], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR) ?></script>
<script data-sgi-page src="<?= \App\Shared\Http\Assets::url('js/pages/acesso/perfil.js') ?>"></script>

<?php
include SGI_ROOT . '/resources/views/components/admin-nav.php';
require_once SGI_ROOT . '/resources/views/components/footer.php';
