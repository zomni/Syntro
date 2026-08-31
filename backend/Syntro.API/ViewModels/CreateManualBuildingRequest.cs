namespace Syntro.API.ViewModels;

public class CreateManualBuildingRequest
{
    public string ExternalId { get; set; } = string.Empty;
    public string Campus { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Type { get; set; } = "manual";
    public string Notes { get; set; } = string.Empty;
    public string FloorsCsv { get; set; } = string.Empty;
    public List<List<double>> Coordinates { get; set; } = new();
}
