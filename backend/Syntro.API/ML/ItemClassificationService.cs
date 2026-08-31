using System.Globalization;
using Microsoft.ML;
using Microsoft.ML.Data;
using Syntro.API.ML.Models;

namespace Syntro.API.ML;

public record TrainingMetrics(int Samples, float Accuracy, float MicroAccuracy, float AccuracyStdDev = 0f, float MicroAccuracyStdDev = 0f);

public class ItemClassificationService
{
    private readonly MLContext _mlContext;
    private readonly string _modelPath;
    private readonly ILogger<ItemClassificationService> _logger;
    private ITransformer? _model;
    private PredictionEngine<ItemClassificationInput, ItemClassificationOutput>? _predictionEngine;

    public bool IsModelLoaded => _model is not null;

    public ItemClassificationService(IConfiguration configuration, ILogger<ItemClassificationService> logger)
    {
        _mlContext = new MLContext(seed: 42);
        _logger = logger;

        var modelsPath = configuration["MlSettings:ModelsPath"] ?? "ml-models";
        _modelPath = configuration["MlSettings:ItemClassificationModelPath"]
            ?? Path.Combine(modelsPath, "item-classification.zip");

        LoadModel();
    }

    private void LoadModel()
    {
        try
        {
            if (File.Exists(_modelPath))
            {
                _model = _mlContext.Model.Load(_modelPath, out _);
                _predictionEngine = _mlContext.Model.CreatePredictionEngine<ItemClassificationInput, ItemClassificationOutput>(_model);
                _logger.LogInformation("Modelo de clasificación de inventario cargado desde {Path}", _modelPath);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "No se pudo cargar el modelo de clasificación de inventario");
            _model = null;
            _predictionEngine = null;
        }
    }

    public ItemClassificationOutput PredictCategory(string description, string observation, string lot = "")
    {
        if (_predictionEngine is null)
        {
            return new ItemClassificationOutput { PredictedCategory = "other", Score = [0] };
        }

        var input = new ItemClassificationInput
        {
            Description = description ?? string.Empty,
            Observation = observation ?? string.Empty,
            Lot = lot ?? string.Empty
        };

        return _predictionEngine.Predict(input);
    }

    public TrainingMetrics TrainFromData(IEnumerable<ItemClassificationInput> trainingData, string labelColumn = "Label")
    {
        var dataList = trainingData.ToList();
        var dataView = _mlContext.Data.LoadFromEnumerable(dataList);

        var pipeline = _mlContext.Transforms.Conversion.MapValueToKey(labelColumn)
            .Append(_mlContext.Transforms.Text.FeaturizeText("DescriptionFeaturized", nameof(ItemClassificationInput.Description)))
            .Append(_mlContext.Transforms.Text.FeaturizeText("ObservationFeaturized", nameof(ItemClassificationInput.Observation)))
            .Append(_mlContext.Transforms.Concatenate("Features", "DescriptionFeaturized", "ObservationFeaturized"))
            .Append(_mlContext.MulticlassClassification.Trainers.SdcaMaximumEntropy(labelColumnName: labelColumn, featureColumnName: "Features"))
            .Append(_mlContext.Transforms.Conversion.MapKeyToValue("PredictedLabel"));

        _model = pipeline.Fit(dataView);

        var directory = Path.GetDirectoryName(_modelPath);
        if (!string.IsNullOrEmpty(directory))
        {
            Directory.CreateDirectory(directory);
        }

        _mlContext.Model.Save(_model, dataView.Schema, _modelPath);
        _predictionEngine = _mlContext.Model.CreatePredictionEngine<ItemClassificationInput, ItemClassificationOutput>(_model);

        float accuracy = 0f;
        float microAccuracy = 0f;
        float accuracyStd = 0f;
        float microStd = 0f;

        if (dataList.Count >= 20)
        {
            try
            {
                int folds = Math.Min(3, dataList.Count);
                var cvResults = _mlContext.MulticlassClassification.CrossValidate(dataView, pipeline, numberOfFolds: folds, labelColumnName: labelColumn);

                var accuracies = cvResults.Select(r => (float)r.Metrics.MacroAccuracy).ToList();
                var microAccuracies = cvResults.Select(r => (float)r.Metrics.MicroAccuracy).ToList();

                accuracy = accuracies.Average();
                microAccuracy = microAccuracies.Average();
                accuracyStd = StdDev(accuracies);
                microStd = StdDev(microAccuracies);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "No se pudieron calcular métricas de evaluación con cross-validation");
            }
        }

        _logger.LogInformation("Modelo de clasificación de inventario entrenado con {Count} muestras (CV: accuracy={Accuracy:F2}±{Std:F2})", dataList.Count, accuracy, accuracyStd);
        return new TrainingMetrics(dataList.Count, accuracy, microAccuracy, accuracyStd, microStd);
    }

    private static float StdDev(List<float> values)
    {
        if (values.Count < 2) return 0f;
        var mean = values.Average();
        var sumSqDiff = values.Sum(v => (v - mean) * (v - mean));
        return MathF.Sqrt(sumSqDiff / (values.Count - 1));
    }

    public MulticlassClassificationMetrics Evaluate(IEnumerable<ItemClassificationInput> testData)
    {
        if (_model is null)
        {
            throw new InvalidOperationException("No hay modelo cargado para evaluar.");
        }

        var dataView = _mlContext.Data.LoadFromEnumerable(testData);
        var predictions = _model.Transform(dataView);
        return _mlContext.MulticlassClassification.Evaluate(predictions);
    }
}
