param(
    [string]$TaskName = "Syntro Network Collector Agent",
    [string]$ConfigPath = "",
    [string]$CampusKey = ""
)

$ErrorActionPreference = "Stop"

# Cada agente atiende una organizacion (campusKey) y trabaja sobre su propia
# subcarpeta dentro de runtime\network-telemetry-agent.
$sanitizedCampusKey = ""
if (-not [string]::IsNullOrWhiteSpace($CampusKey)) {
    $sanitizedCampusKey = ($CampusKey.Trim().ToLowerInvariant() -replace '[^a-z0-9_\-]', '-').Trim('-')
}
if ([string]::IsNullOrWhiteSpace($sanitizedCampusKey)) {
    Write-Host "Debes indicar la organizacion del agente con -CampusKey (por ejemplo: -CampusKey sotero)." -ForegroundColor Red
    Write-Host "El backend encola cada escaneo en la carpeta de su organizacion." -ForegroundColor Yellow
    exit 1
}
if ($sanitizedCampusKey.Length -gt 64) {
    $sanitizedCampusKey = $sanitizedCampusKey.Substring(0, 64).Trim('-')
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$runnerPath = Join-Path $repoRoot "tools\run-network-collector.ps1"
$collectorDir = Join-Path $repoRoot "tools\Syntro.NetworkCollector"
$exampleConfigPath = Join-Path $collectorDir "appsettings.example.json"

if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
    $ConfigPath = Join-Path $collectorDir "appsettings.local.json"
}

$ConfigPath = [IO.Path]::GetFullPath($ConfigPath)
if (-not (Test-Path -LiteralPath $ConfigPath)) {
    Copy-Item -LiteralPath $exampleConfigPath -Destination $ConfigPath
    Write-Host "Se creo la configuracion inicial del agente en:" -ForegroundColor Green
    Write-Host $ConfigPath -ForegroundColor Yellow
}

$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$config.WatchMode = $true
$config.PromptForCredential = $false
$config.SharedPath = "..\\..\\runtime\\network-telemetry-agent\\$sanitizedCampusKey"
if ($config.PSObject.Properties.Name -contains "CampusKey") {
    $config.CampusKey = $sanitizedCampusKey
}
else {
    $config | Add-Member -NotePropertyName "CampusKey" -NotePropertyValue $sanitizedCampusKey
}
$config | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $ConfigPath -Encoding UTF8

$configDirectory = [IO.Path]::GetFullPath((Split-Path -Parent $ConfigPath))
$sharedPath = if ([IO.Path]::IsPathRooted($config.SharedPath)) {
    [IO.Path]::GetFullPath($config.SharedPath)
}
else {
    [IO.Path]::GetFullPath([IO.Path]::Combine($configDirectory, $config.SharedPath))
}
[IO.Directory]::CreateDirectory($sharedPath) | Out-Null
$lifecycleKeyPath = Join-Path $sharedPath "agent-lifecycle.key"
if (-not (Test-Path -LiteralPath $lifecycleKeyPath)) {
    $keyBytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($keyBytes)
    }
    finally {
        $rng.Dispose()
    }
    [IO.File]::WriteAllText($lifecycleKeyPath, [Convert]::ToBase64String($keyBytes), [Text.Encoding]::ASCII)
}

$currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
$runRegistryPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$runRegistryName = "SyntroNetworkCollectorAgent"

$arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$runnerPath`" -Supervise -ConfigPath `"$ConfigPath`""
$commandLine = "powershell.exe $arguments"

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentIdentity.Name
$principal = New-ScheduledTaskPrincipal -UserId $currentIdentity.Name -RunLevel Limited -LogonType Interactive
$taskMode = "usuario actual al iniciar sesion"

try {
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

    try {
        Start-ScheduledTask -TaskName $TaskName -ErrorAction Stop
        $startedMessage = "La tarea fue iniciada de inmediato."
    }
    catch {
        $startedMessage = "La tarea quedo registrada, pero no pudo iniciarse en este momento. Se ejecutara con su proximo trigger."
    }
}
catch {
    Write-Host ""
    Write-Host "No fue posible registrar la tarea programada para el usuario actual." -ForegroundColor Yellow
    Write-Host "Se usara inicio automatico por registro HKCU como alternativa." -ForegroundColor Yellow

    New-ItemProperty -Path $runRegistryPath -Name $runRegistryName -PropertyType String -Value $commandLine -Force | Out-Null
    Start-Process -FilePath "powershell.exe" -ArgumentList $arguments -WindowStyle Hidden
    $taskMode = "usuario actual por HKCU\\Run"
    $startedMessage = "El agente fue iniciado ahora y volvera a arrancar al iniciar sesion."
}

Write-Host ""
Write-Host "Agente instalado correctamente para inicio automatico." -ForegroundColor Green
Write-Host "Nombre tarea : $TaskName"
Write-Host "Organizacion : $sanitizedCampusKey"
Write-Host "Config       : $ConfigPath"
Write-Host "Modo         : $taskMode"
Write-Host "Inicio       : $startedMessage"
Write-Host ""
Write-Host "Desde ahora el boton 'Escanear ahora' del dashboard puede usar este agente central." -ForegroundColor Cyan
