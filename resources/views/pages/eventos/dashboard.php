<?php
$nivelUsuario = (int)($_SESSION['nivel'] ?? -1);
$titulo = $nivelUsuario === 2 ? 'Painel do Mesário' : 'Dashboard';
$tagTituloCompacto = 'h1';
$mostrarVoltar = $nivelUsuario === 2;
$mostrarVoltarHeader = $nivelUsuario === 2;
$urlVoltar = $nivelUsuario === 2 ? \App\Shared\Http\Url::to('painel') : \App\Shared\Http\Url::to('edicoes');
$urlVoltarMobile = $nivelUsuario === 2 ? \App\Shared\Http\Url::to('painel') : \App\Shared\Http\Url::to('edicoes/agenda');
$idVoltarMobile = $nivelUsuario === 2 ? 'sgiBtnVoltarMesario' : 'sgiBtnVoltar';
include SGI_ROOT . '/resources/views/components/admin-head.php';
include SGI_ROOT . '/resources/views/components/admin-header.php';
$paginaAtiva = 'dashboard';
$isAdmin = $nivelUsuario === 0;
$isColaborador = $nivelUsuario === 1;
$isMesario = $nivelUsuario === 2;
?>

<?php if ($isMesario): ?>
<div class="d-none d-md-flex align-items-center gap-3 sgi-mesario-topbar">
    <a href="<?= \App\Shared\Http\Url::to('painel') ?>"
       id="sgiBtnVoltarMesarioDesk"
       class="sgi-back-button"
       aria-label="Voltar"
       title="Voltar">
        <i class="bi bi-arrow-left" aria-hidden="true"></i>
    </a>
    <h2 class="h4 fw-bold text-body m-0"><?= htmlspecialchars($titulo, ENT_QUOTES, 'UTF-8') ?></h2>
</div>
<?php endif; ?>

<!-- Casca fixa do SPA do mesário: o conteúdo desta div é trocado
     dinamicamente pelas telas baixadas pelo mesario-offline.js.
     Header/Nav/Footer (componentes) permanecem fixos na página. -->
<div id="conteudo-principal" data-sgi-shell="1">
    <main class="main-desktop-layout main-dashboard-layout sgi-u-min-width-0">
        <div class="container-fluid px-0 sgi-u-min-width-0">
            <?php if (!$isMesario): ?>
            <h1 class="h3 fw-bold text-body mb-4 d-none d-md-block"><?= htmlspecialchars($titulo, ENT_QUOTES, 'UTF-8') ?></h1>
            <?php endif; ?>

        <?php if ($isAdmin): ?>
        <div id="avisoFinalizacaoInterclasse" class="d-none alert alert-warning mb-4">
            <span>O interclasse está inativo no momento.</span>
        </div>
        <?php endif; ?>

        <?php
        $cardsDashboard = [];
        if ($isMesario) {
            $cardsDashboard = [
                ['id' => 'linkAgenda', 'href' => \App\Shared\Http\Url::to('edicoes/agenda'), 'iconWrap' => 'bg-primary-subtle text-primary', 'icon' => 'bi-calendar3', 'title' => 'AGENDA', 'desc' => 'Visualize o cronograma dos jogos, acesse o placar e acompanhe os resultados das partidas.'],
                ['id' => 'linkChaveamentos', 'href' => \App\Shared\Http\Url::to('chaveamento'), 'iconWrap' => 'bg-primary-subtle text-primary', 'icon' => 'bi-diagram-3', 'title' => 'CHAVEAMENTOS', 'desc' => 'Visualize os chaveamentos e acesse os confrontos das modalidades.'],
                ['id' => 'linkOcorrencias', 'href' => \App\Shared\Http\Url::to('ocorrencias'), 'iconWrap' => 'bg-warning-subtle text-warning-emphasis', 'icon' => 'bi-exclamation-triangle', 'title' => 'OCORRÊNCIAS', 'desc' => 'Registre ocorrências e aplique descontos de pontos nas turmas.'],
            ];
        } elseif ($isColaborador) {
            $cardsDashboard = [
                ['id' => 'linkModalidades', 'href' => \App\Shared\Http\Url::to('modalidades'), 'iconWrap' => 'bg-primary-subtle text-primary', 'icon' => 'bi-trophy', 'title' => 'MODALIDADES', 'desc' => 'Visualize e crie novas modalidades esportivas para a competição.'],
                ['id' => 'linkPontuacoes', 'href' => \App\Shared\Http\Url::to('edicoes/pontuacao'), 'iconWrap' => 'bg-primary-subtle text-primary', 'icon' => 'bi-award', 'title' => 'PONTUAÇÕES', 'desc' => 'Acompanhe a tabela de pontos e o desempenho das equipes.'],
                ['id' => 'linkLocais', 'href' => \App\Shared\Http\Url::to('edicoes/locais'), 'iconWrap' => 'bg-info-subtle text-info-emphasis', 'icon' => 'bi-geo-alt', 'title' => 'LOCAIS E REGULAMENTO', 'desc' => 'Cadastre e visualize os locais onde os jogos acontecem.'],
                ['id' => 'linkColaboradores', 'href' => \App\Shared\Http\Url::to('colaboradores'), 'iconWrap' => 'bg-success-subtle text-success', 'icon' => 'bi-people', 'title' => 'COLABORADORES', 'desc' => 'Gerencie a equipe de apoio e voluntários do evento.'],
                ['id' => 'linkArrecadacoes', 'href' => \App\Shared\Http\Url::to('edicoes/arrecadacao'), 'iconWrap' => 'bg-info-subtle text-info-emphasis', 'icon' => 'bi-basket', 'title' => 'ARRECADAÇÕES', 'desc' => 'Adicione e acompanhe os kg arrecadados na gincana.'],
                ['id' => 'linkOcorrenciasColab', 'href' => \App\Shared\Http\Url::to('ocorrencias'), 'iconWrap' => 'bg-warning-subtle text-warning-emphasis', 'icon' => 'bi-exclamation-triangle', 'title' => 'OCORRÊNCIAS', 'desc' => 'Registre ocorrências e aplique descontos de pontos nas turmas.'],
                ['id' => 'linkCategorias', 'href' => \App\Shared\Http\Url::to('categorias'), 'iconWrap' => 'bg-primary-subtle text-primary', 'icon' => 'bi-bookmark', 'title' => 'CATEGORIAS', 'desc' => 'Configure as divisões da competição por faixa ou nível.'],
                ['id' => 'linkTurmas', 'href' => \App\Shared\Http\Url::to('turmas'), 'iconWrap' => 'bg-success-subtle text-success', 'icon' => 'bi-backpack', 'title' => 'TURMAS', 'desc' => 'Visualize as turmas participantes e acesse os estudantes.'],
                ['id' => 'linkEquipes', 'href' => \App\Shared\Http\Url::to('edicoes/equipes'), 'iconWrap' => 'bg-success-subtle text-success', 'icon' => 'bi-diagram-3', 'title' => 'EQUIPES', 'desc' => 'Visualize equipes por modalidade e crie novas equipes.'],
                ['id' => 'linkRanking', 'href' => \App\Shared\Http\Url::to('ranking'), 'iconWrap' => 'bg-primary-subtle text-primary', 'icon' => 'bi-trophy', 'title' => 'RANKING', 'desc' => 'Visualize o ranking geral de pontuações por categoria.'],
            ];
        } elseif ($isAdmin) {
            $cardsDashboard = [
                ['id' => 'linkModalidades', 'href' => \App\Shared\Http\Url::to('edicoes/modalidades'), 'iconWrap' => 'bg-primary-subtle text-primary', 'icon' => 'bi-trophy', 'title' => 'MODALIDADES', 'desc' => 'Cadastre e gerencie as modalidades esportivas, regulamentos e especificações de cada competição.'],
                ['id' => 'linkPontuacoes', 'href' => \App\Shared\Http\Url::to('edicoes/pontuacao'), 'iconWrap' => 'bg-primary-subtle text-primary', 'icon' => 'bi-award', 'title' => 'PONTUAÇÕES', 'desc' => 'Acompanhe a tabela de pontos, critérios de classificação e o histórico de pontuação das equipes.'],
                ['id' => 'linkLocais', 'href' => \App\Shared\Http\Url::to('edicoes/locais'), 'iconWrap' => 'bg-info-subtle text-info-emphasis', 'icon' => 'bi-building-gear', 'title' => 'LOCAIS E REGULAMENTO DO INTERCLASSE', 'desc' => 'Cadastre quadras, ginásios e demais espaços usados nos jogos antes de montar a agenda e cadastre e atualize o regulamento do interclasse.'],
                ['id' => 'linkAgenda', 'href' => \App\Shared\Http\Url::to('edicoes/agenda'), 'iconWrap' => 'bg-primary-subtle text-primary', 'icon' => 'bi-calendar3', 'title' => 'AGENDA', 'desc' => 'Organize o cronograma dos jogos, definição de confrontos, datas e horários das partidas.'],
                ['id' => 'linkArrecadacoes', 'href' => \App\Shared\Http\Url::to('edicoes/arrecadacao'), 'iconWrap' => 'bg-info-subtle text-info-emphasis', 'icon' => 'bi-basket', 'title' => 'ARRECADAÇÕES', 'desc' => 'Gerencie os kg arrecadados na gincana, metas, pontos de entrega e o impacto das doações.'],
                ['id' => 'linkOcorrenciasAdmin', 'href' => \App\Shared\Http\Url::to('ocorrencias'), 'iconWrap' => 'bg-warning-subtle text-warning-emphasis', 'icon' => 'bi-exclamation-triangle', 'title' => 'OCORRÊNCIAS', 'desc' => 'Registre ocorrências e aplique descontos de pontos nas turmas por modalidade.'],
                ['id' => 'linkCategorias', 'href' => \App\Shared\Http\Url::to('edicoes/categorias'), 'iconWrap' => 'bg-primary-subtle text-primary', 'icon' => 'bi-bookmark', 'title' => 'CATEGORIAS', 'desc' => 'Configure as divisões da competição por faixa etária, gênero ou nível técnico dos participantes.'],
                ['id' => 'linkColaboradores', 'href' => \App\Shared\Http\Url::to('colaboradores'), 'iconWrap' => 'bg-success-subtle text-success', 'icon' => 'bi-people', 'title' => 'COLABORADORES', 'desc' => 'Gerencie a equipe de organização, voluntários, comissão técnica e juízes do evento.'],
                ['id' => 'linkTurmas', 'href' => \App\Shared\Http\Url::to('turmas'), 'iconWrap' => 'bg-success-subtle text-success', 'icon' => 'bi-backpack', 'title' => 'TURMAS', 'desc' => 'Categorias e turmas desta edição: cadastro, PDF de estudantes e acesso às equipes por turma.'],
                ['id' => 'linkEquipes', 'href' => \App\Shared\Http\Url::to('edicoes/equipes'), 'iconWrap' => 'bg-success-subtle text-success', 'icon' => 'bi-people', 'title' => 'EQUIPES', 'desc' => 'Visualize equipes por categoria e modalidade e abra o elenco de cada turma.'],
                ['id' => 'linkChaveamento', 'href' => \App\Shared\Http\Url::to('chaveamento'), 'iconWrap' => 'bg-primary-subtle text-primary', 'icon' => 'bi-diagram-3', 'title' => 'CHAVEAMENTO', 'desc' => 'Visualize a árvore completa do chaveamento mata-mata: confrontos, resultados e avanço das equipes.'],
                ['id' => 'linkRanking', 'href' => \App\Shared\Http\Url::to('ranking'), 'iconWrap' => 'bg-primary-subtle text-primary', 'icon' => 'bi-trophy', 'title' => 'RANKING', 'desc' => 'Visualize o ranking geral de pontuações por categoria.'],
            ];
        }
        ?>

        <div class="row row-cols-1 row-cols-sm-2 row-cols-lg-3 g-3 g-xl-4 mt-2">
            <?php foreach ($cardsDashboard as $card): ?>
            <div class="col-12 col-md-6 col-lg-4">
                <a href="<?= htmlspecialchars($card['href'], ENT_QUOTES, 'UTF-8') ?>" id="<?= htmlspecialchars($card['id'], ENT_QUOTES, 'UTF-8') ?>" class="card h-100 p-4 text-decoration-none shadow-sm">
                    <div class="d-flex align-items-center gap-3 mb-3">
                        <div class="<?= htmlspecialchars($card['iconWrap'], ENT_QUOTES, 'UTF-8') ?> rounded-4 p-3 d-inline-flex align-items-center justify-content-center flex-shrink-0 fs-4"><i class="bi <?= htmlspecialchars($card['icon'], ENT_QUOTES, 'UTF-8') ?>" aria-hidden="true"></i></div>
                        <h5 class="h5 mb-0 fw-semibold text-body"><?= htmlspecialchars($card['title'], ENT_QUOTES, 'UTF-8') ?></h5>
                        <i class="bi bi-chevron-right text-body-tertiary ms-auto fs-5" aria-hidden="true"></i>
                    </div>
                    <p class="card-text text-body-secondary mb-0"><?= htmlspecialchars($card['desc'], ENT_QUOTES, 'UTF-8') ?></p>
                </a>
            </div>
            <?php endforeach; ?>
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
