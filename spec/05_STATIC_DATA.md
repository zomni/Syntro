# Capa de Datos Estáticos y Esquema de Identificadores

## Propósito

Hacer opcionales e independientes del contenido del cliente los archivos JSON estáticos del frontend, y generalizar el esquema de identificadores de edificios.

## Estado Actual

- `src/data/cs_sotero_{-1..5}.json` — GeoJSON por piso.
- `src/data/cs_sotero_search.json` — índice de búsqueda.
- `src/data/sotero_buildings_catalog.json`, `sotero_buildings_manual_data.json` (edificios del cliente), `sotero_buildings_backend_backup.json`.
- `src/data/interiors/SR-BLD-*` — interiores de edificios.
- `src/data/walking_routes_backup.json`, `network_telemetry_backup.json`.
- Regex de ID de edificio `/^SR-BLD-\d+$/` en `soteroSearchMetadata.js:12` y `scripts/syncSoteroFloorsFromSearch.js:20`.
- 10 scripts de regeneración de datos hardcodean nombres de archivos y patrones de ID.

## Cambios Requeridos

- Convertir los archivos JSON estáticos en assets opcionales de la plantilla.
- La cadena de fallback (API → localStorage → JSON estático) debe tolerar archivos estáticos ausentes (mapa vacío).
- Eliminar la regex `SR-BLD-\d+`; tratar los IDs de edificio como strings opacos.
- Parametrizar los scripts de regeneración de datos desde la configuración de campus (SPEC 03).

## Reglas

- La aplicación debe funcionar sin datos estáticos presentes.
- El backend sigue siendo la fuente de datos prioritaria cuando está disponible.

## Criterios de Aceptación

- Eliminar todos los archivos JSON estáticos deja un mapa vacío funcional.
- Un edificio con un ID arbitrario (cualquier formato) se renderiza, busca y abre correctamente.
- Los scripts de regeneración producen archivos con nombres derivados de la configuración de campus.

## Decisiones de implementación

- Los respaldos estáticos se conservan como mecanismo (modo sin API), pero sin contenido de cliente por defecto.
- El identificador de edificio deja de validarse por patrón; el backend ya lo trata como string opaco.
