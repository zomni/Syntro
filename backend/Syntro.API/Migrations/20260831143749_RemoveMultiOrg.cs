using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Syntro.API.Migrations
{
    /// <inheritdoc />
    public partial class RemoveMultiOrg : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_AuthUsers_Organizations_OrganizationId",
                table: "AuthUsers");

            migrationBuilder.DropForeignKey(
                name: "FK_ImportedInventoryItems_Organizations_OrgId",
                table: "ImportedInventoryItems");

            migrationBuilder.DropTable(
                name: "CampusSites");

            migrationBuilder.DropTable(
                name: "Organizations");

            migrationBuilder.DropIndex(
                name: "IX_ImportedInventoryItems_OrgId",
                table: "ImportedInventoryItems");

            migrationBuilder.DropIndex(
                name: "IX_AuthUsers_OrganizationId",
                table: "AuthUsers");

            migrationBuilder.DropColumn(
                name: "OrgId",
                table: "ImportedInventoryItems");

            migrationBuilder.DropColumn(
                name: "OrganizationId",
                table: "AuthUsers");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "OrgId",
                table: "ImportedInventoryItems",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "OrganizationId",
                table: "AuthUsers",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Organizations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    Color = table.Column<string>(type: "TEXT", nullable: false),
                    ContactEmail = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    CreatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    DeletedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    DeletedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Notes = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: false),
                    Slug = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Version = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Organizations", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "CampusSites",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "TEXT", nullable: false),
                    BoundsMaxLatitude = table.Column<double>(type: "REAL", nullable: false),
                    BoundsMaxLongitude = table.Column<double>(type: "REAL", nullable: false),
                    BoundsMinLatitude = table.Column<double>(type: "REAL", nullable: false),
                    BoundsMinLongitude = table.Column<double>(type: "REAL", nullable: false),
                    CampusKey = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    CenterLatitude = table.Column<double>(type: "REAL", nullable: false),
                    CenterLongitude = table.Column<double>(type: "REAL", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    CreatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    DefaultFloor = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    DeletedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    DeletedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    FloorsJson = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: false),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false),
                    MaxZoom = table.Column<int>(type: "INTEGER", nullable: false),
                    MinZoom = table.Column<int>(type: "INTEGER", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    School = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Version = table.Column<int>(type: "INTEGER", nullable: false),
                    Zoom = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CampusSites", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CampusSites_Organizations_OrganizationId",
                        column: x => x.OrganizationId,
                        principalTable: "Organizations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ImportedInventoryItems_OrgId",
                table: "ImportedInventoryItems",
                column: "OrgId");

            migrationBuilder.CreateIndex(
                name: "IX_AuthUsers_OrganizationId",
                table: "AuthUsers",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_CampusSites_CampusKey",
                table: "CampusSites",
                column: "CampusKey",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CampusSites_OrganizationId",
                table: "CampusSites",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_Organizations_Slug",
                table: "Organizations",
                column: "Slug",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_AuthUsers_Organizations_OrganizationId",
                table: "AuthUsers",
                column: "OrganizationId",
                principalTable: "Organizations",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_ImportedInventoryItems_Organizations_OrgId",
                table: "ImportedInventoryItems",
                column: "OrgId",
                principalTable: "Organizations",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }
    }
}
