<?php
$titulo = 'Locais e Regulamento do Interclasse';
$tagTituloCompacto = 'h1';
$mostrarVoltar = true;
$urlVoltar = \App\Shared\Http\Url::to('painel');
include SGI_ROOT . '/resources/views/components/admin-head.php';
include SGI_ROOT . '/resources/views/components/admin-header.php';
$paginaAtiva = 'dashboard';
$nivelUsuario = (int)($_SESSION['nivel'] ?? -1);
$isColaborador = $nivelUsuario === 1;
?>

<main class="main-desktop-layout main-locais-layout my-4">
    <div class="container-fluid px-0 mw-100" >
        <?php
        $headerIdVoltar = 'btnVoltarLocaisDesk';
        $headerClassBotao = 'd-none d-md-inline-flex';
        $headerCorpoHtml = '<h1 class="h2 fw-bold mb-0">Locais e Regulamento do Interclasse</h1>';
        $headerAcoesHtml = '<div class="d-flex gap-2">
            ' . ($isColaborador ? '<button type="button" class="btn btn-outline-danger fw-semibold rounded-3 px-3 py-2 shadow-sm d-inline-flex align-items-center gap-2" data-bs-toggle="modal" data-bs-target="#modalTermosColaborador">
                <i class="bi bi-file-earmark-text"></i> Termos do Colaborador
            </button>' : '') . '
            <button type="button" class="btn btn-primary fw-semibold rounded-3 px-4 py-2 shadow-sm d-inline-flex align-items-center gap-2 " data-bs-toggle="modal" data-bs-target="#modalNovoLocal" >
                <i class="bi bi-plus-lg"></i> Novo local
            </button>
        </div>';
        include SGI_ROOT . '/resources/views/components/page-header.php';
        unset($headerIdVoltar, $headerClassBotao, $headerCorpoHtml, $headerAcoesHtml);
        ?>

        <!-- Seção do Regulamento em Destaque Desktop -->
        <div class="card border-0 shadow-sm rounded-4 mb-4">
            <div class="card-body p-4 d-flex flex-column flex-lg-row justify-content-between align-items-start align-items-lg-center gap-3">
                <div class="d-flex align-items-center gap-3">
                    <div class="rounded-circle bg-danger-subtle p-3 d-flex align-items-center justify-content-center p-3" >
                        <i class="bi bi-file-earmark-pdf-fill fs-3 text-danger"></i>
                    </div>
                    <div>
                        <h5 class="fw-bold text-dark mb-1">Regulamento Oficial</h5>
                        <p id="infoRegulamentoDesk" class="text-muted mb-0 small">Verificando regulamento cadastrado...</p>
                    </div>
                </div>
                <div class="d-flex gap-2">
                    <a id="btnVerPdfDesk" href="#" target="_blank" class="btn btn-outline-danger fw-semibold rounded-3 px-3 d-none">
                        <i class="bi bi-file-earmark-pdf-fill"></i> Visualizar PDF
                    </a>
                    <button type="button" class="btn btn-primary fw-semibold rounded-3 px-3 " data-bs-toggle="modal" data-bs-target="#modalRegulamento" >
                        <i class="bi bi-cloud-arrow-up me-1"></i> Upload do Regulamento
                    </button>
                </div>
            </div>
        </div>

        <h5 class="fw-bold mb-3"><i class="bi bi-geo-alt-fill text-danger me-2"></i>Locais de Jogos</h5>
        <div id="listaLocaisDesktop" class="row g-3">
            <p class="text-muted">Carregando…</p>
        </div>
    </div>
</main>

<!-- ================= MODAL REGULAMENTO ================= -->
<div class="modal fade" id="modalRegulamento" tabindex="-1" aria-labelledby="modalRegulamentoLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content rounded-4 border-0 shadow">
            <div class="modal-header border-0 pb-0">
                <h5 class="modal-title fw-bold text-danger" id="modalRegulamentoLabel">Atualizar Regulamento (PDF)</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <form id="formRegulamento" enctype="multipart/form-data">
                <div class="modal-body">
                    <div class="mb-3">
                        <label for="pdf_regulamento" class="form-label fw-medium">Selecione o arquivo em PDF</label>
                        <input type="file" class="form-control rounded-3" id="pdf_regulamento" name="pdf_regulamento" accept=".pdf" required>
                        <div class="form-text small">Até 20 MB por arquivo, sujeito também aos limites reais do PHP/servidor.</div>
                    </div>
                    <div id="msgRegulamento" class="small text-center mb-2"></div>
                </div>
                <div class="modal-footer border-0 pt-0 d-flex justify-content-end gap-2">
                    <button type="button" class="btn btn-outline-secondary rounded-3" data-bs-dismiss="modal">Cancelar</button>
                    <button type="submit" class="btn btn-primary rounded-3 fw-semibold px-4" id="btnSalvarRegulamento">Enviar Arquivo</button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- ================= MODAL NOVO LOCAL ================= -->
<div class="modal fade" id="modalNovoLocal" tabindex="-1" aria-labelledby="tituloModalLocal" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content rounded-4 border-0 shadow">
            <div class="modal-header border-0 pb-0">
                <h5 class="modal-title fw-bold text-danger" id="tituloModalLocal">Novo local</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <div class="modal-body">
                <form id="formNovoLocal">
                    <div class="mb-3">
                        <label class="form-label fw-medium" for="inputNomeLocal">Nome do local</label>
                        <input type="text" class="form-control rounded-3" id="inputNomeLocal" required maxlength="45" placeholder="Ex.: Quadra poliesportiva — Bloco B">
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-medium" for="selectDisponivelLocal">Disponível para uso</label>
                        <select class="form-select rounded-3" id="selectDisponivelLocal">
                            <option value="1" selected>Sim</option>
                            <option value="0">Não</option>
                        </select>
                    </div>
                    <div class="mb-3">
                        <label class="form-label fw-medium" for="inputCargaLocal">Capacidade (opcional)</label>
                        <input type="number" class="form-control rounded-3" id="inputCargaLocal" min="0" placeholder="Público ou lotação">
                    </div>
                    <div id="msgNovoLocal" class="small text-center mb-2"></div>
                    <div class="d-flex justify-content-end gap-2 pt-2">
                        <button type="button" class="btn btn-outline-secondary rounded-3" data-bs-dismiss="modal">Cancelar</button>
                        <button type="submit" class="btn btn-primary rounded-3 fw-semibold px-4" id="btnSalvarLocal">Salvar</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</div>

<!-- ================= MODAL EDITAR LOCAL ================= -->
<div class="modal fade" id="modalEditarLocal" tabindex="-1" aria-labelledby="modalEditarLocalLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content rounded-4 border-0 shadow">
            <div class="modal-header border-0 pb-0">
                <h5 class="modal-title fw-bold text-danger" id="modalEditarLocalLabel">Atualizar Local</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <form id="formEditarLocal">
                <div class="modal-body">
                    <input type="hidden" id="edit-local-id" name="id_local">

                    <div class="mb-3">
                        <label for="edit-local-nome" class="form-label fw-medium">Nome do Local</label>
                        <input type="text" class="form-control rounded-3" id="edit-local-nome" name="nome_local" required maxlength="45">
                    </div>

                    <div class="mb-3">
                        <label for="edit-local-disponivel" class="form-label fw-medium">Disponível para uso</label>
                        <select class="form-select rounded-3" id="edit-local-disponivel" name="disponivel_local">
                            <option value="1">Sim</option>
                            <option value="0">Não</option>
                        </select>
                    </div>

                    <div class="mb-3">
                        <label for="edit-local-carga" class="form-label fw-medium">Capacidade (opcional)</label>
                        <input type="number" class="form-control rounded-3" id="edit-local-carga" name="carga_local" min="0">
                    </div>
                    <div id="msgEditarLocal" class="small text-center mb-2"></div>
                </div>
                <div class="modal-footer border-0 pt-0 d-flex justify-content-end gap-2">
                    <button type="button" class="btn btn-outline-secondary rounded-3" data-bs-dismiss="modal">Cancelar</button>
                    <button type="submit" class="btn btn-primary rounded-3 fw-semibold px-4" id="btnAtualizarLocal">Salvar Alterações</button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- ================= MODAL DE TERMOS E REGULAMENTO PARA COLABORADORES ================= -->
<div class="modal fade" id="modalTermosColaborador" tabindex="-1" aria-labelledby="modalTermosColaboradorLabel" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
        <div class="modal-content rounded-4 border-0 shadow">

            <div class="modal-header border-bottom">
                <h5 class="modal-title fw-bold text-danger" id="modalTermosColaboradorLabel">
                    <i class="bi bi-file-earmark-text me-2"></i>Termos e Regulamento do Colaborador
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>

            <div class="modal-body p-4">

                <!-- Termo de Responsabilidade para Colaboradores -->
                <section class="mb-4">
                    <h2 class="fs-6 fw-bold text-dark mb-3 text-uppercase">Termo de Responsabilidade da Organização e Gestão</h2>
                    <div class="bg-light rounded-3 p-3 border">
                        <p class="text-secondary small mb-3">
                            Declaro para os devidos fins que aceito e assumo inteira responsabilidade pelos termos e diretrizes abaixo para a organização, mediação e gestão do Interclasse:
                        </p>

                        <div class="border-start border-4 border-danger ps-3 mb-3">
                            <strong>Conduta Profissional:</strong> Comprometo-me a atuar de forma ética, imparcial, respeitosa e zelosa no desempenho de minhas atribuições durante todas as etapas e eventos.
                        </div>
                        <div class="border-start border-4 border-danger ps-3 mb-3">
                            <strong>Cumprimento das Regras:</strong> Declaro conhecer integralmente o Regulamento Geral do Interclasse, aplicando-o estritamente e garantindo o respeito às decisões oficiais do evento.
                        </div>
                        <div class="border-start border-4 border-danger ps-3 mb-3">
                            <strong>Gestão de Materiais e Locais:</strong> Responsabilizo-me pelo uso adequado e supervisão dos materiais esportivos, espaços e instalações alocadas, zelando pela integridade do patrimônio institucional.
                        </div>
                        <div class="border-start border-4 border-danger ps-3 mb-3">
                            <strong>Segurança e Bem-estar:</strong> Comprometo-me a zelar pela integridade e segurança dos estudantes e participantes, acionando o suporte adequado e informando a organização imediatamente diante de eventuais incidentes.
                        </div>
                        <div class="border-start border-4 border-danger ps-3 mb-3">
                            <strong>Uso de Imagem:</strong> Autorizo o uso de minha imagem e voz para fins institucionais e de divulgação oficial do evento nas mídias da instituição.
                        </div>
                        <div class="border-start border-4 border-danger ps-3 mb-3">
                            <strong>Confidencialidade e Dados:</strong> Comprometo-me a manter a confidencialidade e integridade dos dados, pontuações, classificações e registros administrativos aos quais eu tiver acesso.
                        </div>
                    </div>
                </section>

                <!-- Regulamento Geral (PDF) -->
                <section>
                    <h2 class="fs-6 fw-bold text-dark mb-3 text-uppercase">Regulamento Oficial</h2>
                    <div class="card border rounded-3 p-3">
                        <p id="statusRegulamentoModal" class="text-muted mb-0 small">
                            <span class="spinner-border spinner-border-sm me-2 text-danger" role="status"></span>Carregando regulamento...
                        </p>

                        <div id="containerPdfRegulamentoModal" class="card border-danger-subtle bg-danger-subtle bg-opacity-10 d-none">
                            <div class="card-body p-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
                                <div class="d-flex align-items-center gap-2">
                                    <i class="bi bi-file-earmark-pdf-fill fs-3 text-danger"></i>
                                    <div>
                                        <h6 class="fw-bold mb-0 text-dark">Regulamento Oficial (PDF)</h6>
                                        <small class="text-muted">Consulte o documento oficial e as diretrizes do evento.</small>
                                    </div>
                                </div>
                                <a id="btnBaixarPdfModal" href="#" target="_blank" class="btn btn-primary btn-sm rounded-3 fw-semibold d-inline-flex align-items-center gap-1">
                                    <i class="bi bi-download"></i> Baixar / Ler PDF
                                </a>
                            </div>
                        </div>
                    </div>
                </section>

            </div>

            <div class="modal-footer border-top">
                <button type="button" class="btn btn-secondary rounded-3 px-4" data-bs-dismiss="modal">Entendido / Fechar</button>
            </div>

        </div>
    </div>
</div>

<script type="application/json" data-sgi-config="eventos/configurar-locais"><?= json_encode([], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR) ?></script>
<script data-sgi-page src="<?= \App\Shared\Http\Assets::url('js/pages/eventos/configurar-locais.js') ?>"></script>

<?php
include SGI_ROOT . '/resources/views/components/admin-nav.php';
require_once SGI_ROOT . '/resources/views/components/footer.php';
?>
