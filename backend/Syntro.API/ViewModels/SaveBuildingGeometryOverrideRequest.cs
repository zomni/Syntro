namespace Syntro.API.ViewModels;

public class SaveBuildingGeometryOverrideRequest
{
    public string BuildingExternalId { get; set; } = string.Empty;
    public List<List<double>> Coordinates { get; set; } = [];

    // null o 0 = aplica a todos los pisos (compatibilidad con clientes antiguos).
    public int? Floor { get; set; }
}
