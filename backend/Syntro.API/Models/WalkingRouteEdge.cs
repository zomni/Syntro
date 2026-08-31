namespace Syntro.API.Models;

public class WalkingRouteEdge : AuditableEntity
{
    public string ExternalId { get; set; } = string.Empty;
    public string Campus { get; set; } = string.Empty;
    public string FromNodeExternalId { get; set; } = string.Empty;
    public string ToNodeExternalId { get; set; } = string.Empty;
    public double DistanceMeters { get; set; }
    public string Status { get; set; } = "open";
    public string Notes { get; set; } = string.Empty;
}
