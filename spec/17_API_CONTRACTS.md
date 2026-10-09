# Contratos de API

## Propósito

Endpoints consumidos por el frontend del mapa y el panel de administración.

## Contratos del Frontend del Mapa

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

## Contratos del Admin

- Inventario: listar, crear, editar, eliminar, asignar, subir PDF.
- Ubicaciones: listar y editar buildings y rooms sincronizados.
- Actividad: log de auditoría filtrado.
- Respaldos: listar, ejecutar, limpiar, descargar, subir, restaurar.
- Telemetría: estado de escaneo, reportes, exportación.
- Formulario de entrega: crear, previsualizar, generación de PDF.

## Reglas

- Todos los endpoints de mutación requieren un rol autenticado.
- Eliminar un ítem de inventario o una ubicación es un soft delete.
- Cuando cambia un contrato, deben actualizarse los módulos de carga del frontend y los respaldos estáticos.
