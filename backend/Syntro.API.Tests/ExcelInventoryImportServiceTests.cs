using ClosedXML.Excel;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging;
using Microsoft.AspNetCore.Hosting;
using Syntro.API.Data;
using Syntro.API.ML;
using Syntro.API.Models;
using Syntro.API.Services;

namespace Syntro.API.Tests;

public class ExcelInventoryImportServiceTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly AppDbContext _context;
    private readonly string _tempDirectory;
    private readonly ItemClassificationService _classificationService;
    private readonly MlSettingsService _mlSettings;

    public ExcelInventoryImportServiceTests()
    {
        _connection = TestDbContextFactory.CreateInMemoryConnection();
        _context = TestDbContextFactory.CreateContext(_connection);
        _tempDirectory = Path.Combine(Path.GetTempPath(), $"syntro-import-tests-{Guid.NewGuid():N}");
        Directory.CreateDirectory(_tempDirectory);
        _classificationService = new ItemClassificationService(
            TestConfiguration.FromSettings(new Dictionary<string, string?>()),
            new LoggerFactory().CreateLogger<ItemClassificationService>());
        _mlSettings = new MlSettingsService(
            TestConfiguration.FromSettings(new Dictionary<string, string?>()),
            new FakeWebHostEnvironment(_tempDirectory),
            new LoggerFactory().CreateLogger<MlSettingsService>());
    }

    public void Dispose()
    {
        _context.Dispose();
        _connection.Dispose();
        try
        {
            Directory.Delete(_tempDirectory, recursive: true);
        }
        catch
        {
            // El cleanup del directorio temporal es best-effort.
        }
    }

    [Fact]
    public async Task ImportAsync_ImportsRowsFromExcelFile()
    {
        var filePath = Path.Combine(_tempDirectory, "inventario.xlsx");
        CreateInventoryExcel(filePath, physicalLocation: "Edificio Torre", description: "Notebook HP", serial: "SN-100");

        _context.SyncedBuildings.Add(new SyncedBuilding
        {
            ExternalId = "torre",
            Campus = "main",
            DisplayName = "Edificio Torre"
        });
        await _context.SaveChangesAsync();

        var config = TestConfiguration.FromSettings(new Dictionary<string, string?>
        {
            ["ExcelImportRoot"] = _tempDirectory,
            ["InventoryCategories:FallbackCategory"] = "other",
            ["InventoryCategories:FallbackStatus"] = "active",
            ["InventoryCategories:Categories:0:Name"] = "pc",
            ["InventoryCategories:Categories:0:Tokens:0"] = "NOTEBOOK",
            ["InventoryCategories:Statuses:0:Name"] = "active",
            ["InventoryCategories:Statuses:0:Tokens:0"] = "FUNCIONA"
        });
        var service = new ExcelInventoryImportService(_context, config, _classificationService, _mlSettings);

        var result = await service.ImportAsync("inventario.xlsx");

        Assert.Equal(1, result.ImportedItemsCount);
        Assert.Equal(filePath, result.ExcelPath);

        var item = await _context.ImportedInventoryItems.SingleAsync();
        Assert.Equal("LOTE-1", item.SerialNumber);
        Assert.Equal("LOTE-1", item.Lot);
        Assert.Equal("Notebook HP", item.Description);
        Assert.Equal("torre", item.AssignedBuildingExternalId);
        Assert.Equal("pc", item.InferredCategory);
        Assert.Equal("inventario.xlsx", item.SourceFile);
    }

    [Fact]
    public async Task ImportAsync_ThrowsWhenFileDoesNotExist()
    {
        var config = TestConfiguration.FromSettings(new Dictionary<string, string?>
        {
            ["ExcelImportRoot"] = _tempDirectory
        });
        var service = new ExcelInventoryImportService(_context, config, _classificationService, _mlSettings);

        await Assert.ThrowsAsync<FileNotFoundException>(
            () => service.ImportAsync("missing.xlsx"));
    }

    [Fact]
    public async Task GetStatusAsync_ReportsZeroWhenNothingImported()
    {
        var config = TestConfiguration.FromSettings(new Dictionary<string, string?>
        {
            ["ExcelImportRoot"] = _tempDirectory
        });
        var service = new ExcelInventoryImportService(_context, config, _classificationService, _mlSettings);

        var status = await service.GetStatusAsync();

        Assert.Equal(0, status.ImportedItemsCount);
        Assert.Null(status.LastImportUtc);
    }

    private static void CreateInventoryExcel(string filePath, string physicalLocation, string description, string serial)
    {
        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add("Inventario");
        string[] headers = ["NUM", "PL LOTE", "S_N", "ITE DESCRIPCION", "UBICACION FISICA", "OBSERVACION"];
        for (var i = 0; i < headers.Length; i++)
        {
            sheet.Cell(1, i + 1).Value = headers[i];
        }

        sheet.Cell(2, 1).Value = "100";
        sheet.Cell(2, 2).Value = "LOTE-1";
        sheet.Cell(2, 3).Value = serial;
        sheet.Cell(2, 4).Value = description;
        sheet.Cell(2, 5).Value = physicalLocation;
        sheet.Cell(2, 6).Value = "funciona";
        workbook.SaveAs(filePath);
    }
}

internal class FakeWebHostEnvironment : IWebHostEnvironment
{
    public FakeWebHostEnvironment(string contentRootPath)
    {
        ContentRootPath = contentRootPath;
        EnvironmentName = "Development";
        ApplicationName = "Test";
        WebRootPath = contentRootPath;
    }

    public string EnvironmentName { get; set; }
    public string ApplicationName { get; set; }
    public string ContentRootPath { get; set; }
    public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } = null!;
    public string WebRootPath { get; set; }
    public Microsoft.Extensions.FileProviders.IFileProvider WebRootFileProvider { get; set; } = null!;
}
