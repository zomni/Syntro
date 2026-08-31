using Syntro.API.Services;

namespace Syntro.API.Tests;

public class PasswordPolicyServiceTests
{
    private static readonly IConfiguration EmptyConfig = TestConfiguration.FromSettings(new Dictionary<string, string?>());

    [Fact]
    public void Validate_AcceptsPasswordOverMinLength()
    {
        var error = PasswordPolicyService.Validate("Tr0pik4l-2026-Secreto", null, EmptyConfig);
        Assert.Null(error);
    }

    [Fact]
    public void Validate_RejectsNullOrEmpty()
    {
        Assert.NotNull(PasswordPolicyService.Validate(null, null, EmptyConfig));
        Assert.NotNull(PasswordPolicyService.Validate("", null, EmptyConfig));
        Assert.NotNull(PasswordPolicyService.Validate("   ", null, EmptyConfig));
    }

    [Fact]
    public void Validate_RejectsShortPassword()
    {
        var error = PasswordPolicyService.Validate("abc123", null, EmptyConfig);
        Assert.NotNull(error);
        Assert.Contains("al menos 10", error);
    }

    [Fact]
    public void Validate_RejectsPasswordOverMaxLength()
    {
        var config = TestConfiguration.FromSettings(new Dictionary<string, string?>
        {
            ["PasswordPolicy:MaxLength"] = "12"
        });
        var error = PasswordPolicyService.Validate("123456789012345", null, config);
        Assert.NotNull(error);
        Assert.Contains("no puede superar", error);
    }

    [Fact]
    public void Validate_RejectsCommonPassword()
    {
        var error = PasswordPolicyService.Validate("password123", null, EmptyConfig);
        Assert.NotNull(error);
        Assert.Contains("demasiado comun", error);
    }

    [Fact]
    public void Validate_RejectsPasswordContainingUsername()
    {
        var error = PasswordPolicyService.Validate("MifuerteClave2026", "clave", EmptyConfig);
        Assert.NotNull(error);
        Assert.Contains("nombre de usuario", error);
    }

    [Fact]
    public void Validate_AcceptsCommonPasswordWhenDisabled()
    {
        var config = TestConfiguration.FromSettings(new Dictionary<string, string?>
        {
            ["PasswordPolicy:DisallowCommonPasswords"] = "false"
        });
        Assert.Null(PasswordPolicyService.Validate("password123", null, config));
    }

    [Fact]
    public void Validate_RespectsCustomMinLength()
    {
        var config = TestConfiguration.FromSettings(new Dictionary<string, string?>
        {
            ["PasswordPolicy:MinLength"] = "6"
        });
        Assert.Null(PasswordPolicyService.Validate("abc123", null, config));
    }
}
