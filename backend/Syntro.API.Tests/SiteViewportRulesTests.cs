using Syntro.API.Services;

namespace Syntro.API.Tests;

public class SiteViewportRulesTests
{
    [Theory]
    [InlineData(0, 19)]
    [InlineData(12, 19)]
    [InlineData(5, 5)]
    [InlineData(0, 21)]
    public void Validate_ReturnsNull_ForValidRange(int minZoom, int maxZoom)
    {
        var error = SiteViewportRules.Validate(minZoom, maxZoom);
        Assert.Null(error);
    }

    [Theory]
    [InlineData(-1, 19)]
    [InlineData(22, 19)]
    public void Validate_RejectsMinZoomOutsideRange(int minZoom, int maxZoom)
    {
        var error = SiteViewportRules.Validate(minZoom, maxZoom);
        Assert.Contains("minimo", error, StringComparison.OrdinalIgnoreCase);
    }

    [Theory]
    [InlineData(0, -1)]
    [InlineData(0, 22)]
    public void Validate_RejectsMaxZoomOutsideRange(int minZoom, int maxZoom)
    {
        var error = SiteViewportRules.Validate(minZoom, maxZoom);
        Assert.Contains("maximo", error, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void Validate_RejectsMinGreaterThanMax()
    {
        var error = SiteViewportRules.Validate(19, 12);
        Assert.Contains("mayor o igual", error, StringComparison.OrdinalIgnoreCase);
    }
}
