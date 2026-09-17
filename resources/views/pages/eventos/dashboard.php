<?php
$titulo = 'Dashboard';
$tagTituloCompacto = 'h1';
$nivelUsuario = (int)($_SESSION['nivel'] ?? -1);
$mostrarVoltar = in_array($nivelUsuario, [0, 1], true);
$rotaInicio = $nivelUsuario === 2 ? 'painel' : ($nivelUsuario === 3 ? 'aluno/inicio' : 'edicoes');
$urlVoltar = \App\Shared\Http\Url::to('edicoes');
include SGI_ROOT . '/resources/views/components/admin-head.php';
include SGI_ROOT . '/resources/views/components/admin-header.php';
$paginaAtiva = 'dashboard';
$isAdmin = $nivelUsuario === 0;
$isColaborador = $nivelUsuario === 1;
$isMesario = $nivelUsuario === 2;
?>

<!-- Casca fixa do SPA do mesário: o conteúdo desta div é trocado
     dinamicamente pelas telas baixadas pelo mesario-offline.js.
     Header/Nav/Footer (componentes) permanecem fixos na página. -->
<div id="conteudo-principal" data-sgi-shell="1">
    <main class="main-desktop-layout main-dashboard-layout sgi-u-min-width-0">
        <div class="container-fluid px-0 sgi-u-min-width-0">
            <h1 class="h3 fw-bold text-body mb-4 d-none d-md-block">Dashboard</h1>
            <?php if (in_array($nivelUsuario, [0, 1], true)): ?>
                <a href="<?= \App\Shared\Http\Url::to($rotaInicio) ?>" class="btn btn-outline-danger btn-sm mb-3 d-inline-flex align-items-center gap-1">
                    <i class="bi bi-house" aria-hidden="true"></i> Voltar às edições
                </a>
            <?php endif; ?>

        <?php if ($isAdmin): ?>
        <div id="avisoFinalizacaoInterclasse" class="d-none alert alert-warning mb-4">
            <span>O interclasse está inativo no momento.</span>
        </div>
        <?php endif; ?>

        <div class="row row-cols-1 row-cols-sm-2 row-cols-lg-3 g-3 g-xl-4 mt-2">
            <?php if ($isMesario): ?>

            <div class="col-12 col-md-6 col-lg-4">
                <a href="<?= \App\Shared\Http\Url::to('edicoes/agenda') ?>" id="linkAgenda" class="card h-100 p-4 text-decoration-none shadow-sm">
                    <div class="d-flex align-items-center gap-3 mb-3">
                        <div class="bg-primary-subtle text-primary rounded-4 p-3 d-inline-flex align-items-center justify-content-center flex-shrink-0 fs-4"><i class="bi bi-calendar3" aria-hidden="true"></i></div>
                        <h5 class="h5 mb-0 fw-semibold text-body">AGENDA</h5>
                        <i class="bi bi-chevron-right text-body-tertiary ms-auto fs-5" aria-hidden="true"></i>
                    </div>
                    <p class="card-text text-body-secondary mb-0">Visualize o cronograma dos jogos, acesse o placar e acompanhe os resultados das partidas.</p>
                </a>
            </div>
            <div class="col-12 col-md-6 col-lg-4">
                <a href="<?= \App\Shared\Http\Url::to('chaveamento') ?>" id="linkChaveamentos" class="card h-100 p-4 text-decoration-none shadow-sm">
                    <div class="d-flex align-items-center gap-3 mb-3">
                        <div class="bg-primary-subtle text-primary rounded-4 p-3 d-inline-flex align-items-center justify-content-center flex-shrink-0 fs-4"><i class="bi bi-diagram-3" aria-hidden="true"></i></div>
                        <h5 class="h5 mb-0 fw-semibold text-body">CHAVEAMENTOS</h5>
                        <i class="bi bi-chevron-right text-body-tertiary ms-auto fs-5" aria-hidden="true"></i>
                    </div>
                    <p class="card-text text-body-secondary mb-0">Visualize os chaveamentos e acesse os confrontos das modalidades.</p>
                </a>
            </div>
           
            <div class="col-12 col-md-6 col-lg-4">
                <a href="<?= \App\Shared\Http\Url::to('ocorrencias') ?>" id="linkOcorrencias" class="card h-100 p-4 text-decoration-none shadow-sm">
                    <div class="d-flex align-items-center gap-3 mb-3">
                        <div class="bg-warning-subtle text-warning-emphasis rounded-4 p-3 d-inline-flex align-items-center justify-content-center flex-shrink-0 fs-4"><i class="bi bi-exclamation-triangle" aria-hidden="true"></i></div>
                        <h5 class="h5 mb-0 fw-semibold text-body">OCORRÊNCIAS</h5>
                        <i class="bi bi-chevron-right text-body-tertiary ms-auto fs-5" aria-hidden="true"></i>
                    </div>
                    <p class="card-text text-body-secondary mb-0">Registre ocorrências e aplique descontos de pontos nas turmas.</p>
                </a>
            </div>
            <?php endif; ?>

            <?php if ($isColaborador): ?>
            <div class="col-12 col-md-6 col-lg-4">
                <a href="<?= \App\Shared\Http\Url::to('modalidades') ?>" id="linkModalidades" class="card h-100 p-4 text-decoration-none shadow-sm">
                    <div class="d-flex align-items-center gap-3 mb-3">
                        <div class="bg-primary-subtle text-primary rounded-4 p-3 d-inline-flex align-items-center justify-content-center flex-shrink-0 fs-4"><i class="bi bi-trophy" aria-hidden="true"></i></div>
                        <h5 class="h5 mb-0 fw-semibold text-body">MODALIDADES</h5>
                        <i class="bi bi-chevron-right text-body-tertiary ms-auto fs-5" aria-hidden="true"></i>
                    </div>
                    <p class="card-text text-body-secondary mb-0">Visualize e crie novas modalidades esportivas para a competição.</p>
                </a>
            </div>
            <div class="col-12 col-md-6 col-lg-4">
                <a href="<?= \App\Shared\Http\Url::to('edicoes/pontuacao') ?>" id="linkPontuacoes" class="card h-100 p-4 text-decoration-none shadow-sm">
                    <div class="d-flex align-items-center gap-3 mb-3">
                        <div class="bg-primary-subtle text-primary rounded-4 p-3 d-inline-flex align-items-center justify-content-center flex-shrink-0 fs-4"><i class="bi bi-award" aria-hidden="true"></i></div>
                        <h5 class="h5 mb-0 fw-semibold text-body">PONTUAÇÕES</h5>
                        <i class="bi bi-chevron-right text-body-tertiary ms-auto fs-5" aria-hidden="true"></i>
                    </div>
                    <p class="card-text text-body-secondary mb-0">Acompanhe a tabela de pontos e o desempenho das equipes.</p>
                </a>
            </div>
            <div class="col-12 col-md-6 col-lg-4">
                <a href="<?= \App\Shared\Http\Url::to('edicoes/locais') ?>" id="linkLocais" class="card h-100 p-4 text-decoration-none shadow-sm">
                    <div class="d-flex align-items-center gap-3 mb-3">
                        <div class="bg-info-subtle text-info-emphasis rounded-4 p-3 d-inline-flex align-items-center justify-content-center flex-shrink-0 fs-4"><i class="bi bi-geo-alt" aria-hidden="true"></i></div>
                        <h5 class="h5 mb-0 fw-semibold text-body">LOCAIS E REGULAMENTO</h5>
                        <i class="bi bi-chevron-right text-body-tertiary ms-auto fs-5" aria-hidden="true"></i>
                    </div>
                    <p class="card-text text-body-secondary mb-0">Cadastre e visualize os locais onde os jogos acontecem.</p>
                </a>
            </div>
            <div class="col-12 col-md-6 col-lg-4">
                <a href="<?= \App\Shared\Http\Url::to('colaboradores') ?>" id="linkColaboradores" class="card h-100 p-4 text-decoration-none shadow-sm">
                    <div class="d-flex align-items-center gap-3 mb-3">
                        <div class="bg-success-subtle text-success rounded-4 p-3 d-inline-flex align-items-center justify-content-center flex-shrink-0 fs-4"><i class="bi bi-people" aria-hidden="true"></i></div>
                        <h5 class="h5 mb-0 fw-semibold text-body">COLABORADORES</h5>
                        <i class="bi bi-chevron-right text-body-tertiary ms-auto fs-5" aria-hidden="true"></i>
                    </div>
                    <p class="card-text text-body-secondary mb-0">Gerencie a equipe de apoio e voluntários do evento.</p>
                </a>
            </div>
            <div class="col-12 col-md-6 col-lg-4">
                <a href="<?= \App\Shared\Http\Url::to('edicoes/arrecadacao') ?>" id="linkArrecadacoes" class="card h-100 p-4 text-decoration-none shadow-sm">
                    <div class="d-flex align-items-center gap-3 mb-3">
                        <div class="bg-info-subtle text-info-emphasis rounded-4 p-3 d-inline-flex align-items-center justify-content-center flex-shrink-0 fs-4"><i class="bi bi-basket" aria-hidden="true"></i></div>
                        <h5 class="h5 mb-0 fw-semibold text-body">ARRECADAÇÕES</h5>
                        <i class="bi bi-chevron-right text-body-tertiary ms-auto fs-5" aria-hidden="true"></i>
                    </div>
                    <p class="card-text text-body-secondary mb-0">Adicione e acompanhe os kg arrecadados na gincana.</p>
                </a>
            </div>
            <div class="col-12 col-md-6 col-lg-4">
                <a href="<?= \App\Shared\Http\Url::to('ocorrencias') ?>" id="linkOcorrenciasColab" class="card h-100 p-4 text-decoration-none shadow-sm">
                    <div class="d-flex align-items-center gap-3 mb-3">
                        <div class="bg-warning-subtle text-warning-emphasis rounded-4 p-3 d-inline-flex align-items-center justify-content-center flex-shrink-0 fs-4"><i class="bi bi-exclamation-triangle" aria-hidden="true"></i></div>
                        <h5 class="h5 mb-0 fw-semibold text-body">OCORRÊNCIAS</h5>
                        <i class="bi bi-chevron-right text-body-tertiary ms-auto fs-5" aria-hidden="true"></i>
                    </div>
                    <p class="card-text text-body-secondary mb-0">Registre ocorrências e aplique descontos de pontos nas turmas.</p>
                </a>
            </div>
            <div class="col-12 col-md-6 col-lg-4">
                <a href="<?= \App\Shared\Http\Url::to('categorias') ?>" id="linkCategorias" class="card h-100 p-4 text-decoration-none shadow-sm">
                    <div class="d-flex align-items-center gap-3 mb-3">
                        <div class="bg-primary-subtle text-primary rounded-4 p-3 d-inline-flex align-items-center justify-content-center flex-shrink-0 fs-4"><i class="bi bi-bookmark" aria-hidden="true"></i></div>
                        <h5 class="h5 mb-0 fw-semibold text-body">CATEGORIAS</h5>
                        <i class="bi bi-chevron-right text-body-tertiary ms-auto fs-5" aria-hidden="true"></i>
                    </div>
                    <p class="card-text text-body-secondary mb-0">Configure as divisões da competição por faixa ou nível.</p>
                </a>
            </div>
            <div class="col-12 col-md-6 col-lg-4">
                <a href="<?= \App\Shared\Http\Url::to('turmas') ?>" id="linkTurmas" class="card h-100 p-4 text-decoration-none shadow-sm">
                    <div class="d-flex align-items-center gap-3 mb-3">
                        <div class="bg-success-subtle text-success rounded-4 p-3 d-inline-flex align-items-center justify-content-center flex-shrink-0 fs-4"><i class="bi bi-backpack" aria-hidden="true"></i></div>
                        <h5 class="h5 mb-0 fw-semibold text-body">TURMAS</h5>
                        <i class="bi bi-chevron-right text-body-tertiary ms-auto fs-5" aria-hidden="true"></i>
                    </div>
                    <p class="card-text text-body-secondary mb-0">Visualize as turmas participantes e acesse os alunos.</p>
                </a>
            </div>
            <div class="col-12 col-md-6 col-lg-4">
                <a href="<?= \App\Shared\Http\Url::to('edicoes/equipes') ?>" id="linkEquipes" class="card h-100 p-4 text-decoration-none shadow-sm">
                    <div class="d-flex align-items-center gap-3 mb-3">
                        <div class="bg-success-subtle text-success rounded-4 p-3 d-inline-flex align-items-center justify-content-center flex-shrink-0 fs-4"><i class="bi bi-diagram-3" aria-hidden="true"></i></div>
                        <h5 class="h5 mb-0 fw-semibold text-body">EQUIPES</h5>
                        <i class="bi bi-chevron-right text-body-tertiary ms-auto fs-5" aria-hidden="true"></i>
                    </div>
                    <p class="card-text text-body-secondary mb-0">Visualize equipes por modalidade e crie novas equipes.</p>
                </a>
            </div>
            <div class="col-12 col-md-6 col-lg-4">
                <a href="<?= \App\Shared\Http\Url::to('ranking') ?>" id="linkRanking" class="card h-100 p-4 text-decoration-none shadow-sm">
                    <div class="d-flex align-items-center gap-3 mb-3">
                        <div class="bg-primary-subtle text-primary rounded-4 p-3 d-inline-flex align-items-center justify-content-center flex-shrink-0 fs-4"><i class="bi bi-trophy" aria-hidden="true"></i></div>
                        <h5 class="h5 mb-0 fw-semibold text-body">RANKING</h5>
                        <i class="bi bi-chevron-right text-body-tertiary ms-auto fs-5" aria-hidden="true"></i>
                    </div>
                    <p class="card-text text-body-secondary mb-0">Visualize o ranking geral de pontuações por categoria.</p>
                </a>
            </div>
            <?php endif; ?>

            <?php if ($isAdmin): ?>
            <div class="col-12 col-md-6 col-lg-4">
                <a href="<?= \App\Shared\Http\Url::to('edicoes/modalidades') ?>" id="linkModalidades" class="card h-100 p-4 text-decoration-none shadow-sm">
                    <div class="d-flex align-items-center gap-3 mb-3">
                        <div class="bg-primary-subtle text-primary rounded-4 p-3 d-inline-flex align-items-center justify-content-center flex-shrink-0 fs-4"><i class="bi bi-trophy" aria-hidden="true"></i></div>
                        <h5 class="h5 mb-0 fw-semibold text-body">MODALIDADES</h5>
                        <i class="bi bi-chevron-right text-body-tertiary ms-auto fs-5" aria-hidden="true"></i>
                    </div>
                    <p class="card-text text-body-secondary mb-0">Cadastre e gerencie as modalidades esportivas, regulamentos e especificações de cada competição.</p>
                </a>
            </div>
            <div class="col-12 col-md-6 col-lg-4">
                <a href="<?= \App\Shared\Http\Url::to('edicoes/pontuacao') ?>" id="linkPontuacoes" class="card h-100 p-4 text-decoration-none shadow-sm">
                    <div class="d-flex align-items-center gap-3 mb-3">
                        <div class="bg-primary-subtle text-primary rounded-4 p-3 d-inline-flex align-items-center justify-content-center flex-shrink-0 fs-4"><i class="bi bi-award" aria-hidden="true"></i></div>
                        <h5 class="h5 mb-0 fw-semibold text-body">PONTUAÇÕES</h5>
                        <i class="bi bi-chevron-right text-body-tertiary ms-auto fs-5" aria-hidden="true"></i>
                    </div>
                    <p class="card-text text-body-secondary mb-0">Acompanhe a tabela de pontos, critérios de classificação e o histórico de pontuação das equipes.</p>
                </a>
            </div>
            <div class="col-12 col-md-6 col-lg-4">
                <a href="<?= \App\Shared\Http\Url::to('edicoes/locais') ?>" id="linkLocais" class="card h-100 p-4 text-decoration-none shadow-sm">
                    <div class="d-flex align-items-center gap-3 mb-3">
                        <div class="bg-info-subtle text-info-emphasis rounded-4 p-3 d-inline-flex align-items-center justify-content-center flex-shrink-0 fs-4"><i class="bi bi-building-gear" aria-hidden="true"></i></div>
                        <h5 class="h5 mb-0 fw-semibold text-body">LOCAIS E REGULAMENTO DO INTERCLASSE</h5>
                        <i class="bi bi-chevron-right text-body-tertiary ms-auto fs-5" aria-hidden="true"></i>
                    </div>
                    <p class="card-text text-body-secondary mb-0">Cadastre quadras, ginásios e demais espaços usados nos jogos antes de montar a agenda e cadastre e atualize o regulamento do interclasse.</p>
                </a>
            </div>
            <div class="col-12 col-md-6 col-lg-4">
                <a href="<?= \App\Shared\Http\Url::to('edicoes/agenda') ?>" id="linkAgenda" class="card h-100 p-4 text-decoration-none shadow-sm">
                    <div class="d-flex align-items-center gap-3 mb-3">
                        <div class="bg-primary-subtle text-primary rounded-4 p-3 d-inline-flex align-items-center justify-content-center flex-shrink-0 fs-4"><i class="bi bi-calendar3" aria-hidden="true"></i></div>
                        <h5 class="h5 mb-0 fw-semibold text-body">AGENDA</h5>
                        <i class="bi bi-chevron-right text-body-tertiary ms-auto fs-5" aria-hidden="true"></i>
                    </div>
                    <p class="card-text text-body-secondary mb-0">Organize o cronograma dos jogos, definição de confrontos, datas e horários das partidas.</p>
                </a>
            </div>
            <div class="col-12 col-md-6 col-lg-4">
                <a href="<?= \App\Shared\Http\Url::to('edicoes/arrecadacao') ?>" id="linkArrecadacoes" class="card h-100 p-4 text-decoration-none shadow-sm">
                    <div class="d-flex align-items-center gap-3 mb-3">
                        <div class="bg-info-subtle text-info-emphasis rounded-4 p-3 d-inline-flex align-items-center justify-content-center flex-shrink-0 fs-4"><i class="bi bi-basket" aria-hidden="true"></i></div>
                        <h5 class="h5 mb-0 fw-semibold text-body">ARRECADAÇÕES</h5>
                        <i class="bi bi-chevron-right text-body-tertiary ms-auto fs-5" aria-hidden="true"></i>
                    </div>
                    <p class="card-text text-body-secondary mb-0">Gerencie os kg arrecadados na gincana, metas, pontos de entrega e o impacto das doações.</p>
                </a>
            </div>
            <div class="col-12 col-md-6 col-lg-4">
                <a href="<?= \App\Shared\Http\Url::to('ocorrencias') ?>" id="linkOcorrenciasAdmin" class="card h-100 p-4 text-decoration-none shadow-sm">
                    <div class="d-flex align-items-center gap-3 mb-3">
                        <div class="bg-warning-subtle text-warning-emphasis rounded-4 p-3 d-inline-flex align-items-center justify-content-center flex-shrink-0 fs-4"><i class="bi bi-exclamation-triangle" aria-hidden="true"></i></div>
                        <h5 class="h5 mb-0 fw-semibold text-body">OCORRÊNCIAS</h5>
                        <i class="bi bi-chevron-right text-body-tertiary ms-auto fs-5" aria-hidden="true"></i>
                    </div>
                    <p class="card-text text-body-secondary mb-0">Registre ocorrências e aplique descontos de pontos nas turmas por modalidade.</p>
                </a>
            </div>
            <div class="col-12 col-md-6 col-lg-4">
                <a href="<?= \App\Shared\Http\Url::to('edicoes/categorias') ?>" id="linkCategorias" class="card h-100 p-4 text-decoration-none shadow-sm">
                    <div class="d-flex align-items-center gap-3 mb-3">
                        <div class="bg-primary-subtle text-primary rounded-4 p-3 d-inline-flex align-items-center justify-content-center flex-shrink-0 fs-4"><i class="bi bi-bookmark" aria-hidden="true"></i></div>
                        <h5 class="h5 mb-0 fw-semibold text-body">CATEGORIAS</h5>
                        <i class="bi bi-chevron-right text-body-tertiary ms-auto fs-5" aria-hidden="true"></i>
                    </div>
                    <p class="card-text text-body-secondary mb-0">Configure as divisões da competição por faixa etária, gênero ou nível técnico dos participantes.</p>
                </a>
            </div>
            <div class="col-12 col-md-6 col-lg-4">
                <a href="<?= \App\Shared\Http\Url::to('colaboradores') ?>" id="linkColaboradores" class="card h-100 p-4 text-decoration-none shadow-sm">
                    <div class="d-flex align-items-center gap-3 mb-3">
                        <div class="bg-success-subtle text-success rounded-4 p-3 d-inline-flex align-items-center justify-content-center flex-shrink-0 fs-4"><i class="bi bi-people" aria-hidden="true"></i></div>
                        <h5 class="h5 mb-0 fw-semibold text-body">COLABORADORES</h5>
                        <i class="bi bi-chevron-right text-body-tertiary ms-auto fs-5" aria-hidden="true"></i>
                    </div>
                    <p class="card-text text-body-secondary mb-0">Gerencie a equipe de organização, voluntários, comissão técnica e juízes do evento.</p>
                </a>
            </div>
            <div class="col-12 col-md-6 col-lg-4">
                <a href="<?= \App\Shared\Http\Url::to('turmas') ?>" id="linkTurmas" class="card h-100 p-4 text-decoration-none shadow-sm">
                    <div class="d-flex align-items-center gap-3 mb-3">
                        <div class="bg-success-subtle text-success rounded-4 p-3 d-inline-flex align-items-center justify-content-center flex-shrink-0 fs-4"><i class="bi bi-backpack" aria-hidden="true"></i></div>
                        <h5 class="h5 mb-0 fw-semibold text-body">TURMAS</h5>
                        <i class="bi bi-chevron-right text-body-tertiary ms-auto fs-5" aria-hidden="true"></i>
                    </div>
                    <p class="card-text text-body-secondary mb-0">Categorias e turmas desta edição: cadastro, PDF de alunos e acesso às equipes por turma.</p>
                </a>
            </div>
            <div class="col-12 col-md-6 col-lg-4">
                <a href="<?= \App\Shared\Http\Url::to('edicoes/equipes') ?>" id="linkEquipes" class="card h-100 p-4 text-decoration-none shadow-sm">
                    <div class="d-flex align-items-center gap-3 mb-3">
                        <div class="bg-success-subtle text-success rounded-4 p-3 d-inline-flex align-items-center justify-content-center flex-shrink-0 fs-4"><i class="bi bi-people" aria-hidden="true"></i></div>
                        <h5 class="h5 mb-0 fw-semibold text-body">EQUIPES</h5>
                        <i class="bi bi-chevron-right text-body-tertiary ms-auto fs-5" aria-hidden="true"></i>
                    </div>
                    <p class="card-text text-body-secondary mb-0">Visualize equipes por categoria e modalidade e abra o elenco de cada turma.</p>
                </a>
            </div>
            <div class="col-12 col-md-6 col-lg-4">
                <a href="<?= \App\Shared\Http\Url::to('chaveamento') ?>" id="linkChaveamento" class="card h-100 p-4 text-decoration-none shadow-sm">
                    <div class="d-flex align-items-center gap-3 mb-3">
                        <div class="bg-primary-subtle text-primary rounded-4 p-3 d-inline-flex align-items-center justify-content-center flex-shrink-0 fs-4"><i class="bi bi-diagram-3" aria-hidden="true"></i></div>
                        <h5 class="h5 mb-0 fw-semibold text-body">CHAVEAMENTO</h5>
                        <i class="bi bi-chevron-right text-body-tertiary ms-auto fs-5" aria-hidden="true"></i>
                    </div>
                    <p class="card-text text-body-secondary mb-0">Visualize a árvore completa do chaveamento mata-mata: confrontos, resultados e avanço das equipes.</p>
                </a>
            </div>
            <div class="col-12 col-md-6 col-lg-4">
                <a href="<?= \App\Shared\Http\Url::to('ranking') ?>" id="linkRanking" class="card h-100 p-4 text-decoration-none shadow-sm">
                    <div class="d-flex align-items-center gap-3 mb-3">
                        <div class="bg-primary-subtle text-primary rounded-4 p-3 d-inline-flex align-items-center justify-content-center flex-shrink-0 fs-4"><i class="bi bi-trophy" aria-hidden="true"></i></div>
                        <h5 class="h5 mb-0 fw-semibold text-body">RANKING</h5>
                        <i class="bi bi-chevron-right text-body-tertiary ms-auto fs-5" aria-hidden="true"></i>
                    </div>
                    <p class="card-text text-body-secondary mb-0">Visualize o ranking geral de pontuações por categoria.</p>
                </a>
            </div>
            <?php endif; ?>
        </div>
    </div>
    </main>
</div><!-- /conteudo-principal -->

<script type="application/json" data-sgi-config="eventos/dashboard"><?= json_encode(['value0' => ($isMesario), 'value1' => ($isAdmin), 'value2' => ($isColaborador)], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR) ?></script>
<script data-sgi-page src="<?= \App\Shared\Http\Assets::url('js/pages/eventos/dashboard.js') ?>"></script>

<?php
include SGI_ROOT . '/resources/views/components/admin-nav.php';
require_once SGI_ROOT . '/resources/views/components/footer.php';
?>
