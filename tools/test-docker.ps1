[CmdletBinding()]
param(
    [ValidateSet('mariadb', 'mysql')]
    [string] $Database = 'mariadb',
    [ValidateSet('8.2', '8.4')]
    [string] $PhpVersion = '8.4',
    [switch] $SkipQuality,
    [switch] $IncludeVisual,
    [switch] $SkipBrowser,
    [switch] $SimulationOnly,
    [switch] $Keep
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker não foi encontrado no PATH.'
}

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$composeFile = Join-Path $root 'compose.test.yml'
$runId = ('{0:yyyyMMdd_HHmmss}_{1}' -f (Get-Date).ToUniversalTime(), ([guid]::NewGuid().ToString('N').Substring(0, 6))).ToLowerInvariant()
$projectName = "sgi-test-$($runId.Replace('_', '-'))"
$databaseName = "sgi_test_$($runId.Replace('_', ''))"
$resultsDirectory = Join-Path $root "test-results\docker-$runId"
$browserResultsDirectory = Join-Path $root "tests\browser\test-results\docker-$runId\browser"
$browserReportDirectory = Join-Path $root "tests\browser\playwright-report\docker-$runId\browser"
$visualResultsDirectory = Join-Path $root "tests\browser\test-results\docker-$runId\visual"
$visualReportDirectory = Join-Path $root "tests\browser\playwright-report\docker-$runId\visual"
$jsonReportPath = Join-Path $resultsDirectory 'browser-playwright.json'
$simulationJsonReportPath = Join-Path $resultsDirectory 'simulation-browser-playwright.json'
$simulationIntegrationTimingsPath = Join-Path $resultsDirectory 'simulation-integration-timings.json'
$visualJsonReportPath = Join-Path $resultsDirectory 'visual-playwright.json'
$runStartedAt = [DateTimeOffset]::UtcNow
$runTimer = [System.Diagnostics.Stopwatch]::StartNew()
$steps = [System.Collections.Generic.List[object]]::new()
$runStatus = 'running'
$portProbe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
try {
    $portProbe.Start()
    $hostPort = ([System.Net.IPEndPoint] $portProbe.LocalEndpoint).Port
} finally {
    $portProbe.Stop()
}
foreach ($directory in @($resultsDirectory, $browserResultsDirectory, $browserReportDirectory, $visualResultsDirectory, $visualReportDirectory)) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
}
$composeArguments = @('--project-name', $projectName, '-f', $composeFile)
$databaseImage = if ($Database -eq 'mysql') { 'mysql:8.4' } else { 'mariadb:10.11' }

$previousEnvironment = @{}
foreach ($name in @('COMPOSE_PROJECT_NAME', 'SGI_DB_IMAGE', 'SGI_PHP_VERSION', 'SGI_DB_PASSWORD', 'SGI_TEST_DB_NAME', 'SGI_TEST_RUN_ID', 'SGI_TEST_INTEGRATION_SCENARIO', 'SGI_TEST_DEFER_SIMULATION', 'SGI_SIMULATION_PHASE', 'SGI_SIMULATION_RUN_ID', 'SGI_TEST_PRESERVE_DATABASE', 'SGI_TEST_HOST_PORT', 'SGI_TEST_RESULTS_DIR', 'SGI_TEST_BROWSER_RESULTS_DIR', 'SGI_TEST_BROWSER_REPORT_DIR', 'SGI_BROWSER_OUTPUT_DIR', 'SGI_BROWSER_REPORT_DIR', 'SGI_BROWSER_JSON_REPORT', 'SGI_INDIVIDUAL_BROWSER')) {
    $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
}

$env:COMPOSE_PROJECT_NAME = $projectName
$env:SGI_DB_IMAGE = $databaseImage
$env:SGI_PHP_VERSION = $PhpVersion
$env:SGI_DB_PASSWORD = 'sgi-test-only'
$env:SGI_TEST_DB_NAME = $databaseName
$env:SGI_TEST_RUN_ID = $runId
$env:SGI_SIMULATION_RUN_ID = $runId
$env:SGI_SIMULATION_PHASE = 'complete'
$env:SGI_TEST_PRESERVE_DATABASE = '0'
$env:SGI_TEST_HOST_PORT = [string] $hostPort
$env:SGI_TEST_RESULTS_DIR = $resultsDirectory
$env:SGI_TEST_BROWSER_RESULTS_DIR = $browserResultsDirectory
$env:SGI_TEST_BROWSER_REPORT_DIR = $browserReportDirectory
$env:SGI_BROWSER_OUTPUT_DIR = '/app/tests/browser/test-results'
$env:SGI_BROWSER_REPORT_DIR = '/app/tests/browser/playwright-report'
$env:SGI_BROWSER_JSON_REPORT = '/app/test-results/browser-playwright.json'
$env:SGI_INDIVIDUAL_BROWSER = '1'
if ($SimulationOnly) {
    $env:SGI_TEST_INTEGRATION_SCENARIO = 'FullInterclasseSimulationTest'
    $env:SGI_TEST_DEFER_SIMULATION = '0'
} else {
    $env:SGI_TEST_INTEGRATION_SCENARIO = ''
    $env:SGI_TEST_DEFER_SIMULATION = '1'
}

function Write-RunManifest {
    $revision = $null
    $workingTreeDirty = $null
    $git = Get-Command git -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($git) {
        $revisionOutput = & $git.Source -C $root rev-parse HEAD 2>$null
        if ($LASTEXITCODE -eq 0) { $revision = ($revisionOutput -join '').Trim() }
        $statusOutput = & $git.Source -C $root status --porcelain 2>$null
        if ($LASTEXITCODE -eq 0) { $workingTreeDirty = [bool] ($statusOutput | Where-Object { $_ }) }
    }

    $reports = @()
    if (Test-Path -LiteralPath $jsonReportPath) { $reports += $jsonReportPath }
    if (Test-Path -LiteralPath $simulationJsonReportPath) { $reports += $simulationJsonReportPath }
    if ($IncludeVisual -and (Test-Path -LiteralPath $visualJsonReportPath)) { $reports += $visualJsonReportPath }

    [ordered]@{
        schema_version = 1
        run_id = $runId
        runner = 'docker-compose-powershell'
        database = $Database
        php_version = $PhpVersion
        artifacts_directory = $resultsDirectory
        integration_timings_json = Join-Path $resultsDirectory 'integration-timings.json'
        simulation_integration_timings_json = $simulationIntegrationTimingsPath
        environment_kept = $Keep.IsPresent
        revision = $revision
        working_tree_dirty = $workingTreeDirty
        started_at_utc = $runStartedAt.ToString('o')
        finished_at_utc = [DateTimeOffset]::UtcNow.ToString('o')
        duration_seconds = [math]::Round($runTimer.Elapsed.TotalSeconds, 3)
        status = $runStatus
        exit_code = $exitCode
        selection = [ordered]@{ quality = -not $SkipQuality; integration = -not $SimulationOnly; simulation_only = $SimulationOnly.IsPresent; simulation_portal_browser = -not $SkipBrowser; browser = -not $SkipBrowser; individual_ranking = -not $SkipBrowser; visual = $IncludeVisual.IsPresent; environment_kept = $Keep.IsPresent }
        playwright_json = $reports
        steps = @($steps)
    } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $resultsDirectory 'run-manifest.json') -Encoding utf8
}

function Invoke-Compose {
    param([Parameter(Mandatory)][string[]] $Arguments)

    $startedAt = [DateTimeOffset]::UtcNow
    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    $status = 'passed'
    $commandExitCode = 0
    try {
        & docker compose @composeArguments @Arguments
        $commandExitCode = $LASTEXITCODE
        if ($commandExitCode -ne 0) {
            $status = 'failed'
            throw "Docker Compose falhou: docker compose $($Arguments -join ' ')"
        }
    } catch {
        if ($status -ne 'failed') { $status = 'failed'; $commandExitCode = 1 }
        throw
    } finally {
        $timer.Stop()
        $steps.Add([pscustomobject]@{ name = ($Arguments -join ' '); started_at_utc = $startedAt.ToString('o'); duration_seconds = [math]::Round($timer.Elapsed.TotalSeconds, 3); status = $status; exit_code = $commandExitCode })
        Write-RunManifest
    }
}

$started = $false
$exitCode = 0
try {
    Invoke-Compose @('config', '--quiet')
    $buildServices = @('app')
    if (-not $SkipBrowser -or $IncludeVisual) {
        $buildServices += 'browser'
    }
    Invoke-Compose (@('build') + $buildServices)

    $started = $true
    if (-not $SkipQuality) {
        Write-Host 'Executando qualidade PHP e JavaScript...'
        Invoke-Compose @('run', '--rm', '--no-deps', 'quality')
    }

    Invoke-Compose @('up', '-d', '--wait', 'db', 'app')

    if (-not $SimulationOnly) {
        Write-Host 'Executando integração HTTP, banco e recuperação...'
        Invoke-Compose @('run', '--rm', '--no-deps', 'integration')
    }

    if (-not $SimulationOnly -and (-not $SkipBrowser -or $IncludeVisual)) {
        Write-Host 'Restaurando o esquema mais recente antes do navegador...'
        Invoke-Compose @('run', '--rm', '--no-deps', 'integration', 'php', 'bin/sgi.php', 'migrate')
    }

    if (-not $SimulationOnly -and -not $SkipBrowser) {
        Write-Host 'Executando testes de navegador online/offline...'
        Invoke-Compose @('run', '--rm', '--no-deps', 'browser')
    }

    if (-not $SimulationOnly -and $IncludeVisual) {
        Write-Host 'Executando contrato visual...'
        $env:SGI_TEST_BROWSER_RESULTS_DIR = $visualResultsDirectory
        $env:SGI_TEST_BROWSER_REPORT_DIR = $visualReportDirectory
        $env:SGI_BROWSER_JSON_REPORT = '/app/test-results/visual-playwright.json'
        Invoke-Compose @('run', '--rm', '--no-deps', 'visual')
    }

    if (-not $SimulationOnly) {
        Write-Host 'Executando simulação integral em ambiente isolado...'
        $env:SGI_TEST_INTEGRATION_SCENARIO = 'FullInterclasseSimulationTest'
        $env:SGI_TEST_DEFER_SIMULATION = '0'
    }
    if (-not $SkipBrowser) { $env:SGI_SIMULATION_PHASE = 'prepare' }
    Invoke-Compose @('run', '--rm', '--no-deps', 'integration')
    if (-not $SkipBrowser) {
        Write-Host 'Operando jogos e provas do Interclasse pelos portais dos mesários...'
        $env:SGI_BROWSER_JSON_REPORT = '/app/test-results/simulation-events-playwright.json'
        Invoke-Compose @('run', '--rm', '--no-deps', 'browser-simulation-events')
        Write-Host 'Reconciliando jogos, resultados, pontuação e ranking no mesmo banco...'
        $env:SGI_SIMULATION_PHASE = 'finalize'
        $env:SGI_TEST_PRESERVE_DATABASE = '1'
        $env:SGI_BROWSER_JSON_REPORT = '/app/test-results/simulation-browser-playwright.json'
        Invoke-Compose @('run', '--rm', '--no-deps', 'integration')
        $env:SGI_TEST_PRESERVE_DATABASE = '0'
        $env:SGI_SIMULATION_PHASE = 'complete'
        Write-Host 'Conferindo o portal dos 224 alunos da simulação...'
        Invoke-Compose @('run', '--rm', '--no-deps', 'browser-simulation')
    }

    $runStatus = 'passed'
    Write-Host 'Todos os serviços de teste concluíram com sucesso.'
} catch {
    $exitCode = 1
    $runStatus = 'failed'
    Write-Error $_
} finally {
    if ($started -and -not $Keep) {
        $cleanupStarted = [DateTimeOffset]::UtcNow
        $cleanupTimer = [System.Diagnostics.Stopwatch]::StartNew()
        & docker compose @composeArguments logs --no-color app db | Set-Content -LiteralPath (Join-Path $resultsDirectory 'docker-compose.log')
        & docker compose @composeArguments down --volumes --remove-orphans
        $cleanupTimer.Stop()
        $steps.Add([pscustomobject]@{ name = 'cleanup'; started_at_utc = $cleanupStarted.ToString('o'); duration_seconds = [math]::Round($cleanupTimer.Elapsed.TotalSeconds, 3); status = if ($LASTEXITCODE -eq 0) { 'passed' } else { 'failed' }; exit_code = $LASTEXITCODE })
        if ($LASTEXITCODE -ne 0 -and $exitCode -eq 0) {
            $exitCode = 1
            $runStatus = 'failed'
            Write-Warning 'Não foi possível remover completamente o ambiente Docker de teste.'
        }
    } elseif ($Keep) {
        Write-Host 'Ambiente mantido conforme solicitado (-Keep).'
        $steps.Add([pscustomobject]@{ name = 'cleanup'; started_at_utc = [DateTimeOffset]::UtcNow.ToString('o'); duration_seconds = 0; status = 'retained_by_request'; exit_code = 0 })
    }

    Write-RunManifest

    foreach ($name in $previousEnvironment.Keys) {
        $value = $previousEnvironment[$name]
        if ($null -eq $value) {
            Remove-Item "Env:$name" -ErrorAction SilentlyContinue
        } else {
            Set-Item "Env:$name" $value
        }
    }
}

exit $exitCode
