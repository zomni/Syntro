namespace Syntro.API.Models;

public class AuthUser : AuditableEntity
{
    public string Username { get; set; } = string.Empty;
    public string NormalizedUsername { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string Role { get; set; } = AppRoles.Viewer;
    public bool MfaEnabled { get; set; }
    public string MfaSecretProtected { get; set; } = string.Empty;
    public DateTime? MfaEnrolledAtUtc { get; set; }
    public DateTime? MfaLastVerifiedAtUtc { get; set; }
    public bool CanManageUsers { get; set; } = true;
    public int FailedLoginAttempts { get; set; }
    public DateTime? LockedUntilUtc { get; set; }
    public DateTime? LastLoginAtUtc { get; set; }
}
