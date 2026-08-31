using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Syntro.API.Migrations
{
    /// <inheritdoc />
    public partial class AddScheduledScanRunScheduleLabel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ScheduleLabel",
                table: "ScheduledScanRuns",
                type: "TEXT",
                maxLength: 200,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ScheduleLabel",
                table: "ScheduledScanRuns");
        }
    }
}
