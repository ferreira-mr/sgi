const { defineConfig } = require('@playwright/test');
const path = require('node:path');

const chromePath = process.env.SGI_CHROME_PATH;
const launchOptions = chromePath ? { executablePath: chromePath } : {};
const browserOutputDir = process.env.SGI_BROWSER_OUTPUT_DIR || 'test-results';
const browserReportDir = process.env.SGI_BROWSER_REPORT_DIR || 'playwright-report';
const browserJsonReport = process.env.SGI_BROWSER_JSON_REPORT || 'test-results/playwright-results.json';
const independentSpecs = [
    '**/bootstrap-components.spec.cjs',
    '**/offline-queue-regression.spec.cjs',
];
const simulationSpecs = [
    '**/full-interclasse-portal.spec.cjs',
    '**/full-interclasse-events.spec.cjs',
];

module.exports = defineConfig({
    testDir: __dirname,
    globalSetup: require.resolve('./global-setup.cjs'),
    timeout: 180_000,
    expect: {
        timeout: 20_000,
        toHaveScreenshot: {
            pathTemplate: '{testDir}/{testFileName}-snapshots/{arg}-{platform}{ext}',
        },
    },
    fullyParallel: false,
    // The SQL-backed project stays serial. Only the fixed no-SQL allowlist gets
    // a second worker; independent project output cannot collide with it.
    workers: 2,
    retries: process.env.CI ? 1 : 0,
    failOnFlakyTests: true,
    outputDir: browserOutputDir,
    reporter: [
        ['list'],
        ['html', { outputFolder: browserReportDir, open: 'never' }],
        ['json', { outputFile: browserJsonReport }]
    ],
    projects: [
        {
            name: 'database',
            testIgnore: [...independentSpecs, ...simulationSpecs],
            workers: 1,
            outputDir: path.join(browserOutputDir, 'database'),
        },
        {
            name: 'independent',
            testMatch: independentSpecs,
            workers: 1,
            outputDir: path.join(browserOutputDir, 'independent'),
        },
        ...(process.env.SGI_RUN_SIMULATION_PORTAL === '1' ? [{
            name: 'simulation',
            testMatch: simulationSpecs,
            workers: 1,
            // Simulation mutates one edition through prepare → browser → finalize;
            // retrying a partially completed browser phase would reuse that state.
            retries: 0,
            outputDir: path.join(browserOutputDir, 'simulation'),
        }] : []),
    ],
    use: {
        baseURL: process.env.SGI_BASE_URL || 'http://localhost/SGI/',
        viewport: { width: 1440, height: 900 },
        headless: process.env.SGI_HEADFUL !== '1',
        launchOptions,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure'
    }
});
