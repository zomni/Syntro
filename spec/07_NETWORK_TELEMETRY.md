# Generalización de la Telemetría de Red

## Propósito

Mantener el subsistema de telemetría de red (escaneos programados, agente, panel, reportes) sin defaults del cliente.

## Estado Actual

- La zona horaria y la locale son dirigidas por configuración: `NetworkTelemetrySettings:DisplayTimeZone` (default `UTC`) y `DisplayLocale` (default `es-CL`), resueltas centralmente vía `Services/TelemetryTimeSettings.cs`.
- `NetworkTelemetryService.cs` usa la zona horaria/cultura de instancia; `NetworkTelemetryLiveScanHostedService.cs` y `ExtendedSchemaInitializer.cs` las resuelven desde configuración.
- Las vistas `Admin/Index.cshtml`, `Admin/NetworkTelemetry.cshtml`, `Auth/MfaSetup.cshtml` y el frontend (`appConfig.js`, `featureDisplay.js`) leen la zona horaria/locale configuradas.
- Defaults de `NetworkTelemetrySettings`: CIDRs neutrales (vacíos), `IngestApiKey="CHANGE_ME"`, zona horaria UTC.
- `tools/SoteroMap.NetworkCollector` documentado como herramienta genérica opcional con configuración genérica.

## Cambios Requeridos

- Mover la zona horaria y la locale a configuración.
- Neutralizar los defaults de telemetría (CIDRs, API key, crons, zona horaria).
- Documentar el collector de Windows como herramienta genérica opcional con configuración genérica.

## Reglas

- Deshabilitar la funcionalidad no debe romper el resto de la aplicación.
- Los defaults deben ser válidos para una instalación en blanco.

## Criterios de Aceptación

- Cambiar la zona horaria y la locale configuradas de telemetría actualiza todos los timestamps mostrados.
- Una instalación nueva no tiene valores de CIDR ni API key del cliente.
- La herramienta agente corre con configuración genérica.

## Decisiones de implementación

- La zona horaria se centraliza en configuración (default UTC); `es-CL` se usa solo como locale por defecto del template.
- El agente recolector se mantiene como herramienta opcional documentada, con `appsettings` genérico.
