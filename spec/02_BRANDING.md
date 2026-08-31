# Product Identity & Branding

## Purpose

Remove all client and heritage product identity and make branding configurable.

## Current State

Frontend (formerly `sotero_map`):

- `package.json`: `name: "campusmap"`, heritage repository and author.
- `index.html`: `<title>sotero_map</title>`, `lang="fr"`.
- `LICENSE.md`: heritage copyright holder.
- Logo `app-logo-frontend.svg` (teal `#1D9E75`) mismatches the CSS theme primary `#2d79a0`.
- Language leftovers: French in `src/components/markers.js`, English in `src/views/draw.js` and `src/components/autocompleteSearchBox.js`.

Backend (formerly `sotero_map_api`):

- `SetApplicationName("SoteroMap.API")` (DataProtection purpose).
- Cookies `SoteroMap.Auth` and `SoteroMap.MfaPending`.
- Claims `sotero:*` in `AuthController.cs` (`sotero:remember_me`, `sotero:can_manage_users`, `sotero:mfa_*`).
- Header `X-Sotero-Public-Path` in `Program.cs`.
- MFA issuer `SoteroMap`.
- Logo `wwwroot/assets/branding/app-logo-backend.svg` (hospital cross).
- Views: "SoteroMap Admin" titles in `_Layout.cshtml` and auth views.

## Required Changes

- Rename the npm package to Syntro.
- Set `<title>` and `lang` to generic template values.
- Replace cookies with `Syntro.Auth` / `Syntro.MfaPending`.
- Replace the claims namespace with `syntro:*`.
- Replace the DataProtection application name and MFA issuer.
- Replace branding assets with neutral logos.
- Convert theme colors to CSS variables (single source).
- Normalize language leftovers to the template locale (es-CL).
- Replace license and author metadata.

## Rules

- No `sotero`, `SoteroMap`, `campusmap`, `CampusMap` or heritage names remain in shipped code or metadata.
- Rebranding must be achievable through configuration where possible (SPEC 01).

## Acceptance Criteria

- Grep across both projects returns zero client/heritage tokens in shipped files.
- `npm run build` and `dotnet build` pass after renaming.
- Login, MFA and session flows work with the new cookie and claim names.

## Decisiones de implementación

- Los nombres de cookies y claims cambian una sola vez en el snapshot (invalida sesiones existentes; aceptado en una plantilla).
- El idioma base del template es español (es-CL), heredado de la aplicación; los restos fr/en se traducen al pasar.
