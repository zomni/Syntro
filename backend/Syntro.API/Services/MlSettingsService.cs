using System.Text.Json;

namespace Syntro.API.Services;

public class MlSettingsService
{
    private readonly string _stateFilePath;
    private readonly ILogger<MlSettingsService> _logger;
    private volatile bool _isEnabled;

    public bool IsEnabled => _isEnabled;

    public MlSettingsService(IConfiguration configuration, IWebHostEnvironment env, ILogger<MlSettingsService> logger)
    {
        _logger = logger;

        var stateDir = Path.Combine(env.ContentRootPath, "data");
        Directory.CreateDirectory(stateDir);
        _stateFilePath = Path.Combine(stateDir, "ml-state.json");

        _isEnabled = LoadInitialState(configuration);
    }

    private bool LoadInitialState(IConfiguration configuration)
    {
        try
        {
            if (File.Exists(_stateFilePath))
            {
                var json = File.ReadAllText(_stateFilePath);
                var doc = JsonDocument.Parse(json);
                if (doc.RootElement.TryGetProperty("enabled", out var prop))
                {
                    var value = prop.GetBoolean();
                    _logger.LogInformation("ML state cargado desde ml-state.json: {Enabled}", value);
                    return value;
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "No se pudo leer ml-state.json, usando config por defecto");
        }

        var defaultValue = configuration.GetValue<bool?>("MlSettings:Enabled") ?? false;
        _logger.LogInformation("ML state inicial desde config: {Enabled}", defaultValue);
        return defaultValue;
    }

    public void Toggle(bool enabled)
    {
        _isEnabled = enabled;
        Persist();
    }

    private void Persist()
    {
        try
        {
            var json = JsonSerializer.Serialize(new { enabled = _isEnabled }, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(_stateFilePath, json);
            _logger.LogInformation("ML state persistido: {Enabled}", _isEnabled);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "No se pudo persistir ml-state.json");
        }
    }
}
