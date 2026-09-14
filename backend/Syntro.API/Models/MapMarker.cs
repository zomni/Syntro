using System.ComponentModel.DataAnnotations;

namespace Syntro.API.Models;

public class MapMarker : AuditableEntity
{
    [Required]
    [MaxLength(120)]
    public string ExternalId { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string Campus { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string BuildingExternalId { get; set; } = string.Empty;

    public int Floor { get; set; }

    public double Latitude { get; set; }

    public double Longitude { get; set; }

    [Required]
    [MaxLength(120)]
    public string IconKey { get; set; } = string.Empty;

    [MaxLength(200)]
    public string Label { get; set; } = string.Empty;

    [MaxLength(1000)]
    public string Notes { get; set; } = string.Empty;

    [MaxLength(50)]
    public string Source { get; set; } = "manual";
}