using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Syntro.API.Migrations
{
    /// <inheritdoc />
    public partial class AddMlMetadata : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "MlScoredDeviceCount",
                table: "NetworkTelemetrySnapshots",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<float>(
                name: "MlProbability",
                table: "NetworkTelemetryObservations",
                type: "REAL",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RuleBasedScore",
                table: "NetworkTelemetryObservations",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ScoringSource",
                table: "NetworkTelemetryObservations",
                type: "TEXT",
                maxLength: 20,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "CategorySource",
                table: "ImportedInventoryItems",
                type: "TEXT",
                maxLength: 10,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<float>(
                name: "ClassificationConfidence",
                table: "ImportedInventoryItems",
                type: "REAL",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "MlScoredDeviceCount",
                table: "NetworkTelemetrySnapshots");

            migrationBuilder.DropColumn(
                name: "MlProbability",
                table: "NetworkTelemetryObservations");

            migrationBuilder.DropColumn(
                name: "RuleBasedScore",
                table: "NetworkTelemetryObservations");

            migrationBuilder.DropColumn(
                name: "ScoringSource",
                table: "NetworkTelemetryObservations");

            migrationBuilder.DropColumn(
                name: "CategorySource",
                table: "ImportedInventoryItems");

            migrationBuilder.DropColumn(
                name: "ClassificationConfidence",
                table: "ImportedInventoryItems");
        }
    }
}
