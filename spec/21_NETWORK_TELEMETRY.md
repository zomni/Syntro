# Telemetría de Red

## Propósito

Escaneos de red programados, un agente recolector, snapshots y reportes.

## Entidades

- NetworkTelemetrySnapshot: un resultado de escaneo programado para un objetivo.
- NetworkTelemetryObservation: un único resultado de sonda.
- ScheduledScanRun: historial de ejecuciones.

## Componentes

- Escaneos en vivo programados (hosted service).
- Agente recolector de Windows (opcional, herramienta genérica).
- Archivos de control de escaneo y heartbeat vía una ruta compartida.
- Panel de telemetría en el mapa.
- Dashboard de telemetría y exportación.

## Configuración

- Zona horaria y locale (configurable, SPEC 07).
- CIDRs objetivo.
- Puertos de escaneo.
- Crons de escaneo.
- API key de ingesta.

## Reglas

- Los defaults deben ser neutrales y válidos para una instalación en blanco (SPEC 07).
- Deshabilitar la funcionalidad no debe romper el resto de la aplicación.
- El control de escaneo usa una ruta compartida con archivos request/status/heartbeat.
