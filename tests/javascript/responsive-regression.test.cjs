const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const sharedScss = fs.readFileSync(path.join(root, 'resources', 'scss', 'shared.scss'), 'utf8');
const loginCss = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'login.css'), 'utf8');
const placarJs = fs.readFileSync(path.join(root, 'resources', 'js', 'pages', 'competicoes', 'placar.js'), 'utf8');
const bracketJs = fs.readFileSync(path.join(root, 'resources', 'js', 'pages', 'competicoes', 'chaveamento.js'), 'utf8');
const offlineCore = fs.readFileSync(path.join(root, 'resources', 'js', 'offline', 'offline-core.js'), 'utf8');
const mesarioOffline = fs.readFileSync(path.join(root, 'resources', 'js', 'offline', 'mesario-offline.js'), 'utf8');
const adminCss = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'admin.css'), 'utf8');
const placarView = fs.readFileSync(path.join(root, 'resources', 'views', 'pages', 'competicoes', 'placar.php'), 'utf8');
const agendaView = fs.readFileSync(path.join(root, 'resources', 'views', 'pages', 'eventos', 'configurar-agenda.php'), 'utf8');
const bracketView = fs.readFileSync(path.join(root, 'resources', 'views', 'pages', 'competicoes', 'chaveamento.php'), 'utf8');
const ocorrenciasView = fs.readFileSync(path.join(root, 'resources', 'views', 'pages', 'disciplina', 'ocorrencias.php'), 'utf8');
const jogosView = fs.readFileSync(path.join(root, 'resources', 'views', 'pages', 'competicoes', 'jogos.php'), 'utf8');
const dashboardView = fs.readFileSync(path.join(root, 'resources', 'views', 'pages', 'eventos', 'dashboard.php'), 'utf8');
const perfilView = fs.readFileSync(path.join(root, 'resources', 'views', 'pages', 'acesso', 'perfil.php'), 'utf8');
const adminNav = fs.readFileSync(path.join(root, 'resources', 'views', 'components', 'admin-nav.php'), 'utf8');
const alunoNav = fs.readFileSync(path.join(root, 'resources', 'views', 'components', 'aluno-nav.php'), 'utf8');

test('o shell compartilhado mantém duas composições e prioriza o limite de 1200px', () => {
    assert.match(sharedScss, /--sgi-compact-breakpoint:\s*1200px/);
    assert.match(sharedScss, /@media\s*\(max-width:\s*1199\.98px\)[\s\S]*\.d-none\.d-md-block/);
    assert.match(sharedScss, /@media\s*\(max-width:\s*1199\.98px\)[\s\S]*\.main-desktop-layout[\s\S]*padding-bottom:\s*\.75rem/);
    assert.match(sharedScss, /\.sgi-mobile-menu-trigger[\s\S]*display:\s*inline-flex\s*!important/);
    assert.ok(
        sharedScss.lastIndexOf('@media (max-width: 1199.98px)')
            > sharedScss.lastIndexOf('@media (max-width: 767.98px)'),
        'a composição compacta deve vencer as regras legadas de 768px'
    );
    assert.match(loginCss, /@media\s*\(min-width:\s*768px\)\s*and\s*\(max-width:\s*1199\.98px\)/);
    assert.match(loginCss, /body > main\.login-mobile-layout[\s\S]*display:\s*flex\s*!important/);
    assert.match(loginCss, /@media\s*\(orientation:\s*landscape\)\s*and\s*\(max-width:\s*1199\.98px\)/);
    assert.match(loginCss, /\.login-mobile-layout[\s\S]*flex-direction:\s*row\s*!important/);
    assert.match(loginCss, /\.login-mobile-form \.form-control[\s\S]*min-height:\s*48px/);
});

test('o placar coletivo mantém timer e equipes na mesma raiz responsiva', () => {
    assert.match(placarJs, /var html = '<div class="mc-scoreboard-main">';/);
    assert.match(placarJs, /mc-timer-panel/);
    assert.match(placarJs, /mc-teams-row/);
    assert.match(placarJs, /mc-individual-ranking-row/);
    assert.match(placarJs, /html \+= '<\/div><\/div>';/);
    assert.match(adminCss, /\.sgi-placar \[class~="mc-vs"\][\s\S]*display:\s*none\s*!important/);
    assert.match(placarView, /class="main-desktop-layout sgi-placar"/);
    assert.match(placarView, /\$compacteCabecalho\s*=\s*true/);
});

test('o aviso offline mede sua altura para não cobrir o cabeçalho', () => {
    assert.match(offlineCore, /--sgi-offline-banner-height/);
    assert.match(offlineCore, /getBoundingClientRect\(\)\.height/);
    assert.match(offlineCore, /new ResizeObserver\(atualizarAlturaBanner\)/);
    assert.match(sharedScss, /\.sgi-offline-banner\s*\{[\s\S]*z-index:\s*1040/);
});

test('a casca SPA não duplica o menu compacto ao remontar uma tela', () => {
    assert.match(mesarioOffline, /el\.matches\('\.sgi-mobile-menu-trigger, \.sgi-mobile-menu'\)/);
    assert.match(mesarioOffline, /el\.closest\('\.sgi-mobile-menu'\)/);
});

test('a casca SPA copia somente a raiz dos modais das telas internas', () => {
    assert.match(mesarioOffline, /var seletorPerifericos = '\[data-bs-toggle="modal"\],\[data-bs-target\],\[id\*="modal" i\],\[class\*="fab"\]';/);
    assert.match(
        mesarioOffline,
        /if \(el\.parentElement && el\.parentElement\.closest\(seletorPerifericos\)\) return;/,
        'campos com ids como ocrTituloModal não podem ser montados sem o contêiner .modal'
    );
    assert.match(ocorrenciasView, /<div class="modal fade" id="modalNovaOcorrencia"/);
});

test('a Agenda usa apenas o seu cabeçalho quando aberta pela casca do mesário', () => {
    assert.match(dashboardView, /class="d-none d-md-flex align-items-center gap-3 sgi-mesario-topbar"/);
    assert.match(
        mesarioOffline,
        /document\.querySelectorAll\('\.sgi-mesario-topbar'\)\.forEach\(function \(topbar\) \{[\s\S]*?var mostrar = tela === 'dashboard';[\s\S]*?topbar\.classList\.toggle\('sgi-mesario-topbar--oculta', !mostrar\);/,
        'o cabeçalho persistente deve ficar oculto nas telas filhas, que já possuem cabeçalho próprio'
    );
    assert.match(sharedScss, /\.sgi-mesario-topbar\.sgi-mesario-topbar--oculta\s*\{[\s\S]*?display:\s*none\s*!important;/);
    assert.match(agendaView, /include SGI_ROOT \. '\/resources\/views\/components\/page-header\.php';/);
});

test('as telas operacionais mantêm raízes compactas e desktop separadas', () => {
    assert.match(agendaView, /d-md-none ag-mobile sgi-agenda-mobile/);
    assert.match(agendaView, /d-none d-md-block main-desktop-layout sgi-agenda-desktop/);
    assert.match(bracketView, /d-md-none sgi-chaveamento-mobile/);
    assert.match(bracketView, /d-none d-md-block main-desktop-layout sgi-chaveamento-desktop/);
    assert.match(ocorrenciasView, /d-md-none sgi-ocorrencias-mobile/);
    assert.match(ocorrenciasView, /d-none d-md-block main-desktop-layout sgi-ocorrencias-desktop/);
    assert.match(jogosView, /main-desktop-layout sgi-jogos-lista/);
    assert.match(perfilView, /d-md-none sgi-perfil-mobile/);
    assert.match(perfilView, /main-desktop-layout sgi-perfil-desktop/);
});

test('agenda, chaveamento e ocorrências preservam semântica, overflow e alvos de toque', () => {
    assert.match(adminCss, /section\.sgi-u-h-120px[\s\S]*height:\s*72px\s*!important/);
    assert.match(adminCss, /section\.sgi-u-h-120px > a\.sgi-u-top-20px-left-20px-z-10[\s\S]*width:\s*48px/);
    assert.match(adminCss, /\.sgi-agenda-mobile \.form-control,[\s\S]*min-height:\s*48px/);
    assert.match(adminCss, /#bracketAreaMob \.bracket-tree[\s\S]*flex-direction:\s*column/);
    assert.match(adminCss, /\.sgi-chaveamento-mobile[\s\S]*padding:\s*\.75rem\s*!important/);
    assert.match(adminCss, /#bracketAreaMob \.bkt-connector[\s\S]*display:\s*none/);
    assert.match(
        adminCss,
        /#secaoJogos \.table-responsive,[\s\S]*?#secaoJogosMob \.table-responsive\s*\{[^}]*overflow-x:\s*auto;[^}]*overscroll-behavior-inline:\s*contain/,
        'a tabela extensa conserva rolagem horizontal contida no próprio histórico'
    );
    assert.match(
        adminCss,
        /#secaoJogos \.table,[\s\S]*?#secaoJogosMob \.table\s*\{[^}]*min-width:\s*980px;[^}]*table-layout:\s*auto/,
        'a largura da tabela não é truncada para eliminar o overflow real'
    );
    assert.match(adminCss, /#secaoJogosMob \.table thead th\s*\{[^}]*white-space:\s*nowrap/);
    assert.doesNotMatch(adminCss, /#secaoJogosMob \.table thead\s*\{[^}]*display:\s*none/);
    assert.match(bracketView, /<th id="jogos-mob-th-partida" scope="col">Partida<\/th>/);
    assert.match(bracketView, /<th id="jogos-mob-th-acoes" scope="col" class="text-end">Ações<\/th>/);
    assert.match(bracketJs, /<td headers="\$\{prefixoCabecalho\}partida"/);
    assert.match(adminCss, /#secaoJogosMob \.form-control,[\s\S]*#bracketAreaMob \.btn[\s\S]*min-height:\s*48px/);
    assert.match(adminCss, /#secaoJogosMob \.table td:last-child \.btn\s*\{[^}]*min-width:\s*48px;[^}]*min-height:\s*48px/);
    assert.match(
        bracketJs,
        /function acoesBracketSempreVisiveis\(\)[\s\S]*return composicaoCompactaAtiva\(\) \|\| !ponteiroComHover/,
        'ações do chaveamento permanecem visíveis na composição compacta ou sem mouse preciso'
    );
    assert.match(bracketJs, /const actionVisibility = acoesBracketSempreVisiveis\(\) \? ' opacity-100' : ''/);
    assert.match(
        adminCss,
        /@media\s*\(max-width:\s*1199\.98px\),\s*\(hover:\s*none\),\s*\(pointer:\s*coarse\)\s*\{[^}]*\.bkt-match__actions\s*\{\s*opacity:\s*1;/
    );
    assert.match(adminCss, /\.sgi-ocorrencias-mobile #listaOcorrenciasMobile \.card \.btn[\s\S]*min-height:\s*48px/);
    assert.match(agendaView + bracketView + ocorrenciasView, /modal-fullscreen-xl-down/);
    assert.match(adminCss, /\.modal-fullscreen-xl-down \.modal-footer \.btn[\s\S]*min-height:\s*48px/);
    assert.match(adminCss, /\.modal-fullscreen-xl-down \.btn-close[\s\S]*min-width:\s*48px/);
    const compactAdminRules = adminCss.match(
        /@media\s*\(max-width:\s*1199\.98px\)\s*\{([\s\S]*?)^\}/m
    );
    assert.match(dashboardView, /row row-cols-1 row-cols-sm-2 row-cols-lg-3 g-3 g-xl-4 mt-2/);
    assert.match(jogosView, /row row-cols-1 row-cols-sm-2 row-cols-lg-3 g-3/);
    assert.doesNotMatch(adminCss, /\.main-dashboard-layout \.row > \.col-12\.col-md-6\s*\{/);
    assert.doesNotMatch(adminCss, /#listaJogos > \.col-12\s*\{/);
    assert.ok(compactAdminRules, 'o shell compacto continua limitado a menos de 1200px');
    assert.match(adminCss, /\.sgi-perfil-mobile #btnCameraMob[\s\S]*min-width:\s*48px/);
    assert.match(adminCss, /\.sgi-placar \.mc-individual-ranking-row > \.col-md-4[\s\S]*max-width:\s*33\.333333%/);
    assert.match(adminCss, /\.sgi-placar \.mc-individual-ranking-row \.form-select[\s\S]*min-height:\s*48px/);
    assert.match(bracketJs, /composicaoCompactaAtiva/);
    assert.match(bracketJs, /redesenharConectoresVisiveis/);
    assert.match(bracketJs, /agendarRedesenhoConectores/);
    assert.match(bracketJs, /pageScope\.onDeactivate\(\(\) =>/);
    assert.match(bracketJs, /cancelAnimationFrame/);
    assert.match(bracketJs, /getClientRects\(\)\.length === 0/);
});

test('os dois perfis preservam destinos e logout no Menu compacto', () => {
    for (const navigation of [adminNav, alunoNav]) {
        assert.match(navigation, /sgi-mobile-menu-trigger/);
        assert.match(navigation, /id="sgiMobileMenu"/);
        assert.match(navigation, /sgi-mobile-menu-link/);
        assert.match(navigation, /data-sgi-logout/);
        assert.match(navigation, /aria-label="Fechar menu"/);
    }
});
