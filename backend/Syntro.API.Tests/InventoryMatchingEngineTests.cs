using Syntro.API.Services;

namespace Syntro.API.Tests;

public class InventoryMatchingEngineTests
{
    private static NetworkTelemetryService.InventoryMatchRecord Item(
        Guid id,
        string serial = "",
        string ip = "",
        string mac = "",
        string building = "SR-BLD")
        => new(id, serial, ip, mac, "", "", "", "", building, "SR-ROOM");

    [Fact]
    public void ExtractEmbeddedIp_ReturnsNormalizedIpFromHostname()
    {
        var extracted = NetworkTelemetryService.ExtractEmbeddedIp("pc-10.6.32.151");
        Assert.Equal("10.6.32.151", extracted);
    }

    [Fact]
    public void ExtractEmbeddedIp_ReturnsNullWhenNoIpPresent()
    {
        Assert.Null(NetworkTelemetryService.ExtractEmbeddedIp("pc-santiago-01"));
        Assert.Null(NetworkTelemetryService.ExtractEmbeddedIp(null));
        Assert.Null(NetworkTelemetryService.ExtractEmbeddedIp(""));
    }

    [Fact]
    public void FindImportedMatch_MatchesBySerialFirst()
    {
        var items = new[]
        {
            Item(Guid.NewGuid(), serial: "ABC123", ip: "10.0.0.1"),
            Item(Guid.NewGuid(), serial: "XYZ789", ip: "10.0.0.2")
        };

        var outcome = NetworkTelemetryService.FindImportedMatch(
            serialNumber: "xyz789",
            macAddress: "",
            ipAddress: "10.0.0.1",
            deviceName: "",
            hostName: "",
            importedItems: items);

        Assert.NotNull(outcome.Match);
        Assert.Equal("XYZ789", outcome.Match.SerialNumber);
        Assert.Equal("serial", outcome.Key);
    }

    [Fact]
    public void FindImportedMatch_MatchesByMacWhenNoSerial()
    {
        var items = new[]
        {
            Item(Guid.NewGuid(), mac: "AA:BB:CC:DD:EE:FF", ip: "10.0.0.9"),
            Item(Guid.NewGuid(), mac: "11:22:33:44:55:66", ip: "10.0.0.8")
        };

        var outcome = NetworkTelemetryService.FindImportedMatch(
            serialNumber: "",
            macAddress: "aa:bb:cc:dd:ee:ff",
            ipAddress: "10.0.0.8",
            deviceName: "",
            hostName: "",
            importedItems: items);

        Assert.NotNull(outcome.Match);
        Assert.Equal("AA:BB:CC:DD:EE:FF", outcome.Match.MacAddress);
        Assert.Equal("mac", outcome.Key);
    }

    [Fact]
    public void FindImportedMatch_MatchesByIpExactWhenNoSerialOrMac()
    {
        var items = new[] { Item(Guid.NewGuid(), ip: "10.6.32.151") };

        var outcome = NetworkTelemetryService.FindImportedMatch(
            serialNumber: "",
            macAddress: "",
            ipAddress: "10.6.32.151",
            deviceName: "pc-10.6.32.151",
            hostName: "",
            importedItems: items);

        Assert.NotNull(outcome.Match);
        Assert.Equal("ip", outcome.Key);
    }

    [Fact]
    public void FindImportedMatch_MatchesByIpEmbeddedInNameWhenNoDeviceIp()
    {
        var items = new[] { Item(Guid.NewGuid(), ip: "10.6.32.151") };

        var outcome = NetworkTelemetryService.FindImportedMatch(
            serialNumber: "",
            macAddress: "",
            ipAddress: "",
            deviceName: "pc-10.6.32.151",
            hostName: "DESKTOP-ASDF",
            importedItems: items);

        Assert.NotNull(outcome.Match);
        Assert.Equal("10.6.32.151", outcome.Match.IpAddress);
        Assert.Equal("ip_in_name", outcome.Key);
    }

    [Fact]
    public void FindImportedMatch_FallsBackToHostnameForEmbeddedIp()
    {
        var items = new[] { Item(Guid.NewGuid(), ip: "10.6.32.151") };

        var outcome = NetworkTelemetryService.FindImportedMatch(
            serialNumber: "",
            macAddress: "",
            ipAddress: "",
            deviceName: "desktop-santiago",
            hostName: "PC-10.6.32.151",
            importedItems: items);

        Assert.NotNull(outcome.Match);
        Assert.Equal("ip_in_name", outcome.Key);
    }

    [Fact]
    public void FindImportedMatch_ReturnsNullWhenNothingMatches()
    {
        var items = new[] { Item(Guid.NewGuid(), ip: "10.0.0.1") };

        var outcome = NetworkTelemetryService.FindImportedMatch(
            serialNumber: "",
            macAddress: "",
            ipAddress: "192.168.1.10",
            deviceName: "unknown-9e2b4c",
            hostName: "",
            importedItems: items);

        Assert.Null(outcome.Match);
        Assert.Equal(string.Empty, outcome.Key);
    }

    [Fact]
    public void FindImportedMatch_PrefersExactIpOverEmbedded()
    {
        var items = new[]
        {
            Item(Guid.NewGuid(), ip: "10.6.32.151"),
            Item(Guid.NewGuid(), ip: "10.6.32.152")
        };

        var outcome = NetworkTelemetryService.FindImportedMatch(
            serialNumber: "",
            macAddress: "",
            ipAddress: "10.6.32.152",
            deviceName: "pc-10.6.32.151",
            hostName: "",
            importedItems: items);

        Assert.NotNull(outcome.Match);
        Assert.Equal("10.6.32.152", outcome.Match.IpAddress);
        Assert.Equal("ip", outcome.Key);
    }

    [Fact]
    public void FindImportedMatch_MatchesEmbeddedNameIpWhenFieldIpDoesNotMatch()
    {
        var items = new[] { Item(Guid.NewGuid(), ip: "10.6.32.151") };

        var outcome = NetworkTelemetryService.FindImportedMatch(
            serialNumber: "",
            macAddress: "",
            ipAddress: "10.6.32.200",
            deviceName: "pc-10.6.32.151",
            hostName: "",
            importedItems: items);

        Assert.NotNull(outcome.Match);
        Assert.Equal("10.6.32.151", outcome.Match.IpAddress);
        Assert.Equal("ip_in_name", outcome.Key);
    }

    [Fact]
    public void MatchKeyLabel_ReturnsSpanishLabels()
    {
        Assert.Equal("Serie", NetworkTelemetryService.MatchKeyLabel("serial"));
        Assert.Equal("MAC", NetworkTelemetryService.MatchKeyLabel("mac"));
        Assert.Equal("IP exacta", NetworkTelemetryService.MatchKeyLabel("ip"));
        Assert.Equal("IP en nombre", NetworkTelemetryService.MatchKeyLabel("ip_in_name"));
        Assert.Equal("Inventario", NetworkTelemetryService.MatchKeyLabel("inventario"));
    }

    [Theory]
    [InlineData("AA:BB:CC:DD:EE:FF", true)]
    [InlineData("00-1A-2B-3C-4D-5E", true)]
    [InlineData("", false)]
    [InlineData("N/D", false)]
    [InlineData("AB", false)]
    public void IsValidMac_ValidatesKnownSentinelValues(string value, bool expected)
    {
        Assert.Equal(expected, NetworkTelemetryService.IsValidMac(value));
    }
}
