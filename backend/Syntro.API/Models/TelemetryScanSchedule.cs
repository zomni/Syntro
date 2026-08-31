namespace Syntro.API.Models;

public class TelemetryScanSchedule : AuditableEntity
{
    public string Label { get; set; } = string.Empty;
    public string Cron { get; set; } = string.Empty;
    public string TimeZone { get; set; } = "America/Santiago";
    public string CampusKey { get; set; } = string.Empty;
    public bool IsEnabled { get; set; } = true;
    public int SortOrder { get; set; }
}
