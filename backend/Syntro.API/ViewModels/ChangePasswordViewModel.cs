using System.ComponentModel.DataAnnotations;

namespace Syntro.API.ViewModels;

public class ChangePasswordViewModel
{
    [Required]
    public string NewPassword { get; set; } = string.Empty;

    [Required]
    [Compare(nameof(NewPassword), ErrorMessage = "Las contrasenas no coinciden.")]
    public string ConfirmPassword { get; set; } = string.Empty;

    public string? ReturnUrl { get; set; }
    public string Username { get; set; } = string.Empty;
}
