# Inventario

## Propósito

Gestionar los activos de equipo, su asignación a ubicaciones y el inventario importado.

## Entidades

- ImportedInventoryItem: inventario importado o creado manualmente.
- InventoryAliasRule: reglas para mapear ubicaciones textuales a buildings/rooms.
- SyncedEquipment: equipos históricos/sincronizados por building/room.

## Campos de ImportedInventoryItem

- SerialNumber: identificador prioritario.
- InferredCategory: categoría normalizada (configurable, SPEC 08).
- InferredStatus: estado operativo.
- AssignedBuildingExternalId: building asignado.
- AssignedRoomExternalId: room asignado.
- AssignedFloor: piso asignado.
- DeliveryFormPdfFileName: PDF asociado, si existe.
- MatchedBuildingExternalId / MatchedRoomExternalId: sugerencias de reconciliación automática.
- AssignmentUpdatedAtUtc: fecha de la última asignación manual.

## Flujos

- Importación de Excel con mapeo de categorías configurable.
- Crear/editar/eliminar manual.
- Asignación a building/room/floor.
- Reconciliación del inventario contra ubicaciones.
- Adjuntar PDF por equipo.

## Reglas

- El backend es la fuente de datos prioritaria para el inventario.
- Las mutaciones sensibles de inventario se auditan.
- Sin normalización específica del cliente (SPEC 08).
