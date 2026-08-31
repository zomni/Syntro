using Microsoft.ML.Data;

namespace Syntro.API.ML.Models;

public class RiskPredictionOutput
{
    [ColumnName("PredictedLabel")]
    public bool PredictedLabel { get; set; }

    public float Probability { get; set; }

    public float Score { get; set; }
}
