using System.ComponentModel.DataAnnotations;

namespace Syntro.API.ViewModels;

public class LoginViewModel
{
    [Required]
    [Display(Name = "Usuario")]
    public string Username { get; set; } = string.Empty;

    [Required]
    [DataType(DataType.Password)]
    [Display(Name = "Contrasena")]
    public string Password { get; set; } = string.Empty;

    [Display(Name = "Recordarme")]
    public bool RememberMe { get; set; }

    public string? ReturnUrl { get; set; }
}
