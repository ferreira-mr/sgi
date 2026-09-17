<?php

if (session_status() === PHP_SESSION_NONE) {
    session_cache_limiter('private_no_expire');
    \App\Shared\Http\SessionManager::start();
}
require_once SGI_ROOT . '/bootstrap/autoload.php';
use App\Shared\Http\CsrfGuard;
$nivelUsuario = (int) ($_SESSION['nivel'] ?? -1);
if (!in_array($nivelUsuario, [0, 1, 2], true)) {
    header('Location: ' . \App\Shared\Http\Url::to('login'));
    exit;
}
// O shell offline grava explicitamente as telas operacionais no IndexedDB.
// Respostas administrativas não devem ficar no cache HTTP após logout,
// rebaixamento ou troca de usuário.
$chaveCacheOffline = \App\Modules\Acesso\Presentation\Http\OfflineSession::obterChaveCacheOffline();
$csrfToken = CsrfGuard::token();
if (!headers_sent()) {
    header('Cache-Control: private, no-store, max-age=0');
    header('Vary: Cookie');
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
    <?php include SGI_ROOT . '/resources/views/components/page-title.php'; ?>
    <link href="<?= \App\Shared\Http\Assets::url('css/bootstrap-theme.css') ?>" rel="stylesheet">
    <link rel="stylesheet" href="<?= \App\Shared\Http\Assets::url('css/shared.css') ?>">
    <link rel="stylesheet" href="<?= \App\Shared\Http\Assets::url('vendor/bootstrap-icons/bootstrap-icons.min.css') ?>">
    <link rel="stylesheet" href="<?= \App\Shared\Http\Assets::url('vendor/fontawesome/css/all.min.css') ?>" crossorigin="anonymous" referrerpolicy="no-referrer">
    <link rel="stylesheet" href="<?= \App\Shared\Http\Assets::url('css/admin.css') ?>">
    <script src="<?= \App\Shared\Http\Assets::url('vendor/axios/axios.min.js') ?>"></script>
    <script>window.SGI_SESSION_ID = <?php
echo (int) ($_SESSION['id'] ?? $_SESSION['id_usuario'] ?? 0);
?>; window.SGI_CACHE_KEY = <?php
echo json_encode($chaveCacheOffline, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
?>; window.SGI_CSRF_TOKEN = <?php
echo json_encode($csrfToken, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
?>; window.SGI_SESSION_NIVEL = <?php
echo (int) $nivelUsuario;
?>; window.SGI_SESSION_INTERCLASSE_ATIVO = <?php
echo (int) ($_SESSION['id_interclasse'] ?? 0);
?>; window.SGI_BASE_PATH = <?php
echo json_encode(\App\Shared\Http\Url::basePath(), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
?>; window.SGI_API_BASE = <?php
echo json_encode(\App\Shared\Http\Url::to('api/v1/'), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
?>; window.SGI_ASSET_BASE = <?php
echo json_encode(\App\Shared\Http\Url::to('assets'), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
?>;</script>
    <?php
if ($nivelUsuario === 2) {
    ?>
    <!-- A camada SPA/offline pertence exclusivamente ao fluxo do mesário. -->
    <script src="<?= \App\Shared\Http\Assets::url('js/offline/offline-core.js') ?>"></script>
    <script src="<?= \App\Shared\Http\Assets::url('js/offline/mesario-data.js') ?>"></script>
    <script src="<?= \App\Shared\Http\Assets::url('js/offline/offline-form.js') ?>"></script>
    <script src="<?= \App\Shared\Http\Assets::url('js/offline/mesario-offline.js') ?>"></script>
    <?php
}
?>
    <!-- Motor híbrido de chaveamento (avança a árvore localmente quando offline). -->
    <script src="<?= \App\Shared\Http\Assets::url('js/offline/chaveamento-engine.js') ?>"></script>
<script src="<?= \App\Shared\Http\Assets::url('js/shared/http-client.js') ?>"></script>
<script src="<?= \App\Shared\Http\Assets::url('js/shared/cronometro.js') ?>"></script>
<script src="<?= \App\Shared\Http\Assets::url('js/shared/bootstrap-feedback.js') ?>"></script>
<script src="<?= \App\Shared\Http\Assets::url('js/shared/html-utils.js') ?>"></script>
<script src="<?= \App\Shared\Http\Assets::url('js/shared/page-runtime.js') ?>"></script>
<?php if (\App\Shared\Config\Env::get('SGI_APP_ENV', '') === 'development'): ?>
<script src="<?= \App\Shared\Http\Assets::url('js/dev/live-reload.js') ?>"></script>
<?php endif; ?>
<script>
(function () {
    document.addEventListener('click', async function (event) {
        var link = event.target.closest && event.target.closest('[data-sgi-logout]');
        if (!link) return;
        if (event.defaultPrevented) return;
        if (link.dataset.sgiLogoutPending === '1') return;
        event.preventDefault();
        link.dataset.sgiLogoutPending = '1';
        if (window.SGI && typeof window.SGI.confirm === 'function') {
            var autorizado = await window.SGI.confirm({
                titulo: 'Sair do SGI?',
                mensagem: 'Sua sessão será encerrada neste dispositivo.',
                textoConfirmar: 'Sair'
            });
            if (!autorizado) {
                delete link.dataset.sgiLogoutPending;
                return;
            }
        }
        fetch(link.href, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {'X-SGI-CSRF': window.SGI_CSRF_TOKEN || ''}
        }).finally(function () {
            window.location.href = <?= json_encode(\App\Shared\Http\Url::to('login')) ?>;
        });
    });
})();
</script>
</head>
<body class="bg-light sgi-app-shell">
<a class="sgi-skip-link" href="#sgi-main-content">Ir para o conteúdo</a>
