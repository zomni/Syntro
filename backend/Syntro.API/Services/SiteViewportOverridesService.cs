using System.Text.Json;

namespace Syntro.API.Services;

public class SiteViewportOverridesService
{
    private readonly string _overridesFilePath;
    private readonly ILogger<SiteViewportOverridesService> _logger;
    private readonly object _lock = new();
    private Dictionary<string, SiteViewportOverrides>? _overrides;

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true
    };

    public SiteViewportOverridesService(IWebHostEnvironment env, ILogger<SiteViewportOverridesService> logger)
    {
        _logger = logger;

        var dataRoot = ResolveDataRoot(env.ContentRootPath);
        Directory.CreateDirectory(dataRoot);
        _overridesFilePath = Path.Combine(dataRoot, "site-viewport-overrides.json");

        _overrides = LoadOverrides();
    }

    public SiteViewportOverrides? GetOverrides(string campusKey)
    {
        lock (_lock)
        {
            return _overrides?.GetValueOrDefault(campusKey);
        }
    }

    public Dictionary<string, SiteViewportOverrides> GetAllOverrides()
    {
        lock (_lock)
        {
            return _overrides ?? new Dictionary<string, SiteViewportOverrides>();
        }
    }

    public void SetViewport(string campusKey, int minZoom, int maxZoom)
    {
        lock (_lock)
        {
            _overrides ??= new Dictionary<string, SiteViewportOverrides>();
            if (_overrides.TryGetValue(campusKey, out var existing))
            {
                existing.MinZoom = minZoom;
                existing.MaxZoom = maxZoom;
            }
            else
            {
                _overrides[campusKey] = new SiteViewportOverrides { MinZoom = minZoom, MaxZoom = maxZoom };
            }
            Persist();
        }
    }

    public void SetBounds(string campusKey, double[][] bounds)
    {
        lock (_lock)
        {
            _overrides ??= new Dictionary<string, SiteViewportOverrides>();
            if (_overrides.TryGetValue(campusKey, out var existing))
            {
                existing.Bounds = bounds;
            }
            else
            {
                _overrides[campusKey] = new SiteViewportOverrides { Bounds = bounds };
            }
            Persist();
        }
    }

    public bool RemoveBounds(string campusKey)
    {
        lock (_lock)
        {
            if (_overrides is null || !_overrides.TryGetValue(campusKey, out var existing))
            {
                return false;
            }

            existing.Bounds = null;
            Persist();
            return true;
        }
    }

    public string GetOverridesFilePath() => _overridesFilePath;

    private Dictionary<string, SiteViewportOverrides>? LoadOverrides()
    {
        try
        {
            if (File.Exists(_overridesFilePath))
            {
                var json = File.ReadAllText(_overridesFilePath);
                var loaded = JsonSerializer.Deserialize<Dictionary<string, SiteViewportOverrides>>(json, JsonOptions);
                _logger.LogInformation("Viewport overrides cargados desde {Path}", _overridesFilePath);
                return loaded;
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "No se pudo leer site-viewport-overrides.json");
        }

        return null;
    }

    private void Persist()
    {
        try
        {
            var json = JsonSerializer.Serialize(_overrides ?? new Dictionary<string, SiteViewportOverrides>(), JsonOptions);
            File.WriteAllText(_overridesFilePath, json);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "No se pudo persistir site-viewport-overrides.json");
        }
    }

    private static string ResolveDataRoot(string contentRootPath)
    {
        var configuredRoot = Environment.GetEnvironmentVariable("SQLITE_DATA_ROOT");
        if (!string.IsNullOrWhiteSpace(configuredRoot))
        {
            return configuredRoot;
        }

        if (Directory.Exists("/app/data"))
        {
            return "/app/data";
        }

        return Path.Combine(contentRootPath, "data");
    }
}

public class SiteViewportOverrides
{
    public int MinZoom { get; set; } = 0;
    public int MaxZoom { get; set; } = 19;
    public double[][]? Bounds { get; set; }
}
