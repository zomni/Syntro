# Configuration Layer

## Purpose

Centralize every client-specific setting into a single configurable source of truth, with generic defaults, on backend and frontend.

## Current State

Backend defaults couple the API to the client:

- `appsettings.json`: LDAP `HELIOS.ssmso.cl` / `Domain=SSMSO` / `BaseDn=DC=ssmso,DC=cl` / `10.6.50.6`; `MfaSettings:Issuer="SoteroMap"`; `AuthSettings:BreakGlassUsernames="ADMIN"`; `NetworkTelemetrySettings` with client CIDRs and `IngestApiKey="SoteroMapNetworkCollector-2026"`; CORS `localhost:8080,3000`; `FrontendAppUrl`.
- Database file `soteromap.db` (`SqliteDatabasePathResolver.cs`).
- Data roots: `SQLITE_DATA_ROOT`, `FrontendDataRoot`, fallback `../../../../../sotero_map/src/data` (`FrontendSyncService.ResolveDataRoot`).
- Artifact names: `soteromap-backup-*`, `soteromap-data-package-*`, `soteromap-delivery-preview-*`.

Frontend:

- `BACKEND_API_URL = "http://" + HOST_URL + ":5000"` in `src/views/map.js`.
- Storage prefixes, event names, window names and theme colors hardcoded across modules.

## Required Changes

Backend:

- Replace client defaults with generic placeholders in `appsettings.json` and `.env.example`.
- Make the database file name configurable (default `syntro.db`).
- Make data roots and artifact name prefixes configurable (default `syntro-*`).
- Keep environment-variable override precedence over appsettings.

Frontend:

- Introduce a config module exposing: API base URL, campus key, storage prefix, event prefix, window name, theme colors and branding.
- Remove the hardcoded `:5000` port and same-host assumption.

## Rules

- Defaults must be valid for a blank installation.
- No client value may remain as a default.
- Configuration must be overridable per environment without code changes.

## Acceptance Criteria

- A fresh checkout runs with generic defaults and no client tokens.
- Changing one config value rebrands storage keys, events and the API URL.
- Environment variables override appsettings without code changes.

## Decisiones de implementación

- La URL de API del frontend se resuelve desde configuración (módulo `appConfig`, variable de entorno `API_BASE_URL`), no desde el host actual más puerto fijo.
- El nombre de la DB por defecto pasa a `syntro.db`; la resolución mantiene el patrón existente de `SqliteDatabasePathResolver`.
- El prefijo de artefactos (`backups`, `data-package`) se centraliza para no depender de `AdminController` en cada rebrand.
