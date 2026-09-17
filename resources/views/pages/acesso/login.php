<?php
declare(strict_types=1);
require_once SGI_ROOT . '/bootstrap/autoload.php';
if (session_status() === PHP_SESSION_NONE) {
    \App\Shared\Http\SessionManager::start();
}
if ((int) ($_SESSION['nivel'] ?? -1) >= 0) {
    $destino = (int) $_SESSION['nivel'] === 3 ? 'aluno/inicio' : 'edicoes';
    header('Location: ' . \App\Shared\Http\Url::to($destino));
    exit;
}
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="theme-color" content="#0f172a">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <link rel="manifest" href="<?= \App\Shared\Http\Url::to('manifest.webmanifest') ?>">
    <link rel="icon" type="image/png" sizes="32x32" href="<?= \App\Shared\Http\Assets::url('images/favicon-32.png') ?>">
    <link rel="icon" type="image/png" sizes="16x16" href="<?= \App\Shared\Http\Assets::url('images/favicon-16.png') ?>">
    <link rel="apple-touch-icon" sizes="180x180" href="<?= \App\Shared\Http\Assets::url('images/apple-touch-icon.png') ?>">
    <link href="<?= \App\Shared\Http\Assets::url('css/bootstrap-theme.css') ?>" rel="stylesheet">
    <link rel="stylesheet" href="<?= \App\Shared\Http\Assets::url('vendor/bootstrap-icons/bootstrap-icons.min.css') ?>">
    <link rel="stylesheet" href="<?= \App\Shared\Http\Assets::url('css/login.css') ?>">
    <?php include SGI_ROOT . '/resources/views/components/page-title.php'; ?>
    <script type="text/javascript">window.SGI_BASE_PATH = <?= json_encode(\App\Shared\Http\Url::basePath(), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>; window.SGI_API_BASE = <?= json_encode(\App\Shared\Http\Url::to('api/v1/'), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;</script>
    <script src="<?= \App\Shared\Http\Assets::url('js/shared/html-utils.js') ?>"></script>
    <script src="<?= \App\Shared\Http\Assets::url('js/shared/page-runtime.js') ?>"></script>
    <?php if (\App\Shared\Config\Env::get('SGI_APP_ENV', '') === 'development'): ?>
        <script src="<?= \App\Shared\Http\Assets::url('js/dev/live-reload.js') ?>"></script>
    <?php endif; ?>
</head>
<body>
    <!-- VERSÃO MOBILE CENTRALIZADA -->
    <main class="d-md-none min-vh-100 d-flex flex-column align-items-center text-center login-mobile-layout">
        <div class="login-mobile-banner" role="img" aria-label="Imagem dos desenvolvedores">
        </div>
        <form id="form_mobile" class="w-100 login-mobile-form">
            <h1 class="login-mobile-title">Acesso ao sistema</h1>
            <div class="login-mobile-field">
                <label for="matricula_mobile" class="form-label login-field-label">Matrícula (RA/NIF)</label>
                <input id="matricula_mobile" name="matricula" type="text" class="form-control ipt-matricula" placeholder="Digite sua matrícula" autocomplete="username" required>
            </div>
            <div class="login-mobile-field">
                <label for="senha_mobile" class="form-label login-field-label">Senha</label>
                <input id="senha_mobile" name="senha" type="password" class="form-control ipt-senha" placeholder="Digite sua senha" autocomplete="current-password" required>
            </div>
            <button type="button" class="login-recovery-button login-mobile-recovery" aria-expanded="false" aria-controls="login_recovery_mobile">Como recuperar o acesso?</button>
            <div id="login_recovery_mobile" class="login-recovery-help text-start" hidden>
                Procure a organização responsável pelo Interclasses para solicitar a redefinição do acesso.
            </div>
            <button type="submit" class="btn btn-primary w-100 login-mobile-button">Entrar</button>
            <div id="msg_erro_mobile" class="text-danger mt-2" aria-live="polite"></div>
            <div class="login-mobile-brand">
                <img src="<?= \App\Shared\Http\Assets::url('images/logo-sgi-sesi.png') ?>" alt="Logo do SESI">
            </div>
        </form>
    </main>
    <!-- VERSÃO DESKTOP CENTRALIZADA -->
    <main class="d-none d-md-flex vh-100 login-desktop-layout">
        <div class="login-desktop-media position-relative d-block shadow-lg" role="img" aria-label="Imagem dos desenvolvedores">
        </div>
        <section class="login-desktop-panel h-100 d-flex flex-column justify-content-center align-items-center p-4">
            <picture class="mb-4">
                <img src="<?= \App\Shared\Http\Assets::url('images/logo-sgi-sesi.png') ?>" alt="Logo do sesi" class="img-fluid login-desktop-logo" >
            </picture>
            <form id="form_desktop" class="text-center d-flex flex-column align-items-center bg-light p-4 w-100 login-desktop-form">
                <h1 class="text-danger login-desktop-title">Acesso ao sistema</h1>
                <div class="position-relative mb-3 w-100 login-desktop-field">
                    <label for="matricula_desktop" class="form-label login-field-label">Matrícula (RA/NIF)</label>
                    <i class="bi bi-person-circle position-absolute top-50 start-0 translate-middle-y ms-3 text-dark" aria-hidden="true"></i>
                    <input id="matricula_desktop" name="matricula" type="text" class="form-control ps-5 py-2 ipt-matricula login-field" placeholder="Digite sua matrícula" autocomplete="username" required>
                </div>
                <div class="position-relative mb-3 w-100 login-desktop-field">
                    <label for="senha_desktop" class="form-label login-field-label">Senha</label>
                    <i class="bi bi-lock position-absolute top-50 start-0 translate-middle-y ms-3 text-dark" aria-hidden="true"></i>
                    <input id="senha_desktop" name="senha" type="password" class="form-control ps-5 py-2 ipt-senha login-field" placeholder="Digite sua senha" autocomplete="current-password" required>
                </div>
                <button type="button" class="login-recovery-button login-desktop-recovery" aria-expanded="false" aria-controls="login_recovery_desktop">Como recuperar o acesso?</button>
                <div id="login_recovery_desktop" class="login-recovery-help text-start w-100" hidden>
                    Procure a organização responsável pelo Interclasses para solicitar a redefinição do acesso.
                </div>
                <button type="submit" class="btn btn-primary w-100 mt-2 login-desktop-button">Entrar</button>
                <div id="msg_erro_desktop" class="text-danger mt-2" aria-live="polite"></div>
            </form>
        </section>
    </main>
    <script type="application/json" data-sgi-config="acesso/login"><?= json_encode([], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR) ?></script>
    <script data-sgi-page src="<?= \App\Shared\Http\Assets::url('js/pages/acesso/login.js') ?>"></script>
</body>
</html>
