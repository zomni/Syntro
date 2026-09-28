using System.Collections.Concurrent;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Syntro.API.ViewModels;

namespace Syntro.API.Services;

public class NetworkTelemetryAgentBridgeService
{
    private const int MaxLifecycleKeyBytes = 16 * 1024;
    private const int MaxLifecycleCommandLifetimeSeconds = 60;
    private const int MaxLifecycleRequestAgeSeconds = 30;
    private const int MaxLifecycleFutureExpirySeconds = 120;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };
    private static readonly ConcurrentDictionary<string, SemaphoreSlim> LifecycleCommandLocks = new(StringComparer.OrdinalIgnoreCase);

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

    public string GetLifecycleKeyPath(string? campusKey = null)
        => Path.Combine(GetSharedPath(campusKey), GetConfiguredFileName(
            "NetworkTelemetrySettings:AgentLifecycleKeyFileName",
            "NetworkTelemetrySettings:AgentControlKeyFileName",
            "agent-lifecycle.key"));

    public string GetLifecycleCommandPath(string? campusKey = null)
        => Path.Combine(GetSharedPath(campusKey), GetConfiguredFileName(
            "NetworkTelemetrySettings:AgentLifecycleCommandFileName",
            "NetworkTelemetrySettings:AgentControlCommandFileName",
            "agent-lifecycle-command.json"));

    public string GetSupervisorStatusPath(string? campusKey = null)
        => Path.Combine(GetSharedPath(campusKey), GetConfiguredFileName(
            "NetworkTelemetrySettings:AgentSupervisorStatusFileName",
            "NetworkTelemetrySettings:AgentSupervisorFileName",
            "agent-supervisor-status.json"));

    private string GetConfiguredFileName(string primaryKey, string secondaryKey, string fallback)
    {
        var configured = _configuration[primaryKey];
        if (string.IsNullOrWhiteSpace(configured))
        {
            configured = _configuration[secondaryKey];
        }

        if (string.IsNullOrWhiteSpace(configured))
        {
            return fallback;
        }

        var value = configured.Trim();
        if (value is "." or ".." ||
            value.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0 ||
            value.Contains(Path.DirectorySeparatorChar) ||
            value.Contains(Path.AltDirectorySeparatorChar))
        {
            return fallback;
        }

        return value;
    }

    public static bool TryNormalizeLifecycleAction(string? action, out string normalizedAction)
    {
        normalizedAction = action?.Trim().ToLowerInvariant() switch
        {
            "start" => "start",
            "stop" => "stop",
            "restart" => "restart",
            _ => string.Empty
        };

        return normalizedAction.Length > 0;
    }

    public static string NormalizeLifecycleAction(string? action)
        => TryNormalizeLifecycleAction(action, out var normalizedAction)
            ? normalizedAction
            : throw new ArgumentException("La accion del ciclo de vida debe ser start, stop o restart.", nameof(action));

    private static string GetDesiredStateForAction(string action)
        => string.Equals(action, "stop", StringComparison.Ordinal)
            ? "stopped"
            : "running";

    public Task<NetworkTelemetryAgentLifecycleCommandResult> QueueLifecycleCommandAsync(
        string requestedByUsername,
        string action,
        string? campusKey = null,
        CancellationToken cancellationToken = default)
        => QueueLifecycleCommandAsync(requestedByUsername, action, campusKey, null, cancellationToken);

    public async Task<NetworkTelemetryAgentLifecycleCommandResult> QueueLifecycleCommandAsync(
        string requestedByUsername,
        string action,
        string? campusKey,
        string? agentId,
        CancellationToken cancellationToken = default)
    {
        var normalizedCampusKey = campusKey?.Trim() ?? string.Empty;
        if (!TryNormalizeLifecycleAction(action, out var normalizedAction))
        {
            var invalidStatus = await GetStatusAsync(normalizedCampusKey, cancellationToken);
            return new NetworkTelemetryAgentLifecycleCommandResult
            {
                Failure = NetworkTelemetryAgentLifecycleFailure.InvalidAction,
                Error = "La accion del ciclo de vida debe ser start, stop o restart.",
                Status = invalidStatus
            };
        }

        var keyResult = await ReadLifecycleKeyAsync(normalizedCampusKey, cancellationToken);
        if (!keyResult.IsAvailable || keyResult.Key is null)
        {
            var unavailableStatus = await GetStatusAsync(normalizedCampusKey, cancellationToken);
            return new NetworkTelemetryAgentLifecycleCommandResult
            {
                Failure = NetworkTelemetryAgentLifecycleFailure.KeyUnavailable,
                Error = keyResult.Error ?? "Control del ciclo de vida no disponible: falta la clave del agente o es invalida.",
                Status = unavailableStatus
            };
        }

        var key = keyResult.Key;
        try
        {
            var currentStatus = await GetStatusAsync(normalizedCampusKey, cancellationToken);
            var effectiveAgentId = NormalizeProtocolValue(agentId);
            if (effectiveAgentId.Length == 0)
            {
                effectiveAgentId = NormalizeProtocolValue(currentStatus.AgentId);
            }

            if (effectiveAgentId.Length == 0)
            {
                return new NetworkTelemetryAgentLifecycleCommandResult
                {
                    Failure = NetworkTelemetryAgentLifecycleFailure.AgentUnavailable,
                    Error = "Control del ciclo de vida no disponible: la identidad del agente no esta disponible.",
                    Status = currentStatus
                };
            }

            if (!string.IsNullOrWhiteSpace(agentId) &&
                !string.IsNullOrWhiteSpace(currentStatus.AgentId) &&
                !string.Equals(NormalizeProtocolValue(currentStatus.AgentId), effectiveAgentId, StringComparison.Ordinal))
            {
                return new NetworkTelemetryAgentLifecycleCommandResult
                {
                    Failure = NetworkTelemetryAgentLifecycleFailure.AgentUnavailable,
                    Error = "Control del ciclo de vida no disponible: el agente solicitado no coincide con el agente reportado.",
                    Status = currentStatus
                };
            }

            var commandPath = GetLifecycleCommandPath(normalizedCampusKey);
            var commandLock = LifecycleCommandLocks.GetOrAdd(commandPath, static _ => new SemaphoreSlim(1, 1));
            await commandLock.WaitAsync(cancellationToken);
            try
            {
                var nowUtc = DateTime.UtcNow;
                var existingRead = await ReadLifecycleCommandAsync(normalizedCampusKey, cancellationToken);
                if (existingRead.Exists)
                {
                    if (!existingRead.IsValid || existingRead.Command is null)
                    {
                        return new NetworkTelemetryAgentLifecycleCommandResult
                        {
                            Failure = NetworkTelemetryAgentLifecycleFailure.InvalidCommandFile,
                            Error = "Control del ciclo de vida no disponible: el archivo de comando pendiente es invalido.",
                            Status = currentStatus
                        };
                    }

                    var supervisorRead = await ReadSupervisorStatusAsync(normalizedCampusKey, cancellationToken);
                    var processedCommandId = NormalizeProtocolValue(supervisorRead.Status?.LastCommandId);
                    var commandWasProcessed = processedCommandId.Length > 0 &&
                        string.Equals(processedCommandId, existingRead.Command.RequestId, StringComparison.OrdinalIgnoreCase);
                    var commandIsUnexpired = existingRead.Command.ExpiresAtUtc.ToUniversalTime() > nowUtc;
                    if (commandIsUnexpired && !commandWasProcessed &&
                        !IsValidLifecycleCommandForTarget(
                            existingRead.Command,
                            key,
                            normalizedCampusKey,
                            effectiveAgentId,
                            nowUtc))
                    {
                        return new NetworkTelemetryAgentLifecycleCommandResult
                        {
                            Failure = NetworkTelemetryAgentLifecycleFailure.InvalidCommandFile,
                            Error = "Control del ciclo de vida no disponible: el archivo de comando pendiente no corresponde a este agente.",
                            Status = currentStatus
                        };
                    }

                    if (commandIsUnexpired && !commandWasProcessed)
                    {
                        return new NetworkTelemetryAgentLifecycleCommandResult
                        {
                            Failure = NetworkTelemetryAgentLifecycleFailure.PendingCommand,
                            Error = "Control del ciclo de vida no disponible: hay un comando anterior aun pendiente.",
                            Status = currentStatus
                        };
                    }

                    try
                    {
                        File.Delete(commandPath);
                    }
                    catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
                    {
                        return new NetworkTelemetryAgentLifecycleCommandResult
                        {
                            Failure = NetworkTelemetryAgentLifecycleFailure.StorageUnavailable,
                            Error = "Control del ciclo de vida no disponible: no se pudo reemplazar el comando pendiente.",
                            Status = currentStatus
                        };
                    }
                }

                var command = new NetworkTelemetryAgentLifecycleCommand
                {
                    RequestId = Guid.NewGuid().ToString("N"),
                    Action = normalizedAction,
                    AgentId = effectiveAgentId,
                    CampusKey = normalizedCampusKey,
                    RequestedByUsername = NormalizeRequestedByUsername(requestedByUsername),
                    RequestedAtUtc = nowUtc,
                    ExpiresAtUtc = nowUtc.AddSeconds(MaxLifecycleCommandLifetimeSeconds)
                };
                command.Signature = CreateLifecycleSignature(key, command);

                try
                {
                    await WriteJsonAtomicallyAsync(commandPath, command, cancellationToken);
                }
                catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
                {
                    return new NetworkTelemetryAgentLifecycleCommandResult
                    {
                        Failure = NetworkTelemetryAgentLifecycleFailure.StorageUnavailable,
                        Error = "Control del ciclo de vida no disponible: no se pudo guardar el comando.",
                        Status = currentStatus
                    };
                }

                var responseStatus = await GetStatusAsync(normalizedCampusKey, cancellationToken);
                responseStatus.LastCommandId = command.RequestId;
                responseStatus.LastCommand = command.Action;
                responseStatus.LastCommandRequestedBy = command.RequestedByUsername;
                responseStatus.LastCommandAtUtc = command.RequestedAtUtc;
                responseStatus.DesiredState = GetDesiredStateForAction(command.Action);

                return new NetworkTelemetryAgentLifecycleCommandResult
                {
                    Command = command,
                    Status = responseStatus
                };
            }
            finally
            {
                commandLock.Release();
            }
        }
        finally
        {
            Array.Clear(key);
        }
    }

    public Task<NetworkTelemetryAgentLifecycleCommandResult> CreateLifecycleCommandAsync(
        string requestedByUsername,
        string action,
        string? campusKey = null,
        string? agentId = null,
        CancellationToken cancellationToken = default)
        => QueueLifecycleCommandAsync(requestedByUsername, action, campusKey, agentId, cancellationToken);

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

        await WriteJsonAtomicallyAsync(GetRequestPath(campusKey), requestPayload, cancellationToken);

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

        await WriteJsonAtomicallyAsync(GetStatusPath(campusKey), statusPayload, cancellationToken);
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

        await WriteJsonAtomicallyAsync(GetControlPath(campusKey), payload, cancellationToken);

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

        try
        {
            await using var stream = File.OpenRead(requestPath);
            return await JsonSerializer.DeserializeAsync<NetworkTelemetryAgentRequest>(stream, JsonOptions, cancellationToken);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (JsonException)
        {
            return null;
        }
        catch (IOException)
        {
            return null;
        }
        catch (UnauthorizedAccessException)
        {
            return null;
        }
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
        var supervisorRead = await ReadSupervisorStatusAsync(campusKey, cancellationToken);
        var lifecycleKey = await ReadLifecycleKeyAsync(campusKey, cancellationToken);
        var lifecycleKeyAvailable = lifecycleKey.IsAvailable;
        if (lifecycleKey.Key is not null)
        {
            Array.Clear(lifecycleKey.Key);
        }

        var pendingCommand = await ReadLifecycleCommandAsync(campusKey, cancellationToken);
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
        var heartbeatIsFresh = IsFresh(heartbeat?.HeartbeatAtUtc, nowUtc, heartbeatTimeout);
        var normalizedScanState = mapped.State?.Trim().ToLowerInvariant() ?? "idle";
        var stateLooksActive = normalizedScanState is "pending" or "running" or "paused" or "stopping";
        var recentProgress = mapped.UpdatedAtUtc.HasValue &&
                             IsFresh(mapped.UpdatedAtUtc, nowUtc, TimeSpan.FromSeconds(Math.Max(GetHeartbeatTimeoutSeconds() * 2, 90)));

        mapped.IsConnected = heartbeatIsFresh || (stateLooksActive && recentProgress);
        mapped.AgentId = FirstNonEmpty(
            supervisorRead.Status?.AgentId,
            mapped.AgentId,
            heartbeat?.AgentId);
        mapped.MachineName = FirstNonEmpty(supervisorRead.Status?.MachineName, heartbeat?.MachineName);
        mapped.Version = FirstNonEmpty(supervisorRead.Status?.Version, heartbeat?.Version);
        mapped.AgentCount = 1;
        mapped.ConnectedAgentCount = mapped.IsConnected ? 1 : 0;

        var supervisor = supervisorRead.Status;
        if (supervisor is null)
        {
            mapped.SupervisorState = "unavailable";
            mapped.ProcessState = "unknown";
            mapped.DesiredState = "unknown";
        }
        else
        {
            mapped.SupervisorState = NormalizeStateValue(supervisor.SupervisorState, "unknown");
            mapped.ProcessState = NormalizeStateValue(supervisor.ProcessState, "unknown");
            mapped.DesiredState = NormalizeStateValue(supervisor.DesiredState, "unknown");
            mapped.WorkerProcessId = supervisor.WorkerProcessId;
            mapped.WorkerStartedAtUtc = supervisor.WorkerStartedAtUtc;
            mapped.WorkerStoppedAtUtc = supervisor.WorkerStoppedAtUtc;
            mapped.SupervisorHeartbeatAtUtc = supervisor.SupervisorHeartbeatAtUtc;
            mapped.SupervisorUpdatedAtUtc = supervisor.UpdatedAtUtc;
            mapped.LastCommandId = supervisor.LastCommandId;
            mapped.LastCommand = supervisor.LastCommand;
            mapped.LastCommandRequestedBy = supervisor.LastCommandRequestedBy;
            mapped.LastCommandAtUtc = supervisor.LastCommandAtUtc;
            mapped.LastError = supervisor.LastError;
        }

        var supervisorAvailable = supervisor is not null &&
            IsFresh(supervisor.SupervisorHeartbeatAtUtc, nowUtc, TimeSpan.FromSeconds(GetSupervisorTimeoutSeconds()));
        var supervisorRunning = supervisorAvailable &&
            string.Equals(
                NormalizeStateValue(supervisor?.SupervisorState, "unknown"),
                "running",
                StringComparison.OrdinalIgnoreCase);
        mapped.IsSupervisorAvailable = supervisorAvailable;
        mapped.ControlAvailable = lifecycleKeyAvailable && supervisorRunning;

        if (pendingCommand.IsValid && pendingCommand.Command is not null &&
            string.IsNullOrWhiteSpace(mapped.LastCommandId))
        {
            mapped.LastCommandId = pendingCommand.Command.RequestId;
            mapped.LastCommand = pendingCommand.Command.Action;
            mapped.LastCommandRequestedBy = pendingCommand.Command.RequestedByUsername;
            mapped.LastCommandAtUtc = pendingCommand.Command.RequestedAtUtc;
            if (string.IsNullOrWhiteSpace(mapped.DesiredState) || mapped.DesiredState == "unknown")
            {
                mapped.DesiredState = GetDesiredStateForAction(pendingCommand.Command.Action);
            }
        }

        SetLifecycleControlFlags(mapped);

        if (!heartbeatIsFresh && stateLooksActive && recentProgress)
        {
            mapped.Message = "Escaneo en curso con avance reciente. El heartbeat del agente esta atrasado, pero el proceso sigue reportando progreso.";
        }
        else if (!mapped.IsConnected)
        {
            mapped.Message = "Agente Windows desconectado o sin latido reciente.";
        }

        var lifecycleErrors = new List<string>();
        if (!string.IsNullOrWhiteSpace(mapped.LastError))
        {
            lifecycleErrors.Add(mapped.LastError);
        }

        if (!lifecycleKeyAvailable && !string.IsNullOrWhiteSpace(lifecycleKey.Error))
        {
            lifecycleErrors.Add(lifecycleKey.Error);
        }

        if (!string.IsNullOrWhiteSpace(supervisorRead.Error))
        {
            lifecycleErrors.Add(supervisorRead.Error);
        }
        else if (!supervisorAvailable)
        {
            lifecycleErrors.Add(supervisor is null
                ? "Agent supervisor status is unavailable."
                : "Agent supervisor status is stale.");
        }
        else if (!supervisorRunning)
        {
            lifecycleErrors.Add("Agent supervisor is not running.");
        }

        if (pendingCommand.Exists && !pendingCommand.IsValid)
        {
            lifecycleErrors.Add("The pending lifecycle command file is invalid.");
        }

        if (lifecycleErrors.Count > 0)
        {
            mapped.LastError = string.Join(
                " ",
                lifecycleErrors
                    .Where(error => !string.IsNullOrWhiteSpace(error))
                    .Distinct(StringComparer.Ordinal)
                    .ToArray());
            mapped.Message = $"{mapped.Message} {mapped.LastError}";
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

    private int GetSupervisorTimeoutSeconds()
    {
        var raw = _configuration["NetworkTelemetrySettings:AgentSupervisorTimeoutSeconds"];
        return int.TryParse(raw, out var value) && value > 0
            ? value
            : 30;
    }

    private async Task<LifecycleKeyReadResult> ReadLifecycleKeyAsync(
        string? campusKey,
        CancellationToken cancellationToken)
    {
        var keyPath = GetLifecycleKeyPath(campusKey);
        if (!File.Exists(keyPath))
        {
            return LifecycleKeyReadResult.Unavailable("Control del ciclo de vida no disponible: falta el archivo agent-lifecycle.key.");
        }

        try
        {
            await using var stream = new FileStream(
                keyPath,
                FileMode.Open,
                FileAccess.Read,
                FileShare.Read,
                4096,
                FileOptions.Asynchronous | FileOptions.SequentialScan);
            if (stream.Length > MaxLifecycleKeyBytes)
            {
                return LifecycleKeyReadResult.Unavailable("Control del ciclo de vida no disponible: el archivo agent-lifecycle.key es invalido.");
            }

            var buffer = new byte[MaxLifecycleKeyBytes + 1];
            var totalBytes = 0;
            while (totalBytes < buffer.Length)
            {
                var read = await stream.ReadAsync(
                    buffer.AsMemory(totalBytes, buffer.Length - totalBytes),
                    cancellationToken);
                if (read == 0)
                {
                    break;
                }

                totalBytes += read;
            }

            if (totalBytes > MaxLifecycleKeyBytes)
            {
                return LifecycleKeyReadResult.Unavailable("Control del ciclo de vida no disponible: el archivo agent-lifecycle.key es invalido.");
            }

            var text = new UTF8Encoding(false, true).GetString(buffer, 0, totalBytes);
            if (text.StartsWith("\uFEFF", StringComparison.Ordinal))
            {
                text = text[1..];
            }

            var trimmed = text.Trim();
            if (trimmed.Length == 0)
            {
                return LifecycleKeyReadResult.Unavailable("Control del ciclo de vida no disponible: el archivo agent-lifecycle.key es invalido.");
            }

            var key = Convert.FromBase64String(trimmed);
            if (key.Length == 0)
            {
                Array.Clear(key);
                return LifecycleKeyReadResult.Unavailable("Control del ciclo de vida no disponible: el archivo agent-lifecycle.key es invalido.");
            }

            return LifecycleKeyReadResult.Available(key);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or FormatException or DecoderFallbackException)
        {
            return LifecycleKeyReadResult.Unavailable("Control del ciclo de vida no disponible: el archivo agent-lifecycle.key es invalido o no se puede leer.");
        }
    }

    private async Task<SupervisorStatusReadResult> ReadSupervisorStatusAsync(
        string? campusKey,
        CancellationToken cancellationToken)
    {
        var statusPath = GetSupervisorStatusPath(campusKey);
        if (!File.Exists(statusPath))
        {
            return SupervisorStatusReadResult.Missing();
        }

        try
        {
            await using var stream = File.OpenRead(statusPath);
            var status = await JsonSerializer.DeserializeAsync<NetworkTelemetryAgentSupervisorStatus>(
                stream,
                JsonOptions,
                cancellationToken);
            return status is null
                ? SupervisorStatusReadResult.Invalid("Agent supervisor status is unreadable.")
                : SupervisorStatusReadResult.Valid(status);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception exception) when (exception is JsonException or IOException or UnauthorizedAccessException)
        {
            return SupervisorStatusReadResult.Invalid("Agent supervisor status is unreadable.");
        }
    }

    private async Task<LifecycleCommandReadResult> ReadLifecycleCommandAsync(
        string? campusKey,
        CancellationToken cancellationToken)
    {
        var commandPath = GetLifecycleCommandPath(campusKey);
        if (!File.Exists(commandPath))
        {
            return LifecycleCommandReadResult.Missing();
        }

        try
        {
            await using var stream = File.OpenRead(commandPath);
            var command = await JsonSerializer.DeserializeAsync<NetworkTelemetryAgentLifecycleCommand>(
                stream,
                JsonOptions,
                cancellationToken);
            return command is not null && IsValidLifecycleCommand(command)
                ? LifecycleCommandReadResult.Valid(command)
                : LifecycleCommandReadResult.Invalid("The lifecycle command file is invalid.");
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception exception) when (exception is JsonException or IOException or UnauthorizedAccessException)
        {
            return LifecycleCommandReadResult.Invalid("The lifecycle command file is unreadable.");
        }
    }

    private static bool IsValidLifecycleCommand(NetworkTelemetryAgentLifecycleCommand command)
    {
        if (!IsValidProtocolText(command.RequestId) ||
            !TryNormalizeLifecycleAction(command.Action, out var action) ||
            !string.Equals(action, command.Action, StringComparison.Ordinal) ||
            !IsValidProtocolText(command.AgentId) ||
            !IsValidProtocolText(command.CampusKey) ||
            !IsValidProtocolText(command.RequestedByUsername) ||
            !IsValidProtocolText(command.Signature) ||
            command.RequestedAtUtc == default ||
            command.ExpiresAtUtc == default)
        {
            return false;
        }

        var requestedAtUtc = command.RequestedAtUtc.ToUniversalTime();
        var expiresAtUtc = command.ExpiresAtUtc.ToUniversalTime();
        if (expiresAtUtc <= requestedAtUtc ||
            expiresAtUtc.Ticks - requestedAtUtc.Ticks > TimeSpan.FromSeconds(MaxLifecycleCommandLifetimeSeconds).Ticks)
        {
            return false;
        }

        try
        {
            var signature = Convert.FromBase64String(command.Signature);
            if (signature.Length == 0)
            {
                return false;
            }

            Array.Clear(signature);
        }
        catch (FormatException)
        {
            return false;
        }

        return true;
    }

    private static bool IsValidLifecycleCommandForTarget(
        NetworkTelemetryAgentLifecycleCommand command,
        byte[] key,
        string campusKey,
        string agentId,
        DateTime nowUtc)
    {
        if (!IsValidLifecycleCommand(command) ||
            !string.Equals(command.CampusKey, campusKey, StringComparison.Ordinal) ||
            !string.Equals(command.AgentId, agentId, StringComparison.Ordinal))
        {
            return false;
        }

        var requestedAtUtc = command.RequestedAtUtc.ToUniversalTime();
        var expiresAtUtc = command.ExpiresAtUtc.ToUniversalTime();
        var normalizedNowUtc = nowUtc.ToUniversalTime();
        if (requestedAtUtc < normalizedNowUtc.AddSeconds(-MaxLifecycleRequestAgeSeconds) ||
            requestedAtUtc > normalizedNowUtc.AddSeconds(MaxLifecycleRequestAgeSeconds) ||
            expiresAtUtc <= normalizedNowUtc ||
            expiresAtUtc > normalizedNowUtc.AddSeconds(MaxLifecycleFutureExpirySeconds) ||
            expiresAtUtc <= requestedAtUtc ||
            expiresAtUtc.Ticks - requestedAtUtc.Ticks > TimeSpan.FromSeconds(MaxLifecycleCommandLifetimeSeconds).Ticks)
        {
            return false;
        }

        return HasValidLifecycleSignature(key, command);
    }

    private static bool HasValidLifecycleSignature(byte[] key, NetworkTelemetryAgentLifecycleCommand command)
    {
        byte[] providedSignature;
        try
        {
            providedSignature = Convert.FromBase64String(command.Signature);
        }
        catch (FormatException)
        {
            return false;
        }

        try
        {
            using var hmac = new HMACSHA256(key);
            var expectedSignature = hmac.ComputeHash(Encoding.UTF8.GetBytes(BuildLifecycleSignaturePayload(command)));
            return CryptographicOperations.FixedTimeEquals(expectedSignature, providedSignature);
        }
        finally
        {
            Array.Clear(providedSignature);
        }
    }

    internal static string BuildLifecycleSignaturePayload(NetworkTelemetryAgentLifecycleCommand command)
        => string.Join(
            "\n",
            command.RequestId,
            command.Action,
            command.AgentId,
            command.CampusKey,
            command.RequestedByUsername,
            command.RequestedAtUtc.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture),
            command.ExpiresAtUtc.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture));

    internal static string CreateLifecycleSignature(byte[] key, NetworkTelemetryAgentLifecycleCommand command)
    {
        var payload = BuildLifecycleSignaturePayload(command);
        using var hmac = new HMACSHA256(key);
        return Convert.ToBase64String(hmac.ComputeHash(Encoding.UTF8.GetBytes(payload)));
    }

    private static async Task WriteJsonAtomicallyAsync<T>(
        string path,
        T value,
        CancellationToken cancellationToken)
    {
        var directory = Path.GetDirectoryName(path);
        if (!string.IsNullOrWhiteSpace(directory))
        {
            Directory.CreateDirectory(directory);
        }

        var temporaryPath = $"{path}.{Guid.NewGuid():N}.tmp";
        try
        {
            await using (var stream = new FileStream(
                temporaryPath,
                FileMode.CreateNew,
                FileAccess.Write,
                FileShare.None,
                4096,
                FileOptions.Asynchronous | FileOptions.WriteThrough))
            {
                await JsonSerializer.SerializeAsync(stream, value, JsonOptions, cancellationToken);
                await stream.FlushAsync(cancellationToken);
                stream.Flush(flushToDisk: true);
            }

            if (File.Exists(path))
            {
                try
                {
                    File.Replace(temporaryPath, path, null);
                }
                catch (PlatformNotSupportedException)
                {
                    File.Move(temporaryPath, path, overwrite: true);
                }
                catch (IOException)
                {
                    File.Move(temporaryPath, path, overwrite: true);
                }
            }
            else
            {
                File.Move(temporaryPath, path);
            }
        }
        finally
        {
            try
            {
                if (File.Exists(temporaryPath))
                {
                    File.Delete(temporaryPath);
                }
            }
            catch (IOException)
            {
            }
            catch (UnauthorizedAccessException)
            {
            }
        }
    }

    private static bool IsFresh(DateTime? timestamp, DateTime nowUtc, TimeSpan timeout)
    {
        if (!timestamp.HasValue)
        {
            return false;
        }

        var normalizedNowUtc = nowUtc.ToUniversalTime();
        var normalizedTimestamp = timestamp.Value.ToUniversalTime();
        return normalizedTimestamp >= normalizedNowUtc.Subtract(timeout) &&
               normalizedTimestamp <= normalizedNowUtc.Add(timeout);
    }

    private static string FirstNonEmpty(params string?[] values)
        => values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))?.Trim() ?? string.Empty;

    private static string NormalizeStateValue(string? value, string fallback)
        => string.IsNullOrWhiteSpace(value) ? fallback : value.Trim().ToLowerInvariant();

    private static string NormalizeProtocolValue(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var normalized = value.Trim();
        return normalized.Any(char.IsControl) ? string.Empty : normalized;
    }

    private static string NormalizeRequestedByUsername(string? value)
    {
        var normalized = NormalizeProtocolValue(value);
        return normalized.Length == 0 ? "system" : normalized;
    }

    private static bool IsValidProtocolText(string? value)
    {
        var normalized = NormalizeProtocolValue(value);
        return normalized.Length > 0 && string.Equals(normalized, value, StringComparison.Ordinal);
    }

    private static void SetLifecycleControlFlags(NetworkTelemetryAgentStatusViewModel status)
    {
        if (!status.ControlAvailable)
        {
            status.CanStart = false;
            status.CanStop = false;
            status.CanRestart = false;
            return;
        }

        var processState = NormalizeStateValue(status.ProcessState, "unknown");
        var canStart = processState is "stopped" or "idle" or "exited" or "not-running" or "not_started" or "failed";
        var canStop = processState is "running" or "starting" or "busy" or "stopping" or "restarting";
        status.CanStart = canStart;
        status.CanStop = canStop;
        status.CanRestart = processState is not ("unknown" or "unavailable" or "mixed");
    }

    private async Task<NetworkTelemetryAgentStatus?> GetRawStatusAsync(string? campusKey, CancellationToken cancellationToken)
    {
        var statusPath = GetStatusPath(campusKey);
        if (!File.Exists(statusPath))
        {
            return null;
        }

        try
        {
            await using var stream = File.OpenRead(statusPath);
            return await JsonSerializer.DeserializeAsync<NetworkTelemetryAgentStatus>(stream, JsonOptions, cancellationToken);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (JsonException)
        {
            return null;
        }
        catch (IOException)
        {
            return null;
        }
        catch (UnauthorizedAccessException)
        {
            return null;
        }
    }

    private async Task<NetworkTelemetryAgentHeartbeat?> GetHeartbeatAsync(string? campusKey, CancellationToken cancellationToken)
    {
        var heartbeatPath = GetHeartbeatPath(campusKey);
        if (!File.Exists(heartbeatPath))
        {
            return null;
        }

        try
        {
            await using var stream = File.OpenRead(heartbeatPath);
            return await JsonSerializer.DeserializeAsync<NetworkTelemetryAgentHeartbeat>(stream, JsonOptions, cancellationToken);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (JsonException)
        {
            return null;
        }
        catch (IOException)
        {
            return null;
        }
        catch (UnauthorizedAccessException)
        {
            return null;
        }
    }

    private async Task SaveStatusAsync(string? campusKey, NetworkTelemetryAgentStatus status, CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(GetSharedPath(campusKey));
        await WriteJsonAtomicallyAsync(GetStatusPath(campusKey), status, cancellationToken);
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

    public static bool TryNormalizeControlAction(string? action, out string normalizedAction)
    {
        normalizedAction = action?.Trim().ToLowerInvariant() switch
        {
            "pause" => "pause",
            "resume" => "resume",
            "stop" => "stop",
            _ => string.Empty
        };

        return normalizedAction.Length > 0;
    }

    public static string NormalizeControlAction(string? action)
        => TryNormalizeControlAction(action, out var normalizedAction)
            ? normalizedAction
            : throw new ArgumentException("La accion de control debe ser pause, resume o stop.", nameof(action));

    public static NetworkTelemetryAgentLifecycleViewModel ToLifecycleViewModel(NetworkTelemetryAgentStatusViewModel status)
        => new()
        {
            AgentId = status.AgentId,
            MachineName = status.MachineName,
            SupervisorState = status.SupervisorState,
            ProcessState = status.ProcessState,
            DesiredState = status.DesiredState,
            WorkerProcessId = status.WorkerProcessId,
            WorkerStartedAtUtc = status.WorkerStartedAtUtc,
            WorkerStoppedAtUtc = status.WorkerStoppedAtUtc,
            SupervisorHeartbeatAtUtc = status.SupervisorHeartbeatAtUtc,
            SupervisorUpdatedAtUtc = status.SupervisorUpdatedAtUtc,
            LastCommandId = status.LastCommandId,
            LastCommand = status.LastCommand,
            LastCommandRequestedBy = status.LastCommandRequestedBy,
            LastCommandAtUtc = status.LastCommandAtUtc,
            LastError = status.LastError,
            Version = status.Version,
            IsSupervisorAvailable = status.IsSupervisorAvailable,
            CanStart = status.CanStart,
            CanStop = status.CanStop,
            CanRestart = status.CanRestart,
            ControlAvailable = status.ControlAvailable
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

    private sealed class LifecycleKeyReadResult
    {
        private LifecycleKeyReadResult(bool isAvailable, byte[]? key, string? error)
        {
            IsAvailable = isAvailable;
            Key = key;
            Error = error;
        }

        public bool IsAvailable { get; }
        public byte[]? Key { get; }
        public string? Error { get; }

        public static LifecycleKeyReadResult Available(byte[] key)
            => new(true, key, null);

        public static LifecycleKeyReadResult Unavailable(string error)
            => new(false, null, error);
    }

    private sealed class SupervisorStatusReadResult
    {
        private SupervisorStatusReadResult(bool exists, bool isValid, NetworkTelemetryAgentSupervisorStatus? status, string? error)
        {
            Exists = exists;
            IsValid = isValid;
            Status = status;
            Error = error;
        }

        public bool Exists { get; }
        public bool IsValid { get; }
        public NetworkTelemetryAgentSupervisorStatus? Status { get; }
        public string? Error { get; }

        public static SupervisorStatusReadResult Missing()
            => new(false, false, null, null);

        public static SupervisorStatusReadResult Valid(NetworkTelemetryAgentSupervisorStatus status)
            => new(true, true, status, null);

        public static SupervisorStatusReadResult Invalid(string error)
            => new(true, false, null, error);
    }

    private sealed class LifecycleCommandReadResult
    {
        private LifecycleCommandReadResult(bool exists, bool isValid, NetworkTelemetryAgentLifecycleCommand? command, string? error)
        {
            Exists = exists;
            IsValid = isValid;
            Command = command;
            Error = error;
        }

        public bool Exists { get; }
        public bool IsValid { get; }
        public NetworkTelemetryAgentLifecycleCommand? Command { get; }
        public string? Error { get; }

        public static LifecycleCommandReadResult Missing()
            => new(false, false, null, null);

        public static LifecycleCommandReadResult Valid(NetworkTelemetryAgentLifecycleCommand command)
            => new(true, true, command, null);

        public static LifecycleCommandReadResult Invalid(string error)
            => new(true, false, null, error);
    }
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

public class NetworkTelemetryAgentLifecycleViewModel
{
    public string AgentId { get; set; } = string.Empty;
    public string MachineName { get; set; } = string.Empty;
    public string SupervisorState { get; set; } = "unavailable";
    public string ProcessState { get; set; } = "unknown";
    public string DesiredState { get; set; } = "unknown";
    public int? WorkerProcessId { get; set; }
    public DateTime? WorkerStartedAtUtc { get; set; }
    public DateTime? WorkerStoppedAtUtc { get; set; }
    public DateTime? SupervisorHeartbeatAtUtc { get; set; }
    public DateTime? SupervisorUpdatedAtUtc { get; set; }
    public string LastCommandId { get; set; } = string.Empty;
    public string LastCommand { get; set; } = string.Empty;
    public string LastCommandRequestedBy { get; set; } = string.Empty;
    public DateTime? LastCommandAtUtc { get; set; }
    public string LastError { get; set; } = string.Empty;
    public string Version { get; set; } = string.Empty;
    public bool IsSupervisorAvailable { get; set; }
    public bool CanStart { get; set; }
    public bool CanStop { get; set; }
    public bool CanRestart { get; set; }
    public bool ControlAvailable { get; set; }
}

public class NetworkTelemetryAgentStatusViewModel : NetworkTelemetryAgentLifecycleViewModel
{
    public string RequestId { get; set; } = string.Empty;
    public string State { get; set; } = "idle";
    public string Message { get; set; } = string.Empty;
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
    public int ConnectedAgentCount { get; set; }
    public int AgentCount { get; set; }
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

public class NetworkTelemetryAgentLifecycleCommand
{
    public string RequestId { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string AgentId { get; set; } = string.Empty;
    public string CampusKey { get; set; } = string.Empty;
    public string RequestedByUsername { get; set; } = string.Empty;
    public DateTime RequestedAtUtc { get; set; }
    public DateTime ExpiresAtUtc { get; set; }
    public string Signature { get; set; } = string.Empty;
}

public class NetworkTelemetryAgentSupervisorStatus
{
    public string AgentId { get; set; } = string.Empty;
    public string MachineName { get; set; } = string.Empty;
    public string SupervisorState { get; set; } = "unknown";
    public string ProcessState { get; set; } = "unknown";
    public string DesiredState { get; set; } = "unknown";
    public int? WorkerProcessId { get; set; }
    public DateTime? WorkerStartedAtUtc { get; set; }
    public DateTime? WorkerStoppedAtUtc { get; set; }
    public DateTime? SupervisorHeartbeatAtUtc { get; set; }
    public DateTime? UpdatedAtUtc { get; set; }
    public string LastCommandId { get; set; } = string.Empty;
    public string LastCommand { get; set; } = string.Empty;
    public string LastCommandRequestedBy { get; set; } = string.Empty;
    public DateTime? LastCommandAtUtc { get; set; }
    public string LastError { get; set; } = string.Empty;
    public string Version { get; set; } = string.Empty;
}

public enum NetworkTelemetryAgentLifecycleFailure
{
    None,
    InvalidAction,
    KeyUnavailable,
    AgentUnavailable,
    PendingCommand,
    InvalidCommandFile,
    StorageUnavailable
}

public class NetworkTelemetryAgentLifecycleCommandResult
{
    public NetworkTelemetryAgentLifecycleCommand? Command { get; init; }
    public NetworkTelemetryAgentStatusViewModel Status { get; init; } = new();
    public NetworkTelemetryAgentLifecycleFailure Failure { get; init; }
    public string? Error { get; init; }
    public bool Succeeded => Command is not null && Failure == NetworkTelemetryAgentLifecycleFailure.None;
    public string? CommandId => Command?.RequestId;
}

public class NetworkTelemetryAgentLifecycleResponse
{
    public string CommandId { get; set; } = string.Empty;
    public NetworkTelemetryAgentLifecycleViewModel Lifecycle { get; set; } = new();
}
