namespace Syntro.API.ViewModels;

public class NetworkTelemetryMatchingQueryRequest
{
    public string Search { get; set; } = string.Empty;
    public string MatchState { get; set; } = string.Empty;
    public string RiskLevel { get; set; } = string.Empty;
    public string MatchKey { get; set; } = string.Empty;
    public string SortBy { get; set; } = "risk";
    public string SortDirection { get; set; } = "desc";
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 10;
}

public class NetworkTelemetryMatchingItemViewModel
{
    public Guid ObservationId { get; set; }
    public string DeviceName { get; set; } = string.Empty;
    public string Username { get; set; } = string.Empty;
    public string IpAddress { get; set; } = string.Empty;
    public string HostName { get; set; } = string.Empty;
    public string MacAddress { get; set; } = string.Empty;
    public string SerialNumber { get; set; } = string.Empty;
    public string RiskLevel { get; set; } = string.Empty;
    public int RiskScore { get; set; }
    public string BuildingExternalId { get; set; } = string.Empty;
    public string RoomExternalId { get; set; } = string.Empty;
    public string MatchKey { get; set; } = string.Empty;
    public string MatchKeyLabel { get; set; } = string.Empty;
    public bool Matched { get; set; }
    public Guid? InventoryItemId { get; set; }
    public string InventoryItemNumber { get; set; } = string.Empty;
    public string InventorySerial { get; set; } = string.Empty;
    public string InventoryDescription { get; set; } = string.Empty;
    public string InventoryResponsibleUser { get; set; } = string.Empty;
    public string InventoryEmail { get; set; } = string.Empty;
    public string InventoryUnitOrDepartment { get; set; } = string.Empty;
    public string InventoryOrganizationalUnit { get; set; } = string.Empty;
    public string InventoryAssignedBuildingExternalId { get; set; } = string.Empty;
    public string InventoryAssignedRoomExternalId { get; set; } = string.Empty;
}

public class NetworkTelemetryMatchingPageViewModel
{
    public Guid SnapshotId { get; set; }
    public string Search { get; set; } = string.Empty;
    public string MatchState { get; set; } = string.Empty;
    public string RiskLevel { get; set; } = string.Empty;
    public string MatchKey { get; set; } = string.Empty;
    public string SortBy { get; set; } = "risk";
    public string SortDirection { get; set; } = "desc";
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 10;
    public int TotalCount { get; set; }
    public int TotalPages { get; set; } = 1;
    public IReadOnlyList<NetworkTelemetryMatchingItemViewModel> Items { get; set; } = [];
}

public class NetworkTelemetryMatchingSummaryViewModel
{
    public Guid SnapshotId { get; set; }
    public bool Found { get; set; }
    public string SourceName { get; set; } = string.Empty;
    public string SourceType { get; set; } = string.Empty;
    public string RiskLevel { get; set; } = string.Empty;
    public int RiskScore { get; set; }
    public DateTime? ObservedAtUtc { get; set; }
    public int DeviceCount { get; set; }
    public int MatchedCount { get; set; }
    public int UnmatchedCount { get; set; }
    public double MatchRate { get; set; }
    public IReadOnlyDictionary<string, int> MatchKeyCounts { get; set; } = new Dictionary<string, int>();
    public IReadOnlyDictionary<string, int> MatchedByRiskLevel { get; set; } = new Dictionary<string, int>();
    public IReadOnlyDictionary<string, int> UnmatchedByRiskLevel { get; set; } = new Dictionary<string, int>();
    public IReadOnlyList<NetworkTelemetryMatchingItemViewModel> TopUnmatched { get; set; } = [];
}

public class NetworkTelemetryRematchResultViewModel
{
    public Guid SnapshotId { get; set; }
    public string Status { get; set; } = string.Empty;
    public int DeviceCount { get; set; }
    public int MatchedCount { get; set; }
    public int UnmatchedCount { get; set; }
    public int ChangedCount { get; set; }
    public IReadOnlyDictionary<string, int> MatchKeyCounts { get; set; } = new Dictionary<string, int>();
}
