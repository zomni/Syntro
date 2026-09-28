param(
    [string]$TaskName = "Syntro Network Collector Agent",
    [string]$SharedPath = "",
    [int]$StaleSeconds = 180,
    [int]$HangSeconds = 600,
    [int]$MaxRestartsPerHour = 3,
    [string]$ProcessName = "Syntro.NetworkCollector",
    [switch]$CheckOnly
)

$ErrorActionPreference = "Continue"

if ([string]::IsNullOrWhiteSpace($SharedPath)) {
    Write-Output "Falta -SharedPath con la carpeta compartida del agente."
    exit 1
}

$heartbeatPath = Join-Path $SharedPath "agent-heartbeat.json"
$statePath = Join-Path $SharedPath "agent-watchdog-state.json"
$logPath = Join-Path $SharedPath "agent-watchdog.log"

function Write-WatchdogLog {
    param([string]$Message)
    $line = "{0} | {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    try { Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8 } catch { }
    Write-Output $line
}

function Get-HeartbeatAgeSeconds {
    if (-not (Test-Path -LiteralPath $heartbeatPath)) { return $null }
    try {
        $payload = Get-Content -LiteralPath $heartbeatPath -Raw | ConvertFrom-Json
        if ($null -eq $payload.heartbeatAtUtc) { return $null }
        $stamp = [DateTime]::Parse(
            $payload.heartbeatAtUtc,
            [Globalization.CultureInfo]::InvariantCulture,
            [Globalization.DateTimeStyles]::AdjustToUniversal -bor [Globalization.DateTimeStyles]::AssumeUniversal)
        return [int]((Get-Date).ToUniversalTime() - $stamp.ToUniversalTime()).TotalSeconds
    }
    catch {
        return $null
    }
}

function Get-RestartBudget {
    if (-not (Test-Path -LiteralPath $statePath)) { return @() }
    try {
        $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
        if ($null -eq $state.restartsUtc) { return @() }
        return @($state.restartsUtc | ForEach-Object { [datetime]::Parse($_, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AdjustToUniversal -bor [Globalization.DateTimeStyles]::AssumeUniversal) })
    }
    catch {
        return @()
    }
}

function Save-RestartBudget {
    param([object[]]$Restarts)
    try {
        $payload = [ordered]@{
            restartsUtc = @($Restarts | ForEach-Object { $_.ToUniversalTime().ToString("o") })
            updatedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
        }
        $temp = "$statePath.$([Guid]::NewGuid().ToString('N')).tmp"
        Set-Content -LiteralPath $temp -Value ($payload | ConvertTo-Json -Depth 4) -Encoding UTF8
        Move-Item -LiteralPath $temp -Destination $statePath -Force
    }
    catch {
        Write-WatchdogLog "No se pudo guardar el presupuesto de reinicios: $($_.Exception.Message)"
    }
}

function Stop-OrphanProcesses {
    # Stop-ScheduledTask no siempre arrastra al arbol de dotnet, y un colector huerfano
    # seguiria escribiendo en la misma carpeta compartida que el agente nuevo.
    $orphans = @(Get-Process -Name $ProcessName -ErrorAction SilentlyContinue)
    if ($orphans.Count -eq 0) { return }
    Write-WatchdogLog "Deteniendo $($orphans.Count) proceso(s) $($ProcessName) huerfano(s): $(($orphans | ForEach-Object { $_.Id }) -join ', ')"
    foreach ($orphan in $orphans) {
        try { Stop-Process -Id $orphan.Id -Force -ErrorAction Stop } catch { }
    }
}

try {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
}
catch {
    Write-WatchdogLog "No se encontro la tarea '$TaskName': $($_.Exception.Message)"
    exit 1
}

$taskState = [string]$task.State
$age = Get-HeartbeatAgeSeconds
$ageText = if ($null -eq $age) { "sin heartbeat" } else { "$age s" }
$taskRunning = $taskState -eq "Running"
$heartbeatFresh = ($null -ne $age -and $age -le $StaleSeconds)

# Si el supervisor registro desiredState=stopped, la detencion fue deliberada desde el
# dashboard. Reiniciarla a la fuerza seria ignorar la orden del operador.
$deliberateStop = $false
$supervisorStatusPath = Join-Path $SharedPath "agent-supervisor-status.json"
if (Test-Path -LiteralPath $supervisorStatusPath) {
    try {
        $supervisorStatus = Get-Content -LiteralPath $supervisorStatusPath -Raw | ConvertFrom-Json
        if ([string]$supervisorStatus.desiredState -eq "stopped") {
            $deliberateStop = $true
        }
    }
    catch {
    }
}

if ($deliberateStop) {
    Write-WatchdogLog "Agente detenido de forma deliberada (desiredState=stopped). No se reinicia. Tarea=$taskState, latido=$ageText. Para volver a levantarlo usa 'Iniciar agente' en el dashboard o borra agent-supervisor-state.json."
    exit 0
}

if ($taskRunning -and $heartbeatFresh) {
    Write-WatchdogLog "Agente sano. Tarea=$taskState, latido=$ageText."
    exit 0
}

$window = (Get-Date).ToUniversalTime().AddHours(-1)
$recent = @(Get-RestartBudget | Where-Object { $_ -ge $window })

if ($taskRunning -and ($null -eq $age -or $age -le $HangSeconds)) {
    Write-WatchdogLog "Tarea en ejecucion pero latido en $ageText. Se espera sin actuar (umbral de bloqueo: $HangSeconds s)."
    exit 0
}

if ($recent.Count -ge $MaxRestartsPerHour) {
    Write-WatchdogLog "Sin reinicio: ya se reintento $($recent.Count) veces en la ultima hora (tope $MaxRestartsPerHour). Tarea=$taskState, latido=$ageText."
    exit 4
}

$reason = if ($taskRunning) { "proceso colgado" } else { "tarea $taskState" }
if ($CheckOnly) {
    Write-WatchdogLog "Se requiere reinicio ($reason, latido=$ageText). Modo -CheckOnly: no se actua."
    exit 3
}

if ($taskRunning) {
    Write-WatchdogLog "Deteniendo la tarea colgada ($reason, latido=$ageText)."
    try { Stop-ScheduledTask -TaskName $TaskName -ErrorAction Stop } catch { Write-WatchdogLog "Stop-ScheduledTask fallo: $($_.Exception.Message)" }
    Start-Sleep -Seconds 5
}

Stop-OrphanProcesses
Start-Sleep -Seconds 2

try {
    Start-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    Save-RestartBudget -Restarts (@($recent) + @((Get-Date).ToUniversalTime()))
    Write-WatchdogLog "Tarea reiniciada ($reason, latido=$ageText)."
    exit 3
}
catch {
    Write-WatchdogLog "No se pudo iniciar la tarea: $($_.Exception.Message)"
    exit 1
}
