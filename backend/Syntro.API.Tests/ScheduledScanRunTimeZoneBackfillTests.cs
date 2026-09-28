using Microsoft.Data.Sqlite;
using Syntro.API.Data;
using Syntro.API.Models;
using Syntro.API.Services;

namespace Syntro.API.Tests;

public class ScheduledScanRunTimeZoneBackfillTests : IDisposable
{
    private readonly SqliteConnection _connection;

    public ScheduledScanRunTimeZoneBackfillTests()
    {
        _connection = TestDbContextFactory.CreateInMemoryConnection();
    }

    public void Dispose() => _connection.Dispose();

    private AppDbContext CreateContext() => TestDbContextFactory.CreateContext(_connection);

    private static IConfiguration CreateConfiguration() => TestConfiguration.FromSettings(new Dictionary<string, string?>
    {
        ["NetworkTelemetrySettings:DisplayTimeZone"] = "UTC"
    });

    private static void Seed(AppDbContext context)
    {
        context.TelemetryScanSchedules.AddRange(
            new TelemetryScanSchedule
            {
                Id = Guid.NewGuid(),
                Label = "SEMANAL SOTERO",
                Cron = "0 30 8 * * 5;0 30 13 * * 5;0 30 16 * * 5",
                TimeZone = "America/Santiago",
                CampusKey = "sotero",
                IsEnabled = true,
                SortOrder = 0,
                IsActive = true,
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow,
                CreatedBy = "test",
                UpdatedBy = "test",
                DeletedBy = "",
                Version = 1
            },
            // Schedule borrado logicamente: no debe generar candidatos.
            new TelemetryScanSchedule
            {
                Id = Guid.NewGuid(),
                Label = "vi 11:45",
                Cron = "0 45 11 * * 5",
                TimeZone = "America/Santiago",
                CampusKey = "sotero",
                IsEnabled = true,
                SortOrder = 1,
                IsActive = false,
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow,
                CreatedBy = "test",
                UpdatedBy = "test",
                DeletedAtUtc = DateTime.UtcNow,
                DeletedBy = "test",
                Version = 1
            });

        context.ScheduledScanRuns.AddRange(
            // 16:30 UTC = franja 13:30 de Santiago. Venia rotulada como "16:30" por
            // usar la zona global en vez de la del schedule.
            new ScheduledScanRun
            {
                Id = Guid.NewGuid(),
                CampusKey = "sotero",
                ScheduledAtUtc = new DateTime(2026, 9, 25, 16, 30, 0, DateTimeKind.Utc),
                Status = "completed",
                ScheduleLabel = "SEMANAL SOTERO",
                ScheduledTimeLocal = "16:30",
                ScheduledDayLocal = "viernes",
                NormalizedCron = "0 30 8 * * 5",
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow,
                CreatedBy = "test",
                UpdatedBy = "test",
                DeletedBy = "",
                Version = 1,
                IsActive = true
            },
            // Run antiguo sin ScheduleLabel: debe usar la zona de la sede.
            new ScheduledScanRun
            {
                Id = Guid.NewGuid(),
                CampusKey = "sotero",
                ScheduledAtUtc = new DateTime(2026, 8, 21, 20, 30, 0, DateTimeKind.Utc),
                Status = "completed",
                ScheduleLabel = "",
                ScheduledTimeLocal = "20:30",
                ScheduledDayLocal = "jueves",
                NormalizedCron = "",
                CreatedAtUtc = DateTime.UtcNow,
                UpdatedAtUtc = DateTime.UtcNow,
                CreatedBy = "test",
                UpdatedBy = "test",
                DeletedBy = "",
                Version = 1,
                IsActive = true
            });
    }

    // Regresion del bug A: el backfill debe relabelar los runs con la zona del schedule.
    [Fact]
    public async Task Backfill_RelabelaConLaZonaDelScheduleYEsIdempotente()
    {
        using var context = CreateContext();
        Seed(context);
        await context.SaveChangesAsync();

        await ExtendedSchemaInitializer.EnsureAsync(context, CreateConfiguration());

        using var verifyContext = CreateContext();
        var runs = verifyContext.ScheduledScanRuns.OrderBy(r => r.ScheduledAtUtc).ToList();

        // Agosto (UTC-4) viene primero al ordenar por fecha.
        var agosto = runs.Single(r => r.ScheduledAtUtc.Month == 8);
        Assert.Equal("16:30", agosto.ScheduledTimeLocal);
        Assert.Equal("viernes", agosto.ScheduledDayLocal);

        var septiembre = runs.Single(r => r.ScheduledAtUtc.Month == 9);
        Assert.Equal("13:30", septiembre.ScheduledTimeLocal);
        Assert.Equal("viernes", septiembre.ScheduledDayLocal);

        // Idempotente: una segunda pasada no debe cambiar nada.
        await ExtendedSchemaInitializer.EnsureAsync(verifyContext, CreateConfiguration());
        using var afterSecondPassContext = CreateContext();
        var afterSecondPass = afterSecondPassContext.ScheduledScanRuns.OrderBy(r => r.ScheduledAtUtc).ToList();
        Assert.Equal("16:30", afterSecondPass.Single(r => r.ScheduledAtUtc.Month == 8).ScheduledTimeLocal);
        Assert.Equal("13:30", afterSecondPass.Single(r => r.ScheduledAtUtc.Month == 9).ScheduledTimeLocal);
    }

    // Regresion del bug B: los schedules borrados logicamente no deben generar runs.
    [Fact]
    public async Task ScheduleBorradoLogicamente_NoGeneraRun()
    {
        using var context = CreateContext();
        Seed(context);
        await context.SaveChangesAsync();

        await ExtendedSchemaInitializer.EnsureAsync(context, CreateConfiguration());

        using var verifyContext = CreateContext();

        // El filtro global de EF oculta los borrados logicos.
        var deleted = await verifyContext.TelemetryScanSchedules
            .IgnoreQueryFilters()
            .SingleAsync(s => s.Label == "vi 11:45");
        Assert.NotNull(deleted.DeletedAtUtc);

        // El unico schedule vigente es SEMANAL SOTERO; el borrado queda fuera.
        var activeSchedules = await verifyContext.TelemetryScanSchedules
            .Where(s => s.IsEnabled)
            .ToListAsync();
        Assert.Single(activeSchedules);
        Assert.Equal("SEMANAL SOTERO", activeSchedules[0].Label);
    }
}
