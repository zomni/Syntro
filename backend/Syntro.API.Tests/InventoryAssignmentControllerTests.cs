using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Syntro.API.Controllers;
using Syntro.API.Data;
using Syntro.API.Models;
using Syntro.API.Services;

namespace Syntro.API.Tests;

public class InventoryAssignmentControllerTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly AppDbContext _context;
    private readonly AuditLogService _auditLogService;
    private readonly InventoryAssignmentService _assignmentService;
    private int _rowNumber;

    public InventoryAssignmentControllerTests()
    {
        _connection = TestDbContextFactory.CreateInMemoryConnection();
        _context = TestDbContextFactory.CreateContext(_connection);
        _auditLogService = new AuditLogService(_context, new HttpContextAccessor());
        _assignmentService = new InventoryAssignmentService(_context);
    }

    public void Dispose()
    {
        _context.Dispose();
        _connection.Dispose();
    }

    private InventoryAssignmentController CreateController(string role = "admin")
    {
        var controller = new InventoryAssignmentController(_context, _assignmentService, _auditLogService);
        var claims = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
            new Claim(ClaimTypes.Name, "test-user"),
            new Claim(ClaimTypes.Role, role),
        }, "test"));
        controller.ControllerContext = new ControllerContext
        {
            HttpContext = new DefaultHttpContext { User = claims },
        };
        return controller;
    }

    private SyncedRoom CreateRoom(string externalId, int floor, int? manualFloor = null, string buildingExternalId = "B1")
    {
        var building = _context.SyncedBuildings.FirstOrDefault(b => b.ExternalId == buildingExternalId);
        if (building == null)
        {
            building = new SyncedBuilding
            {
                ExternalId = buildingExternalId,
                Campus = "main",
                DisplayName = "Edificio Principal",
                FloorsJson = "[1,2,3]",
            };
            _context.SyncedBuildings.Add(building);
            _context.SaveChanges();
        }

        var room = new SyncedRoom
        {
            ExternalId = externalId,
            SyncedBuildingId = building.Id,
            BuildingExternalId = buildingExternalId,
            Floor = floor,
            ManualFloor = manualFloor,
            Name = externalId,
            Type = "sector",
        };
        _context.SyncedRooms.Add(room);
        _context.SaveChanges();
        return room;
    }

    private ImportedInventoryItem CreateItem(string assignedRoomExternalId = "", string assignedBuildingExternalId = "B1", int? assignedFloor = 2)
    {
        _rowNumber++;

        var item = new ImportedInventoryItem
        {
            RowNumber = _rowNumber,
            SourceFile = "test-source",
            ItemNumber = $"ITM-{_rowNumber}",
            SerialNumber = $"SN-{_rowNumber}",
            AssignedRoomExternalId = assignedRoomExternalId,
            AssignedBuildingExternalId = assignedBuildingExternalId,
            AssignedFloor = assignedFloor,
        };
        _context.ImportedInventoryItems.Add(item);
        _context.SaveChanges();
        return item;
    }

    [Fact]
    public async Task UpdateItem_MovesEquipmentToSectorAndResolvesBuildingAndFloor()
    {
        CreateRoom("SEC-A", floor: 2);
        var item = CreateItem();
        var controller = CreateController();

        var result = await controller.UpdateItem(
            item.Id,
            new UpdateInventorySectorRequest("SEC-A"),
            CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result);

        var stored = _context.ImportedInventoryItems.First(candidate => candidate.Id == item.Id);
        Assert.Equal("SEC-A", stored.AssignedRoomExternalId);
        Assert.Equal("B1", stored.AssignedBuildingExternalId);
        Assert.Equal(2, stored.AssignedFloor);
        Assert.NotNull(stored.AssignmentUpdatedAtUtc);
        Assert.NotNull(ok.Value);
    }

    [Fact]
    public async Task UpdateItem_WithManualFloorOverride_UsesManualFloor()
    {
        CreateRoom("SEC-MANUAL", floor: 1, manualFloor: 4);
        var item = CreateItem();
        var controller = CreateController();

        var result = await controller.UpdateItem(
            item.Id,
            new UpdateInventorySectorRequest("SEC-MANUAL"),
            CancellationToken.None);

        Assert.IsType<OkObjectResult>(result);

        var stored = _context.ImportedInventoryItems.First(candidate => candidate.Id == item.Id);
        Assert.Equal("SEC-MANUAL", stored.AssignedRoomExternalId);
        Assert.Equal(4, stored.AssignedFloor);
    }

    [Fact]
    public async Task UpdateItem_EmptySector_ClearsRoomButKeepsBuildingAndFloor()
    {
        CreateRoom("SEC-B", floor: 2);
        var item = CreateItem(assignedRoomExternalId: "SEC-B", assignedFloor: 2);
        var controller = CreateController();

        var result = await controller.UpdateItem(
            item.Id,
            new UpdateInventorySectorRequest(""),
            CancellationToken.None);

        Assert.IsType<OkObjectResult>(result);

        var stored = _context.ImportedInventoryItems.First(candidate => candidate.Id == item.Id);
        Assert.Equal(string.Empty, stored.AssignedRoomExternalId);
        Assert.Equal("B1", stored.AssignedBuildingExternalId);
        Assert.Equal(2, stored.AssignedFloor);
    }

    [Fact]
    public async Task UpdateItem_UnknownSector_ReturnsBadRequest()
    {
        var item = CreateItem();
        var controller = CreateController();

        var result = await controller.UpdateItem(
            item.Id,
            new UpdateInventorySectorRequest("SEC-NOPE"),
            CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result);

        var stored = _context.ImportedInventoryItems.First(candidate => candidate.Id == item.Id);
        Assert.Equal(string.Empty, stored.AssignedRoomExternalId);
    }

    [Fact]
    public async Task UpdateItem_UnknownItem_ReturnsNotFound()
    {
        var controller = CreateController();

        var result = await controller.UpdateItem(
            Guid.NewGuid(),
            new UpdateInventorySectorRequest("SEC-A"),
            CancellationToken.None);

        Assert.IsType<NotFoundObjectResult>(result);
    }

    [Fact]
    public async Task UpdateItem_MissingBody_ReturnsBadRequest()
    {
        var controller = CreateController();

        var result = await controller.UpdateItem(
            Guid.NewGuid(),
            null!,
            CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task UpdateItem_SameSector_ReturnsNotChanged()
    {
        CreateRoom("SEC-C", floor: 2);
        var item = CreateItem(assignedRoomExternalId: "SEC-C", assignedFloor: 2);
        var controller = CreateController();

        var result = await controller.UpdateItem(
            item.Id,
            new UpdateInventorySectorRequest("SEC-C"),
            CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.NotNull(ok.Value);

        var stored = _context.ImportedInventoryItems.First(candidate => candidate.Id == item.Id);
        Assert.Equal("SEC-C", stored.AssignedRoomExternalId);
    }

    [Fact]
    public async Task UpdateItems_MovesAllSelectedEquipment()
    {
        CreateRoom("SEC-D", floor: 3);
        var first = CreateItem();
        var second = CreateItem();
        var controller = CreateController("editor");

        var result = await controller.UpdateItems(
            new BulkUpdateInventorySectorRequest(new[] { first.Id, second.Id }, "SEC-D"),
            CancellationToken.None);

        Assert.IsType<OkObjectResult>(result);

        var stored = _context.ImportedInventoryItems.ToList();
        Assert.All(stored, candidate =>
        {
            Assert.Equal("SEC-D", candidate.AssignedRoomExternalId);
            Assert.Equal(3, candidate.AssignedFloor);
        });
    }

    [Fact]
    public async Task UpdateItems_EmptySelection_ReturnsBadRequest()
    {
        var controller = CreateController();

        var result = await controller.UpdateItems(
            new BulkUpdateInventorySectorRequest(Array.Empty<Guid>(), "SEC-D"),
            CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result);
    }

    [Fact]
    public async Task UpdateItems_WithMissingItem_ReturnsNotFound()
    {
        CreateRoom("SEC-E", floor: 2);
        var item = CreateItem();
        var controller = CreateController();

        var result = await controller.UpdateItems(
            new BulkUpdateInventorySectorRequest(new[] { item.Id, Guid.NewGuid() }, "SEC-E"),
            CancellationToken.None);

        Assert.IsType<NotFoundObjectResult>(result);
    }

    [Fact]
    public async Task ResolveAssignment_ValidRoom_UsesRoomBuildingAndFloor()
    {
        CreateRoom("SEC-F", floor: 2);
        var service = new InventoryAssignmentService(_context);

        var resolution = await service.ResolveAssignmentAsync("SEC-F", "  ", 5, strict: false, CancellationToken.None);

        Assert.True(resolution.IsValid);
        Assert.Equal("SEC-F", resolution.RoomExternalId);
        Assert.Equal("B1", resolution.BuildingExternalId);
        Assert.Equal(2, resolution.Floor);
    }

    [Fact]
    public async Task ResolveAssignment_EmptyBuildingWithoutRoom_ClearsRoomAndFloor()
    {
        var service = new InventoryAssignmentService(_context);

        var resolution = await service.ResolveAssignmentAsync("", "  ", 5, strict: false, CancellationToken.None);

        Assert.True(resolution.IsValid);
        Assert.Equal(string.Empty, resolution.RoomExternalId);
        Assert.Equal(string.Empty, resolution.BuildingExternalId);
        Assert.Null(resolution.Floor);
    }

    [Fact]
    public async Task ResolveAssignment_UnknownRoomNonStrict_ClearsRoomOnly()
    {
        var service = new InventoryAssignmentService(_context);

        var resolution = await service.ResolveAssignmentAsync("SEC-GHOST", "B1", 3, strict: false, CancellationToken.None);

        Assert.True(resolution.IsValid);
        Assert.Equal(string.Empty, resolution.RoomExternalId);
        Assert.Equal("B1", resolution.BuildingExternalId);
        Assert.Equal(3, resolution.Floor);
    }

    [Fact]
    public async Task ResolveSector_RoomExternalIdTooLong_ReturnsInvalid()
    {
        var service = new InventoryAssignmentService(_context);

        var resolution = await service.ResolveSectorAsync(new string('x', 200), strict: true, CancellationToken.None);

        Assert.False(resolution.IsValid);
        Assert.NotNull(resolution.Error);
    }
}