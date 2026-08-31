using Syntro.API.Services;

namespace Syntro.API.Tests;

public class ConfigServiceTests
{
    [Fact]
    public void InventoryCategories_InferCategoryMatchesTokenAndFallsBack()
    {
        var config = TestConfiguration.FromSettings(new Dictionary<string, string?>
        {
            ["InventoryCategories:FallbackCategory"] = "other",
            ["InventoryCategories:Categories:0:Name"] = "pc",
            ["InventoryCategories:Categories:0:Tokens:0"] = "NOTEBOOK",
            ["InventoryCategories:Categories:0:Tokens:1"] = "DESKTOP"
        });

        Assert.Equal("pc", InventoryCategoriesConfig.InferCategory(config, "Notebook HP"));
        Assert.Equal("other", InventoryCategoriesConfig.InferCategory(config, "Generador electrico"));
        Assert.Equal("other", InventoryCategoriesConfig.InferCategory(config, ""));
    }

    [Fact]
    public void InventoryCategories_InferStatusMatchesToken()
    {
        var config = TestConfiguration.FromSettings(new Dictionary<string, string?>
        {
            ["InventoryCategories:FallbackStatus"] = "active",
            ["InventoryCategories:Statuses:0:Name"] = "stolen",
            ["InventoryCategories:Statuses:0:Tokens:0"] = "ROBADO"
        });

        Assert.Equal("stolen", InventoryCategoriesConfig.InferStatus(config, "equipo robado"));
        Assert.Equal("active", InventoryCategoriesConfig.InferStatus(config, "funciona normal"));
    }

    [Fact]
    public void DeliveryFormChecklist_ReturnsEmptyWhenUnconfigured()
    {
        var config = TestConfiguration.FromSettings(new Dictionary<string, string?>());

        var sections = DeliveryFormChecklistConfig.GetSections(config);

        Assert.Empty(sections);
    }

    [Fact]
    public void DeliveryFormChecklist_ReadsConfiguredSections()
    {
        var config = TestConfiguration.FromSettings(new Dictionary<string, string?>
        {
            ["DeliveryForm:ApplicationChecklist:Sections:0:Title"] = "General",
            ["DeliveryForm:ApplicationChecklist:Sections:0:Items:0:Key"] = "App1",
            ["DeliveryForm:ApplicationChecklist:Sections:0:Items:0:Label"] = "App Uno"
        });

        var sections = DeliveryFormChecklistConfig.GetSections(config);

        Assert.Single(sections);
        Assert.Equal("General", sections[0].Title);
        Assert.Single(sections[0].Items);
        Assert.Equal("App1", sections[0].Items[0].Key);
    }

    [Fact]
    public void TelemetryTimeSettings_ResolvesTimezoneFromConfig()
    {
        var config = TestConfiguration.FromSettings(new Dictionary<string, string?>
        {
            ["NetworkTelemetrySettings:DisplayTimeZone"] = "America/Santiago"
        });

        var timezone = TelemetryTimeSettings.ResolveTimeZone(config);
        Assert.Equal("America/Santiago", timezone.Id);
    }

    [Fact]
    public void TelemetryTimeSettings_FallsBackToUtcOnInvalidTimezone()
    {
        var config = TestConfiguration.FromSettings(new Dictionary<string, string?>
        {
            ["NetworkTelemetrySettings:DisplayTimeZone"] = "Invalid/Zone"
        });

        Assert.Equal(TelemetryTimeSettings.DefaultTimeZoneId, TelemetryTimeSettings.ResolveTimeZone(config).Id);
    }

    [Fact]
    public void TelemetryTimeSettings_DefaultsToUtcAndEsCl()
    {
        var config = TestConfiguration.FromSettings(new Dictionary<string, string?>());

        Assert.Equal("UTC", TelemetryTimeSettings.ResolveTimeZone(config).Id);
        Assert.Equal("es-CL", TelemetryTimeSettings.ResolveLocale(config));
    }
}
