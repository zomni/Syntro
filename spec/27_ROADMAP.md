# Roadmap

## Phase 1 — Foundation

- Repository and documentation (SPEC 11).
- Configuration, branding and campus model (SPECs 01–03).
- Internal identifiers (SPEC 10).

## Phase 2 — Data Layer

- Core entities and data model (SPECs 13–14).
- Schema initialization and first-run (SPEC 04).
- Roles and authentication (SPEC 15).

## Phase 3 — Inventory & Telemetry

- Inventory, import and reconciliation (SPEC 18).
- Configurable categories (SPEC 08).
- Network telemetry (SPECs 07, 21).
- Delivery form (SPECs 06, 22).

## Phase 4 — Admin & Map

- Points of interest (SPEC 09). (DONE)
- Administrative map editors (SPEC 20). (DONE)
- Audit and backups (SPEC 23). (DONE)
- Room & annotation editor: manual rooms, door/stair marks, unified multi-selection,
  conformal pixel-space rotation, backend `ManualRoom`/`BuildingAnnotation` +
  `/api/manual-rooms` + `/api/annotations`, main-map per-floor rendering. (DONE,
  SPEC 13/14/17/20; pendiente revisión del usuario en vivo)

## Phase 5 — Hardening

- Security defaults (SPEC 24). (DONE)
- Deployment and first-run (SPEC 25). (DONE)
- Testing coverage (SPEC 26). (DONE — backend 79, frontend 64)

## Phase 6 — Product

- Multi-tenant organizations + sites, `superadmin`, scoping por campus y schedules de
  telemetría (DONE; pendientes: tests dedicados, agrupar selector por org en frontend).
- Product decisions (SPECs 12–27).
- Visual/branding refresh: CSS-variable theme aplicado en frontend (SPEC 02 remainder), paleta teal en admin Razor y Auth, logos neutrales recolorados. (PARCIAL, pendiente revisión de usuario)
- Delivery form checklist neutralizada: `appsettings` vacío + default genérico vacío (SPEC 06 remainder); el usuario decidirá el contenido final.
- Documentation and onboarding (SPEC 11).
