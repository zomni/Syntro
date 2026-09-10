using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Syntro.API.Migrations
{
    /// <inheritdoc />
    public partial class RemoveFloorZero : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // ------------------------------------------------------------------
            // Migración de datos para eliminar el piso "0" de toda la aplicación.
            // Los pisos 0 y 1 representan el mismo espacio; se consolida todo en piso 1.
            // ------------------------------------------------------------------

            // 1) SyncedBuildings.FloorsJson: quitar el valor 0 (ej: [0,1] -> [1]).
            migrationBuilder.Sql(@"
UPDATE SyncedBuildings
SET FloorsJson = (SELECT json_group_array(j.value ORDER BY j.key)
                  FROM json_each(SyncedBuildings.FloorsJson) AS j
                  WHERE j.value != 0)
WHERE EXISTS (SELECT 1 FROM json_each(SyncedBuildings.FloorsJson) AS j WHERE j.value = 0);
");

            // 2) SyncedBuildings.ManualFloorsJson: aplicar el mismo tratamiento.
            migrationBuilder.Sql(@"
UPDATE SyncedBuildings
SET ManualFloorsJson = (SELECT json_group_array(j.value ORDER BY j.key)
                        FROM json_each(SyncedBuildings.ManualFloorsJson) AS j
                        WHERE j.value != 0)
WHERE ManualFloorsJson != ''
  AND EXISTS (SELECT 1 FROM json_each(SyncedBuildings.ManualFloorsJson) AS j WHERE j.value = 0);
");

            // 3) ManualBuildings.FloorsJson: quitar el valor 0.
            migrationBuilder.Sql(@"
UPDATE ManualBuildings
SET FloorsJson = (SELECT json_group_array(j.value ORDER BY j.key)
                  FROM json_each(ManualBuildings.FloorsJson) AS j
                  WHERE j.value != 0)
WHERE EXISTS (SELECT 1 FROM json_each(ManualBuildings.FloorsJson) AS j WHERE j.value = 0);
");

            // 4) SyncedRooms: mover las salas del piso 0 al piso 1.
            migrationBuilder.Sql(@"
UPDATE SyncedRooms SET ManualFloor = 1 WHERE ManualFloor = 0;
UPDATE SyncedRooms SET Floor = 1 WHERE Floor = 0 AND (ManualFloor IS NULL OR ManualFloor = 1);
");

            // 5) ManualRooms: borrado lógico de la sala manual del piso 0 del CDT.
            migrationBuilder.Sql(@"
UPDATE ManualRooms
SET DeletedAtUtc = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    DeletedBy = 'remove-floor-zero',
    IsActive = 0
WHERE ExternalId = 'MAN-SR-BLD-001-0-1788875636320'
  AND DeletedAtUtc IS NULL;
");

            // 6) FloorSummariesJson: consolidar resúmenes del piso 0 dentro del piso 1
            //    y eliminar la entrada del piso 0 (solo 3 edificios con datos).
            migrationBuilder.Sql(@"
UPDATE SyncedBuildings
SET FloorSummariesJson = (
  SELECT json_group_array(json_object(
      'floor', CAST(e.value->>'floor' AS INTEGER),
      'roomsCount', CAST(e.value->>'roomsCount' AS INTEGER) +
        CASE WHEN CAST(e.value->>'floor' AS INTEGER) = 1
             THEN COALESCE((SELECT CAST(f.value->>'roomsCount' AS INTEGER) FROM json_each(SyncedBuildings.FloorSummariesJson) f WHERE CAST(f.value->>'floor' AS INTEGER) = 0), 0)
             ELSE 0 END,
      'mappedRoomsCount', CAST(e.value->>'mappedRoomsCount' AS INTEGER) +
        CASE WHEN CAST(e.value->>'floor' AS INTEGER) = 1
             THEN COALESCE((SELECT CAST(f.value->>'mappedRoomsCount' AS INTEGER) FROM json_each(SyncedBuildings.FloorSummariesJson) f WHERE CAST(f.value->>'floor' AS INTEGER) = 0), 0)
             ELSE 0 END,
      'devicesCount', CAST(e.value->>'devicesCount' AS INTEGER) +
        CASE WHEN CAST(e.value->>'floor' AS INTEGER) = 1
             THEN COALESCE((SELECT CAST(f.value->>'devicesCount' AS INTEGER) FROM json_each(SyncedBuildings.FloorSummariesJson) f WHERE CAST(f.value->>'floor' AS INTEGER) = 0), 0)
             ELSE 0 END,
      'notes', CASE WHEN CAST(e.value->>'floor' AS INTEGER) = 1
                    THEN (SELECT CASE WHEN TRIM(COALESCE(f.value->>'notes','')) = '' THEN e.value->>'notes' ELSE TRIM(e.value->>'notes' || '; ' || f.value->>'notes') END FROM json_each(SyncedBuildings.FloorSummariesJson) f WHERE CAST(f.value->>'floor' AS INTEGER) = 0)
                    ELSE e.value->>'notes' END
  ))
  FROM json_each(SyncedBuildings.FloorSummariesJson) e
  WHERE CAST(e.value->>'floor' AS INTEGER) <> 0
)
WHERE FloorSummariesJson NOT IN ('', '[]');
");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Migración destructiva de datos; no se revierte automáticamente.
            // Listo para restaurar desde el snapshot 'syntro.db.pre-floor-zero'.
        }
    }
}