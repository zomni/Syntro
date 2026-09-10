# Security

## Purpose

Defaults for a blank, secure instance.

## Passwords

- Minimal length 10.
- Password strength validation (NIST).
- MFA (TOTP) required for admin.

## Headers

- CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
- Nosniff and anti-sniffing behaviors.

## Cookies

- HttpOnly, Secure, SameSite.
- Prefixes scoped to the template instance (SPEC 10).

## File Uploads

- Validate extension, MIME and size.
- Isolate uploads and scans.

## Secrets

- `ADMIN_EMAIL` / `ADMIN_PASSWORD` are never returned by any endpoint.
- The ingest API key is stored outside the database.
- Sensitive settings are not exposed in the API.

## Decisiones de implementación

- Secretos por variables de entorno con valores por defecto seguros; nada sensible en `appsettings.json` versionado.
- Política de contraseñas configurable (`PasswordPolicy:MinLength/MaxLength/DisallowCommonPasswords`) siguiendo NIST 800-63B: largo (mínimo 10, máximo 64), sin reglas de composición, denegación de contraseñas comunes y de contraseñas que contengan el nombre de usuario; aplicada al bootstrap del admin inicial y al reset de contraseña del panel.
