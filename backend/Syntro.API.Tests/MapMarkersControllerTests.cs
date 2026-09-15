using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using System.Security.Claims;
using Syntro.API.Controllers;
using Syntro.API.Data;
using Syntro.API.Services;

namespace Syntro.API.Tests;

public class MapMarkersControllerTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly AppDbContext _context;
    private readonly AuditLogService _auditLogService;

    public MapMarkersControllerTests()
    {
        _connection = TestDbContextFactory.CreateInMemoryConnection();
        _context = TestDbContextFactory.CreateContext(_connection);
        _auditLogService = new AuditLogService(_context, new HttpContextAccessor());
    }

    public void Dispose()
    {
        _context.Dispose();
        _connection.Dispose();
    }

    private MapMarkersController CreateController()
    {
        var controller = new MapMarkersController(_context, _auditLogService);
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

    [Fact]
    public async Task Create_Delete_ReCreateSameExternalId_Returns201NotConflict()
    {
        var controller = CreateController();

        var createResult = await controller.Create(new CreateMapMarkerRequest
        {
            ExternalId = "MKR-TEST-1",
            BuildingExternalId = "map-general",
            Campus = "test-campus",
            Floor = -1,
            Latitude = -33.45,
            Longitude = -70.66,
            IconKey = "office",
            Label = "Test marker",
        }, CancellationToken.None);

        Assert.IsType<CreatedAtActionResult>(createResult);

        var deleteResult = await controller.Delete("MKR-TEST-1", CancellationToken.None);
        Assert.IsType<NoContentResult>(deleteResult);

        // Re-creating the same marker (undo-delete) should succeed, not Conflict
        var reCreateResult = await controller.Create(new CreateMapMarkerRequest
        {
            ExternalId = "MKR-TEST-1",
            BuildingExternalId = "map-general",
            Campus = "test-campus",
            Floor = -1,
            Latitude = -33.45,
            Longitude = -70.66,
            IconKey = "office",
            Label = "Test marker restored",
        }, CancellationToken.None);

        Assert.IsType<CreatedAtActionResult>(reCreateResult);
    }

    [Fact]
    public async Task Create_DuplicateActive_ReturnsConflict()
    {
        var controller = CreateController();

        var create1 = await controller.Create(new CreateMapMarkerRequest
        {
            ExternalId = "MKR-DUP-1",
            BuildingExternalId = "map-general",
            Campus = "test",
            Floor = -1,
            Latitude = -33.45,
            Longitude = -70.66,
            IconKey = "office",
            Label = "First",
        }, CancellationToken.None);
        Assert.IsType<CreatedAtActionResult>(create1);

        var create2 = await controller.Create(new CreateMapMarkerRequest
        {
            ExternalId = "MKR-DUP-1",
            BuildingExternalId = "map-general",
            Campus = "test",
            Floor = -1,
            Latitude = -33.45,
            Longitude = -70.66,
            IconKey = "office",
            Label = "Duplicate",
        }, CancellationToken.None);
        Assert.IsType<ConflictObjectResult>(create2);
    }
}
