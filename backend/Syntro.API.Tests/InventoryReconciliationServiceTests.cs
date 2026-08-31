using Microsoft.Data.Sqlite;
using Syntro.API.Data;
using Syntro.API.Models;
using Syntro.API.Services;

namespace Syntro.API.Tests;

public class InventoryReconciliationServiceTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly AppDbContext _context;

    public InventoryReconciliationServiceTests()
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
    public async Task RunAsync_MatchesItemsByAliasRule()
    {
        var building = new SyncedBuilding
        {
            ExternalId = "B1",
            Campus = "main",
            DisplayName = "Edificio Principal"
        };
        var room = new SyncedRoom
        {
            ExternalId = "R1",
            SyncedBuildingId = building.Id,
            BuildingExternalId = "B1",
            Name = "Sala 101"
        };
        _context.SyncedBuildings.Add(building);
        _context.SyncedRooms.Add(room);

        _context.InventoryAliasRules.Add(new InventoryAliasRule
        {
            SourceText = "Deposito Central",
            NormalizedSourceText = "DEPOSITO CENTRAL",
            TargetBuildingExternalId = "B1",
            TargetRoomExternalId = "R1"
        });

        _context.ImportedInventoryItems.Add(new ImportedInventoryItem
        {
            RowNumber = 2,
            ItemNumber = "EQ-001",
            SerialNumber = "SN-001",
            Description = "Notebook",
            UnitOrDepartment = "Deposito Central",
            SourceFile = "inventario.xlsx"
        });

        await _context.SaveChangesAsync();

        var service = new InventoryReconciliationService(_context);
        var result = await service.RunAsync();

        Assert.Equal(1, result.TotalItems);
        Assert.Equal(1, result.MatchedBuildings);
        Assert.Equal(1, result.MatchedRooms);
        Assert.Equal(0, result.UnmatchedItems);

        var item = await _context.ImportedInventoryItems.SingleAsync();
        Assert.Equal("alias-room", item.MatchConfidence);
        Assert.Equal("B1", item.MatchedBuildingExternalId);
    }

    [Fact]
    public async Task RunAsync_MatchesBuildingByDisplayName()
    {
        _context.SyncedBuildings.Add(new SyncedBuilding
        {
            ExternalId = "B2",
            Campus = "main",
            DisplayName = "Biblioteca"
        });
        _context.ImportedInventoryItems.Add(new ImportedInventoryItem
        {
            RowNumber = 2,
            ItemNumber = "EQ-002",
            Description = "PC",
            OrganizationalUnit = "Biblioteca",
            SourceFile = "inventario.xlsx"
        });
        await _context.SaveChangesAsync();

        var service = new InventoryReconciliationService(_context);
        var result = await service.RunAsync();

        Assert.Equal(1, result.MatchedBuildings);
        Assert.Equal("building", result.MatchedBuildings == 1
            ? (await _context.ImportedInventoryItems.SingleAsync()).MatchConfidence
            : string.Empty);
    }

    [Fact]
    public async Task RunAsync_LeavesUnmatchedWhenNoCandidateMatches()
    {
        _context.SyncedBuildings.Add(new SyncedBuilding
        {
            ExternalId = "B3",
            Campus = "main",
            DisplayName = "Gimnasio"
        });
        _context.ImportedInventoryItems.Add(new ImportedInventoryItem
        {
            RowNumber = 2,
            ItemNumber = "EQ-003",
            Description = "Impresora",
            OrganizationalUnit = "Zona Sin Nombre",
            SourceFile = "inventario.xlsx"
        });
        await _context.SaveChangesAsync();

        var service = new InventoryReconciliationService(_context);
        var result = await service.RunAsync();

        Assert.Equal(0, result.MatchedBuildings);
        Assert.Equal(1, result.UnmatchedItems);
        Assert.Equal("none", (await _context.ImportedInventoryItems.SingleAsync()).MatchConfidence);
    }
}
