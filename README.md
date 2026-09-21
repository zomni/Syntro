# Syntro

Aplicación de mapeo indoor, inventario de activos y telemetría de red para el
**Complejo Hospitalario Sotero del Río** (campus único `sotero`).

Refundido de los repositorios `sotero_map` (frontend) y `sotero_map_api`
(backend) en un proyecto único, adaptado a un despliegue de cliente único.

- **Frontend**: mapa interactivo (JavaScript vanilla + Leaflet + Webpack) con búsqueda,
  rutas entre edificios, inventario, telemetría de red, POIs, editor de salas
  y herramientas de edición de mapa (campus `sotero`, pisos -1 a 5; el
  mapa resuelve sus sitios desde la sesión — multi-tenant).
- **Backend**: API ASP.NET Core 8 + EF Core + SQLite + panel de administración Razor,
  con autenticación local/LDAP, MFA, multi-tenant (organizaciones/sitios, rol `superadmin`),
  importación de inventario por Excel, auditoría, respaldos, planificación de capturas de
  telemetría y despliegue de documentos (formulario de entrega con generación de PDF).
- **Herramientas**: recolector de telemetría de red para Windows (`tools/Syntro.NetworkCollector`).

## Estructura

```
backend/Syntro.API         API + panel de administración (ASP.NET Core 8)
frontend/                  Mapa web (vanilla JS + Leaflet + Webpack)
tools/Syntro.NetworkCollector  Recolector de telemetría (Windows service/CLI)
spec/                      Especificaciones del producto (SPECs 00–27)
docs/                      Documentación de arquitectura
docker-compose.yml         Stack de desarrollo (api + frontend)
```

## Inicio rápido (Docker)

Requisitos: Docker + Docker Compose.

```bash
cp backend/.env.example .env   # opcional; ajusta puertos/credenciales
docker compose up -d --build
```

- Frontend (mapa): http://localhost:8081
- API: http://localhost:5001
- Panel admin: http://localhost:5001/dashboard

Usuario inicial (admin): se crea en el primer arranque desde `ADMIN_EMAIL` /
`ADMIN_PASSWORD` (defínelas en `.env`). Si no existe ningún administrador y faltan
estas variables, la API falla al iniciar con un error claro.

## Campus (cliente único)

- **Único campus `sotero`** (Complejo Hospitalario Sotero del Río, school `cs`,
  pisos `-1`..`5`, defaultFloor `b1`) definido en `frontend/src/data/campuses.js`.
  Los nombres de archivos de datos derivan de ahí: `data/cs_sotero_<piso>.json`,
  `data/cs_sotero_search.json` y `data/sotero_buildings_catalog.json`; usa los
  scripts de `frontend/scripts/` para regenerarlos desde el GeoJSON de origen.
- **Identificadores y eventos**: los prefijos de almacenamiento, eventos y ventana están
  centralizados en `frontend/src/utils/identifiers.js` (prefijo `syntro-*`).
- **Institución en documentos**: `DeliveryForm:Institution` en `backend/Syntro.API/appsettings.json`.
- **Datos de demostración**: activa `DemoData:Enabled` para sembrar ubicaciones genéricas.
- **Branding**: logos en `frontend/src/assets/branding/` y
  `backend/Syntro.API/wwwroot/assets/branding/` y textos del panel (`Syntro Admin`).
- **Seguridad**: LDAP (`AuthSettings`/`LdapSettings`), MFA, clave de ingesta de telemetría
  (`NetworkTelemetrySettings:IngestApiKey`), y el recolector en `tools/Syntro.NetworkCollector`.

## Desarrollo

- Backend: `dotnet run --project backend/Syntro.API` (o `docker compose up -d --build`).
- Backend tests: `dotnet test backend/Syntro.sln` (xUnit, SQLite en memoria; 79 tests).
- Frontend: `cd frontend && npm ci && npm run build` (salida en `frontend/dist/`).
  La URL de la API se inyecta en el bundle vía `API_BASE_URL` (`webpack DefinePlugin`).
- Frontend tests: `cd frontend && npm test` (jest; 64 tests en 7 suites).

## Configuración

La configuración vive en `backend/Syntro.API/appsettings.json` y en variables de entorno
(definidas en `docker-compose.yml` y documentadas en `backend/.env.example`).

## Licencia

MIT — ver `LICENSE.md`. Dependencias de frontend en `frontend/LICENSE.dependencies.md`.
