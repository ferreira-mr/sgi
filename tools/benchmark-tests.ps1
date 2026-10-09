[CmdletBinding()]
param(
    [ValidateSet('quality', 'integration', 'browser', 'visual', 'all')]
    [string] $Suite = 'quality',
    [ValidateSet('mariadb', 'mysql')]
    [string] $Database = 'mariadb',
    [ValidateRange(1, 10)]
    [int] $Runs = 3,
    [ValidateSet('auto', 'host', 'compose')]
    [string] $Runner = 'auto',
    [ValidateSet('8.2', '8.4')]
    [string] $PhpVersion = '8.4',
    [string] $PhpPath = ''
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$runId = ('{0:yyyyMMdd_HHmmss}_{1}' -f (Get-Date), ([guid]::NewGuid().ToString('N').Substring(0, 6))).ToLowerInvariant()
$outputPath = Join-Path $root "test-results\benchmark-$runId.json"
$hostRunner = Join-Path $PSScriptRoot 'test-local.ps1'
$composeRunner = Join-Path $PSScriptRoot 'test-docker.ps1'
$results = [System.Collections.Generic.List[object]]::new()
$selectedRunner = if ($Runner -eq 'auto') {
    if ($Suite -eq 'quality') { 'host' } else { 'compose' }
} else {
    $Runner
}

if ($selectedRunner -eq 'compose' -and $Suite -eq 'quality') {
    throw "O perfil 'quality' isolado não requer Compose; use -Runner host."
}
if ($selectedRunner -eq 'compose' -and $PhpPath) {
    throw "-PhpPath só se aplica ao executor host; use -PhpVersion para Compose."
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $outputPath) | Out-Null

function Write-BenchmarkResults {
    $payload = [ordered]@{
        schema_version = 1
        generated_at_utc = [DateTimeOffset]::UtcNow.ToString('o')
        repository = $root
        suite = $Suite
        runner = $selectedRunner
        status = if ($results.Count -lt $Runs) { 'running' } elseif (@($results | Where-Object { $_.exit_code -eq 0 }).Count -eq $Runs) { 'passed' } else { 'failed' }
        database_backend = if ($selectedRunner -eq 'compose') { 'docker-compose' } else { 'docker-database-with-host-app' }
        database = if ($Suite -eq 'quality') { $null } else { $Database }
        php_version = if ($selectedRunner -eq 'compose') { $PhpVersion } else { $null }
        requested_runs = $Runs
        runs = @($results)
        successful_runs = @($results | Where-Object { $_.exit_code -eq 0 }).Count
    }
    $payload | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $outputPath -Encoding utf8
}

Write-BenchmarkResults

for ($run = 1; $run -le $Runs; $run++) {
    $started = [DateTimeOffset]::UtcNow
    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    if ($selectedRunner -eq 'compose') {
        $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $composeRunner, '-Database', $Database, '-PhpVersion', $PhpVersion)
        switch ($Suite) {
            'integration' { $arguments += @('-SkipQuality', '-SkipBrowser') }
            'browser' { $arguments += '-SkipQuality' }
            'visual' { $arguments += @('-SkipQuality', '-SkipBrowser', '-IncludeVisual') }
        }
    } else {
        $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $hostRunner, '-Suite', $Suite, '-Database', $Database)
        if ($PhpPath) { $arguments += @('-PhpPath', $PhpPath) }
    }

    Write-Host "`nBenchmark $run/$Runs ($Suite, $selectedRunner/$Database)"
    $status = 1
    $priorErrorActionPreference = $ErrorActionPreference
    try {
        # Failed test runners write useful diagnostics to stderr. Keep those
        # visible and capture the child exit code instead of aborting this loop.
        $ErrorActionPreference = 'Continue'
        & powershell @arguments 2>&1
        $status = $LASTEXITCODE
    } catch {
        Write-Host "O executor não concluiu a chamada: $($_.Exception.Message)"
        if ($LASTEXITCODE -is [int] -and $LASTEXITCODE -ne 0) { $status = $LASTEXITCODE }
    } finally {
        $ErrorActionPreference = $priorErrorActionPreference
        $timer.Stop()
    }

    $results.Add([ordered]@{
        run = $run
        repetition = ($run -gt 1)
        suite = $Suite
        runner = $selectedRunner
        database_backend = if ($selectedRunner -eq 'compose') { 'docker-compose' } else { 'docker-database-with-host-app' }
        database = if ($Suite -eq 'quality') { $null } else { $Database }
        php_version = if ($selectedRunner -eq 'compose') { $PhpVersion } else { $null }
        started_at_utc = $started.ToString('o')
        finished_at_utc = [DateTimeOffset]::UtcNow.ToString('o')
        duration_seconds = [math]::Round($timer.Elapsed.TotalSeconds, 3)
        exit_code = $status
    })
    Write-BenchmarkResults
}

$durations = @($results | Where-Object { $_.exit_code -eq 0 } | ForEach-Object { [double] $_.duration_seconds })
if ($durations.Count -gt 0) {
    $orderedDurations = $durations | Sort-Object
    $middle = [math]::Floor($orderedDurations.Count / 2)
    $median = if ($orderedDurations.Count % 2 -eq 0) {
        ($orderedDurations[$middle - 1] + $orderedDurations[$middle]) / 2
    } else {
        $orderedDurations[$middle]
    }
    $firstDuration = ($results | Where-Object { $_.run -eq 1 }).duration_seconds
    Write-Host "Primeira execução: $firstDuration s; mediana das aprovações: $median s ($($durations.Count) execuções)"
} else {
    Write-Host 'Nenhuma execução completa foi aprovada; a mediana não foi calculada.'
}
Write-Host "Medições gravadas em $outputPath"

if (@($results | Where-Object { $_.exit_code -eq 0 }).Count -ne $Runs) { exit 1 }
exit 0
