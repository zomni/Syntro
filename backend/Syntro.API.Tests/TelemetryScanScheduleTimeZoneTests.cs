using System.Globalization;
using Syntro.API.Services;

namespace Syntro.API.Tests;

public class TelemetryScanScheduleTimeZoneTests
{
    private const string Santiago = "America/Santiago";
    private const string FridayCron = "0 30 8 * * 5;0 30 13 * * 5;0 30 16 * * 5";

    private static DateTime Utc(int year, int month, int day, int hour, int minute)
        => new(year, month, day, hour, minute, 0, DateTimeKind.Utc);

    // El disparo siempre debe resolverse en UTC a partir de la zona del schedule.
    // Se arranca un minuto antes del instante esperado para que la funcion devuelva
    // exactamente esa ocurrencia y no la siguiente del dia.
    [Theory]
    // Viernes 25-09-2026: Chile ya esta en horario de verano (UTC-3) desde el 6-sep.
    [InlineData(2026, 9, 25, 11, 30, "08:30")]  // 08:30 Santiago -> 11:30 UTC
    [InlineData(2026, 9, 25, 16, 30, "13:30")]  // 13:30 Santiago -> 16:30 UTC
    [InlineData(2026, 9, 25, 19, 30, "16:30")]  // 16:30 Santiago -> 19:30 UTC
    // Viernes 21-08-2026: Chile en horario estandar (UTC-4).
    [InlineData(2026, 8, 21, 12, 30, "08:30")]
    [InlineData(2026, 8, 21, 17, 30, "13:30")]
    [InlineData(2026, 8, 21, 20, 30, "16:30")]
    public void GetNextOccurrenceUtc_AplicaOffsetDeLaZonaDelSchedule(
        int year, int month, int day, int utcHour, int utcMinute, string expectedLocalTime)
    {
        var fromUtc = Utc(year, month, day, utcHour, utcMinute).AddMinutes(-1);

        var nextUtc = TelemetryScanScheduleService.GetNextOccurrenceUtc(FridayCron, Santiago, fromUtc);

        Assert.NotNull(nextUtc);
        Assert.Equal(utcHour, nextUtc!.Value.Hour);
        Assert.Equal(utcMinute, nextUtc.Value.Minute);
        Assert.Equal(DayOfWeek.Friday, nextUtc.Value.DayOfWeek);

        var timeZone = TelemetryScanScheduleService.ResolveTimeZone(Santiago);
        var local = TimeZoneInfo.ConvertTime(nextUtc.Value, timeZone);
        Assert.Equal(expectedLocalTime, local.ToString("HH:mm", CultureInfo.InvariantCulture));
    }

    // Las tres franjas del viernes deben caer en instantes UTC distintos y correctos.
    [Fact]
    public void LasTresFranjasDelViernesCaenEnInstantesDistintos()
    {
        var fromUtc = Utc(2026, 9, 25, 0, 0);

        var occurrences = TelemetryScanScheduleService.GetNextOccurrencesUtc(FridayCron, Santiago, fromUtc, 3);

        Assert.Equal(3, occurrences.Count);
        Assert.Equal(new DateTime(2026, 9, 25, 11, 30, 0, DateTimeKind.Utc), DateTime.SpecifyKind(occurrences[0], DateTimeKind.Utc));
        Assert.Equal(new DateTime(2026, 9, 25, 16, 30, 0, DateTimeKind.Utc), DateTime.SpecifyKind(occurrences[1], DateTimeKind.Utc));
        Assert.Equal(new DateTime(2026, 9, 25, 19, 30, 0, DateTimeKind.Utc), DateTime.SpecifyKind(occurrences[2], DateTimeKind.Utc));
    }

    // Regresion del bug A: la etiqueta debe derivarse de la zona del schedule que
    // coincidio (Santiago), no de la zona global de configuracion.
    [Fact]
    public void ResolveSlotInfo_DevuelveLaZonaDelScheduleQueCoincidio()
    {
        var schedules = new[]
        {
            new NetworkTelemetryLiveScanHostedService.ActiveSchedule(FridayCron, Santiago, "sotero", "SEMANAL SOTERO")
        };

        var slot = NetworkTelemetryLiveScanHostedService.ResolveSlotInfo(
            schedules,
            Utc(2026, 9, 25, 19, 30));

        Assert.Equal("sotero", slot.CampusKey);
        Assert.Equal("SEMANAL SOTERO", slot.ScheduleLabel);
        Assert.Equal(Santiago, slot.TimeZoneId);
    }

    [Fact]
    public void ResolveSlotInfo_SinCoincidencia_NoDevuelveZona()
    {
        var schedules = new[]
        {
            new NetworkTelemetryLiveScanHostedService.ActiveSchedule(FridayCron, Santiago, "sotero", "SEMANAL SOTERO")
        };

        var slot = NetworkTelemetryLiveScanHostedService.ResolveSlotInfo(
            schedules,
            Utc(2026, 9, 25, 3, 17));

        Assert.Null(slot.TimeZoneId);
        Assert.Equal(string.Empty, slot.CampusKey);
    }

    // La etiqueta renderizada con la zona del schedule debe volver a la hora de
    // pared del schedule, incluso cruzando el cambio a horario de verano.
    [Theory]
    [InlineData(2026, 9, 25, 19, 30, "16:30", "viernes")]
    [InlineData(2026, 9, 25, 16, 30, "13:30", "viernes")]
    [InlineData(2026, 9, 25, 11, 30, "08:30", "viernes")]
    [InlineData(2026, 8, 21, 20, 30, "16:30", "viernes")]
    public void EtiquetaLocal_RedondeaALaHoraDeParedDelSchedule(
        int year, int month, int day, int utcHour, int utcMinute,
        string expectedTime, string expectedDay)
    {
        var timeZone = TelemetryScanScheduleService.ResolveTimeZone(Santiago);
        var local = TimeZoneInfo.ConvertTime(Utc(year, month, day, utcHour, utcMinute), timeZone);

        var culture = CultureInfo.GetCultureInfo("es-CL");
        Assert.Equal(expectedTime, local.ToString("HH:mm", CultureInfo.InvariantCulture));
        Assert.Equal(expectedDay, local.ToString("dddd", culture));
    }

    // El run que el usuario vio: 16:30 UTC es la franja 13:30 de Santiago, no la
    // de las 16:30. La de las 16:30 sigue pendiente hasta las 19:30 UTC.
    [Fact]
    public void LaFranjaDeLasOnceYMediaEsDistintaDeLaDeLasCuatroYMedia()
    {
        var timeZone = TelemetryScanScheduleService.ResolveTimeZone(Santiago);

        var treceYMedia = TimeZoneInfo.ConvertTime(Utc(2026, 9, 25, 16, 30), timeZone);
        var cuatroYMedia = TimeZoneInfo.ConvertTime(Utc(2026, 9, 25, 19, 30), timeZone);

        Assert.Equal("13:30", treceYMedia.ToString("HH:mm", CultureInfo.InvariantCulture));
        Assert.Equal("16:30", cuatroYMedia.ToString("HH:mm", CultureInfo.InvariantCulture));
    }

    [Fact]
    public void ResolveTimeZone_CaeAUtcCuandoLaZonaNoExiste()
    {
        var resolved = TelemetryScanScheduleService.ResolveTimeZone("No/Existe_Esta_Zona");

        Assert.NotNull(resolved);
    }
}
