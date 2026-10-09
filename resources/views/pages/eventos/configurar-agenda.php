<?php
$titulo = 'Agenda';
$mostrarVoltar = true;
$urlVoltar = \App\Shared\Http\Url::to('painel');
include SGI_ROOT . '/resources/views/components/admin-head.php';
include SGI_ROOT . '/resources/views/components/admin-header.php';
$paginaAtiva = 'agenda';
$nivelUsuarioAgenda = (int)($_SESSION['nivel'] ?? -1);
?>

<?php if ($nivelUsuarioAgenda <= 1): ?>
<section id="painelCronogramaPlanejado" class="main-desktop-layout py-3" aria-labelledby="cronogramaPlanejadoTitulo">
    <div class="card border-primary-subtle shadow-sm">
        <div class="card-body">
            <div class="d-flex flex-wrap align-items-start justify-content-between gap-3 pb-3 border-bottom">
                <div>
                    <h2 id="cronogramaPlanejadoTitulo" class="h5 fw-bold mb-1">Cronograma antes das inscrições</h2>
                    <p class="small text-body-secondary mb-0">Prepare as equipes, gere e confira a prévia, publique o cronograma e então abra ou encerre as inscrições. A liberação da competição materializa os jogos; depois dela, a edição não pode ser reconfigurada.</p>
                </div>
                <div class="d-flex flex-wrap align-items-center gap-2">
                    <span id="cronogramaPlanejadoStatus" class="badge rounded-pill text-bg-secondary">Verificando...</span>
                    <button id="cronogramaRevisar" type="button" class="btn btn-outline-warning btn-sm" disabled>Reabrir revisão</button>
                    <button id="cronogramaAtualizar" type="button" class="btn btn-outline-secondary btn-sm">Atualizar estado</button>
                </div>
            </div>

            <nav class="mt-3" aria-label="Etapas do cronograma planejado">
                <ol id="cronogramaStepper" class="sgi-stepper list-unstyled mb-0">
                    <li class="sgi-stepper__item sgi-stepper__item--active" data-sgi-step-indicator="1" aria-current="step">
                        <span class="sgi-stepper__circle" aria-hidden="true">
                            <span class="sgi-stepper__num">1</span>
                            <i class="bi bi-check-lg sgi-stepper__check"></i>
                        </span>
                        <span class="sgi-stepper__body">
                            <span class="sgi-stepper__label">Preparar equipes</span>
                            <span class="sgi-stepper__meta" data-sgi-step-meta="1">Etapa atual</span>
                        </span>
                    </li>
                    <li class="sgi-stepper__item sgi-stepper__item--upcoming" data-sgi-step-indicator="2">
                        <span class="sgi-stepper__circle" aria-hidden="true">
                            <span class="sgi-stepper__num">2</span>
                            <i class="bi bi-check-lg sgi-stepper__check"></i>
                        </span>
                        <span class="sgi-stepper__body">
                            <span class="sgi-stepper__label">Gerar rascunho</span>
                            <span class="sgi-stepper__meta" data-sgi-step-meta="2">Aguardando</span>
                        </span>
                    </li>
                    <li class="sgi-stepper__item sgi-stepper__item--upcoming" data-sgi-step-indicator="3">
                        <span class="sgi-stepper__circle" aria-hidden="true">
                            <span class="sgi-stepper__num">3</span>
                            <i class="bi bi-check-lg sgi-stepper__check"></i>
                        </span>
                        <span class="sgi-stepper__body">
                            <span class="sgi-stepper__label">Publicar cronograma</span>
                            <span class="sgi-stepper__meta" data-sgi-step-meta="3">Aguardando</span>
                        </span>
                    </li>
                    <li class="sgi-stepper__item sgi-stepper__item--upcoming" data-sgi-step-indicator="4">
                        <span class="sgi-stepper__circle" aria-hidden="true">
                            <span class="sgi-stepper__num">4</span>
                            <i class="bi bi-check-lg sgi-stepper__check"></i>
                        </span>
                        <span class="sgi-stepper__body">
                            <span class="sgi-stepper__label">Abrir inscrições</span>
                            <span class="sgi-stepper__meta" data-sgi-step-meta="4">Aguardando</span>
                        </span>
                    </li>
                    <li class="sgi-stepper__item sgi-stepper__item--upcoming" data-sgi-step-indicator="5">
                        <span class="sgi-stepper__circle" aria-hidden="true">
                            <span class="sgi-stepper__num">5</span>
                            <i class="bi bi-check-lg sgi-stepper__check"></i>
                        </span>
                        <span class="sgi-stepper__body">
                            <span class="sgi-stepper__label">Encerrar inscrições</span>
                            <span class="sgi-stepper__meta" data-sgi-step-meta="5">Aguardando</span>
                        </span>
                    </li>
                    <li class="sgi-stepper__item sgi-stepper__item--upcoming" data-sgi-step-indicator="6">
                        <span class="sgi-stepper__circle" aria-hidden="true">
                            <span class="sgi-stepper__num">6</span>
                            <i class="bi bi-check-lg sgi-stepper__check"></i>
                        </span>
                        <span class="sgi-stepper__body">
                            <span class="sgi-stepper__label">Liberar competição</span>
                            <span class="sgi-stepper__meta" data-sgi-step-meta="6">Aguardando</span>
                        </span>
                    </li>
                </ol>
            </nav>

            <div id="cronogramaEtapasGrid" class="row g-3 mt-1">
                <div class="col-12 col-lg-3">
                    <div class="card h-100 rounded-3 p-3 d-flex flex-column sgi-step-card sgi-step-card--active" data-sgi-step-card="1">
                        <div class="d-flex align-items-center justify-content-between gap-2 mb-2">
                            <span class="fw-bold small text-body">1. Preparar equipes</span>
                            <span class="badge rounded-pill text-bg-primary" data-sgi-card-badge="1">Etapa atual</span>
                        </div>
                        <p class="small text-body-secondary mb-3">Cria ou atualiza as equipes planejadas por turma e modalidade ativa.</p>
                        <div class="mt-auto">
                            <button id="cronogramaPreparar" type="button" class="btn btn-primary btn-sm w-100" disabled>Preparar equipes</button>
                        </div>
                    </div>
                </div>

                <div class="col-12 col-lg-6">
                    <div class="card h-100 rounded-3 p-3 d-flex flex-column sgi-step-card sgi-step-card--upcoming" data-sgi-step-card="2">
                        <div class="d-flex align-items-center justify-content-between gap-2 mb-2">
                            <span class="fw-bold small text-body">2. Gerar rascunho</span>
                            <span class="badge rounded-pill text-bg-light border text-body-secondary" data-sgi-card-badge="2">Aguardando</span>
                        </div>
                        <p class="small text-body-secondary mb-2">Defina o período, janela diária e duração das partidas para simular a grade.</p>
                        <div class="row g-2 mb-3 align-items-end">
                            <div class="col-6 col-sm-3"><label class="form-label small mb-1" for="cronogramaDataInicio">Primeiro dia</label><input id="cronogramaDataInicio" type="date" class="form-control form-control-sm"></div>
                            <div class="col-6 col-sm-3"><label class="form-label small mb-1" for="cronogramaDataFim">Último dia</label><input id="cronogramaDataFim" type="date" class="form-control form-control-sm"></div>
                            <div class="col-4 col-sm-2"><label class="form-label small mb-1" for="cronogramaHoraInicio">Início</label><input id="cronogramaHoraInicio" type="time" class="form-control form-control-sm" value="08:00"></div>
                            <div class="col-4 col-sm-2"><label class="form-label small mb-1" for="cronogramaHoraFim">Fim</label><input id="cronogramaHoraFim" type="time" class="form-control form-control-sm" value="18:00"></div>
                            <div class="col-4 col-sm-2"><label class="form-label small mb-1 text-nowrap" for="cronogramaDuracao">Duração (min)</label><input id="cronogramaDuracao" type="number" min="1" class="form-control form-control-sm" value="30"></div>
                        </div>
                        <div class="mt-auto d-flex justify-content-end">
                            <button id="cronogramaGerar" type="button" class="btn btn-outline-primary btn-sm" disabled>Gerar rascunho</button>
                        </div>
                    </div>
                </div>

                <div class="col-12 col-lg-3">
                    <div class="card h-100 rounded-3 p-3 d-flex flex-column sgi-step-card sgi-step-card--upcoming" data-sgi-step-card="3">
                        <div class="d-flex align-items-center justify-content-between gap-2 mb-2">
                            <span class="fw-bold small text-body">3. Publicar cronograma</span>
                            <span class="badge rounded-pill text-bg-light border text-body-secondary" data-sgi-card-badge="3">Aguardando</span>
                        </div>
                        <p class="small text-body-secondary mb-3">Confirma a prévia sem pendências e disponibiliza os horários planejados.</p>
                        <div class="mt-auto">
                            <button id="cronogramaPublicar" type="button" class="btn btn-outline-success btn-sm w-100" disabled>Publicar cronograma</button>
                        </div>
                    </div>
                </div>

                <div class="col-12 col-lg-6">
                    <div class="card h-100 rounded-3 p-3 d-flex flex-column sgi-step-card sgi-step-card--upcoming" data-sgi-step-card="4">
                        <div class="d-flex align-items-center justify-content-between gap-2 mb-2">
                            <span class="fw-bold small text-body">4. Abrir inscrições</span>
                            <span class="badge rounded-pill text-bg-light border text-body-secondary" data-sgi-card-badge="4">Aguardando</span>
                        </div>
                        <p class="small text-body-secondary mb-2">Configure a janela de abertura e encerramento para os alunos se inscreverem.</p>
                        <div class="row g-2 mb-3 align-items-end">
                            <div class="col-12 col-sm-6"><label class="form-label small mb-1" for="cronogramaInscricaoInicio">Abertura das inscrições</label><input id="cronogramaInscricaoInicio" type="datetime-local" class="form-control form-control-sm"></div>
                            <div class="col-12 col-sm-6"><label class="form-label small mb-1" for="cronogramaInscricaoFim">Encerramento das inscrições</label><input id="cronogramaInscricaoFim" type="datetime-local" class="form-control form-control-sm"></div>
                        </div>
                        <div class="mt-auto d-flex justify-content-end">
                            <button id="cronogramaAbrir" type="button" class="btn btn-outline-success btn-sm" disabled>Abrir inscrições</button>
                        </div>
                    </div>
                </div>

                <div class="col-12 col-lg-3">
                    <div class="card h-100 rounded-3 p-3 d-flex flex-column sgi-step-card sgi-step-card--upcoming" data-sgi-step-card="5">
                        <div class="d-flex align-items-center justify-content-between gap-2 mb-2">
                            <span class="fw-bold small text-body">5. Encerrar inscrições</span>
                            <span class="badge rounded-pill text-bg-light border text-body-secondary" data-sgi-card-badge="5">Aguardando</span>
                        </div>
                        <p class="small text-body-secondary mb-3">Bloqueia novas alterações nas equipes para consolidar os elencos.</p>
                        <div class="mt-auto">
                            <button id="cronogramaFechar" type="button" class="btn btn-outline-secondary btn-sm w-100" disabled>Encerrar inscrições</button>
                        </div>
                    </div>
                </div>

                <div class="col-12 col-lg-3">
                    <div class="card h-100 rounded-3 p-3 d-flex flex-column sgi-step-card sgi-step-card--upcoming" data-sgi-step-card="6">
                        <div class="d-flex align-items-center justify-content-between gap-2 mb-2">
                            <span class="fw-bold small text-body">6. Liberar competição</span>
                            <span class="badge rounded-pill text-bg-light border text-body-secondary" data-sgi-card-badge="6">Aguardando</span>
                        </div>
                        <p class="small text-body-secondary mb-3">Materializa os jogos na agenda; após liberar, não pode ser reconfigurada.</p>
                        <div class="mt-auto">
                            <button id="cronogramaLiberar" type="button" class="btn btn-outline-primary btn-sm w-100" disabled>Liberar competição</button>
                        </div>
                    </div>
                </div>
            </div>

            <p id="cronogramaPlanejadoResumo" class="small mb-0 mt-3 p-2 rounded bg-body-tertiary border" role="status" aria-live="polite"></p>
            <section id="cronogramaPrevia" class="mt-3 p-3 rounded border bg-body-tertiary d-none" aria-labelledby="cronogramaPreviaTitulo" aria-live="polite">
                <h3 id="cronogramaPreviaTitulo" class="h6 fw-semibold mb-1">Prévia da grade</h3>
                <p id="cronogramaPreviaStatus" class="small text-body-secondary mb-2"></p>
                <div id="cronogramaPreviaCorpo" class="table-responsive"></div>
            </section>
        </div>
    </div>
</section>
<?php endif; ?>

<!-- ═══ MOBILE ═══ -->
<main class="d-md-none ag-mobile sgi-agenda-mobile sgi-u-min-width-0 p-3">
    <div class="card overflow-hidden">
        <div class="bg-primary text-white d-flex align-items-center justify-content-between p-3">
            <button type="button" id="btn-prev-mobile" class="btn btn-sm btn-link link-light p-1" aria-label="Mês anterior"><i class="bi bi-chevron-left" aria-hidden="true"></i></button>
            <div class="d-flex gap-2 align-items-center">
                <label class="visually-hidden" for="select-mes">Mês da agenda</label>
                <select id="select-mes" class="form-select form-select-sm border-0 bg-transparent text-white text-center w-auto small fw-bold" >
                    <option value="0">Janeiro</option>
                    <option value="1">Fevereiro</option>
                    <option value="2">Março</option>
                    <option value="3">Abril</option>
                    <option value="4">Maio</option>
                    <option value="5">Junho</option>
                    <option value="6">Julho</option>
                    <option value="7">Agosto</option>
                    <option value="8">Setembro</option>
                    <option value="9">Outubro</option>
                    <option value="10">Novembro</option>
                    <option value="11">Dezembro</option>
                </select>
                <label class="visually-hidden" for="select-ano">Ano da agenda</label>
                <select id="select-ano" class="form-select form-select-sm border-0 bg-transparent text-white text-center w-auto small fw-bold" >
                </select>
            </div>
            <button type="button" id="btn-next-mobile" class="btn btn-sm btn-link link-light p-1" aria-label="Próximo mês"><i class="bi bi-chevron-right" aria-hidden="true"></i></button>
        </div>
        <div class="p-3">
            <div class="d-flex text-center mb-1" role="group" aria-label="Dias da semana">
                <span class="ag-cal-weekday flex-fill small fw-bold text-body-secondary text-uppercase py-1"><span aria-hidden="true">D</span><span class="visually-hidden">Domingo</span></span><span class="ag-cal-weekday flex-fill small fw-bold text-body-secondary text-uppercase py-1"><span aria-hidden="true">S</span><span class="visually-hidden">Segunda-feira</span></span><span class="ag-cal-weekday flex-fill small fw-bold text-body-secondary text-uppercase py-1"><span aria-hidden="true">T</span><span class="visually-hidden">Terça-feira</span></span><span class="ag-cal-weekday flex-fill small fw-bold text-body-secondary text-uppercase py-1"><span aria-hidden="true">Q</span><span class="visually-hidden">Quarta-feira</span></span><span class="ag-cal-weekday flex-fill small fw-bold text-body-secondary text-uppercase py-1"><span aria-hidden="true">Q</span><span class="visually-hidden">Quinta-feira</span></span><span class="ag-cal-weekday flex-fill small fw-bold text-body-secondary text-uppercase py-1"><span aria-hidden="true">S</span><span class="visually-hidden">Sexta-feira</span></span><span class="ag-cal-weekday flex-fill small fw-bold text-body-secondary text-uppercase py-1"><span aria-hidden="true">S</span><span class="visually-hidden">Sábado</span></span>
            </div>
            <div id="calendario-grade-mobile" class="ag-cal-grid row row-cols-7 g-0 text-center"></div>
        </div>
    </div>

    <div class="d-flex flex-wrap align-items-center justify-content-center gap-2 mb-4">
        <div class="input-group input-group-sm w-100" >
            <span class="input-group-text"><i class="bi bi-search" aria-hidden="true"></i></span>
            <label class="visually-hidden" for="agenda-busca-mobile">Buscar time ou modalidade</label>
            <input type="text" class="form-control" id="agenda-busca-mobile" placeholder="Buscar time ou modalidade...">
        </div>
        <label class="visually-hidden" for="agenda-select-mod-mobile">Filtrar por modalidade</label>
        <select id="agenda-select-mod-mobile" class="form-select form-select-sm w-100" ></select>
        <label class="visually-hidden" for="agenda-select-status-mobile">Filtrar por status</label>
        <select id="agenda-select-status-mobile" class="form-select form-select-sm w-100" >
            <option value="">Todos os status</option>
            <option value="Concluido">Concluídos</option>
            <option value="andamento">Em andamento</option>
            <option value="Agendado">Agendados</option>
        </select>
    </div>

    <div class="mb-3">
        <h3 class="h6 text-danger"><i class="bi bi-exclamation-circle me-1"></i>Aguardando agendamento</h3>
        <div id="lista-pendentes-mobile" class="vstack gap-3"></div>
    </div>
    <div id="lista-eventos-mobile" class="vstack gap-3"></div>
    <div class="d-flex justify-content-center mt-3 d-none" id="container-mostrar-todos-mobile" >
        <button type="button" class="btn btn-outline-secondary" id="btn-mostrar-todos-mobile">
            <i class="bi bi-calendar3 me-1"></i>Mostrar Todos os Jogos
        </button>
    </div>
    <p id="agenda-result-status-mobile" class="visually-hidden" role="status" aria-live="polite" aria-atomic="true"></p>
    <div class="d-flex justify-content-center mt-4">
        <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer" class="btn btn-outline-danger btn-sm" aria-label="Visitar Google Calendar (abre em uma nova guia)">
            <i class="bi bi-box-arrow-up-right me-1" aria-hidden="true"></i>Visitar Google Calendar<span class="visually-hidden"> (abre em uma nova guia)</span>
        </a>
    </div>
</main>

<!-- ═══ DESKTOP ═══ -->
<main class="d-none d-md-block main-desktop-layout sgi-agenda-desktop pb-5">
    <div>

        <?php
        $headerIdVoltar = 'btnVoltarAgendaDesk';
        $headerCorpoHtml = '<h1 class="h4 fw-bold text-body mb-0 d-flex align-items-center gap-2"><i class="bi bi-calendar3 text-danger"></i> Agenda de Jogos</h1>
        <p class="small text-body-secondary mt-1 mb-0">Calendário de confrontos e partidas do Interclasse</p>';
        $headerAcoesHtml = '<span class="badge rounded-pill text-bg-danger d-inline-flex align-items-center gap-2 d-none" id="agenda-count-badge">
            <i class="bi bi-fire"></i> <span id="agenda-count-text">0 jogos</span>
        </span>';
        include SGI_ROOT . '/resources/views/components/page-header.php';
        unset($headerIdVoltar, $headerCorpoHtml, $headerAcoesHtml);
        ?>

        <div class="d-flex gap-2 align-items-center flex-wrap mb-4">
            <div class="input-group input-group-sm flex-grow-1">
                <span class="input-group-text"><i class="bi bi-search" aria-hidden="true"></i></span>
                <label class="visually-hidden" for="agenda-busca">Buscar time ou modalidade</label>
                <input type="text" class="form-control" id="agenda-busca" placeholder="Buscar time ou modalidade...">
            </div>
            <label class="visually-hidden" for="agenda-select-mod">Filtrar por modalidade</label>
            <select id="agenda-select-mod" class="form-select form-select-sm w-auto"></select>
            <label class="visually-hidden" for="agenda-select-status">Filtrar por status</label>
            <select id="agenda-select-status" class="form-select form-select-sm w-auto">
                <option value="">Todos os status</option>
                <option value="Concluido">Concluídos</option>
                <option value="andamento">Em andamento</option>
                <option value="Agendado">Agendados</option>
            </select>
        </div>

        <div class="row g-4 align-items-start">
            <div class="col-12 col-xl-8">
                <div class="mb-3">
                    <h3 class="h6 text-danger"><i class="bi bi-exclamation-circle me-1"></i>Aguardando agendamento</h3>
                    <div id="lista-pendentes" class="vstack gap-3"></div>
                </div>
                <div id="lista-eventos" class="vstack gap-3"></div>
                <p id="agenda-result-status" class="visually-hidden" role="status" aria-live="polite" aria-atomic="true"></p>
                <div class="d-flex justify-content-center mt-3 d-none" id="container-mostrar-todos" >
                    <button type="button" class="btn btn-outline-secondary" id="btn-mostrar-todos">
                        <i class="bi bi-calendar3 me-1"></i>Mostrar Todos os Jogos
                    </button>
                </div>
            </div>

            <div class="col-12 col-xl-4 ag-cal-sticky">
                <div class="card overflow-hidden">
                    <div class="bg-primary text-white d-flex align-items-center justify-content-between p-3">
                        <button type="button" id="btn-prev" class="btn btn-sm btn-link link-light p-1" aria-label="Mês anterior"><i class="bi bi-chevron-left"></i></button>
                        <span id="calendario-mes" class="small fw-bold text-uppercase"></span>
                        <button type="button" id="btn-next" class="btn btn-sm btn-link link-light p-1" aria-label="Próximo mês"><i class="bi bi-chevron-right"></i></button>
                    </div>
                    <div class="p-3">
                        <div class="d-flex text-center mb-1" role="group" aria-label="Dias da semana">
                            <span class="ag-cal-weekday flex-fill small fw-bold text-body-secondary text-uppercase py-1"><span aria-hidden="true">D</span><span class="visually-hidden">Domingo</span></span><span class="ag-cal-weekday flex-fill small fw-bold text-body-secondary text-uppercase py-1"><span aria-hidden="true">S</span><span class="visually-hidden">Segunda-feira</span></span><span class="ag-cal-weekday flex-fill small fw-bold text-body-secondary text-uppercase py-1"><span aria-hidden="true">T</span><span class="visually-hidden">Terça-feira</span></span><span class="ag-cal-weekday flex-fill small fw-bold text-body-secondary text-uppercase py-1"><span aria-hidden="true">Q</span><span class="visually-hidden">Quarta-feira</span></span><span class="ag-cal-weekday flex-fill small fw-bold text-body-secondary text-uppercase py-1"><span aria-hidden="true">Q</span><span class="visually-hidden">Quinta-feira</span></span><span class="ag-cal-weekday flex-fill small fw-bold text-body-secondary text-uppercase py-1"><span aria-hidden="true">S</span><span class="visually-hidden">Sexta-feira</span></span><span class="ag-cal-weekday flex-fill small fw-bold text-body-secondary text-uppercase py-1"><span aria-hidden="true">S</span><span class="visually-hidden">Sábado</span></span>
                        </div>
                        <div id="calendario-grade" class="ag-cal-grid row row-cols-7 g-0 text-center"></div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</main>

<!-- ═══ MODAL EDITAR JOGO INDIVIDUAL ═══ -->
<div class="modal fade" id="modalEditarJogoAgenda" tabindex="-1" aria-labelledby="modalEditarJogoAgendaTitulo" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-fullscreen-xl-down">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="modalEditarJogoAgendaTitulo">Ajustar data, horário e local</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <div class="modal-body">
                <p class="small text-muted mb-3" id="edit-jogo-titulo"></p>
                <div class="mb-3">
                    <label class="form-label" for="edit-jogo-data">Data do jogo</label>
                    <input type="date" class="form-control" id="edit-jogo-data">
                </div>
                <div class="row g-2 mb-3">
                    <div class="col-6">
                        <label class="form-label" for="edit-jogo-inicio">Início</label>
                        <input type="time" class="form-control" id="edit-jogo-inicio">
                    </div>
                    <div class="col-6">
                        <label class="form-label" for="edit-jogo-fim">Término</label>
                        <input type="time" class="form-control" id="edit-jogo-fim">
                    </div>
                </div>
                <div class="mb-3">
                    <label class="form-label" for="edit-jogo-local">Local</label>
                    <select class="form-select" id="edit-jogo-local"></select>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary rounded-3 fw-semibold small" data-bs-dismiss="modal" >Cancelar</button>
                <button type="button" class="btn btn-primary rounded-3 fw-semibold small" id="edit-jogo-salvar" >Salvar</button>
            </div>
        </div>
    </div>
</div>

<script type="application/json" data-sgi-config="eventos/configurar-agenda"><?= json_encode(['value2' => ($nivelUsuarioAgenda)], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR) ?></script>
<script data-sgi-page src="<?= \App\Shared\Http\Assets::url('js/pages/eventos/configurar-agenda.js') ?>"></script>

<?php
include SGI_ROOT . '/resources/views/components/admin-nav.php';
require_once SGI_ROOT . '/resources/views/components/footer.php';
