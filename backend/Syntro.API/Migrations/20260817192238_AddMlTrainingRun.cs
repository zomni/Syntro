using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Syntro.API.Migrations
{
    /// <inheritdoc />
    public partial class AddMlTrainingRun : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MlTrainingRuns",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    ModelType = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    Samples = table.Column<int>(type: "INTEGER", nullable: false),
                    Accuracy = table.Column<float>(type: "REAL", nullable: false),
                    F1Score = table.Column<float>(type: "REAL", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    DeletedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    CreatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    UpdatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    DeletedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Version = table.Column<int>(type: "INTEGER", nullable: false),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MlTrainingRuns", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MlTrainingRuns_ModelType_CreatedAtUtc",
                table: "MlTrainingRuns",
                columns: new[] { "ModelType", "CreatedAtUtc" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MlTrainingRuns");
        }
    }
}
