namespace Syntro.API.Models;

public abstract class AuditableEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;
    public DateTime? DeletedAtUtc { get; set; }
    public string CreatedBy { get; set; } = string.Empty;
    public string UpdatedBy { get; set; } = string.Empty;
    public string DeletedBy { get; set; } = string.Empty;
    public int Version { get; set; }
    public bool IsActive { get; set; } = true;

    public void SoftDelete(string? by)
    {
        DeletedAtUtc = DateTime.UtcNow;
        DeletedBy = by ?? string.Empty;
        IsActive = false;
    }

    public void Restore(string? by)
    {
        DeletedAtUtc = null;
        DeletedBy = string.Empty;
        IsActive = true;
        UpdatedBy = by ?? UpdatedBy;
    }
}
