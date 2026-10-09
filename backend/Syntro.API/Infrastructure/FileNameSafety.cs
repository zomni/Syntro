using System.Globalization;
using System.Text;

namespace Syntro.API.Infrastructure;

public static class FileNameSafety
{
    public static string CreateServerFileName(string extension)
    {
        var normalizedExtension = extension.StartsWith('.') ? extension : $".{extension}";
        return $"{Guid.NewGuid():N}{normalizedExtension.ToLowerInvariant()}";
    }

    public static string ToAsciiSegment(string? value, string fallback = "item", int maxLength = 64)
    {
        var normalized = (value ?? string.Empty).Trim().Normalize(NormalizationForm.FormD);
        var builder = new StringBuilder(normalized.Length);

        foreach (var character in normalized)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(character) == UnicodeCategory.NonSpacingMark)
                continue;

            var lower = char.ToLowerInvariant(character);
            if ((lower is >= 'a' and <= 'z') || (lower is >= '0' and <= '9') || lower is '_' or '-')
                builder.Append(lower);
            else if (builder.Length > 0 && builder[^1] != '-')
                builder.Append('-');
        }

        var result = builder.ToString().Trim('-');
        if (result.Length == 0)
            result = fallback;

        return result.Length <= maxLength ? result : result[..maxLength].TrimEnd('-');
    }

    public static bool IsSafePathSegment(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || value is "." or "..")
            return false;

        return value.IndexOfAny(Path.GetInvalidPathChars()) < 0
            && value.IndexOfAny(new[] { Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar }) < 0
            && value.All(character => !char.IsControl(character));
    }
}
