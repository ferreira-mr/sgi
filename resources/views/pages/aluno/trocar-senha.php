<?php
$habilitarOfflineAluno = false;
include SGI_ROOT . '/resources/views/components/aluno-head.php';
?>

<main class="container py-5">
    <div class="row justify-content-center">
        <div class="col-12 col-md-8 col-lg-6">
            <section class="bg-white rounded-3 shadow-sm p-4 p-md-5" aria-labelledby="tituloPrimeiroAcesso">
                <h1 id="tituloPrimeiroAcesso" class="h3 mb-3">Crie sua senha pessoal</h1>
                <p class="text-secondary mb-4">
                    Para continuar, defina uma senha com pelo menos 6 caracteres.
                </p>

                <form id="formPrimeiroAcesso" novalidate>
                    <div class="mb-3">
                        <label class="form-label" for="novaSenhaPrimeiroAcesso">Nova senha</label>
                        <div class="input-group">
                            <input
                                class="form-control"
                                id="novaSenhaPrimeiroAcesso"
                                name="nova_senha"
                                type="password"
                                minlength="6"
                                autocomplete="new-password"
                                required
                                aria-describedby="ajudaSenhaPrimeiroAcesso"
                            >
                            <button type="button" class="password-visibility-toggle btn btn-outline-secondary" data-target="novaSenhaPrimeiroAcesso" aria-controls="novaSenhaPrimeiroAcesso" aria-label="Mostrar senha" aria-pressed="false">
                                <i class="bi bi-eye-slash" aria-hidden="true"></i>
                            </button>
                        </div>
                        <div id="ajudaSenhaPrimeiroAcesso" class="form-text">Use pelo menos 6 caracteres.</div>
                    </div>

                    <div class="mb-3">
                        <label class="form-label" for="confirmarSenhaPrimeiroAcesso">Confirme a nova senha</label>
                        <div class="input-group">
                            <input
                                class="form-control"
                                id="confirmarSenhaPrimeiroAcesso"
                                name="confirmar_senha"
                                type="password"
                                minlength="6"
                                autocomplete="new-password"
                                required
                            >
                            <button type="button" class="password-visibility-toggle btn btn-outline-secondary" data-target="confirmarSenhaPrimeiroAcesso" aria-controls="confirmarSenhaPrimeiroAcesso" aria-label="Mostrar senha" aria-pressed="false">
                                <i class="bi bi-eye-slash" aria-hidden="true"></i>
                            </button>
                        </div>
                    </div>

                    <p id="msgPrimeiroAcesso" class="small mb-3" role="status" aria-live="polite" aria-atomic="true"></p>

                    <button id="btnSalvarSenhaPrimeiroAcesso" class="btn btn-primary fw-semibold w-100" type="submit">
                        Salvar senha e continuar
                    </button>
                </form>

                <div class="text-center mt-4">
                    <a href="<?= htmlspecialchars(\App\Shared\Http\Url::to('api/v1/logout'), ENT_QUOTES, 'UTF-8') ?>" data-sgi-logout>
                        Sair
                    </a>
                </div>
            </section>
        </div>
    </div>
</main>

<script type="application/json" data-sgi-config="aluno/trocar-senha"><?= json_encode([], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR) ?></script>
<script data-sgi-page src="<?= \App\Shared\Http\Assets::url('js/pages/aluno/trocar-senha.js') ?>"></script>
<?php include SGI_ROOT . '/resources/views/components/footer.php'; ?>
