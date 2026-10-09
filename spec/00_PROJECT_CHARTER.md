# Carta del Proyecto

## Nombre del Proyecto

Syntro — aplicación de mapeo indoor, inventario de activos y telemetría de red
para el **Complejo Hospitalario Sotero del Río** (campus único `sotero`).

## Propósito

Construir y operar la aplicación de mapeo indoor, inventario de activos y telemetría
de red para el hospital, como un despliegue de cliente único en un único campus.

## Evolución

Syntro comenzó como un extracto neutral reutilizable ("white-label") derivado de
los repositorios cliente y se consolidó como producto de **cliente único**:

- La fase de extracción (Fases 0–6, SPECs 01–27) eliminó tokens del cliente,
  neutralizó branding, prefijos y configuraciones, y generalizó la base.
- Decisión posterior: desplegar como aplicación de cliente único sobre el campus
  `sotero`, sin modelos multi-cliente ni white-labeling.
- Se mantiene la neutralidad técnica de la base (ningún dato sensible del cliente
  está hardcodeado en el código), pero la operación y configuración apuntan a un
  solo hospital.

## Origen

La aplicación deriva de dos repositorios existentes:

- Frontend: aplicación de mapa basada en Leaflet (antes `sotero_map`).
- Backend: API ASP.NET Core 8 + EF Core SQLite y panel de administración (antes `sotero_map_api`).

La funcionalidad existente se preserva y reutiliza, no se reconstruye.

## Objetivos Principales

- Aplicación de mapa indoor para el campus `sotero`
- Gestión de edificios, pisos y salas (incl. sugerencia de salas)
- Gestión de inventario con categorías configurables
- Herramientas admin de edición de mapa (edificios, geometría, rutas peatonales, POIs)
- Rutas peatonales y planificación de rutas
- Gestión de puntos de interés
- Telemetría de red y capturas programadas
- Formularios de entrega de equipos con generación de PDF
- Autenticación, roles, MFA, auditoría, respaldos y scoping por organización/campus

## Principios

- Reutilizar antes que reemplazar
- Generalizar antes que reescribir
- Configurar antes que hardcodear
- Extender antes que modificar
- Mantener compatibilidad hacia atrás
- Minimizar cambios rupturistas
- Ningún dato sensible del cliente hardcodeado en el código

## Restricciones del MVP

- ASP.NET Core 8
- EF Core + SQLite
- Vanilla JavaScript + Leaflet + Webpack
- Docker
