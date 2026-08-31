using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Syntro.API.Models;
using Syntro.API.Services;
using Syntro.API.ViewModels;

namespace Syntro.API.Controllers;

[ApiController]
[Route("api/network-telemetry")]
[Authorize]
public class NetworkTelemetryController : ControllerBase
{
    private readonly NetworkTelemetryService _service;
    private readonly NetworkTelemetryLiveScanService _liveScanService;
    private readonly NetworkTelemetryAgentBridgeService _agentBridgeService;

    public NetworkTelemetryController(
        NetworkTelemetryService service,
        NetworkTelemetryLiveScanService liveScanService,
        NetworkTelemetryAgentBridgeService agentBridgeService)
    {
        _service = service;
        _liveScanService = liveScanService;
        _agentBridgeService = agentBridgeService;
    }

    [HttpGet("status")]
    public async Task<IActionResult> Status(
        [FromQuery] Guid? organizationId = null,
        CancellationToken cancellationToken = default)
    {
        var campusKeys = await ResolveCampusKeysAsync(organizationId, cancellationToken);
        var model = await _service.GetDashboardAsync(10, null, campusKeys, cancellationToken);
        return Ok(model);
    }

    [HttpGet("latest")]
    public async Task<IActionResult> Latest(
        [FromQuery] int take = 10,
        [FromQuery] Guid? organizationId = null,
        CancellationToken cancellationToken = default)
    {
        var campusKeys = await ResolveCampusKeysAsync(organizationId, cancellationToken);
        var snapshots = await _service.GetRecentSnapshotsAsync(take, campusKeys, cancellationToken);
        return Ok(snapshots);
    }

    [Authorize(Roles = $"{AppRoles.Admin},{AppRoles.Auditor},{AppRoles.Admin}")]
    [HttpPost("scan")]
    public async Task<IActionResult> Scan(
        [FromBody] NetworkTelemetryLiveScanRequest? request,
        [FromQuery] Guid? organizationId = null,
        CancellationToken cancellationToken = default)
    {
        if (!_liveScanService.IsEnabled())
        {
            return BadRequest(new { message = "La telemetria de red esta deshabilitada por configuracion." });
        }

        var actor = User.Identity?.IsAuthenticated == true
            ? (User.Identity?.Name ?? "system")
            : "system";

        var (campusKey, resolutionError) = await ResolveAgentCampusKeyAsync(organizationId, request?.CampusKey, cancellationToken);
        if (campusKey is null)
        {
            return BadRequest(new { message = resolutionError });
        }

        request ??= new NetworkTelemetryLiveScanRequest();
        request.CampusKey = campusKey;

        if (_agentBridgeService.UseAgentMode())
        {
            var status = await _agentBridgeService.QueueScanAsync(actor, request, cancellationToken);
            return Accepted(status);
        }

        var result = await _liveScanService.ScanAndStoreAsync(actor, request, cancellationToken);
        return Ok(result);
    }

    [HttpGet("agent/status")]
    public async Task<IActionResult> AgentStatus(
        [FromQuery] Guid? organizationId = null,
        CancellationToken cancellationToken = default)
    {
        var campusKeys = await ResolveCampusKeysAsync(organizationId, cancellationToken);

        if (campusKeys is null || campusKeys.Count == 0)
        {
            return Ok(await _agentBridgeService.GetStatusAsync(null, cancellationToken));
        }

        if (campusKeys.Count == 1)
        {
            return Ok(await _agentBridgeService.GetStatusAsync(campusKeys[0], cancellationToken));
        }

        // Organizacion con varias sedes: estado agregado de sus agentes.
        var statuses = new List<NetworkTelemetryAgentStatusViewModel>();
        foreach (var campusKey in campusKeys)
        {
            statuses.Add(await _agentBridgeService.GetStatusAsync(campusKey, cancellationToken));
        }

        return Ok(AggregateAgentStatus(statuses));
    }

    private static NetworkTelemetryAgentStatusViewModel AggregateAgentStatus(IReadOnlyList<NetworkTelemetryAgentStatusViewModel> statuses)
    {
        string[] statePriority = ["running", "pending", "paused", "stopping", "queued", "completed", "failed", "idle"];
        var connectedCount = statuses.Count(status => status.IsConnected);
        var latest = statuses
            .OrderByDescending(status => status.UpdatedAtUtc ?? DateTime.MinValue)
            .FirstOrDefault();

        return new NetworkTelemetryAgentStatusViewModel
        {
            State = statePriority
                .Select(priority => statuses.FirstOrDefault(status => string.Equals(status.State, priority, StringComparison.OrdinalIgnoreCase))?.State)
                .FirstOrDefault(state => !string.IsNullOrEmpty(state)) ?? "idle",
            Message = $"{connectedCount} de {statuses.Count} agentes conectados.",
            AgentId = latest?.AgentId ?? string.Empty,
            SnapshotId = latest?.SnapshotId,
            RequestedAtUtc = latest?.RequestedAtUtc,
            StartedAtUtc = latest?.StartedAtUtc,
            CompletedAtUtc = latest?.CompletedAtUtc,
            UpdatedAtUtc = latest?.UpdatedAtUtc,
            RequestedByUsername = latest?.RequestedByUsername ?? string.Empty,
            TriggerType = latest?.TriggerType ?? string.Empty,
            LastHeartbeatAtUtc = statuses
                .Where(status => status.LastHeartbeatAtUtc.HasValue)
                .OrderByDescending(status => status.LastHeartbeatAtUtc)
                .FirstOrDefault()?.LastHeartbeatAtUtc,
            IsConnected = connectedCount > 0,
            TotalHosts = latest?.TotalHosts,
            ProcessedHosts = latest?.ProcessedHosts,
            CurrentIpAddress = latest?.CurrentIpAddress ?? string.Empty,
            CurrentHostName = latest?.CurrentHostName ?? string.Empty,
            CurrentSubnetCidr = latest?.CurrentSubnetCidr ?? string.Empty,
            CurrentStage = latest?.CurrentStage ?? string.Empty
        };
    }

    [Authorize(Roles = $"{AppRoles.Admin},{AppRoles.Auditor},{AppRoles.Admin}")]
    [HttpPost("agent/control")]
    public async Task<IActionResult> AgentControl([FromBody] NetworkTelemetryAgentControlRequest? request, CancellationToken cancellationToken = default)
    {
        var actor = User.Identity?.IsAuthenticated == true
            ? (User.Identity?.Name ?? "system")
            : "system";

        var (campusKey, resolutionError) = await ResolveAgentCampusKeyAsync(request?.OrganizationId, request?.CampusKey, cancellationToken);
        if (campusKey is null)
        {
            return BadRequest(new { message = resolutionError });
        }

        var status = await _agentBridgeService.SendControlAsync(actor, request?.Action ?? "pause", campusKey, cancellationToken);
        return Ok(status);
    }

    private async Task<(string? CampusKey, string? Error)> ResolveAgentCampusKeyAsync(
        Guid? organizationId,
        string? requestedCampusKey,
        CancellationToken cancellationToken)
    {
        var campusKeys = await ResolveCampusKeysAsync(organizationId, cancellationToken);

        if (!string.IsNullOrWhiteSpace(requestedCampusKey))
        {
            var requested = requestedCampusKey.Trim();
            return campusKeys.Contains(requested)
                ? (requested, null)
                : (null, "La sede indicada no pertenece a las organizaciones disponibles.");
        }

        return campusKeys.Count switch
        {
            0 => (null, "La organizacion no tiene sedes activas."),
            1 => (campusKeys[0], null),
            _ => (null, "La organizacion tiene multiples sedes; indica la sede para el agente.")
        };
    }

    [AllowAnonymous]
    [HttpPost("ingest")]
    public async Task<IActionResult> Ingest([FromBody] NetworkTelemetryIngestRequest request, CancellationToken cancellationToken = default)
    {
        if (!CanIngest())
        {
            return Unauthorized();
        }

        var actor = User.Identity?.IsAuthenticated == true
            ? (User.Identity?.Name ?? "usuario")
            : "collector";

        var result = await _service.IngestAsync(request, actor, cancellationToken);
        return Ok(result);
    }

    [Authorize(Roles = $"{AppRoles.Admin},{AppRoles.Auditor},{AppRoles.Admin}")]
    [HttpGet("snapshots/{snapshotId:guid}/observations")]
    public async Task<IActionResult> Observations(
        Guid snapshotId,
        [FromQuery] int take = 25,
        [FromQuery] string? type = null,
        [FromQuery] Guid? organizationId = null,
        CancellationToken cancellationToken = default)
    {
        var campusKeys = await ResolveCampusKeysAsync(organizationId, cancellationToken);
        var observations = await _service.GetObservationsAsync(snapshotId, take, type, campusKeys, cancellationToken);
        return Ok(observations);
    }

    [HttpGet("snapshots/{snapshotId:guid}/devices")]
    public async Task<IActionResult> Devices(
        Guid snapshotId,
        [FromQuery] string? search = null,
        [FromQuery] string? riskLevel = null,
        [FromQuery] string? buildingExternalId = null,
        [FromQuery] string? subnetCidr = null,
        [FromQuery] string? onlineState = null,
        [FromQuery] string? sortBy = null,
        [FromQuery] string? sortDirection = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10,
        [FromQuery] Guid? organizationId = null,
        CancellationToken cancellationToken = default)
    {
        var campusKeys = await ResolveCampusKeysAsync(organizationId, cancellationToken);
        var result = await _service.GetObservationPageAsync(
            snapshotId,
            new NetworkTelemetryObservationQueryRequest
            {
                Search = search ?? string.Empty,
                RiskLevel = riskLevel ?? string.Empty,
                BuildingExternalId = buildingExternalId ?? string.Empty,
                SubnetCidr = subnetCidr ?? string.Empty,
                OnlineState = onlineState ?? string.Empty,
                ObservationType = "device",
                SortBy = sortBy ?? "risk",
                SortDirection = sortDirection ?? "desc",
                Page = page,
                PageSize = pageSize
            },
            campusKeys,
            cancellationToken);

        return Ok(result);
    }

    [Authorize(Roles = $"{AppRoles.Admin},{AppRoles.Auditor},{AppRoles.Admin}")]
    [HttpGet("snapshots/{snapshotId:guid}/matching-summary")]
    public async Task<IActionResult> MatchingSummary(
        Guid snapshotId,
        [FromQuery] Guid? organizationId = null,
        CancellationToken cancellationToken = default)
    {
        var campusKeys = await ResolveCampusKeysAsync(organizationId, cancellationToken);
        var result = await _service.GetMatchingSummaryAsync(snapshotId, campusKeys, cancellationToken);
        if (!result.Found)
        {
            return NotFound(new { message = $"Snapshot #{snapshotId} no encontrada." });
        }

        return Ok(result);
    }

    [Authorize(Roles = $"{AppRoles.Admin},{AppRoles.Auditor},{AppRoles.Admin}")]
    [HttpGet("snapshots/{snapshotId:guid}/matches")]
    public async Task<IActionResult> Matches(
        Guid snapshotId,
        [FromQuery] string? search = null,
        [FromQuery] string? matchState = null,
        [FromQuery] string? riskLevel = null,
        [FromQuery] string? matchKey = null,
        [FromQuery] string? sortBy = null,
        [FromQuery] string? sortDirection = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10,
        [FromQuery] Guid? organizationId = null,
        CancellationToken cancellationToken = default)
    {
        var campusKeys = await ResolveCampusKeysAsync(organizationId, cancellationToken);
        var result = await _service.GetMatchingPageAsync(
            snapshotId,
            new NetworkTelemetryMatchingQueryRequest
            {
                Search = search ?? string.Empty,
                MatchState = matchState ?? string.Empty,
                RiskLevel = riskLevel ?? string.Empty,
                MatchKey = matchKey ?? string.Empty,
                SortBy = sortBy ?? "risk",
                SortDirection = sortDirection ?? "desc",
                Page = page,
                PageSize = pageSize
            },
            campusKeys,
            cancellationToken);

        return Ok(result);
    }

    [Authorize(Roles = $"{AppRoles.Admin},{AppRoles.Admin}")]
    [HttpPost("snapshots/{snapshotId:guid}/rematch")]
    public async Task<IActionResult> Rematch(
        Guid snapshotId,
        [FromQuery] Guid? organizationId = null,
        CancellationToken cancellationToken = default)
    {
        var actor = User.Identity?.Name ?? "system";
        var campusKeys = await ResolveCampusKeysAsync(organizationId, cancellationToken);
        var result = await _service.RematchSnapshotAsync(snapshotId, actor, campusKeys, cancellationToken);
        if (result.Status == "not-found")
        {
            return NotFound(new { message = $"Snapshot #{snapshotId} no encontrada." });
        }

        return Ok(result);
    }

    [Authorize(Roles = $"{AppRoles.Admin},{AppRoles.Auditor},{AppRoles.Admin}")]
    [HttpGet("scheduled-scans")]
    public async Task<IActionResult> ScheduledScans(
        [FromQuery] string? search = null,
        [FromQuery] string? status = null,
        [FromQuery] string? weekday = null,
        [FromQuery] string? timeSlot = null,
        [FromQuery] string? sortBy = null,
        [FromQuery] string? sortDirection = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10,
        [FromQuery] Guid? organizationId = null,
        CancellationToken cancellationToken = default)
    {
        var campusKeys = await ResolveCampusKeysAsync(organizationId, cancellationToken);
        var result = await _service.GetScheduledScanRunsAsync(
            new ScheduledScanRunQueryRequest
            {
                Search = search ?? string.Empty,
                Status = status ?? string.Empty,
                Weekday = weekday ?? string.Empty,
                TimeSlot = timeSlot ?? string.Empty,
                SortBy = sortBy ?? "scheduledAtUtc",
                SortDirection = sortDirection ?? "desc",
                Page = page,
                PageSize = pageSize
            },
            campusKeys,
            cancellationToken);
        return Ok(result);
    }

    [Authorize(Roles = $"{AppRoles.Admin},{AppRoles.Admin}")]
    [HttpDelete("snapshots/{snapshotId:guid}")]
    public async Task<IActionResult> DeleteSnapshot(
        Guid snapshotId,
        [FromQuery] Guid? organizationId = null,
        CancellationToken cancellationToken = default)
    {
        var actor = User.Identity?.Name ?? "system";
        var campusKeys = await ResolveCampusKeysAsync(organizationId, cancellationToken);
        var deleted = await _service.DeleteSnapshotAsync(snapshotId, actor, campusKeys, cancellationToken);
        if (!deleted)
        {
            return NotFound(new { message = $"Snapshot #{snapshotId} no encontrada." });
        }

        return Ok(new { message = $"Snapshot #{snapshotId} eliminada." });
    }

    [HttpGet("snapshots")]
    public async Task<IActionResult> Snapshots(
        [FromQuery] string? search = null,
        [FromQuery] string? triggerType = null,
        [FromQuery] string? weekday = null,
        [FromQuery] string? timeSlot = null,
        [FromQuery] string? sortBy = null,
        [FromQuery] string? sortDirection = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 10,
        [FromQuery] Guid? organizationId = null,
        CancellationToken cancellationToken = default)
    {
        var campusKeys = await ResolveCampusKeysAsync(organizationId, cancellationToken);
        var result = await _service.GetSnapshotPageAsync(
            new NetworkTelemetrySnapshotQueryRequest
            {
                Search = search ?? string.Empty,
                TriggerType = triggerType ?? string.Empty,
                Weekday = weekday ?? string.Empty,
                TimeSlot = timeSlot ?? string.Empty,
                SortBy = sortBy ?? "observedAt",
                SortDirection = sortDirection ?? "desc",
                Page = page,
                PageSize = pageSize
            },
            campusKeys,
            cancellationToken);

        return Ok(result);
    }

    private Task<IReadOnlyList<string>?> ResolveCampusKeysAsync(
        Guid? organizationId,
        CancellationToken cancellationToken)
    {
        return Task.FromResult<IReadOnlyList<string>?>(new List<string> { "sotero" });
    }

    private bool CanIngest()
    {
        var apiKey = _service.IngestApiKey();
        if (!string.IsNullOrWhiteSpace(apiKey))
        {
            if (Request.Headers.TryGetValue("X-Network-Telemetry-Key", out var providedKey))
            {
                return string.Equals(providedKey.ToString(), apiKey, StringComparison.Ordinal);
            }

            return false;
        }

        return User.Identity?.IsAuthenticated == true &&
               (User.IsInRole(AppRoles.Admin) || User.IsInRole(AppRoles.Auditor));
    }
}

public class NetworkTelemetryAgentControlRequest
{
    public string Action { get; set; } = string.Empty;
    public Guid? OrganizationId { get; set; }
    public string? CampusKey { get; set; }
}
