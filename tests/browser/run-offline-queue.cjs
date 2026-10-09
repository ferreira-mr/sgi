const { spawnSync } = require('node:child_process');

const cli = require.resolve('@playwright/test/cli');
const result = spawnSync(process.execPath, [cli, 'test', '--project=independent', 'offline-queue-regression.spec.cjs'], {
    cwd: __dirname,
    env: {
        ...process.env,
        SGI_BROWSER_REQUIRES_DATABASE: '0',
        SGI_E2E_RESET: '0',
    },
    stdio: 'inherit',
});

if (result.error) {
    process.stderr.write(`${result.error.message}\n`);
    process.exitCode = 1;
} else {
    process.exitCode = result.status ?? 1;
}
