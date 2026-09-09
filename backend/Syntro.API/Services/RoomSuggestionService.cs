using System.Text.Json;

namespace Syntro.API.Services;

public class RoomSuggestionService
{
    private const double METERS_PER_DEG_LAT = 111320.0;

    private static double MetersToDegLng(double meters, double centerLat)
    {
        var metersPerDegLng = METERS_PER_DEG_LAT * Math.Cos(centerLat * Math.PI / 180.0);
        return metersPerDegLng > 0 ? meters / metersPerDegLng : meters / METERS_PER_DEG_LAT;
    }

    private static double MetersToDegLat(double meters) => meters / METERS_PER_DEG_LAT;

    public List<SuggestedRoom> GenerateLayout(SuggestionRequest request)
    {
        return request.Pattern switch
        {
            "grid" => GenerateGridLayout(request),
            "corridor-central" => GenerateCentralCorridorLayout(request),
            "corridor-lateral" => GenerateLateralCorridorLayout(request),
            "perimeter" => GeneratePerimeterLayout(request),
            _ => GenerateGridLayout(request)
        };
    }

    private List<SuggestedRoom> GenerateGridLayout(SuggestionRequest request)
    {
        var result = new List<SuggestedRoom>();
        if (request.Coordinates == null || request.Coordinates.Count < 3)
            return result;

        var bounds = GetBounds(request.Coordinates);
        var rows = request.Rows > 0 ? request.Rows : (int)Math.Sqrt(request.RoomCount);
        var cols = request.Columns > 0 ? request.Columns : (int)Math.Ceiling((double)request.RoomCount / rows);
        var corridorWidth = request.CorridorWidth > 0 ? request.CorridorWidth : 1.5;
        var internalCorridor = request.InternalCorridor > 0 ? request.InternalCorridor : 1.2;
        var prefix = string.IsNullOrWhiteSpace(request.NamePrefix) ? "Box" : request.NamePrefix;

        var centerLat = (bounds.MinLat + bounds.MaxLat) / 2.0;
        var padding = 1.0;
        var padLng = MetersToDegLng(padding, centerLat);
        var padLat = MetersToDegLat(padding);
        var gapLng = MetersToDegLng(internalCorridor, centerLat);
        var gapLat = MetersToDegLat(internalCorridor);

        var usableWidth = bounds.MaxLng - bounds.MinLng - padLng * 2 - gapLng * (cols - 1);
        var usableHeight = bounds.MaxLat - bounds.MinLat - padLat * 2 - gapLat * (rows - 1);

        if (usableWidth <= 0 || usableHeight <= 0)
            return result;

        var roomWidth = usableWidth / cols;
        var roomHeight = usableHeight / rows;

        var counter = 0;

        for (var row = 0; row < rows && counter < request.RoomCount; row++)
        {
            for (var col = 0; col < cols && counter < request.RoomCount; col++)
            {
                var x1 = bounds.MinLng + padLng + col * (roomWidth + gapLng);
                var y1 = bounds.MinLat + padLat + row * (roomHeight + gapLat);
                var x2 = x1 + roomWidth;
                var y2 = y1 + roomHeight;

                var centerLngRoom = (x1 + x2) / 2.0;
                var centerLatRoom = (y1 + y2) / 2.0;

                if (!IsPointInPolygon(centerLngRoom, centerLatRoom, request.Coordinates))
                    continue;

                var coords = new List<List<double>>
                {
                    new() { x1, y1 },
                    new() { x2, y1 },
                    new() { x2, y2 },
                    new() { x1, y2 },
                    new() { x1, y1 }
                };

                result.Add(new SuggestedRoom
                {
                    DisplayName = $"{prefix} {result.Count + 1}",
                    Type = request.RoomType ?? "box",
                    Coordinates = coords,
                    Row = row,
                    Column = col
                });
                counter++;
            }
        }

        return result;
    }

    private List<SuggestedRoom> GenerateCentralCorridorLayout(SuggestionRequest request)
    {
        var result = new List<SuggestedRoom>();
        if (request.Coordinates == null || request.Coordinates.Count < 3)
            return result;

        var bounds = GetBounds(request.Coordinates);
        var corridorWidth = request.CorridorWidth > 0 ? request.CorridorWidth : 1.5;
        var internalCorridor = request.InternalCorridor > 0 ? request.InternalCorridor : 1.2;
        var roomsPerSide = Math.Max(1, request.RoomCount / 2);
        var prefix = string.IsNullOrWhiteSpace(request.NamePrefix) ? "Box" : request.NamePrefix;

        var centerLat = (bounds.MinLat + bounds.MaxLat) / 2.0;
        var padLng = MetersToDegLng(1.0, centerLat);
        var padLat = MetersToDegLat(1.0);
        var corridorDegLngHalf = MetersToDegLng(corridorWidth, centerLat);
        var gapLat = MetersToDegLat(internalCorridor);

        var usableWidth = bounds.MaxLng - bounds.MinLng - padLng * 2;
        var usableHeight = bounds.MaxLat - bounds.MinLat - padLat * 2 - gapLat * (roomsPerSide - 1);

        var roomHeight = usableHeight / roomsPerSide;
        var roomWidth = usableWidth / 2;

        var counter = 0;

        for (var side = 0; side < 2; side++)
        {
            for (var i = 0; i < roomsPerSide && counter < request.RoomCount; i++)
            {
                var x1 = side == 0
                    ? bounds.MinLng + padLng
                    : bounds.MinLng + padLng + roomWidth + corridorDegLngHalf;
                var y1 = bounds.MinLat + padLat + i * (roomHeight + gapLat);
                var x2 = x1 + roomWidth;
                var y2 = y1 + roomHeight;

                var centerLngRoom = (x1 + x2) / 2.0;
                var centerLatRoom = (y1 + y2) / 2.0;

                if (!IsPointInPolygon(centerLngRoom, centerLatRoom, request.Coordinates))
                    continue;

                var coords = new List<List<double>>
                {
                    new() { x1, y1 },
                    new() { x2, y1 },
                    new() { x2, y2 },
                    new() { x1, y2 },
                    new() { x1, y1 }
                };

                result.Add(new SuggestedRoom
                {
                    DisplayName = $"{prefix} {result.Count + 1}",
                    Type = request.RoomType ?? "box",
                    Coordinates = coords,
                    Row = i,
                    Column = side
                });
                counter++;
            }
        }

        return result;
    }

    private List<SuggestedRoom> GenerateLateralCorridorLayout(SuggestionRequest request)
    {
        var result = new List<SuggestedRoom>();
        if (request.Coordinates == null || request.Coordinates.Count < 3)
            return result;

        var bounds = GetBounds(request.Coordinates);
        var corridorWidth = request.CorridorWidth > 0 ? request.CorridorWidth : 1.5;
        var internalCorridor = request.InternalCorridor > 0 ? request.InternalCorridor : 1.2;
        var roomCount = request.RoomCount;
        var prefix = string.IsNullOrWhiteSpace(request.NamePrefix) ? "Box" : request.NamePrefix;

        var centerLat = (bounds.MinLat + bounds.MaxLat) / 2.0;
        var padLng = MetersToDegLng(1.0, centerLat);
        var padLat = MetersToDegLat(1.0);
        var corridorDegLng = MetersToDegLng(corridorWidth, centerLat);
        var gapLat = MetersToDegLat(internalCorridor);

        var usableWidth = bounds.MaxLng - bounds.MinLng - padLng - corridorDegLng;
        var usableHeight = bounds.MaxLat - bounds.MinLat - padLat * 2 - gapLat * (roomCount - 1);

        var roomWidth = usableWidth;
        var roomHeight = usableHeight / roomCount;

        for (var i = 0; i < roomCount; i++)
        {
            var x1 = bounds.MinLng + padLng + corridorDegLng;
            var y1 = bounds.MinLat + padLat + i * (roomHeight + gapLat);
            var x2 = x1 + roomWidth;
            var y2 = y1 + roomHeight;

            var centerLngRoom = (x1 + x2) / 2.0;
            var centerLatRoom = (y1 + y2) / 2.0;

            if (!IsPointInPolygon(centerLngRoom, centerLatRoom, request.Coordinates))
                continue;

            var coords = new List<List<double>>
            {
                new() { x1, y1 },
                new() { x2, y1 },
                new() { x2, y2 },
                new() { x1, y2 },
                new() { x1, y1 }
            };

            result.Add(new SuggestedRoom
            {
                DisplayName = $"{prefix} {result.Count + 1}",
                Type = request.RoomType ?? "box",
                Coordinates = coords,
                Row = i,
                Column = 0
            });
        }

        return result;
    }

    private List<SuggestedRoom> GeneratePerimeterLayout(SuggestionRequest request)
    {
        var result = new List<SuggestedRoom>();
        if (request.Coordinates == null || request.Coordinates.Count < 3)
            return result;

        var bounds = GetBounds(request.Coordinates);
        var corridorWidth = request.CorridorWidth > 0 ? request.CorridorWidth : 1.5;
        var internalCorridor = request.InternalCorridor > 0 ? request.InternalCorridor : 1.2;
        var roomCount = request.RoomCount;
        var prefix = string.IsNullOrWhiteSpace(request.NamePrefix) ? "Box" : request.NamePrefix;

        var centerLat = (bounds.MinLat + bounds.MaxLat) / 2.0;
        var padLng = MetersToDegLng(1.0, centerLat);
        var padLat = MetersToDegLat(1.0);
        var gap = MetersToDegLng(internalCorridor, centerLat);

        var totalPerimeter = 2 * (((bounds.MaxLng - bounds.MinLng) - padLng * 2) + ((bounds.MaxLat - bounds.MinLat) - padLat * 2));
        var roomSide = totalPerimeter / roomCount;

        var innerWidth = (bounds.MaxLng - bounds.MinLng) - padLng * 2;
        var innerHeight = (bounds.MaxLat - bounds.MinLat) - padLat * 2;
        var roomWidth = innerWidth / Math.Max(1, (int)(innerWidth / roomSide));
        var roomHeight = roomSide;

        var innerBounds = new Bounds
        {
            MinLng = bounds.MinLng + padLng,
            MaxLng = bounds.MaxLng - padLng,
            MinLat = bounds.MinLat + padLat,
            MaxLat = bounds.MaxLat - padLat
        };
        var positions = GetPerimeterPositions(innerBounds, 0, roomCount);

        for (var i = 0; i < positions.Count && i < roomCount; i++)
        {
            var pos = positions[i];
            var centerLngRoom = pos.X + roomWidth / 2.0;
            var centerLatRoom = pos.Y + roomHeight / 2.0;

            if (!IsPointInPolygon(centerLngRoom, centerLatRoom, request.Coordinates))
                continue;

            var coords = new List<List<double>>
            {
                new() { pos.X, pos.Y },
                new() { pos.X + roomWidth, pos.Y },
                new() { pos.X + roomWidth, pos.Y + roomHeight },
                new() { pos.X, pos.Y + roomHeight },
                new() { pos.X, pos.Y }
            };

            result.Add(new SuggestedRoom
            {
                DisplayName = $"{prefix} {result.Count + 1}",
                Type = request.RoomType ?? "box",
                Coordinates = coords,
                Row = i / 4,
                Column = i % 4
            });
        }

        return result;
    }

    private static List<LatLng> GetPerimeterPositions(Bounds bounds, double corridorWidth, int count)
    {
        var positions = new List<LatLng>();
        var width = bounds.MaxLng - bounds.MinLng;
        var height = bounds.MaxLat - bounds.MinLat;
        var perimeter = 2 * (width + height);
        var step = perimeter / count;

        for (var i = 0; i < count; i++)
        {
            var dist = i * step;
            double x, y;

            if (dist < width)
            {
                x = bounds.MinLng + dist;
                y = bounds.MinLat + corridorWidth;
            }
            else if (dist < width + height)
            {
                x = bounds.MaxLng - corridorWidth;
                y = bounds.MinLat + (dist - width);
            }
            else if (dist < 2 * width + height)
            {
                x = bounds.MaxLng - (dist - width - height);
                y = bounds.MaxLat - corridorWidth;
            }
            else
            {
                x = bounds.MinLng + corridorWidth;
                y = bounds.MaxLat - (dist - 2 * width - height);
            }

            positions.Add(new LatLng { X = x, Y = y });
        }

        return positions;
    }

    private static Bounds GetBounds(List<List<double>> coordinates)
    {
        var lngs = coordinates.Select(c => c[0]).ToList();
        var lats = coordinates.Select(c => c[1]).ToList();
        return new Bounds
        {
            MinLng = lngs.Min(),
            MaxLng = lngs.Max(),
            MinLat = lats.Min(),
            MaxLat = lats.Max()
        };
    }

    private static bool IsPointInPolygon(double lng, double lat, List<List<double>> polygon)
    {
        var n = polygon.Count;
        if (n < 3) return false;
        var inside = false;
        for (int i = 0, j = n - 1; i < n; j = i++)
        {
            double xi = polygon[i][0];
            double yi = polygon[i][1];
            double xj = polygon[j][0];
            double yj = polygon[j][1];
            if (((yi > lat) != (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi))
                inside = !inside;
        }
        return inside;
    }

    public static double CalculateAreaSquareMeters(List<List<double>> coordinates)
    {
        if (coordinates == null || coordinates.Count < 3) return 0;
        var centerLat = coordinates.Average(c => c[1]);
        var degToM_lat = METERS_PER_DEG_LAT;
        var degToM_lng = METERS_PER_DEG_LAT * Math.Cos(centerLat * Math.PI / 180.0);

        double area = 0;
        var n = coordinates.Count;
        for (int i = 0; i < n; i++)
        {
            int j = (i + 1) % n;
            var xi = coordinates[i][0] * degToM_lng;
            var yi = coordinates[i][1] * degToM_lat;
            var xj = coordinates[j][0] * degToM_lng;
            var yj = coordinates[j][1] * degToM_lat;
            area += xi * yj - xj * yi;
        }
        return Math.Abs(area) / 2.0;
    }
}

public class SuggestionRequest
{
    public string BuildingExternalId { get; set; } = string.Empty;
    public int Floor { get; set; }
    public int RoomCount { get; set; } = 6;
    public string Pattern { get; set; } = "grid";
    public int Rows { get; set; }
    public int Columns { get; set; }
    public double CorridorWidth { get; set; } = 1.5;
    public double InternalCorridor { get; set; } = 1.2;
    public string? RoomType { get; set; }
    public string? NamePrefix { get; set; }
    public List<List<double>>? Coordinates { get; set; }
}

public class SuggestedRoom
{
    public string DisplayName { get; set; } = string.Empty;
    public string Type { get; set; } = "box";
    public List<List<double>> Coordinates { get; set; } = new();
    public int Row { get; set; }
    public int Column { get; set; }
}

public class Bounds
{
    public double MinLng { get; set; }
    public double MaxLng { get; set; }
    public double MinLat { get; set; }
    public double MaxLat { get; set; }
}

public class LatLng
{
    public double X { get; set; }
    public double Y { get; set; }
}
