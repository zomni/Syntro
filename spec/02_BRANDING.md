# Identidad de Producto y Branding

## Propósito

Eliminar toda identidad del cliente y de productos heredados y hacer configurable el branding.

## Estado Actual

Frontend (antes `sotero_map`):

- `package.json`: `name: "campusmap"`, repositorio y autor heredados.
- `index.html`: `<title>sotero_map</title>`, `lang="fr"`.
- `LICENSE.md`: titular de copyright heredado.
- Logo `app-logo-frontend.svg` (teal `#1D9E75`) que no coincide con el color primario del tema CSS `#2d79a0`.
- Restos de idioma: francés en `src/components/markers.js`, inglés en `src/views/draw.js` y `src/components/autocompleteSearchBox.js`.

Backend (antes `sotero_map_api`):

- `SetApplicationName("SoteroMap.API")` (propósito de DataProtection).
- Cookies `SoteroMap.Auth` y `SoteroMap.MfaPending`.
- Claims `sotero:*` en `AuthController.cs` (`sotero:remember_me`, `sotero:can_manage_users`, `sotero:mfa_*`).
- Header `X-Sotero-Public-Path` en `Program.cs`.
- Emisor MFA `SoteroMap`.
- Logo `wwwroot/assets/branding/app-logo-backend.svg` (cruz de hospital).
- Vistas: títulos "SoteroMap Admin" en `_Layout.cshtml` y las vistas de autenticación.

## Cambios Requeridos

- Renombrar el paquete npm a Syntro.
- Establecer `<title>` y `lang` a valores genéricos de plantilla.
- Reemplazar las cookies por `Syntro.Auth` / `Syntro.MfaPending`.
- Reemplazar el namespace de claims por `syntro:*`.
- Reemplazar el nombre de la aplicación de DataProtection y el emisor MFA.
- Reemplazar los assets de branding por logos neutrales.
- Convertir los colores del tema a variables CSS (una sola fuente).
- Normalizar los restos de idioma a la locale de la plantilla (es-CL).
- Reemplazar los metadatos de licencia y autor.

## Reglas

- No deben quedar `sotero`, `SoteroMap`, `campusmap`, `CampusMap` ni nombres heredados en el código ni en los metadatos enviados.
- El rebranding debe ser alcanzable por configuración donde sea posible (SPEC 01).

## Criterios de Aceptación

- Un grep en ambos proyectos devuelve cero tokens del cliente/heredados en los archivos enviados.
- `npm run build` y `dotnet build` pasan tras el renombrado.
- Los flujos de login, MFA y sesión funcionan con los nuevos nombres de cookies y claims.

## Decisiones de implementación

- Los nombres de cookies y claims cambian una sola vez en el snapshot (invalida sesiones existentes; aceptado en una plantilla).
- El idioma base del template es español (es-CL), heredado de la aplicación; los restos fr/en se traducen al pasar.
