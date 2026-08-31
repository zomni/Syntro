using Microsoft.ML.Data;

namespace Syntro.API.ML.Models;

public class RiskPredictionInput
{
    [LoadColumn(0)]
    public float IsOnline { get; set; }

    [LoadColumn(1)]
    public float MatchScore { get; set; }

    [LoadColumn(2)]
    public float HasAssignedBuilding { get; set; }

    [LoadColumn(3)]
    public float DuplicateIpCount { get; set; }

    [LoadColumn(4)]
    public float DuplicateMacCount { get; set; }

    [LoadColumn(5)]
    public float IsKnownUser { get; set; }

    [LoadColumn(6)]
    public float DeviceCount { get; set; }

    [LoadColumn(7)]
    public float AntivirusEnabled { get; set; }

    [LoadColumn(8)]
    public float PendingPatches { get; set; }

    [LoadColumn(9)]
    public float DomainJoined { get; set; }

    [LoadColumn(10)]
    public float DiskFreePercent { get; set; }

    [LoadColumn(11)]
    public float UptimeDays { get; set; }

    [LoadColumn(12)]
    public float PingMs { get; set; }

    [LoadColumn(13)]
    public float RdpExposed { get; set; }

    [LoadColumn(14)]
    public float SmbExposed { get; set; }

    [LoadColumn(15)]
    public float SshExposed { get; set; }

    [LoadColumn(16)]
    public float OpenPortCount { get; set; }

    [LoadColumn(17)]
    public bool Label { get; set; }
}
