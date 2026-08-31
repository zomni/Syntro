# Arquitectura de Syntro

Syntro es una plantilla white-label de dos aplicaciones que se ejecutan como un solo stack:

- **Frontend** (`frontend/`): aplicación de mapa de una página (vanilla JavaScript + Leaflet),
  empaquetada con Webpack y servida como bundle estático (Nginx).
- **Backend** (`backend/Syntro.API`): API REST ASP.NET Core 8 con panel de administración
  Razor, base SQLite (EF Core) y servicios de fondo.

## Flujo general

```
[Mapa web]  --HTTP-->  API REST  --EF Core-->  SQLite (syntro.db)
   |                       |
   |  static: data/        +-- panel /dashboard (Razor)
   +-----> index.html      +-- telemetría (ingesta + scanner)
```

## Frontend (`frontend/`)

- **Build**: Webpack 5, un único bundle `dist/index.js`. `create_dist.js` copia el HTML/CSS
  a `dist/`. La URL de la API se inyecta en build mediante `webpack DefinePlugin`
  (`__API_BASE_URL__`, variable `API_BASE_URL`).
- **Runtime**: `index.html` usa un *import map* que resuelve alias `@app/*` hacia módulos
  ES reales; `webpack.config.js` mantiene los mismos alias para el build de producción.
- **Módulos principales**:
  - `views/map.js` — inicializa Leaflet, expone `map` y `BACKEND_API_URL`.
  - `utils/campusConfig.js` — campus canónico (`data/campuses.js`); deriva nombres de
    archivos de datos, índice de búsqueda y catálogo de edificios.
  - `utils/identifiers.js` — prefijos centralizados de `localStorage`, eventos `CustomEvent`,
    globals y nombre de ventana (prefijo `syntro-*`).
  - `utils/addData.js`, `utils/searchMetadata.js` — carga de GeoJSON por piso, catálogo y
    fusión con metadatos/overrides del backend.
  - `components/routePlanner.js`, `utils/walkingRouteStorage.js` — rutas entre edificios.
  - `components/networkTelemetryPanel.js` — panel de telemetría de red (bajo demanda).
  - `components/{manualBuildingEditor,walkingRouteEditor,buildingGeometryEditor}.js` —
    herramientas de edición de mapa (solo rol admin).
- **Datos estáticos**: `src/data/` contiene el GeoJSON por piso (`<school>_<campus>_<floor>.json`),
  el índice de búsqueda (`<school>_<campus>_search.json`) y el catálogo
  (`<campus>_buildings_catalog.json`). Se generan con los scripts de `frontend/scripts/`.
- **Tolerancia a instalación vacía**: las cargas de datos son *best-effort*: ante un archivo
  ausente o error de red, el mapa se inicializa igualmente.

## Backend (`backend/Syntro.API`)

- **Hosting**: ASP.NET Core 8; `Program.cs` configura autenticación por cookies, autorización
  por roles, CORS (`FrontendPolicy`), headers de seguridad, Swagger y servicios de fondo.
- **Base de datos**: SQLite con EF Core. `AppDbContext` con migraciones EF (`InitialCreate`),
  normalizaciones posteriores en `ExtendedSchemaInitializer`. Archivo `syntro.db` (ruta vía
  `SQLITE_DATA_ROOT`). Las bases creadas antes de GUID PK no son migrables automáticamente;
  una instalación nueva crea el esquema desde cero.
- **Identidad**: autenticación local o LDAP (`AuthSettings`), MFA (Otp.NET), break-glass
  local, cookies `Syntro.Auth`/`Syntro.MfaPending`, claims `syntro:*`.
- **Dominio**:
  - Ubicaciones + inventario de equipos (`LocationsController`, `EquipmentsController`).
  - Edificios manuales y sincronizados (`ManualBuildingsController`, sync desde el catálogo
    del frontend con `FrontendSyncService`).
  - Rutas peatonales (`WalkingRoutesController`: nodos, tramos, caminos).
  - Respaldo estático (`FrontendStaticBackupController`) que escribe JSON a `src/data`.
  - Importación de inventario por Excel (`ExcelInventoryImportService`, ClosedXML).
  - Formulario de entrega de equipos (`DeliveryForm`, genera documento).
  - Telemetría de red (`NetworkTelemetryLiveScanService`, hosted service desactivado por
    configuración; ingesta HTTP con `IngestApiKey`).
- **Panel admin**: vistas Razor bajo `/dashboard` y `/admin/*` (inventario, equipos,
  cumplimiento, telemetría, usuarios).

## Campus (white-label)

El campus es **configuración, no código**:

- `frontend/src/data/campuses.js` define el campus canónico (school, pisos, centro, bounds).
- Los nombres de datos derivan de `school` + key del campus.
- En backend, el campus por defecto es `CampusSettings:DefaultCampus` (vacío). Las
  operaciones de escritura (edificios manuales, rutas, respaldo estático) rechazan peticiones
  sin campus con `400`.

## Identificadores (white-label)

Prefijos de artefactos en `frontend/src/utils/identifiers.js`:

- `localStorage`: `syntro_map_*`, `syntro_network_*`, etc.
- Eventos: `syntro-map-data-refreshed`, `syntro-session-changed`, `syntro-admin-map-tool-mode`.
- Ventana/globals: `syntro-dashboard`, `window.syntroAdminMapToolMode`.
- Cookies/claims: `Syntro.Auth`, `Syntro.MfaPending`, `syntro:*`.
- Archivos de respaldo: `syntro_buildings_backend_backup.json`, `walking_routes_backup.json`.

## Despliegue

`docker-compose.yml` levanta dos servicios:

- `api` — `backend/Dockerfile.dev` (`dotnet watch`, hot reload, LibreOffice para documentos).
- `frontend` — build de Webpack + Nginx (usuario no privilegiado) sirviendo `dist/`.

Variables de entorno y puertos: ver `backend/.env.example` y `docker-compose.yml`.

### Producción

- **Backend**: un único `dotnet publish -c Release` produce el deployable
  (`backend/Dockerfile` lo hace dentro del build). El runtime solo necesita el contenido
  publicado, LibreOffice y una carpeta persistente para `syntro.db` y las claves de
  Data Protection (`SQLITE_DATA_ROOT`).
- **Frontend**: build estático de Webpack servido por Nginx (o copiable a cualquier host
  estático). No requiere Node en el runtime.
- **Ajustes estrictos**: `appsettings.Production.json` fuerza HTTPS (`ForceHttps`),
  cookies `Secure=Always`, sin Swagger ni demo data, y telemetría de red desactivada por
  defecto. Los secretos (`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `NETWORK_TELEMETRY_INGEST_API_KEY`)
  van por variables de entorno.
- **Primer arranque**: el esquema se crea solo (migraciones EF); el primer admin se crea
  desde `ADMIN_EMAIL`/`ADMIN_PASSWORD`; no se inserta data demo (SPEC 04).
