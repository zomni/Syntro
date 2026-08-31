using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Syntro.API.Migrations
{
    /// <inheritdoc />
    public partial class AddSnapshotAndRunCampusKey : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "CampusKey",
                table: "ScheduledScanRuns",
                type: "TEXT",
                maxLength: 100,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "CampusKey",
                table: "NetworkTelemetrySnapshots",
                type: "TEXT",
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateIndex(
                name: "IX_NetworkTelemetrySnapshots_CampusKey",
                table: "NetworkTelemetrySnapshots",
                column: "CampusKey");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_NetworkTelemetrySnapshots_CampusKey",
                table: "NetworkTelemetrySnapshots");

            migrationBuilder.DropColumn(
                name: "CampusKey",
                table: "ScheduledScanRuns");

            migrationBuilder.DropColumn(
                name: "CampusKey",
                table: "NetworkTelemetrySnapshots");
        }
    }
}
