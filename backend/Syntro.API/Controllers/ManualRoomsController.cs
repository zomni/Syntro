using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Syntro.API.Data;
using Syntro.API.Models;
using Syntro.API.Services;

namespace Syntro.API.Controllers;

[ApiController]
[Route("api/manual-rooms")]
public class ManualRoomsController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly AuditLogService _auditLogService;

    public ManualRoomsController(AppDbContext context, AuditLogService auditLogService)
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
        var query = _context.ManualRooms
            .AsNoTracking()
            .Where(r => r.DeletedAtUtc == null);

        if (!string.IsNullOrWhiteSpace(buildingExternalId))
            query = query.Where(r => r.BuildingExternalId == buildingExternalId);

        if (floor.HasValue)
            query = query.Where(r => r.Floor == floor.Value);

        var rooms = await query
            .OrderBy(r => r.Floor)
            .ThenBy(r => r.DisplayName)
            .ToListAsync(cancellationToken);

        return Ok(rooms.Select(r => new
        {
            r.ExternalId,
            r.BuildingExternalId,
            r.Floor,
            r.DisplayName,
            r.ShortName,
            r.Type,
            r.Unit,
            r.Service,
            r.Status,
            r.Capacity,
            r.GeometryJson,
            r.Source,
            r.Notes,
            r.CreatedAtUtc,
            r.UpdatedAtUtc
        }));
    }

    [HttpPost]
    [Authorize(Roles = $"{AppRoles.Admin},{AppRoles.Admin}")]
    public async Task<IActionResult> Create(
        [FromBody] CreateManualRoomRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.ExternalId))
            return BadRequest(new { message = "ExternalId es requerido." });

        if (string.IsNullOrWhiteSpace(request.BuildingExternalId))
            return BadRequest(new { message = "BuildingExternalId es requerido." });

        if (string.IsNullOrWhiteSpace(request.DisplayName))
            return BadRequest(new { message = "DisplayName es requerido." });

        var exists = await _context.ManualRooms
            .AnyAsync(r => r.ExternalId == request.ExternalId && r.DeletedAtUtc == null, cancellationToken);
        if (exists)
            return Conflict(new { message = $"Ya existe una sala manual con ExternalId '{request.ExternalId}'." });

        var buildingExists = await _context.SyncedBuildings
            .AnyAsync(b => b.ExternalId == request.BuildingExternalId && b.IsActive, cancellationToken);
        if (!buildingExists)
            return BadRequest(new { message = $"No se encontro el edificio '{request.BuildingExternalId}'." });

        var geometryJson = BuildGeometryJson(request.Coordinates);

        var room = new ManualRoom
        {
            ExternalId = request.ExternalId,
            BuildingExternalId = request.BuildingExternalId,
            Floor = request.Floor,
            DisplayName = request.DisplayName,
            ShortName = request.ShortName ?? string.Empty,
            Type = request.Type ?? "sala",
            Unit = request.Unit ?? string.Empty,
            Service = request.Service ?? string.Empty,
            Status = request.Status ?? "active",
            Capacity = request.Capacity,
            GeometryJson = geometryJson,
            Source = "manual",
            Notes = request.Notes ?? string.Empty,
            CreatedBy = User.Identity?.Name ?? "admin",
            UpdatedBy = User.Identity?.Name ?? "admin"
        };

        _context.ManualRooms.Add(room);
        await _context.SaveChangesAsync(cancellationToken);

        await _auditLogService.LogSecurityEventAsync(
            actionType: "manual-room-create",
            resource: "manual-room",
            summary: $"Sala manual creada: {request.DisplayName}",
            details: $"Edificio: {request.BuildingExternalId}, Piso: {request.Floor}, ExternalId: {request.ExternalId}",
            result: "success",
            severity: "info",
            changedByUsername: User.Identity?.Name ?? "admin",
            cancellationToken: cancellationToken);

        return CreatedAtAction(nameof(GetAll), new { buildingExternalId = request.BuildingExternalId, floor = request.Floor }, new
        {
            room.ExternalId,
            room.DisplayName
        });
    }

    [HttpPut("{externalId}")]
    [Authorize(Roles = $"{AppRoles.Admin},{AppRoles.Admin}")]
    public async Task<IActionResult> Update(
        string externalId,
        [FromBody] UpdateManualRoomRequest request,
        CancellationToken cancellationToken)
    {
        var room = await _context.ManualRooms
            .FirstOrDefaultAsync(r => r.ExternalId == externalId && r.DeletedAtUtc == null, cancellationToken);
        if (room == null)
            return NotFound(new { message = $"No se encontro la sala '{externalId}'." });

        var previousValues = new
        {
            room.DisplayName,
            room.Floor,
            room.Type,
            room.Unit,
            room.Service,
            room.Status,
            room.Capacity,
            room.Notes
        };

        if (request.DisplayName != null) room.DisplayName = request.DisplayName;
        if (request.ShortName != null) room.ShortName = request.ShortName;
        if (request.Floor.HasValue) room.Floor = request.Floor.Value;
        if (request.Type != null) room.Type = request.Type;
        if (request.Unit != null) room.Unit = request.Unit;
        if (request.Service != null) room.Service = request.Service;
        if (request.Status != null) room.Status = request.Status;
        if (request.Capacity.HasValue) room.Capacity = request.Capacity;
        if (request.Notes != null) room.Notes = request.Notes;

        if (request.Coordinates != null && request.Coordinates.Count >= 3)
        {
            room.GeometryJson = BuildGeometryJson(request.Coordinates);
        }

        room.UpdatedBy = User.Identity?.Name ?? "admin";
        room.UpdatedAtUtc = DateTime.UtcNow;
        room.Version++;

        await _context.SaveChangesAsync(cancellationToken);

        await _auditLogService.LogSecurityEventAsync(
            actionType: "manual-room-update",
            resource: "manual-room",
            summary: $"Sala manual actualizada: {externalId}",
            details: $"Valores anteriores: {JsonSerializer.Serialize(previousValues)}",
            result: "success",
            severity: "info",
            changedByUsername: User.Identity?.Name ?? "admin",
            cancellationToken: cancellationToken);

        return Ok(new { room.ExternalId, room.DisplayName });
    }

    [HttpDelete("{externalId}")]
    [Authorize(Roles = $"{AppRoles.Admin},{AppRoles.Admin}")]
    public async Task<IActionResult> Delete(
        string externalId,
        CancellationToken cancellationToken)
    {
        var room = await _context.ManualRooms
            .FirstOrDefaultAsync(r => r.ExternalId == externalId && r.DeletedAtUtc == null, cancellationToken);
        if (room == null)
            return NotFound(new { message = $"No se encontro la sala '{externalId}'." });

        var hasEquipments = await _context.ImportedInventoryItems
            .AnyAsync(i => i.AssignedRoomExternalId == externalId, cancellationToken);
        if (hasEquipments)
        {
            var count = await _context.ImportedInventoryItems
                .CountAsync(i => i.AssignedRoomExternalId == externalId, cancellationToken);
            return Conflict(new { message = $"La sala tiene {count} equipo(s) asignado(s). Reasigne los equipos antes de eliminar." });
        }

        room.SoftDelete(User.Identity?.Name ?? "admin");
        await _context.SaveChangesAsync(cancellationToken);

        await _auditLogService.LogSecurityEventAsync(
            actionType: "manual-room-delete",
            resource: "manual-room",
            summary: $"Sala manual eliminada: {externalId}",
            details: $"Edificio: {room.BuildingExternalId}, Piso: {room.Floor}, Nombre: {room.DisplayName}",
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

public class CreateManualRoomRequest
{
    public string? ExternalId { get; set; }
    public string? BuildingExternalId { get; set; }
    public int Floor { get; set; }
    public string? DisplayName { get; set; }
    public string? ShortName { get; set; }
    public string? Type { get; set; }
    public string? Unit { get; set; }
    public string? Service { get; set; }
    public string? Status { get; set; }
    public int? Capacity { get; set; }
    public List<List<double>>? Coordinates { get; set; }
    public string? Notes { get; set; }
}

public class UpdateManualRoomRequest
{
    public string? DisplayName { get; set; }
    public string? ShortName { get; set; }
    public int? Floor { get; set; }
    public string? Type { get; set; }
    public string? Unit { get; set; }
    public string? Service { get; set; }
    public string? Status { get; set; }
    public int? Capacity { get; set; }
    public List<List<double>>? Coordinates { get; set; }
    public string? Notes { get; set; }
}
