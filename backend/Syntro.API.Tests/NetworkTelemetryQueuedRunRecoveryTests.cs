using Microsoft.EntityFrameworkCore;
using Syntro.API.Data;
using Syntro.API.Models;
using Syntro.API.Services;
using Xunit;

namespace Syntro.API.Tests;

public class NetworkTelemetryQueuedRunRecoveryTests : IDisposable
{
    private const string Campus = "sotero";
    private readonly AppDbContext _db;
    private readonly Guid _tempRoot = Guid.NewGuid();

    public NetworkTelemetryQueuedRunRecoveryTests()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseSqlite($"Data Source=file:queued-run-{_tempRoot}?mode=memory&cache=shared")
            .Options;
        _db = new AppDbContext(options);
        _db.Database.OpenConnection();
        _db.Database.EnsureCreated();
    }

    public void Dispose()
    {
        _db.Dispose();
    }

    private ScheduledScanRun SeedQueuedRun(string externalCampus, int runNumber, DateTime? startedAtUtc)
    {
        var startedAt = startedAtUtc ?? DateTime.UtcNow.AddMinutes(-5);
        var run = new ScheduledScanRun
        {
            CampusKey = externalCampus,
            RunNumber = runNumber,
            ScheduledAtUtc = startedAt,
            StartedAtUtc = startedAt,
            CreatedAtUtc = startedAt,
            Status = "queued"
        };
        _db.ScheduledScanRuns.Add(run);
        _db.SaveChanges();
        return run;
    }

    private static NetworkTelemetryAgentStatusViewModel AgentStatus(
        string state,
        string error = "",
        string message = "",
        DateTime? updatedAtUtc = null)
    {
        return new NetworkTelemetryAgentStatusViewModel
        {
            State = state,
            Error = error,
            Message = message,
            UpdatedAtUtc = updatedAtUtc
        };
    }

    // El agente informa el timeout escribiendo 'failed' en su scan-status.json. Si el API no
    // cierra el run en ese momento, este queda 'queued' para siempre.
    [Fact]
    public async Task AgenteEnFallo_CierraElRunQueued()
    {
        var run = SeedQueuedRun(Campus, 240, DateTime.UtcNow.AddMinutes(-31));
        var failureAt = DateTime.UtcNow.AddMinutes(-1);

        var closed = await NetworkTelemetryLiveScanHostedService.CloseQueuedRunsForFailedAgentAsync(
            _db,
            Campus,
            AgentStatus(
                "failed",
                "scan-timeout",
                "El escaneo supero el tiempo maximo de 30 minutos.",
                failureAt),
            DateTime.UtcNow);

        Assert.Equal(1, closed);
        Assert.Equal("failed", run.Status);
        Assert.NotNull(run.CompletedAtUtc);
        Assert.Contains("scan-timeout", run.ErrorMessage);
        Assert.Contains("30 minutos", run.ErrorMessage);
    }

    // Un estado 'failed' viejo no debe dar por fallido un run recien encolado.
    [Fact]
    public async Task AgenteEnFallo_NoCierraUnRunEnColaPosteriorAlFallo()
    {
        var run = SeedQueuedRun(Campus, 241, DateTime.UtcNow.AddMinutes(-1));
        var failureAt = DateTime.UtcNow.AddMinutes(-20);

        var closed = await NetworkTelemetryLiveScanHostedService.CloseQueuedRunsForFailedAgentAsync(
            _db,
            Campus,
            AgentStatus("failed", "scan-timeout", "El escaneo supero el tiempo maximo de 30 minutos.", failureAt),
            DateTime.UtcNow);

        Assert.Equal(0, closed);
        Assert.Equal("queued", run.Status);
        Assert.Null(run.CompletedAtUtc);
    }

    [Theory]
    [InlineData("idle")]
    [InlineData("completed")]
    [InlineData("running")]
    [InlineData("pending")]
    public async Task AgenteSinFallo_NoCierraElRunQueued(string state)
    {
        var run = SeedQueuedRun(Campus, 242, DateTime.UtcNow.AddMinutes(-31));

        var closed = await NetworkTelemetryLiveScanHostedService.CloseQueuedRunsForFailedAgentAsync(
            _db,
            Campus,
            AgentStatus(state, "", "Agente en espera."),
            DateTime.UtcNow);

        Assert.Equal(0, closed);
        Assert.Equal("queued", run.Status);
    }

    // Red de seguridad: si el agente muere sin escribir estado, el run envejece y se cierra.
    [Fact]
    public async Task RunQueuedViejo_SeCierraPorAntiguedad()
    {
        var run = SeedQueuedRun(Campus, 243, DateTime.UtcNow.AddHours(-2));

        var closed = await NetworkTelemetryLiveScanHostedService.CloseStaleQueuedRunsAsync(
            _db,
            Campus,
            45,
            DateTime.UtcNow);

        Assert.Equal(1, closed);
        Assert.Equal("failed", run.Status);
        Assert.NotNull(run.CompletedAtUtc);
        Assert.Contains("45 minutos", run.ErrorMessage);
    }

    [Fact]
    public async Task RunQueuedReciente_NoSeCierraPorAntiguedad()
    {
        var run = SeedQueuedRun(Campus, 244, DateTime.UtcNow.AddMinutes(-5));

        var closed = await NetworkTelemetryLiveScanHostedService.CloseStaleQueuedRunsAsync(
            _db,
            Campus,
            45,
            DateTime.UtcNow);

        Assert.Equal(0, closed);
        Assert.Equal("queued", run.Status);
    }

    [Fact]
    public async Task CierrePorAntiguedad_NoTocaOtrosCampus()
    {
        var deOtroCampus = SeedQueuedRun("otro", 245, DateTime.UtcNow.AddHours(-3));

        var closed = await NetworkTelemetryLiveScanHostedService.CloseStaleQueuedRunsAsync(
            _db,
            Campus,
            45,
            DateTime.UtcNow);

        Assert.Equal(0, closed);
        Assert.Equal("queued", deOtroCampus.Status);
    }

    [Fact]
    public async Task CierrePorFalloDelAgente_NoTocaOtrosCampus()
    {
        var deOtroCampus = SeedQueuedRun("otro", 246, DateTime.UtcNow.AddHours(-3));

        var closed = await NetworkTelemetryLiveScanHostedService.CloseQueuedRunsForFailedAgentAsync(
            _db,
            Campus,
            AgentStatus("failed", "scan-timeout", "El escaneo supero el tiempo maximo de 30 minutos.", DateTime.UtcNow),
            DateTime.UtcNow);

        Assert.Equal(0, closed);
        Assert.Equal("queued", deOtroCampus.Status);
    }

    [Fact]
    public async Task CierrePorAntiguedad_SinVentanaNoHaceNada()
    {
        var run = SeedQueuedRun(Campus, 247, DateTime.UtcNow.AddHours(-5));

        var closed = await NetworkTelemetryLiveScanHostedService.CloseStaleQueuedRunsAsync(
            _db,
            Campus,
            0,
            DateTime.UtcNow);

        Assert.Equal(0, closed);
        Assert.Equal("queued", run.Status);
    }

    // Dentro de Docker, sin rangos configurados, el escaneo en linea solo veria la red puente
    // del contenedor (3 hosts). Tiene que quedar como fallo visible, no como completado.
    [Fact]
    public void InlineEnLinuxSinScanCidrs_NoSePermite()
    {
        var allowed = NetworkTelemetryLiveScanHostedService.CanRunInlineScanHere(
            isWindowsHost: false,
            configuredScanCidrs: "   ",
            out var reason);

        Assert.False(allowed);
        Assert.Contains("ScanCidrs", reason);
        Assert.Contains("agente Windows", reason);
    }

    [Fact]
    public void InlineEnLinuxConScanCidrs_SePermite()
    {
        var allowed = NetworkTelemetryLiveScanHostedService.CanRunInlineScanHere(
            isWindowsHost: false,
            configuredScanCidrs: "10.6.32.0/22",
            out var reason);

        Assert.True(allowed);
        Assert.Equal(string.Empty, reason);
    }

    [Fact]
    public void InlineEnWindows_SePermite()
    {
        var allowed = NetworkTelemetryLiveScanHostedService.CanRunInlineScanHere(
            isWindowsHost: true,
            configuredScanCidrs: null,
            out var reason);

        Assert.True(allowed);
        Assert.Equal(string.Empty, reason);
    }

    [Fact]
    public void SeleccionDeRunAdoptado_IgnoraRunAtascadoYViejo()
    {
        var nowUtc = new DateTime(2026, 10, 5, 15, 0, 0, DateTimeKind.Utc);
        var atascado = new ScheduledScanRun
        {
            RunNumber = 240,
            Status = "queued",
            CreatedAtUtc = nowUtc.AddHours(-3)
        };
        var reciente = new ScheduledScanRun
        {
            RunNumber = 241,
            Status = "queued",
            CreatedAtUtc = nowUtc.AddMinutes(-10)
        };

        var adoptado = NetworkTelemetryService.SelectRunToAdopt(
            new[] { atascado, reciente },
            nowUtc.AddMinutes(-45));

        Assert.NotNull(adoptado);
        Assert.Equal(241, adoptado.RunNumber);
    }

    [Fact]
    public void SeleccionDeRunAdoptado_SinPendientesDevuelveNull()
    {
        var nowUtc = new DateTime(2026, 10, 5, 15, 0, 0, DateTimeKind.Utc);

        var adoptado = NetworkTelemetryService.SelectRunToAdopt(
            Array.Empty<ScheduledScanRun>(),
            nowUtc.AddMinutes(-45));

        Assert.Null(adoptado);
    }

    [Fact]
    public void SeleccionDeRunAdoptado_SinVentanaAdoptaElMasReciente()
    {
        var nowUtc = new DateTime(2026, 10, 5, 15, 0, 0, DateTimeKind.Utc);
        var atascado = new ScheduledScanRun
        {
            RunNumber = 240,
            Status = "queued",
            CreatedAtUtc = nowUtc.AddHours(-3)
        };
        var reciente = new ScheduledScanRun
        {
            RunNumber = 241,
            Status = "queued",
            CreatedAtUtc = nowUtc.AddMinutes(-10)
        };

        var adoptado = NetworkTelemetryService.SelectRunToAdopt(
            new[] { atascado, reciente },
            DateTime.MinValue);

        Assert.NotNull(adoptado);
        Assert.Equal(241, adoptado.RunNumber);
    }

    [Fact]
    public void SeleccionDeRunAdoptado_IgnoraRunSinNumero()
    {
        var nowUtc = new DateTime(2026, 10, 5, 15, 0, 0, DateTimeKind.Utc);
        var sinNumero = new ScheduledScanRun
        {
            RunNumber = 0,
            Status = "queued",
            CreatedAtUtc = nowUtc.AddMinutes(-10)
        };

        var adoptado = NetworkTelemetryService.SelectRunToAdopt(
            new[] { sinNumero },
            nowUtc.AddMinutes(-45));

        Assert.Null(adoptado);
    }
}