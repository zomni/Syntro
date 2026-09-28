using System.Diagnostics;
using System.Globalization;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Syntro.NetworkCollector;

public static class AgentSupervisorProcessStates
{
    public const string Starting = "starting";
    public const string Running = "running";
    public const string Stopping = "stopping";
    public const string Stopped = "stopped";
    public const string Restarting = "restarting";
    public const string Failed = "failed";

    public static bool IsValid(string? value)
        => value is Starting or Running or Stopping or Stopped or Restarting or Failed;
}

public static class AgentSupervisorDesiredStates
{
    public const string Running = "running";
    public const string Stopped = "stopped";

    public static bool IsValid(string? value)
        => value is Running or Stopped;
}

public static class AgentSupervisorProtocol
{
    public const string KeyFileName = "agent-lifecycle.key";
    public const string CommandFileName = "agent-lifecycle-command.json";
    public const string StateFileName = "agent-supervisor-state.json";
    public const string StatusFileName = "agent-supervisor-status.json";
    public const string LogFileName = "agent-supervisor.log";
    public const int MaxRequestAgeSeconds = 30;
    public const int MaxFutureExpirySeconds = 120;
    public const int MaxCommandLifetimeSeconds = 60;
    public const int MaxKeyFileBytes = 16 * 1024;

    public static string NormalizeAction(string? action)
        => action?.Trim().ToLowerInvariant() ?? string.Empty;

    public static bool IsValidAction(string? action)
        => NormalizeAction(action) is "start" or "stop" or "restart";

    public static string BuildSignaturePayload(AgentLifecycleCommand command)
    {
        ArgumentNullException.ThrowIfNull(command);
        if (!command.RequestedAtUtc.HasValue || !command.ExpiresAtUtc.HasValue)
        {
            throw new InvalidOperationException("The command timestamps are required.");
        }

        return string.Join("\n", new[]
        {
            command.RequestId,
            command.Action,
            command.AgentId,
            command.CampusKey,
            command.RequestedByUsername,
            command.RequestedAtUtc.Value.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture),
            command.ExpiresAtUtc.Value.ToUniversalTime().ToString("O", CultureInfo.InvariantCulture)
        });
    }

    public static string ComputeSignature(AgentLifecycleCommand command, byte[] key)
    {
        ArgumentNullException.ThrowIfNull(key);
        var payload = Encoding.UTF8.GetBytes(BuildSignaturePayload(command));
        return Convert.ToBase64String(HMACSHA256.HashData(key, payload));
    }

    public static bool TryDecodeKey(string? encodedKey, out byte[] key, out string? error)
    {
        key = [];
        error = null;
        if (string.IsNullOrWhiteSpace(encodedKey))
        {
            error = "The lifecycle key is empty.";
            return false;
        }

        try
        {
            key = Convert.FromBase64String(encodedKey.Trim());
        }
        catch (FormatException)
        {
            error = "The lifecycle key is not valid Base64.";
            return false;
        }

        if (key.Length == 0)
        {
            error = "The lifecycle key is empty.";
            return false;
        }

        return true;
    }

    public static bool TryReadKeyFile(string path, out byte[] key, out string? error)
    {
        try
        {
            if (new FileInfo(path).Length > MaxKeyFileBytes)
            {
                key = [];
                error = "The lifecycle key file is too large.";
                return false;
            }

            return TryDecodeKey(File.ReadAllText(path, Encoding.UTF8), out key, out error);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            key = [];
            error = exception.Message;
            return false;
        }
    }

    public static bool TryValidate(
        AgentLifecycleCommand? command,
        byte[] key,
        string expectedAgentId,
        string expectedCampusKey,
        DateTime nowUtc,
        out string? error)
    {
        error = null;
        if (command is null)
        {
            error = "The command is empty.";
            return false;
        }

        if (key.Length == 0)
        {
            error = "The lifecycle key is empty.";
            return false;
        }

        if (string.IsNullOrWhiteSpace(command.RequestId) ||
            string.IsNullOrWhiteSpace(command.AgentId) ||
            string.IsNullOrWhiteSpace(command.CampusKey) ||
            string.IsNullOrWhiteSpace(command.RequestedByUsername) ||
            string.IsNullOrWhiteSpace(command.Signature) ||
            !command.RequestedAtUtc.HasValue ||
            !command.ExpiresAtUtc.HasValue)
        {
            error = "The command is missing a required field.";
            return false;
        }

        var normalizedAction = NormalizeAction(command.Action);
        if (!IsValidAction(command.Action) ||
            !string.Equals(command.Action, normalizedAction, StringComparison.Ordinal))
        {
            error = "The command action is invalid.";
            return false;
        }

        var requestedAtUtc = command.RequestedAtUtc.Value.ToUniversalTime();
        var expiresAtUtc = command.ExpiresAtUtc.Value.ToUniversalTime();
        var now = nowUtc.ToUniversalTime();

        if (requestedAtUtc < now.AddSeconds(-MaxRequestAgeSeconds))
        {
            error = "The command request timestamp is too old.";
            return false;
        }

        if (requestedAtUtc > now.AddSeconds(MaxRequestAgeSeconds))
        {
            error = "The command request timestamp is too far in the future.";
            return false;
        }

        if (expiresAtUtc <= now)
        {
            error = "The command has expired.";
            return false;
        }

        if (expiresAtUtc > now.AddSeconds(MaxFutureExpirySeconds))
        {
            error = "The command expiry is too far in the future.";
            return false;
        }

        if (expiresAtUtc <= requestedAtUtc)
        {
            error = "The command expiry must be after its request timestamp.";
            return false;
        }

        if (expiresAtUtc - requestedAtUtc > TimeSpan.FromSeconds(MaxCommandLifetimeSeconds))
        {
            error = "The command lifetime is too long.";
            return false;
        }

        if (!string.Equals(command.AgentId, expectedAgentId, StringComparison.Ordinal))
        {
            error = "The command agent does not match the configuration.";
            return false;
        }

        if (!string.Equals(command.CampusKey, expectedCampusKey, StringComparison.Ordinal))
        {
            error = "The command campus does not match the configuration.";
            return false;
        }

        byte[] providedSignature;
        try
        {
            providedSignature = Convert.FromBase64String(command.Signature.Trim());
        }
        catch (FormatException)
        {
            error = "The command signature is not valid Base64.";
            return false;
        }

        var expectedSignature = HMACSHA256.HashData(key, Encoding.UTF8.GetBytes(BuildSignaturePayload(command)));
        if (!CryptographicOperations.FixedTimeEquals(expectedSignature, providedSignature))
        {
            error = "The command signature is invalid.";
            return false;
        }

        return true;
    }

    public static AgentSupervisorPersistentState CreateInitialState()
    {
        return new AgentSupervisorPersistentState
        {
            DesiredState = AgentSupervisorDesiredStates.Running
        };
    }

    public static AgentSupervisorPersistentState ApplyCommand(
        AgentSupervisorPersistentState state,
        AgentLifecycleCommand command)
    {
        ArgumentNullException.ThrowIfNull(state);
        ArgumentNullException.ThrowIfNull(command);

        var action = NormalizeAction(command.Action);
        if (!IsValidAction(action))
        {
            throw new ArgumentException("The command action is invalid.", nameof(command));
        }

        return new AgentSupervisorPersistentState
        {
            DesiredState = action == "stop" ? AgentSupervisorDesiredStates.Stopped : AgentSupervisorDesiredStates.Running,
            LastCommandId = command.RequestId,
            LastCommand = action,
            LastCommandRequestedBy = command.RequestedByUsername,
            LastCommandAtUtc = command.RequestedAtUtc?.ToUniversalTime(),
            PendingAction = action,
            RestartAttempt = 0,
            NextRestartAtUtc = null,
            UpdatedAtUtc = DateTime.UtcNow
        };
    }
}

public sealed class AgentLifecycleCommand
{
    public string RequestId { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string AgentId { get; set; } = string.Empty;
    public string CampusKey { get; set; } = string.Empty;
    public string RequestedByUsername { get; set; } = string.Empty;
    public DateTime? RequestedAtUtc { get; set; }
    public DateTime? ExpiresAtUtc { get; set; }
    public string Signature { get; set; } = string.Empty;
}

public sealed class AgentSupervisorPersistentState
{
    public string DesiredState { get; set; } = AgentSupervisorDesiredStates.Running;
    public string? LastCommandId { get; set; }
    public string? LastCommand { get; set; }
    public string? LastCommandRequestedBy { get; set; }
    public DateTime? LastCommandAtUtc { get; set; }
    public string? PendingAction { get; set; }
    public int RestartAttempt { get; set; }
    public DateTime? NextRestartAtUtc { get; set; }
    public DateTime? UpdatedAtUtc { get; set; }
}

public sealed class AgentSupervisorStatus
{
    public string AgentId { get; set; } = string.Empty;
    public string MachineName { get; set; } = string.Empty;
    public string SupervisorState { get; set; } = "running";
    public string ProcessState { get; set; } = AgentSupervisorProcessStates.Stopped;
    public string DesiredState { get; set; } = AgentSupervisorDesiredStates.Running;
    public int? WorkerProcessId { get; set; }
    public DateTime? WorkerStartedAtUtc { get; set; }
    public DateTime? WorkerStoppedAtUtc { get; set; }
    public DateTime? SupervisorHeartbeatAtUtc { get; set; }
    public DateTime? UpdatedAtUtc { get; set; }
    public string? LastCommandId { get; set; }
    public string? LastCommand { get; set; }
    public string? LastCommandRequestedBy { get; set; }
    public DateTime? LastCommandAtUtc { get; set; }
    public string? LastError { get; set; }
    public string Version { get; set; } = string.Empty;
}

internal static class AgentSupervisorJson
{
    public static readonly JsonSerializerOptions State = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = true
    };

    public static readonly JsonSerializerOptions Status = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.Never,
        WriteIndented = true
    };
}

internal static class AgentSupervisorFileStore
{
    public static T? ReadJson<T>(string path)
    {
        if (!File.Exists(path))
        {
            return default;
        }

        var json = File.ReadAllText(path, Encoding.UTF8);
        return JsonSerializer.Deserialize<T>(json, AgentSupervisorJson.State);
    }

    public static async Task WriteJsonAtomicAsync<T>(
        string path,
        T value,
        JsonSerializerOptions serializerOptions,
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
            var json = JsonSerializer.Serialize(value, serializerOptions);
            await using (var stream = new FileStream(
                temporaryPath,
                FileMode.CreateNew,
                FileAccess.Write,
                FileShare.None,
                4096,
                FileOptions.WriteThrough))
            await using (var writer = new StreamWriter(stream, new UTF8Encoding(false), 4096, leaveOpen: true))
            {
                await writer.WriteAsync(json.AsMemory(), cancellationToken);
                await writer.FlushAsync(cancellationToken);
                stream.Flush(flushToDisk: true);
            }

            File.Move(temporaryPath, path, overwrite: true);
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
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
            {
            }
        }
    }

    public static async Task<bool> RemoveIfUnchangedAsync(string path, string expectedContent, CancellationToken cancellationToken)
    {
        if (!File.Exists(path))
        {
            return true;
        }

        string currentContent;
        try
        {
            currentContent = await File.ReadAllTextAsync(path, cancellationToken);
        }
        catch (IOException)
        {
            return false;
        }

        if (!string.Equals(currentContent, expectedContent, StringComparison.Ordinal))
        {
            return false;
        }

        File.Delete(path);
        return true;
    }
}

internal sealed class AgentSupervisor
{
    private static readonly TimeSpan ProcessStopTimeout = TimeSpan.FromSeconds(5);
    private static readonly TimeSpan[] RestartBackoff =
    [
        TimeSpan.FromSeconds(5),
        TimeSpan.FromSeconds(15),
        TimeSpan.FromSeconds(30)
    ];

    private readonly object _logGate = new();
    private readonly string _configPath;
    private readonly string _sharedPath;
    private readonly string _keyPath;
    private readonly string _commandPath;
    private readonly string _statePath;
    private readonly string _statusPath;
    private readonly string _logPath;
    private readonly string _configuredCampusKey;
    private readonly string _agentId;
    private readonly int _pollIntervalSeconds;
    private AgentSupervisorPersistentState _state;
    private Process? _worker;
    private string _processState = AgentSupervisorProcessStates.Stopped;
    private string _supervisorState = "running";
    private string _lastError = string.Empty;
    private DateTime? _workerStartedAtUtc;
    private DateTime? _workerStoppedAtUtc;
    private bool _expectedWorkerExit;

    public AgentSupervisor(CollectorOptions options, string configPath)
    {
        _configPath = Path.GetFullPath(configPath);
        _sharedPath = ResolveSharedPath(options);
        _keyPath = Path.Combine(_sharedPath, AgentSupervisorProtocol.KeyFileName);
        _commandPath = Path.Combine(_sharedPath, AgentSupervisorProtocol.CommandFileName);
        _statePath = Path.Combine(_sharedPath, AgentSupervisorProtocol.StateFileName);
        _statusPath = Path.Combine(_sharedPath, AgentSupervisorProtocol.StatusFileName);
        _logPath = Path.Combine(_sharedPath, AgentSupervisorProtocol.LogFileName);
        _configuredCampusKey = ResolveConfiguredCampusKey(options, _sharedPath);
        _agentId = options.AgentId.Trim();
        _pollIntervalSeconds = Math.Max(1, options.PollIntervalSeconds);
        _state = AgentSupervisorProtocol.CreateInitialState();
    }

    public async Task RunAsync(CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(_sharedPath);
        _state = LoadState();
        _workerStartedAtUtc = null;
        _workerStoppedAtUtc = null;
        _processState = _state.DesiredState == AgentSupervisorDesiredStates.Running
            ? AgentSupervisorProcessStates.Starting
            : AgentSupervisorProcessStates.Stopped;
        _supervisorState = "running";

        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                var now = DateTime.UtcNow;
                await ProcessCommandFileAsync(now, cancellationToken);
                await DetectUnexpectedWorkerExitAsync(now);
                await ReconcileAsync(now);
                await WriteStatusAsync(DateTime.UtcNow, cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                SetError($"Supervisor poll failed: {exception.Message}");
                try
                {
                    await WriteStatusAsync(DateTime.UtcNow, cancellationToken);
                }
                catch (Exception statusException)
                {
                    AppendLog($"Status write failed: {statusException.Message}");
                }
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(_pollIntervalSeconds), cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                break;
            }
        }

        _supervisorState = "stopping";
        for (var attempt = 0; attempt < 3 && _worker is not null; attempt++)
        {
            if (await StopWorkerAsync(DateTime.UtcNow))
            {
                break;
            }
        }

        _supervisorState = "stopped";
        await SaveStateSafelyAsync(CancellationToken.None);
        try
        {
            await WriteStatusAsync(DateTime.UtcNow, CancellationToken.None);
        }
        catch (Exception exception)
        {
            AppendLog($"Final status write failed: {exception.Message}");
        }
    }

    private static string ResolveSharedPath(CollectorOptions options)
    {
        if (string.IsNullOrWhiteSpace(options.SharedPath))
        {
            return Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "runtime", "network-telemetry-agent"));
        }

        var basePath = !string.IsNullOrWhiteSpace(options.ConfigurationDirectory)
            ? options.ConfigurationDirectory
            : AppContext.BaseDirectory;
        return Path.GetFullPath(options.SharedPath, basePath);
    }

    private static string ResolveConfiguredCampusKey(CollectorOptions options, string sharedPath)
    {
        if (!string.IsNullOrWhiteSpace(options.CampusKey))
        {
            return options.CampusKey.Trim();
        }

        var trimmedPath = sharedPath.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        return Path.GetFileName(trimmedPath);
    }

    private AgentSupervisorPersistentState LoadState()
    {
        try
        {
            var state = AgentSupervisorFileStore.ReadJson<AgentSupervisorPersistentState>(_statePath);
            if (state is null)
            {
                return AgentSupervisorProtocol.CreateInitialState();
            }

            if (!AgentSupervisorDesiredStates.IsValid(state.DesiredState))
            {
                state.DesiredState = AgentSupervisorDesiredStates.Running;
            }

            if (state.PendingAction is not null && !AgentSupervisorProtocol.IsValidAction(state.PendingAction))
            {
                state.PendingAction = null;
            }

            state.RestartAttempt = Math.Clamp(state.RestartAttempt, 0, RestartBackoff.Length);
            return state;
        }
        catch (Exception exception)
        {
            AppendLog($"State load failed; using initial state: {exception.Message}");
            return AgentSupervisorProtocol.CreateInitialState();
        }
    }

    private async Task ProcessCommandFileAsync(DateTime nowUtc, CancellationToken cancellationToken)
    {
        if (!File.Exists(_commandPath))
        {
            return;
        }

        string rawCommand;
        try
        {
            rawCommand = await File.ReadAllTextAsync(_commandPath, cancellationToken);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            AppendLog($"Lifecycle command read deferred: {exception.Message}");
            return;
        }

        AgentLifecycleCommand? command;
        try
        {
            command = JsonSerializer.Deserialize<AgentLifecycleCommand>(rawCommand, AgentSupervisorJson.State);
        }
        catch (JsonException exception)
        {
            await ArchiveInvalidCommandAsync(rawCommand, $"Invalid JSON: {exception.Message}", cancellationToken);
            return;
        }

        if (!AgentSupervisorProtocol.TryReadKeyFile(_keyPath, out var key, out var keyError))
        {
            await ArchiveInvalidCommandAsync(rawCommand, $"Lifecycle key unavailable: {keyError}", cancellationToken);
            return;
        }

        bool validCommand;
        string? validationError;
        try
        {
            validCommand = AgentSupervisorProtocol.TryValidate(
                command,
                key,
                _agentId,
                _configuredCampusKey,
                nowUtc,
                out validationError);
        }
        finally
        {
            Array.Clear(key);
        }

        if (!validCommand)
        {
            await ArchiveInvalidCommandAsync(rawCommand, validationError ?? "Invalid command.", cancellationToken);
            return;
        }

        if (string.Equals(_state.LastCommandId, command!.RequestId, StringComparison.Ordinal))
        {
            await AgentSupervisorFileStore.RemoveIfUnchangedAsync(_commandPath, rawCommand, cancellationToken);
            return;
        }

        var nextState = AgentSupervisorProtocol.ApplyCommand(_state, command);
        await AgentSupervisorFileStore.WriteJsonAtomicAsync(_statePath, nextState, AgentSupervisorJson.State, cancellationToken);
        _state = nextState;
        _lastError = string.Empty;
        await AgentSupervisorFileStore.RemoveIfUnchangedAsync(_commandPath, rawCommand, cancellationToken);
        AppendLog($"Lifecycle command accepted. RequestId={command.RequestId} Action={AgentSupervisorProtocol.NormalizeAction(command.Action)}");
    }

    private async Task ReconcileAsync(DateTime nowUtc)
    {
        if (_state.DesiredState == AgentSupervisorDesiredStates.Stopped)
        {
            if (IsWorkerAlive())
            {
                _processState = AgentSupervisorProcessStates.Stopping;
                if (!await StopWorkerAsync(nowUtc))
                {
                    return;
                }
            }
            else
            {
                _processState = AgentSupervisorProcessStates.Stopped;
            }

            if (_state.PendingAction is not null)
            {
                _state.PendingAction = null;
                _state.NextRestartAtUtc = null;
                await SaveStateAsync(CancellationToken.None);
            }

            return;
        }

        if (string.Equals(_state.PendingAction, "restart", StringComparison.OrdinalIgnoreCase))
        {
            if (IsWorkerAlive())
            {
                _processState = AgentSupervisorProcessStates.Stopping;
                if (!await StopWorkerAsync(nowUtc))
                {
                    return;
                }
            }

            _state.PendingAction = "start";
            await SaveStateAsync(CancellationToken.None);
        }

        if (IsWorkerAlive())
        {
            _processState = AgentSupervisorProcessStates.Running;
            if (_state.PendingAction is not null)
            {
                _state.PendingAction = null;
                await SaveStateAsync(CancellationToken.None);
            }

            _lastError = string.Empty;
            return;
        }

        if (_state.NextRestartAtUtc.HasValue && _state.NextRestartAtUtc.Value.ToUniversalTime() > nowUtc)
        {
            _processState = AgentSupervisorProcessStates.Restarting;
            return;
        }

        if (_state.RestartAttempt >= RestartBackoff.Length && _state.PendingAction is null)
        {
            _processState = AgentSupervisorProcessStates.Failed;
            return;
        }

        await StartWorkerAsync(nowUtc);
    }

    private async Task StartWorkerAsync(DateTime nowUtc)
    {
        _processState = AgentSupervisorProcessStates.Starting;
        Process? process = null;
        try
        {
            var startInfo = CreateWorkerStartInfo();
            process = Process.Start(startInfo);
            if (process is null)
            {
                throw new InvalidOperationException("The worker process could not be started.");
            }

            _worker = process;
            _workerStartedAtUtc = nowUtc;
            _expectedWorkerExit = false;
            process.OutputDataReceived += (_, args) =>
            {
                if (args.Data is not null)
                {
                    AppendLog($"worker stdout: {args.Data}");
                }
            };
            process.ErrorDataReceived += (_, args) =>
            {
                if (args.Data is not null)
                {
                    AppendLog($"worker stderr: {args.Data}");
                }
            };
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            _state.PendingAction = null;
            _state.NextRestartAtUtc = null;
            _processState = AgentSupervisorProcessStates.Running;
            _lastError = string.Empty;
            await SaveStateAsync(CancellationToken.None);
            AppendLog($"Worker started. ProcessId={process.Id}");
        }
        catch (Exception exception)
        {
            if (process is not null)
            {
                try
                {
                    if (!HasExited(process))
                    {
                        process.Kill(entireProcessTree: true);
                    }

                    await process.WaitForExitAsync().WaitAsync(ProcessStopTimeout);
                }
                catch (Exception stopException)
                {
                    AppendLog($"Worker cleanup after start failure: {stopException.Message}");
                }
                finally
                {
                    process.Dispose();
                }
            }

            if (ReferenceEquals(_worker, process))
            {
                _worker = null;
            }

            _workerStartedAtUtc = null;
            _state.PendingAction = null;
            _state.NextRestartAtUtc = null;
            _processState = AgentSupervisorProcessStates.Failed;
            SetError($"Worker start failed: {exception.Message}");
            await SaveStateAsync(CancellationToken.None);
        }
    }

    private ProcessStartInfo CreateWorkerStartInfo()
    {
        var processPath = Environment.ProcessPath;
        if (string.IsNullOrWhiteSpace(processPath))
        {
            throw new InvalidOperationException("The current process path could not be resolved.");
        }

        var startInfo = new ProcessStartInfo
        {
            FileName = processPath,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
            WorkingDirectory = Path.GetDirectoryName(_configPath) ?? AppContext.BaseDirectory
        };

        if (string.Equals(Path.GetFileNameWithoutExtension(processPath), "dotnet", StringComparison.OrdinalIgnoreCase))
        {
            var assemblyPath = Assembly.GetEntryAssembly()?.Location;
            if (string.IsNullOrWhiteSpace(assemblyPath))
            {
                throw new InvalidOperationException("The collector assembly path could not be resolved.");
            }

            startInfo.ArgumentList.Add(assemblyPath);
        }

        startInfo.ArgumentList.Add("--watch");
        startInfo.ArgumentList.Add("--config");
        startInfo.ArgumentList.Add(_configPath);
        return startInfo;
    }

    private async Task<bool> StopWorkerAsync(DateTime nowUtc)
    {
        var process = _worker;
        if (process is null)
        {
            _processState = AgentSupervisorProcessStates.Stopped;
            return true;
        }

        _expectedWorkerExit = true;
        _processState = AgentSupervisorProcessStates.Stopping;
        try
        {
            if (!HasExited(process))
            {
                process.Kill(entireProcessTree: true);
            }

            var waitTask = process.WaitForExitAsync();
            if (await Task.WhenAny(waitTask, Task.Delay(ProcessStopTimeout)) != waitTask)
            {
                if (!HasExited(process))
                {
                    process.Kill(entireProcessTree: true);
                }

                await waitTask.WaitAsync(ProcessStopTimeout);
            }

            await waitTask;
            _worker = null;
            process.Dispose();
            _workerStoppedAtUtc = nowUtc;
            _expectedWorkerExit = false;
            _processState = AgentSupervisorProcessStates.Stopped;
            AppendLog("Worker stopped.");
            return true;
        }
        catch (Exception exception)
        {
            SetError($"Worker stop failed: {exception.Message}");
            if (HasExited(process))
            {
                _worker = null;
                process.Dispose();
                _workerStoppedAtUtc = nowUtc;
                _expectedWorkerExit = false;
                _processState = AgentSupervisorProcessStates.Stopped;
                return true;
            }
            else
            {
                _processState = AgentSupervisorProcessStates.Stopping;
            }

            return false;
        }
    }

    private async Task DetectUnexpectedWorkerExitAsync(DateTime nowUtc)
    {
        var process = _worker;
        if (process is null || !HasExited(process))
        {
            return;
        }

        var exitCode = TryReadExitCode(process);
        var wasExpectedExit = _expectedWorkerExit;
        process.Dispose();
        _worker = null;
        _workerStoppedAtUtc = nowUtc;
        _expectedWorkerExit = false;
        AppendLog($"Worker exited. ExitCode={exitCode}");

        if (wasExpectedExit)
        {
            _processState = _state.DesiredState == AgentSupervisorDesiredStates.Stopped
                ? AgentSupervisorProcessStates.Stopped
                : AgentSupervisorProcessStates.Starting;
            return;
        }

        if (_state.DesiredState == AgentSupervisorDesiredStates.Stopped)
        {
            _processState = AgentSupervisorProcessStates.Stopped;
            return;
        }

        if (string.Equals(_state.PendingAction, "restart", StringComparison.OrdinalIgnoreCase))
        {
            _state.PendingAction = "start";
            _processState = AgentSupervisorProcessStates.Starting;
            await SaveStateSafelyAsync(CancellationToken.None);
            return;
        }

        await ScheduleAutomaticRestartAsync(nowUtc);
    }

    private async Task ScheduleAutomaticRestartAsync(DateTime nowUtc)
    {
        if (_state.RestartAttempt < RestartBackoff.Length)
        {
            var delay = RestartBackoff[_state.RestartAttempt];
            _state.RestartAttempt++;
            _state.NextRestartAtUtc = nowUtc.Add(delay);
            _state.PendingAction = null;
            _processState = AgentSupervisorProcessStates.Restarting;
            SetError($"Worker exited unexpectedly; restart attempt {_state.RestartAttempt} scheduled in {delay.TotalSeconds:0} seconds.");
            await SaveStateSafelyAsync(CancellationToken.None);
            return;
        }

        _state.NextRestartAtUtc = null;
        _state.PendingAction = null;
        _processState = AgentSupervisorProcessStates.Failed;
        SetError("Worker restart limit reached; manual start or restart is required.");
        await SaveStateSafelyAsync(CancellationToken.None);
    }

    private bool IsWorkerAlive()
    {
        return _worker is not null && !HasExited(_worker);
    }

    private static bool HasExited(Process process)
    {
        try
        {
            return process.HasExited;
        }
        catch
        {
            return true;
        }
    }

    private static int TryReadExitCode(Process process)
    {
        try
        {
            return process.ExitCode;
        }
        catch
        {
            return -1;
        }
    }

    private async Task WriteStatusAsync(DateTime nowUtc, CancellationToken cancellationToken)
    {
        var status = new AgentSupervisorStatus
        {
            AgentId = _agentId,
            MachineName = Environment.MachineName,
            SupervisorState = _supervisorState,
            ProcessState = _processState,
            DesiredState = _state.DesiredState,
            WorkerProcessId = IsWorkerAlive() && _worker is not null ? _worker.Id : null,
            WorkerStartedAtUtc = _workerStartedAtUtc,
            WorkerStoppedAtUtc = _workerStoppedAtUtc,
            SupervisorHeartbeatAtUtc = nowUtc,
            UpdatedAtUtc = nowUtc,
            LastCommandId = _state.LastCommandId,
            LastCommand = _state.LastCommand,
            LastCommandRequestedBy = _state.LastCommandRequestedBy,
            LastCommandAtUtc = _state.LastCommandAtUtc,
            LastError = string.IsNullOrWhiteSpace(_lastError) ? null : _lastError,
            Version = typeof(AgentSupervisor).Assembly.GetName().Version?.ToString() ?? "1.0.0"
        };

        await AgentSupervisorFileStore.WriteJsonAtomicAsync(_statusPath, status, AgentSupervisorJson.Status, cancellationToken);
    }

    private async Task SaveStateAsync(CancellationToken cancellationToken)
    {
        _state.UpdatedAtUtc = DateTime.UtcNow;
        await AgentSupervisorFileStore.WriteJsonAtomicAsync(_statePath, _state, AgentSupervisorJson.State, cancellationToken);
    }

    private async Task SaveStateSafelyAsync(CancellationToken cancellationToken)
    {
        try
        {
            await SaveStateAsync(cancellationToken);
        }
        catch (Exception exception)
        {
            SetError($"State write failed: {exception.Message}");
        }
    }

    private void SetError(string error)
    {
        _lastError = error;
        AppendLog(error);
    }

    private void AppendLog(string message)
    {
        var line = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss.fff} | {message}{Environment.NewLine}";
        lock (_logGate)
        {
            try
            {
                Directory.CreateDirectory(_sharedPath);
                File.AppendAllText(_logPath, line, Encoding.UTF8);
            }
            catch
            {
            }
        }
    }

    private async Task ArchiveInvalidCommandAsync(string rawCommand, string reason, CancellationToken cancellationToken)
    {
        SetError($"Invalid lifecycle command: {reason}");
        try
        {
            var archiveDirectory = Path.Combine(_sharedPath, "agent-lifecycle-archive");
            Directory.CreateDirectory(archiveDirectory);
            var archivePath = Path.Combine(
                archiveDirectory,
                $"invalid-{DateTime.UtcNow:yyyyMMddHHmmssfff}-{Guid.NewGuid():N}.json");
            var archive = JsonSerializer.Serialize(new
            {
                archivedAtUtc = DateTime.UtcNow,
                reason,
                command = rawCommand
            }, AgentSupervisorJson.Status);
            await File.WriteAllTextAsync(archivePath, archive, new UTF8Encoding(false), cancellationToken);
        }
        catch (Exception exception)
        {
            AppendLog($"Invalid command archive failed: {exception.Message}");
        }

        try
        {
            await AgentSupervisorFileStore.RemoveIfUnchangedAsync(_commandPath, rawCommand, cancellationToken);
        }
        catch (Exception exception)
        {
            AppendLog($"Invalid command removal failed: {exception.Message}");
        }
    }
}
