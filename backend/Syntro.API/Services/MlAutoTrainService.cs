using Microsoft.EntityFrameworkCore;
using Syntro.API.Data;
using Syntro.API.ML;
using Syntro.API.ML.Models;
using Syntro.API.Models;

namespace Syntro.API.Services;

public class MlAutoTrainService
{
    private readonly ItemClassificationService _classificationService;
    private readonly RiskPredictionService _riskPredictionService;
    private readonly MlSettingsService _mlSettings;
    private readonly AppDbContext _context;
    private readonly IConfiguration _configuration;
    private readonly ILogger<MlAutoTrainService> _logger;

    public MlAutoTrainService(
        ItemClassificationService classificationService,
        RiskPredictionService riskPredictionService,
        MlSettingsService mlSettings,
        AppDbContext context,
        IConfiguration configuration,
        ILogger<MlAutoTrainService> logger)
    {
        _classificationService = classificationService;
        _riskPredictionService = riskPredictionService;
        _mlSettings = mlSettings;
        _context = context;
        _configuration = configuration;
        _logger = logger;
    }

    public async Task TrainClassificationAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            var items = await _context.ImportedInventoryItems
                .Where(i => !string.IsNullOrWhiteSpace(i.Description) && !string.IsNullOrWhiteSpace(i.InferredCategory))
                .Select(i => new ItemClassificationInput
                {
                    Description = i.Description,
                    Observation = i.Observation ?? string.Empty,
                    Lot = i.Lot ?? string.Empty,
                    Label = i.InferredCategory
                })
                .ToListAsync(cancellationToken);

            if (items.Count < 10)
            {
                _logger.LogInformation("Auto-entrenamiento clasificacion omitido: {Count} items disponibles (minimo 10)", items.Count);
                return;
            }

            var metrics = _classificationService.TrainFromData(items);
            _context.MlTrainingRuns.Add(new MlTrainingRun
            {
                ModelType = "item-classification",
                Samples = metrics.Samples,
                Accuracy = metrics.Accuracy,
                F1Score = metrics.MicroAccuracy
            });
            await _context.SaveChangesAsync(cancellationToken);

            var threshold = _configuration.GetValue<float?>("MlSettings:ClassificationConfidenceThreshold") ?? 0.6f;
            var allItems = await _context.ImportedInventoryItems
                .Where(i => !string.IsNullOrWhiteSpace(i.Description))
                .ToListAsync(cancellationToken);

            int mlRescoredCount = 0;
            foreach (var item in allItems)
            {
                var mlResult = _classificationService.PredictCategory(item.Description, item.Observation ?? string.Empty, item.Lot ?? string.Empty);
                var maxScore = mlResult.Score.Length > 0 ? mlResult.Score.Max() : 0f;
                if (maxScore >= threshold)
                {
                    item.CategorySource = "ml";
                    item.ClassificationConfidence = maxScore;
                    item.InferredCategory = mlResult.PredictedCategory;
                    item.ClassificationDetail = BuildMlDetail(mlResult.PredictedCategory, mlResult.Score, maxScore);
                    mlRescoredCount++;
                }
                else
                {
                    var (fallbackCat, fallbackToken) = InventoryCategoriesConfig.InferCategoryWithDetail(_configuration, item.Description);
                    item.CategorySource = "rule";
                    item.ClassificationConfidence = null;
                    item.ClassificationDetail = string.IsNullOrWhiteSpace(fallbackToken)
                        ? $"ML confianza baja ({maxScore:P0}) \u2192 regla: sin coincidencia \u2192 categor\u00eda por defecto: \u2018{fallbackCat}\u2019"
                        : $"ML confianza baja ({maxScore:P0}) \u2192 regla: token \u2018{fallbackToken}\u2019 \u2192 categor\u00eda \u2018{fallbackCat}\u2019";
                }
            }
            await _context.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Auto-entrenamiento clasificacion completado: {Count} muestras, {Rescored} items re-clasificados", items.Count, mlRescoredCount);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Auto-entrenamiento de clasificacion fallo");
        }
    }

    public async Task TrainRiskAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            var rawObservations = await _context.NetworkTelemetryObservations
                .Where(o => o.ObservationType == "device")
                .ToListAsync(cancellationToken);

            var observations = rawObservations
                .Select(o => new RiskPredictionInput
                {
                    IsOnline = o.IsOnline == true ? 1f : 0f,
                    MatchScore = string.IsNullOrEmpty(o.MatchKey) ? 0f : 1f,
                    HasAssignedBuilding = string.IsNullOrEmpty(o.BuildingExternalId) ? 0f : 1f,
                    DuplicateIpCount = 0f,
                    DuplicateMacCount = 0f,
                    IsKnownUser = o.AuthUserId.HasValue ? 1f : 0f,
                    DeviceCount = 0f,
                    AntivirusEnabled = !string.IsNullOrEmpty(o.AntivirusStatus) &&
                        !o.AntivirusStatus.Contains("DISABLED", StringComparison.OrdinalIgnoreCase) &&
                        !o.AntivirusStatus.Contains("INACTIVE", StringComparison.OrdinalIgnoreCase) ? 1f : 0f,
                    PendingPatches = !string.IsNullOrEmpty(o.PatchStatus) &&
                        (o.PatchStatus.Contains("OUTDATED", StringComparison.OrdinalIgnoreCase) ||
                         o.PatchStatus.Contains("PENDING", StringComparison.OrdinalIgnoreCase)) ? 1f : 0f,
                    DomainJoined = o.DomainJoined == true ? 1f : 0f,
                    DiskFreePercent = o.DiskTotalGb > 0 && o.DiskFreeGb.HasValue
                        ? (float)(o.DiskFreeGb.Value / o.DiskTotalGb.Value * 100)
                        : 100f,
                    UptimeDays = o.LastBootAtUtc.HasValue
                        ? (float)(DateTime.UtcNow - o.LastBootAtUtc.Value).TotalDays
                        : 0f,
                    PingMs = o.PingMs ?? 0,
                    RdpExposed = 0f,
                    SmbExposed = 0f,
                    SshExposed = 0f,
                    OpenPortCount = string.IsNullOrEmpty(o.OpenPorts) ? 0f :
                        o.OpenPorts.Split(',', StringSplitOptions.RemoveEmptyEntries).Length,
                    Label = (o.RiskLevel == "critical" || o.RiskLevel == "high"),
                })
                .ToList();

            if (observations.Count < 20)
            {
                _logger.LogInformation("Auto-entrenamiento riesgo omitido: {Count} observaciones disponibles (minimo 20)", observations.Count);
                return;
            }

            var metrics = _riskPredictionService.TrainFromData(observations);
            _context.MlTrainingRuns.Add(new MlTrainingRun
            {
                ModelType = "risk-prediction",
                Samples = metrics.Samples,
                Accuracy = metrics.Accuracy,
                F1Score = metrics.MicroAccuracy
            });
            await _context.SaveChangesAsync(cancellationToken);

            int mlRescoredCount = 0;
            for (int i = 0; i < rawObservations.Count; i++)
            {
                var obs = rawObservations[i];
                var input = observations[i];
                var mlPrediction = _riskPredictionService.Predict(input);
                var hybridScore = _riskPredictionService.ComputeHybridScore(obs.RiskScore, mlPrediction);
                obs.ScoringSource = "ml-hybrid";
                obs.MlProbability = mlPrediction.Probability;
                obs.RuleBasedScore = obs.RiskScore;
                obs.RiskScore = hybridScore;
                obs.RiskLevel = ToRiskLevel(hybridScore);
                mlRescoredCount++;
            }
            await _context.SaveChangesAsync(cancellationToken);

            _logger.LogInformation("Auto-entrenamiento riesgo completado: {Count} muestras, {Rescored} observaciones re-evaluadas", observations.Count, mlRescoredCount);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Auto-entrenamiento de riesgo fallo");
        }
    }

    private static string ToRiskLevel(int score)
    {
        if (score >= 80) return "critical";
        if (score >= 60) return "high";
        if (score >= 40) return "medium";
        return "low";
    }

    private static string BuildMlDetail(string predictedCategory, float[] scores, float maxScore)
    {
        var labels = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["pc"] = "PC", ["printer"] = "Impresora", ["scanner"] = "Escaner", ["other"] = "Otros"
        };

        var detail = $"ML predijo \u2018{labels.GetValueOrDefault(predictedCategory, predictedCategory)}\u2019 ({maxScore:P0})";
        if (scores.Length > 0)
        {
            var top = scores.Select((s, i) => (Score: s, Index: i)).OrderByDescending(x => x.Score).Take(4);
            var parts = top.Select(t => $"{labels.GetValueOrDefault($"cat{t.Index}", $"cat{t.Index}")} ({t.Score:P0})").ToList();
            if (parts.Count > 0)
                detail += $" \u2014 desglose: {string.Join(", ", parts)}";
        }
        return detail;
    }
}
