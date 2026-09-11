using System.ComponentModel.DataAnnotations;

namespace Syntro.API.Models;

public class BuildingAnnotation : AuditableEntity
{
    [Required]
    [MaxLength(120)]
    public string ExternalId { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string BuildingExternalId { get; set; } = string.Empty;

    public int Floor { get; set; }

    [Required]
    [MaxLength(50)]
    public string AnnotationType { get; set; } = "door";

    public string GeometryJson { get; set; } = string.Empty;

    [MaxLength(50)]
    public string Source { get; set; } = "manual";
}