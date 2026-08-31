using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Syntro.API.Data;
using Syntro.API.ML;
using Syntro.API.ML.Models;
using Syntro.API.Models;
using Syntro.API.Services;

namespace Syntro.API.Controllers;

[ApiController]
[Route("api/ml")]
[Authorize]
public class MLController : ControllerBase
{
    private readonly ItemClassificationService _classificationService;
    private readonly RiskPredictionService _riskPredictionService;
    private readonly MlSettingsService _mlSettings;
    private readonly AppDbContext _context;
    private readonly IConfiguration _configuration;
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<MLController> _logger;

    public MLController(
        ItemClassificationService classificationService,
        RiskPredictionService riskPredictionService,
        MlSettingsService mlSettings,
        AppDbContext context,
        IConfiguration configuration,
        IWebHostEnvironment env,
        ILogger<MLController> logger)
    {
        _classificationService = classificationService;
        _riskPredictionService = riskPredictionService;
        _mlSettings = mlSettings;
        _context = context;
        _configuration = configuration;
        _env = env;
        _logger = logger;
    }

    [HttpGet("status")]
    public async Task<IActionResult> GetStatus(CancellationToken cancellationToken = default)
    {
        var modelsPath = _configuration["MlSettings:ModelsPath"] ?? "ml-models";
        var contentRoot = _env.ContentRootPath;

        var classificationModelPath = _configuration["MlSettings:ItemClassificationModelPath"]
            ?? Path.Combine(modelsPath, "item-classification.zip");
        var riskModelPath = _configuration["MlSettings:RiskPredictionModelPath"]
            ?? Path.Combine(modelsPath, "risk-prediction.zip");

        var classificationFile = Path.Combine(contentRoot, classificationModelPath);
        var riskFile = Path.Combine(contentRoot, riskModelPath);

        var totalItems = await _context.ImportedInventoryItems.CountAsync(cancellationToken);
        var mlClassifiedItems = await _context.ImportedInventoryItems.CountAsync(i => i.CategorySource == "ml", cancellationToken);
        var totalDeviceObs = await _context.NetworkTelemetryObservations.CountAsync(o => o.ObservationType == "device", cancellationToken);
        var mlScoredDevices = await _context.NetworkTelemetryObservations.CountAsync(o => o.ObservationType == "device" && o.ScoringSource == "ml-hybrid", cancellationToken);

        var lastClassificationTraining = await _context.MlTrainingRuns
            .Where(r => r.ModelType == "item-classification")
            .OrderByDescending(r => r.CreatedAtUtc)
            .Select(r => new { r.Samples, r.Accuracy, r.F1Score, r.CreatedAtUtc })
            .FirstOrDefaultAsync(cancellationToken);

        var lastRiskTraining = await _context.MlTrainingRuns
            .Where(r => r.ModelType == "risk-prediction")
            .OrderByDescending(r => r.CreatedAtUtc)
            .Select(r => new { r.Samples, r.Accuracy, r.F1Score, r.CreatedAtUtc })
            .FirstOrDefaultAsync(cancellationToken);

        return Ok(new
        {
            Enabled = _mlSettings.IsEnabled,
            ModelsPath = modelsPath,
            ItemClassification = new
            {
                Loaded = _classificationService.IsModelLoaded,
                FileExists = System.IO.File.Exists(classificationFile),
                FileSizeBytes = System.IO.File.Exists(classificationFile)
                    ? new FileInfo(classificationFile).Length
                    : (long?)null,
                LastModifiedUtc = System.IO.File.Exists(classificationFile)
                    ? new FileInfo(classificationFile).LastWriteTimeUtc
                    : (DateTime?)null,
                LastTraining = lastClassificationTraining,
            },
            RiskPrediction = new
            {
                Loaded = _riskPredictionService.IsModelLoaded,
                FileExists = System.IO.File.Exists(riskFile),
                FileSizeBytes = System.IO.File.Exists(riskFile)
                    ? new FileInfo(riskFile).Length
                    : (long?)null,
                LastModifiedUtc = System.IO.File.Exists(riskFile)
                    ? new FileInfo(riskFile).LastWriteTimeUtc
                    : (DateTime?)null,
                MlWeight = _riskPredictionService.MlWeight,
                RuleWeight = _riskPredictionService.RuleWeight,
                LastTraining = lastRiskTraining,
            },
            TrainingData = new
            {
                ImportedItemsCount = totalItems,
                TelemetryObservationsCount = totalDeviceObs,
                MlClassifiedItems = mlClassifiedItems,
                RuleClassifiedItems = totalItems - mlClassifiedItems,
                MlScoredDevices = mlScoredDevices,
                RuleScoredDevices = totalDeviceObs - mlScoredDevices,
            },
        });
    }

    [HttpPost("train-item-classification")]
    [Authorize(Roles = $"{AppRoles.Admin},{AppRoles.Admin}")]
    public async Task<IActionResult> TrainItemClassification(CancellationToken cancellationToken = default)
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
            return BadRequest(new { error = "Se necesitan al menos 10 items para entrenar.", available = items.Count });
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
                var (fallbackCat, fallbackToken) = Services.InventoryCategoriesConfig.InferCategoryWithDetail(_configuration, item.Description);
                item.CategorySource = "rule";
                item.ClassificationConfidence = null;
                item.ClassificationDetail = string.IsNullOrWhiteSpace(fallbackToken)
                    ? $"ML confianza baja ({maxScore:P0}) \u2192 regla: sin coincidencia \u2192 categor\u00eda por defecto: \u2018{fallbackCat}\u2019"
                    : $"ML confianza baja ({maxScore:P0}) \u2192 regla: token \u2018{fallbackToken}\u2019 \u2192 categor\u00eda \u2018{fallbackCat}\u2019";
            }
        }
        await _context.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Modelo de clasificación entrenado con {Count} muestras, {Rescored} items re-clasificados por ML", items.Count, mlRescoredCount);
        return Ok(new
        {
            trained = true,
            samples = metrics.Samples,
            accuracy = Math.Round(metrics.Accuracy, 4),
            accuracyStdDev = Math.Round(metrics.AccuracyStdDev, 4),
            f1Score = Math.Round(metrics.MicroAccuracy, 4),
            f1ScoreStdDev = Math.Round(metrics.MicroAccuracyStdDev, 4),
            mlRescoredCount,
            totalItems = allItems.Count
        });
    }

    [HttpPost("train-risk-prediction")]
    [Authorize(Roles = $"{AppRoles.Admin},{AppRoles.Admin}")]
    public async Task<IActionResult> TrainRiskPrediction(CancellationToken cancellationToken = default)
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
            return BadRequest(new { error = "Se necesitan al menos 20 observaciones para entrenar.", available = observations.Count });
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
            mlRescoredCount++;
        }
        await _context.SaveChangesAsync(cancellationToken);

        _logger.LogInformation("Modelo de predicción de riesgo entrenado con {Count} muestras, {Rescored} observaciones re-escaladas por ML", observations.Count, mlRescoredCount);
        return Ok(new
        {
            trained = true,
            samples = metrics.Samples,
            accuracy = Math.Round(metrics.Accuracy, 4),
            accuracyStdDev = Math.Round(metrics.AccuracyStdDev, 4),
            f1Score = Math.Round(metrics.MicroAccuracy, 4),
            f1ScoreStdDev = Math.Round(metrics.MicroAccuracyStdDev, 4),
            mlRescoredCount,
            totalObservations = rawObservations.Count
        });
    }

    [HttpPost("delete-model/{modelType}")]
    [Authorize(Roles = $"{AppRoles.Admin},{AppRoles.Admin}")]
    public IActionResult DeleteModel(string modelType)
    {
        var modelsPath = _configuration["MlSettings:ModelsPath"] ?? "ml-models";
        var contentRoot = _env.ContentRootPath;

        string? fileName = modelType switch
        {
            "item-classification" => "item-classification.zip",
            "risk-prediction" => "risk-prediction.zip",
            _ => null
        };

        if (fileName is null)
        {
            return BadRequest(new { error = "Tipo de modelo no valido." });
        }

        var fullPath = Path.Combine(contentRoot, modelsPath, fileName);
        if (!System.IO.File.Exists(fullPath))
        {
            return NotFound(new { error = "El modelo no existe." });
        }

        System.IO.File.Delete(fullPath);
        _logger.LogInformation("Modelo {ModelType} eliminado: {Path}", modelType, fullPath);
        return Ok(new { deleted = true, modelType });
    }

    [HttpPost("toggle")]
    [Authorize(Roles = $"{AppRoles.Admin},{AppRoles.Admin}")]
    public IActionResult ToggleMl([FromBody] ToggleMlRequest request)
    {
        _mlSettings.Toggle(request.Enabled);
        return Ok(new { enabled = request.Enabled });
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

public class ToggleMlRequest
{
    public bool Enabled { get; set; }
}
