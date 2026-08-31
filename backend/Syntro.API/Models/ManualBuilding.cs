namespace Syntro.API.Models;

public class ManualBuilding : AuditableEntity
{
    public string ExternalId { get; set; } = string.Empty;
    public string Campus { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string Type { get; set; } = "manual";
    public string Notes { get; set; } = string.Empty;
    public string FloorsJson { get; set; } = "[]";
    public string GeometryJson { get; set; } = string.Empty;
    public double? CentroidLatitude { get; set; }
    public double? CentroidLongitude { get; set; }
}
