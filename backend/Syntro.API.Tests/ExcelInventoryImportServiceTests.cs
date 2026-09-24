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
    private readonly MlAutoTrainService _autoTrainService;

    public ExcelInventoryImportServiceTests()
    {
        _connection = TestDbContextFactory.CreateInMemoryConnection();
        _context = TestDbContextFactory.CreateContext(_connection);
        _tempDirectory = Path.Combine(Path.GetTempPath(), $"syntro-import-tests-{Guid.NewGuid():N}");
        Directory.CreateDirectory(_tempDirectory);
        var emptyConfig = TestConfiguration.FromSettings(new Dictionary<string, string?>());
        _classificationService = new ItemClassificationService(
            emptyConfig,
            new LoggerFactory().CreateLogger<ItemClassificationService>());
        _mlSettings = new MlSettingsService(
            emptyConfig,
            new FakeWebHostEnvironment(_tempDirectory),
            new LoggerFactory().CreateLogger<MlSettingsService>());
        _autoTrainService = new MlAutoTrainService(
            _classificationService,
            new RiskPredictionService(emptyConfig, new LoggerFactory().CreateLogger<RiskPredictionService>()),
            _mlSettings,
            _context,
            emptyConfig,
            new LoggerFactory().CreateLogger<MlAutoTrainService>());
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
        var service = new ExcelInventoryImportService(_context, config, _classificationService, _mlSettings, _autoTrainService);

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
        var service = new ExcelInventoryImportService(_context, config, _classificationService, _mlSettings, _autoTrainService);

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
        var service = new ExcelInventoryImportService(_context, config, _classificationService, _mlSettings, _autoTrainService);

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

    [Fact]
    public async Task ImportAsync_ImportsRowsFromLexmarkSheet()
    {
        var filePath = Path.Combine(_tempDirectory, "lexmark.xlsx");
        CreateLexmarkExcel(filePath);

        var config = TestConfiguration.FromSettings(new Dictionary<string, string?>
        {
            ["ExcelImportRoot"] = _tempDirectory,
            ["InventoryCategories:FallbackCategory"] = "other",
            ["InventoryCategories:FallbackStatus"] = "active"
        });
        var service = new ExcelInventoryImportService(_context, config, _classificationService, _mlSettings, _autoTrainService);

        var result = await service.ImportAsync("lexmark.xlsx");

        Assert.Equal(2, result.ImportedItemsCount);
        Assert.Equal("costo variable impresion", result.SheetName);

        var networked = await _context.ImportedInventoryItems.SingleAsync(i => i.SerialNumber == "4064827011DHX");
        Assert.Equal("MS826-007", networked.ItemNumber);
        Assert.Equal("IMPRESORA LEXMARK MS826", networked.Description);
        Assert.Equal("10.8.143.22", networked.IpAddress);
        Assert.Equal("printer", networked.InferredCategory);
        Assert.Equal("lexmark", networked.CategorySource);
        Assert.Equal("active", networked.InferredStatus);
        Assert.Equal("1234567", networked.AnnexPhone);
        Assert.Equal("Block Central Laboratorio Central Piso 2 Bacteria", networked.UnitOrDepartment);
        Assert.Equal("LABORATORIO", networked.OrganizationalUnit);
        Assert.Contains("COMPLEJO: CASR-TB", networked.Observation);
        Assert.Equal("lexmark.xlsx", networked.SourceFile);

        var usb = await _context.ImportedInventoryItems.SingleAsync(i => i.SerialNumber == "SN-USB-001");
        Assert.Equal(string.Empty, usb.IpAddress);
    }

    [Fact]
    public async Task ImportAsync_SelectsRecognizableSheetWhenFirstIsUnrelated()
    {
        var filePath = Path.Combine(_tempDirectory, "planilla.xlsx");
        using (var workbook = new XLWorkbook())
        {
            var junk = workbook.Worksheets.Add("Hoja1");
            string[] junkHeaders = ["ESTABLECIMIENTO", "SERVICIO", "INFORME WINSIG", "MAT QUIRUR", "PRODUCCION"];
            for (var i = 0; i < junkHeaders.Length; i++)
            {
                junk.Cell(1, i + 1).Value = junkHeaders[i];
            }
            junk.Cell(2, 1).Value = "HOSPITAL SOTERO DEL RIO";

            var printers = workbook.Worksheets.Add("costo variable impresion");
            AddLexmarkHeaders(printers);
            AddLexmarkRow(printers, 2, "MS826", "MS826-007", "4064827011DHX", "10.8.143.22");
            workbook.SaveAs(filePath);
        }

        var config = TestConfiguration.FromSettings(new Dictionary<string, string?>
        {
            ["ExcelImportRoot"] = _tempDirectory,
            ["InventoryCategories:FallbackCategory"] = "other",
            ["InventoryCategories:FallbackStatus"] = "active"
        });
        var service = new ExcelInventoryImportService(_context, config, _classificationService, _mlSettings, _autoTrainService);

        var result = await service.ImportAsync("planilla.xlsx");

        Assert.Equal(1, result.ImportedItemsCount);
        Assert.Equal("costo variable impresion", result.SheetName);

        var item = await _context.ImportedInventoryItems.SingleAsync();
        Assert.Equal("4064827011DHX", item.SerialNumber);
        Assert.Equal("planilla.xlsx", item.SourceFile);
    }

    [Fact]
    public async Task ImportAsync_ThrowsWhenNoSheetHasRecognizableHeaders()
    {
        var filePath = Path.Combine(_tempDirectory, "desconocido.xlsx");
        using (var workbook = new XLWorkbook())
        {
            var sheet = workbook.Worksheets.Add("Hoja1");
            sheet.Cell(1, 1).Value = "ESTABLECIMIENTO";
            sheet.Cell(1, 2).Value = "SERVICIO";
            sheet.Cell(1, 3).Value = "INFORME WINSIG";
            workbook.SaveAs(filePath);
        }

        var config = TestConfiguration.FromSettings(new Dictionary<string, string?>
        {
            ["ExcelImportRoot"] = _tempDirectory
        });
        var service = new ExcelInventoryImportService(_context, config, _classificationService, _mlSettings, _autoTrainService);

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => service.ImportAsync("desconocido.xlsx"));
    }

    private static void CreateLexmarkExcel(string filePath)
    {
        using var workbook = new XLWorkbook();
        var sheet = workbook.Worksheets.Add("costo variable impresion");
        AddLexmarkHeaders(sheet);
        AddLexmarkRow(sheet, 2, "MS826", "MS826-007", "4064827011DHX", "10.8.143.22");
        AddLexmarkRow(sheet, 3, "MS826", "MS826-008", "SN-USB-001", "USB");
        workbook.SaveAs(filePath);
    }

    private static void AddLexmarkHeaders(IXLWorksheet sheet)
    {
        string[] headers =
        [
            "N°", "esta", "modelo", "MODELO", "ETIQUETA", "SERIE", "CCOSTO_WINSIG", "COMPLEJO",
            "UNIDADES", "CONTACTO", "RESPONSABLE", "TELÉFONO", "NUMERO IP", "Hoja B/N", "Hoja Color"
        ];
        for (var i = 0; i < headers.Length; i++)
        {
            sheet.Cell(1, i + 1).Value = headers[i];
        }
    }

    private static void AddLexmarkRow(IXLWorksheet sheet, int row, string model, string etiqueta, string serie, string ip)
    {
        sheet.Cell(row, 1).Value = row - 1;
        sheet.Cell(row, 3).Value = model;
        sheet.Cell(row, 4).Value = model;
        sheet.Cell(row, 5).Value = etiqueta;
        sheet.Cell(row, 6).Value = serie;
        sheet.Cell(row, 7).Value = "LABORATORIO";
        sheet.Cell(row, 8).Value = "CASR-TB";
        sheet.Cell(row, 9).Value = "Block Central Laboratorio Central Piso 2 Bacteria";
        sheet.Cell(row, 10).Value = "Sandra Moran";
        sheet.Cell(row, 11).Value = "Juan Perez";
        sheet.Cell(row, 12).Value = "1234567";
        sheet.Cell(row, 13).Value = ip;
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
