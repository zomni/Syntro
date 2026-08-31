using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Syntro.API.Data;
using Syntro.API.ML;
using Syntro.API.ML.Models;
using Syntro.API.Models;
using Syntro.API.ViewModels;

namespace Syntro.API.Services;

public class NetworkTelemetryService
{
    private readonly AppDbContext _context;
    private readonly IConfiguration _configuration;
    private readonly AuditLogService _auditLogService;
    private readonly RiskPredictionService _riskPredictionService;
    private readonly MlSettingsService _mlSettings;
    private readonly ILogger<NetworkTelemetryService> _logger;
    private readonly TimeZoneInfo _displayTimeZone;
    private readonly CultureInfo _displayCulture;

    public NetworkTelemetryService(
        AppDbContext context,
        IConfiguration configuration,
        AuditLogService auditLogService,
        RiskPredictionService riskPredictionService,
        MlSettingsService mlSettings,
        ILogger<NetworkTelemetryService> logger)
    {
        _context = context;
        _configuration = configuration;
        _auditLogService = auditLogService;
        _riskPredictionService = riskPredictionService;
        _mlSettings = mlSettings;
        _logger = logger;
        _displayTimeZone = TelemetryTimeSettings.ResolveTimeZone(configuration);
        _displayCulture = TelemetryTimeSettings.ResolveCulture(configuration);
    }

    private static IQueryable<NetworkTelemetrySnapshot> ApplyCampusScope(
        IQueryable<NetworkTelemetrySnapshot> query,
        IReadOnlyCollection<string>? campusKeys)
    {
        if (campusKeys is null)
        {
            return query;
        }

        if (campusKeys.Count == 0)
        {
            return query.Where(snapshot => false);
        }

        return query.Where(snapshot => campusKeys.Contains(snapshot.CampusKey));
    }

    private async Task<bool> SnapshotIsScopedAsync(
        Guid snapshotId,
        IReadOnlyCollection<string>? campusKeys,
        CancellationToken cancellationToken = default)
    {
        if (campusKeys is null)
        {
            return true;
        }

        if (campusKeys.Count == 0)
        {
            return false;
        }

        return await _context.NetworkTelemetrySnapshots
            .AsNoTracking()
            .Where(snapshot => snapshot.Id == snapshotId && campusKeys.Contains(snapshot.CampusKey))
            .AnyAsync(cancellationToken);
    }

    public bool IsEnabled()
        => _configuration.GetValue<bool?>("NetworkTelemetrySettings:Enabled") ?? true;

    public int FreshnessMinutes()
        => _configuration.GetValue<int?>("NetworkTelemetrySettings:FreshnessMinutes") ?? 30;

    public int RetentionDays()
        => _configuration.GetValue<int?>("NetworkTelemetrySettings:RetentionDays") ?? 90;

    public int MaxSnapshots()
        => _configuration.GetValue<int?>("NetworkTelemetrySettings:MaxSnapshots") ?? 100;

    public string? IngestApiKey()
        => _configuration["NetworkTelemetrySettings:IngestApiKey"];

    public async Task<NetworkTelemetryDashboardViewModel> GetDashboardAsync(
        int take = 10,
        Guid? selectedSnapshotId = null,
        IReadOnlyCollection<string>? campusKeys = null,
        CancellationToken cancellationToken = default)
    {
        take = Math.Clamp(take, 1, 50);

        var snapshots = await ApplyCampusScope(
                _context.NetworkTelemetrySnapshots.AsNoTracking(),
                campusKeys)
            .OrderByDescending(snapshot => snapshot.ObservedAtUtc)
            .ThenByDescending(snapshot => snapshot.Id)
            .Take(take)
            .ToListAsync(cancellationToken);

        var latest = snapshots.FirstOrDefault();
        NetworkTelemetrySnapshot? activeSnapshot = latest;
        if (selectedSnapshotId.HasValue && selectedSnapshotId.Value != Guid.Empty)
        {
            activeSnapshot = await ApplyCampusScope(
                    _context.NetworkTelemetrySnapshots.AsNoTracking(),
                    campusKeys)
                .FirstOrDefaultAsync(snapshot => snapshot.Id == selectedSnapshotId.Value, cancellationToken)
                ?? latest;
        }

        var enabled = IsEnabled();
        var nowUtc = DateTime.UtcNow;
        var freshnessWindow = TimeSpan.FromMinutes(FreshnessMinutes());
        var isFresh = activeSnapshot is not null && (nowUtc - activeSnapshot.ObservedAtUtc) <= freshnessWindow;

        var healthLabel = !enabled
            ? "Deshabilitado"
            : activeSnapshot is null
                ? "Sin datos"
                : isFresh
                    ? "Activo"
                    : "Desactualizado";

        var healthTone = !enabled
            ? "secondary"
            : activeSnapshot is null
                ? "warning"
                : isFresh
                    ? "success"
                    : "warning";

        var topRiskObservations = activeSnapshot is null
            ? []
            : await GetTopRiskObservationsAsync(activeSnapshot.Id, 10, null, cancellationToken);
        var buildingRiskSummaries = activeSnapshot is null
            ? []
            : await GetBuildingRiskSummariesAsync(activeSnapshot.Id, null, cancellationToken);
        var subnetRiskSummaries = activeSnapshot is null
            ? []
            : await GetSubnetRiskSummariesAsync(activeSnapshot.Id, null, cancellationToken);
        var sessionOverview = await GetSessionOverviewAsync(activeSnapshot?.Id, null, cancellationToken);

        return new NetworkTelemetryDashboardViewModel
        {
            Enabled = enabled,
            HasData = activeSnapshot is not null,
            IsFresh = isFresh,
            HealthLabel = healthLabel,
            HealthTone = healthTone,
            LatestSourceName = activeSnapshot?.SourceName ?? string.Empty,
            LatestSourceType = activeSnapshot?.SourceType ?? string.Empty,
            LatestRiskLevel = activeSnapshot?.RiskLevel ?? string.Empty,
            LatestStatus = activeSnapshot?.Status ?? string.Empty,
            Notes = activeSnapshot?.Notes ?? string.Empty,
            LatestRiskScore = activeSnapshot?.RiskScore ?? 0,
            TotalSnapshots = snapshots.Count,
            LatestDeviceCount = activeSnapshot?.DeviceCount ?? 0,
            LatestConnectedUserCount = activeSnapshot?.ConnectedUserCount ?? 0,
            LatestHighRiskDeviceCount = activeSnapshot?.HighRiskDeviceCount ?? 0,
            LatestMediumRiskDeviceCount = activeSnapshot?.MediumRiskDeviceCount ?? 0,
            LatestLowRiskDeviceCount = activeSnapshot?.LowRiskDeviceCount ?? 0,
            LatestSnapshotId = latest?.Id ?? Guid.Empty,
            ActiveSnapshotId = activeSnapshot?.Id ?? Guid.Empty,
            IsViewingLatestSnapshot = activeSnapshot?.Id == latest?.Id,
            LatestObservedAtUtc = activeSnapshot?.ObservedAtUtc,
            LatestWindowStartUtc = activeSnapshot?.WindowStartUtc,
            LatestWindowEndUtc = activeSnapshot?.WindowEndUtc,
            GeneratedAtUtc = nowUtc,
            RecentSnapshots = snapshots.Select(MapSnapshot).ToList(),
            TopRiskObservations = topRiskObservations,
            BuildingRiskSummaries = buildingRiskSummaries,
            SubnetRiskSummaries = subnetRiskSummaries,
            SessionOverview = sessionOverview
        };
    }

    public async Task<NetworkTelemetrySessionOverviewViewModel> GetSessionOverviewAsync(
        Guid? snapshotId = null,
        IReadOnlyCollection<string>? campusKeys = null,
        CancellationToken cancellationToken = default)
    {
        NetworkTelemetrySnapshot? latestSnapshot;
        if (snapshotId.HasValue && snapshotId.Value != Guid.Empty)
        {
            latestSnapshot = await ApplyCampusScope(
                    _context.NetworkTelemetrySnapshots.AsNoTracking(),
                    campusKeys)
                .FirstOrDefaultAsync(snapshot => snapshot.Id == snapshotId.Value, cancellationToken);
        }
        else
        {
            latestSnapshot = await ApplyCampusScope(
                    _context.NetworkTelemetrySnapshots.AsNoTracking(),
                    campusKeys)
                .OrderByDescending(snapshot => snapshot.ObservedAtUtc)
                .ThenByDescending(snapshot => snapshot.Id)
                .FirstOrDefaultAsync(cancellationToken);
        }

        if (latestSnapshot is null)
        {
            return new NetworkTelemetrySessionOverviewViewModel();
        }

        var deviceObservations = await _context.NetworkTelemetryObservations
            .AsNoTracking()
            .Where(observation => observation.NetworkTelemetrySnapshotId == latestSnapshot.Id && observation.ObservationType == "device")
            .OrderByDescending(observation => observation.ObservedAtUtc)
            .ThenByDescending(observation => observation.Id)
            .ToListAsync(cancellationToken);

        if (deviceObservations.Count == 0)
        {
            return new NetworkTelemetrySessionOverviewViewModel();
        }

        var userObservations = await _context.NetworkTelemetryObservations
            .AsNoTracking()
            .Where(observation => observation.NetworkTelemetrySnapshotId == latestSnapshot.Id && observation.ObservationType == "user")
            .OrderByDescending(observation => observation.ObservedAtUtc)
            .ThenByDescending(observation => observation.Id)
            .ToListAsync(cancellationToken);

        var sessionUsers = new List<NetworkTelemetrySessionUserViewModel>();
        var activeCount = 0;
        var lockedCount = 0;
        var expiredCount = 0;
        var pendingIdentityCount = 0;
        var inactiveCount = 0;

        if (userObservations.Count > 0)
        {
            foreach (var latestUser in userObservations
                .OrderByDescending(item => item.ObservedAtUtc)
                .ThenByDescending(item => item.Id)
                .GroupBy(item => item.ExternalKey, StringComparer.OrdinalIgnoreCase)
                .Select(group => group.First()))
            {
                var identity = ResolveDisplayIdentity(latestUser);
                var expectedHost = TryExtractHostFromUserExternalKey(latestUser.ExternalKey);
                var linkedDevices = deviceObservations
                    .Where(device =>
                        string.Equals(Normalize(device.Username), Normalize(identity), StringComparison.OrdinalIgnoreCase) &&
                        (string.IsNullOrWhiteSpace(expectedHost) ||
                         string.Equals(Normalize(device.HostName), Normalize(expectedHost), StringComparison.OrdinalIgnoreCase) ||
                         string.Equals(Normalize(device.DeviceName), Normalize(expectedHost), StringComparison.OrdinalIgnoreCase)))
                    .ToList();
                var latestDevice = linkedDevices
                    .OrderByDescending(item => item.ObservedAtUtc)
                    .ThenByDescending(item => item.Id)
                    .FirstOrDefault();
                var sessionState = ResolveUserObservationState(latestUser, latestDevice);
                var sessionStateLabel = sessionState switch
                {
                    "active" => "Conectado",
                    "locked" => "Riesgo alto",
                    "expired" => "Sin respuesta",
                    "mfa-pending" => "Identidad incierta",
                    "inactive" => "Inactivo",
                    _ => "Sin datos"
                };

                switch (sessionState)
                {
                    case "active":
                        activeCount++;
                        break;
                    case "locked":
                        lockedCount++;
                        break;
                    case "expired":
                        expiredCount++;
                        break;
                    case "mfa-pending":
                        pendingIdentityCount++;
                        break;
                    default:
                        inactiveCount++;
                        break;
                }

                sessionUsers.Add(new NetworkTelemetrySessionUserViewModel
                {
                    Username = identity,
                    Role = !string.IsNullOrWhiteSpace(latestDevice?.DeviceCategory) ? latestDevice.DeviceCategory : "user",
                    SessionState = sessionState,
                    SessionStateLabel = sessionStateLabel,
                    EndpointKey = latestUser.ExternalKey,
                    SubnetCidr = latestDevice?.SubnetCidr ?? string.Empty,
                    NetworkProfile = latestDevice?.NetworkProfile ?? string.Empty,
                    OpenPorts = latestDevice?.OpenPorts ?? string.Empty,
                    PingMs = latestDevice?.PingMs,
                    IsOnline = latestDevice?.IsOnline ?? latestUser.IsOnline,
                    RiskScore = Math.Max(latestUser.RiskScore, latestDevice?.RiskScore ?? 0),
                    RiskLevel = (latestDevice?.RiskScore ?? 0) > latestUser.RiskScore ? latestDevice!.RiskLevel : latestUser.RiskLevel,
                    LastLoginAtUtc = latestUser.ObservedAtUtc,
                    LastLogoutAtUtc = latestUser.IsOnline == false ? latestUser.ObservedAtUtc : null,
                    LastMfaVerifiedAtUtc = latestUser.ObservedAtUtc,
                    IsActive = sessionState == "active",
                    LinkedDeviceCount = Math.Max(1, linkedDevices.Count),
                    LastSeenAtUtc = latestDevice?.ObservedAtUtc ?? latestUser.ObservedAtUtc
                });
            }
        }
        else
        {
            foreach (var group in deviceObservations.GroupBy(BuildEndpointIdentity, StringComparer.OrdinalIgnoreCase))
            {
                var latest = group
                    .OrderByDescending(item => item.ObservedAtUtc)
                    .ThenByDescending(item => item.Id)
                    .First();

                var identity = ResolveDisplayIdentity(latest);
                var sessionState = DetermineNetworkSessionState(latest, identity);
                var sessionStateLabel = sessionState switch
                {
                    "active" => "Conectado",
                    "locked" => "Riesgo alto",
                    "expired" => "Sin respuesta",
                    "mfa-pending" => "Identidad incierta",
                    "inactive" => "Inactivo",
                    _ => "Sin datos"
                };

                switch (sessionState)
                {
                    case "active":
                        activeCount++;
                        break;
                    case "locked":
                        lockedCount++;
                        break;
                    case "expired":
                        expiredCount++;
                        break;
                    case "mfa-pending":
                        pendingIdentityCount++;
                        break;
                    default:
                        inactiveCount++;
                        break;
                }

                sessionUsers.Add(new NetworkTelemetrySessionUserViewModel
                {
                    Username = identity,
                    Role = string.IsNullOrWhiteSpace(latest.DeviceCategory) ? "network" : latest.DeviceCategory,
                    SessionState = sessionState,
                    SessionStateLabel = sessionStateLabel,
                    EndpointKey = latest.ExternalKey,
                    SubnetCidr = latest.SubnetCidr,
                    NetworkProfile = latest.NetworkProfile,
                    OpenPorts = latest.OpenPorts,
                    PingMs = latest.PingMs,
                    IsOnline = latest.IsOnline,
                    RiskScore = latest.RiskScore,
                    RiskLevel = latest.RiskLevel,
                    LastLoginAtUtc = latest.ObservedAtUtc,
                    LastLogoutAtUtc = group
                        .Where(item => item.IsOnline == false)
                        .OrderByDescending(item => item.ObservedAtUtc)
                        .ThenByDescending(item => item.Id)
                        .Select(item => (DateTime?)item.ObservedAtUtc)
                        .FirstOrDefault(),
                    LastMfaVerifiedAtUtc = latest.ObservedAtUtc,
                    IsActive = latest.IsOnline ?? false,
                    LinkedDeviceCount = group.Count(),
                    LastSeenAtUtc = latest.ObservedAtUtc
                });
            }
        }

        var orderedUsers = sessionUsers
            .OrderByDescending(user => user.SessionState == "active")
            .ThenByDescending(user => user.LastSeenAtUtc ?? DateTime.MinValue)
            .ThenBy(user => user.Username, StringComparer.OrdinalIgnoreCase)
            .ToList();

        return new NetworkTelemetrySessionOverviewViewModel
        {
            ActiveUserCount = activeCount,
            LockedUserCount = lockedCount,
            ExpiredUserCount = expiredCount,
            PendingMfaUserCount = pendingIdentityCount,
            InactiveUserCount = inactiveCount,
            TotalEvaluatedUsers = sessionUsers.Count,
            Users = orderedUsers
        };
    }

    public async Task<IReadOnlyList<NetworkTelemetrySnapshotViewModel>> GetRecentSnapshotsAsync(
        int take = 10,
        IReadOnlyCollection<string>? campusKeys = null,
        CancellationToken cancellationToken = default)
    {
        take = Math.Clamp(take, 1, 50);

        var snapshots = await ApplyCampusScope(
                _context.NetworkTelemetrySnapshots.AsNoTracking(),
                campusKeys)
            .OrderByDescending(snapshot => snapshot.ObservedAtUtc)
            .ThenByDescending(snapshot => snapshot.Id)
            .Take(take)
            .ToListAsync(cancellationToken);

        // Numero de captura (#N) asignado por el scheduler: mismo identificador
        // que muestra la tabla de capturas programadas en Red y riesgo.
        var snapshotIds = snapshots.Select(snapshot => snapshot.Id).ToList();
        var runNumbers = snapshotIds.Count == 0
            ? new Dictionary<Guid, int>()
            : (await _context.ScheduledScanRuns
                .AsNoTracking()
                .Where(run => run.SnapshotId.HasValue && snapshotIds.Contains(run.SnapshotId.Value))
                .OrderBy(run => run.RunNumber)
                .Select(run => new { SnapshotKey = run.SnapshotId.Value, run.RunNumber })
                .ToListAsync(cancellationToken))
            .GroupBy(pair => pair.SnapshotKey)
            .ToDictionary(group => group.Key, group => group.First().RunNumber);

        return snapshots.Select(snapshot =>
        {
            var viewModel = MapSnapshot(snapshot);
            if (runNumbers.TryGetValue(snapshot.Id, out var runNumber))
            {
                viewModel.RunNumber = runNumber;
            }

            return viewModel;
        }).ToList();
    }

    public async Task<NetworkTelemetrySnapshotPageViewModel> GetSnapshotPageAsync(
        NetworkTelemetrySnapshotQueryRequest request,
        IReadOnlyCollection<string>? campusKeys = null,
        CancellationToken cancellationToken = default)
    {
        var segmentStopwatch = System.Diagnostics.Stopwatch.StartNew();

        request.Page = Math.Max(1, request.Page);
        request.PageSize = Math.Clamp(request.PageSize, 10, 200);
        request.SortBy = string.IsNullOrWhiteSpace(request.SortBy) ? "observedAt" : request.SortBy.Trim();
        request.SortDirection = string.Equals(request.SortDirection, "asc", StringComparison.OrdinalIgnoreCase) ? "asc" : "desc";

        var query = ApplyCampusScope(
            _context.NetworkTelemetrySnapshots.AsNoTracking().AsQueryable(),
            campusKeys);

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var term = request.Search.Trim().ToLowerInvariant();
            query = query.Where(snapshot =>
                (snapshot.SourceName ?? string.Empty).ToLower().Contains(term) ||
                (snapshot.SourceType ?? string.Empty).ToLower().Contains(term) ||
                (snapshot.Status ?? string.Empty).ToLower().Contains(term) ||
                (snapshot.Notes ?? string.Empty).ToLower().Contains(term) ||
                (snapshot.CreatedBy ?? string.Empty).ToLower().Contains(term));
        }

        if (!string.IsNullOrWhiteSpace(request.TriggerType))
        {
            var trigger = request.TriggerType.Trim().ToLowerInvariant();
            query = trigger switch
            {
                "scheduled" => query.Where(snapshot =>
                    (snapshot.SourceType ?? string.Empty).ToLower().Contains("scheduled") ||
                    (snapshot.CreatedBy ?? string.Empty).ToLower() == "system"),
                "automatic" => query.Where(snapshot =>
                    (snapshot.SourceType ?? string.Empty).ToLower().Contains("auto") &&
                    !(snapshot.SourceType ?? string.Empty).ToLower().Contains("scheduled") &&
                    (snapshot.CreatedBy ?? string.Empty).ToLower() != "system"),
                "manual" => query.Where(snapshot =>
                    !(snapshot.SourceType ?? string.Empty).ToLower().Contains("auto") &&
                    !(snapshot.SourceType ?? string.Empty).ToLower().Contains("scheduled") &&
                    (snapshot.CreatedBy ?? string.Empty).ToLower() != "system"),
                _ => query
            };
        }

        var buildElapsedMs = segmentStopwatch.ElapsedMilliseconds;
        var materializeStopwatch = System.Diagnostics.Stopwatch.StartNew();
        // Proyección liviana SIN PayloadJson (~2MB por fila): materializar
        // entidades completas convertía cada paginado en un full-scan de la tabla.
        var items = await query
            .Select(snapshot => new SnapshotListItem
            {
                Id = snapshot.Id,
                CampusKey = snapshot.CampusKey,
                SourceName = snapshot.SourceName,
                SourceType = snapshot.SourceType,
                Status = snapshot.Status,
                RiskLevel = snapshot.RiskLevel,
                RiskScore = snapshot.RiskScore,
                DeviceCount = snapshot.DeviceCount,
                ConnectedUserCount = snapshot.ConnectedUserCount,
                HighRiskDeviceCount = snapshot.HighRiskDeviceCount,
                MediumRiskDeviceCount = snapshot.MediumRiskDeviceCount,
                LowRiskDeviceCount = snapshot.LowRiskDeviceCount,
                ObservedAtUtc = snapshot.ObservedAtUtc,
                WindowStartUtc = snapshot.WindowStartUtc,
                WindowEndUtc = snapshot.WindowEndUtc,
                Notes = snapshot.Notes,
                CreatedBy = snapshot.CreatedBy
            })
            .ToListAsync(cancellationToken);
        materializeStopwatch.Stop();
        var postProcessStopwatch = System.Diagnostics.Stopwatch.StartNew();

        if (!string.IsNullOrWhiteSpace(request.Weekday))
        {
            var normalizedWeekday = request.Weekday.Trim().ToLowerInvariant();
            items = items
                .Where(snapshot => string.Equals(
                    GetSnapshotWeekday(snapshot.ObservedAtUtc),
                    normalizedWeekday,
                    StringComparison.OrdinalIgnoreCase))
                .ToList();
        }

        if (!string.IsNullOrWhiteSpace(request.TimeSlot))
        {
            var normalizedTimeSlot = request.TimeSlot.Trim();
            items = items
                .Where(snapshot => string.Equals(
                    GetSnapshotTimeSlot(snapshot.ObservedAtUtc),
                    normalizedTimeSlot,
                    StringComparison.OrdinalIgnoreCase))
                .ToList();
        }

        items = ApplySnapshotListItemSorting(items.AsQueryable(), request).ToList();

        var totalCount = items.Count;
        var totalPages = Math.Max(1, (int)Math.Ceiling(totalCount / (double)request.PageSize));
        if (request.Page > totalPages)
        {
            request.Page = totalPages;
        }

        items = items
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .ToList();

        postProcessStopwatch.Stop();
        segmentStopwatch.Stop();
        _logger.LogInformation(
            "NetworkTelemetry SnapshotPage segmentos: build={BuildMs} ms, materialize={MaterializeMs} ms, postprocess={PostMs} ms, total={TotalMs} ms ({TotalCount} filas)",
            buildElapsedMs,
            materializeStopwatch.ElapsedMilliseconds,
            postProcessStopwatch.ElapsedMilliseconds,
            segmentStopwatch.ElapsedMilliseconds,
            totalCount);

        return new NetworkTelemetrySnapshotPageViewModel
        {
            Search = request.Search,
            TriggerType = request.TriggerType,
            Weekday = request.Weekday,
            TimeSlot = request.TimeSlot,
            SortBy = request.SortBy,
            SortDirection = request.SortDirection,
            Page = request.Page,
            PageSize = request.PageSize,
            TotalCount = totalCount,
            TotalPages = totalPages,
            Items = items.Select(MapSnapshotListItem).ToList()
        };
    }

    public async Task<NetworkTelemetryIngestResultViewModel> IngestAsync(
        NetworkTelemetryIngestRequest request,
        string createdByUsername,
        CancellationToken cancellationToken = default)
    {
        var observedAtUtc = request.ObservedAtUtc ?? DateTime.UtcNow;
        var sourceName = string.IsNullOrWhiteSpace(request.SourceName) ? "desconocido" : request.SourceName.Trim();
        var sourceType = string.IsNullOrWhiteSpace(request.SourceType) ? "collector" : request.SourceType.Trim();
        var liveScanMode = string.Equals(sourceType, "live-scan", StringComparison.OrdinalIgnoreCase)
            && !string.Equals(request.TriggerType, "scheduled", StringComparison.OrdinalIgnoreCase);

        var deviceInputs = request.Devices ?? [];
        var userInputs = request.Users ?? [];
        var normalizedDevices = deviceInputs
            .Select(input => NormalizeDeviceInput(input))
            .ToList();
        var normalizedUsers = userInputs
            .Select(input => NormalizeUserInput(input))
            .ToList();
        var importedItems = liveScanMode
            ? []
            : await LoadInventoryMatchRecordsAsync(cancellationToken);

        var syncedEquipments = liveScanMode
            ? []
            : await LoadSyncedEquipmentMatchRecordsAsync(cancellationToken);

        var authUsers = liveScanMode
            ? []
            : await _context.AuthUsers
                .AsNoTracking()
                .Select(user => new AuthUserMatchRecord(user.Id, Normalize(user.Username), Normalize(user.NormalizedUsername), BackendAuthService.NormalizeRole(user.Role)))
                .ToListAsync(cancellationToken);

        var duplicateIpSet = normalizedDevices
            .Where(device => !string.IsNullOrWhiteSpace(device.IpAddress))
            .GroupBy(device => Normalize(device.IpAddress))
            .Where(group => group.Count() > 1)
            .Select(group => group.Key)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var duplicateMacSet = normalizedDevices
            .Where(device => IsValidMac(device.MacAddress))
            .GroupBy(device => Normalize(device.MacAddress))
            .Where(group => group.Count() > 1)
            .Select(group => group.Key)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var deviceObservations = new List<ObservationResult>();
        var mlScoredCount = 0;
        foreach (var device in normalizedDevices)
        {
            var ruleResult = ScoreDevice(
                device,
                observedAtUtc,
                importedItems,
                syncedEquipments,
                authUsers,
                duplicateIpSet,
                duplicateMacSet,
                liveScanMode);

            if (_riskPredictionService.IsModelLoaded && _mlSettings.IsEnabled)
            {
                var mlInput = ExtractRiskFeatures(device, importedItems, syncedEquipments, authUsers, duplicateIpSet, duplicateMacSet, liveScanMode);
                var mlPrediction = _riskPredictionService.Predict(mlInput);
                var hybridScore = _riskPredictionService.ComputeHybridScore(ruleResult.RiskScore, mlPrediction);

                var hybridLevel = ToRiskLevel(hybridScore);
                var reasons = new List<string>(ruleResult.RiskReasons) { $"[ML] Prob={mlPrediction.Probability:P0}" };
                mlScoredCount++;

                deviceObservations.Add(ruleResult with
                {
                    RiskScore = hybridScore,
                    RiskLevel = hybridLevel,
                    RiskReasons = reasons,
                    ScoringSource = "ml-hybrid",
                    MlProbability = mlPrediction.Probability,
                    RuleBasedScore = ruleResult.RiskScore
                });
            }
            else
            {
                deviceObservations.Add(ruleResult);
            }
        }

        var userObservations = new List<ObservationResult>();
        foreach (var user in normalizedUsers)
        {
            var linkedDevices = normalizedDevices.Count(device =>
                !string.IsNullOrWhiteSpace(user.Username) &&
                string.Equals(Normalize(device.Username), Normalize(user.Username), StringComparison.OrdinalIgnoreCase));

            userObservations.Add(ScoreUser(user, observedAtUtc, authUsers, linkedDevices));
        }

        var deviceRiskScore = deviceObservations.Count == 0 ? 0 : (int)Math.Round(deviceObservations.Average(observation => observation.RiskScore));
        var userRiskScore = userObservations.Count == 0 ? 0 : (int)Math.Round(userObservations.Average(observation => observation.RiskScore));
        var overallRiskScore = deviceObservations.Count == 0 && userObservations.Count == 0
            ? 0
            : (int)Math.Round((deviceRiskScore + userRiskScore) / 2.0);
        var overallRiskLevel = ToRiskLevel(overallRiskScore);

        var snapshot = new NetworkTelemetrySnapshot
        {
            CampusKey = (request.CampusKey ?? string.Empty).Trim(),
            SourceName = sourceName,
            SourceType = sourceType,
            Status = "received",
            RiskLevel = overallRiskLevel,
            RiskScore = overallRiskScore,
            DeviceCount = deviceObservations.Count,
            ConnectedUserCount = userObservations.Count,
            HighRiskDeviceCount = deviceObservations.Count(observation => observation.RiskLevel == "high" || observation.RiskLevel == "critical"),
            MediumRiskDeviceCount = deviceObservations.Count(observation => observation.RiskLevel == "medium"),
            LowRiskDeviceCount = deviceObservations.Count(observation => observation.RiskLevel == "low"),
            MlScoredDeviceCount = mlScoredCount,
            ObservedAtUtc = observedAtUtc,
            WindowStartUtc = request.WindowStartUtc,
            WindowEndUtc = request.WindowEndUtc,
            Notes = string.IsNullOrWhiteSpace(request.Notes) ? string.Empty : request.Notes.Trim(),
            // Resumen compacto en vez del request completo: serializar todos los
            // devices/users hincho la tabla (~2MB por snapshot) y cada full-scan
            // de la vista paginada tardaba ~8s.
            PayloadJson = JsonSerializer.Serialize(new
            {
                request.SourceName,
                request.SourceType,
                CampusKey = (request.CampusKey ?? string.Empty).Trim(),
                DeviceCount = normalizedDevices.Count,
                UserCount = normalizedUsers.Count,
                ObservedAtUtc = observedAtUtc
            }),
            CreatedBy = createdByUsername,
            CreatedAtUtc = DateTime.UtcNow
        };

        _context.NetworkTelemetrySnapshots.Add(snapshot);
        await _context.SaveChangesAsync(cancellationToken);

        var deviceEntities = deviceObservations.Select(observation => new NetworkTelemetryObservation
        {
            NetworkTelemetrySnapshotId = snapshot.Id,
            ObservationType = "device",
            ExternalKey = observation.ExternalKey,
            DeviceName = observation.DeviceName,
            Username = observation.Username,
            Domain = observation.Domain,
            IpAddress = observation.IpAddress,
            MacAddress = observation.MacAddress,
            SerialNumber = observation.SerialNumber,
            HostName = observation.HostName,
            DeviceCategory = observation.DeviceCategory,
            OperatingSystem = observation.OperatingSystem,
            OperatingSystemVersion = observation.OperatingSystemVersion,
            Manufacturer = observation.Manufacturer,
            Model = observation.Model,
            Processor = observation.Processor,
            MemoryGb = observation.MemoryGb,
            DiskTotalGb = observation.DiskTotalGb,
            DiskFreeGb = observation.DiskFreeGb,
            LastBootAtUtc = observation.LastBootAtUtc,
            IsOnline = observation.IsOnline,
            DomainJoined = observation.DomainJoined,
            IsVirtualMachine = observation.IsVirtualMachine,
            PingMs = observation.PingMs,
            AntivirusStatus = observation.AntivirusStatus,
            AntivirusVersion = observation.AntivirusVersion,
            PatchStatus = observation.PatchStatus,
            AgentVersion = observation.AgentVersion,
            OpenPorts = observation.OpenPorts,
            SubnetCidr = observation.SubnetCidr,
            NetworkProfile = observation.NetworkProfile,
            BuildingExternalId = observation.BuildingExternalId,
            RoomExternalId = observation.RoomExternalId,
            ImportedInventoryItemId = observation.ImportedInventoryItemId,
            SyncedEquipmentId = observation.SyncedEquipmentId,
            AuthUserId = observation.AuthUserId,
            MatchKey = observation.MatchKey,
            Status = observation.Status,
            RiskLevel = observation.RiskLevel,
            RiskScore = observation.RiskScore,
            RiskReasonsJson = JsonSerializer.Serialize(observation.RiskReasons),
            ScoringSource = observation.ScoringSource,
            MlProbability = observation.MlProbability,
            RuleBasedScore = observation.RuleBasedScore,
            RawJson = observation.RawJson,
            ObservedAtUtc = observedAtUtc,
            CreatedAtUtc = DateTime.UtcNow
        }).ToList();

        var userEntities = userObservations.Select(observation => new NetworkTelemetryObservation
        {
            NetworkTelemetrySnapshotId = snapshot.Id,
            ObservationType = "user",
            ExternalKey = observation.ExternalKey,
            DeviceName = observation.DeviceName,
            Username = observation.Username,
            Domain = observation.Domain,
            IpAddress = observation.IpAddress,
            MacAddress = observation.MacAddress,
            SerialNumber = observation.SerialNumber,
            HostName = observation.HostName,
            BuildingExternalId = observation.BuildingExternalId,
            RoomExternalId = observation.RoomExternalId,
            ImportedInventoryItemId = observation.ImportedInventoryItemId,
            SyncedEquipmentId = observation.SyncedEquipmentId,
            AuthUserId = observation.AuthUserId,
            MatchKey = observation.MatchKey,
            Status = observation.Status,
            RiskLevel = observation.RiskLevel,
            RiskScore = observation.RiskScore,
            RiskReasonsJson = JsonSerializer.Serialize(observation.RiskReasons),
            RawJson = observation.RawJson,
            ObservedAtUtc = observedAtUtc,
            CreatedAtUtc = DateTime.UtcNow
        }).ToList();

        _context.NetworkTelemetryObservations.AddRange(deviceEntities);
        _context.NetworkTelemetryObservations.AddRange(userEntities);
        await _context.SaveChangesAsync(cancellationToken);

        await CleanupOldSnapshotsAsync(cancellationToken);

        await _auditLogService.LogSecurityEventAsync(
            actionType: "network-telemetry-ingest",
            resource: "network-telemetry",
            summary: $"Se registro una observacion de red desde {sourceName}",
            details: $"Dispositivos: {deviceObservations.Count}; Usuarios: {userObservations.Count}; Riesgo: {overallRiskLevel} ({overallRiskScore})",
            result: "success",
            severity: overallRiskLevel == "critical" ? "critical" : "info",
            changedByUsername: createdByUsername,
            cancellationToken: cancellationToken);

        if (string.Equals(request.TriggerType, "scheduled", StringComparison.OrdinalIgnoreCase))
        {
            try
            {
                var scheduledRun = await _context.ScheduledScanRuns
                    .OrderByDescending(r => r.CreatedAtUtc)
                    .FirstOrDefaultAsync(r => r.Status == "queued", cancellationToken);

                if (scheduledRun is not null)
                {
                    scheduledRun.Status = "completed";
                    scheduledRun.CompletedAtUtc = DateTime.UtcNow;
                    scheduledRun.SnapshotId = snapshot.Id;
                    scheduledRun.DeviceCount = deviceObservations.Count;
                    scheduledRun.UserCount = userObservations.Count;
                    if (string.IsNullOrWhiteSpace(scheduledRun.CampusKey))
                    {
                        scheduledRun.CampusKey = snapshot.CampusKey;
                    }
                    await _context.SaveChangesAsync(cancellationToken);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "No se pudo actualizar el ScheduledScanRun asociado al ingesta programada.");
            }
        }

        return new NetworkTelemetryIngestResultViewModel
        {
            SnapshotId = snapshot.Id,
            SourceName = snapshot.SourceName,
            SourceType = snapshot.SourceType,
            CampusKey = snapshot.CampusKey,
            ObservedAtUtc = snapshot.ObservedAtUtc,
            DeviceCount = snapshot.DeviceCount,
            UserCount = snapshot.ConnectedUserCount,
            HighRiskDeviceCount = snapshot.HighRiskDeviceCount,
            MediumRiskDeviceCount = snapshot.MediumRiskDeviceCount,
            LowRiskDeviceCount = snapshot.LowRiskDeviceCount,
            HighRiskUserCount = userEntities.Count(observation => observation.RiskLevel == "high" || observation.RiskLevel == "critical"),
            MediumRiskUserCount = userEntities.Count(observation => observation.RiskLevel == "medium"),
            LowRiskUserCount = userEntities.Count(observation => observation.RiskLevel == "low"),
            OverallRiskScore = snapshot.RiskScore,
            OverallRiskLevel = snapshot.RiskLevel,
            MlScoredDeviceCount = mlScoredCount,
            Notes = snapshot.Notes
        };
    }

    public async Task<IReadOnlyList<NetworkTelemetryObservationViewModel>> GetTopRiskObservationsAsync(
        Guid snapshotId,
        int take = 10,
        IReadOnlyCollection<string>? campusKeys = null,
        CancellationToken cancellationToken = default)
    {
        take = Math.Clamp(take, 1, 50);

        if (!await SnapshotIsScopedAsync(snapshotId, campusKeys, cancellationToken))
        {
            return [];
        }

        var observations = await _context.NetworkTelemetryObservations
            .AsNoTracking()
            .Where(observation => observation.NetworkTelemetrySnapshotId == snapshotId)
            .OrderByDescending(observation => observation.RiskScore)
            .ThenByDescending(observation => observation.Id)
            .Take(take)
            .ToListAsync(cancellationToken);

        return observations.Select(MapObservation).ToList();
    }

    public async Task<IReadOnlyList<NetworkTelemetryObservationViewModel>> GetObservationsAsync(
        Guid snapshotId,
        int take = 25,
        string? observationType = null,
        IReadOnlyCollection<string>? campusKeys = null,
        CancellationToken cancellationToken = default)
    {
        take = Math.Clamp(take, 1, 100);

        if (!await SnapshotIsScopedAsync(snapshotId, campusKeys, cancellationToken))
        {
            return [];
        }

        var query = _context.NetworkTelemetryObservations
            .AsNoTracking()
            .Where(observation => observation.NetworkTelemetrySnapshotId == snapshotId);

        if (!string.IsNullOrWhiteSpace(observationType))
        {
            query = query.Where(observation => observation.ObservationType == observationType);
        }

        var observations = await query
            .OrderByDescending(observation => observation.RiskScore)
            .ThenByDescending(observation => observation.Id)
            .Take(take)
            .ToListAsync(cancellationToken);

        return observations.Select(MapObservation).ToList();
    }

    public async Task<NetworkTelemetryObservationPageViewModel> GetObservationPageAsync(
        Guid snapshotId,
        NetworkTelemetryObservationQueryRequest request,
        IReadOnlyCollection<string>? campusKeys = null,
        CancellationToken cancellationToken = default)
    {
        var page = Math.Max(1, request.Page);
        var pageSize = request.PageSize switch
        {
            10 or 25 or 50 or 100 or 200 or 500 => request.PageSize,
            _ => 10
        };

        if (!await SnapshotIsScopedAsync(snapshotId, campusKeys, cancellationToken))
        {
            return new NetworkTelemetryObservationPageViewModel
            {
                SnapshotId = snapshotId,
                Page = page,
                PageSize = pageSize,
                TotalCount = 0,
                TotalPages = 1
            };
        }

        var observationType = string.IsNullOrWhiteSpace(request.ObservationType) ? "device" : request.ObservationType.Trim().ToLowerInvariant();
        var query = _context.NetworkTelemetryObservations
            .AsNoTracking()
            .Where(observation => observation.NetworkTelemetrySnapshotId == snapshotId);

        if (!string.IsNullOrWhiteSpace(observationType))
        {
            query = query.Where(observation => observation.ObservationType == observationType);
        }

        if (!string.IsNullOrWhiteSpace(request.RiskLevel))
        {
            var normalizedRiskLevel = request.RiskLevel.Trim().ToLowerInvariant();
            query = query.Where(observation => observation.RiskLevel == normalizedRiskLevel);
        }

        if (!string.IsNullOrWhiteSpace(request.BuildingExternalId))
        {
            var normalizedBuildingId = request.BuildingExternalId.Trim();
            query = query.Where(observation => observation.BuildingExternalId == normalizedBuildingId);
        }

        if (!string.IsNullOrWhiteSpace(request.SubnetCidr))
        {
            var normalizedSubnet = request.SubnetCidr.Trim();
            query = query.Where(observation => observation.SubnetCidr == normalizedSubnet);
        }

        if (!string.IsNullOrWhiteSpace(request.OnlineState))
        {
            var normalizedOnlineState = request.OnlineState.Trim().ToLowerInvariant();
            query = normalizedOnlineState switch
            {
                "online" => query.Where(observation => observation.IsOnline == true),
                "offline" => query.Where(observation => observation.IsOnline == false),
                "unknown" => query.Where(observation => observation.IsOnline == null),
                _ => query
            };
        }

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var search = request.Search.Trim();
            query = query.Where(observation =>
                (observation.DeviceName ?? string.Empty).Contains(search) ||
                (observation.Username ?? string.Empty).Contains(search) ||
                (observation.IpAddress ?? string.Empty).Contains(search) ||
                (observation.MacAddress ?? string.Empty).Contains(search) ||
                (observation.SerialNumber ?? string.Empty).Contains(search) ||
                (observation.HostName ?? string.Empty).Contains(search) ||
                (observation.BuildingExternalId ?? string.Empty).Contains(search) ||
                (observation.RoomExternalId ?? string.Empty).Contains(search) ||
                (observation.OperatingSystem ?? string.Empty).Contains(search) ||
                (observation.Model ?? string.Empty).Contains(search) ||
                (observation.Manufacturer ?? string.Empty).Contains(search));
        }

        var totalCount = await query.CountAsync(cancellationToken);
        var totalPages = Math.Max(1, (int)Math.Ceiling(totalCount / (double)pageSize));
        page = Math.Min(page, totalPages);

        var items = await ApplyObservationSorting(query, request)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        var buildingRiskSummaries = observationType == "device"
            ? await BuildBuildingRiskSummariesAsync(query, cancellationToken)
            : [];

        return new NetworkTelemetryObservationPageViewModel
        {
            SnapshotId = snapshotId,
            Search = request.Search ?? string.Empty,
            RiskLevel = request.RiskLevel ?? string.Empty,
            BuildingExternalId = request.BuildingExternalId ?? string.Empty,
            SubnetCidr = request.SubnetCidr ?? string.Empty,
            OnlineState = request.OnlineState ?? string.Empty,
            ObservationType = observationType,
            SortBy = request.SortBy ?? "risk",
            SortDirection = request.SortDirection ?? "desc",
            Page = page,
            PageSize = pageSize,
            TotalCount = totalCount,
            TotalPages = totalPages,
            Items = items.Select(MapObservation).ToList(),
            BuildingRiskSummaries = buildingRiskSummaries
        };
    }

    public async Task<Guid> GetLatestSnapshotIdAsync(
        IReadOnlyCollection<string>? campusKeys = null,
        CancellationToken cancellationToken = default)
    {
        var latest = await ApplyCampusScope(
                _context.NetworkTelemetrySnapshots.AsNoTracking(),
                campusKeys)
            .OrderByDescending(s => s.ObservedAtUtc)
            .ThenByDescending(s => s.Id)
            .FirstOrDefaultAsync(cancellationToken);

        return latest?.Id ?? Guid.Empty;
    }

    public async Task<NetworkTelemetrySnapshotViewModel?> GetSnapshotSummaryAsync(
        Guid snapshotId,
        IReadOnlyCollection<string>? campusKeys = null,
        CancellationToken cancellationToken = default)
    {
        var snapshot = await ApplyCampusScope(
                _context.NetworkTelemetrySnapshots.AsNoTracking(),
                campusKeys)
            .FirstOrDefaultAsync(s => s.Id == snapshotId, cancellationToken);

        if (snapshot == null) return null;

        return new NetworkTelemetrySnapshotViewModel
        {
            Id = snapshot.Id,
            SourceName = snapshot.SourceName,
            SourceType = snapshot.SourceType,
            Status = snapshot.Status,
            RiskLevel = snapshot.RiskLevel,
            RiskScore = snapshot.RiskScore,
            DeviceCount = snapshot.DeviceCount,
            ConnectedUserCount = snapshot.ConnectedUserCount,
            HighRiskDeviceCount = snapshot.HighRiskDeviceCount,
            MediumRiskDeviceCount = snapshot.MediumRiskDeviceCount,
            LowRiskDeviceCount = snapshot.LowRiskDeviceCount,
            ObservedAtUtc = snapshot.ObservedAtUtc,
            WindowStartUtc = snapshot.WindowStartUtc,
            WindowEndUtc = snapshot.WindowEndUtc
        };
    }

    public async Task<NetworkTelemetryExportDataViewModel> GetSnapshotExportDataAsync(
        Guid snapshotId,
        IReadOnlyCollection<string>? campusKeys = null,
        CancellationToken cancellationToken = default)
    {
        if (!await SnapshotIsScopedAsync(snapshotId, campusKeys, cancellationToken))
        {
            return null!;
        }

        var snapshot = await _context.NetworkTelemetrySnapshots
            .AsNoTracking()
            .Where(s => s.Id == snapshotId)
            .Select(s => new
            {
                s.Id, s.SourceName, s.SourceType, s.Status, s.RiskLevel, s.RiskScore,
                s.DeviceCount, s.ConnectedUserCount, s.HighRiskDeviceCount,
                s.MediumRiskDeviceCount, s.LowRiskDeviceCount, s.ObservedAtUtc,
                s.WindowStartUtc, s.WindowEndUtc
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (snapshot == null)
            return null!;

        var rawDevices = await _context.NetworkTelemetryObservations
            .AsNoTracking()
            .Where(o => o.NetworkTelemetrySnapshotId == snapshotId && o.ObservationType == "device")
            .OrderByDescending(o => o.RiskScore)
            .ThenByDescending(o => o.Id)
            .Select(o => new
            {
                o.Id, o.ObservationType, o.ExternalKey, o.DeviceName, o.Username,
                o.MacAddress, o.IpAddress, o.HostName, o.SerialNumber, o.ImportedInventoryItemId,
                o.MatchKey,
                o.Status, o.RiskLevel, o.RiskScore, o.ObservedAtUtc, o.DeviceCategory,
                o.OperatingSystem, o.OperatingSystemVersion,
                o.Manufacturer, o.Model, o.Processor, o.MemoryGb,
                o.DiskTotalGb, o.DiskFreeGb, o.LastBootAtUtc,
                o.AntivirusStatus, o.AntivirusVersion, o.PatchStatus,
                o.IsOnline, o.DomainJoined, o.IsVirtualMachine, o.PingMs,
                o.AgentVersion, o.OpenPorts, o.SubnetCidr, o.NetworkProfile, o.RiskReasonsJson
            })
            .ToListAsync(cancellationToken);

        var devices = new List<NetworkTelemetryObservationViewModel>(rawDevices.Count);
        var causeCounts = new Dictionary<string, int>();
        var userGroups = new Dictionary<string, (int count, HashSet<string> hosts, HashSet<string> ips, int maxScore, string maxLevel)>();

        foreach (var raw in rawDevices)
        {
            var riskReasons = new List<string>();
            if (!string.IsNullOrWhiteSpace(raw.RiskReasonsJson) && raw.RiskReasonsJson != "[]")
            {
                try
                {
                    using var doc = JsonDocument.Parse(raw.RiskReasonsJson);
                    if (doc.RootElement.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var el in doc.RootElement.EnumerateArray())
                        {
                            if (el.ValueKind != JsonValueKind.String) continue;
                            var r = el.GetString();
                            if (string.IsNullOrWhiteSpace(r)) continue;
                            riskReasons.Add(r);

                            causeCounts.TryGetValue(r, out var count);
                            causeCounts[r] = count + 1;
                        }
                    }
                }
                catch { }
            }

            devices.Add(new NetworkTelemetryObservationViewModel
            {
                Id = raw.Id,
                ObservationType = raw.ObservationType,
                ExternalKey = raw.ExternalKey,
                DeviceName = raw.DeviceName,
                Username = raw.Username,
                Domain = string.Empty,
                IpAddress = raw.IpAddress,
                MacAddress = raw.MacAddress,
                SerialNumber = raw.SerialNumber,
                HostName = raw.HostName,
                DeviceCategory = raw.DeviceCategory,
                OperatingSystem = raw.OperatingSystem,
                OperatingSystemVersion = raw.OperatingSystemVersion,
                Manufacturer = raw.Manufacturer,
                Model = raw.Model,
                Processor = raw.Processor,
                MemoryGb = raw.MemoryGb,
                DiskTotalGb = raw.DiskTotalGb,
                DiskFreeGb = raw.DiskFreeGb,
                LastBootAtUtc = raw.LastBootAtUtc,
                IsOnline = raw.IsOnline,
                DomainJoined = raw.DomainJoined,
                IsVirtualMachine = raw.IsVirtualMachine,
                PingMs = raw.PingMs,
                AntivirusStatus = raw.AntivirusStatus,
                AntivirusVersion = raw.AntivirusVersion,
                PatchStatus = raw.PatchStatus,
                AgentVersion = raw.AgentVersion,
                OpenPorts = raw.OpenPorts,
                SubnetCidr = raw.SubnetCidr,
                NetworkProfile = raw.NetworkProfile,
                BuildingExternalId = string.Empty,
                RoomExternalId = string.Empty,
                Status = raw.Status,
                RiskLevel = raw.RiskLevel,
                RiskScore = raw.RiskScore,
                RiskReasons = riskReasons,
                ObservedAtUtc = raw.ObservedAtUtc,
                ImportedInventoryItemId = raw.ImportedInventoryItemId,
                MatchKey = raw.MatchKey
            });

            if (!string.IsNullOrWhiteSpace(raw.Username))
            {
                if (!userGroups.TryGetValue(raw.Username, out var ug))
                {
                    ug = (0, new HashSet<string>(), new HashSet<string>(), 0, "low");
                }
                ug.count++;
                if (!string.IsNullOrWhiteSpace(raw.HostName))
                    ug.hosts.Add(raw.HostName);
                if (!string.IsNullOrWhiteSpace(raw.IpAddress))
                    ug.ips.Add(raw.IpAddress);
                if (raw.RiskScore > ug.maxScore)
                {
                    ug.maxScore = raw.RiskScore;
                    ug.maxLevel = raw.RiskLevel;
                }
                userGroups[raw.Username] = ug;
            }
        }

        var totalDevices = rawDevices.Count;
        var riskCauses = causeCounts
            .OrderByDescending(kvp => kvp.Value)
            .Select(kvp => new NetworkTelemetryExportRiskCauseViewModel
            {
                Causa = kvp.Key,
                Cantidad = kvp.Value,
                Porcentaje = totalDevices > 0 ? Math.Round((double)kvp.Value / totalDevices * 100, 1) : 0
            })
            .ToList();

        var repeatedUsers = userGroups
            .OrderByDescending(ug => ug.Value.maxScore)
            .Select(ug => new NetworkTelemetryExportRepeatedUserViewModel
            {
                Username = ug.Key,
                Apariciones = ug.Value.count,
                HostsDistintos = ug.Value.hosts.Count,
                IPsDistintas = ug.Value.ips.Count,
                RiesgoMax = ug.Value.maxScore,
                NivelRiesgo = ug.Value.maxLevel,
                TipoSospecha = ug.Value.maxLevel switch
                {
                    "critical" or "high" => "Sospechoso",
                    "medium" => "Potencial",
                    _ => "Normal"
                }
            })
            .ToList();

        return new NetworkTelemetryExportDataViewModel
        {
            SnapshotId = snapshot.Id,
            SourceName = snapshot.SourceName,
            SourceType = snapshot.SourceType,
            Status = snapshot.Status,
            RiskLevel = snapshot.RiskLevel,
            RiskScore = snapshot.RiskScore,
            DeviceCount = snapshot.DeviceCount,
            HighRiskDeviceCount = snapshot.HighRiskDeviceCount,
            MediumRiskDeviceCount = snapshot.MediumRiskDeviceCount,
            LowRiskDeviceCount = snapshot.LowRiskDeviceCount,
            ConnectedUserCount = snapshot.ConnectedUserCount,
            ObservedAtUtc = snapshot.ObservedAtUtc,
            WindowStartUtc = snapshot.WindowStartUtc,
            WindowEndUtc = snapshot.WindowEndUtc,
            Devices = devices,
            RepeatedUsers = repeatedUsers,
            RiskCauses = riskCauses
        };
    }

    private static IQueryable<NetworkTelemetryObservation> ApplyObservationSorting(
        IQueryable<NetworkTelemetryObservation> query,
        NetworkTelemetryObservationQueryRequest request)
    {
        var sortBy = string.IsNullOrWhiteSpace(request.SortBy)
            ? "risk"
            : request.SortBy.Trim().ToLowerInvariant();
        var sortDirection = string.Equals(request.SortDirection, "asc", StringComparison.OrdinalIgnoreCase)
            ? "asc"
            : "desc";
        var ascending = sortDirection == "asc";

        return (sortBy, ascending) switch
        {
            ("serial", true) => query.OrderBy(observation => observation.SerialNumber).ThenBy(observation => observation.Id),
            ("serial", false) => query.OrderByDescending(observation => observation.SerialNumber).ThenByDescending(observation => observation.Id),
            ("device", true) => query.OrderBy(observation => observation.DeviceName).ThenBy(observation => observation.HostName).ThenBy(observation => observation.Id),
            ("device", false) => query.OrderByDescending(observation => observation.DeviceName).ThenByDescending(observation => observation.HostName).ThenByDescending(observation => observation.Id),
            ("user", true) => query.OrderBy(observation => observation.Username).ThenBy(observation => observation.DeviceName).ThenBy(observation => observation.Id),
            ("user", false) => query.OrderByDescending(observation => observation.Username).ThenByDescending(observation => observation.DeviceName).ThenByDescending(observation => observation.Id),
            ("building", true) => query.OrderBy(observation => observation.BuildingExternalId).ThenBy(observation => observation.DeviceName).ThenBy(observation => observation.Id),
            ("building", false) => query.OrderByDescending(observation => observation.BuildingExternalId).ThenByDescending(observation => observation.DeviceName).ThenByDescending(observation => observation.Id),
            ("subnet", true) => query.OrderBy(observation => observation.SubnetCidr).ThenBy(observation => observation.IpAddress).ThenBy(observation => observation.Id),
            ("subnet", false) => query.OrderByDescending(observation => observation.SubnetCidr).ThenByDescending(observation => observation.IpAddress).ThenByDescending(observation => observation.Id),
            ("profile", true) => query.OrderBy(observation => observation.NetworkProfile).ThenBy(observation => observation.DeviceName).ThenBy(observation => observation.Id),
            ("profile", false) => query.OrderByDescending(observation => observation.NetworkProfile).ThenByDescending(observation => observation.DeviceName).ThenByDescending(observation => observation.Id),
            ("ip", true) => query.OrderBy(observation => observation.IpAddress).ThenBy(observation => observation.Id),
            ("ip", false) => query.OrderByDescending(observation => observation.IpAddress).ThenByDescending(observation => observation.Id),
            ("mac", true) => query.OrderBy(observation => observation.MacAddress).ThenBy(observation => observation.Id),
            ("mac", false) => query.OrderByDescending(observation => observation.MacAddress).ThenByDescending(observation => observation.Id),
            ("os", true) => query.OrderBy(observation => observation.OperatingSystem).ThenBy(observation => observation.OperatingSystemVersion).ThenBy(observation => observation.Id),
            ("os", false) => query.OrderByDescending(observation => observation.OperatingSystem).ThenByDescending(observation => observation.OperatingSystemVersion).ThenByDescending(observation => observation.Id),
            ("model", true) => query.OrderBy(observation => observation.Manufacturer).ThenBy(observation => observation.Model).ThenBy(observation => observation.Id),
            ("model", false) => query.OrderByDescending(observation => observation.Manufacturer).ThenByDescending(observation => observation.Model).ThenByDescending(observation => observation.Id),
            ("antivirus", true) => query.OrderBy(observation => observation.AntivirusStatus).ThenBy(observation => observation.DeviceName).ThenBy(observation => observation.Id),
            ("antivirus", false) => query.OrderByDescending(observation => observation.AntivirusStatus).ThenByDescending(observation => observation.DeviceName).ThenByDescending(observation => observation.Id),
            ("patch", true) => query.OrderBy(observation => observation.PatchStatus).ThenBy(observation => observation.DeviceName).ThenBy(observation => observation.Id),
            ("patch", false) => query.OrderByDescending(observation => observation.PatchStatus).ThenByDescending(observation => observation.DeviceName).ThenByDescending(observation => observation.Id),
            ("online", true) => query.OrderBy(observation => observation.IsOnline).ThenBy(observation => observation.DeviceName).ThenBy(observation => observation.Id),
            ("online", false) => query.OrderByDescending(observation => observation.IsOnline).ThenByDescending(observation => observation.DeviceName).ThenByDescending(observation => observation.Id),
            ("ping", true) => query.OrderBy(observation => observation.PingMs).ThenBy(observation => observation.DeviceName).ThenBy(observation => observation.Id),
            ("ping", false) => query.OrderByDescending(observation => observation.PingMs).ThenByDescending(observation => observation.DeviceName).ThenByDescending(observation => observation.Id),
            ("observed", true) => query.OrderBy(observation => observation.ObservedAtUtc).ThenBy(observation => observation.Id),
            ("observed", false) => query.OrderByDescending(observation => observation.ObservedAtUtc).ThenByDescending(observation => observation.Id),
            ("risk", true) => query.OrderBy(observation => observation.RiskScore).ThenBy(observation => observation.ObservedAtUtc).ThenBy(observation => observation.Id),
            _ => query.OrderByDescending(observation => observation.RiskScore).ThenByDescending(observation => observation.ObservedAtUtc).ThenByDescending(observation => observation.Id)
        };
    }

    private sealed class SnapshotListItem
    {
        public Guid Id { get; init; }
        public string CampusKey { get; init; } = string.Empty;
        public string? SourceName { get; init; }
        public string? SourceType { get; init; }
        public string? Status { get; init; }
        public string? RiskLevel { get; init; }
        public int RiskScore { get; init; }
        public int DeviceCount { get; init; }
        public int ConnectedUserCount { get; init; }
        public int HighRiskDeviceCount { get; init; }
        public int MediumRiskDeviceCount { get; init; }
        public int LowRiskDeviceCount { get; init; }
        public DateTime ObservedAtUtc { get; init; }
        public DateTime? WindowStartUtc { get; init; }
        public DateTime? WindowEndUtc { get; init; }
        public string? Notes { get; init; }
        public string? CreatedBy { get; init; }
    }

    private static NetworkTelemetrySnapshotViewModel MapSnapshotListItem(SnapshotListItem item)
    {
        var triggerType = ResolveTriggerTypeFromParts(item.SourceType, item.CreatedBy);
        return new NetworkTelemetrySnapshotViewModel
        {
            Id = item.Id,
            CampusKey = item.CampusKey ?? string.Empty,
            SourceName = item.SourceName ?? string.Empty,
            SourceType = item.SourceType ?? string.Empty,
            TriggerType = triggerType,
            TriggerLabel = triggerType switch
            {
                "scheduled" => "Programado",
                "automatic" => "Automatico",
                _ => "Manual"
            },
            Status = item.Status ?? string.Empty,
            RiskLevel = item.RiskLevel ?? "unknown",
            RiskScore = item.RiskScore,
            DeviceCount = item.DeviceCount,
            ConnectedUserCount = item.ConnectedUserCount,
            HighRiskDeviceCount = item.HighRiskDeviceCount,
            MediumRiskDeviceCount = item.MediumRiskDeviceCount,
            LowRiskDeviceCount = item.LowRiskDeviceCount,
            ObservedAtUtc = item.ObservedAtUtc,
            WindowStartUtc = item.WindowStartUtc,
            WindowEndUtc = item.WindowEndUtc,
            Notes = item.Notes ?? string.Empty,
            CreatedByUsername = item.CreatedBy ?? string.Empty
        };
    }

    private static string ResolveTriggerTypeFromParts(string? sourceType, string? createdBy)
    {
        var sourceTypeValue = sourceType?.Trim().ToLowerInvariant() ?? string.Empty;
        var createdByValue = createdBy?.Trim().ToLowerInvariant() ?? string.Empty;

        if (sourceTypeValue.Contains("scheduled") || createdByValue == "system")
        {
            return "scheduled";
        }

        if (sourceTypeValue.Contains("auto"))
        {
            return "automatic";
        }

        return "manual";
    }

    private static IQueryable<SnapshotListItem> ApplySnapshotListItemSorting(
        IQueryable<SnapshotListItem> query,
        NetworkTelemetrySnapshotQueryRequest request)
    {
        var descending = !string.Equals(request.SortDirection, "asc", StringComparison.OrdinalIgnoreCase);
        return request.SortBy.Trim().ToLowerInvariant() switch
        {
            "sourcename" => descending
                ? query.OrderByDescending(snapshot => snapshot.SourceName).ThenByDescending(snapshot => snapshot.ObservedAtUtc)
                : query.OrderBy(snapshot => snapshot.SourceName).ThenBy(snapshot => snapshot.ObservedAtUtc),
            "devicecount" => descending
                ? query.OrderByDescending(snapshot => snapshot.DeviceCount).ThenByDescending(snapshot => snapshot.ObservedAtUtc)
                : query.OrderBy(snapshot => snapshot.DeviceCount).ThenBy(snapshot => snapshot.ObservedAtUtc),
            "connectedusercount" => descending
                ? query.OrderByDescending(snapshot => snapshot.ConnectedUserCount).ThenByDescending(snapshot => snapshot.ObservedAtUtc)
                : query.OrderBy(snapshot => snapshot.ConnectedUserCount).ThenBy(snapshot => snapshot.ObservedAtUtc),
            "riskscore" => descending
                ? query.OrderByDescending(snapshot => snapshot.RiskScore).ThenByDescending(snapshot => snapshot.ObservedAtUtc)
                : query.OrderBy(snapshot => snapshot.RiskScore).ThenBy(snapshot => snapshot.ObservedAtUtc),
            "triggertype" => descending
                ? query.OrderByDescending(snapshot => snapshot.SourceType).ThenByDescending(snapshot => snapshot.ObservedAtUtc)
                : query.OrderBy(snapshot => snapshot.SourceType).ThenBy(snapshot => snapshot.ObservedAtUtc),
            "weekday" => descending
                ? query.OrderByDescending(snapshot => snapshot.ObservedAtUtc.DayOfWeek).ThenByDescending(snapshot => snapshot.ObservedAtUtc)
                : query.OrderBy(snapshot => snapshot.ObservedAtUtc.DayOfWeek).ThenBy(snapshot => snapshot.ObservedAtUtc),
            "timeslot" => descending
                ? query.OrderByDescending(snapshot => snapshot.ObservedAtUtc.TimeOfDay).ThenByDescending(snapshot => snapshot.ObservedAtUtc)
                : query.OrderBy(snapshot => snapshot.ObservedAtUtc.TimeOfDay).ThenBy(snapshot => snapshot.ObservedAtUtc),
            _ => descending
                ? query.OrderByDescending(snapshot => snapshot.ObservedAtUtc).ThenByDescending(snapshot => snapshot.Id)
                : query.OrderBy(snapshot => snapshot.ObservedAtUtc).ThenBy(snapshot => snapshot.Id)
        };
    }

    public async Task<IReadOnlyList<NetworkTelemetryBuildingRiskSummaryViewModel>> GetBuildingRiskSummariesAsync(
        Guid snapshotId,
        IReadOnlyCollection<string>? campusKeys = null,
        CancellationToken cancellationToken = default)
    {
        if (!await SnapshotIsScopedAsync(snapshotId, campusKeys, cancellationToken))
        {
            return [];
        }

        var query = _context.NetworkTelemetryObservations
            .AsNoTracking()
            .Where(observation => observation.NetworkTelemetrySnapshotId == snapshotId && observation.ObservationType == "device");

        return await BuildBuildingRiskSummariesAsync(query, cancellationToken);
    }

    private static string BuildSessionState(
        AuthUser user,
        DateTime? lastLoginAtUtc,
        DateTime? lastLogoutAtUtc,
        DateTime idleCutoff,
        DateTime nowUtc)
    {
        if (!user.IsActive)
        {
            return "inactive";
        }

        if (user.LockedUntilUtc.HasValue && user.LockedUntilUtc.Value > nowUtc)
        {
            return "locked";
        }

        if (string.Equals(user.Role, AppRoles.Admin, StringComparison.OrdinalIgnoreCase) &&
            (!user.MfaEnabled || string.IsNullOrWhiteSpace(user.MfaSecretProtected)))
        {
            return "mfa-pending";
        }

        var activityReference = user.MfaLastVerifiedAtUtc ?? lastLoginAtUtc;
        if (activityReference.HasValue)
        {
            if (lastLogoutAtUtc.HasValue && lastLogoutAtUtc.Value > activityReference.Value)
            {
                return "expired";
            }

            if (activityReference.Value >= idleCutoff)
            {
                return "active";
            }
        }

        return lastLoginAtUtc.HasValue ? "expired" : "inactive";
    }

    private static int CountLinkedDevices(
        string username,
        IReadOnlyList<LinkedImportedRow> importedDeviceRows,
        IReadOnlyList<LinkedSyncedRow> syncedDeviceRows)
    {
        if (string.IsNullOrWhiteSpace(username))
        {
            return 0;
        }

        var candidates = BuildUsernameCandidates(username);
        var importedCount = importedDeviceRows.Count(item =>
            candidates.Contains(Normalize(item.ResponsibleUser)) ||
            candidates.Contains(Normalize(item.Email)) ||
            candidates.Contains(Normalize(item.UnitOrDepartment)) ||
            candidates.Contains(Normalize(item.OrganizationalUnit)));

        var syncedCount = syncedDeviceRows.Count(item =>
            candidates.Contains(Normalize(item.AssignedTo)) ||
            candidates.Contains(Normalize(item.ResponsiblePerson)) ||
            candidates.Contains(Normalize(item.Name)) ||
            candidates.Contains(Normalize(item.InventoryCode)));

        return importedCount + syncedCount;
    }

    private static string BuildEndpointIdentity(NetworkTelemetryObservation observation)
    {
        var candidates = new[]
        {
            observation.Username,
            observation.HostName,
            observation.DeviceName,
            observation.IpAddress,
            observation.ExternalKey
        };

        return candidates.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value)) ?? $"endpoint-{observation.Id}";
    }

    private static string ResolveDisplayIdentity(NetworkTelemetryObservation observation)
    {
        var candidates = new[]
        {
            observation.Username,
            observation.DeviceName,
            observation.HostName,
            observation.IpAddress
        };

        var identity = candidates.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value));
        if (string.IsNullOrWhiteSpace(identity))
        {
            return $"endpoint-{observation.Id}";
        }

        return identity!;
    }

    private static string TryExtractHostFromUserExternalKey(string externalKey)
    {
        if (string.IsNullOrWhiteSpace(externalKey))
        {
            return string.Empty;
        }

        var prefix = "network-user:";
        if (!externalKey.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
            return string.Empty;
        }

        var remainder = externalKey[prefix.Length..];
        var separatorIndex = remainder.IndexOf(':');
        if (separatorIndex <= 0)
        {
            return string.Empty;
        }

        return remainder[..separatorIndex].Trim();
    }

    private static string DetermineNetworkSessionState(NetworkTelemetryObservation observation, string identity)
    {
        var hasHumanIdentity = !string.IsNullOrWhiteSpace(identity) &&
                               !identity.Equals(observation.IpAddress, StringComparison.OrdinalIgnoreCase) &&
                               !identity.Equals(observation.HostName, StringComparison.OrdinalIgnoreCase);
        var isRisky = observation.RiskLevel is "high" or "critical";

        if (observation.IsOnline == true && isRisky)
        {
            return "locked";
        }

        if (observation.IsOnline == true)
        {
            return hasHumanIdentity ? "active" : "mfa-pending";
        }

        if (observation.IsOnline == false || observation.PingMs is null && string.IsNullOrWhiteSpace(observation.OpenPorts))
        {
            return "expired";
        }

        return hasHumanIdentity ? "inactive" : "mfa-pending";
    }

    private static string ResolveUserObservationState(NetworkTelemetryObservation userObservation, NetworkTelemetryObservation? linkedDevice)
    {
        var normalizedStatus = Normalize(userObservation.Status);
        if (normalizedStatus.Contains("ACTIVE", StringComparison.OrdinalIgnoreCase) ||
            normalizedStatus.Contains("ACTIVO", StringComparison.OrdinalIgnoreCase))
        {
            return linkedDevice?.RiskLevel is "high" or "critical" ? "locked" : "active";
        }

        if (normalizedStatus.Contains("DISC", StringComparison.OrdinalIgnoreCase) ||
            normalizedStatus.Contains("DISCONNECTED", StringComparison.OrdinalIgnoreCase) ||
            normalizedStatus.Contains("DESCONECT", StringComparison.OrdinalIgnoreCase))
        {
            return "inactive";
        }

        if (linkedDevice is not null)
        {
            return DetermineNetworkSessionState(linkedDevice, ResolveDisplayIdentity(linkedDevice));
        }

        return string.IsNullOrWhiteSpace(userObservation.Username) ? "mfa-pending" : "active";
    }

    private static string ResolveDeviceUsername(
        DeviceCandidate device,
        InventoryMatchRecord? importedMatch,
        SyncedEquipmentMatchRecord? syncedMatch)
    {
        var candidates = new[]
        {
            importedMatch?.ResponsibleUser,
            importedMatch?.Email,
            importedMatch?.UnitOrDepartment,
            importedMatch?.OrganizationalUnit,
            syncedMatch?.AssignedTo,
            syncedMatch?.ResponsiblePerson,
            device.Username,
            device.HostName,
            device.DeviceName,
            device.IpAddress
        };

        return candidates.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value)) ?? string.Empty;
    }

    private static bool LooksLikeHumanIdentity(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        var normalized = Normalize(value);
        if (normalized.Contains('@', StringComparison.Ordinal) || normalized.Contains('\\', StringComparison.Ordinal))
        {
            return true;
        }

        var devicePrefixes = new[]
        {
            "PC", "WS", "DESKTOP", "LAPTOP", "NOTEBOOK", "PRINTER", "IMPRES", "SERVER", "SRV", "MFP", "ZEBRA", "HP", "DELL", "LENOVO", "CANON", "EPSON", "BROTHER"
        };

        if (devicePrefixes.Any(prefix => normalized.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)))
        {
            return false;
        }

        return normalized.Any(char.IsLetter) && normalized.Any(char.IsLower) && normalized.Length >= 3;
    }

    private static string InferNetworkProfile(string deviceCategory, string openPorts, string? hostName, string? deviceName)
    {
        var ports = ParseOpenPorts(openPorts);
        var composite = $"{deviceCategory} {hostName} {deviceName}".ToUpperInvariant();

        if (ports.Contains(9100) || ports.Contains(631) || ports.Contains(515) ||
            composite.Contains("PRINTER", StringComparison.OrdinalIgnoreCase) ||
            composite.Contains("IMPRES", StringComparison.OrdinalIgnoreCase))
        {
            return "printer";
        }

        if (ports.Contains(3389) || ports.Contains(445) || ports.Contains(135) || ports.Contains(5985) || ports.Contains(5986))
        {
            return "workstation";
        }

        if (ports.Contains(22) || ports.Contains(389) || ports.Contains(88))
        {
            return "server";
        }

        if (ports.Contains(161) || ports.Contains(53))
        {
            return "infrastructure";
        }

        return string.IsNullOrWhiteSpace(deviceCategory) ? "network" : deviceCategory;
    }

    private static ObservationResult ScoreDevice(
        DeviceCandidate device,
        DateTime observedAtUtc,
        IReadOnlyList<InventoryMatchRecord> importedItems,
        IReadOnlyList<SyncedEquipmentMatchRecord> syncedEquipments,
        IReadOnlyList<AuthUserMatchRecord> authUsers,
        ISet<string> duplicateIpSet,
        ISet<string> duplicateMacSet,
        bool liveScanMode)
    {
        var reasons = new List<string>();
        var score = 0;

        var importedOutcome = FindImportedMatch(device, importedItems);
        var syncedOutcome = FindSyncedEquipmentMatch(device, syncedEquipments);
        var importedMatch = importedOutcome.Match;
        var syncedMatch = syncedOutcome.Match;
        var authMatch = FindAuthUserMatch(device.Username, authUsers);

        if (!liveScanMode && importedMatch is null && syncedMatch is null)
        {
            score += 35;
            reasons.Add("No coincide con inventario");
        }
        else if (!liveScanMode)
        {
            if ((importedMatch is not null && string.IsNullOrWhiteSpace(importedMatch.AssignedBuildingExternalId)) ||
                (syncedMatch is not null && string.IsNullOrWhiteSpace(syncedMatch.BuildingExternalId)))
            {
                score += 15;
                reasons.Add("Sin asignacion a edificio");
            }
        }

        if (!string.IsNullOrWhiteSpace(device.IpAddress) && duplicateIpSet.Contains(Normalize(device.IpAddress)))
        {
            score += 25;
            reasons.Add("IP duplicada");
        }

        if (IsValidMac(device.MacAddress) && duplicateMacSet.Contains(Normalize(device.MacAddress)))
        {
            score += 25;
            reasons.Add("MAC duplicada");
        }

        if (!string.IsNullOrWhiteSpace(device.Username) && authMatch is null && !liveScanMode)
        {
            score += 15;
            reasons.Add("Usuario no conocido");
        }

        if (device.IsOnline == false)
        {
            score += 20;
            reasons.Add("Equipo sin respuesta en red");
        }

        if (!liveScanMode)
        {
            if (!string.IsNullOrWhiteSpace(device.AntivirusStatus))
            {
                var antivirusStatus = Normalize(device.AntivirusStatus);
                if (antivirusStatus.Contains("DISABLED", StringComparison.OrdinalIgnoreCase) ||
                    antivirusStatus.Contains("INACTIVE", StringComparison.OrdinalIgnoreCase) ||
                    antivirusStatus.Contains("OFF", StringComparison.OrdinalIgnoreCase) ||
                    antivirusStatus.Contains("NO_INSTALADO", StringComparison.OrdinalIgnoreCase) ||
                    antivirusStatus.Contains("NOT_INSTALLED", StringComparison.OrdinalIgnoreCase))
                {
                    score += 20;
                    reasons.Add("Antivirus deshabilitado o ausente");
                }
            }

            if (!string.IsNullOrWhiteSpace(device.PatchStatus))
            {
                var patchStatus = Normalize(device.PatchStatus);
                if (patchStatus.Contains("OUTDATED", StringComparison.OrdinalIgnoreCase) ||
                    patchStatus.Contains("PENDING", StringComparison.OrdinalIgnoreCase) ||
                    patchStatus.Contains("FAILED", StringComparison.OrdinalIgnoreCase))
                {
                    score += 18;
                    reasons.Add("Parches pendientes o desactualizados");
                }
            }

            if (device.DomainJoined == false)
            {
                score += 12;
                reasons.Add("Equipo fuera de dominio");
            }

            if (device.DiskTotalGb.HasValue && device.DiskFreeGb.HasValue && device.DiskTotalGb.Value > 0)
            {
                var freeRatio = device.DiskFreeGb.Value / device.DiskTotalGb.Value;
                if (freeRatio <= 0.1d)
                {
                    score += 10;
                    reasons.Add("Espacio libre en disco bajo");
                }
            }

            if (device.LastBootAtUtc.HasValue && (observedAtUtc - device.LastBootAtUtc.Value).TotalDays >= 45)
            {
                score += 8;
                reasons.Add("Uptime prolongado");
            }

            if (device.PingMs.HasValue && device.PingMs.Value >= 250)
            {
                score += 5;
                reasons.Add("Latencia elevada");
            }
        }
        else
        {
            var openPorts = ParseOpenPorts(device.OpenPorts);
            if (openPorts.Contains(3389))
            {
                score += 10;
                reasons.Add("RDP expuesto");
            }

            if (openPorts.Contains(445) || openPorts.Contains(139) || openPorts.Contains(135))
            {
                score += 8;
                reasons.Add("Servicios SMB/WMI expuestos");
            }

            if (openPorts.Contains(22))
            {
                score += 6;
                reasons.Add("SSH expuesto");
            }

            if (openPorts.Contains(9100) || openPorts.Contains(631) || openPorts.Contains(515))
            {
                score += 4;
                reasons.Add("Servicio de impresion visible");
            }

            if (string.IsNullOrWhiteSpace(device.HostName) && string.IsNullOrWhiteSpace(device.DeviceName))
            {
                score += 4;
                reasons.Add("Sin nombre resolvible");
            }

            if (device.PingMs.HasValue && device.PingMs.Value >= 250)
            {
                score += 4;
                reasons.Add("Latencia elevada");
            }
        }

        var missingIdentifiers = 0;
        if (string.IsNullOrWhiteSpace(device.SerialNumber)) missingIdentifiers++;
        if (string.IsNullOrWhiteSpace(device.IpAddress)) missingIdentifiers++;
        if (string.IsNullOrWhiteSpace(device.MacAddress)) missingIdentifiers++;
        if (!liveScanMode && missingIdentifiers >= 2)
        {
            score += 10;
            reasons.Add("Identificadores incompletos");
        }

        score = Math.Min(score, 100);
        var riskLevel = ToRiskLevel(score);
        var resolvedUsername = ResolveDeviceUsername(device, importedMatch, syncedMatch);
        var resolvedNetworkProfile = string.IsNullOrWhiteSpace(device.NetworkProfile)
            ? InferNetworkProfile(device.DeviceCategory, device.OpenPorts, device.HostName, device.DeviceName)
            : device.NetworkProfile;

        return new ObservationResult(
            ExternalKey: string.IsNullOrWhiteSpace(device.ExternalKey) ? BuildFallbackExternalKey(device) : device.ExternalKey,
            DeviceName: device.DeviceName,
            Username: resolvedUsername,
            Domain: device.Domain,
            IpAddress: device.IpAddress,
            MacAddress: device.MacAddress,
            SerialNumber: device.SerialNumber,
            HostName: device.HostName,
            DeviceCategory: device.DeviceCategory,
            OperatingSystem: device.OperatingSystem,
            OperatingSystemVersion: device.OperatingSystemVersion,
            Manufacturer: device.Manufacturer,
            Model: device.Model,
            Processor: device.Processor,
            MemoryGb: device.MemoryGb,
            DiskTotalGb: device.DiskTotalGb,
            DiskFreeGb: device.DiskFreeGb,
            LastBootAtUtc: device.LastBootAtUtc,
            IsOnline: device.IsOnline,
            DomainJoined: device.DomainJoined,
            IsVirtualMachine: device.IsVirtualMachine,
            PingMs: device.PingMs,
            AntivirusStatus: device.AntivirusStatus,
            AntivirusVersion: device.AntivirusVersion,
            PatchStatus: device.PatchStatus,
            AgentVersion: device.AgentVersion,
            OpenPorts: device.OpenPorts,
            SubnetCidr: device.SubnetCidr,
            NetworkProfile: resolvedNetworkProfile,
            BuildingExternalId: importedMatch?.AssignedBuildingExternalId ?? syncedMatch?.BuildingExternalId ?? device.BuildingExternalId,
            RoomExternalId: importedMatch?.AssignedRoomExternalId ?? syncedMatch?.RoomExternalId ?? device.RoomExternalId,
            ImportedInventoryItemId: importedMatch?.Id,
            SyncedEquipmentId: syncedMatch?.Id,
            AuthUserId: authMatch?.Id,
            MatchKey: importedOutcome.Key.Length > 0 ? importedOutcome.Key : syncedOutcome.Key,
            Status: device.Status,
            RiskLevel: riskLevel,
            RiskScore: score,
            RiskReasons: reasons,
            RawJson: JsonSerializer.Serialize(device),
            ObservedAtUtc: observedAtUtc);
    }

    private static RiskPredictionInput ExtractRiskFeatures(
        DeviceCandidate device,
        IReadOnlyList<InventoryMatchRecord> importedItems,
        IReadOnlyList<SyncedEquipmentMatchRecord> syncedEquipments,
        IReadOnlyList<AuthUserMatchRecord> authUsers,
        ISet<string> duplicateIpSet,
        ISet<string> duplicateMacSet,
        bool liveScanMode)
    {
        var importedMatch = FindImportedMatch(device, importedItems);
        var syncedMatch = FindSyncedEquipmentMatch(device, syncedEquipments);
        var authMatch = FindAuthUserMatch(device.Username, authUsers);

        var hasMatch = importedMatch is not null || syncedMatch is not null;
        var hasBuilding = (importedMatch?.Match is not null && !string.IsNullOrWhiteSpace(importedMatch.Match.AssignedBuildingExternalId))
            || (syncedMatch?.Match is not null && !string.IsNullOrWhiteSpace(syncedMatch.Match.BuildingExternalId));

        var openPorts = ParseOpenPorts(device.OpenPorts);
        var diskFreePercent = device.DiskTotalGb.HasValue && device.DiskTotalGb.Value > 0 && device.DiskFreeGb.HasValue
            ? (float)(device.DiskFreeGb.Value / device.DiskTotalGb.Value * 100)
            : 100f;
        var uptimeDays = device.LastBootAtUtc.HasValue
            ? (float)(DateTime.UtcNow - device.LastBootAtUtc.Value).TotalDays
            : 0f;

        return new RiskPredictionInput
        {
            IsOnline = device.IsOnline == true ? 1f : 0f,
            MatchScore = hasBuilding ? 1f : hasMatch ? 0.5f : 0f,
            HasAssignedBuilding = hasBuilding ? 1f : 0f,
            DuplicateIpCount = !string.IsNullOrWhiteSpace(device.IpAddress) && duplicateIpSet.Contains(Normalize(device.IpAddress)) ? 1f : 0f,
            DuplicateMacCount = IsValidMac(device.MacAddress) && duplicateMacSet.Contains(Normalize(device.MacAddress)) ? 1f : 0f,
            IsKnownUser = authMatch is not null ? 1f : 0f,
            DeviceCount = 0f,
            AntivirusEnabled = !liveScanMode && !string.IsNullOrWhiteSpace(device.AntivirusStatus)
                && !(Normalize(device.AntivirusStatus).Contains("DISABLED") || Normalize(device.AntivirusStatus).Contains("INACTIVE")
                    || Normalize(device.AntivirusStatus).Contains("OFF") || Normalize(device.AntivirusStatus).Contains("NO_INSTALADO")
                    || Normalize(device.AntivirusStatus).Contains("NOT_INSTALLED"))
                ? 1f : 0f,
            PendingPatches = !liveScanMode && !string.IsNullOrWhiteSpace(device.PatchStatus)
                && (Normalize(device.PatchStatus).Contains("OUTDATED") || Normalize(device.PatchStatus).Contains("PENDING")
                    || Normalize(device.PatchStatus).Contains("FAILED"))
                ? 1f : 0f,
            DomainJoined = device.DomainJoined == true ? 1f : 0f,
            DiskFreePercent = diskFreePercent,
            UptimeDays = uptimeDays,
            PingMs = device.PingMs ?? 0,
            RdpExposed = liveScanMode && openPorts.Contains(3389) ? 1f : 0f,
            SmbExposed = liveScanMode && (openPorts.Contains(445) || openPorts.Contains(139) || openPorts.Contains(135)) ? 1f : 0f,
            SshExposed = liveScanMode && openPorts.Contains(22) ? 1f : 0f,
            OpenPortCount = openPorts.Count,
        };
    }

    private static ISet<int> ParseOpenPorts(string? value)
    {
        var ports = new HashSet<int>();
        if (string.IsNullOrWhiteSpace(value))
        {
            return ports;
        }

        foreach (var token in value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (int.TryParse(token, out var port) && port > 0 && port < 65536)
            {
                ports.Add(port);
            }
        }

        return ports;
    }

    private static ObservationResult ScoreUser(
        UserCandidate user,
        DateTime observedAtUtc,
        IReadOnlyList<AuthUserMatchRecord> authUsers,
        int linkedDeviceCount)
    {
        var reasons = new List<string>();
        var score = 0;
        var authMatch = FindAuthUserMatch(user.Username, authUsers);

        if (authMatch is null && LooksLikeHumanIdentity(user.Username))
        {
            score += 20;
            reasons.Add("Usuario no conocido");
        }

        if (linkedDeviceCount >= 5)
        {
            score += 15;
            reasons.Add("Demasiados equipos asociados");
        }
        else if (linkedDeviceCount >= 3)
        {
            score += 10;
            reasons.Add("Varios equipos asociados");
        }

        if (string.Equals(user.Status, "critical", StringComparison.OrdinalIgnoreCase))
        {
            score += 10;
            reasons.Add("Estado critico");
        }

        score = Math.Min(score, 100);
        var riskLevel = ToRiskLevel(score);

        return new ObservationResult(
            ExternalKey: string.IsNullOrWhiteSpace(user.ExternalKey) ? BuildFallbackExternalKey(user.Username, "user") : user.ExternalKey,
            DeviceName: user.DisplayName,
            Username: user.Username,
            Domain: string.Empty,
            IpAddress: string.Empty,
            MacAddress: string.Empty,
            SerialNumber: string.Empty,
            HostName: string.Empty,
            DeviceCategory: string.Empty,
            OperatingSystem: string.Empty,
            OperatingSystemVersion: string.Empty,
            Manufacturer: string.Empty,
            Model: string.Empty,
            Processor: string.Empty,
            MemoryGb: null,
            DiskTotalGb: null,
            DiskFreeGb: null,
            LastBootAtUtc: null,
            IsOnline: null,
            DomainJoined: null,
            IsVirtualMachine: null,
            PingMs: null,
            AntivirusStatus: string.Empty,
            AntivirusVersion: string.Empty,
            PatchStatus: string.Empty,
            AgentVersion: string.Empty,
            OpenPorts: string.Empty,
            SubnetCidr: string.Empty,
            NetworkProfile: string.Empty,
            BuildingExternalId: string.Empty,
            RoomExternalId: string.Empty,
            ImportedInventoryItemId: null,
            SyncedEquipmentId: null,
            AuthUserId: authMatch?.Id,
            MatchKey: string.Empty,
            Status: user.Status,
            RiskLevel: riskLevel,
            RiskScore: score,
            RiskReasons: reasons,
            RawJson: JsonSerializer.Serialize(user),
            ObservedAtUtc: observedAtUtc);
    }

    private async Task CleanupOldSnapshotsAsync(CancellationToken cancellationToken)
    {
        var retentionCutoff = DateTime.UtcNow.AddDays(-Math.Max(1, RetentionDays()));
        var oldSnapshots = await _context.NetworkTelemetrySnapshots
            .Where(snapshot => snapshot.ObservedAtUtc < retentionCutoff)
            .OrderBy(snapshot => snapshot.ObservedAtUtc)
            .Take(500)
            .ToListAsync(cancellationToken);

        if (oldSnapshots.Count > 0)
        {
            _context.NetworkTelemetrySnapshots.RemoveRange(oldSnapshots);
            await _context.SaveChangesAsync(cancellationToken);
        }

        var excessCount = await _context.NetworkTelemetrySnapshots.CountAsync(cancellationToken) - MaxSnapshots();
        if (excessCount > 0)
        {
            var toDelete = await _context.NetworkTelemetrySnapshots
                .OrderBy(snapshot => snapshot.ObservedAtUtc)
                .ThenBy(snapshot => snapshot.Id)
                .Take(excessCount)
                .ToListAsync(cancellationToken);

            _context.NetworkTelemetrySnapshots.RemoveRange(toDelete);
            await _context.SaveChangesAsync(cancellationToken);
        }
    }

    private static InventoryMatchOutcome FindImportedMatch(DeviceCandidate device, IReadOnlyList<InventoryMatchRecord> importedItems)
        => FindImportedMatch(device.SerialNumber, device.MacAddress, device.IpAddress, device.DeviceName, device.HostName, importedItems);

    internal static InventoryMatchOutcome FindImportedMatch(
        string serialNumber,
        string macAddress,
        string ipAddress,
        string deviceName,
        string hostName,
        IReadOnlyList<InventoryMatchRecord> importedItems)
    {
        if (!string.IsNullOrWhiteSpace(serialNumber))
        {
            var bySerial = importedItems.FirstOrDefault(item => string.Equals(item.SerialNumber, Normalize(serialNumber), StringComparison.OrdinalIgnoreCase));
            if (bySerial is not null) return new InventoryMatchOutcome(bySerial, "serial");
        }

        if (!string.IsNullOrWhiteSpace(macAddress) && IsValidMac(macAddress))
        {
            var byMac = importedItems.FirstOrDefault(item => string.Equals(item.MacAddress, Normalize(macAddress), StringComparison.OrdinalIgnoreCase));
            if (byMac is not null) return new InventoryMatchOutcome(byMac, "mac");
        }

        if (!string.IsNullOrWhiteSpace(ipAddress))
        {
            var byIp = importedItems.FirstOrDefault(item => string.Equals(item.IpAddress, Normalize(ipAddress), StringComparison.OrdinalIgnoreCase));
            if (byIp is not null) return new InventoryMatchOutcome(byIp, "ip");
        }

        var embeddedIp = ExtractEmbeddedIp(deviceName) ?? ExtractEmbeddedIp(hostName);
        if (!string.IsNullOrWhiteSpace(embeddedIp))
        {
            var byEmbeddedIp = importedItems.FirstOrDefault(item => string.Equals(item.IpAddress, embeddedIp, StringComparison.OrdinalIgnoreCase));
            if (byEmbeddedIp is not null) return new InventoryMatchOutcome(byEmbeddedIp, "ip_in_name");
        }

        return new InventoryMatchOutcome(null, string.Empty);
    }

    private static SyncedEquipmentMatchOutcome FindSyncedEquipmentMatch(DeviceCandidate device, IReadOnlyList<SyncedEquipmentMatchRecord> syncedEquipments)
        => FindSyncedEquipmentMatch(device.SerialNumber, device.MacAddress, device.IpAddress, device.DeviceName, device.HostName, syncedEquipments);

    internal static SyncedEquipmentMatchOutcome FindSyncedEquipmentMatch(
        string serialNumber,
        string macAddress,
        string ipAddress,
        string deviceName,
        string hostName,
        IReadOnlyList<SyncedEquipmentMatchRecord> syncedEquipments)
    {
        if (!string.IsNullOrWhiteSpace(serialNumber))
        {
            var bySerial = syncedEquipments.FirstOrDefault(item => string.Equals(item.SerialNumber, Normalize(serialNumber), StringComparison.OrdinalIgnoreCase));
            if (bySerial is not null) return new SyncedEquipmentMatchOutcome(bySerial, "serial");
        }

        if (!string.IsNullOrWhiteSpace(macAddress) && IsValidMac(macAddress))
        {
            var byMac = syncedEquipments.FirstOrDefault(item => string.Equals(item.MacAddress, Normalize(macAddress), StringComparison.OrdinalIgnoreCase));
            if (byMac is not null) return new SyncedEquipmentMatchOutcome(byMac, "mac");
        }

        if (!string.IsNullOrWhiteSpace(ipAddress))
        {
            var byIp = syncedEquipments.FirstOrDefault(item => string.Equals(item.IpAddress, Normalize(ipAddress), StringComparison.OrdinalIgnoreCase));
            if (byIp is not null) return new SyncedEquipmentMatchOutcome(byIp, "ip");
        }

        var embeddedIp = ExtractEmbeddedIp(deviceName) ?? ExtractEmbeddedIp(hostName);
        if (!string.IsNullOrWhiteSpace(embeddedIp))
        {
            var byEmbeddedIp = syncedEquipments.FirstOrDefault(item => string.Equals(item.IpAddress, embeddedIp, StringComparison.OrdinalIgnoreCase));
            if (byEmbeddedIp is not null) return new SyncedEquipmentMatchOutcome(byEmbeddedIp, "ip_in_name");
        }

        return new SyncedEquipmentMatchOutcome(null, string.Empty);
    }

    private async Task<IReadOnlyList<InventoryMatchRecord>> LoadInventoryMatchRecordsAsync(CancellationToken cancellationToken)
        => await _context.ImportedInventoryItems
            .AsNoTracking()
            .Select(item => new InventoryMatchRecord(
                item.Id,
                Normalize(item.SerialNumber),
                Normalize(item.IpAddress),
                Normalize(item.MacAddress),
                Normalize(item.ResponsibleUser),
                Normalize(item.Email),
                Normalize(item.UnitOrDepartment),
                Normalize(item.OrganizationalUnit),
                Normalize(item.AssignedBuildingExternalId),
                Normalize(item.AssignedRoomExternalId)))
            .ToListAsync(cancellationToken);

    private async Task<IReadOnlyList<SyncedEquipmentMatchRecord>> LoadSyncedEquipmentMatchRecordsAsync(CancellationToken cancellationToken)
        => await _context.SyncedEquipments
            .AsNoTracking()
            .Select(item => new SyncedEquipmentMatchRecord(
                item.Id,
                Normalize(item.SerialNumber),
                Normalize(item.IpAddress),
                Normalize(item.MacAddress),
                Normalize(item.AssignedTo),
                Normalize(item.ResponsiblePerson),
                Normalize(item.Name),
                Normalize(item.BuildingExternalId),
                Normalize(item.RoomExternalId),
                item.SyncedBuildingId,
                item.SyncedRoomId))
            .ToListAsync(cancellationToken);

    private static AuthUserMatchRecord? FindAuthUserMatch(string username, IReadOnlyList<AuthUserMatchRecord> authUsers)
    {
        var candidates = BuildUsernameCandidates(username);
        if (candidates.Count == 0)
            return null;

        return authUsers.FirstOrDefault(user => candidates.Contains(user.NormalizedUsername, StringComparer.OrdinalIgnoreCase));
    }

    private static List<string> BuildUsernameCandidates(string username)
    {
        var normalized = Normalize(username);
        if (string.IsNullOrWhiteSpace(normalized))
            return [];

        var candidates = new List<string> { normalized };
        var localPart = normalized.Split('@', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).FirstOrDefault();
        if (!string.IsNullOrWhiteSpace(localPart))
        {
            candidates.Add(localPart);
        }

        var backslashIndex = normalized.IndexOf('\\');
        if (backslashIndex >= 0 && backslashIndex < normalized.Length - 1)
        {
            candidates.Add(normalized[(backslashIndex + 1)..]);
        }

        return candidates
            .Where(candidate => !string.IsNullOrWhiteSpace(candidate))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static string ToRiskLevel(int score)
        => score >= 70 ? "critical" : score >= 40 ? "high" : score >= 20 ? "medium" : "low";

    private static string BuildFallbackExternalKey(DeviceCandidate device)
    {
        var baseValue = string.Join("|", new[]
        {
            Normalize(device.SerialNumber),
            Normalize(device.IpAddress),
            Normalize(device.MacAddress),
            Normalize(device.DeviceName)
        }.Where(value => !string.IsNullOrWhiteSpace(value)));

        return string.IsNullOrWhiteSpace(baseValue)
            ? $"unknown-device-{HashSuffix("device")}"
            : baseValue;
    }

    private static string BuildFallbackExternalKey(string value, string suffix)
    {
        var baseValue = string.Join("|", new[] { Normalize(value), suffix }.Where(part => !string.IsNullOrWhiteSpace(part)));
        return string.IsNullOrWhiteSpace(baseValue)
            ? $"unknown-{suffix}-{HashSuffix(value)}"
            : baseValue;
    }

    private static string Normalize(string? value)
        => string.IsNullOrWhiteSpace(value)
            ? string.Empty
            : value.Trim().ToUpperInvariant();

    private static string Clean(string? value)
        => string.IsNullOrWhiteSpace(value)
            ? string.Empty
            : value.Trim();

    private static string HashSuffix(string value)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(string.IsNullOrWhiteSpace(value) ? Guid.NewGuid().ToString("N") : value));
        return Convert.ToHexString(bytes)[..10];
    }

    internal static bool IsValidMac(string? value)
    {
        var normalized = Normalize(value);
        return !string.IsNullOrWhiteSpace(normalized) &&
               normalized is not "N/D" &&
               normalized is not "ND" &&
               normalized is not "-" &&
               normalized.Length >= 8;
    }

    internal static readonly System.Text.RegularExpressions.Regex EmbeddedIpRegex = new(
        @"(?<!\d)(?:\d{1,3}\.){3}\d{1,3}(?!\d)",
        System.Text.RegularExpressions.RegexOptions.Compiled | System.Text.RegularExpressions.RegexOptions.CultureInvariant);

    internal static string? ExtractEmbeddedIp(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        var match = EmbeddedIpRegex.Match(value);
        return match.Success ? Normalize(match.Value) : null;
    }

    internal static string MatchKeyLabel(string matchKey)
        => matchKey.Trim().ToLowerInvariant() switch
        {
            "serial" => "Serie",
            "mac" => "MAC",
            "ip" => "IP exacta",
            "ip_in_name" => "IP en nombre",
            "inventario" => "Inventario",
            "" => "Sin etiqueta",
            _ => matchKey
        };

    private static DeviceCandidate NormalizeDeviceInput(NetworkTelemetryDeviceInput input)
    {
        return new DeviceCandidate(
            ExternalKey: Clean(input.ExternalKey),
            DeviceName: Clean(input.DeviceName),
            Username: Clean(input.Username),
            Domain: Clean(input.Domain),
            IpAddress: Clean(input.IpAddress),
            MacAddress: Clean(input.MacAddress),
            SerialNumber: Clean(input.SerialNumber),
            HostName: Clean(input.HostName),
            DeviceCategory: Clean(input.DeviceCategory),
            OperatingSystem: Clean(input.OperatingSystem),
            OperatingSystemVersion: Clean(input.OperatingSystemVersion),
            Manufacturer: Clean(input.Manufacturer),
            Model: Clean(input.Model),
            Processor: Clean(input.Processor),
            MemoryGb: input.MemoryGb,
            DiskTotalGb: input.DiskTotalGb,
            DiskFreeGb: input.DiskFreeGb,
            LastBootAtUtc: input.LastBootAtUtc,
            IsOnline: input.IsOnline,
            DomainJoined: input.DomainJoined,
            IsVirtualMachine: input.IsVirtualMachine,
            PingMs: input.PingMs,
            AntivirusStatus: Clean(input.AntivirusStatus),
            AntivirusVersion: Clean(input.AntivirusVersion),
            PatchStatus: Clean(input.PatchStatus),
            AgentVersion: Clean(input.AgentVersion),
            OpenPorts: Clean(input.OpenPorts),
            SubnetCidr: Clean(input.SubnetCidr),
            NetworkProfile: Clean(input.NetworkProfile),
            BuildingExternalId: Clean(input.BuildingExternalId),
            RoomExternalId: Clean(input.RoomExternalId),
            Status: Clean(input.Status),
            Notes: Clean(input.Notes));
    }

    private static UserCandidate NormalizeUserInput(NetworkTelemetryUserInput input)
    {
        return new UserCandidate(
            ExternalKey: Clean(input.ExternalKey),
            Username: Clean(input.Username),
            DisplayName: Clean(input.DisplayName),
            DeviceCount: input.DeviceCount ?? 0,
            Status: Clean(input.Status),
            Notes: Clean(input.Notes));
    }

    private static NetworkTelemetrySnapshotViewModel MapSnapshot(NetworkTelemetrySnapshot snapshot)
    {
        var triggerType = ResolveTriggerType(snapshot);
        return new NetworkTelemetrySnapshotViewModel
        {
            Id = snapshot.Id,
            CampusKey = snapshot.CampusKey ?? string.Empty,
            SourceName = snapshot.SourceName,
            SourceType = snapshot.SourceType,
            TriggerType = triggerType,
            TriggerLabel = triggerType switch
            {
                "scheduled" => "Programado",
                "automatic" => "Automatico",
                _ => "Manual"
            },
            Status = snapshot.Status,
            RiskLevel = snapshot.RiskLevel,
            RiskScore = snapshot.RiskScore,
            DeviceCount = snapshot.DeviceCount,
            ConnectedUserCount = snapshot.ConnectedUserCount,
            HighRiskDeviceCount = snapshot.HighRiskDeviceCount,
            MediumRiskDeviceCount = snapshot.MediumRiskDeviceCount,
            LowRiskDeviceCount = snapshot.LowRiskDeviceCount,
            ObservedAtUtc = snapshot.ObservedAtUtc,
            WindowStartUtc = snapshot.WindowStartUtc,
            WindowEndUtc = snapshot.WindowEndUtc,
            Notes = snapshot.Notes,
            CreatedByUsername = snapshot.CreatedBy
        };
    }

    private static string ResolveTriggerType(NetworkTelemetrySnapshot snapshot)
    {
        var sourceType = snapshot.SourceType?.Trim().ToLowerInvariant() ?? string.Empty;
        var createdBy = snapshot.CreatedBy?.Trim().ToLowerInvariant() ?? string.Empty;

        if (sourceType.Contains("scheduled") || createdBy == "system")
        {
            return "scheduled";
        }

        if (sourceType.Contains("auto"))
        {
            return "automatic";
        }

        return "manual";
    }

    private static NetworkTelemetryObservationViewModel MapObservation(NetworkTelemetryObservation observation)
    {
        return new NetworkTelemetryObservationViewModel
        {
            Id = observation.Id,
            ObservationType = observation.ObservationType,
            ExternalKey = observation.ExternalKey,
            DeviceName = observation.DeviceName,
            Username = observation.Username,
            Domain = observation.Domain,
            IpAddress = observation.IpAddress,
            MacAddress = observation.MacAddress,
            SerialNumber = observation.SerialNumber,
            HostName = observation.HostName,
            DeviceCategory = observation.DeviceCategory,
            OperatingSystem = observation.OperatingSystem,
            OperatingSystemVersion = observation.OperatingSystemVersion,
            Manufacturer = observation.Manufacturer,
            Model = observation.Model,
            Processor = observation.Processor,
            MemoryGb = observation.MemoryGb,
            DiskTotalGb = observation.DiskTotalGb,
            DiskFreeGb = observation.DiskFreeGb,
            LastBootAtUtc = observation.LastBootAtUtc,
            IsOnline = observation.IsOnline,
            DomainJoined = observation.DomainJoined,
            IsVirtualMachine = observation.IsVirtualMachine,
            PingMs = observation.PingMs,
            AntivirusStatus = observation.AntivirusStatus,
            AntivirusVersion = observation.AntivirusVersion,
            PatchStatus = observation.PatchStatus,
            AgentVersion = observation.AgentVersion,
            OpenPorts = observation.OpenPorts,
            SubnetCidr = observation.SubnetCidr,
            NetworkProfile = observation.NetworkProfile,
            BuildingExternalId = observation.BuildingExternalId,
            RoomExternalId = observation.RoomExternalId,
            Status = observation.Status,
            RiskLevel = observation.RiskLevel,
            RiskScore = observation.RiskScore,
            RiskReasons = string.IsNullOrWhiteSpace(observation.RiskReasonsJson)
                ? []
                : JsonSerializer.Deserialize<List<string>>(observation.RiskReasonsJson) ?? [],
            ScoringSource = observation.ScoringSource,
            MlProbability = observation.MlProbability,
            RuleBasedScore = observation.RuleBasedScore,
            ObservedAtUtc = observation.ObservedAtUtc,
            ImportedInventoryItemId = observation.ImportedInventoryItemId,
            MatchKey = observation.MatchKey
        };
    }

    private static async Task<IReadOnlyList<NetworkTelemetryBuildingRiskSummaryViewModel>> BuildBuildingRiskSummariesAsync(
        IQueryable<NetworkTelemetryObservation> query,
        CancellationToken cancellationToken)
    {
        var observations = await query
            .Where(observation => observation.ObservationType == "device" && observation.BuildingExternalId != string.Empty)
            .Select(observation => new
            {
                observation.Id,
                observation.BuildingExternalId,
                observation.RiskLevel,
                observation.RiskScore
            })
            .ToListAsync(cancellationToken);

        return observations
            .GroupBy(observation => observation.BuildingExternalId, StringComparer.OrdinalIgnoreCase)
            .Select(group =>
            {
                var topRisk = group
                    .OrderByDescending(item => item.RiskScore)
                    .ThenByDescending(item => item.Id)
                    .First();

                return new NetworkTelemetryBuildingRiskSummaryViewModel
                {
                    BuildingExternalId = group.Key,
                    DeviceCount = group.Count(),
                    CriticalCount = group.Count(item => item.RiskLevel == "critical"),
                    HighCount = group.Count(item => item.RiskLevel == "high"),
                    MediumCount = group.Count(item => item.RiskLevel == "medium"),
                    LowCount = group.Count(item => item.RiskLevel == "low"),
                    MaxRiskScore = group.Max(item => item.RiskScore),
                    MaxRiskLevel = string.IsNullOrWhiteSpace(topRisk.RiskLevel) ? "low" : topRisk.RiskLevel
                };
            })
            .OrderByDescending(item => item.MaxRiskScore)
            .ThenByDescending(item => item.DeviceCount)
            .Take(100)
            .ToList();
    }

    private static async Task<IReadOnlyList<NetworkTelemetrySubnetRiskSummaryViewModel>> BuildSubnetRiskSummariesAsync(
        IQueryable<NetworkTelemetryObservation> query,
        CancellationToken cancellationToken)
    {
        var observations = await query
            .Where(observation => observation.ObservationType == "device" && observation.SubnetCidr != string.Empty)
            .Select(observation => new
            {
                observation.Id,
                observation.SubnetCidr,
                observation.RiskLevel,
                observation.RiskScore
            })
            .ToListAsync(cancellationToken);

        return observations
            .GroupBy(observation => observation.SubnetCidr, StringComparer.OrdinalIgnoreCase)
            .Select(group =>
            {
                var topRisk = group
                    .OrderByDescending(item => item.RiskScore)
                    .ThenByDescending(item => item.Id)
                    .First();

                return new NetworkTelemetrySubnetRiskSummaryViewModel
                {
                    SubnetCidr = group.Key,
                    DeviceCount = group.Count(),
                    CriticalCount = group.Count(item => item.RiskLevel == "critical"),
                    HighCount = group.Count(item => item.RiskLevel == "high"),
                    MediumCount = group.Count(item => item.RiskLevel == "medium"),
                    LowCount = group.Count(item => item.RiskLevel == "low"),
                    MaxRiskScore = group.Max(item => item.RiskScore),
                    MaxRiskLevel = string.IsNullOrWhiteSpace(topRisk.RiskLevel) ? "low" : topRisk.RiskLevel
                };
            })
            .OrderByDescending(item => item.MaxRiskScore)
            .ThenByDescending(item => item.DeviceCount)
            .Take(100)
            .ToList();
    }

    public async Task<IReadOnlyList<NetworkTelemetrySubnetRiskSummaryViewModel>> GetSubnetRiskSummariesAsync(
        Guid snapshotId,
        IReadOnlyCollection<string>? campusKeys = null,
        CancellationToken cancellationToken = default)
    {
        if (!await SnapshotIsScopedAsync(snapshotId, campusKeys, cancellationToken))
        {
            return [];
        }

        var query = _context.NetworkTelemetryObservations
            .AsNoTracking()
            .Where(observation => observation.NetworkTelemetrySnapshotId == snapshotId && observation.ObservationType == "device");

        return await BuildSubnetRiskSummariesAsync(query, cancellationToken);
    }

    internal sealed record InventoryMatchRecord(
        Guid Id,
        string SerialNumber,
        string IpAddress,
        string MacAddress,
        string ResponsibleUser,
        string Email,
        string UnitOrDepartment,
        string OrganizationalUnit,
        string AssignedBuildingExternalId,
        string AssignedRoomExternalId);

    internal sealed record SyncedEquipmentMatchRecord(
        Guid Id,
        string SerialNumber,
        string IpAddress,
        string MacAddress,
        string AssignedTo,
        string ResponsiblePerson,
        string Name,
        string BuildingExternalId,
        string RoomExternalId,
        Guid SyncedBuildingId,
        Guid? SyncedRoomId);

    private sealed record AuthUserMatchRecord(
        Guid Id,
        string Username,
        string NormalizedUsername,
        string Role);

    internal sealed record InventoryMatchOutcome(InventoryMatchRecord? Match, string Key);

    internal sealed record SyncedEquipmentMatchOutcome(SyncedEquipmentMatchRecord? Match, string Key);

    private sealed record LinkedImportedRow(
        string? ResponsibleUser,
        string? Email,
        string? UnitOrDepartment,
        string? OrganizationalUnit);

    private sealed record LinkedSyncedRow(
        string? AssignedTo,
        string? ResponsiblePerson,
        string? Name,
        string? InventoryCode);

    private sealed record DeviceCandidate(
        string ExternalKey,
        string DeviceName,
        string Username,
        string Domain,
        string IpAddress,
        string MacAddress,
        string SerialNumber,
        string HostName,
        string DeviceCategory,
        string OperatingSystem,
        string OperatingSystemVersion,
        string Manufacturer,
        string Model,
        string Processor,
        double? MemoryGb,
        double? DiskTotalGb,
        double? DiskFreeGb,
        DateTime? LastBootAtUtc,
        bool? IsOnline,
        bool? DomainJoined,
        bool? IsVirtualMachine,
        int? PingMs,
        string AntivirusStatus,
        string AntivirusVersion,
        string PatchStatus,
        string AgentVersion,
        string OpenPorts,
        string SubnetCidr,
        string NetworkProfile,
        string BuildingExternalId,
        string RoomExternalId,
        string Status,
        string Notes);

    private sealed record UserCandidate(
        string ExternalKey,
        string Username,
        string DisplayName,
        int DeviceCount,
        string Status,
        string Notes);

    private sealed record ObservationResult(
        string ExternalKey,
        string DeviceName,
        string Username,
        string Domain,
        string IpAddress,
        string MacAddress,
        string SerialNumber,
        string HostName,
        string DeviceCategory,
        string OperatingSystem,
        string OperatingSystemVersion,
        string Manufacturer,
        string Model,
        string Processor,
        double? MemoryGb,
        double? DiskTotalGb,
        double? DiskFreeGb,
        DateTime? LastBootAtUtc,
        bool? IsOnline,
        bool? DomainJoined,
        bool? IsVirtualMachine,
        int? PingMs,
        string AntivirusStatus,
        string AntivirusVersion,
        string PatchStatus,
        string AgentVersion,
        string OpenPorts,
        string SubnetCidr,
        string NetworkProfile,
        string BuildingExternalId,
        string RoomExternalId,
        Guid? ImportedInventoryItemId,
        Guid? SyncedEquipmentId,
        Guid? AuthUserId,
        string MatchKey,
        string Status,
        string RiskLevel,
        int RiskScore,
        IReadOnlyList<string> RiskReasons,
        string RawJson,
        DateTime ObservedAtUtc,
        string ScoringSource = "rule-only",
        float? MlProbability = null,
        int? RuleBasedScore = null);

    private string GetSnapshotWeekday(DateTime observedAtUtc)
    {
        var localDateTime = TimeZoneInfo.ConvertTimeFromUtc(observedAtUtc, _displayTimeZone);
        return localDateTime.ToString("dddd", _displayCulture);
    }

    private string GetSnapshotTimeSlot(DateTime observedAtUtc)
    {
        var localDateTime = TimeZoneInfo.ConvertTimeFromUtc(observedAtUtc, _displayTimeZone);
        return localDateTime.ToString("HH:mm");
    }

    public async Task<ScheduledScanRunPageViewModel> GetScheduledScanRunsAsync(
        ScheduledScanRunQueryRequest request,
        IReadOnlyCollection<string>? campusKeys = null,
        CancellationToken cancellationToken = default)
    {
        request.Page = Math.Max(1, request.Page);
        request.PageSize = Math.Clamp(request.PageSize, 1, 100);

        var query = _context.ScheduledScanRuns.AsNoTracking();

        if (campusKeys is not null)
        {
            query = campusKeys.Count == 0
                ? query.Where(run => false)
                : query.Where(run => run.CampusKey != null && campusKeys.Contains(run.CampusKey));
        }

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var s = request.Search.Trim();
            query = query.Where(r =>
                r.ScheduledDayLocal.Contains(s) ||
                r.ScheduledTimeLocal.Contains(s) ||
                r.Status.Contains(s) ||
                r.NormalizedCron.Contains(s) ||
                (r.ScheduleLabel != null && r.ScheduleLabel.Contains(s)));
        }

        if (!string.IsNullOrWhiteSpace(request.Status))
        {
            query = query.Where(r => r.Status == request.Status);
        }

        if (!string.IsNullOrWhiteSpace(request.Weekday))
        {
            query = query.Where(r => r.ScheduledDayLocal != null && r.ScheduledDayLocal.Contains(request.Weekday));
        }

        if (!string.IsNullOrWhiteSpace(request.TimeSlot))
        {
            query = query.Where(r => r.ScheduledTimeLocal != null && r.ScheduledTimeLocal.Contains(request.TimeSlot));
        }

        var totalCount = await query.CountAsync(cancellationToken);

        query = (request.SortBy, request.SortDirection) switch
        {
            ("scheduledAtUtc", "asc") => query.OrderBy(r => r.ScheduledAtUtc),
            ("scheduledAtUtc", "desc") => query.OrderByDescending(r => r.ScheduledAtUtc),
            ("startedAtUtc", "asc") => query.OrderBy(r => r.StartedAtUtc),
            ("startedAtUtc", "desc") => query.OrderByDescending(r => r.StartedAtUtc),
            ("completedAtUtc", "asc") => query.OrderBy(r => r.CompletedAtUtc),
            ("completedAtUtc", "desc") => query.OrderByDescending(r => r.CompletedAtUtc),
            ("status", "asc") => query.OrderBy(r => r.Status),
            ("status", "desc") => query.OrderByDescending(r => r.Status),
            ("deviceCount", "asc") => query.OrderBy(r => r.DeviceCount),
            ("deviceCount", "desc") => query.OrderByDescending(r => r.DeviceCount),
            ("userCount", "asc") => query.OrderBy(r => r.UserCount),
            ("userCount", "desc") => query.OrderByDescending(r => r.UserCount),
            ("scheduledDayLocal", "asc") => query.OrderBy(r => r.ScheduledDayLocal),
            ("scheduledDayLocal", "desc") => query.OrderByDescending(r => r.ScheduledDayLocal),
            ("scheduledTimeLocal", "asc") => query.OrderBy(r => r.ScheduledTimeLocal),
            ("scheduledTimeLocal", "desc") => query.OrderByDescending(r => r.ScheduledTimeLocal),
            _ => query.OrderByDescending(r => r.ScheduledAtUtc)
        };

        var runs = await query
            .Skip((request.Page - 1) * request.PageSize)
            .Take(request.PageSize)
            .ToListAsync(cancellationToken);

        var items = runs.Select(run => new ScheduledScanRunViewModel
        {
            Id = run.Id,
            RunNumber = run.RunNumber,
            CampusKey = run.CampusKey ?? string.Empty,
            ScheduledAtUtc = run.ScheduledAtUtc,
            StartedAtUtc = run.StartedAtUtc,
            CompletedAtUtc = run.CompletedAtUtc,
            Status = run.Status,
            StatusLabel = run.Status switch
            {
                "pending" => "Pendiente",
                "running" => "Ejecutando",
                "completed" => "Completado",
                "failed" => "Fallado",
                "skipped" => "Saltado",
                "queued" => "En cola",
                _ => run.Status
            },
            ErrorMessage = run.ErrorMessage,
            SnapshotId = run.SnapshotId,
            ScheduledTimeLocal = run.ScheduledTimeLocal,
            ScheduledDayLocal = run.ScheduledDayLocal,
            DeviceCount = run.DeviceCount,
            UserCount = run.UserCount,
            NormalizedCron = run.NormalizedCron,
            ScheduleLabel = run.ScheduleLabel,
            CreatedAtUtc = run.CreatedAtUtc
        }).ToList();

        return new ScheduledScanRunPageViewModel
        {
            Search = request.Search,
            Status = request.Status,
            Weekday = request.Weekday,
            TimeSlot = request.TimeSlot,
            SortBy = request.SortBy,
            SortDirection = request.SortDirection,
            Page = request.Page,
            PageSize = request.PageSize,
            TotalCount = totalCount,
            TotalPages = (int)Math.Ceiling(totalCount / (double)request.PageSize),
            Items = items
        };
    }

    public async Task<NetworkTelemetryRematchResultViewModel> RematchSnapshotAsync(
        Guid snapshotId,
        string actor,
        IReadOnlyCollection<string>? campusKeys = null,
        CancellationToken cancellationToken = default)
    {
        var snapshot = await ApplyCampusScope(
                _context.NetworkTelemetrySnapshots.AsNoTracking(),
                campusKeys)
            .FirstOrDefaultAsync(s => s.Id == snapshotId, cancellationToken);

        if (snapshot is null)
        {
            return new NetworkTelemetryRematchResultViewModel { SnapshotId = snapshotId, Status = "not-found" };
        }

        var importedItems = await LoadInventoryMatchRecordsAsync(cancellationToken);
        var syncedEquipments = await LoadSyncedEquipmentMatchRecordsAsync(cancellationToken);

        var observations = await _context.NetworkTelemetryObservations
            .Where(o => o.NetworkTelemetrySnapshotId == snapshotId && o.ObservationType == "device")
            .ToListAsync(cancellationToken);

        var keyCounts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var changedCount = 0;
        var matchedCount = 0;
        var unmatchedCount = 0;

        foreach (var observation in observations)
        {
            var importedOutcome = FindImportedMatch(
                observation.SerialNumber,
                observation.MacAddress,
                observation.IpAddress,
                observation.DeviceName,
                observation.HostName,
                importedItems);
            var syncedOutcome = FindSyncedEquipmentMatch(
                observation.SerialNumber,
                observation.MacAddress,
                observation.IpAddress,
                observation.DeviceName,
                observation.HostName,
                syncedEquipments);

            var newImportedId = importedOutcome.Match?.Id;
            var newSyncedId = syncedOutcome.Match?.Id;
            var newKey = importedOutcome.Key.Length > 0 ? importedOutcome.Key : syncedOutcome.Key;
            var newBuildingExternalId = importedOutcome.Match?.AssignedBuildingExternalId
                ?? syncedOutcome.Match?.BuildingExternalId
                ?? observation.BuildingExternalId;
            var newRoomExternalId = importedOutcome.Match?.AssignedRoomExternalId
                ?? syncedOutcome.Match?.RoomExternalId
                ?? observation.RoomExternalId;

            if (observation.ImportedInventoryItemId != newImportedId ||
                observation.SyncedEquipmentId != newSyncedId ||
                observation.MatchKey != newKey ||
                !string.Equals(observation.BuildingExternalId, newBuildingExternalId, StringComparison.Ordinal) ||
                !string.Equals(observation.RoomExternalId, newRoomExternalId, StringComparison.Ordinal))
            {
                observation.ImportedInventoryItemId = newImportedId;
                observation.SyncedEquipmentId = newSyncedId;
                observation.MatchKey = newKey;
                observation.BuildingExternalId = newBuildingExternalId;
                observation.RoomExternalId = newRoomExternalId;
                changedCount++;
            }

            if (newImportedId is not null || newSyncedId is not null)
            {
                matchedCount++;
                if (newKey.Length > 0)
                {
                    keyCounts.TryGetValue(newKey, out var keyCount);
                    keyCounts[newKey] = keyCount + 1;
                }
            }
            else
            {
                unmatchedCount++;
            }
        }

        await _context.SaveChangesAsync(cancellationToken);

        await _auditLogService.LogSecurityEventAsync(
            actionType: "network-telemetry-rematch",
            resource: "network-telemetry",
            summary: $"Se recalcularon las coincidencias de inventario de la snapshot #{snapshotId}",
            details: $"Dispositivos: {observations.Count}; Coincidencias: {matchedCount}; Sin coincidir: {unmatchedCount}; Cambios: {changedCount}",
            result: "success",
            severity: "info",
            changedByUsername: actor,
            cancellationToken: cancellationToken);

        return new NetworkTelemetryRematchResultViewModel
        {
            SnapshotId = snapshotId,
            Status = "ok",
            DeviceCount = observations.Count,
            MatchedCount = matchedCount,
            UnmatchedCount = unmatchedCount,
            ChangedCount = changedCount,
            MatchKeyCounts = keyCounts
        };
    }

    public async Task<NetworkTelemetryMatchingSummaryViewModel> GetMatchingSummaryAsync(
        Guid snapshotId,
        IReadOnlyCollection<string>? campusKeys = null,
        CancellationToken cancellationToken = default)
    {
        var snapshot = await ApplyCampusScope(
                _context.NetworkTelemetrySnapshots.AsNoTracking(),
                campusKeys)
            .FirstOrDefaultAsync(s => s.Id == snapshotId, cancellationToken);

        if (snapshot is null)
        {
            return new NetworkTelemetryMatchingSummaryViewModel { SnapshotId = snapshotId, Found = false };
        }

        var deviceQuery = _context.NetworkTelemetryObservations
            .AsNoTracking()
            .Where(o => o.NetworkTelemetrySnapshotId == snapshotId && o.ObservationType == "device");

        var totalCount = await deviceQuery.CountAsync(cancellationToken);
        var matchedCount = await deviceQuery.CountAsync(o => o.ImportedInventoryItemId != null || o.SyncedEquipmentId != null, cancellationToken);
        var unmatchedCount = totalCount - matchedCount;

        var matchedKeys = await deviceQuery
            .Where(o => o.ImportedInventoryItemId != null || o.SyncedEquipmentId != null)
            .Select(o => o.MatchKey)
            .ToListAsync(cancellationToken);

        var matchKeyCounts = matchedKeys
            .GroupBy(key => string.IsNullOrWhiteSpace(key) ? "inventario" : key, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.Count(), StringComparer.OrdinalIgnoreCase);

        var riskRows = await deviceQuery
            .Select(o => new { o.RiskLevel, Matched = o.ImportedInventoryItemId != null || o.SyncedEquipmentId != null })
            .ToListAsync(cancellationToken);

        var matchedByRisk = riskRows
            .Where(row => row.Matched)
            .GroupBy(row => string.IsNullOrWhiteSpace(row.RiskLevel) ? "low" : row.RiskLevel, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.Count(), StringComparer.OrdinalIgnoreCase);

        var unmatchedByRisk = riskRows
            .Where(row => !row.Matched)
            .GroupBy(row => string.IsNullOrWhiteSpace(row.RiskLevel) ? "low" : row.RiskLevel, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.Count(), StringComparer.OrdinalIgnoreCase);

        var topUnmatched = await deviceQuery
            .Where(o => o.ImportedInventoryItemId == null && o.SyncedEquipmentId == null)
            .OrderByDescending(o => o.RiskScore)
            .ThenByDescending(o => o.Id)
            .Take(10)
            .Select(o => new NetworkTelemetryMatchingItemViewModel
            {
                ObservationId = o.Id,
                DeviceName = o.DeviceName,
                Username = o.Username,
                IpAddress = o.IpAddress,
                HostName = o.HostName,
                MacAddress = o.MacAddress,
                SerialNumber = o.SerialNumber,
                RiskLevel = o.RiskLevel,
                RiskScore = o.RiskScore,
                BuildingExternalId = o.BuildingExternalId,
                RoomExternalId = o.RoomExternalId,
                MatchKey = o.MatchKey,
                MatchKeyLabel = MatchKeyLabel(o.MatchKey),
                Matched = false
            })
            .ToListAsync(cancellationToken);

        return new NetworkTelemetryMatchingSummaryViewModel
        {
            SnapshotId = snapshotId,
            Found = true,
            SourceName = snapshot.SourceName,
            SourceType = snapshot.SourceType,
            RiskLevel = snapshot.RiskLevel,
            RiskScore = snapshot.RiskScore,
            ObservedAtUtc = snapshot.ObservedAtUtc,
            DeviceCount = totalCount,
            MatchedCount = matchedCount,
            UnmatchedCount = unmatchedCount,
            MatchRate = totalCount == 0 ? 0 : Math.Round(matchedCount * 100.0 / totalCount, 1),
            MatchKeyCounts = matchKeyCounts,
            MatchedByRiskLevel = matchedByRisk,
            UnmatchedByRiskLevel = unmatchedByRisk,
            TopUnmatched = topUnmatched
        };
    }

    public async Task<NetworkTelemetryMatchingPageViewModel> GetMatchingPageAsync(
        Guid snapshotId,
        NetworkTelemetryMatchingQueryRequest request,
        IReadOnlyCollection<string>? campusKeys = null,
        CancellationToken cancellationToken = default)
    {
        var page = Math.Max(1, request.Page);
        var pageSize = request.PageSize switch
        {
            10 or 25 or 50 or 100 or 200 or 500 => request.PageSize,
            _ => 10
        };

        if (!await SnapshotIsScopedAsync(snapshotId, campusKeys, cancellationToken))
        {
            return new NetworkTelemetryMatchingPageViewModel
            {
                SnapshotId = snapshotId,
                Page = page,
                PageSize = pageSize,
                TotalCount = 0,
                TotalPages = 1
            };
        }

        var query = _context.NetworkTelemetryObservations
            .AsNoTracking()
            .Where(o => o.NetworkTelemetrySnapshotId == snapshotId && o.ObservationType == "device");

        var matchState = request.MatchState.Trim().ToLowerInvariant();
        query = matchState switch
        {
            "matched" => query.Where(o => o.ImportedInventoryItemId != null || o.SyncedEquipmentId != null),
            "unmatched" => query.Where(o => o.ImportedInventoryItemId == null && o.SyncedEquipmentId == null),
            _ => query
        };

        if (!string.IsNullOrWhiteSpace(request.RiskLevel))
        {
            var normalizedRiskLevel = request.RiskLevel.Trim().ToLowerInvariant();
            query = query.Where(o => o.RiskLevel == normalizedRiskLevel);
        }

        if (!string.IsNullOrWhiteSpace(request.MatchKey))
        {
            var normalizedMatchKey = request.MatchKey.Trim();
            query = query.Where(o => o.MatchKey == normalizedMatchKey);
        }

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var search = request.Search.Trim();
            query = query.Where(o =>
                (o.DeviceName ?? string.Empty).Contains(search) ||
                (o.Username ?? string.Empty).Contains(search) ||
                (o.IpAddress ?? string.Empty).Contains(search) ||
                (o.HostName ?? string.Empty).Contains(search) ||
                (o.MacAddress ?? string.Empty).Contains(search) ||
                (o.SerialNumber ?? string.Empty).Contains(search) ||
                (o.BuildingExternalId ?? string.Empty).Contains(search));
        }

        var totalCount = await query.CountAsync(cancellationToken);
        var totalPages = Math.Max(1, (int)Math.Ceiling(totalCount / (double)pageSize));
        page = Math.Min(page, totalPages);

        var pageRows = await ApplyMatchingSorting(query, request)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(o => new
            {
                o.Id,
                o.DeviceName,
                o.Username,
                o.IpAddress,
                o.HostName,
                o.MacAddress,
                o.SerialNumber,
                o.RiskLevel,
                o.RiskScore,
                o.BuildingExternalId,
                o.RoomExternalId,
                o.MatchKey,
                o.ImportedInventoryItemId,
                o.SyncedEquipmentId
            })
            .ToListAsync(cancellationToken);

        var importedIds = pageRows
            .Where(row => row.ImportedInventoryItemId.HasValue)
            .Select(row => row.ImportedInventoryItemId!.Value)
            .ToHashSet();

        var importedItems = importedIds.Count == 0
            ? new List<ImportedInventoryItem>()
            : await _context.ImportedInventoryItems
                .AsNoTracking()
                .Where(item => importedIds.Contains(item.Id))
                .Select(item => new ImportedInventoryItem
                {
                    Id = item.Id,
                    ItemNumber = item.ItemNumber,
                    SerialNumber = item.SerialNumber,
                    Description = item.Description,
                    ResponsibleUser = item.ResponsibleUser,
                    Email = item.Email,
                    UnitOrDepartment = item.UnitOrDepartment,
                    OrganizationalUnit = item.OrganizationalUnit,
                    AssignedBuildingExternalId = item.AssignedBuildingExternalId,
                    AssignedRoomExternalId = item.AssignedRoomExternalId
                })
                .ToListAsync(cancellationToken);

        var itemById = importedItems.ToDictionary(item => item.Id);

        var items = pageRows.Select(row =>
        {
            var item = row.ImportedInventoryItemId.HasValue && itemById.TryGetValue(row.ImportedInventoryItemId.Value, out var found)
                ? found
                : null;

            return new NetworkTelemetryMatchingItemViewModel
            {
                ObservationId = row.Id,
                DeviceName = row.DeviceName,
                Username = row.Username,
                IpAddress = row.IpAddress,
                HostName = row.HostName,
                MacAddress = row.MacAddress,
                SerialNumber = row.SerialNumber,
                RiskLevel = row.RiskLevel,
                RiskScore = row.RiskScore,
                BuildingExternalId = row.BuildingExternalId,
                RoomExternalId = row.RoomExternalId,
                MatchKey = row.MatchKey,
                MatchKeyLabel = MatchKeyLabel(row.MatchKey),
                Matched = row.ImportedInventoryItemId.HasValue || row.SyncedEquipmentId.HasValue,
                InventoryItemId = row.ImportedInventoryItemId,
                InventoryItemNumber = item?.ItemNumber ?? string.Empty,
                InventorySerial = item?.SerialNumber ?? string.Empty,
                InventoryDescription = item?.Description ?? string.Empty,
                InventoryResponsibleUser = item?.ResponsibleUser ?? string.Empty,
                InventoryEmail = item?.Email ?? string.Empty,
                InventoryUnitOrDepartment = item?.UnitOrDepartment ?? string.Empty,
                InventoryOrganizationalUnit = item?.OrganizationalUnit ?? string.Empty,
                InventoryAssignedBuildingExternalId = item?.AssignedBuildingExternalId ?? string.Empty,
                InventoryAssignedRoomExternalId = item?.AssignedRoomExternalId ?? string.Empty
            };
        }).ToList();

        return new NetworkTelemetryMatchingPageViewModel
        {
            SnapshotId = snapshotId,
            MatchState = matchState,
            Search = request.Search ?? string.Empty,
            RiskLevel = request.RiskLevel ?? string.Empty,
            MatchKey = request.MatchKey ?? string.Empty,
            SortBy = request.SortBy ?? "risk",
            SortDirection = request.SortDirection ?? "desc",
            Page = page,
            PageSize = pageSize,
            TotalCount = totalCount,
            TotalPages = totalPages,
            Items = items
        };
    }

    private static IOrderedQueryable<NetworkTelemetryObservation> ApplyMatchingSorting(
        IQueryable<NetworkTelemetryObservation> query,
        NetworkTelemetryMatchingQueryRequest request)
    {
        var sortBy = request.SortBy.Trim().ToLowerInvariant();
        var descending = !string.Equals(request.SortDirection, "asc", StringComparison.OrdinalIgnoreCase);

        var ordered = sortBy switch
        {
            "deviceName" => descending
                ? query.OrderByDescending(o => o.DeviceName).ThenByDescending(o => o.RiskScore)
                : query.OrderBy(o => o.DeviceName).ThenByDescending(o => o.RiskScore),
            "ip" => descending
                ? query.OrderByDescending(o => o.IpAddress).ThenByDescending(o => o.RiskScore)
                : query.OrderBy(o => o.IpAddress).ThenByDescending(o => o.RiskScore),
            "matchKey" => descending
                ? query.OrderByDescending(o => o.MatchKey).ThenByDescending(o => o.RiskScore)
                : query.OrderBy(o => o.MatchKey).ThenByDescending(o => o.RiskScore),
            _ => descending
                ? query.OrderByDescending(o => o.RiskScore).ThenByDescending(o => o.Id)
                : query.OrderBy(o => o.RiskScore).ThenByDescending(o => o.Id)
        };

        return ordered;
    }

    public async Task<bool> DeleteSnapshotAsync(
        Guid snapshotId,
        string deletedByUsername,
        IReadOnlyCollection<string>? campusKeys = null,
        CancellationToken cancellationToken = default)
    {
        var snapshot = await ApplyCampusScope(
                _context.NetworkTelemetrySnapshots.AsNoTracking(),
                campusKeys)
            .FirstOrDefaultAsync(s => s.Id == snapshotId, cancellationToken);

        if (snapshot is null)
        {
            return false;
        }

        await _context.NetworkTelemetryObservations
            .Where(o => o.NetworkTelemetrySnapshotId == snapshotId)
            .ExecuteDeleteAsync(cancellationToken);

        await _context.NetworkTelemetrySnapshots
            .Where(s => s.Id == snapshotId)
            .ExecuteDeleteAsync(cancellationToken);

        await _auditLogService.LogSecurityEventAsync(
            actionType: "network-telemetry-delete",
            resource: "network-telemetry",
            summary: $"Se elimino la snapshot #{snapshotId} desde {snapshot.SourceName}",
            details: $"Fuente: {snapshot.SourceName}; Tipo: {snapshot.SourceType}; Fecha: {snapshot.ObservedAtUtc:O}",
            result: "success",
            severity: "warning",
            changedByUsername: deletedByUsername,
            cancellationToken: cancellationToken);

        return true;
    }
}
