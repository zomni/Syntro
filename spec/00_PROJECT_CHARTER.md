# Project Charter

## Project Name

Syntro — aplicación de mapeo indoor, inventario de activos y telemetría de red
para el **Complejo Hospitalario Sotero del Río** (campus único `sotero`).

## Purpose

Build and operate the indoor mapping, asset inventory and network telemetry
application for the hospital, as a single-client deployment on a single campus.

## Evolution

Syntro comenzó como un extracto neutral reutilizable ("white-label") derivado de
los repositorios cliente y se consolidó como producto de **cliente único**:

- La fase de extracción (Fases 0–6, SPECs 01–27) eliminó tokens del cliente,
  neutralizó branding, prefijos y configuraciones, y generalizó la base.
- Decisión posterior: desplegar como aplicación de cliente único sobre el campus
  `sotero`, sin modelos multi-cliente ni white-labeling.
- Se mantiene la neutralidad técnica de la base (ningún dato sensible del cliente
  está hardcodeado en el código), pero la operación y configuración apuntan a un
  solo hospital.

## Origin

The application is derived from two existing repositories:

- Frontend: Leaflet-based map application (formerly `sotero_map`).
- Backend: ASP.NET Core 8 + EF Core SQLite API and admin dashboard (formerly `sotero_map_api`).

Existing functionality is preserved and reused, not rebuilt.

## Core Objectives

- Indoor map application for campus `sotero`
- Building, floor and room management (incl. sugerencia de salas)
- Inventory management with configurable categories
- Admin map editing tools (buildings, geometry, walking routes, POIs)
- Walking routes and route planning
- Points of interest management
- Network telemetry and scheduled captures
- Equipment delivery forms with PDF generation
- Authentication, roles, MFA, audit, backups and scoping por organización/campus

## Tenets

- Reuse before replace
- Generalize before rewrite
- Configure before hardcode
- Extend before modify
- Keep backward compatibility
- Minimize breaking changes
- No data sensible del cliente hardcodeado en el código

## MVP Constraints

- ASP.NET Core 8
- EF Core + SQLite
- Vanilla JavaScript + Leaflet + Webpack
- Docker