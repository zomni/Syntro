using System.ComponentModel.DataAnnotations;

namespace Syntro.API.Models;

public class ManualRoom : AuditableEntity
{
    [Required]
    [MaxLength(120)]
    public string ExternalId { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string BuildingExternalId { get; set; } = string.Empty;

    public int Floor { get; set; }

    [Required]
    [MaxLength(200)]
    public string DisplayName { get; set; } = string.Empty;

    [MaxLength(100)]
    public string ShortName { get; set; } = string.Empty;

    [MaxLength(100)]
    public string Type { get; set; } = "sala";

    [MaxLength(100)]
    public string Unit { get; set; } = string.Empty;

    [MaxLength(100)]
    public string Service { get; set; } = string.Empty;

    [MaxLength(50)]
    public string Status { get; set; } = "active";

    public int? Capacity { get; set; }

    public string GeometryJson { get; set; } = string.Empty;

    [MaxLength(50)]
    public string Source { get; set; } = "manual";

    [MaxLength(2000)]
    public string Notes { get; set; } = string.Empty;
}
