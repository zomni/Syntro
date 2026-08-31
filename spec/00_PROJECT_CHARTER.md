# Project Charter

## Project Name

Syntro (working codename). The final product name is defined by the licensee.

## Purpose

Build a white-label, reusable starter kit for indoor mapping, asset inventory and network telemetry.

The kit is a generic template derived from an existing client-specific implementation. It must not assume any specific business domain and should be adaptable to hospitals, offices, universities, malls, warehouses, factories, airports or any indoor environment.

## Origin

The template is extracted from two existing repositories:

- Frontend: Leaflet-based map application (formerly `sotero_map`).
- Backend: ASP.NET Core 8 + EF Core SQLite API and admin dashboard (formerly `sotero_map_api`).

Existing functionality is preserved and reused, not rebuilt.

## Core Objectives

- Reusable white-label map application
- Campus / Site configuration from template configuration
- Building, floor and room management
- Inventory management with configurable categories
- Admin map editing tools
- Walking routes and route planning
- Points of interest management
- Network telemetry
- Equipment delivery forms with PDF generation
- Authentication, roles, MFA, audit and backups

## What Must Disappear

- All hospital-specific branding and names
- Hardcoded campus and building identifiers
- Seed data and demo content
- Client configuration defaults (LDAP, CORS, telemetry, timezone)
- Client-specific documents and templates
- Any reference to the original client, its buildings, or its domains

## MVP Constraints

- ASP.NET Core 8
- EF Core + SQLite
- Vanilla JavaScript + Leaflet + Webpack
- Docker

## Principles

- Reuse before replace
- Generalize before rewrite
- Configure before hardcode
- Extend before modify
- Keep backward compatibility
- Minimize breaking changes
