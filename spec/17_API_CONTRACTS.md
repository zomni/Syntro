# API Contracts

## Purpose

Endpoints consumed by the map frontend and the admin dashboard.

## Map Frontend Contracts

GET    /api/auth/session
POST   /api/auth/logout
GET    /api/inventory-import/sync-state
GET    /api/inventory-import/items
GET    /api/inventory-import/building-summary
GET    /api/activity-log/building
GET    /api/synced-buildings
GET    /api/synced-rooms
GET    /api/manual-buildings
POST   /api/manual-buildings
DELETE /api/manual-buildings/{externalId}
GET    /api/building-geometry-overrides
POST   /api/building-geometry-overrides
GET    /api/walking-routes
POST   /api/walking-routes/paths
PUT    /api/walking-routes/nodes/{externalId}
PUT    /api/walking-routes/edges/{externalId}
DELETE /api/walking-routes/edges/{externalId}
POST   /api/frontend-static-backup/save
GET    /api/points-of-interest
POST   /api/points-of-interest
PUT    /api/points-of-interest/{id}
DELETE /api/points-of-interest/{id}
GET    /api/room-layouts?buildingExternalId={id}&floor={n}
GET    /api/room-layouts/{buildingExternalId}/floors
POST   /api/room-layouts/bulk-save
GET    /api/manual-rooms?buildingExternalId={id}&floor={n}
POST   /api/manual-rooms
PUT    /api/manual-rooms/{externalId}
DELETE /api/manual-rooms/{externalId}
GET    /api/network-telemetry/schedule
POST   /api/network-telemetry/schedule/preview
POST   /api/network-telemetry/schedule
PUT    /api/network-telemetry/schedule/{id}
DELETE /api/network-telemetry/schedule/{id}

## Admin Contracts

- Inventory: list, create, edit, delete, assign, upload PDF.
- Locations: list and edit synced buildings and rooms.
- Activity: filtered audit log.
- Backups: list, run, cleanup, download, upload, restore.
- Telemetry: scan status, reports, export.
- Delivery form: create, preview, PDF generation.

## Rules

- All mutation endpoints require an authenticated role.
- Deleting an inventory item or location is a soft delete.
- When a contract changes, the frontend loader modules and static backups must be updated.
