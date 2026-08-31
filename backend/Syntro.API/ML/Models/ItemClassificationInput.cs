using Microsoft.ML.Data;

namespace Syntro.API.ML.Models;

public class ItemClassificationInput
{
    [LoadColumn(0)]
    public string Description { get; set; } = string.Empty;

    [LoadColumn(1)]
    public string Observation { get; set; } = string.Empty;

    [LoadColumn(2)]
    public string Lot { get; set; } = string.Empty;

    [LoadColumn(3)]
    public string Label { get; set; } = string.Empty;
}
