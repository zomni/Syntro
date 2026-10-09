# Seguridad

## Propósito

Defaults para una instancia en blanco y segura.

## Contraseñas

- Longitud mínima 10.
- Validación de fortaleza de contraseña (NIST).
- MFA (TOTP) requerido para admin.

## Headers

- CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
- Comportamientos nosniff y anti-sniffing.

## Cookies

- HttpOnly, Secure, SameSite.
- Prefijos con scope a la instancia de la plantilla (SPEC 10).

## Subidas de Archivos

- Validar extensión, MIME y tamaño.
- Aislar subidas y escaneos.

## Secretos

- `ADMIN_EMAIL` / `ADMIN_PASSWORD` nunca son retornados por ningún endpoint.
- La API key de ingesta se almacena fuera de la base de datos.
- Los ajustes sensibles no se exponen en la API.

## Decisiones de implementación

- Secretos por variables de entorno con valores por defecto seguros; nada sensible en `appsettings.json` versionado.
- Política de contraseñas configurable (`PasswordPolicy:MinLength/MaxLength/DisallowCommonPasswords`) siguiendo NIST 800-63B: largo (mínimo 10, máximo 64), sin reglas de composición, denegación de contraseñas comunes y de contraseñas que contengan el nombre de usuario; aplicada al bootstrap del admin inicial y al reset de contraseña del panel.
