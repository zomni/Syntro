namespace Syntro.API.Services;

public static class PasswordPolicyService
{
    private const string SectionPath = "PasswordPolicy";

    private static readonly HashSet<string> CommonPasswords = new(StringComparer.OrdinalIgnoreCase)
    {
        "12345678", "123456789", "1234567890", "12345678910", "11111111", "0000000000",
        "password", "passw0rd", "password1", "password123", "pass1234", "pass123456",
        "qwerty", "qwerty123", "qwerty1234", "qwertyuiop",
        "admin", "admin123", "admin1234", "administrator", "administrador",
        "letmein", "welcome", "welcome1", "welcome123", "abc12345", "abc123456",
        "iloveyou", "monkey", "dragon", "football", "baseball", "superman", "princess",
        "changeme", "changeme123", "change_me", "test", "test123", "test1234", "testing",
        "default", "default123", "demo", "demo123", "syntro", "syntro123", "sotero",
        "sotero123", "admin@example.com", "change_me", "changeme", "Password1!",
        "P@ssw0rd", "P@ssword1", "P@ssword123"
    };

    public static string? Validate(string? password, string? username, IConfiguration configuration)
    {
        if (string.IsNullOrWhiteSpace(password))
        {
            return "La contrasena es obligatoria.";
        }

        var minLength = configuration.GetValue<int?>($"{SectionPath}:MinLength") ?? 10;
        var maxLength = configuration.GetValue<int?>($"{SectionPath}:MaxLength") ?? 64;
        var disallowCommon = configuration.GetValue<bool?>($"{SectionPath}:DisallowCommonPasswords") ?? true;

        if (password.Length < minLength)
        {
            return $"La contrasena debe tener al menos {minLength} caracteres.";
        }

        if (password.Length > maxLength)
        {
            return $"La contrasena no puede superar los {maxLength} caracteres.";
        }

        if (disallowCommon && CommonPasswords.Contains(password))
        {
            return "La contrasena es demasiado comun. Elige una contrasena unica.";
        }

        var normalizedUsername = username?.Trim();
        if (!string.IsNullOrWhiteSpace(normalizedUsername) &&
            password.IndexOf(normalizedUsername, StringComparison.OrdinalIgnoreCase) >= 0)
        {
            return "La contrasena no puede contener el nombre de usuario.";
        }

        return null;
    }
}
