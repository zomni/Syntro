using System.Text.Json;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Syntro.API.Data;
using Syntro.API.Models;
using Syntro.API.Services;

namespace Syntro.API.Tests;

public class FrontendSyncServiceTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly AppDbContext _context;
    private readonly string _tempRoot;

    public FrontendSyncServiceTests()
    {
        _connection = TestDbContextFactory.CreateInMemoryConnection();
        _context = TestDbContextFactory.CreateContext(_connection);

        _tempRoot = Path.Combine(Path.GetTempPath(), $"syntro-sync-test-{Guid.NewGuid():N}");
        Directory.CreateDirectory(Path.Combine(_tempRoot, "interiors", "B1"));
    }

    public void Dispose()
    {
        _context.Dispose();
        _connection.Dispose();
        try { Directory.Delete(_tempRoot, true); } catch { }
    }

    private void WriteCatalogAndRooms()
    {
        File.WriteAllText(
            Path.Combine(_tempRoot, "syntro_buildings_catalog.json"),
            JsonSerializer.Serialize(new
            {
                buildings = new[]
                {
                    new { id = "B1", displayName = "Edificio", floors = new[] { 1 } },
                },
            }));

        File.WriteAllText(
            Path.Combine(_tempRoot, "interiors", "B1", "floor_1_rooms.json"),
            JsonSerializer.Serialize(new
            {
                rooms = new[]
                {
                    new { roomId = "R-BORRADA", name = "Sala Borrada", floor = 1 },
                    new { roomId = "R-VIVA", name = "Sala Viva", floor = 1 },
                },
            }));
    }

    private FrontendSyncService CreateService()
    {
        IConfiguration configuration = TestConfiguration.FromSettings(new Dictionary<string, string?>
        {
            ["FrontendDataRoot"] = _tempRoot,
        });
        return new FrontendSyncService(_context, configuration, NullLogger<FrontendSyncService>.Instance);
    }

    [Fact]
    public async Task SyncAsync_DoesNotResurrectTombstonedRooms()
    {
        var building = new SyncedBuilding
        {
            ExternalId = "B1",
            Campus = "main",
            DisplayName = "Edificio",
            FloorsJson = "[1]",
        };
        _context.SyncedBuildings.Add(building);
        await _context.SaveChangesAsync();

        _context.SyncedRooms.Add(new SyncedRoom
        {
            ExternalId = "R-BORRADA",
            SyncedBuildingId = building.Id,
            BuildingExternalId = "B1",
            Floor = 1,
            Name = "Sala Borrada",
            GeometryJson = "{}",
            DeletedAtUtc = DateTime.UtcNow,
            DeletedBy = "test-user",
        });
        await _context.SaveChangesAsync();

        WriteCatalogAndRooms();
        var service = CreateService();
        var result = await service.SyncAsync();

        Assert.Equal(1, result.RoomsCount);

        var tombstone = await _context.SyncedRooms.SingleAsync(r => r.ExternalId == "R-BORRADA");
        Assert.NotNull(tombstone.DeletedAtUtc);

        var live = await _context.SyncedRooms.SingleAsync(r => r.ExternalId == "R-VIVA");
        Assert.Null(live.DeletedAtUtc);
        Assert.Equal("Sala Viva", live.Name);
    }
}