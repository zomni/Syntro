using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Syntro.API.Data;
using Syntro.API.Models;
using Syntro.API.Services;

namespace Syntro.API.Controllers;

[ApiController]
[Route("api/inventory-reconciliation")]
[Authorize]
public class InventoryReconciliationController : ControllerBase
{
    private readonly InventoryReconciliationService _service;
    private readonly AppDbContext _context;

    public InventoryReconciliationController(InventoryReconciliationService service, AppDbContext context)
    {
        _service = service;
        _context = context;
    }

    [Authorize(Roles = $"{AppRoles.Admin},{AppRoles.Admin}")]
    [HttpPost("run")]
    public async Task<IActionResult> Run(CancellationToken cancellationToken)
    {
        var result = await _service.RunAsync(cancellationToken);
        return Ok(result);
    }

    [HttpGet("summary")]
    public async Task<IActionResult> Summary(CancellationToken cancellationToken)
    {
        return Ok(await _service.GetSummaryAsync(cancellationToken));
    }

    [HttpGet("items")]
    public async Task<IActionResult> Items([FromQuery] bool onlyUnmatched = false, CancellationToken cancellationToken = default)
    {
        var query = _context.ImportedInventoryItems.AsNoTracking().AsQueryable();
        if (onlyUnmatched)
        {
            query = query.Where(i => i.MatchedSyncedBuildingId == null);
        }

        var items = await query
            .OrderBy(i => i.RowNumber)
            .Select(i => new
            {
                i.Id,
                i.RowNumber,
                i.Description,
                i.UnitOrDepartment,
                i.OrganizationalUnit,
                i.ResponsibleUser,
                i.IpAddress,
                i.MatchedBuildingExternalId,
                i.MatchedRoomExternalId,
                i.MatchConfidence,
                i.MatchNotes
            })
            .ToListAsync(cancellationToken);

        return Ok(items);
    }
}
