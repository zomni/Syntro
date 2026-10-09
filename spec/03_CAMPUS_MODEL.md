# Modelo de Configuración de Campus / Sitio

## Propósito

Hacer de `src/data/campuses.js` la configuración canónica de plantilla para el sitio de nivel superior (campus), y eliminar el valor de campus hardcodeado del backend.

## Estado Actual

Frontend:

- `src/data/campuses.js` define un único campus `sotero` con `school: "cs"`, pisos `-1..5`, centro, zoom y bounds.
- Los nombres de archivo de datos derivan de school + campus: `cs_sotero_*.json`.
- `findByUrl.js`, `buildingBackupStorage.js`, `networkTelemetryStorage.js` y `routePlanner.js` recurren al campus `"sotero"`.
- `manualBuildingEditor.js` envía un campo oculto `campus="sotero"`; `walkingRouteEditor.js` y `walkingRouteLayer.js` llaman a `loadWalkingRouteNetwork("sotero")`.
- `featureDisplay.js:507` llama a `/api/frontend-static-backup/save?campus=sotero`.

Backend:

- Campus por defecto `"sotero"` en `FrontendSyncService.cs:90`, `ManualBuildingsController.cs:74`, `WalkingRoutesController.cs:77,392`, `FrontendStaticBackupController.cs:35` y `CreateManualBuildingRequest.cs:6`.

## Cambios Requeridos

- Reestructurar `campuses.js` como la configuración de campus de la plantilla (ejemplo documentado, no contenido del cliente).
- Derivar las rutas de archivos de datos, el índice de búsqueda y el catálogo de edificios desde la configuración de campus.
- El valor de campus fluye desde la configuración del frontend en payloads y query params.
- Eliminar el default `"sotero"` del backend; el campus pasa a ser un parámetro requerido o un valor configurado.
- Definir el contrato de dominio de la plantilla: Campus → Building → Floor → Room.

## Reglas

- Una plantilla nueva comienza con un campus de ejemplo que puede editarse o eliminarse.
- El backend no debe asumir ningún nombre de campus.

## Criterios de Aceptación

- Renombrar la clave de campus en `campuses.js` actualiza rutas de datos, payloads y llamadas al backend sin editar código.
- No queda ningún default `"sotero"` en el backend.
- El mapa renderiza un estado vacío/de ejemplo cuando no hay datos de campus.

## Decisiones de implementación

- El campus es la identidad raíz de la plantilla; no se introduce una entidad Organization adicional.
- Los editores existentes (edificios, geometría, rutas) se conservan; solo se parametriza el campus que inyectan.

## Aplicado (estado real 2026-09)

- El campus ya no es una entidad backend: los sitios vienen de `Organization → CampusSite`
  (multi-tenant) y el frontend los resuelve en runtime vía `GET /api/auth/session`
  (`frontend/src/config/siteConfig.js` → evento `sites-loaded`). `campuses.js` queda como fallback
  y fuente de verdad de datos estáticos por campus.
- Los edificios de la instalación actual (hospital, campus `sotero`) siguen el dominio
  `Campus → Building → Floor → Room`; la sala manual actual puede tener `Floor` único y
  `BuildingExternalId` para el par edificio+piso.
- El backend no asume ningún nombre de campus por defecto: los escritores exigen `campus`/`CampusKey`
  explícito (los manual rooms usan `BuildingExternalId`).
