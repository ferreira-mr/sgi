<?php
$habilitarOfflineAluno = false;
include SGI_ROOT . '/resources/views/components/aluno-head.php';
$titulo = 'Termos';
$mostrarVoltar = !empty($_SESSION['termo_aceito']);
$urlVoltar = \App\Shared\Http\Url::to('aluno/inicio');
include SGI_ROOT . '/resources/views/components/aluno-header.php';
?>

    <main class="container py-4">
        <?php if ($mostrarVoltar): ?>
        <div class="mb-4">
            <?php
            $sgiUrlVoltar = $urlVoltar;
            $sgiIdVoltar = 'btnVoltarTermosDesk';
            $sgiClassVoltar = 'd-none d-md-inline-flex';
            include SGI_ROOT . '/resources/views/components/back-button.php';
            unset($sgiUrlVoltar, $sgiIdVoltar, $sgiClassVoltar);
            ?>
        </div>
        <?php endif; ?>
        <h1 class="visually-hidden">Termos e Regulamento</h1>

        <!-- Termo de Responsabilidade -->
        <section class="mb-5">
            <h2 class="fs-5 fw-bold mb-3">Termo de Responsabilidade</h2>
            <div class="bg-white rounded-3 p-4 shadow-sm">
                <p class="text-secondary mb-3">Declaro para os devidos fins que aceito e assumo inteira responsabilidade pelos termos abaixo descritos para participação no Interclasse:</p>
                <div class="border-start border-4 border-danger ps-3 mb-3"><strong>Conduta:</strong> Comprometo-me a agir com respeito, <em>fair play</em> e espírito esportivo durante todas as atividades.</div>
                <div class="border-start border-4 border-danger ps-3 mb-3"><strong>Regras:</strong> Declaro estar ciente e de acordo com todas as regras oficiais do Interclasse, acatando as decisões da organização e arbitragem.</div>
                <div class="border-start border-4 border-danger ps-3 mb-3"><strong>Materiais:</strong> Responsabilizo-me pelos materiais esportivos e uniformes que me forem confiados, respondendo por eventuais danos ou extravios.</div>
                <div class="border-start border-4 border-danger ps-3 mb-3"><strong>Saúde:</strong> Declaro estar em condições físicas adequadas para a prática das modalidades escolhidas, isentando a organização de responsabilidade por acidentes ou lesões decorrentes da participação.</div>
                <div class="border-start border-4 border-danger ps-3 mb-3"><strong>Imagem:</strong> Autorizo o uso de minha imagem e voz para fins de divulgação do evento nas mídias oficiais da instituição.</div>
                <div class="border-start border-4 border-danger ps-3 mb-3"><strong>Pontuação:</strong> Aceito o sistema de pontuação e classificação estabelecido, bem como as penalidades previstas no regulamento.</div>
            </div>
        </section>

        <!-- Regulamento do Interclasse -->
    <section>
            <h2 class="fs-5 fw-bold mb-3">Regulamento do Interclasse</h2>
            <div class="card border-0 shadow-sm p-4">
                <p id="statusRegulamento" class="text-muted mb-0">
                    <span class="spinner-border spinner-border-sm me-2 text-danger" role="status"></span>Carregando regulamento...
                </p>
                
                <!-- Bloco no mesmo padrão visual do Modal -->
                <div id="containerPdfRegulamento" class="card border-danger-subtle bg-danger-subtle bg-opacity-10 d-none">
                    <div class="card-body p-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
                        <div class="d-flex align-items-center gap-2">
                            <i class="bi bi-file-earmark-pdf-fill fs-3 text-danger"></i>
                            <div>
                                <h6 class="fw-bold mb-0 text-dark">Regulamento Oficial (PDF)</h6>
                                <small class="text-muted">Clique para ler as regras completas da competição.</small>
                            </div>
                        </div>
                        <a id="btnBaixarPdf" href="#" target="_blank" class="btn btn-primary btn-sm rounded-3 fw-semibold d-inline-flex align-items-center gap-1">
                            <i class="bi bi-download"></i> Baixar / Ler PDF
                        </a>
                    </div>
                </div>
        </div>
    </section>

    <section id="acoesTermos" class="mt-4">
        <div class="bg-white rounded-3 p-4 shadow-sm">
            <h2 class="fs-5 fw-bold mb-2">Confirmação obrigatória</h2>
            <p class="text-secondary mb-3">O aceite é necessário para acessar jogos, inscrições e as demais funções do portal.</p>
            <button type="button" class="btn btn-primary fw-semibold" id="btnAceitarTermos">
                <i class="bi bi-check-lg me-1"></i>Aceitar e continuar
            </button>
            <p id="msgAceiteTermos" class="small mt-3 mb-0" role="status"></p>
        </div>
    </section>
</main>

<?php
$paginaAtiva = 'termos';
include SGI_ROOT . '/resources/views/components/aluno-nav.php';
?>

<script type="application/json" data-sgi-config="aluno/termos"><?= json_encode([], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR) ?></script>
<script data-sgi-page src="<?= \App\Shared\Http\Assets::url('js/pages/aluno/termos.js') ?>"></script>
<?php include SGI_ROOT . '/resources/views/components/footer.php'; ?>
