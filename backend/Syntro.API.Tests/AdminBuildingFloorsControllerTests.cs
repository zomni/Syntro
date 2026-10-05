using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ViewFeatures;
using Microsoft.Data.Sqlite;
using System.Security.Claims;
using Syntro.API.Controllers;
using Syntro.API.Data;
using Syntro.API.Models;
using Syntro.API.Services;

namespace Syntro.API.Tests;

public class AdminBuildingFloorsControllerTests : IDisposable
{
    private const string BuildingExternalId = "SR-BLD-010";

    private readonly SqliteConnection _connection;
    private readonly AppDbContext _context;
    private readonly AuditLogService _auditLogService;

    public AdminBuildingFloorsControllerTests()
    {
        _connection = TestDbContextFactory.CreateInMemoryConnection();
        _context = TestDbContextFactory.CreateContext(_connection);
        _auditLogService = new AuditLogService(_context, new HttpContextAccessor());
    }

    public void Dispose()
    {
        _context.Dispose();
        _connection.Dispose();
    }

    private sealed class InMemoryTempDataProvider : ITempDataProvider
    {
        private IDictionary<string, object> _store = new Dictionary<string, object>();

        public IDictionary<string, object> LoadTempData(HttpContext context) => _store;

        public void SaveTempData(HttpContext context, IDictionary<string, object> values) => _store = values;
    }

    private AdminController CreateController()
    {
        var httpContext = new DefaultHttpContext
        {
            User = new ClaimsPrincipal(new ClaimsIdentity(new[]
            {
                new Claim(ClaimTypes.Name, "admin@example.com"),
                new Claim(ClaimTypes.Role, "admin"),
            }, "test"))
        };

        var controller = new AdminController(
            _context,
            _auditLogService,
            null!,
            new ConfigurationBuilder().Build(),
            null!,
            null!,
            null!,
            null!,
            null!,
            null!,
            null!,
            null!,
            null!)
        {
            ControllerContext = new ControllerContext { HttpContext = httpContext },
            TempData = new TempDataDictionary(httpContext, new InMemoryTempDataProvider())
        };

        return controller;
    }

    private SyncedBuilding SeedBuilding(string floorsJson = "[1,2,3]", string manualFloorsJson = "")
    {
        var building = new SyncedBuilding
        {
            ExternalId = BuildingExternalId,
            Campus = "sotero",
            DisplayName = "Corta Estadia 2",
            RealName = "Corta Estadia 2",
            Type = "consultas",
            FloorsJson = floorsJson,
            ManualFloorsJson = manualFloorsJson,
            SyncedAtUtc = DateTime.UtcNow
        };

        _context.SyncedBuildings.Add(building);
        return building;
    }

    private ManualRoom SeedRoom(string externalId, int floor)
    {
        var room = new ManualRoom
        {
            ExternalId = externalId,
            BuildingExternalId = BuildingExternalId,
            Floor = floor,
            DisplayName = externalId,
            GeometryJson = "{\"type\":\"Polygon\",\"coordinates\":[[[0,0],[0,1],[1,1],[0,0]]]}"
        };

        _context.ManualRooms.Add(room);
        return room;
    }

    private MapMarker SeedMarker(string externalId, string buildingExternalId, int floor)
    {
        var marker = new MapMarker
        {
            ExternalId = externalId,
            BuildingExternalId = buildingExternalId,
            Floor = floor,
            Latitude = -33.5,
            Longitude = -70.5
        };

        _context.MapMarkers.Add(marker);
        return marker;
    }

    private static ManualRoom[] LiveRooms(AppDbContext context, string buildingExternalId, int floor) =>
        context.ManualRooms
            .Where(room => room.DeletedAtUtc == null && room.BuildingExternalId == buildingExternalId && room.Floor == floor)
            .ToArray();

    // ManualRoom y MapMarker tienen filtro global DeletedAtUtc == null, asi que para
    // inspeccionar una fila dada de baja hay que saltarselo explicitamente.
    private static ManualRoom RoomIncludingDeleted(AppDbContext context, string externalId) =>
        context.ManualRooms.IgnoreQueryFilters().Single(room => room.ExternalId == externalId);

    private static MapMarker MarkerIncludingDeleted(AppDbContext context, string externalId) =>
        context.MapMarkers.IgnoreQueryFilters().Single(marker => marker.ExternalId == externalId);

    [Fact]
    public async Task QuitarPiso_DaDeBajaLasSalasDeEsePiso()
    {
        SeedBuilding();
        SeedRoom("sala-1-a", 1);
        SeedRoom("sala-1-b", 1);
        SeedRoom("sala-2-a", 2);
        SeedRoom("sala-2-b", 2);
        SeedRoom("sala-2-c", 2);
        SeedRoom("sala-3-a", 3);
        await _context.SaveChangesAsync();

        var controller = CreateController();
        var result = await controller.EditSyncedBuilding(BuildingExternalId, null, null, "1");

        Assert.IsType<RedirectToActionResult>(result);

        Assert.Empty(LiveRooms(_context, BuildingExternalId, 2));
        Assert.Empty(LiveRooms(_context, BuildingExternalId, 3));
        Assert.Equal(2, LiveRooms(_context, BuildingExternalId, 1).Length);

        var bajaPiso2 = RoomIncludingDeleted(_context, "sala-2-a");
        Assert.NotNull(bajaPiso2.DeletedAtUtc);
        Assert.False(bajaPiso2.IsActive);
        Assert.Equal("admin@example.com", bajaPiso2.DeletedBy);
    }

    [Fact]
    public async Task QuitarPiso_DaDeBajaLosMarcadoresDeEsePiso()
    {
        SeedBuilding();
        SeedMarker("mkr-p1", BuildingExternalId, 1);
        SeedMarker("mkr-p2-a", BuildingExternalId, 2);
        SeedMarker("mkr-p2-b", BuildingExternalId, 2);
        await _context.SaveChangesAsync();

        var controller = CreateController();
        await controller.EditSyncedBuilding(BuildingExternalId, null, null, "1");

        var conservado = MarkerIncludingDeleted(_context, "mkr-p1");
        Assert.True(conservado.IsActive);
        Assert.Null(conservado.DeletedAtUtc);

        foreach (var externalId in new[] { "mkr-p2-a", "mkr-p2-b" })
        {
            var marcador = MarkerIncludingDeleted(_context, externalId);
            Assert.NotNull(marcador.DeletedAtUtc);
            Assert.False(marcador.IsActive);
            Assert.Equal("admin@example.com", marcador.DeletedBy);
        }
    }

    [Fact]
    public async Task QuitarPiso_NoTocaLosMarcadoresDeCampus()
    {
        SeedBuilding();
        SeedMarker("campus-bus", "map-general", -1);
        SeedMarker("campus-p2", BuildingExternalId, 2);
        await _context.SaveChangesAsync();

        var controller = CreateController();
        await controller.EditSyncedBuilding(BuildingExternalId, null, null, "1");

        var campus = MarkerIncludingDeleted(_context, "campus-bus");
        Assert.Null(campus.DeletedAtUtc);
        Assert.True(campus.IsActive);

        var delEdificio = MarkerIncludingDeleted(_context, "campus-p2");
        Assert.NotNull(delEdificio.DeletedAtUtc);
        Assert.False(delEdificio.IsActive);
    }

    [Fact]
    public async Task QuitarPiso_NoVigilaLasSalasYaDadasDeBaja()
    {
        SeedBuilding();
        var yaBaja = SeedRoom("sala-2-previa", 2);
        yaBaja.DeletedAtUtc = new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        yaBaja.IsActive = false;
        yaBaja.DeletedBy = "remove-floor-zero";
        await _context.SaveChangesAsync();

        var controller = CreateController();
        await controller.EditSyncedBuilding(BuildingExternalId, null, null, "1");

        var sala = RoomIncludingDeleted(_context, "sala-2-previa");
        Assert.Equal("remove-floor-zero", sala.DeletedBy);
        Assert.Equal(new DateTime(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc), sala.DeletedAtUtc);
    }

    [Fact]
    public async Task GuardarSinQuitarPisos_NoDaDeBajaNada()
    {
        SeedBuilding();
        SeedRoom("sala-1-a", 1);
        SeedRoom("sala-2-a", 2);
        await _context.SaveChangesAsync();

        var controller = CreateController();
        await controller.EditSyncedBuilding(BuildingExternalId, null, null, "1, 2, 3");

        Assert.Single(LiveRooms(_context, BuildingExternalId, 2));
        Assert.DoesNotContain(_context.AuditLogEntries, entry => entry.ActionType == "remove-floors-content");
    }

    [Fact]
    public async Task QuitarPiso_RegistraLosValoresAnterioresYNuevosEnAuditoria()
    {
        SeedBuilding();
        SeedRoom("sala-2-a", 2);
        await _context.SaveChangesAsync();

        var controller = CreateController();
        await controller.EditSyncedBuilding(BuildingExternalId, null, null, "1");

        var overrideEntry = _context.AuditLogEntries
            .Single(entry => entry.ActionType == "override-building");

        Assert.Equal("[1,2,3]", overrideEntry.PreviousValue);
        Assert.Equal("[1]", overrideEntry.NewValue);
        Assert.Contains("pisos: '[1,2,3]' -> '[1]'", overrideEntry.Details);
        Assert.Equal("admin@example.com", overrideEntry.ChangedByUsername);
    }

    [Fact]
    public async Task QuitarPiso_RegistraLaBajaEnCascadaConElConteoPorPiso()
    {
        SeedBuilding();
        SeedRoom("sala-2-a", 2);
        SeedRoom("sala-2-b", 2);
        SeedRoom("sala-3-a", 3);
        await _context.SaveChangesAsync();

        var controller = CreateController();
        await controller.EditSyncedBuilding(BuildingExternalId, null, null, "1");

        var cascadeEntry = _context.AuditLogEntries
            .Single(entry => entry.ActionType == "remove-floors-content");

        Assert.Equal(BuildingExternalId, cascadeEntry.BuildingExternalId);
        Assert.Contains("piso 2: 2", cascadeEntry.Details);
        Assert.Contains("piso 3: 1", cascadeEntry.Details);
        Assert.Contains("marcadores dados de baja: 0", cascadeEntry.Details);
        Assert.Equal("[1]", cascadeEntry.NewValue);
    }

    [Fact]
    public async Task UsarPisosFuente_NoDaDeBajaNada()
    {
        SeedBuilding(manualFloorsJson: "[1]");
        SeedRoom("sala-2-a", 2);
        await _context.SaveChangesAsync();

        var controller = CreateController();
        await controller.EditSyncedBuilding(BuildingExternalId, null, null, string.Empty);

        Assert.Equal("[1,2,3]", _context.SyncedBuildings.Single().FloorsJson);
        Assert.Equal(string.Empty, _context.SyncedBuildings.Single().ManualFloorsJson);
        Assert.Single(LiveRooms(_context, BuildingExternalId, 2));
    }

    [Fact]
    public async Task EditarSinCambiarPisos_QuedaRegistradoComoSinCambios()
    {
        SeedBuilding();
        await _context.SaveChangesAsync();

        var controller = CreateController();
        await controller.EditSyncedBuilding(BuildingExternalId, null, null, "1, 2, 3");

        var overrideEntry = _context.AuditLogEntries
            .Single(entry => entry.ActionType == "override-building");

        Assert.Equal(string.Empty, overrideEntry.PreviousValue);
        Assert.Equal(string.Empty, overrideEntry.NewValue);
        Assert.Contains("override revisado sin cambios", overrideEntry.Details);
    }
}

public class BuildingFloorNormalizerFloorsRemovedFromTests
{
    [Theory]
    [InlineData("[1,2,3]", "[1]", new[] { 2, 3 })]
    [InlineData("[1,2]", "[1]", new[] { 2 })]
    [InlineData("[1,2]", "[1,2]", new int[] { })]
    [InlineData("[1]", "[1,2]", new int[] { })]
    [InlineData("[1,-1]", "[1]", new[] { -1 })]
    [InlineData("[1,2,3]", "", new[] { 1, 2, 3 })]
    public void DetectaLosPisosQueDesaparecen(string previous, string current, int[] expected)
    {
        var removed = BuildingFloorNormalizer.FloorsRemovedFrom(previous, current);

        Assert.Equal(expected, removed.ToArray());
    }

    [Fact]
    public void ElPisoCeroNoSeCuentaComoQuitado()
    {
        // NormalizeFloors convierte el 0 en 1 cuando falta la 1, asi que un 0 previo
        // no debe disparar una baja en cascada sobre el piso base.
        var removed = BuildingFloorNormalizer.FloorsRemovedFrom("[0,1]", "[1]");

        Assert.Empty(removed);
    }

    [Fact]
    public void ToleraJsonInvalido()
    {
        Assert.Empty(BuildingFloorNormalizer.FloorsRemovedFrom("no-json", "[1]"));
        Assert.Empty(BuildingFloorNormalizer.ParseFloors("no-json"));
        Assert.Empty(BuildingFloorNormalizer.ParseFloors(null));
    }
}