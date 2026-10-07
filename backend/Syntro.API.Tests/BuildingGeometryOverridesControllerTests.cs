using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using System.Security.Claims;
using Syntro.API.Controllers;
using Syntro.API.Data;
using Syntro.API.Models;
using Syntro.API.ViewModels;

namespace Syntro.API.Tests;

public class BuildingGeometryOverridesControllerTests : IDisposable
{
    private readonly Microsoft.Data.Sqlite.SqliteConnection _connection;
    private readonly AppDbContext _context;

    public BuildingGeometryOverridesControllerTests()
    {
        _connection = TestDbContextFactory.CreateInMemoryConnection();
        _context = TestDbContextFactory.CreateContext(_connection);
    }

    public void Dispose()
    {
        _context.Dispose();
        _connection.Dispose();
    }

    private BuildingGeometryOverridesController CreateController()
    {
        var configuration = new ConfigurationBuilder().Build();
        var controller = new BuildingGeometryOverridesController(_context, configuration);
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

    private SyncedBuilding CreateBuilding(string externalId = "SR-BLD-TEST", string floorsJson = "[1,2]")
    {
        var building = new SyncedBuilding
        {
            ExternalId = externalId,
            DisplayName = "Edificio test",
            FloorsJson = floorsJson,
        };
        _context.SyncedBuildings.Add(building);
        _context.SaveChanges();
        return building;
    }

    private static SaveBuildingGeometryOverrideRequest BuildRequest(
        string externalId = "SR-BLD-TEST",
        int? floor = null) => new()
    {
        BuildingExternalId = externalId,
        Floor = floor,
        Coordinates =
        [
            [0, 0],
            [0, 1],
            [1, 1],
            [0, 0],
        ],
    };

    [Fact]
    public async Task Save_WithoutFloor_LegacyRowTargetsAllFloors()
    {
        var controller = CreateController();
        CreateBuilding();

        var result = await controller.Save(BuildRequest(), CancellationToken.None);

        Assert.IsType<OkObjectResult>(result);
        var row = Assert.Single(_context.BuildingGeometryOverrides);
        Assert.Equal(0, row.Floor);
    }

    [Fact]
    public async Task Save_WithFloor_StoresRowForThatFloorOnly()
    {
        var controller = CreateController();
        CreateBuilding();

        var result = await controller.Save(BuildRequest(floor: 2), CancellationToken.None);

        Assert.IsType<OkObjectResult>(result);
        var row = Assert.Single(_context.BuildingGeometryOverrides);
        Assert.Equal(2, row.Floor);
    }

    [Fact]
    public async Task Save_SameFloor_UpsertsInsteadOfDuplicating()
    {
        var controller = CreateController();
        CreateBuilding();

        await controller.Save(BuildRequest(floor: 2), CancellationToken.None);
        await controller.Save(BuildRequest(floor: 2), CancellationToken.None);

        var rows = _context.BuildingGeometryOverrides.ToList();
        Assert.Single(rows);
        Assert.Equal(2, rows[0].Floor);
    }

    [Fact]
    public async Task Save_DifferentFloors_KeepIndependentRows()
    {
        var controller = CreateController();
        CreateBuilding();

        await controller.Save(BuildRequest(floor: 1), CancellationToken.None);
        await controller.Save(BuildRequest(floor: 2), CancellationToken.None);

        var rows = _context.BuildingGeometryOverrides.OrderBy(r => r.Floor).ToList();
        Assert.Equal(2, rows.Count);
        Assert.Equal(new[] { 1, 2 }, rows.Select(r => r.Floor).ToArray());
    }

    [Fact]
    public async Task Save_FloorNotInBuilding_ReturnsBadRequest()
    {
        var controller = CreateController();
        CreateBuilding(floorsJson: "[1,2]");

        var result = await controller.Save(BuildRequest(floor: 5), CancellationToken.None);

        var badRequest = Assert.IsType<BadRequestObjectResult>(result);
        Assert.Contains("piso 5", badRequest.Value?.ToString());
        Assert.Empty(_context.BuildingGeometryOverrides);
    }

    [Fact]
    public async Task GetGeometry_PrefersExactFloorOverSharedRow()
    {
        var controller = CreateController();
        CreateBuilding();
        await CreateOverrideRow("SR-BLD-TEST", 0, "{\"type\":\"Polygon\",\"coordinates\":[[[0,0],[1,0],[1,1],[0,0]]]}");
        await CreateOverrideRow("SR-BLD-TEST", 2, "{\"type\":\"Polygon\",\"coordinates\":[[[5,5],[6,5],[6,6],[5,5]]]}");

        var syncedController = new SyncedBuildingsController(_context, new ConfigurationBuilder().Build());

        var floor2 = syncedController.GetGeometry("SR-BLD-TEST", 2);
        var content = Assert.IsType<ContentResult>(floor2);
        Assert.Contains("[5,5]", content.Content);

        var floor1 = syncedController.GetGeometry("SR-BLD-TEST", 1);
        content = Assert.IsType<ContentResult>(floor1);
        Assert.Contains("[[0,0]", content.Content);
    }

    [Fact]
    public async Task GetGeometry_WithoutFloorParameter_KeepsLegacyBehavior()
    {
        var controller = CreateController();
        CreateBuilding();
        await CreateOverrideRow("SR-BLD-TEST", 0, "{\"type\":\"Polygon\",\"coordinates\":[[[0,0],[1,0],[1,1],[0,0]]]}");

        var syncedController = new SyncedBuildingsController(_context, new ConfigurationBuilder().Build());
        var result = syncedController.GetGeometry("SR-BLD-TEST", null);

        var content = Assert.IsType<ContentResult>(result);
        Assert.Contains("[[0,0]", content.Content);
    }

    [Fact]
    public async Task Delete_ExactFloor_RemovesOnlyThatRow()
    {
        var controller = CreateController();
        CreateBuilding();
        await controller.Save(BuildRequest(floor: 1), CancellationToken.None);
        await controller.Save(BuildRequest(floor: 2), CancellationToken.None);

        var result = await controller.Delete("SR-BLD-TEST", 2, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.NotNull(ok.Value);
        var remaining = Assert.Single(_context.BuildingGeometryOverrides);
        Assert.Equal(1, remaining.Floor);
    }

    [Fact]
    public async Task Delete_WhenOnlySharedRowExists_RemovesSharedRow()
    {
        var controller = CreateController();
        CreateBuilding();
        await controller.Save(BuildRequest(), CancellationToken.None);

        var result = await controller.Delete("SR-BLD-TEST", 2, CancellationToken.None);

        var ok = Assert.IsType<OkObjectResult>(result);
        Assert.NotNull(ok.Value);
        Assert.Empty(_context.BuildingGeometryOverrides);
    }

    [Fact]
    public async Task Delete_WithoutAnyOverride_ReturnsNotFound()
    {
        var controller = CreateController();
        CreateBuilding();

        var result = await controller.Delete("SR-BLD-TEST", 1, CancellationToken.None);

        Assert.IsType<NotFoundObjectResult>(result);
    }

    [Fact]
    public async Task Delete_AfterRemovingLastOverride_RegistersAuditEntry()
    {
        var controller = CreateController();
        CreateBuilding();
        await controller.Save(BuildRequest(floor: 2), CancellationToken.None);

        await controller.Delete("SR-BLD-TEST", 2, CancellationToken.None);

        Assert.Contains(_context.AuditLogEntries, entry => entry.ActionType == "geometry-reset");
    }

    private async Task CreateOverrideRow(string externalId, int floor, string geometryJson)
    {
        _context.BuildingGeometryOverrides.Add(new BuildingGeometryOverride
        {
            BuildingExternalId = externalId,
            Floor = floor,
            GeometryJson = geometryJson,
        });
        await _context.SaveChangesAsync();
    }
}
