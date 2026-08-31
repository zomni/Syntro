namespace Syntro.API.Services;

public sealed class DeliveryFormChecklistItem
{
    public string Key { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
}

public sealed class DeliveryFormChecklistSection
{
    public string Title { get; set; } = string.Empty;
    public List<DeliveryFormChecklistItem> Items { get; set; } = [];
}

public static class DeliveryFormChecklistConfig
{
    private const string SectionPath = "DeliveryForm:ApplicationChecklist:Sections";

    public static IReadOnlyList<DeliveryFormChecklistSection> GetSections(IConfiguration configuration)
    {
        var sections = new List<DeliveryFormChecklistSection>();

        foreach (var section in configuration.GetSection(SectionPath).GetChildren())
        {
            var title = section["Title"]?.Trim();
            if (string.IsNullOrWhiteSpace(title))
            {
                continue;
            }

            var items = section.GetSection("Items").GetChildren()
                .Select(item => new DeliveryFormChecklistItem
                {
                    Key = item["Key"]?.Trim() ?? string.Empty,
                    Label = item["Label"]?.Trim() ?? string.Empty
                })
                .Where(item => !string.IsNullOrWhiteSpace(item.Key))
                .ToList();

            if (items.Count == 0)
            {
                continue;
            }

            sections.Add(new DeliveryFormChecklistSection { Title = title, Items = items });
        }

        return sections.Count > 0 ? sections : GetDefaultSections();
    }

    public static IReadOnlyList<DeliveryFormChecklistSection> GetDefaultSections()
    {
        return [];
    }
}
