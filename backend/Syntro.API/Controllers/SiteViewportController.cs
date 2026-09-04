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
    private readonly SiteViewportOverridesService _overridesService;

    public SiteViewportController(AuditLogService auditLogService, SiteViewportOverridesService overridesService)
    {
        _auditLogService = auditLogService;
        _overridesService = overridesService;
    }

    public sealed record UpdateViewportRequest(int MinZoom, int MaxZoom);

    public sealed record UpdateBoundsRequest(double[][] Bounds);

    [HttpGet("viewport-overrides")]
    [AllowAnonymous]
    public IActionResult GetAllOverrides()
    {
        return Ok(_overridesService.GetAllOverrides());
    }

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

        _overridesService.SetViewport(campusKey, request.MinZoom, request.MaxZoom);

        await _auditLogService.LogSecurityEventAsync(
            actionType: "site-viewport-update",
            resource: "sites/viewport",
            summary: $"Se actualizo el rango de zoom del sitio {campusKey}",
            details: $"CampusKey: {campusKey}; MinZoom: {request.MinZoom}; MaxZoom: {request.MaxZoom}",
            result: "success",
            severity: "info",
            changedByUsername: User.Identity?.Name ?? "system",
            cancellationToken: cancellationToken);

        return Ok(new
        {
            campusKey,
            minZoom = request.MinZoom,
            maxZoom = request.MaxZoom
        });
    }

    [Authorize(Roles = $"{AppRoles.Admin}")]
    [HttpPut("{campusKey}/bounds")]
    public async Task<IActionResult> UpdateBounds(string campusKey, [FromBody] UpdateBoundsRequest? request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(campusKey))
        {
            return BadRequest(new { message = "La clave del sitio es obligatoria." });
        }

        if (request is null || request.Bounds is null || request.Bounds.Length < 2)
        {
            return BadRequest(new { message = "Se requiere al menos 2 puntos para los limites." });
        }

        _overridesService.SetBounds(campusKey, request.Bounds);

        await _auditLogService.LogSecurityEventAsync(
            actionType: "site-bounds-update",
            resource: "sites/bounds",
            summary: $"Se actualizaron los limites del sitio {campusKey}",
            details: $"CampusKey: {campusKey}; Puntos: {request.Bounds.Length}",
            result: "success",
            severity: "info",
            changedByUsername: User.Identity?.Name ?? "system",
            cancellationToken: cancellationToken);

        return Ok(new
        {
            campusKey,
            bounds = request.Bounds
        });
    }

    [Authorize(Roles = $"{AppRoles.Admin}")]
    [HttpDelete("{campusKey}/bounds")]
    public async Task<IActionResult> RemoveBounds(string campusKey, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(campusKey))
        {
            return BadRequest(new { message = "La clave del sitio es obligatoria." });
        }

        var removed = _overridesService.RemoveBounds(campusKey);

        await _auditLogService.LogSecurityEventAsync(
            actionType: "site-bounds-reset",
            resource: "sites/bounds",
            summary: $"Se restauraron los limites del sitio {campusKey}",
            details: $"CampusKey: {campusKey}; Removed: {removed}",
            result: "success",
            severity: "info",
            changedByUsername: User.Identity?.Name ?? "system",
            cancellationToken: cancellationToken);

        return Ok(new
        {
            campusKey,
            restored = true
        });
    }
}
