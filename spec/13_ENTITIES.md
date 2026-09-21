# Core Entities

## Campus
Top-level site configured in the template configuration. Drives map bounds, center, floors and data paths.

## Building
A physical building inside a campus.

## Floor
A level inside a building.

## Room
A space inside a building.

## Equipment
An inventory asset identified by serial number.

## Category
Configurable inventory classification (for example pc, printer, scanner).

## PointOfInterest
A map marker with a type, name and coordinates.

## SyncedBuilding / SyncedRoom
Locations managed or overridden by the backend.

## ManualRoom
A room created from the map (`roomEditor.js`). Belongs to a building (`BuildingExternalId`)
and a `Floor`, identified by `ExternalId` (`MAN-*` prefix in the editor, unique), polygon
geometry in `GeometryJson`, plus display metadata (ShortName, Type, Unit, Service, Status,
Capacity, Notes). SERVER entity: `ManualRoom` (auditable, soft delete).

## Organization / CampusSite
Multi-tenant containers: an `Organization` owns `CampusSite` records (each with a
`CampusKey`, name, school, floors, defaultFloor, center/zoom/bounds); a site maps to a
campus in the runtime frontend config. Only `superadmin` manages organizations; org
admins can only access their own sites.

## ManualBuilding
A building created from the map.

## BuildingGeometryOverride
Polygon edit or move applied to an existing building.

## WalkingRouteNode / WalkingRouteEdge
Nodes and edges of the walkable network.

## NetworkTelemetrySnapshot
One scheduled scan result for a target.

## NetworkTelemetryObservation
A single probe result inside a snapshot.

## ImportedInventoryItem
Inventory imported from Excel or created from a delivery form.

## AuthUser
Account with access to the platform.

Roles
- superadmin (multi-tenant: manages organizations/sites, sees all campuses)
- admin
- editor
- viewer
- auditor

Every entity uses the common audit invariants defined in SPEC 14.
