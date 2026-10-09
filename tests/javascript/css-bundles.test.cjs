const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
const bundles = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'css-bundles.json'), 'utf8'));

function readTree(directory, extensions, files = []) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            readTree(file, extensions, files);
        } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
            files.push(file);
        }
    }
    return files;
}

test('CSS bundles share one themed Bootstrap entrypoint', () => {
    assert.deepEqual(bundles['bootstrap-theme'], ['resources/scss/bootstrap-theme.scss']);
    assert.deepEqual(bundles.shared, ['resources/scss/shared.scss', 'resources/css/source/utilities.css']);
    assert.ok(bundles.admin.includes('resources/css/source/admin.css'));
    assert.ok(bundles.aluno.includes('resources/css/source/aluno-shared.css'));
    assert.ok(bundles.login.includes('resources/css/source/login.css'));
});

test('asset build publishes only Bootstrap JavaScript beside the themed CSS', () => {
    const build = fs.readFileSync(path.join(root, 'tools', 'build-assets.cjs'), 'utf8');
    assert.match(build, /name === 'bootstrap'[\s\S]*bootstrap\.bundle\.min\.js/);
});

test('context heads do not load Bootstrap vendor CSS alongside the theme', () => {
    const heads = [
        path.join(root, 'resources', 'views', 'components', 'admin-head.php'),
        path.join(root, 'resources', 'views', 'components', 'aluno-head.php'),
        path.join(root, 'resources', 'views', 'pages', 'acesso', 'login.php'),
    ].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
    assert.equal((heads.match(/vendor\/bootstrap\/css\/bootstrap\.min\.css/g) || []).length, 0);
    assert.ok((heads.match(/css\/bootstrap-theme\.css/g) || []).length >= 3);
    assert.ok((heads.match(/css\/shared\.css/g) || []).length >= 2);
    assert.doesNotMatch(fs.readFileSync(path.join(root, 'resources', 'views', 'pages', 'acesso', 'login.php'), 'utf8'), /css\/shared\.css/);
});

test('shared contexts load the Bootstrap feedback helper', () => {
    const adminHead = fs.readFileSync(path.join(root, 'resources', 'views', 'components', 'admin-head.php'), 'utf8');
    const alunoHead = fs.readFileSync(path.join(root, 'resources', 'views', 'components', 'aluno-head.php'), 'utf8');
    const helper = fs.readFileSync(path.join(root, 'resources', 'js', 'shared', 'bootstrap-feedback.js'), 'utf8');
    assert.match(adminHead, /js\/shared\/bootstrap-feedback\.js/);
    assert.match(alunoHead, /js\/shared\/bootstrap-feedback\.js/);
    assert.match(helper, /Toast\.getOrCreateInstance/);
    assert.match(helper, /textContent = mensagem/);
});

test('legacy global Bootstrap overrides were removed from source CSS', () => {
    const admin = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'admin.css'), 'utf8');
    const login = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'login.css'), 'utf8');
    assert.doesNotMatch(admin, /^\*\s*\{/m);
    assert.doesNotMatch(admin, /^\.btn-danger\s*\{/m);
    assert.doesNotMatch(admin, /\.fw-bold, \.fw-bolder, \.fw-semibold/);
    assert.doesNotMatch(login, /^\.btn-danger\s*\{/m);
});

test('compiled Bootstrap theme exposes the SGI primary token without a BOM', () => {
    const source = fs.readFileSync(path.join(root, 'resources', 'scss', 'bootstrap-theme.scss'), 'utf8');
    assert.match(source, /@use\s+'bootstrap\/scss\/bootstrap'/);
    assert.match(source, /\$primary:\s+theme\.\$primary/);

    const outputPath = path.join(root, 'public', 'assets', 'css', 'bootstrap-theme.css');
    if (!fs.existsSync(outputPath)) return;
    const compiled = fs.readFileSync(outputPath, 'utf8');
    assert.equal(compiled.charCodeAt(0), 47); // the generated source comment starts with '/'
    assert.match(compiled, /--bs-primary:\s*#e30613/);
    assert.match(compiled, /--bs-body-font-family:\s*var\(--bs-font-sans-serif\)/);
    assert.doesNotMatch(compiled, /fonts\.googleapis\.com/);
    assert.match(compiled, /--bs-font-sans-serif:\s*system-ui/);
});

test('all public CSS bundles are emitted without a leading BOM', () => {
    const cssDirectory = path.join(root, 'public', 'assets', 'css');
    if (!fs.existsSync(cssDirectory)) return;
    for (const file of fs.readdirSync(cssDirectory).filter((name) => name.endsWith('.css'))) {
        const contents = fs.readFileSync(path.join(cssDirectory, file));
        assert.notEqual(contents[0], 0xef, `${file} não deve começar com BOM`);
    }
});

test('public manifest does not retain the legacy Bootstrap CSS vendor', () => {
    const manifestPath = path.join(root, 'public', 'assets', 'manifest.json');
    if (!fs.existsSync(manifestPath)) return;
    const manifest = fs.readFileSync(manifestPath, 'utf8');
    assert.doesNotMatch(manifest, /vendor\/bootstrap\/css/);
});

test('shared utility classes all have a template or JavaScript consumer', () => {
    const utilityCss = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'utilities.css'), 'utf8');
    const utilityNames = [...new Set([...utilityCss.matchAll(/\.(sgi-u-[A-Za-z0-9_-]+)/g)].map((match) => match[1]))];
    const sourceFiles = [
        ...readTree(path.join(root, 'resources', 'views'), ['.php', '.html']),
        ...readTree(path.join(root, 'resources', 'js'), ['.js']),
    ];
    const source = sourceFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
    const unused = utilityNames.filter((name) => !new RegExp('\\b' + name + '\\b').test(source));
    assert.deepEqual(unused, [], `Utilitários sem consumidor: ${unused.join(', ')}`);
});

test('shared custom utilities are restricted to documented domain exceptions', () => {
    const utilityCss = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'utilities.css'), 'utf8');
    const allowed = new Set([
        'sgi-u-cursor-pointer',
        'sgi-u-w-0',
        'sgi-u-h-60px-w-60px-bottom-100px',
        'sgi-u-max-height-60vh-overflow-y-auto',
        'sgi-u-h-120px',
        'sgi-u-top-20px-left-20px-z-10',
        'sgi-u-min-width-0',
    ]);
    const names = [...new Set([...utilityCss.matchAll(/\.(sgi-u-[A-Za-z0-9_-]+)/g)].map((match) => match[1]))];
    assert.deepEqual(names.filter((name) => !allowed.has(name)), []);
});

test('legacy duplicate component blocks remain removed', () => {
    const admin = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'admin.css'), 'utf8');
    const utilities = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'utilities.css'), 'utf8');
    assert.doesNotMatch(admin, /\.bracket-container\s*\{|\.bracket-wrapper\s*\{|\.placar-wrapper\s*\{|\.table-custom\s*\{/);
    assert.doesNotMatch(admin, /\.style-card\s*\{|\.colaborador-card\s*\{|\.acao-btn\s*\{|\.card-custom\s*\{/);
    assert.doesNotMatch(admin, /--vermelho\s*:/);
    assert.doesNotMatch(utilities, /sgi-u-z-1040-h-64px|sgi-u-w-80px-top-0-bottom-0/);
    assert.doesNotMatch(utilities, /sgi-u-display-none(?:-mt-10px)?\b|sgi-u-(?:w-100|maxw-100|h-100)(?!-)|sgi-u-p-24px\b/);
});

test('feedback and data cards use Bootstrap components instead of custom duplicates', () => {
    const adminCss = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'admin.css'), 'utf8');
    const alunoCss = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'aluno-home.css'), 'utf8');
    const sources = [
        path.join(root, 'resources', 'js', 'pages', 'participantes', 'turmas.js'),
        path.join(root, 'resources', 'js', 'pages', 'disciplina', 'ocorrencias.js'),
        path.join(root, 'resources', 'js', 'pages', 'eventos', 'configurar-arrecadacao.js'),
        path.join(root, 'resources', 'views', 'pages', 'participantes', 'turmas.php'),
        path.join(root, 'resources', 'views', 'pages', 'acesso', 'perfil.php'),
        path.join(root, 'resources', 'views', 'pages', 'aluno', 'perfil.php'),
        path.join(root, 'resources', 'views', 'pages', 'eventos', 'dashboard.php'),
    ].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
    assert.doesNotMatch(adminCss, /\.toast-sgi|\.skeleton-card|\.ocr-card(?:__|\s*\{)|\.dash-card|\.perfil-toast|\.perfil-avatar-skeleton/);
    assert.doesNotMatch(alunoCss, /\.perfil-toast|\.perfil-avatar-skeleton/);
    assert.doesNotMatch(sources, /toast-sgi|skeleton-card|ocr-card__|dash-card|perfil-toast|perfil-avatar-skeleton/);
    assert.match(sources, /toast-container/);
    assert.match(sources, /placeholder-glow/);
    assert.match(sources, /data-sgi-action="save-arrecadacao"/);
    assert.match(sources, /card h-100 p-4 text-decoration-none shadow-sm/);
});

test('native Bootstrap display and sizing utilities are used in migrated markup', () => {
    const sourceFiles = [
        ...readTree(path.join(root, 'resources', 'views'), ['.php', '.html']),
        ...readTree(path.join(root, 'resources', 'js'), ['.js']),
    ];
    const source = sourceFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
    assert.doesNotMatch(source, /sgi-u-display-none(?:-mt-10px)?\b|sgi-u-(?:w-100|maxw-100|h-100)(?!-)|sgi-u-p-24px\b/);
    assert.match(source, /\bd-none\b/);
    assert.match(source, /\bw-100\b/);
    assert.match(source, /\bh-100\b/);
    assert.match(source, /\bmw-100\b/);
    assert.match(source, /\bp-4\b/);
});

test('SGI aluno design tokens are defined once in shared CSS', () => {
    const shared = fs.readFileSync(path.join(root, 'resources', 'scss', 'shared.scss'), 'utf8');
    const admin = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'admin.css'), 'utf8');
    const aluno = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'aluno-shared.css'), 'utf8');
    assert.match(shared, /--aluno-primary:\s+var\(--bs-primary\)/);
    assert.doesNotMatch(admin, /--aluno-primary\s*:/);
    assert.doesNotMatch(aluno, /--aluno-primary\s*:/);
});

test('danger is reserved for destructive actions', () => {
    const sourceFiles = [
        ...readTree(path.join(root, 'resources', 'views'), ['.php', '.html']),
        ...readTree(path.join(root, 'resources', 'js'), ['.js']),
    ];
    const invalid = [];
    sourceFiles.forEach((file) => {
        fs.readFileSync(file, 'utf8').split('\n').forEach((line) => {
            if (line.includes('btn-danger') && !/exclu|delete/i.test(line)) invalid.push(file);
        });
    });
    assert.deepEqual(invalid, [], 'btn-danger deve aparecer apenas em ações destrutivas');
});

test('ranking filters use Bootstrap states in PHP and JavaScript consumers', () => {
    const sources = [
        path.join(root, 'resources', 'js', 'pages', 'resultados', 'ranking.js'),
        path.join(root, 'resources', 'js', 'pages', 'aluno', 'ranking.js'),
        path.join(root, 'resources', 'css', 'source', 'admin.css'),
        path.join(root, 'resources', 'css', 'source', 'aluno-home.css'),
    ].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
    assert.match(sources, /btn-sm btn-outline-primary rounded-pill btn-categoria/);
    assert.match(sources, /classList\.toggle\('active'/);
    assert.doesNotMatch(sources, /\.btn-categoria\.(ativo|rk-cat-btn)/);
    assert.doesNotMatch(sources, /\.rk-hist-btn\s*\{/);
});

test('team actions use native Bootstrap button variants', () => {
    const adminCss = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'admin.css'), 'utf8');
    const sources = [
        path.join(root, 'resources', 'views', 'pages', 'competicoes', 'equipe-alunos.php'),
        path.join(root, 'resources', 'views', 'pages', 'competicoes', 'elenco-equipe.php'),
        path.join(root, 'resources', 'views', 'pages', 'eventos', 'configurar-equipes.php'),
        path.join(root, 'resources', 'js', 'pages', 'competicoes', 'elenco-equipe.js'),
        path.join(root, 'resources', 'js', 'pages', 'eventos', 'configurar-equipes.js'),
    ].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
    assert.doesNotMatch(sources, /\bbtn-aluno\b/);
    assert.match(sources, /btn-primary/);
    assert.match(sources, /btn-outline-primary/);
    assert.doesNotMatch(adminCss, /\.btn-filter-cat\s*\{/);
});

test('clicking a classroom row opens the teams for that classroom', () => {
    const script = fs.readFileSync(
        path.join(root, 'resources', 'js', 'pages', 'eventos', 'configurar-equipes.js'),
        'utf8'
    );
    assert.match(script, /data-turma-card data-mod=/);
    assert.match(script, /e\.target\.closest\('\[data-turma-card\]'\)/);
    assert.match(script, /abrirEquipes\(turmaCard\.closest\('\.aluno-card'\), turmaCard\.dataset\.mod, turmaCard\.dataset\.turma\)/);
});

test('team and roster views use Bootstrap layout and component utilities', () => {
    const adminCss = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'admin.css'), 'utf8');
    const sharedCss = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'aluno-shared.css'), 'utf8');
    const sources = [
        path.join(root, 'resources', 'views', 'pages', 'competicoes', 'equipe-alunos.php'),
        path.join(root, 'resources', 'views', 'pages', 'competicoes', 'elenco-equipe.php'),
        path.join(root, 'resources', 'views', 'pages', 'eventos', 'configurar-equipes.php'),
        path.join(root, 'resources', 'js', 'pages', 'competicoes', 'equipe-alunos.js'),
        path.join(root, 'resources', 'js', 'pages', 'competicoes', 'elenco-equipe.js'),
        path.join(root, 'resources', 'js', 'pages', 'eventos', 'configurar-equipes.js'),
    ].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
    assert.match(sources, /table table-hover align-middle mb-0/);
    assert.match(sources, /row row-cols-1 row-cols-lg-2 g-4/);
    assert.match(sources, /card h-100 border-0 shadow-sm rounded-4/);
    assert.doesNotMatch(adminCss, /\.aluno-page-header|\.aluno-table|\.aluno-card-grid|\.aluno-card-item|\.card-header-custom|\.card-body-custom|\.aluno-turma-item|\.aluno-equipe-item|\.aluno-member-item|\.aluno-empty|\.aluno-search/);
    assert.doesNotMatch(sharedCss, /\.aluno-section-header|\.aluno-page-header|\.aluno-empty|\.aluno-loading|\.aluno-search/);
});

test('portal cards use native Bootstrap actions and status badges', () => {
    const js = fs.readFileSync(path.join(root, 'resources', 'js', 'pages', 'aluno', 'home.js'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'aluno-shared.css'), 'utf8');
    assert.match(js, /btn btn-primary btn-sm/);
    assert.match(js, /badge rounded-pill text-bg-/);
    assert.match(js, /row row-cols-1 row-cols-md-2 row-cols-xl-3 g-4/);
    assert.match(js, /aluno-card card h-100 p-4 shadow-sm/);
    assert.doesNotMatch(js, /\bbtn-card\b|\baluno-status-badge\b/);
    assert.doesNotMatch(css, /\.aluno-card-grid|\.aluno-card\s*\{|\.aluno-card:hover/);
    assert.doesNotMatch(css, /\.aluno-card \.btn-card|\.aluno-status-badge/);
});

test('student status and enrollment actions use Bootstrap components', () => {
    const jogos = fs.readFileSync(path.join(root, 'resources', 'js', 'pages', 'aluno', 'jogos.js'), 'utf8');
    const modalidade = fs.readFileSync(path.join(root, 'resources', 'views', 'pages', 'aluno', 'modalidade.php'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'aluno-pages.css'), 'utf8');
    assert.match(jogos, /badge rounded-pill \$\{status\.classe\}/);
    assert.match(jogos, /text-bg-primary/);
    assert.match(modalidade, /class="btn btn-primary px-4 py-2"/);
    assert.doesNotMatch(css, /\.status-badge|\.status-andamento|\.btn-save\s*\{/);
});

test('student modality enrollment uses native Bootstrap cards and progress', () => {
    const js = fs.readFileSync(path.join(root, 'resources', 'js', 'pages', 'aluno', 'modalidade.js'), 'utf8');
    const view = fs.readFileSync(path.join(root, 'resources', 'views', 'pages', 'aluno', 'modalidade.php'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'aluno-pages.css'), 'utf8');
    assert.match(js, /modalidade-card card border shadow-sm position-relative h-100 p-4/);
    assert.match(view, /row row-cols-1 row-cols-sm-2 row-cols-lg-3 g-3/);
    assert.match(view, /id="progressBar" class="progress-bar"/);
    assert.doesNotMatch(js, /btn-ver-detalhes|bottom-label/);
    assert.doesNotMatch(css, /\.modalidades-grid|\.card-vagas|\.resumo-selecao|\.progress-track|\.progress-seg|\.card-inscrito|\.equipe-pick-row/);
    assert.doesNotMatch(css, /--md-(?:surface|border|primary|success|text-secondary)\s*:/);
});

test('profile layouts use Bootstrap grids, badges and input groups', () => {
    const sources = [
        path.join(root, 'resources', 'views', 'pages', 'aluno', 'perfil.php'),
        path.join(root, 'resources', 'views', 'pages', 'acesso', 'perfil.php'),
    ].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
    const css = [
        path.join(root, 'resources', 'css', 'source', 'aluno-home.css'),
        path.join(root, 'resources', 'css', 'source', 'admin.css'),
    ].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
    assert.match(sources, /row g-4 align-items-start/);
    assert.match(sources, /badge rounded-pill \<\?= \$nivelBadgeClass \?\>/);
    assert.match(sources, /input-group/);
    assert.match(sources, /perfil-password-eye btn btn-outline-secondary/);
    assert.match(sources, /perfil-avatar-ring position-relative flex-shrink-0 mx-auto p-1 rounded-circle bg-primary shadow/);
    assert.match(sources, /position-absolute bottom-0 end-0 z-3 d-inline-flex align-items-center justify-content-center p-2/);
    assert.doesNotMatch(sources, /perfil-(?:grid|field|info-grid|info-item|card-title|badge-nivel|password-input|btn-editar|input)\b|nivel-cor-/);
    assert.doesNotMatch(css, /\.perfil-(?:grid|field|info-grid|info-item|card-title|badge-nivel|password-input|btn-editar|input|avatar-inner|btn-camera)\b|\.perfil-page\b|\.perfil-wrapper\b|linear-gradient\(135deg, #E30613/);
});

test('login banners use local backgrounds for the visible composition only', () => {
    const view = fs.readFileSync(path.join(root, 'resources', 'views', 'pages', 'acesso', 'login.php'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'login.css'), 'utf8');
    assert.match(view, /class="login-mobile-banner" role="img" aria-label="Imagem dos desenvolvedores"/);
    assert.match(view, /class="login-desktop-media[^>]*role="img" aria-label="Imagem dos desenvolvedores"/);
    assert.doesNotMatch(view, /login-(?:mobile|desktop)-banner-(?:image|border)/);
    assert.match(css, /background-image:\s*url\(["']\.\.\/images\/banner-login\.png["']\)/);
    assert.match(css, /background-image:\s*url\(["']\.\.\/images\/banner-login-desktop\.png["']\)/);
});

test('category selection and bracket filtering use Bootstrap utility states', () => {
    const categoryJs = [
        path.join(root, 'resources', 'js', 'pages', 'eventos', 'categorias.js'),
        path.join(root, 'resources', 'js', 'pages', 'eventos', 'configurar-categorias.js'),
    ].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
    const bracketJs = fs.readFileSync(path.join(root, 'resources', 'js', 'pages', 'competicoes', 'chaveamento.js'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'admin.css'), 'utf8');
    assert.match(categoryJs, /data-category-select/);
    assert.match(categoryJs, /setAttribute\('aria-pressed', String\(selecionada\)\)/);
    assert.match(categoryJs, /classList\.toggle\('border-primary', selecionada\)/);
    assert.match(categoryJs, /classList\.toggle\('border-2', selecionada\)/);
    assert.match(bracketJs, /classList\.add\('d-none'\)/);
    assert.doesNotMatch(categoryJs + bracketJs, /categoria-item--selected|tr-filtro-oculto/);
    assert.doesNotMatch(css, /\.categoria-item--selected|\.status\s*\{|\.tr-filtro-oculto|#filtro(?:Categoria|Modalidade)Jogos/);
});

test('shared mobile shells and table presentation rely on Bootstrap defaults', () => {
    const css = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'admin.css'), 'utf8');
    assert.match(css, /#secaoJogos \.table-responsive/);
    assert.match(css, /#secaoJogos \.table,\s*#secaoJogosMob \.table/);
    assert.doesNotMatch(css, /^\.table-responsive\s*\{|^\.table\.table-hover\s*\{|^\.table\.table-hover > tbody > tr > \*/m);
    assert.doesNotMatch(css, /\.main-(?:dashboard|locais)-layout\s*\{/);
});

test('team card switching keeps functional visibility hooks without decorative animation', () => {
    const js = fs.readFileSync(path.join(root, 'resources', 'js', 'pages', 'eventos', 'configurar-equipes.js'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'admin.css'), 'utf8');
    assert.match(css, /\.aluno-card-view \{ display: none; \}/);
    assert.match(css, /\.aluno-card-view\.active \{ display: block; \}/);
    assert.match(css, /\.aluno-card\.equipes-aberta \.aluno-voltar-btn \{ display: inline-flex; \}/);
    assert.match(js, /classList\.add\('equipes-aberta'\)/);
    assert.doesNotMatch(css, /alunoCardFadeIn|animation\s*:/);
});

test('navigation avatars use Bootstrap presentation utilities', () => {
    const sources = [
        path.join(root, 'resources', 'views', 'components', 'admin-nav.php'),
        path.join(root, 'resources', 'views', 'components', 'aluno-nav.php'),
    ].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
    const css = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'admin.css'), 'utf8');
    assert.match(sources, /object-fit-cover rounded-circle border border-2 border-white/);
    assert.match(sources, /d-inline-flex align-items-center justify-content-center rounded-circle bg-white text-danger fw-semibold border border-2 border-white small/);
    assert.doesNotMatch(css, /\.nav-avatar-(?:img|fallback)(?:-mobile)?\s*\{[^}]*\b(?:object-fit|border-radius|background|color|display|align-items|justify-content|font-weight|font-size)\b/);
    assert.doesNotMatch(css, /active-nav-icon \.nav-avatar-(?:img|fallback)/);
});

test('navigation active state keeps semantic hooks without custom motion effects', () => {
    const sources = [
        path.join(root, 'resources', 'views', 'components', 'admin-nav.php'),
        path.join(root, 'resources', 'views', 'components', 'aluno-nav.php'),
    ].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
    const css = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'admin.css'), 'utf8');
    assert.match(sources, /active-nav-icon/);
    assert.doesNotMatch(css, /\.nav li a:hover|\.active-nav-icon\s*\{|\.nav li a i\.bi/);
});

test('navigation shell dimensions are defined by the shared Bootstrap bundle', () => {
    const admin = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'admin.css'), 'utf8');
    const shared = fs.readFileSync(path.join(root, 'resources', 'scss', 'shared.scss'), 'utf8');
    assert.doesNotMatch(shared, /\.mobile-nav|--sgi-mobile-nav-height/);
    assert.doesNotMatch(admin, /\.mobile-nav|--sgi-mobile-nav-height/);
    assert.match(shared, /\.sgi-app-shell \.d-none\.d-md-block/);
    assert.doesNotMatch(shared, /@media \(max-width: 1199\.98px\)[\s\S]*?\n\s*\.d-none\.d-md-block/);
});

test('bracket cards preserve domain states without decorative hover motion', () => {
    const source = fs.readFileSync(path.join(root, 'resources', 'js', 'pages', 'competicoes', 'chaveamento.js'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'admin.css'), 'utf8');
    assert.match(source, /let cls = 'bkt-match card w-100 overflow-hidden position-relative mb-3';/);
    assert.match(css, /\.bkt-match \{\s*position: relative;\s*\}/);
    assert.doesNotMatch(css, /^\.bkt-match\s*\{[^}]*\b(?:background|border|border-radius|overflow|width|margin-bottom)\s*:/m);
    assert.match(css, /\.bkt-match--concluido \{ border-color:/);
    assert.match(css, /\.bkt-match--bye \{ opacity:/);
    assert.match(css, /\.bkt-match--posicao \{ border-color: var\(--bs-primary\); border-width: 2px; \}/);
    assert.match(css, /\.bkt-match:hover \.bkt-match__actions/);
    assert.doesNotMatch(css, /\.bkt-match\s*\{[^}]*transition/);
    assert.doesNotMatch(css, /\.bkt-match:hover\s*\{[^}]*transform|\.bkt-match--(?:concluido|bye):hover|\.bkt-team:hover\s*\{/);
    assert.doesNotMatch(css, /\.bkt-match--posicao\s*\{[^}]*gradient/);
    assert.doesNotMatch(css, /\.bkt-match__actions\s*\{[^}]*transition\s*:/);
    assert.doesNotMatch(css, /\.tl-event-actions\s*\{[^}]*transition\s*:/);
});

test('bracket teams use Bootstrap layout and badge utilities for presentation', () => {
    const source = fs.readFileSync(path.join(root, 'resources', 'js', 'pages', 'competicoes', 'chaveamento.js'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'admin.css'), 'utf8');
    assert.match(source, /const teamBaseCls = 'bkt-team d-flex align-items-center gap-2 py-2 px-3';/);
    assert.match(source, /bkt-team__score badge rounded-pill text-bg-light fs-6 fw-bold/);
    assert.match(source, /bg-success-subtle text-success-emphasis/);
    assert.match(css, /\.bkt-team \{\s*min-width: 0;\s*\}/);
    assert.doesNotMatch(css, /\.bkt-team\s*\{[^}]*\b(?:display|align-items|padding|gap|background|opacity)\s*:/);
    assert.doesNotMatch(css, /\.bkt-team__score\s*\{[^}]*\b(?:font-size|font-weight|color|background|border-radius|padding)\s*:/);
    assert.doesNotMatch(css, /\.bkt-team__trophy\s*\{/);
});

test('searchable bracket group counts use the Bootstrap badge component', () => {
    const source = fs.readFileSync(path.join(root, 'resources', 'js', 'pages', 'competicoes', 'chaveamento.js'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'admin.css'), 'utf8');
    assert.match(source, /kvs__grupo-qtd badge rounded-pill text-bg-light text-body-secondary/);
    assert.match(source, /kvs__grupo-qtd badge rounded-pill text-bg-light text-body-secondary ms-auto/);
    assert.doesNotMatch(css, /\.kvs__grupo-qtd\s*\{/);
});

test('searchable bracket type labels use Bootstrap badge variants', () => {
    const source = fs.readFileSync(path.join(root, 'resources', 'js', 'pages', 'competicoes', 'chaveamento.js'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'admin.css'), 'utf8');
    assert.match(source, /badge rounded-pill bg-primary-subtle text-primary-emphasis/);
    assert.match(source, /badge rounded-pill bg-danger-subtle text-danger-emphasis/);
    assert.match(css, /\.kvs__opcao-tipo \{\s*flex-shrink: 0;\s*letter-spacing: \.02em;\s*\}/);
    assert.doesNotMatch(css, /\.kvs__opcao-tipo\s*\{[^}]*\b(?:font-size|font-weight|padding|border-radius|background|color)\s*:/);
    assert.doesNotMatch(css, /\.kvs__opcao-tipo--(?:coletiva|individual)\s*\{/);
});

test('student term modal uses Bootstrap presentation classes', () => {
    const view = fs.readFileSync(path.join(root, 'resources', 'views', 'pages', 'aluno', 'home.php'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'aluno-home.css'), 'utf8');
    assert.match(view, /modal-content border-0 shadow/);
    assert.match(view, /modal-header bg-primary text-white border-0/);
    assert.doesNotMatch(css, /#modalTermo \.modal-(?:content|header)/);
});

test('student home hero uses Bootstrap background and radius utilities', () => {
    const view = fs.readFileSync(path.join(root, 'resources', 'views', 'pages', 'aluno', 'home.php'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'aluno-shared.css'), 'utf8');
    assert.match(view, /aluno-hero bg-primary rounded-4 mb-4 text-white/);
    assert.doesNotMatch(css, /linear-gradient|\.aluno-hero::(?:before|after)/);
    assert.doesNotMatch(css, /\.aluno-hero\s*\{[^}]*\b(?:background|border-radius|color)\s*:/);
});

test('shared shell keeps layout tokens without decorative page motion', () => {
    const shared = fs.readFileSync(path.join(root, 'resources', 'scss', 'shared.scss'), 'utf8');
    assert.match(shared, /--sgi-sidebar-width:/);
    assert.doesNotMatch(shared, /--sgi-mobile-nav-height/);
    assert.match(shared, /--aluno-primary:\s+var\(--bs-primary\)/);
    assert.doesNotMatch(shared, /@keyframes\s+sgi-page-fade-in|animation:\s*sgi-page-fade-in/);
    assert.doesNotMatch(shared, /--sgi-(?:red(?:-dark|-active)?|shadow-(?:card|elevated)|motion-duration)\s*:/);
    assert.doesNotMatch(shared, /--aluno-(?:primary-(?:dark|light|subtle|soft)|success|warning|info|(?:bg|surface|border|text(?:-secondary|-muted)?)|radius-(?:sm|md)|radius|shadow(?:-(?:sm|md|hover))?|transition)\s*:/);
});

test('agenda and bracket custom controls keep state styles without decorative motion', () => {
    const css = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'admin.css'), 'utf8');
    assert.match(css, /\.kvs--aberto \.kvs__panel \{ opacity: 1; visibility: visible; \}/);
    assert.match(css, /\.ag-cal-day:hover \{ background:/);
    assert.doesNotMatch(css, /\.kvs__trigger\s*\{[^}]*transition|\.kvs__chevron\s*\{[^}]*transition|\.kvs__panel\s*\{[^}]*transition|\.kvs__panel\s*\{[^}]*transform|\.kvs__search\s*\{[^}]*transition|\.kvs__opcao\s*\{[^}]*transition|\.ag-cal-day\s*\{[^}]*transition/);
    assert.doesNotMatch(css, /\.kvs--aberto \.kvs__panel\s*\{[^}]*transform/);
    assert.doesNotMatch(css, /\.kvs__panel\s*\{[^}]*box-shadow\s*:/);
});

test('searchable bracket control inherits the shared Bootstrap typography', () => {
    const css = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'admin.css'), 'utf8');
    assert.doesNotMatch(css, /\.kvs__(?:trigger|search|opcao)\s*\{[^}]*font-family\s*:/);
});

test('native modality select still loads the published tree on touch devices', () => {
    const source = fs.readFileSync(path.join(root, 'resources', 'js', 'pages', 'competicoes', 'chaveamento.js'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'admin.css'), 'utf8');
    assert.match(source, /function usarSeletorNativo\(\)/);
    assert.match(source, /if \(!usarSeletorNativo\(\)\) \{\s*kvs_montar\(\{/);
    assert.match(source, /if \(selectMob\) pageScope\.listen\(selectMob, 'change'/);
    assert.match(source, /carregarArvore\(this\.value\)/);
    assert.match(source, /select\.showPicker/);
    assert.match(css, /@media \(pointer: coarse\), \(hover: none\) \{\s*\n\s*\.kvs-wrap \{ display: none; \}\s*\n\s*\.kvs-wrap\s*\+\s*select \{ display: block !important; \}/);
});

test('turma cards keep the stacked mobile layout and push actions to the end on desktop', () => {
    const css = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'admin.css'), 'utf8');
    assert.match(css, /\.sgi-turma-card \{\s*display: flex;\s*flex-direction: column;/);
    assert.match(css, /@media \(min-width: 768px\) \{\s*\.sgi-turma-card \{\s*flex-direction: row;\s*align-items: center;\s*justify-content: space-between;\s*gap: 1rem;\s*\}\s*\.sgi-turma-card-header \{\s*flex: 1 1 auto;\s*\}\s*\}/);
});

test('categoria actions use a two-column grid on mobile and spacing above the desktop footer', () => {
    const view = fs.readFileSync(path.join(root, 'resources', 'views', 'pages', 'eventos', 'configurar-categorias.php'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'admin.css'), 'utf8');
    assert.match(view, /<main class="d-none d-md-block main-desktop-layout sgi-categorias-desktop"/);
    assert.match(css, /#acoesCategoriaMobile \{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
    assert.match(css, /#acoesCategoriaMobile #btnContinuarMobile \{\s*grid-column: 1 \/ -1;\s*\}/);
    assert.match(css, /\.sgi-categorias-desktop \{\s*background: #fafafa;\s*padding: 3\.125rem clamp\(3\.125rem, 4vw, 5rem\) 4rem !important;\s*\}/);
});

test('offline banner uses Bootstrap utilities while keeping runtime hooks', () => {
    const offline = fs.readFileSync(path.join(root, 'resources', 'js', 'offline', 'offline-core.js'), 'utf8');
    const css = [
        path.join(root, 'resources', 'scss', 'shared.scss'),
        path.join(root, 'resources', 'css', 'source', 'admin.css'),
        path.join(root, 'resources', 'css', 'source', 'aluno-shared.css'),
    ].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
    assert.match(offline, /bg-danger text-white d-none sgi-hidden/);
    assert.match(offline, /container-fluid d-flex align-items-center justify-content-center gap-2 py-2 px-3 flex-wrap text-center/);
    assert.match(offline, /btn btn-sm btn-outline-light rounded-pill fw-semibold d-none sgi-hidden/);
    assert.match(offline, /classList\.add\('d-none', 'sgi-hidden'\)/);
    assert.match(offline, /classList\.toggle\('bg-warning', tomEscuro\)/);
    assert.match(offline, /classList\.toggle\('text-dark', tomEscuro\)/);
    assert.match(offline, /classList\.toggle\('btn-outline-dark', tomEscuro\)/);
    assert.match(offline, /sgi-offline-banner-details-toggle[\s\S]*aria-controls="sgi-offline-banner-details"/);
    assert.match(css, /@media\s*\(max-width:\s*1199\.98px\)[\s\S]*sgi-offline-banner-details-toggle\s*\{\s*display:\s*inline-flex/);
    assert.match(css, /sgi-offline-banner:not\(\.sgi-offline-banner--details-open\) \.sgi-offline-banner-details/);
    assert.match(css, /\.sgi-offline-banner\s*\{[^}]*z-index:\s*1040/);
    assert.doesNotMatch(css, /\.sgi-hidden\s*\{|\.sgi-offline-banner-inner|\.sgi-offline-banner--syncing|\.sgi-offline-banner-(?:tag|btn|export|import)\s*[,{]/);
});

test('classroom cards and search use native Bootstrap components', () => {
    const js = fs.readFileSync(path.join(root, 'resources', 'js', 'pages', 'participantes', 'turmas.js'), 'utf8');
    const view = fs.readFileSync(path.join(root, 'resources', 'views', 'pages', 'participantes', 'turmas.php'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'admin.css'), 'utf8');
    assert.match(js, /article class="card h-100 border-0 shadow-sm p-3"/);
    assert.match(js, /badge rounded-pill text-bg-light/);
    assert.match(view, /input-group/);
    assert.doesNotMatch(js, /turma-card|turma-badge|empty-state|turma-section-header|turma-search-wrapper/);
    assert.doesNotMatch(css, /\.turma-card|\.turma-badge|\.empty-state|\.turma-section-header|\.turma-search-wrapper/);
});

test('classroom floating action uses the native Bootstrap shadow utility', () => {
    const view = fs.readFileSync(path.join(root, 'resources', 'views', 'pages', 'participantes', 'turmas.php'), 'utf8');
    const utilities = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'utilities.css'), 'utf8');
    assert.match(view, /btn btn-primary[^\n]*shadow[^\n]*sgi-u-h-60px-w-60px-bottom-100px/);
    assert.doesNotMatch(utilities, /\.sgi-u-h-60px-w-60px-bottom-100px\s*\{[^}]*box-shadow\s*:/);
});

test('collaborator management uses Bootstrap cards, filters and controls', () => {
    const js = fs.readFileSync(path.join(root, 'resources', 'js', 'pages', 'acesso', 'colaboradores.js'), 'utf8');
    const view = fs.readFileSync(path.join(root, 'resources', 'views', 'pages', 'acesso', 'colaboradores.php'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'admin.css'), 'utf8');
    assert.match(js, /article class="card h-100 border-0 shadow-sm p-3 d-flex flex-row/);
    assert.match(js, /badge rounded-pill \$\{roleBadge\}/);
    assert.match(view, /row row-cols-2 row-cols-lg-4 g-3/);
    assert.match(view, /input-group/);
    assert.doesNotMatch(js, /col-card|col-role|col-action|col-empty|col-loading|col-chip/);
    assert.doesNotMatch(css, /\.col-card|\.col-role|\.col-action|\.col-empty|\.col-loading|\.col-chip|\.col-wrap|\.col-toolbar/);
});

test('arrecadacao and ocorrencias lists use Bootstrap grids and badges', () => {
    const js = [
        path.join(root, 'resources', 'js', 'pages', 'eventos', 'configurar-arrecadacao.js'),
        path.join(root, 'resources', 'js', 'pages', 'disciplina', 'ocorrencias.js'),
    ].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
    const views = [
        path.join(root, 'resources', 'views', 'pages', 'eventos', 'configurar-arrecadacao.php'),
        path.join(root, 'resources', 'views', 'pages', 'disciplina', 'ocorrencias.php'),
    ].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
    const css = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'admin.css'), 'utf8');
    assert.match(js, /article class="card h-100 border-0 shadow-sm sgi-turma-card p-3/);
    assert.match(js, /sgi-turma-card-header/);
    assert.match(js, /sgi-turma-card-actions/);
    assert.match(js, /badge text-bg-light/);
    assert.match(js, /badge text-bg-danger/);
    assert.match(views, /row row-cols-1 row-cols-lg-2 g-3/);
    assert.doesNotMatch(js + views, /ocr-(?:page|container|header|grid|modal|badge|btn-cancel)|sgi-u-col-1-1/);
    assert.doesNotMatch(css, /\.ocr-(?:page|container|header|grid|modal|badge)/);
});

test('competition list and bracket modal use native status and action variants', () => {
    const games = fs.readFileSync(path.join(root, 'resources', 'js', 'pages', 'competicoes', 'jogos.js'), 'utf8');
    const bracket = fs.readFileSync(path.join(root, 'resources', 'views', 'pages', 'competicoes', 'chaveamento.php'), 'utf8');
    const bracketJs = fs.readFileSync(path.join(root, 'resources', 'js', 'pages', 'competicoes', 'chaveamento.js'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'admin.css'), 'utf8');
    assert.match(games, /badge rounded-pill text-bg-\$\{statusClass\}/);
    assert.match(games, /card border-0 shadow-sm p-3 h-100/);
    assert.match(games, /text-decoration-none text-body/);
    assert.match(bracket, /btn btn-primary/);
    assert.match(bracket, /btn btn-outline-secondary/);
    assert.match(bracketJs, /badge rounded-pill text-bg-\$\{statusVariant\}/);
    assert.match(bracketJs, /btn btn-sm btn-outline-success/);
    assert.match(bracketJs, /badge rounded-pill bg-danger-subtle text-danger-emphasis/);
    assert.match(bracketJs, /bracket-champion-card card border-warning border-2 bg-warning-subtle shadow-sm/);
    assert.match(bracketJs, /row row-cols-1 row-cols-sm-3 g-3 mt-3/);
    assert.doesNotMatch(games, /\bjogo-card\b/);
    assert.doesNotMatch(css, /\.jogo-card\b/);
    assert.doesNotMatch(bracket + bracketJs + games + css, /\b(?:kv-badge|kv-action|game-action-btn)\b/);
    assert.doesNotMatch(bracket + bracketJs + css, /\b(?:kv-table-card|kv-filters|kv-filter-(?:input|select)|kv-gen-card|kv-empty|kv-loading|kv-alert|kv-link-btn|kv-history-card|kv-modal)\b/);
    assert.doesNotMatch(bracket + css, /\bkv-(?:page|title|subtitle|header|back|stats|stat)\b/);
    assert.doesNotMatch(bracketJs + css, /\b(?:kv-phase(?:__item(?:--active|--done)?|__arrow)?|kv-podium(?:-item(?:--(?:first|second|third)|__icon|__label|__name)?)?|kv-classificacao(?:-geral(?:__item|__mod|__podium)?)?|kv-confronto-row(?:__\w+)?)\b/);
    assert.doesNotMatch(bracketJs + css, /\bkv-animate\b|@keyframes\s+kv-fadeIn/);
    assert.doesNotMatch(css, /\.bracket-champion-card__\w+\s*\{|\bstatusPulse\b/);
    assert.doesNotMatch(css, /\.status-badge\s*\{|\.kv-modal \.btn-save\s*\{/);
});

test('score controls keep behavior hooks while using native Bootstrap controls', () => {
    const placar = fs.readFileSync(path.join(root, 'resources', 'js', 'pages', 'competicoes', 'placar.js'), 'utf8');
    const placarView = fs.readFileSync(path.join(root, 'resources', 'views', 'pages', 'competicoes', 'placar.php'), 'utf8');
    const adminCss = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'admin.css'), 'utf8');
    assert.match(placar, /mc-action-btn--start btn btn-primary/);
    assert.match(placar, /mc-action-btn--finish btn btn-outline-danger/);
    assert.match(placar, /mc-duration-select form-select form-select-sm w-auto/);
    assert.match(placar, /mc-pause-btn btn btn-outline-secondary btn-sm/);
    assert.match(placar, /text-center w-100 border-bottom pb-4 mb-4/);
    assert.match(placar, /row w-100 align-items-center justify-content-center g-4/);
    assert.match(placar, /col-12 col-md-5 text-center/);
    assert.match(placar, /d-flex align-items-center justify-content-center gap-3/);
    assert.match(placar, /mc-vs col-12 col-md-auto d-flex align-items-center justify-content-center/);
    assert.match(placar, /badge rounded-pill ' \+ badgeClass/);
    assert.match(placar, /btn btn-outline-secondary btn-score btn-score-minus/);
    assert.match(placar, /btn-score-minus rounded-4 d-inline-flex align-items-center justify-content-center lh-1 flex-shrink-0/);
    assert.match(placar, /mc-score score-number fw-bolder text-body lh-1 text-center/);
    assert.match(placar, /mc-timer-time fw-bolder text-body lh-1/);
    assert.match(placar, /mc-timer-time mc-timer-time--idle fw-bolder text-body-tertiary lh-1/);
    assert.match(placar, /row row-cols-1 row-cols-sm-3 g-3 mt-3/);
    assert.match(placar, /card h-100 border-2/);
    assert.doesNotMatch(placar, /sgi-u-flex-1-min-width-160px-text-align-center/);
    assert.match(placarView, /container-xxl py-4 px-3 px-md-4/);
    assert.match(placarView, /row row-cols-1 row-cols-md-2 row-cols-xl-3 g-3/);
    assert.match(placarView, /id="placar-grid" class="card border-0 shadow-sm rounded-4 p-4 d-flex flex-column align-items-center position-relative overflow-hidden"/);
    assert.doesNotMatch(placar + placarView + adminCss, /\b(?:mc-page|mc-header|mc-match-title|mc-match-meta|mc-badge|mc-actions|mc-stat-chip|mc-section-header|mc-section-title|mc-timeline-empty|mc-artilheiro-card|mc-artilheiro-empty|mc-error|mc-loading|mc-empty|mc-modal|mc-tipo-grid)\b/);
    assert.doesNotMatch(adminCss, /\.mc-action-btn\s*\{|\.mc-action-btn--start\s*\{|\.mc-action-btn--finish\s*\{|\.mc-duration-select\s*\{|\.mc-pause-btn\s*\{/);
    assert.doesNotMatch(adminCss, /\.mc-(?:timer-section|timer-controls|teams|team|team-name|score-row|vs)\b/);
    assert.match(placar, /badge text-bg-danger/);
    assert.match(placar, /btn btn-sm btn-light border text-primary/);
    assert.match(placar, /btn btn-sm btn-light border text-danger/);
    assert.match(placar, /card flex-grow-1 overflow-hidden/);
    assert.match(placar, /tl-event-top d-flex align-items-center gap-2 mb-2 flex-wrap/);
    assert.match(placar, /small text-body-secondary lh-sm/);
    assert.match(placarView, /mc-timeline ps-3 ps-md-4/);
    assert.doesNotMatch(placar + adminCss, /\b(?:tl-badge|tl-action-btn(?:--edit|--delete)?)\b/);
    assert.doesNotMatch(adminCss, /\.mc-timeline\s*\{|\.tl-event\s*\{|\.tl-event-body\s*\{|\.tl-event-top\s*\{|\.tl-event-icon\s*\{|\.tl-event-label\s*\{|\.tl-event-player\s*\{|\.tl-event-desc\s*\{/);
    assert.match(placar, /input\.classList\.add\('is-invalid'\)/);
    assert.match(placar, /el\.classList\.toggle\('text-danger', expirado\)/);
    assert.match(placar, /border-start border-4 border-danger bg-danger-subtle/);
    assert.doesNotMatch(adminCss, /#placar-grid\{[^}]*background/);
    assert.doesNotMatch(adminCss, /\.mc-score\{[^}]*font-weight/);
    assert.doesNotMatch(adminCss, /\.btn-score\{[^}]*display/);
    assert.doesNotMatch(adminCss, /timer-pulse|fab-enter|alert-slide-in|\.mc-timer-time\.timer-expired|\.btn-score:(?:active|disabled)|\.btn-score-plus:hover|\.tl-event:hover \.tl-event-dot|\.mc-fab:hover|\.mc-fab:active|\.mc-fab i/);
});

test('occurrence type choices use native Bootstrap outline variants', () => {
    const view = fs.readFileSync(path.join(root, 'resources', 'views', 'pages', 'competicoes', 'placar.php'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'admin.css'), 'utf8');
    assert.match(view, /btn btn-outline-warning ocorrencia-tipo-option/);
    assert.match(view, /btn btn-outline-danger ocorrencia-tipo-option/);
    assert.match(view, /btn btn-outline-secondary ocorrencia-tipo-option[^]*data-tipo="Suspensao"/);
    assert.doesNotMatch(view + css, /btn-outline-suspensao/);
    assert.doesNotMatch(css, /\.ocorrencia-tipo-option|#6f42c1|rgba\(111,66,193/);
});

test('modality details use Bootstrap cards, grids and actions', () => {
    const js = fs.readFileSync(path.join(root, 'resources', 'js', 'pages', 'competicoes', 'modalidade-detalhes.js'), 'utf8');
    const view = fs.readFileSync(path.join(root, 'resources', 'views', 'pages', 'competicoes', 'modalidade-detalhes.php'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'admin.css'), 'utf8');
    assert.match(js, /card h-100 border shadow-sm p-3 d-flex flex-row/);
    assert.match(js, /btn btn-primary d-inline-flex align-items-center gap-2/);
    assert.match(view, /card h-100 border-0 shadow-sm rounded-4 p-4/);
    assert.match(view, /row row-cols-1 row-cols-sm-2 g-3/);
    assert.doesNotMatch(js + view, /mdd-(?:container|head|hero|panel|list|turma|equipe|empty|btn-edit)\b/);
    assert.doesNotMatch(css, /\.mdd-/);
});

test('points configuration uses Bootstrap controls and feedback', () => {
    const view = fs.readFileSync(path.join(root, 'resources', 'views', 'pages', 'eventos', 'configurar-pontuacao.php'), 'utf8');
    const js = fs.readFileSync(path.join(root, 'resources', 'js', 'pages', 'eventos', 'configurar-pontuacao.js'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'admin.css'), 'utf8');
    assert.match(view, /card .*border-start border-4/);
    assert.match(view, /ptc-step-input form-control form-control-lg/);
    assert.match(view, /alert alert-info/);
    assert.match(js, /ptc-step-input, \.ptc-step-btn/);
    assert.doesNotMatch(view, /ptc-(?:container|header|title|actions|btn-(?:interclasse|salvar|default|continuar)|rank-badge|card(?:$|[^-])|card-head|card-icon|card-title|card-sub|card-value|card-label|card-foot|note|unsaved)\b/);
    assert.doesNotMatch(css, /--ptc-|\.ptc-(?:container|header|title|actions|btn-|card(?:$|[^-])|rank-badge|card-head|card-icon|card-title|card-sub|card-value|card-label|card-foot|note|unsaved)\b/);
});

test('modality management uses Bootstrap cards, badges and selection states', () => {
    const js = fs.readFileSync(path.join(root, 'resources', 'js', 'pages', 'eventos', 'configurar-modalidades.js'), 'utf8');
    const view = fs.readFileSync(path.join(root, 'resources', 'views', 'pages', 'eventos', 'configurar-modalidades.php'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'admin.css'), 'utf8');
    assert.match(view, /main class="main-desktop-layout"/);
    assert.match(js, /card h-100 border shadow-sm text-body text-decoration-none p-3 d-flex flex-column modalidade-card-simples/);
    assert.match(js, /badge rounded-pill bg-primary-subtle text-primary-emphasis/);
    assert.match(js, /border-primary/);
    assert.match(js, /<section class="mb-3"><h6 class="d-flex align-items-center gap-2 fw-bold/);
    assert.doesNotMatch(js + view, /modalidades-(?:toolbar|head(?:__title|__sub)?)/);
    assert.doesNotMatch(js + view, /modalidade-(?:card-topo|titulo|nome|sub|icone|badges|badge|cta|categoria-header|categoria-nome|categoria-count)\b/);
    assert.doesNotMatch(js, /destaque-(?:group-title|item|avatar|info|nome|sub|gols)\b/);
    assert.doesNotMatch(css, /\.(?:modalidades-|modalidade-|destaque-)/);
});

test('classroom student management uses native Bootstrap layouts and actions', () => {
    const view = fs.readFileSync(path.join(root, 'resources', 'views', 'pages', 'participantes', 'turma-alunos.php'), 'utf8');
    const js = fs.readFileSync(path.join(root, 'resources', 'js', 'pages', 'participantes', 'turma-alunos.js'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'admin.css'), 'utf8');
    const utilities = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'utilities.css'), 'utf8');
    assert.match(view, /bg-body-tertiary min-vh-100/);
    assert.match(view, /input-group flex-grow-1/);
    assert.match(view, /card border shadow-sm overflow-hidden/);
    assert.match(view, /table table-hover align-middle mb-0/);
    assert.match(js, /card border shadow-sm p-3 d-flex flex-row align-items-center gap-3/);
    assert.match(js, /btn btn-sm btn-light border text-primary px-2 py-1/);
    assert.match(js, /table-danger/);
    assert.match(js, /border-success.*bg-success-subtle/);
    assert.doesNotMatch(view + js, /\bta-(?:page|btn|title|subtitle|toolbar|search|pdf|dropzone|file|progress|table|count|student|cell|badge|tr|action|empty|view)/);
    assert.doesNotMatch(css, /\.ta-|--ta-/);
    assert.doesNotMatch(utilities, /\.sgi-u-w-0\b/);
});

test('agenda uses Bootstrap controls while keeping calendar domain geometry', () => {
    const view = fs.readFileSync(path.join(root, 'resources', 'views', 'pages', 'eventos', 'configurar-agenda.php'), 'utf8');
    const js = fs.readFileSync(path.join(root, 'resources', 'js', 'pages', 'eventos', 'configurar-agenda.js'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'admin.css'), 'utf8');
    assert.match(view, /input-group input-group-sm/);
    assert.match(view, /form-select form-select-sm/);
    assert.match(view, /row g-4 align-items-start/);
    assert.match(view, /row row-cols-7 g-0 text-center/);
    assert.match(view, /card overflow-hidden/);
    assert.match(js, /ag-cal-day[\s\S]*'col'[\s\S]*'d-flex'[\s\S]*'align-items-center'[\s\S]*'justify-content-center'/);
    assert.match(js, /card border-0 shadow-sm p-3 position-relative overflow-hidden/);
    assert.match(js, /badge rounded-pill text-bg-\$\{statusBadge\}/);
    assert.match(js, /ag-status-chip/);
    assert.doesNotMatch(view + js + css, /ag-(?:filter-bar|search|btn-auto|btn-interclasse|badge-count|cal-nav|meta-chip|icon-btn|show-all|gcal|modal)\b/);
    assert.doesNotMatch(css, /\.ag-event-card\s*\{|\.ag-event-card__|\.ag-cal-card\s*\{|\.ag-cal-header\s*\{|\.ag-cal-body\s*\{/);
    assert.match(css, /\.ag-cal-day\b/);
    assert.match(css, /\.ag-event-card::before/);
});

test('locations and regulations use native cards, actions and borders', () => {
    const locations = fs.readFileSync(path.join(root, 'resources', 'views', 'pages', 'eventos', 'configurar-locais.php'), 'utf8');
    const locationsJs = fs.readFileSync(path.join(root, 'resources', 'js', 'pages', 'eventos', 'configurar-locais.js'), 'utf8');
    const studentTerms = fs.readFileSync(path.join(root, 'resources', 'views', 'pages', 'aluno', 'termos.php'), 'utf8');
    const adminCss = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'admin.css'), 'utf8');
    const studentCss = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'aluno-home.css'), 'utf8');
    assert.match(locationsJs, /card border-0 shadow-sm p-4 h-100 d-flex flex-column/);
    assert.match(locationsJs, /btn btn-sm btn-outline-secondary/);
    assert.match(locationsJs, /btn btn-sm btn-outline-danger/);
    assert.match(locations, /card border rounded-3 p-3/);
    assert.match(studentTerms, /border-start border-4 border-danger ps-3 mb-3/);
    assert.doesNotMatch(locations + locationsJs + studentTerms + adminCss + studentCss, /(?:local-card|termo-clausula|regulamento-card)\b/);
    assert.doesNotMatch(adminCss, /\.local-card\b|\.termo-clausula\b/);
    assert.doesNotMatch(studentCss, /\.regulamento-card\b|\.termo-clausula\b/);
});

test('shared data tables use native Bootstrap table classes', () => {
    const sources = [
        path.join(root, 'resources', 'views', 'pages', 'competicoes', 'chaveamento.php'),
        path.join(root, 'resources', 'js', 'pages', 'disciplina', 'ocorrencias.js'),
        path.join(root, 'resources', 'js', 'pages', 'eventos', 'configurar-arrecadacao.js'),
        path.join(root, 'resources', 'css', 'source', 'admin.css'),
    ].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
    assert.match(sources, /table table-hover align-middle/);
    assert.doesNotMatch(sources, /sgi-table/);
    assert.doesNotMatch(sources, /table\.sgi-table/);
});

test('agenda cronograma workflow uses visual stepper and contextual step cards', () => {
    const view = fs.readFileSync(path.join(root, 'resources', 'views', 'pages', 'eventos', 'configurar-agenda.php'), 'utf8');
    const js = fs.readFileSync(path.join(root, 'resources', 'js', 'pages', 'eventos', 'configurar-agenda.js'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'admin.css'), 'utf8');

    assert.match(view, /id="cronogramaStepper" class="sgi-stepper list-unstyled mb-0"/);
    assert.equal((view.match(/data-sgi-step-indicator="[1-6]"/g) || []).length, 6);
    assert.equal((view.match(/data-sgi-step-card="[1-6]"/g) || []).length, 6);
    assert.match(view, /data-sgi-step-card="2"[\s\S]*id="cronogramaDataInicio"[\s\S]*id="cronogramaDuracao"[\s\S]*id="cronogramaGerar"/);
    assert.match(view, /data-sgi-step-card="4"[\s\S]*id="cronogramaInscricaoInicio"[\s\S]*id="cronogramaInscricaoFim"[\s\S]*id="cronogramaAbrir"/);
    assert.match(js, /calcularProgressoCronograma/);
    assert.match(js, /atualizarStepperCronograma/);
    assert.match(js, /sgi-stepper__item--completed/);
    assert.match(js, /sgi-stepper__item--active/);
    assert.match(js, /sgi-step-card--active/);
    assert.match(js, /setAttribute\('aria-current', 'step'\)/);
    assert.match(css, /\.sgi-stepper\b/);
    assert.match(css, /\.sgi-stepper__item--active\b/);
    assert.match(css, /\.sgi-step-card--active\b/);
});
