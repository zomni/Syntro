using System.Text.Json;

namespace Syntro.API.Services;

public static class BuildingFloorNormalizer
{
    public static string NormalizeCsv(string? floorsCsv)
    {
        var rawValue = floorsCsv?.Trim() ?? string.Empty;
        if (string.IsNullOrWhiteSpace(rawValue))
            return string.Empty;

        var floors = rawValue
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(value => int.TryParse(value, out _))
            .Select(int.Parse)
            .ToList();

        return NormalizeFloors(floors);
    }

    public static string NormalizeJson(string? floorsJson)
    {
        if (string.IsNullOrWhiteSpace(floorsJson))
            return string.Empty;

        try
        {
            var floors = JsonSerializer.Deserialize<List<int>>(floorsJson) ?? new List<int>();
            return NormalizeFloors(floors);
        }
        catch
        {
            return floorsJson.Trim();
        }
    }

    public static string NormalizeFloors(IEnumerable<int> floors)
    {
        var normalized = floors
            .Distinct()
            .OrderBy(value => value)
            .ToList();

        // El piso 0 no es un piso real: RemoveFloorZero lo consolido en el 1
        // porque ambos son el mismo espacio. Se reemplaza, no se conserva.
        if (normalized.Remove(0))
        {
            if (!normalized.Contains(1))
            {
                normalized.Add(1);
            }

            normalized.Sort();
        }

        return normalized.Count == 0 ? string.Empty : JsonSerializer.Serialize(normalized);
    }

    public static List<int> ParseFloors(string? floorsJson)
    {
        if (string.IsNullOrWhiteSpace(floorsJson))
        {
            return [];
        }

        try
        {
            return JsonSerializer.Deserialize<List<int>>(floorsJson) ?? [];
        }
        catch
        {
            return [];
        }
    }

    public static List<int> FloorsRemovedFrom(string? previousFloorsJson, string? newFloorsJson)
    {
        var previous = ParseFloors(previousFloorsJson);
        var current = ParseFloors(newFloorsJson);
        var removed = previous.Except(current).ToList();

        // NormalizeFloors convierte el 0 en 1 cuando falta la 1, asi que un
        // "0" previo nunca esta en la lista vigente: se descarta para no dar de
        // baja el piso base por un cambio que en realidad no lo quito.
        removed.RemoveAll(floor => floor == 0);

        removed.Sort();
        return removed;
    }
}
