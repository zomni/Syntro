using System.Globalization;
using System.Text;

namespace Syntro.API.Services;

public static class InventoryCategoriesConfig
{
    public static IReadOnlyList<string> GetCategoryNames(IConfiguration configuration)
        => GetNames(configuration, "InventoryCategories:Categories", "Name");

    public static IReadOnlyList<string> GetStatusNames(IConfiguration configuration)
        => GetNames(configuration, "InventoryCategories:Statuses", "Name");

    public static string GetFallbackCategory(IConfiguration configuration)
        => configuration?["InventoryCategories:FallbackCategory"] ?? "other";

    public static string GetFallbackStatus(IConfiguration configuration)
        => configuration?["InventoryCategories:FallbackStatus"] ?? "active";

    public static string InferCategory(IConfiguration configuration, string description)
    {
        var text = NormalizeText(description);
        if (string.IsNullOrWhiteSpace(text))
        {
            return GetFallbackCategory(configuration);
        }

        var categories = LoadDefinitions(configuration, "InventoryCategories:Categories", "Name", "Tokens");
        foreach (var category in categories)
        {
            foreach (var token in category.Tokens)
            {
                if (text.Contains(token, StringComparison.Ordinal))
                {
                    return category.Name;
                }
            }
        }

        return GetFallbackCategory(configuration);
    }

    public static (string Category, string MatchedToken) InferCategoryWithDetail(IConfiguration configuration, string description)
    {
        var text = NormalizeText(description);
        if (string.IsNullOrWhiteSpace(text))
        {
            return (GetFallbackCategory(configuration), string.Empty);
        }

        var categories = LoadDefinitions(configuration, "InventoryCategories:Categories", "Name", "Tokens");
        foreach (var category in categories)
        {
            foreach (var token in category.Tokens)
            {
                if (text.Contains(token, StringComparison.Ordinal))
                {
                    return (category.Name, token);
                }
            }
        }

        return (GetFallbackCategory(configuration), string.Empty);
    }

    public static string InferStatus(IConfiguration configuration, string observation)
    {
        var text = NormalizeText(observation);
        if (string.IsNullOrWhiteSpace(text))
        {
            return GetFallbackStatus(configuration);
        }

        var statuses = LoadDefinitions(configuration, "InventoryCategories:Statuses", "Name", "Tokens");
        foreach (var status in statuses)
        {
            foreach (var token in status.Tokens)
            {
                if (text.Contains(token, StringComparison.Ordinal))
                {
                    return status.Name;
                }
            }
        }

        return GetFallbackStatus(configuration);
    }

    private static IReadOnlyList<string> GetNames(IConfiguration configuration, string sectionPath, string nameKey)
    {
        var section = configuration?.GetSection(sectionPath);
        if (section?.GetChildren().Any() != true)
        {
            return Array.Empty<string>();
        }

        return section.GetChildren()
            .Select(child => child[nameKey])
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value!.Trim().ToLowerInvariant())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    private static IReadOnlyList<CategoryDefinition> LoadDefinitions(IConfiguration configuration, string sectionPath, string nameKey, string tokensKey)
    {
        var section = configuration?.GetSection(sectionPath);
        if (section?.GetChildren().Any() != true)
        {
            return Array.Empty<CategoryDefinition>();
        }

        return section.GetChildren()
            .Select(child => new CategoryDefinition(
                child[nameKey]?.Trim().ToLowerInvariant() ?? string.Empty,
                child.GetSection(tokensKey)
                    .GetChildren()
                    .Select(token => token.Value)
                    .Where(value => !string.IsNullOrWhiteSpace(value))
                    .Select(value => value!.Trim().ToUpperInvariant())
                    .ToList()))
            .Where(definition => definition.Name.Length > 0)
            .ToList();
    }

    private static string NormalizeText(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return string.Empty;
        }

        var decomposed = value.Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(decomposed.Length);

        foreach (var character in decomposed)
        {
            var category = CharUnicodeInfo.GetUnicodeCategory(character);
            if (category == UnicodeCategory.NonSpacingMark)
            {
                continue;
            }

            if (char.IsLetterOrDigit(character))
            {
                builder.Append(char.ToUpperInvariant(character));
            }
            else if (char.IsWhiteSpace(character))
            {
                builder.Append(' ');
            }
        }

        return builder.ToString();
    }

    private sealed record CategoryDefinition(string Name, IReadOnlyList<string> Tokens);
}
