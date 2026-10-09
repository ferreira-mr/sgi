[CmdletBinding()]
param(
    [ValidateSet('quality', 'integration', 'browser', 'visual', 'all')]
    [string] $Suite = 'all',
    [ValidateSet('mariadb', 'mysql')]
    [string] $Database = 'mariadb',
    [string] $PhpPath = '',
    [int] $Port = 0,
    [int] $DatabasePort = 0,
    [switch] $IncludeVisual,
    [switch] $Keep
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$requiresDatabase = $Suite -in @('integration', 'browser', 'visual', 'all')
$needsBrowser = $Suite -in @('browser', 'all') -or $IncludeVisual -or $Suite -eq 'visual'
$deferSimulation = $requiresDatabase -and $needsBrowser
$runId = ('{0:yyyyMMdd_HHmmss}_{1}' -f (Get-Date), ([guid]::NewGuid().ToString('N').Substring(0, 6))).ToLowerInvariant()
$databaseName = "sgi_test_local_$($runId.Replace('_', ''))"
$runRoot = Join-Path $root "test-results\local-$runId"
$serverProcess = $null
$dockerContainer = $null
$lockStream = $null
$originalEnvironment = @{}
$originalEnvironment['PATH'] = [Environment]::GetEnvironmentVariable('PATH', 'Process')
$startedResources = $false
$exitCode = 0
$runStartedAt = [DateTimeOffset]::UtcNow
$runTimer = [System.Diagnostics.Stopwatch]::StartNew()
$script:runStatus = 'running'
$script:runSteps = [System.Collections.Generic.List[object]]::new()
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null

function Write-RunManifest {
    $revision = $null
    $workingTreeDirty = $null
    $git = Get-CommandPath @('git.exe', 'git')
    if ($git) {
        $revisionOutput = & $git -C $root rev-parse HEAD 2>$null
        if ($LASTEXITCODE -eq 0) { $revision = ($revisionOutput -join '').Trim() }
        $statusOutput = & $git -C $root status --porcelain 2>$null
        if ($LASTEXITCODE -eq 0) { $workingTreeDirty = [bool] ($statusOutput | Where-Object { $_ }) }
    }

    $manifest = [ordered]@{
        schema_version = 1
        run_id = $runId
        suite = $Suite
        database = if ($requiresDatabase) { $Database } else { $null }
        revision = $revision
        working_tree_dirty = $workingTreeDirty
        started_at_utc = $runStartedAt.ToString('o')
        finished_at_utc = [DateTimeOffset]::UtcNow.ToString('o')
        duration_seconds = [math]::Round($runTimer.Elapsed.TotalSeconds, 3)
        status = $script:runStatus
        exit_code = $exitCode
        environment_kept = $Keep.IsPresent
        php_version = $script:phpVersion
        node_version = $script:nodeVersion
        artifacts_directory = $runRoot
        integration_timings_json = if ($requiresDatabase) { Join-Path $runRoot 'integration-timings.json' } else { $null }
        simulation_integration_timings_json = if ($requiresDatabase) { Join-Path $runRoot 'simulation-integration-timings.json' } else { $null }
        browser_json = if ($needsBrowser) { Join-Path $runRoot 'playwright-results.json' } else { $null }
        simulation_browser_json = if ($needsBrowser) { Join-Path $runRoot 'simulation-browser-results.json' } else { $null }
        selection = [ordered]@{
            quality = $Suite -in @('quality', 'all')
            integration = $requiresDatabase
            browser = $Suite -in @('browser', 'all')
            visual = $IncludeVisual.IsPresent -or $Suite -eq 'visual'
            individual_ranking = $Suite -in @('browser', 'all')
            simulation_portal_browser = $deferSimulation
            environment_kept = $Keep.IsPresent
        }
        steps = @($script:runSteps)
    }
    $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $runRoot 'run-manifest.json') -Encoding utf8
}

function Invoke-RunStage {
    param([Parameter(Mandatory)][string] $Name, [Parameter(Mandatory)][scriptblock] $Action)

    $startedAt = [DateTimeOffset]::UtcNow
    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    $step = [ordered]@{ name = $Name; started_at_utc = $startedAt.ToString('o'); duration_seconds = $null; status = 'running'; exit_code = $null }
    try {
        & $Action
        $step.status = 'passed'
    } catch {
        $step.status = 'failed'
        $step.exit_code = if ($LASTEXITCODE -is [int] -and $LASTEXITCODE -ne 0) { $LASTEXITCODE } else { 1 }
        throw
    } finally {
        $timer.Stop()
        $step.duration_seconds = [math]::Round($timer.Elapsed.TotalSeconds, 3)
        $script:runSteps.Add([pscustomobject] $step)
        Write-RunManifest
    }
}

function Get-CommandPath {
    param([Parameter(Mandatory)][string[]] $Names)

    foreach ($name in $Names) {
        $command = Get-Command $name -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($null -ne $command) {
            return $command.Source
        }
    }
    return $null
}

function Resolve-Php {
    if ($PhpPath -ne '') {
        $candidate = (Resolve-Path -LiteralPath $PhpPath -ErrorAction Stop).Path
        return $candidate
    }
    if ($env:SGI_PHP_PATH -and (Test-Path -LiteralPath $env:SGI_PHP_PATH)) {
        return (Resolve-Path -LiteralPath $env:SGI_PHP_PATH).Path
    }
    if (Test-Path -LiteralPath 'C:\xampp\php\php.exe') {
        return 'C:\xampp\php\php.exe'
    }
    $candidate = Get-CommandPath @('php.exe', 'php')
    if ($candidate) {
        return $candidate
    }
    throw 'PHP não foi encontrado. Informe -PhpPath ou defina SGI_PHP_PATH.'
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory)][string] $FilePath,
        [Parameter()][string[]] $Arguments = @(),
        [Parameter(Mandatory)][string] $Description
    )

    Write-Host "`n[$Description]"
    $startedAt = [DateTimeOffset]::UtcNow
    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    $stepStatus = 'passed'
    $commandExitCode = 0
    try {
        & $FilePath @Arguments
        $commandExitCode = $LASTEXITCODE
        if ($commandExitCode -ne 0) {
            $stepStatus = 'failed'
            throw "$Description falhou (código $commandExitCode)."
        }
    } catch {
        $stepStatus = 'failed'
        if ($commandExitCode -eq 0) { $commandExitCode = 1 }
        throw
    } finally {
        $timer.Stop()
        $script:runSteps.Add([pscustomobject]@{ name = $Description; started_at_utc = $startedAt.ToString('o'); duration_seconds = [math]::Round($timer.Elapsed.TotalSeconds, 3); status = $stepStatus; exit_code = $commandExitCode })
        Write-RunManifest
    }
}

function Invoke-Composer {
    param([Parameter()][string[]] $Arguments = @(), [Parameter(Mandatory)][string] $Description)

    if ($script:composerPhar) {
        Invoke-Checked -FilePath $script:php -Arguments (@($script:composerPhar) + $Arguments) -Description $Description
    } else {
        Invoke-Checked -FilePath $script:composer -Arguments $Arguments -Description $Description
    }
}

function Set-TestEnvironment {
    param([Parameter(Mandatory)][hashtable] $Values)

    foreach ($name in $Values.Keys) {
        if (-not $originalEnvironment.ContainsKey($name)) {
            $originalEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        }
        Set-Item "Env:$name" ([string] $Values[$name])
    }
}

function Restore-TestEnvironment {
    foreach ($name in $originalEnvironment.Keys) {
        if ($null -eq $originalEnvironment[$name]) {
            Remove-Item "Env:$name" -ErrorAction SilentlyContinue
        } else {
            Set-Item "Env:$name" $originalEnvironment[$name]
        }
    }
}

function Get-FreePort {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    try {
        $listener.Start()
        return ([System.Net.IPEndPoint] $listener.LocalEndpoint).Port
    } finally {
        $listener.Stop()
    }
}

function Wait-TcpPort {
    param([Parameter(Mandatory)][string] $TargetHost, [Parameter(Mandatory)][int] $PortNumber, [int] $TimeoutSeconds = 60)

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        try {
            $client = [System.Net.Sockets.TcpClient]::new()
            $task = $client.ConnectAsync($TargetHost, $PortNumber)
            if ($task.Wait(500) -and $client.Connected) {
                $client.Dispose()
                return
            }
            $client.Dispose()
        } catch {
            # O serviço ainda pode estar iniciando.
        }
        Start-Sleep -Milliseconds 500
    } while ((Get-Date) -lt $deadline)
    throw "A porta $TargetHost`:$PortNumber não ficou disponível em $TimeoutSeconds segundos."
}

function Wait-Health {
    param([Parameter(Mandatory)][string] $Url, [Parameter(Mandatory)][string] $ExpectedDatabase, [int] $TimeoutSeconds = 60)

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    do {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri "$Url/api/v1/health" -TimeoutSec 3
            $json = $response.Content | ConvertFrom-Json
            if ($json.status -eq 'ok' -and $json.test_environment.database -eq $ExpectedDatabase -and $json.test_environment.database_runtime -eq 'container') {
                return
            }
            throw 'O health endpoint não confirmou o ambiente de teste esperado.'
        } catch {
            if ((Get-Date) -ge $deadline) {
                throw "O servidor de teste não respondeu corretamente em $TimeoutSeconds segundos: $($_.Exception.Message)"
            }
            Start-Sleep -Milliseconds 500
        }
    } while ((Get-Date) -lt $deadline)
}

function Acquire-TestLock {
    $lockPath = Join-Path $root 'test-results\.test-local.lock'
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $lockPath) | Out-Null
    $deadline = (Get-Date).AddSeconds(30)
    do {
        try {
            $script:lockStream = [System.IO.File]::Open($lockPath, [System.IO.FileMode]::OpenOrCreate, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
            return
        } catch {
            Start-Sleep -Milliseconds 250
        }
    } while ((Get-Date) -lt $deadline)
    throw 'Outra execução local de testes já está usando o banco descartável. Aguarde o término ou finalize a execução anterior.'
}

function Resolve-SqlClient {
    param([Parameter(Mandatory)][string[]] $Names)

    $configured = if ($Names[0] -match 'dump') { $env:SGI_MYSQLDUMP_PATH } else { $env:SGI_MYSQL_PATH }
    if ($configured -and (Test-Path -LiteralPath $configured)) { return (Resolve-Path -LiteralPath $configured).Path }
    $path = Get-CommandPath $Names
    if ($path) { return $path }
    $xamppCandidates = if ($Names[0] -match 'dump') {
        @('C:\xampp\mysql\bin\mysqldump.exe', 'C:\xampp\mysql\bin\mariadb-dump.exe')
    } else {
        @('C:\xampp\mysql\bin\mysql.exe', 'C:\xampp\mysql\bin\mariadb.exe')
    }
    foreach ($candidate in $xamppCandidates) {
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    return $null
}

function Check-Prerequisites {
    $script:php = Resolve-Php
    $env:PATH = "$(Split-Path -Parent $script:php);$($env:PATH)"
    $phpVersion = (& $script:php -r "echo PHP_VERSION;").Trim()
    if ($LASTEXITCODE -ne 0) { throw "Não foi possível executar o PHP selecionado: $script:php" }
    $modules = (& $script:php -m) -join "`n"
    foreach ($extension in @('mysqli', 'mbstring', 'fileinfo', 'curl', 'dom')) {
        if ($modules -notmatch "(?m)^$extension$") {
            throw "O PHP $phpVersion não tem a extensão '$extension'. Use o PHP do XAMPP ou informe outro -PhpPath."
        }
    }
    Write-Host "PHP ${phpVersion}: $script:php"
    $script:phpVersion = $phpVersion

    $script:composer = Get-CommandPath @('composer.bat', 'composer')
    $script:composerPhar = $null
    if ($script:composer) {
        $adjacentPhar = Join-Path (Split-Path -Parent $script:composer) 'composer.phar'
        if (Test-Path -LiteralPath $adjacentPhar) { $script:composerPhar = $adjacentPhar }
    }
    $script:npm = Get-CommandPath @('npm.cmd', 'npm')
    $node = Get-CommandPath @('node.exe', 'node')
    $script:nodeVersion = if ($node) { ((& $node --version) -join '').Trim() } else { $null }
    if ($Suite -in @('quality', 'all') -and -not $script:composer) { throw 'Composer não foi encontrado no PATH.' }
    if (($Suite -in @('quality', 'all')) -and -not $script:npm) { throw 'npm não foi encontrado no PATH.' }
    if ($Suite -in @('quality', 'all') -and -not (Test-Path -LiteralPath (Join-Path $root 'vendor/autoload.php'))) {
        throw 'Dependências PHP não encontradas. Execute composer install antes dos testes.'
    }
    if ($needsBrowser -and -not (Test-Path -LiteralPath (Join-Path $root 'tests/browser/node_modules'))) {
        throw 'Dependências do navegador não encontradas. Execute npm ci --prefix tests/browser.'
    }
    if ($requiresDatabase) {
        $script:mysqlClient = Resolve-SqlClient @('mysql.exe', 'mysql', 'mariadb.exe', 'mariadb')
        $script:mysqlDump = Resolve-SqlClient @('mysqldump.exe', 'mysqldump', 'mariadb-dump.exe', 'mariadb-dump')
        if (-not $script:mysqlClient -or -not $script:mysqlDump) {
            throw 'Os clientes mysql/mysqldump são necessários para os testes de recuperação. Instale-os ou defina SGI_MYSQL_PATH e SGI_MYSQLDUMP_PATH.'
        }
    }
}

function Start-DockerDatabase {
    $docker = Get-CommandPath @('docker.exe', 'docker')
    if (-not $docker) { throw 'Docker não foi encontrado no PATH.' }
    $image = if ($Database -eq 'mysql') { 'mysql:8.4' } else { 'mariadb:10.11' }
    if ($script:dbPassword -eq '') { $script:dbPassword = 'sgi-test-only' }
    $script:databasePort = if ($DatabasePort -gt 0) { $DatabasePort } else { Get-FreePort }
    $containerName = "sgi-test-db-$($runId.Replace('_', '-'))"
    $args = @('run', '--detach', '--rm', '--name', $containerName, '--label', 'com.sgi.test.disposable=true', '--label', "com.sgi.test.run-id=$runId", '--tmpfs', '/var/lib/mysql', '-e', "MYSQL_ROOT_PASSWORD=$script:dbPassword", '-e', "MYSQL_DATABASE=$databaseName", '-e', "MARIADB_ROOT_PASSWORD=$script:dbPassword", '-e', "MARIADB_DATABASE=$databaseName", '-p', "127.0.0.1:$($script:databasePort):3306", $image)
    $script:dockerContainer = (& $docker @args).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $script:dockerContainer) { throw 'Não foi possível iniciar o banco de testes no Docker.' }
    Wait-TcpPort -TargetHost '127.0.0.1' -PortNumber $script:databasePort
}

function Start-TestServer {
    $script:port = if ($Port -gt 0) { $Port } else { Get-FreePort }
    $script:baseUrl = "http://127.0.0.1:$($script:port)"
    $sessionPath = Join-Path $runRoot 'sessions'
    $uploadTmp = Join-Path $runRoot 'upload-tmp'
    $uploads = Join-Path $runRoot 'uploads'
    $importPath = Join-Path $runRoot 'imports'
    foreach ($directory in @($runRoot, $sessionPath, $uploadTmp, $uploads, (Join-Path $uploads 'regulamentos'), (Join-Path $uploads 'fotos'), $importPath)) {
        New-Item -ItemType Directory -Force -Path $directory | Out-Null
    }

    $values = @{
        SGI_APP_ENV = 'test'
        SGI_APP_DEBUG = '0'
        SGI_APP_URL = "$($script:baseUrl)/"
        SGI_BASE_PATH = ''
        SGI_DB_HOST = $script:dbHost
        SGI_DB_PORT = [string] $script:databasePort
        SGI_DB_NAME = $databaseName
        SGI_TEST_DB_NAME = $databaseName
        SGI_DB_USER = $script:dbUser
        SGI_DB_PASSWORD = $script:dbPassword
        SGI_TEST_DB_RUNTIME = 'container'
        SGI_TEST_RESULTS_DIR = $runRoot
        SGI_BROWSER_REQUIRES_DATABASE = '1'
        SGI_E2E_RESET = '0'
        SGI_TEST_BASE_URL = $script:baseUrl
        SGI_BASE_URL = "$($script:baseUrl)/"
        SGI_UPLOAD_DIR = $uploads
        SGI_REGULAMENTOS_DIR = Join-Path $uploads 'regulamentos'
        SGI_FOTOS_DIR = Join-Path $uploads 'fotos'
        SGI_IMPORT_DIR = $importPath
        SGI_SESSION_DIR = $sessionPath
        SGI_MYSQL_PATH = $script:mysqlClient
        SGI_MYSQLDUMP_PATH = $script:mysqlDump
        SGI_TEST_RUN_ID = $runId
        SGI_SIMULATION_RUN_ID = $runId
        SGI_SIMULATION_PHASE = 'complete'
        SGI_TEST_PRESERVE_DATABASE = '0'
        SGI_TEST_INTEGRATION_SCENARIO = ''
        SGI_TEST_DEFER_SIMULATION = if ($deferSimulation) { '1' } else { '0' }
        SGI_BROWSER_OUTPUT_DIR = Join-Path $runRoot 'browser'
        SGI_BROWSER_REPORT_DIR = Join-Path $runRoot 'playwright-report'
        SGI_BROWSER_JSON_REPORT = Join-Path $runRoot 'playwright-results.json'
        SGI_INDIVIDUAL_BROWSER = '1'
    }
    Set-TestEnvironment $values
    $stdout = Join-Path $runRoot 'server.stdout.log'
    $stderr = Join-Path $runRoot 'server.stderr.log'
    $args = @('-d', "session.save_path=$sessionPath", '-d', "upload_tmp_dir=$uploadTmp", '-S', "127.0.0.1:$($script:port)", '-t', (Join-Path $root 'public'), (Join-Path $root 'public/index.php'))
    $script:serverProcess = Start-Process -FilePath $script:php -ArgumentList $args -WorkingDirectory $root -RedirectStandardOutput $stdout -RedirectStandardError $stderr -WindowStyle Hidden -PassThru
    $script:startedResources = $true
    Wait-Health -Url $script:baseUrl -ExpectedDatabase $databaseName
}

function Invoke-Quality {
    Invoke-Composer -Arguments @('validate', '--no-check-publish') -Description 'Validação do Composer'
    Invoke-Composer -Arguments @('verify') -Description 'Qualidade PHP'
    $powerShell = Get-CommandPath @('powershell.exe', 'pwsh.exe')
    if (-not $powerShell) { throw 'PowerShell não foi encontrado para testar o cleanup do executor.' }
    Invoke-Checked -FilePath $powerShell -Arguments @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $root 'tools/test-local-cleanup.test.ps1')) -Description 'Regressão do cleanup do executor'
    Invoke-Checked -FilePath $script:npm -Arguments @('run', 'build') -Description 'Build de assets'
    Invoke-Checked -FilePath $script:npm -Arguments @('run', 'check') -Description 'Checks JavaScript'
    Invoke-Checked -FilePath $script:npm -Arguments @('test') -Description 'Testes JavaScript'
}

function Invoke-Integration {
    $arguments = @()
    if ($env:SGI_SESSION_DIR -and (Test-Path -LiteralPath $env:SGI_SESSION_DIR)) {
        $arguments += @('-d', "session.save_path=$env:SGI_SESSION_DIR")
    }
    $arguments += 'tests/run_all.php'
    Invoke-Checked -FilePath $script:php -Arguments $arguments -Description 'Integração HTTP, banco e recuperação'
}

function Invoke-Browser {
    $arguments = @('--prefix', (Join-Path $root 'tests/browser'), 'test', '--', '--grep-invert', 'contrato visual do acesso')
    Invoke-Checked -FilePath $script:npm -Arguments $arguments -Description 'Testes de navegador online/offline'
}

function Invoke-SimulationBrowser {
    Set-TestEnvironment @{
        SGI_BROWSER_OUTPUT_DIR = Join-Path $runRoot 'simulation-browser'
        SGI_BROWSER_REPORT_DIR = Join-Path $runRoot 'simulation-playwright-report'
        SGI_BROWSER_JSON_REPORT = Join-Path $runRoot 'simulation-browser-results.json'
    }
    $arguments = @('--prefix', (Join-Path $root 'tests/browser'), 'test', '--', '--project=simulation', '--grep', '224 alunos autenticam')
    Invoke-Checked -FilePath $script:npm -Arguments $arguments -Description 'Portal dos 224 alunos da simulação'
}

function Invoke-SimulationEventsBrowser {
    Set-TestEnvironment @{
        SGI_BROWSER_OUTPUT_DIR = Join-Path $runRoot 'simulation-events-browser'
        SGI_BROWSER_REPORT_DIR = Join-Path $runRoot 'simulation-events-playwright-report'
        SGI_BROWSER_JSON_REPORT = Join-Path $runRoot 'simulation-events-browser-results.json'
    }
    $arguments = @('--prefix', (Join-Path $root 'tests/browser'), 'test', '--', '--project=simulation', '--grep', 'opera a edição preparada')
    Invoke-Checked -FilePath $script:npm -Arguments $arguments -Description 'Jogos e provas pelos portais dos mesários'
}

function Invoke-Visual {
    $arguments = @('--prefix', (Join-Path $root 'tests/browser'), 'test', '--', 'visual-contract.spec.cjs')
    Invoke-Checked -FilePath $script:npm -Arguments $arguments -Description 'Contrato visual'
}

try {
    Invoke-RunStage -Name 'prerequisite_check' -Action { Check-Prerequisites }
    if ($requiresDatabase) {
        Invoke-RunStage -Name 'database_setup' -Action {
            Acquire-TestLock
            $script:dbUser = 'root'
            $script:dbPassword = 'sgi-test-only'
            Start-DockerDatabase
            $script:dbHost = '127.0.0.1'
        }
    }

    if ($Suite -eq 'quality') {
        Invoke-RunStage -Name 'quality' -Action { Invoke-Quality }
    } elseif ($requiresDatabase) {
        Invoke-RunStage -Name 'server_setup' -Action { Start-TestServer }
        if ($Suite -eq 'all') { Invoke-RunStage -Name 'quality' -Action { Invoke-Quality } }
        Invoke-RunStage -Name 'integration' -Action { Invoke-Integration }
        if ($needsBrowser) {
            Invoke-RunStage -Name 'restore_latest_schema' -Action {
                Invoke-Checked -FilePath $script:php -Arguments @('bin/sgi.php', 'migrate') -Description 'Restaurar migrações atuais após os testes de recuperação'
            }
        }
        if ($Suite -in @('browser', 'all')) {
            Invoke-RunStage -Name 'browser' -Action { Invoke-Browser }
        }
        if ($IncludeVisual -or $Suite -eq 'visual') { Invoke-RunStage -Name 'visual' -Action { Invoke-Visual } }
        if ($deferSimulation) {
            Set-TestEnvironment @{
                SGI_TEST_INTEGRATION_SCENARIO = 'FullInterclasseSimulationTest'
                SGI_TEST_DEFER_SIMULATION = '0'
                SGI_SIMULATION_PHASE = 'prepare'
            }
            Invoke-RunStage -Name 'simulation_integration' -Action { Invoke-Integration }
            Invoke-RunStage -Name 'simulation_events_browser' -Action { Invoke-SimulationEventsBrowser }
            Set-TestEnvironment @{
                SGI_SIMULATION_PHASE = 'finalize'
                SGI_TEST_PRESERVE_DATABASE = '1'
            }
            Invoke-RunStage -Name 'simulation_reconciliation' -Action { Invoke-Integration }
            Set-TestEnvironment @{
                SGI_SIMULATION_PHASE = 'complete'
                SGI_TEST_PRESERVE_DATABASE = '0'
            }
            Invoke-RunStage -Name 'simulation_portal' -Action { Invoke-SimulationBrowser }
        }
    }
    Write-Host "`nTestes concluídos. Artefatos: $runRoot"
} catch {
    $exitCode = 1
    $script:runStatus = 'failed'
    Write-Error $_
} finally {
    $cleanupActions = @()
    if ($script:serverProcess) {
        $cleanupActions += [pscustomobject]@{
            Name = 'servidor temporário'
            Run = { Stop-Process -Id $script:serverProcess.Id -Force -ErrorAction Stop }
        }
    }
    if ($requiresDatabase) {
        $cleanupActions += [pscustomobject]@{
            Name = 'container temporário'
            Run = {
                if (-not $script:dockerContainer -or $Keep) { return }
                $docker = Get-CommandPath @('docker.exe', 'docker')
                if (-not $docker) { throw 'Cliente Docker não encontrado.' }
                & $docker rm -f $script:dockerContainer | Out-Null
                if ($LASTEXITCODE -ne 0) { throw 'Docker recusou a remoção do container temporário.' }
            }
        }
    }
    if ($script:dockerContainer -and $Keep) {
        Write-Host "Banco Docker mantido: $script:dockerContainer"
    }
    if ($lockStream) {
        $cleanupActions += [pscustomobject]@{
            Name = 'lock do executor'
            Run = { $lockStream.Dispose() }
        }
    }
    if ($originalEnvironment.Count -gt 0) {
        $cleanupActions += [pscustomobject]@{
            Name = 'ambiente do processo'
            Run = { Restore-TestEnvironment }
        }
    }
    . (Join-Path $PSScriptRoot 'test-local-cleanup.ps1')
    $cleanupTimer = [System.Diagnostics.Stopwatch]::StartNew()
    Invoke-TestLocalCleanupActions -Actions $cleanupActions
    $cleanupTimer.Stop()
    $script:runSteps.Add([pscustomobject]@{ name = 'cleanup'; started_at_utc = [DateTimeOffset]::UtcNow.AddSeconds(-$cleanupTimer.Elapsed.TotalSeconds).ToString('o'); duration_seconds = [math]::Round($cleanupTimer.Elapsed.TotalSeconds, 3); status = if ($exitCode -eq 0) { 'passed' } else { 'completed_with_prior_failure' }; exit_code = $exitCode })
    $script:runStatus = if ($exitCode -eq 0) { 'passed' } else { 'failed' }
    Write-RunManifest
}

exit $exitCode
