using System.Text.Json;
using Pireon.API.ViewModels;

namespace Pireon.API.Services;

public class NetworkTelemetryAgentBridgeService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    private readonly IConfiguration _configuration;
    private readonly IWebHostEnvironment _environment;

    public NetworkTelemetryAgentBridgeService(IConfiguration configuration, IWebHostEnvironment environment)
    {
        _configuration = configuration;
        _environment = environment;
    }

    public bool UseAgentMode()
        => string.Equals(
            _configuration["NetworkTelemetrySettings:ExecutionMode"] ?? "agent",
            "agent",
            StringComparison.OrdinalIgnoreCase);

    // Cada organizacion (campusKey) trabaja sobre su propia carpeta dentro del
    // directorio compartido; sin campusKey se mantiene la carpeta raiz legado.
    public string GetSharedPath(string? campusKey = null)
    {
        var configured = _configuration["NetworkTelemetrySettings:AgentSharedPath"];
        var basePath = !string.IsNullOrWhiteSpace(configured)
            ? Path.GetFullPath(configured, _environment.ContentRootPath)
            : Path.GetFullPath(Path.Combine(_environment.ContentRootPath, "..", "runtime", "network-telemetry-agent"));

        var folder = NormalizeCampusFolder(campusKey);
        return string.IsNullOrEmpty(folder)
            ? basePath
            : Path.Combine(basePath, folder);
    }

    private static string? NormalizeCampusFolder(string? campusKey)
    {
        if (string.IsNullOrWhiteSpace(campusKey))
        {
            return null;
        }

        var sanitized = new string(campusKey
            .Trim()
            .ToLowerInvariant()
            .Select(character => char.IsLetterOrDigit(character) || character == '-' || character == '_' ? character : '-')
            .ToArray())
            .Trim('-');

        if (sanitized.Length == 0)
        {
            return null;
        }

        return sanitized.Length <= 64 ? sanitized : sanitized[..64];
    }

    public string GetRequestPath(string? campusKey = null) => Path.Combine(GetSharedPath(campusKey), "scan-request.json");

    public string GetStatusPath(string? campusKey = null) => Path.Combine(GetSharedPath(campusKey), "scan-status.json");

    public string GetHeartbeatPath(string? campusKey = null) => Path.Combine(GetSharedPath(campusKey), "agent-heartbeat.json");

    public string GetControlPath(string? campusKey = null) => Path.Combine(GetSharedPath(campusKey), "scan-control.json");

    public async Task<NetworkTelemetryAgentStatusViewModel> QueueScanAsync(string requestedByUsername, NetworkTelemetryLiveScanRequest? request, CancellationToken cancellationToken = default)
    {
        var campusKey = request?.CampusKey?.Trim() ?? string.Empty;
        Directory.CreateDirectory(GetSharedPath(campusKey));
        TryDeleteControl(campusKey);

        var requestPayload = new NetworkTelemetryAgentRequest
        {
            RequestId = Guid.NewGuid().ToString("N"),
            RequestedAtUtc = DateTime.UtcNow,
            RequestedByUsername = string.IsNullOrWhiteSpace(requestedByUsername) ? "system" : requestedByUsername.Trim(),
            CampusKey = (request?.CampusKey ?? string.Empty).Trim(),
            ResolveInteractiveSessions = request?.ResolveInteractiveSessions ?? true,
            ScanMode = NormalizeScanMode(request?.ScanMode),
            TriggerType = NormalizeTriggerType(request?.TriggerType)
        };

        await File.WriteAllTextAsync(GetRequestPath(campusKey), JsonSerializer.Serialize(requestPayload, JsonOptions), cancellationToken);

        var statusPayload = new NetworkTelemetryAgentStatus
        {
            RequestId = requestPayload.RequestId,
            State = "pending",
            Message = $"Solicitud de escaneo creada por {requestPayload.RequestedByUsername}. Esperando al agente Windows.",
            RequestedAtUtc = requestPayload.RequestedAtUtc,
            RequestedByUsername = requestPayload.RequestedByUsername,
            TriggerType = requestPayload.TriggerType,
            UpdatedAtUtc = DateTime.UtcNow
        };

        await File.WriteAllTextAsync(GetStatusPath(campusKey), JsonSerializer.Serialize(statusPayload, JsonOptions), cancellationToken);
        return MapStatus(statusPayload);
    }

    public async Task<NetworkTelemetryAgentStatusViewModel> SendControlAsync(string requestedByUsername, string action, string? campusKey = null, CancellationToken cancellationToken = default)
    {
        Directory.CreateDirectory(GetSharedPath(campusKey));

        var normalizedAction = NormalizeControlAction(action);
        var current = await GetRawStatusAsync(campusKey, cancellationToken) ?? new NetworkTelemetryAgentStatus
        {
            State = "idle",
            Message = "Sin solicitudes recientes para el agente Windows."
        };

        var payload = new NetworkTelemetryAgentControl
        {
            RequestId = current.RequestId,
            Action = normalizedAction,
            RequestedByUsername = string.IsNullOrWhiteSpace(requestedByUsername) ? "system" : requestedByUsername.Trim(),
            RequestedAtUtc = DateTime.UtcNow
        };

        await File.WriteAllTextAsync(GetControlPath(campusKey), JsonSerializer.Serialize(payload, JsonOptions), cancellationToken);

        if (string.Equals(normalizedAction, "pause", StringComparison.OrdinalIgnoreCase) &&
            string.Equals(current.State, "running", StringComparison.OrdinalIgnoreCase))
        {
            current.State = "paused";
            current.Message = $"Escaneo pausado por {payload.RequestedByUsername}.";
            current.UpdatedAtUtc = DateTime.UtcNow;
            await SaveStatusAsync(campusKey, current, cancellationToken);
        }
        else if (string.Equals(normalizedAction, "resume", StringComparison.OrdinalIgnoreCase) &&
                 string.Equals(current.State, "paused", StringComparison.OrdinalIgnoreCase))
        {
            current.State = "running";
            current.Message = $"Escaneo reanudado por {payload.RequestedByUsername}.";
            current.UpdatedAtUtc = DateTime.UtcNow;
            await SaveStatusAsync(campusKey, current, cancellationToken);
        }
        else if (string.Equals(normalizedAction, "stop", StringComparison.OrdinalIgnoreCase))
        {
            if (string.Equals(current.State, "pending", StringComparison.OrdinalIgnoreCase))
            {
                TryDeleteRequest(campusKey);
                current.State = "failed";
                current.Error = "scan-stopped-before-start";
                current.Message = $"Solicitud detenida por {payload.RequestedByUsername} antes de iniciar.";
                current.CompletedAtUtc = DateTime.UtcNow;
                current.UpdatedAtUtc = DateTime.UtcNow;
                await SaveStatusAsync(campusKey, current, cancellationToken);
            }
            else
            {
                current.State = "stopping";
                current.Message = $"Deteniendo escaneo por solicitud de {payload.RequestedByUsername}.";
                current.UpdatedAtUtc = DateTime.UtcNow;
                await SaveStatusAsync(campusKey, current, cancellationToken);
            }
        }

        return MapStatus(current);
    }

    public async Task<NetworkTelemetryAgentRequest?> TryReadPendingRequestAsync(string? campusKey = null, CancellationToken cancellationToken = default)
    {
        var requestPath = GetRequestPath(campusKey);
        if (!File.Exists(requestPath))
        {
            return null;
        }

        await using var stream = File.OpenRead(requestPath);
        return await JsonSerializer.DeserializeAsync<NetworkTelemetryAgentRequest>(stream, JsonOptions, cancellationToken);
    }

    private async Task UpdateStatusAsync(
        string? campusKey,
        string requestId,
        Action<NetworkTelemetryAgentStatus> mutate,
        CancellationToken cancellationToken,
        bool deleteRequest = false)
    {
        var current = await GetRawStatusAsync(campusKey, cancellationToken) ?? new NetworkTelemetryAgentStatus();
        current.RequestId = requestId;
        mutate(current);
        current.UpdatedAtUtc = DateTime.UtcNow;
        await SaveStatusAsync(campusKey, current, cancellationToken);
        if (deleteRequest)
        {
            TryDeleteRequest(campusKey);
        }
    }

    public Task MarkRunningAsync(string requestId, string agentId, string? campusKey = null, CancellationToken cancellationToken = default)
        => UpdateStatusAsync(campusKey, requestId, status =>
        {
            status.State = "running";
            status.AgentId = agentId;
            status.Message = $"Agente {agentId} ejecutando escaneo.";
            status.StartedAtUtc ??= DateTime.UtcNow;
        }, cancellationToken);

    public Task MarkCompletedAsync(string requestId, string agentId, Guid? snapshotId, string? message, string? campusKey = null, CancellationToken cancellationToken = default)
        => UpdateStatusAsync(campusKey, requestId, status =>
        {
            status.State = "completed";
            status.AgentId = agentId;
            status.SnapshotId = snapshotId;
            status.Message = string.IsNullOrWhiteSpace(message) ? "Escaneo completado." : message.Trim();
            status.CompletedAtUtc = DateTime.UtcNow;
        }, cancellationToken, deleteRequest: true);

    public Task MarkFailedAsync(string requestId, string agentId, string? error, string? campusKey = null, CancellationToken cancellationToken = default)
        => UpdateStatusAsync(campusKey, requestId, status =>
        {
            status.State = "failed";
            status.AgentId = agentId;
            status.Error = string.IsNullOrWhiteSpace(error) ? "Error no especificado." : error.Trim();
            status.Message = "El agente Windows no pudo completar el escaneo.";
            status.CompletedAtUtc = DateTime.UtcNow;
        }, cancellationToken);

    public async Task<NetworkTelemetryAgentStatusViewModel> GetStatusAsync(string? campusKey = null, CancellationToken cancellationToken = default)
    {
        var current = await GetRawStatusAsync(campusKey, cancellationToken);
        var heartbeat = await GetHeartbeatAsync(campusKey, cancellationToken);
        var nowUtc = DateTime.UtcNow;
        var heartbeatTimeout = TimeSpan.FromSeconds(GetHeartbeatTimeoutSeconds());
        var mapped = current is null
            ? new NetworkTelemetryAgentStatusViewModel
            {
                State = "idle",
                Message = "Sin solicitudes recientes para el agente Windows."
            }
            : MapStatus(current);

        if (string.IsNullOrWhiteSpace(mapped.TriggerType))
        {
            var request = await TryReadPendingRequestAsync(campusKey, cancellationToken);
            if (request is not null)
            {
                mapped.TriggerType = request.TriggerType;
            }
        }

        mapped.LastHeartbeatAtUtc = heartbeat?.HeartbeatAtUtc;
        var heartbeatIsFresh = heartbeat is not null && heartbeat.HeartbeatAtUtc >= nowUtc.Subtract(heartbeatTimeout);
        var stateLooksActive = mapped.State is "pending" or "running" or "paused" or "stopping";
        var recentProgress = mapped.UpdatedAtUtc.HasValue &&
                             mapped.UpdatedAtUtc.Value >= nowUtc.Subtract(TimeSpan.FromSeconds(Math.Max(GetHeartbeatTimeoutSeconds() * 2, 90)));

        mapped.IsConnected = heartbeatIsFresh || (stateLooksActive && recentProgress);
        mapped.AgentId = !string.IsNullOrWhiteSpace(mapped.AgentId)
            ? mapped.AgentId
            : (heartbeat?.AgentId ?? string.Empty);

        if (!heartbeatIsFresh && stateLooksActive && recentProgress)
        {
            mapped.Message = "Escaneo en curso con avance reciente. El heartbeat del agente esta atrasado, pero el proceso sigue reportando progreso.";
        }
        else if (!mapped.IsConnected)
        {
            mapped.Message = "Agente Windows desconectado o sin latido reciente.";
        }

        return mapped;
    }

    private int GetHeartbeatTimeoutSeconds()
    {
        var raw = _configuration["NetworkTelemetrySettings:AgentHeartbeatTimeoutSeconds"];
        return int.TryParse(raw, out var value) && value > 5
            ? value
            : 30;
    }

    private async Task<NetworkTelemetryAgentStatus?> GetRawStatusAsync(string? campusKey, CancellationToken cancellationToken)
    {
        var statusPath = GetStatusPath(campusKey);
        if (!File.Exists(statusPath))
        {
            return null;
        }

        await using var stream = File.OpenRead(statusPath);
        return await JsonSerializer.DeserializeAsync<NetworkTelemetryAgentStatus>(stream, JsonOptions, cancellationToken);
    }

    private async Task<NetworkTelemetryAgentHeartbeat?> GetHeartbeatAsync(string? campusKey, CancellationToken cancellationToken)
    {
        var heartbeatPath = GetHeartbeatPath(campusKey);
        if (!File.Exists(heartbeatPath))
        {
            return null;
        }

        await using var stream = File.OpenRead(heartbeatPath);
        return await JsonSerializer.DeserializeAsync<NetworkTelemetryAgentHeartbeat>(stream, JsonOptions, cancellationToken);
    }

    private async Task SaveStatusAsync(string? campusKey, NetworkTelemetryAgentStatus status, CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(GetSharedPath(campusKey));
        await File.WriteAllTextAsync(GetStatusPath(campusKey), JsonSerializer.Serialize(status, JsonOptions), cancellationToken);
    }

    private void TryDeleteRequest(string? campusKey)
    {
        var requestPath = GetRequestPath(campusKey);
        if (File.Exists(requestPath))
        {
            File.Delete(requestPath);
        }
    }

    private void TryDeleteControl(string? campusKey)
    {
        var controlPath = GetControlPath(campusKey);
        if (File.Exists(controlPath))
        {
            File.Delete(controlPath);
        }
    }

    private static string NormalizeScanMode(string? scanMode)
        => string.Equals(scanMode, "full", StringComparison.OrdinalIgnoreCase)
            ? "full"
            : "simple";

    private static string NormalizeTriggerType(string? triggerType)
        => triggerType?.Trim().ToLowerInvariant() switch
        {
            "scheduled" => "scheduled",
            "automatic" => "automatic",
            _ => "manual"
        };

    private static string NormalizeControlAction(string? action)
        => action?.Trim().ToLowerInvariant() switch
        {
            "pause" => "pause",
            "resume" => "resume",
            "stop" => "stop",
            _ => "pause"
        };

    private static NetworkTelemetryAgentStatusViewModel MapStatus(NetworkTelemetryAgentStatus status)
        => new()
        {
            RequestId = status.RequestId,
            State = status.State,
            Message = status.Message,
            AgentId = status.AgentId,
            SnapshotId = status.SnapshotId,
            Error = status.Error,
            RequestedAtUtc = status.RequestedAtUtc,
            StartedAtUtc = status.StartedAtUtc,
            CompletedAtUtc = status.CompletedAtUtc,
            UpdatedAtUtc = status.UpdatedAtUtc,
            RequestedByUsername = status.RequestedByUsername,
            TriggerType = status.TriggerType,
            TotalHosts = status.TotalHosts,
            ProcessedHosts = status.ProcessedHosts,
            CurrentIpAddress = status.CurrentIpAddress,
            CurrentHostName = status.CurrentHostName,
            CurrentSubnetCidr = status.CurrentSubnetCidr,
            CurrentStage = status.CurrentStage
        };
}

public class NetworkTelemetryAgentRequest
{
    public string RequestId { get; set; } = string.Empty;
    public DateTime RequestedAtUtc { get; set; }
    public string RequestedByUsername { get; set; } = string.Empty;
    public string CampusKey { get; set; } = string.Empty;
    public bool ResolveInteractiveSessions { get; set; } = true;
    public string ScanMode { get; set; } = "simple";
    public string TriggerType { get; set; } = "manual";
}

public class NetworkTelemetryAgentStatus
{
    public string RequestId { get; set; } = string.Empty;
    public string State { get; set; } = "idle";
    public string Message { get; set; } = string.Empty;
    public string AgentId { get; set; } = string.Empty;
    public Guid? SnapshotId { get; set; }
    public string Error { get; set; } = string.Empty;
    public DateTime? RequestedAtUtc { get; set; }
    public DateTime? StartedAtUtc { get; set; }
    public DateTime? CompletedAtUtc { get; set; }
    public DateTime? UpdatedAtUtc { get; set; }
    public string RequestedByUsername { get; set; } = string.Empty;
    public string TriggerType { get; set; } = string.Empty;
    public int? TotalHosts { get; set; }
    public int? ProcessedHosts { get; set; }
    public string CurrentIpAddress { get; set; } = string.Empty;
    public string CurrentHostName { get; set; } = string.Empty;
    public string CurrentSubnetCidr { get; set; } = string.Empty;
    public string CurrentStage { get; set; } = string.Empty;
}

public class NetworkTelemetryAgentStatusViewModel
{
    public string RequestId { get; set; } = string.Empty;
    public string State { get; set; } = "idle";
    public string Message { get; set; } = string.Empty;
    public string AgentId { get; set; } = string.Empty;
    public Guid? SnapshotId { get; set; }
    public string Error { get; set; } = string.Empty;
    public DateTime? RequestedAtUtc { get; set; }
    public DateTime? StartedAtUtc { get; set; }
    public DateTime? CompletedAtUtc { get; set; }
    public DateTime? UpdatedAtUtc { get; set; }
    public string RequestedByUsername { get; set; } = string.Empty;
    public string TriggerType { get; set; } = string.Empty;
    public DateTime? LastHeartbeatAtUtc { get; set; }
    public bool IsConnected { get; set; }
    public int? TotalHosts { get; set; }
    public int? ProcessedHosts { get; set; }
    public string CurrentIpAddress { get; set; } = string.Empty;
    public string CurrentHostName { get; set; } = string.Empty;
    public string CurrentSubnetCidr { get; set; } = string.Empty;
    public string CurrentStage { get; set; } = string.Empty;
}

public class NetworkTelemetryAgentControl
{
    public string RequestId { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string RequestedByUsername { get; set; } = string.Empty;
    public DateTime RequestedAtUtc { get; set; }
}

public class NetworkTelemetryAgentHeartbeat
{
    public string AgentId { get; set; } = string.Empty;
    public string MachineName { get; set; } = string.Empty;
    public DateTime HeartbeatAtUtc { get; set; }
    public string Version { get; set; } = string.Empty;
    public string Mode { get; set; } = "watch";
}
