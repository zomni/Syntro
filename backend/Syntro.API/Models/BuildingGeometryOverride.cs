namespace Syntro.API.Models;

public class BuildingGeometryOverride : AuditableEntity
{
    public string BuildingExternalId { get; set; } = string.Empty;
    public string GeometryJson { get; set; } = string.Empty;
    public double? CentroidLatitude { get; set; }
    public double? CentroidLongitude { get; set; }
}
