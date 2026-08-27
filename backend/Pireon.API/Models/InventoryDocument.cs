namespace Pireon.API.Models;

public class InventoryDocument : AuditableEntity
{
    public Guid InventoryItemId { get; set; }
    public string OriginalFileName { get; set; } = string.Empty;
    public string StoredFileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = "application/octet-stream";
    public long SizeBytes { get; set; }
    public string Source { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;

    public ImportedInventoryItem InventoryItem { get; set; } = null!;
}
