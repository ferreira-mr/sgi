<?php
$mostrarVoltar = $mostrarVoltar ?? true;
$titulo = $titulo ?? '';
$tagTituloCompacto = ($tagTituloCompacto ?? 'h1') === 'h1' ? 'h1' : 'h2';
$nivelUsuario = (int)($_SESSION['nivel'] ?? -1);
$rotaInicialUsuario = match ($nivelUsuario) {
    0, 1 => 'edicoes',
    2 => 'painel',
    default => 'login',
};
$urlVoltar = $urlVoltar ?? \App\Shared\Http\Url::to($rotaInicialUsuario);
$idInterclasseHeader = filter_var($_GET['id'] ?? ($nivelUsuario === 2 ? ($_SESSION['id_interclasse'] ?? null) : null), FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
if ($idInterclasseHeader !== false && $idInterclasseHeader !== null) {
    $parametrosUrlVoltar = [];
    parse_str((string) parse_url($urlVoltar, PHP_URL_QUERY), $parametrosUrlVoltar);
    if (!isset($parametrosUrlVoltar['id'])) {
        $urlVoltar .= (str_contains($urlVoltar, '?') ? '&' : '?') . http_build_query(['id' => (int) $idInterclasseHeader]);
    }
}
$compacteCabecalho = (bool)($compacteCabecalho ?? false);
$urlVoltarMobile = $urlVoltarMobile ?? $urlVoltar;
$idVoltarMobile = (string) ($idVoltarMobile ?? 'sgiBtnVoltar');
?>
<section class="d-md-none position-relative sgi-u-h-120px<?= $compacteCabecalho ? ' sgi-compact-header' : '' ?>" >
    <?php
    $mostrarVoltarHeader = $mostrarVoltarHeader ?? true;
    if ($mostrarVoltarHeader) {
        $sgiUrlVoltar = $urlVoltarMobile;
        $sgiIdVoltar = $idVoltarMobile;
        $sgiClassVoltar = 'sgi-u-top-20px-left-20px-z-10';
        $urlVoltarRestauro = $urlVoltar ?? null;
        include SGI_ROOT . '/resources/views/components/back-button.php';
        $urlVoltar = $urlVoltarRestauro;
        unset($sgiUrlVoltar, $sgiIdVoltar, $sgiClassVoltar, $urlVoltarRestauro);
    }
    ?>
    <?php if (!empty($titulo)): ?>
    <<?= $tagTituloCompacto ?> class="sgi-mobile-header-title text-black fw-bold m-0 px-1"><?= htmlspecialchars($titulo) ?></<?= $tagTituloCompacto ?>>
    <?php endif; ?>
</section>
