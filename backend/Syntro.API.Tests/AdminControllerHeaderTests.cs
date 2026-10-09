using Syntro.API.Controllers;

namespace Syntro.API.Tests;

public class AdminControllerHeaderTests
{
    [Fact]
    public void BuildInlineContentDisposition_EncodesNonAsciiNameAndKeepsAsciiFallback()
    {
        var header = AdminController.BuildInlineContentDisposition("formulario-D6C7N34-Romina Zuñiga.pdf");

        Assert.Equal(
            "inline; filename=\"formulario-D6C7N34-Romina Zu_iga.pdf\"; filename*=UTF-8''formulario-D6C7N34-Romina%20Zu%C3%B1iga.pdf",
            header);
    }

    [Fact]
    public void BuildInlineContentDisposition_RemovesControlCharactersAndPathSegments()
    {
        var header = AdminController.BuildInlineContentDisposition("..\\reports\\archivo\r\n.pdf");

        Assert.Equal(
            "inline; filename=\"archivo__.pdf\"; filename*=UTF-8''archivo%0D%0A.pdf",
            header);
    }
}
