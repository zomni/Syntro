# Progreso del proyecto — Syntro

## Estado actual

Syntro es un SaaS white-label starter kit derivado de los proyectos cliente
`sotero_map` (frontend vanilla JS + Leaflet + Webpack) y `sotero_map_api`
(backend ASP.NET Core 8 + EF Core + SQLite + Razor admin).

## Lo completado

- Análisis profundo de ambos repos cliente (catalogos de acoplamiento backend y frontend).
- Análisis del formato de especificaciones de `Internav/spec` (solo estructura, nunca contenido).
- Decisiones confirmadas con el usuario:
  - campus = plantilla de archivo de configuración (`campuses.js` canónico)
  - formulario de entrega = generalizar y mantener
  - telemetría de red = generalizar y mantener
  - categorías + POIs = incluir
  - proyecto standalone nuevo en carpeta nueva (nada llamado "sotero")
  - nombre de trabajo "Syntro" reemplazable cuando se nombre el producto final
  - fase de implementación = Fase 0+1 (fundación white-label), sin contenido de cliente, con Docker
- **28 SPECs escritas** en `C:\Users\paolo.vilches\Documents\repos\Syntro\spec\`:
  - 00–11: SPECs delta (transformación brownfield del sistema cliente)
  - 12–27: SPECs producto (arquitectura backend/frontend, entidades, API, seguridad, deployment, testing, roadmap)
- **Fase 0+1 implementada** (fundación white-label):
  - Repo `Syntro` inicializado con `.gitignore` y estructura `backend/`, `frontend/`, `tools/`, `docs/`, `spec/`.
  - Extracción brownfield: backend (`Syntro.API`), tools (`Syntro.NetworkCollector`) y frontend renombrados y neutralizados (0 tokens de cliente en código enviado).
  - SPEC 01: `appsettings.json` y `.env.example` genéricos.
  - SPEC 03: campus canónico en `campuses.js` + derivación de nombres de datos (`campusConfig.js`) + backend sin default "sotero" (`CampusSettings:DefaultCampus`).
  - SPEC 04: `SeedData` tras `DemoData:Enabled` (off por defecto).
  - SPEC 06: institución configurable (`DeliveryForm:Institution`); SPEC 08: stripping `HSR`/`SSMSO`/`CASR` eliminado.
  - SPEC 07/10/11: telemetría, identificadores (`identifiers.js`) y scripts de datos derivados de la configuración del campus.
  - Branding: logos neutros, `lang="es"`, títulos "Syntro Admin".
  - Docker: `docker-compose.yml` + Dockerfiles; stack verificado en puertos 5001/8081 (build + smoke tests OK).
- **Fase 2 implementada** (data layer):
  - Reset Docker + base nueva: `.env` raíz desde `backend/.env.example`, DB legacy renombrada a `backend/data/syntro.legacy-schema.bak`, migración `20260808000634_InitialCreate` aplicada (17 tablas, PK TEXT/Guid).
  - Bootstrap admin inicial (`AuthSettings:AdminUsername/AdminPassword`) con `spec/04` actualizado.
  - Login + redirect `/dashboard` verificado en runtime.
- **Fase 3 implementada** (inventory & telemetry):
  - SPEC 08: categorías/estados configurables (`InventoryCategories` en `appsettings` + `Services/InventoryCategoriesConfig.cs`); inferencia de import y opciones del admin config-driven; stripping `HSR` eliminado.
  - SPEC 07/21: timezone/locale configurables (`NetworkTelemetrySettings:DisplayTimeZone/DisplayLocale` + `Services/TelemetryTimeSettings.cs`) aplicados en backend, vistas Razor y frontend.
  - SPEC 06/22: institución desde config (`DeliveryForm:Institution`); checklist de aplicaciones configurable (`DeliveryForm:ApplicationChecklist` + `Services/DeliveryFormChecklistConfig.cs`); template DOCX genérico generado en memoria (`Services/DeliveryFormTemplateBuilder.cs`) con `DeliveryForm:TemplatePath`/`SofficePath` configurables; LibreOffice instalado en `Dockerfile` prod y dev.
  - Smoke test completo verificado: login → form (checklist desde config) → POST → preview PDF generado por LibreOffice.
- **Fase 4 implementada** (admin & map):
  - SPEC 09 (POIs): entidad `PointOfInterest` (GUID, type, name, description, lat/lng, campus, floor, icon, audit fields, soft delete) + `DbSet` con `HasQueryFilter` + migración `AddPointsOfInterest` + fallback raw SQL en `ExtendedSchemaInitializer`; `PointsOfInterestController` (`api/points-of-interest`, GET público con filtros campus/floor, POST/PUT/DELETE solo admin) con auditoría en todas las mutaciones (`poi-created/updated/deleted` con previous/new value).
  - SPEC 09 frontend: `markers.js` limpiado de restos en francés; POIs cargados por campus/piso y renderizados reutilizando `createMarkers`; editor admin `poiEditor.js` (agregar POI con clic en el mapa + modal, gestionar POIs con editar/eliminar) integrado en `adminMapToolsPanel` con visibilidad por sesión.
  - SPEC 20: panel unificado + editores (building, geometry, routes) ya presentes, verificado contra la SPEC; se añadió el editor de POIs.
  - SPEC 23: audit + backups ya presentes; POIs y editores del mapa auditan mutaciones (verificado `api/activity-log`).
  - Smoke test completo verificado: login admin → CRUD POI (POST/GET/PUT/DELETE) → auditoría de las 3 mutaciones → render público verificado por GET anónimo.
- **Fase 5 implementada** (hardening):
  - SPEC 24: política de contraseñas NIST 800-63B configurable (`PasswordPolicy:MinLength/MaxLength/DisallowCommonPasswords`) en `Services/PasswordPolicyService.cs`; aplicada al bootstrap del admin inicial (`BackendAuthService`) y al reset de contraseña del panel (`AdminController.ResetPassword`); env mapeada en `docker-compose.yml` y `.env.example`. Headers, cookies, MFA obligatorio para admins, validación de uploads (MIME/extensión/magic bytes) y no-exposición de secretos verificados.
  - SPEC 25: `appsettings.Production.json` (ForceHttps, cookies `Secure=Always`, sin Swagger/demo/telemetría); `dotnet publish -c Release` verificado; despliegue documentado en `docs/ARCHITECTURE.md`.
  - SPEC 26: proyecto xUnit `Syntro.API.Tests` (30 tests, SQLite en memoria, sin DB real ni LibreOffice: PasswordPolicy, BackendAuth, importación Excel con fixture ClosedXML, reconciliación, auditoría, config) + jest en frontend (7 tests: `campusConfig.js`, `identifiers.js`). Se corrigió el parser Excel para aceptar targets de hoja con `/` inicial (compatibilidad ClosedXML).
- **Fase 6 parcial (visual/branding + neutralización delivery form)**:
  - Tema CSS-variables implementado en frontend (`:root` design tokens en `index.css` + `styles/*.css`, ~240 reemplazos de colores hardcodeados); colores de marca ahora tokenizados y sobrescribibles en runtime vía `window.PIREON_CONFIG.themePrimary/themeSecondary` (`applyBrandingTheme()` en `src/index.js`). Paleta heredada azul `#2d79a0/#154860` reemplazada por teal `#0f766e/#134e4a`.
  - Admin Razor + Auth views recolorizados a la misma paleta (sidebar, nav activo, botones primarios, cards de login/MFA/access denied) y logos `app-logo-frontend.svg`/`app-logo-backend.svg` neutrales actualizados al teal.
  - Delivery form neutralizado: `DeliveryForm:ApplicationChecklist:Sections = []` en `appsettings.json` y `GetDefaultSections()` retorna lista vacía (se eliminaron las apps clínicas Medicas/Administrativas del template); formulario, DOCX y PDF se renderizan sin secciones; test actualizado (`DeliveryFormChecklist_ReturnsEmptyWhenUnconfigured`).
- **Multi-tenant (organizaciones + sitios) — backend**:
  - Modelo: `Organization` (name, slug, contact email, notes, audit), `CampusSite` (OrganizationId, CampusKey, Name, School, center/zoom/bounds, FloorsJson, DefaultFloor, audit) y `AuthUser.OrganizationId`; rol `superadmin` en `AppRoles`.
  - Migración `AddOrganizationsAndSites`; DbSets + query filters en `AppDbContext`.
  - Bootstrap: `EnsureInitialAdminAsync` crea/promueve al admin inicial como `superadmin`; MFA obligatorio para `admin` y `superadmin`; sesión (`GET /api/auth/session`) expone `isSuperAdmin`, `organizationId`, `organizationName` y `sites[]` (superadmin ve todos, org admin solo los suyos; cada sitio con `campusKey`, `name`, `school`, `floors`, `defaultFloor`, `center`, `zoom`, `bounds`).
  - `OrganizationAccessService` (DI): `IsSuperAdmin`, `IsAdmin`, `OrganizationId`, `CanAccessCampusAsync`, `CanAccessOrganizationAsync`, `ScopeSitesQuery`, `ScopeUsersQuery`.
  - `OrganizationsController` (solo superadmin): CRUD organizaciones (soft delete, slug único), CRUD sitios por org (CampusKey slugificado, floors JSON, default floor), upload GeoJSON por piso (`${school}_${campusKey}_${floor}.json` a `ResolveDataRoot()`), alta de admins de org y listado de usuarios de org.
  - Scoping por campus/organización en los controllers de datos: `PointsOfInterestController`, `ManualBuildingsController`, `WalkingRoutesController`, `LocationsController`, `EquipmentsController`, `BuildingGeometryOverridesController`, `FrontendStaticBackupController` (guard `CanAccessCampusAsync` → 403). Controllers globales (import, reconciliación, alias rules, backups, frontend-sync, telemetría snapshots, resto de `AdminController`) pasan a `[Authorize(Roles = "admin,superadmin")]`.
  - Tests backend actualizados (admin inicial = `superadmin`); build y 30 tests verdes.
- **Multi-tenant (organizaciones + sitios) — frontend**:
  - `src/config/siteConfig.js`: fuente de verdad de sitios en runtime — consume `/api/auth/session` (cached, `credentials: include`), normaliza cada sitio (floors como array, defaultFloor, center/zoom/bounds) y reemplaza el fallback estático de `campuses.js`; despacha evento `sites-loaded`.
  - `campusConfig.js`, `map.js`, `goToCampus.js`, `campusSelector.js` y `autocompleteSearchBox.js` ya no importan `campuses.js` directamente; `map.js` inicializa desde el sitio primario y re-aplica vista/bounds en `sites-loaded`; `campusSelector` repuebla las opciones al cargar sitios; `index.js` dispara `loadSites()`.
  - Bug corregido en `searchMetadata.js`: usaba `.searchIndex` inexistente en `getDataFileNames` (ahora `.search`) y la ruta del índice se calcula por campus al cargar.
  - Tests jest (7) y build webpack verdes.
- **Multi-tenant (organizaciones + sitios) — UI Razor admin (superadmin)**:
  - `OrganizationsAdminController` (MVC, `[Authorize(Roles = "superadmin")]`, rutas `/admin/organizations/*`): listado de organizaciones, crear/editar/eliminar (soft delete, slug único/auto-generado), páginas de sitios por org (CRUD con formulario de geometría: centro, zoom, bounds desde 2 esquinas, floors CSV, default floor), upload de plano GeoJSON por piso (`${school}_${campusKey}_${floor}.json` a `ResolveDataRoot()` con validación de extensiones y JSON), alta de admins de org (policy de contraseña aplicada) y listado de usuarios de la org.
  - Vistas `Views/Organizations/` (`Index`, `Create`, `Edit`, `Sites`, `CreateSite`, `EditSite`, partial `_SiteForm`); números de geometría binding-seguros ante cultura (parseo invariant).
  - `_Layout.cshtml`: entrada de navegacion "Organizaciones" visible solo para superadmin y label de rol `superadmin` en el panel de sesion.
  - Acceso superadmin: se incluyo `superadmin` en todas las listas de roles restantes (`admin,auditor`, `admin,editor,viewer,auditor` de `AuditLogController`, `HealthController`, `NetworkTelemetryController`, `NetworkTelemetryOfficeController`, `AdminController.Activity/Compliance/ComplianceLegacy/suggestions`), de modo que el superadmin nunca recibe AccessDenied en el admin/dashboard.
  - URL del mapa: `_Layout.cshtml`, `Views/Admin/Locations.cshtml`, `Views/Admin/Equipments.cshtml` y `AdminController.ResolveFrontendMapUrl()` ahora respetan `FrontendAppUrl` (8081) antes del fallback con host (8080).
  - Build y 30 tests backend verdes.
- **CorrecciÃ³n de panel de estado del mapa**:
  - Se reforzÃ³ `frontend/src/views/featureDisplay.js` para reconstruir el panel superior izquierdo si detecta markup incompleto, mantener valores de respaldo visibles y evitar que queden espacios vacÃ­os.
  - Se actualizÃ³ el cache-buster de `@app/featureDisplay` en `frontend/src/index.html` para forzar que el navegador cargue la versiÃ³n nueva.
  - Se levantÃ³ nuevamente el stack con `docker compose up -d --build`.

- **F1: Planificación de capturas (Red y riesgo) implementada**:
  - Backend: entidad `TelemetryScanSchedule` (Label, Cron, TimeZone, CampusKey, IsEnabled, SortOrder + audit) con migración `AddTelemetryScanSchedules`; `TelemetryScanScheduleService` (CRUD con soft-delete, validación cron vía Cronos TryParse, cálculo de próximas ocurrencias en UTC/local, resolución de timezone, preview); `TelemetryScanSchedulesController` (`GET api/network-telemetry/schedule` [admin,superadmin,auditor], `POST /preview`, `POST/PUT/{id}/DELETE/{id}` [admin,superadmin] con auditoría).
  - `NetworkTelemetryLiveScanHostedService` reescrito: lee schedules habilitados desde DB (fallback a cron de config), múltiples reglas, dedupe y estado agent.
  - Frontend: `scheduleCronBuilder.js` (builder Diario/Semanal/Mensual + describe + validación), `telemetryScheduleStore.js` (fetch/create/update/delete/preview/history), sección "Planificación de capturas" en `networkTelemetryPanel.js` (lista, formulario con preview, historial; solo admin/superadmin editan, auditor solo lee).
  - Bug corregido: Cronos 0.11.1 `GetNextOccurrence(DateTime, TimeZoneInfo)` devuelve UTC con `Kind=Utc`; `ConvertTimeToUtc` lanzaba `ArgumentException` en preview y en el scheduler. Se usa el valor UTC directamente y se normaliza el `fromUtc` de entrada.
  - Verificación runtime: login admin → CRUD completo (create/list/update/delete 204), preview con conversión tz correcta (`America/Santiago`), historial, auditoría de create/update/delete y soft-delete registrados en DB; migración auto-aplicada en `__EFMigrationsHistory`. Tests jest (22) + suite completa (41) verdes.

- **F2: Scope por organización en Red y riesgo + backfill histórico `CampusKey`**:
  - Rutas peatonales importadas desde `sotero_live.db` (244 WRN / 274 WRE bajo namespace `sotero`), huérfanas `sca` borradas; `GET /api/walking-routes?campus=sotero` → 200.
  - Columnas `CampusKey` en `NetworkTelemetrySnapshot` y `ScheduledScanRun` (migración `AddSnapshotAndRunCampusKey`), propagación en ingesta/live-scan/agent bridge/colector; backfill en `ExtendedSchemaInitializer` (derivación por observaciones → hint de source `ssmso` → default `sotero` para datos históricos).
  - `OrganizationAccessService` ampliado (`ResolveCampusKeysAsync`, `GetSelectableOrganizationsAsync`, `CanManageCampusKeyAsync`, `EffectiveOrganizationId`); `NetworkTelemetryService` con `campusKeys` en 17 métodos + guard de scope; controllers y 4 páginas del dashboard con selector de organización (`_OrganizationSelector.cshtml`) y filtro por `organizationId` (devices, snapshots, export, delete, scheduled-scans, matches, rematch, schedules).
  - Gestor de capturas scopeado por campus (CRUD `TelemetryScanScheduleService` + `TelemetryScanSchedulesController` con `organizationId`); fuera de scope → listas vacías / 400 / 404 según endpoint.
  - Verificación: 0 filas con `CampusKey` vacío (97 snapshots + 95 runs todos `sotero`); smoke autenticado pasa (login, schedules CRUD, scheduled-scans 95, snapshots scoped 97 `sotero` vs 0 `duoc`, 4 páginas con selector, sin 500).

- **Fix: schedules soft-deleted + auto-scan + agent volume**:
  - **Auto-scan habilitado**: `.env` (`NETWORK_TELEMETRY_AUTOSCAN=true`, `NETWORK_TELEMETRY_ENABLED=true`); `BackgroundService` ahora ejecuta el timer loop del scheduler.
  - **ScheduleLabel en runs**: propiedad `ScheduleLabel` en `ScheduledScanRun` (modelo, ViewModel, DB con migración `AddScheduledScanRunScheduleLabel`); el scheduler resuelve el label desde schedules activos y lo almacena al crear cada run; UI muestra columna "Planificación" en la tabla de escaneos programados.
  - **Schedules restaurados**: todos los `TelemetryScanSchedules` estaban soft-deleted (`DeletedAtUtc != null`), causando que el `HasQueryFilter` los excluyera tanto del UI como del scheduler. Se restauraron los 2 schedules activos y se limpiaron 4 duplicados obsoletos.
  - **Agent volume montado**: `./runtime/network-telemetry-agent:/runtime/network-telemetry-agent` en `docker-compose.yml` + directorio creado; el backend ahora puede leer `agent-heartbeat.json` y el agente puede escribir archivos compartidos.
  - Verificación: scheduler log "Next live telemetry scan scheduled in 00:09:56" confirma que detecta schedules habilitados.

## Pendiente

- F2 (importar Sotero): registrar Organization "Hospital Sótero del Río" + CampusSite `sotero` (school `cs`, floors `["-1".."5"]`, defaultFloor `b1`), copiar estáticos de `/app/frontend-data` renombrando sin `.map`, sembrar schedules ("Lun-Jue 08:30/13:30/17:30; Vie 08:30/13:30/16:30" en `America/Santiago`, cron por fila), agregar `sotero` a `campuses.js`.
- F2 (ETL): `tools/migrate-sotero-to-syntro.py` (último snapshot + resumen 12 meses, remapeo FKs, sync-token).
- F3: motor heurístico de coincidencia inventario vs red/riesgo + panel.
- Revisiones SPECs 12–27 y aprobación del usuario.
- Multi-tenant — frontend: agrupar el campus selector por organización (superadmin), adaptar los editores y storage restantes al campus activo.
- Multi-tenant — tests: tests backend para CRUD org/sitios, scoping y payload de sesión; tests frontend para `siteConfig`.
- Docs multi-tenant: actualizar SPEC 01/03/13/14/15, ROADMAP y PROGRESS.
- Fase 6 (roadmap en `spec/27_ROADMAP.md`): producto, visual/branding (pendiente revisión del usuario), decisión del contenido del checklist del formulario de entrega, documentación y onboarding.


## Decisiones de implementación documentadas

Ver apéndices "Decisiones de implementación" dentro de cada SPEC.

## Notas

- Las SPECs describen Syntro como producto (front + backend juntos); codename "Syntro"
  reemplazable en el nombre final (artefactos, cookies, DB, carpeta).
- Reglas del proyecto: reutilizar antes que reemplazar, generalizar antes que
  reescribir, configurar antes que hardcodear, sin código/implementación en SPECs.
