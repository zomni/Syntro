# Syntro

Plantilla white-label para mapeo indoor, inventario de activos y telemetría de red.
Derivada de un sistema brownfield de dos aplicaciones (mapa web + API de administración),
generalizada y neutralizada como punto de partida para nuevos clientes.

- **Frontend**: mapa interactivo (JavaScript vanilla + Leaflet + Webpack) con búsqueda,
  rutas entre edificios, inventario, telemetría de red y herramientas de edición de mapa.
- **Backend**: API ASP.NET Core 8 + EF Core + SQLite + panel de administración Razor,
  con autenticación local/LDAP, MFA, importación de inventario por Excel y despliegue de documentos.
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

## White-labeling un nuevo cliente

1. **Configurar el campus**: edita `frontend/src/data/campuses.js` (definir `school`,
   key del campus, pisos, centro, zoom y límites). Los nombres de archivos de datos derivan
   de `school` + key: `data/<school>_<campus>_<piso>.json`, `data/<school>_<campus>_search.json`
   y `data/<campus>_buildings_catalog.json`. Usa los scripts de `frontend/scripts/` para
   generarlos desde el GeoJSON de origen.
2. **Identificadores y eventos**: los prefijos de almacenamiento, eventos y ventana están
   centralizados en `frontend/src/utils/identifiers.js` (prefijo `syntro-*`).
3. **Institución**: define `DeliveryForm:Institution` en `backend/Syntro.API/appsettings.json`.
4. **Campus por defecto (backend)**: `CampusSettings:DefaultCampus`. Vacío por defecto: las
   operaciones de escritura requieren el campus explícitamente.
5. **Datos de demostración**: activa `DemoData:Enabled` para sembrar ubicaciones genéricas.
6. **Branding**: reemplaza los logos neutros en `frontend/src/assets/branding/` y
   `backend/Syntro.API/wwwroot/assets/branding/` y los textos del panel (`Syntro Admin`).
7. **Seguridad**: LDAP (`AuthSettings`/`LdapSettings`), MFA, clave de ingesta de telemetría
   (`NetworkTelemetrySettings:IngestApiKey`), y el recolector en `tools/Syntro.NetworkCollector`.

## Desarrollo

- Backend: `dotnet run --project backend/Syntro.API` (o `docker compose up -d --build`).
- Backend tests: `dotnet test backend/Syntro.sln` (xUnit, SQLite en memoria).
- Frontend: `cd frontend && npm ci && npm run build` (salida en `frontend/dist/`).
  La URL de la API se inyecta en el bundle vía `API_BASE_URL` (`webpack DefinePlugin`).
- Frontend tests: `cd frontend && npm test` (jest).

## Configuración

La configuración vive en `backend/Syntro.API/appsettings.json` y en variables de entorno
(definidas en `docker-compose.yml` y documentadas en `backend/.env.example`).

## Licencia

MIT — ver `LICENSE.md`. Dependencias de frontend en `frontend/LICENSE.dependencies.md`.
