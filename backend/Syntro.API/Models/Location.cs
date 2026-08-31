namespace Syntro.API.Models;

public class Location : AuditableEntity
{
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public string Floor { get; set; } = "0";
    public string Campus { get; set; } = string.Empty;
    public string Type { get; set; } = "room"; // room, lab, office, common

    public ICollection<Equipment> Equipments { get; set; } = new List<Equipment>();
}
