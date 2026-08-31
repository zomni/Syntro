using Microsoft.ML.Data;

namespace Syntro.API.ML.Models;

public class ItemClassificationOutput
{
    [ColumnName("PredictedLabel")]
    public string PredictedCategory { get; set; } = string.Empty;

    public float[] Score { get; set; } = [];
}
