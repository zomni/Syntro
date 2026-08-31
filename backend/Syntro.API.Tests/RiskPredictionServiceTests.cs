using System.Globalization;
using Microsoft.Extensions.Logging;
using Syntro.API.ML;
using Syntro.API.ML.Models;

namespace Syntro.API.Tests;

public class RiskPredictionServiceTests : IDisposable
{
    private readonly string _tempDir;
    private readonly string _modelPath;

    public RiskPredictionServiceTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), $"ml_risk_test_{Guid.NewGuid():N}");
        Directory.CreateDirectory(_tempDir);
        _modelPath = Path.Combine(_tempDir, "risk-prediction.zip");
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
            Directory.Delete(_tempDir, true);
    }

    private RiskPredictionService CreateService(float mlWeight = 0.6f, float ruleWeight = 0.4f)
    {
        var config = TestConfiguration.FromSettings(new Dictionary<string, string?>
        {
            ["MlSettings:ModelsPath"] = _tempDir,
            ["MlSettings:RiskPredictionModelPath"] = _modelPath,
            ["MlSettings:RiskMlWeight"] = mlWeight.ToString(CultureInfo.InvariantCulture),
            ["MlSettings:RiskRuleWeight"] = ruleWeight.ToString(CultureInfo.InvariantCulture)
        });
        var logger = new LoggerFactory().CreateLogger<RiskPredictionService>();
        return new RiskPredictionService(config, logger);
    }

    private static List<RiskPredictionInput> GenerateTrainingData(int count)
    {
        var rng = new Random(42);
        var data = new List<RiskPredictionInput>();

        for (int i = 0; i < count; i++)
        {
            var isHighRisk = i % 3 == 0;
            data.Add(new RiskPredictionInput
            {
                IsOnline = isHighRisk ? 0f : 1f,
                MatchScore = isHighRisk ? 0f : 1f,
                HasAssignedBuilding = isHighRisk ? 0f : 1f,
                DuplicateIpCount = isHighRisk ? 1f : 0f,
                DuplicateMacCount = isHighRisk ? 1f : 0f,
                IsKnownUser = isHighRisk ? 0f : 1f,
                DeviceCount = 0f,
                AntivirusEnabled = isHighRisk ? 0f : 1f,
                PendingPatches = isHighRisk ? 1f : 0f,
                DomainJoined = isHighRisk ? 0f : 1f,
                DiskFreePercent = isHighRisk ? 5f : 50f,
                UptimeDays = isHighRisk ? 120f : 10f,
                PingMs = isHighRisk ? 200 : 10,
                RdpExposed = isHighRisk ? 1f : 0f,
                SmbExposed = isHighRisk ? 1f : 0f,
                SshExposed = isHighRisk ? 1f : 0f,
                OpenPortCount = isHighRisk ? 8f : 1f,
                Label = isHighRisk
            });
        }
        return data;
    }

    [Fact]
    public void IsModelLoaded_False_WhenNoModelExists()
    {
        var service = CreateService();
        Assert.False(service.IsModelLoaded);
    }

    [Fact]
    public void Predict_ReturnsDefault_WhenModelNotLoaded()
    {
        var service = CreateService();
        var result = service.Predict(new RiskPredictionInput());

        Assert.False(result.PredictedLabel);
        Assert.Equal(0f, result.Probability);
        Assert.Equal(0f, result.Score);
    }

    [Fact]
    public void TrainFromData_ReturnsCorrectSampleCount()
    {
        var service = CreateService();
        var data = GenerateTrainingData(50);

        var metrics = service.TrainFromData(data);

        Assert.Equal(50, metrics.Samples);
        Assert.True(service.IsModelLoaded);
        Assert.True(File.Exists(_modelPath));
    }

    [Fact]
    public void TrainFromData_ReturnsZeroMetrics_WhenInsufficientSamples()
    {
        var service = CreateService();
        var data = GenerateTrainingData(30);

        var metrics = service.TrainFromData(data);

        Assert.Equal(30, metrics.Samples);
        Assert.Equal(0f, metrics.Accuracy);
        Assert.Equal(0f, metrics.MicroAccuracy);
    }

    [Fact]
    public void TrainFromData_ReturnsMetrics_WhenEnoughSamples()
    {
        var service = CreateService();
        var data = GenerateTrainingData(60);

        var metrics = service.TrainFromData(data);

        Assert.Equal(60, metrics.Samples);
        Assert.InRange(metrics.Accuracy, 0f, 1f);
        Assert.InRange(metrics.MicroAccuracy, 0f, 1f);
        Assert.True(metrics.AccuracyStdDev >= 0f);
        Assert.True(metrics.MicroAccuracyStdDev >= 0f);
    }

    [Fact]
    public void TrainFromData_ReturnsZeroStdDev_WhenInsufficientSamplesForCV()
    {
        var service = CreateService();
        var data = GenerateTrainingData(30);

        var metrics = service.TrainFromData(data);

        Assert.Equal(0f, metrics.AccuracyStdDev);
        Assert.Equal(0f, metrics.MicroAccuracyStdDev);
    }

    [Fact]
    public void Predict_ReturnsPrediction_WhenModelLoaded()
    {
        var service = CreateService();
        var data = GenerateTrainingData(60);
        service.TrainFromData(data);

        var result = service.Predict(new RiskPredictionInput
        {
            IsOnline = 0f,
            MatchScore = 0f,
            AntivirusEnabled = 0f,
            PendingPatches = 1f,
            DomainJoined = 0f,
            Label = true
        });

        Assert.InRange(result.Probability, 0f, 1f);
    }

    [Fact]
    public void ComputeHybridScore_BlendsCorrectly_WithDefaultWeights()
    {
        var service = CreateService(mlWeight: 0.6f, ruleWeight: 0.4f);
        var mlPrediction = new RiskPredictionOutput
        {
            PredictedLabel = true,
            Probability = 0.8f,
            Score = 2f
        };

        var hybridScore = service.ComputeHybridScore(50, mlPrediction);

        // mlScore = 0.8 * 100 = 80
        // hybrid = 80 * 0.6 + 50 * 0.4 = 48 + 20 = 68
        Assert.Equal(68, hybridScore);
    }

    [Fact]
    public void ComputeHybridScore_CapsAt100_WhenHighScores()
    {
        var service = CreateService(mlWeight: 0.6f, ruleWeight: 0.4f);
        var mlPrediction = new RiskPredictionOutput
        {
            PredictedLabel = true,
            Probability = 1.0f,
            Score = 5f
        };

        var hybridScore = service.ComputeHybridScore(100, mlPrediction);

        Assert.Equal(100, hybridScore);
    }

    [Fact]
    public void ComputeHybridScore_ReturnsRuleScore_WhenProbabilityZero()
    {
        var service = CreateService(mlWeight: 0.6f, ruleWeight: 0.4f);
        var mlPrediction = new RiskPredictionOutput
        {
            PredictedLabel = false,
            Probability = 0f,
            Score = -5f
        };

        var hybridScore = service.ComputeHybridScore(40, mlPrediction);

        // mlScore = 0, hybrid = 0 * 0.6 + 40 * 0.4 = 16
        Assert.Equal(16, hybridScore);
    }

    [Fact]
    public void Evaluate_Throws_WhenNoModelLoaded()
    {
        var service = CreateService();
        var data = GenerateTrainingData(10);

        Assert.Throws<InvalidOperationException>(() => service.Evaluate(data));
    }

    [Fact]
    public void Evaluate_ReturnsMetrics_WhenModelLoaded()
    {
        var service = CreateService();
        var data = GenerateTrainingData(60);
        service.TrainFromData(data);

        var testData = GenerateTrainingData(20);
        var metrics = service.Evaluate(testData);

        Assert.NotNull(metrics);
        Assert.InRange(metrics.Accuracy, 0f, 1f);
        Assert.InRange(metrics.F1Score, 0f, 1f);
    }

    [Fact]
    public void Model_PersistsToDisk_AfterTraining()
    {
        var service = CreateService();
        var data = GenerateTrainingData(60);
        service.TrainFromData(data);

        Assert.True(File.Exists(_modelPath));
        Assert.True(new FileInfo(_modelPath).Length > 0);

        var service2 = CreateService();
        Assert.True(service2.IsModelLoaded);
    }

    [Fact]
    public void Weights_AreConfigurable()
    {
        var service = CreateService(mlWeight: 0.7f, ruleWeight: 0.3f);

        Assert.Equal(0.7f, service.MlWeight);
        Assert.Equal(0.3f, service.RuleWeight);
    }
}
