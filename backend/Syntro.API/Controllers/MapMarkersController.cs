using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Syntro.API.Data;
using Syntro.API.Models;
using Syntro.API.Services;

namespace Syntro.API.Controllers;

[ApiController]
[Route("api/map-markers")]
public class MapMarkersController : ControllerBase
{
    public const string GeneralMapMarkerBuildingId = "map-general";

    private readonly AppDbContext _context;
    private readonly AuditLogService _auditLogService;

    public MapMarkersController(AppDbContext context, AuditLogService auditLogService)
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
        var query = _context.MapMarkers
            .AsNoTracking()
            .Where(m => m.DeletedAtUtc == null);

        if (!string.IsNullOrWhiteSpace(buildingExternalId))
            query = query.Where(m => m.BuildingExternalId == buildingExternalId);

        if (floor.HasValue)
            query = query.Where(m => m.Floor == floor.Value);

        var markers = await query
            .OrderBy(m => m.Floor)
            .ThenBy(m => m.Label)
            .ToListAsync(cancellationToken);

        return Ok(markers.Select(m => new
        {
            m.ExternalId,
            m.BuildingExternalId,
            m.Floor,
            m.Latitude,
            m.Longitude,
            m.IconKey,
            m.Label,
            m.Notes,
            m.Source,
            m.CreatedAtUtc,
            m.UpdatedAtUtc
        }));
    }

    [HttpPost]
    [Authorize(Roles = $"{AppRoles.Admin},{AppRoles.Editor}")]
    public async Task<IActionResult> Create(
        [FromBody] CreateMapMarkerRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.ExternalId))
            return BadRequest(new { message = "ExternalId es requerido." });

        if (string.IsNullOrWhiteSpace(request.BuildingExternalId))
            return BadRequest(new { message = "BuildingExternalId es requerido." });

        if (string.IsNullOrWhiteSpace(request.IconKey))
            return BadRequest(new { message = "IconKey es requerido." });

        var exists = await _context.MapMarkers
            .AnyAsync(m => m.ExternalId == request.ExternalId && m.DeletedAtUtc == null, cancellationToken);
        if (exists)
            return Conflict(new { message = $"Ya existe un marcador con ExternalId '{request.ExternalId}'." });

        var isCampusMarker = request.BuildingExternalId == GeneralMapMarkerBuildingId;
        var buildingExists = isCampusMarker
            || await _context.SyncedBuildings
                .AnyAsync(b => b.ExternalId == request.BuildingExternalId && b.IsActive, cancellationToken);
        if (!buildingExists)
            return BadRequest(new { message = $"No se encontro el edificio '{request.BuildingExternalId}'." });

        var softDeleted = await _context.MapMarkers
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(m => m.ExternalId == request.ExternalId.Trim() && m.DeletedAtUtc != null, cancellationToken);
        if (softDeleted != null)
        {
            var isCampusRestore = request.BuildingExternalId == GeneralMapMarkerBuildingId;
            var buildingRestoreExists = isCampusRestore
                || await _context.SyncedBuildings
                    .AnyAsync(b => b.ExternalId == request.BuildingExternalId && b.IsActive, cancellationToken);
            if (!buildingRestoreExists)
                return BadRequest(new { message = $"No se encontro el edificio '{request.BuildingExternalId}'." });

            softDeleted.BuildingExternalId = request.BuildingExternalId.Trim();
            softDeleted.Campus = string.IsNullOrWhiteSpace(request.Campus) ? "default" : request.Campus.Trim();
            softDeleted.Floor = request.Floor;
            softDeleted.Latitude = request.Latitude;
            softDeleted.Longitude = request.Longitude;
            softDeleted.IconKey = request.IconKey.Trim();
            softDeleted.Label = (request.Label ?? string.Empty).Trim();
            softDeleted.Notes = (request.Notes ?? string.Empty).Trim();
            softDeleted.Source = isCampusRestore ? "campus" : "manual";
            softDeleted.Restore(User.Identity?.Name ?? "admin");
            softDeleted.Version++;
            softDeleted.UpdatedAtUtc = DateTime.UtcNow;

            await _context.SaveChangesAsync(cancellationToken);

            await _auditLogService.LogSecurityEventAsync(
                actionType: "map-marker-create",
                resource: "map-marker",
                summary: $"Marcador restaurado: {softDeleted.Label}",
                details: $"Edificio: {softDeleted.BuildingExternalId}, Piso: {softDeleted.Floor}, Icono: {softDeleted.IconKey}",
                result: "success",
                severity: "info",
                changedByUsername: User.Identity?.Name ?? "admin",
                cancellationToken: cancellationToken);

            return CreatedAtAction(nameof(GetAll), new { buildingExternalId = softDeleted.BuildingExternalId, floor = softDeleted.Floor }, new
            {
                softDeleted.ExternalId,
                softDeleted.Label,
                softDeleted.IconKey
            });
        }

        var marker = new MapMarker
        {
            ExternalId = request.ExternalId.Trim(),
            BuildingExternalId = request.BuildingExternalId.Trim(),
            Campus = string.IsNullOrWhiteSpace(request.Campus) ? "default" : request.Campus.Trim(),
            Floor = request.Floor,
            Latitude = request.Latitude,
            Longitude = request.Longitude,
            IconKey = request.IconKey.Trim(),
            Label = (request.Label ?? string.Empty).Trim(),
            Notes = (request.Notes ?? string.Empty).Trim(),
            Source = isCampusMarker ? "campus" : "manual",
            CreatedBy = User.Identity?.Name ?? "admin",
            UpdatedBy = User.Identity?.Name ?? "admin"
        };

        _context.MapMarkers.Add(marker);
        await _context.SaveChangesAsync(cancellationToken);

        await _auditLogService.LogSecurityEventAsync(
            actionType: "map-marker-create",
            resource: "map-marker",
            summary: $"Marcador creado: {marker.Label}",
            details: $"Edificio: {marker.BuildingExternalId}, Piso: {marker.Floor}, Icono: {marker.IconKey}",
            result: "success",
            severity: "info",
            changedByUsername: User.Identity?.Name ?? "admin",
            cancellationToken: cancellationToken);

        return CreatedAtAction(nameof(GetAll), new { buildingExternalId = marker.BuildingExternalId, floor = marker.Floor }, new
        {
            marker.ExternalId,
            marker.Label,
            marker.IconKey
        });
    }

    [HttpPut("{externalId}")]
    [Authorize(Roles = $"{AppRoles.Admin},{AppRoles.Editor}")]
    public async Task<IActionResult> Update(
        string externalId,
        [FromBody] UpdateMapMarkerRequest request,
        CancellationToken cancellationToken)
    {
        var marker = await _context.MapMarkers
            .FirstOrDefaultAsync(m => m.ExternalId == externalId && m.DeletedAtUtc == null, cancellationToken);
        if (marker == null)
            return NotFound(new { message = $"No se encontro el marcador '{externalId}'." });

        if (request.Floor.HasValue) marker.Floor = request.Floor.Value;

        if (request.Latitude.HasValue) marker.Latitude = request.Latitude.Value;

        if (request.Longitude.HasValue) marker.Longitude = request.Longitude.Value;

        if (!string.IsNullOrWhiteSpace(request.IconKey))
            marker.IconKey = request.IconKey.Trim();

        if (request.Label != null)
            marker.Label = request.Label.Trim();

        if (request.Notes != null)
            marker.Notes = request.Notes.Trim();

        marker.UpdatedBy = User.Identity?.Name ?? "admin";
        marker.UpdatedAtUtc = DateTime.UtcNow;
        marker.Version++;

        await _context.SaveChangesAsync(cancellationToken);

        await _auditLogService.LogSecurityEventAsync(
            actionType: "map-marker-update",
            resource: "map-marker",
            summary: $"Marcador actualizado: {marker.Label}",
            details: $"Edificio: {marker.BuildingExternalId}, Piso: {marker.Floor}, Icono: {marker.IconKey}",
            result: "success",
            severity: "info",
            changedByUsername: User.Identity?.Name ?? "admin",
            cancellationToken: cancellationToken);

        return Ok(new { marker.ExternalId, marker.Label, marker.IconKey });
    }

    [HttpDelete("{externalId}")]
    [Authorize(Roles = $"{AppRoles.Admin},{AppRoles.Editor}")]
    public async Task<IActionResult> Delete(
        string externalId,
        CancellationToken cancellationToken)
    {
        var marker = await _context.MapMarkers
            .FirstOrDefaultAsync(m => m.ExternalId == externalId && m.DeletedAtUtc == null, cancellationToken);
        if (marker == null)
            return NotFound(new { message = $"No se encontro el marcador '{externalId}'." });

        marker.SoftDelete(User.Identity?.Name ?? "admin");
        await _context.SaveChangesAsync(cancellationToken);

        await _auditLogService.LogSecurityEventAsync(
            actionType: "map-marker-delete",
            resource: "map-marker",
            summary: $"Marcador eliminado: {marker.Label}",
            details: $"Edificio: {marker.BuildingExternalId}, Piso: {marker.Floor}, Icono: {marker.IconKey}",
            result: "success",
            severity: "warning",
            changedByUsername: User.Identity?.Name ?? "admin",
            cancellationToken: cancellationToken);

        return NoContent();
    }
}

public class CreateMapMarkerRequest
{
    public string? ExternalId { get; set; }
    public string? BuildingExternalId { get; set; }
    public string? Campus { get; set; }
    public int Floor { get; set; }
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public string? IconKey { get; set; }
    public string? Label { get; set; }
    public string? Notes { get; set; }
}

public class UpdateMapMarkerRequest
{
    public int? Floor { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
    public string? IconKey { get; set; }
    public string? Label { get; set; }
    public string? Notes { get; set; }
}