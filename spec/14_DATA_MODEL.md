# Modelo de Datos

## Reglas Generales

- Claves primarias GUID.
- Timestamps en UTC.
- Soft delete soportado (deleted_at).
- Campos de auditoría en entidades mutables.
- Optimizado para SQLite vía EF Core.

## Columnas Comunes

id
created_at
updated_at
deleted_at
created_by
updated_by
version
is_active

## Restricciones

- Campus: nombre único, nivel superior; los sitios (`CampusSite`) pertenecen a una `Organization`.
- Building: pertenece a un Campus, código único dentro del Campus.
- Floor: pertenece a un Building, nivel único dentro del Building.
- Room: pertenece a un Building.
- Equipment: el número de serie es el identificador prioritario.
- PointOfInterest: pertenece a un Campus (y opcionalmente a un Floor).
- WalkingRouteEdge: conecta dos WalkingRouteNodes.
- ManualRoom: `ExternalId` único, índice `(BuildingExternalId, Floor)`.
- RoomGeometryOverride: `RoomExternalId` único (un override de geometría por sala).

## Convenciones de nombres / id

- Las salas usan un `ExternalId` globalmente único; el editor emite
  `MAN-*` para las salas manuales. Las salas legacy sincronizadas desde la fuente conservan su `ExternalId` de origen.
- `GeometryJson` almacena un `Polygon` GeoJSON (`coordinates[0]` = anillo cerrado de
  pares `[lng, lat]`) para ambas entidades.

## Soft Delete

- Los endpoints DELETE solo realizan soft delete.
- Los registros activos usan is_active=true.

## Inicialización del Esquema

- El esquema se crea vía migraciones EF más un inicializador de esquema neutral.
- No se insertan datos demo por defecto (SPEC 04).
