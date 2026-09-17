const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const sharedScss = fs.readFileSync(path.join(root, 'resources', 'scss', 'shared.scss'), 'utf8');
const adminCss = fs.readFileSync(path.join(root, 'resources', 'css', 'source', 'admin.css'), 'utf8');
const placarJs = fs.readFileSync(path.join(root, 'resources', 'js', 'pages', 'competicoes', 'placar.js'), 'utf8');
const alunoRankingJs = fs.readFileSync(path.join(root, 'resources', 'js', 'pages', 'aluno', 'ranking.js'), 'utf8');
const resultadosRankingJs = fs.readFileSync(path.join(root, 'resources', 'js', 'pages', 'resultados', 'ranking.js'), 'utf8');

test('menu lateral utiliza largura de 5.75rem e impede quebra de palavras em rótulos', () => {
    assert.match(sharedScss, /--sgi-sidebar-width:\s*5\.75rem;/);
    assert.match(sharedScss, /\.sidebar-nav\s+\.nav-item\s*\{[^}]*padding-inline:\s*\.375rem;/);
    assert.match(sharedScss, /\.sgi-sidebar-label\s*\{[^}]*white-space:\s*nowrap;/);
    assert.match(sharedScss, /\.sgi-sidebar-label\s*\{[^}]*text-overflow:\s*ellipsis;/);
    assert.doesNotMatch(sharedScss, /\.sgi-sidebar-label\s*\{[^}]*overflow-wrap:\s*anywhere;/);
});

test('placar exibe pontos com 1 dígito inicial e trava alinhamento horizontal sem quebras', () => {
    // Não força dois dígitos (00) nos pontos
    assert.doesNotMatch(placarJs, /data-gols="[^"]*"\s*>\s*'\s*\+\s*String\(gols\)\.padStart\(2/);
    assert.match(placarJs, /data-gols="[^"]*"\s*>\s*'\s*\+\s*String\(gols\)\s*\+\s*'<|data-gols="' \+ idx \+ '">\s*' \+ String\(gols\)/);

    // Contém classes de nowrap
    assert.match(placarJs, /mc-score-row\s+d-flex\s+flex-nowrap/);
    assert.match(placarJs, /mc-score score-number fw-bolder text-body lh-1 text-center text-nowrap/);

    // CSS assegura flex-nowrap e white-space nowrap em telas compactas
    assert.match(adminCss, /\.mc-score\{[^}]*white-space:\s*nowrap/);
    assert.match(adminCss, /\.sgi-placar\s+\[class~="mc-score-row"\]\s*\{[^}]*flex-wrap:\s*nowrap\s*!important;/);
    assert.match(adminCss, /\.sgi-placar\s+\.mc-score\s*\{[^}]*white-space:\s*nowrap\s*!important;/);
});

test('ranking de turmas adota emblemas de pódio esportivo e remove emojis flutuantes', () => {
    for (const [nome, code] of [
        ['aluno/ranking.js', alunoRankingJs],
        ['resultados/ranking.js', resultadosRankingJs],
    ]) {
        // Usa emblemas de pódio estruturados
        assert.match(code, /sgi-podium-badge--1/, nome);
        assert.match(code, /sgi-podium-badge--2/, nome);
        assert.match(code, /sgi-podium-badge--3/, nome);
        assert.match(code, /sgi-podium-badge--default/, nome);
        assert.match(code, /sgi-podium-badge \$\{badgeClass\}/, nome);

        // Não usa emojis soltos no topo do card com translate-middle
        assert.doesNotMatch(code, /translate-middle fs-3/, nome);
        assert.doesNotMatch(code, /const medals = \['&#x1F947;', '&#x1F948;', '&#x1F949;'\];/, nome);
    }

    // Estilos do pódio definidos no shared.scss
    assert.match(sharedScss, /\.sgi-podium-badge\s*\{/);
    assert.match(sharedScss, /\.sgi-podium-badge--1\s*\{[^}]*background:\s*linear-gradient/);
    assert.match(sharedScss, /\.sgi-podium-badge--2\s*\{[^}]*background:\s*linear-gradient/);
    assert.match(sharedScss, /\.sgi-podium-badge--3\s*\{[^}]*background:\s*linear-gradient/);
});

test('micro-interações do ranking respeitam a diretiva prefers-reduced-motion', () => {
    assert.match(sharedScss, /\.card-turma\s*\{[^}]*transition:\s*transform/);
    assert.match(sharedScss, /\.card-turma\s*\{[\s\S]*\.progress-bar\s*\{[^}]*transition:\s*width/);
    assert.match(sharedScss, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*\.card-turma[\s\S]*transition:\s*none\s*!important;/);
});
