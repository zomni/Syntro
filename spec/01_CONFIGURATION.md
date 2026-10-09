# Capa de Configuración

## Propósito

Centralizar cada ajuste específico del cliente en una única fuente de verdad configurable, con valores por defecto genéricos, en backend y frontend.

## Estado Actual

Los valores por defecto del backend acoplan la API al cliente:

- `appsettings.json`: LDAP `HELIOS.ssmso.cl` / `Domain=SSMSO` / `BaseDn=DC=ssmso,DC=cl` / `10.6.50.6`; `MfaSettings:Issuer="SoteroMap"`; `AuthSettings:BreakGlassUsernames="ADMIN"`; `NetworkTelemetrySettings` con CIDRs del cliente e `IngestApiKey="SoteroMapNetworkCollector-2026"`; CORS `localhost:8080,3000`; `FrontendAppUrl`.
- Archivo de base de datos `soteromap.db` (`SqliteDatabasePathResolver.cs`).
- Raíces de datos: `SQLITE_DATA_ROOT`, `FrontendDataRoot`, fallback `../../../../../sotero_map/src/data` (`FrontendSyncService.ResolveDataRoot`).
- Nombres de artefactos: `soteromap-backup-*`, `soteromap-data-package-*`, `soteromap-delivery-preview-*`.

Frontend:

- `BACKEND_API_URL = "http://" + HOST_URL + ":5000"` en `src/views/map.js`.
- Prefijos de almacenamiento, nombres de eventos, nombres de ventana y colores de tema hardcodeados en todos los módulos.

## Cambios Requeridos

Backend:

- Reemplazar los defaults del cliente por marcadores genéricos en `appsettings.json` y `.env.example`.
- Hacer configurable el nombre del archivo de base de datos (default `syntro.db`).
- Hacer configurables las raíces de datos y los prefijos de nombres de artefactos (default `syntro-*`).
- Mantener la precedencia de las variables de entorno por sobre appsettings.

Frontend:

- Introducir un módulo de configuración que exponga: URL base de la API, clave de campus, prefijo de almacenamiento, prefijo de eventos, nombre de ventana, colores de tema y branding.
- Eliminar el puerto `:5000` hardcodeado y la suposición de mismo host.

## Reglas

- Los defaults deben ser válidos para una instalación en blanco.
- Ningún valor del cliente puede permanecer como default.
- La configuración debe ser sobreescribible por entorno sin cambios de código.

## Criterios de Aceptación

- Un checkout nuevo corre con defaults genéricos y sin tokens del cliente.
- Cambiar un valor de configuración renombra las claves de almacenamiento, los eventos y la URL de la API.
- Las variables de entorno sobreescriben appsettings sin cambios de código.

## Decisiones de implementación

- La URL de API del frontend se resuelve desde configuración (módulo `appConfig`, variable de entorno `API_BASE_URL`), no desde el host actual más puerto fijo.
- El nombre de la DB por defecto pasa a `syntro.db`; la resolución mantiene el patrón existente de `SqliteDatabasePathResolver`.
- El prefijo de artefactos (`backups`, `data-package`) se centraliza para no depender de `AdminController` en cada rebrand.

## Aplicado (estado real 2026-09)

- `appsettings.json` y `backend/.env.example` con defaults genéricos (sin tokens de cliente);
  la configuración del cliente vive en `.env` / `docker-compose.yml`.
- `CampusSettings:DefaultCampus`, `DeliveryForm:Institution`, `NetworkTelemetrySettings:DisplayTimeZone/DisplayLocale`,
  `PasswordPolicy:*`, `InventoryCategories:*`, `TelemetryScanSchedule` (cron + timezone por regla).
- Multi-tenant vía `Organization` + `CampusSite` (tablas propias); el campus activo en runtime se resuelve
  desde `GET /api/auth/session` (`sites[]`) en `frontend/src/config/siteConfig.js`, con `campuses.js` como fallback.
- Las variables de entorno sobreescriben `appsettings` sin cambios de código (patrón `TestConfiguration` en tests).
