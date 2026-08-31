using System.Globalization;

namespace Syntro.API.Services;

public static class TelemetryTimeSettings
{
    public const string DefaultTimeZoneId = "UTC";
    public const string DefaultLocale = "es-CL";

    private const string TimeZoneConfigKey = "NetworkTelemetrySettings:DisplayTimeZone";
    private const string LocaleConfigKey = "NetworkTelemetrySettings:DisplayLocale";

    public static TimeZoneInfo ResolveTimeZone(IConfiguration configuration)
    {
        var configured = configuration?[TimeZoneConfigKey];
        if (!string.IsNullOrWhiteSpace(configured))
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(configured);
            }
            catch
            {
            }
        }

        try
        {
            return TimeZoneInfo.FindSystemTimeZoneById(DefaultTimeZoneId);
        }
        catch
        {
            return TimeZoneInfo.Utc;
        }
    }

    public static string ResolveLocale(IConfiguration configuration)
        => configuration?[LocaleConfigKey] ?? DefaultLocale;

    public static CultureInfo ResolveCulture(IConfiguration configuration)
    {
        try
        {
            return CultureInfo.GetCultureInfo(ResolveLocale(configuration));
        }
        catch
        {
            return CultureInfo.GetCultureInfo(DefaultLocale);
        }
    }
}
