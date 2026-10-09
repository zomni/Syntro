# Despliegue

## Stack

- Backend ASP.NET Core 8 con SQLite.
- Frontend estático construido con Webpack y servido por Nginx en un contenedor separado.
- LibreOffice headless para conversión a PDF.
- Agente recolector de Windows opcional para telemetría.

## Entornos

- Desarrollo: Razor Runtime Compilation, Swagger, config sembrada.
- Producción: publicado, headers habilitados, sin Swagger, ajustes estrictos.

## Configuración

- Todos los ajustes de instancia vienen de configuración (SPEC 01) con defaults razonables.
- Variables de entorno para secretos.
- Un único `dotnet publish` produce el backend desplegable.
- El frontend se construye vía Webpack y se copia a la imagen Nginx.

## Primera Ejecución

- El esquema se crea automáticamente.
- El primer admin requiere `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
- No se insertan datos demo (SPEC 04).
