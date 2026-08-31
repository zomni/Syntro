using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Syntro.API.Migrations
{
    /// <inheritdoc />
    public partial class BackfillOrganizationColors : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                UPDATE "Organizations"
                SET "Color" = CASE (("rowid" - 1) % 15)
                    WHEN 0 THEN '#0d6efd'
                    WHEN 1 THEN '#6610f2'
                    WHEN 2 THEN '#d63384'
                    WHEN 3 THEN '#dc3545'
                    WHEN 4 THEN '#fd7e14'
                    WHEN 5 THEN '#198754'
                    WHEN 6 THEN '#20c997'
                    WHEN 7 THEN '#0dcaf0'
                    WHEN 8 THEN '#6f42c1'
                    WHEN 9 THEN '#f2711c'
                    WHEN 10 THEN '#7b1fa2'
                    WHEN 11 THEN '#00796b'
                    WHEN 12 THEN '#c2185b'
                    WHEN 13 THEN '#5d4037'
                    ELSE '#546e7a'
                END
                WHERE "Color" IS NULL OR "Color" = '';
            """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
        }
    }
}
