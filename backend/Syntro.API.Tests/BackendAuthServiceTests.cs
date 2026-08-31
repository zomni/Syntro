using Microsoft.AspNetCore.Identity;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging.Abstractions;
using Syntro.API.Data;
using Syntro.API.Infrastructure;
using Syntro.API.Models;
using Syntro.API.Services;

namespace Syntro.API.Tests;

public class BackendAuthServiceTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly AppDbContext _context;
    private readonly BackendAuthService _authService;
    private readonly IConfiguration _configuration;
    private readonly IPasswordHasher<AuthUser> _passwordHasher;

    public BackendAuthServiceTests()
    {
        _connection = TestDbContextFactory.CreateInMemoryConnection();
        _context = TestDbContextFactory.CreateContext(_connection);
        _configuration = TestConfiguration.FromSettings(new Dictionary<string, string?>
        {
            ["AuthSettings:UseLdapAuthentication"] = "false",
            ["AuthSettings:AllowLocalBreakGlass"] = "true",
            ["AuthSettings:BreakGlassUsernames"] = "ADMIN"
        });
        _passwordHasher = new PasswordHasher<AuthUser>();
        var ldap = new LdapAuthenticationService(_configuration, NullLogger<LdapAuthenticationService>.Instance);
        _authService = new BackendAuthService(_context, _passwordHasher, ldap, _configuration);
    }

    public void Dispose()
    {
        _context.Dispose();
        _connection.Dispose();
    }

    [Fact]
    public async Task EnsureInitialAdminAsync_ThrowsWhenMissingCredentials()
    {
        await Assert.ThrowsAsync<InvalidOperationException>(
            () => _authService.EnsureInitialAdminAsync());
    }

    [Fact]
    public async Task EnsureInitialAdminAsync_CreatesSuperAdminFromConfiguration()
    {
        var config = TestConfiguration.FromSettings(new Dictionary<string, string?>
        {
            ["AuthSettings:AdminUsername"] = "admin@example.com",
            ["AuthSettings:AdminPassword"] = "S3gura-2026-Str0ng!"
        });
        var service = BuildService(config);

        await service.EnsureInitialAdminAsync();

        var admin = await _context.AuthUsers.SingleAsync();
        Assert.Equal(AppRoles.Admin, admin.Role);
        Assert.Equal("ADMIN@EXAMPLE.COM", admin.NormalizedUsername);
        Assert.True(admin.IsActive);
    }

    [Fact]
    public async Task EnsureInitialAdminAsync_RejectsWeakPassword()
    {
        var config = TestConfiguration.FromSettings(new Dictionary<string, string?>
        {
            ["AuthSettings:AdminUsername"] = "admin@example.com",
            ["AuthSettings:AdminPassword"] = "1234"
        });
        var service = BuildService(config);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            () => service.EnsureInitialAdminAsync());
        Assert.Contains("politica de seguridad", ex.Message);
    }

    [Fact]
    public async Task AuthenticateAsync_SucceedsForValidBreakGlassCredentials()
    {
        await SeedUserAsync("ADMIN", "Val1dClave-2026!");

        var result = await _authService.AuthenticateAsync("admin", "Val1dClave-2026!");

        Assert.True(result.Succeeded);
        Assert.NotNull(result.User);
        Assert.Equal(AppRoles.Admin, result.User!.Role);
    }

    [Fact]
    public async Task AuthenticateAsync_LocksAccountAfterMaxFailedAttempts()
    {
        await SeedUserAsync("ADMIN", "Val1dClave-2026!");

        LoginResult? last = null;
        for (var attempt = 0; attempt < 5; attempt++)
        {
            last = await _authService.AuthenticateAsync("admin", "wrong-password");
        }

        Assert.False(last!.Succeeded);
        Assert.True(last.LockedUntilUtc.HasValue);

        var afterLock = await _authService.AuthenticateAsync("admin", "Val1dClave-2026!");
        Assert.False(afterLock.Succeeded);
        Assert.True(afterLock.LockedUntilUtc.HasValue);
    }

    [Fact]
    public async Task AuthenticateAsync_FailsForUnknownUser()
    {
        var result = await _authService.AuthenticateAsync("ghost", "Val1dClave-2026!");
        Assert.False(result.Succeeded);
        Assert.Null(result.User);
    }

    private async Task SeedUserAsync(string username, string password)
    {
        var user = new AuthUser
        {
            Username = username,
            NormalizedUsername = username.ToUpperInvariant(),
            Role = AppRoles.Admin,
            IsActive = true,
            CanManageUsers = true
        };
        user.PasswordHash = _passwordHasher.HashPassword(user, password);
        _context.AuthUsers.Add(user);
        await _context.SaveChangesAsync();
    }

    private BackendAuthService BuildService(IConfiguration config)
    {
        var ldap = new LdapAuthenticationService(config, NullLogger<LdapAuthenticationService>.Instance);
        return new BackendAuthService(_context, _passwordHasher, ldap, config);
    }
}
