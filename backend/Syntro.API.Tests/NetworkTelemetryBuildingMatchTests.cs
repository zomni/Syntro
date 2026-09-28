using Microsoft.AspNetCore.Http;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Syntro.API.Data;
using Syntro.API.ML;
using Syntro.API.Models;
using Syntro.API.Services;

namespace Syntro.API.Tests;

public class NetworkTelemetryBuildingMatchTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly AppDbContext _context;
    private readonly string _tempDirectory;

    public NetworkTelemetryBuildingMatchTests()
    {
        _connection = TestDbContextFactory.CreateInMemoryConnection();
        _context = TestDbContextFactory.CreateContext(_connection);
        _tempDirectory = Path.Combine(Path.GetTempPath(), $"syntro-telemetry-match-tests-{Guid.NewGuid():N}");
        Directory.CreateDirectory(_tempDirectory);
    }

    public void Dispose()
    {
        _context.Dispose();
        _connection.Dispose();
        Directory.Delete(_tempDirectory, recursive: true);
    }

    private NetworkTelemetryObservation Device(
        Guid snapshotId,
        string building,
        Guid? importedInventoryItemId = null,
        Guid? syncedEquipmentId = null)
        => new NetworkTelemetryObservation
        {
            NetworkTelemetrySnapshotId = snapshotId,
            ObservationType = "device",
            ExternalKey = Guid.NewGuid().ToString("N"),
            DeviceName = $"pc-{building}-{Guid.NewGuid():N}"[..8],
            BuildingExternalId = building,
            RiskLevel = "low",
            RiskScore = 0,
            ImportedInventoryItemId = importedInventoryItemId,
            SyncedEquipmentId = syncedEquipmentId
        };

    [Fact]
    public async Task GetBuildingRiskSummariesAsync_ComputesMatchedCountAndMatchRatePerBuilding()
    {
        var snapshot = new NetworkTelemetrySnapshot
        {
            CampusKey = "test-campus",
            SourceName = "test",
            SourceType = "wmi",
            Status = "completed",
            ObservedAtUtc = DateTime.UtcNow
        };
        _context.NetworkTelemetrySnapshots.Add(snapshot);
        await _context.SaveChangesAsync();

        var importedItem = Guid.NewGuid();
        var syncedEquipment = Guid.NewGuid();

        _context.NetworkTelemetryObservations.AddRange(
            Device(snapshot.Id, "SR-BLD-A", importedInventoryItemId: importedItem),
            Device(snapshot.Id, "SR-BLD-A", importedInventoryItemId: importedItem),
            Device(snapshot.Id, "SR-BLD-A", syncedEquipmentId: syncedEquipment),
            Device(snapshot.Id, "SR-BLD-A"),
            Device(snapshot.Id, "SR-BLD-B", importedInventoryItemId: importedItem),
            Device(snapshot.Id, "SR-BLD-B"),
            new NetworkTelemetryObservation
            {
                NetworkTelemetrySnapshotId = snapshot.Id,
                ObservationType = "user",
                ExternalKey = Guid.NewGuid().ToString("N"),
                Username = "some-user",
                BuildingExternalId = "SR-BLD-A"
            },
            Device(snapshot.Id, string.Empty));
        await _context.SaveChangesAsync();

        var service = BuildService();

        var summaries = await service.GetBuildingRiskSummariesAsync(snapshot.Id, campusKeys: null);

        var buildingA = Assert.Single(summaries, item => item.BuildingExternalId == "SR-BLD-A");
        Assert.Equal(4, buildingA.DeviceCount);
        Assert.Equal(3, buildingA.MatchedCount);
        Assert.Equal(75.0, buildingA.MatchRate);

        var buildingB = Assert.Single(summaries, item => item.BuildingExternalId == "SR-BLD-B");
        Assert.Equal(2, buildingB.DeviceCount);
        Assert.Equal(1, buildingB.MatchedCount);
        Assert.Equal(50.0, buildingB.MatchRate);

        Assert.DoesNotContain(summaries, item => item.BuildingExternalId == "");
        Assert.Equal(2, summaries.Count);
    }

    [Fact]
    public async Task GetBuildingRiskSummariesAsync_ReturnsZeroMatchRateWhenNoMatches()
    {
        var snapshot = new NetworkTelemetrySnapshot
        {
            CampusKey = "test-campus",
            SourceName = "test",
            SourceType = "wmi",
            Status = "completed",
            ObservedAtUtc = DateTime.UtcNow
        };
        _context.NetworkTelemetrySnapshots.Add(snapshot);
        await _context.SaveChangesAsync();

        _context.NetworkTelemetryObservations.AddRange(
            Device(snapshot.Id, "SR-BLD-EMPTY"),
            Device(snapshot.Id, "SR-BLD-EMPTY"));
        await _context.SaveChangesAsync();

        var service = BuildService();

        var summaries = await service.GetBuildingRiskSummariesAsync(snapshot.Id, campusKeys: null);

        var summary = Assert.Single(summaries);
        Assert.Equal("SR-BLD-EMPTY", summary.BuildingExternalId);
        Assert.Equal(2, summary.DeviceCount);
        Assert.Equal(0, summary.MatchedCount);
        Assert.Equal(0.0, summary.MatchRate);
    }

    [Fact]
    public async Task GetBuildingRiskSummariesAsync_CountsFullMatchWhenOnlyImportedInventoryIsLinked()
    {
        var snapshot = new NetworkTelemetrySnapshot
        {
            CampusKey = "test-campus",
            SourceName = "test",
            SourceType = "wmi",
            Status = "received",
            ObservedAtUtc = DateTime.UtcNow
        };
        _context.NetworkTelemetrySnapshots.Add(snapshot);
        await _context.SaveChangesAsync();

        var importedItem = Guid.NewGuid();
        var observations = Enumerable.Range(0, 40)
            .Select(_ => Device(snapshot.Id, "SR-BLD-IMPORTED", importedInventoryItemId: importedItem))
            .ToList();
        observations.Add(Device(snapshot.Id, "SR-BLD-IMPORTED"));
        _context.NetworkTelemetryObservations.AddRange(observations);
        await _context.SaveChangesAsync();

        var service = BuildService();

        var summaries = await service.GetBuildingRiskSummariesAsync(snapshot.Id, campusKeys: null);

        var summary = Assert.Single(summaries);
        Assert.Equal(41, summary.DeviceCount);
        Assert.Equal(40, summary.MatchedCount);
        Assert.Equal(97.6, summary.MatchRate);
    }

    private NetworkTelemetryService BuildService()
    {
        var config = TestConfiguration.FromSettings(new Dictionary<string, string?>());
        var classificationService = new ItemClassificationService(
            config,
            new LoggerFactory().CreateLogger<ItemClassificationService>());
        var mlSettings = new MlSettingsService(
            config,
            new FakeWebHostEnvironment(_tempDirectory),
            new LoggerFactory().CreateLogger<MlSettingsService>());
        var autoTrainService = new MlAutoTrainService(
            classificationService,
            new RiskPredictionService(config, new LoggerFactory().CreateLogger<RiskPredictionService>()),
            mlSettings,
            _context,
            config,
            new LoggerFactory().CreateLogger<MlAutoTrainService>());
        var auditLogService = new AuditLogService(_context, new HttpContextAccessor());

        return new NetworkTelemetryService(
            _context,
            config,
            auditLogService,
            new RiskPredictionService(config, new LoggerFactory().CreateLogger<RiskPredictionService>()),
            mlSettings,
            autoTrainService,
            NullLogger<NetworkTelemetryService>.Instance);
    }
}