using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Syntro.API.Data;
using Syntro.API.Models;
using Syntro.API.Services;

namespace Syntro.API.Controllers;

[ApiController]
[Route("api/room-geometry-overrides")]
public class RoomGeometryOverridesController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly AuditLogService _auditLogService;

    public RoomGeometryOverridesController(AppDbContext context, AuditLogService auditLogService)
    {
        _context = context;
        _auditLogService = auditLogService;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? buildingExternalId,
        CancellationToken cancellationToken)
    {
        var query = _context.RoomGeometryOverrides
            .AsNoTracking()
            .Where(o => o.DeletedAtUtc == null);

        if (!string.IsNullOrWhiteSpace(buildingExternalId))
            query = query.Where(o => o.BuildingExternalId == buildingExternalId);

        var overrides = await query.ToListAsync(cancellationToken);

        return Ok(overrides.Select(o => new
        {
            o.RoomExternalId,
            o.BuildingExternalId,
            o.GeometryJson,
            o.CentroidLatitude,
            o.CentroidLongitude
        }));
    }

    [HttpPost]
    [Authorize(Roles = $"{AppRoles.Admin},{AppRoles.Admin}")]
    public async Task<IActionResult> CreateOrUpdate(
        [FromBody] RoomGeometryOverrideRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.RoomExternalId))
            return BadRequest(new { message = "RoomExternalId es requerido." });

        if (string.IsNullOrWhiteSpace(request.BuildingExternalId))
            return BadRequest(new { message = "BuildingExternalId es requerido." });

        if (request.Coordinates == null || request.Coordinates.Count < 3)
            return BadRequest(new { message = "Se requieren al menos 3 coordenadas." });

        var existing = await _context.RoomGeometryOverrides
            .FirstOrDefaultAsync(o => o.RoomExternalId == request.RoomExternalId && o.DeletedAtUtc == null, cancellationToken);

        var geometryJson = BuildGeometryJson(request.Coordinates);
        var centroidLng = request.Coordinates.Average(c => c[0]);
        var centroidLat = request.Coordinates.Average(c => c[1]);

        if (existing != null)
        {
            existing.GeometryJson = geometryJson;
            existing.CentroidLatitude = centroidLat;
            existing.CentroidLongitude = centroidLng;
            existing.UpdatedBy = User.Identity?.Name ?? "admin";
            existing.UpdatedAtUtc = DateTime.UtcNow;
            existing.Version++;
        }
        else
        {
            var ovr = new RoomGeometryOverride
            {
                RoomExternalId = request.RoomExternalId,
                BuildingExternalId = request.BuildingExternalId,
                GeometryJson = geometryJson,
                CentroidLatitude = centroidLat,
                CentroidLongitude = centroidLng,
                CreatedBy = User.Identity?.Name ?? "admin",
                UpdatedBy = User.Identity?.Name ?? "admin"
            };
            _context.RoomGeometryOverrides.Add(ovr);
        }

        await _context.SaveChangesAsync(cancellationToken);

        await _auditLogService.LogSecurityEventAsync(
            actionType: "room-geometry-override",
            resource: "room-geometry",
            summary: $"Geometria de sala actualizada: {request.RoomExternalId}",
            details: $"Edificio: {request.BuildingExternalId}",
            result: "success",
            severity: "info",
            changedByUsername: User.Identity?.Name ?? "admin",
            cancellationToken: cancellationToken);

        return Ok(new { request.RoomExternalId, message = "Geometria guardada correctamente." });
    }

    private static string BuildGeometryJson(List<List<double>> coordinates)
    {
        var ring = coordinates
            .Where(c => c.Count >= 2)
            .Select(c => new[] { c[0], c[1] })
            .ToList();

        if (ring[0][0] != ring[^1][0] || ring[0][1] != ring[^1][1])
            ring.Add(new[] { ring[0][0], ring[0][1] });

        var geometry = new
        {
            type = "Polygon",
            coordinates = new[] { ring }
        };

        return JsonSerializer.Serialize(geometry);
    }
}

public class RoomGeometryOverrideRequest
{
    public string? RoomExternalId { get; set; }
    public string? BuildingExternalId { get; set; }
    public List<List<double>>? Coordinates { get; set; }
}
