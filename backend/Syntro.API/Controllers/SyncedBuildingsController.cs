using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Syntro.API.Data;
using Syntro.API.Services;

namespace Syntro.API.Controllers;

[ApiController]
[Route("api/synced-buildings")]
[Authorize]
public class SyncedBuildingsController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly IConfiguration _configuration;

    public SyncedBuildingsController(AppDbContext context, IConfiguration configuration)
    {
        _context = context;
        _configuration = configuration;
    }

    [HttpGet]
    [AllowAnonymous]
    public async Task<IActionResult> GetAll([FromQuery] string? campus, CancellationToken cancellationToken)
    {
        var query = _context.SyncedBuildings.AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(campus))
        {
            query = query.Where(b => (b.ManualCampus != "" ? b.ManualCampus : b.Campus) == campus);
        }

        var buildingRows = await query
            .OrderBy(b => b.ManualDisplayName != "" ? b.ManualDisplayName : b.DisplayName)
            .Select(b => new
            {
                b.Id,
                b.ExternalId,
                Campus = b.ManualCampus != "" ? b.ManualCampus : b.Campus,
                DisplayName = b.ManualDisplayName != "" ? b.ManualDisplayName : b.DisplayName,
                b.ShortName,
                b.RealName,
                b.Type,
                b.ResponsibleArea,
                b.CentroidLatitude,
                b.CentroidLongitude,
                b.HasInteriorMap,
                b.HasInventory,
                b.MappingStatus,
                b.InventoryStatus,
                IsDeleted = !b.IsActive,
                FloorsJson = b.ManualFloorsJson != "" ? b.ManualFloorsJson : b.FloorsJson,
                b.SyncedAtUtc
            })
            .ToListAsync(cancellationToken);

        var buildings = buildingRows.Select(b => new
        {
            b.Id,
            b.ExternalId,
            b.Campus,
            b.DisplayName,
            b.ShortName,
            b.RealName,
            b.Type,
            b.ResponsibleArea,
            b.CentroidLatitude,
            b.CentroidLongitude,
            b.HasInteriorMap,
            b.HasInventory,
            b.MappingStatus,
            b.InventoryStatus,
            b.IsDeleted,
            FloorsJson = BuildingFloorNormalizer.NormalizeJson(b.FloorsJson),
            b.SyncedAtUtc
        });

        return Ok(buildings);
    }

    [HttpGet("{externalId}/geometry")]
    [AllowAnonymous]
    public IActionResult GetGeometry(string externalId, [FromQuery] int? floor)
    {
        if (string.IsNullOrWhiteSpace(externalId))
            return BadRequest(new { message = "externalId is required." });

        var overrides = _context.BuildingGeometryOverrides
            .AsNoTracking()
            .Where(g => g.BuildingExternalId == externalId);

        var override_ = floor is null
            ? overrides.FirstOrDefault()
            : overrides.FirstOrDefault(g => g.Floor == floor) ?? overrides.FirstOrDefault(g => g.Floor == 0);

        if (override_ is not null && !string.IsNullOrWhiteSpace(override_.GeometryJson))
        {
            return Content(override_.GeometryJson, "application/json");
        }

        var manualBuilding = _context.ManualBuildings
            .AsNoTracking()
            .FirstOrDefault(b => b.ExternalId == externalId);

        if (manualBuilding is not null && !string.IsNullOrWhiteSpace(manualBuilding.GeometryJson))
        {
            return Content(manualBuilding.GeometryJson, "application/json");
        }

        var originalJson = FrontendBuildingGeometry.FindGeometryJson(_configuration, externalId, floor);
        if (originalJson is not null)
        {
            return Content(originalJson, "application/json");
        }

        return NotFound(new { message = $"No geometry found for building {externalId}." });
    }
}
