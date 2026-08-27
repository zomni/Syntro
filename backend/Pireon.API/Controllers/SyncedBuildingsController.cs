using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Pireon.API.Data;
using Pireon.API.Services;

namespace Pireon.API.Controllers;

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
    public IActionResult GetGeometry(string externalId)
    {
        if (string.IsNullOrWhiteSpace(externalId))
            return BadRequest(new { message = "externalId is required." });

        var override_ = _context.BuildingGeometryOverrides
            .AsNoTracking()
            .FirstOrDefault(g => g.BuildingExternalId == externalId);

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

        var geometryDir = ResolveFrontendDataDirectory();
        if (geometryDir is null || !Directory.Exists(geometryDir))
            return NotFound(new { message = "Frontend data directory not found." });

        var floorFiles = Directory.GetFiles(geometryDir, "cs_sotero_*.json");
        foreach (var file in floorFiles)
        {
            try
            {
                var json = System.IO.File.ReadAllText(file);
                using var doc = JsonDocument.Parse(json);
                if (!doc.RootElement.TryGetProperty("features", out var features))
                    continue;

                foreach (var feature in features.EnumerateArray())
                {
                    if (!feature.TryGetProperty("properties", out var props))
                        continue;
                    if (!props.TryGetProperty("id", out var idProp))
                        continue;
                    if (idProp.GetString() != externalId)
                        continue;
                    if (!feature.TryGetProperty("geometry", out var geometry))
                        continue;

                    return Content(geometry.GetRawText(), "application/json");
                }
            }
            catch
            {
            }
        }

        return NotFound(new { message = $"No geometry found for building {externalId}." });
    }

    private string? ResolveFrontendDataDirectory()
    {
        var configuredPath = _configuration["FrontendDataPath"];
        if (!string.IsNullOrWhiteSpace(configuredPath) && Directory.Exists(configuredPath))
            return Path.GetFullPath(configuredPath);

        const string dockerPath = "/app/frontend-data";
        if (Directory.Exists(dockerPath))
            return dockerPath;

        return null;
    }
}
