using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Syntro.API.Data;
using Syntro.API.Models;
using Syntro.API.Services;

namespace Syntro.API.Tests;

public class TelemetryScanRunReconciliationTests : IDisposable
{
    private readonly SqliteConnection _connection;

    public TelemetryScanRunReconciliationTests() => _connection = TestDbContextFactory.CreateInMemoryConnection();

    public void Dispose() => _connection.Dispose();

    private AppDbContext CreateContext() => TestDbContextFactory.CreateContext(_connection);

    private static ScheduledScanRun AddRun(
        AppDbContext db,
        DateTime startedAtUtc,
        string status,
        string campusKey = "sotero",
        DateTime? completedAtUtc = null)
    {
        var run = new ScheduledScanRun
        {
            CampusKey = campusKey,
            ScheduledAtUtc = startedAtUtc,
            StartedAtUtc = startedAtUtc,
            CompletedAtUtc = completedAtUtc,
            Status = status,
            ScheduleLabel = "SEMANAL SOTERO",
            NormalizedCron = "0 30 8 * * 5",
            CreatedAtUtc = startedAtUtc,
            IsActive = true
        };
        db.ScheduledScanRuns.Add(run);
        return run;
    }

    [Fact]
    public async Task RunHuerfanoAntiguo_SeMarcaFallido()
    {
        using var context = CreateContext();
        var utcNow = new DateTime(2026, 9, 25, 20, 0, 0, DateTimeKind.Utc);
        AddRun(context, utcNow.AddHours(-8), "running");
        await context.SaveChangesAsync();

        var reconciled = await NetworkTelemetryLiveScanHostedService.ReconcileOrphanedRunsAsync(context, 120, utcNow);

        Assert.Equal(1, reconciled);
        using var verify = CreateContext();
        var run = await verify.ScheduledScanRuns.SingleAsync();
        Assert.Equal("failed", run.Status);
        Assert.Equal(utcNow, run.CompletedAtUtc);
        Assert.Contains("interrumpida", run.ErrorMessage);
    }

    [Fact]
    public async Task RunHuerfanoMarcadoEnCola_SeMarcaFallido()
    {
        using var context = CreateContext();
        var utcNow = new DateTime(2026, 9, 25, 20, 0, 0, DateTimeKind.Utc);
        AddRun(context, utcNow.AddHours(-4), "queued");
        await context.SaveChangesAsync();

        var reconciled = await NetworkTelemetryLiveScanHostedService.ReconcileOrphanedRunsAsync(context, 120, utcNow);

        Assert.Equal(1, reconciled);
        using var verify = CreateContext();
        Assert.Equal("failed", (await verify.ScheduledScanRuns.SingleAsync()).Status);
    }

    [Fact]
    public async Task RunDentroDelPeriodoDeGracia_NoSeToca()
    {
        using var context = CreateContext();
        var utcNow = new DateTime(2026, 9, 25, 20, 0, 0, DateTimeKind.Utc);
        AddRun(context, utcNow.AddMinutes(-10), "running");
        await context.SaveChangesAsync();

        var reconciled = await NetworkTelemetryLiveScanHostedService.ReconcileOrphanedRunsAsync(context, 120, utcNow);

        Assert.Equal(0, reconciled);
        using var verify = CreateContext();
        Assert.Equal("running", (await verify.ScheduledScanRuns.SingleAsync()).Status);
    }

    [Fact]
    public async Task RunConSnapshotDentroDeLaVentana_NoSeToca()
    {
        using var context = CreateContext();
        var utcNow = new DateTime(2026, 9, 25, 20, 0, 0, DateTimeKind.Utc);
        var started = utcNow.AddHours(-3);
        AddRun(context, started, "running");
        context.NetworkTelemetrySnapshots.Add(new NetworkTelemetrySnapshot
        {
            CampusKey = "sotero",
            CreatedAtUtc = started.AddMinutes(9),
            ObservedAtUtc = started.AddMinutes(9),
            IsActive = true
        });
        await context.SaveChangesAsync();

        var reconciled = await NetworkTelemetryLiveScanHostedService.ReconcileOrphanedRunsAsync(context, 120, utcNow);

        Assert.Equal(0, reconciled);
        using var verify = CreateContext();
        Assert.Equal("running", (await verify.ScheduledScanRuns.SingleAsync()).Status);
    }

    // Regresion: un snapshot de una ejecucion posterior no debe enmascarar al huerfano anterior.
    [Fact]
    public async Task SnapshotDeEjecucionPosterior_NoEnmascaraAlHuerfano()
    {
        using var context = CreateContext();
        var utcNow = new DateTime(2026, 9, 25, 20, 0, 0, DateTimeKind.Utc);
        var started = utcNow.AddHours(-9);
        AddRun(context, started, "running");
        context.NetworkTelemetrySnapshots.Add(new NetworkTelemetrySnapshot
        {
            CampusKey = "sotero",
            CreatedAtUtc = started.AddHours(5),
            ObservedAtUtc = started.AddHours(5),
            IsActive = true
        });
        await context.SaveChangesAsync();

        var reconciled = await NetworkTelemetryLiveScanHostedService.ReconcileOrphanedRunsAsync(context, 120, utcNow);

        Assert.Equal(1, reconciled);
        using var verify = CreateContext();
        Assert.Equal("failed", (await verify.ScheduledScanRuns.SingleAsync()).Status);
    }

    [Fact]
    public async Task SnapshotDeOtraSede_NoEnmascaraAlHuerfano()
    {
        using var context = CreateContext();
        var utcNow = new DateTime(2026, 9, 25, 20, 0, 0, DateTimeKind.Utc);
        var started = utcNow.AddHours(-9);
        AddRun(context, started, "running");
        context.NetworkTelemetrySnapshots.Add(new NetworkTelemetrySnapshot
        {
            CampusKey = "mackay",
            CreatedAtUtc = started.AddMinutes(5),
            ObservedAtUtc = started.AddMinutes(5),
            IsActive = true
        });
        await context.SaveChangesAsync();

        var reconciled = await NetworkTelemetryLiveScanHostedService.ReconcileOrphanedRunsAsync(context, 120, utcNow);

        Assert.Equal(1, reconciled);
    }

    [Fact]
    public async Task RunYaCompletado_NoSeToca()
    {
        using var context = CreateContext();
        var utcNow = new DateTime(2026, 9, 25, 20, 0, 0, DateTimeKind.Utc);
        var started = utcNow.AddHours(-9);
        AddRun(context, started, "running", completedAtUtc: utcNow.AddHours(-8));
        await context.SaveChangesAsync();

        var reconciled = await NetworkTelemetryLiveScanHostedService.ReconcileOrphanedRunsAsync(context, 120, utcNow);

        Assert.Equal(0, reconciled);
    }

    [Fact]
    public async Task SinPeriodoDeGracia_NoReconcilia()
    {
        using var context = CreateContext();
        var utcNow = new DateTime(2026, 9, 25, 20, 0, 0, DateTimeKind.Utc);
        AddRun(context, utcNow.AddHours(-8), "running");
        await context.SaveChangesAsync();

        var reconciled = await NetworkTelemetryLiveScanHostedService.ReconcileOrphanedRunsAsync(context, 0, utcNow);

        Assert.Equal(0, reconciled);
        using var verify = CreateContext();
        Assert.Equal("running", (await verify.ScheduledScanRuns.SingleAsync()).Status);
    }
}

public class TelemetryScanScheduleLoadingTests : IDisposable
{
    private readonly SqliteConnection _connection;

    public TelemetryScanScheduleLoadingTests() => _connection = TestDbContextFactory.CreateInMemoryConnection();

    public void Dispose() => _connection.Dispose();

    private AppDbContext CreateContext() => TestDbContextFactory.CreateContext(_connection);

    // Regresion del bug B: 8 de 10 schedules tenian DeletedAtUtc y IsEnabled en true.
    [Fact]
    public async Task SchedulesBorradosLogicamente_NoSeCargan()
    {
        using var context = CreateContext();
        context.TelemetryScanSchedules.Add(new TelemetryScanSchedule
        {
            Label = "ACTIVO",
            Cron = "0 30 8 * * 5",
            TimeZone = "America/Santiago",
            CampusKey = "sotero",
            IsEnabled = true,
            SortOrder = 0,
            IsActive = true
        });
        context.TelemetryScanSchedules.Add(new TelemetryScanSchedule
        {
            Label = "BORRADO PERO HABILITADO",
            Cron = "0 45 11 * * 5",
            TimeZone = "America/Santiago",
            CampusKey = "sotero",
            IsEnabled = true,
            SortOrder = 1,
            IsActive = true,
            DeletedAtUtc = new DateTime(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc)
        });
        context.TelemetryScanSchedules.Add(new TelemetryScanSchedule
        {
            Label = "DESHABILITADO",
            Cron = "0 0 9 * * 5",
            TimeZone = "America/Santiago",
            CampusKey = "sotero",
            IsEnabled = false,
            SortOrder = 2,
            IsActive = true
        });
        await context.SaveChangesAsync();

        var schedules = await NetworkTelemetryLiveScanHostedService.LoadEnabledSchedulesAsync(context);

        var only = Assert.Single(schedules);
        Assert.Equal("ACTIVO", only.Label);
        Assert.DoesNotContain(schedules, s => s.Label == "BORRADO PERO HABILITADO");
        Assert.DoesNotContain(schedules, s => s.Label == "DESHABILITADO");
    }
}
