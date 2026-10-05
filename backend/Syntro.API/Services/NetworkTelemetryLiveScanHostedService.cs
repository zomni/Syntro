using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Syntro.API.Data;
using Syntro.API.Models;
using Syntro.API.ViewModels;

namespace Syntro.API.Services;

public class NetworkTelemetryLiveScanHostedService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<NetworkTelemetryLiveScanHostedService> _logger;
    private readonly IConfiguration _configuration;
    private readonly TimeZoneInfo _scheduleTimeZone;

    public NetworkTelemetryLiveScanHostedService(
        IServiceScopeFactory scopeFactory,
        ILogger<NetworkTelemetryLiveScanHostedService> logger,
        IConfiguration configuration)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
        _configuration = configuration;
        _scheduleTimeZone = ResolveTimeZone(configuration["NetworkTelemetrySettings:AutoScanTimeZone"]);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await ReconcileOrphanedRunsAsync(stoppingToken);

        var enabled = GetBool("NetworkTelemetrySettings:AutoScanEnabled", "NETWORK_TELEMETRY_AUTO_SCAN_ENABLED", true);
        if (!enabled)
        {
            _logger.LogInformation("Live network telemetry scheduler disabled by configuration.");
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            DateTime scheduledAtUtc;
            try
            {
                var schedules = await LoadActiveSchedulesAsync(stoppingToken);
                var delay = GetDelayUntilNextRun(schedules, out scheduledAtUtc);
                if (schedules.Count == 0)
                {
                    _logger.LogWarning(
                        "No active telemetry scan schedules found. Falling back to interval mode every {Minutes} minutes.",
                        GetInt("NetworkTelemetrySettings:AutoScanIntervalMinutes", "NETWORK_TELEMETRY_AUTO_SCAN_INTERVAL_MINUTES", 30));
                }
                else if (delay > TimeSpan.Zero)
                {
                    _logger.LogInformation("Next live telemetry scan scheduled in {Delay}.", delay);
                }

                if (delay > TimeSpan.Zero)
                {
                    await Task.Delay(delay, stoppingToken);
                }
            }
            catch (OperationCanceledException)
            {
                break;
            }

            if (stoppingToken.IsCancellationRequested)
            {
                break;
            }

            try
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var bridge = scope.ServiceProvider.GetRequiredService<NetworkTelemetryAgentBridgeService>();

                var nowUtc = DateTime.UtcNow;
                var schedules = await LoadActiveSchedulesAsync(stoppingToken);
                var normalizedCron = string.Join(";", schedules.Select(s => s.Cron));
                var slotInfo = ResolveSlotInfo(schedules, scheduledAtUtc);
                var slotTimeZone = ResolveTimeZone(slotInfo.TimeZoneId ?? _scheduleTimeZone.Id);
                var slotLocalTime = TimeZoneInfo.ConvertTime(scheduledAtUtc, slotTimeZone);

                var existingRunForSlot = await db.ScheduledScanRuns
                    .Where(r => r.ScheduledAtUtc == scheduledAtUtc && r.Status != "failed")
                    .OrderByDescending(r => r.CreatedAtUtc)
                    .FirstOrDefaultAsync(stoppingToken);
                if (existingRunForSlot is not null)
                {
                    _logger.LogWarning(
                        "Skipping duplicate scheduled scan for {ScheduledAtUtc}: run #{Id} already exists with status {Status}.",
                        scheduledAtUtc, existingRunForSlot.Id, existingRunForSlot.Status);
                    continue;
                }

                // Contador cronologico por organizacion: siguiente numero del campus,
                // compartido con las snapshots manuales (NetworkTelemetrySnapshots.RunNumber).
                var maxScheduledRunNumber = await db.ScheduledScanRuns
                    .Where(r => r.CampusKey == slotInfo.CampusKey)
                    .MaxAsync(r => (int?)r.RunNumber, stoppingToken) ?? 0;
                var maxSnapshotRunNumber = await db.NetworkTelemetrySnapshots
                    .Where(s => s.CampusKey == slotInfo.CampusKey)
                    .MaxAsync(s => (int?)s.RunNumber, stoppingToken) ?? 0;
                var nextRunNumber = Math.Max(maxScheduledRunNumber, maxSnapshotRunNumber);

                var run = new ScheduledScanRun
                {
                    CampusKey = slotInfo.CampusKey,
                    RunNumber = nextRunNumber + 1,
                    ScheduledAtUtc = scheduledAtUtc,
                    StartedAtUtc = nowUtc,
                    Status = "running",
                    ScheduledTimeLocal = slotLocalTime.ToString("HH:mm", CultureInfo.InvariantCulture),
                    ScheduledDayLocal = slotLocalTime.ToString("dddd", TelemetryTimeSettings.ResolveCulture(_configuration)),
                    NormalizedCron = normalizedCron,
                    ScheduleLabel = slotInfo.ScheduleLabel,
                    CreatedAtUtc = nowUtc
                };
                db.ScheduledScanRuns.Add(run);
                await db.SaveChangesAsync(stoppingToken);

                var scanner = scope.ServiceProvider.GetRequiredService<NetworkTelemetryLiveScanService>();
                var liveScanRequest = new NetworkTelemetryLiveScanRequest
                {
                    CampusKey = slotInfo.CampusKey,
                    ResolveInteractiveSessions = true,
                    ScanMode = "full",
                    TriggerType = "scheduled"
                };

                if (bridge.UseAgentMode())
                {
                    // Estado del agente de la sede (campusKey) del slot, no global.
                    var agentStatus = await bridge.GetStatusAsync(slotInfo.CampusKey, stoppingToken);
                    var agentNowUtc = DateTime.UtcNow;

                    // El agente solo informa el fallo escribiendo 'failed' en su scan-status.json.
                    // Sin este cierre el run queda 'queued' para siempre y bloquea todos los slots
                    // siguientes, porque shouldFallbackToInline ve un run en cola sin completar.
                    var closedByAgentFailure = await CloseQueuedRunsForFailedAgentAsync(
                        db,
                        slotInfo.CampusKey,
                        agentStatus,
                        agentNowUtc,
                        stoppingToken);
                    if (closedByAgentFailure > 0)
                    {
                        _logger.LogWarning(
                            "Closed {Count} queued telemetry scan run(s) because the Windows agent reported a failure.",
                            closedByAgentFailure);
                    }

                    // Red de seguridad para cuando el agente muere sin escribir su estado.
                    var closedByAge = await CloseStaleQueuedRunsAsync(
                        db,
                        slotInfo.CampusKey,
                        GetQueuedRunTimeoutMinutes(),
                        agentNowUtc,
                        stoppingToken);
                    if (closedByAge > 0)
                    {
                        _logger.LogWarning(
                            "Closed {Count} queued telemetry scan run(s) that exceeded the agent response window.",
                            closedByAge);
                    }

                    if (string.Equals(agentStatus.State, "pending", StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(agentStatus.State, "running", StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(agentStatus.State, "paused", StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(agentStatus.State, "stopping", StringComparison.OrdinalIgnoreCase))
                    {
                        _logger.LogInformation("Skipping automatic telemetry queue because agent is currently {State}.", agentStatus.State);
                        run.Status = "skipped";
                        run.CompletedAtUtc = DateTime.UtcNow;
                        run.ErrorMessage = $"Agente ocupado (estado: {agentStatus.State})";
                        await db.SaveChangesAsync(stoppingToken);
                        continue;
                    }

                    var previousQueuedRun = await db.ScheduledScanRuns
                        .Where(r => r.Status == "queued"
                            && r.CompletedAtUtc == null
                            && (slotInfo.CampusKey == string.Empty
                                || r.CampusKey == slotInfo.CampusKey
                                || r.CampusKey == string.Empty))
                        .OrderByDescending(r => r.CreatedAtUtc)
                        .FirstOrDefaultAsync(stoppingToken);

                    var shouldFallbackToInline = !agentStatus.IsConnected
                        || previousQueuedRun is not null;

                    if (shouldFallbackToInline)
                    {
                        var fallbackReason = !agentStatus.IsConnected
                            ? $"El agente Windows no esta conectado (estado={agentStatus.State})."
                            : $"El escaneo programado #{previousQueuedRun!.RunNumber} sigue en cola sin completarse.";

                        _logger.LogWarning(
                            "Falling back to inline scan. Reason: {Reason}",
                            fallbackReason);

                        if (!CanRunInlineScanHere(out var inlineBlockedReason))
                        {
                            run.Status = "failed";
                            run.CompletedAtUtc = DateTime.UtcNow;
                            run.ErrorMessage = $"{fallbackReason} {inlineBlockedReason}";
                            await db.SaveChangesAsync(stoppingToken);
                            continue;
                        }

                        var result = await scanner.ScanAndStoreAsync("system", liveScanRequest, stoppingToken);
                        _logger.LogInformation("Live network telemetry auto scan completed inline (agent bypassed).");

                        run.Status = "completed";
                        run.CompletedAtUtc = DateTime.UtcNow;
                        run.SnapshotId = result.SnapshotId;
                        run.DeviceCount = result.DeviceCount;
                        run.UserCount = result.UserCount;
                        await db.SaveChangesAsync(stoppingToken);
                        continue;
                    }

                    await bridge.QueueScanAsync("system", liveScanRequest, stoppingToken);
                    _logger.LogInformation("Live network telemetry auto scan queued for Windows agent.");

                    run.Status = "queued";
                    await db.SaveChangesAsync(stoppingToken);
                }
                else
                {
                    if (!CanRunInlineScanHere(out var inlineBlockedReason))
                    {
                        run.Status = "failed";
                        run.CompletedAtUtc = DateTime.UtcNow;
                        run.ErrorMessage = $"No hay agente Windows configurado. {inlineBlockedReason}";
                        await db.SaveChangesAsync(stoppingToken);
                        continue;
                    }

                    var result = await scanner.ScanAndStoreAsync("system", liveScanRequest, stoppingToken);
                    _logger.LogInformation("Live network telemetry scan completed successfully.");

                    run.Status = "completed";
                    run.CompletedAtUtc = DateTime.UtcNow;
                    run.SnapshotId = result.SnapshotId;
                    run.DeviceCount = result.DeviceCount;
                    run.UserCount = result.UserCount;
                    await db.SaveChangesAsync(stoppingToken);
                }
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Live network telemetry scan failed.");
                try
                {
                    using var scope = _scopeFactory.CreateScope();
                    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                    var failedRun = await db.ScheduledScanRuns
                        .OrderByDescending(r => r.CreatedAtUtc)
                        .FirstOrDefaultAsync(r => r.Status == "running", stoppingToken);
                    if (failedRun != null)
                    {
                        failedRun.Status = "failed";
                        failedRun.CompletedAtUtc = DateTime.UtcNow;
                        failedRun.ErrorMessage = ex.Message;
                        await db.SaveChangesAsync(stoppingToken);
                    }
                }
                catch (Exception innerEx)
                {
                    _logger.LogError(innerEx, "Failed to update scheduled scan run status.");
                }
            }
        }
    }

    // Un reinicio del API a mitad de un escaneo deja el run en 'running'/'queued'
    // para siempre: el proceso en memoria que debia cerrarlo ya no existe. Se
    // cierran al arrancar los runs que superaron el periodo de gracia y que no
    // tienen ningun snapshot posterior que demuestre que el agente la termino.
    private async Task ReconcileOrphanedRunsAsync(CancellationToken stoppingToken)
    {
        var graceMinutes = GetInt("NetworkTelemetrySettings:OrphanedRunGraceMinutes", "NETWORK_TELEMETRY_ORPHANED_RUN_GRACE_MINUTES", 120);
        if (graceMinutes <= 0)
        {
            return;
        }

        try
        {
            using var scope = _scopeFactory.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            var reconciled = await ReconcileOrphanedRunsAsync(db, graceMinutes, DateTime.UtcNow, stoppingToken);
            if (reconciled > 0)
            {
                _logger.LogWarning(
                    "Reconciled {Count} orphaned telemetry scan run(s) left in running/queued state.",
                    reconciled);
            }
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "No se pudieron reconciliar las ejecuciones programadas huerfanas.");
        }
    }

    // Marca como fallidas las ejecucion que quedaron running/queued sin cerrar, salvo que
    // exista un snapshot de la misma sede dentro de la ventana plausible del escaneo.
    internal static async Task<int> ReconcileOrphanedRunsAsync(
        AppDbContext db,
        int graceMinutes,
        DateTime utcNow,
        CancellationToken stoppingToken = default)
    {
        if (graceMinutes <= 0)
        {
            return 0;
        }

        var cutoffUtc = utcNow.AddMinutes(-graceMinutes);
        var candidates = await db.ScheduledScanRuns
            .Where(r => (r.Status == "running" || r.Status == "queued") && r.CompletedAtUtc == null)
            .ToListAsync(stoppingToken);

        var reconciled = 0;
        foreach (var run in candidates)
        {
            var startedAtUtc = run.StartedAtUtc ?? run.CreatedAtUtc;
            if (startedAtUtc >= cutoffUtc)
            {
                continue;
            }

            // Solo damos por terminado el run si hay un snapshot de la misma sede
            // dentro de la ventana plausible del escaneo. Un snapshot muy posterior
            // pertenece a otra ejecucion y no debe enmascarar a este huerfano.
            var windowEndUtc = startedAtUtc.AddMinutes(graceMinutes);
            var hasSnapshotForThisRun = await db.NetworkTelemetrySnapshots
                .AnyAsync(
                    s => s.CampusKey == run.CampusKey
                        && s.CreatedAtUtc >= startedAtUtc
                        && s.CreatedAtUtc <= windowEndUtc,
                    stoppingToken);
            if (hasSnapshotForThisRun)
            {
                continue;
            }

            run.Status = "failed";
            run.CompletedAtUtc = utcNow;
            run.ErrorMessage = $"Ejecucion interrumpida: el servicio se reinicio sin cerrar el escaneo (inicio {startedAtUtc:u}).";
            reconciled++;
        }

        if (reconciled > 0)
        {
            await db.SaveChangesAsync(stoppingToken);
        }

        return reconciled;
    }

    private int GetQueuedRunTimeoutMinutes()
        => GetInt("NetworkTelemetrySettings:AgentQueuedRunTimeoutMinutes", "NETWORK_TELEMETRY_AGENT_QUEUED_RUN_TIMEOUT_MINUTES", 45);

    // El escaneo en linea solo aporta datos si corre en Windows (para resolver sesiones y
    // hardware por WMI) o si hay rangos de red configurados. Sin ninguna de las dos cosas,
    // dentro de Docker solo se observaria la red puente del propio contenedor.
    internal static bool CanRunInlineScanHere(bool isWindowsHost, string? configuredScanCidrs, out string blockedReason)
    {
        if (isWindowsHost || !string.IsNullOrWhiteSpace(configuredScanCidrs))
        {
            blockedReason = string.Empty;
            return true;
        }

        blockedReason = "El backend corre en Linux/Docker sin NetworkTelemetrySettings:ScanCidrs configurado, "
            + "asi que el escaneo en linea solo observaria la red del propio contenedor. "
            + "Se requiere el agente Windows (Syntro.NetworkCollector) para capturar la red del campus.";
        return false;
    }

    private bool CanRunInlineScanHere(out string blockedReason)
        => CanRunInlineScanHere(
            OperatingSystem.IsWindows(),
            GetString("NetworkTelemetrySettings:ScanCidrs", "NETWORK_TELEMETRY_SCAN_CIDRS"),
            out blockedReason);

    // Cierra los runs que quedaron 'queued' cuando el agente informo un fallo (scan-timeout,
    // scan-stopped o error). Sin esto el run permanece en cola indefinidamente y cada slot
    // posterior cae al escaneo en linea, que en Linux/Docker solo ve la red del contenedor.
    internal static async Task<int> CloseQueuedRunsForFailedAgentAsync(
        AppDbContext db,
        string campusKey,
        NetworkTelemetryAgentStatusViewModel agentStatus,
        DateTime utcNow,
        CancellationToken stoppingToken = default)
    {
        if (!string.Equals(agentStatus.State, "failed", StringComparison.OrdinalIgnoreCase))
        {
            return 0;
        }

        // Solo cerramos runs en cola anteriores al momento en que el agente registro el
        // fallo, para no dar por fallido un run recien creado con un estado_agent viejo.
        var failureRecordedAtUtc = agentStatus.UpdatedAtUtc ?? agentStatus.CompletedAtUtc;
        var candidates = await db.ScheduledScanRuns
            .Where(r => r.Status == "queued"
                && r.CompletedAtUtc == null
                && (campusKey == string.Empty || r.CampusKey == campusKey || r.CampusKey == string.Empty))
            .ToListAsync(stoppingToken);

        var closed = 0;
        foreach (var run in candidates)
        {
            var queuedAtUtc = run.StartedAtUtc ?? run.CreatedAtUtc;
            if (failureRecordedAtUtc.HasValue && queuedAtUtc > failureRecordedAtUtc.Value)
            {
                continue;
            }

            run.Status = "failed";
            run.CompletedAtUtc = utcNow;
            run.ErrorMessage = BuildAgentFailureMessage(agentStatus);
            closed++;
        }

        if (closed > 0)
        {
            await db.SaveChangesAsync(stoppingToken);
        }

        return closed;
    }

    private static string BuildAgentFailureMessage(NetworkTelemetryAgentStatusViewModel agentStatus)
    {
        var detail = !string.IsNullOrWhiteSpace(agentStatus.Message)
            ? agentStatus.Message.Trim()
            : "el agente Windows no devolvio resultado";
        var error = (agentStatus.Error ?? string.Empty).Trim();

        return string.IsNullOrEmpty(error)
            ? $"El agente Windows no completo el escaneo: {detail}"
            : $"El agente Windows no completo el escaneo ({error}): {detail}";
    }

    // Si el agente muere sin escribir su estado, el run sigue 'queued'. A partir de esta
    // ventana se da por fallido para que el siguiente slot vuelva a encolar al agente.
    internal static async Task<int> CloseStaleQueuedRunsAsync(
        AppDbContext db,
        string campusKey,
        int timeoutMinutes,
        DateTime utcNow,
        CancellationToken stoppingToken = default)
    {
        if (timeoutMinutes <= 0)
        {
            return 0;
        }

        var cutoffUtc = utcNow.AddMinutes(-timeoutMinutes);
        var candidates = await db.ScheduledScanRuns
            .Where(r => r.Status == "queued"
                && r.CompletedAtUtc == null
                && (campusKey == string.Empty || r.CampusKey == campusKey || r.CampusKey == string.Empty))
            .ToListAsync(stoppingToken);

        var closed = 0;
        foreach (var run in candidates)
        {
            var queuedAtUtc = run.StartedAtUtc ?? run.CreatedAtUtc;
            if (queuedAtUtc >= cutoffUtc)
            {
                continue;
            }

            run.Status = "failed";
            run.CompletedAtUtc = utcNow;
            run.ErrorMessage = $"El agente Windows no devolvio resultado en {timeoutMinutes} minutos (escaneo #{run.RunNumber}).";
            closed++;
        }

        if (closed > 0)
        {
            await db.SaveChangesAsync(stoppingToken);
        }

        return closed;
    }

    private async Task<IReadOnlyList<ActiveSchedule>> LoadActiveSchedulesAsync(CancellationToken stoppingToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var dbSchedules = await LoadEnabledSchedulesAsync(db, stoppingToken);
        if (dbSchedules.Count > 0)
        {
            return dbSchedules;
        }

        var configExpressions = GetCronExpressions();
        if (configExpressions.Count > 0)
        {
            return configExpressions
                .Select(expression => new ActiveSchedule(expression.ToString(), _scheduleTimeZone.Id, string.Empty, string.Empty))
                .ToList();
        }

        return Array.Empty<ActiveSchedule>();
    }

    // Regresion del bug B: un schedule con DeletedAtUtc informado no debe volver a dispararse,
    // aunque IsEnabled siga en true.
    internal static async Task<List<ActiveSchedule>> LoadEnabledSchedulesAsync(
        AppDbContext db,
        CancellationToken stoppingToken = default)
    {
        return await db.TelemetryScanSchedules
            .AsNoTracking()
            .Where(s => s.IsEnabled && s.DeletedAtUtc == null)
            .OrderBy(s => s.SortOrder)
            .ThenBy(s => s.CreatedAtUtc)
            .Select(s => new ActiveSchedule(s.Cron, s.TimeZone, s.CampusKey, s.Label))
            .ToListAsync(stoppingToken);
    }

    private TimeSpan GetDelayUntilNextRun(IReadOnlyList<ActiveSchedule> schedules, out DateTime nextScheduledUtc)
    {
        var nowUtc = DateTimeOffset.UtcNow;
        var candidates = new List<DateTimeOffset>();

        foreach (var schedule in schedules)
        {
            var nextUtc = TelemetryScanScheduleService.GetNextOccurrenceUtc(
                schedule.Cron,
                schedule.TimeZone,
                nowUtc.UtcDateTime);
            if (nextUtc is null)
            {
                continue;
            }

            candidates.Add(new DateTimeOffset(nextUtc.Value, TimeSpan.Zero));
        }

        if (candidates.Count > 0)
        {
            var nextOccurrenceUtc = candidates.OrderBy(candidate => candidate).First();
            _logger.LogInformation("Telemetry scan candidates: {Candidates}", string.Join(" | ", candidates.OrderBy(candidate => candidate).Take(8).Select(candidate => candidate.ToString("yyyy-MM-dd HH:mm:ss"))));
            nextScheduledUtc = nextOccurrenceUtc.UtcDateTime;
            var delay = nextOccurrenceUtc - nowUtc;
            return delay > TimeSpan.Zero ? delay : TimeSpan.Zero;
        }

        var intervalMinutes = GetInt("NetworkTelemetrySettings:AutoScanIntervalMinutes", "NETWORK_TELEMETRY_AUTO_SCAN_INTERVAL_MINUTES", 30);
        if (intervalMinutes <= 0)
        {
            intervalMinutes = 30;
        }

        nextScheduledUtc = nowUtc.UtcDateTime.AddMinutes(intervalMinutes);
        return TimeSpan.FromMinutes(intervalMinutes);
    }

    private IReadOnlyList<Cronos.CronExpression> GetCronExpressions()
    {
        var configured = GetString("NetworkTelemetrySettings:AutoScanCrons", "NETWORK_TELEMETRY_AUTO_SCAN_CRONS");
        if (string.IsNullOrWhiteSpace(configured))
        {
            configured = GetString("NetworkTelemetrySettings:AutoScanCron", "NETWORK_TELEMETRY_AUTO_SCAN_CRON");
        }

        if (string.IsNullOrWhiteSpace(configured))
        {
            return Array.Empty<Cronos.CronExpression>();
        }

        return configured
            .Split(new[] { ';', '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(value => TelemetryScanScheduleService.TryParseCron(value, out var expression) ? expression : null)
            .Where(expression => expression is not null)
            .Cast<Cronos.CronExpression>()
            .ToList();
    }

    private static TimeZoneInfo ResolveTimeZone(string? configuredTimeZone)
    {
        if (!string.IsNullOrWhiteSpace(configuredTimeZone))
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(configuredTimeZone);
            }
            catch
            {
            }
        }

        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(TelemetryTimeSettings.DefaultTimeZoneId);
        }
        catch
        {
            return TimeZoneInfo.Local;
        }
    }

    private string? GetString(string configKey, string envKey)
        => Environment.GetEnvironmentVariable(envKey) ?? _configuration[configKey];

    private int GetInt(string configKey, string envKey, int fallback)
    {
        var raw = Environment.GetEnvironmentVariable(envKey);
        if (int.TryParse(raw, out var parsed))
        {
            return parsed;
        }

        return int.TryParse(_configuration[configKey], out parsed) ? parsed : fallback;
    }

    private bool GetBool(string configKey, string envKey, bool fallback)
    {
        var raw = Environment.GetEnvironmentVariable(envKey);
        if (bool.TryParse(raw, out var parsed))
        {
            return parsed;
        }

        return bool.TryParse(_configuration[configKey], out parsed) ? parsed : fallback;
    }

    internal readonly record struct ActiveSchedule(string Cron, string TimeZone, string CampusKey, string Label);

    internal readonly record struct SlotResolution(string CampusKey, string ScheduleLabel, string? TimeZoneId);

    internal static SlotResolution ResolveSlotInfo(IReadOnlyList<ActiveSchedule> schedules, DateTime scheduledAtUtc)
    {
        var keys = new List<string>();
        var labels = new List<string>();
        string? timeZoneId = null;
        foreach (var schedule in schedules)
        {
            if (string.IsNullOrWhiteSpace(schedule.CampusKey))
            {
                continue;
            }

            var nextUtc = TelemetryScanScheduleService.GetNextOccurrenceUtc(
                schedule.Cron,
                schedule.TimeZone,
                scheduledAtUtc.AddSeconds(-1));
            if (nextUtc.HasValue &&
                Math.Abs((nextUtc.Value - scheduledAtUtc).TotalSeconds) <= 2)
            {
                keys.Add(schedule.CampusKey);
                if (!string.IsNullOrWhiteSpace(schedule.Label))
                {
                    labels.Add(schedule.Label);
                }

                timeZoneId ??= schedule.TimeZone;
            }
        }

        var campusKey = string.Join(";", keys
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(key => key, StringComparer.OrdinalIgnoreCase));
        var scheduleLabel = string.Join(", ", labels
            .Distinct(StringComparer.OrdinalIgnoreCase));

        return new SlotResolution(campusKey, scheduleLabel, timeZoneId);
    }
}
