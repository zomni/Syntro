namespace Syntro.API.Infrastructure;

public static class CampusDefaults
{
    public const string ConfigKey = "CampusSettings:DefaultCampus";

    public static string Resolve(IConfiguration? configuration, string? requested)
    {
        if (!string.IsNullOrWhiteSpace(requested))
        {
            return requested.Trim();
        }

        return (configuration?[ConfigKey] ?? string.Empty).Trim();
    }
}
