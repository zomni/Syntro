using Microsoft.AspNetCore.Http;
using Microsoft.Data.Sqlite;
using Syntro.API.Data;
using Syntro.API.Models;
using Syntro.API.Services;
using Syntro.API.ViewModels;

namespace Syntro.API.Tests;

public class AuditLogServiceTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly AppDbContext _context;

    public AuditLogServiceTests()
    {
        _connection = TestDbContextFactory.CreateInMemoryConnection();
        _context = TestDbContextFactory.CreateContext(_connection);
    }

    public void Dispose()
    {
        _context.Dispose();
        _connection.Dispose();
    }

    [Fact]
    public async Task LogSecurityEventAsync_PersistsEvent()
    {
        var service = new AuditLogService(_context, new HttpContextAccessor());

        await service.LogSecurityEventAsync(
            actionType: "login-success",
            resource: "auth/login",
            summary: "Login exitoso",
            details: "Usuario admin",
            result: "success",
            severity: "info",
            changedByUsername: "admin");

        var entry = await _context.AuditLogEntries.SingleAsync();
        Assert.Equal("login-success", entry.ActionType);
        Assert.Equal("admin", entry.ChangedByUsername);
        Assert.Equal("info", entry.Severity);
        Assert.Equal("security", entry.EntityType);
    }

    [Fact]
    public async Task LogInventoryItemChangeAsync_RecordsMovedEvent()
    {
        var service = new AuditLogService(_context, new HttpContextAccessor());
        var item = new ImportedInventoryItem
        {
            RowNumber = 2,
            SerialNumber = "SN-42",
            Description = "PC",
            AssignedBuildingExternalId = "edificio-b",
            AssignmentNotes = "Reubicado"
        };
        _context.ImportedInventoryItems.Add(item);
        await _context.SaveChangesAsync();

        await service.LogInventoryItemChangeAsync(
            item,
            changedByUsername: "editor",
            previousBuildingExternalId: "edificio-a",
            previousRoomExternalId: null,
            previousFloor: 1,
            previousSerialNumber: "SN-42",
            previousAssignmentNotes: "Original");

        var entries = await _context.AuditLogEntries.ToListAsync();
        Assert.Equal(2, entries.Count);
        Assert.Contains(entries, e => e.BuildingExternalId == "edificio-a");
        Assert.Contains(entries, e => e.BuildingExternalId == "edificio-b");
        Assert.All(entries, e => Assert.Equal("moved", e.ActionType));
        Assert.All(entries, e => Assert.Equal("editor", e.ChangedByUsername));
        Assert.Contains(entries, e => e.Summary.Contains("SN-42"));
        Assert.Contains(entries, e => e.Details.Contains("edificio:"));
    }

    [Fact]
    public async Task QueryAsync_FiltersByActionTypeAndPaginates()
    {
        var service = new AuditLogService(_context, new HttpContextAccessor());
        for (var i = 0; i < 3; i++)
        {
            await service.LogSecurityEventAsync(
                actionType: "access-denied",
                resource: "api/secret",
                summary: $"Intento {i}",
                details: "Denegado",
                result: "failure",
                severity: "warning",
                changedByUsername: "auditor");
        }

        var result = await service.QueryAsync(new AuditLogQueryRequest
        {
            ActionType = "access-denied",
            Page = 1,
            PageSize = 20
        });

        Assert.Equal(3, result.TotalCount);
        Assert.Equal(3, result.Items.Count);
        Assert.Equal(3, result.FailureCount);
        Assert.Equal(3, result.WarningCount);
    }
}
