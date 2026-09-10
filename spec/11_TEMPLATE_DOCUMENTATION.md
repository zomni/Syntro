# Project Documentation & Onboarding

## Purpose

Keep project documentation aligned with the single-client product (Complejo
Hospitalario Sotero del Río, campus único `sotero`) and free of stale template or
client tokens.

## Current State

- `README.md` describe el producto, el campus `sotero` y el stack local
  (API `:5001`, frontend `:8081`).
- `docs/ARCHITECTURE.md` describe la arquitectura del stack.
- `PROGRESS.md` registra el avance por fases.

## Required Changes

- Cualquier cambio de producto, campus o stack debe reflejarse en `README.md` y
  `docs/ARCHITECTURE.md` (docs-first).
- Eliminar referencias obsoletas (white-label, plantillas, naming heredado
  `sotero_*` cuando ya no corresponda al código).
- Mantener separado el registro histórico (`PROGRESS.md`, SPECs) de la
  documentación operativa vigente.

## Rules

- Documentation must stay synchronized with implementation (docs-first).
- No client tokens in any document (credenciales, deep links, datos operativos).

## Acceptance Criteria

- Grep sobre la documentación operativa (`README.md`, `docs/`) no devuelve
  términos de plantilla/white-label ni tokens del cliente.
- Un desarrollador nuevo puede levantar el stack y entender el producto desde el README.

## Decisiones de implementación

- Se alineó `README.md`, `docs/ARCHITECTURE.md` y los títulos/descripciones de
  SPECs y `package.json` a la realidad de cliente único (agosto/septiembre 2026).