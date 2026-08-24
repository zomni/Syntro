namespace Pireon.API.ViewModels;

public class ScheduleSlotDto
{
    public string Time { get; set; } = "08:30";
    public List<string> Days { get; set; } = new();
}

public class TelemetryScanScheduleDto
{
    public Guid Id { get; set; }
    public string Label { get; set; } = string.Empty;
    public string Cron { get; set; } = string.Empty;
    public string TimeZone { get; set; } = "America/Santiago";
    public string CampusKey { get; set; } = string.Empty;
    public bool IsEnabled { get; set; } = true;
    public int SortOrder { get; set; }
    public bool IsValid { get; set; }
    public string ValidationError { get; set; } = string.Empty;
    public DateTime? NextOccurrenceUtc { get; set; }
    public DateTime? NextOccurrenceLocal { get; set; }
    public List<ScheduleSlotDto> ScheduleSlots { get; set; } = new();
}

public class TelemetryScanScheduleRequest
{
    public string Label { get; set; } = string.Empty;
    public string? Cron { get; set; }
    public List<ScheduleSlotDto>? Slots { get; set; }
    public string TimeZone { get; set; } = "America/Santiago";
    public string CampusKey { get; set; } = string.Empty;
    public bool IsEnabled { get; set; } = true;
    public int SortOrder { get; set; }
}
