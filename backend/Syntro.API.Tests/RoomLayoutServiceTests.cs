using Microsoft.Data.Sqlite;
using Syntro.API.Data;
using Syntro.API.Models;
using Syntro.API.Services;

namespace Syntro.API.Tests;

public class RoomLayoutServiceTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly AppDbContext _context;

    public RoomLayoutServiceTests()
    {
        _connection = TestDbContextFactory.CreateInMemoryConnection();
        _context = TestDbContextFactory.CreateContext(_connection);
    }

    public void Dispose()
    {
        _context.Dispose();
        _connection.Dispose();
    }

    private SyncedBuilding CreateBuilding()
    {
        var building = new SyncedBuilding
        {
            ExternalId = "B1",
            Campus = "main",
            DisplayName = "Edificio Principal",
            FloorsJson = "[1,2]",
        };
        _context.SyncedBuildings.Add(building);
        _context.SaveChanges();
        return building;
    }

    [Fact]
    public async Task GetCombinedRoomsAsync_ExcludesSoftDeletedSyncedRooms()
    {
        var building = CreateBuilding();
        _context.SyncedRooms.AddRange(
            new SyncedRoom
            {
                ExternalId = "R-VIVA",
                SyncedBuildingId = building.Id,
                BuildingExternalId = "B1",
                Floor = 1,
                Name = "Sala 101",
                GeometryJson = "{}",
            },
            new SyncedRoom
            {
                ExternalId = "R-BORRADA",
                SyncedBuildingId = building.Id,
                BuildingExternalId = "B1",
                Floor = 1,
                Name = "Sala 102",
                GeometryJson = "{}",
                DeletedAtUtc = DateTime.UtcNow,
                DeletedBy = "test-user",
            });
        await _context.SaveChangesAsync();

        var service = new RoomLayoutService(_context);
        var rooms = await service.GetCombinedRoomsAsync("B1", 1);

        var room = Assert.Single(rooms);
        Assert.Equal("R-VIVA", room.ExternalId);
    }

    [Fact]
    public async Task GetFloorsAsync_SoftDeletedRoomsDoNotAcountForFloor()
    {
        var building = CreateBuilding();
        _context.SyncedRooms.AddRange(
            new SyncedRoom
            {
                ExternalId = "R-1-HABITAT",
                SyncedBuildingId = building.Id,
                BuildingExternalId = "B1",
                Floor = 1,
                Name = "Una",
                GeometryJson = "{}",
            },
            new SyncedRoom
            {
                ExternalId = "R-2-BORRADA",
                SyncedBuildingId = building.Id,
                BuildingExternalId = "B1",
                Floor = 1,
                Name = "Dos",
                GeometryJson = "{}",
                DeletedAtUtc = DateTime.UtcNow,
                DeletedBy = "test-user",
            },
            new SyncedRoom
            {
                ExternalId = "R-3-OTRO-PISO",
                SyncedBuildingId = building.Id,
                BuildingExternalId = "B1",
                Floor = 2,
                Name = "Tres",
                GeometryJson = "{}",
            });
        await _context.SaveChangesAsync();

        var service = new RoomLayoutService(_context);
        var floors = await service.GetFloorsAsync("B1");

        Assert.Equal(2, floors.Count);
        Assert.Equal(1, floors.Single(f => f.Floor == 1).SyncedCount);
        Assert.Equal(1, floors.Single(f => f.Floor == 2).SyncedCount);
    }
}