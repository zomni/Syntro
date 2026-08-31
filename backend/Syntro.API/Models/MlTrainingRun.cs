namespace Syntro.API.Models;

public class MlTrainingRun : AuditableEntity
{
    public string ModelType { get; set; } = string.Empty;
    public int Samples { get; set; }
    public float Accuracy { get; set; }
    public float F1Score { get; set; }
}
