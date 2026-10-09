<?php
include SGI_ROOT . '/resources/views/components/aluno-head.php';

$paginaAtiva = 'home';
include SGI_ROOT . '/resources/views/components/aluno-nav.php';
?>

<main class="aluno-page p-5  py-4">
  <div class="row">
    <div class=" w-100 d-flex flex-column gap-4">

      <div class="aluno-hero bg-primary rounded-4 mb-4 text-white sgi-aluno-home-hero">
        <h1>Olá, <?= htmlspecialchars($_SESSION['nome'] ?? 'Estudante', ENT_QUOTES) ?>!   </h1>
        <p>Confira as competições disponíveis e participe!</p>

        <!-- NOVO BOTÃO DE ACESSO AOS JOGOS -->
        <div class="mt-3">
            <a href="<?= \App\Shared\Http\Url::to('aluno/jogos') ?>" class="btn btn-light fw-bold text-danger rounded-pill px-4 shadow-sm " >
                <i class="bi bi-calendar-check me-2"></i> Ver Tabela de Jogos
            </a>
        </div>
      </div>

      <div class="d-flex gap-2 flex-wrap mb-4" id="filterPills">
        <button type="button" class="btn btn-sm btn-outline-primary rounded-pill filter-pill active" data-filter="active" aria-pressed="true">Em Andamento</button>
        <button type="button" class="btn btn-sm btn-outline-primary rounded-pill filter-pill" data-filter="all" aria-pressed="false">Todos</button>
        <button type="button" class="btn btn-sm btn-outline-primary rounded-pill filter-pill" data-filter="inactive" aria-pressed="false">Encerrados</button>
      </div>

      <section id="listaInterclassesAluno">
        <div class="text-center py-5 text-body-secondary">
          <div class="spinner-border spinner-border-sm text-danger me-2" role="status">
            <span class="visually-hidden">Carregando...</span>
          </div>
          Carregando competições...
        </div>
      </section>

    </div>
  </div>
</main>

<div class="modal fade" id="modalTermo" data-bs-backdrop="static" data-bs-keyboard="false" tabindex="-1" aria-labelledby="tituloModalTermo" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content border-0 shadow">
            <div class="modal-header bg-primary text-white border-0">
                <h5 class="modal-title fw-bold" id="tituloModalTermo">
                    <i class="bi bi-file-earmark-text me-2" aria-hidden="true"></i>Termo de Responsabilidade e Regulamento
                </h5>
            </div>
            <div class="modal-body p-4">
                <p class="text-muted mb-3">Declaro para os devidos fins que aceito e assumo inteira responsabilidade pelos termos abaixo descritos para participação no Interclasse:</p>

                <ol class="ps-3 text-secondary lh-lg mb-4">
                    <li class="mb-2"><strong>Conduta:</strong> Comprometo-me a agir com respeito, <em>fair play</em> e espírito esportivo durante todas as atividades.</li>
                    <li class="mb-2"><strong>Regras:</strong> Declaro estar ciente e de acordo com todas as regras oficiais do Interclasse, acatando as decisões da organização e arbitragem.</li>
                    <li class="mb-2"><strong>Materiais:</strong> Responsabilizo-me pelos materiais esportivos e uniformes que me forem confiados, respondendo por eventuais danos ou extravios.</li>
                    <li class="mb-2"><strong>Saúde:</strong> Declaro estar em condições físicas adequadas para a prática das modalidades escolhidas, isentando a organização de responsabilidade por acidentes ou lesões decorrentes da participação.</li>
                    <li class="mb-2"><strong>Imagem:</strong> Autorizo o uso de minha imagem e voz para fins de divulgação do evento nas mídias oficiais da instituição.</li>
                    <li class="mb-2"><strong>Pontuação:</strong> Aceito o sistema de pontuação e classificação estabelecido, bem como as penalidades previstas no regulamento.</li>
                </ol>

                <div id="containerPdfRegulamento" class="card border-danger-subtle bg-danger-subtle bg-opacity-10 mb-3">
                    <div class="card-body p-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
                        <div class="d-flex align-items-center gap-2">
                            <i class="bi bi-file-earmark-pdf-fill fs-3 text-danger"></i>
                            <div>
                                <h6 class="fw-bold mb-0 text-dark">Regulamento Oficial (PDF)</h6>
                                <small class="text-muted">Leia o regulamento completo antes de aceitar.</small>
                            </div>
                        </div>
                        <a id="btnBaixarPdf" href="#" target="_blank" class="btn btn-primary btn-sm rounded-3 fw-semibold d-inline-flex align-items-center gap-1 disabled">
                            <i class="bi bi-download"></i> Baixar / Ler PDF
                        </a>
                    </div>
                </div>

                <div id="avisoRecusa" class="alert alert-danger d-none m-0" role="alert">
                    <i class="bi bi-exclamation-triangle-fill me-1"></i>
                    Não é possível continuar sem aceitar os termos.
                </div>
            </div>
            <div class="modal-footer border-0 justify-content-end gap-2 bg-light px-4 py-3">
                <button type="button" class="btn btn-outline-secondary px-4 fw-semibold" id="btnRecusarTermo">Recusar</button>
                <button type="button" class="btn btn-primary px-4 fw-semibold" id="btnAceitarTermo" disabled title="Abra o PDF do regulamento acima para liberar o botão">Aceitar e Continuar</button>
            </div>
        </div>
    </div>
</div>

<script type="application/json" data-sgi-config="aluno/home"><?= json_encode([], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR) ?></script>
<script data-sgi-page src="<?= \App\Shared\Http\Assets::url('js/pages/aluno/home.js') ?>"></script>
<?php include SGI_ROOT . '/resources/views/components/footer.php'; ?>
