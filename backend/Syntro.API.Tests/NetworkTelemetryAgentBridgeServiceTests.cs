using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.FileProviders;
using Syntro.API.Services;

namespace Syntro.API.Tests;

public sealed class NetworkTelemetryAgentBridgeServiceTests : IDisposable
{
    private readonly string _rootPath = Path.Combine(Path.GetTempPath(), "syntro-agent-tests", Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        if (Directory.Exists(_rootPath))
        {
            Directory.Delete(_rootPath, recursive: true);
        }
    }

    [Fact]
    public void CreateLifecycleSignature_UsesCanonicalUtf8Payload()
    {
        var key = Encoding.UTF8.GetBytes("test-lifecycle-key");
        var command = new NetworkTelemetryAgentLifecycleCommand
        {
            RequestId = "request-1",
            Action = "restart",
            AgentId = "agent-1",
            CampusKey = "sotero",
            RequestedByUsername = "admin",
            RequestedAtUtc = new DateTime(2026, 1, 2, 3, 4, 5, 123, DateTimeKind.Utc),
            ExpiresAtUtc = new DateTime(2026, 1, 2, 3, 5, 5, 123, DateTimeKind.Utc)
        };
        var payload = "request-1\nrestart\nagent-1\nsotero\nadmin\n2026-01-02T03:04:05.1230000Z\n2026-01-02T03:05:05.1230000Z";
        using var hmac = new HMACSHA256(key);
        var expected = Convert.ToBase64String(hmac.ComputeHash(Encoding.UTF8.GetBytes(payload)));

        Assert.Equal(payload, NetworkTelemetryAgentBridgeService.BuildLifecycleSignaturePayload(command));
        Assert.Equal(expected, NetworkTelemetryAgentBridgeService.CreateLifecycleSignature(key, command));
    }

    [Fact]
    public async Task QueueLifecycleCommandAsync_WritesSignedCommandWithSixtySecondExpiry()
    {
        var service = CreateService();
        var campusPath = service.GetSharedPath("sotero");
        Directory.CreateDirectory(campusPath);
        var key = Encoding.UTF8.GetBytes("test-lifecycle-key");
        await File.WriteAllTextAsync(service.GetLifecycleKeyPath("sotero"), Convert.ToBase64String(key));

        var before = DateTime.UtcNow;
        var result = await service.QueueLifecycleCommandAsync("admin", " START ", "sotero", "agent-1");

        Assert.True(result.Succeeded);
        Assert.NotNull(result.Command);
        var command = result.Command!;
        Assert.Equal("start", command.Action);
        Assert.Equal("agent-1", command.AgentId);
        Assert.Equal("sotero", command.CampusKey);
        Assert.Equal("running", result.Status.DesiredState);
        Assert.InRange(command.ExpiresAtUtc, before.AddSeconds(59), DateTime.UtcNow.AddSeconds(61));
        Assert.Equal(
            NetworkTelemetryAgentBridgeService.CreateLifecycleSignature(key, command),
            command.Signature);

        var persisted = await File.ReadAllTextAsync(service.GetLifecycleCommandPath("sotero"));
        var persistedCommand = JsonSerializer.Deserialize<NetworkTelemetryAgentLifecycleCommand>(
            persisted,
            new JsonSerializerOptions(JsonSerializerDefaults.Web));
        Assert.NotNull(persistedCommand);
        Assert.Equal(command.RequestId, persistedCommand!.RequestId);
        Assert.Empty(Directory.GetFiles(campusPath, "*.tmp"));
    }

    [Fact]
    public void ControlActions_AreStrictlyNormalized()
    {
        Assert.Equal("pause", NetworkTelemetryAgentBridgeService.NormalizeControlAction(" PaUsE "));
        Assert.Equal("resume", NetworkTelemetryAgentBridgeService.NormalizeControlAction("resume"));
        Assert.Equal("stop", NetworkTelemetryAgentBridgeService.NormalizeControlAction("STOP"));
        Assert.Throws<ArgumentException>(() => NetworkTelemetryAgentBridgeService.NormalizeControlAction("start"));
        Assert.False(NetworkTelemetryAgentBridgeService.TryNormalizeControlAction("unknown", out _));

        Assert.Equal("start", NetworkTelemetryAgentBridgeService.NormalizeLifecycleAction("start"));
        Assert.Equal("stop", NetworkTelemetryAgentBridgeService.NormalizeLifecycleAction(" STOP "));
        Assert.Equal("restart", NetworkTelemetryAgentBridgeService.NormalizeLifecycleAction("ReStArT"));
        Assert.Throws<ArgumentException>(() => NetworkTelemetryAgentBridgeService.NormalizeLifecycleAction("pause"));
    }

    [Fact]
    public async Task MissingLifecycleKey_DisablesControlAndDoesNotCreateCommand()
    {
        var service = CreateService();
        var campusPath = service.GetSharedPath("sotero");
        Directory.CreateDirectory(campusPath);

        var result = await service.QueueLifecycleCommandAsync("admin", "start", "sotero", "agent-1");
        var status = await service.GetStatusAsync("sotero");

        Assert.False(result.Succeeded);
        Assert.Equal(NetworkTelemetryAgentLifecycleFailure.KeyUnavailable, result.Failure);
        Assert.Contains("agent-lifecycle.key", result.Error);
        Assert.False(status.ControlAvailable);
        Assert.False(status.IsSupervisorAvailable);
        Assert.False(status.CanStart);
        Assert.False(status.CanStop);
        Assert.False(status.CanRestart);
        Assert.False(File.Exists(service.GetLifecycleCommandPath("sotero")));
    }

    [Fact]
    public async Task GetStatusAsync_MapsFreshSupervisorAndDoesNotFakeWorkerHeartbeat()
    {
        var service = CreateService();
        var campusPath = service.GetSharedPath("sotero");
        Directory.CreateDirectory(campusPath);
        await File.WriteAllTextAsync(
            service.GetLifecycleKeyPath("sotero"),
            Convert.ToBase64String(Encoding.UTF8.GetBytes("test-lifecycle-key")));
        var now = DateTime.UtcNow;
        await File.WriteAllTextAsync(
            service.GetSupervisorStatusPath("sotero"),
            JsonSerializer.Serialize(new NetworkTelemetryAgentSupervisorStatus
            {
                AgentId = "agent-1",
                MachineName = "campus-host",
                SupervisorState = "running",
                ProcessState = "running",
                DesiredState = "running",
                WorkerProcessId = 4321,
                WorkerStartedAtUtc = now.AddMinutes(-5),
                SupervisorHeartbeatAtUtc = now,
                UpdatedAtUtc = now,
                LastCommandId = "command-1",
                LastCommand = "start",
                LastCommandRequestedBy = "admin",
                LastCommandAtUtc = now.AddMinutes(-1),
                Version = "2.0"
            }, new JsonSerializerOptions(JsonSerializerDefaults.Web)));

        var status = await service.GetStatusAsync("sotero");

        Assert.True(status.IsSupervisorAvailable);
        Assert.True(status.ControlAvailable);
        Assert.Equal("agent-1", status.AgentId);
        Assert.Equal("campus-host", status.MachineName);
        Assert.Equal("running", status.ProcessState);
        Assert.Equal(4321, status.WorkerProcessId);
        Assert.Equal("command-1", status.LastCommandId);
        Assert.Equal("start", status.LastCommand);
        Assert.True(status.CanStop);
        Assert.False(status.CanStart);
        Assert.Null(status.LastHeartbeatAtUtc);
        Assert.False(status.IsConnected);
    }

    [Fact]
    public async Task GetStatusAsync_FailedSupervisorProcessCanBeStarted()
    {
        var service = CreateService();
        var campusPath = service.GetSharedPath("sotero");
        Directory.CreateDirectory(campusPath);
        await File.WriteAllTextAsync(
            service.GetLifecycleKeyPath("sotero"),
            Convert.ToBase64String(Encoding.UTF8.GetBytes("test-lifecycle-key")));
        var now = DateTime.UtcNow;
        await File.WriteAllTextAsync(
            service.GetSupervisorStatusPath("sotero"),
            JsonSerializer.Serialize(new NetworkTelemetryAgentSupervisorStatus
            {
                AgentId = "agent-1",
                SupervisorState = "running",
                ProcessState = "failed",
                DesiredState = "running",
                SupervisorHeartbeatAtUtc = now,
                UpdatedAtUtc = now,
                LastError = "Worker start failed."
            }, new JsonSerializerOptions(JsonSerializerDefaults.Web)));

        var status = await service.GetStatusAsync("sotero");

        Assert.True(status.IsSupervisorAvailable);
        Assert.True(status.ControlAvailable);
        Assert.True(status.CanStart);
        Assert.True(status.CanRestart);
        Assert.False(status.CanStop);
        Assert.Equal("failed", status.ProcessState);
    }

    [Fact]
    public async Task GetStatusAsync_FutureSupervisorHeartbeatIsNotFresh()
    {
        var service = CreateService(supervisorTimeoutSeconds: 1);
        var campusPath = service.GetSharedPath("sotero");
        Directory.CreateDirectory(campusPath);
        await File.WriteAllTextAsync(
            service.GetLifecycleKeyPath("sotero"),
            Convert.ToBase64String(Encoding.UTF8.GetBytes("test-lifecycle-key")));
        await File.WriteAllTextAsync(
            service.GetSupervisorStatusPath("sotero"),
            JsonSerializer.Serialize(new NetworkTelemetryAgentSupervisorStatus
            {
                AgentId = "agent-1",
                SupervisorState = "running",
                ProcessState = "stopped",
                DesiredState = "stopped",
                SupervisorHeartbeatAtUtc = DateTime.UtcNow.AddMinutes(5),
                UpdatedAtUtc = DateTime.UtcNow
            }, new JsonSerializerOptions(JsonSerializerDefaults.Web)));

        var status = await service.GetStatusAsync("sotero");

        Assert.False(status.IsSupervisorAvailable);
        Assert.False(status.ControlAvailable);
        Assert.False(status.CanStart);
        Assert.Contains("stale", status.LastError, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task GetStatusAsync_ReportsUnreadableSupervisorStatus()
    {
        var service = CreateService();
        var campusPath = service.GetSharedPath("sotero");
        Directory.CreateDirectory(campusPath);
        await File.WriteAllTextAsync(service.GetSupervisorStatusPath("sotero"), "{");

        var status = await service.GetStatusAsync("sotero");

        Assert.False(status.IsSupervisorAvailable);
        Assert.False(status.ControlAvailable);
        Assert.Contains("unreadable", status.LastError, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task QueueLifecycleCommandAsync_RejectsTamperedPendingCommand()
    {
        var service = CreateService();
        var campusPath = service.GetSharedPath("sotero");
        Directory.CreateDirectory(campusPath);
        var key = Encoding.UTF8.GetBytes("test-lifecycle-key");
        await File.WriteAllTextAsync(service.GetLifecycleKeyPath("sotero"), Convert.ToBase64String(key));
        var now = DateTime.UtcNow;
        var command = new NetworkTelemetryAgentLifecycleCommand
        {
            RequestId = "pending-command",
            Action = "start",
            AgentId = "agent-1",
            CampusKey = "sotero",
            RequestedByUsername = "admin",
            RequestedAtUtc = now,
            ExpiresAtUtc = now.AddSeconds(30),
            Signature = Convert.ToBase64String(new byte[32])
        };
        await File.WriteAllTextAsync(
            service.GetLifecycleCommandPath("sotero"),
            JsonSerializer.Serialize(command, new JsonSerializerOptions(JsonSerializerDefaults.Web)));

        var result = await service.QueueLifecycleCommandAsync("admin", "stop", "sotero", "agent-1");

        Assert.False(result.Succeeded);
        Assert.Equal(NetworkTelemetryAgentLifecycleFailure.InvalidCommandFile, result.Failure);
        Assert.True(File.Exists(service.GetLifecycleCommandPath("sotero")));
    }

    [Fact]
    public async Task GetStatusAsync_StaleSupervisorDisablesLifecycleWithoutRefreshingWorkerHeartbeat()
    {
        var service = CreateService(supervisorTimeoutSeconds: 1);
        var campusPath = service.GetSharedPath("sotero");
        Directory.CreateDirectory(campusPath);
        await File.WriteAllTextAsync(
            service.GetLifecycleKeyPath("sotero"),
            Convert.ToBase64String(Encoding.UTF8.GetBytes("test-lifecycle-key")));
        await File.WriteAllTextAsync(
            service.GetSupervisorStatusPath("sotero"),
            JsonSerializer.Serialize(new NetworkTelemetryAgentSupervisorStatus
            {
                AgentId = "agent-1",
                SupervisorState = "running",
                ProcessState = "stopped",
                DesiredState = "stopped",
                SupervisorHeartbeatAtUtc = DateTime.UtcNow.AddMinutes(-2),
                UpdatedAtUtc = DateTime.UtcNow.AddMinutes(-2)
            }, new JsonSerializerOptions(JsonSerializerDefaults.Web)));

        var status = await service.GetStatusAsync("sotero");

        Assert.False(status.IsSupervisorAvailable);
        Assert.False(status.ControlAvailable);
        Assert.False(status.CanStart);
        Assert.False(status.CanStop);
        Assert.False(status.CanRestart);
        Assert.False(status.IsConnected);
        Assert.Null(status.LastHeartbeatAtUtc);
        Assert.Contains("stale", status.LastError, StringComparison.OrdinalIgnoreCase);
    }

    // El caso que confundia al operador: el supervisor murio pero su ultimo estado escrito
    // dizia "running". La API debe seguir exponiendo ese dato como ultimo conocido y marcar
    // el supervisor como no disponible, para que la vista no lo pinte como vivo.
    [Fact]
    public async Task GetStatusAsync_StaleSupervisorRunning_QuedaMarcadoComoNoDisponible()
    {
        var service = CreateService(supervisorTimeoutSeconds: 1);
        var campusPath = service.GetSharedPath("sotero");
        Directory.CreateDirectory(campusPath);
        await File.WriteAllTextAsync(
            service.GetLifecycleKeyPath("sotero"),
            Convert.ToBase64String(Encoding.UTF8.GetBytes("test-lifecycle-key")));
        await File.WriteAllTextAsync(
            service.GetSupervisorStatusPath("sotero"),
            JsonSerializer.Serialize(new NetworkTelemetryAgentSupervisorStatus
            {
                AgentId = "agent-1",
                SupervisorState = "running",
                ProcessState = "running",
                DesiredState = "running",
                WorkerProcessId = 36320,
                SupervisorHeartbeatAtUtc = DateTime.UtcNow.AddMinutes(-2),
                UpdatedAtUtc = DateTime.UtcNow.AddMinutes(-2)
            }, new JsonSerializerOptions(JsonSerializerDefaults.Web)));

        var status = await service.GetStatusAsync("sotero");

        Assert.False(status.IsSupervisorAvailable);
        Assert.False(status.IsConnected);
        Assert.False(status.ControlAvailable);
        Assert.Equal("running", status.ProcessState);
        Assert.Equal(36320, status.WorkerProcessId);
        Assert.Contains("stale", status.LastError, StringComparison.OrdinalIgnoreCase);
    }

    private NetworkTelemetryAgentBridgeService CreateService(int supervisorTimeoutSeconds = 30)
    {
        Directory.CreateDirectory(_rootPath);
        var configuration = TestConfiguration.FromSettings(new Dictionary<string, string?>
        {
            ["NetworkTelemetrySettings:AgentSharedPath"] = _rootPath,
            ["NetworkTelemetrySettings:AgentSupervisorTimeoutSeconds"] = supervisorTimeoutSeconds.ToString()
        });
        var environment = new TestWebHostEnvironment
        {
            ContentRootPath = _rootPath,
            WebRootPath = _rootPath
        };
        return new NetworkTelemetryAgentBridgeService(configuration, environment);
    }

    private sealed class TestWebHostEnvironment : IWebHostEnvironment
    {
        public string WebRootPath { get; set; } = string.Empty;
        public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
        public string ApplicationName { get; set; } = "Syntro.API.Tests";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
        public string ContentRootPath { get; set; } = string.Empty;
        public string EnvironmentName { get; set; } = "Development";
    }
}
