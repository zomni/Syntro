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

                // Contador cronologico por organizacion: siguiente numero del campus.
                var nextRunNumber = await db.ScheduledScanRuns
                    .Where(r => r.CampusKey == slotInfo.CampusKey)
                    .MaxAsync(r => (int?)r.RunNumber, stoppingToken) ?? 0;

                var run = new ScheduledScanRun
                {
                    CampusKey = slotInfo.CampusKey,
                    RunNumber = nextRunNumber + 1,
                    ScheduledAtUtc = scheduledAtUtc,
                    StartedAtUtc = nowUtc,
                    Status = "running",
                    ScheduledTimeLocal = TimeZoneInfo.ConvertTime(scheduledAtUtc, _scheduleTimeZone).ToString("HH:mm"),
                    ScheduledDayLocal = TimeZoneInfo.ConvertTime(scheduledAtUtc, _scheduleTimeZone).ToString("dddd", TelemetryTimeSettings.ResolveCulture(_configuration)),
                    NormalizedCron = normalizedCron,
                    ScheduleLabel = slotInfo.ScheduleLabel,
                    CreatedAtUtc = nowUtc
                };
                db.ScheduledScanRuns.Add(run);
                await db.SaveChangesAsync(stoppingToken);

                var scanner = scope.ServiceProvider.GetRequiredService<NetworkTelemetryLiveScanService>();

                if (bridge.UseAgentMode())
                {
                    // Estado del agente de la sede (campusKey) del slot, no global.
                    var agentStatus = await bridge.GetStatusAsync(slotInfo.CampusKey, stoppingToken);
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
                        .Where(r => r.Status == "queued" && r.CompletedAtUtc == null)
                        .OrderByDescending(r => r.CreatedAtUtc)
                        .FirstOrDefaultAsync(stoppingToken);

                    var shouldFallbackToInline = !agentStatus.IsConnected
                        || previousQueuedRun is not null;

                    if (shouldFallbackToInline)
                    {
                        var reason = !agentStatus.IsConnected
                            ? $"Agent disconnected (state={agentStatus.State})"
                            : $"Previous scan run #{previousQueuedRun!.Id} is still queued without completion";

                        _logger.LogWarning(
                            "Falling back to inline scan. Reason: {Reason}",
                            reason);

                    var result = await scanner.ScanAndStoreAsync("system", new NetworkTelemetryLiveScanRequest
                    {
                        CampusKey = slotInfo.CampusKey,
                        ResolveInteractiveSessions = true,
                        ScanMode = "full",
                        TriggerType = "scheduled"
                    }, stoppingToken);
                    _logger.LogInformation("Live network telemetry auto scan completed inline (agent bypassed).");

                        run.Status = "completed";
                        run.CompletedAtUtc = DateTime.UtcNow;
                        run.SnapshotId = result.SnapshotId;
                        run.DeviceCount = result.DeviceCount;
                        run.UserCount = result.UserCount;
                        await db.SaveChangesAsync(stoppingToken);
                        continue;
                    }

                    await bridge.QueueScanAsync("system", new NetworkTelemetryLiveScanRequest
                    {
                        CampusKey = slotInfo.CampusKey,
                        ResolveInteractiveSessions = true,
                        ScanMode = "full",
                        TriggerType = "scheduled"
                    }, stoppingToken);
                    _logger.LogInformation("Live network telemetry auto scan queued for Windows agent.");

                    run.Status = "queued";
                    await db.SaveChangesAsync(stoppingToken);
                }
                else
                {
                    var result = await scanner.ScanAndStoreAsync("system", new NetworkTelemetryLiveScanRequest
                    {
                        CampusKey = slotInfo.CampusKey,
                        ResolveInteractiveSessions = true,
                        ScanMode = "full",
                        TriggerType = "scheduled"
                    }, stoppingToken);
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

    private async Task<IReadOnlyList<ActiveSchedule>> LoadActiveSchedulesAsync(CancellationToken stoppingToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var dbSchedules = await db.TelemetryScanSchedules
            .AsNoTracking()
            .Where(s => s.IsEnabled)
            .OrderBy(s => s.SortOrder)
            .ThenBy(s => s.CreatedAtUtc)
            .Select(s => new ActiveSchedule(s.Cron, s.TimeZone, s.CampusKey, s.Label))
            .ToListAsync(stoppingToken);

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

    private TimeSpan GetDelayUntilNextRun(IReadOnlyList<ActiveSchedule> schedules, out DateTime nextScheduledUtc)
    {
        var nowUtc = DateTimeOffset.UtcNow;
        var candidates = new List<DateTimeOffset>();

        foreach (var schedule in schedules)
        {
            var timeZone = TelemetryScanScheduleService.ResolveTimeZone(schedule.TimeZone);
            if (!TelemetryScanScheduleService.TryParseCron(schedule.Cron, out var expression) || expression is null)
            {
                continue;
            }

            var nextUtc = expression.GetNextOccurrence(nowUtc.UtcDateTime, timeZone);
            if (nextUtc is null)
            {
                continue;
            }

            candidates.Add(new DateTimeOffset(nextUtc.Value, TimeSpan.Zero));
        }

        if (candidates.Count > 0)
        {
            var nextOccurrenceUtc = candidates.OrderBy(candidate => candidate).First();
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

    private readonly record struct ActiveSchedule(string Cron, string TimeZone, string CampusKey, string Label);

    private readonly record struct SlotResolution(string CampusKey, string ScheduleLabel);

    private static SlotResolution ResolveSlotInfo(IReadOnlyList<ActiveSchedule> schedules, DateTime scheduledAtUtc)
    {
        var keys = new List<string>();
        var labels = new List<string>();
        foreach (var schedule in schedules)
        {
            if (string.IsNullOrWhiteSpace(schedule.CampusKey))
            {
                continue;
            }

            var timeZone = TelemetryScanScheduleService.ResolveTimeZone(schedule.TimeZone);
            if (!TelemetryScanScheduleService.TryParseCron(schedule.Cron, out var expression) || expression is null)
            {
                continue;
            }

            var nextUtc = expression.GetNextOccurrence(scheduledAtUtc.AddSeconds(-1), timeZone);
            if (nextUtc.HasValue &&
                Math.Abs((nextUtc.Value - scheduledAtUtc).TotalSeconds) <= 2)
            {
                keys.Add(schedule.CampusKey);
                if (!string.IsNullOrWhiteSpace(schedule.Label))
                {
                    labels.Add(schedule.Label);
                }
            }
        }

        var campusKey = string.Join(";", keys
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(key => key, StringComparer.OrdinalIgnoreCase));
        var scheduleLabel = string.Join(", ", labels
            .Distinct(StringComparer.OrdinalIgnoreCase));

        return new SlotResolution(campusKey, scheduleLabel);
    }
}
