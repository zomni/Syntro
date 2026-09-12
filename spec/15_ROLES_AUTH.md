# Roles & Authentication

## Roles

- superadmin: multi-tenant management (organizations, sites, org admins); sees every organization.
  The initial admin is bootstrapped as `superadmin`.
- admin: full access, MFA required.
- editor: controlled operational edits.
- viewer: read-only.
- auditor: audit, compliance and integrity without modifying inventory.

## Authentication

- Local break-glass users.
- Optional LDAP / LDAPS authentication against an external directory.
- MFA (TOTP) for administrators.
- Session-based cookies plus claims for the frontend API.
- Multi-tenant scoping via `OrganizationAccessService` (DI):
  `IsSuperAdmin`, `IsAdmin`, `OrganizationId`, `CanAccessCampusAsync`,
  `CanAccessOrganizationAsync`, `ScopeSitesQuery`, `ScopeUsersQuery`; data controllers
  guard with `CanAccessCampusAsync` → 403 and global controllers require
  `admin,superadmin`.

## Cookies

- `Syntro.Auth` final session.
- `Syntro.MfaPending` intermediate MFA flow.

## Claims

Namespaced under `syntro:`:

- syntro:remember_me
- syntro:can_manage_users
- syntro:mfa_mode
- syntro:mfa_setup_key
- syntro:mfa_user_id
- syntro:mfa_return_url

## Session API

- GET /api/auth/session — current session, role and organization for the map.
  Returns `isAuthenticated`, `isSuperAdmin`, `organizationId`, `organizationName` and
  `sites[]` (each site with `campusKey`, `name`, `school`, `floors`, `defaultFloor`,
  `center`, `zoom`, `bounds`); `superadmin` sees all sites, an org admin only theirs.
  The frontend consumes this in `siteConfig.js`.
- POST /api/auth/logout — end session.

## Decisiones de implementación

- El admin inicial se crea desde `ADMIN_EMAIL` / `ADMIN_PASSWORD` y se promueve a `superadmin`
  (`EnsureInitialAdminAsync`); la app falla al iniciar si no hay admin y faltan las variables.
- MFA es obligatorio para los roles `admin` y `superadmin`.
- LDAP es opcional y configurable; los usuarios locales break-glass cubren el arranque sin directorio.
