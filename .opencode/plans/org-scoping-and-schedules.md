# Plan: rutas del sotero, separación por organización y gestor de capturas programadas

> **Estado (2026-09-11): PLAN COMPLETADO.** El repo definitivo es `Syntro` (no `Pireon`):
> rutas peatonales importadas desde `sotero_live.db` (244 nodos / 274 aristas, campus `sotero`),
> separación por organización implementada (selector en 4 páginas, scoping por `CampusKey`),
> y gestor de capturas programadas como sección en "Red y riesgo" (`TelemetryScanSchedule`).
> El archivo queda solo como registro histórico; las rutas/Binarios `Pireon.API` y
> `migrate-sotero-to-pireon.py` que menciona corresponden a la nomenclatura previa al refactor
> a `Syntro.API` / `tools/migrate-sotero-to-syntro.py`.

## Contexto / decisiones confirmadas
- "Rutas del sotero" = red de rutas peatonales (244 nodos / 274 aristas, campus `sotero`) que solo existe en
  `sotero_live.db` y nunca se migró a `pireon.db` (que solo tiene 14/12 filas huérfanas del campus `sca`).
  El fallback estático `walking_routes_backup.json` tampoco existe → el mapa no renderiza rutas.
- Separación por organización: las 4 páginas del dashboard no están scoped. El vínculo es vía campus:
  `Organization → CampusSite (CampusKey) → SyncedBuilding.Campus/ManualCampus`.
  Los datos SIEMPRE deben tener campus ("no pueden haber edificios sin campus").
- Telemetría: se agrega columna `CampusKey` a `NetworkTelemetrySnapshot` (backfill derivado de observaciones→edificios,
  seteada en ingesta desde el schedule). Decisión: NO derivación en consulta.
- Gestor de capturas programadas: se implementa como SECCIÓN en la página "Red y riesgo" (`/dashboard/network-telemetry`),
  no como página dedicada.

---

## Parte 1 — Rutas del sotero (walking routes)

1. Extender `tools/migrate-sotero-to-pireon.py`:
   - Namespaces nuevos `WRN_NS` / `WRE_NS` para GUIDs deterministas.
   - Importar `WalkingRouteNodes` (244) y `WalkingRouteEdges` (274), campus `sotero`, con `INSERT OR IGNORE` (idempotente).
     - Nodes: Id, ExternalId, Campus, Latitude, Longitude, Notes, CreatedAtUtc/UpdatedAtUtc, CreatedBy (de CreatedByUsername),
       UpdatedBy='', DeletedAtUtc=NULL, Version=0, IsActive=1.
     - Edges: Id, ExternalId, Campus, FromNodeExternalId, ToNodeExternalId, DistanceMeters, Status, Notes + columnas audit.
2. Limpieza:
   - Borrar rutas huérfanas del campus `sca` en `pireon.db` (14 nodos / 12 aristas).
   - Corregir los 2 edificios manuales con campus literal `{getPrimaryCampusKey()}` → `sotero`.
3. Verificación:
   - `GET /api/walking-routes?campus=sotero` → 244/274.
   - Mapa frontend (8081) renderiza las rutas (toggle "Mostrar rutas").

---

## Parte 2 — Separación por organización (4 páginas)

Modelo: `Org → CampusSites (CampusKey) → entidades por campus`.
- SuperAdmin: selector "Todas las organizaciones" + cada org (query param `organizationId`).
- Admin de org: forzado a su organización server-side (ignora el query param).

### 2.1 Helper de scope (`OrganizationAccessService`)
- `Guid? EffectiveOrganizationId(Guid? requested)`: superadmin → requested (null = todas); otro → su org forzada.
- `Task<IReadOnlyList<string>> ResolveCampusKeysAsync(Guid? orgId)`: null → todas las campus keys; si no → keys de sus sites.
- `Task<IReadOnlyList<Organization>> GetSelectableOrganizationsAsync()`.
- Endpoint para poblar el selector en JS (o ViewData server-side).

### 2.2 Selector compartido
- Partial `_OrganizationSelector.cshtml` en `Views/Shared`:
  - Superadmin: `<select name="organizationId">` "Todas las organizaciones" + orgs (preserva selección del query string).
  - Org-admin: hidden + etiqueta informativa (sin selector).

### 2.3 Página Locations (`AdminController.Locations` + `Views/Admin/Locations.cshtml`)
- Param `Guid? organizationId`; scope efectivo; filtrar `SyncedBuildings` por `(Campus IN keys || ManualCampus IN keys)`.
- Selector en panel de filtros (~L386); KPIs y paginación sobre la query scoped.
- Scoping de autocompletes `InventorySuggestions` / `LocationSuggestions` / `CampusSuggestions`.

### 2.4 Página Inventory (`AdminController.Inventory` + `Views/Admin/Equipments.cshtml`)
- Param `organizationId`; filtrar `ImportedInventoryItems` join `SyncedBuildings`
  (vía `MatchedSyncedBuildingId` o `AssignedBuildingExternalId → ExternalId`) donde campus ∈ keys.
  Items sin edificio: solo visibles en "Todas".
- `AnalyzeInventoryInconsistenciesAsync` scoped.
- Dropdown de edificios (`buildingExternalId`) limitado al org.
- Selector en panel de filtros (~L536).

### 2.5 Telemetría — base
- Migración `AddSnapshotCampusKey`: `CampusKey` TEXT NOT NULL DEFAULT '' en `NetworkTelemetrySnapshot`
  (+ config EF + `EnsureColumnAsync` en `ExtendedSchemaInitializer`).
- Backfill: campus mayoritario de sus observaciones vía `BuildingExternalId → SyncedBuilding`; si ninguno → ''.
- `NetworkTelemetryIngestRequest`: campo `CampusKey` opcional; `IngestAsync` lo persiste (default '').
- Scheduler (`NetworkTelemetryLiveScanHostedService`): `ActiveSchedule` incluye CampusKey; se pasa a
  `ScanAndStoreAsync`/`BuildLiveRequestAsync` y a `IngestAsync`.
- `ScheduledScanRun.CampusKey` (columna nueva + migración + `EnsureColumnAsync`) seteada por el scheduler.

### 2.6 Página NetworkTelemetry (`AdminController.NetworkTelemetry` + `NetworkTelemetryService` + vista)
- Param `organizationId` en la acción → `BuildNetworkTelemetryViewModelAsync`.
- `NetworkTelemetryService`: métodos reciben org/keys — `GetDashboardAsync`, `GetSessionOverviewAsync`,
  `GetRecentSnapshotsAsync`, `GetSnapshotPageAsync`, `GetTopRiskObservationsAsync`,
  `GetScheduledScanPageAsync`, `GetScheduledScanRunsAsync`, `GetSubnetRiskSummariesAsync`.
  Filtro base: `snapshot.CampusKey ∈ keys`.
- API `NetworkTelemetryController`/`OfficeController`: endpoints leen `organizationId` query param
  (org-admin forzado server-side).
- JS: superadmin añade `organizationId` a los fetches; selector en toolbar (~L445-479).

### 2.7 Página Matching (`AdminController.InventoryMatching` + `InventoryMatching.cshtml` + API matching)
- Param `organizationId` en la acción, seeds y en endpoints `matching-summary` / `matches` / `rematch`
  (filtran observaciones vía `snapshot.CampusKey`).
- Selector junto al dropdown de snapshots (~L139).

---

## Parte 3 — Gestor de capturas programadas (sección en "Red y riesgo")

### 3.1 Backend (huecos)
- `TelemetryScanScheduleService.Apply`: validar `CampusKey` contra `CampusSites` y contra el org (org-admin solo su org).
- Scope por org en `TelemetryScanSchedulesController` (GET/POST/PUT/DELETE) vía campus→org.
- `GET /api/network-telemetry/scheduled-scans`: restringir a Admin/SuperAdmin/Auditor (hoy cualquier autenticado)
  y scope por org (run→CampusKey).

### 3.2 UI (sección en `NetworkTelemetry.cshtml`)
- Reemplazar el hint hardcodeado de schedules (L869) por datos reales.
- Ampliar "Escaneos programados": lista de schedules (label, cron, zona horaria, campus, habilitado, próxima corrida)
  + acciones Crear/Editar/Eliminar/Activar-desactivar + preview de próximas corridas (`POST /schedule/preview`).
- Integrar con el selector de organización de la página (mismo scope).
- Reutilizar lógica cron del frontend (`buildCron`/`describeCron`).

---

## Orden de ejecución
1. Parte 1 (rutas sotero + limpieza) → verificar mapa.
2. Migraciones CampusKey (snapshot + run) + backfill + ingesta/scheduler.
3. Helper de scope + selector compartido.
4. Scoping: Locations → Inventory → NetworkTelemetry → Matching (+ sus APIs).
5. Gestor de capturas en "Red y riesgo".
6. `docker compose up -d --build` + smoke checks (`/api/health/integrity`, páginas con `?organizationId=`,
   rutas sotero, CRUD schedules, rematch scoped).

## Archivos clave
- `tools/migrate-sotero-to-pireon.py` (walking routes + limpieza).
- `backend/Pireon.API/Models/NetworkTelemetrySnapshot.cs`, `ScheduledScanRun.cs` (CampusKey).
- `backend/Pireon.API/Models/TelemetryScanSchedule.cs` (+ service y controller).
- `backend/Pireon.API/Services/NetworkTelemetryService.cs`, `OrganizationAccessService.cs`,
  `NetworkTelemetryLiveScanHostedService.cs`, `NetworkTelemetryLiveScanService.cs`.
- `backend/Pireon.API/Controllers/AdminController.cs`, `NetworkTelemetryController.cs`,
  `NetworkTelemetryOfficeController.cs`, `TelemetryScanSchedulesController.cs`.
- `backend/Pireon.API/Views/Admin/Locations.cshtml`, `Equipments.cshtml`, `NetworkTelemetry.cshtml`,
  `InventoryMatching.cshtml` + `Views/Shared/_OrganizationSelector.cshtml`.
- `backend/Pireon.API/Data/AppDbContext.cs`, `Data/ExtendedSchemaInitializer.cs` (EnsureColumnAsync).
