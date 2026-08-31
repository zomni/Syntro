using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Syntro.API.Migrations
{
    /// <inheritdoc />
    public partial class AddScheduledScanRunRunNumber : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "RunNumber",
                table: "ScheduledScanRuns",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);

            // Contador cronologico por organizacion: #1 = run mas antiguo de cada
            // CampusKey (orden CreatedAtUtc -> ScheduledAtUtc -> Id para desempates).
            migrationBuilder.Sql("""
                UPDATE "ScheduledScanRuns"
                SET "RunNumber" = (
                    SELECT COUNT(*) + 1
                    FROM "ScheduledScanRuns" AS s
                    WHERE s."CampusKey" = "ScheduledScanRuns"."CampusKey"
                      AND (s."CreatedAtUtc" < "ScheduledScanRuns"."CreatedAtUtc"
                           OR (s."CreatedAtUtc" = "ScheduledScanRuns"."CreatedAtUtc" AND s."ScheduledAtUtc" < "ScheduledScanRuns"."ScheduledAtUtc")
                           OR (s."CreatedAtUtc" = "ScheduledScanRuns"."CreatedAtUtc" AND s."ScheduledAtUtc" = "ScheduledScanRuns"."ScheduledAtUtc" AND s."Id" < "ScheduledScanRuns"."Id"))
                );
            """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "RunNumber",
                table: "ScheduledScanRuns");
        }
    }
}
