using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Syntro.API.Data;
using Syntro.API.Models;
using Syntro.API.Services;

namespace Syntro.API.Controllers;

[ApiController]
[Route("api/room-layouts")]
[Authorize(Roles = $"{AppRoles.Admin},{AppRoles.Editor}")]
public class RoomLayoutsController : ControllerBase
{
    private readonly RoomLayoutService _roomLayoutService;
    private readonly RoomSuggestionService _suggestionService;
    private readonly AppDbContext _context;
    private readonly AuditLogService _auditLogService;

    public RoomLayoutsController(
        RoomLayoutService roomLayoutService,
        RoomSuggestionService suggestionService,
        AppDbContext context,
        AuditLogService auditLogService)
    {
        _roomLayoutService = roomLayoutService;
        _suggestionService = suggestionService;
        _context = context;
        _auditLogService = auditLogService;
    }

    [HttpGet]
    public async Task<IActionResult> GetCombined(
        [FromQuery] string buildingExternalId,
        [FromQuery] int floor,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(buildingExternalId))
            return BadRequest(new { message = "buildingExternalId es requerido." });

        var rooms = await _roomLayoutService.GetCombinedRoomsAsync(buildingExternalId, floor, cancellationToken);
        return Ok(rooms);
    }

    [HttpGet("{buildingExternalId}/floors")]
    public async Task<IActionResult> GetFloors(
        string buildingExternalId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(buildingExternalId))
            return BadRequest(new { message = "buildingExternalId es requerido." });

        var floors = await _roomLayoutService.GetFloorsAsync(buildingExternalId, cancellationToken);
        return Ok(floors);
    }

    [HttpPost("suggest")]
    [Authorize(Roles = $"{AppRoles.Admin},{AppRoles.Editor}")]
    public IActionResult Suggest([FromBody] SuggestionRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.BuildingExternalId))
            return BadRequest(new { message = "BuildingExternalId es requerido." });

        if (request.RoomCount < 1 || request.RoomCount > 100)
            return BadRequest(new { message = "RoomCount debe estar entre 1 y 100." });

        if (request.Coordinates == null || request.Coordinates.Count < 3)
            return BadRequest(new { message = "Se requieren las coordenadas del edificio." });

        var suggestions = _suggestionService.GenerateLayout(request);
        return Ok(suggestions);
    }

    [HttpPost("bulk-save")]
    [Authorize(Roles = $"{AppRoles.Admin},{AppRoles.Editor}")]
    public async Task<IActionResult> BulkSave(
        [FromBody] BulkSaveRequest request,
        CancellationToken cancellationToken)
    {
        if (request.Rooms == null || request.Rooms.Count == 0)
            return BadRequest(new { message = "Se requiere al menos una sala." });

        if (string.IsNullOrWhiteSpace(request.BuildingExternalId))
            return BadRequest(new { message = "BuildingExternalId es requerido." });

        var savedCount = 0;

        foreach (var room in request.Rooms)
        {
            if (room.Coordinates == null || room.Coordinates.Count < 3)
                return BadRequest(new { message = $"La sala '{room.ExternalId}' tiene coordenadas inválidas (se requieren al menos 3 puntos)." });

            var geometryJson = BuildGeometryJson(room.Coordinates);
            if (string.IsNullOrWhiteSpace(geometryJson))
                return BadRequest(new { message = $"La sala '{room.ExternalId}' no generó una geometría válida." });

            var exists = await _context.ManualRooms
                .AnyAsync(r => r.ExternalId == room.ExternalId && r.DeletedAtUtc == null, cancellationToken);
            if (exists) continue;

            var entity = new ManualRoom
            {
                ExternalId = room.ExternalId,
                BuildingExternalId = request.BuildingExternalId,
                Floor = request.Floor,
                DisplayName = room.DisplayName,
                ShortName = room.ShortName ?? string.Empty,
                Type = room.Type ?? "box",
                Unit = room.Unit ?? string.Empty,
                Service = room.Service ?? string.Empty,
                Status = "active",
                Capacity = room.Capacity,
                GeometryJson = geometryJson,
                Source = "suggested-approved",
                Notes = room.Notes ?? string.Empty,
                CreatedBy = User.Identity?.Name ?? "admin",
                UpdatedBy = User.Identity?.Name ?? "admin"
            };

            _context.ManualRooms.Add(entity);
            savedCount++;
        }

        if (savedCount > 0)
        {
            await _context.SaveChangesAsync(cancellationToken);

            await _auditLogService.LogSecurityEventAsync(
                actionType: "room-layout-bulk-save",
                resource: "manual-room",
                summary: $"Guardado masivo de {savedCount} salas sugeridas",
                details: $"Edificio: {request.BuildingExternalId}, Piso: {request.Floor}, Salas guardadas: {savedCount}",
                result: "success",
                severity: "info",
                changedByUsername: User.Identity?.Name ?? "admin",
                cancellationToken: cancellationToken);
        }

        return Ok(new { savedCount, message = $"{savedCount} sala(s) guardada(s) correctamente." });
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

public class BulkSaveRequest
{
    public string? BuildingExternalId { get; set; }
    public int Floor { get; set; }
    public List<BulkSaveRoom>? Rooms { get; set; }
}

public class BulkSaveRoom
{
    public string? ExternalId { get; set; }
    public string? DisplayName { get; set; }
    public string? ShortName { get; set; }
    public string? Type { get; set; }
    public string? Unit { get; set; }
    public string? Service { get; set; }
    public int? Capacity { get; set; }
    public string? Notes { get; set; }
    public List<List<double>>? Coordinates { get; set; }
}
