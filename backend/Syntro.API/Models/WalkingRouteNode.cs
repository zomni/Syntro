namespace Syntro.API.Models;

public class WalkingRouteNode : AuditableEntity
{
    public string ExternalId { get; set; } = string.Empty;
    public string Campus { get; set; } = string.Empty;
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public string Notes { get; set; } = string.Empty;
}
