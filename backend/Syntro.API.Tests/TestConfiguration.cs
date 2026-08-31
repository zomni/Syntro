using Microsoft.Extensions.Configuration;

namespace Syntro.API.Tests;

internal static class TestConfiguration
{
    public static IConfiguration FromSettings(Dictionary<string, string?> settings)
    {
        return new ConfigurationBuilder()
            .AddInMemoryCollection(settings)
            .Build();
    }
}
