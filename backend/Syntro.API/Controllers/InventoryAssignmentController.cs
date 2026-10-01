using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Syntro.API.Data;
using Syntro.API.Models;
using Syntro.API.Services;

namespace Syntro.API.Controllers;

[ApiController]
[Route("api/inventory-assignments")]
[Authorize(Roles = $"{AppRoles.Admin},{AppRoles.Editor}")]
public sealed class InventoryAssignmentController : ControllerBase
{
    private readonly AppDbContext _context;
    private readonly InventoryAssignmentService _assignmentService;
    private readonly AuditLogService _auditLogService;

    public InventoryAssignmentController(
        AppDbContext context,
        InventoryAssignmentService assignmentService,
        AuditLogService auditLogService)
    {
        _context = context;
        _assignmentService = assignmentService;
        _auditLogService = auditLogService;
    }

    [HttpPut("items/{id:guid}")]
    public async Task<IActionResult> UpdateItem(
        Guid id,
        [FromBody] UpdateInventorySectorRequest request,
        CancellationToken cancellationToken)
    {
        if (request?.AssignedRoomExternalId == null)
        {
            return BadRequest(new { message = "Indique el sector destino." });
        }

        var item = await _context.ImportedInventoryItems
            .FirstOrDefaultAsync(candidate => candidate.Id == id, cancellationToken);

        if (item == null)
        {
            return NotFound(new { message = $"No se encontro el equipo '{id}'." });
        }

        var sector = await _assignmentService.ResolveSectorAsync(
            request.AssignedRoomExternalId,
            strict: true,
            cancellationToken);

        if (!sector.IsValid)
        {
            return BadRequest(new { message = sector.Error });
        }

        var snapshot = CaptureSnapshot(item);
        var changed = Apply(item, sector);

        if (changed)
        {
            await _context.SaveChangesAsync(cancellationToken);
            await AuditAsync(item, snapshot, cancellationToken);
        }

        return Ok(BuildResponse(item, changed));
    }

    [HttpPut("items")]
    public async Task<IActionResult> UpdateItems(
        [FromBody] BulkUpdateInventorySectorRequest request,
        CancellationToken cancellationToken)
    {
        var itemIds = (request?.ItemIds ?? Array.Empty<Guid>())
            .Where(candidate => candidate != Guid.Empty)
            .Distinct()
            .ToList();

        if (itemIds.Count == 0)
        {
            return BadRequest(new { message = "Seleccione al menos un equipo." });
        }

        if (request?.AssignedRoomExternalId == null)
        {
            return BadRequest(new { message = "Indique el sector destino." });
        }

        var sector = await _assignmentService.ResolveSectorAsync(
            request.AssignedRoomExternalId,
            strict: true,
            cancellationToken);

        if (!sector.IsValid)
        {
            return BadRequest(new { message = sector.Error });
        }

        var items = await _context.ImportedInventoryItems
            .Where(item => itemIds.Contains(item.Id))
            .ToListAsync(cancellationToken);

        var foundIds = items.Select(item => item.Id).ToHashSet();
        var missing = itemIds.Where(candidate => !foundIds.Contains(candidate)).ToList();
        if (missing.Count > 0)
        {
            return NotFound(new
            {
                message = "No se encontraron algunos equipos seleccionados.",
                missingItemIds = missing,
            });
        }

        var snapshots = new Dictionary<Guid, AssignmentSnapshot>();
        var updated = 0;

        foreach (var item in items)
        {
            var snapshot = CaptureSnapshot(item);
            if (!Apply(item, sector))
            {
                continue;
            }

            updated++;
            snapshots[item.Id] = snapshot;
        }

        if (updated > 0)
        {
            await _context.SaveChangesAsync(cancellationToken);

            foreach (var item in items)
            {
                if (snapshots.TryGetValue(item.Id, out var snapshot))
                {
                    await AuditAsync(item, snapshot, cancellationToken);
                }
            }
        }

        return Ok(new
        {
            updated,
            requested = itemIds.Count,
            items = items.Select(BuildItemResponse).ToList(),
        });
    }

    private bool Apply(ImportedInventoryItem item, InventorySectorResolution sector) =>
        string.IsNullOrWhiteSpace(sector.RoomExternalId)
            ? InventoryAssignmentService.ClearSector(item)
            : InventoryAssignmentService.ApplySector(item, sector);

    private async Task AuditAsync(
        ImportedInventoryItem item,
        AssignmentSnapshot snapshot,
        CancellationToken cancellationToken)
    {
        await _auditLogService.LogInventoryItemChangeAsync(
            item,
            User.Identity?.Name ?? "sistema",
            snapshot.BuildingExternalId,
            snapshot.RoomExternalId,
            snapshot.Floor,
            snapshot.SerialNumber,
            snapshot.AssignmentNotes,
            cancellationToken);
    }

    private static AssignmentSnapshot CaptureSnapshot(ImportedInventoryItem item) => new(
        item.AssignedBuildingExternalId,
        item.AssignedRoomExternalId,
        item.AssignedFloor,
        item.SerialNumber,
        item.AssignmentNotes);

    private static object BuildResponse(ImportedInventoryItem item, bool changed) =>
        new
        {
            changed,
            item = BuildItemResponse(item),
        };

    private static object BuildItemResponse(ImportedInventoryItem item) => new
    {
        item.Id,
        item.AssignedBuildingExternalId,
        item.AssignedRoomExternalId,
        item.AssignedFloor,
        item.AssignmentUpdatedAtUtc,
    };

    private sealed record AssignmentSnapshot(
        string BuildingExternalId,
        string RoomExternalId,
        int? Floor,
        string SerialNumber,
        string AssignmentNotes);
}

public sealed record UpdateInventorySectorRequest(string? AssignedRoomExternalId);

public sealed record BulkUpdateInventorySectorRequest(Guid[]? ItemIds, string? AssignedRoomExternalId);