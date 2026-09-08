using System.ComponentModel.DataAnnotations;

namespace Syntro.API.Models;

public class RoomGeometryOverride : AuditableEntity
{
    [Required]
    [MaxLength(120)]
    public string RoomExternalId { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string BuildingExternalId { get; set; } = string.Empty;

    public string GeometryJson { get; set; } = string.Empty;

    public double? CentroidLatitude { get; set; }

    public double? CentroidLongitude { get; set; }
}
