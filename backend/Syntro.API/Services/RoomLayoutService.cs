using Microsoft.EntityFrameworkCore;
using Syntro.API.Data;
using Syntro.API.Models;

namespace Syntro.API.Services;

public class RoomLayoutService
{
    private readonly AppDbContext _context;

    public RoomLayoutService(AppDbContext context)
    {
        _context = context;
    }

    public async Task<List<RoomLayoutDto>> GetCombinedRoomsAsync(
        string buildingExternalId, int floor, CancellationToken ct = default)
    {
        var syncedRooms = await _context.SyncedRooms
            .AsNoTracking()
            .Where(r => r.BuildingExternalId == buildingExternalId && r.Floor == floor)
            .ToListAsync(ct);

        var overrides = await _context.RoomGeometryOverrides
            .AsNoTracking()
            .Where(o => o.BuildingExternalId == buildingExternalId)
            .ToListAsync(ct);

        var overrideMap = overrides.ToDictionary(o => o.RoomExternalId, o => o);

        var manualRooms = await _context.ManualRooms
            .AsNoTracking()
            .Where(r => r.BuildingExternalId == buildingExternalId
                && r.Floor == floor
                && r.DeletedAtUtc == null)
            .ToListAsync(ct);

        var result = new List<RoomLayoutDto>();

        foreach (var room in syncedRooms)
        {
            var dto = new RoomLayoutDto
            {
                ExternalId = room.ExternalId,
                BuildingExternalId = room.BuildingExternalId,
                Floor = room.ManualFloor ?? room.Floor,
                DisplayName = room.EffectiveName,
                ShortName = room.ShortName,
                Type = room.Type,
                Unit = room.Unit,
                Service = room.Service,
                Status = room.Status,
                Capacity = room.Capacity,
                Source = "synced",
                IsManual = false
            };

            if (overrideMap.TryGetValue(room.ExternalId, out var ovr))
            {
                dto.GeometryJson = ovr.GeometryJson;
                dto.HasGeometryOverride = true;
            }
            else
            {
                dto.GeometryJson = room.GeometryJson;
            }

            result.Add(dto);
        }

        foreach (var room in manualRooms)
        {
            result.Add(new RoomLayoutDto
            {
                ExternalId = room.ExternalId,
                BuildingExternalId = room.BuildingExternalId,
                Floor = room.Floor,
                DisplayName = room.DisplayName,
                ShortName = room.ShortName,
                Type = room.Type,
                Unit = room.Unit,
                Service = room.Service,
                Status = room.Status,
                Capacity = room.Capacity,
                GeometryJson = room.GeometryJson,
                Source = room.Source,
                IsManual = true
            });
        }

        return result
            .OrderBy(r => r.Floor)
            .ThenBy(r => r.Type)
            .ThenBy(r => r.DisplayName)
            .ToList();
    }

    public async Task<List<FloorSummaryDto>> GetFloorsAsync(
        string buildingExternalId, CancellationToken ct = default)
    {
        var syncedFloors = await _context.SyncedRooms
            .AsNoTracking()
            .Where(r => r.BuildingExternalId == buildingExternalId)
            .GroupBy(r => r.Floor)
            .Select(g => new FloorSummaryDto
            {
                Floor = g.Key,
                SyncedCount = g.Count(),
                ManualCount = 0
            })
            .ToListAsync(ct);

        var manualFloors = await _context.ManualRooms
            .AsNoTracking()
            .Where(r => r.BuildingExternalId == buildingExternalId && r.DeletedAtUtc == null)
            .GroupBy(r => r.Floor)
            .Select(g => new { Floor = g.Key, Count = g.Count() })
            .ToListAsync(ct);

        var manualMap = manualFloors.ToDictionary(f => f.Floor, f => f.Count);

        var allFloors = syncedFloors
            .Select(f => f)
            .ToList();

        foreach (var mf in manualFloors)
        {
            var existing = allFloors.FirstOrDefault(f => f.Floor == mf.Floor);
            if (existing != null)
            {
                existing.ManualCount = mf.Count;
            }
            else
            {
                allFloors.Add(new FloorSummaryDto
                {
                    Floor = mf.Floor,
                    SyncedCount = 0,
                    ManualCount = mf.Count
                });
            }
        }

        var declaredFloors = await LoadDeclaredFloorsAsync(buildingExternalId, ct);

        foreach (var floor in declaredFloors)
        {
            if (allFloors.Any(f => f.Floor == floor)) continue;

            allFloors.Add(new FloorSummaryDto
            {
                Floor = floor,
                SyncedCount = 0,
                ManualCount = 0
            });
        }

        return allFloors.OrderBy(f => f.Floor).ToList();
    }

    private async Task<List<int>> LoadDeclaredFloorsAsync(
        string buildingExternalId, CancellationToken ct = default)
    {
        var syncedFloorsJson = await _context.SyncedBuildings
            .AsNoTracking()
            .Where(b => b.ExternalId == buildingExternalId)
            .Select(b => b.ManualFloorsJson != "" ? b.ManualFloorsJson : b.FloorsJson)
            .FirstOrDefaultAsync(ct);

        if (!string.IsNullOrWhiteSpace(syncedFloorsJson))
        {
            return ParseFloorList(syncedFloorsJson);
        }

        var manualFloorsJson = await _context.ManualBuildings
            .AsNoTracking()
            .Where(b => b.ExternalId == buildingExternalId)
            .Select(b => b.FloorsJson)
            .FirstOrDefaultAsync(ct);

        return string.IsNullOrWhiteSpace(manualFloorsJson)
            ? new List<int>()
            : ParseFloorList(manualFloorsJson);
    }

    private static List<int> ParseFloorList(string floorsJson)
    {
        try
        {
            var floors = System.Text.Json.JsonSerializer.Deserialize<List<int>>(floorsJson);
            return floors ?? new List<int>();
        }
        catch
        {
            return new List<int>();
        }
    }
}

public class RoomLayoutDto
{
    public string ExternalId { get; set; } = string.Empty;
    public string BuildingExternalId { get; set; } = string.Empty;
    public int Floor { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public string ShortName { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string Unit { get; set; } = string.Empty;
    public string Service { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public int? Capacity { get; set; }
    public string GeometryJson { get; set; } = string.Empty;
    public string Source { get; set; } = string.Empty;
    public bool IsManual { get; set; }
    public bool HasGeometryOverride { get; set; }
}

public class FloorSummaryDto
{
    public int Floor { get; set; }
    public int SyncedCount { get; set; }
    public int ManualCount { get; set; }
    public int TotalCount => SyncedCount + ManualCount;
}
