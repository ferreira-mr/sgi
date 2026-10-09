const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('./fixtures.cjs');

// O login usa credencial sintética real; não preserve corpos de rede nem
// capturas que possam conter entrada de autenticação.
test.use({ trace: 'off', screenshot: 'off' });

const PASSWORD = 'Interclasse#2026';

function loadSimulationArtifacts() {
    const directory = path.join(process.env.SGI_TEST_RESULTS_DIR || '/app/test-results', 'simulacao-interclasse');
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest-resolved.json'), 'utf8'));
    const observed = JSON.parse(fs.readFileSync(path.join(directory, 'observed.json'), 'utf8'));
    const checkpoints = JSON.parse(fs.readFileSync(path.join(directory, 'checkpoints.json'), 'utf8'));
    const browserResults = JSON.parse(fs.readFileSync(path.join(directory, 'browser-results.json'), 'utf8'));
    if (observed.status !== 'passed' || checkpoints.status !== 'passed' || !manifest.edition_id) {
        throw new Error('A execução HTTP integral não terminou aprovada antes da cobertura de portal.');
    }
    if (browserResults.status !== 'passed') throw new Error('Os eventos de quadra não foram concluídos pela interface antes do portal do aluno.');
    return { directory, manifest, observed, checkpoints, browserResults };
}

function matriculaFor(runId, editionId, classIndex, studentIndex) {
    const date = runId.slice(2, 8);
    if (!/^\d{6}$/.test(date)) throw new Error('O identificador da simulação não contém a data UTC esperada.');
    return `9${date}${String(editionId % 10000).padStart(4, '0')}${String(classIndex + 1).padStart(2, '0')}${String(studentIndex).padStart(2, '0')}`;
}

function selectedModalities(modalities, studentIndex) {
    return modalities.filter((modality) => modality.student_ids.includes(studentIndex));
}

test('224 alunos autenticam no portal e conferem as próprias inscrições da simulação', async ({ page }) => {
    test.setTimeout(900_000);
    const { directory, manifest, observed, checkpoints, browserResults } = loadSimulationArtifacts();
    const editionId = Number(manifest.edition_id);
    const roster = manifest.classes;
    const templates = manifest.modality_templates;
    const modalityDefinitions = JSON.parse(fs.readFileSync(
        path.resolve(__dirname, '../../tests/fixtures/simulacao-interclasse/manifest.json'),
        'utf8',
    )).modalities;
    let authenticated = 0;
    let visibleRegistrations = 0;

    for (const [classIndex, classEntry] of roster.entries()) {
        for (let studentIndex = 1; studentIndex <= 32; studentIndex++) {
            const name = `Aluno Simulado ${classEntry} A${String(studentIndex).padStart(2, '0')}`;
            const expectedModalities = selectedModalities(modalityDefinitions, studentIndex);

            await page.context().clearCookies();
            await page.goto('login', { waitUntil: 'domcontentloaded' });
            const form = page.locator('#form_desktop');
            await form.locator('.ipt-matricula').fill(matriculaFor(manifest.run_id, editionId, classIndex, studentIndex));
            await form.locator('.ipt-senha').fill(PASSWORD);
            await form.locator('button[type="submit"]').click();
            await page.waitForURL(/\/aluno\/inicio(?:\?|$)/, { timeout: 15_000 });
            await expect(page.locator('main h1').first()).toContainText(name);
            authenticated++;

            await page.goto(`aluno/modalidades?id=${editionId}`, { waitUntil: 'domcontentloaded' });
            await expect(page.getByRole('heading', { name: 'Escolha suas modalidades' })).toBeVisible();
            await expect(page.locator('#badgeInscricoes')).toHaveText(`${expectedModalities.length}/3`);
            const cards = page.locator('#inscricoesAtuais [data-equipe]');
            await expect(cards).toHaveCount(expectedModalities.length);
            for (const modality of expectedModalities) {
                await expect(page.locator('#inscricoesAtuais')).toContainText(modality.name);
            }
            visibleRegistrations += expectedModalities.length;
        }
    }

    expect(authenticated).toBe(224);
    expect(visibleRegistrations).toBe(322);

    const coveragePath = path.join(directory, 'coverage.json');
    const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
    coverage.browser = {
        ...(coverage.browser || {}),
        students_authenticated: authenticated,
        registration_views: authenticated,
        registrations_visible_to_owner: visibleRegistrations,
        collective_matches_operated: browserResults.matches.length,
        individual_events_operated: browserResults.individual_events.length,
        offline_matches: browserResults.offline_matches,
        parallel_operators: browserResults.parallel_operators,
    };
    fs.writeFileSync(coveragePath, `${JSON.stringify(coverage, null, 2)}\n`);

    const observedPath = path.join(directory, 'observed.json');
    const updatedObserved = JSON.parse(fs.readFileSync(observedPath, 'utf8'));
    updatedObserved.coverage = coverage;
    fs.writeFileSync(observedPath, `${JSON.stringify(updatedObserved, null, 2)}\n`);

    checkpoints.coverage = {
        ...(checkpoints.coverage || {}),
        browser: coverage.browser,
    };
    fs.writeFileSync(
        path.join(directory, 'checkpoints.json'),
        `${JSON.stringify(checkpoints, null, 2)}\n`,
    );

    const reportPath = path.join(directory, 'report.md');
    const report = fs.readFileSync(reportPath, 'utf8');
    const offlineMatchCount = Number(browserResults.offline_matches || 0);
    const offlineMatchLabel = offlineMatchCount === 1
        ? 'jogo offline sincronizado'
        : 'jogos offline sincronizados';
    const updatedReport = report.replace(
        /^- Cobertura de navegador:.*$/m,
        '- Cobertura de navegador: ' + authenticated + ' logins, ' + visibleRegistrations + ' inscrições conferidas, '
            + browserResults.matches.length + ' jogos e ' + browserResults.individual_events.length + ' provas operados na interface; '
            + offlineMatchCount + ' ' + offlineMatchLabel + ' por ' + browserResults.parallel_operators + ' mesários.',
    );
    expect(updatedReport).not.toBe(report);
    fs.writeFileSync(reportPath, updatedReport);
    expect(templates.length).toBe(5);
    expect(checkpoints.checkpoints.S12.status).toBe('passed');
    expect(observed.population.enrollments).toBe(322);
});
