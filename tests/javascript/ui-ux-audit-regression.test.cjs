const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function walkPhpFiles(dirRelative) {
    const fullDir = path.join(root, dirRelative);
    const results = [];
    for (const entry of fs.readdirSync(fullDir, { withFileTypes: true })) {
        const rel = path.join(dirRelative, entry.name).replace(/\\/g, '/');
        if (entry.isDirectory()) {
            results.push(...walkPhpFiles(rel));
        } else if (entry.name.endsWith('.php')) {
            results.push(rel);
        }
    }
    return results;
}

function srgbChannelToLinear(channel8Bit) {
    const c = channel8Bit / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function parseHexColor(hex) {
    const clean = hex.replace(/^#/, '').trim();
    const expanded = clean.length === 3
        ? clean.split('').map((ch) => ch + ch).join('')
        : clean;
    return [
        parseInt(expanded.slice(0, 2), 16),
        parseInt(expanded.slice(2, 4), 16),
        parseInt(expanded.slice(4, 6), 16),
    ];
}

function relativeLuminance(hex) {
    const [r, g, b] = parseHexColor(hex).map(srgbChannelToLinear);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hexA, hexB) {
    const lumA = relativeLuminance(hexA);
    const lumB = relativeLuminance(hexB);
    const lighter = Math.max(lumA, lumB);
    const darker = Math.min(lumA, lumB);
    return (lighter + 0.05) / (darker + 0.05);
}

test('templates PHP em resources/views não possuem atributos de evento ou estilo inline', () => {
    const phpFiles = walkPhpFiles('resources/views');
    assert.ok(phpFiles.length > 20, 'Deve encontrar os templates PHP de views');

    for (const file of phpFiles) {
        const source = read(file);
        assert.doesNotMatch(
            source,
            /\b(?:onclick|onsubmit|onchange|oninput)\s*=/i,
            `${file} não deve conter handlers de evento inline`,
        );
        assert.doesNotMatch(
            source,
            /\bstyle\s*=/i,
            `${file} não deve conter atributo style= inline`,
        );
    }
});

test('window.SGIInterclasse foi extraído para arquivo JS dedicado e removido de admin-header.php', () => {
    const headerSource = read('resources/views/components/admin-header.php');
    const headSource = read('resources/views/components/admin-head.php');
    const serviceSource = read('resources/js/shared/interclasse-service.js');

    assert.doesNotMatch(headerSource, /<script\b/i, 'admin-header.php não deve conter bloco <script> inline');
    assert.match(headSource, /js\/shared\/interclasse-service\.js/, 'admin-head.php deve carregar interclasse-service.js');
    assert.match(serviceSource, /window\.SGIInterclasse\s*=/, 'interclasse-service.js deve expor window.SGIInterclasse');
});

test('todas as páginas do portal do aluno incluem o componente compartilhado footer.php', () => {
    const alunoPages = walkPhpFiles('resources/views/pages/aluno').filter((f) => !f.endsWith('/login.php'));
    assert.equal(alunoPages.length, 7);

    for (const file of alunoPages) {
        const source = read(file);
        assert.match(
            source,
            /resources\/views\/components\/footer\.php/,
            `${file} deve incluir resources/views/components/footer.php`,
        );
    }
});

test('pares de cores auditados no Design System cumprem contraste WCAG 2.1 AA (>= 4.5:1)', () => {
    const sharedScss = read('resources/scss/shared.scss');
    const adminCss = read('resources/css/source/admin.css');

    assert.match(sharedScss, /\.sgi-podium-badge--1\s*\{[^}]*color:\s*#451a03/s);
    assert.match(sharedScss, /\.sgi-podium-badge--2\s*\{[^}]*color:\s*#fff/s);
    assert.match(sharedScss, /\.sgi-podium-badge--3\s*\{[^}]*color:\s*#fff/s);

    assert.match(adminCss, /#listaArrecadacaoDesktop\s+\.input-group-text\s*\{[^}]*color:\s*#475569/s);
    assert.match(adminCss, /:is\(#listaArrecadacaoDesktop,\s*#listaOcorrenciasDesktop\)\s*>\s*\.col\s*>\s*\.card\s+\.badge\s*\{[^}]*color:\s*#334155/s);
    assert.match(adminCss, /:has\(#pontos-1\)\s+\.ptc-step-btn\s*\{[^}]*color:\s*#78350f/s);
    assert.match(adminCss, /:has\(#pontos-3\)\s+\.ptc-step-btn\s*\{[^}]*color:\s*#7c2d12/s);
    assert.match(adminCss, /:has\(#pontos-arr\)\s+\.ptc-step-btn\s*\{[^}]*color:\s*#9f1239/s);

    const auditedPairs = [
        ['Podium 1º lugar (ouro claro)', '#451a03', '#fde68a'],
        ['Podium 1º lugar (ouro âmbar)', '#451a03', '#f59e0b'],
        ['Podium 2º lugar (prata)', '#ffffff', '#64748b'],
        ['Podium 3º lugar (bronze)', '#ffffff', '#b45309'],
        ['Arrecadação sufixo kg', '#475569', '#ffffff'],
        ['Turma card badge', '#334155', '#f1f5f9'],
        ['Pontuação 1º lugar (#pontos-1)', '#78350f', '#fef3c7'],
        ['Pontuação 3º lugar (#pontos-3)', '#7c2d12', '#ffedd5'],
        ['Pontuação arrecadação (#pontos-arr)', '#9f1239', '#ffe4e6'],
        ['Stepper upcoming texto', '#475569', '#ffffff'],
    ];

    for (const [label, fg, bg] of auditedPairs) {
        const ratio = contrastRatio(fg, bg);
        assert.ok(
            ratio >= 4.5,
            `${label} (${fg} sobre ${bg}) deve ter contraste >= 4.5:1, obteve ${ratio.toFixed(2)}:1`,
        );
    }
});

test('admin.css usa breakpoints .98px consistentes e var(--bs-primary) nos anéis de foco', () => {
    const adminCss = read('resources/css/source/admin.css');

    assert.doesNotMatch(
        adminCss,
        /@media\s*\(\s*max-width:\s*(?:400|575|767|991)px\s*\)/,
        'admin.css deve usar frações .98px em max-width (399.98px, 575.98px, 767.98px, 991.98px)',
    );
    assert.doesNotMatch(
        adminCss,
        /#0d6efd/i,
        'admin.css não deve conter azul residual #0d6efd do Bootstrap padrão',
    );
});

test('melhorias de acessibilidade e UX de páginas estão preservadas nos templates e scripts', () => {
    const elenco = read('resources/views/pages/competicoes/elenco-equipe.php');
    assert.match(elenco, /id="linkGerenciarMob"[^>]*aria-label="Gerenciar elenco"/);
    assert.match(elenco, /id="linkGerenciarDesk"[^>]*aria-label="Gerenciar elenco"/);
    assert.match(elenco, /<th scope="col">Nome<\/th>/);

    const equipes = read('resources/views/pages/eventos/configurar-equipes.php');
    assert.match(equipes, /<span id="nomeInterclasseEquipes" class="visually-hidden"><\/span>/);

    const turmas = read('resources/views/pages/eventos/configurar-turmas.php');
    assert.match(turmas, /id="modalCriarTurma"[\s\S]*?class="btn-close[^"]*"[^>]*data-bs-dismiss="modal"/);

    const loginPhp = read('resources/views/pages/acesso/login.php');
    const loginJs = read('resources/js/pages/acesso/login.js');
    assert.match(loginPhp, /class="sgi-skip-link"/);
    assert.match(loginPhp, /id="msg_erro_mobile"[^>]*tabindex="-1"/);
    assert.match(loginPhp, /id="msg_erro_desktop"[^>]*tabindex="-1"/);
    assert.match(loginJs, /msgErro\.focus\(\{\s*preventScroll:\s*true\s*\}\)/);

    const dashboardPhp = read('resources/views/pages/eventos/dashboard.php');
    const staticIds = [...dashboardPhp.matchAll(/\bid="([^"<]+)"/g)].map((m) => m[1]);
    assert.equal(
        new Set(staticIds).size,
        staticIds.length,
        'dashboard.php não deve declarar atributos id estáticos duplicados',
    );

    const arrecadacaoJs = read('resources/js/pages/eventos/configurar-arrecadacao.js');
    assert.doesNotMatch(arrecadacaoJs, /new\s+XMLHttpRequest\s*\(/);
    assert.match(arrecadacaoJs, /keepalive:\s*true/);

    const modalidadesJs = read('resources/js/pages/competicoes/modalidades.js');
    const listaJs = read('resources/js/pages/eventos/lista.js');
    assert.doesNotMatch(modalidadesJs, /\baxios\./);
    assert.doesNotMatch(listaJs, /\baxios\./);
});
