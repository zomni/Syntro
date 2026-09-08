using System.Text.Json;

namespace Syntro.API.Services;

public class RoomSuggestionService
{
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

        var usableWidth = bounds.MaxLng - bounds.MinLng - corridorWidth * 2;
        var usableHeight = bounds.MaxLat - bounds.MinLat - corridorWidth * 2;

        if (usableWidth <= 0 || usableHeight <= 0)
            return result;

        var roomWidth = usableWidth / cols;
        var roomHeight = usableHeight / rows;

        var counter = 0;
        var prefix = string.IsNullOrWhiteSpace(request.NamePrefix) ? "Box" : request.NamePrefix;

        for (var row = 0; row < rows && counter < request.RoomCount; row++)
        {
            for (var col = 0; col < cols && counter < request.RoomCount; col++)
            {
                var x1 = bounds.MinLng + corridorWidth + col * roomWidth;
                var y1 = bounds.MinLat + corridorWidth + row * roomHeight;
                var x2 = x1 + roomWidth;
                var y2 = y1 + roomHeight;

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
                    DisplayName = $"{prefix} {counter + 1}",
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
        var roomsPerSide = Math.Max(1, request.RoomCount / 2);
        var prefix = string.IsNullOrWhiteSpace(request.NamePrefix) ? "Box" : request.NamePrefix;

        var usableWidth = bounds.MaxLng - bounds.MinLng - corridorWidth * 2;
        var usableHeight = bounds.MaxLat - bounds.MinLat;

        var roomHeight = usableHeight / roomsPerSide;
        var roomWidth = usableWidth / 2;

        var counter = 0;

        for (var side = 0; side < 2; side++)
        {
            for (var i = 0; i < roomsPerSide && counter < request.RoomCount; i++)
            {
                var x1 = side == 0
                    ? bounds.MinLng + corridorWidth
                    : bounds.MinLng + corridorWidth + roomWidth + corridorWidth;
                var y1 = bounds.MinLat + i * roomHeight;
                var x2 = x1 + roomWidth;
                var y2 = y1 + roomHeight;

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
                    DisplayName = $"{prefix} {counter + 1}",
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
        var roomCount = request.RoomCount;
        var prefix = string.IsNullOrWhiteSpace(request.NamePrefix) ? "Box" : request.NamePrefix;

        var usableWidth = bounds.MaxLng - bounds.MinLng - corridorWidth;
        var usableHeight = bounds.MaxLat - bounds.MinLat - corridorWidth * 2;

        var roomWidth = usableWidth;
        var roomHeight = usableHeight / roomCount;

        for (var i = 0; i < roomCount; i++)
        {
            var x1 = bounds.MinLng + corridorWidth;
            var y1 = bounds.MinLat + corridorWidth + i * roomHeight;
            var x2 = x1 + roomWidth;
            var y2 = y1 + roomHeight;

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
                DisplayName = $"{prefix} {i + 1}",
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
        var roomCount = request.RoomCount;
        var prefix = string.IsNullOrWhiteSpace(request.NamePrefix) ? "Box" : request.NamePrefix;

        var totalPerimeter = 2 * ((bounds.MaxLng - bounds.MinLng) + (bounds.MaxLat - bounds.MinLat));
        var roomSide = totalPerimeter / roomCount;

        var roomWidth = (bounds.MaxLng - bounds.MinLng - corridorWidth * 2) / Math.Max(1, (int)((bounds.MaxLng - bounds.MinLng) / roomSide));
        var roomHeight = roomSide;

        var positions = GetPerimeterPositions(bounds, corridorWidth, roomCount);

        for (var i = 0; i < positions.Count && i < roomCount; i++)
        {
            var pos = positions[i];
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
                DisplayName = $"{prefix} {i + 1}",
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
