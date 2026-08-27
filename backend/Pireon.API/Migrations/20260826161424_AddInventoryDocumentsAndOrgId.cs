using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Pireon.API.Migrations
{
    /// <inheritdoc />
    public partial class AddInventoryDocumentsAndOrgId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "OrgId",
                table: "ImportedInventoryItems",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "InventoryDocuments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    InventoryItemId = table.Column<Guid>(type: "TEXT", nullable: false),
                    OriginalFileName = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    StoredFileName = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    ContentType = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    SizeBytes = table.Column<long>(type: "INTEGER", nullable: false),
                    Source = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
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
                    table.PrimaryKey("PK_InventoryDocuments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InventoryDocuments_ImportedInventoryItems_InventoryItemId",
                        column: x => x.InventoryItemId,
                        principalTable: "ImportedInventoryItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ImportedInventoryItems_OrgId",
                table: "ImportedInventoryItems",
                column: "OrgId");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryDocuments_InventoryItemId",
                table: "InventoryDocuments",
                column: "InventoryItemId");

            migrationBuilder.AddForeignKey(
                name: "FK_ImportedInventoryItems_Organizations_OrgId",
                table: "ImportedInventoryItems",
                column: "OrgId",
                principalTable: "Organizations",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ImportedInventoryItems_Organizations_OrgId",
                table: "ImportedInventoryItems");

            migrationBuilder.DropTable(
                name: "InventoryDocuments");

            migrationBuilder.DropIndex(
                name: "IX_ImportedInventoryItems_OrgId",
                table: "ImportedInventoryItems");

            migrationBuilder.DropColumn(
                name: "OrgId",
                table: "ImportedInventoryItems");
        }
    }
}
