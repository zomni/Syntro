using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Syntro.API.Data;
using Syntro.API.Models;
using Syntro.API.Services;

namespace Syntro.API.Controllers;

[ApiController]
[Route("api/annotations")]
public class AnnotationsController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly AuditLogService _auditLogService;

    public AnnotationsController(AppDbContext context, AuditLogService auditLogService)
    {
        _context = context;
        _auditLogService = auditLogService;
    }

    [HttpGet]
    [AllowAnonymous]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? buildingExternalId,
        [FromQuery] int? floor,
        CancellationToken cancellationToken)
    {
        var query = _context.BuildingAnnotations
            .AsNoTracking()
            .Where(a => a.DeletedAtUtc == null);

        if (!string.IsNullOrWhiteSpace(buildingExternalId))
            query = query.Where(a => a.BuildingExternalId == buildingExternalId);

        if (floor.HasValue)
            query = query.Where(a => a.Floor == floor.Value);

        var annotations = await query
            .OrderBy(a => a.Floor)
            .ThenBy(a => a.AnnotationType)
            .ToListAsync(cancellationToken);

        return Ok(annotations.Select(a => new
        {
            a.ExternalId,
            a.BuildingExternalId,
            a.Floor,
            a.AnnotationType,
            a.GeometryJson,
            a.Source,
            rotation = 0,
            scaleX = 1,
            scaleY = 1,
            a.CreatedAtUtc,
            a.UpdatedAtUtc
        }));
    }

    [HttpPost]
    [Authorize(Roles = $"{AppRoles.Admin},{AppRoles.Editor}")]
    public async Task<IActionResult> Create(
        [FromBody] CreateAnnotationRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.ExternalId))
            return BadRequest(new { message = "ExternalId es requerido." });

        if (string.IsNullOrWhiteSpace(request.BuildingExternalId))
            return BadRequest(new { message = "BuildingExternalId es requerido." });

        var type = string.IsNullOrWhiteSpace(request.AnnotationType) ? "door" : request.AnnotationType.Trim().ToLowerInvariant();
        if (type != "door" && type != "stair")
            return BadRequest(new { message = "AnnotationType debe ser 'door' o 'stair'." });

        var exists = await _context.BuildingAnnotations
            .AnyAsync(a => a.ExternalId == request.ExternalId && a.DeletedAtUtc == null, cancellationToken);
        if (exists)
            return Conflict(new { message = $"Ya existe una marca con ExternalId '{request.ExternalId}'." });

        var buildingExists = await _context.SyncedBuildings
            .AnyAsync(b => b.ExternalId == request.BuildingExternalId && b.IsActive, cancellationToken);
        if (!buildingExists)
            return BadRequest(new { message = $"No se encontro el edificio '{request.BuildingExternalId}'." });

        var geometryJson = BuildGeometryJson(request.Coordinates);
        if (string.IsNullOrWhiteSpace(geometryJson))
            return BadRequest(new { message = "Se requieren al menos 3 puntos para la marca." });

        var annotation = new BuildingAnnotation
        {
            ExternalId = request.ExternalId,
            BuildingExternalId = request.BuildingExternalId,
            Floor = request.Floor,
            AnnotationType = type,
            GeometryJson = geometryJson,
            Source = "manual",
            CreatedBy = User.Identity?.Name ?? "admin",
            UpdatedBy = User.Identity?.Name ?? "admin"
        };

        _context.BuildingAnnotations.Add(annotation);
        await _context.SaveChangesAsync(cancellationToken);

        await _auditLogService.LogSecurityEventAsync(
            actionType: "annotation-create",
            resource: "annotation",
            summary: $"Marca creada: {type}",
            details: $"Edificio: {request.BuildingExternalId}, Piso: {request.Floor}, ExternalId: {request.ExternalId}",
            result: "success",
            severity: "info",
            changedByUsername: User.Identity?.Name ?? "admin",
            cancellationToken: cancellationToken);

        return CreatedAtAction(nameof(GetAll), new { buildingExternalId = request.BuildingExternalId, floor = request.Floor }, new
        {
            annotation.ExternalId,
            AnnotationType = annotation.AnnotationType
        });
    }

    [HttpPut("{externalId}")]
    [Authorize(Roles = $"{AppRoles.Admin},{AppRoles.Editor}")]
    public async Task<IActionResult> Update(
        string externalId,
        [FromBody] UpdateAnnotationRequest request,
        CancellationToken cancellationToken)
    {
        var annotation = await _context.BuildingAnnotations
            .FirstOrDefaultAsync(a => a.ExternalId == externalId && a.DeletedAtUtc == null, cancellationToken);
        if (annotation == null)
            return NotFound(new { message = $"No se encontro la marca '{externalId}'." });

        if (request.Floor.HasValue) annotation.Floor = request.Floor.Value;

        if (!string.IsNullOrWhiteSpace(request.AnnotationType))
        {
            var type = request.AnnotationType.Trim().ToLowerInvariant();
            if (type != "door" && type != "stair")
                return BadRequest(new { message = "AnnotationType debe ser 'door' o 'stair'." });
            annotation.AnnotationType = type;
        }

        if (request.Coordinates != null && request.Coordinates.Count >= 3)
        {
            var geometryJson = BuildGeometryJson(request.Coordinates);
            if (!string.IsNullOrWhiteSpace(geometryJson))
                annotation.GeometryJson = geometryJson;
        }

        annotation.UpdatedBy = User.Identity?.Name ?? "admin";
        annotation.UpdatedAtUtc = DateTime.UtcNow;
        annotation.Version++;

        await _context.SaveChangesAsync(cancellationToken);

        await _auditLogService.LogSecurityEventAsync(
            actionType: "annotation-update",
            resource: "annotation",
            summary: $"Marca actualizada: {externalId}",
            details: $"Piso: {annotation.Floor}, Tipo: {annotation.AnnotationType}",
            result: "success",
            severity: "info",
            changedByUsername: User.Identity?.Name ?? "admin",
            cancellationToken: cancellationToken);

        return Ok(new { annotation.ExternalId, AnnotationType = annotation.AnnotationType });
    }

    [HttpDelete("{externalId}")]
    [Authorize(Roles = $"{AppRoles.Admin},{AppRoles.Editor}")]
    public async Task<IActionResult> Delete(
        string externalId,
        CancellationToken cancellationToken)
    {
        var annotation = await _context.BuildingAnnotations
            .FirstOrDefaultAsync(a => a.ExternalId == externalId && a.DeletedAtUtc == null, cancellationToken);
        if (annotation == null)
            return NotFound(new { message = $"No se encontro la marca '{externalId}'." });

        annotation.SoftDelete(User.Identity?.Name ?? "admin");
        await _context.SaveChangesAsync(cancellationToken);

        await _auditLogService.LogSecurityEventAsync(
            actionType: "annotation-delete",
            resource: "annotation",
            summary: $"Marca eliminada: {externalId}",
            details: $"Edificio: {annotation.BuildingExternalId}, Piso: {annotation.Floor}, Tipo: {annotation.AnnotationType}",
            result: "success",
            severity: "warning",
            changedByUsername: User.Identity?.Name ?? "admin",
            cancellationToken: cancellationToken);

        return NoContent();
    }

    private static string BuildGeometryJson(List<List<double>>? coordinates)
    {
        if (coordinates == null || coordinates.Count < 3)
            return string.Empty;

        var ring = coordinates
            .Where(c => c.Count >= 2)
            .Select(c => new[] { c[0], c[1] })
            .ToList();

        if (ring.Count < 3)
            return string.Empty;

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

public class CreateAnnotationRequest
{
    public string? ExternalId { get; set; }
    public string? BuildingExternalId { get; set; }
    public int Floor { get; set; }
    public string? AnnotationType { get; set; }
    public List<List<double>>? Coordinates { get; set; }
}

public class UpdateAnnotationRequest
{
    public int? Floor { get; set; }
    public string? AnnotationType { get; set; }
    public List<List<double>>? Coordinates { get; set; }
}