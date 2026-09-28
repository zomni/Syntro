using System.Security.Cryptography;
using System.Text.Json;
using Syntro.NetworkCollector;
using Xunit;

public class AgentSupervisorProtocolTests
{
    [Fact]
    public void TryValidate_AcceptsAValidSignedCommand()
    {
        var now = DateTime.UtcNow;
        var key = RandomNumberGenerator.GetBytes(32);
        var command = CreateCommand(now, "start", key);

        var valid = AgentSupervisorProtocol.TryValidate(
            command,
            key,
            command.AgentId,
            command.CampusKey,
            now,
            out var error);

        Assert.True(valid, error);
    }

    [Fact]
    public void BuildSignaturePayload_UsesTheExactCanonicalFieldOrder()
    {
        var command = new AgentLifecycleCommand
        {
            RequestId = "request-1",
            Action = "start",
            AgentId = "agent-1",
            CampusKey = "campus-1",
            RequestedByUsername = "operator",
            RequestedAtUtc = new DateTime(2026, 1, 2, 3, 4, 5, DateTimeKind.Utc),
            ExpiresAtUtc = new DateTime(2026, 1, 2, 3, 5, 5, DateTimeKind.Utc)
        };

        var payload = AgentSupervisorProtocol.BuildSignaturePayload(command);

        Assert.Equal(
            "request-1\nstart\nagent-1\ncampus-1\noperator\n2026-01-02T03:04:05.0000000Z\n2026-01-02T03:05:05.0000000Z",
            payload);
    }

    [Fact]
    public void TryValidate_RejectsASignatureForDifferentContent()
    {
        var now = DateTime.UtcNow;
        var key = RandomNumberGenerator.GetBytes(32);
        var command = CreateCommand(now, "start", key);
        command.Action = "stop";

        var valid = AgentSupervisorProtocol.TryValidate(
            command,
            key,
            command.AgentId,
            command.CampusKey,
            now,
            out var error);

        Assert.False(valid);
        Assert.Contains("signature", error, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void TryValidate_RejectsNonCanonicalAction()
    {
        var now = DateTime.UtcNow;
        var key = RandomNumberGenerator.GetBytes(32);
        var command = CreateCommand(now, "START", key);

        var valid = AgentSupervisorProtocol.TryValidate(
            command,
            key,
            command.AgentId,
            command.CampusKey,
            now,
            out var error);

        Assert.False(valid);
        Assert.Contains("action", error, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void StatusJson_UsesTheProtocolFieldNames()
    {
        var options = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        };

        using var document = JsonDocument.Parse(JsonSerializer.Serialize(new AgentSupervisorStatus(), options));
        var fields = document.RootElement.EnumerateObject().Select(property => property.Name).ToArray();

        Assert.Equal(16, fields.Length);
        Assert.Contains("agentId", fields);
        Assert.Contains("supervisorHeartbeatAtUtc", fields);
        Assert.Contains("workerProcessId", fields);
        Assert.Contains("lastCommandRequestedBy", fields);
        Assert.Contains("version", fields);
    }

    [Fact]
    public void TryValidate_RejectsCommandsOlderThanThirtySeconds()
    {
        var now = DateTime.UtcNow;
        var key = RandomNumberGenerator.GetBytes(32);
        var command = CreateCommand(now.AddSeconds(-31), "start", key, now.AddSeconds(30));

        var valid = AgentSupervisorProtocol.TryValidate(
            command,
            key,
            command.AgentId,
            command.CampusKey,
            now,
            out var error);

        Assert.False(valid);
        Assert.Contains("old", error, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void TryValidate_RejectsExpiredCommands()
    {
        var now = DateTime.UtcNow;
        var key = RandomNumberGenerator.GetBytes(32);
        var command = CreateCommand(now.AddSeconds(-10), "start", key, now.AddSeconds(-1));

        var valid = AgentSupervisorProtocol.TryValidate(
            command,
            key,
            command.AgentId,
            command.CampusKey,
            now,
            out var error);

        Assert.False(valid);
        Assert.Contains("expired", error, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void TryValidate_RejectsExpiryMoreThanTwoMinutesInTheFuture()
    {
        var now = DateTime.UtcNow;
        var key = RandomNumberGenerator.GetBytes(32);
        var command = CreateCommand(now, "start", key, now.AddSeconds(121));

        var valid = AgentSupervisorProtocol.TryValidate(
            command,
            key,
            command.AgentId,
            command.CampusKey,
            now,
            out var error);

        Assert.False(valid);
        Assert.Contains("future", error, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void ApplyCommand_TransitionsDesiredStateAndPersistsCommandMetadata()
    {
        var now = DateTime.UtcNow;
        var key = RandomNumberGenerator.GetBytes(32);
        var state = AgentSupervisorProtocol.CreateInitialState();
        var stop = CreateCommand(now, "stop", key);

        var stopped = AgentSupervisorProtocol.ApplyCommand(state, stop);

        Assert.Equal(AgentSupervisorDesiredStates.Stopped, stopped.DesiredState);
        Assert.Equal("stop", stopped.PendingAction);
        Assert.Equal(stop.RequestId, stopped.LastCommandId);
        Assert.Equal(stop.RequestedByUsername, stopped.LastCommandRequestedBy);

        var start = CreateCommand(now.AddSeconds(1), "start", key);
        var started = AgentSupervisorProtocol.ApplyCommand(stopped, start);

        Assert.Equal(AgentSupervisorDesiredStates.Running, started.DesiredState);
        Assert.Equal("start", started.PendingAction);
        Assert.Equal(start.RequestId, started.LastCommandId);
    }

    [Fact]
    public void ApplyCommand_MarksRestartAsRunningAndResetsBackoff()
    {
        var now = DateTime.UtcNow;
        var key = RandomNumberGenerator.GetBytes(32);
        var state = new AgentSupervisorPersistentState
        {
            DesiredState = AgentSupervisorDesiredStates.Running,
            RestartAttempt = 3,
            NextRestartAtUtc = now.AddSeconds(30)
        };
        var command = CreateCommand(now, "restart", key);

        var result = AgentSupervisorProtocol.ApplyCommand(state, command);

        Assert.Equal(AgentSupervisorDesiredStates.Running, result.DesiredState);
        Assert.Equal("restart", result.PendingAction);
        Assert.Equal(0, result.RestartAttempt);
        Assert.Null(result.NextRestartAtUtc);
    }

    private static AgentLifecycleCommand CreateCommand(
        DateTime requestedAtUtc,
        string action,
        byte[] key,
        DateTime? expiresAtUtc = null)
    {
        var command = new AgentLifecycleCommand
        {
            RequestId = Guid.NewGuid().ToString("N"),
            Action = action,
            AgentId = "windows-agent",
            CampusKey = "sotero",
            RequestedByUsername = "operator",
            RequestedAtUtc = requestedAtUtc,
            ExpiresAtUtc = expiresAtUtc ?? requestedAtUtc.AddSeconds(30)
        };
        command.Signature = AgentSupervisorProtocol.ComputeSignature(command, key);
        return command;
    }
}
