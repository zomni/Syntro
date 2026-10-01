using Microsoft.EntityFrameworkCore;
using Syntro.API.Data;
using Syntro.API.Models;

namespace Syntro.API.Services;

public sealed record InventorySectorResolution(
    bool IsValid,
    string? Error,
    string RoomExternalId,
    string BuildingExternalId,
    int? Floor)
{
    public static InventorySectorResolution Invalid(string error) =>
        new(false, error, string.Empty, string.Empty, null);

    public static InventorySectorResolution Valid(string roomExternalId, string buildingExternalId, int? floor) =>
        new(true, null, roomExternalId, buildingExternalId, floor);
}

public sealed class InventoryAssignmentService
{
    public const int MaxBuildingExternalIdLength = 100;
    public const int MaxRoomExternalIdLength = 120;
    public const int MaxAssignmentNotesLength = 500;

    private readonly AppDbContext _context;

    public InventoryAssignmentService(AppDbContext context)
    {
        _context = context;
    }

    public async Task<InventorySectorResolution> ResolveSectorAsync(
        string? assignedRoomExternalId,
        bool strict,
        CancellationToken cancellationToken = default)
    {
        var roomExternalId = assignedRoomExternalId?.Trim() ?? string.Empty;

        if (roomExternalId.Length > MaxRoomExternalIdLength)
        {
            return InventorySectorResolution.Invalid(
                $"El identificador de sala supera los {MaxRoomExternalIdLength} caracteres.");
        }

        if (string.IsNullOrWhiteSpace(roomExternalId))
        {
            return InventorySectorResolution.Valid(string.Empty, string.Empty, null);
        }

        var syncedRoom = await _context.SyncedRooms
            .AsNoTracking()
            .FirstOrDefaultAsync(
                candidate => candidate.ExternalId == roomExternalId && candidate.DeletedAtUtc == null,
                cancellationToken);

        if (syncedRoom != null)
        {
            return InventorySectorResolution.Valid(
                syncedRoom.ExternalId,
                syncedRoom.BuildingExternalId,
                syncedRoom.ManualFloor ?? syncedRoom.Floor);
        }

        var manualRoom = await _context.ManualRooms
            .AsNoTracking()
            .FirstOrDefaultAsync(
                candidate => candidate.ExternalId == roomExternalId && candidate.DeletedAtUtc == null,
                cancellationToken);

        if (manualRoom != null)
        {
            return InventorySectorResolution.Valid(
                manualRoom.ExternalId,
                manualRoom.BuildingExternalId,
                manualRoom.Floor);
        }

        if (strict)
        {
            return InventorySectorResolution.Invalid($"No se encontro la sala o sector '{roomExternalId}'.");
        }

        return InventorySectorResolution.Valid(string.Empty, string.Empty, null);
    }

    public async Task<InventorySectorResolution> ResolveAssignmentAsync(
        string? assignedRoomExternalId,
        string? assignedBuildingExternalId,
        int? assignedFloor,
        bool strict,
        CancellationToken cancellationToken = default)
    {
        var buildingExternalId = assignedBuildingExternalId?.Trim() ?? string.Empty;

        if (buildingExternalId.Length > MaxBuildingExternalIdLength)
        {
            return InventorySectorResolution.Invalid(
                $"El identificador de edificio supera los {MaxBuildingExternalIdLength} caracteres.");
        }

        var sector = await ResolveSectorAsync(assignedRoomExternalId, strict, cancellationToken);
        if (!sector.IsValid)
        {
            return sector;
        }

        var roomExternalId = sector.RoomExternalId;
        var floor = assignedFloor;

        if (roomExternalId.Length > 0)
        {
            buildingExternalId = sector.BuildingExternalId;
            floor = sector.Floor;
        }

        if (string.IsNullOrWhiteSpace(buildingExternalId))
        {
            roomExternalId = string.Empty;
            floor = null;
        }

        return InventorySectorResolution.Valid(roomExternalId, buildingExternalId, floor);
    }

    public static bool ApplySector(ImportedInventoryItem item, InventorySectorResolution sector)
    {
        var roomChanged = !string.Equals(item.AssignedRoomExternalId ?? string.Empty, sector.RoomExternalId, StringComparison.Ordinal);
        var buildingChanged = !string.Equals(item.AssignedBuildingExternalId ?? string.Empty, sector.BuildingExternalId, StringComparison.Ordinal);
        var floorChanged = item.AssignedFloor != sector.Floor;

        if (!roomChanged && !buildingChanged && !floorChanged)
        {
            return false;
        }

        item.AssignedRoomExternalId = sector.RoomExternalId;
        item.AssignedBuildingExternalId = sector.BuildingExternalId;
        item.AssignedFloor = sector.Floor;
        item.AssignmentUpdatedAtUtc = DateTime.UtcNow;

        return true;
    }

    public static bool ClearSector(ImportedInventoryItem item)
    {
        if (string.IsNullOrWhiteSpace(item.AssignedRoomExternalId))
        {
            return false;
        }

        item.AssignedRoomExternalId = string.Empty;
        item.AssignmentUpdatedAtUtc = DateTime.UtcNow;

        return true;
    }
}