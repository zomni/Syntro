using Microsoft.ML;
using Microsoft.ML.Data;
using Syntro.API.ML.Models;

namespace Syntro.API.ML;

public class RiskPredictionService
{
    private readonly MLContext _mlContext;
    private readonly string _modelPath;
    private readonly float _mlWeight;
    private readonly float _ruleWeight;
    private readonly ILogger<RiskPredictionService> _logger;
    private ITransformer? _model;
    private PredictionEngine<RiskPredictionInput, RiskPredictionOutput>? _predictionEngine;

    public bool IsModelLoaded => _model is not null;
    public float MlWeight => _mlWeight;
    public float RuleWeight => _ruleWeight;

    public RiskPredictionService(IConfiguration configuration, ILogger<RiskPredictionService> logger)
    {
        _mlContext = new MLContext(seed: 42);
        _logger = logger;

        var modelsPath = configuration["MlSettings:ModelsPath"] ?? "ml-models";
        _modelPath = configuration["MlSettings:RiskPredictionModelPath"]
            ?? Path.Combine(modelsPath, "risk-prediction.zip");
        _mlWeight = configuration.GetValue<float?>("MlSettings:RiskMlWeight") ?? 0.6f;
        _ruleWeight = configuration.GetValue<float?>("MlSettings:RiskRuleWeight") ?? 0.4f;

        LoadModel();
    }

    private void LoadModel()
    {
        try
        {
            if (File.Exists(_modelPath))
            {
                _model = _mlContext.Model.Load(_modelPath, out _);
                _predictionEngine = _mlContext.Model.CreatePredictionEngine<RiskPredictionInput, RiskPredictionOutput>(_model);
                _logger.LogInformation("Modelo de predicción de riesgo cargado desde {Path}", _modelPath);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "No se pudo cargar el modelo de predicción de riesgo");
            _model = null;
            _predictionEngine = null;
        }
    }

    public RiskPredictionOutput Predict(RiskPredictionInput input)
    {
        if (_predictionEngine is null)
        {
            return new RiskPredictionOutput
            {
                PredictedLabel = false,
                Probability = 0f,
                Score = 0f
            };
        }

        return _predictionEngine.Predict(input);
    }

    public int ComputeHybridScore(int ruleBasedScore, RiskPredictionOutput mlPrediction)
    {
        var mlScore = (int)(mlPrediction.Probability * 100);
        var hybridScore = (int)(mlScore * _mlWeight + ruleBasedScore * _ruleWeight);
        return Math.Min(hybridScore, 100);
    }

    public TrainingMetrics TrainFromData(IEnumerable<RiskPredictionInput> trainingData, string labelColumn = "Label")
    {
        var dataList = trainingData.ToList();
        var dataView = _mlContext.Data.LoadFromEnumerable(dataList);

        var featureColumns = new[]
        {
            nameof(RiskPredictionInput.IsOnline),
            nameof(RiskPredictionInput.MatchScore),
            nameof(RiskPredictionInput.HasAssignedBuilding),
            nameof(RiskPredictionInput.DuplicateIpCount),
            nameof(RiskPredictionInput.DuplicateMacCount),
            nameof(RiskPredictionInput.IsKnownUser),
            nameof(RiskPredictionInput.DeviceCount),
            nameof(RiskPredictionInput.AntivirusEnabled),
            nameof(RiskPredictionInput.PendingPatches),
            nameof(RiskPredictionInput.DomainJoined),
            nameof(RiskPredictionInput.DiskFreePercent),
            nameof(RiskPredictionInput.UptimeDays),
            nameof(RiskPredictionInput.PingMs),
            nameof(RiskPredictionInput.RdpExposed),
            nameof(RiskPredictionInput.SmbExposed),
            nameof(RiskPredictionInput.SshExposed),
            nameof(RiskPredictionInput.OpenPortCount),
        };

        var pipeline = _mlContext.Transforms.Concatenate("Features", featureColumns)
            .Append(_mlContext.BinaryClassification.Trainers.SdcaLogisticRegression(
                labelColumnName: labelColumn,
                featureColumnName: "Features"));

        _model = pipeline.Fit(dataView);

        var directory = Path.GetDirectoryName(_modelPath);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }

        _mlContext.Model.Save(_model, dataView.Schema, _modelPath);
        _predictionEngine = _mlContext.Model.CreatePredictionEngine<RiskPredictionInput, RiskPredictionOutput>(_model);

        float accuracy = 0f;
        float f1 = 0f;
        float accuracyStd = 0f;
        float f1Std = 0f;

        if (dataList.Count >= 40)
        {
            try
            {
                int folds = Math.Min(3, dataList.Count);
                var cvResults = _mlContext.BinaryClassification.CrossValidate(dataView, pipeline, numberOfFolds: folds, labelColumnName: labelColumn);

                var accuracies = cvResults.Select(r => (float)r.Metrics.Accuracy).ToList();
                var f1Scores = cvResults.Select(r => (float)r.Metrics.F1Score).ToList();

                accuracy = accuracies.Average();
                f1 = f1Scores.Average();
                accuracyStd = StdDev(accuracies);
                f1Std = StdDev(f1Scores);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "No se pudieron calcular métricas de evaluación con cross-validation");
            }
        }

        _logger.LogInformation("Modelo de predicción de riesgo entrenado con {Count} muestras (CV: accuracy={Accuracy:F2}±{Std:F2}, f1={F1:F2}±{F1Std:F2})", dataList.Count, accuracy, accuracyStd, f1, f1Std);
        return new TrainingMetrics(dataList.Count, accuracy, f1, accuracyStd, f1Std);
    }

    private static float StdDev(List<float> values)
    {
        if (values.Count < 2) return 0f;
        var mean = values.Average();
        var sumSqDiff = values.Sum(v => (v - mean) * (v - mean));
        return MathF.Sqrt(sumSqDiff / (values.Count - 1));
    }

    public BinaryClassificationMetrics Evaluate(IEnumerable<RiskPredictionInput> testData)
    {
        if (_model is null)
        {
            throw new InvalidOperationException("No hay modelo cargado para evaluar.");
        }

        var dataView = _mlContext.Data.LoadFromEnumerable(testData);
        var predictions = _model.Transform(dataView);
        return _mlContext.BinaryClassification.Evaluate(predictions);
    }
}
