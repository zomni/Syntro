using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Syntro.API.Models;
using Syntro.API.Services;

namespace Syntro.API.Controllers;

[ApiController]
[Route("api/sites")]
[Authorize]
public class SiteViewportController : ControllerBase
{
    private readonly AuditLogService _auditLogService;
    private static int _minZoom = 12;
    private static int _maxZoom = 19;

    public SiteViewportController(AuditLogService auditLogService)
    {
        _auditLogService = auditLogService;
    }

    public sealed record UpdateViewportRequest(int MinZoom, int MaxZoom);

    [Authorize(Roles = $"{AppRoles.Admin}")]
    [HttpPut("{campusKey}/viewport")]
    public async Task<IActionResult> UpdateViewport(string campusKey, [FromBody] UpdateViewportRequest? request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(campusKey))
        {
            return BadRequest(new { message = "La clave del sitio es obligatoria." });
        }

        if (request is null)
        {
            return BadRequest(new { message = "Se requieren los campos minZoom y maxZoom." });
        }

        var validationError = SiteViewportRules.Validate(request.MinZoom, request.MaxZoom);
        if (validationError is not null)
        {
            return BadRequest(new { message = validationError });
        }

        _minZoom = request.MinZoom;
        _maxZoom = request.MaxZoom;

        await _auditLogService.LogSecurityEventAsync(
            actionType: "site-viewport-update",
            resource: "sites/viewport",
            summary: $"Se actualizo el rango de zoom del sitio {campusKey}",
            details: $"CampusKey: {campusKey}; MinZoom: {_minZoom}; MaxZoom: {_maxZoom}",
            result: "success",
            severity: "info",
            changedByUsername: User.Identity?.Name ?? "system",
            cancellationToken: cancellationToken);

        return Ok(new
        {
            campusKey,
            minZoom = _minZoom,
            maxZoom = _maxZoom
        });
    }
}
