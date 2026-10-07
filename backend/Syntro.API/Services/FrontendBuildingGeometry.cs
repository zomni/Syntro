using System.Text.Json;
using Microsoft.Extensions.Configuration;

namespace Syntro.API.Services;

public static class FrontendBuildingGeometry
{
    public static string? ResolveDataDirectory(IConfiguration configuration)
    {
        var configuredPath = configuration["FrontendDataPath"];
        if (!string.IsNullOrWhiteSpace(configuredPath) && Directory.Exists(configuredPath))
            return Path.GetFullPath(configuredPath);

        const string dockerPath = "/app/frontend-data";
        if (Directory.Exists(dockerPath))
            return dockerPath;

        return null;
    }

    /// <summary>
    /// Devuelve el GeoJSON de geometria (raw) de un edificio en los archivos del frontend.
    /// Si se indica piso, se busca primero en cs_sotero_{piso}.json y luego en el resto.
    /// </summary>
    public static string? FindGeometryJson(IConfiguration configuration, string externalId, int? floor = null)
    {
        var geometryDir = ResolveDataDirectory(configuration);
        if (geometryDir is null || !Directory.Exists(geometryDir))
            return null;

        var floorFiles = Directory.GetFiles(geometryDir, "cs_sotero_*.json");
        var ordered = floor is null
            ? floorFiles
            : floorFiles
                .OrderBy(file => Path.GetFileName(file) == $"cs_sotero_{floor}.json" ? 0 : 1)
                .ToArray();

        foreach (var file in ordered)
        {
            try
            {
                var json = File.ReadAllText(file);
                using var doc = JsonDocument.Parse(json);
                if (!doc.RootElement.TryGetProperty("features", out var features))
                    continue;

                foreach (var feature in features.EnumerateArray())
                {
                    if (!feature.TryGetProperty("properties", out var props))
                        continue;
                    if (!props.TryGetProperty("id", out var idProp))
                        continue;
                    if (idProp.GetString() != externalId)
                        continue;
                    if (!feature.TryGetProperty("geometry", out var geometry))
                        continue;

                    return geometry.GetRawText();
                }
            }
            catch
            {
                // Archivo corrupto o ilegible: se ignora y se sigue con el siguiente.
            }
        }

        return null;
    }
}
