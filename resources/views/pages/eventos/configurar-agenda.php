<?php
$titulo = 'Agenda';
$mostrarVoltar = true;
$urlVoltar = \App\Shared\Http\Url::to('painel');
include SGI_ROOT . '/resources/views/components/admin-head.php';
include SGI_ROOT . '/resources/views/components/admin-header.php';
$paginaAtiva = 'agenda';
$nivelUsuarioAgenda = (int)($_SESSION['nivel'] ?? -1);
?>

<!-- ═══ MOBILE ═══ -->
<main class="d-md-none ag-mobile sgi-agenda-mobile sgi-u-min-width-0 p-3">
    <h1 class="h4 fw-bold text-body mb-3">Agenda de Jogos</h1>
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
        <?php if ($nivelUsuarioAgenda <= 1): ?>
            <button type="button" class="btn btn-primary btn-sm w-100 d-inline-flex align-items-center justify-content-center gap-2 mt-1 btn-trigger-datas-auto">
                <i class="bi bi-calendar2-plus"></i> Agendar automaticamente
            </button>
        <?php endif; ?>
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

        <div class="d-flex align-items-center gap-3 flex-wrap mb-4">
            <a href="<?= \App\Shared\Http\Url::to('painel') ?>" id="btnVoltarAgendaDesk" class="btn btn-primary d-inline-flex align-items-center gap-2 fw-bold px-3 py-2 text-decoration-none">
                <i class="bi bi-arrow-left-circle fs-5"></i> <span id="nomeInterclasseAgenda">Interclasse</span>
            </a>
            <div class="flex-grow-1">
                <h1 class="h4 fw-bold text-body mb-0 d-flex align-items-center gap-2"><i class="bi bi-calendar3 text-danger"></i> Agenda de Jogos</h1>
                <p class="small text-body-secondary mt-1 mb-0">Calendário de confrontos e partidas do Interclasse</p>
            </div>
            <span class="badge rounded-pill text-bg-danger d-inline-flex align-items-center gap-2 ms-auto d-none" id="agenda-count-badge" >
                <i class="bi bi-fire"></i> <span id="agenda-count-text">0 jogos</span>
            </span>
        </div>

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
            <?php if ($nivelUsuarioAgenda <= 1): ?>
                <button type="button" class="btn btn-primary btn-sm d-inline-flex align-items-center gap-2 ms-auto btn-trigger-datas-auto">
                    <i class="bi bi-calendar2-plus"></i> Agendar automaticamente
                </button>
            <?php endif; ?>
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

<!-- ═══ MODAL DATAS AUTOMÁTICAS (LOTE) ═══ -->
<div class="modal fade" id="modalDatasAutomaticas" tabindex="-1" aria-labelledby="modalDatasAutomaticasTitulo" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable modal-fullscreen-xl-down">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="modalDatasAutomaticasTitulo"><i class="bi bi-calendar2-plus text-danger me-2" aria-hidden="true"></i>Agendamento automático</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Fechar"></button>
            </div>
            <div class="modal-body">
                <p class="small text-muted mb-3">Defina o primeiro jogo. Segunda-feira e quinta-feira são os dias padrão, mas você pode escolher qualquer dia da semana para as sessões, sem ultrapassar o limite informado. Se ainda houver jogos, adicione outra data e recalcule a prévia.</p>
                <div class="mb-3">
                    <label class="form-label" for="auto-modalidade">Modalidade</label>
                    <select class="form-select" id="auto-modalidade"></select>
                </div>
                <div class="row g-2 mb-3">
                    <div class="col-6">
                        <label class="form-label" for="seq-data">Primeiro dia</label>
                        <input type="date" class="form-control" id="seq-data">
                    </div>
                    <div class="col-6">
                        <label class="form-label" for="seq-inicio">Horário do primeiro jogo</label>
                        <input type="time" class="form-control" id="seq-inicio" value="08:00">
                    </div>
                </div>
                <div class="row g-2 mb-3">
                    <div class="col-6">
                        <label class="form-label" for="seq-fim">Limite para terminar os jogos</label>
                        <input type="time" class="form-control" id="seq-fim" value="11:30">
                        <div class="form-text">Valor inicial: 11h30. Nenhum jogo ultrapassará este horário.</div>
                    </div>
                    <div class="col-6">
                        <label class="form-label" for="seq-local">Local</label>
                        <select class="form-select" id="seq-local"></select>
                    </div>
                </div>
                <div class="mb-3">
                    <label class="form-label" for="seq-duracao">Duração média de cada jogo (minutos)</label>
                    <input type="number" class="form-control" id="seq-duracao" min="1" step="1" value="60">
                    <div class="form-text">O intervalo entre jogos será fixado em 10 minutos.</div>
                </div>
                <div class="form-check mb-3">
                    <input class="form-check-input" type="checkbox" id="seq-reprogramar">
                    <label class="form-check-label" for="seq-reprogramar">Permitir reprogramar jogos já agendados</label>
                    <div class="form-text">Use esta opção somente para recalcular jogos que ainda não começaram.</div>
                </div>
                <div class="mb-3">
                    <h6 class="form-label">Prévia</h6>
                    <div id="seq-previa" class="small border rounded p-2 bg-light" role="status" aria-live="polite" aria-atomic="true">Preencha os dados e clique em “Calcular prévia”.</div>
                </div>
                <div id="seq-proximo-dia" class="border rounded p-2 mb-2 d-none">
                    <div class="fw-semibold mb-2">Ainda há jogos. Informe a próxima sessão:</div>
                    <div class="row g-2">
                        <div class="col-4">
                            <label class="form-label" for="seq-proxima-data">Próximo dia</label>
                            <input type="date" class="form-control" id="seq-proxima-data">
                        </div>
                        <div class="col-4">
                            <label class="form-label" for="seq-proxima-inicio">Horário inicial</label>
                            <input type="time" class="form-control" id="seq-proxima-inicio" value="08:00">
                        </div>
                        <div class="col-4">
                            <label class="form-label" for="seq-proxima-fim">Limite</label>
                            <input type="time" class="form-control" id="seq-proxima-fim" value="11:30">
                        </div>
                    </div>
                    <button type="button" class="btn btn-outline-danger btn-sm mt-2" id="seq-adicionar-dia"><i class="bi bi-calendar-plus me-1"></i>Adicionar dia e recalcular</button>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-outline-secondary rounded-3 fw-semibold small" data-bs-dismiss="modal" >Cancelar</button>
                <button type="button" class="btn btn-outline-danger rounded-3 fw-semibold small" id="seq-simular-btn"><i class="bi bi-eye me-1"></i>Calcular prévia</button>
                <button type="button" class="btn btn-primary rounded-3 fw-semibold small" id="seq-salvar-btn" disabled><i class="bi bi-check-lg me-1"></i>Confirmar agenda</button>
            </div>
        </div>
    </div>
</div>

<script type="application/json" data-sgi-config="eventos/configurar-agenda"><?= json_encode(['value2' => ($nivelUsuarioAgenda)], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR) ?></script>
<script data-sgi-page src="<?= \App\Shared\Http\Assets::url('js/pages/eventos/configurar-agenda.js') ?>"></script>

<?php
include SGI_ROOT . '/resources/views/components/admin-nav.php';
require_once SGI_ROOT . '/resources/views/components/footer.php';
