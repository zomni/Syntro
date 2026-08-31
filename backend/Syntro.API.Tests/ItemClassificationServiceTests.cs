using Microsoft.Extensions.Logging;
using Syntro.API.ML;
using Syntro.API.ML.Models;

namespace Syntro.API.Tests;

public class ItemClassificationServiceTests : IDisposable
{
    private readonly string _tempDir;
    private readonly string _modelPath;

    public ItemClassificationServiceTests()
    {
        _tempDir = Path.Combine(Path.GetTempPath(), $"ml_test_{Guid.NewGuid():N}");
        Directory.CreateDirectory(_tempDir);
        _modelPath = Path.Combine(_tempDir, "item-classification.zip");
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDir))
            Directory.Delete(_tempDir, true);
    }

    private ItemClassificationService CreateService()
    {
        var config = TestConfiguration.FromSettings(new Dictionary<string, string?>
        {
            ["MlSettings:ModelsPath"] = _tempDir,
            ["MlSettings:ItemClassificationModelPath"] = _modelPath
        });
        var logger = new LoggerFactory().CreateLogger<ItemClassificationService>();
        return new ItemClassificationService(config, logger);
    }

    private static List<ItemClassificationInput> GenerateTrainingData(int count)
    {
        var categories = new[] { "laptop", "monitor", "printer", "phone" };
        var rng = new Random(42);
        var data = new List<ItemClassificationInput>();

        for (int i = 0; i < count; i++)
        {
            var cat = categories[i % categories.Length];
            data.Add(new ItemClassificationInput
            {
                Description = $"{cat} model {i} description",
                Observation = $"observation {i} for {cat}",
                Lot = $"LOT-{i}",
                Label = cat
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
    public void PredictCategory_ReturnsFallback_WhenModelNotLoaded()
    {
        var service = CreateService();
        var result = service.PredictCategory("laptop Dell", "working");
        Assert.Equal("other", result.PredictedCategory);
    }

    [Fact]
    public void TrainFromData_ReturnsCorrectSampleCount()
    {
        var service = CreateService();
        var data = GenerateTrainingData(30);

        var metrics = service.TrainFromData(data);

        Assert.Equal(30, metrics.Samples);
        Assert.True(service.IsModelLoaded);
        Assert.True(File.Exists(_modelPath));
    }

    [Fact]
    public void TrainFromData_ReturnsZeroMetrics_WhenInsufficientSamples()
    {
        var service = CreateService();
        var data = GenerateTrainingData(15);

        var metrics = service.TrainFromData(data);

        Assert.Equal(15, metrics.Samples);
        Assert.Equal(0f, metrics.Accuracy);
        Assert.Equal(0f, metrics.MicroAccuracy);
    }

    [Fact]
    public void TrainFromData_ReturnsMetrics_WhenEnoughSamples()
    {
        var service = CreateService();
        var data = GenerateTrainingData(50);

        var metrics = service.TrainFromData(data);

        Assert.Equal(50, metrics.Samples);
        Assert.InRange(metrics.Accuracy, 0f, 1f);
        Assert.InRange(metrics.MicroAccuracy, 0f, 1f);
        Assert.True(metrics.AccuracyStdDev >= 0f);
        Assert.True(metrics.MicroAccuracyStdDev >= 0f);
    }

    [Fact]
    public void TrainFromData_ReturnsZeroStdDev_WhenInsufficientSamplesForCV()
    {
        var service = CreateService();
        var data = GenerateTrainingData(15);

        var metrics = service.TrainFromData(data);

        Assert.Equal(0f, metrics.AccuracyStdDev);
        Assert.Equal(0f, metrics.MicroAccuracyStdDev);
    }

    [Fact]
    public void PredictCategory_ReturnsCategory_WhenModelLoaded()
    {
        var service = CreateService();
        var data = GenerateTrainingData(30);
        service.TrainFromData(data);

        var result = service.PredictCategory("laptop Dell model 123", "working fine");

        Assert.NotNull(result.PredictedCategory);
        Assert.NotEmpty(result.PredictedCategory);
        Assert.True(result.Score.Length > 0);
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
        var data = GenerateTrainingData(50);
        service.TrainFromData(data);

        var testData = GenerateTrainingData(20);
        var metrics = service.Evaluate(testData);

        Assert.NotNull(metrics);
        Assert.InRange(metrics.MacroAccuracy, 0f, 1f);
    }

    [Fact]
    public void Model_PersistsToDisk_AfterTraining()
    {
        var service = CreateService();
        var data = GenerateTrainingData(30);
        service.TrainFromData(data);

        Assert.True(File.Exists(_modelPath));
        Assert.True(new FileInfo(_modelPath).Length > 0);

        var service2 = CreateService();
        Assert.True(service2.IsModelLoaded);
    }
}
