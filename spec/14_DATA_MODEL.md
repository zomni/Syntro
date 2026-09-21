# Data Model

## General Rules

- GUID primary keys.
- UTC timestamps.
- Soft delete supported (deleted_at).
- Audit fields on mutable entities.
- Optimized for SQLite via EF Core.

## Common Columns

id
created_at
updated_at
deleted_at
created_by
updated_by
version
is_active

## Constraints

- Campus: unique name, top-level; sites (`CampusSite`) belong to one `Organization`.
- Building: belongs to one Campus, unique code inside Campus.
- Floor: belongs to one Building, level unique inside Building.
- Room: belongs to one Building.
- Equipment: serial number is the priority identifier.
- PointOfInterest: belongs to one Campus (and optionally one Floor).
- WalkingRouteEdge: connects two WalkingRouteNodes.
- ManualRoom: unique `ExternalId`, index `(BuildingExternalId, Floor)`.
- RoomGeometryOverride: unique `RoomExternalId` (one geometry override per room).

## Naming / id conventions

- Rooms use a globally unique `ExternalId`; the editor emits
  `MAN-*` for manual rooms. Legacy rooms synced from the source keep their source `ExternalId`.
- `GeometryJson` stores a GeoJSON `Polygon` (`coordinates[0]` = closed ring of
  `[lng, lat]` pairs) for both entities.

## Soft Delete

- DELETE endpoints perform soft delete only.
- Active records use is_active=true.

## Schema Initialization

- Schema is created via EF migrations plus a neutral schema initializer.
- No demo data is inserted by default (SPEC 04).
