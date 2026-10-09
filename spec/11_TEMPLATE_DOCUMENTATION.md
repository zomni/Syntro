# Documentación del Proyecto y Onboarding

## Propósito

Mantener la documentación del proyecto alineada con el producto de cliente único (Complejo
Hospitalario Sotero del Río, campus único `sotero`) y libre de tokens obsoletos de plantilla o
del cliente.

## Estado Actual

- `README.md` describe el producto, el campus `sotero` y el stack local
  (API `:5001`, frontend `:8081`).
- `docs/ARCHITECTURE.md` describe la arquitectura del stack.
- `PROGRESS.md` registra el avance por fases.

## Cambios Requeridos

- Cualquier cambio de producto, campus o stack debe reflejarse en `README.md` y
  `docs/ARCHITECTURE.md` (docs-first).
- Eliminar referencias obsoletas (white-label, plantillas, naming heredado
  `sotero_*` cuando ya no corresponda al código).
- Mantener separado el registro histórico (`PROGRESS.md`, SPECs) de la
  documentación operativa vigente.

## Reglas

- La documentación debe mantenerse sincronizada con la implementación (docs-first).
- Sin tokens del cliente en ningún documento (credenciales, deep links, datos operativos).

## Criterios de Aceptación

- Un grep sobre la documentación operativa (`README.md`, `docs/`) no devuelve
  términos de plantilla/white-label ni tokens del cliente.
- Un desarrollador nuevo puede levantar el stack y entender el producto desde el README.

## Decisiones de implementación

- Se alineó `README.md`, `docs/ARCHITECTURE.md` y los títulos/descripciones de
  SPECs y `package.json` a la realidad de cliente único (agosto/septiembre 2026).
