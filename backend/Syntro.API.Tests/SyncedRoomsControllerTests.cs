using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Syntro.API.Controllers;
using Syntro.API.Data;
using Syntro.API.Models;

namespace Syntro.API.Tests;

public class SyncedRoomsControllerTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly AppDbContext _context;

    public SyncedRoomsControllerTests()
    {
        _connection = TestDbContextFactory.CreateInMemoryConnection();
        _context = TestDbContextFactory.CreateContext(_connection);
    }

    public void Dispose()
    {
        _context.Dispose();
        _connection.Dispose();
    }

    private SyncedRoomsController CreateController()
    {
        var controller = new SyncedRoomsController(_context);
        var claims = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.Name, "test-user"),
            new Claim(ClaimTypes.Role, "admin"),
        }, "test"));
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = claims },
        };
        return controller;
    }

    private SyncedRoom CreateRoom(string externalId)
    {
        var building = _context.SyncedBuildings.FirstOrDefault(b => b.ExternalId == "B1");
        if (building == null)
        {
            building = new SyncedBuilding
            {
                ExternalId = "B1",
                Campus = "main",
                DisplayName = "Edificio Principal",
                FloorsJson = "[1,2]",
            };
            _context.SyncedBuildings.Add(building);
            _context.SaveChanges();
        }

        var room = new SyncedRoom
        {
            ExternalId = externalId,
            SyncedBuildingId = building.Id,
            BuildingExternalId = "B1",
            Floor = 1,
            Name = "Sala 101",
            GeometryJson = "{}",
        };
        _context.SyncedRooms.Add(room);
        _context.SaveChanges();
        return room;
    }

    [Fact]
    public async Task GetAll_ExcludesSoftDeletedRoom()
    {
        CreateRoom("R-EXISTS");
        CreateRoom("R-DELETED");

        var deleted = await _context.SyncedRooms.SingleAsync(r => r.ExternalId == "R-DELETED");
        deleted.SoftDelete("test-user");
        await _context.SaveChangesAsync();

        var controller = CreateController();
        var result = await controller.GetAll(null, null, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result);
        var rooms = Assert.IsAssignableFrom<IEnumerable<object>>(ok.Value).Cast<dynamic>().ToList();
        Assert.DoesNotContain(rooms, r => r.ExternalId == "R-DELETED");
        Assert.Contains(rooms, r => r.ExternalId == "R-EXISTS");
    }

    [Fact]
    public async Task Delete_SoftDeletesRoom_AndHidesItFromGetAll()
    {
        CreateRoom("R-VIOLABLE");

        var controller = CreateController();
        var deleteResult = await controller.Delete("R-VIOLABLE", CancellationToken.None);
        Assert.IsType<NoContentResult>(deleteResult);

        var getAllResult = await controller.GetAll(null, null, CancellationToken.None);
        var ok = Assert.IsType<OkObjectResult>(getAllResult);
        var rooms = Assert.IsAssignableFrom<IEnumerable<object>>(ok.Value).Cast<dynamic>().ToList();
        Assert.DoesNotContain(rooms, r => r.ExternalId == "R-VIOLABLE");

        var row = await _context.SyncedRooms.SingleAsync(r => r.ExternalId == "R-VIOLABLE");
        Assert.NotNull(row.DeletedAtUtc);
        Assert.NotNull(row.DeletedBy);
    }

    [Fact]
    public async Task Delete_UnknownExternalId_ReturnsNotFound()
    {
        var controller = CreateController();
        var result = await controller.Delete("R-NO-EXISTE", CancellationToken.None);
        Assert.IsType<NotFoundObjectResult>(result);
    }

    [Fact]
    public async Task Delete_AlreadyDeleted_ReturnsNotFound()
    {
        CreateRoom("R-BORRADA");

        var existing = await _context.SyncedRooms.SingleAsync(r => r.ExternalId == "R-BORRADA");
        existing.SoftDelete("test-user");
        await _context.SaveChangesAsync();

        var controller = CreateController();
        var result = await controller.Delete("R-BORRADA", CancellationToken.None);
        Assert.IsType<NotFoundObjectResult>(result);
    }
}