using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Syntro.API.Data;
using Syntro.API.Infrastructure;
using Syntro.API.Models;
using Syntro.API.Services;
using Syntro.API.ViewModels;

namespace Syntro.API.Controllers;

[ApiController]
[Route("api/building-geometry-overrides")]
public class BuildingGeometryOverridesController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly IConfiguration _configuration;

    public BuildingGeometryOverridesController(AppDbContext context, IConfiguration configuration)
    {
        _context = context;
        _configuration = configuration;
    }

    [HttpGet]
    [Authorize]
    public async Task<IActionResult> GetAll(CancellationToken cancellationToken)
    {
        var overrides = await _context.BuildingGeometryOverrides
            .AsNoTracking()
            .OrderBy(item => item.BuildingExternalId)
            .ThenBy(item => item.Floor)
            .Select(item => new
            {
                item.BuildingExternalId,
                item.Floor,
                item.GeometryJson,
                item.CentroidLatitude,
                item.CentroidLongitude,
                item.UpdatedBy,
                item.UpdatedAtUtc
            })
            .ToListAsync(cancellationToken);

        return Ok(overrides);
    }

    [HttpPost]
    [Authorize(Roles = $"{AppRoles.Admin}")]
    public async Task<IActionResult> Save(SaveBuildingGeometryOverrideRequest request, CancellationToken cancellationToken)
    {
        var externalId = (request.BuildingExternalId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(externalId))
            return BadRequest(new { message = "El ID del edificio es obligatorio." });

        var building = await _context.SyncedBuildings
            .FirstOrDefaultAsync(item => item.ExternalId == externalId, cancellationToken);

        if (building is null)
            return NotFound(new { message = $"No existe el edificio {externalId}." });

        var floor = request.Floor ?? 0;
        if (!IsValidFloor(building, floor))
            return BadRequest(new { message = $"El piso {floor} no existe en este edificio." });

        var ring = request.Coordinates
            .Where(point => point.Count >= 2)
            .Select(point => new[] { point[0], point[1] })
            .ToList();

        if (ring.Count < 3)
            return BadRequest(new { message = "El poligono debe tener al menos 3 puntos validos." });

        if (ring[0][0] != ring[^1][0] || ring[0][1] != ring[^1][1])
        {
            ring.Add(new[] { ring[0][0], ring[0][1] });
        }

        var centroidLongitude = ring.Take(ring.Count - 1).Average(point => point[0]);
        var centroidLatitude = ring.Take(ring.Count - 1).Average(point => point[1]);
        var geometry = new
        {
            type = "Polygon",
            coordinates = new[] { ring }
        };
        var geometryJson = JsonSerializer.Serialize(geometry);
        var now = DateTime.UtcNow;
        var username = User.FindFirstValue(ClaimTypes.Name) ?? "admin";

        var geometryOverride = await _context.BuildingGeometryOverrides
            .FirstOrDefaultAsync(
                item => item.BuildingExternalId == externalId && item.Floor == floor,
                cancellationToken);

        if (geometryOverride is null)
        {
            geometryOverride = new BuildingGeometryOverride
            {
                BuildingExternalId = externalId,
                Floor = floor
            };
            _context.BuildingGeometryOverrides.Add(geometryOverride);
        }

        geometryOverride.GeometryJson = geometryJson;
        geometryOverride.CentroidLatitude = centroidLatitude;
        geometryOverride.CentroidLongitude = centroidLongitude;
        geometryOverride.UpdatedBy = username;
        geometryOverride.UpdatedAtUtc = now;

        building.CentroidLatitude = centroidLatitude;
        building.CentroidLongitude = centroidLongitude;

        var floorLabel = floor == 0 ? "todos los pisos" : $"piso {floor}";
        _context.AuditLogEntries.Add(new AuditLogEntry
        {
            BuildingExternalId = externalId,
            EntityType = "synced-building",
            EntityId = externalId,
            ActionType = "geometry-updated",
            Summary = $"Geometria actualizada en {building.EffectiveDisplayName} ({floorLabel})",
            Details = $"Poligono actualizado con {ring.Count - 1} puntos en {floorLabel}.",
            ChangedByUsername = username,
            CreatedAtUtc = now
        });

        await _context.SaveChangesAsync(cancellationToken);

        return Ok(new
        {
            externalId,
            floor,
            geometryJson,
            centroidLatitude,
            centroidLongitude,
            updatedAtUtc = now
        });
    }

    [HttpDelete("{externalId}")]
    [Authorize(Roles = $"{AppRoles.Admin}")]
    public async Task<IActionResult> Delete(string externalId, [FromQuery] int floor, CancellationToken cancellationToken)
    {
        var id = (externalId ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(id))
            return BadRequest(new { message = "El ID del edificio es obligatorio." });

        var rows = await _context.BuildingGeometryOverrides
            .Where(item => item.BuildingExternalId == id)
            .ToListAsync(cancellationToken);

        if (rows.Count == 0)
            return NotFound(new { message = "Este edificio ya tiene la forma original." });

        var removed = rows.FirstOrDefault(item => item.Floor == floor);
        var removedShared = false;

        if (removed is null && floor != 0)
        {
            // No hay forma propia de este piso: lo unico que lo afecta es la
            // forma compartida (legada) que aplica a todos los pisos.
            removed = rows.FirstOrDefault(item => item.Floor == 0);
            removedShared = removed is not null;
        }

        if (removed is null)
            return NotFound(new { message = "Este edificio ya tiene la forma original." });

        _context.BuildingGeometryOverrides.Remove(removed);

        var remainingCount = rows.Count(item => item.Id != removed.Id);
        var floorLabel = removedShared || removed.Floor == 0
            ? "forma compartida (todos los pisos)"
            : $"forma del piso {removed.Floor}";

        var now = DateTime.UtcNow;
        var username = User.FindFirstValue(ClaimTypes.Name) ?? "admin";

        // Sin overrides pendientes, el centroide vuelve al poligono original del mapa.
        if (remainingCount == 0)
        {
            var originalJson = FrontendBuildingGeometry.FindGeometryJson(_configuration, id, removed.Floor == 0 ? null : removed.Floor);
            var centroid = ComputeCentroid(originalJson);
            if (centroid is not null)
            {
                var building = await _context.SyncedBuildings
                    .FirstOrDefaultAsync(item => item.ExternalId == id, cancellationToken);
                if (building is not null)
                {
                    building.CentroidLatitude = centroid.Value.latitude;
                    building.CentroidLongitude = centroid.Value.longitude;
                }
            }
        }

        _context.AuditLogEntries.Add(new AuditLogEntry
        {
            BuildingExternalId = id,
            EntityType = "synced-building",
            EntityId = id,
            ActionType = "geometry-reset",
            Summary = $"Forma original restaurada ({floorLabel})",
            Details = removedShared
                ? $"Se elimino la forma compartida que afectaba a todos los pisos del edificio {id}."
                : $"Se elimino la {floorLabel} y volvio a la forma del mapa base.",
            ChangedByUsername = username,
            CreatedAtUtc = now
        });

        await _context.SaveChangesAsync(cancellationToken);

        return Ok(new
        {
            externalId = id,
            floor = removed.Floor,
            removedShared,
            remainingCount
        });
    }

    private static bool IsValidFloor(SyncedBuilding building, int floor)
    {
        if (floor == 0)
            return true;

        return BuildingFloorNormalizer.ParseFloors(building.EffectiveFloorsJson).Contains(floor);
    }

    private static (double latitude, double longitude)? ComputeCentroid(string? geometryJson)
    {
        if (string.IsNullOrWhiteSpace(geometryJson))
            return null;

        try
        {
            using var doc = JsonDocument.Parse(geometryJson);
            if (!doc.RootElement.TryGetProperty("coordinates", out var coordinates))
                return null;

            var ring = coordinates[0];
            var points = new List<(double longitude, double latitude)>();
            foreach (var point in ring.EnumerateArray())
            {
                points.Add((point[0].GetDouble(), point[1].GetDouble()));
            }

            if (points.Count == 0)
                return null;

            // El cierre repite el primer punto: se ignora para no sesgar el promedio.
            var distinct = points.Count > 1 && points[0] == points[^1]
                ? points.Take(points.Count - 1).ToList()
                : points;

            return (distinct.Average(p => p.latitude), distinct.Average(p => p.longitude));
        }
        catch
        {
            return null;
        }
    }
}
