using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Syntro.API.Data;
using Syntro.API.Models;

namespace Syntro.API.Controllers;

[ApiController]
[Route("api/synced-rooms")]
[Authorize]
public class SyncedRoomsController : ControllerBase
{
    private readonly AppDbContext _context;

    public SyncedRoomsController(AppDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    [AllowAnonymous]
    public async Task<IActionResult> GetAll(
        [FromQuery] string? buildingExternalId,
        [FromQuery] int? floor,
        CancellationToken cancellationToken)
    {
        var query = _context.SyncedRooms
            .AsNoTracking()
            .Where(r => r.DeletedAtUtc == null);

        if (!string.IsNullOrWhiteSpace(buildingExternalId))
        {
            query = query.Where(r => r.BuildingExternalId == buildingExternalId);
        }

        if (floor.HasValue)
        {
            query = query.Where(r => (r.ManualFloor ?? r.Floor) == floor.Value);
        }

        var rooms = await query
            .OrderBy(r => r.BuildingExternalId)
            .ThenBy(r => r.ManualFloor ?? r.Floor)
            .ThenBy(r => r.ManualName != "" ? r.ManualName : r.Name)
            .Select(r => new
            {
                r.Id,
                r.ExternalId,
                r.BuildingExternalId,
                Floor = r.ManualFloor ?? r.Floor,
                Name = r.ManualName != "" ? r.ManualName : r.Name,
                r.ShortName,
                r.Type,
                r.Unit,
                r.Service,
                r.Status,
                r.DevicesCount,
                r.ResponsibleArea,
                r.ResponsiblePerson,
                r.SyncedAtUtc
            })
            .ToListAsync(cancellationToken);

        return Ok(rooms);
    }

    [HttpDelete("{externalId}")]
    [Authorize(Roles = $"{AppRoles.Admin},{AppRoles.Editor}")]
    public async Task<IActionResult> Delete(
        string externalId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(externalId))
            return BadRequest(new { message = "externalId es requerido." });

        var room = await _context.SyncedRooms
            .FirstOrDefaultAsync(r => r.ExternalId == externalId && r.DeletedAtUtc == null, cancellationToken);

        if (room == null)
            return NotFound(new { message = $"No se encontro la sala sincronizada '{externalId}'." });

        room.SoftDelete(User.Identity?.Name ?? "admin");
        await _context.SaveChangesAsync(cancellationToken);

        return NoContent();
    }
}
