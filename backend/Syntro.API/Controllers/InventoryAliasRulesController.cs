using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Syntro.API.Data;
using Syntro.API.Models;
using Syntro.API.Services;

namespace Syntro.API.Controllers;

[ApiController]
[Route("api/inventory-alias-rules")]
[Authorize]
public class InventoryAliasRulesController : ControllerBase
{
    private readonly AppDbContext _context;

    public InventoryAliasRulesController(AppDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken cancellationToken)
    {
        var rules = await _context.InventoryAliasRules
            .AsNoTracking()
            .OrderBy(r => r.SourceText)
            .ToListAsync(cancellationToken);

        return Ok(rules);
    }

    [Authorize(Roles = $"{AppRoles.Admin},{AppRoles.Admin}")]
    [HttpPost]
    public async Task<IActionResult> Upsert([FromBody] UpsertAliasRuleRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.SourceText) || string.IsNullOrWhiteSpace(request.TargetBuildingExternalId))
        {
            return BadRequest("SourceText y TargetBuildingExternalId son obligatorios.");
        }

        var normalized = InventoryReconciliationService.NormalizeText(request.SourceText);
        var rule = await _context.InventoryAliasRules.FirstOrDefaultAsync(r => r.NormalizedSourceText == normalized, cancellationToken);

        if (rule is null)
        {
            rule = new InventoryAliasRule();
            _context.InventoryAliasRules.Add(rule);
        }

        rule.SourceText = request.SourceText.Trim();
        rule.NormalizedSourceText = normalized;
        rule.TargetBuildingExternalId = request.TargetBuildingExternalId.Trim();
        rule.TargetRoomExternalId = request.TargetRoomExternalId?.Trim() ?? string.Empty;
        rule.IsEnabled = request.IsEnabled;
        rule.Notes = request.Notes?.Trim() ?? string.Empty;
        rule.UpdatedAtUtc = DateTime.UtcNow;

        await _context.SaveChangesAsync(cancellationToken);
        return Ok(rule);
    }

    [Authorize(Roles = $"{AppRoles.Admin},{AppRoles.Admin}")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(Guid id, CancellationToken cancellationToken)
    {
        var rule = await _context.InventoryAliasRules.FirstOrDefaultAsync(r => r.Id == id, cancellationToken);
        if (rule is null)
        {
            return NotFound();
        }

        rule.SoftDelete(User.Identity?.Name);
        await _context.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    public sealed class UpsertAliasRuleRequest
    {
        public string SourceText { get; set; } = string.Empty;
        public string TargetBuildingExternalId { get; set; } = string.Empty;
        public string? TargetRoomExternalId { get; set; }
        public bool IsEnabled { get; set; } = true;
        public string? Notes { get; set; }
    }
}
