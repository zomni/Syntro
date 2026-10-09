# Administración de Puntos de Interés

## Propósito

Permitir crear y gestionar puntos de interés (marcadores del mapa) desde la UI administrativa, de forma genérica.

## Estado Actual

- `src/components/markers.js` renderiza marcadores (restos de idioma limpiados: "Copier le lien" -> "Copiar enlace", "étage" -> "piso").
- Entidad `MapMarker`, CRUD en `api/map-markers` con registro de auditoría y editor admin `campusMarkerEditor.js` implementados.

## Cambios Requeridos

Backend:

- Nueva entidad `MapMarker`: tipo/icono, nombre, notas, coordenadas, campus/piso, activo, campos de auditoría. (HECHO)
- API CRUD siguiendo los patrones de controllers existentes (`ManualBuildingsController`). (HECHO, `MapMarkersController`)
- Registro de auditoría en las mutaciones. (HECHO)

Frontend:

- Renderizar los puntos de interés desde el backend reutilizando `markers.js`. (HECHO)
- Superficie de gestión admin en las herramientas de administración existentes. (HECHO)
- Sin dependencia de IDs o nombres del cliente. (HECHO)

## Reglas

- Los puntos de interés usan soft delete.
- Las coordenadas se almacenan de forma genérica (lat/lng o plan-local), documentado en SPEC 13.

## Criterios de Aceptación

- Un admin puede crear, editar y eliminar un punto de interés desde la UI.
- Los puntos de interés se renderizan en el mapa y sobreviven a la recarga.
- Los roles viewer y editor respetan el RBAC existente.

## Decisiones de implementación

- La entidad sigue los patrones existentes (GUID, timestamps, soft delete, auditoría).
- `markers.js` se reutiliza; solo se le quitan los restos en francés.
- GET público con filtros `campus`, `floor` (incluye POIs sin piso asignado) e `includeInactive` (solo autenticado). Mutaciones restringidas a `admin`.
- El editor admin (`campusMarkerEditor.js`) permite crear, editar y eliminar marcadores desde el mapa.
