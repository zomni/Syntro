namespace Syntro.API.Services;

public static class SiteViewportRules
{
    public const int MinAllowedZoom = 0;
    public const int MaxAllowedZoom = 21;
    public const int DefaultMinZoom = 0;
    public const int DefaultMaxZoom = 19;

    public static string? Validate(int minZoom, int maxZoom)
    {
        if (minZoom < MinAllowedZoom || minZoom > MaxAllowedZoom)
        {
            return $"El zoom minimo debe estar entre {MinAllowedZoom} y {MaxAllowedZoom}.";
        }

        if (maxZoom < MinAllowedZoom || maxZoom > MaxAllowedZoom)
        {
            return $"El zoom maximo debe estar entre {MinAllowedZoom} y {MaxAllowedZoom}.";
        }

        if (minZoom > maxZoom)
        {
            return "El zoom maximo debe ser mayor o igual al minimo.";
        }

        return null;
    }
}
