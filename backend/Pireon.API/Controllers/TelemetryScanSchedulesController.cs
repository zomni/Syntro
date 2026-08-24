using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Pireon.API.Models;
using Pireon.API.Services;
using Pireon.API.ViewModels;

namespace Pireon.API.Controllers;

[ApiController]
[Route("api/network-telemetry/schedule")]
[Authorize]
public class TelemetryScanSchedulesController : ControllerBase
{
    private readonly TelemetryScanScheduleService _service;
    private readonly AuditLogService _auditLog;
    private readonly OrganizationAccessService _access;

    public TelemetryScanSchedulesController(
        TelemetryScanScheduleService service,
        AuditLogService auditLog,
        OrganizationAccessService access)
    {
        _service = service;
        _auditLog = auditLog;
        _access = access;
    }

    [Authorize(Roles = $"{AppRoles.Admin},{AppRoles.SuperAdmin},{AppRoles.Auditor}")]
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] Guid? organizationId,
        CancellationToken cancellationToken)
    {
        var campusKeys = await _access.ResolveCampusKeysAsync(organizationId, cancellationToken);
        var schedules = await _service.GetSchedulesAsync(campusKeys, cancellationToken);
        return Ok(schedules);
    }

    [HttpPost("preview")]
    public async Task<IActionResult> Preview([FromBody] TelemetryScanSchedulePreviewRequest request, CancellationToken cancellationToken)
    {
        string cron;
        if (request.Slots is { Count: > 0 })
        {
            cron = TelemetryScanScheduleService.BuildCronFromSlots(request.Slots);
        }
        else
        {
            cron = request.Cron ?? string.Empty;
        }

        if (string.IsNullOrWhiteSpace(cron) || !TelemetryScanScheduleService.IsValidCompoundCron(cron))
        {
            return BadRequest(new { message = "No se pudo generar una expresion cron valida." });
        }

        var fromUtc = request.FromUtc ?? DateTime.UtcNow;
        var count = request.Count is > 0 and <= 20 ? request.Count.Value : 5;
        var occurrences = TelemetryScanScheduleService.GetNextOccurrencesUtc(cron, request.TimeZone, fromUtc, count);
        var timeZone = TelemetryScanScheduleService.ResolveTimeZone(request.TimeZone);

        var items = occurrences
            .Select(utc => new
            {
                utc,
                local = TimeZoneInfo.ConvertTimeFromUtc(utc, timeZone)
            })
            .ToList();

        return Ok(new
        {
            valid = true,
            cron,
            timeZone = timeZone.Id,
            occurrences = items
        });
    }

    [Authorize(Roles = $"{AppRoles.Admin},{AppRoles.SuperAdmin}")]
    [HttpPost]
    public async Task<IActionResult> Create(
        [FromQuery] Guid? organizationId,
        [FromBody] TelemetryScanScheduleRequest request,
        CancellationToken cancellationToken)
    {
        if (request.Slots is not { Count: > 0 } && string.IsNullOrWhiteSpace(request.Cron))
        {
            return BadRequest(new { message = "Debe agregar al menos un horario." });
        }

        string cron;
        try
        {
            cron = request.Slots is { Count: > 0 }
                ? TelemetryScanScheduleService.BuildCronFromSlots(request.Slots)
                : (request.Cron ?? string.Empty).Trim();
        }
        catch
        {
            return BadRequest(new { message = "No se pudo generar la expresion cron." });
        }

        var campusKeys = await _access.ResolveCampusKeysAsync(organizationId, cancellationToken);

        var overlaps = await _service.DetectOverlapsAsync(cron, null, request.CampusKey, campusKeys, cancellationToken);
        if (overlaps.Count > 0)
        {
            return Conflict(new
            {
                message = "Este horario se superpone con horarios existentes:",
                overlaps
            });
        }

        TelemetryScanScheduleDto schedule;
        try
        {
            schedule = await _service.CreateAsync(request, User.Identity?.Name, campusKeys, cancellationToken);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }

        await _auditLog.LogSecurityEventAsync(
            "create",
            "network-telemetry-schedule",
            $"Planificacion de captura '{schedule.Label}' creada (cron: {schedule.Cron}).",
            $"Campus: {schedule.CampusKey}; Zona horaria: {schedule.TimeZone}; Habilitada: {schedule.IsEnabled}.",
            entityType: "telemetry-scan-schedule",
            entityId: schedule.Id.ToString(),
            cancellationToken: cancellationToken);

        return Ok(schedule);
    }

    [Authorize(Roles = $"{AppRoles.Admin},{AppRoles.SuperAdmin}")]
    [HttpPut("{id:guid}")]
    public async Task<IActionResult> Update(
        Guid id,
        [FromQuery] Guid? organizationId,
        [FromBody] TelemetryScanScheduleRequest request,
        CancellationToken cancellationToken)
    {
        if (request.Slots is not { Count: > 0 } && string.IsNullOrWhiteSpace(request.Cron))
        {
            return BadRequest(new { message = "Debe agregar al menos un horario." });
        }

        string cron;
        try
        {
            cron = request.Slots is { Count: > 0 }
                ? TelemetryScanScheduleService.BuildCronFromSlots(request.Slots)
                : (request.Cron ?? string.Empty).Trim();
        }
        catch
        {
            return BadRequest(new { message = "No se pudo generar la expresion cron." });
        }

        var campusKeys = await _access.ResolveCampusKeysAsync(organizationId, cancellationToken);

        var overlaps = await _service.DetectOverlapsAsync(cron, id, request.CampusKey, campusKeys, cancellationToken);
        if (overlaps.Count > 0)
        {
            return Conflict(new
            {
                message = "Este horario se superpone con horarios existentes:",
                overlaps
            });
        }

        TelemetryScanScheduleDto? schedule;
        try
        {
            schedule = await _service.UpdateAsync(id, request, User.Identity?.Name, campusKeys, cancellationToken);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { message = ex.Message });
        }

        if (schedule is null)
        {
            return NotFound(new { message = $"Planificacion #{id} no encontrada." });
        }

        await _auditLog.LogSecurityEventAsync(
            "update",
            "network-telemetry-schedule",
            $"Planificacion de captura '{schedule.Label}' actualizada (cron: {schedule.Cron}).",
            $"Campus: {schedule.CampusKey}; Zona horaria: {schedule.TimeZone}; Habilitada: {schedule.IsEnabled}.",
            entityType: "telemetry-scan-schedule",
            entityId: schedule.Id.ToString(),
            cancellationToken: cancellationToken);

        return Ok(schedule);
    }

    [Authorize(Roles = $"{AppRoles.Admin},{AppRoles.SuperAdmin}")]
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> Delete(
        Guid id,
        [FromQuery] Guid? organizationId,
        CancellationToken cancellationToken)
    {
        var campusKeys = await _access.ResolveCampusKeysAsync(organizationId, cancellationToken);
        var deleted = await _service.DeleteAsync(id, User.Identity?.Name, campusKeys, cancellationToken);
        if (!deleted)
        {
            return NotFound(new { message = $"Planificacion #{id} no encontrada." });
        }

        await _auditLog.LogSecurityEventAsync(
            "delete",
            "network-telemetry-schedule",
            $"Planificacion de captura #{id} eliminada.",
            string.Empty,
            entityType: "telemetry-scan-schedule",
            entityId: id.ToString(),
            cancellationToken: cancellationToken);

        return NoContent();
    }

    public sealed class TelemetryScanSchedulePreviewRequest
    {
        public string? Cron { get; set; }
        public List<ScheduleSlotDto>? Slots { get; set; }
        public string TimeZone { get; set; } = "America/Santiago";
        public DateTime? FromUtc { get; set; }
        public int? Count { get; set; }
    }
}
