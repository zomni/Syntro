# Identificadores Internos de la Aplicación

## Propósito

Centralizar los prefijos internos de la aplicación (almacenamiento, eventos, nombres de ventana) para poder renombrarlos sin tocar cada archivo.

## Estado Actual

- Prefijos de almacenamiento `sotero_map_*`: `networkTelemetryStorage.js`, `buildingBackupStorage.js`, `featureDisplay.js:259`, `walkingRouteLayer.js`, `walkingRouteStorage.js`.
- Eventos personalizados `sotero-*`: `sotero-map-data-refreshed`, `sotero-session-changed`, `sotero-admin-map-tool-mode`, `sotero-building-layer-click`.
- Nombre de ventana `sotero-dashboard`; globals `window.openSoteroDashboard`, `soteroAdminMapToolMode`.

## Cambios Requeridos

- Concentrar todos los prefijos e identificadores en un módulo de constantes derivado de la configuración de la aplicación (SPEC 01).
- Reemplazar los usos por el módulo.

## Reglas

- Los valores por defecto mantienen el comportamiento actual; la configuración permite renombrar.
- Ningún token del cliente queda hardcodeado.

## Criterios de Aceptación

- Cambiar el prefijo en configuración actualiza las claves de almacenamiento, los eventos y los nombres de ventana.
- El comportamiento de las funcionalidades no cambia.

## Decisiones de implementación

- Se usa un módulo `identifiers.js` con prefijos; bajo costo y bajo riesgo.
