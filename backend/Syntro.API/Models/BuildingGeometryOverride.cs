namespace Syntro.API.Models;

public class BuildingGeometryOverride : AuditableEntity
{
    public string BuildingExternalId { get; set; } = string.Empty;

    // 0 = aplica a todos los pisos (filas legadas); valores distintos = piso concreto.
    public int Floor { get; set; }

    public string GeometryJson { get; set; } = string.Empty;
    public double? CentroidLatitude { get; set; }
    public double? CentroidLongitude { get; set; }
}
