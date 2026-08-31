using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Syntro.API.Migrations
{
    /// <inheritdoc />
    public partial class AddObservationMatchKey : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "MatchKey",
                table: "NetworkTelemetryObservations",
                type: "TEXT",
                maxLength: 80,
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "MatchKey",
                table: "NetworkTelemetryObservations");
        }
    }
}
