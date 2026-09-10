# Internal Application Identifiers

## Purpose

Centralize internal application prefixes (storage, events, window names) so the application can rename them without touching every file.

## Current State

- Storage prefixes `sotero_map_*`: `networkTelemetryStorage.js`, `buildingBackupStorage.js`, `featureDisplay.js:259`, `walkingRouteLayer.js`, `walkingRouteStorage.js`.
- Custom events `sotero-*`: `sotero-map-data-refreshed`, `sotero-session-changed`, `sotero-admin-map-tool-mode`, `sotero-building-layer-click`.
- Window name `sotero-dashboard`; globals `window.openSoteroDashboard`, `soteroAdminMapToolMode`.

## Required Changes

- Concentrate all prefixes and identifiers in a constants module derived from the application configuration (SPEC 01).
- Replace usages with the module.

## Rules

- Default values keep current behavior; the configuration allows renaming.
- No client token remains hardcoded.

## Acceptance Criteria

- Changing the prefix in configuration updates storage keys, events and window names.
- Feature behavior is unchanged.

## Decisiones de implementación

- Se usa un módulo `identifiers.js` con prefijos; bajo costo y bajo riesgo.
