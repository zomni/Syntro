using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Syntro.API.Migrations
{
    /// <inheritdoc />
    public partial class AddManualRoomsAndRoomGeometryOverrides : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ManualRooms",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    ExternalId = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    BuildingExternalId = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Floor = table.Column<int>(type: "INTEGER", nullable: false),
                    DisplayName = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    ShortName = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Type = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Unit = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Service = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    Capacity = table.Column<int>(type: "INTEGER", nullable: true),
                    GeometryJson = table.Column<string>(type: "TEXT", nullable: false),
                    Source = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    Notes = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: false),
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
                    table.PrimaryKey("PK_ManualRooms", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "RoomGeometryOverrides",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    RoomExternalId = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    BuildingExternalId = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    GeometryJson = table.Column<string>(type: "TEXT", nullable: false),
                    CentroidLatitude = table.Column<double>(type: "REAL", nullable: true),
                    CentroidLongitude = table.Column<double>(type: "REAL", nullable: true),
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
                    table.PrimaryKey("PK_RoomGeometryOverrides", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ManualRooms_BuildingExternalId_Floor",
                table: "ManualRooms",
                columns: new[] { "BuildingExternalId", "Floor" });

            migrationBuilder.CreateIndex(
                name: "IX_ManualRooms_ExternalId",
                table: "ManualRooms",
                column: "ExternalId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RoomGeometryOverrides_RoomExternalId",
                table: "RoomGeometryOverrides",
                column: "RoomExternalId",
                unique: true,
                filter: "\"RoomExternalId\" IS NOT NULL AND \"DeletedAtUtc\" IS NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ManualRooms");

            migrationBuilder.DropTable(
                name: "RoomGeometryOverrides");
        }
    }
}
