param(
    [string]$ConfigPath = "",
    [string]$StopMarkerPath = "",
    [switch]$Watch
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$collectorDir = Join-Path $repoRoot "tools\Syntro.NetworkCollector"
$projectPath = Join-Path $collectorDir "Syntro.NetworkCollector.csproj"
$exampleConfigPath = Join-Path $collectorDir "appsettings.example.json"

if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
    $ConfigPath = Join-Path $collectorDir "appsettings.local.json"
}

if (-not (Test-Path $ConfigPath)) {
    if (-not (Test-Path $exampleConfigPath)) {
        throw "No se encontro la configuracion base: $exampleConfigPath"
    }

    Copy-Item $exampleConfigPath $ConfigPath
    Write-Host "Se creo la configuracion inicial en:" -ForegroundColor Green
    Write-Host $ConfigPath -ForegroundColor Yellow
    Write-Host "Puedes editarla despues si necesitas cambiar URL o rangos." -ForegroundColor Cyan
}

Write-Host ""
Write-Host "=== Colector Windows de telemetria Syntro ===" -ForegroundColor Cyan
Write-Host "Proyecto : $projectPath"
Write-Host "Config    : $ConfigPath"
Write-Host "Modo      : $(if ($Watch) { 'agente' } else { 'manual' })"
Write-Host ""
Write-Host "Este proceso pedira tu clave solo si PromptForCredential=true." -ForegroundColor DarkCyan
Write-Host "La clave no se guarda en el archivo." -ForegroundColor DarkCyan
Write-Host ""

if ([string]::IsNullOrWhiteSpace($StopMarkerPath)) {
    $StopMarkerPath = Join-Path $collectorDir ".agent-stop"
}

Push-Location $repoRoot
try {
    if ($Watch) {
        $runCount = 0
        while (-not (Test-Path $StopMarkerPath)) {
            if ($runCount -gt 0) {
                Write-Host ""
                Write-Host "El agente termino (exit $LASTEXITCODE). Reiniciando en 3 segundos (reinicios: $runCount)..." -ForegroundColor Yellow
                Write-Host "Para detenerlo definitivamente, crea el archivo: $StopMarkerPath" -ForegroundColor DarkCyan
                Start-Sleep -Seconds 3
            }
            dotnet run --project $projectPath -- --config $ConfigPath --watch
            $runCount++
        }
        Write-Host "Marcador de detencion presente. Agente detenido." -ForegroundColor Cyan
    }
    else {
        dotnet run --project $projectPath -- --config $ConfigPath
    }
}
finally {
    Pop-Location
}
