# Campus / Site Configuration Model

## Purpose

Make `src/data/campuses.js` the canonical template configuration for the top-level site (campus), and remove the hardcoded campus value from the backend.

## Current State

Frontend:

- `src/data/campuses.js` defines a single campus `sotero` with `school: "cs"`, floors `-1..5`, center, zoom and bounds.
- Data filenames derive from school + campus: `cs_sotero_*.json`.
- `findByUrl.js`, `networkTelemetryPanel.js`, `buildingBackupStorage.js`, `networkTelemetryStorage.js` and `routePlanner.js` fall back to the campus `"sotero"`.
- `manualBuildingEditor.js` sends a hidden `campus="sotero"` field; `walkingRouteEditor.js` and `walkingRouteLayer.js` call `loadWalkingRouteNetwork("sotero")`.
- `featureDisplay.js:507` calls `/api/frontend-static-backup/save?campus=sotero`.

Backend:

- Default campus `"sotero"` in `FrontendSyncService.cs:90`, `ManualBuildingsController.cs:74`, `WalkingRoutesController.cs:77,392`, `FrontendStaticBackupController.cs:35` and `CreateManualBuildingRequest.cs:6`.

## Required Changes

- Restructure `campuses.js` as the template's campus configuration (documented example, not client content).
- Derive data file paths, search index and building catalog from the campus configuration.
- The campus value flows from the frontend configuration in payloads and query params.
- Remove the backend default `"sotero"`; campus becomes a required parameter or a configured value.
- Define the template domain contract: Campus → Building → Floor → Room.

## Rules

- A new template starts with an example campus that can be edited or removed.
- The backend must not assume any campus name.

## Acceptance Criteria

- Renaming the campus key in `campuses.js` updates data paths, payloads and backend calls without code edits.
- No `"sotero"` default remains in the backend.
- The map renders an empty/example state when no campus data is present.

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
