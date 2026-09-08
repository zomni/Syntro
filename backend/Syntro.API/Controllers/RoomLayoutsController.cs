using Microsoft.AspNetCore.Mvc;
using Syntro.API.Services;

namespace Syntro.API.Controllers;

[ApiController]
[Route("api/room-layouts")]
public class RoomLayoutsController : ControllerBase
{
    private readonly RoomLayoutService _roomLayoutService;

    public RoomLayoutsController(RoomLayoutService roomLayoutService)
    {
        _roomLayoutService = roomLayoutService;
    }

    [HttpGet]
    public async Task<IActionResult> GetCombined(
        [FromQuery] string buildingExternalId,
        [FromQuery] int floor,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(buildingExternalId))
            return BadRequest(new { message = "buildingExternalId es requerido." });

        var rooms = await _roomLayoutService.GetCombinedRoomsAsync(buildingExternalId, floor, cancellationToken);
        return Ok(rooms);
    }

    [HttpGet("{buildingExternalId}/floors")]
    public async Task<IActionResult> GetFloors(
        string buildingExternalId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(buildingExternalId))
            return BadRequest(new { message = "buildingExternalId es requerido." });

        var floors = await _roomLayoutService.GetFloorsAsync(buildingExternalId, cancellationToken);
        return Ok(floors);
    }
}
