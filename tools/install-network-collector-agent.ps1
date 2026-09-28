param(
    [string]$TaskName = "Syntro Network Collector Agent",
    [string]$ConfigPath = "",
    [string]$CampusKey = "",
    [ValidateSet("Interactive", "Password")]
    [string]$LogonType = "Interactive",
    [string]$UserId = "",
    [securestring]$Password = $null,
    [int]$WatchdogIntervalMinutes = 5,
    [int]$WatchdogStaleSeconds = 180,
    [switch]$SkipWatchdog,
    [switch]$SkipStartupTrigger
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
$watchdogTaskName = "$TaskName Watchdog"
$watchdogScriptPath = Join-Path $repoRoot "tools\watch-network-collector-agent.ps1"

if ([string]::IsNullOrWhiteSpace($UserId)) {
    $UserId = $currentIdentity.Name
}

# Fuera de la sesion interactiva la tarea sobrevive a cierres de sesion y al modo de
# espera moderno. Eso exige -LogonType Password, que ademas conserva las credenciales
# de dominio del usuario para el WMI remoto que usa el collector.
if ($LogonType -eq "Password" -and $null -eq $Password) {
    $Password = Read-Host "Contrasena de Windows para $UserId" -AsSecureString
}

$arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$runnerPath`" -Supervise -ConfigPath `"$ConfigPath`""
$commandLine = "powershell.exe $arguments"

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$triggers = @()
if ($LogonType -eq "Interactive") {
    $triggers += New-ScheduledTaskTrigger -AtLogOn -User $UserId
    $taskMode = "usuario actual al iniciar sesion"
}
else {
    # El trigger AtStartup es de ambito maquina: registrarlo exige privilegios de
    # administrador y falla con "Acceso denegado" en una consola sin elevar. Sin el solo
    # AtLogOn el agente igual sobrevive a cierres de sesion (corre en sesion 0), pero no
    # arrancaria solo tras un reinicio sin ningun inicio de sesion.
    if (-not $SkipStartupTrigger) {
        $triggers += New-ScheduledTaskTrigger -AtStartup
    }
    $triggers += New-ScheduledTaskTrigger -AtLogOn -User $UserId
    $taskMode = "usuario $UserId, independiente de la sesion (con contrasena)"
    if ($SkipStartupTrigger) {
        $taskMode += ", solo al iniciar sesion (falta AtStartup: requiere administrador)"
    }
}
$principal = New-ScheduledTaskPrincipal -UserId $UserId -RunLevel Limited -LogonType $LogonType

# Register-ScheduledTask no admite -Principal junto con -User/-Password (son juegos de
# parametros distintos). Con LogonType=Password hay que pasar la identidad por -User/-Password
# y el nivel de ejecucion por -RunLevel.
function Get-PlainTextPassword {
    param([Parameter(Mandatory = $true)][securestring]$SecurePassword)

    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePassword)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringAuto($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

function New-IdentityParams {
    param(
        [string]$TaskLogonType,
        [string]$IdentityUserId,
        [securestring]$SecurePassword,
        [System.Collections.IDictionary]$Target
    )

    if ($TaskLogonType -eq "Password") {
        $plainPassword = Get-PlainTextPassword -SecurePassword $SecurePassword
        try {
            $Target.User = $IdentityUserId
            $Target.Password = $plainPassword
            $Target.RunLevel = "Limited"
        }
        finally {
            $plainPassword = $null
        }
    }
    else {
        $Target.Principal = $principal
    }
}

try {
    $registerParams = @{
        TaskName = $TaskName
        Action = $action
        Trigger = $triggers
        Settings = $settings
        Force = $true
    }
    New-IdentityParams -TaskLogonType $LogonType -IdentityUserId $UserId -SecurePassword $Password -Target $registerParams

    # Cambiar el principal de una tarea ya existente (de Interactive a Password) exige
    # privilegios de administrador y falla con "Acceso denegado" sin ellos. Crear la tarea
    # desde cero si, por eso la desregistramos antes cuando ya existe.
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existing) {
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
    }

    # -ErrorAction Stop es obligatorio: Register-ScheduledTask reporta los fallos de
    # permisos/Credenciales como error no terminante de CIM y el try/catch los dejaba pasar,
    # de modo que el instalador anunciaba exito con la tarea sin registrar.
    Register-ScheduledTask @registerParams -ErrorAction Stop | Out-Null

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
    Write-Host "No fue posible registrar la tarea programada para $UserId." -ForegroundColor Yellow
    Write-Host "Detalle: $($_.Exception.Message)" -ForegroundColor Yellow
    if ($LogonType -ne "Interactive") {
        Write-Host "Con -LogonType Password no se usa el registro HKCU porque tampoco sobrevive al cierre de sesion." -ForegroundColor Yellow
        Write-Host "Revisa que el usuario tenga el permiso 'Iniciar sesion como trabajo por lotes' y vuelve a ejecutar el instalador." -ForegroundColor Yellow
        exit 1
    }

    Write-Host "Se usara inicio automatico por registro HKCU como alternativa." -ForegroundColor Yellow

    New-ItemProperty -Path $runRegistryPath -Name $runRegistryName -PropertyType String -Value $commandLine -Force | Out-Null
    Start-Process -FilePath "powershell.exe" -ArgumentList $arguments -WindowStyle Hidden
    $taskMode = "usuario actual por HKCU\\Run"
    $startedMessage = "El agente fue iniciado ahora y volvera a arrancar al iniciar sesion."
}

$watchdogMessage = "No se registro (opcion -SkipWatchdog)."
if (-not $SkipWatchdog) {
    $watchdogArguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$watchdogScriptPath`" -TaskName `"$TaskName`" -SharedPath `"$sharedPath`" -StaleSeconds $WatchdogStaleSeconds"
    $watchdogAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $watchdogArguments
    $watchdogSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
    $watchdogTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $WatchdogIntervalMinutes)

    try {
        $watchdogParams = @{
            TaskName = $watchdogTaskName
            Action = $watchdogAction
            Trigger = $watchdogTrigger
            Settings = $watchdogSettings
            Force = $true
        }
        New-IdentityParams -TaskLogonType $LogonType -IdentityUserId $UserId -SecurePassword $Password -Target $watchdogParams
        Register-ScheduledTask @watchdogParams -ErrorAction Stop | Out-Null
        $watchdogMessage = "Tarea '$watchdogTaskName' cada $WatchdogIntervalMinutes min, latido maximo $WatchdogStaleSeconds s."
    }
    catch {
        Write-Host ""
        Write-Host "No se pudo registrar el watchdog '$watchdogTaskName': $($_.Exception.Message)" -ForegroundColor Yellow
        $watchdogMessage = "No se pudo registrar: $($_.Exception.Message)"
    }
}

Write-Host ""
Write-Host "Agente instalado correctamente para inicio automatico." -ForegroundColor Green
Write-Host "Nombre tarea : $TaskName"
Write-Host "Organizacion : $sanitizedCampusKey"
Write-Host "Config       : $ConfigPath"
Write-Host "Modo         : $taskMode"
Write-Host "Inicio       : $startedMessage"
Write-Host "Watchdog     : $watchdogMessage"
Write-Host ""
Write-Host "Desde ahora el boton 'Escanear ahora' del dashboard puede usar este agente central." -ForegroundColor Cyan
