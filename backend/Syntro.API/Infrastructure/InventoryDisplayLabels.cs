namespace Syntro.API.Infrastructure;

public static class InventoryDisplayLabels
{
    public static string Category(string? raw) => (raw ?? string.Empty).ToLowerInvariant() switch
    {
        "pc" => "PC",
        "printer" => "Impresora",
        "scanner" => "Esc\u00e1ner",
        "monitor" => "Monitor",
        "peripheral" => "Perif\u00e9rico",
        "other" => "Otros",
        _ => raw ?? ""
    };

    public static string Status(string? raw) => (raw ?? string.Empty).ToLowerInvariant() switch
    {
        "active" => "Activo",
        "maintenance" => "Mantenimiento",
        "inactive" => "Inactivo",
        "stolen" => "Robado",
        "gap" => "Brecha",
        "retired" => "Baja",
        _ => raw ?? ""
    };
}
