# Roles y Autenticación

## Roles

- superadmin: gestión multi-tenant (organizaciones, sitios, admins de org); ve cada organización.
  El admin inicial se bootstrapea como `superadmin`.
- admin: acceso total, MFA requerido.
- editor: ediciones operativas controladas.
- viewer: solo lectura.
- auditor: auditoría, cumplimiento e integridad sin modificar inventario.

## Autenticación

- Usuarios locales break-glass.
- Autenticación LDAP / LDAPS opcional contra un directorio externo.
- MFA (TOTP) para administradores.
- Cookies basadas en sesión más claims para la API del frontend.
- Scoping multi-tenant vía `OrganizationAccessService` (DI):
  `IsSuperAdmin`, `IsAdmin`, `OrganizationId`, `CanAccessCampusAsync`,
  `CanAccessOrganizationAsync`, `ScopeSitesQuery`, `ScopeUsersQuery`; los controllers de datos
  protegen con `CanAccessCampusAsync` → 403 y los controllers globales requieren
  `admin,superadmin`.

## Cookies

- `Syntro.Auth` sesión final.
- `Syntro.MfaPending` flujo intermedio de MFA.

## Claims

En namespace bajo `syntro:`:

- syntro:remember_me
- syntro:can_manage_users
- syntro:mfa_mode
- syntro:mfa_setup_key
- syntro:mfa_user_id
- syntro:mfa_return_url

## API de Sesión

- GET /api/auth/session — sesión actual, rol y organización para el mapa.
  Retorna `isAuthenticated`, `isSuperAdmin`, `organizationId`, `organizationName` y
  `sites[]` (cada sitio con `campusKey`, `name`, `school`, `floors`, `defaultFloor`,
  `center`, `zoom`, `bounds`); `superadmin` ve todos los sitios, un admin de org solo los suyos.
  El frontend consume esto en `siteConfig.js`.
- POST /api/auth/logout — terminar sesión.

## Decisiones de implementación

- El admin inicial se crea desde `ADMIN_EMAIL` / `ADMIN_PASSWORD` y se promueve a `superadmin`
  (`EnsureInitialAdminAsync`); la app falla al iniciar si no hay admin y faltan las variables.
- MFA es obligatorio para los roles `admin` y `superadmin`.
- LDAP es opcional y configurable; los usuarios locales break-glass cubren el arranque sin directorio.
