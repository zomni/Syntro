namespace Syntro.API.Models;

public class Equipment : AuditableEntity
{
    public string Name { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty; // PC, Projector, Server, Printer, etc.
    public string SerialNumber { get; set; } = string.Empty;
    public string Status { get; set; } = "active"; // active, maintenance, inactive
    public string? Notes { get; set; }

    public Guid LocationId { get; set; }
    public Location Location { get; set; } = null!;
}
